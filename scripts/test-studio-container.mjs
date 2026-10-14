// Development verification only; not distributed in the image.
import assert from 'node:assert/strict';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const base = process.env.STUDIO_URL || 'http://127.0.0.1:3002';
const origin = new URL(base);
const results = [];
async function check(name, fn) {
  await fn();
  results.push(name);
  console.log('PASS ' + name);
}
await check('Immutable asset manifest matches reviewed source bytes', async () => {
  const response = await fetch(base + '/manifest.json');
  assert.equal(response.status, 200);
  const manifest = await response.json();
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.assets.length, 10);
  for (const asset of manifest.assets) {
    const response = await fetch(base + '/' + asset.path);
    assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    const source = await readFile(new URL('../public/studio/' + asset.path, import.meta.url));
    assert.equal(createHash('sha256').update(source).digest('hex'), asset.sha256);
  }
});
await check(
  'CSP limits model networking to explicit loopback origins and blocks foreign assets',
  async () => {
    const response = await fetch(base);
    const csp = response.headers.get('content-security-policy');
    for (const directive of [
      "default-src 'none'",
      "script-src 'self'",
      'connect-src http://localhost:11434 http://127.0.0.1:11434 http://localhost:1234 http://127.0.0.1:1234',
      "object-src 'none'",
      "frame-ancestors 'self'",
    ])
      assert.ok(csp.includes(directive));
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  },
);
await check('Read-only exact paths reject writes and traversal; HEAD has no body', async () => {
  for (const path of [
    '/server.c',
    '/.env',
    '/etc/passwd',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/app.js/extra',
  ])
    assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await fetch(base, { method: 'POST', body: 'anything' })).status, 405);
  const response = await fetch(base, { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
  assert.ok(Number(response.headers.get('content-length')) > 0);
});
await check('Twenty concurrent requests complete without runtime packages', async () => {
  const responses = await Promise.all(
    Array.from({ length: 20 }, () => fetch(base + '/health').then((r) => r.text())),
  );
  assert.ok(responses.every((value) => value === 'ok'));
});
await check('Oversized headers are bounded', async () => {
  const response = await new Promise((resolve, reject) => {
    const socket = net.connect(Number(origin.port), origin.hostname, () =>
      socket.write('GET / HTTP/1.1\r\nHost: localhost\r\nX-Fill: ' + 'x'.repeat(8500)),
    );
    let value = '';
    socket.setTimeout(12000, () => {
      socket.destroy();
      reject(Error('Header test timed out'));
    });
    socket.on('data', (d) => (value += d));
    socket.on('end', () => resolve(value));
    socket.on('error', (e) => (value ? resolve(value) : reject(e)));
  });
  assert.match(response, /431 Request Header Fields Too Large/);
});
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../artifacts/studio-container-checks.json', import.meta.url),
  JSON.stringify({ base, checks: results, status: 'passed' }, null, 2),
);
