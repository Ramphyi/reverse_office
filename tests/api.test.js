import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { PDFDocument } from 'pdf-lib';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
let runtime, server, base, dir, admin, member, outsider, project;
const password = 'A-strong-test-password-42!';
async function request(url, { auth = admin, method = 'GET', body, csrf = true, raw = false } = {}) {
  const form = body instanceof FormData;
  const response = await fetch(base + '/api' + url, {
    method,
    headers: {
      ...(form ? {} : { 'Content-Type': 'application/json' }),
      ...(auth ? { Cookie: auth.cookie, ...(csrf ? { 'x-csrf-token': auth.csrf } : {}) } : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  const data = raw ? Buffer.from(await response.arrayBuffer()) : await response.json();
  return { status: response.status, data, response };
}
async function login(email) {
  const r = await request('/login', { auth: null, method: 'POST', body: { email, password } });
  assert.equal(r.status, 200);
  return { ...r.data, cookie: r.response.headers.get('set-cookie').split(';')[0] };
}
before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'reverse-office-tests-'));
  runtime = createApp({ dataDir: dir, setupKey: 'test-key', test: true });
  runtime.app.locals.installFinalHandlers();
  server = runtime.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const setup = await request('/setup', {
    auth: null,
    method: 'POST',
    body: { name: 'Admin Test', email: 'admin@example.test', password, key: 'test-key' },
  });
  assert.equal(setup.status, 201);
  admin = { ...setup.data, cookie: setup.response.headers.get('set-cookie').split(';')[0] };
  for (const [name, email] of [
    ['Member Test', 'member@example.test'],
    ['Outsider Test', 'outside@example.test'],
  ]) {
    const r = await request('/users', {
      method: 'POST',
      body: { name, email, password, role: 'member' },
    });
    assert.equal(r.status, 201);
  }
  member = await login('member@example.test');
  outsider = await login('outside@example.test');
  const r = await request('/entities/projects', {
    method: 'POST',
    body: {
      title: 'Client project',
      client: 'ACME',
      po: 'PO-100',
      rate: 100,
      currency: 'EUR',
      budgetHours: 100,
      members: [admin.user.id, member.user.id],
    },
  });
  assert.equal(r.status, 201);
  project = r.data;
});
after(async () => {
  await new Promise((r) => server.close(r));
  runtime.store.close();
  rmSync(dir, { recursive: true, force: true });
});
test('setup is single use; authentication, CSRF and roles are enforced', async () => {
  assert.equal((await request('/setup', { method: 'POST', body: {} })).status, 409);
  assert.equal((await request('/state', { auth: null })).status, 401);
  assert.equal(
    (
      await request('/entities/tasks', {
        auth: member,
        method: 'POST',
        csrf: false,
        body: { title: 'x' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/users', {
        auth: member,
        method: 'POST',
        body: { name: 'Hacker', email: 'x@test.com', password, role: 'admin' },
      })
    ).status,
    403,
  );
  assert.equal((await request('/audit', { auth: member })).status, 403);
  assert.equal((await request('/reports', { auth: member })).status, 403);
});
test('project membership isolates documents and confidential hourly rates', async () => {
  const created = await request('/entities/documents', {
    method: 'POST',
    body: {
      title: 'Secret brief',
      projectId: project.id,
      kind: 'doc',
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Private project contents' }] },
        ],
      },
    },
  });
  assert.equal(created.status, 201);
  const allowed = await request('/state', { auth: member });
  assert.ok(allowed.data.documents.some((d) => d.id === created.data.id));
  assert.equal(allowed.data.projects.find((p) => p.id === project.id).rate, undefined);
  const denied = await request('/state', { auth: outsider });
  assert.ok(!denied.data.documents.some((d) => d.id === created.data.id));
  assert.equal(
    (await request(`/documents/${created.data.id}/export/docx`, { auth: outsider })).status,
    403,
  );
  assert.equal(
    (
      await request('/entities/tasks', {
        auth: outsider,
        method: 'POST',
        body: { title: 'Cross project task', projectId: project.id },
      })
    ).status,
    403,
  );
});
test('document writes detect conflicting versions and exports are actual OOXML/PDF files', async () => {
  const r = await request('/entities/documents', {
    auth: member,
    method: 'POST',
    body: {
      title: 'Export proof',
      kind: 'doc',
      projectId: project.id,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Export verification' }] }],
      },
    },
  });
  const doc = r.data;
  assert.equal(
    (
      await request(`/entities/documents/${doc.id}`, {
        auth: member,
        method: 'PUT',
        body: { ...doc, title: 'Updated' },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/entities/documents/${doc.id}`, {
        auth: member,
        method: 'PUT',
        body: { ...doc, title: 'Stale' },
      })
    ).status,
    409,
  );
  const word = await request(`/documents/${doc.id}/export/docx`, { auth: member, raw: true });
  assert.equal(word.status, 200);
  assert.match(
    await (await JSZip.loadAsync(word.data)).file('word/document.xml').async('string'),
    /Export verification/,
  );
  const pdf = await request(`/documents/${doc.id}/export/pdf`, { auth: member, raw: true });
  assert.equal((await PDFDocument.load(pdf.data)).getPageCount(), 1);
  const state = (await request('/state')).data;
  const sheet = state.documents.find((d) => d.kind === 'sheet'),
    slides = state.documents.find((d) => d.kind === 'slides');
  const xlsx = await request(`/documents/${sheet.id}/export/xlsx`, { raw: true });
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(xlsx.data);
  assert.equal(book.worksheets[0].getCell('D6').result, 16320);
  const pptx = await request(`/documents/${slides.id}/export/pptx`, { raw: true });
  assert.equal(pptx.data.subarray(0, 2).toString(), 'PK');
  assert.ok(pptx.data.length > 10000);
});
test('time workflow enforces daily totals, locking, separation of duties and reports', async () => {
  const entry = (
    await request('/entities/timesheets', {
      auth: member,
      method: 'POST',
      body: {
        projectId: project.id,
        date: '2026-10-13',
        hours: 8,
        description: 'Build workspace',
        status: 'Submitted',
      },
    })
  ).data;
  assert.ok(entry.id);
  assert.equal(
    (
      await request('/entities/timesheets', {
        auth: member,
        method: 'POST',
        body: { projectId: project.id, date: '2026-10-13', hours: 20, description: 'Overflow' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/entities/timesheets/${entry.id}`, {
        auth: member,
        method: 'PUT',
        body: { ...entry, hours: 1 },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/approve/timesheets/${entry.id}`, {
        auth: member,
        method: 'POST',
        body: { status: 'Approved', version: entry.version },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/approve/timesheets/${entry.id}`, {
        method: 'POST',
        body: { status: 'Approved', version: entry.version },
      })
    ).status,
    200,
  );
  const report = await request('/reports?start=2026-10-01&end=2026-10-31');
  assert.equal(report.data.totals.EUR, 800);
  assert.equal(report.data.hours, 8);
  const own = (
    await request('/entities/timesheets', {
      method: 'POST',
      body: {
        projectId: project.id,
        date: '2026-10-14',
        hours: 1,
        description: 'Admin entry',
        status: 'Submitted',
      },
    })
  ).data;
  assert.equal(
    (
      await request(`/approve/timesheets/${own.id}`, {
        method: 'POST',
        body: { status: 'Approved', version: own.version },
      })
    ).status,
    403,
  );
});
test('leave validates cross-year entitlements, overlap, holidays and approval balance', async () => {
  for (const year of [2026, 2027]) {
    assert.equal(
      (
        await request('/entities/entitlements', {
          method: 'POST',
          body: { userId: member.user.id, year, days: 21, carryLimit: 5 },
        })
      ).status,
      201,
    );
  }
  const requestLeave = await request('/entities/leave', {
    auth: member,
    method: 'POST',
    body: { start: '2026-12-30', end: '2027-01-04', type: 'Annual', reason: 'New year' },
  });
  assert.equal(requestLeave.status, 201);
  assert.equal(
    (
      await request('/entities/leave', {
        auth: member,
        method: 'POST',
        body: { start: '2027-01-02', end: '2027-01-05', type: 'Annual' },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/approve/leave/${requestLeave.data.id}`, {
        method: 'POST',
        body: { status: 'Approved', version: 1 },
      })
    ).status,
    200,
  );
  const b = await request('/leave-balance?year=2027', { auth: member });
  assert.equal(b.data.used, 2);
  assert.equal(b.data.carry, 5);
  assert.equal(b.data.remaining, 24);
  const long = (
    await request('/entities/leave', {
      auth: member,
      method: 'POST',
      body: { start: '2027-02-01', end: '2027-04-01', type: 'Annual' },
    })
  ).data;
  assert.equal(
    (
      await request(`/approve/leave/${long.id}`, {
        method: 'POST',
        body: { status: 'Approved', version: 1 },
      })
    ).status,
    409,
  );
});
test('file ACL, signed PDF copies and provenance hashes are persisted', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const source = Buffer.from(await pdf.save());
  const form = new FormData();
  form.append('file', new Blob([source], { type: 'application/pdf' }), 'agreement.pdf');
  form.append('projectId', project.id);
  const result = await request('/files', { auth: member, method: 'POST', body: form });
  assert.equal(result.status, 201);
  assert.equal(
    (await request(`/files/${result.data.id}/download`, { auth: outsider })).status,
    403,
  );
  const sign = await request(`/files/${result.data.id}/sign`, {
    auth: member,
    method: 'POST',
    body: { mode: 'acknowledgement', reason: 'Reviewed and accepted' },
  });
  assert.equal(sign.status, 201);
  assert.equal(sign.data.signature.sourceHash, result.data.sha256);
  assert.notEqual(sign.data.sha256, result.data.sha256);
  const signed = await request(`/files/${sign.data.id}/download`, { auth: member, raw: true });
  assert.equal((await PDFDocument.load(signed.data)).getPageCount(), 2);
  assert.equal(
    (
      await request(`/files/${result.data.id}/sign`, {
        auth: member,
        method: 'POST',
        body: { mode: 'certificate', reason: 'Certificate test' },
      })
    ).status,
    503,
  );
});
test('internal mail is private and unsupported external delivery is not falsely reported', async () => {
  const sent = await request('/mail', {
    auth: member,
    method: 'POST',
    body: { to: admin.user.email, subject: 'Internal mail', body: 'Hello team' },
  });
  assert.equal(sent.status, 201);
  assert.ok((await request('/mail')).data.some((m) => m.id === sent.data.id));
  assert.ok(!(await request('/mail', { auth: outsider })).data.some((m) => m.id === sent.data.id));
  assert.equal(
    (
      await request('/mail', {
        auth: member,
        method: 'POST',
        body: { to: 'external@example.org', subject: 'Test', body: 'Not delivered' },
      })
    ).status,
    503,
  );
});
test('AI fallback uses accessible context and is explicitly labelled as search', async () => {
  const result = await request('/ai', {
    auth: outsider,
    method: 'POST',
    body: { prompt: 'find secret' },
  });
  assert.equal(result.status, 200);
  assert.match(result.data.provider, /not configured/);
  assert.ok(!result.data.sources.some((s) => s.title === 'Secret brief'));
});
test('audit chain is valid and SQL triggers reject updates/deletions', async () => {
  const log = await request('/audit');
  assert.equal(log.data.valid, true);
  assert.ok(log.data.rows.some((r) => r.action === 'pdf.sign'));
  assert.throws(
    () => runtime.store.db.prepare('UPDATE audit SET action=? WHERE id=1').run('tamper'),
    /append only/,
  );
  assert.throws(
    () => runtime.store.db.prepare('DELETE FROM audit WHERE id=1').run(),
    /append only/,
  );
});
test('disabling an account revokes existing sessions immediately', async () => {
  const result = await request(`/users/${outsider.user.id}`, {
    method: 'PATCH',
    body: { role: 'member', active: false },
  });
  assert.equal(result.status, 200);
  assert.equal((await request('/state', { auth: outsider })).status, 401);
});
