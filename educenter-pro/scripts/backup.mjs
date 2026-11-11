/* Backup of the JSON database:  node scripts/backup.mjs
   Copies data/db.json to backups/db-YYYYMMDD-HHMMSS.json and keeps the newest KEEP files (default 30).
   Env: DATA_DIR (as for the server), BACKUP_DIR, KEEP. Safe to run while the server is running:
   the server replaces db.json atomically, so a copy is always a complete file. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(ROOT, 'backups'));
const KEEP = Math.max(1, Number(process.env.KEEP) || 30);
const src = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(src)) { console.error(`No database at ${src}`); process.exit(1); }
JSON.parse(fs.readFileSync(src, 'utf8')); // refuse to back up a corrupt file silently
fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
const d = new Date(); const p = (n) => String(n).padStart(2, '0');
const name = `db-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
fs.copyFileSync(src, path.join(BACKUP_DIR, name));
fs.chmodSync(path.join(BACKUP_DIR, name), 0o600);
const all = fs.readdirSync(BACKUP_DIR).filter((f) => /^db-\d{8}-\d{6}\.json$/.test(f)).sort();
for (const old of all.slice(0, Math.max(0, all.length - KEEP))) fs.unlinkSync(path.join(BACKUP_DIR, old));
console.log(`Backup: ${path.join(BACKUP_DIR, name)} (kept ${Math.min(all.length, KEEP)})`);
