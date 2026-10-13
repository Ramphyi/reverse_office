import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { digest } from './store.js';
import { date } from './domain.js';
import {
  partySchema,
  invoiceSchema,
  lineSchema,
  calculateTotals,
  invoiceXML,
} from './ro-invoices.js';
import { AnafClient, encryptToken, decryptToken } from './ro-spv.js';
import { Worker } from 'node:worker_threads';

export function installRomania(app, options = {}) {
  const { store, manager, fail } = app.locals.extension,
    env = options.env ?? process.env;
  const environment = env.ANAF_ENV || 'test';
  if (!['test', 'production'].includes(environment))
    throw Error('ANAF_ENV must be test or production');
  app.locals.romaniaEnabled = true;
  app.locals.billingContext = (user) =>
    manager(user)
      ? store
          .all('ro-invoices')
          .slice(0, 30)
          .map((i) => ({
            number: i.number,
            direction: i.direction,
            partner: i.direction === 'sales' ? i.buyer.name : i.seller.name,
            currency: i.currency,
            totalCents: i.totalCents,
            paidCents: i.paidCents,
            dueDate: i.dueDate,
            status: i.status,
            spv: i.spv.state,
          }))
      : [];
  store.db
    .exec(`CREATE TABLE IF NOT EXISTS ro_sequences(series TEXT,year TEXT,value INTEGER NOT NULL,PRIMARY KEY(series,year));
 CREATE TABLE IF NOT EXISTS ro_tokens(id INTEGER PRIMARY KEY CHECK(id=1),encrypted TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS ro_oauth_states(hash TEXT PRIMARY KEY,actor TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS ro_archives(id TEXT PRIMARY KEY,bytes BLOB NOT NULL,hash TEXT NOT NULL);`);
  const company = () => store.get('ro-company', 'ro-company');
  const requireCompany = () => {
    const c = company();
    if (!c) fail(409, 'Set up your company first');
    return c;
  };
  const write = (kind, data, user, old) => store.put(kind, data, user.id, old?.id, old?.version);
  const getInvoice = (id) => {
    const i = store.get('ro-invoices', id);
    if (!i) fail(404, 'Invoice not found');
    return i;
  };
  const requireAdmin = (req) => {
    if (req.user.role !== 'admin') fail(403, 'Administrator access required');
  };
  const configured = () =>
    !!options.client ||
    !!env.ANAF_ACCESS_TOKEN ||
    !!store.db.prepare('SELECT id FROM ro_tokens WHERE id=1').get();
  const productionGuard = () => {
    if (environment === 'production' && env.ANAF_ALLOW_PRODUCTION !== 'true')
      fail(
        403,
        'Production SPV access is disabled. Set ANAF_ALLOW_PRODUCTION=true after sandbox acceptance.',
      );
  };
  let refreshing;
  async function exchange(body) {
    const response = await (options.fetcher ?? fetch)(
      'https://logincert.anaf.ro/anaf-oauth2/v1/token',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${env.ANAF_CLIENT_ID}:${env.ANAF_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ ...body, token_content_type: 'jwt' }),
        signal: AbortSignal.timeout(30000),
        redirect: 'error',
      },
    );
    if (!response.ok) fail(502, `ANAF OAuth returned HTTP ${response.status}`);
    const value = await response.json();
    if (!value.access_token) fail(502, 'ANAF did not return an access token');
    const old = store.db.prepare('SELECT encrypted FROM ro_tokens WHERE id=1').get();
    const previous = old ? decryptToken(old.encrypted, env.SPV_ENCRYPTION_KEY) : {};
    const encrypted = encryptToken(
      {
        ...value,
        refresh_token: value.refresh_token ?? previous.refresh_token,
        expires: Date.now() + Number(value.expires_in ?? 3600) * 1000,
      },
      env.SPV_ENCRYPTION_KEY,
    );
    store.db
      .prepare(
        'INSERT INTO ro_tokens(id,encrypted) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET encrypted=excluded.encrypted',
      )
      .run(encrypted);
    return value.access_token;
  }
  async function tokenProvider() {
    productionGuard();
    if (env.ANAF_ACCESS_TOKEN) return env.ANAF_ACCESS_TOKEN;
    const row = store.db.prepare('SELECT encrypted FROM ro_tokens WHERE id=1').get();
    if (!row) fail(503, 'Connect an ANAF account in SPV settings first');
    const value = decryptToken(row.encrypted, env.SPV_ENCRYPTION_KEY);
    if (value.expires > Date.now() + 60000) return value.access_token;
    if (!value.refresh_token) fail(503, 'Reconnect ANAF: the access token expired');
    refreshing ??= exchange({
      grant_type: 'refresh_token',
      refresh_token: value.refresh_token,
    }).finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  }
  const client =
    options.client ?? new AnafClient({ environment, tokenProvider, fetcher: options.fetcher });
  app.use('/api/ro', (req, res, next) => {
    if (!manager(req.user)) fail(403, 'Manager access required');
    next();
  });
  app.get('/api/ro/state', (req, res) =>
    res.json({
      company: company(),
      partners: store.all('ro-partners'),
      invoices: store.all('ro-invoices'),
      payments: store.all('ro-payments'),
      messages: store.all('ro-messages'),
      spv: {
        environment,
        connected: configured(),
        productionEnabled: env.ANAF_ALLOW_PRODUCTION === 'true',
        oauthConfigured: !!(
          env.ANAF_CLIENT_ID &&
          env.ANAF_CLIENT_SECRET &&
          env.ANAF_REDIRECT_URI &&
          env.SPV_ENCRYPTION_KEY
        ),
      },
    }),
  );
  app.put('/api/ro/company', (req, res) => {
    requireAdmin(req);
    const c = company(),
      data = partySchema.parse(req.body);
    if (c && c.cui !== data.cui && (store.all('ro-invoices').length || configured()))
      fail(409, 'Company CUI is locked once billing or SPV is in use');
    res.json(store.put('ro-company', data, req.user.id, 'ro-company', c?.version));
  });
  app.post('/api/ro/partners', (req, res) => {
    const data = partySchema.extend({ kind: z.enum(['customer', 'supplier']) }).parse(req.body);
    if (store.all('ro-partners').some((p) => p.cui === data.cui && p.kind === data.kind))
      fail(409, 'This partner already exists');
    res.status(201).json(write('ro-partners', data, req.user));
  });
  app.put('/api/ro/partners/:id', (req, res) => {
    const old = store.get('ro-partners', req.params.id);
    if (!old) fail(404, 'Partner not found');
    const data = partySchema.extend({ kind: z.enum(['customer', 'supplier']) }).parse(req.body);
    if (data.cui !== old.cui || data.kind !== old.kind)
      fail(409, 'Create a new partner when its tax identity changes');
    res.json(
      store.put('ro-partners', data, req.user.id, old.id, z.number().int().parse(req.body.version)),
    );
  });
  function invoiceData(input, old) {
    const own = requireCompany(),
      data = invoiceSchema.parse(input),
      partner = store.get('ro-partners', data.partnerId);
    if (!partner || partner.kind !== (data.direction === 'sales' ? 'customer' : 'supplier'))
      fail(400, 'Select a matching customer or supplier');
    if (data.timesheetIds.length) {
      if (
        data.direction !== 'sales' ||
        new Set(data.timesheetIds).size !== data.timesheetIds.length
      )
        fail(400, 'Timesheets must be unique and belong to sales invoices');
      const entries = data.timesheetIds.map((id) => store.get('timesheets', id));
      if (
        entries.some(
          (t) =>
            !t ||
            t.status !== 'Approved' ||
            !t.billingSnapshot ||
            t.billingSnapshot.client !== partner.name ||
            t.billingSnapshot.currency !== data.currency,
        )
      )
        fail(400, 'Select approved timesheets whose client name and currency match this customer');
      if (
        store
          .all('ro-invoices')
          .some(
            (i) => i.id !== old?.id && i.timesheetIds?.some((id) => data.timesheetIds.includes(id)),
          )
      )
        fail(409, 'A selected timesheet is already attached to an invoice');
      data.lines = entries.map((t) => ({
        description: `${t.billingSnapshot.project} · ${t.date} · ${t.description}`,
        quantity: t.hours,
        unitPrice: t.billingSnapshot.rate,
        vatRate: data.lines[0].vatRate,
        unit: 'HUR',
        exemptionReason: data.lines[0].exemptionReason,
      }));
      if (data.lines.length > 200) fail(400, 'Limit invoices to 200 timesheets');
      data.lines = z.array(lineSchema).parse(data.lines);
    }
    if (
      data.direction === 'purchase' &&
      store
        .all('ro-invoices')
        .some(
          (i) =>
            i.id !== old?.id &&
            i.direction === 'purchase' &&
            i.seller?.cui === partner.cui &&
            i.number === data.number,
        )
    )
      fail(409, 'Supplier invoice already exists');
    return {
      ...data,
      ...calculateTotals(data.lines),
      number: data.direction === 'sales' ? '' : data.number,
      seller: data.direction === 'sales' ? own : partner,
      buyer: data.direction === 'sales' ? partner : own,
      status: 'Draft',
      paidCents: 0,
      spv: { state: 'Not sent' },
    };
  }
  app.post('/api/ro/invoices', (req, res) =>
    res.status(201).json(write('ro-invoices', invoiceData(req.body), req.user)),
  );
  app.put('/api/ro/invoices/:id', (req, res) => {
    const old = getInvoice(req.params.id);
    if (old.status !== 'Draft') fail(409, 'Issued invoices are immutable');
    res.json(
      store.put(
        'ro-invoices',
        invoiceData(req.body, old),
        req.user.id,
        old.id,
        z.number().int().parse(req.body.version),
      ),
    );
  });
  app.delete('/api/ro/invoices/:id', (req, res) => {
    const old = getInvoice(req.params.id);
    if (old.status !== 'Draft') fail(409, 'Issued invoices cannot be deleted');
    store.remove('ro-invoices', old.id, req.user.id);
    res.json({ ok: true });
  });
  app.post('/api/ro/invoices/:id/issue', (req, res) => {
    const result = store.transaction(() => {
      const old = getInvoice(req.params.id);
      if (old.status !== 'Draft') fail(409, 'Invoice has already been issued');
      let number = old.number;
      if (old.direction === 'sales') {
        const year = old.issueDate.slice(0, 4);
        store.db
          .prepare(
            'INSERT INTO ro_sequences(series,year,value) VALUES(?,?,1) ON CONFLICT(series,year) DO UPDATE SET value=value+1',
          )
          .run(old.series, year);
        const seq = store.db
          .prepare('SELECT value FROM ro_sequences WHERE series=? AND year=?')
          .get(old.series, year).value;
        number = `${old.series}-${year}-${String(seq).padStart(5, '0')}`;
      }
      return write(
        'ro-invoices',
        {
          ...old,
          number,
          status: old.direction === 'sales' ? 'Issued' : 'Received',
          issuedAt: new Date().toISOString(),
        },
        req.user,
        old,
      );
    });
    res.json(result);
  });
  app.post('/api/ro/invoices/:id/payments', (req, res) => {
    const p = z
      .object({
        amountCents: z.number().int().positive(),
        date,
        reference: z.string().trim().min(1).max(120),
      })
      .parse(req.body);
    res.status(201).json(
      store.transaction(() => {
        const old = getInvoice(req.params.id);
        if (old.status === 'Draft') fail(409, 'Issue the invoice first');
        if (old.paidCents + p.amountCents > old.totalCents)
          fail(400, 'Payment exceeds the outstanding balance');
        if (
          store
            .all('ro-payments')
            .some((x) => x.invoiceId === old.id && x.reference === p.reference)
        )
          fail(409, 'Payment reference already recorded');
        write('ro-payments', { ...p, invoiceId: old.id }, req.user);
        return write(
          'ro-invoices',
          { ...old, paidCents: old.paidCents + p.amountCents },
          req.user,
          old,
        );
      }),
    );
  });
  app.get('/api/ro/invoices/:id/xml', (req, res) => {
    const i = getInvoice(req.params.id);
    if (i.status === 'Draft' || i.imported)
      fail(409, 'XML export is available for locally issued invoices');
    res
      .type('application/xml')
      .attachment(`${i.number.replace(/[^A-Za-z0-9-]/g, '_')}.xml`)
      .send(invoiceXML(i));
  });
  app.post('/api/ro/invoices/:id/validate', async (req, res) => {
    const old = getInvoice(req.params.id);
    if (old.status !== 'Issued' || old.direction !== 'sales')
      fail(409, 'Issue a sales invoice first');
    if (old.currency !== 'RON')
      fail(
        400,
        'This SPV adapter supports RON invoices only; foreign-currency tax conversion is not implemented',
      );
    const xml = invoiceXML(old),
      result = await client.validate(xml);
    const current = getInvoice(old.id);
    res.json(
      write(
        'ro-invoices',
        {
          ...current,
          validation: {
            valid: result.stare === 'ok',
            hash: digest(xml),
            time: new Date().toISOString(),
            result,
          },
        },
        req.user,
        current,
      ),
    );
  });
  app.post('/api/ro/invoices/:id/submit', async (req, res) => {
    productionGuard();
    const old = getInvoice(req.params.id),
      xml = invoiceXML(old);
    if (!configured()) fail(503, 'Connect ANAF first');
    if (req.body.confirm !== `${environment}:${old.number}`)
      fail(400, 'Confirm the destination and exact invoice number');
    if (old.direction !== 'sales' || old.status !== 'Issued' || old.spv.state !== 'Not sent')
      fail(409, 'Invoice cannot be submitted again; inspect its SPV status');
    if (!old.validation?.valid || old.validation.hash !== digest(xml))
      fail(409, 'A successful ANAF validation of this exact XML is required');
    const pending = write(
      'ro-invoices',
      {
        ...old,
        spv: {
          state: 'Uploading',
          environment,
          xmlHash: digest(xml),
          time: new Date().toISOString(),
        },
      },
      req.user,
      old,
    );
    try {
      const result = await client.upload(xml, old.seller.cui),
        current = getInvoice(old.id);
      res.json(
        write(
          'ro-invoices',
          {
            ...current,
            spv: {
              ...pending.spv,
              state: result.accepted ? 'Submitted' : 'Rejected',
              index: result.index,
              error: result.error,
            },
          },
          req.user,
          current,
        ),
      );
    } catch (error) {
      const current = getInvoice(old.id);
      write(
        'ro-invoices',
        {
          ...current,
          spv: {
            ...pending.spv,
            state: 'Unknown',
            error:
              'The upload outcome is unknown. Reconcile with ANAF before any further submission.',
          },
        },
        req.user,
        current,
      );
      throw error;
    }
  });
  app.post('/api/ro/invoices/:id/status', async (req, res) => {
    productionGuard();
    const old = getInvoice(req.params.id);
    if (!old.spv.index || old.spv.environment !== environment)
      fail(409, 'No upload index in this environment');
    const result = await client.status(old.spv.index),
      current = getInvoice(old.id);
    res.json(
      write(
        'ro-invoices',
        {
          ...current,
          spv: {
            ...current.spv,
            state:
              result.stare === 'ok'
                ? 'Accepted'
                : result.stare === 'nok'
                  ? 'Rejected'
                  : 'Processing',
            downloadId: result.id_descarcare ? String(result.id_descarcare) : undefined,
            result,
          },
        },
        req.user,
        current,
      ),
    );
  });
  app.post('/api/ro/spv/sync', async (req, res) => {
    productionGuard();
    const days = z
        .number()
        .int()
        .min(1)
        .max(60)
        .parse(req.body.days ?? 30),
      c = requireCompany(),
      result = await client.list(c.cui, days);
    if (result.eroare) fail(502, String(result.eroare).slice(0, 500));
    const messages = result.mesaje ?? [];
    if (!Array.isArray(messages) || messages.length > 10000)
      fail(502, 'Unexpected ANAF message list');
    store.transaction(() => {
      for (const m of messages) {
        if (!/^\d+$/.test(String(m.id))) continue;
        const id = `ro-message-${environment}-${m.id}`,
          old = store.get('ro-messages', id);
        if (!old)
          store.put(
            'ro-messages',
            {
              remoteId: String(m.id),
              environment,
              detail: String(m.detalii ?? ''),
              type: String(m.tip ?? ''),
              date: String(m.data_creare ?? ''),
              cui: c.cui,
            },
            req.user.id,
            id,
          );
      }
    });
    res.json({ count: messages.length });
  });
  async function archive(req) {
    productionGuard();
    const message = store.get('ro-messages', req.params.id);
    if (!message || message.environment !== environment)
      fail(404, 'SPV message not found in this environment');
    let row = store.db.prepare('SELECT bytes,hash FROM ro_archives WHERE id=?').get(message.id);
    if (!row) {
      const bytes = await client.download(message.remoteId);
      row = { bytes, hash: digest(bytes) };
      store.db
        .prepare('INSERT OR IGNORE INTO ro_archives(id,bytes,hash) VALUES(?,?,?)')
        .run(message.id, bytes, row.hash);
      store.audit(req.user.id, 'spv.archive', message.id, { sha256: row.hash });
    }
    return { message, bytes: Buffer.from(row.bytes), hash: row.hash };
  }
  app.get('/api/ro/spv/messages/:id/download', async (req, res) => {
    const a = await archive(req);
    res.type('application/zip').attachment(`ANAF-${a.message.remoteId}.zip`).send(a.bytes);
  });
  app.post('/api/ro/spv/messages/:id/import', async (req, res) => {
    const a = await archive(req),
      data = await parseArchive(a.bytes, requireCompany().cui);
    const duplicate = store
      .all('ro-invoices')
      .find(
        (i) =>
          i.direction === 'purchase' &&
          i.seller?.cui === data.seller.cui &&
          i.number === data.number,
      );
    if (duplicate) fail(409, 'This supplier invoice is already in payables');
    res.status(201).json(
      write(
        'ro-invoices',
        {
          ...data,
          direction: 'purchase',
          status: 'Received',
          paidCents: 0,
          imported: true,
          requiresReview: true,
          archiveId: a.message.id,
          archiveHash: a.hash,
          spv: { state: 'Downloaded', environment, signatureVerified: false },
          timesheetIds: [],
        },
        req.user,
      ),
    );
  });
  app.post('/api/ro/spv/connect', (req, res) => {
    requireAdmin(req);
    productionGuard();
    if (!env.ANAF_CLIENT_ID || !env.ANAF_CLIENT_SECRET || !env.ANAF_REDIRECT_URI)
      fail(503, 'Configure ANAF client ID, secret and registered redirect URI');
    encryptToken({}, env.SPV_ENCRYPTION_KEY);
    const state = randomBytes(32).toString('hex');
    store.db.prepare('DELETE FROM ro_oauth_states WHERE expires<?').run(Date.now());
    store.db
      .prepare('INSERT INTO ro_oauth_states(hash,actor,expires) VALUES(?,?,?)')
      .run(digest(state), req.user.id, Date.now() + 10 * 60000);
    const url = new URL('https://logincert.anaf.ro/anaf-oauth2/v1/authorize');
    for (const [k, v] of Object.entries({
      response_type: 'code',
      client_id: env.ANAF_CLIENT_ID,
      redirect_uri: env.ANAF_REDIRECT_URI,
      token_content_type: 'jwt',
      state,
    }))
      url.searchParams.set(k, v);
    res.json({ url: url.href });
  });
  app.get('/spv/callback', async (req, res) => {
    productionGuard();
    const state = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(req.query.state),
      code = z.string().min(1).max(4000).parse(req.query.code),
      record = store.db.prepare('SELECT * FROM ro_oauth_states WHERE hash=?').get(digest(state));
    if (
      !record ||
      record.expires < Date.now() ||
      !store.users().some((u) => u.id === record.actor && u.role === 'admin' && u.active)
    )
      fail(400, 'OAuth request expired or was already used');
    store.db.prepare('DELETE FROM ro_oauth_states WHERE hash=?').run(digest(state));
    await exchange({ grant_type: 'authorization_code', code, redirect_uri: env.ANAF_REDIRECT_URI });
    store.audit(record.actor, 'spv.connected', 'company', { environment });
    res.redirect('/?spv=connected');
  });
  app.delete('/api/ro/spv/connection', (req, res) => {
    requireAdmin(req);
    store.db.prepare('DELETE FROM ro_tokens').run();
    store.db.prepare('DELETE FROM ro_oauth_states').run();
    store.audit(req.user.id, 'spv.disconnected', 'company');
    res.json({ ok: true, environmentTokenStillConfigured: !!env.ANAF_ACCESS_TOKEN });
  });
}
function parseArchive(bytes, cui) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./ro-archive-worker.js', import.meta.url), {
      workerData: { bytes, cui },
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 },
    });
    let settled = false;
    const finish = (e, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      e ? reject(Object.assign(e, { status: 400 })) : resolve(result);
    };
    const timer = setTimeout(() => finish(Error('SPV archive processing timed out')), 15000);
    worker.on('message', (m) => finish(m.error ? Error(m.error) : null, m.result));
    worker.on('error', (e) => finish(e));
    worker.on('exit', () => {
      if (!settled) finish(Error('SPV archive processing failed'));
    });
  });
}
