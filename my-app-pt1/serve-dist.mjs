// Production static server for the built frontend (dist/), used by the pm2 "frontend" app
// instead of the Vite dev server, which sends every module unbundled, unminified and
// uncompressed (the landing page alone was ~2 MB, the spreadsheet editor ~19 MB).
//
// - Precompresses every file once at startup (brotli + gzip) and serves whichever the
//   browser accepts.
// - Hashed files under /assets/ are cached by browsers for a year; index.html is never
//   cached, so a new build is picked up on the next page load.
// - Any other path (e.g. /like-excel-list) gets index.html so client-side routes work
//   on refresh / deep links.
// Node built-ins only, no extra dependencies.
//
// Usage: node serve-dist.mjs [--host 0.0.0.0] [--port 5173]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const HOST = argValue('host', '0.0.0.0');
const PORT = Number(argValue('port', '5173'));
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map', '.ttf', '.ico']);

// relative URL path → { type, raw, br, gz }
const files = new Map();

function loadDist(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadDist(full);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    const raw = fs.readFileSync(full);
    const file = { type: MIME[ext] || 'application/octet-stream', raw, br: null, gz: null };
    if (COMPRESSIBLE.has(ext) && raw.length > 1024) {
      file.br = zlib.brotliCompressSync(raw, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
        },
      });
      file.gz = zlib.gzipSync(raw, { level: 9 });
    }
    files.set('/' + path.relative(DIST, full).split(path.sep).join('/'), file);
  }
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error(`❌ ${DIST}/index.html not found — run "npx vite build" first.`);
  process.exit(1);
}
const started = Date.now();
loadDist(DIST);
console.log(`📦 Loaded and precompressed ${files.size} files from dist/ in ${Date.now() - started} ms`);

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }

  let file = files.get(urlPath);
  let isIndex = urlPath === '/index.html';
  if (!file) {
    // Missing hashed asset (e.g. an old tab asking for a file from a previous build):
    // a real 404 rather than index.html, so the browser doesn't try to run HTML as JS.
    if (urlPath.startsWith('/assets/') || path.extname(urlPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end('Not found');
      return;
    }
    file = files.get('/index.html');
    isIndex = true;
  }

  const accept = String(req.headers['accept-encoding'] || '');
  let body = file.raw;
  let encoding = null;
  if (file.br && /\bbr\b/.test(accept)) {
    body = file.br;
    encoding = 'br';
  } else if (file.gz && /\bgzip\b/.test(accept)) {
    body = file.gz;
    encoding = 'gzip';
  }

  const headers = {
    'Content-Type': file.type,
    'Content-Length': body.length,
    'Cache-Control': urlPath.startsWith('/assets/') && !isIndex
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };
  if (file.br || file.gz) headers['Vary'] = 'Accept-Encoding';
  if (encoding) headers['Content-Encoding'] = encoding;

  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 Frontend (production build) at http://${HOST}:${PORT}/`);
});
