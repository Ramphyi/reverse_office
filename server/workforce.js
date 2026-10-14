import { z } from 'zod';
import { date, schemas, workingDays } from './domain.js';
import { hashPassword, verifyPassword } from './store.js';

const fail = (status, message) => {
  throw Object.assign(Error(message), { status });
};
const manager = (u) => ['admin', 'manager'].includes(u.role);
const settingsSchema = z.object({
  name: z.string().trim().min(2).max(100),
  calendarId: z.string().trim().min(1).max(100),
  hoursPerDay: z.number().min(1).max(24),
  timezone: z
    .string()
    .max(100)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, 'Invalid timezone'),
  annualLeaveDays: z.number().int().min(0).max(366),
  carryLimit: z.number().int().min(0).max(366),
});
export function initWorkforce(store) {
  store.db.exec(
    'CREATE TABLE IF NOT EXISTS organisation (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, version INTEGER NOT NULL)',
  );
  const organisation = () => {
    const row = store.db.prepare('SELECT * FROM organisation WHERE id=1').get();
    return row
      ? { ...JSON.parse(row.data), version: row.version }
      : {
          name: 'My workspace',
          calendarId: 'default',
          hoursPerDay: 8,
          timezone: 'Europe/Bucharest',
          annualLeaveDays: 21,
          carryLimit: 5,
          version: 0,
        };
  };
  const employeeCalendar = (id) =>
    store.db.prepare('SELECT calendar_id FROM users WHERE id=?').get(id)?.calendar_id ||
    organisation().calendarId;
  const offOn = (l, day, calendars = store.all('calendars')) =>
    l.start <= day && l.end >= day && workingDays(day, day, calendars, l.calendarId) > 0;
  function checkTime(data, user, old) {
    if (
      store
        .all('leave')
        .some((l) => l.userId === user.id && l.status === 'Approved' && offOn(l, data.date))
    )
      fail(
        409,
        'Approved time off covers this day. Ask a manager to cancel the leave before logging work.',
      );
    data.calendarId =
      store.get('projects', data.projectId)?.calendarId || employeeCalendar(user.id);
  }
  function checkLeave(data, user, old) {
    data.calendarId ||= employeeCalendar(user.id);
    const allowed = new Set([
      employeeCalendar(user.id),
      ...store
        .all('projects')
        .filter((p) => manager(user) || p.members.includes(user.id))
        .map((p) => p.calendarId),
    ]);
    if (!allowed.has(data.calendarId))
      fail(403, 'Choose your assigned calendar or a project calendar');
    if (
      store
        .all('timesheets')
        .some((t) => t.userId === user.id && t.status !== 'Rejected' && offOn(data, t.date))
    )
      fail(
        409,
        'This leave overlaps recorded work. Correct the time entries or choose different dates.',
      );
  }
  function checkApproval(kind, old) {
    if (kind === 'timesheets') checkTime(old, { id: old.userId });
    else if (
      store
        .all('timesheets')
        .some((t) => t.userId === old.userId && t.status !== 'Rejected' && offOn(old, t.date))
    )
      fail(409, 'Recorded work overlaps this leave. Resolve the entries before approving.');
  }
  function install(app, { validateRefs, credentialLimit }) {
    app.get('/api/organisation', (req, res) => res.json(organisation()));
    app.put('/api/organisation', (req, res) => {
      if (req.user.role !== 'admin') fail(403, 'Administrator access required');
      const data = settingsSchema.parse(req.body),
        old = organisation();
      if (req.body.version !== old.version)
        fail(409, 'Organisation changed. Refresh before saving.');
      if (!store.all('calendars').some((c) => c.calendarId === data.calendarId))
        fail(400, 'Create the yearly calendar first');
      store.transaction(() => {
        store.db
          .prepare(
            'INSERT INTO organisation VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version',
          )
          .run(JSON.stringify(data), old.version + 1);
        store.audit(req.user.id, 'organisation.update', 'workspace', data);
      });
      res.json(organisation());
    });
    app.patch('/api/profile', (req, res) => {
      const data = z.object({ name: z.string().trim().min(2).max(100) }).parse(req.body);
      store.transaction(() => {
        store.db.prepare('UPDATE users SET name=? WHERE id=?').run(data.name, req.user.id);
        store.audit(req.user.id, 'profile.update', req.user.id);
      });
      res.json({ ok: true });
    });
    app.post('/api/users/:id/reset-password', credentialLimit, (req, res) => {
      if (req.user.role !== 'admin') fail(403, 'Administrator access required');
      if (req.params.id === req.user.id) fail(400, 'Use Change password for your own account');
      const data = z
        .object({ current: z.string().max(200), password: z.string().min(12).max(200) })
        .parse(req.body);
      if (!verifyPassword(data.current, req.user.password))
        fail(403, 'Your administrator password is incorrect');
      if (!store.users().some((u) => u.id === req.params.id)) fail(404, 'Account not found');
      store.transaction(() => {
        store.db
          .prepare('UPDATE users SET password=?,must_change_password=1 WHERE id=?')
          .run(hashPassword(data.password), req.params.id);
        store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.params.id);
        store.audit(req.user.id, 'account.password-reset', req.params.id);
      });
      for (const socket of app.locals.io?.sockets.sockets.values() ?? [])
        if (socket.data.user.id === req.params.id) socket.disconnect(true);
      res.json({ ok: true });
    });
    app.get('/api/work-calendar', (req, res) => {
      const start = date.parse(req.query.start),
        end = date.parse(req.query.end),
        userId = String(req.query.userId || req.user.id);
      if (end < start || (Date.parse(end) - Date.parse(start)) / 86400000 > 92)
        fail(400, 'Choose at most 93 calendar days');
      if (userId !== req.user.id && !manager(req.user)) fail(403, 'Manager access required');
      if (!store.users().some((u) => u.id === userId)) fail(404, 'Employee not found');
      const project = req.query.projectId
        ? store.get('projects', String(req.query.projectId))
        : null;
      if (
        req.query.projectId &&
        (!project || (!manager(req.user) && !project.members.includes(userId)))
      )
        fail(403, 'Project is not accessible');
      const calendarId = project?.calendarId || employeeCalendar(userId),
        org = organisation(),
        days = [];
      const calendars = store.all('calendars'),
        timesheets = store.all('timesheets').filter((t) => t.userId === userId),
        leaves = store.all('leave').filter((l) => l.userId === userId && l.status !== 'Rejected');
      for (
        let d = new Date(start + 'T00:00:00Z');
        d <= new Date(end + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        const day = d.toISOString().slice(0, 10),
          cal = calendars.find((c) => c.calendarId === calendarId && c.year === d.getUTCFullYear());
        const entries = timesheets
          .filter(
            (t) =>
              t.userId === userId && t.date === day && (!project || t.projectId === project.id),
          )
          .map(({ billingSnapshot, ...t }) => t);
        const leave = leaves.filter((l) => offOn(l, day, calendars));
        const holiday = !!cal?.holidays.includes(day),
          weekend = (cal?.weekend ?? [0, 6]).includes(d.getUTCDay());
        const hours = entries
            .filter((t) => t.status !== 'Rejected')
            .reduce((n, t) => n + t.hours, 0),
          capacity =
            holiday || weekend || leave.some((l) => l.status === 'Approved') ? 0 : org.hoursPerDay;
        days.push({
          date: day,
          holiday,
          weekend,
          calendarConfigured: !!cal,
          entries,
          leave,
          hours,
          capacity,
          remaining: Math.max(0, capacity - hours),
        });
      }
      res.json({ userId, calendarId, organisation: org.name, days });
    });
    app.post('/api/timesheets/batch', (req, res) => {
      const { entries } = z
        .object({ entries: z.array(schemas.timesheets).min(1).max(31) })
        .parse(req.body);
      const result = store.transaction(() =>
        entries.map((data) => {
          validateRefs('timesheets', data, req.user);
          return store.put('timesheets', data, req.user.id);
        }),
      );
      res.status(201).json(result);
    });
    app.post('/api/leave/:id/cancel', (req, res) => {
      const old = store.get('leave', req.params.id);
      if (!old || (!manager(req.user) && old.userId !== req.user.id))
        fail(403, 'Leave is not accessible');
      if (old.status === 'Approved' && !manager(req.user))
        fail(403, 'A manager must cancel approved leave');
      if (!['Pending', 'Approved'].includes(old.status)) fail(409, 'Leave is already closed');
      const { reason } = z.object({ reason: z.string().trim().min(3).max(1000) }).parse(req.body);
      const { id, owner, version, created, updated, ...data } = old;
      res.json(
        store.put(
          'leave',
          { ...data, status: 'Rejected', cancellationReason: reason, cancelledBy: req.user.id },
          req.user.id,
          id,
          req.body.version,
        ),
      );
    });
  }
  return { organisation, employeeCalendar, checkTime, checkLeave, checkApproval, install };
}
