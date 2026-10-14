import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';

async function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'workforce-')),
    runtime = createApp({ dataDir: dir, setupKey: 'workforce-key', test: true });
  runtime.app.locals.installFinalHandlers();
  const server = runtime.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    runtime.store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let admin;
  async function call(url, method = 'GET', body, auth = admin) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api` + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Cookie: auth.cookie, 'x-csrf-token': auth.csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    return {
      status: response.status,
      data,
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const setup = await call(
    '/setup',
    'POST',
    {
      key: 'workforce-key',
      name: 'Work Admin',
      email: 'admin@work.test',
      password: 'Administrator-pass-42!',
    },
    null,
  );
  assert.equal(setup.status, 201);
  admin = { ...setup.data, cookie: setup.cookie };
  const project = (await call('/state')).data.projects[0];
  return {
    call,
    admin,
    project,
    store: runtime.store,
    async member(options = {}) {
      const created = await call('/users', 'POST', {
        name: 'Team Member',
        email: 'member@work.test',
        password: 'Temporary-member-42!',
        role: 'member',
        projectIds: [project.id],
        ...options,
      });
      assert.equal(created.status, 201, JSON.stringify(created.data));
      const login = await call(
        '/login',
        'POST',
        { email: 'member@work.test', password: 'Temporary-member-42!' },
        null,
      );
      return { id: created.data.id, ...login.data, cookie: login.cookie };
    },
  };
}
test('temporary accounts are gated; password rotation revokes old sessions and unlocks ordinary members', async (t) => {
  const { call, member } = await fixture(t),
    u = await member({
      mustChangePassword: true,
      department: 'Engineering',
      allowance: 24,
      allowanceYear: 2026,
    });
  assert.equal(u.user.mustChangePassword, true);
  assert.equal((await call('/state', 'GET', undefined, u)).status, 403);
  assert.equal((await call('/organisation', 'GET', undefined, u)).status, 403);
  assert.equal(
    (await call('/password', 'POST', { current: 'wrong', password: 'Personal-member-2026!' }, u))
      .status,
    400,
  );
  assert.equal(
    (
      await call(
        '/password',
        'POST',
        { current: 'Temporary-member-42!', password: 'Temporary-member-42!' },
        u,
      )
    ).status,
    400,
  );
  const rotated = await call(
    '/password',
    'POST',
    { current: 'Temporary-member-42!', password: 'Personal-member-2026!' },
    u,
  );
  assert.equal(rotated.status, 200);
  assert.equal(rotated.data.user.mustChangePassword, false);
  assert.equal((await call('/me', 'GET', undefined, u)).status, 401);
  const auth = { ...rotated.data, cookie: rotated.cookie };
  assert.equal((await call('/state', 'GET', undefined, auth)).status, 200);
  assert.equal((await call('/profile', 'PATCH', { name: 'Updated Member' }, auth)).status, 200);
  assert.equal((await call('/me', 'GET', undefined, auth)).data.user.name, 'Updated Member');
  assert.equal((await call('/users', 'POST', { name: 'No privilege' }, auth)).status, 403);
});
test('organisation settings use administrator authority and version checks; onboarding sets membership and allowance atomically', async (t) => {
  const { call, member, project } = await fixture(t),
    org = (await call('/organisation')).data;
  const changed = await call('/organisation', 'PUT', {
    ...org,
    name: 'Example Organisation',
    hoursPerDay: 7.5,
  });
  assert.equal(changed.status, 200);
  assert.equal((await call('/organisation', 'PUT', { ...org, name: 'Stale' })).status, 409);
  const u = await member({
    department: 'Design',
    calendarId: 'default',
    allowance: 23,
    allowanceYear: 2027,
  });
  const state = (await call('/state', 'GET', undefined, u)).data;
  assert.ok(state.projects.some((p) => p.id === project.id));
  assert.equal(state.entitlements.find((e) => e.year === 2027).days, 23);
  assert.equal((await call('/organisation', 'PUT', changed.data, u)).status, 403);
  assert.equal(
    (
      await call('/users', 'POST', {
        name: 'Bad Project',
        email: 'bad@work.test',
        password: 'Temporary-member-42!',
        projectIds: ['missing'],
      })
    ).status,
    400,
  );
  assert.equal(
    (await call('/users')).data.some((u) => u.email === 'bad@work.test'),
    false,
  );
});
test('admin reset requires current admin password, revokes sessions and forces replacement; self-demotion is refused', async (t) => {
  const { call, member, admin } = await fixture(t),
    u = await member();
  assert.equal(
    (
      await call(`/users/${u.id}/reset-password`, 'POST', {
        current: 'wrong',
        password: 'Another-temporary-42!',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(`/users/${u.id}/reset-password`, 'POST', {
        current: 'Administrator-pass-42!',
        password: 'Another-temporary-42!',
      })
    ).status,
    200,
  );
  assert.equal((await call('/state', 'GET', undefined, u)).status, 401);
  const login = await call(
    '/login',
    'POST',
    { email: 'member@work.test', password: 'Another-temporary-42!' },
    null,
  );
  assert.equal(login.data.user.mustChangePassword, true);
  assert.equal(
    (await call(`/users/${admin.user.id}`, 'PATCH', { active: false, role: 'member' })).status,
    400,
  );
  const audit = (await call('/audit')).data;
  assert.equal(audit.valid, true);
  assert.ok(audit.rows.some((r) => r.action === 'account.password-reset'));
  assert.ok(!JSON.stringify(audit).includes('Another-temporary-42!'));
});
test('shared calendar respects cross-year holidays and approved leave, rejects work conflicts and allows audited cancellation', async (t) => {
  const { call, member, project } = await fixture(t),
    u = await member();
  for (const year of [2026, 2027]) {
    const state = (await call('/state')).data;
    const old = state.calendars.find((c) => c.calendarId === 'default' && c.year === year);
    assert.equal(
      (
        await call('/entities/calendars' + (old ? '/' + old.id : ''), old ? 'PUT' : 'POST', {
          ...old,
          title: 'Company ' + year,
          calendarId: 'default',
          year,
          weekend: [0, 6],
          holidays: [`${year}-12-25`, `${year}-01-01`],
        })
      ).status,
      old ? 200 : 201,
    );
    await call('/entities/entitlements', 'POST', {
      userId: u.id,
      year,
      days: 25,
      calendarId: 'default',
      carryLimit: 5,
    });
  }
  const leave = await call(
    '/entities/leave',
    'POST',
    { start: '2026-12-31', end: '2027-01-04', type: 'Annual', calendarId: 'default' },
    u,
  );
  assert.equal(leave.status, 201);
  const pending = (
    await call('/work-calendar?start=2026-12-31&end=2027-01-04', 'GET', undefined, u)
  ).data;
  assert.equal(pending.days[0].capacity, 8);
  assert.equal(pending.days[0].leave[0].status, 'Pending');
  const approved = await call(`/approve/leave/${leave.data.id}`, 'POST', {
    version: leave.data.version,
    status: 'Approved',
  });
  assert.equal(approved.status, 200);
  const days = (await call('/work-calendar?start=2026-12-31&end=2027-01-04', 'GET', undefined, u))
    .data.days;
  assert.equal(days[0].capacity, 0);
  assert.equal(days[1].holiday, true);
  assert.equal(days[2].weekend, true);
  assert.equal(days[4].capacity, 0);
  assert.equal(
    (
      await call(
        '/entities/timesheets',
        'POST',
        { projectId: project.id, date: '2027-01-04', hours: 2, description: 'Conflict' },
        u,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        `/leave/${leave.data.id}/cancel`,
        'POST',
        { version: approved.data.version, reason: 'Changed travel' },
        u,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(`/leave/${leave.data.id}/cancel`, 'POST', {
        version: approved.data.version,
        reason: 'Changed travel',
      })
    ).status,
    200,
  );
  assert.equal(
    (await call('/work-calendar?start=2027-01-04&end=2027-01-04', 'GET', undefined, u)).data.days[0]
      .capacity,
    8,
  );
  assert.equal(
    (
      await call(
        '/entities/timesheets',
        'POST',
        { projectId: project.id, date: '2027-01-04', hours: 2, description: 'Resumed work' },
        u,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await call(
        '/entities/leave',
        'POST',
        { start: '2027-01-04', end: '2027-01-04', type: 'Sick' },
        u,
      )
    ).status,
    409,
  );
});
test('weekly batches are atomic and obey daily limits, ownership and calendar privacy', async (t) => {
  const { call, member, project, admin } = await fixture(t),
    u = await member();
  const entry = {
    projectId: project.id,
    date: '2027-02-08',
    hours: 8,
    description: 'Delivery',
    userId: admin.user.id,
  };
  const success = await call(
    '/timesheets/batch',
    'POST',
    { entries: [entry, { ...entry, date: '2027-02-09' }] },
    u,
  );
  assert.equal(success.status, 201);
  assert.ok(success.data.every((t) => t.userId === u.id));
  const failed = await call(
    '/timesheets/batch',
    'POST',
    {
      entries: [
        { ...entry, date: '2027-02-10' },
        { ...entry, hours: 20 },
      ],
    },
    u,
  );
  assert.equal(failed.status, 400);
  const state = (await call('/state', 'GET', undefined, u)).data;
  assert.equal(state.timesheets.length, 2);
  assert.equal(
    (
      await call(
        `/work-calendar?start=2027-02-08&end=2027-02-10&userId=${admin.user.id}`,
        'GET',
        undefined,
        u,
      )
    ).status,
    403,
  );
  assert.equal(
    (await call('/work-calendar?start=2027-01-01&end=2027-12-31', 'GET', undefined, u)).status,
    400,
  );
  assert.equal(
    (await call('/work-calendar?start=2027-02-08&end=2027-02-09', 'GET', undefined, u)).data.days[0]
      .hours,
    8,
  );
});
test('approval rechecks work conflicts and employee calendar assignment is honoured', async (t) => {
  const { call, member, project } = await fixture(t);
  await call('/entities/calendars', 'POST', {
    title: 'Client holidays',
    calendarId: 'client',
    year: 2027,
    holidays: ['2027-03-15'],
    weekend: [5, 6],
  });
  const u = await member({ calendarId: 'client' });
  const view = await call('/work-calendar?start=2027-03-12&end=2027-03-15', 'GET', undefined, u);
  assert.equal(view.data.calendarId, 'client');
  assert.equal(view.data.days[0].weekend, true);
  assert.equal(view.data.days[2].weekend, false);
  assert.equal(view.data.days[3].holiday, true);
  const l = await call(
    '/entities/leave',
    'POST',
    { start: '2027-03-16', end: '2027-03-16', calendarId: 'client', type: 'Sick' },
    u,
  );
  assert.equal(l.status, 201);
  const logged = await call(
    '/entities/timesheets',
    'POST',
    {
      projectId: project.id,
      date: '2027-03-16',
      hours: 1,
      description: 'Pending leave work',
      status: 'Submitted',
    },
    u,
  );
  assert.equal(logged.status, 201);
  assert.equal(
    (
      await call(`/approve/leave/${l.data.id}`, 'POST', {
        status: 'Approved',
        version: l.data.version,
      })
    ).status,
    409,
  );
});
