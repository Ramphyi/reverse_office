import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { z } from 'zod';
import { digest } from './store.js';
import { exportDocument, checkZipLimits } from './exports.js';
import { templates, createTemplate } from './office-templates.js';

const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
};
const formats = { doc: 'docx', note: 'docx', sheet: 'xlsx', slides: 'pptx' };
const fail = (status, message) => {
  throw Object.assign(Error(message), { status });
};
export function signOfficeToken(payload, secret, seconds = 3600) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    body = Buffer.from(
      JSON.stringify({
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + seconds,
      }),
    ).toString('base64url'),
    input = `${header}.${body}`;
  return input + '.' + createHmac('sha256', secret).update(input).digest('base64url');
}
export function verifyOfficeToken(token, secret) {
  try {
    if (typeof token !== 'string' || token.length > 100000) throw Error();
    const [head, body, signature, ...extra] = token.split('.');
    if (extra.length || JSON.parse(Buffer.from(head, 'base64url')).alg !== 'HS256') throw Error();
    const expected = createHmac('sha256', secret).update(`${head}.${body}`).digest(),
      actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw Error();
    const value = JSON.parse(Buffer.from(body, 'base64url'));
    if (value.exp !== undefined && (!Number.isFinite(value.exp) || value.exp <= Date.now() / 1000))
      throw Error();
    return value;
  } catch {
    fail(401, 'Invalid or expired document-service token');
  }
}
export async function boundedOfficeResponse(response, limit = 50 * 1024 * 1024) {
  if (!response.ok) fail(502, `Document service returned HTTP ${response.status}`);
  const parts = [];
  let length = 0;
  for await (const part of response.body) {
    length += part.length;
    if (length > limit) fail(413, 'Office file exceeds the 50 MiB limit');
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts);
}
export function createOfficeEngine({ store, dataDir, env = process.env, fetcher = fetch }) {
  const secret = env.OFFICE_JWT_SECRET || '',
    internal = env.OFFICE_INTERNAL_URL?.replace(/\/$/, ''),
    publicUrl = env.OFFICE_PUBLIC_URL?.replace(/\/$/, ''),
    appUrl = env.OFFICE_APP_URL?.replace(/\/$/, '');
  const enabled = !!(internal && publicUrl && appUrl && secret.length >= 32);
  const db = store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS office_assets(entity_id TEXT PRIMARY KEY,collection TEXT NOT NULL,file_type TEXT NOT NULL,bytes BLOB NOT NULL,hash TEXT NOT NULL,revision INTEGER NOT NULL,updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS office_revisions(entity_id TEXT NOT NULL,revision INTEGER NOT NULL,bytes BLOB NOT NULL,hash TEXT NOT NULL,actor TEXT NOT NULL,created TEXT NOT NULL,PRIMARY KEY(entity_id,revision));
 CREATE TABLE IF NOT EXISTS office_sessions(key TEXT PRIMARY KEY,entity_id TEXT NOT NULL,collection TEXT NOT NULL,source BLOB NOT NULL,actor TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS office_save_requests(id TEXT PRIMARY KEY,key TEXT NOT NULL,state TEXT NOT NULL,revision INTEGER,created INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS office_sessions_entity ON office_sessions(entity_id,active);`);
  let access;
  const getAsset = (id) => db.prepare('SELECT * FROM office_assets WHERE entity_id=?').get(id);
  const metadata = (id) => {
    const a = db
      .prepare('SELECT file_type,revision,updated FROM office_assets WHERE entity_id=?')
      .get(id);
    return a ? { format: a.file_type, revision: a.revision, updated: a.updated } : null;
  };
  function check(user, collection, id) {
    if (!['documents', 'files'].includes(collection)) fail(404, 'Unknown document collection');
    const item = store.get(collection, id);
    if (!user?.active || !access?.readable(user, collection, item))
      fail(403, 'Document is not accessible');
    return item;
  }
  const activeUser = (id) =>
    store.users().find((u) => u.id === id && u.active && !u.mustChangePassword);
  function putAsset(collection, item, bytes, fileType, actor) {
    if (bytes.length > 50 * 1024 * 1024) fail(413, 'Office file exceeds the 50 MiB limit');
    if (fileType === 'pdf') {
      if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) fail(400, 'Invalid PDF');
    } else {
      let names;
      try {
        names = checkZipLimits(bytes);
      } catch (e) {
        fail(400, e.message);
      }
      const expected = {
        docx: 'word/document.xml',
        xlsx: 'xl/workbook.xml',
        pptx: 'ppt/presentation.xml',
      }[fileType];
      if (!names.has('[Content_Types].xml') || !expected || !names.has(expected))
        fail(400, 'The archive does not match its Office file extension');
    }
    return store.transaction(() => {
      const old = getAsset(item.id),
        hash = digest(bytes);
      if (old?.hash === hash) return metadata(item.id);
      const revision = (old?.revision ?? 0) + 1,
        now = new Date().toISOString();
      db.prepare(
        'INSERT INTO office_assets VALUES(?,?,?,?,?,?,?) ON CONFLICT(entity_id) DO UPDATE SET bytes=excluded.bytes,hash=excluded.hash,revision=excluded.revision,updated=excluded.updated',
      ).run(item.id, collection, fileType, bytes, hash, revision, now);
      db.prepare('INSERT INTO office_revisions VALUES(?,?,?,?,?,?)').run(
        item.id,
        revision,
        bytes,
        hash,
        actor,
        now,
      );
      db.prepare('DELETE FROM office_revisions WHERE entity_id=? AND revision<=?').run(
        item.id,
        revision - 50,
      );
      store.audit(actor, 'office.save', `${collection}/${item.id}`, {
        revision,
        sha256: hash,
        format: fileType,
      });
      return metadata(item.id);
    });
  }
  const busy = new Map();
  async function locked(id, fn) {
    const previous = busy.get(id) ?? Promise.resolve();
    let unlock;
    const wait = new Promise((r) => {
        unlock = r;
      }),
      queued = previous.then(() => wait);
    busy.set(id, queued);
    await previous;
    try {
      return await fn();
    } finally {
      unlock();
      if (busy.get(id) === queued) busy.delete(id);
    }
  }
  async function ensureAsset(collection, item, user) {
    return locked(item.id, async () => {
      const existing = getAsset(item.id);
      if (existing) return existing;
      const bytes =
          collection === 'files'
            ? readFileSync(path.join(dataDir, 'files', item.id))
            : (await exportDocument(item, formats[item.kind])).bytes,
        fileType = collection === 'files' ? 'pdf' : formats[item.kind];
      if (!fileType) fail(400, 'Unsupported document');
      if (collection === 'files' && item.mime !== 'application/pdf') fail(400, 'Choose a PDF file');
      const current = check(user, collection, item.id);
      if (current.version !== item.version)
        fail(409, 'Document changed while opening; refresh and retry');
      putAsset(collection, item, bytes, fileType, user.id);
      return getAsset(item.id);
    });
  }
  function sourceURL(s, user) {
    return `${appUrl}/office-service/source/${s.key}?ticket=${encodeURIComponent(signOfficeToken({ aud: 'office-source', key: s.key, user: user.id }, secret, 24 * 3600))}`;
  }
  async function service(endpoint, payload) {
    const token = signOfficeToken(payload, secret);
    const response = await fetcher(internal + endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        AuthorizationJwt: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...payload, token }),
      redirect: 'error',
      signal: AbortSignal.timeout(90000),
    });
    return JSON.parse((await boundedOfficeResponse(response, 2 * 1024 * 1024)).toString());
  }
  function savedURL(raw) {
    const url = new URL(raw),
      allowed = [new URL(internal).origin, new URL(publicUrl).origin];
    if (
      !allowed.includes(url.origin) ||
      url.username ||
      url.password ||
      !url.pathname.startsWith('/cache/')
    )
      fail(400, 'Document service returned an untrusted download URL');
    const dest = new URL(internal);
    dest.pathname = url.pathname;
    dest.search = url.search;
    return dest;
  }
  async function download(raw) {
    return boundedOfficeResponse(
      await fetcher(savedURL(raw), { redirect: 'error', signal: AbortSignal.timeout(90000) }),
    );
  }
  function requireEngine() {
    if (!enabled)
      fail(
        503,
        'Start the document engine and configure OFFICE_PUBLIC_URL, OFFICE_INTERNAL_URL, OFFICE_APP_URL and a 32-character OFFICE_JWT_SECRET',
      );
  }
  const callbacks = express.Router();
  callbacks.get('/source/:key', (req, res) => {
    requireEngine();
    const token = verifyOfficeToken(req.query.ticket, secret);
    if (token.aud !== 'office-source' || token.key !== req.params.key)
      fail(401, 'Invalid source ticket');
    const s = db.prepare('SELECT * FROM office_sessions WHERE key=?').get(req.params.key);
    if (!s) fail(404, 'Editing session not found');
    check(activeUser(token.user), s.collection, s.entity_id);
    const a = getAsset(s.entity_id);
    res
      .set('Cache-Control', 'no-store')
      .type(MIME[a.file_type])
      .send(Buffer.from(s.active ? a.bytes : s.source));
  });
  callbacks.post('/callback/:key', async (req, res) => {
    requireEngine();
    const signed = req.get('AuthorizationJwt')?.replace(/^Bearer /, '') ?? req.body.token;
    let payload = verifyOfficeToken(signed, secret);
    payload = payload.payload ?? payload;
    if (payload.key !== req.params.key) fail(401, 'Callback document key mismatch');
    await locked(payload.key, async () => {
      const s = db.prepare('SELECT * FROM office_sessions WHERE key=?').get(payload.key);
      if (!s) fail(404, 'Editing session not found');
      if (!s.active) {
        if ([2, 4].includes(payload.status)) return;
        fail(409, 'This editing session has already closed');
      }
      if ([3, 7].includes(payload.status)) {
        store.audit(s.actor, 'office.save-error', s.entity_id, { status: payload.status });
        fail(502, 'Document engine could not save the file');
      }
      if ([2, 6].includes(payload.status)) {
        const actor = activeUser(payload.users?.[0] ?? s.actor),
          item = check(actor, s.collection, s.entity_id),
          asset = getAsset(item.id);
        if (payload.filetype && payload.filetype !== asset.file_type)
          fail(400, 'Unexpected saved file format');
        if (!access.writable(actor, s.collection, item)) fail(403, 'Document is read only');
        const bytes = await download(payload.url);
        const latest = check(actor, s.collection, s.entity_id);
        if (
          !access.writable(actor, s.collection, latest) ||
          !db.prepare('SELECT active FROM office_sessions WHERE key=?').get(s.key)?.active
        )
          fail(403, 'Editing access was revoked');
        store.transaction(() => {
          const saved = putAsset(s.collection, item, bytes, asset.file_type, actor.id);
          if (typeof payload.userdata === 'string')
            db.prepare(
              'UPDATE office_save_requests SET state=?,revision=? WHERE id=? AND key=?',
            ).run('saved', saved.revision, payload.userdata, s.key);
          if (payload.status === 2)
            db.prepare('UPDATE office_sessions SET active=0 WHERE key=?').run(s.key);
        });
      } else if (payload.status === 4)
        db.prepare('UPDATE office_sessions SET active=0 WHERE key=?').run(s.key);
    });
    res.json({ error: 0 });
  });
  function install(app, context) {
    access = context;
    app.get('/api/office/health', async (req, res) => {
      let reachable = false;
      if (enabled)
        try {
          const response = await fetcher(internal + '/healthcheck', {
            signal: AbortSignal.timeout(5000),
          });
          reachable = response.ok && (await response.text()).trim() === 'true';
        } catch {}
      res.json({
        configured: enabled,
        reachable,
        engine: 'ONLYOFFICE Docs',
        publicUrl: enabled ? publicUrl : null,
      });
    });
    app.get('/api/office/templates', (req, res) => res.json(templates));
    app.post('/api/office/create', async (req, res) => {
      const data = z
          .object({
            templateId: z.string(),
            title: z.string().trim().min(1).max(200),
            projectId: z.string().default(''),
          })
          .parse(req.body),
        template = templates.find((t) => t.id === data.templateId);
      if (!template) fail(404, 'Template not found');
      context.ensureProject(req.user, data);
      const bytes = await createTemplate(template.id, data.title);
      const item = store.transaction(() => {
        const d = store.put(
          'documents',
          {
            title: data.title,
            projectId: data.projectId,
            folderId: '',
            kind: template.kind,
            content:
              template.kind === 'sheet'
                ? { cells: {} }
                : template.kind === 'slides'
                  ? { slides: [{ title: data.title, body: '' }] }
                  : { type: 'doc', content: [{ type: 'paragraph' }] },
          },
          req.user.id,
        );
        putAsset('documents', d, bytes, formats[template.kind], req.user.id);
        return d;
      });
      res.status(201).json({ ...item, office: metadata(item.id) });
    });
    app.post('/api/office/:collection/:id/config', async (req, res) => {
      if (
        !access.writable(
          req.user,
          req.params.collection,
          store.get(req.params.collection, req.params.id),
        )
      )
        fail(403, 'Read-only share: download this document from Drive');
      requireEngine();
      const { collection, id } = req.params,
        item = check(req.user, collection, id),
        a = await ensureAsset(collection, item, req.user);
      if (a.file_type === 'pdf' && Buffer.from(a.bytes).includes(Buffer.from('/ByteRange')))
        fail(
          409,
          'This PDF contains a certificate signature. Keep the signed original; editing would invalidate it.',
        );
      let s = db
        .prepare(
          'SELECT * FROM office_sessions WHERE entity_id=? AND active=1 ORDER BY created DESC LIMIT 1',
        )
        .get(id);
      if (!s) {
        db.prepare('DELETE FROM office_sessions WHERE active=0 AND created<?').run(
          Date.now() - 86400000,
        );
        db.prepare('DELETE FROM office_save_requests WHERE created<?').run(Date.now() - 86400000);
        const key = randomUUID();
        db.prepare('INSERT INTO office_sessions VALUES(?,?,?,?,?,1,?)').run(
          key,
          id,
          collection,
          a.bytes,
          req.user.id,
          Date.now(),
        );
        s = db.prepare('SELECT * FROM office_sessions WHERE key=?').get(key);
      }
      const config = {
        documentType: { docx: 'word', xlsx: 'cell', pptx: 'slide', pdf: 'pdf' }[a.file_type],
        type: 'desktop',
        height: '100%',
        width: '100%',
        document: {
          fileType: a.file_type,
          key: s.key,
          title: item.title.replace(/\.(docx|xlsx|pptx|pdf)$/i, '') + '.' + a.file_type,
          url: sourceURL(s, req.user),
          permissions: {
            edit: true,
            download: true,
            print: true,
            review: true,
            comment: true,
            fillForms: true,
            modifyContentControl: true,
            modifyFilter: true,
          },
        },
        editorConfig: {
          mode: 'edit',
          lang: 'en',
          callbackUrl: `${appUrl}/office-service/callback/${s.key}`,
          user: { id: req.user.id, name: req.user.name },
          coEditing: { mode: 'fast', change: true },
          customization: {
            autosave: true,
            forcesave: true,
            compactToolbar: false,
            hideRightMenu: false,
            uiTheme: req.body.theme === 'dark' ? 'theme-dark' : 'theme-light',
            unit: 'cm',
            macrosMode: 'disable',
            plugins: false,
            features: { featuresTips: false },
            close: { visible: true },
          },
        },
      };
      store.audit(req.user.id, 'office.open', id, { format: a.file_type, key: s.key });
      res.json({
        config: { ...config, token: signOfficeToken(config, secret, 24 * 3600) },
        scriptUrl: publicUrl + '/web-apps/apps/api/documents/api.js',
        revision: a.revision,
        key: s.key,
      });
    });
    app.get('/api/office/:collection/:id/status', (req, res) => {
      check(req.user, req.params.collection, req.params.id);
      res.json({
        office: metadata(req.params.id),
        save: req.query.save
          ? db
              .prepare(
                'SELECT r.state,r.revision FROM office_save_requests r JOIN office_sessions s ON s.key=r.key WHERE r.id=? AND s.entity_id=?',
              )
              .get(String(req.query.save), req.params.id)
          : undefined,
        active: !!db
          .prepare('SELECT key FROM office_sessions WHERE entity_id=? AND active=1')
          .get(req.params.id),
      });
    });
    app.post('/api/office/:collection/:id/save', async (req, res) => {
      if (
        !access.writable(
          req.user,
          req.params.collection,
          store.get(req.params.collection, req.params.id),
        )
      )
        fail(403, 'Read-only document');
      requireEngine();
      check(req.user, req.params.collection, req.params.id);
      const s = db
        .prepare(
          'SELECT key FROM office_sessions WHERE entity_id=? AND active=1 ORDER BY created DESC LIMIT 1',
        )
        .get(req.params.id);
      if (!s) return res.json({ pending: false, office: metadata(req.params.id) });
      const requestId = randomUUID();
      db.prepare('INSERT INTO office_save_requests VALUES(?,?,?,NULL,?)').run(
        requestId,
        s.key,
        'pending',
        Date.now(),
      );
      const result = await service('/coauthoring/CommandService.ashx', {
        c: 'forcesave',
        key: s.key,
        userdata: requestId,
      });
      if (result.error !== 0)
        db.prepare('DELETE FROM office_save_requests WHERE id=?').run(requestId);
      if (![0, 4].includes(result.error))
        fail(502, `The document engine could not save (code ${result.error})`);
      res.json({
        requestId,
        pending: result.error === 0,
        noChanges: result.error === 4,
        office: metadata(req.params.id),
      });
    });
    app.get('/api/office/:collection/:id/history', (req, res) => {
      check(req.user, req.params.collection, req.params.id);
      res.json(
        db
          .prepare(
            'SELECT revision,hash,actor,created FROM office_revisions WHERE entity_id=? ORDER BY revision DESC',
          )
          .all(req.params.id)
          .map((r) => ({
            ...r,
            name: store.users().find((u) => u.id === r.actor)?.name ?? 'Former member',
          })),
      );
    });
    app.get('/api/office/:collection/:id/history/:revision', (req, res) => {
      const item = check(req.user, req.params.collection, req.params.id),
        a = getAsset(item.id),
        r = db
          .prepare('SELECT bytes FROM office_revisions WHERE entity_id=? AND revision=?')
          .get(item.id, Number(req.params.revision));
      if (!r || !a) fail(404, 'Revision not found');
      res
        .type(MIME[a.file_type])
        .attachment(
          `${item.title.replace(/[^a-zA-Z0-9 _-]/g, '_')}-r${req.params.revision}.${a.file_type}`,
        )
        .send(Buffer.from(r.bytes));
    });
  }
  async function exportNative(item, format, user, collection = 'documents') {
    const a = getAsset(item.id);
    if (!a) return null;
    if (format === a.file_type) return { bytes: Buffer.from(a.bytes), mime: MIME[a.file_type] };
    requireEngine();
    const allowed = {
      docx: ['pdf', 'txt', 'odt', 'rtf', 'html'],
      xlsx: ['pdf', 'csv', 'ods'],
      pptx: ['pdf', 'odp', 'png'],
      pdf: ['pdf', 'docx'],
    };
    if (!allowed[a.file_type]?.includes(format))
      fail(400, 'Use a native Office export format for this document');
    const key = 'export-' + randomUUID();
    db.prepare('INSERT INTO office_sessions VALUES(?,?,?,?,?,0,?)').run(
      key,
      item.id,
      collection,
      a.bytes,
      user.id,
      Date.now(),
    );
    const s = db.prepare('SELECT * FROM office_sessions WHERE key=?').get(key);
    try {
      const result = await service('/ConvertService.ashx', {
        async: false,
        filetype: a.file_type,
        outputtype: format,
        key,
        url: sourceURL(s, user),
        title: item.title,
      });
      if (result.error || !result.endConvert || !result.fileUrl)
        fail(502, `Conversion did not finish (code ${result.error ?? 'pending'})`);
      return {
        bytes: await download(result.fileUrl),
        mime: MIME[format] ?? 'application/octet-stream',
      };
    } finally {
      db.prepare('DELETE FROM office_sessions WHERE key=?').run(key);
    }
  }
  async function importNative(file, user, projectId) {
    const extension = path.extname(file.originalname).slice(1).toLowerCase();
    if (!['docx', 'xlsx', 'pptx'].includes(extension)) return null;
    try {
      checkZipLimits(file.buffer);
    } catch (e) {
      fail(400, e.message);
    }
    const kind = { docx: 'doc', xlsx: 'sheet', pptx: 'slides' }[extension];
    const item = store.transaction(() => {
      const d = store.put(
        'documents',
        {
          title: file.originalname.replace(/\.[^.]+$/, '').slice(0, 200),
          projectId,
          folderId: '',
          kind,
          content:
            kind === 'sheet'
              ? { cells: {} }
              : kind === 'slides'
                ? { slides: [{ title: 'Imported presentation', body: '' }] }
                : { type: 'doc', content: [{ type: 'paragraph' }] },
        },
        user.id,
      );
      putAsset('documents', d, file.buffer, extension, user.id);
      return d;
    });
    return { ...item, office: metadata(item.id) };
  }
  const remove = (id) =>
    store.transaction(() => {
      db.prepare(
        'DELETE FROM office_save_requests WHERE key IN (SELECT key FROM office_sessions WHERE entity_id=?)',
      ).run(id);
      for (const table of ['office_sessions', 'office_revisions', 'office_assets'])
        db.prepare(`DELETE FROM ${table} WHERE entity_id=?`).run(id);
    });
  return {
    enabled,
    callbacks,
    install,
    metadata,
    getAsset,
    exportNative,
    importNative,
    putAsset,
    service,
    remove,
  };
}
