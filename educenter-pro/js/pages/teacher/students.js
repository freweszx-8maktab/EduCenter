import { html, icon, pageHead, emptyState, fmtDayShort, formDialog, toast, gradeClass, dec, num, todayOf } from '../../ui.js';

export default async function students(host, app, query) {
  const state = { open: query.open || null, detail: null, q: '' };
  const sync = () => history.replaceState(null, '', `#/students${state.open ? `?open=${state.open}` : ''}`);

  await app.view(host, {
    skeleton: 'page',
    fetch: async () => {
      const d = await app.call('staff.groups');
      if (state.open) { try { state.detail = await app.call('staff.student', { studentId: state.open }); } catch { state.open = null; state.detail = null; } }
      return d;
    },
    render: (d) => {
      const q = state.q.trim().toLowerCase();
      return html`
      ${pageHead('Группы и ученики', 'Успеваемость, посещаемость и EduCoins ваших учеников.')}
      <div class="split ${state.detail ? 'split--open' : ''}">
        <div class="split__list stack">
          <div class="input-icon"><label class="visually-hidden" for="q">Поиск ученика</label>${icon('search', 18)}<input class="input" id="q" type="search" placeholder="Поиск ученика" value="${state.q}"></div>
          ${d.groups.length ? d.groups.map((g) => {
            const list = g.list.filter((s) => !q || s.name.toLowerCase().includes(q));
            return html`<section class="card" aria-label="${g.name}"><div class="card__head"><div><h2>${g.name}</h2><p>${g.course} · ${g.students} уч. · посещаемость ${g.attendance ?? '—'}% · средний балл ${dec(g.average)}</p></div></div>
              ${list.length ? html`<ul>${list.map((s) => html`<li><button class="item-btn" data-open="${s.id}" aria-current="${String(s.id === state.open)}">
                <div class="grade ${s.average == null ? '' : gradeClass(s.average)}" title="Средний балл">${s.average == null ? '—' : Math.round(s.average)}</div>
                <div class="list__main"><div class="list__title">${s.name}</div><div class="list__sub">Посещаемость ${s.attendance ?? '—'}%${s.absent ? ` · пропусков ${s.absent}` : ''}</div></div>
                <div class="list__side muted tnum">${num(s.coins)} EC</div></button></li>`)}</ul>` : html`<div class="card__body muted">Никого не найдено</div>`}</section>`;
          }) : html`<div class="card">${emptyState('user', 'Нет групп', 'За вами не закреплено ни одной группы.')}</div>`}
        </div>
        <section class="split__detail" aria-label="Карточка ученика" aria-live="polite">${state.detail ? card(state.detail) : html`<div class="card">${emptyState('user', 'Выберите ученика', 'Откройте ученика из списка, чтобы увидеть подробности.')}</div>`}</section>
      </div>`;
    },
    bind: (el, d, { redraw, reload }) => {
      let t;
      el.querySelector('#q')?.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; redraw(); const i = host.querySelector('#q'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 200); });
      el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', async () => {
        try { state.detail = await app.call('staff.student', { studentId: b.dataset.open }); state.open = b.dataset.open; sync(); redraw(); window.scrollTo({ top: 0 }); } catch (e) { toast(e.message, 'error'); }
      }));
      el.querySelector('[data-back]')?.addEventListener('click', () => { state.open = null; state.detail = null; sync(); redraw(); });
      el.querySelector('[data-olymp]')?.addEventListener('click', async () => {
        const s = state.detail;
        const res = await formDialog({
          title: `Олимпиада: ${s.name}`, confirmText: 'Записать участие',
          body: html`<p class="muted" style="margin-bottom:12px">За участие ученик получит 30 EduCoins. Запись нельзя удалить — проверьте данные.</p>
            <div class="field"><label for="o-t">Название олимпиады</label><input class="input" id="o-t" name="title" maxlength="100"></div>
            <div class="field" style="margin-top:12px"><label for="o-d">Дата</label><input class="input" id="o-d" name="date" type="date" value="${todayOf(app.now())}" max="${todayOf(app.now())}"></div>`,
          submit: (v) => {
            if (!v.title?.trim()) throw new Error('Укажите название олимпиады.');
            if (!v.date || v.date > todayOf(app.now())) throw new Error('Укажите дату не позже сегодняшней.');
            return app.call('staff.awardOlympiad', { studentId: s.id, title: v.title.trim(), date: v.date });
          },
        });
        if (res) { toast('Участие записано, +30 EduCoins', 'success'); reload(); }
      });
    },
  });

  function card(s) {
    const a = s.attendance;
    return html`<article class="card">
      <div class="card__head"><div style="min-width:0"><button class="btn btn--sm back-btn" data-back style="margin-bottom:10px">${icon('left', 16)} К списку</button>
        <h2 tabindex="-1" style="font-size:18px">${s.name}</h2><p>${s.group}</p></div></div>
      <div class="detail__section" style="border-top:0"><dl class="dl"><dt>Телефон</dt><dd>${s.phone}</dd><dt>Email</dt><dd>${s.email}</dd><dt>Родитель</dt><dd>${s.parent || '—'}</dd>
        <dt>Посещаемость</dt><dd>${a.percent == null ? '—' : `${a.percent}%`} · был ${a.present}, опоздал ${a.late}, пропустил ${a.absent}, уваж. ${a.excused}</dd>
        <dt>Средний балл</dt><dd>${dec(s.average)}</dd><dt>EduCoins</dt><dd>${num(s.coins.balance)} (заработано ${num(s.coins.earned)}, потрачено ${num(s.coins.spent)})</dd></dl></div>
      <div class="detail__section"><h3>Последние оценки</h3>
        ${s.grades.length ? html`<ul class="list">${s.grades.map((g) => html`<li><div class="grade ${gradeClass(g.percent)}">${g.percent}</div><div class="list__main"><div class="list__title">${g.subject} · ${g.title}</div><div class="list__sub">${fmtDayShort(g.date)}${g.comment ? ` · ${g.comment}` : ''}</div></div><div class="list__side muted tnum">${g.score}/${g.max}</div></li>`)}</ul>` : html`<div class="muted">Оценок пока нет</div>`}</div>
      <div class="detail__section"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><h3>Олимпиады</h3><button class="btn btn--sm" data-olymp>${icon('award', 16)} Записать участие</button></div>
        ${s.olympiads.length ? html`<ul class="list">${s.olympiads.map((o) => html`<li><div class="list__main"><div class="list__title">${o.title}</div><div class="list__sub">${fmtDayShort(o.date)}</div></div></li>`)}</ul>` : html`<div class="muted" style="margin-top:6px">Участий пока нет</div>`}</div>
    </article>`;
  }
}
