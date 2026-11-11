import { html, icon, pageHead, stat, emptyState, lineChart, gradeClass, progressClass, dec, fmtDayShort, plural } from '../ui.js';
import { gradeTile } from '../components.js';

const PAGE = 15;

export default async function performance(host, app) {
  const state = { subject: 'all', kind: 'all', q: '', limit: PAGE };
  await app.view(host, {
    skeleton: 'stats',
    fetch: () => app.call('performance'),
    render: (d) => {
      if (!d.count) {
        return html`${pageHead('Успеваемость', 'Оценки, контрольные и комментарии преподавателей.')}
          <div class="card">${emptyState('chart', 'Оценок пока нет', 'Как только преподаватель проверит первую работу, здесь появятся оценки и график прогресса.')}</div>`;
      }
      const best = d.subjects.slice().sort((a, b) => b.average - a.average)[0];
      const pcts = d.series.map((x) => x.percent);
      let trend = null;
      if (pcts.length >= 6) {
        const last = pcts.slice(-5); const prev = pcts.slice(-10, -5);
        const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
        trend = Math.round((avg(last) - avg(prev)) * 10) / 10;
      }
      const q = state.q.trim().toLowerCase();
      const hist = d.history.filter((g) => (state.subject === 'all' || g.subject === state.subject) && (state.kind === 'all' || g.kind === state.kind) && (!q || `${g.title} ${g.subject}`.toLowerCase().includes(q)));
      return html`
      ${pageHead('Успеваемость', 'Оценки по предметам, результаты контрольных и комментарии преподавателей. Шкала — 100 баллов.')}
      <div class="stack">
        <section class="grid-stats" aria-label="Ключевые показатели">
          ${stat('Средний балл', 'chart', dec(d.average), '/100', 'По всем оценкам')}
          ${stat('Всего оценок', 'check', d.count, '', `Контрольных: ${d.tests.length}`)}
          ${stat('Лучший предмет', 'award', best.subject, '', `Средний балл ${dec(best.average)}`)}
          ${stat('Динамика', 'trend', trend == null ? '—' : `${trend > 0 ? '+' : ''}${dec(trend)}`, '', trend == null ? 'Нужно минимум 6 оценок' : '5 последних оценок против предыдущих 5')}
        </section>

        <div class="grid-main">
          <section class="card" aria-labelledby="ch-h">
            <div class="card__head"><div><h2 id="ch-h">Прогресс</h2><p>Линия — средний балл нарастающим итогом, точки — отдельные оценки</p></div></div>
            <div class="card__body">${d.series.length >= 2 ? lineChart(d.series, { label: 'График среднего балла' }) : emptyState('chart', 'Недостаточно данных', 'График появится после второй оценки.')}</div>
          </section>
          <section class="card" aria-labelledby="sb-h">
            <div class="card__head"><h2 id="sb-h">По предметам</h2></div>
            <div class="card__body bars">${d.subjects.map((s) => html`<div class="bars__row">
              <div class="bars__top"><span>${s.subject}</span><span><b>${dec(s.average)}</b>${s.trend != null && Math.abs(s.trend) >= 0.5 ? html` <span class="${s.trend > 0 ? 'amount--in' : 'amount--out'}" title="Изменение по последним оценкам" style="font-size:13px">${icon(s.trend > 0 ? 'up' : 'down', 12)}${dec(Math.abs(s.trend))}</span>` : ''}</span></div>
              <div class="progress ${progressClass(s.average)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(s.average)}" aria-label="${s.subject}"><span style="width:${s.average}%"></span></div></div>`)}</div>
          </section>
        </div>

        <section class="card" aria-labelledby="ts-h">
          <div class="card__head"><div><h2 id="ts-h">Результаты контрольных</h2><p>Пробные тесты и контрольные работы</p></div></div>
          ${d.tests.length ? html`<div class="table-wrap"><table class="table table--stack"><thead><tr><th>Дата</th><th>Контрольная</th><th>Результат</th><th>Комментарий преподавателя</th></tr></thead>
            <tbody>${d.tests.map((t) => html`<tr><td data-label="Дата" class="nowrap">${fmtDayShort(t.date)}</td><td data-label="Контрольная"><b>${t.title}</b></td>
              <td data-label="Результат"><span class="badge ${t.percent >= 85 ? 'badge--ok' : t.percent >= 70 ? 'badge--info' : t.percent >= 55 ? 'badge--warn' : 'badge--bad'}">${t.score} из ${t.max}</span></td>
              <td data-label="Комментарий" class="${t.comment ? '' : 'muted'}" style="max-width:420px">${t.comment || '—'}</td></tr>`)}</tbody></table></div>`
        : emptyState('chart', 'Контрольных пока не было', 'Результаты появятся после первой контрольной.')}
        </section>

        <section class="card" aria-labelledby="cm-h">
          <div class="card__head"><div><h2 id="cm-h">Комментарии преподавателей</h2><p>Последние отзывы о ваших работах</p></div></div>
          ${d.comments.length ? html`<ul class="list">${d.comments.slice(0, 5).map((c) => html`<li style="align-items:flex-start">${gradeTile(c)}
            <div class="list__main"><div class="list__title">${c.teacher?.name || 'Преподаватель'} <span class="muted" style="font-weight:400">· ${c.subject}, ${fmtDayShort(c.date)}</span></div><div class="list__sub" style="color:var(--text-2)">${c.comment}</div></div></li>`)}</ul>`
        : emptyState('chart', 'Комментариев пока нет', 'Преподаватели оставляют их при проверке работ.')}
        </section>

        <section class="card" aria-labelledby="hs-h">
          <div class="card__head"><div><h2 id="hs-h">История оценок</h2><p>${hist.length} ${plural(hist.length, ['оценка', 'оценки', 'оценок'])}</p></div></div>
          <div class="card__body" style="border-bottom:1px solid var(--border)"><div class="toolbar">
            <div class="input-icon grow"><label class="visually-hidden" for="q">Поиск по оценкам</label>${icon('search', 18)}<input class="input" id="q" type="search" placeholder="Поиск по названию или предмету" value="${state.q}"></div>
            <label class="visually-hidden" for="f-sub">Предмет</label>
            <select class="select" id="f-sub"><option value="all">Все предметы</option>${d.subjects.map((s) => html`<option value="${s.subject}" ${s.subject === state.subject ? 'selected' : ''}>${s.subject}</option>`)}</select>
            <label class="visually-hidden" for="f-kind">Тип</label>
            <select class="select" id="f-kind"><option value="all">Все типы</option>${Object.entries(d.kinds).map(([k, l]) => html`<option value="${k}" ${k === state.kind ? 'selected' : ''}>${l}</option>`)}</select>
          </div></div>
          ${hist.length ? html`<div class="table-wrap"><table class="table table--stack"><thead><tr><th>Дата</th><th>Предмет</th><th>Работа</th><th>Тип</th><th class="num">Балл</th></tr></thead>
            <tbody>${hist.slice(0, state.limit).map((g) => html`<tr><td data-label="Дата" class="nowrap">${fmtDayShort(g.date)}</td><td data-label="Предмет">${g.subject}</td><td data-label="Работа"><b>${g.title}</b></td>
              <td data-label="Тип" class="muted">${d.kinds[g.kind]}</td><td data-label="Балл" class="num"><span class="grade ${gradeClass(g.percent)}" style="display:inline-grid;min-width:52px;height:30px;font-size:14px">${g.score}/${g.max}</span></td></tr>`)}</tbody></table></div>
            ${hist.length > state.limit ? html`<div class="card__foot" style="text-align:center"><button class="btn btn--sm" data-more>Показать ещё (${hist.length - state.limit})</button></div>` : ''}`
        : emptyState('search', 'Ничего не найдено', 'Измените поиск или фильтры.', html`<button class="btn" data-reset>Сбросить фильтры</button>`)}
        </section>
      </div>`;
    },
    bind: (el, d, { redraw }) => {
      const apply = (fn) => { fn(); state.limit = PAGE; redraw(); };
      let t;
      el.querySelector('#q')?.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { apply(() => { state.q = e.target.value; }); const i = host.querySelector('#q'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 200); });
      el.querySelector('#f-sub')?.addEventListener('change', (e) => apply(() => { state.subject = e.target.value; }));
      el.querySelector('#f-kind')?.addEventListener('change', (e) => apply(() => { state.kind = e.target.value; }));
      el.querySelector('[data-more]')?.addEventListener('click', () => { state.limit += PAGE; redraw(); });
      el.querySelector('[data-reset]')?.addEventListener('click', () => apply(() => { state.subject = 'all'; state.kind = 'all'; state.q = ''; }));
    },
  });
}
