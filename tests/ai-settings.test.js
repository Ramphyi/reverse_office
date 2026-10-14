import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createAISettings, localEndpoint } from '../server/ai-settings.js';
import { createGateway } from '../scripts/studio-ai-gateway.mjs';

const temp = () => mkdtempSync(path.join(tmpdir(), 'reverse-ai-settings-'));
test('provider settings encrypt keys, redact responses, persist and reject stale updates', async () => {
  const dir = temp(),
    seen = [],
    secret = 'sk-fixture-only-no-real-key';
  const request = async (url, options) => {
    seen.push({ url, ...options, body: options.body && JSON.parse(options.body) });
    return Response.json(
      url.endsWith('/models')
        ? { data: [{ id: 'test-chat' }, { id: 'test-chat' }] }
        : { choices: [{ message: { content: 'OK' } }] },
    );
  };
  try {
    let settings = createAISettings(dir, { env: {}, request });
    const input = {
      provider: 'openai',
      model: 'test-chat',
      apiKey: secret,
      revision: 0,
      vision: true,
    };
    assert.deepEqual(await settings.models(input), { models: ['test-chat'] });
    const saved = settings.save(input);
    assert.equal(saved.hasKey, true);
    assert.equal(saved.revision, 1);
    assert.ok(!JSON.stringify(saved).includes(secret));
    assert.ok(!readFileSync(path.join(dir, 'ai-settings.json'), 'utf8').includes(secret));
    settings = createAISettings(dir, { env: {}, request });
    assert.equal(settings.current().apiKey, secret);
    await settings.complete(settings.current(), [{ role: 'user', content: 'hi' }], []);
    assert.equal(seen.at(-1).url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(seen.at(-1).headers.Authorization, 'Bearer ' + secret);
    assert.equal(seen.at(-1).body.model, 'test-chat');
    assert.equal(seen.at(-1).body.max_completion_tokens, 3000);
    assert.equal(seen.at(-1).body.store, false);
    assert.equal(seen.at(-1).body.temperature, undefined);
    assert.throws(() => settings.save(input), /Settings changed/);
    settings.save({ ...saved, model: 'different-chat' });
    assert.equal(settings.current().apiKey, secret);
    settings.save({ ...settings.publicConfig(), removeKey: true });
    assert.equal(settings.publicConfig().hasKey, false);
    await assert.rejects(settings.test(settings.publicConfig()), /API key first/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('local endpoints cannot redirect OpenAI credentials or target arbitrary network services', () => {
  for (const url of [
    'https://evil.test/v1',
    'http://127.0.0.1:1234/admin',
    'http://localhost:1234/v1?redirect=x',
    'http://user:password@localhost/v1',
    'file:///v1',
    'http://169.254.169.254/v1',
  ])
    assert.throws(() => localEndpoint(url));
  assert.equal(localEndpoint('http://127.0.0.1:2345/v1/'), 'http://127.0.0.1:2345/v1');
  const dir = temp();
  try {
    const settings = createAISettings(dir, { env: {} });
    settings.save({
      provider: 'local',
      baseUrl: 'http://localhost:1234/v1',
      model: 'local-model',
      apiKey: 'must-not-forward',
      revision: 0,
    });
    assert.equal(settings.current().apiKey, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('upstream errors and redirects never reflect provider credentials', async () => {
  const dir = temp();
  try {
    const settings = createAISettings(dir, {
      env: {},
      request: async () => new Response('secret-provider-error', { status: 401 }),
    });
    await assert.rejects(
      settings.test({ provider: 'openai', model: 'test', apiKey: 'fixture' }),
      (error) => error.status === 502 && !error.message.includes('secret-provider-error'),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway requires pairing and trusted origin, pins model, and rejects stale agent runs', async () => {
  const dir = temp(),
    seen = [];
  const gateway = createGateway({
    directory: dir,
    port: 0,
    settingsOptions: {
      env: {},
      request: async (url, options) => {
        seen.push(JSON.parse(options.body));
        return Response.json({ choices: [{ message: { content: 'OK' } }] });
      },
    },
  });
  gateway.server.listen(0, '127.0.0.1');
  await new Promise((resolve) => gateway.server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + gateway.server.address().port;
  const token = readFileSync(gateway.tokenFile, 'utf8').trim();
  const request = (route, body = {}, overrides = {}) =>
    fetch(base + route, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3002',
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...overrides,
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await request('/settings', {}, { Authorization: 'wrong' })).status, 401);
    assert.equal(
      (await request('/settings', {}, { Origin: 'https://untrusted.test' })).status,
      403,
    );
    const hostStatus = await new Promise((resolve, reject) => {
      const req = http.request(
        base + '/settings',
        { method: 'POST', headers: { Host: 'rebind.example', Origin: 'http://localhost:3002' } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end('{}');
    });
    assert.equal(hostStatus, 403);
    const saved = await (
      await request('/save', {
        provider: 'openai',
        model: 'selected-model',
        apiKey: 'fixture-key',
        revision: 0,
      })
    ).json();
    assert.equal(saved.apiKey, undefined);
    const payload = {
      model: 'attacker-model',
      revision: saved.revision,
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      baseUrl: 'https://evil.test',
    };
    assert.equal((await request('/chat/completions', payload)).status, 200);
    assert.equal(seen[0].model, 'selected-model');
    assert.equal((await request('/chat/completions', { ...payload, revision: 0 })).status, 409);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
