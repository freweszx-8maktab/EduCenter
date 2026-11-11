import { html, icon, pageHead, toast } from '../ui.js';
import * as api from '../api.js';
import { getTheme, setTheme } from '../theme.js';

const THEMES = [['light', 'Светлая'], ['dark', 'Тёмная'], ['system', 'Как в системе']];

const PREFS = [
  ['assignment', 'Новые задания', 'Когда преподаватель выдаёт домашнее задание'],
  ['schedule', 'Изменения расписания', 'Отмены и переносы занятий'],
  ['grade', 'Новые оценки', 'Когда проверена работа или контрольная'],
  ['coins', 'Начисления EduCoins', 'Баллы, достижения и обмен на награды'],
];

export default async function settings(host, app) {
  await app.view(host, {
    skeleton: 'page',
    fetch: () => app.call('profile'),
    render: (d) => html`
      ${pageHead('Настройки', 'Уведомления и безопасность аккаунта.')}
      <div class="stack" style="max-width:760px">
        <section class="card" aria-labelledby="th-h"><div class="card__head"><div><h2 id="th-h">Оформление</h2><p>Выбор действует на этом устройстве.</p></div></div>
          <div class="card__body"><div class="segmented" role="group" aria-label="Тема оформления">${THEMES.map(([k, l]) => html`<button data-theme-set="${k}" aria-pressed="${String(getTheme() === k)}">${l}</button>`)}</div></div></section>

        <section class="card" aria-labelledby="n-h"><div class="card__head"><div><h2 id="n-h">Уведомления</h2><p>Сообщения администрации центра приходят всегда.</p></div></div>
          <div class="card__body">${PREFS.map(([k, l, s]) => html`<label class="switch"><span><b>${l}</b><br><span class="muted">${s}</span></span><input type="checkbox" data-pref="${k}" ${d.settings.notify[k] ? 'checked' : ''}></label>`)}</div></section>

        <section class="card" aria-labelledby="p-h"><div class="card__head"><div><h2 id="p-h">Смена пароля</h2><p>Минимум 8 символов, буквы и цифры. Другие устройства будут отключены.</p></div></div>
          <div class="card__body"><form id="pw-form" class="stack stack--sm" novalidate autocomplete="off">
            <div class="field"><label for="old">Текущий пароль</label><input class="input" id="old" type="password" autocomplete="current-password"></div>
            <div class="field"><label for="new">Новый пароль</label><input class="input" id="new" type="password" autocomplete="new-password"></div>
            <div class="field"><label for="rep">Повторите новый пароль</label><input class="input" id="rep" type="password" autocomplete="new-password"></div>
            <div class="field__error" data-err role="alert" hidden></div>
            <div><button class="btn btn--primary" type="submit">Сменить пароль</button></div></form></div></section>

        <section class="card" aria-labelledby="s-h"><div class="card__head"><h2 id="s-h">Сеанс</h2></div>
          <div class="card__body" style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn" data-logout-all>Выйти на других устройствах</button>
            <button class="btn" data-logout>${icon('logout', 16)} Выйти из кабинета</button></div></section>
      </div>`,
    bind: (el, d) => {
      el.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
        setTheme(b.dataset.themeSet);
        el.querySelectorAll('[data-theme-set]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      }));
      el.querySelectorAll('[data-pref]').forEach((c) => c.addEventListener('change', async () => {
        const prev = !c.checked;
        try { await app.call('updateSettings', { notify: { [c.dataset.pref]: c.checked } }); toast('Настройки сохранены', 'success'); }
        catch (e) { c.checked = prev; toast(e.message, 'error'); }
      }));
      const form = el.querySelector('#pw-form');
      const err = form.querySelector('[data-err]');
      const show = (m) => { err.hidden = !m; err.textContent = m || ''; };
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const o = form.old.value; const n = form.new.value; const r = form.rep.value;
        if (!o || !n || !r) return show('Заполните все поля.');
        if (n !== r) return show('Новые пароли не совпадают.');
        if (n.length < 8 || !/[A-Za-zА-Яа-я]/.test(n) || !/\d/.test(n)) return show('Новый пароль: минимум 8 символов, буквы и цифры.');
        show('');
        const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Сохранение…';
        try { await app.call('changePassword', { oldPassword: o, newPassword: n }); form.reset(); toast('Пароль изменён', 'success'); }
        catch (x) { show(x.message); }
        btn.disabled = false; btn.textContent = 'Сменить пароль';
      });
      el.querySelector('[data-logout-all]').addEventListener('click', async () => {
        const ok = await app.confirm({ title: 'Выйти на других устройствах?', body: 'Все остальные сеансы будут завершены. Этот сеанс останется активным.', confirmText: 'Выйти' });
        if (!ok) return;
        try { await app.call('logoutAll'); toast('Другие устройства отключены', 'success'); } catch (x) { toast(x.message, 'error'); }
      });
      el.querySelector('[data-logout]').addEventListener('click', async () => {
        const ok = await app.confirm({ title: 'Выйти из кабинета?', body: 'Чтобы снова войти, нужно будет ввести логин и пароль.', confirmText: 'Выйти' });
        if (ok) { await api.logout(); location.replace('index.html'); }
      });
    },
  });
}
