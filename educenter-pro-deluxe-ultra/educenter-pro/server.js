/* Optional zero-dependency Node server:  node server.js
   Serves the static site and exposes POST /api/call, backed by a JSON file (data/db.json).
   With it, every permission check runs on the server instead of inside the browser. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackend } from './js/server/backend.js';
import { buildProductionSeed } from './js/server/seed.js';
import { passwordOk, PASSWORD_RULE } from './js/server/core.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1'; // set HOST=0.0.0.0 to open the site from your phone on the same Wi-Fi
const PROD = process.env.EDUCENTER_MODE === 'production';
const DB_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const DB_FILE = path.join(DB_DIR, 'db.json');
const MAX_BODY = 6 * 1024 * 1024;

fs.mkdirSync(DB_DIR, { recursive: true });
const storage = {
  read: () => (fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE, 'utf8') : ''),
  write: (s) => { const tmp = `${DB_FILE}.tmp`; fs.writeFileSync(tmp, s); fs.renameSync(tmp, DB_FILE); }, // atomic replace
};

/* Production: a clean database with a single administrator taken from the environment (needed on the first start only).
   Demo accounts with well-known passwords must never exist on a public server. */
let seed;
if (PROD) {
  if (!storage.read()) {
    const adminLogin = (process.env.ADMIN_LOGIN || 'admin').trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || '';
    if (!/^[a-z0-9._-]{3,30}$/.test(adminLogin) || !passwordOk(adminPassword)) {
      console.error(`First start in production mode needs ADMIN_PASSWORD (${PASSWORD_RULE}) and optionally ADMIN_LOGIN (3–30 latin chars).`);
      process.exit(1);
    }
    seed = (now) => buildProductionSeed(now, { adminLogin, adminPassword, centerName: process.env.CENTER_NAME?.trim() || '' });
  }
}
const backend = createBackend(storage, seed ? { seed } : {});
const HSTS = process.env.HSTS === '1'; // enable only when the site is served over HTTPS (e.g. behind Caddy/nginx)

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
const PUBLIC_DIRS = ['css', 'js'];
const PUBLIC_FILES = new Set(['index.html', 'student.html', 'teacher.html']);
const HEADERS = {
  ...(HSTS ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...HEADERS, ...extra });
  res.end(body);
}

async function handleApi(req, res) {
  if (req.method !== 'POST') return send(res, 405, 'Method Not Allowed', 'text/plain', { Allow: 'POST' });
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(res, 413, JSON.stringify({ ok: false, error: { code: 'VALIDATION', message: 'Запрос слишком большой' } }), 'application/json'); chunks.push(c); }
  let payload;
  try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, JSON.stringify({ ok: false, error: { code: 'VALIDATION', message: 'Некорректный запрос' } }), 'application/json'); }
  const out = await backend.call(String(payload?.method || ''), payload?.token, payload?.args);
  // Handled business errors travel as 200 + {ok:false}; only real server faults use a 5xx status.
  const { status, ...body } = out;
  return send(res, status >= 500 ? status : 200, JSON.stringify(body), 'application/json');
}

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, 'Bad Request'); }
  if (rel === '/') rel = '/index.html';
  const clean = path.normalize(rel).replace(/^([/\\])+/, '');
  const top = clean.split(path.sep)[0];
  if (!(PUBLIC_FILES.has(clean) || PUBLIC_DIRS.includes(top))) return send(res, 404, 'Not Found');
  const file = path.join(ROOT, clean);
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not Found');
    let body = data;
    if (path.extname(file) === '.html') body = Buffer.from(data.toString('utf8').replace('</head>', `  <meta name="educenter-backend" content="server">\n${PROD ? '  <meta name="educenter-mode" content="production">\n' : ''}</head>`));
    send(res, 200, req.method === 'HEAD' ? '' : body, TYPES[path.extname(file)] || 'application/octet-stream');
  });
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/healthz') { // liveness probe for the hosting platform / monitoring: reveals nothing about the data
    try { backend.call('ping'); return send(res, 200, JSON.stringify({ ok: true }), 'application/json'); } catch { return send(res, 503, JSON.stringify({ ok: false }), 'application/json'); }
  }
  (url === '/api/call' ? handleApi(req, res) : Promise.resolve(serveStatic(req, res))).catch((e) => {
    console.error(e);
    if (!res.headersSent) send(res, 500, 'Internal Server Error');
  });
});
server.listen(PORT, HOST, () => {
  console.log(`EduCenter PRO${PROD ? ' (production)' : ''}: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Database file: ${DB_FILE}`);
});
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { console.log(`${sig}: shutting down`); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
