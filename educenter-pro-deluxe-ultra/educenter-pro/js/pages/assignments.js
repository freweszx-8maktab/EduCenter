import { html, icon, pageHead, emptyState, fmtDateTime, fmtBytes, dueInfo, toast } from '../ui.js';
import { assignmentSummary, STATE_BADGE } from '../components.js';

const TABS = [
  ['active', 'Активные', (a) => a.state === 'active'],
  ['done', 'Выполненные', (a) => a.state === 'submitted' || a.state === 'checked'],
  ['overdue', 'Просроченные', (a) => a.state === 'overdue'],
];

const readFile = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve({ name: file.name, size: file.size, data: String(r.result).split(',')[1] || '' });
  r.onerror = () => reject(new Error(`Не удалось прочитать файл «${file.name}»`));
  r.readAsDataURL(file);
});

function download(name, base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes]));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default async function assignments(host, app, query) {
  const state = { tab: TABS.some(([k]) => k === query.tab) ? query.tab : 'active', q: '', subject: 'all', selected: query.open || null, drafts: {}, files: [], filesFor: null, busy: false };

  await app.view(host, {
    skeleton: 'page',
    fetch: async () => {
      const d = await app.call('assignments');
      const found = d.items.find((a) => a.id === state.selected);
      if (found) state.tab = TABS.find(([, , f]) => f(found))[0];
      else state.selected = null;
      return d;
    },
    render: (d) => {
      const now = app.now();
      const subjects = [...new Set(d.items.map((a) => a.subject))].sort();
      const tab = TABS.find(([k]) => k === state.tab);
      const q = state.q.trim().toLowerCase();
      const visible = d.items.filter(tab[2]).filter((a) => (state.subject === 'all' || a.subject === state.subject) && (!q || `${a.title} ${a.subject}`.toLowerCase().includes(q)));
      if (state.tab !== 'active') visible.reverse();
      const sel = d.items.find((a) => a.id === state.selected);
      return html`
      ${pageHead('Домашние задания', 'Активные, выполненные и просроченные задания. Ответы можно отправить текстом и файлами.')}
      <div class="split ${sel ? 'split--open' : ''}">
        <section class="card split__list" aria-label="Список заданий">
          <div class="card__body" style="border-bottom:1px solid var(--border);display:grid;gap:12px">
            <div class="segmented" role="tablist" aria-label="Статус заданий">${TABS.map(([k, l, f]) => html`<button role="tab" data-tab="${k}" aria-selected="${String(state.tab === k)}">${l}<span class="count">${d.items.filter(f).length}</span></button>`)}</div>
            <div class="toolbar">
              <div class="input-icon grow"><label class="visually-hidden" for="q">Поиск</label>${icon('search', 18)}<input class="input" id="q" type="search" placeholder="Поиск по названию" value="${state.q}"></div>
              ${subjects.length > 1 ? html`<label class="visually-hidden" for="f-sub">Предмет</label><select class="select" id="f-sub"><option value="all">Все предметы</option>${subjects.map((s) => html`<option ${s === state.subject ? 'selected' : ''}>${s}</option>`)}</select>` : ''}
            </div>
          </div>
          ${visible.length ? html`<ul>${visible.map((a) => html`<li><button class="item-btn" data-open="${a.id}" aria-current="${String(a.id === state.selected)}">${assignmentSummary(a, now)}</button></li>`)}</ul>`
        : emptyState(state.tab === 'active' ? 'check' : 'assignments', state.q || state.subject !== 'all' ? 'Ничего не найдено' : state.tab === 'active' ? 'Активных заданий нет' : state.tab === 'done' ? 'Выполненных заданий пока нет' : 'Просроченных заданий нет',
          state.q || state.subject !== 'all' ? 'Измените поиск или фильтр.' : state.tab === 'overdue' ? 'Отлично — вы ничего не пропустили.' : 'Здесь появятся задания от преподавателей.')}
        </section>
        <section class="split__detail" aria-label="Подробности задания" aria-live="polite">${sel ? detail(sel, d, now) : html`<div class="card">${emptyState('assignments', 'Выберите задание', 'Откройте задание из списка, чтобы увидеть описание и отправить ответ.')}</div>`}</section>
      </div>`;
    },
    bind: (el, d, { redraw, set }) => {
      const sel = d.items.find((a) => a.id === state.selected);
      el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; state.selected = null; redraw(); }));
      el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { state.selected = b.dataset.open; redraw(); el.querySelector('.split__detail h2')?.focus?.(); window.scrollTo({ top: 0 }); }));
      el.querySelector('[data-back]')?.addEventListener('click', () => { state.selected = null; redraw(); });
      let t;
      el.querySelector('#q')?.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; redraw(); const i = host.querySelector('#q'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 200); });
      el.querySelector('#f-sub')?.addEventListener('change', (e) => { state.subject = e.target.value; redraw(); });
      el.querySelectorAll('[data-file]').forEach((b) => b.addEventListener('click', async () => {
        try { const f = await app.call('downloadFile', { assignmentId: sel.id, index: Number(b.dataset.file) }); download(f.name, f.data); } catch (e) { toast(e.message, 'error'); }
      }));
      if (!sel) return;
      const form = el.querySelector('#submit-form');
      if (!form) return;
      const ta = form.querySelector('textarea');
      const err = form.querySelector('[data-err]');
      const showErr = (m) => { err.textContent = m || ''; err.hidden = !m; };
      if (state.filesFor !== sel.id) { state.files = []; state.filesFor = sel.id; }
      const renderFiles = () => {
        form.querySelector('[data-files]').innerHTML = state.files.map((f, i) => `<span class="filechip"><span>${f.name.replace(/[&<>"']/g, '')}</span><span class="muted">${fmtBytes(f.size)}</span><button type="button" class="btn btn--ghost btn--sm" data-rm="${i}" aria-label="Убрать файл" style="height:24px;padding:0 6px">✕</button></span>`).join(' ');
        form.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { state.files.splice(Number(b.dataset.rm), 1); renderFiles(); }));
      };
      renderFiles();
      ta.addEventListener('input', () => { state.drafts[sel.id] = ta.value; form.querySelector('[data-count]').textContent = `${ta.value.length} / 5000`; });
      form.querySelector('input[type=file]')?.addEventListener('change', async (e) => {
        showErr('');
        const lim = d.limits;
        for (const file of e.target.files) {
          const ext = file.name.split('.').pop().toLowerCase();
          if (!lim.extensions.includes(ext)) { showErr(`Формат «.${ext}» не поддерживается. Разрешены: ${lim.extensions.join(', ')}.`); continue; }
          if (file.size > lim.maxFileBytes) { showErr(`Файл «${file.name}» больше ${fmtBytes(lim.maxFileBytes)}.`); continue; }
          if (state.files.length >= lim.maxFiles) { showErr(`Можно прикрепить не более ${lim.maxFiles} файлов.`); break; }
          try { state.files.push(await readFile(file)); } catch (x) { showErr(x.message); }
        }
        e.target.value = '';
        renderFiles();
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (state.busy) return;
        const text = ta.value.trim();
        if (!text && !state.files.length) { showErr('Напишите ответ или прикрепите файл.'); ta.focus(); return; }
        const late = sel.state === 'overdue';
        const ok = await app.confirm({
          title: sel.submission ? 'Обновить ответ?' : 'Отправить работу?',
          body: html`<p>${late ? 'Срок сдачи истёк: работа будет отмечена как сданная с опозданием, EduCoins за неё не начисляются. ' : ''}Пока преподаватель не проверил работу, ответ можно будет изменить. После проверки — нельзя.</p>`,
          confirmText: 'Отправить',
        });
        if (!ok) return;
        state.busy = true;
        const btn = form.querySelector('[type=submit]');
        btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Отправка…';
        try {
          const updated = await app.call('submitAssignment', { assignmentId: sel.id, text, files: state.files });
          d.items = d.items.map((a) => (a.id === updated.id ? updated : a));
          delete state.drafts[sel.id]; state.files = [];
          state.tab = 'done';
          toast('Работа отправлена на проверку', 'success');
          set(d);
        } catch (x) { showErr(x.message); toast(x.message, 'error'); btn.disabled = false; btn.textContent = sel.submission ? 'Обновить ответ' : 'Отправить на проверку'; }
        state.busy = false;
      });
    },
  });

  function detail(a, d, now) {
    const due = dueInfo(a.dueAt, now);
    const st = STATE_BADGE[a.state];
    const sub = a.submission;
    const canEdit = a.state !== 'checked';
    return html`<article class="card">
      <div class="card__head"><div style="min-width:0"><button class="btn btn--sm back-btn" data-back style="margin-bottom:10px">${icon('left', 16)} К списку</button>
        <h2 tabindex="-1" style="font-size:18px;overflow-wrap:anywhere">${a.title}</h2><p>${a.subject}</p></div><span class="badge ${st.cls}">${st.label}</span></div>
      <div class="detail__section" style="border-top:0"><dl class="dl">
        <dt>Преподаватель</dt><dd>${a.teacher?.name || '—'}</dd>
        <dt>Выдано</dt><dd>${fmtDateTime(a.createdAt)}</dd>
        <dt>Срок сдачи</dt><dd>${fmtDateTime(a.dueAt)}${a.state === 'active' || a.state === 'overdue' ? html` <span class="badge ${{ bad: 'badge--bad', warn: 'badge--warn', info: 'badge--info', ok: 'badge--ok' }[due.tone]}" style="margin-left:6px">${due.text}</span>` : ''}</dd></dl></div>
      <div class="detail__section"><h3>Описание</h3><div class="prose">${a.description || 'Описание не указано.'}</div></div>

      ${a.state === 'checked' ? html`<div class="detail__section"><h3>Результат проверки</h3>
        <div class="score-box"><div class="grade ${sub.score / sub.max >= 0.85 ? 'grade--ok' : sub.score / sub.max >= 0.7 ? '' : sub.score / sub.max >= 0.55 ? 'grade--warn' : 'grade--bad'}" style="min-width:56px;height:48px">${sub.score}</div>
          <div><b>${sub.score} из ${sub.max}</b><div class="muted">Проверено ${fmtDateTime(sub.checkedAt)}${sub.late ? ' · сдано с опозданием' : ''}</div></div></div>
        ${sub.feedback ? html`<p class="prose" style="margin-top:12px"><b>Комментарий преподавателя:</b> ${sub.feedback}</p>` : ''}</div>` : ''}

      ${sub ? html`<div class="detail__section"><h3>Ваш ответ</h3>
        <div class="muted" style="margin-bottom:8px">Отправлено ${fmtDateTime(sub.submittedAt)}${sub.late ? ' · с опозданием' : ''}</div>
        ${sub.text ? html`<div class="prose">${sub.text}</div>` : html`<div class="muted">Только файлы</div>`}
        ${sub.files.length ? html`<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">${sub.files.map((f) => html`<button class="filechip" data-file="${f.index}" style="cursor:pointer" title="Скачать">${icon('download', 16)}<span>${f.name}</span><span class="muted">${fmtBytes(f.size)}</span></button>`)}</div>` : ''}</div>` : ''}

      ${canEdit ? html`<div class="detail__section"><h3>${sub ? 'Изменить ответ' : 'Отправить ответ'}</h3>
        ${a.state === 'overdue' ? html`<div class="alert alert--warn" style="margin-bottom:12px">${icon('alert', 18)}<div>Срок сдачи истёк. Работу ещё можно сдать, но EduCoins за неё не начисляются.</div></div>` : ''}
        <form id="submit-form" class="stack--sm stack" novalidate>
          <div class="field"><label for="answer">Ответ</label>
            <textarea class="textarea" id="answer" maxlength="5000" placeholder="Напишите ответ или вставьте текст работы">${state.drafts[a.id] ?? ''}</textarea>
            <div class="field__hint" data-count>${(state.drafts[a.id] ?? '').length} / 5000</div></div>
          ${a.allowFiles ? html`<div class="field"><span class="label">Файлы (необязательно)</span>
            <div class="dropzone"><input type="file" id="files" multiple accept="${d.limits.extensions.map((e) => `.${e}`).join(',')}" aria-describedby="files-hint">
              <div class="field__hint" id="files-hint" style="margin-top:8px">До ${d.limits.maxFiles} файлов, каждый до ${fmtBytes(d.limits.maxFileBytes)}. Форматы: ${d.limits.extensions.join(', ')}.</div></div>
            <div data-files style="display:flex;flex-wrap:wrap;gap:8px"></div></div>` : ''}
          <div class="field__error" data-err role="alert" hidden></div>
          <div><button class="btn btn--primary" type="submit">${sub ? 'Обновить ответ' : 'Отправить на проверку'}</button></div>
        </form></div>` : ''}
    </article>`;
  }
}
