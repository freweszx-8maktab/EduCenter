import { html, icon, pageHead, emptyState, toast } from '../../ui.js';

export default async function messages(host, app) {
  const groups = app.me.groups;
  host.innerHTML = html`
    ${pageHead('Сообщения', 'Отправьте объявление всем ученикам группы — оно придёт в их уведомления.')}
    ${groups.length ? html`<section class="card" style="max-width:720px"><div class="card__body"><form id="msg" class="stack stack--sm" novalidate>
      <div class="field"><label for="m-g">Группа</label><select class="select" id="m-g" name="groupId">${groups.map((g) => html`<option value="${g.id}">${g.name} · ${g.students} уч.</option>`)}</select></div>
      <div class="field"><label for="m-t">Заголовок</label><input class="input" id="m-t" name="title" maxlength="80" placeholder="Например: Изменение формата занятия"></div>
      <div class="field"><label for="m-b">Текст</label><textarea class="textarea" id="m-b" name="body" rows="5" maxlength="1000"></textarea><div class="field__hint" data-count>0 / 1000</div></div>
      <div class="field__error" data-err role="alert" hidden></div>
      <div><button class="btn btn--primary" type="submit">${icon('mail', 16)} Отправить группе</button></div></form></div></section>`
    : html`<div class="card">${emptyState('mail', 'Нет групп', 'Вам некому писать: за вами не закреплено групп.')}</div>`}`.__raw;
  host.querySelector('#page-title')?.focus({ preventScroll: true });
  const form = host.querySelector('#msg'); if (!form) return;
  const err = form.querySelector('[data-err]');
  const show = (m) => { err.textContent = m || ''; err.hidden = !m; };
  form.body.addEventListener('input', () => { form.querySelector('[data-count]').textContent = `${form.body.value.length} / 1000`; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = form.title.value.trim(); const body = form.body.value.trim();
    if (!title || !body) return show('Заполните заголовок и текст.');
    show('');
    const g = groups.find((x) => x.id === form.groupId.value);
    const ok = await app.confirm({ title: 'Отправить сообщение?', body: html`<p>Сообщение «${title}» получат все ученики группы «${g.name}» (${g.students}). Отозвать его нельзя.</p>`, confirmText: 'Отправить' });
    if (!ok) return;
    const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Отправка…';
    try { await app.call('staff.broadcast', { groupId: g.id, title, body }); form.reset(); form.querySelector('[data-count]').textContent = '0 / 1000'; toast('Сообщение отправлено', 'success'); }
    catch (x) { show(x.message); }
    btn.disabled = false; btn.innerHTML = `${icon('mail', 16).__raw} Отправить группе`;
  });
}
