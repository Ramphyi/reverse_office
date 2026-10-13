import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { createApp } from '../server/app.js';
import { installRomania } from '../server/romania.js';
import {
  calculateTotals,
  invoiceXML,
  readIncomingInvoice,
  parseXML,
} from '../server/ro-invoices.js';
import { AnafClient, encryptToken, decryptToken } from '../server/ro-spv.js';
const company = {
  name: 'Studio Demo SRL',
  cui: '12345678',
  vatRegistered: true,
  email: 'billing@example.test',
  street: 'Strada Test 10',
  city: 'Cluj-Napoca',
  county: 'RO-CJ',
  country: 'RO',
  iban: '',
  postalCode: '400000',
  registration: '',
};
const partner = { ...company, name: 'Client & Design SRL', cui: '23456789', kind: 'customer' };
const line = {
  description: 'Delivery & support <review>',
  quantity: 1.125,
  unitPrice: 12.34,
  vatRate: 21,
  unit: 'HUR',
  exemptionReason: '',
};
const input = {
  direction: 'sales',
  issueDate: '2026-10-13',
  dueDate: '2026-11-13',
  currency: 'RON',
  series: 'DEV',
  lines: [line],
  notes: '',
  timesheetIds: [],
};
let runtime,
  server,
  dir,
  base,
  auth,
  customer,
  supplier,
  issued,
  failUpload = false,
  validateOK = true,
  archive,
  memberAuth,
  oauthCalls = 0;
const password = 'Romania-test-password-42!';
const mock = {
  validate: async () => ({
    stare: validateOK ? 'ok' : 'nok',
    Messages: validateOK ? [] : ['Invalid test tax'],
  }),
  upload: async () => {
    if (failUpload) throw Object.assign(Error('Network outcome unknown'), { status: 502 });
    return { accepted: true, index: '12345' };
  },
  status: async () => ({ stare: 'ok', id_descarcare: '34567' }),
  list: async () => ({
    mesaje: [
      { id: '34567', tip: 'FACTURA PRIMITA', detalii: 'Supplier invoice', data_creare: '20261013' },
    ],
  }),
  download: async () => archive,
};
async function request(url, { method = 'GET', body, user = auth, raw = false } = {}) {
  const r = await fetch(base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { Cookie: user.cookie, 'X-CSRF-Token': user.csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const data = raw ? Buffer.from(await r.arrayBuffer()) : await r.json();
  return { status: r.status, data, response: r };
}
before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'reverse-ro-'));
  runtime = createApp({ dataDir: dir, setupKey: 'ro-key', test: true });
  installRomania(runtime.app, {
    client: mock,
    env: {
      ANAF_ENV: 'test',
      ANAF_CLIENT_ID: 'test-id',
      ANAF_CLIENT_SECRET: 'test-secret',
      ANAF_REDIRECT_URI: 'http://127.0.0.1/spv/callback',
      SPV_ENCRYPTION_KEY: 'ab'.repeat(32),
    },
    fetcher: async () => {
      oauthCalls++;
      return new Response(
        JSON.stringify({
          access_token: 'secret-access',
          refresh_token: 'secret-refresh',
          expires_in: 3600,
        }),
      );
    },
  });
  runtime.app.locals.installFinalHandlers();
  server = runtime.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await request('/api/setup', {
    method: 'POST',
    body: { key: 'ro-key', name: 'Billing Admin', email: 'admin@example.test', password },
    user: null,
  });
  assert.equal(r.status, 201);
  auth = { ...r.data, cookie: r.response.headers.get('set-cookie').split(';')[0] };
  await request('/api/users', {
    method: 'POST',
    body: { name: 'Team Member', email: 'member@example.test', password, role: 'member' },
  });
  const m = await request('/api/login', {
    method: 'POST',
    body: { email: 'member@example.test', password },
    user: null,
  });
  memberAuth = { ...m.data, cookie: m.response.headers.get('set-cookie').split(';')[0] };
});
after(async () => {
  await new Promise((r) => server.close(r));
  runtime.store.close();
  rmSync(dir, { recursive: true, force: true });
});
test('money arithmetic groups VAT after line rounding; XML round-trip and entity defenses', () => {
  const t = calculateTotals([line, { ...line, quantity: 2, unitPrice: 0.01 }]);
  assert.equal(t.netCents, 1390);
  assert.equal(t.taxCents, 292);
  assert.equal(t.totalCents, 1682);
  const xml = invoiceXML({ ...input, number: 'DEV-1', seller: partner, buyer: company });
  assert.match(xml, /Client &amp; Design/);
  const incoming = readIncomingInvoice(xml, company.cui);
  assert.equal(incoming.totalCents, 1679);
  assert.equal(incoming.seller.name, partner.name);
  assert.equal(incoming.lines[0].description, line.description);
  assert.throws(() => readIncomingInvoice(xml, '00000000'), /does not match/);
  assert.throws(
    () => parseXML('<!DOCTYPE Invoice [<!ENTITY x SYSTEM "file:///etc/passwd">]><Invoice/>'),
    /Unsafe/,
  );
});
test('Romania permissions, company identity and partner registration', async () => {
  assert.equal((await request('/api/ro/state', { user: null })).status, 401);
  assert.equal((await request('/api/ro/state', { user: memberAuth })).status, 403);
  assert.equal((await request('/api/entities/ro-invoices')).status, 404);
  assert.equal((await request('/api/ro/company', { method: 'PUT', body: company })).status, 200);
  let r = await request('/api/ro/partners', { method: 'POST', body: partner });
  assert.equal(r.status, 201);
  customer = r.data;
  assert.equal((await request('/api/ro/partners', { method: 'POST', body: partner })).status, 409);
  r = await request('/api/ro/partners', {
    method: 'POST',
    body: { ...company, cui: '34567890', name: 'Supplier Test', kind: 'supplier' },
  });
  assert.equal(r.status, 201);
  supplier = r.data;
});
test('drafts issue once with sequential numbers, immutable snapshots, partial payments and audit', async () => {
  let r = await request('/api/ro/invoices', {
    method: 'POST',
    body: { ...input, partnerId: customer.id },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.number, '');
  const id = r.data.id;
  r = await request(`/api/ro/invoices/${id}/issue`, { method: 'POST', body: {} });
  assert.equal(r.status, 200);
  issued = r.data;
  assert.equal(issued.number, 'DEV-2026-00001');
  assert.equal(
    (await request(`/api/ro/invoices/${id}/issue`, { method: 'POST', body: {} })).status,
    409,
  );
  assert.equal(
    (
      await request(`/api/ro/invoices/${id}`, {
        method: 'PUT',
        body: { ...issued, lines: [{ ...line, unitPrice: 1 }] },
      })
    ).status,
    409,
  );
  assert.equal((await request(`/api/ro/invoices/${id}`, { method: 'DELETE' })).status, 409);
  r = await request(`/api/ro/invoices/${id}/payments`, {
    method: 'POST',
    body: { amountCents: 500, date: '2026-10-13', reference: 'BANK-1' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.paidCents, 500);
  assert.equal(
    (
      await request(`/api/ro/invoices/${id}/payments`, {
        method: 'POST',
        body: { amountCents: 1, date: '2026-10-13', reference: 'BANK-1' },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/api/ro/invoices/${id}/payments`, {
        method: 'POST',
        body: { amountCents: 2000, date: '2026-10-13', reference: 'BANK-2' },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request('/api/ro/company', { method: 'PUT', body: { ...company, cui: '99999999' } }))
      .status,
    409,
  );
  const xml = await request(`/api/ro/invoices/${id}/xml`, { raw: true });
  assert.equal(xml.status, 200);
  assert.match(xml.data.toString(), /DEV-2026-00001/);
  const audit = await request('/api/audit');
  assert.equal(audit.status, 200);
  assert.equal(audit.data.valid, true);
});
test('approved timesheets use frozen rates and cannot be billed twice', async () => {
  const time = runtime.store.put(
    'timesheets',
    {
      date: '2026-10-12',
      status: 'Approved',
      hours: 8,
      description: 'Consulting',
      userId: memberAuth.user.id,
      billingSnapshot: {
        project: 'Work',
        rate: 100,
        currency: 'RON',
        client: customer.name,
        po: 'PO-42',
      },
    },
    auth.user.id,
  );
  const body = { ...input, partnerId: customer.id, timesheetIds: [time.id] };
  let r = await request('/api/ro/invoices', { method: 'POST', body });
  assert.equal(r.status, 201);
  assert.equal(r.data.netCents, 80000);
  assert.equal(r.data.lines[0].unitPrice, 100);
  assert.equal(r.data.lines[0].quantity, 8);
  assert.equal((await request('/api/ro/invoices', { method: 'POST', body })).status, 409);
  const deleted = await request('/api/ro/invoices/' + r.data.id, { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  r = await request('/api/ro/invoices', { method: 'POST', body });
  assert.equal(r.status, 201);
  r = await request('/api/ro/invoices/' + r.data.id + '/issue', { method: 'POST', body: {} });
  assert.equal(r.data.number, 'DEV-2026-00002');
});
test('SPV requires exact validated XML and destination confirmation; upload is not acceptance', async () => {
  const id = issued.id,
    confirm = `test:${issued.number}`;
  assert.equal(
    (await request(`/api/ro/invoices/${id}/submit`, { method: 'POST', body: { confirm } })).status,
    409,
  );
  validateOK = false;
  let r = await request(`/api/ro/invoices/${id}/validate`, { method: 'POST', body: {} });
  assert.equal(r.data.validation.valid, false);
  assert.equal(
    (await request(`/api/ro/invoices/${id}/submit`, { method: 'POST', body: { confirm } })).status,
    409,
  );
  validateOK = true;
  r = await request(`/api/ro/invoices/${id}/validate`, { method: 'POST', body: {} });
  assert.equal(r.data.validation.valid, true);
  assert.equal(
    (
      await request(`/api/ro/invoices/${id}/submit`, {
        method: 'POST',
        body: { confirm: 'production:wrong' },
      })
    ).status,
    400,
  );
  r = await request(`/api/ro/invoices/${id}/submit`, { method: 'POST', body: { confirm } });
  assert.equal(r.status, 200);
  assert.equal(r.data.spv.state, 'Submitted');
  assert.equal(r.data.spv.index, '12345');
  assert.equal(
    (await request(`/api/ro/invoices/${id}/submit`, { method: 'POST', body: { confirm } })).status,
    409,
  );
  r = await request(`/api/ro/invoices/${id}/status`, { method: 'POST', body: {} });
  assert.equal(r.data.spv.state, 'Accepted');
  assert.equal(r.data.spv.downloadId, '34567');
});
test('uncertain uploads remain blocked against accidental resubmission', async () => {
  let r = await request('/api/ro/invoices', {
    method: 'POST',
    body: { ...input, partnerId: customer.id },
  });
  r = await request(`/api/ro/invoices/${r.data.id}/issue`, { method: 'POST', body: {} });
  const i = r.data;
  await request(`/api/ro/invoices/${i.id}/validate`, { method: 'POST', body: {} });
  failUpload = true;
  assert.equal(
    (
      await request(`/api/ro/invoices/${i.id}/submit`, {
        method: 'POST',
        body: { confirm: `test:${i.number}` },
      })
    ).status,
    502,
  );
  assert.equal(runtime.store.get('ro-invoices', i.id).spv.state, 'Unknown');
  failUpload = false;
  assert.equal(
    (
      await request(`/api/ro/invoices/${i.id}/submit`, {
        method: 'POST',
        body: { confirm: `test:${i.number}` },
      })
    ).status,
    409,
  );
});
test('SPV archives import one matching supplier invoice, retain originals and prevent duplicates', async () => {
  const zip = new JSZip();
  zip.file(
    'invoice.xml',
    invoiceXML({ ...input, number: 'SUP-1', seller: supplier, buyer: company }),
  );
  zip.file('signature.xml', '<Signature>test-only-not-verified</Signature>');
  archive = await zip.generateAsync({ type: 'nodebuffer' });
  let r = await request('/api/ro/spv/sync', { method: 'POST', body: { days: 30 } });
  assert.equal(r.status, 200);
  r = await request('/api/ro/spv/messages/ro-message-test-34567/import', {
    method: 'POST',
    body: {},
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.direction, 'purchase');
  assert.equal(r.data.seller.cui, supplier.cui);
  assert.equal(r.data.requiresReview, true);
  assert.equal(r.data.spv.signatureVerified, false);
  const download = await request('/api/ro/spv/messages/ro-message-test-34567/download', {
    raw: true,
  });
  assert.deepEqual(download.data, archive);
  assert.equal(
    (
      await request('/api/ro/spv/messages/ro-message-test-34567/import', {
        method: 'POST',
        body: {},
      })
    ).status,
    409,
  );
  assert.equal(
    (await request('/api/ro/spv/messages/not-tracked/download', { raw: true })).status,
    404,
  );
  assert.equal(
    (
      await request('/api/ro/invoices', {
        method: 'POST',
        body: { ...input, direction: 'purchase', partnerId: supplier.id, number: 'SUP-1' },
      })
    ).status,
    409,
  );
});
test('OAuth state is single use and tokens are encrypted; tampering fails authentication', async () => {
  const key = 'ab'.repeat(32),
    encrypted = encryptToken({ token: 'secret' }, key);
  assert.equal(encrypted.includes('secret'), false);
  assert.deepEqual(decryptToken(encrypted, key), { token: 'secret' });
  const changed = JSON.parse(encrypted);
  changed.body = (changed.body[0] === 'a' ? 'b' : 'a') + changed.body.slice(1);
  assert.throws(() => decryptToken(JSON.stringify(changed), key));
  const r = await request('/api/ro/spv/connect', { method: 'POST', body: {} });
  assert.equal(r.status, 200);
  const url = new URL(r.data.url),
    state = url.searchParams.get('state');
  assert.equal(url.hostname, 'logincert.anaf.ro');
  const callback = await request(`/spv/callback?state=${state}&code=code`, {
    user: null,
    raw: true,
  });
  assert.equal(callback.status, 302);
  assert.equal(oauthCalls, 1);
  assert.equal(
    (await request(`/spv/callback?state=${state}&code=code`, { user: null, raw: true })).status,
    400,
  );
  assert.equal(oauthCalls, 1);
  const row = runtime.store.db.prepare('SELECT encrypted FROM ro_tokens').get();
  assert.equal(row.encrypted.includes('secret-access'), false);
  assert.equal(
    JSON.stringify((await request('/api/ro/state')).data).includes('secret-access'),
    false,
  );
});
test('ANAF HTTP adapter uses bounded responses, token headers and official operation names', async () => {
  const calls = [],
    fetcher = async (url, options) => {
      calls.push({ url: new URL(url), options });
      if (url.pathname.endsWith('/upload'))
        return new Response('<header ExecutionStatus="0" index_incarcare="456"/>');
      if (url.pathname.endsWith('/descarcare')) return new Response(Buffer.from('zip'));
      return new Response(JSON.stringify({ stare: 'ok' }));
    };
  const client = new AnafClient({ tokenProvider: async () => 'test-token', fetcher });
  assert.deepEqual(await client.upload('<Invoice/>', '12345678'), { accepted: true, index: '456' });
  assert.equal(calls[0].url.pathname, '/test/FCTEL/rest/upload');
  assert.equal(calls[0].url.searchParams.get('standard'), 'UBL');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
  await client.validate('<Invoice/>');
  assert.equal(calls[1].url.pathname, '/prod/FCTEL/rest/validare/FACT1');
  assert.equal(calls[1].options.headers.Authorization, undefined);
  assert.equal((await client.download('123')).toString(), 'zip');
  assert.throws(() => client.status('../bad'), /Invalid/);
});
