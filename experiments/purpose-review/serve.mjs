import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/preview.css', ['preview.css', 'text/css; charset=utf-8']],
  ...['core', 'storage', 'sample', 'preview'].map(name => ['/' + name + '.js', [name + '.js', 'text/javascript; charset=utf-8']]),
  ['/brand.svg', ['../../assets/arc90-mark.svg', 'image/svg+xml']],
]);
const server = createServer(async (req, res) => {
  const entry = files.get(new URL(req.url, 'http://localhost').pathname);
  if (!entry || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(path.resolve(dir, entry[0]));
    res.writeHead(200, {
      'Content-Type': entry[1], 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500); res.end('Preview asset unavailable'); }
});
server.listen(Number(process.env.PORT || 5187), '127.0.0.1', () => console.log('Arc90 purpose review: http://127.0.0.1:' + server.address().port));
