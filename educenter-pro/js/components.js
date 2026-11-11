/* Shared view components (one implementation per concept — no duplicates across pages). */
import { html, icon, fmtDayWd, fmtDayShort, lessonBadge, attBadge, gradeClass, dueInfo, fmtDateTime, fmtBytes } from './ui.js';

export function lessonRow(l, { showDate = false } = {}) {
  const cls = ['lesson', l.status === 'cancelled' ? 'lesson--cancelled' : '', l.phase === 'now' ? 'lesson--now' : ''].join(' ');
  return html`
  <div class="${cls}">
    <div class="lesson__time"><b>${l.start}</b><small>до ${l.end}</small></div>
    <div class="lesson__body">
      <div style="display:flex;justify-content:space-between;gap:8px 12px;flex-wrap:wrap;align-items:center">
        <h3 class="lesson__title">${l.subject}</h3>${lessonBadge(l)}
      </div>
      <div class="lesson__meta">
        ${showDate ? html`<span>${icon('calendar', 16)}${fmtDayWd(l.date)}</span>` : ''}
        <span>${icon('user', 16)}${l.teacher?.name || 'Преподаватель уточняется'}</span>
        <span>${icon('pin', 16)}Кабинет ${l.room}</span>
        ${l.phase === 'finished' && l.status !== 'cancelled' ? html`<span>${attBadge(l.attendance?.status)}</span>` : ''}
      </div>
      ${l.status === 'rescheduled' && l.original ? html`<div class="notice-inline"><b>Перенесено.</b> Было: ${fmtDayShort(l.original.date)}, ${l.original.start}–${l.original.end}, каб. ${l.original.room}.${l.note ? ` ${l.note}` : ''}</div>` : ''}
      ${l.status === 'cancelled' ? html`<div class="notice-inline notice-inline--bad"><b>Занятие отменено.</b> ${l.note || 'Подробности уточняйте в администрации.'}</div>` : ''}
    </div>
  </div>`;
}

export const gradeTile = (g) => html`<div class="grade ${gradeClass(g.percent)}" title="${g.score} из ${g.max}">${g.percent}</div>`;

export function gradeRow(g) {
  return html`<li>${gradeTile(g)}
    <div class="list__main"><div class="list__title">${g.subject}</div><div class="list__sub">${g.title} · ${fmtDayShort(g.date)}</div></div>
    <div class="list__side muted tnum">${g.score}/${g.max}</div></li>`;
}

const DUE_CLS = { bad: 'badge--bad', warn: 'badge--warn', info: 'badge--info', ok: 'badge--ok' };
/* Inner markup of an assignment row; callers wrap it in a link or a button. */
export function assignmentSummary(a, now) {
  const showDue = a.state === 'active' || a.state === 'overdue';
  const due = dueInfo(a.dueAt, now);
  const status = STATE_BADGE[a.state];
  return html`<div class="icon-tile">${icon('assignments', 20)}</div>
    <div class="list__main"><div class="list__title">${a.title}</div><div class="list__sub">${a.subject} · срок ${fmtDateTime(a.dueAt)}</div></div>
    <div class="list__side">${showDue ? html`<span class="badge ${DUE_CLS[due.tone]}">${due.text}</span>` : html`<span class="badge ${status.cls}">${status.label}</span>`}</div>`;
}
export const STATE_BADGE = {
  active: { label: 'Активно', cls: 'badge--info' },
  submitted: { label: 'На проверке', cls: 'badge--warn' },
  checked: { label: 'Проверено', cls: 'badge--ok' },
  overdue: { label: 'Просрочено', cls: 'badge--bad' },
};

export const fileChip = (name, size) => html`<span class="filechip">${icon('file', 16)}<span>${name}</span>${size != null ? html`<span class="muted">${fmtBytes(size)}</span>` : ''}</span>`;
