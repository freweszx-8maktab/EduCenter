import { html, icon, pageHead, emptyState, fmtDayShort, formDialog, toast, gradeClass } from '../../ui.js';

const KINDS = [['test', 'Контрольная'], ['homework', 'Домашнее задание'], ['class', 'Работа на уроке']];

export default async function grades(host, app) {
  const state = { groupId: app.me.groups[0]?.id || null };
  if (!state.groupId) { host.innerHTML = html`${pageHead('Оценки', '')}<div class="card">${emptyState('user', 'Нет групп', 'За вами не закреплено ни одной группы.')}</div>`.__raw; return; }
  await app.view(host, {
    skeleton: 'page',
    fetch: () => app.call('staff.grades', { groupId: state.groupId }),
    render: (d) => html`
      ${pageHead('Оценки', 'Выставляйте оценки по своим предметам. Контрольная от 90% автоматически приносит ученику 20 EduCoins.',
        html`${app.me.groups.length > 1 ? html`<label class="visually-hidden" for="grp">Группа</label><select class="select" id="grp">${app.me.groups.map((g) => html`<option value="${g.id}" ${g.id === state.groupId ? 'selected' : ''}>${g.name}</option>`)}</select>` : ''}
          <button class="btn btn--primary" data-add>${icon('check', 16)} Выставить оценку</button>`)}
      <section class="card" aria-label="Последние оценки">
        <div class="card__head"><h2>Последние оценки</h2><span class="muted">${d.items.length ? `Показано: ${d.items.length}` : ''}</span></div>
        ${d.items.length ? html`<div class="table-wrap"><table class="table table--stack"><thead><tr><th>Ученик</th><th>Предмет</th><th>Работа</th><th>Дата</th><th class="num">Оценка</th></tr></thead><tbody>
          ${d.items.map((g) => html`<tr><td data-label="Ученик"><b>${g.student}</b></td><td data-label="Предмет">${g.subject}</td><td data-label="Работа">${g.title}${g.comment ? html`<div class="muted" style="font-size:13px">${g.comment}</div>` : ''}</td>
            <td data-label="Дата" class="nowrap">${fmtDayShort(g.date)}</td><td data-label="Оценка" class="num"><span class="grade ${gradeClass(g.percent)}" style="display:inline-flex" title="${g.score} из ${g.max}">${g.percent}</span> <span class="muted">${g.score}/${g.max}</span></td></tr>`)}</tbody></table></div>`
        : emptyState('chart', 'Оценок по вашим предметам пока нет', 'Нажмите «Выставить оценку», чтобы добавить первую.')}
      </section>`,
    bind: (el, d, { reload }) => {
      el.querySelector('#grp')?.addEventListener('change', (e) => { state.groupId = e.target.value; reload(); });
      el.querySelector('[data-add]').addEventListener('click', async () => {
        const res = await formDialog({
          title: 'Выставить оценку', confirmText: 'Сохранить',
          body: html`<div class="form-grid">
            <div class="field span-all"><label for="g-st">Ученик</label><select class="select" id="g-st" name="studentId" required>${d.students.map((s) => html`<option value="${s.id}">${s.name}</option>`)}</select></div>
            <div class="field"><label for="g-sub">Предмет</label><select class="select" id="g-sub" name="subject">${d.subjects.map((s) => html`<option>${s}</option>`)}</select></div>
            <div class="field"><label for="g-kind">Тип</label><select class="select" id="g-kind" name="kind">${KINDS.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></div>
            <div class="field span-all"><label for="g-title">Название работы</label><input class="input" id="g-title" name="title" maxlength="80" placeholder="Например: Unit 5 test"></div>
            <div class="field"><label for="g-score">Балл</label><input class="input" id="g-score" name="score" type="number" inputmode="decimal" min="0" step="any"></div>
            <div class="field"><label for="g-max">Максимум</label><input class="input" id="g-max" name="max" type="number" inputmode="decimal" min="1" value="100" step="any"></div>
            <div class="field"><label for="g-date">Дата</label><input class="input" id="g-date" name="date" type="date" value="${d.today}" max="${d.today}"></div>
            <div class="field span-all"><label for="g-c">Комментарий (необязательно)</label><textarea class="textarea" id="g-c" name="comment" maxlength="300" rows="2"></textarea></div></div>`,
          submit: async (v) => {
            if (v.score === '' || !Number.isFinite(Number(v.score))) throw new Error('Введите балл числом.');
            if (!v.title?.trim()) throw new Error('Укажите название работы.');
            if (v.date > d.today) throw new Error('Дата оценки не может быть в будущем.');
            return app.call('staff.addGrade', { studentId: v.studentId, subject: v.subject, kind: v.kind, title: v.title.trim(), score: Number(v.score), max: Number(v.max), date: v.date, comment: v.comment || '' });
          },
        });
        if (res) { toast('Оценка выставлена, ученик получил уведомление', 'success'); reload(); }
      });
    },
  });
}
