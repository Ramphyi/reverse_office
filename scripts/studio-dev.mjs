// Development/test host only. Node is not distributed in the standalone Studio image.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Set([
  'index.html',
  'agent.js',
  'app.js',
  'core.js',
  'formats.js',
  'assistant.js',
  'floating.js',
  'search.js',
  'styles.css',
  'LICENSE',
]);
http
  .createServer(async (req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!files.has(name)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    try {
      const data = await readFile(new URL('../public/studio/' + name, import.meta.url));
      res.setHeader(
        'Content-Type',
        name.endsWith('.js')
          ? 'text/javascript'
          : name.endsWith('.css')
            ? 'text/css'
            : name.endsWith('.html')
              ? 'text/html'
              : 'text/plain',
      );
      res.setHeader('Cache-Control', 'no-store');
      res.end(data);
    } catch {
      res.writeHead(500);
      res.end('Unavailable');
    }
  })
  .listen(3104, '127.0.0.1', () => console.log('Studio development: http://127.0.0.1:3104'));
