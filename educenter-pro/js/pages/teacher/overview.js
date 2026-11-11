import { html, icon, pageHead, stat, emptyState, fmtDayWd, fmtDateTime, plural } from '../../ui.js';
import { lessonRow } from '../../components.js';

export default async function overview(host, app) {
  await app.view(host, {
    skeleton: 'stats',
    fetch: () => app.call('staff.overview'),
    render: (d) => {
      const first = d.user.name.split(' ')[0];
      const total = d.groups.reduce((n, g) => n + g.students, 0);
      return html`
      ${pageHead(`Здравствуйте, ${first}`, d.groups.length ? `Ваши группы: ${d.groups.map((g) => g.name).join(', ')}.` : 'За вами пока не закреплено ни одной группы.')}
      <div class="stack">
        <section class="grid-stats" aria-label="Сводка">
          ${stat('Занятий сегодня', 'calendar', d.today.length, '', d.next ? `Следующее: ${d.next.subject}, ${fmtDayWd(d.next.date).toLowerCase()}, ${d.next.start}` : 'Ближайших занятий нет')}
          ${stat('Работ на проверке', 'assignments', d.toCheck, '', d.toCheck ? 'Ученики ждут оценку' : 'Очередь пуста')}
          ${stat('Неотмеченных занятий', 'attendance', d.pendingMarks, '', d.pendingMarks ? 'Проставьте посещаемость' : 'Журнал заполнен')}
          ${stat('Учеников', 'user', total, '', `${d.groups.length} ${plural(d.groups.length, ['группа', 'группы', 'групп'])}`)}
        </section>

        <div class="grid-main">
          <div class="stack">
            <section class="card" aria-labelledby="t-h"><div class="card__head"><h2 id="t-h">Занятия сегодня</h2><a class="btn btn--sm" href="#/schedule">Расписание</a></div>
              ${d.today.length ? html`<div>${d.today.map((l) => lessonRow({ ...l, teacher: { name: l.groupName } }))}</div>` : emptyState('calendar', 'Сегодня занятий нет', 'Отдохните или подготовьте материалы.')}</section>

            <section class="card" aria-labelledby="p-h"><div class="card__head"><div><h2 id="p-h">Нужно отметить посещаемость</h2><p>Проведённые занятия без полной отметки</p></div><a class="btn btn--sm" href="#/attendance">Журнал</a></div>
              ${d.pendingList.length ? html`<ul class="list">${d.pendingList.map((l) => html`<li><a class="item-btn" href="#/attendance?lesson=${l.id}"><div class="icon-tile icon-tile--accent">${icon('attendance', 20)}</div>
                <div class="list__main"><div class="list__title">${l.subject} · ${l.groupName}</div><div class="list__sub">${fmtDayWd(l.date)}, ${l.start}</div></div>
                <div class="list__side"><span class="badge badge--warn">${l.marked} из ${l.total}</span></div></a></li>`)}</ul>` : emptyState('check', 'Всё отмечено', 'Неотмеченных занятий нет.')}</section>
          </div>

          <div class="stack">
            <section class="card" aria-labelledby="c-h"><div class="card__head"><h2 id="c-h">Ждут проверки</h2><a class="btn btn--sm" href="#/assignments">Все задания</a></div>
              ${d.toCheckList.length ? html`<ul class="list">${d.toCheckList.map((x) => html`<li><a class="item-btn" href="#/assignments?open=${x.assignmentId}"><div class="icon-tile">${icon('assignments', 20)}</div>
                <div class="list__main"><div class="list__title">${x.student}</div><div class="list__sub">${x.title} · сдано ${fmtDateTime(x.submittedAt)}</div></div>
                <div class="list__side">${x.late ? html`<span class="badge badge--bad">Поздно</span>` : ''}</div></a></li>`)}</ul>` : emptyState('check', 'Проверять нечего', 'Новые работы появятся здесь.')}</section>

            <section class="card" aria-labelledby="a-h"><div class="card__head"><div><h2 id="a-h">Требуют внимания</h2><p>Посещаемость ниже 80% или средний балл ниже 70</p></div></div>
              ${d.attention.length ? html`<ul class="list">${d.attention.map((s) => html`<li><a class="item-btn" href="#/students?open=${s.id}"><div class="icon-tile icon-tile--locked">${icon('alert', 20)}</div>
                <div class="list__main"><div class="list__title">${s.name}</div><div class="list__sub">${s.reasons.join(' · ')}</div></div></a></li>`)}</ul>` : emptyState('check', 'Тревожных сигналов нет', 'Показатели учеников в норме.')}</section>
          </div>
        </div>
      </div>`;
    },
  });
}
