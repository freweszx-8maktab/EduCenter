import { html, icon, pageHead, emptyState, fmtDayWd, fmtDayShort, fmtWd, dayNum, fmtDay, lessonBadge, toast, todayOf } from '../../ui.js';

const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return todayOf(new Date(y, m - 1, d + n)); };
const STATUSES = [['present', 'Был', 'seg-ok'], ['late', 'Опоздал', 'seg-warn'], ['absent', 'Не был', 'seg-bad'], ['excused', 'Уваж.', '']];

export default async function attendance(host, app, query) {
  const state = { lessonId: query.lesson || null, marks: new Map(), detail: null, week: null, busy: false };
  const sync = () => history.replaceState(null, '', `#/attendance${state.lessonId ? `?lesson=${state.lessonId}` : ''}`);
  const current = (s) => state.marks.get(s.id) || { status: s.status, reason: s.reason };
  const dirty = () => state.marks.size;

  await app.view(host, {
    skeleton: 'page',
    fetch: async () => {
      const w = await app.call('staff.lessons', state.week ? { weekStart: state.week } : {});
      state.week = w.weekStart;
      if (state.lessonId) {
        try { await loadLesson(state.lessonId); } catch { state.lessonId = null; state.detail = null; }
      }
      return w;
    },
    render: (w) => {
      const canPrev = w.bounds && w.weekStart > w.bounds.first;
      const canNext = w.bounds && w.weekStart < w.bounds.last;
      const label = w.weekStart.slice(5, 7) === w.weekEnd.slice(5, 7) ? `${dayNum(w.weekStart)}–${dayNum(w.weekEnd)} ${fmtDay(w.weekEnd).split(' ')[1]}` : `${fmtDayShort(w.weekStart)} – ${fmtDayShort(w.weekEnd)}`;
      const total = w.days.reduce((n, x) => n + x.lessons.length, 0);
      return html`
      ${pageHead('Посещаемость', 'Отметки ставите только вы и администрация. Каждая отметка «Был» начисляет ученику 5 EduCoins, исправление пересчитывает баллы.')}
      <div class="split ${state.detail ? 'split--open' : ''}">
        <section class="card split__list" aria-label="Занятия недели">
          <div class="card__body" style="border-bottom:1px solid var(--border)"><div class="weekbar" role="group" aria-label="Выбор недели">
            <button class="btn btn--sm" data-week="-1" aria-label="Предыдущая неделя" ${canPrev ? '' : 'disabled'}>${icon('left', 16)}</button>
            <div class="weekbar__label" aria-live="polite">${label}</div>
            <button class="btn btn--sm" data-week="1" aria-label="Следующая неделя" ${canNext ? '' : 'disabled'}>${icon('right', 16)}</button>
            ${w.days.some((x) => x.date === w.today) ? '' : html`<button class="btn btn--sm" data-today>Сегодня</button>`}</div></div>
          ${total ? html`${w.days.filter((x) => x.lessons.length).map((x) => html`
            <div class="nav__label" style="padding:12px 20px 4px">${fmtDayWd(x.date)}${x.date === w.today ? ' · сегодня' : ''}</div>
            <ul>${x.lessons.map((l) => html`<li><button class="item-btn" data-lesson="${l.id}" aria-current="${String(l.id === state.lessonId)}">
              <div class="icon-tile">${icon('attendance', 20)}</div>
              <div class="list__main"><div class="list__title">${l.subject} · ${l.start}</div><div class="list__sub">${l.groupName}</div></div>
              <div class="list__side">${l.status === 'cancelled' || l.phase === 'upcoming' ? lessonBadge(l) : html`<span class="badge ${l.marked === l.students ? 'badge--ok' : 'badge--warn'}">${l.marked}/${l.students}</span>`}</div></button></li>`)}</ul>`)}`
            : emptyState('calendar', 'На этой неделе занятий нет', 'У вас нет занятий в этот период.')}
        </section>
        <section class="split__detail" aria-label="Отметка посещаемости" aria-live="polite">${state.detail ? panel(state.detail) : html`<div class="card">${emptyState('attendance', 'Выберите занятие', 'Откройте проведённое занятие из списка, чтобы отметить учеников.')}</div>`}</section>
      </div>`;
    },
    bind: (el, w, { set, reload }) => {
      const go = async (weekStart) => {
        if (state.busy) return; state.busy = true;
        try { state.lessonId = null; state.detail = null; state.marks.clear(); sync(); state.week = weekStart; set(await app.call('staff.lessons', { weekStart })); }
        catch (e) { toast(e.message, 'error'); }
        state.busy = false;
      };
      el.querySelectorAll('[data-week]').forEach((b) => b.addEventListener('click', () => go(addDays(w.weekStart, 7 * Number(b.dataset.week)))));
      el.querySelector('[data-today]')?.addEventListener('click', () => go(w.today));
      el.querySelectorAll('[data-lesson]').forEach((b) => b.addEventListener('click', async () => {
        if (state.marks.size && state.lessonId !== b.dataset.lesson && !(await app.confirm({ title: 'Отметки не сохранены', body: 'Если открыть другое занятие, несохранённые изменения будут потеряны.', confirmText: 'Открыть другое' }))) return;
        try { await loadLesson(b.dataset.lesson); set(w); window.scrollTo({ top: 0 }); } catch (e) { toast(e.message, 'error'); }
      }));
      el.querySelector('[data-back]')?.addEventListener('click', () => { state.lessonId = null; state.detail = null; state.marks.clear(); sync(); set(w); });
      bindPanel(el, w, { set, reload });
    },
  });

  async function loadLesson(id) {
    state.detail = await app.call('staff.lesson', { lessonId: id });
    state.lessonId = id; state.marks.clear(); sync();
  }

  function panel(d) {
    const l = d.lesson;
    return html`<article class="card">
      <div class="card__head"><div style="min-width:0"><button class="btn btn--sm back-btn" data-back style="margin-bottom:10px">${icon('left', 16)} К списку</button>
        <h2 tabindex="-1" style="font-size:18px">${l.subject} · ${l.groupName}</h2><p>${fmtDayWd(l.date)}, ${l.start}–${l.end} · каб. ${l.room}</p></div>${lessonBadge(l)}</div>
      ${!d.canMark ? html`<div class="card__body"><div class="alert alert--info">${icon('info', 18)}<div>${l.status === 'cancelled' ? 'Занятие отменено — отметки не ставятся.' : 'Занятие ещё не началось: отметки станут доступны с его началом.'}</div></div></div>` : ''}
      <div data-rows>${d.students.map((s) => row(s, d.canMark))}</div>
      ${d.canMark ? html`<div class="savebar"><div class="muted" data-dirty>${dirty() ? `Изменено: ${dirty()}` : 'Изменений нет'}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-all>Все присутствуют</button><button class="btn btn--primary" data-save ${dirty() ? '' : 'disabled'}>Сохранить</button></div></div>` : ''}
    </article>`;
  }
  function row(s, can) {
    const cur = current(s);
    const isDirty = state.marks.has(s.id);
    return html`<div class="mark-row ${isDirty ? 'is-dirty' : ''}" data-student="${s.id}">
      <div class="mark-row__name">${s.name}</div>
      <div class="segmented" role="group" aria-label="Статус: ${s.name}">${STATUSES.map(([k, l, c]) => html`<button class="${c}" data-st="${k}" aria-pressed="${String(cur.status === k)}" ${can ? '' : 'disabled'}>${l}</button>`)}</div>
      ${(cur.status === 'absent' || cur.status === 'excused') && can ? html`<div class="mark-row__reason"><label class="visually-hidden" for="r-${s.id}">Причина: ${s.name}</label><input class="input" id="r-${s.id}" data-reason maxlength="200" placeholder="Причина (необязательно)" value="${cur.reason}"></div>` : ''}
    </div>`;
  }

  function bindPanel(el, w, { set, reload }) {
    const d = state.detail; if (!d) return;
    const setMark = (s, patch) => {
      const next = { ...current(s), ...patch };
      if (next.status === (s.status) && (next.reason || '') === (s.reason || '')) state.marks.delete(s.id); else state.marks.set(s.id, next);
    };
    const refresh = (sid) => {
      const s = d.students.find((x) => x.id === sid);
      const r = el.querySelector(`[data-student="${sid}"]`);
      r.outerHTML = row(s, d.canMark).__raw;
      bindRow(el.querySelector(`[data-student="${sid}"]`), s);
      el.querySelector('[data-dirty]').textContent = dirty() ? `Изменено: ${dirty()}` : 'Изменений нет';
      el.querySelector('[data-save]').disabled = !dirty();
    };
    const bindRow = (r, s) => {
      r.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { setMark(s, { status: b.dataset.st, reason: b.dataset.st === 'absent' || b.dataset.st === 'excused' ? current(s).reason : '' }); refresh(s.id); }));
      r.querySelector('[data-reason]')?.addEventListener('input', (e) => { setMark(s, { reason: e.target.value }); el.querySelector('[data-dirty]').textContent = dirty() ? `Изменено: ${dirty()}` : 'Изменений нет'; el.querySelector('[data-save]').disabled = !dirty(); r.classList.toggle('is-dirty', state.marks.has(s.id)); });
    };
    d.students.forEach((s) => bindRow(el.querySelector(`[data-student="${s.id}"]`), s));
    el.querySelector('[data-all]')?.addEventListener('click', () => { d.students.forEach((s) => { if (current(s).status !== 'present') setMark(s, { status: 'present', reason: '' }); }); set(w); });
    el.querySelector('[data-save]')?.addEventListener('click', async (e) => {
      const marks = [...state.marks].map(([studentId, m]) => ({ studentId, status: m.status, reason: m.reason || '' })).filter((m) => m.status);
      if (!marks.length) return;
      const btn = e.currentTarget; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Сохранение…';
      try {
        await app.call('staff.markLesson', { lessonId: d.lesson.id, marks });
        toast(`Сохранено отметок: ${marks.length}`, 'success');
        state.marks.clear(); await reload();
      } catch (x) { toast(x.message, 'error'); btn.disabled = false; btn.textContent = 'Сохранить'; }
    });
  }
}
