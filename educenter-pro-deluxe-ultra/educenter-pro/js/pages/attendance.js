import { html, icon, pageHead, stat, emptyState, attBadge, ATT, fmtDayShort, fmtWd, fmtMonth, plural, toast, progressClass, todayOf } from '../ui.js';

/* CSV for Excel: ';' separator (Russian locale), UTF-8 BOM, and a guard against formula injection. */
const csvCell = (v) => {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
function downloadCsv(name, rows) {
  const text = '\ufeff' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const FILTERS = [['all', 'Все'], ['present', 'Присутствовал'], ['late', 'Опоздал'], ['absent', 'Отсутствовал'], ['excused', 'Уважительная']];

export default async function attendance(host, app) {
  const state = { month: 'all', status: 'all' };
  await app.view(host, {
    skeleton: 'stats',
    fetch: () => app.call('attendance', { month: state.month }),
    render: (d) => {
      const s = d.summary;
      const rows = d.rows.filter((r) => state.status === 'all' || r.status === state.status);
      return html`
      ${pageHead('Посещаемость', 'Электронный журнал ваших занятий. Отметки ставит администрация центра — изменить их самостоятельно нельзя.',
        html`<div class="field" style="min-width:190px"><label class="visually-hidden" for="month">Период</label>
          <select class="select" id="month" style="width:100%"><option value="all" ${state.month === 'all' ? 'selected' : ''}>Весь период</option>
          ${d.months.map((m) => html`<option value="${m}" ${m === state.month ? 'selected' : ''}>${fmtMonth(m)}</option>`)}</select></div>
          <button class="btn" data-csv ${rows.length ? '' : 'disabled'}>${icon('download', 16)} CSV</button>
          <button class="btn" data-print ${rows.length ? '' : 'disabled'}>${icon('file', 16)} Печать</button>`)}
      <div class="print-only print-head">
        <div><b>${app.me.user.name}</b> · ${app.me.group.name} · ${app.me.course.name}</div>
        <div>Период: ${state.month === 'all' ? 'весь период' : fmtMonth(state.month)}${state.status === 'all' ? '' : ` · фильтр: ${ATT[state.status].label}`}</div>
        <div>Сформировано: ${fmtDayShort(todayOf(app.now()))} ${String(app.now().getHours()).padStart(2, '0')}:${String(app.now().getMinutes()).padStart(2, '0')} · ${app.me.center.name}</div>
      </div>
      <div class="stack">
        <section class="grid-stats" aria-label="Итоги посещаемости">
          ${stat('Посещаемость', 'attendance', s.percent == null ? '—' : s.percent, s.percent == null ? '' : '%', s.base ? 'Опоздания считаются посещением' : 'Нет отметок за период')}
          ${stat('Посещено занятий', 'check', s.present + s.late, '', `Из них с опозданием: ${s.late}`)}
          ${stat('Пропусков', 'alert', s.absent, '', `По уважительной причине: ${s.excused}`)}
          ${stat('Всего отмечено', 'calendar', s.total, '', 'Проведённых занятий в журнале')}
        </section>

        <div class="alert alert--info" role="note">${icon('lock', 18)}<div>${d.policy} Если отметка кажется неверной, обратитесь в администрацию центра.</div></div>

        ${d.byMonth.length > 1 && state.month === 'all' ? html`<section class="card" aria-labelledby="bm-h">
          <div class="card__head"><h2 id="bm-h">Посещаемость по месяцам</h2></div>
          <div class="card__body bars">${d.byMonth.map((m) => html`<div class="bars__row">
            <div class="bars__top"><span>${fmtMonth(m.month)}</span><b>${m.percent == null ? '—' : `${m.percent}%`}</b></div>
            <div class="progress ${m.percent == null ? '' : progressClass(m.percent)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${m.percent ?? 0}" aria-label="${fmtMonth(m.month)}"><span style="width:${m.percent ?? 0}%"></span></div></div>`)}</div></section>` : ''}

        <section class="card" aria-labelledby="hist-h">
          <div class="card__head">
            <div><h2 id="hist-h">История занятий</h2><p>${rows.length} ${plural(rows.length, ['запись', 'записи', 'записей'])}</p></div>
            <div class="segmented" role="group" aria-label="Фильтр по статусу">${FILTERS.map(([k, l]) => html`<button data-status="${k}" aria-pressed="${String(state.status === k)}">${l}</button>`)}</div>
          </div>
          ${rows.length ? html`<div class="table-wrap"><table class="table table--stack table--cards">
            <thead><tr><th>Дата</th><th>Время</th><th>Предмет</th><th>Преподаватель</th><th>Статус</th><th>Причина</th></tr></thead>
            <tbody>${rows.map((r) => html`<tr>
              <td data-label="Дата" data-col="date" class="nowrap">${fmtWd(r.date)}, ${fmtDayShort(r.date)}</td>
              <td data-label="Время" data-col="time" class="tnum nowrap">${r.start}–${r.end}</td>
              <td data-label="Предмет" data-col="subject"><b>${r.subject}</b></td>
              <td data-label="Преподаватель" data-col="teacher">${r.teacher?.name || '—'}</td>
              <td data-label="Статус" data-col="status">${attBadge(r.status)}</td>
              <td data-label="Причина" data-col="reason" class="${r.reason ? '' : 'muted'} ${r.reason || r.status === 'absent' || r.status === 'excused' ? '' : 'is-blank'}">${r.reason || (r.status === 'absent' || r.status === 'excused' ? 'Не указана' : '—')}</td></tr>`)}</tbody></table></div>
            <div class="card__foot legend" aria-label="Обозначения">${Object.values(ATT).map((a) => html`<span><span class="badge ${a.cls}">${a.label}</span></span>`)}</div>`
        : emptyState('attendance', 'Записей не найдено', state.status === 'all' ? 'За выбранный период в журнале пока нет отметок.' : 'Нет занятий с таким статусом. Попробуйте другой фильтр.',
          state.status === 'all' ? '' : html`<button class="btn" data-status="all">Показать все</button>`)}
        </section>
      </div>`;
    },
    bind: (el, d, { redraw, set }) => {
      el.querySelector('#month').addEventListener('change', async (e) => {
        const prev = state.month;
        state.month = e.target.value;
        el.style.opacity = '.6';
        try { set(await app.call('attendance', { month: state.month })); } catch (err) { state.month = prev; toast(err.message, 'error'); el.style.opacity = ''; }
      });
      el.querySelector('[data-print]')?.addEventListener('click', () => window.print());
      el.querySelector('[data-csv]')?.addEventListener('click', () => {
        const rows = d.rows.filter((r) => state.status === 'all' || r.status === state.status);
        const head = ['Дата', 'Начало', 'Конец', 'Предмет', 'Преподаватель', 'Кабинет', 'Статус', 'Причина'];
        const body = rows.map((r) => [r.date, r.start, r.end, r.subject, r.teacher?.name || '', r.room, ATT[r.status]?.label || r.status, r.reason]);
        downloadCsv(`poseshchaemost-${app.me.user.login}-${state.month}.csv`, [head, ...body]);
        toast(`Скачано записей: ${rows.length}`, 'success');
      });
      el.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => { state.status = b.dataset.status; redraw(); }));
    },
    focus: true,
  });
}
