/* Theme preference: 'light' (default) | 'dark' | 'system'. Stored per device. */
const KEY = 'educenter.theme';
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getTheme() {
  try { const v = localStorage.getItem(KEY); return v === 'dark' || v === 'system' ? v : 'light'; } catch { return 'light'; }
}
function resolved(pref) { return pref === 'dark' || (pref === 'system' && !!mq && mq.matches) ? 'dark' : 'light'; }

export function applyTheme(pref = getTheme()) {
  const mode = resolved(pref);
  document.documentElement.setAttribute('data-theme', mode);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#161c25' : '#ffffff');
}
export function setTheme(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* applied for this session only */ }
  applyTheme(pref);
}

applyTheme();
mq?.addEventListener?.('change', () => { if (getTheme() === 'system') applyTheme(); });
// paper is white: print always in the light theme, then restore
window.addEventListener('beforeprint', () => document.documentElement.setAttribute('data-theme', 'light'));
window.addEventListener('afterprint', () => applyTheme());
