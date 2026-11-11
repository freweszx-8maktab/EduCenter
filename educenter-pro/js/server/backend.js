/* EduCenter PRO backend. Isomorphic: the same code runs behind the Node HTTP server (real
   server-side enforcement) or inside the browser on top of localStorage (demo mode).

   Security model
   - the caller is identified ONLY by a session token; student ids are never accepted from the client
   - students can read their own data and perform a few own actions (submit work, redeem a reward, edit contacts)
   - attendance, grades, assignments, schedule and EduCoin accruals can only be changed by staff roles */
import {
  ApiError, STATUS_BY_CODE, fail, isoDate, stamp, parseStamp, sha256, hashPassword, randomHex, safeEqual, isDate,
} from './util.js';
import * as core from './core.js';
import * as views from './views.js';
import * as sv from './staffviews.js';
import { buildSeed, DEMO_ACCOUNTS } from './seed.js';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60 * 1000;
const DB_VERSION = 1;

export { DEMO_ACCOUNTS };

export function createBackend(storage, { now = () => new Date(), seed = buildSeed } = {}) {
  function load() {
    const raw = storage.read();
    if (raw) {
      const db = JSON.parse(raw);
      if (db?.meta?.version === DB_VERSION) return db;
    }
    const db = seed(now());
    persist(db);
    return db;
  }

  function persist(db) {
    try { storage.write(JSON.stringify(db)); }
    catch (e) { throw new ApiError('STORAGE', 'Не удалось сохранить данные: недостаточно места в хранилище'); }
  }

  /* ---------- authentication ---------- */
  const tokenKey = (token) => sha256(`session:${token}`);

  function authenticate(ctx, token) {
    if (typeof token !== 'string' || token.length < 16) fail('UNAUTHENTICATED', 'Требуется вход в систему');
    const key = tokenKey(token);
    const s = ctx.db.sessions.find((x) => x.key === key);
    if (!s || parseStamp(s.expiresAt) <= ctx.now()) fail('UNAUTHENTICATED', 'Сессия истекла — войдите снова');
    const user = core.byId(ctx.db.users, s.userId);
    if (!user || user.disabled) fail('UNAUTHENTICATED', 'Учётная запись недоступна');
    return { user, session: s };
  }

  function requireStudent(ctx, auth) {
    if (auth.user.role !== 'student') fail('FORBIDDEN', 'Этот раздел доступен только ученикам');
    const st = ctx.db.students.find((s) => s.userId === auth.user.id);
    if (!st) fail('FORBIDDEN', 'Профиль ученика не найден');
    return st.id; // the ONLY source of "who is asking" for student endpoints
  }

  function requireStaff(ctx, auth, groupId) {
    const { role } = auth.user;
    if (role === 'admin') return { by: auth.user.id };
    if (role !== 'teacher') fail('FORBIDDEN', 'Недостаточно прав');
    const teacher = ctx.db.teachers.find((t) => t.userId === auth.user.id);
    const teaches = teacher && ctx.db.lessons.some((l) => l.groupId === groupId && l.teacherId === teacher.id);
    if (groupId && !teaches) fail('FORBIDDEN', 'Вы не ведёте занятия в этой группе');
    return { by: teacher?.id || auth.user.id };
  }

  const groupOfStudent = (ctx, sid) => core.studentById(ctx.db, sid)?.groupId;
  const groupOfLesson = (ctx, id) => core.byId(ctx.db.lessons, id)?.groupId;

  function login(ctx, _auth, { login: loginName, password } = {}) {
    if (typeof loginName !== 'string' || typeof password !== 'string' || !loginName.trim() || !password) fail('VALIDATION', 'Введите логин и пароль');
    const key = loginName.trim().toLowerCase();
    const attempts = (ctx.db.loginAttempts[key] ||= { count: 0, lockedUntil: null });
    const nowMs = ctx.now().getTime();
    if (attempts.lockedUntil && attempts.lockedUntil > nowMs) {
      ctx.dirty = false;
      fail('RATE_LIMIT', `Слишком много попыток. Повторите через ${Math.ceil((attempts.lockedUntil - nowMs) / 1000)} с`, { retryAfter: Math.ceil((attempts.lockedUntil - nowMs) / 1000) });
    }
    const user = ctx.db.users.find((u) => u.login.toLowerCase() === key && !u.disabled);
    const digest = hashPassword(password, user ? user.salt : 'no-such-user');
    if (!user || !safeEqual(digest, user.hash)) {
      attempts.count += 1;
      if (attempts.count >= MAX_ATTEMPTS) { attempts.lockedUntil = nowMs + LOCK_MS; attempts.count = 0; }
      ctx.dirty = true; // persist the failed attempt
      fail('UNAUTHENTICATED', 'Неверный логин или пароль');
    }
    delete ctx.db.loginAttempts[key];
    ctx.db.sessions = ctx.db.sessions.filter((s) => parseStamp(s.expiresAt) > ctx.now());
    const token = randomHex(24);
    ctx.db.sessions.push({ key: tokenKey(token), userId: user.id, createdAt: stamp(ctx.now()), expiresAt: stamp(new Date(nowMs + SESSION_TTL_MS)) });
    ctx.dirty = true;
    return { token, user: { id: user.id, name: user.name, role: user.role } };
  }

  /* ---------- method table ---------- */
  const student = (fn, write = false) => ({ write, run: (ctx, auth, args) => fn(ctx, requireStudent(ctx, auth), args || {}, auth) });
  const staff = (fn, groupFrom) => ({
    write: true,
    run: (ctx, auth, args) => {
      if (auth.user.role !== 'teacher' && auth.user.role !== 'admin') fail('FORBIDDEN', 'Недостаточно прав'); // role first, so object existence is never revealed
      const g = groupFrom ? groupFrom(ctx, args || {}) : undefined;
      if (groupFrom && !g) fail('NOT_FOUND', 'Объект не найден');
      return fn(ctx, requireStaff(ctx, auth, g), args || {});
    },
  });

  const anyRole = (fn) => ({ write: true, run: (ctx, auth, args) => fn(ctx, auth, args || {}) });

  /* Teacher/admin read models: the scope (which groups, which subjects) comes from the session only. */
  function scopeFor(ctx, auth) {
    if (auth.user.role !== 'teacher' && auth.user.role !== 'admin') fail('FORBIDDEN', 'Недостаточно прав');
    const scope = sv.scopeOf(ctx.db, auth.user);
    if (auth.user.role === 'teacher' && !scope.teacher) fail('FORBIDDEN', 'Профиль преподавателя не найден');
    return scope;
  }
  const staffRead = (fn) => ({ write: false, run: (ctx, auth, args) => fn(ctx, scopeFor(ctx, auth), args || {}) });
  const teacherOf = (ctx, by) => ctx.db.teachers.find((t) => t.id === by) || null; // null for admins
  /* A teacher marks/changes only own lessons and grades/assigns only own subjects; admins are not restricted. */
  function ownLesson(ctx, by, lessonId) {
    const l = core.byId(ctx.db.lessons, lessonId);
    if (teacherOf(ctx, by) && l && l.teacherId !== by) fail('FORBIDDEN', 'Это занятие ведёт другой преподаватель');
  }
  function ownSubject(ctx, by, subject) {
    const t = teacherOf(ctx, by);
    if (t && !t.subjects.includes(subject)) fail('FORBIDDEN', `Вы не преподаёте предмет «${subject}»`);
  }

  const adminOnly = (fn, write = true) => ({
    write,
    run: (ctx, auth, args) => {
      if (auth.user.role !== 'admin') fail('FORBIDDEN', 'Раздел доступен только администратору');
      return fn(ctx, auth, args || {});
    },
  });
  const studentRow = (ctx, st) => {
    const u = core.byId(ctx.db.users, st.userId);
    return { id: st.id, name: u.name, login: u.login, disabled: u.disabled, groupId: st.groupId, group: core.byId(ctx.db.groups, st.groupId)?.name || '—', phone: st.phone, email: st.email, balance: core.coinSummary(ctx.db, st.id).balance };
  };

  const methods = {
    ping: { public: true, run: () => ({ ok: true }) },
    login: { public: true, run: login },
    logout: {
      write: true,
      run: (ctx, auth) => { ctx.db.sessions = ctx.db.sessions.filter((s) => s.key !== auth.session.key); return { ok: true }; },
    },

    me: student((ctx, sid) => views.me(ctx, sid)),
    overview: student((ctx, sid) => views.overview(ctx, sid)),
    schedule: student((ctx, sid, a) => views.schedule(ctx, sid, a)),
    attendance: student((ctx, sid, a) => views.attendance(ctx, sid, a)),
    performance: student((ctx, sid) => views.performance(ctx, sid)),
    assignments: student((ctx, sid) => ({ items: views.assignmentsFor(ctx, sid), serverNow: stamp(ctx.now()), limits: { maxFiles: core.MAX_FILES, maxFileBytes: core.MAX_FILE_BYTES, extensions: core.ALLOWED_EXT } })),
    achievements: student((ctx, sid) => views.achievements(ctx, sid)),
    coins: student((ctx, sid) => views.coins(ctx, sid)),
    notifications: student((ctx, sid, a) => views.notifications(ctx, sid, a)),
    profile: student((ctx, sid) => views.profile(ctx, sid)),

    submitAssignment: student((ctx, sid, { assignmentId, text, files }) => {
      core.submitAssignment(ctx, sid, assignmentId, { text, files });
      return views.assignmentsFor(ctx, sid).find((a) => a.id === assignmentId);
    }, true),

    downloadFile: student((ctx, sid, { assignmentId, index }) => {
      const sub = core.submissionOf(ctx.db, assignmentId, sid) || fail('NOT_FOUND', 'Файл не найден');
      const f = sub.files[index] || fail('NOT_FOUND', 'Файл не найден');
      return { name: f.name, data: f.data };
    }),

    photo: student((ctx, sid) => ({ data: core.studentById(ctx.db, sid).photo || null })),
    setPhoto: student((ctx, sid, { data }) => { core.studentById(ctx.db, sid).photo = core.validatePhoto(data); return { ok: true }; }, true),
    removePhoto: student((ctx, sid) => { core.studentById(ctx.db, sid).photo = null; return { ok: true }; }, true),

    redeem: student((ctx, sid, { rewardId }) => { core.redeemReward(ctx, sid, rewardId); return views.coins(ctx, sid); }, true),

    markRead: student((ctx, sid, { id, all }) => {
      const uid = core.studentById(ctx.db, sid).userId;
      const mine = ctx.db.notifications.filter((n) => n.userId === uid); // only own notifications can be touched
      if (all === true) mine.forEach((n) => { n.read = true; });
      else {
        const n = mine.find((x) => x.id === id) || fail('NOT_FOUND', 'Уведомление не найдено');
        n.read = true;
      }
      return { unread: mine.filter((n) => !n.read).length };
    }, true),

    updateProfile: student((ctx, sid, { phone, email }) => {
      const st = core.studentById(ctx.db, sid);
      if (typeof phone !== 'string' || !/^\+?[0-9\s()-]{7,20}$/.test(phone.trim())) fail('VALIDATION', 'Введите телефон в формате +998 90 123 45 67');
      if (typeof email !== 'string' || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) fail('VALIDATION', 'Введите корректный email');
      st.phone = phone.trim();
      st.email = email.trim();
      return views.profile(ctx, sid);
    }, true),

    updateSettings: student((ctx, sid, { notify }) => {
      const user = core.byId(ctx.db.users, core.studentById(ctx.db, sid).userId);
      const keys = ['assignment', 'schedule', 'grade', 'coins'];
      if (!notify || typeof notify !== 'object') fail('VALIDATION', 'Некорректные настройки');
      for (const k of keys) {
        if (k in notify) { if (typeof notify[k] !== 'boolean') fail('VALIDATION', 'Некорректные настройки'); user.settings.notify[k] = notify[k]; }
      }
      return { settings: user.settings };
    }, true),

    changePassword: anyRole((ctx, auth, { oldPassword, newPassword }) => {
      const user = auth.user;
      if (typeof oldPassword !== 'string' || typeof newPassword !== 'string') fail('VALIDATION', 'Заполните все поля');
      if (!safeEqual(hashPassword(oldPassword, user.salt), user.hash)) fail('VALIDATION', 'Текущий пароль указан неверно');
      if (!core.passwordOk(newPassword)) fail('VALIDATION', 'Новый пароль: минимум 8 символов, буквы и цифры');
      if (newPassword === oldPassword) fail('VALIDATION', 'Новый пароль должен отличаться от текущего');
      user.salt = randomHex(8);
      user.hash = hashPassword(newPassword, user.salt);
      ctx.db.sessions = ctx.db.sessions.filter((s) => s.userId !== user.id || s.key === auth.session.key); // sign out other devices
      return { ok: true };
    }),

    logoutAll: anyRole((ctx, auth) => { ctx.db.sessions = ctx.db.sessions.filter((s) => s.userId !== auth.user.id || s.key === auth.session.key); return { ok: true }; }),

    /* ----- administrator only ----- */
    'admin.students': adminOnly((ctx) => ({
      items: ctx.db.students.map((st) => studentRow(ctx, st)).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      groups: ctx.db.groups.map((g) => ({ id: g.id, name: g.name })),
    }), false),
    'admin.createStudent': adminOnly((ctx, _a, args) => studentRow(ctx, core.createStudentAccount(ctx, args))),
    'admin.setDisabled': adminOnly((ctx, _a, { studentId, disabled }) => studentRow(ctx, core.setStudentDisabled(ctx, studentId, disabled))),
    'admin.resetPassword': adminOnly((ctx, _a, { studentId, newPassword }) => { core.resetStudentPassword(ctx, studentId, newPassword); return { ok: true }; }),
    'admin.org': adminOnly((ctx) => ({
      teachers: ctx.db.teachers.map((t) => ({ id: t.id, name: t.name, subjects: t.subjects, email: t.email, login: core.byId(ctx.db.users, t.userId)?.login || null })),
      groups: ctx.db.groups.map((g) => ({ id: g.id, name: g.name, courseId: g.courseId, course: core.byId(ctx.db.courses, g.courseId).name, teacherId: g.teacherId, curator: core.byId(ctx.db.teachers, g.teacherId)?.name || '—', students: core.groupStudents(ctx.db, g.id).length, subjects: core.byId(ctx.db.courses, g.courseId).subjects })),
      courses: ctx.db.courses.map((c) => ({ id: c.id, name: c.name, subjects: c.subjects })),
      subjects: [...new Set(ctx.db.courses.flatMap((c) => c.subjects))],
      today: isoDate(ctx.now()),
    }), false),
    'admin.createTeacher': adminOnly((ctx, _a, args) => core.createTeacherAccount(ctx, args)),
    'admin.createGroup': adminOnly((ctx, _a, args) => core.createGroup(ctx, args)),
    'admin.moveStudent': adminOnly((ctx, _a, args) => studentRow(ctx, core.moveStudent(ctx, args))),
    'admin.addLesson': adminOnly((ctx, _a, args) => core.addLesson(ctx, args)),
    'admin.rewards': adminOnly((ctx) => ({
      rewards: ctx.db.rewards.slice().sort((a, b) => a.cost - b.cost),
      redemptions: ctx.db.redemptions.slice().sort((a, b) => b.at.localeCompare(a.at)).map((r) => ({ ...r, student: core.studentName(ctx.db, r.studentId) })),
    }), false),
    'admin.saveReward': adminOnly((ctx, _a, args) => core.saveReward(ctx, args)),
    'admin.resolveRedemption': adminOnly((ctx, _a, args) => core.resolveRedemption(ctx, args)),

    /* ----- staff-only reads (teacher: own groups/lessons/subjects, admin: everything) ----- */
    'staff.me': staffRead((ctx, sc) => sv.me(ctx, sc)),
    'staff.overview': staffRead((ctx, sc) => sv.overview(ctx, sc)),
    'staff.groups': staffRead((ctx, sc) => sv.groups(ctx, sc)),
    'staff.student': staffRead((ctx, sc, a) => sv.student(ctx, sc, a)),
    'staff.lessons': staffRead((ctx, sc, a) => sv.lessons(ctx, sc, a)),
    'staff.lesson': staffRead((ctx, sc, a) => sv.lesson(ctx, sc, a)),
    'staff.grades': staffRead((ctx, sc, a) => sv.grades(ctx, sc, a)),
    'staff.assignments': staffRead((ctx, sc) => sv.assignments(ctx, sc)),
    'staff.assignment': staffRead((ctx, sc, a) => sv.assignment(ctx, sc, a)),
    'staff.file': staffRead((ctx, sc, a) => sv.submissionFile(ctx, sc, a)),

    /* ----- staff-only writes ----- */
    'staff.markAttendance': staff((ctx, { by }, a) => { ownLesson(ctx, by, a.lessonId); return core.markAttendance(ctx, { ...a, by }); }, (ctx, a) => groupOfLesson(ctx, a.lessonId)),
    'staff.markLesson': staff((ctx, { by }, { lessonId, marks }) => {
      ownLesson(ctx, by, lessonId);
      if (!Array.isArray(marks) || !marks.length || marks.length > 100) fail('VALIDATION', 'Нет отметок для сохранения');
      // all-or-nothing: a failing mark throws before anything is persisted
      marks.forEach((m) => core.markAttendance(ctx, { lessonId, studentId: m?.studentId, status: m?.status, reason: m?.reason ?? '', by }));
      return { saved: marks.length };
    }, (ctx, a) => groupOfLesson(ctx, a.lessonId)),
    'staff.addGrade': staff((ctx, { by }, a) => { ownSubject(ctx, by, a.subject); if (typeof a.date === 'string' && a.date > isoDate(ctx.now())) fail('VALIDATION', 'Дата оценки не может быть в будущем'); return core.addGrade(ctx, { ...a, teacherId: by }); }, (ctx, a) => groupOfStudent(ctx, a.studentId)),
    'staff.checkSubmission': staff(
      (ctx, { by }, a) => {
        const sub = core.byId(ctx.db.submissions, a.submissionId);
        ownSubject(ctx, by, core.byId(ctx.db.assignments, sub.assignmentId).subject);
        return core.checkSubmission(ctx, { ...a, by });
      },
      (ctx, a) => groupOfStudent(ctx, core.byId(ctx.db.submissions, a.submissionId)?.studentId),
    ),
    'staff.createAssignment': staff((ctx, { by }, a) => {
      ownSubject(ctx, by, a.subject);
      if (typeof a.dueAt === 'string' && parseStamp(a.dueAt.length === 16 ? `${a.dueAt}:00` : a.dueAt) <= ctx.now()) fail('VALIDATION', 'Срок сдачи должен быть в будущем');
      return core.createAssignment(ctx, { ...a, teacherId: by });
    }, (_c, a) => a.groupId),
    'staff.cancelLesson': staff((ctx, { by }, a) => { ownLesson(ctx, by, a.lessonId); return core.cancelLesson(ctx, a); }, (ctx, a) => groupOfLesson(ctx, a.lessonId)),
    'staff.rescheduleLesson': staff((ctx, { by }, a) => { ownLesson(ctx, by, a.lessonId); return core.rescheduleLesson(ctx, a); }, (ctx, a) => groupOfLesson(ctx, a.lessonId)),
    'staff.broadcast': staff((ctx, _s, a) => core.broadcastMessage(ctx, a), (_c, a) => a.groupId),
    'staff.awardOlympiad': staff((ctx, { by }, a) => core.awardOlympiad(ctx, { ...a, by }), (ctx, a) => groupOfStudent(ctx, a.studentId)),
  };

  /* ---------- entry point ---------- */
  async function call(method, token, args) {
    const def = Object.prototype.hasOwnProperty.call(methods, method) ? methods[method] : null;
    const ctx = { db: null, now, dirty: false };
    try {
      if (!def) fail('NOT_FOUND', 'Неизвестный метод');
      ctx.db = load();
      const auth = def.public ? null : authenticate(ctx, token);
      const data = def.run(ctx, auth, args);
      if (def.write || ctx.dirty) persist(ctx.db); // a failed save is reported to the caller, never swallowed
      return { ok: true, data };
    } catch (e) {
      // only a failed login attempt is persisted on error (brute-force counter)
      if (ctx.dirty && ctx.db && !(e instanceof ApiError && e.code === 'STORAGE')) { try { persist(ctx.db); } catch { /* ignore */ } }
      if (e instanceof ApiError) return { ok: false, error: { code: e.code, message: e.message, ...e.extra }, status: STATUS_BY_CODE[e.code] || 400 };
      console.error('[backend] unexpected error in', method, e);
      return { ok: false, error: { code: 'INTERNAL', message: 'Внутренняя ошибка. Попробуйте ещё раз.' }, status: 500 };
    }
  }

  return { call, reset: () => storage.write('') };
}

export { isDate };
