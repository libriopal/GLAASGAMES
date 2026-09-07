// scripts/serve-web.mjs — static file server for the browser host.
//
// Zero dependencies, on purpose. This has to run in Termux on a phone, where
// every added package is another thing that can fail to build against bionic.
// node:http is already there.
//
// WHY A SERVER AT ALL, rather than opening index.html from the filesystem:
// ES module imports and fetch() are both blocked under file:// by CORS, and
// WebGPU requires a secure context. http://localhost counts as secure, so this
// is the shortest path to a working page on the device itself.

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number.parseInt(process.env.PORT ?? '8080', 10);
const HOST = process.env.HOST ?? '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  // Served as plain text because it is fetched with .text(), not imported.
  '.wgsl': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }

  if (pathname === '/' || pathname === '') pathname = '/web/index.html';

  // Path traversal guard: resolve, then confirm the result is still inside ROOT.
  // Checking the resolved path rather than filtering ".." handles encoded and
  // symlinked variants that a string filter would miss.
  const target = resolve(join(ROOT, normalize(pathname)));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }

  let stat;
  try {
    stat = statSync(target);
  } catch {
    response.writeHead(404).end(`not found: ${pathname}`);
    return;
  }
  if (stat.isDirectory()) {
    response.writeHead(404).end('not found');
    return;
  }

  response.writeHead(200, {
    'content-type': MIME[extname(target)] ?? 'application/octet-stream',
    'content-length': stat.size,
    // The build changes on every rebuild and this is a dev server; a cached
    // stale main.js after `npm run build:web` is a genuinely confusing bug.
    'cache-control': 'no-store',
  });
  createReadStream(target).pipe(response);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: PORT=8081 npm run serve:web`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`GLAASGAMES serving ${ROOT}`);
  console.log(`  open  http://localhost:${PORT}/`);
  console.log('');
  console.log('  WebGPU needs a secure context. http://localhost qualifies; a LAN IP');
  console.log('  does not, so open it on this device rather than from another machine.');
});
