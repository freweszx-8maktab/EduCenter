import { html, icon, pageHead, emptyState, formDialog, toast, num } from '../../ui.js';

export default async function accounts(host, app) {
  const state = { q: '', group: 'all' };
  await app.view(host, {
    skeleton: 'page',
    fetch: () => app.call('admin.students'),
    render: (d) => {
      const q = state.q.trim().toLowerCase();
      const rows = d.items.filter((s) => (state.group === 'all' || s.groupId === state.group) && (!q || `${s.name} ${s.login}`.toLowerCase().includes(q)));
      return html`
      ${pageHead('Аккаунты учеников', 'Создание аккаунтов, отключение доступа и сброс паролей. Пароли нигде не хранятся в открытом виде.',
        html`<button class="btn btn--primary" data-new>${icon('user', 16)} Новый ученик</button>`)}
      <section class="card">
        <div class="card__body" style="display:flex;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--border)">
          <div class="input-icon" style="flex:1;min-width:200px"><label class="visually-hidden" for="q">Поиск</label>${icon('search', 18)}<input class="input" id="q" type="search" placeholder="Имя или логин" value="${state.q}"></div>
          <label class="visually-hidden" for="g">Группа</label><select class="select" id="g" style="max-width:240px"><option value="all">Все группы</option>${d.groups.map((g) => html`<option value="${g.id}" ${state.group === g.id ? 'selected' : ''}>${g.name}</option>`)}</select></div>
        ${rows.length ? html`<div class="table-wrap"><table class="table table--stack"><thead><tr><th>Ученик</th><th>Логин</th><th>Группа</th><th class="num">EduCoins</th><th>Доступ</th><th><span class="visually-hidden">Действия</span></th></tr></thead><tbody>
          ${rows.map((s) => html`<tr><td data-label="Ученик"><b>${s.name}</b><div class="muted" style="font-size:13px">${s.email}</div></td><td data-label="Логин"><code>${s.login}</code></td><td data-label="Группа">${s.group}</td>
            <td data-label="EduCoins" class="num tnum">${num(s.balance)}</td>
            <td data-label="Доступ">${s.disabled ? html`<span class="badge badge--bad">Отключён</span>` : html`<span class="badge badge--ok">Активен</span>`}</td>
            <td><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn--sm" data-move="${s.id}">Сменить группу</button><button class="btn btn--sm" data-reset="${s.id}">Сбросить пароль</button>
              <button class="btn btn--sm ${s.disabled ? '' : 'btn--danger'}" data-toggle="${s.id}">${s.disabled ? 'Включить' : 'Отключить'}</button></div></td></tr>`)}</tbody></table></div>`
        : emptyState('user', 'Никого не найдено', 'Измените поиск или создайте нового ученика.')}
      </section>`;
    },
    bind: (el, d, { redraw, reload, set }) => {
      let t;
      el.querySelector('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; redraw(); const i = host.querySelector('#q'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 200); });
      el.querySelector('#g').addEventListener('change', (e) => { state.group = e.target.value; redraw(); });
      const find = (id) => d.items.find((s) => s.id === id);

      el.querySelector('[data-new]').addEventListener('click', async () => {
        const res = await formDialog({
          title: 'Новый ученик', confirmText: 'Создать аккаунт',
          body: html`<div class="form-grid" autocomplete="off">
            <div class="field span-all"><label for="n-name">Имя и фамилия</label><input class="input" id="n-name" name="name" maxlength="80" autocomplete="off"></div>
            <div class="field"><label for="n-login">Логин</label><input class="input" id="n-login" name="login" maxlength="30" autocapitalize="none" spellcheck="false" autocomplete="off"></div>
            <div class="field"><label for="n-pw">Пароль</label><input class="input" id="n-pw" name="password" type="text" autocomplete="off" spellcheck="false"><div class="field__hint">Минимум 8 символов, буквы и цифры</div></div>
            <div class="field span-all"><label for="n-g">Группа</label><select class="select" id="n-g" name="groupId">${d.groups.map((g) => html`<option value="${g.id}">${g.name}</option>`)}</select></div>
            <div class="field"><label for="n-ph">Телефон</label><input class="input" id="n-ph" name="phone" type="tel" placeholder="+998 90 123 45 67" autocomplete="off"></div>
            <div class="field"><label for="n-em">Email</label><input class="input" id="n-em" name="email" type="email" autocomplete="off"></div></div>
            <div class="field__hint" style="margin-top:12px">Передайте логин и пароль ученику лично. Он сможет сменить пароль в своём профиле.</div>`,
          submit: (v) => app.call('admin.createStudent', { name: v.name, login: v.login, password: v.password, groupId: v.groupId, phone: v.phone, email: v.email }),
        });
        if (res) { toast(`Аккаунт «${res.result.login}» создан`, 'success'); reload(); }
      });

      el.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
        const s = find(b.dataset.toggle); const off = !s.disabled;
        const ok = await app.confirm({ title: off ? 'Отключить доступ?' : 'Включить доступ?', body: off ? `${s.name} будет немедленно выведен из кабинета и не сможет войти. Данные сохранятся.` : `${s.name} снова сможет войти в кабинет.`, confirmText: off ? 'Отключить' : 'Включить', danger: off });
        if (!ok) return;
        try { await app.call('admin.setDisabled', { studentId: s.id, disabled: off }); toast(off ? 'Доступ отключён' : 'Доступ включён', 'success'); reload(); } catch (e) { toast(e.message, 'error'); }
      }));

      el.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', async () => {
        const s = find(b.dataset.move);
        const res = await formDialog({
          title: `Перевод: ${s.name}`, confirmText: 'Перевести',
          body: html`<p class="muted" style="margin-bottom:12px">Сейчас: ${s.group}. Оценки, посещаемость и EduCoins ученика сохранятся, ученик получит уведомление.</p>
            <div class="field"><label for="mv-g">Новая группа</label><select class="select" id="mv-g" name="groupId">${d.groups.filter((g) => g.id !== s.groupId).map((g) => html`<option value="${g.id}">${g.name}</option>`)}</select></div>`,
          submit: (v) => { if (!v.groupId) throw new Error('Нет другой группы для перевода — сначала создайте её.'); return app.call('admin.moveStudent', { studentId: s.id, groupId: v.groupId }); },
        });
        if (res) { toast('Ученик переведён', 'success'); reload(); }
      }));

      el.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
        const s = find(b.dataset.reset);
        const res = await formDialog({
          title: `Сбросить пароль: ${s.name}`, confirmText: 'Сбросить пароль', danger: true,
          body: html`<p class="muted" style="margin-bottom:12px">Старый пароль перестанет работать, все сеансы ученика будут завершены.</p>
            <div class="field"><label for="r-pw">Новый пароль</label><input class="input" id="r-pw" name="newPassword" type="text" autocomplete="off" spellcheck="false"><div class="field__hint">Минимум 8 символов, буквы и цифры</div></div>`,
          submit: (v) => app.call('admin.resetPassword', { studentId: s.id, newPassword: v.newPassword }),
        });
        if (res) toast('Пароль сброшен', 'success');
      }));
    },
  });
}
