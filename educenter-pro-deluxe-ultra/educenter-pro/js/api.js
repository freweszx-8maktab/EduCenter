/* API client.
   Two transports, chosen automatically at start-up:
   - "server": the Node backend (npm start) → every permission check runs on a real server
   - "local":  the same backend code running in the browser on top of localStorage (Live Server demo mode) */
import { createBackend } from './server/backend.js';

const TOKEN_KEY = 'educenter.token';
const DB_KEY = 'educenter.db.v1';

export class ApiError extends Error {
  constructor(code, message, extra = {}) { super(message); this.code = code; this.extra = extra; }
}

let mode = 'local';
let backend = null;
const memory = { v: '' };

const storage = {
  read() { try { return localStorage.getItem(DB_KEY) || ''; } catch { return memory.v; } },
  write(s) {
    try { localStorage.setItem(DB_KEY, s); } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) throw e;
      memory.v = s; // storage blocked (private mode): keep for this tab only
    }
  },
};

export async function init() {
  // server.js injects <meta name="educenter-backend" content="server"> into the pages it serves.
  // On a plain static host (VS Code Live Server) the tag is absent, so no failing request is made.
  const viaServer = document.querySelector('meta[name="educenter-backend"]')?.content === 'server';
  if (viaServer) {
    try {
      const r = await fetch('/api/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'ping' }) });
      const j = await r.json();
      if (j && j.ok === true) { mode = 'server'; return mode; }
    } catch { /* fall back to local mode */ }
  }
  backend = createBackend(storage);
  mode = 'local';
  return mode;
}
export const getMode = () => mode;

export const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

async function raw(method, args) {
  const token = getToken();
  if (mode === 'server') {
    let res;
    try {
      res = await fetch('/api/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, token, args }) });
    } catch { throw new ApiError('NETWORK', 'Нет соединения с сервером. Проверьте интернет и повторите.'); }
    let j;
    try { j = await res.json(); } catch { throw new ApiError('NETWORK', 'Сервер вернул неожиданный ответ.'); }
    return j;
  }
  await new Promise((r) => setTimeout(r, 60));
  return backend.call(method, token, structuredClone(args ?? {}));
}

export async function call(method, args) {
  const j = await raw(method, args);
  if (j.ok) return j.data;
  const { code, message, ...extra } = j.error || {};
  if (code === 'UNAUTHENTICATED' && method !== 'login') { setToken(null); window.dispatchEvent(new CustomEvent('educenter:signed-out', { detail: message })); }
  throw new ApiError(code || 'INTERNAL', message || 'Ошибка', extra);
}

export async function login(loginName, password) {
  const data = await call('login', { login: loginName, password });
  setToken(data.token);
  return data;
}
export async function logout() { try { await call('logout'); } catch { /* already signed out */ } setToken(null); }
