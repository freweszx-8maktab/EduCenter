import { html, icon, pageHead, emptyState, fmtFull } from '../ui.js';

export default async function achievements(host, app) {
  const state = { filter: 'all' };
  await app.view(host, {
    skeleton: 'page',
    fetch: () => app.call('achievements'),
    render: (d) => {
      const items = d.items.filter((a) => state.filter === 'all' || (state.filter === 'done' ? a.unlocked : !a.unlocked))
        .sort((a, b) => (b.unlocked - a.unlocked) || (a.unlocked ? b.achievedAt.localeCompare(a.achievedAt) : b.percent - a.percent));
      return html`
      ${pageHead('Достижения', 'Награды за стабильную учёбу. За каждое достижение начисляется +50 EduCoins — один раз.')}
      <div class="stack">
        <section class="card"><div class="card__body" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
          <div style="flex:1;min-width:200px"><div class="bars__top"><b>Получено ${d.unlocked} из ${d.total}</b><span class="muted">${Math.round((d.unlocked / d.total) * 100)}%</span></div>
            <div class="progress" style="margin-top:8px" role="progressbar" aria-valuemin="0" aria-valuemax="${d.total}" aria-valuenow="${d.unlocked}" aria-label="Получено достижений"><span style="width:${(d.unlocked / d.total) * 100}%"></span></div></div>
          <div class="segmented" role="group" aria-label="Фильтр достижений">${[['all', 'Все'], ['done', 'Полученные'], ['locked', 'Закрытые']].map(([k, l]) => html`<button data-f="${k}" aria-pressed="${String(state.filter === k)}">${l}</button>`)}</div>
        </div></section>
        ${items.length ? html`<div class="grid-cards">${items.map((a) => html`<article class="card tile-card ${a.unlocked ? '' : 'tile-card--locked'}">
          <div class="tile-card__top"><div class="icon-tile ${a.unlocked ? 'icon-tile--ok' : 'icon-tile--locked'}">${icon(a.unlocked ? 'award' : 'lock', 20)}</div>
            <div style="min-width:0"><h3>${a.title}</h3><p>${a.description}</p></div></div>
          <div class="tile-card__foot">
            ${a.unlocked ? html`<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span class="badge badge--ok">Получено ${fmtFull(a.achievedAt)}</span><span class="badge badge--plain badge--info">+${a.reward} EduCoins</span></div>`
              : html`<div class="bars__top" style="font-size:13.5px"><span class="muted">Прогресс</span><b>${a.current} из ${a.target}${a.key === 'strong_avg' ? '' : ` ${a.unit}`}</b></div>
                <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${a.target}" aria-valuenow="${a.current}" aria-label="Прогресс: ${a.title}"><span style="width:${a.percent}%"></span></div>
                ${a.note ? html`<div class="field__hint">${a.note}</div>` : html`<div class="field__hint">Осталось: ${a.target - a.current} ${a.key === 'strong_avg' ? 'балл(ов) среднего' : a.unit}</div>`}`}
          </div></article>`)}</div>`
        : html`<div class="card">${emptyState('award', 'Здесь пока пусто', state.filter === 'done' ? 'Получите первое достижение — посетите занятие или сдайте задание.' : 'Все достижения уже получены. Отличная работа!')}</div>`}
      </div>`;
    },
    bind: (el, d, { redraw }) => { el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.f; redraw(); })); },
  });
}
