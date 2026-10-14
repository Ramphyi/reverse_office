import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../server/app.js';
import { searchDocuments, readSheet } from '../public/studio/search.js';
import { validateImages, openCodeCompletion } from '../server/assistant.js';
let runtime, server, base, dir, auth, outsider, privateDoc, provider, providerBase, responder;
const seen = [];
async function request(url, body, who = auth) {
  const response = await fetch(base + '/api' + url, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(who ? { Cookie: who.cookie, 'x-csrf-token': who.csrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
before(async () => {
  delete process.env.AI_BASE_URL;
  delete process.env.OPENCODE_BASE_URL;
  delete process.env.AI_VISION;
  dir = mkdtempSync(path.join(tmpdir(), 'reverse-agent-tests-'));
  runtime = createApp({ dataDir: dir, setupKey: 'agent-test', test: true });
  runtime.app.locals.installFinalHandlers();
  server = runtime.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  const password = 'Agent-testing-password-42!';
  const r = await request(
    '/setup',
    { key: 'agent-test', name: 'Agent Admin', email: 'agent@example.test', password },
    null,
  );
  auth = { ...r.data, cookie: r.headers.get('set-cookie').split(';')[0] };
  await request('/users', {
    name: 'Other User',
    email: 'other@example.test',
    password,
    role: 'member',
  });
  const login = await request('/login', { email: 'other@example.test', password }, null);
  outsider = { ...login.data, cookie: login.headers.get('set-cookie').split(';')[0] };
  const d = await request('/entities/documents', {
    title: 'Private numbers',
    kind: 'sheet',
    projectId: '',
    folderId: '',
    content: { cells: { A1: 'confidential-zebra', B1: '7', B2: '3', B3: '=SUM(B1:B2)' } },
  });
  assert.equal(d.status, 201);
  privateDoc = d.data;
  provider = http
    .createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : null;
      seen.push({ path: req.url, method: req.method, body });
      try {
        const result = await responder(req, body);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
      } catch {
        res.statusCode = 500;
        res.end('{}');
      }
    })
    .listen(0, '127.0.0.1');
  await new Promise((resolve) => provider.once('listening', resolve));
  providerBase = 'http://127.0.0.1:' + provider.address().port;
});
after(async () => {
  delete process.env.AI_BASE_URL;
  delete process.env.OPENCODE_BASE_URL;
  delete process.env.AI_VISION;
  await new Promise((r) => server.close(r));
  await new Promise((r) => provider.close(r));
  runtime.store.close();
  rmSync(dir, { recursive: true, force: true });
});
const call = (name, args) => ({
  id: 'call_' + name,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});
const response = (message) => ({ choices: [{ message: { role: 'assistant', ...message } }] });

test('workbook tools search across sheets and return safe calculated ranges', () => {
  const d = {
    id: 'd',
    title: 'Budget',
    kind: 'sheet',
    content: {
      sheets: [
        { name: 'Costs', cells: { A1: 'Blue Widget', B1: '7', B2: '3', B3: '=SUM(B1:B2)' } },
        { name: 'Other', cells: { A1: 'Blue Widget two' } },
      ],
    },
  };
  assert.equal(searchDocuments([d], 'widget').length, 2);
  assert.equal(searchDocuments([d], 'SUM')[0].location, 'Costs!B3');
  assert.equal(readSheet(d, 'Costs', 'B1:B3').cells[2].value, 10);
  assert.throws(() => readSheet(d, 'Costs', 'A1:CV1000'), /200 cells/);
  assert.throws(() => readSheet(d, 'missing', 'A1:B2'), /not found/);
});
test('local tools enforce auth, search cell contents and do not expose private sources', async () => {
  assert.equal((await request('/ai', { prompt: 'find zebra' }, null)).status, 401);
  const own = await request('/ai', { prompt: 'find confidential-zebra' });
  assert.equal(own.status, 200);
  assert.match(own.data.text, /Sheet1!A1/);
  assert.equal(own.data.trace[0].status, 'complete');
  const other = await request('/ai', { prompt: 'find confidential-zebra' }, outsider);
  assert.equal(other.status, 200);
  assert.equal(other.data.sources.length, 0);
  assert.doesNotMatch(other.data.text, /Private numbers/);
  assert.equal(
    (await request('/ai', { prompt: 'find confidential', documentId: privateDoc.id }, outsider))
      .status,
    403,
  );
  assert.equal((await request('/ai', { prompt: 'x', agent: 'shell' })).status, 400);
});
test('image payloads cannot become URLs, SVG or arbitrary bytes', async () => {
  assert.throws(() => validateImages([{ data: 'https://evil.test/a.png' }]));
  assert.throws(() => validateImages([{ data: 'data:image/svg+xml;base64,PHN2Zz4=' }]));
  assert.throws(() => validateImages([{ data: 'data:image/png;base64,aGVsbG8=' }]));
  const image = {
    name: 'pixel.png',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=',
  };
  const result = await request('/ai', { prompt: 'Describe this', images: [image] });
  assert.equal(result.status, 400);
  assert.match(result.data.error, /vision-capable/);
});
test('real provider loop executes range tool and a specialist with audit trace', async () => {
  process.env.AI_BASE_URL = providerBase;
  seen.length = 0;
  responder = async (req, body) => {
    const specialist = body.messages[0].content.includes('You are Spreadsheet analyst');
    const outputs = body.messages.filter((m) => m.role === 'tool');
    if (specialist)
      return response(
        outputs.length
          ? { content: 'Evidence: B3 = 10.' }
          : { tool_calls: [call('sheet_range', { id: privateDoc.id, range: 'B1:B3' })] },
      );
    return response(
      outputs.length
        ? { content: 'The analyst verified 10.' }
        : { tool_calls: [call('delegate_agent', { agent: 'sheets', prompt: 'Read the total' })] },
    );
  };
  const result = await request('/ai', { prompt: 'Ask the spreadsheet analyst for the total' });
  assert.equal(result.status, 200);
  assert.match(result.data.text, /verified 10/);
  assert.deepEqual(
    result.data.trace.map((t) => t.tool),
    ['delegate_agent', 'sheet_range'],
  );
  assert.equal(seen.length, 4);
  assert.ok(result.data.sources.some((s) => s.location === 'Sheet1!B1:B3'));
  const specialist = seen.find((s) =>
    s.body.messages[0].content.includes('You are Spreadsheet analyst'),
  );
  assert.ok(!specialist.body.tools.some((t) => t.function.name === 'delegate_agent'));
  delete process.env.AI_BASE_URL;
});
test('model-requested unauthorized read is refused by the tool gateway', async () => {
  process.env.AI_BASE_URL = providerBase;
  responder = async (req, body) =>
    response(
      body.messages.some((m) => m.role === 'tool')
        ? { content: 'Access refused.' }
        : { tool_calls: [call('read_document', { id: privateDoc.id })] },
    );
  const result = await request('/ai', { prompt: 'Read private numbers' }, outsider);
  assert.equal(result.status, 200);
  assert.equal(result.data.trace[0].status, 'failed');
  assert.deepEqual(result.data.sources, []);
  const last = seen.at(-1).body.messages.find((m) => m.role === 'tool');
  assert.match(last.content, /not accessible/);
  assert.doesNotMatch(JSON.stringify(seen.at(-1).body), /confidential-zebra/);
  delete process.env.AI_BASE_URL;
});
test('vision-enabled provider receives validated inline images only after send', async () => {
  process.env.AI_BASE_URL = providerBase;
  process.env.AI_VISION = 'true';
  responder = async () => response({ content: 'Image received by test provider.' });
  const image = {
    name: 'pixel.png',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=',
  };
  const result = await request('/ai', { prompt: 'Describe', images: [image] });
  assert.equal(result.status, 200);
  assert.equal(seen.at(-1).body.messages.at(-1).content[1].image_url.url, image.data);
  delete process.env.AI_BASE_URL;
  delete process.env.AI_VISION;
});
test('OpenCode adapter disables every native tool, uses denied isolated sessions and cleans up', async () => {
  process.env.OPENCODE_BASE_URL = providerBase;
  process.env.OPENCODE_API = 'legacy';
  seen.length = 0;
  responder = async (req, body) =>
    req.url === '/experimental/tool/ids'
      ? ['bash', 'read', 'task', 'custom_tool']
      : req.method === 'DELETE'
        ? true
        : req.url === '/session'
          ? { id: 'ses_test123', permission: body.permission }
          : { parts: [{ type: 'text', text: '{"text":"Verified bridge"}' }] };
  const output = await openCodeCompletion(
    [{ role: 'user', content: 'Test' }],
    [],
    AbortSignal.timeout(10000),
  );
  assert.equal(output.content, 'Verified bridge');
  assert.deepEqual(seen.find((s) => s.path === '/session').body.permission, [
    { permission: '*', pattern: '*', action: 'deny' },
  ]);
  assert.ok(
    Object.values(seen.find((s) => s.path.endsWith('/message')).body.tools).every(
      (v) => v === false,
    ),
  );
  assert.equal(seen.at(-1).method, 'DELETE');
  delete process.env.OPENCODE_BASE_URL;
  delete process.env.OPENCODE_API;
});

test('current OpenCode API uses confirmed deny rules, waits for completion and reads typed text', async () => {
  process.env.OPENCODE_BASE_URL = providerBase;
  seen.length = 0;
  responder = async (req, body) => {
    if (req.url === '/api/session')
      return { data: { id: 'ses_current123', permissions: body.permissions } };
    if (req.url.endsWith('/context'))
      return {
        data: [
          {
            type: 'assistant',
            content: [
              { type: 'reasoning', text: 'Do not expose' },
              {
                type: 'text',
                text: '{"calls":[{"name":"workspace_search","arguments":{"query":"budget"}}]}',
              },
            ],
          },
        ],
      };
    return {};
  };
  const output = await openCodeCompletion(
    [{ role: 'user', content: 'Find budget' }],
    [],
    AbortSignal.timeout(10000),
  );
  assert.equal(output.tool_calls[0].function.name, 'workspace_search');
  assert.deepEqual(seen[0].body.permissions, [{ action: '*', resource: '*', effect: 'deny' }]);
  assert.ok(seen.some((r) => r.path.endsWith('/wait')));
  assert.equal(seen.at(-1).method, 'DELETE');
  responder = async (req) =>
    req.url === '/api/session' ? { data: { id: 'ses_current456', permissions: [] } } : {};
  await assert.rejects(openCodeCompletion([], [], AbortSignal.timeout(10000)), /did not confirm/);
  delete process.env.OPENCODE_BASE_URL;
});

test('organisation AI settings require admin and CSRF and drive the selected model', async () => {
  const config = {
    provider: 'local',
    baseUrl: providerBase + '/v1',
    model: 'chosen-fixture',
    revision: 0,
    vision: false,
  };
  assert.equal((await request('/ai/settings', config, outsider)).status, 403);
  assert.equal((await request('/ai/models', config, outsider)).status, 403);
  const noCsrf = await fetch(base + '/api/ai/settings', {
    method: 'POST',
    headers: { Cookie: auth.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  assert.equal(noCsrf.status, 403);
  const saved = await request('/ai/settings', config);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.apiKey, undefined);
  assert.equal((await request('/ai/settings', null, outsider)).data.model, 'chosen-fixture');
  seen.length = 0;
  responder = async () => response({ content: 'Selected model reply' });
  const result = await request('/ai', { prompt: 'Say hello' });
  assert.equal(result.status, 200);
  assert.equal(seen[0].body.model, 'chosen-fixture');
  assert.equal((await request('/ai/settings', config)).status, 409);
});

test('Nova creates a chart from authorized computed cells and rejects private charts for other users', async () => {
  delete process.env.OPENCODE_BASE_URL;
  process.env.AI_BASE_URL = providerBase;
  responder = async (req, body) =>
    response(
      body.messages.some((m) => m.role === 'tool')
        ? { content: 'Chart from saved cells.' }
        : {
            tool_calls: [
              call('sheet_chart', { id: privateDoc.id, range: 'B1:B3', title: 'Saved values' }),
            ],
          },
    );
  const r = await request('/ai', { prompt: 'Chart the saved values' });
  assert.equal(r.status, 200);
  assert.equal(r.data.artifacts[0].type, 'chart');
  assert.deepEqual(
    r.data.artifacts[0].points.map((p) => p.value),
    [7, 3, 10],
  );
  const denied = await request('/ai', { prompt: 'Chart private values' }, outsider);
  assert.ok(!denied.data.artifacts?.length);
});

test('Nova MCP discovery and calls enforce roles and tool allowlists before contacting a service', async () => {
  const oldConfig = process.env.NOVA_MCP_SERVERS;
  let externalCalls = 0;
  let selectedTool = 'mcp_catalog';
  let selectedArgs = { server: 'knowledge' };
  process.env.NOVA_MCP_SERVERS = JSON.stringify([
    { id: 'knowledge', url: providerBase + '/mcp', tools: ['search'], roles: ['admin'] },
  ]);
  responder = async (req, body) => {
    if (req.url === '/mcp') {
      externalCalls++;
      if (body.method === 'initialize')
        return { jsonrpc: '2.0', id: body.id, result: { capabilities: { tools: {} } } };
      if (body.method === 'notifications/initialized') return {};
      if (body.method === 'tools/list')
        return {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            tools: [
              {
                name: 'search',
                description: 'Search knowledge',
                inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
              },
              { name: 'delete_everything', inputSchema: { type: 'object' } },
            ],
          },
        };
      return {
        jsonrpc: '2.0',
        id: body.id,
        result: { content: [{ type: 'text', text: 'Allowed knowledge' }] },
      };
    }
    const result = body.messages.findLast((m) => m.role === 'tool');
    return response(
      result ? { content: result.content } : { tool_calls: [call(selectedTool, selectedArgs)] },
    );
  };
  try {
    assert.equal((await request('/ai/connectors', null, outsider)).data.servers.length, 0);
    const discovery = await request('/ai', { prompt: 'Discover knowledge tools' });
    assert.equal(discovery.status, 200);
    assert.match(discovery.data.text, /inputSchema/);
    assert.match(discovery.data.text, /query/);
    assert.doesNotMatch(discovery.data.text, /delete_everything/);
    assert.equal(externalCalls, 3);
    externalCalls = 0;
    await request('/ai', { prompt: 'Discover private tools' }, outsider);
    assert.equal(externalCalls, 0);
    selectedTool = 'mcp_call';
    selectedArgs = { server: 'knowledge', tool: 'delete_everything', arguments: {} };
    await request('/ai', { prompt: 'Run an unlisted tool' });
    assert.equal(externalCalls, 0);
    selectedArgs = { server: 'knowledge', tool: 'search', arguments: { query: 'knowledge' } };
    const allowed = await request('/ai', { prompt: 'Search allowed knowledge' });
    assert.match(allowed.data.text, /Allowed knowledge/);
    assert.equal(externalCalls, 3);
  } finally {
    if (oldConfig === undefined) delete process.env.NOVA_MCP_SERVERS;
    else process.env.NOVA_MCP_SERVERS = oldConfig;
  }
});
