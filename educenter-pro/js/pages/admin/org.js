import { html, icon, pageHead, emptyState, formDialog, toast } from '../../ui.js';

const KINDS = [['lesson', 'Занятие'], ['class', 'Клуб / практика'], ['test', 'Пробный тест']];

export default async function org(host, app) {
  await app.view(host, {
    skeleton: 'page',
    fetch: () => app.call('admin.org'),
    render: (d) => html`
      ${pageHead('Группы и преподаватели', 'Структура центра: кто ведёт, какие есть группы, и расписание новых занятий.',
        html`<button class="btn" data-group>Новая группа</button><button class="btn" data-teacher>Новый преподаватель</button><button class="btn btn--primary" data-lesson>${icon('calendar', 16)} Добавить занятие</button>`)}
      <div class="stack">
        <section class="card" aria-labelledby="g-h"><div class="card__head"><h2 id="g-h">Группы</h2></div>
          ${d.groups.length ? html`<div class="table-wrap"><table class="table table--stack"><thead><tr><th>Группа</th><th>Курс</th><th>Куратор</th><th class="num">Учеников</th></tr></thead><tbody>
            ${d.groups.map((g) => html`<tr><td data-label="Группа"><b>${g.name}</b></td><td data-label="Курс">${g.course}</td><td data-label="Куратор">${g.curator}</td><td data-label="Учеников" class="num tnum">${g.students}</td></tr>`)}</tbody></table></div>` : emptyState('user', 'Групп нет', 'Создайте первую группу.')}</section>
        <section class="card" aria-labelledby="t-h"><div class="card__head"><h2 id="t-h">Преподаватели</h2></div>
          <div class="table-wrap"><table class="table table--stack"><thead><tr><th>Преподаватель</th><th>Предметы</th><th>Логин</th></tr></thead><tbody>
            ${d.teachers.map((t) => html`<tr><td data-label="Преподаватель"><b>${t.name}</b><div class="muted" style="font-size:13px">${t.email}</div></td><td data-label="Предметы">${t.subjects.join(', ')}</td><td data-label="Логин">${t.login ? html`<code>${t.login}</code>` : html`<span class="muted">без доступа в кабинет</span>`}</td></tr>`)}</tbody></table></div></section>
      </div>`,
    bind: (el, d, { reload }) => {
      el.querySelector('[data-group]').addEventListener('click', async () => {
        const res = await formDialog({
          title: 'Новая группа', confirmText: 'Создать группу',
          body: html`<div class="form-grid"><div class="field span-all"><label for="g-n">Название</label><input class="input" id="g-n" name="name" maxlength="60" placeholder="Например: IELTS B1 · Группа 1"></div>
            <div class="field"><label for="g-c">Курс</label><select class="select" id="g-c" name="courseId">${d.courses.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select></div>
            <div class="field"><label for="g-t">Куратор</label><select class="select" id="g-t" name="teacherId">${d.teachers.map((t) => html`<option value="${t.id}">${t.name}</option>`)}</select></div></div>`,
          submit: (v) => app.call('admin.createGroup', { name: v.name, courseId: v.courseId, teacherId: v.teacherId }),
        });
        if (res) { toast('Группа создана', 'success'); reload(); }
      });
      el.querySelector('[data-teacher]').addEventListener('click', async () => {
        const res = await formDialog({
          title: 'Новый преподаватель', confirmText: 'Создать аккаунт',
          body: html`<div class="form-grid"><div class="field span-all"><label for="t-n">Имя и фамилия</label><input class="input" id="t-n" name="name" maxlength="80" autocomplete="off"></div>
            <div class="field"><label for="t-l">Логин</label><input class="input" id="t-l" name="login" maxlength="30" autocapitalize="none" spellcheck="false" autocomplete="off"></div>
            <div class="field"><label for="t-p">Пароль</label><input class="input" id="t-p" name="password" type="text" autocomplete="off" spellcheck="false"><div class="field__hint">Минимум 8 символов, буквы и цифры</div></div>
            <div class="field span-all"><label for="t-e">Email</label><input class="input" id="t-e" name="email" type="email" autocomplete="off"></div>
            <fieldset class="field span-all" style="border:0;padding:0;margin:0"><legend class="label" style="padding:0;margin-bottom:6px">Предметы</legend><div style="display:flex;flex-wrap:wrap;gap:6px 16px">${d.subjects.map((s) => html`<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="subject" value="${s}">${s}</label>`)}</div></fieldset></div>`,
          submit: (v, f) => app.call('admin.createTeacher', { name: v.name, login: v.login, password: v.password, email: v.email, subjects: f.getAll('subject') }),
        });
        if (res) { toast('Преподаватель создан. Передайте ему логин и пароль лично', 'success'); reload(); }
      });
      el.querySelector('[data-lesson]').addEventListener('click', async () => {
        const res = await formDialog({
          title: 'Добавить занятие', confirmText: 'Добавить в расписание',
          body: html`<div class="form-grid">
            <div class="field"><label for="l-g">Группа</label><select class="select" id="l-g" name="groupId">${d.groups.map((g) => html`<option value="${g.id}">${g.name}</option>`)}</select></div>
            <div class="field"><label for="l-t">Преподаватель</label><select class="select" id="l-t" name="teacherId">${d.teachers.map((t) => html`<option value="${t.id}">${t.name} — ${t.subjects.join(', ')}</option>`)}</select></div>
            <div class="field"><label for="l-s">Предмет</label><select class="select" id="l-s" name="subject">${d.subjects.map((s) => html`<option>${s}</option>`)}</select></div>
            <div class="field"><label for="l-k">Тип</label><select class="select" id="l-k" name="kind">${KINDS.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></div>
            <div class="field"><label for="l-d">Дата</label><input class="input" id="l-d" name="date" type="date" min="${d.today}"></div>
            <div class="field"><label for="l-r">Кабинет</label><input class="input" id="l-r" name="room" maxlength="10"></div>
            <div class="field"><label for="l-a">Начало</label><input class="input" id="l-a" name="start" type="time" value="16:00"></div>
            <div class="field"><label for="l-b">Конец</label><input class="input" id="l-b" name="end" type="time" value="17:30"></div></div>
            <div class="field__hint" style="margin-top:12px">Система не даст назначить занятие, если у преподавателя, группы или кабинета уже есть занятие в это время. Ученики группы получат уведомление.</div>`,
          submit: (v) => { if (!v.date) throw new Error('Укажите дату.'); return app.call('admin.addLesson', v); },
        });
        if (res) { toast('Занятие добавлено, группа уведомлена', 'success'); reload(); }
      });
    },
  });
}
