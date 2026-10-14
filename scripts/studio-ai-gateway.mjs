// SPDX-License-Identifier: MIT
// Optional host service. Node and its dependencies are NOT bundled in the Studio image.
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAISettings } from '../server/ai-settings.js';

export function createGateway({
  directory,
  port = 3210,
  origins = ['http://localhost:3002', 'http://127.0.0.1:3002'],
  settingsOptions,
} = {}) {
  const settings = createAISettings(directory, settingsOptions);
  const tokenFile = path.join(directory, 'studio-pairing.key');
  if (!existsSync(tokenFile))
    writeFileSync(tokenFile, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  const token = readFileSync(tokenFile, 'utf8').trim();
  let active = 0;
  const server = http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(body));
    };
    const hostPort = server.address()?.port || port;
    if (
      !['127.0.0.1:' + hostPort, 'localhost:' + hostPort].includes(req.headers.host) ||
      !origins.includes(req.headers.origin)
    )
      return send(403, { error: 'Untrusted browser origin or host' });
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.writeHead(204);
      return res.end();
    }
    const given = Buffer.from(req.headers.authorization || ''),
      expected = Buffer.from('Bearer ' + token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      return send(401, { error: 'Enter the pairing code from your local gateway in AI settings' });
    if (
      req.method !== 'POST' ||
      !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')
    )
      return send(405, { error: 'JSON POST required' });
    if (!['/settings', '/save', '/models', '/test', '/chat/completions'].includes(req.url))
      return send(404, { error: 'Unknown endpoint' });
    if (active >= 4) return send(429, { error: 'Gateway busy; try again shortly' });
    active++;
    const controller = new AbortController();
    const abort = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', abort);
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4 * 1024 * 1024)
          throw Object.assign(Error('Request too large'), { status: 413 });
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw Object.assign(Error('Invalid JSON'), { status: 400 });
      }
      let result;
      if (req.url === '/settings') result = settings.publicConfig();
      else if (req.url === '/save') result = settings.save(body);
      else if (req.url === '/models') result = await settings.models(body);
      else if (req.url === '/test') result = await settings.test(body);
      else {
        const config = settings.current();
        if (body.revision !== config.revision)
          throw Object.assign(Error('AI settings changed. Reopen AI settings before sending.'), {
            status: 409,
          });
        if (
          !Array.isArray(body.messages) ||
          body.messages.length > 60 ||
          !Array.isArray(body.tools) ||
          body.tools.length > 4
        )
          throw Object.assign(Error('Invalid agent request'), { status: 400 });
        // No caller-provided URL, key, model or generation parameters are forwarded.
        result = await settings.complete(config, body.messages, body.tools, controller.signal);
      }
      send(200, result);
    } catch (error) {
      send(error.status || 500, { error: error.status ? error.message : 'Gateway request failed' });
    } finally {
      active--;
      res.off('close', abort);
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return { server, settings, tokenFile };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const gateway = createGateway({
    directory: path.resolve(process.env.STUDIO_AI_DATA || 'data/studio-ai'),
  });
  gateway.server.listen(3210, '127.0.0.1', () => {
    console.log('Studio AI gateway: http://127.0.0.1:3210 (loopback only)');
    console.log(
      'Pairing code (paste into Studio AI settings): ' +
        readFileSync(gateway.tokenFile, 'utf8').trim(),
    );
    console.log('Protect this code and the gateway data directory. OpenAI keys are never logged.');
  });
}
