/* Demo data for a fresh database.
   Nothing here writes EduCoin balances, averages or percentages directly: the seed replays a
   timeline of staff operations (attendance marks, graded homework, tests …) through the same
   domain functions the live system uses, so every derived number is traceable to a record. */
import {
  isoDate, addDays, weekStart, parseStamp, stamp, at, mulberry32, hashPassword, sha256, clamp, randomHex,
} from './util.js';
import * as core from './core.js';

export const DEMO_ACCOUNTS = {
  student: { login: 'dilshod', password: 'Student#2026', note: 'Ученик (основной демо-аккаунт)' },
  student2: { login: 'madina', password: 'Student#2026', note: 'Ученица той же группы' },
  teacher: { login: 'nargiza', password: 'Teacher#2026', note: 'Преподаватель (только API)' },
  admin: { login: 'admin', password: 'Admin#2026', note: 'Администратор (только API)' },
};

const WEEK_TEMPLATE = [
  { dow: 0, subject: 'Grammar', teacher: 't1', room: '204', start: '16:00', end: '17:30', kind: 'lesson', homework: true },
  { dow: 1, subject: 'Reading', teacher: 't2', room: '207', start: '16:00', end: '17:30', kind: 'lesson', homework: true },
  { dow: 2, subject: 'Writing', teacher: 't1', room: '204', start: '16:00', end: '17:30', kind: 'lesson', homework: true },
  { dow: 3, subject: 'Listening', teacher: 't3', room: '112', start: '16:00', end: '17:30', kind: 'lesson', homework: true },
  { dow: 4, subject: 'Speaking', teacher: 't2', room: '207', start: '16:00', end: '17:30', kind: 'class', homework: false },
  { dow: 5, subject: 'Пробный тест', teacher: 't3', room: '301', start: '11:00', end: '13:00', kind: 'test', homework: false },
];

const HOMEWORK_TITLES = {
  Grammar: ['Conditionals: упражнения 1–12', 'Passive voice: преобразование предложений', 'Reported speech: практика', 'Relative clauses: упражнения', 'Modal verbs: задание из тетради', 'Articles: тест-практика', 'Tenses review: повторение'],
  Reading: ['Passage 1: True / False / Not Given', 'Passage 2: Matching Headings', 'Passage 3: Summary Completion', 'Passage 1: Multiple Choice', 'Passage 2: Yes / No / Not Given', 'Passage 3: Matching Information', 'Skimming and Scanning: практика'],
  Writing: ['Task 2: эссе «Education»', 'Task 1: описание графика', 'Task 2: эссе «Technology»', 'Task 1: описание диаграммы', 'Task 2: эссе «Environment»', 'Task 1: описание таблицы', 'Task 2: эссе «Health»'],
  Listening: ['Section 1: заполнение формы', 'Section 2: карта и план', 'Section 3: Multiple Choice', 'Section 4: заполнение конспекта', 'Section 2: Matching', 'Section 3: диалог студентов', 'Section 1: полный тест'],
};
const HOMEWORK_DESC = {
  Grammar: 'Выполните упражнения и отправьте ответы текстом или приложите фото страницы. Обратите внимание на правила из последнего урока.',
  Reading: 'Прочитайте текст на время (20 минут) и ответьте на вопросы. Укажите, в каком абзаце нашли ответ.',
  Writing: 'Напишите работу объёмом не менее 250 слов (Task 2) или 150 слов (Task 1). Приложите файл или вставьте текст в поле ответа.',
  Listening: 'Прослушайте запись один раз и заполните ответы. Запишите слова, в которых сомневались.',
};

const COMMENTS = {
  high: ['Отличная работа! Чёткая структура и точный словарь.', 'Очень сильный результат — так держать.', 'Все задания выполнены уверенно, ошибок почти нет.'],
  good: ['Хороший результат. Поработайте над связками между частями ответа.', 'Уверенная работа, есть несколько мелких неточностей в артиклях.', 'Хорошо. Следите за временем — часть ответов сделана в спешке.'],
  mid: ['Неплохо, но есть пробелы в грамматике. Повторите разделы из учебника.', 'Результат средний: чаще проверяйте работу перед сдачей.', 'Нужно больше практики с этим типом заданий.'],
  low: ['Тема усвоена слабо — повторите материал и разберите ошибки на консультации.', 'Много ошибок в базовых конструкциях, давайте разберём их на уроке.'],
};
const EXCUSE_REASONS = ['Болезнь (справка предоставлена)', 'Семейные обстоятельства', 'Участие в школьных соревнованиях'];

const STUDENTS = [
  { name: 'Дилшод Каримов', login: 'dilshod', attend: 0.93, late: 0.04, hw: 0.92, base: 76, slope: 1.9, main: true },
  { name: 'Мадина Рахимова', login: 'madina', attend: 0.95, late: 0.03, hw: 0.95, base: 82, slope: 1.0 },
  { name: 'Жасур Тошматов', login: 'jasur', attend: 0.85, late: 0.08, hw: 0.8, base: 68, slope: 1.4 },
  { name: 'Сабина Ибрагимова', login: 'sabina', attend: 0.9, late: 0.05, hw: 0.88, base: 79, slope: 1.2 },
  { name: 'Бобур Султанов', login: 'bobur', attend: 0.78, late: 0.1, hw: 0.7, base: 64, slope: 1.5 },
  { name: 'Зарина Хасанова', login: 'zarina', attend: 0.97, late: 0.02, hw: 0.97, base: 86, slope: 0.6 },
  { name: 'Умид Нурматов', login: 'umid', attend: 0.88, late: 0.06, hw: 0.84, base: 72, slope: 1.1 },
];
const PARENTS = ['Гульнора Каримова', 'Нилуфар Рахимова', 'Алишер Тошматов', 'Дилфуза Ибрагимова', 'Равшан Султанов', 'Лола Хасанова', 'Санжар Нурматов'];

function emptyDb() {
  return {
    meta: { version: 1, seededAt: null },
    center: { name: 'EduCenter Tashkent', city: 'Ташкент', address: 'ул. Амира Темура, 15', phone: '+998 71 200 00 00', email: 'info@educenter.example', hours: 'Пн–Сб, 9:00–20:00' },
    users: [], teachers: [], courses: [], groups: [], students: [], parents: [],
    lessons: [], attendance: [], grades: [], assignments: [], submissions: [],
    ledger: [], rewards: [], redemptions: [], olympiads: [], notifications: [],
    sessions: [], loginAttempts: {}, counters: {},
  };
}

export function buildSeed(realNow) {
  const db = emptyDb();
  let clock = new Date(realNow);
  const ctx = { db, now: () => new Date(clock) };
  const today = isoDate(realNow);
  const thisWeek = weekStart(today);
  const setClock = (d) => { clock = d; };

  /* ----- people ----- */
  const addUser = (role, login, name, password) => {
    const salt = sha256(`salt:${login}`).slice(0, 16);
    const u = { id: core.nextId(db, 'u'), role, login, name, salt, hash: hashPassword(password, salt), createdAt: stamp(realNow), disabled: false, settings: { notify: { assignment: true, schedule: true, grade: true, coins: true } } };
    db.users.push(u);
    return u;
  };
  const adminUser = addUser('admin', DEMO_ACCOUNTS.admin.login, 'Администратор центра', DEMO_ACCOUNTS.admin.password);
  const teacherUser = addUser('teacher', DEMO_ACCOUNTS.teacher.login, 'Наргиза Юсупова', DEMO_ACCOUNTS.teacher.password);
  db.teachers.push(
    { id: 't1', userId: teacherUser.id, name: 'Наргиза Юсупова', subjects: ['Grammar', 'Writing'], email: 'n.yusupova@educenter.example' },
    { id: 't2', userId: null, name: 'Рустам Алиев', subjects: ['Reading', 'Speaking'], email: 'r.aliev@educenter.example' },
    { id: 't3', userId: null, name: 'Камола Ахмедова', subjects: ['Listening', 'Пробный тест'], email: 'k.akhmedova@educenter.example' },
  );
  db.courses.push({ id: 'c1', name: 'IELTS Intensive', level: 'B2 → 7.0', subjects: ['Grammar', 'Reading', 'Writing', 'Listening', 'Speaking', 'Пробный тест'] });
  db.groups.push({ id: 'gr1', name: 'IELTS B2 · Группа 3', courseId: 'c1', teacherId: 't1' });

  const registered = addDays(thisWeek, -52);
  const studentRecs = STUDENTS.map((s, i) => {
    const user = addUser('student', s.login, s.name, DEMO_ACCOUNTS.student.password);
    const parent = { id: core.nextId(db, 'p'), name: PARENTS[i] };
    db.parents.push(parent);
    const rec = {
      id: core.nextId(db, 'st'), userId: user.id, groupId: 'gr1', parentId: parent.id, registeredAt: registered,
      phone: `+998 90 ${String(100 + i * 37).slice(0, 3)} ${String(10 + i * 7).padStart(2, '0')} ${String(20 + i * 11).padStart(2, '0')}`,
      email: `${s.login}@mail.example`, birthDate: `${2006 + (i % 3)}-0${1 + i}-1${i}`,
      cfg: s,
    };
    db.students.push(rec);
    return rec;
  });
  const cfgOf = new Map(studentRecs.map((r) => [r.id, r.cfg]));
  db.students.forEach((r) => delete r.cfg);

  /* ----- lessons: 6 weeks back, 2 weeks ahead ----- */
  for (let w = -6; w <= 2; w++) {
    for (const t of WEEK_TEMPLATE) {
      db.lessons.push({
        id: core.nextId(db, 'L'), groupId: 'gr1', date: addDays(thisWeek, w * 7 + t.dow), start: t.start, end: t.end,
        subject: t.subject, teacherId: t.teacher, room: t.room, kind: t.kind, status: 'scheduled', note: '', homework: t.homework,
      });
    }
  }
  const lessonsSorted = db.lessons.slice().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const tmplOf = (l) => WEEK_TEMPLATE.find((t) => t.subject === l.subject);

  /* ----- timeline ----- */
  const timeline = [];
  const push = (when, run) => { if (when <= realNow) timeline.push({ when, run, order: timeline.length }); };
  const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
  const commentFor = (pct, r) => pick(pct >= 90 ? COMMENTS.high : pct >= 75 ? COMMENTS.good : pct >= 60 ? COMMENTS.mid : COMMENTS.low, r);
  const weekIdx = (date) => (new Date(date) - new Date(addDays(thisWeek, -42))) / (7 * 864e5);
  const rngFor = (sid, salt) => mulberry32(parseInt(sha256(`${sid}:${salt}`).slice(0, 8), 16));

  const mainId = studentRecs.find((r) => cfgOf.get(r.id).main).id;
  const MAIN_ATT = { 7: 'late', 12: 'absent', 13: 'excused', 21: 'late' };

  // attendance + class grades
  lessonsSorted.forEach((l, idx) => {
    const end = at(l.date, l.end);
    push(new Date(end.getTime() + 5 * 60000), () => {
      for (const s of studentRecs) {
        const cfg = cfgOf.get(s.id);
        const r = rngFor(s.id, `att${idx}`);
        let status; let reason = '';
        if (cfg.main && MAIN_ATT[idx]) status = MAIN_ATT[idx];
        else if (cfg.main) status = 'present';
        else {
          const x = r();
          status = x < cfg.attend ? 'present' : x < cfg.attend + cfg.late ? 'late' : r() < 0.45 ? 'excused' : 'absent';
        }
        if (status === 'excused') reason = EXCUSE_REASONS[(idx + s.id.length) % EXCUSE_REASONS.length];
        core.markAttendance(ctx, { lessonId: l.id, studentId: s.id, status, reason, by: adminUser.id });
      }
    });
    if (tmplOf(l).kind === 'class') {
      push(new Date(end.getTime() + 15 * 60000), () => {
        for (const s of studentRecs) {
          const a = db.attendance.find((x) => x.lessonId === l.id && x.studentId === s.id);
          if (!a || (a.status !== 'present' && a.status !== 'late')) continue;
          const cfg = cfgOf.get(s.id);
          const r = rngFor(s.id, `cls${idx}`);
          const score = clamp(Math.round(cfg.base + cfg.slope * weekIdx(l.date) + (r() - 0.5) * 14), 45, 100);
          core.addGrade(ctx, { studentId: s.id, subject: l.subject, kind: 'class', title: 'Speaking: оценка на уроке', score, max: 100, date: l.date, teacherId: l.teacherId, comment: r() < 0.5 ? commentFor(score, r) : '' });
        }
      });
    }
    // mock tests: graded the next day at noon
    if (tmplOf(l).kind === 'test') {
      push(at(addDays(l.date, 1), '12:00'), () => {
        for (const s of studentRecs) {
          const a = db.attendance.find((x) => x.lessonId === l.id && x.studentId === s.id);
          if (!a || (a.status !== 'present' && a.status !== 'late')) continue;
          const cfg = cfgOf.get(s.id);
          const r = rngFor(s.id, `tst${idx}`);
          const bump = cfg.main ? 3 : 0; // main demo student trends towards an excellent result
          const score = clamp(Math.round(cfg.base + bump + cfg.slope * weekIdx(l.date) + (r() - 0.5) * 8), 45, 100);
          core.addGrade(ctx, { studentId: s.id, subject: 'Пробный тест', kind: 'test', title: `Пробный тест IELTS №${Math.round(weekIdx(l.date)) + 1}`, score, max: 100, date: l.date, teacherId: l.teacherId, comment: commentFor(score, r) });
        }
      });
    }
  });

  // homework
  const hwLessons = lessonsSorted.filter((l) => tmplOf(l).homework && at(l.date, l.end) <= realNow);
  const perSubject = {};
  const planned = [];
  hwLessons.forEach((l) => {
    const n = (perSubject[l.subject] = (perSubject[l.subject] ?? -1) + 1);
    const created = new Date(at(l.date, l.end).getTime() + 20 * 60000);
    const dueAt = `${addDays(l.date, 4)}T20:00`;
    planned.push({ l, n, created, dueAt, hwIndex: planned.length });
  });
  const createdIds = new Map();
  planned.forEach((p) => {
    push(p.created, () => {
      const a = core.createAssignment(ctx, {
        groupId: 'gr1', subject: p.l.subject, title: HOMEWORK_TITLES[p.l.subject][p.n % 7], description: HOMEWORK_DESC[p.l.subject], dueAt: p.dueAt, teacherId: p.l.teacherId,
      });
      createdIds.set(p.hwIndex, a.id);
    });
    const due = parseStamp(p.dueAt);
    const activeNow = due > realNow;
    studentRecs.forEach((s) => {
      const cfg = cfgOf.get(s.id);
      const r = rngFor(s.id, `hw${p.hwIndex}`);
      let mode; // 'ontime' | 'late' | 'none'
      if (cfg.main && p.hwIndex === 8) mode = 'none';
      else if (cfg.main && p.hwIndex === 11) mode = 'late';
      else if (cfg.main) mode = 'ontime';
      else { const x = r(); mode = x < cfg.hw ? 'ontime' : x < cfg.hw + 0.07 ? 'late' : 'none'; }
      if (activeNow && cfg.main && p.hwIndex % 2 === 1) mode = 'none'; // leave some open assignments for the demo
      if (mode === 'none') return;
      const when = mode === 'ontime'
        ? new Date(Math.max(p.created.getTime() + 3 * 3600e3, due.getTime() - (4 + Math.floor(r() * 40)) * 3600e3))
        : new Date(due.getTime() + 14 * 3600e3);
      const onTimeWhen = activeNow ? new Date(Math.min(when.getTime(), p.created.getTime() + (3 + Math.floor(r() * 30)) * 3600e3)) : when;
      push(onTimeWhen, () => {
        core.submitAssignment(ctx, s.id, createdIds.get(p.hwIndex), { text: 'Ответы выполнены, пояснения и список трудных слов приложены ниже.', files: [] });
      });
      push(new Date(due.getTime() + (mode === 'late' ? 40 : 16) * 3600e3), () => {
        const sub = db.submissions.find((x) => x.assignmentId === createdIds.get(p.hwIndex) && x.studentId === s.id);
        if (!sub || sub.status !== 'submitted') return;
        const score = clamp(Math.round(cfg.base + cfg.slope * weekIdx(p.l.date) + (r() - 0.45) * 16), 40, 100);
        core.checkSubmission(ctx, { submissionId: sub.id, score, max: 100, feedback: r() < 0.55 ? commentFor(score, r) : '', by: p.l.teacherId });
      });
    });
  });

  // rewards, olympiad, redemption, announcements
  db.rewards.push(
    { id: 'rw1', title: 'Блокнот EduCenter', description: 'Фирменный блокнот для конспектов', cost: 100, stock: 25, active: true },
    { id: 'rw2', title: 'Выбор темы Speaking-клуба', description: 'Ваша тема будет обсуждаться на ближайшем Speaking-уроке', cost: 80, stock: null, active: true },
    { id: 'rw3', title: 'Кружка EduCenter', description: 'Керамическая кружка с логотипом центра', cost: 150, stock: 12, active: true },
    { id: 'rw4', title: 'Проверка эссе вне очереди', description: 'Преподаватель проверит ваше эссе в течение суток', cost: 180, stock: 10, active: true },
    { id: 'rw5', title: 'Дополнительный пробный тест', description: 'Ещё одна попытка пробного теста в формате IELTS', cost: 250, stock: 8, active: true },
    { id: 'rw6', title: 'Индивидуальная консультация', description: '30 минут с преподавателем по вашему запросу', cost: 400, stock: 5, active: true },
    { id: 'rw7', title: 'Скидка 10% на следующий курс', description: 'Купон действует при записи на любой следующий курс', cost: 900, stock: 3, active: true },
  );
  const olympDate = addDays(thisWeek, -18);
  push(at(olympDate, '18:00'), () => core.awardOlympiad(ctx, { studentId: mainId, title: 'Городская олимпиада по английскому языку', date: olympDate, by: adminUser.id }));
  push(at(addDays(thisWeek, -9), '15:30'), () => {
    if (core.coinSummary(db, mainId).balance >= 100) core.redeemReward(ctx, mainId, 'rw1');
  });
  push(new Date(realNow.getTime() - 20 * 3600e3), () => core.broadcastMessage(ctx, {
    groupId: 'gr1', title: 'Подготовка к пробному тесту',
    body: 'В субботу пробный тест начинается в 11:00. Приходите за 15 минут, возьмите паспорт или ученический билет и ручку.',
  }));

  // schedule changes for next week (announced a few hours ago)
  const nextWed = lessonsSorted.find((l) => l.date === addDays(thisWeek, 9));
  const nextFri = lessonsSorted.find((l) => l.date === addDays(thisWeek, 11));
  push(new Date(realNow.getTime() - 3 * 3600e3), () => core.cancelLesson(ctx, { lessonId: nextWed.id, note: 'Преподаватель на обучении. Материалы придут заданием.' }));
  push(new Date(realNow.getTime() - 2.5 * 3600e3), () => core.rescheduleLesson(ctx, { lessonId: nextFri.id, date: addDays(thisWeek, 12), start: '14:00', end: '15:30', room: '207', note: 'Перенос по просьбе преподавателя.' }));

  /* ----- replay ----- */
  timeline.sort((a, b) => a.when - b.when || a.order - b.order);
  for (const ev of timeline) { setClock(ev.when); ev.run(); }
  setClock(new Date(realNow));

  // anything older than two days has been "seen"; recent items stay unread for the demo
  const cutoff = stamp(new Date(realNow.getTime() - 2 * 864e5));
  db.notifications.forEach((n) => { if (n.createdAt < cutoff) n.read = true; });
  db.meta.seededAt = stamp(realNow);
  return db;
}


/* Real launch: no demo people, no demo data. One administrator (credentials come from the environment) and
   one course, so groups and teachers can be created right away from the administrator's screens. */
export function buildProductionSeed(realNow, { adminLogin, adminPassword, centerName }) {
  const db = emptyDb();
  const salt = randomHex(8);
  db.meta.seededAt = stamp(realNow);
  if (centerName) db.center = { ...db.center, name: centerName, phone: '', email: '', address: '', hours: '' };
  db.users.push({ id: core.nextId(db, 'u'), role: 'admin', login: adminLogin, name: 'Администратор', salt, hash: hashPassword(adminPassword, salt), createdAt: stamp(realNow), disabled: false, settings: { notify: { assignment: true, schedule: true, grade: true, coins: true } } });
  db.courses.push({ id: 'c1', name: 'Основной курс', level: '', subjects: ['Grammar', 'Reading', 'Writing', 'Listening', 'Speaking', 'Пробный тест'] });
  db.rewards.push({ id: 'rw1', title: 'Фирменный блокнот', description: 'Блокнот центра для конспектов', cost: 100, stock: null, active: true });
  return db;
}
