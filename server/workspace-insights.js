// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { date, workingDays } from './domain.js';
export const compensationSchema = z.object({
  userId: z.string().max(100),
  projectId: z.string().max(100).default(''),
  effective: date,
  basis: z.enum(['hourly', 'monthly']).default('hourly'),
  amount: z.number().min(0).max(10000000),
  monthlyHours: z.number().min(1).max(744).default(160),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('EUR'),
  clientRate: z.number().min(0).max(1000000).nullable().default(null),
});
export function attendanceAlerts(store, workforce, user, until) {
  const org = workforce.organisation();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: org.timezone }).format(new Date());
  const end =
    until || new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  date.parse(end);
  if (end >= today) throw Object.assign(Error('Choose a completed day'), { status: 400 });
  const people = store
    .users()
    .filter(
      (u) =>
        u.active &&
        u.role !== 'guest' &&
        (u.id === user.id ||
          user.role === 'admin' ||
          (user.role === 'manager' && u.managerId === user.id)),
    );
  const times = store.all('timesheets'),
    leaves = store.all('leave'),
    calendars = store.all('calendars');
  const alerts = [];
  for (const u of people)
    for (let n = 0; n < 7; n++) {
      const day = new Date(Date.parse(end + 'T00:00:00Z') - n * 86400000)
        .toISOString()
        .slice(0, 10);
      if (day < u.created.slice(0, 10)) continue;
      const calendarId = workforce.employeeCalendar(u.id);
      if (
        !workingDays(day, day, calendars, calendarId) ||
        leaves.some(
          (l) => l.userId === u.id && l.status === 'Approved' && l.start <= day && l.end >= day,
        )
      )
        continue;
      const hours = times
        .filter((t) => t.userId === u.id && t.date === day && t.status !== 'Rejected')
        .reduce((a, t) => a + t.hours, 0);
      if (hours < org.hoursPerDay)
        alerts.push({
          id: `time:${u.id}:${day}`,
          userId: u.id,
          name: u.name,
          date: day,
          missing: org.hoursPerDay - hours,
          hours,
        });
    }
  return alerts;
}
export function costReport(store, month) {
  z.string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .parse(month);
  const rates = store.all('compensation'),
    people = store.users(),
    projects = store.all('projects');
  const rows = store
    .all('timesheets')
    .filter((t) => t.date.startsWith(month) && t.status !== 'Rejected')
    .map((t) => {
      const applicable = rates.filter(
        (r) =>
          r.userId === t.userId &&
          r.effective <= t.date &&
          (!r.projectId || r.projectId === t.projectId),
      );
      const rate = applicable.sort(
        (a, b) =>
          Number(!!b.projectId) - Number(!!a.projectId) ||
          b.effective.localeCompare(a.effective) ||
          b.updated.localeCompare(a.updated),
      )[0];
      const hourly = rate ? rate.amount / (rate.basis === 'monthly' ? rate.monthlyHours : 1) : null;
      return {
        id: t.id,
        date: t.date,
        userId: t.userId,
        name: people.find((u) => u.id === t.userId)?.name,
        projectId: t.projectId,
        project: projects.find((p) => p.id === t.projectId)?.title,
        hours: t.hours,
        status: t.status,
        currency: rate?.currency || null,
        hourly,
        cost: hourly === null ? null : Math.round(hourly * t.hours * 100) / 100,
        revenue:
          rate?.clientRate != null
            ? Math.round((t.billable ? t.hours : 0) * rate.clientRate * 100) / 100
            : null,
      };
    });
  return {
    month,
    rows,
    totals: [...new Set(rows.map((r) => r.currency).filter(Boolean))].map((currency) => {
      const group = rows.filter((r) => r.currency === currency);
      return {
        currency,
        cost: group.reduce((n, r) => n + r.cost, 0),
        revenue: group.reduce((n, r) => n + (r.revenue || 0), 0),
        unpricedRevenue: group.filter((r) => r.revenue === null).length,
      };
    }),
    missingRates: rows.filter((r) => r.cost === null).length,
  };
}
export function installInsights(app, { store, workforce, fail }) {
  const admin = (req) => {
    if (req.user.role !== 'admin') fail(403, 'Administrator access required for compensation');
  };
  app.get('/api/compensation', (req, res) => {
    admin(req);
    res.json(store.all('compensation'));
  });
  app.post('/api/compensation', (req, res) => {
    admin(req);
    const value = compensationSchema.parse(req.body);
    if (!store.users().some((u) => u.id === value.userId && u.active && u.role !== 'guest'))
      fail(400, 'Choose an active employee');
    if (value.projectId && !store.get('projects', value.projectId)?.members.includes(value.userId))
      fail(400, 'Add this employee to the project first');
    const id = `pay:${value.userId}:${value.projectId}:${value.effective}`,
      old = store.get('compensation', id);
    if (old && old.version !== req.body.version)
      fail(409, 'A rate exists for this effective date; reload before editing');
    res.status(201).json(store.put('compensation', value, req.user.id, id, old?.version));
  });
  app.get('/api/cost-report', (req, res) => {
    admin(req);
    res.json(costReport(store, String(req.query.month || '')));
  });
  app.get('/api/attendance-alerts', (req, res) =>
    res.json(
      attendanceAlerts(store, workforce, req.user, req.query.until && String(req.query.until)),
    ),
  );
}
