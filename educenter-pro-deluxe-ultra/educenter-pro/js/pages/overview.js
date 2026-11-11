import { html, icon, stat, dec, plural, fmtDayShort, fmtDayWd, startsIn, emptyState, lessonBadge, todayOf } from '../ui.js';
import { lessonRow, gradeRow, assignmentSummary } from '../components.js';

function greeting(now) {
  const h = now.getHours();
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
}

export default async function overview(host, app) {
  await app.view(host, {
    skeleton: 'stats',
    fetch: () => app.call('overview'),
    render: (d) => {
      const now = app.now();
      const first = d.user.name.split(' ')[0];
      const s = d.stats;
      const att = s.attendance;
      return html`
      <div class="stack">
        <section class="card hero" aria-labelledby="page-title">
          ${app.avatar('avatar--lg')}
          <div class="hero__text">
            <h1 id="page-title" tabindex="-1">${greeting(now)}, ${first}</h1>
            <div class="hero__meta">
              <span>${icon('pin', 16)}${d.center.name}</span>
              <span>${icon('user', 16)}Группа ${d.group.name}</span>
              <span>${icon('book', 16)}${d.course.name}</span>
            </div>
          </div>
          <a class="btn" href="#/notifications">${icon('bell', 18)} Уведомления${d.unread ? html` <span class="nav__count" style="margin-left:2px">${d.unread}</span>` : ''}</a>
        </section>

        ${d.changes.length ? html`<div class="alert alert--warn" role="status">${icon('alert', 18)}<div><b>Изменения в расписании на ближайшую неделю:</b>
          ${d.changes.map((l) => html`<div>${l.status === 'cancelled' ? 'Отменено' : 'Перенесено'}: ${l.subject}, ${fmtDayShort(l.date)} в ${l.start}.</div>`)}
          <a href="#/schedule?week=${d.changes[0].date}">Открыть расписание</a></div></div>` : ''}
        ${s.assignments.overdue ? html`<div class="alert alert--bad" role="status">${icon('alert', 18)}<div>Просроченных заданий: <b>${s.assignments.overdue}</b>. Их ещё можно сдать, но баллы EduCoins не начисляются. <a href="#/assignments?tab=overdue">Перейти к заданиям</a></div></div>` : ''}

        <section class="grid-stats" aria-label="Ключевые показатели">
          ${stat('Посещаемость', 'attendance', att.percent == null ? '—' : att.percent, att.percent == null ? '' : '%', att.base ? `Посещено ${att.present + att.late} из ${att.base} занятий` : 'Пока нет отметок')}
          ${stat('Средний балл', 'chart', dec(s.average.value), s.average.value == null ? '' : '/100', s.average.count ? `По ${s.average.count} ${plural(s.average.count, ['оценке', 'оценкам', 'оценкам'])}` : 'Оценок пока нет')}
          ${stat('Задания', 'assignments', s.assignments.done, `/${s.assignments.total}`, s.assignments.total ? 'Выполнено или отправлено на проверку' : 'Заданий пока нет')}
          ${stat('Баланс EduCoins', 'coins', s.coins, '', html`<a href="#/coins">История и награды →</a>`)}
        </section>

        <div class="grid-main">
          <div class="stack">
            <section class="card next" aria-labelledby="next-h">
              <div class="next__label" id="next-h">Ближайшее занятие</div>
              ${d.nextLesson ? html`
                <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
                  <div class="next__title">${d.nextLesson.subject}</div>${lessonBadge(d.nextLesson)}
                </div>
                <div class="next__facts">
                  <span>${icon('calendar', 18)}${fmtDayWd(d.nextLesson.date)}</span>
                  <span>${icon('clock', 18)}${d.nextLesson.start}–${d.nextLesson.end}</span>
                  <span>${icon('user', 18)}${d.nextLesson.teacher?.name || '—'}</span>
                  <span>${icon('pin', 18)}Кабинет ${d.nextLesson.room}</span>
                </div>
                <div class="next__count">${icon('clock', 18)}${startsIn(d.nextLesson, now)}</div>
                ${d.nextLesson.status === 'rescheduled' ? html`<div class="notice-inline">Занятие перенесено. ${d.nextLesson.note || ''}</div>` : ''}`
        : emptyState('calendar', 'Ближайших занятий нет', 'Как только центр добавит занятия, они появятся здесь.')}
            </section>

            <section class="card" aria-labelledby="today-h">
              <div class="card__head"><div><h2 id="today-h">Расписание на сегодня</h2><p>${fmtDayWd(todayOf(now))}</p></div><a class="btn btn--sm" href="#/schedule">Вся неделя</a></div>
              ${d.today.length ? html`<div>${d.today.map((l) => lessonRow(l))}</div>` : emptyState('calendar', 'Сегодня занятий нет', 'Отдохните или повторите пройденное.')}
            </section>

            <section class="card" aria-labelledby="hw-h">
              <div class="card__head"><div><h2 id="hw-h">Активные домашние задания</h2><p>Ещё не отправлены, срок не истёк</p></div><a class="btn btn--sm" href="#/assignments">Все задания</a></div>
              ${d.activeAssignments.length ? html`<ul class="list">${d.activeAssignments.map((a) => html`<li style="padding:0"><a class="item-btn" href="#/assignments?open=${a.id}" style="text-decoration:none;color:inherit;border:0">${assignmentSummary(a, now)}</a></li>`)}</ul>`
        : emptyState('check', 'Всё сдано', 'Активных заданий сейчас нет.')}
            </section>
          </div>

          <div class="stack">
            <section class="card" aria-labelledby="gr-h">
              <div class="card__head"><h2 id="gr-h">Последние оценки</h2><a class="btn btn--sm" href="#/performance">Успеваемость</a></div>
              ${d.recentGrades.length ? html`<ul class="list">${d.recentGrades.map(gradeRow)}</ul>` : emptyState('chart', 'Оценок пока нет', 'Они появятся после первой проверки работ.')}
            </section>
            <section class="card" aria-labelledby="ac-h">
              <div class="card__head"><h2 id="ac-h">Последние достижения</h2><a class="btn btn--sm" href="#/achievements">Все</a></div>
              ${d.recentAchievements.length ? html`<ul class="list">${d.recentAchievements.map((a) => html`<li><div class="icon-tile icon-tile--accent">${icon('award', 20)}</div>
                <div class="list__main"><div class="list__title">${a.title}</div><div class="list__sub">Получено ${fmtDayShort(a.achievedAt)}</div></div><span class="badge badge--ok badge--plain">+${a.reward}</span></li>`)}</ul>`
        : emptyState('award', 'Наград пока нет', 'Посещайте занятия и сдавайте работы вовремя.')}
            </section>
          </div>
        </div>
      </div>`;
    },
  });
}
