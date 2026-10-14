// SPDX-License-Identifier: MIT
// Only operator-configured endpoints and explicitly allowlisted tools are callable.
import { z } from 'zod';
const serverSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  url: z.string().url(),
  tokenEnv: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,100}$/)
    .optional(),
  tools: z.array(z.string().min(1).max(100)).max(30),
  roles: z.array(z.enum(['admin', 'manager', 'member'])).default(['admin']),
});
export function connectorServers(env = process.env) {
  const list = z
    .array(serverSchema)
    .max(10)
    .parse(JSON.parse(env.NOVA_MCP_SERVERS || '[]'));
  for (const s of list) {
    const u = new URL(s.url);
    if (
      u.username ||
      u.password ||
      u.hash ||
      (u.protocol !== 'https:' &&
        !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))
    )
      throw Error('MCP requires HTTPS or explicit loopback HTTP');
  }
  if (new Set(list.map((s) => s.id)).size !== list.length)
    throw Error('Duplicate MCP server identifier');
  return list;
}
export async function limitedText(response, max = 2000000) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw Error('Connector response too large');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString('utf8');
}
async function eventResponse(response, id) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('MCP response is empty');
  const decoder = new TextDecoder();
  let pending = '',
    size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2000000) throw Error('Connector response too large');
      pending += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        const event = pending.slice(0, boundary.index);
        pending = pending.slice(boundary.index + boundary[0].length);
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) {
          const message = JSON.parse(data);
          if (message.id === id) return message;
        }
      }
    }
    throw Error('MCP stream ended without a matching response');
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function mcpRequest(
  server,
  method,
  params,
  { env = process.env, fetcher = fetch, signal = AbortSignal.timeout(15000) } = {},
) {
  let session = '',
    next = 0;
  const headers = () => ({
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(session ? { 'Mcp-Session-Id': session } : {}),
    ...(server.tokenEnv && env[server.tokenEnv]
      ? { Authorization: 'Bearer ' + env[server.tokenEnv] }
      : {}),
  });
  const rpc = async (method, params, notification = false) => {
    const id = ++next;
    const r = await fetcher(server.url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params }),
      signal,
      redirect: 'error',
    });
    if (!r.ok) throw Error('MCP service request failed');
    if (r.headers.get('mcp-session-id')) session = r.headers.get('mcp-session-id');
    if (notification) {
      await r.body?.cancel();
      return;
    }
    const response = r.headers.get('content-type')?.includes('text/event-stream')
      ? await eventResponse(r, id)
      : JSON.parse(await limitedText(r));
    if (response?.id !== id || response.error)
      throw Error('MCP returned an invalid or failed response');
    return response.result;
  };
  try {
    const init = await rpc('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'Nova Reverse Office', version: '1.0' },
    });
    if (!init?.capabilities?.tools) throw Error('MCP server does not offer tools');
    await rpc('notifications/initialized', {}, true);
    return await rpc(method, params);
  } finally {
    if (session)
      await fetcher(server.url, {
        method: 'DELETE',
        headers: headers(),
        signal: AbortSignal.timeout(3000),
        redirect: 'error',
      })
        .then((r) => r.body?.cancel())
        .catch(() => {});
  }
}
export async function webSearch(
  query,
  { env = process.env, fetcher = fetch, signal = AbortSignal.timeout(15000) } = {},
) {
  if (!env.BRAVE_SEARCH_API_KEY)
    throw Error('Web search needs BRAVE_SEARCH_API_KEY configured by the operator');
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '5');
  const r = await fetcher(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY },
    signal,
    redirect: 'error',
  });
  if (!r.ok) throw Error('Search provider request failed');
  const result = JSON.parse(await limitedText(r));
  return {
    results: (result.web?.results || []).slice(0, 5).map((v) => ({
      title: String(v.title).slice(0, 300),
      url: /^https?:\/\//.test(v.url) ? v.url : '',
      description: String(v.description || '').slice(0, 2000),
    })),
  };
}
export function installConnectorCatalog(app, { fail }) {
  app.get('/api/ai/connectors', (req, res) =>
    res.json({
      webSearch: !!process.env.BRAVE_SEARCH_API_KEY,
      servers: connectorServers()
        .filter((s) => s.roles.includes(req.user.role))
        .map(({ id, tools, roles }) => ({ id, tools, roles })),
    }),
  );
  app.post('/api/ai/connectors/:id/discover', async (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Administrator required');
    const server = connectorServers().find((s) => s.id === req.params.id);
    if (!server) fail(404, 'Connector not configured');
    const result = await mcpRequest(server, 'tools/list', {});
    res.json({
      tools: (result.tools || [])
        .filter((t) => server.tools.includes(t.name))
        .map((t) => ({
          name: t.name,
          description: String(t.description || '').slice(0, 2000),
          inputSchema: t.inputSchema,
        })),
    });
  });
}
