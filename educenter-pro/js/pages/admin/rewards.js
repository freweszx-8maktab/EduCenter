import { html, icon, pageHead, emptyState, fmtDateTime, formDialog, toast, num } from '../../ui.js';

const STATUS = { pending: ['Ожидает выдачи', 'badge--warn'], issued: ['Выдано', 'badge--ok'], cancelled: ['Отменено, баллы возвращены', 'badge--plain'] };

export default async function rewards(host, app) {
  const state = { tab: 'queue' };
  await app.view(host, {
    skeleton: 'page',
    fetch: () => app.call('admin.rewards'),
    render: (d) => {
      const pending = d.redemptions.filter((r) => r.status === 'pending');
      const rows = state.tab === 'queue' ? pending : d.redemptions;
      return html`
      ${pageHead('Награды и выдача', 'Магазин EduCoins: что можно получить за баллы и кому пора выдать приз.', html`<button class="btn btn--primary" data-new>${icon('coins', 16)} Новая награда</button>`)}
      <div class="stack">
        <section class="card" aria-labelledby="q-h"><div class="card__head"><div><h2 id="q-h">Заявки учеников</h2><p>При отмене баллы возвращаются ученику, а остаток награды — в магазин</p></div>
          <div class="segmented" role="group" aria-label="Фильтр"><button data-tab="queue" aria-pressed="${String(state.tab === 'queue')}">Ожидают<span class="count">${pending.length}</span></button><button data-tab="all" aria-pressed="${String(state.tab === 'all')}">Все<span class="count">${d.redemptions.length}</span></button></div></div>
          ${rows.length ? html`<div class="table-wrap"><table class="table table--stack"><thead><tr><th>Дата</th><th>Ученик</th><th>Награда</th><th class="num">Цена</th><th>Статус</th><th><span class="visually-hidden">Действия</span></th></tr></thead><tbody>
            ${rows.map((r) => { const [l, c] = STATUS[r.status] || [r.status, 'badge--plain']; return html`<tr><td data-label="Дата" class="nowrap">${fmtDateTime(r.at)}</td><td data-label="Ученик"><b>${r.student}</b></td><td data-label="Награда">${r.title}</td><td data-label="Цена" class="num tnum">${num(r.cost)}</td><td data-label="Статус"><span class="badge ${c}">${l}</span></td>
              <td>${r.status === 'pending' ? html`<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn--primary btn--sm" data-issue="${r.id}">Выдано</button><button class="btn btn--sm btn--danger" data-cancel="${r.id}">Отменить</button></div>` : ''}</td></tr>`; })}</tbody></table></div>`
          : emptyState('check', state.tab === 'queue' ? 'Нет заявок на выдачу' : 'Заявок пока не было', 'Когда ученик обменяет баллы на награду, заявка появится здесь.')}</section>

        <section class="card" aria-labelledby="s-h"><div class="card__head"><h2 id="s-h">Каталог наград</h2></div>
          ${d.rewards.length ? html`<div class="table-wrap"><table class="table table--stack"><thead><tr><th>Награда</th><th class="num">Цена</th><th class="num">Остаток</th><th>В магазине</th><th><span class="visually-hidden">Действия</span></th></tr></thead><tbody>
            ${d.rewards.map((r) => html`<tr><td data-label="Награда"><b>${r.title}</b>${r.description ? html`<div class="muted" style="font-size:13px">${r.description}</div>` : ''}</td><td data-label="Цена" class="num tnum">${num(r.cost)}</td>
              <td data-label="Остаток" class="num tnum">${r.stock === null ? '∞' : r.stock}</td><td data-label="В магазине">${r.active ? html`<span class="badge badge--ok">Да</span>` : html`<span class="badge badge--plain">Скрыта</span>`}</td>
              <td><button class="btn btn--sm" data-edit="${r.id}">Изменить</button></td></tr>`)}</tbody></table></div>` : emptyState('coins', 'Наград пока нет', 'Добавьте первую награду.')}</section>
      </div>`;
    },
    bind: (el, d, { redraw, reload }) => {
      el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; redraw(); }));
      const red = (id) => d.redemptions.find((r) => r.id === id);
      const resolve = async (id, action) => {
        const r = red(id);
        const ok = await app.confirm(action === 'cancel'
          ? { title: 'Отменить выдачу?', body: `${r.student} получит обратно ${r.cost} EduCoins за «${r.title}». Действие нельзя отменить.`, confirmText: 'Отменить и вернуть баллы', danger: true }
          : { title: 'Награда выдана?', body: `Отметить, что «${r.title}» передан ученику ${r.student}. После этого отмена недоступна.`, confirmText: 'Да, выдано' });
        if (!ok) return;
        try { await app.call('admin.resolveRedemption', { id, action }); toast(action === 'cancel' ? 'Баллы возвращены ученику' : 'Выдача отмечена', 'success'); reload(); } catch (e) { toast(e.message, 'error'); }
      };
      el.querySelectorAll('[data-issue]').forEach((b) => b.addEventListener('click', () => resolve(b.dataset.issue, 'issue')));
      el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => resolve(b.dataset.cancel, 'cancel')));

      const edit = async (r) => {
        const res = await formDialog({
          title: r ? 'Изменить награду' : 'Новая награда', confirmText: 'Сохранить',
          body: html`<div class="form-grid">
            <div class="field span-all"><label for="w-t">Название</label><input class="input" id="w-t" name="title" maxlength="80" value="${r?.title || ''}"></div>
            <div class="field span-all"><label for="w-d">Описание</label><input class="input" id="w-d" name="description" maxlength="200" value="${r?.description || ''}"></div>
            <div class="field"><label for="w-c">Цена, EduCoins</label><input class="input" id="w-c" name="cost" type="number" min="1" max="10000" step="1" inputmode="numeric" value="${r?.cost ?? ''}"></div>
            <div class="field"><label for="w-s">Остаток</label><input class="input" id="w-s" name="stock" type="number" min="0" max="1000" step="1" inputmode="numeric" placeholder="без ограничения" value="${r?.stock ?? ''}"></div>
            <div class="field span-all"><label class="switch" style="padding:0"><span>Показывать в магазине</span><input type="checkbox" name="active" ${!r || r.active ? 'checked' : ''}></label><div class="field__hint">Уже оформленные заявки сохраняют старую цену и название.</div></div></div>`,
          submit: (v) => {
            if (v.cost === '' || !Number.isInteger(Number(v.cost))) throw new Error('Цена — целое число.');
            if (v.stock !== '' && !Number.isInteger(Number(v.stock))) throw new Error('Остаток — целое число или пусто.');
            return app.call('admin.saveReward', { id: r?.id, title: v.title, description: v.description, cost: Number(v.cost), stock: v.stock === '' ? null : Number(v.stock), active: v.active === 'on' });
          },
        });
        if (res) { toast('Награда сохранена', 'success'); reload(); }
      };
      el.querySelector('[data-new]').addEventListener('click', () => edit(null));
      el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => edit(d.rewards.find((r) => r.id === b.dataset.edit))));
    },
  });
}
