import { html, icon, pageHead, emptyState, fmtDateTime, num, plural, toast } from '../ui.js';

const TABS = [['history', 'История'], ['shop', 'Магазин наград'], ['rating', 'Рейтинг'], ['rules', 'Как начисляются']];
const PAGE = 12;

export default async function coins(host, app, query) {
  const state = { tab: TABS.some(([k]) => k === query.tab) ? query.tab : 'history', flow: 'all', limit: PAGE, busy: false };

  const views = {
    history: (d) => {
      const rows = d.ledger.filter((e) => state.flow === 'all' || (state.flow === 'in' ? e.type === 'earn' || e.type === 'refund' : e.type !== 'earn' && e.type !== 'refund'));
      return html`<section class="card" aria-labelledby="h-h">
        <div class="card__head"><div><h2 id="h-h">История операций</h2><p>${rows.length} ${plural(rows.length, ['операция', 'операции', 'операций'])}</p></div>
          <div class="segmented" role="group" aria-label="Фильтр операций">${[['all', 'Все'], ['in', 'Начисления'], ['out', 'Списания']].map(([k, l]) => html`<button data-flow="${k}" aria-pressed="${String(state.flow === k)}">${l}</button>`)}</div></div>
        ${rows.length ? html`<div class="table-wrap"><table class="table table--stack"><thead><tr><th>Дата</th><th>Причина</th><th class="num">Сумма</th></tr></thead>
          <tbody>${rows.slice(0, state.limit).map((e) => html`<tr><td data-label="Дата" class="nowrap">${fmtDateTime(e.at)}</td><td data-label="Причина">${e.reason}</td>
            <td data-label="Сумма" class="num ${e.type === 'earn' || e.type === 'refund' ? 'amount--in' : 'amount--out'}">${e.type === 'earn' || e.type === 'refund' ? '+' : '−'}${e.amount}</td></tr>`)}</tbody></table></div>
          ${rows.length > state.limit ? html`<div class="card__foot" style="text-align:center"><button class="btn btn--sm" data-more>Показать ещё (${rows.length - state.limit})</button></div>` : ''}`
        : emptyState('coins', 'Операций пока нет', 'Баллы начисляются за посещение занятий, задания и достижения.')}
      </section>`;
    },
    shop: (d) => html`
      <section class="stack" aria-labelledby="s-h"><h2 id="s-h" class="visually-hidden">Магазин наград</h2>
        <div class="grid-cards">${d.rewards.map((r) => html`<article class="card tile-card ${r.available ? '' : 'tile-card--locked'}">
          <div class="tile-card__top"><div class="icon-tile icon-tile--accent">${icon('gift', 20)}</div><div><h3>${r.title}</h3><p>${r.description}</p></div></div>
          <div class="tile-card__foot">
            <div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:20px">${num(r.cost)} <span class="muted" style="font-size:13px;font-weight:500">EduCoins</span></b>
              <span class="muted" style="font-size:13px">${r.stock === null ? 'Без ограничений' : r.stock > 0 ? `Осталось: ${r.stock}` : 'Закончилась'}</span></div>
            ${r.affordable ? '' : html`<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${r.cost}" aria-valuenow="${d.balance}" aria-label="Накоплено"><span style="width:${Math.min(100, Math.round((d.balance / r.cost) * 100))}%"></span></div><div class="field__hint">Не хватает ${num(r.cost - d.balance)}</div>`}
            <button class="btn ${r.affordable && r.available ? 'btn--primary' : ''}" data-redeem="${r.id}" ${r.affordable && r.available ? '' : 'disabled'}>${!r.available ? 'Нет в наличии' : r.affordable ? 'Обменять' : 'Недостаточно баллов'}</button>
          </div></article>`)}</div>
        <section class="card" aria-labelledby="rd-h"><div class="card__head"><h2 id="rd-h">История обмена монет</h2></div>
          ${d.redemptions.length ? html`<div class="table-wrap"><table class="table table--stack"><thead><tr><th>Дата</th><th>Награда</th><th>Статус</th><th class="num">Стоимость</th></tr></thead>
            <tbody>${d.redemptions.map((r) => html`<tr><td data-label="Дата" class="nowrap">${fmtDateTime(r.at)}</td><td data-label="Награда"><b>${r.title}</b></td>
              <td data-label="Статус"><span class="badge ${r.status === 'issued' ? 'badge--ok' : r.status === 'cancelled' ? 'badge--bad' : 'badge--warn'}">${d.statusLabels[r.status]}</span></td><td data-label="Стоимость" class="num ${r.status === 'cancelled' ? 'muted' : 'amount--out'}">${r.status === 'cancelled' ? `${r.cost} · возврат` : `−${r.cost}`}</td></tr>`)}</tbody></table></div>`
          : emptyState('gift', 'Обменов пока не было', 'Выберите награду выше, когда накопите достаточно баллов.')}</section>
      </section>`,
    rating: (d) => html`<section class="card" aria-labelledby="r-h">
      <div class="card__head"><div><h2 id="r-h">Рейтинг группы</h2><p>По всем заработанным EduCoins. Имена других учеников сокращены.</p></div></div>
      <ol class="list">${d.rating.map((r) => html`<li class="${r.me ? 'is-me' : ''}"><span class="rank ${r.rank <= 3 ? 'rank--top' : ''}">${r.rank}</span>
        <div class="list__main"><div class="list__title">${r.name}${r.me ? html` <span class="badge badge--info badge--plain" style="margin-left:6px">Это вы</span>` : ''}</div></div>
        <b class="tnum">${num(r.earned)}</b></li>`)}</ol></section>`,
    rules: (d) => html`<section class="card" aria-labelledby="ru-h">
      <div class="card__head"><div><h2 id="ru-h">Как начисляются EduCoins</h2><p>Баллы начисляются автоматически, когда преподаватель или администрация вносят данные в систему.</p></div></div>
      <div class="table-wrap"><table class="table table--stack"><thead><tr><th>Действие</th><th class="num">Баллы</th><th class="num">Вы получили</th></tr></thead>
        <tbody>${d.rules.map((r) => html`<tr><td data-label="Действие"><b>${r.label}</b></td><td data-label="Баллы" class="num amount--in">+${r.points}</td><td data-label="Вы получили" class="num">${num(d.byRule[r.key] || 0)}</td></tr>`)}</tbody></table></div>
      <div class="card__foot">Опоздание и пропуск баллов не приносят. За домашнее задание, сданное после срока, баллы не начисляются. Если отметка или оценка исправлена, начисление пересчитывается.</div></section>`,
  };

  await app.view(host, {
    skeleton: 'stats',
    fetch: () => app.call('coins'),
    render: (d) => {
      const next = d.rewards.find((r) => r.cost > d.balance && r.available);
      return html`
      ${pageHead('EduCoins', 'Внутренняя валюта центра: баллы начисляются за учёбу и обмениваются на награды. Баланс считается по истории операций.')}
      <div class="stack">
        <div class="grid-main">
          <section class="card balance" aria-label="Баланс">
            <div class="muted" style="font-weight:500">Текущий баланс</div>
            <div class="balance__value">${num(d.balance)}<small>EduCoins</small></div>
            <div class="muted">Начислено всего: <b class="amount--in">+${num(d.earned)}</b> · Потрачено: <b class="amount--out">−${num(d.spent)}</b></div>
            ${next ? html`<div style="margin-top:12px"><div class="bars__top" style="font-size:13.5px"><span>До награды «${next.title}»</span><b>${num(next.cost - d.balance)} EduCoins</b></div>
              <div class="progress" style="margin-top:6px" role="progressbar" aria-valuemin="0" aria-valuemax="${next.cost}" aria-valuenow="${d.balance}" aria-label="Прогресс к награде"><span style="width:${Math.min(100, Math.round((d.balance / next.cost) * 100))}%"></span></div></div>` : ''}
          </section>
          <section class="card" aria-label="Ваше место в рейтинге"><div class="stat">
            <div class="stat__label">${icon('trophy', 18)}Место в рейтинге группы</div>
            <div class="stat__value">${d.myRank}<small>из ${d.groupSize}</small></div>
            <div class="stat__hint">Рейтинг считается по всем заработанным баллам, поэтому обмен на награды его не снижает.</div></div></section>
        </div>

        <div class="segmented" role="tablist" aria-label="Разделы EduCoins">${TABS.map(([k, l]) => html`<button role="tab" data-tab="${k}" aria-selected="${String(state.tab === k)}">${l}</button>`)}</div>
        ${views[state.tab](d)}
      </div>`;
    },
    bind: (el, d, { set, redraw }) => {
      el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; state.limit = PAGE; redraw(); }));
      el.querySelectorAll('[data-flow]').forEach((b) => b.addEventListener('click', () => { state.flow = b.dataset.flow; state.limit = PAGE; redraw(); }));
      el.querySelector('[data-more]')?.addEventListener('click', () => { state.limit += PAGE; redraw(); });
      el.querySelectorAll('[data-redeem]').forEach((b) => b.addEventListener('click', async () => {
        if (state.busy) return;
        const r = d.rewards.find((x) => x.id === b.dataset.redeem);
        const ok = await app.confirm({
          title: `Обменять на «${r.title}»?`,
          body: html`<p>С баланса будет списано <b>${num(r.cost)} EduCoins</b>. Остаток после обмена: <b>${num(d.balance - r.cost)}</b>. Награду выдают в администрации центра; если выдача не состоится, баллы вернутся.</p>`,
          confirmText: 'Обменять',
        });
        if (!ok) return;
        state.busy = true; b.disabled = true;
        try { set(await app.call('redeem', { rewardId: r.id })); toast(`Готово: «${r.title}». Заберите награду в администрации`, 'success'); app.refreshMe(); }
        catch (e) { toast(e.message, 'error'); try { set(await app.call('coins')); } catch { b.disabled = false; } }
        state.busy = false;
      }));
    },
  });
}
