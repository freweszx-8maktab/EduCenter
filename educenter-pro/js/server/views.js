/* Read models for the student cabinet. Every function receives the student id that the
   backend derived from the session — callers can never ask for somebody else's data. */
import {
  RULES, byId, studentById, studentName, lessonStart, lessonEnd, attendanceStats, averageScore,
  coinSummary, achievementProgress, submissionOf, groupStudents,
} from './core.js';
import { isoDate, stamp, parseStamp, addDays, weekStart, monthOf, isDate, isMonth, fail, round1, sum } from './util.js';

const teacherRef = (db, id) => { const t = byId(db.teachers, id); return t ? { id: t.id, name: t.name } : null; };

function context(db, student) {
  const group = byId(db.groups, student.groupId);
  const course = byId(db.courses, group.courseId);
  return { group, course, teacher: teacherRef(db, group.teacherId), user: byId(db.users, student.userId) };
}

export function lessonView(ctx, lesson, studentId) {
  const { db } = ctx;
  const now = ctx.now();
  const att = studentId ? db.attendance.find((a) => a.lessonId === lesson.id && a.studentId === studentId) : null;
  let phase = 'upcoming';
  if (lesson.status !== 'cancelled') {
    if (lessonEnd(lesson) <= now) phase = 'finished';
    else if (lessonStart(lesson) <= now) phase = 'now';
  }
  return {
    id: lesson.id, date: lesson.date, start: lesson.start, end: lesson.end, subject: lesson.subject, kind: lesson.kind,
    teacher: teacherRef(db, lesson.teacherId), room: lesson.room, status: lesson.status, phase,
    note: lesson.note || '', original: lesson.original || null,
    attendance: att ? { status: att.status, reason: att.reason } : null,
  };
}

const sortLessons = (a, b) => (a.date + a.start).localeCompare(b.date + b.start);

export function me(ctx, studentId) {
  const { db } = ctx;
  const student = studentById(db, studentId);
  const { group, course, teacher, user } = context(db, student);
  return {
    user: { id: user.id, name: user.name, login: user.login, role: user.role },
    student: { id: student.id, registeredAt: student.registeredAt, phone: student.phone, email: student.email },
    hasPhoto: !!student.photo,
    center: db.center, group: { id: group.id, name: group.name }, course: { id: course.id, name: course.name, level: course.level },
    teacher, unread: db.notifications.filter((n) => n.userId === user.id && !n.read).length,
    serverNow: stamp(ctx.now()),
  };
}

export function overview(ctx, studentId) {
  const { db } = ctx;
  const now = ctx.now();
  const student = studentById(db, studentId);
  const base = me(ctx, studentId);
  const att = attendanceStats(db, studentId, now);
  const lessons = db.lessons.filter((l) => l.groupId === student.groupId).sort(sortLessons);
  const today = isoDate(now);

  const nextRaw = lessons.find((l) => l.status !== 'cancelled' && lessonEnd(l) > now);
  const todayLessons = lessons.filter((l) => l.date === today).map((l) => lessonView(ctx, l, studentId));
  const soon = lessons.filter((l) => l.date >= today && l.date <= addDays(today, 7) && (l.status === 'cancelled' || l.status === 'rescheduled') && lessonEnd(l) > now)
    .map((l) => lessonView(ctx, l, studentId));

  const asg = assignmentsFor(ctx, studentId);
  const done = asg.filter((a) => a.state === 'submitted' || a.state === 'checked').length;
  const grades = db.grades.filter((g) => g.studentId === studentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ach = achievementProgress(db, student, now).filter((a) => a.unlocked).sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));

  return {
    ...base,
    stats: {
      attendance: { percent: att.percent, present: att.present, late: att.late, absent: att.absent, base: att.base },
      average: { value: averageScore(db, studentId), count: grades.length },
      assignments: { done, total: asg.length, overdue: asg.filter((a) => a.state === 'overdue').length },
      coins: coinSummary(db, studentId).balance,
    },
    nextLesson: nextRaw ? lessonView(ctx, nextRaw, studentId) : null,
    today: todayLessons,
    changes: soon,
    recentGrades: grades.slice(0, 4).map(gradeView.bind(null, db)),
    activeAssignments: asg.filter((a) => a.state === 'active').slice(0, 4),
    recentAchievements: ach.slice(0, 3),
  };
}

/* ---------- Schedule ---------- */
export function schedule(ctx, studentId, { weekStart: ws } = {}) {
  const { db } = ctx;
  const student = studentById(db, studentId);
  const today = isoDate(ctx.now());
  if (ws !== undefined && !isDate(ws)) fail('VALIDATION', 'Некорректная дата недели');
  const start = weekStart(ws || today);
  const end = addDays(start, 6);
  const all = db.lessons.filter((l) => l.groupId === student.groupId);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, lessons: all.filter((l) => l.date === date).sort(sortLessons).map((l) => lessonView(ctx, l, studentId)) };
  });
  const bounds = all.length ? { first: weekStart(all.map((l) => l.date).sort()[0]), last: weekStart(all.map((l) => l.date).sort().at(-1)) } : null;
  return { weekStart: start, weekEnd: end, today, days, bounds, changes: days.flatMap((d) => d.lessons).filter((l) => l.status === 'cancelled' || l.status === 'rescheduled') };
}

/* ---------- Attendance ---------- */
export function attendance(ctx, studentId, { month = 'all' } = {}) {
  const { db } = ctx;
  const now = ctx.now();
  if (month !== 'all' && !isMonth(month)) fail('VALIDATION', 'Некорректный месяц');
  const inMonth = (l) => month === 'all' || monthOf(l.date) === month;
  const rows = db.attendance
    .filter((a) => a.studentId === studentId)
    .map((a) => ({ a, l: byId(db.lessons, a.lessonId) }))
    .filter(({ l }) => l && l.status !== 'cancelled' && lessonEnd(l) <= now && inMonth(l))
    .sort((x, y) => sortLessons(y.l, x.l))
    .map(({ a, l }) => ({ lessonId: l.id, date: l.date, start: l.start, end: l.end, subject: l.subject, teacher: teacherRef(db, l.teacherId), room: l.room, status: a.status, reason: a.reason || '' }));

  const months = [...new Set(db.attendance.filter((a) => a.studentId === studentId).map((a) => monthOf(byId(db.lessons, a.lessonId).date)))].sort().reverse();
  const byMonth = months.slice().reverse().map((m) => ({ month: m, ...attendanceStats(db, studentId, now, (l) => monthOf(l.date) === m) }));
  return {
    month, months, summary: attendanceStats(db, studentId, now, inMonth), overall: attendanceStats(db, studentId, now), byMonth, rows,
    policy: 'Опоздание считается посещением, пропуск по уважительной причине не снижает процент.',
  };
}

/* ---------- Performance ---------- */
function gradeView(db, g) {
  return {
    id: g.id, subject: g.subject, kind: g.kind, title: g.title, score: g.score, max: g.max, percent: Math.round((g.score / g.max) * 100),
    date: g.date, teacher: teacherRef(db, g.teacherId), comment: g.comment,
  };
}

export function performance(ctx, studentId) {
  const { db } = ctx;
  const grades = db.grades.filter((g) => g.studentId === studentId).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const views = grades.map((g) => gradeView(db, g));
  let running = 0;
  const series = views.map((g, i) => { running += g.percent; return { date: g.date, percent: g.percent, average: round1(running / (i + 1)), title: `${g.subject} · ${g.title}` }; });
  const subjects = [...new Set(views.map((g) => g.subject))].sort((a, b) => a.localeCompare(b, 'ru')).map((subject) => {
    const own = views.filter((g) => g.subject === subject);
    const last3 = own.slice(-3);
    const prev3 = own.slice(-6, -3);
    const avg = round1(sum(own, (g) => g.percent) / own.length);
    const trend = prev3.length ? round1(sum(last3, (g) => g.percent) / last3.length - sum(prev3, (g) => g.percent) / prev3.length) : null;
    return { subject, average: avg, count: own.length, last: own.at(-1), trend };
  });
  return {
    average: averageScore(db, studentId), count: views.length, subjects, series,
    history: views.slice().reverse(),
    tests: views.filter((g) => g.kind === 'test').reverse(),
    comments: views.filter((g) => g.comment).reverse().slice(0, 12),
    kinds: { test: 'Контрольная', homework: 'Домашнее задание', class: 'Работа на уроке' },
  };
}

/* ---------- Assignments ---------- */
export function assignmentsFor(ctx, studentId) {
  const { db } = ctx;
  const now = ctx.now();
  const student = studentById(db, studentId);
  return db.assignments.filter((a) => a.groupId === student.groupId).map((a) => {
    const sub = submissionOf(db, a.id, studentId);
    const due = parseStamp(a.dueAt);
    let state;
    if (sub) state = sub.status === 'checked' ? 'checked' : 'submitted';
    else state = now > due ? 'overdue' : 'active';
    return {
      id: a.id, title: a.title, description: a.description, subject: a.subject, teacher: teacherRef(db, a.teacherId),
      createdAt: a.createdAt, dueAt: a.dueAt, allowFiles: a.allowFiles, state,
      submission: sub ? {
        text: sub.text, files: sub.files.map((f, i) => ({ index: i, name: f.name, size: f.size })), submittedAt: sub.submittedAt, late: sub.late,
        score: sub.score, max: sub.max || 100, feedback: sub.feedback, checkedAt: sub.checkedAt || null,
      } : null,
    };
  }).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/* ---------- EduCoins ---------- */
export function coins(ctx, studentId) {
  const { db } = ctx;
  const student = studentById(db, studentId);
  const sum_ = coinSummary(db, studentId);
  const ledger = db.ledger.filter((e) => e.studentId === studentId).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id, 'en', { numeric: true }));

  // Leaderboard: lifetime earned points, so spending never lowers your place.
  const board = groupStudents(db, student.groupId).map((s) => ({ s, ...coinSummary(db, s.id) })).sort((a, b) => b.earned - a.earned || a.s.id.localeCompare(b.s.id, 'en', { numeric: true }));
  const rating = board.map((r, i) => {
    const full = studentName(db, r.s.id);
    const [first, last = ''] = full.split(' ');
    return { rank: i + 1, name: r.s.id === studentId ? full : `${first} ${last.charAt(0)}.`, earned: r.earned, me: r.s.id === studentId };
  });
  const myRank = rating.find((r) => r.me)?.rank || null;

  const rewards = db.rewards.filter((r) => r.active).sort((a, b) => a.cost - b.cost).map((r) => ({
    id: r.id, title: r.title, description: r.description, cost: r.cost, stock: r.stock, affordable: sum_.balance >= r.cost, available: r.stock === null || r.stock > 0,
  }));
  return {
    ...sum_, rules: Object.values(RULES), ledger, rating, myRank, groupSize: board.length, rewards,
    redemptions: db.redemptions.filter((r) => r.studentId === studentId).sort((a, b) => b.at.localeCompare(a.at)),
    statusLabels: { pending: 'Ожидает выдачи', issued: 'Выдано', cancelled: 'Отменено' },
    byRule: Object.fromEntries(Object.keys(RULES).map((k) => [k, sum(db.ledger.filter((e) => e.studentId === studentId && e.rule === k && e.type !== 'spend'), (e) => (e.type === 'revoke' ? -e.amount : e.amount))])),
  };
}

export function achievements(ctx, studentId) {
  const list = achievementProgress(ctx.db, studentById(ctx.db, studentId), ctx.now());
  return { items: list, unlocked: list.filter((a) => a.unlocked).length, total: list.length };
}

/* ---------- Notifications ---------- */
export function notifications(ctx, studentId, { type = 'all', unreadOnly = false } = {}) {
  const { db } = ctx;
  const user = byId(db.users, studentById(db, studentId).userId);
  const mine = db.notifications.filter((n) => n.userId === user.id);
  const list = mine.filter((n) => (type === 'all' || n.type === type) && (!unreadOnly || !n.read))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id, 'en', { numeric: true }))
    .map(({ id, type: t, title, body, link, createdAt, read }) => ({ id, type: t, title, body, link, createdAt, read }));
  const counts = { all: mine.length };
  for (const n of mine) counts[n.type] = (counts[n.type] || 0) + 1;
  return { items: list, unread: mine.filter((n) => !n.read).length, counts, serverNow: stamp(ctx.now()) };
}

/* ---------- Profile ---------- */
export function profile(ctx, studentId) {
  const { db } = ctx;
  const student = studentById(db, studentId);
  const base = me(ctx, studentId);
  const parent = byId(db.parents, student.parentId);
  const teachers = [...new Set(db.lessons.filter((l) => l.groupId === student.groupId).map((l) => l.teacherId))].map((id) => {
    const t = byId(db.teachers, id);
    return { id: t.id, name: t.name, subjects: t.subjects, email: t.email };
  });
  const settings = byId(db.users, student.userId).settings;
  return { ...base, parent: parent ? { name: parent.name } : null, teachers, center: { ...db.center }, settings, birthDate: student.birthDate };
}
