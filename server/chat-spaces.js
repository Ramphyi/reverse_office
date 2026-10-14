// SPDX-License-Identifier: MIT
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { digest } from './store.js';
import path from 'node:path';

export const monitoringNotice =
  'Workspace administrators can review all conversations and shared files through audited access.';
const clean = ({ id, owner, version, created, updated, ...data }) => data;
export function chatDirectory(store, user, readable) {
  if (user.role !== 'guest') return store.users();
  const ids = new Set([user.id]);
  for (const c of store.all('channels'))
    if (readable(user, 'channels', c)) for (const id of c.memberIds || []) ids.add(id);
  return store.users().filter((u) => ids.has(u.id));
}
export function externalMeeting(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Object.assign(Error('Enter a valid meeting link'), { status: 400 });
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || value.length > 4000)
    throw Object.assign(Error('Use an HTTPS Teams or Google Meet meeting link'), { status: 400 });
  let provider = '';
  if (url.hostname === 'meet.google.com' && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(url.pathname))
    provider = 'Google Meet';
  if (
    ['teams.microsoft.com', 'teams.live.com', 'teams.cloud.microsoft'].includes(url.hostname) &&
    /^\/(l\/meetup-join\/|meet\/|dl\/launcher\/)/.test(url.pathname)
  )
    provider = 'Microsoft Teams';
  if (!provider)
    throw Object.assign(Error('This is not a supported Teams or Google Meet meeting link'), {
      status: 400,
    });
  return { provider, url: url.href };
}
export function installChatInvites(app, { store, fail, signIn, loginLimit }) {
  // Tokens are single-use bearer invitations. Only their hashes are stored.
  app.post('/api/chat-invitations/accept', loginLimit, (req, res) => {
    const data = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        name: z.string().trim().min(2).max(100),
        password: z.string().min(12).max(200),
        acknowledge: z.literal(true),
      })
      .parse(req.body);
    const result = store.transaction(() => {
      const invite = store.get('chatInvites', digest(data.token));
      const c = invite && store.get('channels', invite.channelId);
      const inviter = invite && store.users().find((u) => u.id === invite.owner && u.active);
      if (
        !invite ||
        invite.usedAt ||
        invite.revoked ||
        Date.parse(invite.expires) <= Date.now() ||
        !c ||
        c.visibility !== 'group' ||
        !inviter ||
        inviter.role === 'guest' ||
        (inviter.role !== 'admin' && !c.memberIds.includes(inviter.id))
      )
        fail(400, 'Invitation is invalid, expired or revoked');
      if (store.users().some((u) => u.email === invite.email))
        fail(
          409,
          'An account already exists for this email. Sign in and ask the conversation owner to add it.',
        );
      if (c.memberIds.length >= 100) fail(409, 'Conversation has reached 100 participants');
      const user = store.addUser({
        name: data.name,
        email: invite.email,
        password: data.password,
        role: 'guest',
      });
      store.db.prepare('UPDATE users SET company=? WHERE id=?').run(invite.company, user.id);
      store.put(
        'channels',
        { ...clean(c), memberIds: [...c.memberIds, user.id] },
        invite.owner,
        c.id,
        c.version,
      );
      store.put(
        'chatInvites',
        { ...clean(invite), usedAt: new Date().toISOString(), userId: user.id },
        user.id,
        invite.id,
        invite.version,
      );
      store.audit(user.id, 'chat.invitation.accept', c.id, { monitoringAcknowledged: true });
      return { ...user, company: invite.company };
    });
    app.locals.chatChanged?.();
    res.status(201).json(signIn(res, result));
  });
}
export function installChatSpaces(app, { store, readable, session, fail, uploadDir }) {
  const internal = (user) => {
    if (user.role === 'guest') fail(403, 'Only workspace members can manage conversations');
  };
  const admin = (user) => {
    if (user.role !== 'admin') fail(403, 'Administrator access required');
  };
  const managed = (user, id) => {
    internal(user);
    const c = store.get('channels', id);
    if (!c || (c.owner !== user.id && user.role !== 'admin'))
      fail(403, 'Only the owner or an administrator can manage participants');
    return c;
  };
  // No content in notifications; recipients reload their own authorized collections.
  const changed = () => {
    for (const socket of app.locals.io?.sockets.sockets.values() ?? []) {
      const user = session(socket.request);
      if (!user) {
        socket.disconnect(true);
        continue;
      }
      for (const room of socket.rooms) {
        if (
          room.startsWith('channel:') &&
          !readable(user, 'channels', store.get('channels', room.slice(8)))
        )
          socket.leave(room);
        if (
          room.startsWith('meeting:') &&
          !readable(user, 'events', store.get('events', room.slice(8)))
        ) {
          socket.to(room).emit('meeting:left', socket.id);
          socket.emit('call:ended', { id: room.slice(8) });
          socket.leave(room);
        }
      }
      socket.emit('chat:updated', {});
    }
  };
  app.locals.chatChanged = changed;
  const memberIds = z.array(z.string().min(1).max(100)).max(100);
  const validMembers = (ids) => {
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => !store.users().some((u) => u.id === id && u.active))
    )
      fail(400, 'Choose unique active participants');
  };
  app.post('/api/chat/conversations', (req, res) => {
    internal(req.user);
    const data = z
      .object({
        title: z.string().trim().min(1).max(120),
        description: z.string().max(1000).default(''),
        category: z.string().trim().min(1).max(80).default('General'),
        visibility: z.enum(['workspace', 'group']),
        memberIds: memberIds.default([]),
        projectId: z.string().max(100).default(''),
      })
      .parse(req.body);
    if (data.visibility === 'group') {
      data.memberIds = [...new Set([req.user.id, ...data.memberIds])];
      if (data.memberIds.length > 100) fail(400, 'At most 100 participants');
      validMembers(data.memberIds);
      data.projectId = '';
    } else {
      data.memberIds = [];
      if (data.projectId && !readable(req.user, 'projects', store.get('projects', data.projectId)))
        fail(403, 'Project is not accessible');
    }
    const c = store.put('channels', data, req.user.id);
    changed();
    res.status(201).json(c);
  });
  app.post('/api/chat/:id/expand', (req, res) => {
    internal(req.user);
    const c = store.get('channels', req.params.id);
    if (!c || c.visibility !== 'direct' || !readable(req.user, 'channels', c))
      fail(403, 'Open your direct conversation first');
    const data = z.object({ title: z.string().trim().min(1).max(120), memberIds }).parse(req.body);
    const ids = [...new Set([...c.memberIds, ...data.memberIds])];
    if (ids.length < 3 || ids.length > 100)
      fail(400, 'Choose at least one new person (maximum 100 participants)');
    validMembers(ids);
    const group = store.put(
      'channels',
      {
        title: data.title,
        description: 'New group. Earlier direct messages stay in the original conversation.',
        visibility: 'group',
        category: 'Groups',
        memberIds: ids,
        projectId: '',
      },
      req.user.id,
    );
    changed();
    res.status(201).json(group);
  });
  app.put('/api/chat/:id/members', (req, res) => {
    const c = managed(req.user, req.params.id);
    if (c.visibility !== 'group')
      fail(400, 'Only invitation-only groups have an explicit participant list');
    const data = z.object({ memberIds, version: z.number().int() }).parse(req.body);
    validMembers(data.memberIds);
    if (!data.memberIds.includes(c.owner))
      fail(400, 'The conversation owner must remain a participant');
    const updated = store.put(
      'channels',
      { ...clean(c), memberIds: data.memberIds },
      req.user.id,
      c.id,
      data.version,
    );
    changed();
    res.json(updated);
  });
  app.post('/api/chat/:id/invitations', (req, res) => {
    const c = managed(req.user, req.params.id);
    if (c.visibility !== 'group')
      fail(400, 'Create an invitation-only group before inviting external people');
    const data = z
      .object({ email: z.string().email().max(200), company: z.string().trim().min(1).max(120) })
      .parse(req.body);
    data.email = data.email.toLowerCase();
    if (store.users().some((u) => u.email === data.email))
      fail(409, 'This account already exists; add it with the participant selector');
    const pending = store
      .all('chatInvites')
      .filter(
        (i) =>
          i.channelId === c.id && !i.usedAt && !i.revoked && Date.parse(i.expires) > Date.now(),
      );
    if (pending.length >= 100 || pending.some((i) => i.email === data.email))
      fail(409, 'A pending invitation already exists or the 100-invitation limit was reached');
    const token = randomBytes(32).toString('hex');
    const invite = store.put(
      'chatInvites',
      {
        ...data,
        channelId: c.id,
        expires: new Date(Date.now() + 7 * 86400000).toISOString(),
        usedAt: '',
        revoked: false,
      },
      req.user.id,
      digest(token),
    );
    res.status(201).json({ id: invite.id, token, expires: invite.expires });
  });
  app.get('/api/chat/:id/invitations', (req, res) => {
    managed(req.user, req.params.id);
    res.json(
      store
        .all('chatInvites')
        .filter((i) => i.channelId === req.params.id)
        .map(({ id, email, company, expires, usedAt, revoked }) => ({
          id,
          email,
          company,
          expires,
          usedAt,
          revoked,
        })),
    );
  });
  app.delete('/api/chat/:id/invitations/:inviteId', (req, res) => {
    managed(req.user, req.params.id);
    const invite = store.get('chatInvites', req.params.inviteId);
    if (!invite || invite.channelId !== req.params.id) fail(404, 'Invitation not found');
    store.put(
      'chatInvites',
      { ...clean(invite), revoked: true },
      req.user.id,
      invite.id,
      invite.version,
    );
    res.json({ ok: true });
  });
  app.post('/api/chat/:id/external-meeting', (req, res) => {
    const c = store.get('channels', req.params.id);
    if (!readable(req.user, 'channels', c)) fail(403, 'Conversation is not accessible');
    const data = z
      .object({ url: z.string().max(4000), title: z.string().trim().min(1).max(120) })
      .parse(req.body);
    const meeting = externalMeeting(data.url);
    const message = store.put(
      'messages',
      { channelId: c.id, text: data.title, attachments: [], callId: '', externalMeeting: meeting },
      req.user.id,
    );
    for (const socket of app.locals.io?.sockets.sockets.values() ?? []) {
      const user = session(socket.request);
      if (user && readable(user, 'channels', c)) socket.emit('message', message);
    }
    res.status(201).json(message);
  });
  app.get('/api/chat/admin/conversations', (req, res) => {
    admin(req.user);
    store.audit(req.user.id, 'chat.review.list', 'channels');
    res.json(store.all('channels'));
  });
  const reason = z.string().trim().min(10).max(500);
  app.post('/api/chat/admin/:id/review', (req, res) => {
    admin(req.user);
    const why = reason.parse(req.body.reason);
    const c = store.get('channels', req.params.id);
    if (!c) fail(404, 'Conversation not found');
    store.audit(req.user.id, 'chat.review.read', c.id, { reason: why });
    const messages = store.all('messages').filter((m) => m.channelId === c.id);
    const ids = new Set(messages.flatMap((m) => m.attachments || []));
    res.json({
      channel: c,
      messages,
      attachments: store
        .all('chatAttachments')
        .filter((a) => ids.has(a.id) && a.channelId === c.id),
    });
  });
  app.get('/api/chat/admin/attachments/:id/download', (req, res) => {
    admin(req.user);
    const why = reason.parse(req.query.reason);
    const a = store.get('chatAttachments', req.params.id);
    const m = a && store.get('messages', a.messageId);
    if (!a || !m?.attachments?.includes(a.id)) fail(404, 'Published attachment not found');
    store.audit(req.user.id, 'chat.review.download', a.id, { reason: why });
    res.type('application/octet-stream').download(path.join(uploadDir, a.id), a.title);
  });
}
