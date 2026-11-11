import { html, icon, pageHead, emptyState, fmtRelative, fmtDateTime, toast } from '../ui.js';

const TYPES = [['all', 'Все'], ['assignment', 'Задания'], ['schedule', 'Расписание'], ['grade', 'Оценки'], ['coins', 'EduCoins'], ['admin', 'Сообщения центра']];
const ICON = { assignment: 'assignments', schedule: 'calendar', grade: 'chart', coins: 'coins', admin: 'info' };
const PAGE = 20;

export default async function notifications(host, app) {
  const state = { type: 'all', unreadOnly: false, limit: PAGE };
  await app.view(host, {
    skeleton: 'page',
    fetch: () => app.call('notifications', {}),
    render: (d) => {
      const now = app.now();
      const items = d.items.filter((n) => (state.type === 'all' || n.type === state.type) && (!state.unreadOnly || !n.read));
      return html`
      ${pageHead('Уведомления', 'Новые задания, изменения расписания, оценки, начисления EduCoins и сообщения центра.',
        html`<button class="btn" data-readall ${d.unread ? '' : 'disabled'}>${icon('check', 16)} Прочитать все</button>`)}
      <div class="stack">
        <div class="toolbar" style="justify-content:space-between">
          <div class="segmented" role="group" aria-label="Тип уведомлений">${TYPES.map(([k, l]) => html`<button data-type="${k}" aria-pressed="${String(state.type === k)}">${l}<span class="count">${k === 'all' ? d.counts.all : d.counts[k] || 0}</span></button>`)}</div>
          <label class="switch" style="padding:0;border:0;gap:10px"><span>Только непрочитанные${d.unread ? ` (${d.unread})` : ''}</span><input type="checkbox" id="unread-only" ${state.unreadOnly ? 'checked' : ''}></label>
        </div>
        <section class="card" aria-label="Список уведомлений">
          ${items.length ? html`<div>${items.slice(0, state.limit).map((n) => html`<div class="notif ${n.read ? '' : 'is-unread'}">
            <div class="icon-tile ${n.read ? '' : 'icon-tile--accent'}">${icon(ICON[n.type] || 'bell', 20)}</div>
            <div class="notif__body"><div class="notif__title">${n.title}${n.read ? '' : html`<span class="unread-dot" title="Не прочитано"></span><span class="visually-hidden">Не прочитано</span>`}</div>
              <div class="notif__text">${n.body}</div><div class="notif__time" title="${fmtDateTime(n.createdAt)}">${fmtRelative(n.createdAt, now)}</div></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
              ${n.link ? html`<a class="btn btn--sm" href="${n.link}" data-go="${n.id}">Открыть</a>` : ''}
              ${n.read ? '' : html`<button class="btn btn--sm btn--ghost" data-read="${n.id}">Прочитано</button>`}</div></div>`)}</div>
            ${items.length > state.limit ? html`<div class="card__foot" style="text-align:center"><button class="btn btn--sm" data-more>Показать ещё (${items.length - state.limit})</button></div>` : ''}`
        : emptyState('bell', state.unreadOnly ? 'Непрочитанных нет' : 'Уведомлений нет', state.unreadOnly ? 'Вы всё прочитали.' : 'Здесь будут появляться важные события вашей учёбы.')}
        </section>
      </div>`;
    },
    bind: (el, d, { redraw }) => {
      const markLocal = (id) => { d.items.forEach((n) => { if (id === 'all' || n.id === id) n.read = true; }); d.unread = d.items.filter((n) => !n.read).length; app.setUnread(d.unread); };
      el.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { state.type = b.dataset.type; state.limit = PAGE; redraw(); }));
      el.querySelector('#unread-only').addEventListener('change', (e) => { state.unreadOnly = e.target.checked; state.limit = PAGE; redraw(); });
      el.querySelector('[data-more]')?.addEventListener('click', () => { state.limit += PAGE; redraw(); });
      el.querySelectorAll('[data-read]').forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        try { await app.call('markRead', { id: b.dataset.read }); markLocal(b.dataset.read); redraw(); } catch (e) { toast(e.message, 'error'); b.disabled = false; }
      }));
      el.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', () => { app.call('markRead', { id: a.dataset.go }).catch(() => {}); }));
      el.querySelector('[data-readall]')?.addEventListener('click', async () => {
        const ok = await app.confirm({ title: 'Отметить все как прочитанные?', body: `Непрочитанных уведомлений: ${d.unread}.`, confirmText: 'Отметить' });
        if (!ok) return;
        try { await app.call('markRead', { all: true }); markLocal('all'); redraw(); toast('Все уведомления прочитаны', 'success'); } catch (e) { toast(e.message, 'error'); }
      });
    },
  });
}
