/* Read models for the teacher cabinet. Every function receives a `scope` computed by the backend
   from the session (never from the client): { teacher, groupIds, isAdmin }. */
import {
  byId, studentById, studentName, lessonStart, lessonEnd, attendanceStats, averageScore, coinSummary, groupStudents,
} from './core.js';
import { lessonView } from './views.js';
import { isoDate, stamp, addDays, weekStart, isDate, fail, round1 } from './util.js';

const sortL = (a, b) => (a.date + a.start).localeCompare(b.date + b.start);
const refT = (db, id) => { const t = byId(db.teachers, id); return t ? { id: t.id, name: t.name } : null; };

export function scopeOf(db, user) {
  const isAdmin = user.role === 'admin';
  const teacher = db.teachers.find((t) => t.userId === user.id) || null;
  const groupIds = isAdmin
    ? db.groups.map((g) => g.id)
    : [...new Set(db.lessons.filter((l) => l.teacherId === teacher?.id).map((l) => l.groupId))];
  return { teacher, groupIds, isAdmin, user };
}

const mineLesson = (scope, l) => scope.isAdmin || l.teacherId === scope.teacher?.id;

function groupCard(ctx, g) {
  const { db } = ctx;
  const now = ctx.now();
  const students = groupStudents(db, g.id);
  const stats = students.map((s) => attendanceStats(db, s.id, now));
  const withBase = stats.filter((x) => x.percent != null);
  const avgs = students.map((s) => averageScore(db, s.id)).filter((x) => x != null);
  return {
    id: g.id, name: g.name, course: byId(db.courses, g.courseId)?.name || '', students: students.length,
    attendance: withBase.length ? Math.round(withBase.reduce((a, x) => a + x.percent, 0) / withBase.length) : null,
    average: avgs.length ? round1(avgs.reduce((a, x) => a + x, 0) / avgs.length) : null,
  };
}

export function me(ctx, scope) {
  const { db } = ctx;
  return {
    user: { id: scope.user.id, name: scope.user.name, login: scope.user.login, role: scope.user.role },
    teacher: scope.teacher ? { id: scope.teacher.id, name: scope.teacher.name, subjects: scope.teacher.subjects, email: scope.teacher.email } : null,
    center: db.center,
    groups: db.groups.filter((g) => scope.groupIds.includes(g.id)).map((g) => groupCard(ctx, g)),
    serverNow: stamp(ctx.now()),
  };
}

/* Lessons of the teacher (admin: all) that are finished or running but still have unmarked students. */
function pendingMarks(ctx, scope) {
  const { db } = ctx;
  const now = ctx.now();
  return db.lessons
    .filter((l) => scope.groupIds.includes(l.groupId) && mineLesson(scope, l) && l.status !== 'cancelled' && lessonStart(l) <= now)
    .map((l) => {
      const st = groupStudents(db, l.groupId);
      const marked = st.filter((s) => db.attendance.some((a) => a.lessonId === l.id && a.studentId === s.id)).length;
      return { lesson: l, total: st.length, marked };
    })
    .filter((x) => x.marked < x.total)
    .sort((a, b) => sortL(b.lesson, a.lesson));
}

function submissionRows(ctx, scope) {
  const { db } = ctx;
  return db.submissions.map((sub) => {
    const a = byId(db.assignments, sub.assignmentId);
    const st = studentById(db, sub.studentId);
    return { sub, a, st };
  }).filter(({ a, st }) => a && st && scope.groupIds.includes(a.groupId) && (scope.isAdmin || scope.teacher?.subjects.includes(a.subject)));
}

export function overview(ctx, scope) {
  const { db } = ctx;
  const now = ctx.now();
  const today = isoDate(now);
  const lessons = db.lessons.filter((l) => scope.groupIds.includes(l.groupId) && mineLesson(scope, l)).sort(sortL);
  const lv = (l) => ({ ...lessonView(ctx, l, null), groupName: byId(db.groups, l.groupId).name, students: groupStudents(db, l.groupId).length });
  const toCheck = submissionRows(ctx, scope).filter((x) => x.sub.status === 'submitted');
  const pending = pendingMarks(ctx, scope);

  // students who need attention: low attendance or low average (only students of the teacher's groups)
  const attention = [];
  for (const gid of scope.groupIds) {
    for (const s of groupStudents(db, gid)) {
      const att = attendanceStats(db, s.id, now);
      const avg = averageScore(db, s.id);
      const reasons = [];
      if (att.percent != null && att.base >= 5 && att.percent < 80) reasons.push(`посещаемость ${att.percent}%`);
      if (avg != null && avg < 70) reasons.push(`средний балл ${avg}`);
      if (reasons.length) attention.push({ id: s.id, name: studentName(db, s.id), group: byId(db.groups, gid).name, reasons });
    }
  }
  return {
    ...me(ctx, scope),
    today: lessons.filter((l) => l.date === today).map(lv),
    next: (() => { const n = lessons.find((l) => l.status !== 'cancelled' && lessonEnd(l) > now); return n ? lv(n) : null; })(),
    toCheck: toCheck.length,
    toCheckList: toCheck.sort((x, y) => x.sub.submittedAt.localeCompare(y.sub.submittedAt)).slice(0, 5)
      .map(({ sub, a, st }) => ({ id: sub.id, assignmentId: a.id, student: studentName(db, st.id), title: a.title, subject: a.subject, submittedAt: sub.submittedAt, late: sub.late })),
    pendingMarks: pending.length,
    pendingList: pending.slice(0, 5).map(({ lesson, total, marked }) => ({ ...lv(lesson), total, marked })),
    attention: attention.sort((a, b) => b.reasons.length - a.reasons.length).slice(0, 8),
  };
}

export function groups(ctx, scope) {
  const { db } = ctx;
  const now = ctx.now();
  return {
    groups: db.groups.filter((g) => scope.groupIds.includes(g.id)).map((g) => ({
      ...groupCard(ctx, g),
      list: groupStudents(db, g.id).map((s) => {
        const att = attendanceStats(db, s.id, now);
        const u = byId(db.users, s.userId);
        return { id: s.id, name: u.name, attendance: att.percent, absent: att.absent, average: averageScore(db, s.id), coins: coinSummary(db, s.id).balance };
      }).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    })),
  };
}

function ownStudent(ctx, scope, studentId) {
  const st = studentById(ctx.db, studentId);
  if (!st || !scope.groupIds.includes(st.groupId)) fail('NOT_FOUND', 'Ученик не найден');
  return st;
}

export function student(ctx, scope, { studentId }) {
  const { db } = ctx;
  const now = ctx.now();
  const st = ownStudent(ctx, scope, studentId);
  const user = byId(db.users, st.userId);
  const att = attendanceStats(db, st.id, now);
  const grades = db.grades.filter((g) => g.studentId === st.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const subjects = scope.isAdmin ? null : scope.teacher?.subjects;
  return {
    id: st.id, name: user.name, group: byId(db.groups, st.groupId).name, groupId: st.groupId,
    phone: st.phone, email: st.email, parent: byId(db.parents, st.parentId)?.name || null,
    attendance: att, average: averageScore(db, st.id), coins: coinSummary(db, st.id),
    grades: grades.slice(0, 15).map((g) => ({ id: g.id, subject: g.subject, title: g.title, kind: g.kind, score: g.score, max: g.max, percent: Math.round((g.score / g.max) * 100), date: g.date, comment: g.comment })),
    olympiads: db.olympiads.filter((o) => o.studentId === st.id).sort((a, b) => b.date.localeCompare(a.date)),
    mySubjects: subjects,
  };
}

/* ---------- Attendance ---------- */
export function lessons(ctx, scope, { weekStart: ws } = {}) {
  const { db } = ctx;
  if (ws !== undefined && !isDate(ws)) fail('VALIDATION', 'Некорректная дата недели');
  const today = isoDate(ctx.now());
  const start = weekStart(ws || today);
  const all = db.lessons.filter((l) => scope.groupIds.includes(l.groupId) && mineLesson(scope, l));
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return {
      date,
      lessons: all.filter((l) => l.date === date).sort(sortL).map((l) => {
        const st = groupStudents(db, l.groupId);
        const marked = st.filter((s) => db.attendance.some((a) => a.lessonId === l.id && a.studentId === s.id)).length;
        return { ...lessonView(ctx, l, null), groupId: l.groupId, groupName: byId(db.groups, l.groupId).name, students: st.length, marked };
      }),
    };
  });
  const dates = all.map((l) => l.date).sort();
  return { weekStart: start, weekEnd: addDays(start, 6), today, days, bounds: dates.length ? { first: weekStart(dates[0]), last: weekStart(dates.at(-1)) } : null };
}

export function lesson(ctx, scope, { lessonId }) {
  const { db } = ctx;
  const l = byId(db.lessons, lessonId);
  if (!l || !scope.groupIds.includes(l.groupId) || !mineLesson(scope, l)) fail('NOT_FOUND', 'Занятие не найдено');
  const now = ctx.now();
  return {
    lesson: { ...lessonView(ctx, l, null), groupId: l.groupId, groupName: byId(db.groups, l.groupId).name },
    canMark: l.status !== 'cancelled' && lessonStart(l) <= now,
    students: groupStudents(db, l.groupId).map((s) => {
      const a = db.attendance.find((x) => x.lessonId === l.id && x.studentId === s.id);
      return { id: s.id, name: studentName(db, s.id), status: a?.status || null, reason: a?.reason || '' };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    serverNow: stamp(now),
  };
}

/* ---------- Grades ---------- */
export function grades(ctx, scope, { groupId }) {
  const { db } = ctx;
  if (!scope.groupIds.includes(groupId)) fail('NOT_FOUND', 'Группа не найдена');
  const ids = new Set(groupStudents(db, groupId).map((s) => s.id));
  const subjects = scope.isAdmin ? byId(db.courses, byId(db.groups, groupId).courseId).subjects : scope.teacher.subjects;
  return {
    groupId, subjects, students: [...ids].map((id) => ({ id, name: studentName(db, id) })).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    items: db.grades.filter((g) => ids.has(g.studentId) && subjects.includes(g.subject))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 60)
      .map((g) => ({ id: g.id, student: studentName(db, g.studentId), subject: g.subject, title: g.title, kind: g.kind, score: g.score, max: g.max, percent: Math.round((g.score / g.max) * 100), date: g.date, teacher: refT(db, g.teacherId), comment: g.comment })),
    today: isoDate(ctx.now()),
  };
}

/* ---------- Assignments ---------- */
export function assignments(ctx, scope) {
  const { db } = ctx;
  const now = ctx.now();
  const visible = db.assignments.filter((a) => scope.groupIds.includes(a.groupId) && (scope.isAdmin || scope.teacher?.subjects.includes(a.subject)));
  const items = visible.map((a) => {
    const st = groupStudents(db, a.groupId);
    const subs = db.submissions.filter((s) => s.assignmentId === a.id);
    return {
      id: a.id, title: a.title, subject: a.subject, groupId: a.groupId, groupName: byId(db.groups, a.groupId).name, dueAt: a.dueAt,
      description: a.description, total: st.length, submitted: subs.length, checked: subs.filter((s) => s.status === 'checked').length,
      toCheck: subs.filter((s) => s.status === 'submitted').length, late: subs.filter((s) => s.late).length,
    };
  }).sort((a, b) => b.dueAt.localeCompare(a.dueAt));
  return {
    items, groups: db.groups.filter((g) => scope.groupIds.includes(g.id)).map((g) => ({ id: g.id, name: g.name })),
    subjects: scope.isAdmin ? [...new Set(db.courses.flatMap((c) => c.subjects))] : scope.teacher.subjects,
    serverNow: stamp(now),
  };
}

export function assignment(ctx, scope, { assignmentId }) {
  const { db } = ctx;
  const a = byId(db.assignments, assignmentId);
  if (!a || !scope.groupIds.includes(a.groupId) || !(scope.isAdmin || scope.teacher?.subjects.includes(a.subject))) fail('NOT_FOUND', 'Задание не найдено');
  return {
    id: a.id, title: a.title, subject: a.subject, description: a.description, dueAt: a.dueAt, groupName: byId(db.groups, a.groupId).name,
    rows: groupStudents(db, a.groupId).map((s) => {
      const sub = db.submissions.find((x) => x.assignmentId === a.id && x.studentId === s.id);
      return {
        studentId: s.id, student: studentName(db, s.id),
        state: sub ? sub.status : 'none',
        submission: sub ? { id: sub.id, text: sub.text, files: sub.files.map((f, i) => ({ index: i, name: f.name, size: f.size })), submittedAt: sub.submittedAt, late: sub.late, score: sub.score ?? null, max: sub.max || 100, feedback: sub.feedback || '' } : null,
      };
    }).sort((x, y) => x.student.localeCompare(y.student, 'ru')),
  };
}

export function submissionFile(ctx, scope, { submissionId, index }) {
  const { db } = ctx;
  const sub = byId(db.submissions, submissionId);
  const a = sub && byId(db.assignments, sub.assignmentId);
  if (!a || !scope.groupIds.includes(a.groupId) || !(scope.isAdmin || scope.teacher?.subjects.includes(a.subject))) fail('NOT_FOUND', 'Файл не найден');
  const f = sub.files[index] || fail('NOT_FOUND', 'Файл не найден');
  return { name: f.name, data: f.data };
}

/* ---------- Schedule (own lessons, week view) ---------- */
export function schedule(ctx, scope, args) { return lessons(ctx, scope, args); }
