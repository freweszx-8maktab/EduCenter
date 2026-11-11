/* Process-level tests of the real Node server in production mode (no demo data, health check, backups). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'educenter-'));
const ADMIN = { ADMIN_LOGIN: 'owner', ADMIN_PASSWORD: 'Launch#2026x' };

function start(env) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  proc.stdout.on('data', (d) => { out += d; }); proc.stderr.on('data', (d) => { out += d; });
  const ready = new Promise((resolve, reject) => {
    const t = setInterval(() => { if (out.includes('Database file')) { clearInterval(t); resolve(); } }, 30);
    proc.on('exit', (c) => { clearInterval(t); reject(new Error(`exited ${c}: ${out}`)); });
    setTimeout(() => reject(new Error('start timeout: ' + out)), 8000).unref();
  });
  const base = `http://127.0.0.1:${port}`;
  const api = async (method, token, args) => (await fetch(`${base}/api/call`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, token, args }) })).json();
  const stop = () => new Promise((r) => { proc.once('exit', r); proc.kill('SIGTERM'); });
  return { ready, base, api, stop, proc };
}

test('production: refuses to start the first time without a strong ADMIN_PASSWORD', () => {
  for (const pw of [undefined, 'short1', 'onlyletters']) {
    const r = spawnSync(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, EDUCENTER_MODE: 'production', DATA_DIR: tmp(), PORT: '0', ...(pw ? { ADMIN_PASSWORD: pw } : { ADMIN_PASSWORD: '' }) }, encoding: 'utf8', timeout: 8000 });
    assert.equal(r.status, 1, `password ${pw}`);
    assert.match(r.stderr, /ADMIN_PASSWORD/);
  }
});

test('production: clean database, only the configured admin, no demo accounts, hardened responses', async () => {
  const dir = tmp();
  const s = start({ EDUCENTER_MODE: 'production', DATA_DIR: dir, CENTER_NAME: 'Моя школа', ...ADMIN });
  await s.ready;
  try {
    const h = await (await fetch(`${s.base}/healthz`)).json();
    assert.deepEqual(h, { ok: true });
    // demo hint is not shown: the page is flagged as production and the demo data does not exist
    const page = await (await fetch(`${s.base}/index.html`)).text();
    assert.match(page, /educenter-mode" content="production"/);
    for (const [login, password] of [['dilshod', 'Student#2026'], ['nargiza', 'Teacher#2026'], ['admin', 'Admin#2026'], ['admin', 'Launch#2026x']]) {
      const r = await s.api('login', null, { login, password });
      assert.equal(r.ok, false, `${login} must not exist`);
    }
    const r = await s.api('login', null, ADMIN.ADMIN_LOGIN === 'owner' ? { login: 'owner', password: ADMIN.ADMIN_PASSWORD } : {});
    assert.equal(r.ok, true);
    const token = r.data.token;
    assert.equal(r.data.user.role, 'admin');
    // the empty system is immediately usable: create a group, a teacher and a student from the admin API
    const org = (await s.api('admin.org', token)).data;
    assert.equal(org.groups.length, 0); assert.equal(org.courses.length, 1);
    const t = await s.api('admin.createTeacher', token, { name: 'Первый Учитель', login: 'first.teacher', password: 'Teach#2026x', subjects: ['Grammar'], email: 't@mail.example' });
    assert.equal(t.ok, true, JSON.stringify(t));
    const g = await s.api('admin.createGroup', token, { name: 'Группа А', courseId: 'c1', teacherId: t.data.id });
    assert.equal(g.ok, true, JSON.stringify(g));
    const st = await s.api('admin.createStudent', token, { name: 'Первый Ученик', login: 'first.student', password: 'Learn#2026x', groupId: g.data.id, phone: '+998 90 000 00 00', email: 's@mail.example' });
    assert.equal(st.ok, true, JSON.stringify(st));
    const stTok = (await s.api('login', null, { login: 'first.student', password: 'Learn#2026x' })).data.token;
    assert.equal((await s.api('overview', stTok)).ok, true); // a brand-new student on a clean system works
    // headers + static allow-list
    const res = await fetch(`${s.base}/teacher.html`);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('strict-transport-security'), null); // only with HSTS=1
    for (const u of ['server.js', 'data/db.json', 'package.json', 'scripts/backup.mjs', 'tests/server.test.mjs', '.env']) assert.equal((await fetch(`${s.base}/${u}`)).status, 404, u);
    // nothing sensitive in the file on disk
    const raw = fs.readFileSync(path.join(dir, 'db.json'), 'utf8');
    for (const secret of [ADMIN.ADMIN_PASSWORD, 'Teach#2026x', 'Learn#2026x', token]) assert.ok(!raw.includes(secret));
  } finally { await s.stop(); }

  // restart: data survives and ADMIN_PASSWORD is no longer needed
  const again = start({ EDUCENTER_MODE: 'production', DATA_DIR: dir });
  await again.ready;
  try {
    assert.equal((await again.api('login', null, { login: 'first.student', password: 'Learn#2026x' })).ok, true);
    assert.equal((await again.api('login', null, { login: 'owner', password: ADMIN.ADMIN_PASSWORD })).ok, true);
  } finally { await again.stop(); }
});

test('production: HSTS only when asked; graceful shutdown on SIGTERM', async () => {
  const s = start({ EDUCENTER_MODE: 'production', DATA_DIR: tmp(), HSTS: '1', ...ADMIN });
  await s.ready;
  const res = await fetch(`${s.base}/index.html`);
  assert.match(res.headers.get('strict-transport-security'), /max-age=/);
  const code = await new Promise((r) => { s.proc.once('exit', (c) => r(c)); s.proc.kill('SIGTERM'); });
  assert.equal(code, 0);
});

test('backup script: complete copy, rotation, refuses a missing/corrupt database', () => {
  const data = tmp(); const back = tmp();
  const run = (env = {}) => spawnSync(process.execPath, ['scripts/backup.mjs'], { cwd: ROOT, env: { ...process.env, DATA_DIR: data, BACKUP_DIR: back, ...env }, encoding: 'utf8' });
  assert.equal(run().status, 1); // no db yet
  fs.writeFileSync(path.join(data, 'db.json'), '{broken');
  assert.notEqual(run().status, 0); // corrupt
  fs.writeFileSync(path.join(data, 'db.json'), JSON.stringify({ meta: { version: 1 }, users: [] }));
  for (let i = 1; i <= 3; i++) {
    fs.writeFileSync(path.join(back, `db-2020010${i}-000000.json`), '{}'); // older backups
  }
  const r = run({ KEEP: '2' });
  assert.equal(r.status, 0, r.stderr);
  const left = fs.readdirSync(back).sort();
  assert.equal(left.length, 2); // rotation kept the newest 2
  const newest = left.at(-1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(back, newest), 'utf8')), { meta: { version: 1 }, users: [] });
});
