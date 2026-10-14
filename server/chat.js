// SPDX-License-Identifier: MIT
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export function imageType(bytes) {
  if (
    bytes.length > 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'image/jpeg';
  if (bytes.length > 10 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString()))
    return 'image/gif';
  if (
    bytes.length > 16 &&
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  )
    return 'image/webp';
  return '';
}
export function installChat(app, { store, readable, session, uploadDir, fail }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 2 },
  });
  const channel = (user, id) => {
    const c = store.get('channels', id);
    if (!readable(user, 'channels', c)) fail(403, 'Conversation is not accessible');
    return c;
  };
  function broadcast(c, event, payload) {
    for (const socket of app.locals.io?.sockets.sockets.values() ?? []) {
      const user = session(socket.request);
      if (user && readable(user, 'channels', c)) socket.emit(event, payload);
    }
  }
  app.post('/api/chat/direct', (req, res) => {
    const { userId } = z.object({ userId: z.string().min(1).max(100) }).parse(req.body);
    const other = store.users().find((u) => u.id === userId && u.active);
    if (!other || other.id === req.user.id) fail(400, 'Choose another active team member');
    const ids = [req.user.id, other.id].sort();
    const existing = store
      .all('channels')
      .find(
        (c) => c.visibility === 'direct' && JSON.stringify(c.memberIds) === JSON.stringify(ids),
      );
    if (existing) return res.json(existing);
    const created = store.put(
      'channels',
      {
        title: 'Private conversation',
        projectId: '',
        description: 'Only the two participants can access this conversation.',
        visibility: 'direct',
        memberIds: ids,
      },
      req.user.id,
    );
    broadcast(created, 'chat:updated', { channelId: created.id });
    res.status(201).json(created);
  });
  app.post(
    '/api/chat/:channelId/attachments',
    (req, res, next) => {
      channel(req.user, req.params.channelId);
      next();
    },
    upload.single('file'),
    (req, res) => {
      if (!req.file) fail(400, 'Choose a file');
      const title = req.file.originalname.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 200);
      const relativePath = z
        .string()
        .max(1000)
        .parse(req.body.relativePath || title)
        .replaceAll('\\', '/');
      if (
        relativePath
          .split('/')
          .some((part) => !part || part === '.' || part === '..' || /[:\x00-\x1f]/.test(part))
      )
        fail(400, 'Invalid folder path');
      const pending = store
        .all('chatAttachments')
        .filter((a) => a.owner === req.user.id && !a.messageId);
      if (
        pending.length >= 100 ||
        pending.reduce((n, a) => n + a.size, req.file.size) > 100 * 1024 * 1024
      )
        fail(413, 'Remove pending attachments before uploading more (100 files / 100 MB)');
      const id = randomUUID();
      writeFileSync(path.join(uploadDir, id), req.file.buffer, { flag: 'wx' });
      try {
        const a = store.put(
          'chatAttachments',
          {
            channelId: req.params.channelId,
            title,
            relativePath,
            size: req.file.size,
            imageType: imageType(req.file.buffer),
            messageId: '',
          },
          req.user.id,
          id,
        );
        res.status(201).json(a);
      } catch (error) {
        unlinkSync(path.join(uploadDir, id));
        throw error;
      }
    },
  );
  const attachment = (req) => {
    const a = store.get('chatAttachments', req.params.id);
    if (!a) fail(404, 'Attachment not found');
    channel(req.user, a.channelId);
    const message = a.messageId && store.get('messages', a.messageId);
    if (a.owner !== req.user.id && (!message || !message.attachments?.includes(a.id)))
      fail(403, 'Attachment has not been shared');
    return a;
  };
  app.get('/api/chat/:channelId/attachments', (req, res) => {
    channel(req.user, req.params.channelId);
    const messages = new Set(
      store
        .all('messages')
        .filter((m) => m.channelId === req.params.channelId)
        .flatMap((m) => m.attachments || []),
    );
    res.json(
      store
        .all('chatAttachments')
        .filter(
          (a) =>
            a.channelId === req.params.channelId &&
            (a.owner === req.user.id || (a.messageId && messages.has(a.id))),
        ),
    );
  });
  app.get('/api/chat/attachments/:id/download', (req, res) => {
    const a = attachment(req);
    store.audit(req.user.id, 'chat.download', a.id);
    res.type('application/octet-stream').download(path.join(uploadDir, a.id), a.title);
  });
  app.get('/api/chat/attachments/:id/preview', (req, res) => {
    const a = attachment(req);
    if (!a.imageType) fail(400, 'Only PNG, JPEG, WebP and GIF images can be previewed');
    res
      .set('Content-Security-Policy', "default-src 'none'; sandbox")
      .type(a.imageType)
      .send(readFileSync(path.join(uploadDir, a.id)));
  });
  app.delete('/api/chat/attachments/:id', (req, res) => {
    const a = attachment(req);
    if (a.owner !== req.user.id || a.messageId)
      fail(403, 'Only your pending uploads can be removed');
    store.remove('chatAttachments', a.id, req.user.id);
    try {
      unlinkSync(path.join(uploadDir, a.id));
    } catch {}
    res.json({ ok: true });
  });
  app.post('/api/chat/calls/:id/end', (req, res) => {
    const call = store.get('events', req.params.id);
    if (!call?.call || call.owner !== req.user.id)
      fail(403, 'Only the caller can end this call for everyone');
    const c = channel(req.user, call.channelId);
    if (!call.endedAt) {
      const { id, owner, version, created, updated, ...data } = call;
      const endedAt = new Date().toISOString();
      store.put('events', { ...data, endedAt, end: endedAt }, req.user.id, id, version);
      broadcast(c, 'call:ended', { id });
    }
    res.json({ ok: true });
  });
  app.post('/api/chat/:channelId/call', (req, res) => {
    const c = channel(req.user, req.params.channelId);
    const { mode } = z.object({ mode: z.enum(['audio', 'video']) }).parse(req.body);
    const recent = store
      .all('events')
      .find((e) => e.call && e.owner === req.user.id && Date.now() - Date.parse(e.created) < 15000);
    if (recent) fail(429, 'Wait before starting another call');
    const attendees = store
      .users()
      .filter((u) => u.active && readable(u, 'channels', c))
      .map((u) => u.id);
    const call = store.put(
      'events',
      {
        title: `${req.user.name} · ${mode === 'audio' ? 'Audio' : 'Video'} call`,
        projectId: '',
        start: new Date().toISOString(),
        end: new Date(Date.now() + 3600000).toISOString(),
        attendees,
        description: '',
        call: true,
        callMode: mode,
        channelId: c.id,
      },
      req.user.id,
    );
    const message = store.put(
      'messages',
      {
        channelId: c.id,
        text: `${req.user.name} started a ${mode} call`,
        attachments: [],
        callId: call.id,
      },
      req.user.id,
    );
    broadcast(c, 'message', message);
    for (const socket of app.locals.io?.sockets.sockets.values() ?? []) {
      const user = session(socket.request);
      if (user && user.id !== req.user.id && attendees.includes(user.id))
        socket.emit('call:invite', call);
    }
    res.status(201).json(call);
  });
  return {
    validateMessage(data, user, old) {
      channel(user, data.channelId);
      if (old && old.channelId !== data.channelId)
        fail(400, 'Messages cannot move between conversations');
      if (data.callId) {
        const call = store.get('events', data.callId);
        if (!call?.call || call.channelId !== data.channelId || !readable(user, 'events', call))
          fail(403, 'Call is not accessible');
      }
      if (new Set(data.attachments).size !== data.attachments.length)
        fail(400, 'Duplicate attachment');
      let size = 0;
      for (const id of data.attachments) {
        const a = store.get('chatAttachments', id);
        if (
          !a ||
          a.owner !== user.id ||
          a.channelId !== data.channelId ||
          (a.messageId && a.messageId !== old?.id)
        )
          fail(403, 'Attachment is not yours or belongs to another message');
        size += a.size;
      }
      if (size > 100 * 1024 * 1024) fail(413, 'Message attachments exceed 100 MB');
    },
    claimAttachments(message) {
      for (const id of message.attachments || []) {
        const a = store.get('chatAttachments', id);
        if (!a.messageId) {
          const { id: ignored, owner, version, created, updated, ...data } = a;
          store.put(
            'chatAttachments',
            { ...data, messageId: message.id },
            message.owner,
            id,
            version,
          );
        }
      }
    },
  };
}
