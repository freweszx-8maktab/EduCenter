/* Cabinet shell (student or teacher, chosen by <body data-cabinet>): session guard, layout, navigation, router. */
import * as api from './api.js';
import './theme.js';
import { html, mount, icon, esc, initials, errorState, skeleton, toast, dialog, parseStamp } from './ui.js';

const CAB = document.body.dataset.cabinet === 'teacher' ? 'teacher' : 'student';
const CABINETS = {
  student: {
    me: 'me', pages: './pages/', other: 'teacher.html',
    nav: [
      { id: 'overview', label: 'Главная', icon: 'home' },
      { id: 'schedule', label: 'Расписание', icon: 'calendar' },
      { id: 'attendance', label: 'Посещаемость', icon: 'attendance' },
      { id: 'performance', label: 'Успеваемость', icon: 'chart' },
      { id: 'assignments', label: 'Домашние задания', icon: 'assignments' },
      { id: 'coins', label: 'EduCoins', icon: 'coins' },
      { id: 'achievements', label: 'Достижения', icon: 'award' },
      { id: 'notifications', label: 'Уведомления', icon: 'bell', account: true },
      { id: 'profile', label: 'Профиль', icon: 'user', account: true },
      { id: 'settings', label: 'Настройки', icon: 'settings', account: true },
    ],
    tabs: ['overview', 'schedule', 'assignments', 'coins'],
  },
  teacher: {
    me: 'staff.me', pages: './pages/teacher/', other: 'student.html',
    nav: [
      { id: 'overview', label: 'Главная', icon: 'home' },
      { id: 'attendance', label: 'Посещаемость', icon: 'attendance' },
      { id: 'grades', label: 'Оценки', icon: 'chart' },
      { id: 'assignments', label: 'Задания и проверка', icon: 'assignments' },
      { id: 'students', label: 'Группы и ученики', icon: 'user' },
      { id: 'schedule', label: 'Расписание', icon: 'calendar' },
      { id: 'messages', label: 'Сообщения', icon: 'mail' },
      { id: 'profile', label: 'Профиль и настройки', icon: 'settings', account: true },
    ],
    tabs: ['overview', 'attendance', 'assignments', 'students'],
  },
}[CAB];
const NAV = CABINETS.nav;
const TABS = CABINETS.tabs;
const ROUTES = Object.fromEntries(NAV.map((n) => [n.id, n]));
const ADMIN_NAV = [
  { id: 'accounts', label: 'Аккаунты учеников', icon: 'user' },
  { id: 'org', label: 'Группы и преподаватели', icon: 'settings' },
  { id: 'rewards', label: 'Награды и выдача', icon: 'coins' },
];
const ADMIN_IDS = new Set(ADMIN_NAV.map((n) => n.id));
const SHORT = { assignments: 'Задания', students: 'Ученики', attendance: 'Журнал' };

const root = document.getElementById('app');
const app = {
  me: null,
  skew: 0,
  call: api.call,
  now: () => new Date(Date.now() + app.skew),
  toast,
  confirm: dialog,
  navigate: (hash) => { location.hash = hash; },
  photo: null,
  /* Avatar markup: the uploaded photo, or initials when there is none. */
  avatar: (cls = '') => html`<span class="avatar ${cls}" data-avatar aria-hidden="true">${app.photo ? html`<img src="${app.photo}" alt="">` : initials(app.me.user.name)}</span>`,
  setPhoto(data) {
    app.photo = data || null;
    document.querySelectorAll('[data-avatar]').forEach((el) => {
      el.innerHTML = app.photo ? `<img src="${esc(app.photo)}" alt="">` : esc(initials(app.me.user.name));
    });
  },
  mode: 'local',
};

function setSkew(serverNow) { app.skew = parseStamp(serverNow).getTime() - Date.now(); }

function setUnread(n) {
  if (app.me) app.me.unread = n;
  document.querySelectorAll('[data-unread]').forEach((el) => { el.hidden = !n; el.textContent = n > 99 ? '99+' : String(n); });
  document.title = `${n ? `(${n}) ` : ''}${currentTitle()} — EduCenter PRO`;
}
app.setUnread = setUnread;

let currentId = 'overview';
const currentTitle = () => ROUTES[currentId]?.label || 'Кабинет';

/* Generic loading → error → content helper used by every page. */
app.view = async function view(host, { skeleton: kind = 'page', fetch, render, bind, focus = true }) {
  let data;
  const load = async () => {
    mount(host, skeleton(kind));
    try { data = await fetch(); } catch (e) {
      if (e.code === 'UNAUTHENTICATED') return;
      mount(host, errorState(e.message || 'Попробуйте обновить страницу.'));
      host.querySelector('[data-retry]')?.addEventListener('click', load);
      return;
    }
    const draw = () => {
      mount(host, render(data));
      bind?.(host, data, { redraw: draw, reload: load, set: (d) => { data = d; draw(); } });
    };
    draw();
    if (focus) host.querySelector('#page-title')?.focus({ preventScroll: true });
  };
  await load();
};

/* ---------- Shell ---------- */
function shell() {
  const { me } = app;
  const navLink = (n) => html`<a class="nav__link" href="#/${n.id}" data-nav="${n.id}">${icon(n.icon, 20)}<span>${n.label}</span>${n.id === 'notifications' ? html`<span class="nav__count" data-unread hidden></span>` : ''}</a>`;
  const tab = (id) => { const n = ROUTES[id]; return html`<a href="#/${id}" data-nav="${id}">${icon(n.icon)}<span>${SHORT[id] || n.label}</span></a>`; };
  const roleLine = CAB === 'teacher' ? (me.user.role === 'admin' ? 'Администратор' : 'Преподаватель') : me.group.name;
  const center = CAB === 'teacher' ? `${me.center.name} · ${me.groups.length ? me.groups.map((g) => g.name).join(', ') : 'нет групп'}` : `${me.center.name} · ${me.group.name} · ${me.course.name}`;
  mount(root, html`
    <aside class="sidebar" id="sidebar" aria-label="Основное меню">
      <div class="brand"><div class="brand__mark">E</div><div class="brand__name">EduCenter <span>PRO</span><span class="brand__sub">${me.center.name}</span></div></div>
      <nav class="nav" aria-label="Разделы кабинета">${NAV.filter((n) => !n.account).map(navLink)}
        <div class="nav__label">Аккаунт</div>${NAV.filter((n) => n.account).map(navLink)}</nav>
      <div class="sidebar__foot">
        <div class="usercard">${app.avatar()}
          <div class="usercard__text"><div class="usercard__name">${me.user.name}</div><div class="usercard__role">${roleLine}</div></div>
          <button class="icon-btn" id="logout" aria-label="Выйти из кабинета" title="Выйти">${icon('logout', 18)}</button></div>
      </div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="main-col">
      <header class="topbar">
        <button class="icon-btn" id="menu-btn" aria-label="Открыть меню" aria-controls="sidebar" aria-expanded="false">${icon('menu')}</button>
        <div class="topbar__title">EduCenter <span style="color:var(--accent)">PRO</span></div>
        <div class="topbar__center">${icon('pin', 16)}<span>${center}</span></div>
        <div class="topbar__spacer"></div>
        ${CAB === 'student' ? html`<a class="icon-btn" href="#/notifications" aria-label="Уведомления">${icon('bell')}<span class="icon-btn__dot" data-unread hidden></span></a>` : ''}
        <a class="icon-btn" href="#/profile" aria-label="Мой профиль">${app.avatar('avatar--sm')}</a>
      </header>
      <main id="main" tabindex="-1"></main>
    </div>
    <nav class="tabbar" aria-label="Быстрая навигация">${TABS.map(tab)}
      <button id="tab-more" aria-label="Все разделы" aria-controls="sidebar">${icon('menu')}<span>Меню</span></button></nav>`);

  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('menu-btn');
  const setOpen = (open) => {
    sidebar.classList.toggle('sidebar--open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('no-scroll', open && window.innerWidth < 1024);
    if (open) sidebar.querySelector('[aria-current="page"], .nav__link')?.focus();
  };
  menuBtn.addEventListener('click', () => setOpen(!sidebar.classList.contains('sidebar--open')));
  document.getElementById('tab-more').addEventListener('click', () => setOpen(true));
  document.getElementById('scrim').addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sidebar.classList.contains('sidebar--open')) { setOpen(false); menuBtn.focus(); } });
  sidebar.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  window.addEventListener('resize', () => { if (window.innerWidth >= 1024) setOpen(false); });

  document.getElementById('logout').addEventListener('click', async () => {
    const ok = await dialog({ title: 'Выйти из кабинета?', body: 'Чтобы снова открыть кабинет, нужно будет ввести логин и пароль.', confirmText: 'Выйти' });
    if (!ok) return;
    await api.logout();
    location.replace('index.html');
  });
  setUnread(me.unread);
}

/* ---------- Router ---------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  return { id: path || 'overview', query: Object.fromEntries(new URLSearchParams(qs)) };
}

let navToken = 0;
async function route() {
  const token = ++navToken;
  const { id, query } = parseHash();
  const main = document.getElementById('main');
  if (!ROUTES[id]) {
    currentId = '';
    mount(main, html`<div class="page"><div class="card"><div class="error-state"><div class="empty__icon">${icon('search', 22)}</div><h3>Страница не найдена</h3><p class="muted">Такого раздела нет. Вернитесь на главную.</p><a class="btn btn--primary" href="#/overview" style="margin-top:14px">На главную</a></div></div></div>`);
    document.title = 'Страница не найдена — EduCenter PRO';
    return;
  }
  currentId = id;
  document.querySelectorAll('[data-nav]').forEach((a) => { a.dataset.nav === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  document.title = `${ROUTES[id].label} — EduCenter PRO`;
  const page = document.createElement('div');
  page.className = 'page';
  main.replaceChildren(page);
  window.scrollTo(0, 0);
  try {
    const mod = await import(`${ADMIN_IDS.has(id) ? './pages/admin/' : CABINETS.pages}${id}.js`);
    if (token !== navToken) return;
    await mod.default(page, app, query);
  } catch (e) {
    console.error(e);
    if (token === navToken) mount(page, errorState('Не удалось открыть раздел. Обновите страницу.'));
  }
  if (token === navToken) refreshMe();
}

async function refreshMe() {
  try { const me = await api.call(CABINETS.me); app.me = me; setSkew(me.serverNow); setUnread(me.unread); } catch { /* handled by sign-out event */ }
}
app.refreshMe = refreshMe;

/* ---------- Boot ---------- */
window.addEventListener('educenter:signed-out', () => location.replace('index.html?expired=1'));

(async function boot() {
  app.mode = await api.init();
  if (!api.getToken()) { location.replace('index.html'); return; }
  try {
    app.me = await api.call(CABINETS.me);
    if (CAB === 'teacher' && app.me.user.role === 'admin' && !ROUTES.accounts) {
      NAV.splice(NAV.findIndex((n) => n.account), 0, ...ADMIN_NAV); // admin sees everything a teacher does, plus account and shop management
      ADMIN_NAV.forEach((n) => { ROUTES[n.id] = n; });
    }
  } catch (e) {
    if (e.code === 'FORBIDDEN') {
      // signed in with the other kind of account: send them to their own cabinet instead of logging out
      try { await api.call(CAB === 'student' ? 'staff.me' : 'me'); location.replace(CABINETS.other); return; } catch { /* admin or unknown role */ }
      await api.logout(); location.replace('index.html'); return;
    }
    mount(root, html`<div style="max-width:520px;margin:15vh auto;padding:0 16px">${errorState(e.message)}</div>`);
    root.querySelector('[data-retry]')?.addEventListener('click', () => location.reload());
    return;
  }
  setSkew(app.me.serverNow);
  if (CAB === 'student' && app.me.hasPhoto) { try { app.photo = (await api.call('photo')).data; } catch { /* initials are shown instead */ } }
  shell();
  window.addEventListener('hashchange', route);
  window.addEventListener('focus', refreshMe);
  if (!location.hash) location.replace('#/overview'); else route();
})();
