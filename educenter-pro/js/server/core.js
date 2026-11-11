/* Domain logic: every mutation of attendance, grades, assignments and EduCoins lives here.
   Nothing in this file trusts the caller — permission checks are done in backend.js,
   data-consistency checks are done here. */
import { fail, stamp, parseStamp, at, isDate, sum, round1, hashPassword, randomHex } from './util.js';

/* ---------- EduCoins rules (single source of truth, also shown in the UI) ---------- */
export const RULES = {
  attendance:  { key: 'attendance',  label: 'Присутствие на уроке',  points: 5 },
  assignment:  { key: 'assignment',  label: 'Выполненное задание',   points: 10 },
  test:        { key: 'test',        label: 'Отличная контрольная',  points: 20 },
  olympiad:    { key: 'olympiad',    label: 'Участие в олимпиаде',   points: 30 },
  achievement: { key: 'achievement', label: 'Учебное достижение',    points: 50 },
};
export const EXCELLENT_PCT = 90;
export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'];
export const GRADE_KINDS = ['test', 'homework', 'class'];
export const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'txt', 'zip'];
export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 1024 * 1024;

export const nextId = (db, p) => `${p}${(db.counters[p] = (db.counters[p] || 0) + 1)}`;
export const nowStamp = (ctx) => stamp(ctx.now());

/* ---------- Lookups ---------- */
export const byId = (list, id) => list.find((x) => x.id === id);
export const studentById = (db, id) => byId(db.students, id);
export const studentName = (db, sid) => byId(db.users, studentById(db, sid)?.userId)?.name || '—';

export function lessonStart(l) { return at(l.date, l.start); }
export function lessonEnd(l) { return at(l.date, l.end); }
export function groupStudents(db, groupId) { return db.students.filter((s) => s.groupId === groupId); }

/* ---------- Notifications ---------- */
const PREF_BY_TYPE = { assignment: 'assignment', schedule: 'schedule', grade: 'grade', coins: 'coins' };

export function notify(ctx, studentId, { type, title, body, link }) {
  const { db } = ctx;
  const s = studentById(db, studentId);
  if (!s) return null;
  const user = byId(db.users, s.userId);
  const prefKey = PREF_BY_TYPE[type];
  if (prefKey && user.settings?.notify?.[prefKey] === false) return null; // 'admin' messages are always delivered
  const n = { id: nextId(db, 'n'), userId: user.id, type, title, body, link: link || null, createdAt: nowStamp(ctx), read: false };
  db.notifications.push(n);
  return n;
}

export function notifyGroup(ctx, groupId, payload) {
  groupStudents(ctx.db, groupId).forEach((s) => notify(ctx, s.id, payload));
}

/* ---------- EduCoins ledger ---------- */
export function coinSummary(db, studentId) {
  let earned = 0, spent = 0;
  for (const e of db.ledger) {
    if (e.studentId !== studentId) continue;
    if (e.type === 'earn') earned += e.amount;
    else if (e.type === 'spend') spent += e.amount;
    else if (e.type === 'refund') spent -= e.amount; // a cancelled redemption returns the points
    else if (e.type === 'revoke') earned -= e.amount; // correction of an earlier accrual
  }
  return { earned, spent, balance: earned - spent };
}

function netCredit(db, studentId, base) {
  let net = 0;
  for (const e of db.ledger) {
    if (e.studentId !== studentId || e.base !== base) continue;
    net += e.type === 'earn' ? e.amount : e.type === 'revoke' ? -e.amount : 0;
  }
  return net;
}

/* Makes the ledger say "this operation is (not) worth points". Idempotent. */
export function setCredit(ctx, studentId, base, shouldCredit, rule, reason, opts = {}) {
  const { db } = ctx;
  const net = netCredit(db, studentId, base);
  const entry = { studentId, base, rule: rule.key, at: nowStamp(ctx) };
  if (shouldCredit && net === 0) {
    db.ledger.push({ id: nextId(db, 'l'), type: 'earn', amount: rule.points, reason, ...entry });
    if (opts.notify !== false) {
      notify(ctx, studentId, { type: 'coins', title: `+${rule.points} EduCoins`, body: reason, link: '#/coins' });
    }
    return true;
  }
  if (!shouldCredit && net > 0) {
    db.ledger.push({ id: nextId(db, 'l'), type: 'revoke', amount: net, reason: `Корректировка: ${reason}`, ...entry });
    notify(ctx, studentId, { type: 'coins', title: `−${net} EduCoins`, body: `Корректировка: ${reason}`, link: '#/coins' });
    return true;
  }
  return false;
}

/* ---------- Attendance (staff only; permission is checked by the caller) ---------- */
export function markAttendance(ctx, { lessonId, studentId, status, reason = '', by }) {
  const { db } = ctx;
  const lesson = byId(db.lessons, lessonId) || fail('NOT_FOUND', 'Занятие не найдено');
  const student = studentById(db, studentId) || fail('NOT_FOUND', 'Ученик не найден');
  if (!ATTENDANCE_STATUSES.includes(status)) fail('VALIDATION', 'Недопустимый статус посещаемости');
  if (lesson.groupId !== student.groupId) fail('VALIDATION', 'Ученик не состоит в группе этого занятия');
  if (lesson.status === 'cancelled') fail('CONFLICT', 'Занятие отменено — отметка невозможна');
  if (lessonStart(lesson) > ctx.now()) fail('CONFLICT', 'Занятие ещё не началось');
  if (typeof reason !== 'string' || reason.length > 200) fail('VALIDATION', 'Причина слишком длинная (до 200 символов)');

  let rec = db.attendance.find((a) => a.lessonId === lessonId && a.studentId === studentId);
  if (rec) Object.assign(rec, { status, reason: reason.trim(), markedBy: by, markedAt: nowStamp(ctx) });
  else {
    rec = { id: nextId(db, 'a'), lessonId, studentId, status, reason: reason.trim(), markedBy: by, markedAt: nowStamp(ctx) };
    db.attendance.push(rec);
  }
  setCredit(ctx, studentId, `att:${lessonId}`, status === 'present', RULES.attendance, `${RULES.attendance.label}: ${lesson.subject}`, { notify: false });
  syncAchievements(ctx, studentId);
  return rec;
}

/* ---------- Grades ---------- */
export function addGrade(ctx, { studentId, subject, kind, title, score, max = 100, date, teacherId, comment = '', refId = null }) {
  const { db } = ctx;
  studentById(db, studentId) || fail('NOT_FOUND', 'Ученик не найден');
  if (!GRADE_KINDS.includes(kind)) fail('VALIDATION', 'Недопустимый тип оценки');
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0 || score < 0 || score > max) fail('VALIDATION', 'Оценка должна быть от 0 до максимума');
  if (!isDate(date)) fail('VALIDATION', 'Некорректная дата');
  if (!subject || !title) fail('VALIDATION', 'Укажите предмет и название');
  const g = { id: nextId(db, 'g'), studentId, subject, kind, title, score, max, date, teacherId, comment: comment.trim(), refId, createdAt: nowStamp(ctx) };
  db.grades.push(g);
  notify(ctx, studentId, { type: 'grade', title: 'Новая оценка', body: `${subject} · ${title}: ${score}/${max}`, link: '#/performance' });
  if (kind === 'test') {
    setCredit(ctx, studentId, `test:${g.id}`, (score / max) * 100 >= EXCELLENT_PCT, RULES.test, `${RULES.test.label}: ${title}`);
  }
  syncAchievements(ctx, studentId);
  return g;
}

/* ---------- Assignments & submissions ---------- */
export function createAssignment(ctx, { groupId, subject, title, description, dueAt, teacherId, allowFiles = true }) {
  const { db } = ctx;
  byId(db.groups, groupId) || fail('NOT_FOUND', 'Группа не найдена');
  if (!title?.trim() || !subject) fail('VALIDATION', 'Укажите предмет и название задания');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dueAt || '')) fail('VALIDATION', 'Некорректный срок сдачи');
  const a = { id: nextId(db, 'h'), groupId, subject, title: title.trim(), description: (description || '').trim(), dueAt, teacherId, allowFiles, createdAt: nowStamp(ctx) };
  db.assignments.push(a);
  notifyGroup(ctx, groupId, { type: 'assignment', title: 'Новое задание', body: `${subject} · ${a.title}`, link: `#/assignments?open=${a.id}` });
  return a;
}

export function submissionOf(db, assignmentId, studentId) {
  return db.submissions.find((s) => s.assignmentId === assignmentId && s.studentId === studentId);
}

export function submitAssignment(ctx, studentId, assignmentId, { text = '', files = [] }) {
  const { db } = ctx;
  const student = studentById(db, studentId);
  const a = byId(db.assignments, assignmentId);
  if (!a || a.groupId !== student.groupId) fail('NOT_FOUND', 'Задание не найдено');
  const existing = submissionOf(db, assignmentId, studentId);
  if (existing?.status === 'checked') fail('CONFLICT', 'Работа уже проверена — изменить её нельзя');
  if (typeof text !== 'string' || text.length > 5000) fail('VALIDATION', 'Ответ слишком длинный (до 5000 символов)');
  if (!Array.isArray(files)) fail('VALIDATION', 'Некорректный список файлов');
  if (files.length && !a.allowFiles) fail('VALIDATION', 'К этому заданию нельзя прикреплять файлы');
  if (files.length > MAX_FILES) fail('VALIDATION', `Не более ${MAX_FILES} файлов`);
  const clean = files.map((f) => {
    const name = String(f?.name || '').replace(/[\\/\0]/g, '_').slice(0, 120);
    const ext = name.split('.').pop().toLowerCase();
    if (!name || !ALLOWED_EXT.includes(ext)) fail('VALIDATION', `Формат файла не поддерживается: ${name || 'без имени'}`);
    const data = String(f.data || '');
    if (!/^[A-Za-z0-9+/=]*$/.test(data)) fail('VALIDATION', 'Файл повреждён');
    const size = Math.floor((data.length * 3) / 4);
    if (size > MAX_FILE_BYTES) fail('VALIDATION', `Файл «${name}» больше 1 МБ`);
    return { name, size, data };
  });
  if (!text.trim() && !clean.length) fail('VALIDATION', 'Напишите ответ или прикрепите файл');

  const now = ctx.now();
  const late = now > parseStamp(a.dueAt);
  const rec = existing || { id: nextId(db, 's'), assignmentId, studentId };
  Object.assign(rec, { text: text.trim(), files: clean, submittedAt: stamp(now), late, status: 'submitted', score: null, feedback: '' });
  if (!existing) db.submissions.push(rec);
  return rec;
}

export function checkSubmission(ctx, { submissionId, score, max = 100, feedback = '', by }) {
  const { db } = ctx;
  const sub = byId(db.submissions, submissionId) || fail('NOT_FOUND', 'Работа не найдена');
  const a = byId(db.assignments, sub.assignmentId);
  if (sub.status === 'checked') fail('CONFLICT', 'Работа уже проверена');
  const g = addGrade(ctx, {
    studentId: sub.studentId, subject: a.subject, kind: 'homework', title: a.title, score, max,
    date: stamp(ctx.now()).slice(0, 10), teacherId: by, comment: feedback, refId: sub.id,
  });
  Object.assign(sub, { status: 'checked', score, max, feedback: feedback.trim(), checkedAt: nowStamp(ctx), gradeId: g.id });
  // Coins only for work handed in on time — late work is still graded but earns nothing.
  setCredit(ctx, sub.studentId, `hw:${a.id}`, !sub.late, RULES.assignment, `${RULES.assignment.label}: ${a.title}`);
  syncAchievements(ctx, sub.studentId);
  return sub;
}

/* ---------- Schedule changes ---------- */
export function cancelLesson(ctx, { lessonId, note = '' }) {
  const l = byId(ctx.db.lessons, lessonId) || fail('NOT_FOUND', 'Занятие не найдено');
  if (l.status === 'cancelled') fail('CONFLICT', 'Занятие уже отменено');
  if (lessonStart(l) <= ctx.now()) fail('CONFLICT', 'Нельзя отменить уже начавшееся занятие');
  Object.assign(l, { status: 'cancelled', note: note.trim() });
  notifyGroup(ctx, l.groupId, { type: 'schedule', title: 'Занятие отменено', body: `${l.subject}, ${l.date} в ${l.start}${note ? ` — ${note}` : ''}`, link: '#/schedule' });
  return l;
}

export function rescheduleLesson(ctx, { lessonId, date, start, end, room, note = '' }) {
  const l = byId(ctx.db.lessons, lessonId) || fail('NOT_FOUND', 'Занятие не найдено');
  if (!isDate(date) || !/^\d{2}:\d{2}$/.test(start || '') || !/^\d{2}:\d{2}$/.test(end || '') || end <= start) fail('VALIDATION', 'Некорректные дата или время');
  if (lessonStart(l) <= ctx.now()) fail('CONFLICT', 'Нельзя перенести уже начавшееся занятие');
  const original = l.original || { date: l.date, start: l.start, end: l.end, room: l.room };
  Object.assign(l, { date, start, end, room: room || l.room, status: 'rescheduled', original, note: note.trim() });
  notifyGroup(ctx, l.groupId, {
    type: 'schedule', title: 'Занятие перенесено',
    body: `${l.subject}: было ${original.date} ${original.start}, теперь ${date} ${start}, каб. ${l.room}`, link: '#/schedule',
  });
  return l;
}

export function broadcastMessage(ctx, { groupId, title, body }) {
  if (!title?.trim() || !body?.trim()) fail('VALIDATION', 'Заполните заголовок и текст');
  notifyGroup(ctx, groupId, { type: 'admin', title: title.trim(), body: body.trim(), link: null });
}

export function awardOlympiad(ctx, { studentId, title, date, by }) {
  const { db } = ctx;
  studentById(db, studentId) || fail('NOT_FOUND', 'Ученик не найден');
  if (!title?.trim() || !isDate(date)) fail('VALIDATION', 'Укажите название и дату олимпиады');
  const o = { id: nextId(db, 'o'), studentId, title: title.trim(), date, recordedBy: by };
  db.olympiads.push(o);
  setCredit(ctx, studentId, `olymp:${o.id}`, true, RULES.olympiad, `${RULES.olympiad.label}: ${o.title}`);
  syncAchievements(ctx, studentId);
  return o;
}

/* ---------- Rewards ---------- */
export function redeemReward(ctx, studentId, rewardId) {
  const { db } = ctx;
  const r = byId(db.rewards, rewardId) || fail('NOT_FOUND', 'Награда не найдена');
  if (!r.active) fail('CONFLICT', 'Эта награда сейчас недоступна');
  if (r.stock !== null && r.stock <= 0) fail('CONFLICT', 'Награда закончилась');
  const { balance } = coinSummary(db, studentId);
  if (balance < r.cost) fail('CONFLICT', `Недостаточно EduCoins: нужно ${r.cost}, на балансе ${balance}`);
  if (r.stock !== null) r.stock -= 1;
  const red = { id: nextId(db, 'r'), studentId, rewardId, title: r.title, cost: r.cost, at: nowStamp(ctx), status: 'pending' };
  db.redemptions.push(red);
  db.ledger.push({ id: nextId(db, 'l'), type: 'spend', amount: r.cost, reason: `Обмен: ${r.title}`, base: `red:${red.id}`, rule: 'redeem', studentId, at: nowStamp(ctx) });
  notify(ctx, studentId, { type: 'coins', title: `−${r.cost} EduCoins`, body: `Награда «${r.title}» — заберите в администрации центра`, link: '#/coins' });
  syncAchievements(ctx, studentId);
  return red;
}

/* ---------- Achievements: progress is derived from real records ---------- */
function finishedLessons(db, student, now) {
  return db.lessons
    .filter((l) => l.groupId === student.groupId && l.status !== 'cancelled' && lessonEnd(l) <= now)
    .sort((a, b) => lessonStart(a) - lessonStart(b));
}

/* Each helper returns the chronological list of dates at which "one more unit" was reached. */
const events = {
  presentDates(db, s, now) {
    const att = new Map(db.attendance.filter((a) => a.studentId === s.id).map((a) => [a.lessonId, a]));
    return finishedLessons(db, s, now).filter((l) => att.get(l.id)?.status === 'present').map((l) => l.date);
  },
  streakDates(db, s, now, n) {
    const att = new Map(db.attendance.filter((a) => a.studentId === s.id).map((a) => [a.lessonId, a]));
    let run = 0;
    let best = 0;
    let hit = null;
    for (const l of finishedLessons(db, s, now)) {
      const st = att.get(l.id)?.status;
      if (st === 'present') { run += 1; if (run > best) best = run; if (run >= n && !hit) hit = l.date; }
      else if (st === 'absent' || st === 'late') run = 0;
    }
    return { best, hit };
  },
  homeworkDates(db, s) {
    return db.submissions.filter((x) => x.studentId === s.id && x.status === 'checked' && !x.late)
      .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt)).map((x) => x.checkedAt.slice(0, 10));
  },
  excellentTestDates(db, s) {
    return db.grades.filter((g) => g.studentId === s.id && g.kind === 'test' && (g.score / g.max) * 100 >= EXCELLENT_PCT)
      .sort((a, b) => a.date.localeCompare(b.date)).map((g) => g.date);
  },
};

export const ACHIEVEMENTS = [
  { key: 'first_step', title: 'Первый шаг', description: 'Посетите своё первое занятие', unit: 'занятий', target: 1, count: (db, s, now) => ({ dates: events.presentDates(db, s, now) }) },
  { key: 'regular', title: 'Постоянство', description: 'Посетите 15 занятий', unit: 'занятий', target: 15, count: (db, s, now) => ({ dates: events.presentDates(db, s, now) }) },
  { key: 'discipline', title: 'Железная дисциплина', description: 'Посетите 40 занятий', unit: 'занятий', target: 40, count: (db, s, now) => ({ dates: events.presentDates(db, s, now) }) },
  {
    key: 'streak', title: 'Серия без пропусков', description: 'Посетите 10 занятий подряд без опозданий и пропусков', unit: 'подряд', target: 10,
    count: (db, s, now) => { const r = events.streakDates(db, s, now, 10); return { current: r.best, achievedAt: r.hit }; },
  },
  { key: 'homework5', title: 'Ответственный', description: 'Сдайте 5 домашних заданий вовремя', unit: 'заданий', target: 5, count: (db, s) => ({ dates: events.homeworkDates(db, s) }) },
  { key: 'homework15', title: 'Надёжный студент', description: 'Сдайте 25 домашних заданий вовремя', unit: 'заданий', target: 25, count: (db, s) => ({ dates: events.homeworkDates(db, s) }) },
  { key: 'excellent', title: 'Отличник', description: `Получите ${EXCELLENT_PCT}% и выше за контрольную`, unit: 'контрольных', target: 1, count: (db, s) => ({ dates: events.excellentTestDates(db, s) }) },
  {
    key: 'strong_avg', title: 'Стабильно сильный', description: 'Держите средний балл от 85 при минимум 5 оценках', unit: 'балл', target: 85,
    count: (db, s) => {
      const gs = db.grades.filter((g) => g.studentId === s.id).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id, 'en', { numeric: true }));
      let total = 0;
      let hit = null;
      gs.forEach((g, i) => { total += (g.score / g.max) * 100; if (i >= 4 && total / (i + 1) >= 85 && !hit) hit = g.date; });
      const avg = gs.length ? total / gs.length : 0;
      return { current: gs.length >= 5 ? Math.round(avg) : Math.min(Math.round(avg), 84), achievedAt: hit, note: gs.length < 5 ? `Нужно ещё оценок: ${5 - gs.length}` : null };
    },
  },
  { key: 'olympiad', title: 'Участник олимпиады', description: 'Примите участие в олимпиаде', unit: 'олимпиад', target: 1, count: (db, s) => ({ dates: db.olympiads.filter((o) => o.studentId === s.id).sort((a, b) => a.date.localeCompare(b.date)).map((o) => o.date) }) },
  { key: 'first_reward', title: 'Первая награда', description: 'Обменяйте EduCoins на награду в магазине', unit: 'обменов', target: 1, count: (db, s) => ({ dates: db.redemptions.filter((r) => r.studentId === s.id).map((r) => r.at.slice(0, 10)).sort() }) },
];

export function achievementProgress(db, student, now) {
  return ACHIEVEMENTS.map((def) => {
    const r = def.count(db, student, now);
    let current; let achievedAt;
    if (r.dates) { current = r.dates.length; achievedAt = r.dates.length >= def.target ? r.dates[def.target - 1] : null; }
    else { current = r.current; achievedAt = r.achievedAt || null; }
    const unlocked = !!achievedAt;
    return {
      key: def.key, title: def.title, description: def.description, unit: def.unit, target: def.target,
      current: Math.min(current, def.target), unlocked, achievedAt, note: r.note || null, reward: RULES.achievement.points,
      percent: Math.round((Math.min(current, def.target) / def.target) * 100),
    };
  });
}

/* Awards +50 EduCoins exactly once per achievement. */
export function syncAchievements(ctx, studentId) {
  const { db } = ctx;
  const student = studentById(db, studentId);
  for (const a of achievementProgress(db, student, ctx.now())) {
    if (!a.unlocked) continue;
    setCredit(ctx, studentId, `ach:${a.key}`, true, RULES.achievement, `${RULES.achievement.label}: «${a.title}»`, { notify: false });
    const exists = db.notifications.some((n) => n.userId === student.userId && n.refKey === `ach:${a.key}`);
    if (!exists) {
      const n = notify(ctx, studentId, { type: 'coins', title: `Достижение «${a.title}»`, body: `Награда: +${RULES.achievement.points} EduCoins`, link: '#/achievements' });
      if (n) n.refKey = `ach:${a.key}`;
    }
  }
}

/* ---------- Profile photo ---------- */
export const MAX_PHOTO_CHARS = 150000; // ≈110 KB of image data; the client sends a 256×256 JPEG (~20–40 KB)
export function validatePhoto(data) {
  if (typeof data !== 'string' || data.length > MAX_PHOTO_CHARS) fail('VALIDATION', 'Фото слишком большое. Выберите другое изображение.');
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!m) fail('VALIDATION', 'Поддерживаются изображения JPG, PNG и WebP.');
  let head;
  try { head = atob(m[2].slice(0, 24)); } catch { fail('VALIDATION', 'Файл повреждён.'); }
  const b = [...head].map((c) => c.charCodeAt(0));
  const ok = m[1] === 'image/jpeg' ? b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
    : m[1] === 'image/png' ? b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
      : head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP'; // the declared type must match the real file header
  if (!ok) fail('VALIDATION', 'Файл не является изображением заявленного формата.');
  return data;
}

/* ---------- Shared computations ---------- */
export function attendanceStats(db, studentId, now, filterFn = () => true) {
  const s = studentById(db, studentId);
  const rows = db.attendance.filter((a) => {
    if (a.studentId !== studentId) return false;
    const l = byId(db.lessons, a.lessonId);
    return l && l.status !== 'cancelled' && lessonEnd(l) <= now && filterFn(l, a);
  });
  const count = (st) => rows.filter((r) => r.status === st).length;
  const present = count('present'), late = count('late'), absent = count('absent'), excused = count('excused');
  const base = present + late + absent; // excused absences do not count against the student
  return { present, late, absent, excused, total: rows.length, base, percent: base ? Math.round(((present + late) / base) * 100) : null, groupId: s.groupId };
}

export function averageScore(db, studentId) {
  const gs = db.grades.filter((g) => g.studentId === studentId);
  if (!gs.length) return null;
  return round1(sum(gs, (g) => (g.score / g.max) * 100) / gs.length);
}

/* ---------- Administration (permission is checked by the caller: admin only) ---------- */
export const PASSWORD_RULE = 'Пароль: минимум 8 символов, буквы и цифры';
export const passwordOk = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 100 && /[A-Za-zА-Яа-я]/.test(p) && /\d/.test(p);

export function createStudentAccount(ctx, { name, login, password, groupId, phone, email }) {
  const { db } = ctx;
  if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 80) fail('VALIDATION', 'Укажите имя и фамилию (3–80 символов)');
  if (typeof login !== 'string' || !/^[a-z0-9._-]{3,30}$/.test(login.trim().toLowerCase())) fail('VALIDATION', 'Логин: 3–30 символов, латиница, цифры, точка, дефис, подчёркивание');
  const key = login.trim().toLowerCase();
  if (db.users.some((u) => u.login.toLowerCase() === key)) fail('CONFLICT', 'Такой логин уже занят');
  if (!passwordOk(password)) fail('VALIDATION', PASSWORD_RULE);
  byId(db.groups, groupId) || fail('VALIDATION', 'Выберите группу');
  if (typeof phone !== 'string' || !/^\+?[0-9\s()-]{7,20}$/.test(phone.trim())) fail('VALIDATION', 'Введите телефон в формате +998 90 123 45 67');
  if (typeof email !== 'string' || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) fail('VALIDATION', 'Введите корректный email');
  const salt = randomHex(8);
  const user = { id: nextId(db, 'u'), role: 'student', login: key, name: name.trim(), salt, hash: hashPassword(password, salt), createdAt: nowStamp(ctx), disabled: false, settings: { notify: { assignment: true, schedule: true, grade: true, coins: true } } };
  db.users.push(user);
  const st = { id: nextId(db, 'st'), userId: user.id, groupId, parentId: null, registeredAt: nowStamp(ctx).slice(0, 10), phone: phone.trim(), email: email.trim(), birthDate: null };
  db.students.push(st);
  return st;
}

export function setStudentDisabled(ctx, studentId, disabled) {
  const st = studentById(ctx.db, studentId) || fail('NOT_FOUND', 'Ученик не найден');
  if (typeof disabled !== 'boolean') fail('VALIDATION', 'Некорректный запрос');
  const user = byId(ctx.db.users, st.userId);
  user.disabled = disabled;
  if (disabled) ctx.db.sessions = ctx.db.sessions.filter((x) => x.userId !== user.id); // signed out immediately
  return st;
}

export function resetStudentPassword(ctx, studentId, newPassword) {
  const st = studentById(ctx.db, studentId) || fail('NOT_FOUND', 'Ученик не найден');
  if (!passwordOk(newPassword)) fail('VALIDATION', PASSWORD_RULE);
  const user = byId(ctx.db.users, st.userId);
  user.salt = randomHex(8);
  user.hash = hashPassword(newPassword, user.salt);
  ctx.db.sessions = ctx.db.sessions.filter((x) => x.userId !== user.id);
}

export function saveReward(ctx, { id, title, description = '', cost, stock = null, active = true }) {
  const { db } = ctx;
  if (typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 80) fail('VALIDATION', 'Название награды: 2–80 символов');
  if (typeof description !== 'string' || description.length > 200) fail('VALIDATION', 'Описание слишком длинное (до 200 символов)');
  if (!Number.isInteger(cost) || cost < 1 || cost > 10000) fail('VALIDATION', 'Стоимость — целое число от 1 до 10 000');
  if (stock !== null && (!Number.isInteger(stock) || stock < 0 || stock > 1000)) fail('VALIDATION', 'Остаток — целое число от 0 до 1000 или без ограничения');
  if (typeof active !== 'boolean') fail('VALIDATION', 'Некорректный запрос');
  if (id) {
    const r = byId(db.rewards, id) || fail('NOT_FOUND', 'Награда не найдена');
    Object.assign(r, { title: title.trim(), description: description.trim(), cost, stock, active }); // old redemptions keep their own title and price
    return r;
  }
  let n = db.rewards.length + 1; // seeded rewards have fixed ids (rw1…), so a plain counter could collide: take the first free one
  while (byId(db.rewards, `rw${n}`)) n += 1;
  const r = { id: `rw${n}`, title: title.trim(), description: description.trim(), cost, stock, active };
  db.rewards.push(r);
  return r;
}

/* issue: the prize was handed over. cancel: points go back to the student and the stock is restored. */
export function resolveRedemption(ctx, { id, action }) {
  const { db } = ctx;
  const red = byId(db.redemptions, id) || fail('NOT_FOUND', 'Заявка не найдена');
  if (red.status !== 'pending') fail('CONFLICT', 'Заявка уже обработана');
  if (action === 'issue') {
    red.status = 'issued'; red.resolvedAt = nowStamp(ctx);
    notify(ctx, red.studentId, { type: 'coins', title: 'Награда выдана', body: `«${red.title}» — приятного использования!`, link: '#/coins' });
  } else if (action === 'cancel') {
    red.status = 'cancelled'; red.resolvedAt = nowStamp(ctx);
    db.ledger.push({ id: nextId(db, 'l'), type: 'refund', amount: red.cost, reason: `Возврат: ${red.title}`, base: `ref:${red.id}`, rule: 'refund', studentId: red.studentId, at: nowStamp(ctx) });
    const r = byId(db.rewards, red.rewardId);
    if (r && r.stock !== null) r.stock += 1;
    notify(ctx, red.studentId, { type: 'coins', title: `+${red.cost} EduCoins`, body: `Возврат за «${red.title}»: выдача отменена`, link: '#/coins' });
  } else fail('VALIDATION', 'Некорректное действие');
  return red;
}

const LESSON_KINDS = ['lesson', 'class', 'test'];
const allSubjects = (db) => [...new Set(db.courses.flatMap((c) => c.subjects))];
const loginKey = (db, login) => {
  if (typeof login !== 'string' || !/^[a-z0-9._-]{3,30}$/.test(login.trim().toLowerCase())) fail('VALIDATION', 'Логин: 3–30 символов, латиница, цифры, точка, дефис, подчёркивание');
  const key = login.trim().toLowerCase();
  if (db.users.some((u) => u.login.toLowerCase() === key)) fail('CONFLICT', 'Такой логин уже занят');
  return key;
};

export function createTeacherAccount(ctx, { name, login, password, subjects, email }) {
  const { db } = ctx;
  if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 80) fail('VALIDATION', 'Укажите имя и фамилию (3–80 символов)');
  const key = loginKey(db, login);
  if (!passwordOk(password)) fail('VALIDATION', PASSWORD_RULE);
  if (!Array.isArray(subjects) || !subjects.length || subjects.some((x) => !allSubjects(db).includes(x))) fail('VALIDATION', 'Выберите хотя бы один предмет из списка');
  if (typeof email !== 'string' || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) fail('VALIDATION', 'Введите корректный email');
  const salt = randomHex(8);
  const user = { id: nextId(db, 'u'), role: 'teacher', login: key, name: name.trim(), salt, hash: hashPassword(password, salt), createdAt: nowStamp(ctx), disabled: false, settings: { notify: { assignment: true, schedule: true, grade: true, coins: true } } };
  db.users.push(user);
  const t = { id: nextId(db, 't'), userId: user.id, name: user.name, subjects: [...new Set(subjects)], email: email.trim() };
  // seeded teachers have fixed ids (t1…), so make sure the generated one is really free
  while (db.teachers.some((x) => x.id === t.id)) t.id = nextId(db, 't');
  db.teachers.push(t);
  return t;
}

export function createGroup(ctx, { name, courseId, teacherId }) {
  const { db } = ctx;
  if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 60) fail('VALIDATION', 'Название группы: 3–60 символов');
  if (db.groups.some((g) => g.name.toLowerCase() === name.trim().toLowerCase())) fail('CONFLICT', 'Группа с таким названием уже есть');
  byId(db.courses, courseId) || fail('VALIDATION', 'Выберите курс');
  byId(db.teachers, teacherId) || fail('VALIDATION', 'Выберите куратора группы');
  let n = db.groups.length + 1;
  while (byId(db.groups, `gr${n}`)) n += 1;
  const g = { id: `gr${n}`, name: name.trim(), courseId, teacherId };
  db.groups.push(g);
  return g;
}

export function moveStudent(ctx, { studentId, groupId }) {
  const st = studentById(ctx.db, studentId) || fail('NOT_FOUND', 'Ученик не найден');
  byId(ctx.db.groups, groupId) || fail('VALIDATION', 'Выберите группу');
  if (st.groupId === groupId) fail('CONFLICT', 'Ученик уже в этой группе');
  st.groupId = groupId; // history (grades, attendance, EduCoins) stays with the student
  notify(ctx, st.id, { type: 'schedule', title: 'Вы переведены в другую группу', body: `Новая группа: ${byId(ctx.db.groups, groupId).name}`, link: '#/schedule' });
  return st;
}

const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export function addLesson(ctx, { groupId, teacherId, subject, date, start, end, room, kind = 'lesson' }) {
  const { db } = ctx;
  const g = byId(db.groups, groupId) || fail('VALIDATION', 'Выберите группу');
  const t = byId(db.teachers, teacherId) || fail('VALIDATION', 'Выберите преподавателя');
  if (!t.subjects.includes(subject)) fail('VALIDATION', `${t.name} не преподаёт предмет «${subject}»`);
  if (!byId(db.courses, g.courseId).subjects.includes(subject)) fail('VALIDATION', `Предмет «${subject}» не входит в курс группы`);
  if (!isDate(date)) fail('VALIDATION', 'Укажите дату');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end || '') || end <= start) fail('VALIDATION', 'Время окончания должно быть позже начала');
  if (toMin(end) - toMin(start) > 360) fail('VALIDATION', 'Занятие не может быть длиннее 6 часов');
  if (typeof room !== 'string' || !room.trim() || room.trim().length > 10) fail('VALIDATION', 'Укажите кабинет (до 10 символов)');
  if (!LESSON_KINDS.includes(kind)) fail('VALIDATION', 'Некорректный тип занятия');
  const probe = { date, start };
  if (lessonStart(probe) <= ctx.now()) fail('VALIDATION', 'Занятие можно назначить только на будущее время');
  const clash = db.lessons.find((l) => l.status !== 'cancelled' && l.date === date && toMin(l.start) < toMin(end) && toMin(start) < toMin(l.end)
    && (l.teacherId === teacherId || l.room === room.trim() || l.groupId === groupId));
  if (clash) {
    const what = clash.teacherId === teacherId ? 'у преподавателя уже есть занятие' : clash.room === room.trim() ? `кабинет ${room.trim()} занят` : 'у группы уже есть занятие';
    fail('CONFLICT', `Пересечение по времени: ${what} (${clash.start}–${clash.end})`);
  }
  const l = { id: nextId(db, 'L'), groupId, date, start, end, subject, teacherId, room: room.trim(), kind, status: 'scheduled', note: '', homework: kind === 'lesson' };
  while (db.lessons.some((x) => x.id === l.id && x !== l)) l.id = nextId(db, 'L');
  db.lessons.push(l);
  notifyGroup(ctx, groupId, { type: 'schedule', title: 'Новое занятие в расписании', body: `${subject}: ${date} ${start}, каб. ${l.room}`, link: '#/schedule' });
  return l;
}
