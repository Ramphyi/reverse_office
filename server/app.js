import { installPdfWorkspace } from './pdf-workspace.js';
import { installInsights, compensationSchema } from './workspace-insights.js';
import { installMailbox, installMailIngress, canReadMail, publicMail } from './mailbox.js';
import { drivePermission, installDriveSharing } from './drive-sharing.js';
import { installChatInvites, chatDirectory } from './chat-spaces.js';
import { installChat } from './chat.js';
import { createAISettings, installAISettings } from './ai-settings.js';
import express from 'express';
import { installAssistant } from './assistant.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { openStore, verifyPassword, hashPassword, digest } from './store.js';
import { schemas, workingDays, leaveBalance, date } from './domain.js';
import { exportDocument } from './exports.js';
import { safeImport } from './import-safe.js';
import { seedWorkspace } from './seed.js';
import { createOfficeEngine } from './office-engine.js';
import { initWorkforce } from './workforce.js';

const credentials = z.object({
  email: z.string().email().max(200),
  password: z.string().min(12).max(200),
});
const account = credentials.extend({
  name: z.string().trim().min(2).max(100),
  role: z.enum(['admin', 'manager', 'member']).default('member'),
});
const fail = (status, message) => {
  throw Object.assign(Error(message), { status });
};
const manager = (u) => ['admin', 'manager'].includes(u.role);
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  active: u.active,
  mustChangePassword: !!u.must_change_password,
  department: u.department || '',
  jobTitle: u.job_title || '',
  calendarId: u.calendar_id || '',
  managerId: u.manager_id || '',
  company: u.company || '',
});
const cookie = (req) =>
  Object.fromEntries((req.headers.cookie ?? '').split(';').map((v) => v.trim().split('=')));
export function createApp({
  dataDir = process.env.DATA_DIR || 'data',
  setupKey = process.env.SETUP_KEY || randomBytes(24).toString('hex'),
  test = false,
  officeOptions,
  mailOptions,
} = {}) {
  const sessionCookie = process.env.SESSION_COOKIE || 'ro_session';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(sessionCookie)) throw Error('Invalid session cookie name');
  const app = express(),
    store = openStore(dataDir),
    uploadDir = path.resolve(dataDir, 'files');
  mkdirSync(uploadDir, { recursive: true });
  const workforce = initWorkforce(store);
  const aiSettings = createAISettings(dataDir);
  const office = createOfficeEngine({ store, dataDir, ...officeOptions });
  app.locals.office = office;
  const editorOrigin = process.env.OFFICE_PUBLIC_URL
    ? new URL(process.env.OFFICE_PUBLIC_URL).origin
    : null;
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", ...(editorOrigin ? [editorOrigin] : [])],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          frameSrc: ["'self'", 'blob:', ...(editorOrigin ? [editorOrigin] : [])],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: process.env.COOKIE_SECURE === 'true' ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '4mb' }));
  app.use('/office-service', office.callbacks);
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  if (!test)
    app.use(
      '/api',
      rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }),
    );
  const loginLimit = test
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 900000,
        limit: 20,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Too many sign-in attempts. Try again later.' },
      });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });
  app.get('/api/health', (req, res) =>
    res.json({
      status: 'ok',
      build: '2026.10.14-guide-1',
      preview: process.env.PREVIEW_MODE === 'true',
    }),
  );
  app.get('/api/setup', (req, res) => res.json({ required: store.users().length === 0 }));
  function session(req) {
    const token = cookie(req)[sessionCookie];
    if (!token) return null;
    return store.db
      .prepare(
        'SELECT users.*,sessions.csrf,sessions.expires FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token=? AND sessions.expires>? AND users.active=1',
      )
      .get(digest(token), Date.now());
  }
  function signIn(res, user, remember = false) {
    const duration = (remember ? 30 * 24 : 8) * 3600000;
    const token = randomBytes(32).toString('hex'),
      csrf = randomBytes(24).toString('hex');
    store.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    store.db
      .prepare('INSERT INTO sessions VALUES (?,?,?,?)')
      .run(digest(token), user.id, csrf, Date.now() + duration);
    res.cookie(sessionCookie, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: duration,
      path: '/',
    });
    return { user: publicUser(user), csrf };
  }
  app.post('/api/setup', loginLimit, (req, res) => {
    if (store.users().length) fail(409, 'Workspace has already been configured');
    if (req.body.key !== setupKey) fail(403, 'Use the setup key printed in the server console');
    const data = account.parse({ ...req.body, role: 'admin' }),
      user = store.addUser(data);
    seedWorkspace(store, user);
    store.audit(user.id, 'setup', 'workspace');
    res.status(201).json(signIn(res, user));
  });
  app.post('/api/login', loginLimit, (req, res) => {
    const { email, password } = credentials.parse(req.body);
    const user = store.db
      .prepare('SELECT * FROM users WHERE email=? AND active=1')
      .get(email.toLowerCase());
    // Always perform scrypt to avoid a cheap user-enumeration timing signal.
    const valid = verifyPassword(
      password,
      user?.password ?? hashPassword('constant-invalid-password'),
    );
    if (!user || !valid) fail(401, 'Incorrect email or password');
    store.audit(user.id, 'login', 'session');
    const remember = z.boolean().default(false).parse(req.body.remember);
    res.json(signIn(res, user, remember));
  });
  installMailIngress(app, { store, uploadDir, fail });
  installChatInvites(app, { store, fail, signIn, loginLimit });
  app.use('/api', (req, res, next) => {
    const user = session(req);
    if (!user) return res.status(401).json({ error: 'Sign in to continue' });
    req.user = user;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('x-csrf-token') !== user.csrf)
        return res.status(403).json({ error: 'Invalid request token. Sign in again.' });
      const origin = req.get('origin');
      if (
        origin &&
        origin !== `${req.protocol}://${req.get('host')}` &&
        origin !== process.env.APP_ORIGIN &&
        !(
          process.env.NODE_ENV !== 'production' &&
          /^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin)
        )
      )
        return res.status(403).json({ error: 'Origin is not permitted' });
    }
    if (user.must_change_password && !['/me', '/password', '/logout'].includes(req.path))
      return res.status(403).json({
        error: 'Change your temporary password before accessing the workspace',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    if (user.role === 'guest') {
      const read =
        req.method === 'GET' &&
        [
          '/me',
          '/state',
          '/users',
          '/entities/channels',
          '/entities/messages',
          '/entities/events',
          '/rtc-config',
          '/drive/shared',
        ].includes(req.path);
      const sharedFile =
        req.method === 'GET' &&
        (/^\/files\/[^/]+\/(download|preview)$/.test(req.path) ||
          /^\/documents\/[^/]+\/export\/(docx|xlsx|pptx|pdf|txt|csv)$/.test(req.path));
      const self = ['/password', '/logout', '/profile'].includes(req.path);
      const chat = req.path.startsWith('/chat/') && !req.path.startsWith('/chat/admin/');
      const message = /^\/entities\/messages(?:\/[^/]+)?$/.test(req.path);
      if (!read && !self && !chat && !message && !sharedFile)
        return res.status(403).json({
          error: 'External accounts can only access their conversations and account settings',
        });
    }
    next();
  });
  app.get('/api/me', (req, res) => res.json({ user: publicUser(req.user), csrf: req.user.csrf }));
  app.post('/api/logout', (req, res) => {
    store.db.prepare('DELETE FROM sessions WHERE token=?').run(digest(cookie(req)[sessionCookie]));
    res.clearCookie(sessionCookie, { path: '/' });
    res.json({ ok: true });
  });
  app.post('/api/password', loginLimit, (req, res) => {
    const data = z
      .object({ current: z.string().max(200), password: credentials.shape.password })
      .parse(req.body);
    if (!verifyPassword(data.current, req.user.password))
      fail(400, 'Current password is incorrect');
    if (verifyPassword(data.password, req.user.password)) fail(400, 'Choose a different password');
    store.transaction(() => {
      store.db
        .prepare('UPDATE users SET password=?,must_change_password=0 WHERE id=?')
        .run(hashPassword(data.password), req.user.id);
      store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.user.id);
      store.audit(req.user.id, 'password.change', 'account');
    });
    for (const socket of app.locals.io?.sockets.sockets.values() ?? [])
      if (socket.data.user.id === req.user.id) socket.disconnect(true);
    res.json(signIn(res, { ...req.user, must_change_password: 0 }));
  });
  const hasProject = (user, id) => {
    const p = store.get('projects', id);
    return !!p && (manager(user) || p.members.includes(user.id));
  };
  function readable(user, kind, item) {
    if (!item) return false;
    const shared = drivePermission(store, user, kind, item);
    if (shared) return shared !== 'none';
    if (user.role === 'guest') {
      if (kind === 'channels')
        return ['group', 'direct'].includes(item.visibility) && item.memberIds?.includes(user.id);
      if (kind === 'messages')
        return readable(user, 'channels', store.get('channels', item.channelId));
      if (kind === 'events')
        return item.call && readable(user, 'channels', store.get('channels', item.channelId));
      return false;
    }
    if (kind === 'mail') return canReadMail(user, item);
    if (['timesheets', 'leave', 'entitlements'].includes(kind))
      return manager(user) || item.userId === user.id || item.owner === user.id;
    if (kind === 'calendars') return true;
    if (kind === 'projects') return hasProject(user, item.id);
    if (kind === 'messages')
      return readable(user, 'channels', store.get('channels', item.channelId));
    if (kind === 'channels' && ['direct', 'group'].includes(item.visibility))
      return item.memberIds?.includes(user.id);
    if (
      kind === 'events' &&
      item.call &&
      !readable(user, 'channels', store.get('channels', item.channelId))
    )
      return false;
    if (kind === 'channels' || kind === 'pages')
      return !item.projectId || hasProject(user, item.projectId);
    if (kind === 'events')
      return (
        item.owner === user.id ||
        item.attendees?.includes(user.id) ||
        (item.projectId && hasProject(user, item.projectId))
      );
    return item.projectId ? hasProject(user, item.projectId) : item.owner === user.id;
  }
  function writable(user, kind, item) {
    if (!readable(user, kind, item)) return false;
    const shared = drivePermission(store, user, kind, item);
    if (shared) return shared === 'owner';
    if (
      (kind === 'events' && item.call) ||
      (kind === 'channels' && ['direct', 'group'].includes(item.visibility))
    )
      return false;
    if (kind === 'messages') return item.owner === user.id;
    if (['projects', 'calendars', 'entitlements'].includes(kind)) return manager(user);
    if (['messages', 'mail', 'pages', 'channels'].includes(kind))
      return item.owner === user.id || manager(user);
    return true;
  }
  function visible(user, kind, item) {
    if (kind === 'mail') return publicMail(user, item);
    if (['documents', 'files'].includes(kind)) {
      const policy = store.get('drivePermissions', `drive:${kind}:${item.id}`);
      item = {
        ...item,
        sharingMode: policy?.mode || (item.projectId ? 'project' : 'private'),
        canEdit: writable(user, kind, item),
      };
      const native = office.metadata(item.id);
      if (native) item = { ...item, office: native, updated: native.updated };
    }
    if (!manager(user)) {
      if (kind === 'projects') {
        const { rate, ...safe } = item;
        return safe;
      }
      if (kind === 'timesheets') {
        const { billingSnapshot, ...safe } = item;
        return safe;
      }
    }
    return item;
  }
  function ensureProject(user, data) {
    if (data.projectId && !hasProject(user, data.projectId))
      fail(403, 'You do not have access to this project');
  }
  function validateRefs(kind, data, user, old) {
    if (
      kind === 'channels' &&
      (['direct', 'group'].includes(data.visibility) ||
        ['direct', 'group'].includes(old?.visibility))
    )
      fail(400, 'Use private conversation creation');
    if (kind === 'messages') chat.validateMessage(data, user, old);
    ensureProject(user, data);
    if (['projects', 'calendars', 'entitlements'].includes(kind) && !manager(user))
      fail(403, 'Manager access required');
    if (
      kind === 'projects' &&
      data.members.some(
        (id) => !store.users().some((u) => u.id === id && u.active && u.role !== 'guest'),
      )
    )
      fail(400, 'Unknown project member');
    if (
      kind === 'tasks' &&
      data.assignee &&
      !store
        .users()
        .some(
          (u) =>
            u.id === data.assignee &&
            u.active &&
            (data.projectId ? hasProject(u, data.projectId) : u.id === user.id),
        )
    )
      fail(400, 'Assignee must be an active project member');
    if (
      kind === 'events' &&
      data.attendees.some(
        (id) =>
          !store
            .users()
            .some(
              (u) =>
                u.id === id && u.active && (data.projectId ? hasProject(u, data.projectId) : true),
            ),
      )
    )
      fail(400, 'Unknown or unauthorized attendee');
    if (kind === 'messages' && !readable(user, 'channels', store.get('channels', data.channelId)))
      fail(403, 'Channel is not accessible');
    const parent = data.folderId || data.parentId;
    if (parent) {
      const folder = store.get('folders', parent);
      if (!folder || !readable(user, 'folders', folder) || folder.projectId !== data.projectId)
        fail(400, 'Folder must be in the same accessible project');
      if (old) {
        let cursor = folder,
          visited = new Set([old.id]);
        while (cursor) {
          if (visited.has(cursor.id)) fail(400, 'Folder cycle');
          visited.add(cursor.id);
          cursor = store.get('folders', cursor.parentId);
        }
      }
    }
    if (
      kind === 'calendars' &&
      store
        .all(kind)
        .some((c) => c.id !== old?.id && c.calendarId === data.calendarId && c.year === data.year)
    )
      fail(409, 'This calendar year already exists');
    if (kind === 'entitlements') {
      if (!store.users().some((u) => u.id === data.userId)) fail(400, 'Unknown employee');
      if (
        store
          .all(kind)
          .some(
            (c) =>
              c.id !== old?.id &&
              c.userId === data.userId &&
              c.year === data.year &&
              c.calendarId === data.calendarId,
          )
      )
        fail(409, 'Entitlement already exists for this employee and year');
    }
    if (['timesheets', 'leave'].includes(kind)) {
      data.userId = old?.userId ?? user.id;
      if (
        old &&
        (old.userId !== user.id ||
          (['Approved', 'Submitted', 'Pending'].includes(old.status) &&
            !(kind === 'leave' && old.status === 'Pending')))
      )
        fail(403, 'Only your editable entries can be changed');
      if (kind === 'timesheets') {
        workforce.checkTime(data, user, old);
        if (!['Draft', 'Submitted'].includes(data.status)) fail(403, 'Use the approval workflow');
        const total =
          store
            .all(kind)
            .filter(
              (t) =>
                t.id !== old?.id &&
                t.userId === user.id &&
                t.date === data.date &&
                t.status !== 'Rejected',
            )
            .reduce((n, t) => n + t.hours, 0) + data.hours;
        if (total > 24) fail(400, 'Daily total cannot exceed 24 hours');
      } else {
        workforce.checkLeave(data, user, old);
        data.status = 'Pending';
        if (
          store
            .all(kind)
            .some(
              (l) =>
                l.id !== old?.id &&
                l.userId === user.id &&
                l.status !== 'Rejected' &&
                l.start <= data.end &&
                l.end >= data.start,
            )
        )
          fail(409, 'Leave overlaps an existing request');
        if (!workingDays(data.start, data.end, store.all('calendars'), data.calendarId))
          fail(400, 'The interval contains no working days');
      }
    }
    if (kind === 'documents' && Buffer.byteLength(JSON.stringify(data.content)) > 2000000)
      fail(413, 'Document is too large');
  }
  workforce.install(app, { validateRefs, credentialLimit: loginLimit });
  installInsights(app, { store, workforce, fail });
  installPdfWorkspace(app, { store, readable, writable, office, uploadDir, fail });
  installDriveSharing(app, { store, readable, visible, fail });
  const chat = installChat(app, { store, readable, session, uploadDir, fail });
  app.get('/api/users', (req, res) =>
    res.json(
      chatDirectory(store, req.user, readable).map((u) =>
        manager(req.user)
          ? u
          : {
              id: u.id,
              name: u.name,
              email: u.email,
              role: u.role,
              active: u.active,
              managerId: u.managerId,
              company: u.company,
            },
      ),
    ),
  );
  function validateManager(managerId, personId) {
    if (!managerId) return;
    const people = store.users(),
      boss = people.find((u) => u.id === managerId);
    if (!boss?.active || !manager(boss)) fail(400, 'Choose an active manager or administrator');
    const seen = new Set(personId ? [personId] : []);
    let cursor = boss;
    while (cursor) {
      if (seen.has(cursor.id)) fail(400, 'Reporting lines cannot contain a cycle');
      seen.add(cursor.id);
      cursor = people.find((u) => u.id === cursor.managerId);
    }
  }
  app.post('/api/users', (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Administrator access required');
    const data = account
      .extend({
        managerId: z.string().max(100).default(''),
        department: z.string().trim().max(100).default(''),
        jobTitle: z.string().trim().max(100).default(''),
        calendarId: z.string().max(100).optional(),
        mustChangePassword: z.boolean().default(false),
        projectIds: z.array(z.string()).max(100).default([]),
        allowance: z.number().min(0).max(366).optional(),
        allowanceYear: z.number().int().min(2000).max(2200).optional(),
        compensation: compensationSchema.omit({ userId: true, projectId: true }).optional(),
      })
      .parse(req.body);
    validateManager(data.managerId);
    if (data.projectIds.some((id) => !store.get('projects', id))) fail(400, 'Unknown project');
    if (data.calendarId && !store.all('calendars').some((c) => c.calendarId === data.calendarId))
      fail(400, 'Unknown calendar');
    if (store.users().some((u) => u.email === data.email.toLowerCase()))
      fail(409, 'Email is already registered');
    const user = store.transaction(() => {
      const u = store.addUser(data);
      store.db
        .prepare(
          'UPDATE users SET department=?,job_title=?,calendar_id=?,must_change_password=?,manager_id=? WHERE id=?',
        )
        .run(
          data.department,
          data.jobTitle,
          data.calendarId || '',
          data.mustChangePassword ? 1 : 0,
          data.managerId,
          u.id,
        );
      for (const id of data.projectIds) {
        const p = store.get('projects', id);
        const { id: _, owner, version, created, updated, ...value } = p;
        store.put(
          'projects',
          { ...value, members: [...p.members, u.id] },
          req.user.id,
          id,
          version,
        );
      }
      if (data.allowance !== undefined)
        store.put(
          'entitlements',
          {
            userId: u.id,
            year: data.allowanceYear || new Date().getUTCFullYear(),
            days: data.allowance,
            carryLimit: workforce.organisation().carryLimit,
            calendarId: data.calendarId || workforce.organisation().calendarId,
          },
          req.user.id,
        );
      if (data.compensation)
        store.put(
          'compensation',
          { ...data.compensation, userId: u.id, projectId: '' },
          req.user.id,
          `pay:${u.id}::${data.compensation.effective}`,
        );
      store.audit(req.user.id, 'account.create', u.id, { role: u.role, managerId: data.managerId });
      return store.users().find((v) => v.id === u.id);
    });
    res.status(201).json(user);
  });
  app.patch('/api/users/:id', (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Administrator access required');
    const data = z
        .object({
          active: z.boolean(),
          role: z.enum(['admin', 'manager', 'member', 'guest']),
          name: z.string().trim().min(2).max(100).optional(),
          managerId: z.string().max(100).optional(),
          department: z.string().trim().max(100).optional(),
          jobTitle: z.string().trim().max(100).optional(),
          calendarId: z.string().max(100).optional(),
          projectIds: z.array(z.string()).max(100).optional(),
        })
        .parse(req.body),
      target = store.users().find((u) => u.id === req.params.id);
    if (!target) fail(404, 'Account not found');
    validateManager(data.managerId ?? target.managerId, target.id);
    if (
      (!data.active || !['admin', 'manager'].includes(data.role)) &&
      store.users().some((u) => u.managerId === target.id)
    )
      fail(409, 'Reassign this person’s reports before disabling or removing their manager role');
    if (target.id === req.user.id && (!data.active || data.role !== 'admin'))
      fail(400, 'You cannot remove your own administrator access');
    if (data.projectIds?.some((id) => !store.get('projects', id))) fail(400, 'Unknown project');
    if (data.calendarId && !store.all('calendars').some((c) => c.calendarId === data.calendarId))
      fail(400, 'Unknown calendar');
    store.transaction(() => {
      store.db
        .prepare(
          'UPDATE users SET name=?,department=?,job_title=?,calendar_id=?,manager_id=? WHERE id=?',
        )
        .run(
          data.name ?? target.name,
          data.department ?? target.department,
          data.jobTitle ?? target.jobTitle,
          data.calendarId ?? target.calendarId,
          data.managerId ?? target.managerId,
          target.id,
        );
      if (data.projectIds)
        for (const p of store.all('projects')) {
          const members = [
            ...p.members.filter((id) => id !== target.id),
            ...(data.projectIds.includes(p.id) ? [target.id] : []),
          ];
          if (JSON.stringify(members) === JSON.stringify(p.members)) continue;
          const { id, owner, version, created, updated, ...value } = p;
          store.put('projects', { ...value, members }, req.user.id, id, version);
        }
      store.db
        .prepare('UPDATE users SET active=?,role=? WHERE id=?')
        .run(data.active ? 1 : 0, data.role, target.id);
      store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
      store.audit(req.user.id, 'account.update', target.id, data);
    });
    for (const socket of app.locals.io?.sockets.sockets.values() ?? [])
      if (socket.data.user.id === target.id) socket.disconnect(true);
    res.json({ ok: true });
  });
  app.get('/api/state', (req, res) => {
    const data = {};
    for (const kind of [...Object.keys(schemas).filter((k) => k !== 'mail'), 'files'])
      data[kind] = store
        .all(kind)
        .filter((x) => readable(req.user, kind, x))
        .map((x) => visible(req.user, kind, x));
    res.json(data);
  });
  app.get('/api/entities/:kind', (req, res) => {
    const kind = req.params.kind;
    if (!schemas[kind] && kind !== 'files') fail(404, 'Unknown collection');
    res.json(
      store
        .all(kind)
        .filter((x) => readable(req.user, kind, x))
        .map((x) => visible(req.user, kind, x)),
    );
  });
  app.post('/api/entities/:kind', (req, res) => {
    const kind = req.params.kind;
    if (!schemas[kind] || kind === 'mail') fail(400, 'Unsupported collection');
    const data = schemas[kind].parse(req.body);
    validateRefs(kind, data, req.user);
    const entity = store.transaction(() => {
      const value = store.put(kind, data, req.user.id);
      if (kind === 'messages') chat.claimAttachments(value);
      return value;
    });
    res.status(201).json(entity);
    if (kind === 'messages')
      for (const socket of app.locals.io?.sockets.sockets.values() ?? []) {
        const current = session(socket.request);
        if (
          current &&
          socket.rooms.has(`channel:${data.channelId}`) &&
          readable(current, 'channels', store.get('channels', data.channelId))
        )
          socket.emit('message', entity);
      }
  });
  app.put('/api/entities/:kind/:id', (req, res) => {
    const { kind, id } = req.params;
    if (!schemas[kind] || kind === 'mail') fail(400, 'Unsupported collection');
    const old = store.get(kind, id);
    if (!old || !writable(req.user, kind, old)) fail(403, 'You cannot edit this item');
    if (
      kind === 'documents' &&
      office.metadata(id) &&
      (JSON.stringify(req.body.content) !== JSON.stringify(old.content) ||
        req.body.kind !== old.kind)
    )
      fail(
        409,
        'This file uses the full Office editor. Open it there to preserve its formatting and objects.',
      );
    const data = schemas[kind].parse(req.body);
    validateRefs(kind, data, req.user, old);
    const updated = store.transaction(() => {
      const value = store.put(kind, data, req.user.id, id, req.body.version);
      if (kind === 'messages') chat.claimAttachments(value);
      return value;
    });
    res.json(updated);
  });
  app.delete('/api/entities/:kind/:id', (req, res) => {
    const { kind, id } = req.params;
    if (!schemas[kind] && kind !== 'files') fail(404, 'Unknown collection');
    const old = store.get(kind, id);
    if (!old || !writable(req.user, kind, old)) fail(403, 'You cannot delete this item');
    if (
      ['timesheets', 'leave'].includes(kind) &&
      (old.userId !== req.user.id || old.status === 'Approved' || old.status === 'Submitted')
    )
      fail(403, 'Approved or submitted records cannot be deleted');
    if (
      kind === 'projects' &&
      Object.keys(schemas).some((k) => store.all(k).some((x) => x.projectId === id))
    )
      fail(409, 'Project is in use; set it to Completed instead');
    if (
      kind === 'folders' &&
      ['files', 'documents', 'folders'].some((k) =>
        store.all(k).some((x) => x.folderId === id || x.parentId === id),
      )
    )
      fail(409, 'Move the folder contents first');
    if (kind === 'channels' && store.all('messages').some((m) => m.channelId === id))
      fail(409, 'Channel has messages');
    store.remove(kind, id, req.user.id);
    if (['documents', 'files'].includes(kind)) office.remove(id);
    if (kind === 'files')
      try {
        unlinkSync(path.join(uploadDir, id));
      } catch {}
    res.json({ ok: true });
  });
  app.post('/api/approve/:kind/:id', (req, res) => {
    const { kind, id } = req.params;
    if (!['timesheets', 'leave'].includes(kind) || !manager(req.user))
      fail(403, 'Manager access required');
    const old = store.get(kind, id);
    if (!old) fail(404, 'Request not found');
    if (old.userId === req.user.id) fail(403, 'Another manager must approve your request');
    if (old.status !== (kind === 'leave' ? 'Pending' : 'Submitted'))
      fail(409, 'Request is not awaiting approval');
    const { status } = z.object({ status: z.enum(['Approved', 'Rejected']) }).parse(req.body);
    if (status === 'Approved') workforce.checkApproval(kind, old);
    if (kind === 'leave' && status === 'Approved' && old.type === 'Annual')
      for (let y = Number(old.start.slice(0, 4)); y <= Number(old.end.slice(0, 4)); y++) {
        const balance = leaveBalance(
          old.userId,
          y,
          store.all('entitlements'),
          store.all('leave'),
          store.all('calendars'),
          old.calendarId,
        );
        const requested = workingDays(
          old.start < `${y}-01-01` ? `${y}-01-01` : old.start,
          old.end > `${y}-12-31` ? `${y}-12-31` : old.end,
          store.all('calendars'),
          old.calendarId,
        );
        if (!balance.configured || requested > balance.remaining)
          fail(409, `Insufficient or missing leave entitlement for ${y}`);
      }
    const { id: _, owner, version, created, updated, ...data } = old;
    const p = kind === 'timesheets' ? store.get('projects', old.projectId) : null;
    const billingSnapshot =
      p && status === 'Approved'
        ? { rate: p.rate, currency: p.currency, client: p.client, po: p.po, project: p.title }
        : undefined;
    res.json(
      store.put(
        kind,
        {
          ...data,
          status,
          ...(billingSnapshot ? { billingSnapshot } : {}),
          reviewedBy: req.user.id,
          reviewedAt: new Date().toISOString(),
        },
        req.user.id,
        id,
        req.body.version,
      ),
    );
  });
  app.get('/api/leave-balance', (req, res) => {
    const year = Number(req.query.year || new Date().getUTCFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2200) fail(400, 'Invalid year');
    const userId = String(req.query.userId || req.user.id);
    if (userId !== req.user.id && !manager(req.user)) fail(403, 'Manager access required');
    res.json(
      leaveBalance(
        userId,
        year,
        store.all('entitlements'),
        store.all('leave'),
        store.all('calendars'),
        String(req.query.calendarId || 'default'),
      ),
    );
  });
  app.get('/api/reports', (req, res) => {
    if (!manager(req.user)) fail(403, 'Manager access required');
    const start = date.parse(req.query.start || `${new Date().getUTCFullYear()}-01-01`),
      end = date.parse(req.query.end || `${new Date().getUTCFullYear()}-12-31`);
    if (start > end) fail(400, 'Invalid date interval');
    const rows = store
      .all('timesheets')
      .filter(
        (t) =>
          t.status === 'Approved' &&
          t.date >= start &&
          t.date <= end &&
          (!req.query.projectId || t.projectId === req.query.projectId),
      )
      .map((t) => {
        const p = t.billingSnapshot ?? store.get('projects', t.projectId);
        return {
          ...t,
          employee: store.users().find((u) => u.id === t.userId)?.name,
          project: p?.project ?? p?.title,
          client: p?.client,
          po: p?.po,
          currency: p?.currency,
          rate: p?.rate ?? 0,
          amount: t.billable ? Math.round(t.hours * (p?.rate ?? 0) * 100) / 100 : 0,
        };
      });
    const totals = {};
    for (const r of rows) totals[r.currency] = (totals[r.currency] ?? 0) + r.amount;
    res.json({ start, end, rows, totals, hours: rows.reduce((s, t) => s + t.hours, 0) });
  });
  app.get('/api/audit', (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Administrator access required');
    const rows = store.db.prepare('SELECT * FROM audit ORDER BY id').all();
    let previous = 'GENESIS',
      valid = true;
    for (const r of rows) {
      if (
        r.previous !== previous ||
        r.hash !==
          digest(JSON.stringify([r.time, r.actor, r.action, r.target, r.detail, r.previous]))
      )
        valid = false;
      previous = r.hash;
    }
    res.json({ valid, head: previous, rows: rows.slice(-1000).reverse() });
  });
  app.get('/api/documents/:id/export/:format', async (req, res) => {
    const doc = store.get('documents', req.params.id);
    if (!readable(req.user, 'documents', doc)) fail(403, 'Document is not accessible');
    const output =
      (await office.exportNative(doc, req.params.format, req.user)) ??
      (await exportDocument(doc, req.params.format));
    store.audit(req.user.id, 'export', doc.id, { format: req.params.format });
    res
      .type(output.mime)
      .attachment(`${doc.title.replace(/[^a-zA-Z0-9 _-]/g, '_')}.${req.params.format}`)
      .send(output.bytes);
  });
  app.post('/api/documents/import', upload.single('file'), async (req, res) => {
    if (!req.file) fail(400, 'Choose a file');
    ensureProject(req.user, req.body);
    const native = await office.importNative(req.file, req.user, req.body.projectId || '');
    if (native) return res.status(201).json(native);
    const imported = await safeImport(req.file);
    const data = schemas.documents.parse({
      ...imported,
      title: req.file.originalname.replace(/\.[^.]+$/, ''),
      projectId: req.body.projectId || '',
    });
    res.status(201).json(store.put('documents', data, req.user.id));
  });
  app.post('/api/files', upload.single('file'), (req, res) => {
    if (!req.file) fail(400, 'Choose a file');
    const data = {
      title: req.file.originalname.replace(/[\\/\r\n]/g, '_').slice(0, 200),
      projectId: req.body.projectId || '',
      folderId: req.body.folderId || '',
      size: req.file.size,
      mime: req.file.mimetype,
      sha256: digest(req.file.buffer),
    };
    validateRefs('files', data, req.user);
    const id = randomUUID();
    writeFileSync(path.join(uploadDir, id), req.file.buffer, { flag: 'wx' });
    try {
      res.status(201).json(store.put('files', data, req.user.id, id));
    } catch (e) {
      unlinkSync(path.join(uploadDir, id));
      throw e;
    }
  });
  app.get('/api/files/:id/download', (req, res) => {
    const f = store.get('files', req.params.id);
    if (!readable(req.user, 'files', f)) fail(403, 'File is not accessible');
    store.audit(req.user.id, 'download', f.id);
    const native = office.getAsset(f.id);
    if (native)
      return res
        .type('application/octet-stream')
        .attachment(f.title)
        .send(Buffer.from(native.bytes));
    res
      .set('X-Content-Type-Options', 'nosniff')
      .type('application/octet-stream')
      .download(path.join(uploadDir, f.id), f.title);
  });
  app.get('/api/files/:id/preview', (req, res) => {
    const f = store.get('files', req.params.id);
    if (!readable(req.user, 'files', f)) fail(403, 'File is not accessible');
    if (f.mime !== 'application/pdf') fail(400, 'Only PDF preview is supported');
    const native = office.getAsset(f.id);
    if (native) return res.type('application/pdf').send(Buffer.from(native.bytes));
    res.type('application/pdf').sendFile(path.join(uploadDir, f.id));
  });
  app.post('/api/files/:id/sign', async (req, res) => {
    const f = store.get('files', req.params.id);
    if (!readable(req.user, 'files', f)) fail(403, 'File is not accessible');
    if (!writable(req.user, 'files', f)) fail(403, 'Read-only file');
    if (f.mime !== 'application/pdf') fail(400, 'Choose a PDF');
    const { reason, mode } = z
      .object({
        reason: z.string().min(1).max(150),
        mode: z.enum(['acknowledgement', 'certificate']),
      })
      .parse(req.body);
    const nativePdf = office.getAsset(f.id);
    const originalBytes = nativePdf
      ? Buffer.from(nativePdf.bytes)
      : readFileSync(path.join(uploadDir, f.id));
    f.sha256 = digest(originalBytes);
    if (originalBytes.includes(Buffer.from('/ByteRange')))
      fail(
        409,
        'This PDF already contains a certificate signature. Incremental countersigning is not supported; the original must be preserved.',
      );
    const pdf = await PDFDocument.load(originalBytes),
      font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([595, 842]);
    page.drawText(
      mode === 'certificate' ? 'Certificate signature record' : 'Electronic acknowledgement',
      { x: 45, y: 760, size: 20, font },
    );
    const lines = [
      `Signer: ${req.user.name}`,
      `Email: ${req.user.email}`,
      `Date: ${new Date().toISOString()}`,
      `Reason: ${reason}`,
      `Source SHA-256:`,
      f.sha256,
      mode === 'certificate'
        ? 'Signed using the configured organization certificate.'
        : 'Typed acknowledgement. This is NOT a certificate-based digital signature.',
    ];
    lines.forEach((line, i) =>
      page.drawText(line.replace(/[^\x20-\x7E]/g, '?').slice(0, 100), {
        x: 45,
        y: 700 - i * 26,
        size: 10,
        font,
        color: rgb(0.15, 0.25, 0.2),
      }),
    );
    if (mode === 'certificate') {
      if (!process.env.PDF_P12_PATH)
        fail(503, 'Configure PDF_P12_PATH and PDF_P12_PASSPHRASE to use certificate signing');
      const { pdflibAddPlaceholder } = await import('@signpdf/placeholder-pdf-lib');
      pdflibAddPlaceholder({
        pdfDoc: pdf,
        reason,
        name: req.user.name,
        contactInfo: req.user.email,
        location: 'Reverse Office',
        signatureLength: 16384,
      });
    }
    let bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
    if (mode === 'certificate') {
      const { OpenSslSigner } = await import('./signing.js');
      const { SignPdf } = await import('@signpdf/signpdf');
      bytes = await new SignPdf().sign(bytes, new OpenSslSigner());
    }
    const id = randomUUID(),
      title = f.title.replace(/\.pdf$/i, '') + '-signed.pdf';
    writeFileSync(path.join(uploadDir, id), bytes);
    const result = store.put(
      'files',
      {
        title,
        projectId: f.projectId,
        folderId: f.folderId,
        size: bytes.length,
        mime: 'application/pdf',
        sha256: digest(bytes),
        signature: { mode, signer: req.user.id, source: f.id, sourceHash: f.sha256, reason },
      },
      req.user.id,
      id,
    );
    store.audit(req.user.id, 'pdf.sign', result.id, { mode, source: f.id, hash: result.sha256 });
    res.status(201).json(result);
  });
  installMailbox(app, { store, fail, uploadDir, ...mailOptions });
  app.get('/api/integrations', (req, res) =>
    res.json({
      ai: aiSettings.current().provider !== 'disabled',
      aiModel: aiSettings.publicConfig().model,
      smtp: !!process.env.SMTP_HOST,
      certificate: !!process.env.PDF_P12_PATH,
      storage: 'Local persistent volume',
      rtc: !!process.env.TURN_URL,
      spv: false,
      office: office.enabled,
    }),
  );
  installAISettings(app, aiSettings, store);
  installAssistant(app, {
    store,
    readable,
    visible,
    office,
    safeImport,
    fail,
    aiSettings,
    workforce,
  });
  app.get('/api/rtc-config', (req, res) =>
    res.json({
      iceServers: process.env.TURN_URL
        ? [
            {
              urls: process.env.TURN_URL,
              username: process.env.TURN_USERNAME,
              credential: process.env.TURN_PASSWORD,
            },
          ]
        : [],
    }),
  );
  // Optional deployment-specific extension; the Romania branch registers billing here.
  app.locals.extension = { store, session, readable, manager, fail };
  office.install(app, { readable, writable, ensureProject });
  app.locals.installFinalHandlers = () => {
    app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found' }));
    const dist = path.resolve('dist');
    if (existsSync(dist)) {
      app.use(
        express.static(dist, {
          setHeaders(res, file) {
            if (file.endsWith('.html')) res.set('Cache-Control', 'no-store');
          },
        }),
      );
      app.get('/{*path}', (req, res) =>
        res.set('Cache-Control', 'no-store').sendFile(path.join(dist, 'index.html')),
      );
    }
    app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);
      const status =
        error instanceof z.ZodError
          ? 400
          : error.code === 'LIMIT_FILE_SIZE'
            ? 413
            : error.status || 500;
      if (status === 500) console.error(error);
      res.status(status).json({
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
            : status === 500
              ? 'An unexpected server error occurred'
              : error.message,
      });
    });
  };
  return { app, store, setupKey, session, readable };
}
