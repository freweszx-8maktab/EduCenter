import { html, icon, pageHead, emptyState, fmtDateTime, fmtBytes, formDialog, toast, gradeClass } from '../../ui.js';

const STATE = { none: ['Не сдано', 'badge--plain'], submitted: ['На проверке', 'badge--warn'], checked: ['Проверено', 'badge--ok'] };

function download(name, base64) {
  const bin = atob(base64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes]));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default async function assignments(host, app, query) {
  const state = { open: query.open || null, detail: null, review: null, filter: 'all' };
  const sync = () => history.replaceState(null, '', `#/assignments${state.open ? `?open=${state.open}` : ''}`);

  await app.view(host, {
    skeleton: 'page',
    fetch: async () => {
      const d = await app.call('staff.assignments');
      if (state.open && d.items.some((a) => a.id === state.open)) state.detail = await app.call('staff.assignment', { assignmentId: state.open });
      else { state.open = null; state.detail = null; }
      return d;
    },
    render: (d) => {
      const items = d.items.filter((a) => state.filter === 'all' || a.toCheck > 0);
      return html`
      ${pageHead('Задания и проверка', 'Выдавайте домашние задания группам и проверяйте присланные работы. Оценка сразу появляется у ученика.',
        html`<button class="btn btn--primary" data-new>${icon('assignments', 16)} Новое задание</button>`)}
      <div class="split ${state.detail ? 'split--open' : ''}">
        <section class="card split__list" aria-label="Задания">
          <div class="card__body" style="border-bottom:1px solid var(--border)"><div class="segmented" role="group" aria-label="Фильтр">
            <button data-f="all" aria-pressed="${String(state.filter === 'all')}">Все<span class="count">${d.items.length}</span></button>
            <button data-f="check" aria-pressed="${String(state.filter === 'check')}">На проверке<span class="count">${d.items.filter((a) => a.toCheck).length}</span></button></div></div>
          ${items.length ? html`<ul>${items.map((a) => html`<li><button class="item-btn" data-open="${a.id}" aria-current="${String(a.id === state.open)}"><div class="icon-tile">${icon('assignments', 20)}</div>
            <div class="list__main"><div class="list__title">${a.title}</div><div class="list__sub">${a.subject} · ${a.groupName} · срок ${fmtDateTime(a.dueAt)}</div></div>
            <div class="list__side">${a.toCheck ? html`<span class="badge badge--warn">Проверить: ${a.toCheck}</span>` : html`<span class="muted tnum">${a.submitted}/${a.total}</span>`}</div></button></li>`)}</ul>`
          : emptyState('assignments', state.filter === 'check' ? 'Проверять нечего' : 'Заданий пока нет', state.filter === 'check' ? 'Все присланные работы проверены.' : 'Нажмите «Новое задание», чтобы выдать первое.')}
        </section>
        <section class="split__detail" aria-label="Работы учеников" aria-live="polite">${state.detail ? detail(state.detail) : html`<div class="card">${emptyState('assignments', 'Выберите задание', 'Откройте задание из списка, чтобы увидеть работы учеников.')}</div>`}</section>
      </div>`;
    },
    bind: (el, d, { redraw, reload, set }) => {
      el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.f; redraw(); }));
      el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', async () => {
        try { state.detail = await app.call('staff.assignment', { assignmentId: b.dataset.open }); state.open = b.dataset.open; state.review = null; sync(); redraw(); window.scrollTo({ top: 0 }); } catch (e) { toast(e.message, 'error'); }
      }));
      el.querySelector('[data-back]')?.addEventListener('click', () => { state.open = null; state.detail = null; state.review = null; sync(); redraw(); });
      el.querySelector('[data-new]').addEventListener('click', async () => {
        const due = new Date(app.now().getTime() + 3 * 86400000);
        const dueStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}T20:00`;
        const res = await formDialog({
          title: 'Новое задание', confirmText: 'Выдать задание',
          body: html`<div class="form-grid">
            <div class="field"><label for="a-g">Группа</label><select class="select" id="a-g" name="groupId">${d.groups.map((g) => html`<option value="${g.id}">${g.name}</option>`)}</select></div>
            <div class="field"><label for="a-s">Предмет</label><select class="select" id="a-s" name="subject">${d.subjects.map((s) => html`<option>${s}</option>`)}</select></div>
            <div class="field span-all"><label for="a-t">Название</label><input class="input" id="a-t" name="title" maxlength="100" placeholder="Например: Passage 2 — True / False / Not Given"></div>
            <div class="field span-all"><label for="a-d">Описание</label><textarea class="textarea" id="a-d" name="description" rows="3" maxlength="1500" placeholder="Что нужно сделать"></textarea></div>
            <div class="field"><label for="a-due">Срок сдачи</label><input class="input" id="a-due" name="dueAt" type="datetime-local" value="${dueStr}"></div>
            <div class="field"><span class="label">Файлы от учеников</span><label class="switch" style="padding:0"><span>Разрешить</span><input type="checkbox" name="allowFiles" checked></label></div></div>`,
          submit: (v) => {
            if (!v.title?.trim()) throw new Error('Укажите название задания.');
            if (!v.dueAt) throw new Error('Укажите срок сдачи.');
            return app.call('staff.createAssignment', { groupId: v.groupId, subject: v.subject, title: v.title.trim(), description: v.description || '', dueAt: v.dueAt, allowFiles: v.allowFiles === 'on' });
          },
        });
        if (res) { state.open = res.result.id; sync(); toast('Задание выдано, группа уведомлена', 'success'); reload(); }
      });
      el.querySelectorAll('[data-file]').forEach((b) => b.addEventListener('click', async () => {
        try { const f = await app.call('staff.file', { submissionId: b.dataset.sub, index: Number(b.dataset.file) }); download(f.name, f.data); } catch (e) { toast(e.message, 'error'); }
      }));
      el.querySelectorAll('[data-review]').forEach((b) => b.addEventListener('click', () => { state.review = b.dataset.review; redraw(); el.querySelector('#rv-score')?.focus(); }));
      el.querySelector('[data-cancel-review]')?.addEventListener('click', () => { state.review = null; redraw(); });
      const form = el.querySelector('#review-form');
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = form.querySelector('[data-err]');
        const show = (m) => { err.textContent = m || ''; err.hidden = !m; };
        const score = Number(form.score.value); const max = Number(form.max.value);
        if (form.score.value === '' || !Number.isFinite(score) || !Number.isFinite(max) || max <= 0 || score < 0 || score > max) return show('Введите балл от 0 до максимума.');
        const ok = await app.confirm({ title: 'Сохранить оценку?', body: html`<p>Оценка ${score} из ${max} будет сразу показана ученику. После проверки работу нельзя изменить.</p>`, confirmText: 'Сохранить' });
        if (!ok) return;
        const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Сохранение…';
        try {
          await app.call('staff.checkSubmission', { submissionId: state.review, score, max, feedback: form.feedback.value });
          toast('Работа проверена', 'success'); state.review = null;
          state.detail = await app.call('staff.assignment', { assignmentId: state.open });
          set(await app.call('staff.assignments'));
        } catch (x) { show(x.message); btn.disabled = false; btn.textContent = 'Сохранить оценку'; }
      });
    },
  });

  function detail(a) {
    return html`<article class="card">
      <div class="card__head"><div style="min-width:0"><button class="btn btn--sm back-btn" data-back style="margin-bottom:10px">${icon('left', 16)} К списку</button>
        <h2 tabindex="-1" style="font-size:18px;overflow-wrap:anywhere">${a.title}</h2><p>${a.subject} · ${a.groupName} · срок ${fmtDateTime(a.dueAt)}</p></div></div>
      ${a.description ? html`<div class="detail__section" style="border-top:0"><div class="prose">${a.description}</div></div>` : ''}
      <div>${a.rows.map((r) => {
        const [label, cls] = STATE[r.state]; const sub = r.submission;
        return html`<div class="detail__section"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
          <b>${r.student}</b><span style="display:flex;gap:8px;align-items:center">${sub?.late ? html`<span class="badge badge--bad">С опозданием</span>` : ''}<span class="badge ${cls}">${label}</span></span></div>
          ${sub ? html`<div class="muted" style="margin:6px 0">Сдано ${fmtDateTime(sub.submittedAt)}</div>
            ${sub.text ? html`<div class="prose">${sub.text}</div>` : ''}
            ${sub.files.length ? html`<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">${sub.files.map((f) => html`<button class="filechip" data-sub="${sub.id}" data-file="${f.index}" style="cursor:pointer" title="Скачать">${icon('download', 16)}<span>${f.name}</span><span class="muted">${fmtBytes(f.size)}</span></button>`)}</div>` : ''}
            ${r.state === 'checked' ? html`<div class="score-box" style="margin-top:12px"><div class="grade ${gradeClass(Math.round((sub.score / sub.max) * 100))}" style="min-width:56px;height:48px">${sub.score}</div><div><b>${sub.score} из ${sub.max}</b>${sub.feedback ? html`<div class="muted">${sub.feedback}</div>` : ''}</div></div>`
              : state.review === sub.id ? html`<form id="review-form" class="stack stack--sm" style="margin-top:12px" novalidate>
                  <div class="form-grid"><div class="field"><label for="rv-score">Балл</label><input class="input" id="rv-score" name="score" type="number" inputmode="decimal" min="0" step="any"></div>
                  <div class="field"><label for="rv-max">Максимум</label><input class="input" id="rv-max" name="max" type="number" min="1" value="100" step="any"></div>
                  <div class="field span-all"><label for="rv-fb">Комментарий ученику</label><textarea class="textarea" id="rv-fb" name="feedback" rows="2" maxlength="500"></textarea></div></div>
                  ${sub.late ? html`<div class="field__hint">Работа сдана с опозданием: оценка будет выставлена, EduCoins за задание не начисляются.</div>` : html`<div class="field__hint">За работу, сданную вовремя, ученик получит 10 EduCoins.</div>`}
                  <div class="field__error" data-err role="alert" hidden></div>
                  <div style="display:flex;gap:8px"><button class="btn btn--primary" type="submit">Сохранить оценку</button><button class="btn" type="button" data-cancel-review>Отмена</button></div></form>`
              : html`<div style="margin-top:12px"><button class="btn btn--primary btn--sm" data-review="${sub.id}">Проверить</button></div>`}` : ''}
        </div>`;
      })}</div></article>`;
  }
}
