import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runLocalAgent } from '../public/studio/agent.js';
const connection = { url: 'http://localhost:11434/v1', model: 'test-tool-model' };
const documents = [
  {
    id: 'budget',
    title: 'Project budget',
    kind: 'sheet',
    sheets: [{ name: 'Costs', cells: { A1: 'Widget', B1: '7', B2: '3', B3: '=SUM(B1:B2)' } }],
  },
];
test('standalone agents reject non-loopback endpoints and missing vision before any request', async () => {
  await assert.rejects(
    runLocalAgent({
      connection: { ...connection, url: 'https://evil.example/v1' },
      prompt: 'test',
      documents,
    }),
    /allowed local/,
  );
  await assert.rejects(
    runLocalAgent({ connection, prompt: 'test', documents, images: [{ data: 'x' }] }),
    /supports images/,
  );
});
test('standalone agent performs real tool calls and delegation with original calculation engine', async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    const specialist = body.messages[0].content.includes('Spreadsheet analyst');
    const hasOutput = body.messages.some((m) => m.role === 'tool');
    let message;
    if (hasOutput) message = { content: specialist ? 'The total is 10.' : 'Verified total: 10.' };
    else
      message = {
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: specialist ? 'sheet_range' : 'delegate_agent',
              arguments: JSON.stringify(
                specialist
                  ? { id: 'budget', sheet: 'Costs', range: 'B1:B3' }
                  : { agent: 'sheets', prompt: 'Read total' },
              ),
            },
          },
        ],
      };
    return Response.json({ choices: [{ message }] });
  };
  try {
    const result = await runLocalAgent({ connection, prompt: 'Get total', documents });
    assert.equal(result.text, 'Verified total: 10.');
    assert.deepEqual(
      result.trace.map((t) => t.tool),
      ['delegate_agent', 'sheet_range'],
    );
    assert.ok(result.trace.every((t) => t.status === 'complete'));
    assert.equal(requests.length, 4);
    assert.ok(
      requests.some((r) =>
        r.messages.some((m) => m.role === 'tool' && m.content.includes('"value":10')),
      ),
    );
  } finally {
    globalThis.fetch = original;
  }
});
test('standalone model cannot access another document or execute arbitrary tools', async () => {
  const original = globalThis.fetch;
  let final;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const outputs = body.messages.filter((m) => m.role === 'tool');
    if (outputs.length) {
      final = outputs;
      return Response.json({ choices: [{ message: { content: 'Denied' } }] });
    }
    return Response.json({
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: 'one',
                function: { name: 'read_document', arguments: '{"id":"other-person"}' },
              },
              { id: 'two', function: { name: 'bash', arguments: '{"command":"run"}' } },
            ],
          },
        },
      ],
    });
  };
  try {
    const result = await runLocalAgent({ connection, prompt: 'Test', documents });
    assert.equal(result.sources.length, 0);
    assert.match(final[0].content, /not in this browser/);
    assert.match(final[1].content, /Unknown tool/);
  } finally {
    globalThis.fetch = original;
  }
});
