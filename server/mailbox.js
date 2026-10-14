// SPDX-License-Identifier: MIT
import { z } from 'zod';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { digest } from './store.js';
const email = z.string().trim().email().max(200);
const addresses = (value) =>
  z
    .array(email)
    .max(50)
    .parse(
      (Array.isArray(value) ? value : String(value || '').split(/[;,]/))
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
    );
const clean = ({ id, owner, version, created, updated, ...data }) => data;
export const canReadMail = (user, m) =>
  !!m &&
  (m.owner === user.id ||
    (m.status !== 'Draft' && (m.recipientId === user.id || m.recipientIds?.includes(user.id))));
export const publicMail = (user, m) => {
  const { bcc, recipientIds, recipientId, smtpAccepted, smtpRejected, ...rest } = m;
  return m.owner === user.id ? m : rest;
};
export function installMailIngress(app, { store, uploadDir, fail }) {
  store.db.exec(
    'CREATE TABLE IF NOT EXISTS mail_ingress (id TEXT PRIMARY KEY, message_id TEXT NOT NULL)',
  );
  app.post('/api/mail-ingress', (req, res) => {
    const secret = process.env.MAIL_INGRESS_SECRET;
    if (!secret || secret.length < 32) fail(503, 'Incoming mail gateway is not configured');
    const timestamp = req.get('x-mail-timestamp') || '',
      signature = req.get('x-mail-signature') || '';
    if (
      !/^\d{13}$/.test(timestamp) ||
      Math.abs(Date.now() - Number(timestamp)) > 300000 ||
      !/^[a-f0-9]{64}$/.test(signature)
    )
      fail(401, 'Invalid gateway signature');
    const expected = createHmac('sha256', secret)
      .update(timestamp + '.' + JSON.stringify(req.body))
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      fail(401, 'Invalid gateway signature');
    const data = z
      .object({
        deliveryId: z.string().min(1).max(200),
        from: email,
        to: z.array(email).min(1).max(50),
        subject: z.string().max(200),
        body: z.string().max(50000),
        attachments: z
          .array(z.object({ name: z.string().min(1).max(200), base64: z.string().max(2800000) }))
          .max(10)
          .default([]),
      })
      .parse(req.body);
    const deliveryId = digest(data.deliveryId),
      duplicate = store.db
        .prepare('SELECT message_id FROM mail_ingress WHERE id=?')
        .get(deliveryId);
    if (duplicate) return res.json({ id: duplicate.message_id, duplicate: true });
    const recipients = store
      .users()
      .filter(
        (u) =>
          u.active && u.role !== 'guest' && data.to.map((e) => e.toLowerCase()).includes(u.email),
      );
    if (!recipients.length) fail(400, 'No local recipient');
    const files = [];
    try {
      const message = store.transaction(() => {
        for (const attachment of data.attachments) {
          if (
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
              attachment.base64,
            )
          )
            fail(400, 'Invalid attachment encoding');
          const id = randomUUID(),
            bytes = Buffer.from(attachment.base64, 'base64');
          if (bytes.length > 2 * 1024 * 1024) fail(413, 'Incoming attachment exceeds 2 MB');
          writeFileSync(path.join(uploadDir, id), bytes, { flag: 'wx' });
          files.push(id);
          store.put(
            'mailAttachments',
            {
              title: attachment.name.replace(/[\\/\x00-\x1f]/g, '_'),
              size: bytes.length,
              messageId: '',
            },
            recipients[0].id,
            id,
          );
        }
        const m = store.put(
          'mail',
          {
            from: data.from,
            to: data.to.join(', '),
            cc: '',
            bcc: '',
            subject: data.subject,
            body: data.body,
            status: 'Received',
            recipientIds: recipients.map((u) => u.id),
            attachments: files,
            incoming: true,
          },
          recipients[0].id,
        );
        for (const id of files) {
          const a = store.get('mailAttachments', id);
          store.put(
            'mailAttachments',
            { ...clean(a), messageId: m.id },
            recipients[0].id,
            id,
            a.version,
          );
        }
        store.db.prepare('INSERT INTO mail_ingress VALUES (?,?)').run(deliveryId, m.id);
        store.audit('mail-gateway', 'mail.receive', m.id, { recipients: recipients.length });
        return m;
      });
      res.status(201).json({ id: message.id });
    } catch (e) {
      for (const id of files)
        try {
          unlinkSync(path.join(uploadDir, id));
        } catch {}
      throw e;
    }
  });
}
export function formattedMail(text) {
  const escaped = String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  return (
    '<div style="font-family:Arial,sans-serif;line-height:1.6">' +
    escaped
      .split('\n')
      .map(
        (line) =>
          '<p>' +
          line
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>') +
          '</p>',
      )
      .join('') +
    '</div>'
  );
}
export function installMailbox(
  app,
  { store, fail, uploadDir, transportFactory = (options) => nodemailer.createTransport(options) },
) {
  store.db.exec(
    'CREATE TABLE IF NOT EXISTS mailbox_state (user_id TEXT NOT NULL, message_id TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, starred INTEGER NOT NULL DEFAULT 0, trashed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,message_id))',
  );
  const state = (user, m) => ({
    ...publicMail(user, m),
    ...(store.db
      .prepare(
        'SELECT is_read AS isRead,starred,trashed FROM mailbox_state WHERE user_id=? AND message_id=?',
      )
      .get(user.id, m.id) || {
      isRead: m.owner === user.id && !m.incoming,
      starred: false,
      trashed: false,
    }),
  });
  const get = (req) => {
    const m = store.get('mail', req.params.id);
    if (!canReadMail(req.user, m)) fail(403, 'Message is not accessible');
    return m;
  };
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });
  app.get('/api/mail/config', (req, res) =>
    res.json({
      smtp: !!process.env.SMTP_HOST,
      incoming: !!process.env.MAIL_INGRESS_SECRET && process.env.MAIL_INGRESS_SECRET.length >= 32,
      from: process.env.SMTP_FROM || req.user.email,
    }),
  );
  app.get('/api/mail', (req, res) =>
    res.json(
      store
        .all('mail')
        .filter((m) => canReadMail(req.user, m))
        .map((m) => state(req.user, m)),
    ),
  );
  app.patch('/api/mail/:id/state', (req, res) => {
    const m = get(req),
      data = z
        .object({ isRead: z.boolean(), starred: z.boolean(), trashed: z.boolean() })
        .parse(req.body);
    store.db
      .prepare(
        'INSERT INTO mailbox_state VALUES (?,?,?,?,?) ON CONFLICT(user_id,message_id) DO UPDATE SET is_read=excluded.is_read,starred=excluded.starred,trashed=excluded.trashed',
      )
      .run(req.user.id, m.id, +data.isRead, +data.starred, +data.trashed);
    res.json(state(req.user, m));
  });
  app.post('/api/mail/attachments', upload.single('file'), (req, res) => {
    if (!req.file) fail(400, 'Choose a file');
    const pending = store
      .all('mailAttachments')
      .filter((a) => a.owner === req.user.id && !a.messageId);
    if (
      pending.length >= 20 ||
      pending.reduce((n, a) => n + a.size, req.file.size) > 20 * 1024 * 1024
    )
      fail(413, 'Pending attachments exceed 20 MB / 20 files');
    const id = randomUUID();
    writeFileSync(path.join(uploadDir, id), req.file.buffer, { flag: 'wx' });
    try {
      res.status(201).json(
        store.put(
          'mailAttachments',
          {
            title: req.file.originalname.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 200),
            size: req.file.size,
            messageId: '',
          },
          req.user.id,
          id,
        ),
      );
    } catch (e) {
      unlinkSync(path.join(uploadDir, id));
      throw e;
    }
  });
  app.get('/api/mail/attachments/:id', (req, res) => {
    const a = store.get('mailAttachments', req.params.id),
      m = a?.messageId && store.get('mail', a.messageId);
    if (
      !a ||
      !(m ? canReadMail(req.user, m) && m.attachments?.includes(a.id) : a.owner === req.user.id)
    )
      fail(403, 'Attachment is not accessible');
    store.audit(req.user.id, 'mail.download', a.id);
    res.type('application/octet-stream').download(path.join(uploadDir, a.id), a.title);
  });
  app.get('/api/mail/:id/attachments', (req, res) => {
    const m = get(req);
    res.json(
      (m.attachments || [])
        .map((id) => store.get('mailAttachments', id))
        .filter(Boolean)
        .map(({ id, title, size, messageId }) => ({ id, title, size, messageId })),
    );
  });
  app.post('/api/mail/:id/forward-attachments', (req, res) => {
    const message = get(req),
      files = (message.attachments || [])
        .map((id) => store.get('mailAttachments', id))
        .filter(Boolean);
    const pending = store
      .all('mailAttachments')
      .filter((a) => a.owner === req.user.id && !a.messageId);
    if (
      pending.length + files.length > 20 ||
      [...pending, ...files].reduce((n, a) => n + a.size, 0) > 20 * 1024 * 1024
    )
      fail(413, 'Pending attachments exceed 20 files / 20 MB');
    const written = [];
    try {
      const copies = store.transaction(() =>
        files.map((a) => {
          const id = randomUUID();
          writeFileSync(path.join(uploadDir, id), readFileSync(path.join(uploadDir, a.id)), {
            flag: 'wx',
          });
          written.push(id);
          return store.put(
            'mailAttachments',
            { title: a.title, size: a.size, messageId: '' },
            req.user.id,
            id,
          );
        }),
      );
      store.audit(req.user.id, 'mail.forward-attachments', message.id, { count: copies.length });
      res.status(201).json(copies);
    } catch (e) {
      for (const id of written)
        try {
          unlinkSync(path.join(uploadDir, id));
        } catch {}
      throw e;
    }
  });
  app.delete('/api/mail/attachments/:id', (req, res) => {
    const a = store.get('mailAttachments', req.params.id);
    if (!a || a.owner !== req.user.id || a.messageId)
      fail(403, 'Only unsent, unattached uploads can be removed');
    store.remove('mailAttachments', a.id, req.user.id);
    try {
      unlinkSync(path.join(uploadDir, a.id));
    } catch {}
    res.json({ ok: true });
  });
  async function write(req, res, draft) {
    const data = z
      .object({
        to: z.string().max(10000).default(''),
        cc: z.string().max(10000).default(''),
        bcc: z.string().max(10000).default(''),
        subject: z.string().trim().max(200).default(''),
        body: z.string().max(50000).default(''),
        attachments: z.array(z.string()).max(20).default([]),
        draftId: z.string().optional(),
        version: z.number().int().optional(),
      })
      .parse(req.body);
    const old = data.draftId && store.get('mail', data.draftId);
    if (data.draftId && (!old || old.owner !== req.user.id || old.status !== 'Draft'))
      fail(403, 'Draft is not editable');
    if (old && old.version !== data.version) fail(409, 'Draft changed; reload it');
    const to = draft ? [] : addresses(data.to),
      cc = draft ? [] : addresses(data.cc),
      bcc = draft ? [] : addresses(data.bcc);
    if (!draft && (!to.length || !data.subject || !data.body.trim()))
      fail(400, 'Recipient, subject and message are required');
    const all = [...new Set([...to, ...cc, ...bcc])];
    if (all.length > 50) fail(400, 'At most 50 recipients');
    const local = store
      .users()
      .filter((u) => u.active && u.role !== 'guest' && all.includes(u.email));
    const external = all.filter((address) => !local.some((u) => u.email === address));
    if (!draft && external.length && !process.env.SMTP_HOST)
      fail(503, 'External email needs SMTP configuration. Save a draft or send internally.');
    const attachments = data.attachments.map((id) => store.get('mailAttachments', id));
    if (
      new Set(data.attachments).size !== data.attachments.length ||
      attachments.some(
        (a) => !a || a.owner !== req.user.id || (a.messageId && a.messageId !== old?.id),
      )
    )
      fail(403, 'Attachment is not yours or already belongs to another message');
    if (attachments.reduce((n, a) => n + a.size, 0) > 20 * 1024 * 1024)
      fail(413, 'Attachments exceed 20 MB');
    const { draftId, version, ...fields } = data;
    let m = store.transaction(() => {
      const m = store.put(
        'mail',
        {
          ...fields,
          from: req.user.email,
          recipientIds: draft ? [] : local.map((u) => u.id),
          recipientId: local[0]?.id || '',
          status: draft ? 'Draft' : external.length ? 'Sending' : 'Delivered internally',
        },
        req.user.id,
        old?.id,
        old?.version,
      );
      for (const a of attachments)
        if (!a.messageId)
          store.put(
            'mailAttachments',
            { ...clean(a), messageId: m.id },
            req.user.id,
            a.id,
            a.version,
          );
      return m;
    });
    if (!draft && external.length) {
      const transport = transportFactory({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        requireTLS: process.env.SMTP_SECURE !== 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
        connectionTimeout: 15000,
        socketTimeout: 30000,
      });
      try {
        const info = await transport.sendMail({
          from: process.env.SMTP_FROM || req.user.email,
          replyTo: req.user.email,
          to,
          cc,
          bcc,
          subject: data.subject,
          text: data.body,
          html: formattedMail(data.body),
          envelope: { from: process.env.SMTP_FROM || req.user.email, to: external },
          attachments: attachments.map((a) => ({
            filename: a.title,
            content: readFileSync(path.join(uploadDir, a.id)),
          })),
        });
        m = store.put(
          'mail',
          {
            ...clean(m),
            status: info.rejected?.length ? 'Partially accepted by SMTP' : 'Accepted by SMTP',
            smtpMessageId: info.messageId,
            smtpAccepted: info.accepted,
            smtpRejected: info.rejected,
          },
          req.user.id,
          m.id,
          m.version,
        );
      } catch (e) {
        m = store.put(
          'mail',
          {
            ...clean(m),
            status: 'SMTP failed or delivery uncertain',
            deliveryNote: local.length
              ? 'Local recipients received their copies. External delivery is not confirmed.'
              : 'External delivery is not confirmed. Check the relay before resending.',
          },
          req.user.id,
          m.id,
          m.version,
        );
        store.audit(req.user.id, 'mail.smtp.failure', m.id);
        res.status(502).json({
          error:
            'SMTP delivery is not confirmed. See Sent for details; do not resend until checked.',
          messageId: m.id,
        });
        return;
      } finally {
        transport.close();
      }
    }
    res.status(201).json(state(req.user, m));
  }
  app.post('/api/mail', (req, res, next) => write(req, res, false).catch(next));
  app.post('/api/mail/drafts', (req, res, next) => write(req, res, true).catch(next));
}
