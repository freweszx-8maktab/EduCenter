import { html, icon, pageHead, emptyState, fmtDayWd, fmtDayShort, fmtWd, dayNum, fmtDay, toast, todayOf } from '../ui.js';
import { lessonRow } from '../components.js';

const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d + n); return todayOf(t); };

export default async function schedule(host, app, query) {
  const state = { view: window.innerWidth < 768 ? 'day' : 'week', selected: null, busy: false };

  const pickSelected = (d) => {
    if (state.selected && d.days.some((x) => x.date === state.selected)) return;
    const inWeek = d.days.find((x) => x.date === d.today);
    state.selected = inWeek ? inWeek.date : (d.days.find((x) => x.lessons.length) || d.days[0]).date;
  };

  const weekLabel = (d) => {
    const a = d.weekStart; const b = d.weekEnd;
    return a.slice(5, 7) === b.slice(5, 7) ? `${dayNum(a)}–${dayNum(b)} ${fmtDay(b).split(' ')[1]}` : `${fmtDayShort(a)} – ${fmtDayShort(b)}`;
  };

  await app.view(host, {
    skeleton: 'page',
    fetch: async () => { const d = await app.call('schedule', query.week ? { weekStart: query.week } : {}); pickSelected(d); return d; },
    render: (d) => {
      const canPrev = d.bounds && d.weekStart > d.bounds.first;
      const canNext = d.bounds && d.weekStart < d.bounds.last;
      const isCurrent = d.days.some((x) => x.date === d.today);
      const sel = d.days.find((x) => x.date === state.selected);
      const total = d.days.reduce((n, x) => n + x.lessons.length, 0);
      return html`
      ${pageHead('Расписание', 'Занятия вашей группы по дням. Отмены и переносы выделены цветом и приходят в уведомления.')}
      <div class="stack">
        <div class="toolbar" style="justify-content:space-between">
          <div class="weekbar" role="group" aria-label="Выбор недели">
            <button class="btn btn--sm" data-week="-1" aria-label="Предыдущая неделя" ${canPrev ? '' : 'disabled'}>${icon('left', 16)}</button>
            <div class="weekbar__label" aria-live="polite">${weekLabel(d)}</div>
            <button class="btn btn--sm" data-week="1" aria-label="Следующая неделя" ${canNext ? '' : 'disabled'}>${icon('right', 16)}</button>
            ${isCurrent ? '' : html`<button class="btn btn--sm" data-today>Сегодня</button>`}
          </div>
          <div class="segmented" role="group" aria-label="Режим просмотра">
            <button data-view="day" aria-pressed="${String(state.view === 'day')}">День</button>
            <button data-view="week" aria-pressed="${String(state.view === 'week')}">Неделя</button>
          </div>
        </div>

        <div class="daystrip" role="group" aria-label="Дни недели">
          ${d.days.map((x) => html`<button class="daypill ${x.date === d.today ? 'is-today' : ''} ${x.lessons.length ? '' : 'is-empty'}" data-day="${x.date}" aria-pressed="${String(state.view === 'day' && x.date === state.selected)}" aria-label="${fmtDayWd(x.date)}, занятий: ${x.lessons.length}">
            <small>${fmtWd(x.date)}</small><b>${dayNum(x.date)}</b>${x.lessons.length ? html`<span class="daypill__dot"></span>` : ''}</button>`)}
        </div>

        ${d.changes.length ? html`<div class="alert alert--warn" role="status">${icon('alert', 18)}<div><b>Изменения на этой неделе</b>
          ${d.changes.map((l) => html`<div>${l.status === 'cancelled' ? 'Отменено' : 'Перенесено'}: ${l.subject} (${fmtDayShort(l.date)}, ${l.start}).${l.note ? ` ${l.note}` : ''}</div>`)}</div></div>` : ''}

        ${total === 0 ? html`<div class="card">${emptyState('calendar', 'На этой неделе занятий нет', 'Переключитесь на другую неделю или загляните позже.')}</div>`
        : state.view === 'day' ? html`<section class="card" aria-label="Занятия: ${fmtDayWd(sel.date)}">
            <div class="card__head"><h2>${fmtDayWd(sel.date)}</h2><span class="muted">${sel.lessons.length ? `Занятий: ${sel.lessons.length}` : ''}</span></div>
            ${sel.lessons.length ? html`<div>${sel.lessons.map((l) => lessonRow(l))}</div>` : emptyState('calendar', 'В этот день занятий нет', 'Выберите другой день недели.')}
          </section>`
          : html`<div class="stack">${d.days.map((x) => html`<section class="card" aria-label="${fmtDayWd(x.date)}">
              <div class="card__head"><h2>${fmtDayWd(x.date)}${x.date === d.today ? html` <span class="badge badge--info badge--plain" style="margin-left:8px">Сегодня</span>` : ''}</h2></div>
              ${x.lessons.length ? html`<div>${x.lessons.map((l) => lessonRow(l))}</div>` : html`<div class="card__body muted">Занятий нет</div>`}
            </section>`)}</div>`}
      </div>`;
    },
    bind: (el, d, { set, redraw }) => {
      const go = async (weekStart, keepSelected = false) => {
        if (state.busy) return;
        state.busy = true;
        el.style.opacity = '.6';
        try {
          if (!keepSelected) state.selected = null;
          const next = await app.call('schedule', { weekStart });
          pickSelected(next);
          set(next);
        } catch (e) { toast(e.message, 'error'); }
        state.busy = false;
        el.style.opacity = '';
      };
      el.querySelectorAll('[data-week]').forEach((b) => b.addEventListener('click', () => go(addDays(d.weekStart, 7 * Number(b.dataset.week)))));
      el.querySelector('[data-today]')?.addEventListener('click', () => go(d.today));
      el.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; redraw(); }));
      el.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
        state.selected = b.dataset.day;
        if (state.view === 'week') { document.querySelector(`section[aria-label^="${fmtDayWd(b.dataset.day)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        redraw();
      }));
    },
  });
}
