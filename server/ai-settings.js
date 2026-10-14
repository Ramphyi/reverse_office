// SPDX-License-Identifier: MIT
// Original provider configuration; no SDK or additional dependencies.
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import path from 'node:path';

const invalid = (message, status = 400) => Object.assign(Error(message), { status });
export function localEndpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw invalid('Enter a valid local model URL');
  }
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/v1\/?$/.test(url.pathname)
  )
    throw invalid('Local models must use http://localhost:PORT/v1 or a loopback IP');
  return url.href.replace(/\/$/, '');
}

async function jsonResponse(response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw invalid(
      `AI provider returned HTTP ${response.status}. Check the key, model and endpoint.`,
      502,
    );
  }
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2 * 1024 * 1024) throw invalid('AI response exceeds 2 MB', 502);
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function createAISettings(directory, { env = process.env, request = fetch } = {}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'ai-settings.json'),
    master = path.join(directory, 'ai-master.key');
  if (existsSync(file) && !existsSync(master))
    throw Error('AI master key is missing; restore it from the protected backup.');
  if (!existsSync(master)) writeFileSync(master, randomBytes(32), { mode: 0o600, flag: 'wx' });
  const key = readFileSync(master);
  let saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const encrypt = (secret) => {
    if (!secret) return '';
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    return Buffer.concat([
      iv,
      cipher.update(secret, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64');
  };
  const decrypt = (secret) => {
    if (!secret) return '';
    const bytes = Buffer.from(secret, 'base64'),
      cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString('utf8');
  };
  const current = () =>
    saved
      ? { ...saved, apiKey: decrypt(saved.secret) }
      : {
          provider: env.OPENCODE_BASE_URL
            ? 'opencode'
            : env.AI_BASE_URL
              ? 'environment'
              : 'disabled',
          baseUrl: env.AI_BASE_URL || '',
          model: env.AI_MODEL || 'qwen2.5:7b',
          apiKey: env.AI_API_KEY || '',
          vision: env.AI_VISION === 'true',
        };
  const publicConfig = (config = current()) => ({
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    vision: !!config.vision,
    hasKey: !!config.apiKey,
    revision: config.revision || 0,
  });
  const prepare = (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw invalid('Invalid AI settings');
    if (!['disabled', 'openai', 'local', 'environment', 'opencode'].includes(input.provider))
      throw invalid('Choose an AI provider');
    if (input.model !== undefined && (typeof input.model !== 'string' || input.model.length > 120))
      throw invalid('Invalid model name');
    if (
      input.apiKey !== undefined &&
      (typeof input.apiKey !== 'string' ||
        input.apiKey.length > 512 ||
        /[\s\x00-\x1f]/.test(input.apiKey))
    )
      throw invalid('Invalid API key');
    if (input.removeKey !== undefined && typeof input.removeKey !== 'boolean')
      throw invalid('Invalid key removal setting');
    if (input.vision !== undefined && typeof input.vision !== 'boolean')
      throw invalid('Invalid vision setting');
    if (input.provider === 'environment' && !env.AI_BASE_URL)
      throw invalid('AI_BASE_URL is not configured on the server');
    if (input.provider === 'opencode' && !env.OPENCODE_BASE_URL)
      throw invalid('OPENCODE_BASE_URL is not configured on the server');
    const old = current(),
      provider = input.provider;
    const config = {
      provider,
      model: (input.model ?? old.model).trim(),
      vision: !!input.vision,
      baseUrl:
        provider === 'openai'
          ? 'https://api.openai.com/v1'
          : provider === 'local'
            ? localEndpoint(input.baseUrl)
            : env.AI_BASE_URL || '',
      apiKey: input.removeKey ? '' : input.apiKey || (old.provider === provider ? old.apiKey : ''),
      revision: old.revision || 0,
    };
    if (provider === 'local' || provider === 'disabled') config.apiKey = '';
    if (provider === 'environment' || provider === 'opencode') config.apiKey = env.AI_API_KEY || '';
    return config;
  };
  async function upstream(config, endpoint, body, signal) {
    if (config.provider === 'disabled' || config.provider === 'opencode')
      throw invalid('Choose OpenAI or a local model');
    if (config.provider === 'openai' && !config.apiKey)
      throw invalid('Save an OpenAI API key first');
    const timeout = AbortSignal.timeout(60000);
    try {
      return await jsonResponse(
        await request(config.baseUrl + endpoint, {
          method: body ? 'POST' : 'GET',
          redirect: 'error',
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          headers: {
            'Content-Type': 'application/json',
            ...(config.apiKey ? { Authorization: 'Bearer ' + config.apiKey } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    } catch (error) {
      if (error.status) throw error;
      throw invalid(
        'AI service unavailable or request timed out. Check that the model server is running.',
        502,
      );
    }
  }
  const complete = (config, messages, tools, signal) => {
    if (!config.model) throw invalid('Select a model in AI settings');
    return upstream(
      config,
      '/chat/completions',
      {
        model: config.model,
        messages,
        ...(tools?.length ? { tools } : {}),
        ...(config.provider === 'openai'
          ? { max_completion_tokens: 3000, store: false }
          : { max_tokens: 3000, temperature: 0.3 }),
      },
      signal,
    );
  };
  return {
    current,
    publicConfig,
    prepare,
    complete,
    save(input) {
      if (!input || typeof input !== 'object') throw invalid('Invalid AI settings');
      if (input.revision !== publicConfig().revision)
        throw invalid('Settings changed. Reload before saving.', 409);
      const config = prepare(input);
      if (!['disabled', 'opencode'].includes(config.provider) && !config.model)
        throw invalid('Select a model');
      // Removing a key is always allowed, including while OpenAI is selected.
      const next = { ...config, revision: config.revision + 1, secret: encrypt(config.apiKey) };
      delete next.apiKey;
      const temp = file + '.tmp';
      writeFileSync(temp, JSON.stringify(next), { mode: 0o600 });
      renameSync(temp, file);
      saved = next;
      return publicConfig({ ...config, revision: next.revision });
    },
    async models(input) {
      const result = await upstream(prepare(input), '/models');
      return {
        models: [
          ...new Set(
            (result.data || [])
              .filter((m) => typeof m.id === 'string' && m.id.length <= 120)
              .map((m) => m.id),
          ),
        ]
          .sort()
          .slice(0, 1000),
      };
    },
    async test(input) {
      const config = prepare(input);
      const result = await complete(config, [{ role: 'user', content: 'Reply with OK.' }]);
      if (!result.choices?.[0]?.message)
        throw invalid('The model did not return a chat response', 502);
      return { ok: true, model: config.model };
    },
  };
}

export function installAISettings(app, settings, store) {
  app.get('/api/ai/settings', (req, res) => res.json(settings.publicConfig()));
  for (const [route, action] of [
    ['settings', 'save'],
    ['models', 'models'],
    ['test', 'test'],
  ]) {
    app.post('/api/ai/' + route, async (req, res) => {
      if (req.user.role !== 'admin') throw invalid('Administrator access required', 403);
      const result = await settings[action](req.body);
      if (action === 'save')
        store.audit(req.user.id, 'ai.settings', 'organisation', {
          provider: result.provider,
          model: result.model,
        });
      res.json(result);
    });
  }
}
