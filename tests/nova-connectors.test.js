import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectorServers, mcpRequest, webSearch } from '../server/assistant-connectors.js';
import { newDocument, calculate } from '../public/studio/core.js';
test('MCP configuration rejects credentials, unencrypted remote URLs and duplicate identifiers', () => {
  assert.throws(() =>
    connectorServers({
      NOVA_MCP_SERVERS: JSON.stringify([{ id: 'x', url: 'http://example.com/mcp', tools: [] }]),
    }),
  );
  assert.throws(() =>
    connectorServers({
      NOVA_MCP_SERVERS: JSON.stringify([
        { id: 'x', url: 'https://user:secret@example.com/mcp', tools: [] },
      ]),
    }),
  );
  const config = { id: 'x', url: 'http://127.0.0.1:8765/mcp', tools: ['search'] };
  assert.equal(
    connectorServers({ NOVA_MCP_SERVERS: JSON.stringify([config]) })[0].roles[0],
    'admin',
  );
  assert.throws(() => connectorServers({ NOVA_MCP_SERVERS: JSON.stringify([config, config]) }));
});
test('MCP performs initialization, session headers, allowed call and session cleanup with SSE result', async () => {
  const calls = [];
  let cancelled = false;
  const fetcher = async (url, options) => {
    calls.push(options);
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    const body = JSON.parse(options.body);
    if (body.method === 'initialize')
      return Response.json(
        { jsonrpc: '2.0', id: body.id, result: { capabilities: { tools: {} } } },
        { headers: { 'Mcp-Session-Id': 'fixture-session' } },
      );
    assert.equal(options.headers['Mcp-Session-Id'], 'fixture-session');
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    const event =
      'data: ' +
      JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: { content: [{ type: 'text', text: 'Verified result' }] },
      }) +
      '\r\n\r\n';
    return new Response(
      new ReadableStream({
        start(controller) {
          // A live server can keep the stream open after returning the result.
          controller.enqueue(new TextEncoder().encode(': heartbeat\r\n\r\n' + event.slice(0, 17)));
          controller.enqueue(new TextEncoder().encode(event.slice(17)));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  };
  const result = await mcpRequest(
    { url: 'https://example.test/mcp', tokenEnv: 'TOKEN' },
    'tools/call',
    { name: 'search', arguments: { query: 'hello' } },
    { fetcher, env: { TOKEN: 'test-secret' } },
  );
  assert.equal(result.content[0].text, 'Verified result');
  assert.equal(calls.length, 4);
  assert.equal(calls[0].redirect, 'error');
  assert.equal(calls[3].method, 'DELETE');
  assert.equal(cancelled, true);
});
test('web search uses a fixed endpoint, bounded public output and does not reflect provider failures', async () => {
  const r = await webSearch('budget', {
    env: { BRAVE_SEARCH_API_KEY: 'test-only' },
    fetcher: async (url, options) => {
      assert.equal(url.origin, 'https://api.search.brave.com');
      assert.equal(options.redirect, 'error');
      return Response.json({
        web: {
          results: [{ title: 'Budget', url: 'https://example.com', description: 'Reference' }],
        },
      });
    },
  });
  assert.equal(r.results[0].title, 'Budget');
  await assert.rejects(webSearch('budget', { env: {} }), /configured/);
});
test('extended spreadsheet functions calculate conditional totals, exact lookups and bounded text', () => {
  const doc = newDocument('sheet');
  doc.sheets[0].cells = {
    A1: 'Design',
    A2: 'Design',
    A3: 'Engineering',
    B1: 10,
    B2: 20,
    B3: 30,
    C1: 1,
    C2: 2,
    C3: 3,
  };
  const run = (formula) => {
    doc.sheets[0].cells.D1 = formula;
    return calculate(doc, 0, 'D1');
  };
  assert.equal(run('=SUMIFS(B1:B3,A1:A3,"Design",C1:C3,">1")'), 20);
  assert.equal(run('=COUNTIFS(A1:A3,"Design",C1:C3,">0")'), 2);
  assert.equal(run('=AVERAGEIFS(B1:B3,A1:A3,"Design")'), 15);
  assert.equal(run('=MEDIAN(B1:B3)'), 20);
  assert.equal(run('=STDEV.S(B1:B3)'), 10);
  assert.equal(run('=XLOOKUP("Engineering",A1:A3,B1:B3)'), 30);
  assert.equal(run('=XLOOKUP("Missing",A1:A3,B1:B3,"none")'), 'none');
  assert.equal(run('=XLOOKUP("Design",A1:A3,B1:B3,"none",0,-1)'), 20);
  assert.equal(run('=TEXTJOIN(" / ",TRUE,A1:A3)'), 'Design / Design / Engineering');
  assert.equal(run('=SUBSTITUTE("one one","one","two",2)'), 'one two');
  assert.equal(run('=REPT("x",40000)'), '#VALUE!');
  assert.equal(run('=SUMIFS(B1:B3,A1:A2,"Design")'), '#VALUE!');
});
