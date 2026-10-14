import { formattedMail } from '../server/mailbox.js';
import { PDFDocument } from 'pdf-lib';
import { attendanceAlerts } from '../server/workspace-insights.js';
import { initWorkforce } from '../server/workforce.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { createApp } from '../server/app.js';
let runtime,
  server,
  base,
  dir,
  admin,
  member,
  outsider,
  guest,
  project,
  smtpCalls = [],
  smtpFailure = false;
const password = 'Productivity-password-42!';
async function req(url, { who = admin, method = 'GET', body, raw = false, headers = {} } = {}) {
  const form = body instanceof FormData;
  const r = await fetch(base + '/api' + url, {
    method,
    headers: {
      ...(!form ? { 'Content-Type': 'application/json' } : {}),
      ...(who ? { cookie: who.cookie, 'x-csrf-token': who.csrf } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  return {
    status: r.status,
    data: raw ? Buffer.from(await r.arrayBuffer()) : await r.json(),
    response: r,
  };
}
before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'productivity-'));
  runtime = createApp({
    dataDir: dir,
    setupKey: 'productivity-test',
    test: true,
    mailOptions: {
      transportFactory: (options) => ({
        sendMail: async (mail) => {
          smtpCalls.push({ options, mail });
          if (smtpFailure) throw new Error('Test relay disconnect');
          return { messageId: 'smtp-test-id', accepted: mail.envelope.to, rejected: [] };
        },
        close() {},
      }),
    },
  });
  runtime.app.locals.installFinalHandlers();
  server = runtime.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
  const setup = await req('/setup', {
    who: null,
    method: 'POST',
    body: {
      key: 'productivity-test',
      name: 'Admin Product',
      email: 'admin@product.test',
      password,
    },
  });
  admin = { ...setup.data, cookie: setup.response.headers.get('set-cookie').split(';')[0] };
  async function person(name, role = 'member') {
    const u = runtime.store.addUser({
      name,
      email: name.toLowerCase() + '@product.test',
      password,
      role,
    });
    const l = await req('/login', {
      who: null,
      method: 'POST',
      body: { email: u.email, password },
    });
    return { ...l.data, cookie: l.response.headers.get('set-cookie').split(';')[0] };
  }
  member = await person('Member');
  outsider = await person('Outsider');
  guest = await person('Guest', 'guest');
  project = (
    await req('/entities/projects', {
      method: 'POST',
      body: {
        title: 'Delivery',
        client: 'Client',
        rate: 80,
        members: [admin.user.id, member.user.id],
      },
    })
  ).data;
});
after(async () => {
  delete process.env.SMTP_HOST;
  delete process.env.MAIL_INGRESS_SECRET;
  await new Promise((r) => server.close(r));
  runtime.store.close();
  rmSync(dir, { recursive: true, force: true });
});
test('activity logging separates work from full-day leave and rolls back mixed invalid batches', async () => {
  let r = await req('/work-log/batch', {
    who: member,
    method: 'POST',
    body: {
      entries: [
        { date: '2026-11-16', activity: 'Work from home', hours: 8, projectId: project.id },
      ],
    },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data[0].activity, 'Work from home');
  assert.equal(r.data[0].hours, 8);
  r = await req('/work-log/batch', {
    who: member,
    method: 'POST',
    body: { entries: [{ date: '2026-11-17', activity: 'Special occasion', hours: 8 }] },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data[0].kind, 'leave');
  assert.equal(r.data[0].status, 'Pending');
  assert.ok(!runtime.store.all('timesheets').some((t) => t.date === '2026-11-17'));
  const before = runtime.store.all('timesheets').length;
  r = await req('/work-log/batch', {
    who: member,
    method: 'POST',
    body: {
      entries: [
        { date: '2026-11-18', activity: 'Training', hours: 8, projectId: project.id },
        { date: '2026-11-19', activity: 'Other work', hours: 8, projectId: 'missing' },
      ],
    },
  });
  assert.equal(r.status, 403);
  assert.equal(runtime.store.all('timesheets').length, before);
  const cal = (await req('/work-calendar?start=2026-11-16&end=2026-11-20', { who: member })).data;
  assert.ok(
    cal.days.find((d) => d.date === '2026-11-17').leave.some((l) => l.type === 'Special occasion'),
  );
});
test('project team membership and task moves preserve authorization and version checks', async () => {
  const t = await req('/entities/tasks', {
    who: member,
    method: 'POST',
    body: {
      title: 'Implement feature',
      projectId: project.id,
      assignee: member.user.id,
      status: 'Backlog',
    },
  });
  assert.equal(t.status, 201);
  assert.equal(
    (
      await req('/entities/tasks/' + t.data.id, {
        who: outsider,
        method: 'PUT',
        body: { ...t.data, status: 'Done' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await req('/entities/tasks/' + t.data.id, {
        who: member,
        method: 'PUT',
        body: { ...t.data, status: 'In progress' },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await req('/entities/tasks/' + t.data.id, {
        who: member,
        method: 'PUT',
        body: { ...t.data, status: 'Done' },
      })
    ).status,
    409,
  );
});
test('file sharing isolates named guests, workspace readers and editing, then revokes downloads', async () => {
  const f = new FormData();
  f.append('file', new Blob(['confidential contents']), 'delivery.txt');
  const file = (await req('/files', { method: 'POST', body: f })).data;
  const route = '/drive/files/' + file.id + '/sharing';
  assert.equal((await req('/files/' + file.id + '/download', { who: member })).status, 403);
  assert.equal(
    (
      await req(route, {
        method: 'PUT',
        body: { mode: 'people', userIds: [member.user.id, guest.user.id], version: 0 },
      })
    ).status,
    200,
  );
  for (const who of [member, guest]) {
    assert.equal(
      (await req('/files/' + file.id + '/download', { who, raw: true })).data.toString(),
      'confidential contents',
    );
    assert.ok((await req('/drive/shared', { who })).data.some((f) => f.id === file.id));
  }
  assert.equal(
    (await req('/entities/files/' + file.id, { who: member, method: 'DELETE' })).status,
    403,
  );
  assert.equal(
    (
      await req(route, {
        who: member,
        method: 'PUT',
        body: { mode: 'workspace', userIds: [], version: 1 },
      })
    ).status,
    403,
  );
  assert.equal((await req('/files/' + file.id + '/download', { who: outsider })).status, 403);
  assert.equal(
    (await req(route, { method: 'PUT', body: { mode: 'workspace', userIds: [], version: 1 } }))
      .status,
    200,
  );
  assert.equal((await req('/files/' + file.id + '/download', { who: guest })).status, 403);
  assert.equal(
    (await req('/files/' + file.id + '/download', { who: outsider, raw: true })).status,
    200,
  );
  assert.equal(
    (await req(route, { method: 'PUT', body: { mode: 'private', userIds: [], version: 2 } }))
      .status,
    200,
  );
  assert.equal((await req('/files/' + file.id + '/download', { who: member })).status, 403);
  assert.equal(
    (await req(route, { method: 'PUT', body: { mode: 'project', userIds: [], version: 3 } }))
      .status,
    200,
  );
  assert.equal((await req(route)).data.version, 4);
  assert.equal(
    (await req(route, { method: 'PUT', body: { mode: 'workspace', userIds: [], version: 0 } }))
      .status,
    409,
  );
});
test('mail supports drafts, CC/BCC privacy, attachments and per-user trash', async () => {
  const f = new FormData();
  f.append('file', new Blob(['mail attachment']), 'note.txt');
  const a = (await req('/mail/attachments', { method: 'POST', body: f })).data;
  const draft = (
    await req('/mail/drafts', {
      method: 'POST',
      body: {
        to: member.user.email,
        bcc: outsider.user.email,
        subject: 'Proposal',
        body: '**Proposal** body',
        attachments: [a.id],
      },
    })
  ).data;
  assert.equal(draft.status, 'Draft');
  assert.ok(!(await req('/mail', { who: member })).data.some((m) => m.id === draft.id));
  const sent = await req('/mail', {
    method: 'POST',
    body: { ...draft, draftId: draft.id, version: draft.version },
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.data.status, 'Delivered internally');
  assert.equal(
    (
      await req('/mail', {
        method: 'POST',
        body: { ...draft, draftId: draft.id, version: draft.version },
      })
    ).status,
    403,
  );
  const recipient = (await req('/mail', { who: member })).data.find((m) => m.id === draft.id);
  assert.ok(recipient);
  assert.equal(recipient.bcc, undefined);
  assert.equal(recipient.recipientIds, undefined);
  assert.equal(recipient.recipientId, undefined);
  assert.ok((await req('/mail', { who: outsider })).data.some((m) => m.id === draft.id));
  assert.equal(
    (await req('/mail/attachments/' + a.id, { who: member, raw: true })).data.toString(),
    'mail attachment',
  );
  assert.equal(
    (
      await req('/mail/' + draft.id + '/state', {
        who: member,
        method: 'PATCH',
        body: { isRead: true, starred: true, trashed: true },
      })
    ).status,
    200,
  );
  assert.equal((await req('/mail')).data.find((m) => m.id === draft.id).trashed, false);
  assert.equal((await req('/mail', { who: guest })).status, 403);
});
test('SMTP sends real recipient envelopes and reports relay acceptance without claiming delivery', async () => {
  process.env.SMTP_HOST = 'relay.example.test';
  const result = await req('/mail', {
    method: 'POST',
    body: {
      to: 'client@outside.test',
      cc: member.user.email,
      bcc: 'hidden@outside.test',
      subject: 'SMTP proposal',
      body: 'Proposal contents',
    },
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.status, 'Accepted by SMTP');
  assert.deepEqual(smtpCalls[0].mail.envelope.to, ['client@outside.test', 'hidden@outside.test']);
  assert.equal(smtpCalls[0].options.requireTLS, true);
  const local = (await req('/mail', { who: member })).data.find((m) => m.id === result.data.id);
  assert.equal(local.smtpAccepted, undefined);
  assert.equal(local.bcc, undefined);
  delete process.env.SMTP_HOST;
});
test('incoming gateway authenticates, deduplicates deliveries and restricts received attachments', async () => {
  process.env.MAIL_INGRESS_SECRET = 'test-only-gateway-secret-not-for-production';
  const body = {
    deliveryId: 'provider-delivery-1',
    from: 'client@outside.test',
    to: [member.user.email],
    subject: 'Incoming reply',
    body: 'Received externally',
    attachments: [{ name: 'brief.txt', base64: Buffer.from('brief').toString('base64') }],
  };
  const timestamp = String(Date.now()),
    signature = createHmac('sha256', process.env.MAIL_INGRESS_SECRET)
      .update(timestamp + '.' + JSON.stringify(body))
      .digest('hex');
  assert.equal((await req('/mail-ingress', { who: null, method: 'POST', body })).status, 401);
  const headers = { 'x-mail-timestamp': timestamp, 'x-mail-signature': signature };
  const r = await req('/mail-ingress', { who: null, method: 'POST', body, headers });
  assert.equal(r.status, 201);
  assert.equal(
    (await req('/mail-ingress', { who: null, method: 'POST', body, headers })).data.duplicate,
    true,
  );
  assert.equal(
    (
      await req('/mail-ingress', {
        who: null,
        method: 'POST',
        body: { ...body, body: 'tampered' },
        headers,
      })
    ).status,
    401,
  );
  const m = (await req('/mail', { who: member })).data.find((m) => m.id === r.data.id);
  assert.equal(m.status, 'Received');
  assert.equal(m.isRead, false);
  assert.equal((await req('/mail/attachments/' + m.attachments[0], { who: outsider })).status, 403);
  assert.equal(
    (
      await req('/mail/attachments/' + m.attachments[0], { who: member, raw: true })
    ).data.toString(),
    'brief',
  );
});

test('SMTP failure preserves local delivery and an explicit uncertain external status', async () => {
  process.env.SMTP_HOST = 'relay.example.test';
  smtpFailure = true;
  try {
    const result = await req('/mail', {
      method: 'POST',
      body: {
        to: 'client@outside.test',
        cc: member.user.email,
        subject: 'Relay failure',
        body: 'Keep the local copy',
      },
    });
    assert.equal(result.status, 502);
    const sent = (await req('/mail')).data.find((m) => m.id === result.data.messageId);
    assert.equal(sent.status, 'SMTP failed or delivery uncertain');
    assert.match(sent.deliveryNote, /Local recipients received/);
    assert.ok((await req('/mail', { who: member })).data.some((m) => m.id === sent.id));
  } finally {
    smtpFailure = false;
    delete process.env.SMTP_HOST;
  }
});

test('remembered login lasts 30 days and logout revokes that session', async () => {
  const r = await req('/login', {
    who: null,
    method: 'POST',
    body: { email: admin.user.email, password, remember: true },
  });
  assert.equal(r.status, 200);
  assert.match(r.response.headers.get('set-cookie'), /Max-Age=2592000/);
  assert.match(r.response.headers.get('set-cookie'), /HttpOnly/);
  const who = { ...r.data, cookie: r.response.headers.get('set-cookie').split(';')[0] };
  assert.equal((await req('/me', { who })).status, 200);
  await req('/logout', { who, method: 'POST', body: {} });
  assert.equal((await req('/me', { who })).status, 401);
});
test('effective compensation is private and project overrides drive actual recorded-time costs', async () => {
  const value = {
    userId: member.user.id,
    effective: '2026-01-01',
    basis: 'monthly',
    amount: 6400,
    monthlyHours: 160,
    currency: 'EUR',
    clientRate: 90,
  };
  assert.equal(
    (await req('/compensation', { who: member, method: 'POST', body: value })).status,
    403,
  );
  const a = await req('/compensation', { method: 'POST', body: value });
  assert.equal(a.status, 201);
  const b = await req('/compensation', {
    method: 'POST',
    body: { ...value, projectId: project.id, effective: '2026-11-01', basis: 'hourly', amount: 55 },
  });
  assert.equal(b.status, 201);
  const report = await req('/cost-report?month=2026-11');
  assert.equal(report.status, 200);
  const row = report.data.rows.find((r) => r.userId === member.user.id);
  assert.equal(row.hourly, 55);
  assert.equal(row.cost, row.hours * 55);
  assert.equal((await req('/cost-report?month=2026-11', { who: member })).status, 403);
  assert.equal((await req('/entities/compensation', { who: member })).status, 404);
  assert.equal((await req('/state', { who: member })).data.compensation, undefined);
  assert.equal((await req('/compensation', { method: 'POST', body: value })).status, 409);
});
test('attendance reminders exclude approved leave and weekends and never expose unrelated employees', () => {
  const workforce = initWorkforce(runtime.store);
  runtime.store.db
    .prepare('UPDATE users SET created=? WHERE id=?')
    .run('2020-01-01T00:00:00Z', member.user.id);
  const before = attendanceAlerts(runtime.store, workforce, member.user, '2026-10-09');
  assert.ok(before.length > 0);
  assert.ok(before.every((a) => a.userId === member.user.id));
  runtime.store.put(
    'leave',
    {
      userId: member.user.id,
      start: '2026-10-09',
      end: '2026-10-09',
      calendarId: 'default',
      status: 'Approved',
      type: 'Annual',
    },
    admin.user.id,
  );
  const after = attendanceAlerts(runtime.store, workforce, member.user, '2026-10-09');
  assert.ok(!after.some((a) => a.date === '2026-10-09'));
  assert.ok(!after.some((a) => [0, 6].includes(new Date(a.date + 'T00:00:00Z').getUTCDay())));
});
test('independent PDF edits preserve source bytes, rotate copies and enforce ownership', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  pdf.addPage([300, 400]);
  const source = await pdf.save();
  const form = new FormData();
  form.append('file', new Blob([source], { type: 'application/pdf' }), 'original.pdf');
  const file = (await req('/files', { method: 'POST', body: form })).data;
  assert.equal((await req('/files/' + file.id + '/pdf-info')).data.pages.length, 2);
  const edited = await req('/files/' + file.id + '/pdf-edit', {
    method: 'POST',
    body: { page: 1, action: 'rotate' },
  });
  assert.equal(edited.status, 201);
  assert.notEqual(edited.data.id, file.id);
  const copy = await PDFDocument.load(
    (await req('/files/' + edited.data.id + '/download', { raw: true })).data,
  );
  assert.equal(copy.getPage(0).getRotation().angle, 90);
  assert.deepEqual(
    (await req('/files/' + file.id + '/download', { raw: true })).data,
    Buffer.from(source),
  );
  assert.equal(
    (
      await req('/files/' + file.id + '/pdf-edit', {
        who: member,
        method: 'POST',
        body: { page: 1, action: 'remove' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await req('/files/' + file.id + '/pdf-edit', {
        method: 'POST',
        body: { page: 99, action: 'rotate' },
      })
    ).status,
    400,
  );
});

test('forwarded mail attachments are copied under the forwarding user and isolated until sent', async () => {
  const message = (await req('/mail', { who: member })).data.find(
    (m) => m.attachments?.length && m.status !== 'Draft' && !m.incoming,
  );
  assert.ok(message);
  const forward = await req('/mail/' + message.id + '/forward-attachments', {
    who: member,
    method: 'POST',
    body: {},
  });
  assert.equal(forward.status, 201);
  assert.equal(forward.data.length, 1);
  assert.notEqual(forward.data[0].id, message.attachments[0]);
  assert.equal((await req('/mail/attachments/' + forward.data[0].id)).status, 403);
  const sent = await req('/mail', {
    who: member,
    method: 'POST',
    body: {
      to: admin.user.email,
      subject: 'Forwarded proposal',
      body: 'Review the attachment',
      attachments: [forward.data[0].id],
    },
  });
  assert.equal(sent.status, 201);
  assert.equal(
    (await req('/mail/attachments/' + forward.data[0].id, { raw: true })).data.toString(),
    'mail attachment',
  );
});
test('external email formatting escapes markup and only introduces safe text formatting', () => {
  const html = formattedMail('**Hello** <script>alert(1)</script> *team* `code`');
  assert.match(html, /<strong>Hello<\/strong>/);
  assert.match(html, /&lt;script&gt;/);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /<em>team<\/em>/);
});
