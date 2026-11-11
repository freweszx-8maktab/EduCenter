import { html, icon, pageHead, emptyState, fmtDayWd, fmtDayShort, fmtDay, dayNum, lessonBadge, formDialog, toast, todayOf } from '../../ui.js';

const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return todayOf(new Date(y, m - 1, d + n)); };

export default async function schedule(host, app, query) {
  const state = { week: query.week || null };
  await app.view(host, {
    skeleton: 'page',
    fetch: async () => { const d = await app.call('staff.lessons', state.week ? { weekStart: state.week } : {}); state.week = d.weekStart; return d; },
    render: (d) => {
      const canPrev = d.bounds && d.weekStart > d.bounds.first;
      const canNext = d.bounds && d.weekStart < d.bounds.last;
      const label = d.weekStart.slice(5, 7) === d.weekEnd.slice(5, 7) ? `${dayNum(d.weekStart)}–${dayNum(d.weekEnd)} ${fmtDay(d.weekEnd).split(' ')[1]}` : `${fmtDayShort(d.weekStart)} – ${fmtDayShort(d.weekEnd)}`;
      return html`
      ${pageHead('Расписание', 'Ваши занятия. Отмена и перенос сразу приходят ученикам в уведомления.')}
      <div class="stack">
        <div class="weekbar" role="group" aria-label="Выбор недели">
          <button class="btn btn--sm" data-week="-1" aria-label="Предыдущая неделя" ${canPrev ? '' : 'disabled'}>${icon('left', 16)}</button>
          <div class="weekbar__label" aria-live="polite">${label}</div>
          <button class="btn btn--sm" data-week="1" aria-label="Следующая неделя" ${canNext ? '' : 'disabled'}>${icon('right', 16)}</button>
          ${d.days.some((x) => x.date === d.today) ? '' : html`<button class="btn btn--sm" data-today>Сегодня</button>`}</div>
        ${d.days.every((x) => !x.lessons.length) ? html`<div class="card">${emptyState('calendar', 'На этой неделе занятий нет', 'Переключитесь на другую неделю.')}</div>`
        : d.days.filter((x) => x.lessons.length).map((x) => html`<section class="card" aria-label="${fmtDayWd(x.date)}"><div class="card__head"><h2>${fmtDayWd(x.date)}${x.date === d.today ? html` <span class="badge badge--info badge--plain" style="margin-left:8px">Сегодня</span>` : ''}</h2></div>
          ${x.lessons.map((l) => html`<div class="lesson ${l.status === 'cancelled' ? 'lesson--cancelled' : ''} ${l.phase === 'now' ? 'lesson--now' : ''}"><div class="lesson__time"><b>${l.start}</b><small>до ${l.end}</small></div>
            <div class="lesson__body"><div style="display:flex;justify-content:space-between;gap:8px 12px;flex-wrap:wrap;align-items:center"><h3 class="lesson__title">${l.subject}</h3>${lessonBadge(l)}</div>
              <div class="lesson__meta"><span>${icon('user', 16)}${l.groupName}</span><span>${icon('pin', 16)}Кабинет ${l.room}</span></div>
              ${l.status === 'rescheduled' && l.original ? html`<div class="notice-inline"><b>Перенесено.</b> Было: ${fmtDayShort(l.original.date)}, ${l.original.start}–${l.original.end}.${l.note ? ` ${l.note}` : ''}</div>` : ''}
              ${l.status === 'cancelled' ? html`<div class="notice-inline notice-inline--bad"><b>Отменено.</b> ${l.note || ''}</div>` : ''}
              ${l.phase === 'upcoming' && l.status !== 'cancelled' ? html`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn btn--sm" data-move="${l.id}">Перенести</button><button class="btn btn--sm btn--danger" data-cancel="${l.id}">Отменить</button></div>` : ''}
            </div></div>`)}</section>`)}
      </div>`;
    },
    bind: (el, d, { set, reload }) => {
      const go = async (w) => { try { state.week = w; set(await app.call('staff.lessons', { weekStart: w })); } catch (e) { toast(e.message, 'error'); } };
      el.querySelectorAll('[data-week]').forEach((b) => b.addEventListener('click', () => go(addDays(d.weekStart, 7 * Number(b.dataset.week)))));
      el.querySelector('[data-today]')?.addEventListener('click', () => go(d.today));
      const find = (id) => d.days.flatMap((x) => x.lessons).find((l) => l.id === id);
      el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
        const l = find(b.dataset.cancel);
        const res = await formDialog({
          title: 'Отменить занятие?', confirmText: 'Отменить занятие', danger: true,
          body: html`<p>${l.subject}, ${fmtDayWd(l.date)}, ${l.start}. Все ученики группы «${l.groupName}» получат уведомление.</p>
            <div class="field" style="margin-top:12px"><label for="c-n">Причина (необязательно)</label><input class="input" id="c-n" name="note" maxlength="150"></div>`,
          submit: (v) => app.call('staff.cancelLesson', { lessonId: l.id, note: v.note || '' }),
        });
        if (res) { toast('Занятие отменено, ученики уведомлены', 'success'); reload(); }
      }));
      el.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', async () => {
        const l = find(b.dataset.move);
        const res = await formDialog({
          title: 'Перенести занятие', confirmText: 'Перенести',
          body: html`<p class="muted" style="margin-bottom:12px">${l.subject}, сейчас: ${fmtDayWd(l.date)}, ${l.start}–${l.end}.</p><div class="form-grid">
            <div class="field span-all"><label for="m-d">Новая дата</label><input class="input" id="m-d" name="date" type="date" value="${l.date}" min="${todayOf(app.now())}"></div>
            <div class="field"><label for="m-s">Начало</label><input class="input" id="m-s" name="start" type="time" value="${l.start}"></div>
            <div class="field"><label for="m-e">Конец</label><input class="input" id="m-e" name="end" type="time" value="${l.end}"></div>
            <div class="field"><label for="m-r">Кабинет</label><input class="input" id="m-r" name="room" maxlength="10" value="${l.room}"></div>
            <div class="field span-all"><label for="m-n">Комментарий (необязательно)</label><input class="input" id="m-n" name="note" maxlength="150"></div></div>`,
          submit: (v) => {
            if (!v.date || !v.start || !v.end) throw new Error('Заполните дату и время.');
            if (v.end <= v.start) throw new Error('Время окончания должно быть позже начала.');
            return app.call('staff.rescheduleLesson', { lessonId: l.id, date: v.date, start: v.start, end: v.end, room: v.room || l.room, note: v.note || '' });
          },
        });
        if (res) { toast('Занятие перенесено, ученики уведомлены', 'success'); reload(); }
      }));
    },
  });
}
