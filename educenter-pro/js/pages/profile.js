import { html, icon, pageHead, initials, fmtFull, toast } from '../ui.js';

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('Не удалось прочитать файл.'));
  r.readAsDataURL(file);
});

/* Centre-crops to a square and shrinks to 256×256 JPEG, so the stored photo stays tiny. */
async function squareJpeg(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Выберите изображение JPG, PNG или WebP.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Файл больше 8 МБ.');
  const src = await readAsDataUrl(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Не удалось открыть изображение.')); i.src = src; });
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new Error('Не удалось открыть изображение.');
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
  return c.toDataURL('image/jpeg', 0.85);
}

export default async function profile(host, app) {
  const state = { editing: false };
  await app.view(host, {
    skeleton: 'page',
    fetch: () => app.call('profile'),
    render: (d) => html`
      ${pageHead('Профиль', 'Ваши данные в учебном центре. Имя, группу и курс меняет администрация.')}
      <div class="stack">
        <section class="card profile-head">
          ${app.avatar('avatar--lg')}
          <div style="flex:1;min-width:200px"><h2 style="font-size:20px;line-height:28px">${d.user.name}</h2>
            <div class="muted">Ученик · логин ${d.user.login}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><span class="badge badge--info badge--plain">${d.group.name}</span><span class="badge badge--plain">${d.course.name}</span></div></div>
          <div class="photo-actions">
            <input type="file" id="photo-input" accept="image/jpeg,image/png,image/webp" hidden>
            <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn--sm" data-photo-pick>${icon('upload', 16)} ${app.photo ? 'Изменить фото' : 'Загрузить фото'}</button>
              ${app.photo ? html`<button class="btn btn--sm btn--ghost" data-photo-del>Удалить</button>` : ''}</div>
            <div class="field__hint" id="photo-hint" role="status">JPG, PNG или WebP. Фото обрежется до квадрата.</div>
          </div>
        </section>
        <div class="grid-2">
          <section class="card" aria-labelledby="st-h"><div class="card__head"><h2 id="st-h">Учёба</h2></div><div class="card__body"><dl class="dl">
            <dt>Учебный центр</dt><dd>${d.center.name}</dd>
            <dt>Группа</dt><dd>${d.group.name}</dd>
            <dt>Курс</dt><dd>${d.course.name} · ${d.course.level}</dd>
            <dt>Куратор группы</dt><dd>${d.teacher?.name || '—'}</dd>
            <dt>Дата регистрации</dt><dd>${fmtFull(d.student.registeredAt)}</dd>
            ${d.parent ? html`<dt>Родитель</dt><dd>${d.parent.name}</dd>` : ''}</dl></div></section>

          <section class="card" aria-labelledby="ct-h"><div class="card__head"><h2 id="ct-h">Контакты</h2>${state.editing ? '' : html`<button class="btn btn--sm" data-edit>Изменить</button>`}</div>
            <div class="card__body">${state.editing ? html`
              <form id="contact-form" class="stack stack--sm" novalidate>
                <div class="field"><label for="phone">Телефон</label><input class="input" id="phone" type="tel" autocomplete="tel" value="${d.student.phone}"><div class="field__error" data-e="phone" hidden></div></div>
                <div class="field"><label for="email">Email</label><input class="input" id="email" type="email" autocomplete="email" value="${d.student.email}"><div class="field__error" data-e="email" hidden></div></div>
                <div style="display:flex;gap:8px"><button class="btn btn--primary" type="submit">Сохранить</button><button class="btn" type="button" data-cancel>Отмена</button></div></form>`
              : html`<dl class="dl"><dt>Телефон</dt><dd>${d.student.phone}</dd><dt>Email</dt><dd>${d.student.email}</dd></dl>`}</div></section>
        </div>

        <section class="card" aria-labelledby="tc-h"><div class="card__head"><h2 id="tc-h">Ваши преподаватели</h2></div>
          <ul class="list">${d.teachers.map((t) => html`<li><div class="avatar" aria-hidden="true">${initials(t.name)}</div><div class="list__main"><div class="list__title">${t.name}</div><div class="list__sub">${t.subjects.join(', ')}</div></div>
            <a class="btn btn--sm" href="mailto:${t.email}">${icon('mail', 16)} Написать</a></li>`)}</ul></section>

        <section class="card" aria-labelledby="cn-h"><div class="card__head"><h2 id="cn-h">Контакты центра</h2></div><div class="card__body"><dl class="dl">
          <dt>Адрес</dt><dd>${d.center.city}, ${d.center.address}</dd><dt>Телефон</dt><dd>${d.center.phone}</dd><dt>Email</dt><dd>${d.center.email}</dd><dt>Часы работы</dt><dd>${d.center.hours}</dd></dl></div></section>
      </div>`,
    bind: (el, d, { set, redraw }) => {
      const input = el.querySelector('#photo-input');
      const hint = el.querySelector('#photo-hint');
      el.querySelector('[data-photo-pick]').addEventListener('click', () => input.click());
      input.addEventListener('change', async () => {
        const file = input.files[0];
        input.value = '';
        if (!file) return;
        hint.textContent = 'Загрузка…';
        try {
          const data = await squareJpeg(file);
          await app.call('setPhoto', { data });
          app.setPhoto(data);
          toast('Фото обновлено', 'success');
          set(d);
        } catch (e) { hint.textContent = e.message; toast(e.message, 'error'); }
      });
      el.querySelector('[data-photo-del]')?.addEventListener('click', async () => {
        const ok = await app.confirm({ title: 'Удалить фото?', body: 'Вместо фото будут показаны ваши инициалы.', confirmText: 'Удалить', danger: true });
        if (!ok) return;
        try { await app.call('removePhoto'); app.setPhoto(null); toast('Фото удалено', 'success'); set(d); } catch (e) { toast(e.message, 'error'); }
      });
      el.querySelector('[data-edit]')?.addEventListener('click', () => { state.editing = true; redraw(); el.querySelector('#phone')?.focus(); });
      el.querySelector('[data-cancel]')?.addEventListener('click', () => { state.editing = false; redraw(); });
      el.querySelector('#contact-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const phone = f.phone.value.trim(); const email = f.email.value.trim();
        const err = (k, m) => { const n = f.querySelector(`[data-e="${k}"]`); n.hidden = !m; n.textContent = m || ''; return !!m; };
        const bad = [err('phone', /^\+?[0-9\s()-]{7,20}$/.test(phone) ? '' : 'Формат: +998 90 123 45 67'), err('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? '' : 'Введите корректный email')].some(Boolean);
        if (bad) return;
        const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Сохранение…';
        try { const nd = await app.call('updateProfile', { phone, email }); state.editing = false; set(nd); toast('Контакты сохранены', 'success'); }
        catch (x) { toast(x.message, 'error'); btn.disabled = false; btn.textContent = 'Сохранить'; }
      });
    },
  });
}
