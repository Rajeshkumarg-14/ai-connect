import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
const directory = resolve(import.meta.dirname, '..', 'site');
const port = Number(process.env.SITE_PORT || 4319);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
const server = createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) { res.writeHead(403); return res.end('Unrecognized local host.'); }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end('Read-only preview.'); }
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const file = resolve(directory, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!file.startsWith(`${directory}${sep}`)) { res.writeHead(403); return res.end('Path outside site.'); }
    if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('This page is still being prepared.'); }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }); res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
  } catch { res.writeHead(400); res.end('Invalid path.'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Connect landing page: http://127.0.0.1:${port}\nStatic local preview. Nothing is published.`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
process.on('SIGINT', () => server.close()); process.on('SIGTERM', () => server.close());
