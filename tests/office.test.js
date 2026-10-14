import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { createApp } from '../server/app.js';
import { createTemplate, templates } from '../server/office-templates.js';
import {
  signOfficeToken,
  verifyOfficeToken,
  boundedOfficeResponse,
} from '../server/office-engine.js';
import { safeImport } from '../server/import-safe.js';
import { PDFDocument } from 'pdf-lib';
import { createServer } from 'node:http';
const secret = 'unit-test-office-secret-at-least-32-characters';
let runtime,
  server,
  base,
  dir,
  auth,
  member,
  doc,
  config,
  downloadBytes,
  fetchCount = 0;
const env = {
  OFFICE_JWT_SECRET: secret,
  OFFICE_INTERNAL_URL: 'http://engine.test',
  OFFICE_PUBLIC_URL: 'http://editor.test',
  OFFICE_APP_URL: 'http://app.test',
};
async function call(url, { method = 'GET', body, who = auth, raw = false, service = false } = {}) {
  const form = body instanceof FormData;
  const response = await fetch(base + (service ? '' : '/api') + url, {
    method,
    headers: {
      ...(form ? {} : { 'Content-Type': 'application/json' }),
      ...(who ? { Cookie: who.cookie, 'x-csrf-token': who.csrf } : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  return {
    status: response.status,
    response,
    data: raw ? Buffer.from(await response.arrayBuffer()) : await response.json(),
  };
}
async function callback(payload) {
  return call('/office-service/callback/' + config.key, {
    service: true,
    who: null,
    method: 'POST',
    body: { token: signOfficeToken({ key: config.key, ...payload }, secret) },
  });
}
before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'office-engine-tests-'));
  runtime = createApp({
    dataDir: dir,
    setupKey: 'office-test-key',
    test: true,
    officeOptions: {
      env,
      fetcher: async (url, options) => {
        fetchCount++;
        const value = String(url);
        if (value.endsWith('/healthcheck')) return new Response('true');
        if (value.includes('/cache/')) return new Response(downloadBytes);
        const payload = JSON.parse(options.body);
        assert.equal(verifyOfficeToken(payload.token, secret).key, payload.key);
        if (value.endsWith('CommandService.ashx')) return Response.json({ error: 4 });
        if (value.endsWith('ConvertService.ashx'))
          return Response.json({ endConvert: true, fileUrl: 'http://engine.test/cache/converted' });
        throw Error('Unexpected service URL ' + value);
      },
    },
  });
  runtime.app.locals.installFinalHandlers();
  server = runtime.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await call('/setup', {
    method: 'POST',
    who: null,
    body: {
      name: 'Office Admin',
      email: 'office-admin@example.test',
      password: 'Native-office-test-42!',
      key: 'office-test-key',
    },
  });
  assert.equal(r.status, 201);
  auth = { ...r.data, cookie: r.response.headers.get('set-cookie').split(';')[0] };
  await call('/users', {
    method: 'POST',
    body: {
      name: 'Other member',
      email: 'office-member@example.test',
      password: 'Native-office-test-42!',
      role: 'member',
    },
  });
  const login = await call('/login', {
    method: 'POST',
    who: null,
    body: { email: 'office-member@example.test', password: 'Native-office-test-42!' },
  });
  member = { ...login.data, cookie: login.response.headers.get('set-cookie').split(';')[0] };
});
after(async () => {
  await new Promise((r) => server.close(r));
  runtime.store.close();
  rmSync(dir, { recursive: true, force: true });
});
test('all native templates contain editable Office parts; charts and formulas are real objects', async () => {
  for (const template of templates) {
    const zip = await JSZip.loadAsync(await createTemplate(template.id, 'Template test'));
    assert.ok(zip.file('[Content_Types].xml'));
    if (template.kind === 'doc') {
      assert.ok(zip.file('word/document.xml'));
      assert.match(await zip.file('word/header1.xml').async('string'), /Template test/);
    }
    if (['sheet-budget', 'sheet-sales'].includes(template.id)) {
      assert.ok(zip.file('xl/charts/chart1.xml'));
      assert.match(await zip.file('xl/worksheets/sheet1.xml').async('string'), /IFERROR/);
      assert.ok(zip.file('xl/worksheets/sheet2.xml'));
    }
    if (template.kind === 'slides') {
      if (['slides-pitch', 'slides-review'].includes(template.id))
        assert.ok(Object.keys(zip.files).some((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name)));
      assert.ok(zip.file('ppt/notesSlides/notesSlide1.xml'));
    }
  }
});
test('template creation, JWT configuration, authenticated source and byte-perfect export', async () => {
  const created = await call('/office/create', {
    method: 'POST',
    body: { templateId: 'writer-report', title: 'Private native report' },
  });
  assert.equal(created.status, 201);
  doc = created.data;
  const opened = await call(`/office/documents/${doc.id}/config`, {
    method: 'POST',
    body: { theme: 'dark' },
  });
  assert.equal(opened.status, 200);
  config = opened.data;
  const signed = verifyOfficeToken(config.config.token, secret);
  assert.equal(signed.document.key, config.key);
  assert.equal(signed.editorConfig.customization.uiTheme, 'theme-dark');
  const source = new URL(signed.document.url),
    file = await call(source.pathname + source.search, { service: true, who: null, raw: true });
  assert.equal(file.status, 200);
  const exported = await call(`/documents/${doc.id}/export/docx`, { raw: true });
  assert.deepEqual(exported.data, file.data);
  assert.equal((await call(source.pathname, { service: true, who: null })).status, 401);
  assert.equal(
    (await call(`/office/documents/${doc.id}/config`, { method: 'POST', body: {}, who: member }))
      .status,
    403,
  );
  assert.equal((await call(`/office/documents/${doc.id}/history`, { who: member })).status, 403);
  assert.equal(
    (
      await call(`/entities/documents/${doc.id}`, {
        method: 'PUT',
        body: { ...doc, content: { type: 'doc', content: [] } },
      })
    ).status,
    409,
  );
});
test('signed callbacks reject forgery, key mismatch and untrusted download locations', async () => {
  assert.equal(
    (
      await call('/office-service/callback/' + config.key, {
        service: true,
        who: null,
        method: 'POST',
        body: { key: config.key, status: 6, url: 'http://engine.test/cache/file' },
      })
    ).status,
    401,
  );
  const before = fetchCount;
  assert.equal(
    (await callback({ status: 6, url: 'http://169.254.169.254/cache/secrets' })).status,
    400,
  );
  assert.equal((await callback({ status: 6, url: 'http://engine.test/admin' })).status, 400);
  assert.equal(
    (await callback({ key: 'another-key', status: 6, url: 'http://engine.test/cache/file' }))
      .status,
    401,
  );
  assert.equal(fetchCount, before);
  assert.throws(
    () => verifyOfficeToken(signOfficeToken({ key: 'a' }, secret, -1), secret),
    /expired/,
  );
  assert.throws(
    () => verifyOfficeToken(signOfficeToken({ key: 'a' }, secret), 'wrong-secret'),
    /Invalid/,
  );
  await assert.rejects(boundedOfficeResponse(new Response(Buffer.alloc(200)), 100), /50 MiB/);
});
test('force-save persists native bytes and revisions; duplicate final callbacks are idempotent', async () => {
  downloadBytes = await createTemplate('writer-proposal', 'Saved native revision');
  const saved = await callback({
    status: 6,
    filetype: 'docx',
    url: 'http://editor.test/cache/result',
    users: [auth.user.id],
  });
  assert.equal(saved.status, 200);
  const status = await call(`/office/documents/${doc.id}/status`);
  assert.equal(status.data.office.revision, 2);
  assert.deepEqual(
    (await call(`/documents/${doc.id}/export/docx`, { raw: true })).data,
    downloadBytes,
  );
  assert.equal((await call(`/office/documents/${doc.id}/history`)).data.length, 2);
  const old = await call(`/office/documents/${doc.id}/history/1`, { raw: true });
  assert.notDeepEqual(old.data, downloadBytes);
  assert.equal(
    (await call(`/office/documents/${doc.id}/save`, { method: 'POST', body: {} })).data.noChanges,
    true,
  );
  assert.equal(
    (await callback({ status: 2, filetype: 'docx', url: 'http://engine.test/cache/result' }))
      .status,
    200,
  );
  assert.equal((await callback({ status: 2, url: 'http://engine.test/cache/result' })).status, 200);
  assert.equal((await callback({ status: 6, url: 'http://engine.test/cache/result' })).status, 409);
  assert.equal((await call(`/office/documents/${doc.id}/history`)).data.length, 2);
});
test('native import preserves charts, formulas, images and rejects mismatched archives', async () => {
  const bytes = await createTemplate('sheet-budget', 'Budget preservation');
  const zip = await JSZip.loadAsync(bytes);
  zip.file('xl/media/preservation.bin', Buffer.from('embedded-object-test'));
  const input = await zip.generateAsync({ type: 'nodebuffer' });
  const form = new FormData();
  form.append('file', new Blob([input]), 'budget.xlsx');
  const imported = await call('/documents/import', { method: 'POST', body: form });
  assert.equal(imported.status, 201);
  assert.deepEqual(
    (await call(`/documents/${imported.data.id}/export/xlsx`, { raw: true })).data,
    input,
  );
  const bad = new FormData();
  bad.append('file', new Blob([bytes]), 'wrong.docx');
  assert.equal((await call('/documents/import', { method: 'POST', body: bad })).status, 400);
  const context = await safeImport({ originalname: 'budget.xlsx', buffer: bytes }, 'context');
  assert.match(JSON.stringify(context), /IFERROR/);
  assert.match(JSON.stringify(context), /Overview/);
  const slides = await safeImport(
    {
      originalname: 'pitch.pptx',
      buffer: await createTemplate('slides-pitch', 'AI slide context'),
    },
    'context',
  );
  assert.match(JSON.stringify(slides), /AI slide context/);
});
test('save acknowledgements are tied to the requested save even if file bytes are unchanged', async () => {
  const reopened = await call(`/office/documents/${doc.id}/config`, { method: 'POST', body: {} });
  config = reopened.data;
  const requestId = 'correlated-test-save';
  runtime.store.db
    .prepare('INSERT INTO office_save_requests VALUES(?,?,?,NULL,?)')
    .run(requestId, config.key, 'pending', Date.now());
  const revision = runtime.app.locals.office.metadata(doc.id).revision;
  downloadBytes = Buffer.from(runtime.app.locals.office.getAsset(doc.id).bytes);
  assert.equal(
    (
      await callback({
        status: 6,
        filetype: 'docx',
        url: 'http://engine.test/cache/result',
        userdata: requestId,
      })
    ).status,
    200,
  );
  const result = await call(`/office/documents/${doc.id}/status?save=${requestId}`);
  assert.equal(result.data.save.state, 'saved');
  assert.equal(result.data.save.revision, revision);
});
test('AI modes, language, conversation and saved native context reach only the configured provider', async () => {
  let received;
  const provider = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = JSON.parse(Buffer.concat(chunks));
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({ choices: [{ message: { content: '## Rezumat\n\nDraft verificabil.' } }] }),
    );
  }).listen(0, '127.0.0.1');
  await new Promise((r) => provider.once('listening', r));
  const old = process.env.AI_BASE_URL;
  process.env.AI_BASE_URL = `http://127.0.0.1:${provider.address().port}`;
  try {
    const result = await call('/ai', {
      method: 'POST',
      body: {
        prompt: 'Summarize this proposal',
        documentId: doc.id,
        mode: 'Analyze',
        tone: 'Concise',
        language: 'Romanian',
        selectedText: 'Additional context',
        history: [{ role: 'user', text: 'Earlier question' }],
      },
    });
    assert.equal(result.status, 200);
    assert.match(result.data.text, /Rezumat/);
    assert.match(received.messages[0].content, /Analyze/);
    assert.match(received.messages[0].content, /Romanian/);
    assert.equal(received.messages[1].content, 'Earlier question');
    assert.match(received.messages.at(-1).content, /Saved native revision/);
    assert.match(received.messages.at(-1).content, /Additional context/);
    assert.equal(
      (
        await call('/ai', {
          method: 'POST',
          who: member,
          body: { prompt: 'Read private report', documentId: doc.id },
        })
      ).status,
      403,
    );
  } finally {
    if (old === undefined) delete process.env.AI_BASE_URL;
    else process.env.AI_BASE_URL = old;
    await new Promise((r) => provider.close(r));
  }
});
test('access revocation invalidates source tickets and save callbacks; signed PDFs cannot be edited', async () => {
  const created = await call('/office/create', {
    method: 'POST',
    who: member,
    body: { templateId: 'writer-blank', title: 'Member report' },
  });
  const opened = await call(`/office/documents/${created.data.id}/config`, {
    method: 'POST',
    who: member,
    body: {},
  });
  const memberConfig = opened.data;
  runtime.store.db.prepare('UPDATE users SET active=0 WHERE id=?').run(member.user.id);
  const source = new URL(memberConfig.config.document.url);
  assert.equal(
    (await call(source.pathname + source.search, { service: true, who: null })).status,
    403,
  );
  const result = await call('/office-service/callback/' + memberConfig.key, {
    service: true,
    who: null,
    method: 'POST',
    body: {
      token: signOfficeToken(
        {
          key: memberConfig.key,
          status: 6,
          url: 'http://engine.test/cache/result',
          users: [member.user.id],
        },
        secret,
      ),
    },
  });
  assert.equal(result.status, 403);
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const form = new FormData();
  form.append('file', new Blob([await pdf.save()]), 'signed.pdf');
  const file = await call('/files', { method: 'POST', body: form });
  assert.equal(file.status, 201);
  const original = Buffer.from(await pdf.save());
  runtime.app.locals.office.putAsset(
    'files',
    file.data,
    Buffer.concat([original, Buffer.from('\n% /ByteRange signed marker')]),
    'pdf',
    auth.user.id,
  );
  assert.equal(
    (await call(`/office/files/${file.data.id}/config`, { method: 'POST', body: {} })).status,
    409,
  );
});
