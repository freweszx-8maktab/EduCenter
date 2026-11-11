/* UI toolkit: safe HTML templating, icons, formatters, dialogs, toasts, chart. */

/* ---------- Safe templating: every interpolated value is escaped unless wrapped in raw() ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const raw = (s) => ({ __raw: String(s ?? '') });
const isRaw = (v) => v && typeof v === 'object' && '__raw' in v;
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) {
      const v = vals[i];
      if (Array.isArray(v)) out += v.map((x) => (isRaw(x) ? x.__raw : esc(x))).join('');
      else if (isRaw(v)) out += v.__raw;
      else if (v === false || v == null) out += '';
      else out += esc(v);
    }
  });
  return raw(out);
}
export const mount = (el, safe) => { el.innerHTML = isRaw(safe) ? safe.__raw : esc(safe); };

/* ---------- Icons (24×24, stroke) ---------- */
const P = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
  calendar: 'M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM16 3v4M8 3v4M3 10h18',
  attendance: 'M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1zM8 6H6a1 1 0 00-1 1v13a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1h-2M9 14l2 2 4-4',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  assignments: 'M6 3h9l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5M8 13h8M8 17h6',
  coins: 'M12 3a9 9 0 100 18 9 9 0 000-18zM14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5V8M12 16v1.5',
  award: 'M12 3a6 6 0 100 12 6 6 0 000-12zM8.5 14L7 22l5-3 5 3-1.5-8',
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 6h18M3 12h18M3 18h18',
  x: 'M6 6l12 12M18 6L6 18',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  pin: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5',
  alert: 'M12 3l10 18H2L12 3zM12 10v4M12 17.5v.01',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5M12 8v.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 118 0v3',
  gift: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2.5 0-4-1-4-2.5S9.5 2 12 5c2.5-3 4-.5 4 .5S14.5 7 12 7z',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M5 12l7 7 7-7',
  trophy: 'M8 4h8v6a4 4 0 01-8 0V4zM8 6H5v2a3 3 0 003 3M16 6h3v2a3 3 0 01-3 3M12 14v4M8 21h8',
  mail: 'M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM3 7l9 6 9-6',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 002 2h13',
  refresh: 'M20 11a8 8 0 10-2.3 6.3M20 4v7h-7',
};
export function icon(name, size = 20) {
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${P[name] || P.info}"/></svg>`);
}

/* ---------- Formatters (Russian) ---------- */
const parseD = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const parseStamp = (s) => { const [d, t = '00:00:00'] = s.split('T'); const [y, m, dd] = d.split('-').map(Number); const [hh, mm, ss = 0] = t.split(':').map(Number); return new Date(y, m - 1, dd, hh, mm, ss); };
const F = {
  day: new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }),
  dayWd: new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }),
  shortWd: new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }),
  month: new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }),
  dayShort: new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }),
  full: new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const fmtDay = (s) => F.day.format(parseD(s));
export const fmtDayWd = (s) => cap(F.dayWd.format(parseD(s)));
export const fmtDayShort = (s) => F.dayShort.format(parseD(s)).replace('.', '');
export const fmtFull = (s) => F.full.format(parseD(s));
export const fmtWd = (s) => cap(F.shortWd.format(parseD(s)).replace('.', ''));
export const fmtMonth = (ym) => cap(F.month.format(parseD(`${ym}-01`)).replace(' г.', ''));
export const dayNum = (s) => Number(s.slice(8, 10));
export const fmtDateTime = (s) => `${fmtDayShort(s)}, ${s.slice(11, 16)}`;
export function fmtRelative(s, now) {
  const diff = (now.getTime() - parseStamp(s).getTime()) / 60000;
  if (diff < 1) return 'только что';
  if (diff < 60) return `${Math.floor(diff)} мин назад`;
  if (diff < 1440) return `${Math.floor(diff / 60)} ч назад`;
  if (diff < 2880) return 'вчера';
  return fmtDayShort(s);
}
export function plural(n, [one, few, many]) {
  const a = Math.abs(n) % 100; const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
}
export const num = (n) => new Intl.NumberFormat('ru-RU').format(n);
export const dec = (n) => (n == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n));
export const initials = (name) => (name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const fmtBytes = (b) => (b < 1024 ? `${b} Б` : b < 1048576 ? `${Math.round(b / 1024)} КБ` : `${(b / 1048576).toFixed(1)} МБ`);
export const todayOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ---------- Domain labels ---------- */
export const ATT = {
  present: { label: 'Присутствовал', cls: 'badge--ok' },
  late: { label: 'Опоздал', cls: 'badge--warn' },
  absent: { label: 'Отсутствовал', cls: 'badge--bad' },
  excused: { label: 'Уважительная причина', cls: 'badge--info' },
};
export const attBadge = (st) => (ATT[st] ? html`<span class="badge ${ATT[st].cls}">${ATT[st].label}</span>` : html`<span class="badge badge--plain muted">Не отмечено</span>`);
export function lessonBadge(l) {
  if (l.status === 'cancelled') return html`<span class="badge badge--bad">Отменено</span>`;
  if (l.status === 'rescheduled') return html`<span class="badge badge--warn">Перенесено</span>`;
  if (l.phase === 'now') return html`<span class="badge badge--info">Идёт сейчас</span>`;
  if (l.phase === 'finished') return html`<span class="badge badge--plain">Завершено</span>`;
  return html`<span class="badge badge--plain">Запланировано</span>`;
}
export const gradeClass = (p) => (p >= 85 ? 'grade--ok' : p >= 70 ? '' : p >= 55 ? 'grade--warn' : 'grade--bad');
export const progressClass = (p) => (p >= 85 ? 'progress--ok' : p >= 70 ? '' : p >= 55 ? 'progress--warn' : 'progress--bad');

/* ---------- Shared blocks ---------- */
export const pageHead = (title, desc, actions = '') => html`
  <header class="page-head">
    <div><h1 id="page-title" tabindex="-1">${title}</h1>${desc ? html`<p class="page-desc">${desc}</p>` : ''}</div>
    ${actions ? html`<div class="page-actions">${actions}</div>` : ''}
  </header>`;

export const emptyState = (ic, title, text, action = '') => html`
  <div class="empty"><div class="empty__icon">${icon(ic, 22)}</div><h3>${title}</h3><p>${text}</p>${action}</div>`;

export const errorState = (message, retry = true) => html`
  <div class="card"><div class="error-state">
    <div class="empty__icon">${icon('alert', 22)}</div>
    <h3>Не удалось загрузить данные</h3><p class="muted">${message}</p>
    ${retry ? html`<button class="btn" data-retry style="margin-top:14px">${icon('refresh', 16)} Повторить</button>` : ''}
  </div></div>`;

export const skeleton = (kind = 'page') => {
  const tiles = '<div class="grid-stats">' + '<div class="skeleton sk-tile"></div>'.repeat(4) + '</div>';
  const block = '<div class="skeleton sk-block"></div>';
  const head = '<div class="skeleton sk-title"></div><div class="skeleton sk-line" style="width:55%"></div><div style="height:16px"></div>';
  return raw(`<div role="status" aria-label="Загрузка">${head}${kind === 'stats' ? tiles + '<div style="height:20px"></div>' : ''}<div class="stack">${block}${kind === 'stats' ? block : ''}</div></div>`);
};

export const stat = (label, ic, value, unit, hint) => html`
  <div class="card stat"><div class="stat__label">${icon(ic, 18)}${label}</div>
    <div class="stat__value">${value}${unit ? html`<small>${unit}</small>` : ''}</div>
    <div class="stat__hint">${hint}</div></div>`;

/* ---------- Toasts ---------- */
export function toast(message, type = 'info') {
  let root = document.getElementById('toasts');
  if (!root) { root = document.createElement('div'); root.id = 'toasts'; root.className = 'toasts'; root.setAttribute('aria-live', 'polite'); document.body.appendChild(root); }
  const t = document.createElement('div');
  t.className = `toast ${type === 'error' ? 'toast--bad' : type === 'success' ? 'toast--ok' : ''}`;
  t.textContent = message;
  root.appendChild(t);
  setTimeout(() => t.remove(), type === 'error' ? 6000 : 3500);
}

/* ---------- Modal / confirm (focus trap, Esc, returns a Promise) ---------- */
export function dialog({ title, body, confirmText = 'Подтвердить', cancelText = 'Отмена', danger = false, hideCancel = false }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const root = document.createElement('div');
    root.className = 'modal-root';
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
      <div class="modal__head"><h2 id="dlg-title">${esc(title)}</h2></div>
      <div class="modal__body">${isRaw(body) ? body.__raw : esc(body)}</div>
      <div class="modal__foot">${hideCancel ? '' : `<button class="btn" data-x="cancel">${esc(cancelText)}</button>`}<button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-x="ok">${esc(confirmText)}</button></div></div>`;
    document.body.appendChild(root);
    document.body.classList.add('no-scroll');
    const done = (v) => { root.remove(); document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', onKey); prev?.focus?.(); resolve(v); };
    const onKey = (e) => {
      if (e.key === 'Escape') done(false);
      if (e.key === 'Tab') {
        const f = [...root.querySelectorAll('button,input,select,textarea,a[href]')].filter((x) => !x.disabled);
        if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    root.addEventListener('mousedown', (e) => { if (e.target === root) done(false); });
    root.querySelector('[data-x="ok"]').addEventListener('click', () => done(true));
    root.querySelector('[data-x="cancel"]')?.addEventListener('click', () => done(false));
    root.querySelector('[data-x="ok"]').focus();
  });
}

/* ---------- Form dialog: fields inside a modal; `submit` is async and may throw Error(message),
   which is shown inside the dialog (the dialog stays open) so server-side validation is visible. ---------- */
export function formDialog({ title, body, confirmText = 'Сохранить', danger = false, submit }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const root = document.createElement('div');
    root.className = 'modal-root';
    root.innerHTML = `<form class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-title" novalidate>
      <div class="modal__head"><h2 id="dlg-title">${esc(title)}</h2></div>
      <div class="modal__body">${isRaw(body) ? body.__raw : esc(body)}<div class="field__error" data-err role="alert" hidden style="margin-top:12px"></div></div>
      <div class="modal__foot"><button class="btn" type="button" data-x="cancel">Отмена</button><button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" type="submit">${esc(confirmText)}</button></div></form>`;
    document.body.appendChild(root);
    document.body.classList.add('no-scroll');
    const form = root.querySelector('form');
    const err = root.querySelector('[data-err]');
    const btn = form.querySelector('[type=submit]');
    const done = (v) => { root.remove(); document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', onKey); prev?.focus?.(); resolve(v); };
    const onKey = (e) => {
      if (e.key === 'Escape') done(null);
      if (e.key === 'Tab') {
        const f = [...root.querySelectorAll('button,input,select,textarea,a[href]')].filter((x) => !x.disabled);
        if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    root.addEventListener('mousedown', (e) => { if (e.target === root) done(null); });
    form.querySelector('[data-x="cancel"]').addEventListener('click', () => done(null));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      btn.disabled = true;
      const label = btn.textContent;
      btn.innerHTML = '<span class="spinner"></span>';
      try { const fd = new FormData(form); done({ result: await submit(Object.fromEntries(fd), fd) }); }
      catch (x) { err.textContent = x.message || 'Не удалось выполнить действие'; err.hidden = false; btn.disabled = false; btn.textContent = label; }
    });
    (form.querySelector('input,select,textarea') || btn).focus();
  });
}

/* ---------- Line chart (SVG, real data only) ---------- */
export function lineChart(points, { yMin = 0, yMax = 100, label = 'График' } = {}) {
  const W = 640; const H = 260; const m = { l: 36, r: 14, t: 12, b: 28 };
  const iw = W - m.l - m.r; const ih = H - m.t - m.b;
  const n = points.length;
  const x = (i) => m.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const ticks = [];
  for (let v = yMin; v <= yMax; v += 20) ticks.push(v);
  const grid = ticks.map((v) => `<g><line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text></g>`).join('');
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.average).toFixed(1)}`).join('');
  const area = `${line}L${x(n - 1).toFixed(1)} ${y(yMin)}L${x(0).toFixed(1)} ${y(yMin)}Z`;
  const idxs = n <= 6 ? points.map((_, i) => i) : [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1];
  const xl = [...new Set(idxs)].map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(fmtDayShort(points[i].date))}</text>`).join('');
  const dots = points.map((p, i) => `<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(p.percent).toFixed(1)}" r="3.5" tabindex="0" role="img" aria-label="${esc(`${p.title}: ${p.percent} из 100`)}" style="stroke-width:1.5;opacity:.85"><title>${esc(`${fmtDayShort(p.date)} · ${p.title}: ${p.percent}`)}</title></circle>`).join('');
  return raw(`<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(label)}"><g class="grid axis">${grid}</g>
    <path class="area" d="${area}"/><path class="line" d="${line}"/><g>${dots}</g><g class="axis">${xl}</g></svg></div>`);
}

/* ---------- Deadlines & countdowns ---------- */
export function dueInfo(dueAt, now) {
  const ms = parseStamp(dueAt).getTime() - now.getTime();
  const abs = Math.abs(ms);
  const hours = abs / 3600e3;
  const span = hours < 1 ? `${Math.max(1, Math.round(abs / 60000))} мин` : hours < 24 ? `${Math.floor(hours)} ч` : `${Math.floor(hours / 24)} ${plural(Math.floor(hours / 24), ['день', 'дня', 'дней'])}`;
  if (ms < 0) return { text: `Просрочено на ${span}`, tone: 'bad' };
  return { text: `Осталось ${span}`, tone: hours < 24 ? 'warn' : hours < 72 ? 'info' : 'ok' };
}
export function startsIn(l, now) {
  const start = parseStamp(`${l.date}T${l.start}:00`); const end = parseStamp(`${l.date}T${l.end}:00`);
  const toMin = (ms) => Math.max(1, Math.round(ms / 60000));
  const fmt = (m) => (m >= 1440 ? `${Math.floor(m / 1440)} ${plural(Math.floor(m / 1440), ['день', 'дня', 'дней'])}` : m >= 60 ? `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}` : `${m} мин`);
  if (now >= start && now < end) return `Идёт сейчас · осталось ${fmt(toMin(end - now))}`;
  return `Начнётся через ${fmt(toMin(start - now))}`;
}
