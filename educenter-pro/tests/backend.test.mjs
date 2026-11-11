import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBackend } from '../js/server/backend.js';
import { sha256, stamp, parseStamp } from '../js/server/util.js';

const NOW = new Date(2026, 10, 4, 12, 0, 0); // Wed 4 Nov 2026 12:00 (fixed → deterministic seed)
function fresh(now = NOW) {
  let raw = ''; const clock = { t: new Date(now) };
  const be = createBackend({ read: () => raw, write: (s) => { raw = s; } }, { now: () => new Date(clock.t) });
  const db = () => JSON.parse(raw);
  const call = async (m, tok, a) => be.call(m, tok, a);
  const ok = async (m, tok, a) => { const r = await be.call(m, tok, a); assert.equal(r.ok, true, `${m}: ${JSON.stringify(r.error)}`); return r.data; };
  const err = async (m, tok, a, code) => { const r = await be.call(m, tok, a); assert.equal(r.ok, false, `${m} should fail`); if (code) assert.equal(r.error.code, code, `${m}: ${r.error.message}`); return r.error; };
  const login = async (u, p) => (await ok('login', null, { login: u, password: p })).token;
  return { be, call, ok, err, login, db, clock };
}

test('sha256 matches node:crypto', () => {
  for (const s of ['', 'abc', 'Привет', 'x'.repeat(1000)]) assert.equal(sha256(s), createHash('sha256').update(s).digest('hex'));
});

test('seed: every EduCoin balance is explained by real operations', async () => {
  const { ok, login, db } = fresh();
  const tok = await login('dilshod', 'Student#2026');
  const coins = await ok('coins', tok);
  const d = db();
  const me = d.students.find((s) => d.users.find((u) => u.id === s.userId).login === 'dilshod');
  const led = d.ledger.filter((l) => l.studentId === me.id);
  const calc = led.reduce((s, l) => s + (l.type === 'earn' ? l.amount : -l.amount), 0);
  assert.equal(coins.balance, calc);
  // every attendance accrual points at a real "present" record
  for (const l of led.filter((x) => x.rule === 'attendance' && x.type === 'earn')) {
    const lessonId = l.base.replace('att:', '');
    assert.equal(d.attendance.find((a) => a.lessonId === lessonId && a.studentId === me.id)?.status, 'present');
  }
  // every assignment accrual points at a checked, on-time submission
  for (const l of led.filter((x) => x.rule === 'assignment' && x.type === 'earn')) {
    const sub = d.submissions.find((s) => s.assignmentId === l.base.replace('hw:', '') && s.studentId === me.id);
    assert.ok(sub && sub.status === 'checked' && !sub.late);
  }
  // +5 per present lesson exactly
  const present = d.attendance.filter((a) => a.studentId === me.id && a.status === 'present').length;
  assert.equal(coins.byRule.attendance, present * 5);
  const ov = await ok('overview', tok);
  assert.equal(ov.stats.coins, coins.balance);
});

test('auth: wrong password, lockout, token required, expiry', async () => {
  const { call, err, ok, clock, login } = fresh();
  await err('login', null, { login: 'dilshod', password: 'nope' }, 'UNAUTHENTICATED');
  await err('login', null, { login: 'ghost', password: 'nope' }, 'UNAUTHENTICATED');
  await err('overview', null, {}, 'UNAUTHENTICATED');
  await err('overview', 'x'.repeat(48), {}, 'UNAUTHENTICATED');
  for (let i = 0; i < 5; i++) await call('login', null, { login: 'madina', password: 'bad' });
  const locked = await err('login', null, { login: 'madina', password: 'Student#2026' }, 'RATE_LIMIT'); // lock is active: even the correct password is refused
  assert.ok(locked.retryAfter > 0 && locked.retryAfter <= 60);
  clock.t = new Date(clock.t.getTime() + 61 * 1000);
  await ok('login', null, { login: 'madina', password: 'Student#2026' });
  const tok = await login('dilshod', 'Student#2026');
  clock.t = new Date(clock.t.getTime() + 9 * 3600 * 1000);
  await err('overview', tok, {}, 'UNAUTHENTICATED');
});

test('permissions: a student can never read or change another student\'s data', async () => {
  const { ok, err, login, db } = fresh();
  const a = await login('dilshod', 'Student#2026');
  const b = await login('madina', 'Student#2026');
  const ca = await ok('coins', a); const cb = await ok('coins', b);
  assert.notEqual(ca.balance, cb.balance);
  const d = db();
  const stB = d.students.find((s) => d.users.find((u) => u.id === s.userId).login === 'madina');
  // spoofing ids in arguments has no effect: the server derives the student from the session
  const spoof = await ok('coins', a, { studentId: stB.id });
  assert.equal(spoof.balance, ca.balance);
  const spoofAtt = await ok('attendance', a, { studentId: stB.id });
  assert.equal(spoofAtt.summary.total, (await ok('attendance', a)).summary.total);
  // others' notifications cannot be marked as read
  const nB = d.notifications.find((n) => n.userId === stB.userId && !n.read) || d.notifications.find((n) => n.userId === stB.userId);
  await err('markRead', a, { id: nB.id }, 'NOT_FOUND');
  // other people's submissions' files are unreachable
  const subB = d.submissions.find((s) => s.studentId === stB.id);
  await err('downloadFile', a, { assignmentId: subB.assignmentId, index: 0 }, 'NOT_FOUND');
  // rating hides other people's full names
  const names = ca.rating.filter((r) => !r.me).map((r) => r.name);
  assert.ok(names.every((n) => /\s\p{L}\.$/u.test(n)), JSON.stringify(names));
});

test('permissions: students cannot call staff operations', async () => {
  const { err, ok, login, db } = fresh();
  const a = await login('dilshod', 'Student#2026');
  const d = db();
  const lesson = d.lessons.find((l) => l.date === '2026-11-02');
  const sid = d.students[0].id;
  await err('staff.markAttendance', a, { lessonId: lesson.id, studentId: sid, status: 'present' }, 'FORBIDDEN');
  await err('staff.addGrade', a, { studentId: sid, subject: 'Grammar', kind: 'test', title: 'x', score: 100, max: 100, date: '2026-11-03' }, 'FORBIDDEN');
  await err('staff.checkSubmission', a, { submissionId: 's1', score: 100 }, 'FORBIDDEN');
  await err('staff.cancelLesson', a, { lessonId: lesson.id }, 'FORBIDDEN');
  await err('staff.awardOlympiad', a, { studentId: sid, title: 'x', date: '2026-11-01' }, 'FORBIDDEN');
  await err('staff.broadcast', a, { groupId: 'gr1', title: 'x', body: 'y' }, 'FORBIDDEN');
  const before = (await ok('coins', a)).balance;
  assert.equal((await ok('coins', a)).balance, before);
  await err('no.such.method', a, {}, 'NOT_FOUND');
  await err('__proto__', a, {}, 'NOT_FOUND');
});

test('staff roles cannot use the student cabinet; teacher is limited to own groups', async () => {
  const { err, ok, login, db } = fresh();
  const t = await login('nargiza', 'Teacher#2026');
  await err('overview', t, {}, 'FORBIDDEN');
  const d = db();
  const lesson = d.lessons.find((l) => l.date === '2026-11-02');
  const student = d.students[0];
  await ok('staff.markAttendance', t, { lessonId: lesson.id, studentId: student.id, status: 'late' });
  await err('staff.broadcast', t, { groupId: 'gr-other', title: 'x', body: 'y' }, 'FORBIDDEN');
});

test('attendance → EduCoins stays consistent when a mark is corrected', async () => {
  const { ok, login, db } = fresh();
  const admin = await login('admin', 'Admin#2026'); const tok = await login('dilshod', 'Student#2026');
  const d = db();
  const me = d.students.find((s) => d.users.find((u) => u.id === s.userId).login === 'dilshod');
  const lesson = d.lessons.filter((l) => l.date <= '2026-11-03' && l.status !== 'cancelled').at(-1);
  const bal = async () => (await ok('coins', tok)).balance;
  const b0 = await bal();
  const cur = d.attendance.find((a) => a.lessonId === lesson.id && a.studentId === me.id);
  assert.equal(cur.status, 'present');
  await ok('staff.markAttendance', admin, { lessonId: lesson.id, studentId: me.id, status: 'absent', reason: '' });
  assert.equal(await bal(), b0 - 5);
  await ok('staff.markAttendance', admin, { lessonId: lesson.id, studentId: me.id, status: 'absent' }); // idempotent
  assert.equal(await bal(), b0 - 5);
  await ok('staff.markAttendance', admin, { lessonId: lesson.id, studentId: me.id, status: 'present' });
  assert.equal(await bal(), b0);
  const a = await ok('attendance', tok);
  assert.ok(a.summary.percent >= 0 && a.summary.percent <= 100);
});

test('attendance validation', async () => {
  const { err, login, db } = fresh();
  const admin = await login('admin', 'Admin#2026');
  const d = db();
  const sid = d.students[0].id;
  const future = d.lessons.find((l) => l.date === '2026-11-06');
  await err('staff.markAttendance', admin, { lessonId: future.id, studentId: sid, status: 'present' }, 'CONFLICT');
  const past = d.lessons.find((l) => l.date === '2026-11-02');
  await err('staff.markAttendance', admin, { lessonId: past.id, studentId: sid, status: 'maybe' }, 'VALIDATION');
  await err('staff.markAttendance', admin, { lessonId: 'L9999', studentId: sid, status: 'present' }, 'NOT_FOUND');
  const a = await err('attendance', await login('dilshod', 'Student#2026'), { month: '2026-13' }, 'VALIDATION');
  assert.ok(a.message);
});

test('homework: on-time earns +10, late earns 0, checked work is locked', async () => {
  const { ok, err, login, db, clock } = fresh();
  const admin = await login('admin', 'Admin#2026'); const tok = await login('dilshod', 'Student#2026');
  const as = await ok('assignments', tok);
  const open = as.items.find((a) => a.state === 'active');
  assert.ok(open, 'seed has an active assignment');
  await err('submitAssignment', tok, { assignmentId: open.id, text: '', files: [] }, 'VALIDATION');
  await err('submitAssignment', tok, { assignmentId: open.id, text: 'x', files: [{ name: 'virus.exe', data: 'AAAA' }] }, 'VALIDATION');
  await err('submitAssignment', tok, { assignmentId: open.id, text: 'x', files: Array(4).fill({ name: 'a.txt', data: 'AAAA' }) }, 'VALIDATION');
  await err('submitAssignment', tok, { assignmentId: open.id, text: 'x'.repeat(5001) }, 'VALIDATION');
  await err('submitAssignment', tok, { assignmentId: open.id, text: 'x', files: [{ name: 'big.pdf', data: 'A'.repeat(1.5 * 1024 * 1024) }] }, 'VALIDATION');
  await err('submitAssignment', tok, { assignmentId: 'h9999', text: 'x' }, 'NOT_FOUND');
  const rule = async (k) => (await ok('coins', tok)).byRule[k];
  const before = await rule('assignment');
  const sub = await ok('submitAssignment', tok, { assignmentId: open.id, text: 'My <b>answer</b>', files: [{ name: 'work.txt', data: Buffer.from('hello').toString('base64') }] });
  assert.equal(sub.state, 'submitted');
  assert.equal(sub.submission.text, 'My <b>answer</b>'); // stored raw, escaped on render
  assert.equal(await rule('assignment'), before); // no coins until checked
  const file = await ok('downloadFile', tok, { assignmentId: open.id, index: 0 });
  assert.equal(Buffer.from(file.data, 'base64').toString(), 'hello');
  const meId = db().students.find((s) => db().users.find((u) => u.id === s.userId).login === 'dilshod').id;
  const subId = db().submissions.find((s) => s.assignmentId === open.id && s.studentId === meId).id;
  await err('staff.checkSubmission', tok, { submissionId: subId, score: 100 }, 'FORBIDDEN'); // student can't grade themselves
  await ok('staff.checkSubmission', admin, { submissionId: subId, score: 92, feedback: 'Great' });
  assert.equal(await rule('assignment'), before + 10);
  await err('staff.checkSubmission', admin, { submissionId: subId, score: 50 }, 'CONFLICT');
  await err('submitAssignment', tok, { assignmentId: open.id, text: 'again' }, 'CONFLICT');
  const checked = (await ok('assignments', tok)).items.find((a) => a.id === open.id);
  assert.equal(checked.state, 'checked'); assert.equal(checked.submission.score, 92);
  // late work
  const overdue = (await ok('assignments', tok)).items.find((a) => a.state === 'overdue');
  const b1 = await rule('assignment');
  const late = await ok('submitAssignment', tok, { assignmentId: overdue.id, text: 'late answer' });
  assert.equal(late.submission.late, true);
  const sid2 = db().submissions.find((s) => s.assignmentId === overdue.id && s.studentId === meId).id;
  await ok('staff.checkSubmission', admin, { submissionId: sid2, score: 80 });
  assert.equal(await rule('assignment'), b1); // late work earns nothing
  void clock;
});

test('excellent test (>=90%) earns +20, a weaker one earns nothing', async () => {
  const { ok, login, db } = fresh();
  const admin = await login('admin', 'Admin#2026'); const tok = await login('madina', 'Student#2026');
  const sid = db().students.find((s) => db().users.find((u) => u.id === s.userId).login === 'madina').id;
  const t = async () => (await ok('coins', tok)).byRule.test;
  const b0 = await t();
  await ok('staff.addGrade', admin, { studentId: sid, subject: 'Grammar', kind: 'test', title: 'Unit test', score: 70, max: 100, date: '2026-11-04' });
  assert.equal(await t(), b0);
  await ok('staff.addGrade', admin, { studentId: sid, subject: 'Grammar', kind: 'test', title: 'Unit test 2', score: 18, max: 20, date: '2026-11-04' });
  assert.equal(await t(), b0 + 20);
  const p = await ok('performance', tok);
  assert.ok(p.history.some((g) => g.title === 'Unit test 2' && g.percent === 90));
});

test('EduCoins shop: cannot overspend, stock decreases, history recorded', async () => {
  const { ok, err, login } = fresh();
  const tok = await login('dilshod', 'Student#2026');
  const c = await ok('coins', tok);
  const dear = c.rewards.find((r) => r.cost > c.balance);
  const cheap = c.rewards.find((r) => r.cost <= c.balance && r.stock !== null);
  assert.ok(dear && cheap);
  await err('redeem', tok, { rewardId: dear.id }, 'CONFLICT');
  await err('redeem', tok, { rewardId: 'rw999' }, 'NOT_FOUND');
  const after = await ok('redeem', tok, { rewardId: cheap.id });
  assert.equal(after.balance, c.balance - cheap.cost);
  assert.equal(after.rewards.find((r) => r.id === cheap.id).stock, cheap.stock - 1);
  assert.equal(after.redemptions[0].rewardId, cheap.id);
  assert.equal(after.ledger[0].type, 'spend');
  // earned total (and therefore rating) is not reduced by spending
  assert.equal(after.earned, c.earned);
});

test('achievements are awarded once and are idempotent', async () => {
  const { ok, login, db } = fresh();
  const tok = await login('dilshod', 'Student#2026');
  const a = await ok('achievements', tok);
  const got = a.items.filter((x) => x.unlocked);
  assert.ok(got.length >= 3 && a.items.some((x) => !x.unlocked));
  const d = db(); const me = d.students.find((s) => d.users.find((u) => u.id === s.userId).login === 'dilshod');
  const ach = d.ledger.filter((l) => l.studentId === me.id && l.rule === 'achievement' && l.type === 'earn');
  assert.equal(ach.length, got.length);
  assert.equal(new Set(ach.map((l) => l.base)).size, ach.length);
  for (const x of got) assert.match(x.achievedAt, /^\d{4}-\d{2}-\d{2}$/);
  for (const x of a.items.filter((i) => !i.unlocked)) assert.ok(x.current < x.target || x.key === 'strong_avg');
});

test('schedule: week navigation, cancelled and rescheduled lessons are exposed', async () => {
  const { ok, err, login } = fresh();
  const tok = await login('dilshod', 'Student#2026');
  const w = await ok('schedule', tok, {});
  assert.equal(w.weekStart, '2026-11-02'); assert.equal(w.days.length, 7);
  const next = await ok('schedule', tok, { weekStart: '2026-11-09' });
  assert.ok(next.changes.some((l) => l.status === 'cancelled'));
  assert.ok(next.changes.some((l) => l.status === 'rescheduled' && l.original));
  await err('schedule', tok, { weekStart: 'garbage' }, 'VALIDATION');
  const ov = await ok('overview', tok);
  assert.ok(ov.nextLesson); assert.ok(ov.changes.length >= 1);
});

test('notifications: created by real events, preferences respected, read state is per user', async () => {
  const { ok, login, db } = fresh();
  const admin = await login('admin', 'Admin#2026'); const tok = await login('dilshod', 'Student#2026');
  const n0 = await ok('notifications', tok);
  assert.ok(n0.counts.assignment && n0.counts.schedule && n0.counts.grade && n0.counts.coins && n0.counts.admin);
  await ok('updateSettings', tok, { notify: { assignment: false } });
  await ok('staff.createAssignment', admin, { groupId: 'gr1', subject: 'Reading', title: 'Muted task', description: 'x', dueAt: '2026-11-10T20:00' });
  const n1 = await ok('notifications', tok);
  assert.equal((n1.counts.assignment || 0), (n0.counts.assignment || 0)); // opted out
  await ok('staff.broadcast', admin, { groupId: 'gr1', title: 'Важно', body: 'Сообщение центра' });
  const n2 = await ok('notifications', tok);
  assert.equal(n2.counts.admin, n0.counts.admin + 1); // admin messages always delivered
  assert.ok(n2.unread > 0);
  await ok('markRead', tok, { all: true });
  assert.equal((await ok('notifications', tok)).unread, 0);
  const other = await login('madina', 'Student#2026');
  assert.ok((await ok('notifications', other)).unread > 0); // untouched
  void db;
});

test('profile & settings validation, password change revokes other sessions', async () => {
  const { ok, err, login } = fresh();
  const tok = await login('dilshod', 'Student#2026'); const tok2 = await login('dilshod', 'Student#2026');
  await err('updateProfile', tok, { phone: 'abc', email: 'a@b.co' }, 'VALIDATION');
  await err('updateProfile', tok, { phone: '+998 90 111 22 33', email: 'not-an-email' }, 'VALIDATION');
  const p = await ok('updateProfile', tok, { phone: '+998 90 111 22 33', email: 'new@mail.example' });
  assert.equal(p.student.phone, '+998 90 111 22 33');
  await err('updateSettings', tok, { notify: { grade: 'yes' } }, 'VALIDATION');
  await err('changePassword', tok, { oldPassword: 'wrong', newPassword: 'Abcdef12' }, 'VALIDATION');
  await err('changePassword', tok, { oldPassword: 'Student#2026', newPassword: 'short1' }, 'VALIDATION');
  await err('changePassword', tok, { oldPassword: 'Student#2026', newPassword: 'onlyletters' }, 'VALIDATION');
  await ok('changePassword', tok, { oldPassword: 'Student#2026', newPassword: 'NewPass2027' });
  await ok('me', tok);
  await err('me', tok2, {}, 'UNAUTHENTICATED');
  await err('login', null, { login: 'dilshod', password: 'Student#2026' }, 'UNAUTHENTICATED');
  await ok('login', null, { login: 'dilshod', password: 'NewPass2027' });
});

test('database never stores plaintext passwords or raw session tokens', async () => {
  const { ok, login } = fresh();
  const tok = await login('dilshod', 'Student#2026');
  await ok('me', tok);
  const { be } = fresh();
  void be;
  const f = fresh(); const t2 = await f.login('dilshod', 'Student#2026');
  const raw = JSON.stringify(f.db());
  assert.ok(!raw.includes('Student#2026') && !raw.includes('Teacher#2026') && !raw.includes('Admin#2026'));
  assert.ok(!raw.includes(t2));
});

test('logout invalidates the session', async () => {
  const { ok, err, login } = fresh();
  const tok = await login('dilshod', 'Student#2026');
  await ok('logout', tok);
  await err('overview', tok, {}, 'UNAUTHENTICATED');
});

test('timestamps helpers round-trip', () => {
  const d = new Date(2026, 0, 5, 7, 8, 9);
  assert.equal(parseStamp(stamp(d)).getTime(), d.getTime());
});

test('profile photo: validated by real file header, private per student, removable', async () => {
  const { ok, err, login } = fresh();
  const a = await login('dilshod', 'Student#2026'); const b = await login('madina', 'Student#2026'); const admin = await login('admin', 'Admin#2026');
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]).toString('base64');
  assert.equal((await ok('me', a)).hasPhoto, false);
  await ok('setPhoto', a, { data: jpeg });
  assert.equal((await ok('me', a)).hasPhoto, true);
  assert.equal((await ok('photo', a)).data, jpeg);
  assert.equal((await ok('photo', b)).data, null); // another student does not see it
  assert.equal((await ok('me', b)).hasPhoto, false);
  await ok('photo', a, { studentId: 'st2' }); // spoofed id is ignored
  for (const bad of ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:text/html;base64,PGI+', 'javascript:alert(1)', 'data:image/png;base64,' + Buffer.from('not really a png').toString('base64'), 'data:image/jpeg;base64,' + 'A'.repeat(200000), 'data:image/jpeg;base64,/9j/"onerror="x', 42, null]) {
    await err('setPhoto', a, { data: bad }, 'VALIDATION');
  }
  assert.equal((await ok('photo', a)).data, jpeg); // failed uploads changed nothing
  await err('setPhoto', admin, { data: jpeg }, 'FORBIDDEN');
  await err('photo', admin, {}, 'FORBIDDEN');
  await ok('removePhoto', a);
  assert.equal((await ok('me', a)).hasPhoto, false);
});

test('teacher cabinet: read models are scoped to own groups, lessons and subjects', async () => {
  const { ok, err, login, db } = fresh();
  const t = await login('nargiza', 'Teacher#2026'); const stu = await login('dilshod', 'Student#2026');
  const me = await ok('staff.me', t);
  assert.equal(me.teacher.id, 't1'); assert.equal(me.groups.length, 1);
  for (const m of ['staff.me', 'staff.overview', 'staff.groups', 'staff.lessons', 'staff.assignments']) await err(m, stu, {}, 'FORBIDDEN'); // students cannot read teacher data
  await err('staff.student', stu, { studentId: 'st1' }, 'FORBIDDEN');
  const g = await ok('staff.groups', t); assert.equal(g.groups[0].list.length, 7);
  await err('staff.student', t, { studentId: 'st-nope' }, 'NOT_FOUND');
  await err('staff.grades', t, { groupId: 'gr-other' }, 'NOT_FOUND');
  // only own lessons are listed (Grammar/Writing), never Reading/Listening taught by colleagues
  const w = await ok('staff.lessons', t, { weekStart: '2026-11-02' });
  const subjects = new Set(w.days.flatMap((d) => d.lessons.map((l) => l.subject)));
  assert.deepEqual([...subjects].sort(), ['Grammar', 'Writing']);
  const d = db();
  const others = d.lessons.find((l) => l.teacherId === 't2' && l.date < '2026-11-04');
  await err('staff.lesson', t, { lessonId: others.id }, 'NOT_FOUND');
  await err('staff.markAttendance', t, { lessonId: others.id, studentId: d.students[0].id, status: 'present' }, 'FORBIDDEN');
  await err('staff.cancelLesson', t, { lessonId: d.lessons.find((l) => l.teacherId === 't3' && l.date > '2026-11-04').id }, 'FORBIDDEN');
  // subject restrictions on grades / assignments
  const sid = d.students[0].id;
  await err('staff.addGrade', t, { studentId: sid, subject: 'Reading', kind: 'class', title: 'x', score: 5, max: 10, date: '2026-11-04' }, 'FORBIDDEN');
  await ok('staff.addGrade', t, { studentId: sid, subject: 'Grammar', kind: 'class', title: 'Quiz', score: 5, max: 10, date: '2026-11-04' });
  await err('staff.addGrade', t, { studentId: sid, subject: 'Grammar', kind: 'class', title: 'Quiz', score: 5, max: 10, date: '2026-11-20' }, 'VALIDATION');
  await err('staff.createAssignment', t, { groupId: 'gr1', subject: 'Listening', title: 'x', dueAt: '2026-11-10T20:00' }, 'FORBIDDEN');
  await err('staff.createAssignment', t, { groupId: 'gr1', subject: 'Grammar', title: 'x', dueAt: '2026-11-01T20:00' }, 'VALIDATION'); // due date in the past
  const a = await ok('staff.createAssignment', t, { groupId: 'gr1', subject: 'Grammar', title: 'Fresh', dueAt: '2026-11-10T20:00' });
  const list = await ok('staff.assignments', t); assert.ok(list.items.some((x) => x.id === a.id));
  assert.ok(list.items.every((x) => ['Grammar', 'Writing'].includes(x.subject)));
  const readingA = d.assignments.find((x) => x.subject === 'Reading');
  await err('staff.assignment', t, { assignmentId: readingA.id }, 'NOT_FOUND');
});

test('teacher cabinet: bulk attendance is all-or-nothing and recalculates EduCoins', async () => {
  const { ok, err, login, db } = fresh();
  const t = await login('nargiza', 'Teacher#2026');
  const d = db();
  const lesson = d.lessons.filter((l) => l.teacherId === 't1' && l.date < '2026-11-04').at(-1);
  const [s1, s2] = d.students;
  const before = d.ledger.length;
  await err('staff.markLesson', t, { lessonId: lesson.id, marks: [{ studentId: s1.id, status: 'absent' }, { studentId: s2.id, status: 'bogus' }] }, 'VALIDATION');
  assert.equal(JSON.stringify(db().attendance), JSON.stringify(d.attendance), 'a failed batch changes nothing');
  assert.equal(db().ledger.length, before);
  await err('staff.markLesson', t, { lessonId: lesson.id, marks: [] }, 'VALIDATION');
  const r = await ok('staff.markLesson', t, { lessonId: lesson.id, marks: [{ studentId: s1.id, status: 'present' }, { studentId: s2.id, status: 'excused', reason: 'Болезнь' }] });
  assert.equal(r.saved, 2);
  const det = await ok('staff.lesson', t, { lessonId: lesson.id });
  assert.equal(det.students.find((x) => x.id === s2.id).reason, 'Болезнь');
  const net = (sid) => db().ledger.filter((l) => l.base === `att:${lesson.id}` && l.studentId === sid).reduce((n, l) => n + (l.type === 'earn' ? l.amount : -l.amount), 0);
  assert.equal(net(s1.id), 5); // present → +5
  assert.equal(net(s2.id), 0); // excused → no points (an earlier credit, if any, is revoked)
});

test('teacher cabinet: review flow, password change for staff, no student impersonation', async () => {
  const { ok, err, login, db } = fresh();
  const t = await login('nargiza', 'Teacher#2026'); const stu = await login('dilshod', 'Student#2026');
  const a = await ok('staff.createAssignment', t, { groupId: 'gr1', subject: 'Grammar', title: 'Review me', dueAt: '2026-11-10T20:00' });
  await ok('submitAssignment', stu, { assignmentId: a.id, text: 'my answer' });
  const det = await ok('staff.assignment', t, { assignmentId: a.id });
  const row = det.rows.find((r) => r.state === 'submitted'); assert.ok(row);
  assert.equal(row.submission.text, 'my answer');
  await ok('staff.checkSubmission', t, { submissionId: row.submission.id, score: 9, max: 10, feedback: 'ok' });
  await err('staff.checkSubmission', t, { submissionId: row.submission.id, score: 5 }, 'CONFLICT');
  assert.equal((await ok('assignments', stu)).items.find((x) => x.id === a.id).submission.score, 9);
  // teacher can change own password; old password stops working
  await err('changePassword', t, { oldPassword: 'wrong', newPassword: 'NewPass#2027' }, 'VALIDATION');
  await ok('changePassword', t, { oldPassword: 'Teacher#2026', newPassword: 'NewPass#2027' });
  await err('login', null, { login: 'nargiza', password: 'Teacher#2026' }, 'UNAUTHENTICATED');
  await ok('login', null, { login: 'nargiza', password: 'NewPass#2027' });
  assert.ok(!JSON.stringify(db()).includes('NewPass#2027'));
});

test('admin: only administrators; accounts are validated, disabled users are signed out', async () => {
  const { ok, err, login, db } = fresh();
  const admin = await login('admin', 'Admin#2026'); const t = await login('nargiza', 'Teacher#2026'); const stu = await login('dilshod', 'Student#2026');
  for (const m of ['admin.students', 'admin.rewards']) { await err(m, t, {}, 'FORBIDDEN'); await err(m, stu, {}, 'FORBIDDEN'); }
  for (const m of ['admin.createStudent', 'admin.setDisabled', 'admin.resetPassword', 'admin.saveReward', 'admin.resolveRedemption']) { await err(m, t, {}, 'FORBIDDEN'); await err(m, stu, {}, 'FORBIDDEN'); }
  const base = { name: 'Тест Тестов', login: 'new.student', password: 'Secret#2026', groupId: 'gr1', phone: '+998 90 111 22 33', email: 'new@mail.example' };
  await err('admin.createStudent', admin, { ...base, login: 'Bad Login!' }, 'VALIDATION');
  await err('admin.createStudent', admin, { ...base, login: 'dilshod' }, 'CONFLICT');
  await err('admin.createStudent', admin, { ...base, password: 'short1' }, 'VALIDATION');
  await err('admin.createStudent', admin, { ...base, groupId: 'nope' }, 'VALIDATION');
  await err('admin.createStudent', admin, { ...base, email: 'x' }, 'VALIDATION');
  const created = await ok('admin.createStudent', admin, base);
  assert.equal(created.balance, 0);
  const tok = await login('new.student', 'Secret#2026');
  assert.equal((await ok('me', tok)).user.name, 'Тест Тестов');
  assert.equal((await ok('overview', tok)).stats.coins, 0); // brand-new account renders without any data
  assert.ok(!JSON.stringify(db()).includes('Secret#2026'));
  // disable → existing session dies at once, login refused; enable → works again
  await ok('admin.setDisabled', admin, { studentId: created.id, disabled: true });
  await err('me', tok, {}, 'UNAUTHENTICATED');
  await err('login', null, { login: 'new.student', password: 'Secret#2026' }, 'UNAUTHENTICATED');
  await ok('admin.setDisabled', admin, { studentId: created.id, disabled: false });
  const tok2 = await login('new.student', 'Secret#2026');
  // reset password → old stops working, sessions dropped
  await err('admin.resetPassword', admin, { studentId: created.id, newPassword: 'weak' }, 'VALIDATION');
  await ok('admin.resetPassword', admin, { studentId: created.id, newPassword: 'Another#2027' });
  await err('me', tok2, {}, 'UNAUTHENTICATED');
  await err('login', null, { login: 'new.student', password: 'Secret#2026' }, 'UNAUTHENTICATED');
  await ok('login', null, { login: 'new.student', password: 'Another#2027' });
  await err('admin.setDisabled', admin, { studentId: 'st-nope', disabled: true }, 'NOT_FOUND');
  await err('admin.setDisabled', admin, { studentId: created.id, disabled: 'yes' }, 'VALIDATION');
});

test('admin: rewards validated; cancelling a redemption refunds points and stock, issuing is final', async () => {
  const { ok, err, login } = fresh();
  const admin = await login('admin', 'Admin#2026'); const stu = await login('dilshod', 'Student#2026');
  await err('admin.saveReward', admin, { title: 'x', cost: 10 }, 'VALIDATION');
  await err('admin.saveReward', admin, { title: 'Стикерпак', cost: -5 }, 'VALIDATION');
  await err('admin.saveReward', admin, { title: 'Стикерпак', cost: 10.5 }, 'VALIDATION');
  await err('admin.saveReward', admin, { title: 'Стикерпак', cost: 10, stock: -1 }, 'VALIDATION');
  const r = await ok('admin.saveReward', admin, { title: 'Стикерпак', description: 'Набор стикеров', cost: 20, stock: 2, active: true });
  assert.ok((await ok('coins', stu)).rewards.some((x) => x.id === r.id)); // visible in the student shop
  await ok('admin.saveReward', admin, { id: r.id, title: 'Стикерпак', cost: 20, stock: 2, active: false });
  assert.ok(!(await ok('coins', stu)).rewards.some((x) => x.id === r.id)); // inactive → hidden
  await ok('admin.saveReward', admin, { id: r.id, title: 'Стикерпак', cost: 20, stock: 2, active: true });
  const before = await ok('coins', stu);
  const red = (await ok('redeem', stu, { rewardId: r.id })).redemptions.find((x) => x.rewardId === r.id && x.status === 'pending');
  const mid = await ok('coins', stu);
  assert.equal(mid.balance, before.balance - 20);
  assert.equal((await ok('admin.rewards', admin)).rewards.find((x) => x.id === r.id).stock, 1);
  await err('admin.resolveRedemption', admin, { id: red.id, action: 'dance' }, 'VALIDATION');
  await ok('admin.resolveRedemption', admin, { id: red.id, action: 'cancel' });
  const after = await ok('coins', stu);
  assert.equal(after.balance, before.balance); // points returned
  assert.equal(after.earned, before.earned); // refund is not counted as earning (rating unaffected)
  assert.equal((await ok('admin.rewards', admin)).rewards.find((x) => x.id === r.id).stock, 2);
  await err('admin.resolveRedemption', admin, { id: red.id, action: 'cancel' }, 'CONFLICT'); // no double refund
  const red2 = (await ok('redeem', stu, { rewardId: r.id })).redemptions.find((x) => x.rewardId === r.id && x.status === 'pending');
  await ok('admin.resolveRedemption', admin, { id: red2.id, action: 'issue' });
  await err('admin.resolveRedemption', admin, { id: red2.id, action: 'cancel' }, 'CONFLICT'); // issued prizes cannot be refunded
  const c = await ok('coins', stu);
  assert.equal(c.balance, before.balance - 20);
  assert.equal(c.redemptions.find((x) => x.id === red2.id).status, 'issued');
});

test('admin: teachers, groups, moving students, lessons with conflict checks', async () => {
  const { ok, err, login, db } = fresh();
  const admin = await login('admin', 'Admin#2026'); const t = await login('nargiza', 'Teacher#2026'); const stu = await login('dilshod', 'Student#2026');
  for (const m of ['admin.org', 'admin.createTeacher', 'admin.createGroup', 'admin.moveStudent', 'admin.addLesson']) { await err(m, t, {}, 'FORBIDDEN'); await err(m, stu, {}, 'FORBIDDEN'); }
  const org = await ok('admin.org', admin);
  assert.equal(org.groups.length, 1); assert.equal(org.teachers.length, 3);
  const tb = { name: 'Новый Учитель', login: 'new.teacher', password: 'Teach#2026x', subjects: ['Grammar'], email: 'nt@mail.example' };
  await err('admin.createTeacher', admin, { ...tb, subjects: [] }, 'VALIDATION');
  await err('admin.createTeacher', admin, { ...tb, subjects: ['Alchemy'] }, 'VALIDATION');
  await err('admin.createTeacher', admin, { ...tb, login: 'nargiza' }, 'CONFLICT');
  await err('admin.createTeacher', admin, { ...tb, password: 'short' }, 'VALIDATION');
  const nt = await ok('admin.createTeacher', admin, tb);
  assert.ok(!['t1', 't2', 't3'].includes(nt.id));
  const ntTok = await login('new.teacher', 'Teach#2026x');
  assert.deepEqual((await ok('staff.me', ntTok)).groups, []); // a teacher without lessons sees nothing, no errors
  assert.deepEqual((await ok('staff.groups', ntTok)).groups, []);
  // groups
  await err('admin.createGroup', admin, { name: 'IELTS B2 · Группа 3', courseId: 'c1', teacherId: nt.id }, 'CONFLICT');
  await err('admin.createGroup', admin, { name: 'Группа X', courseId: 'nope', teacherId: nt.id }, 'VALIDATION');
  const gr = await ok('admin.createGroup', admin, { name: 'IELTS B1 · Группа 1', courseId: 'c1', teacherId: nt.id });
  assert.notEqual(gr.id, 'gr1');
  // moving a student keeps all history
  const sid = db().students[0].id;
  const before = await ok('performance', stu);
  await err('admin.moveStudent', admin, { studentId: sid, groupId: 'gr1' }, 'CONFLICT');
  await err('admin.moveStudent', admin, { studentId: 'nope', groupId: gr.id }, 'NOT_FOUND');
  await ok('admin.moveStudent', admin, { studentId: sid, groupId: gr.id });
  assert.equal((await ok('staff.groups', t)).groups[0].list.some((x) => x.id === sid), false); // teacher of gr1 no longer sees the student
  assert.deepEqual((await ok('performance', stu)).history?.length, before.history?.length);
  // lessons
  const future = '2026-11-20';
  const lb = { groupId: gr.id, teacherId: nt.id, subject: 'Grammar', date: future, start: '10:00', end: '11:30', room: '501' };
  await err('admin.addLesson', admin, { ...lb, subject: 'Speaking' }, 'VALIDATION');           // teacher does not teach it
  await err('admin.addLesson', admin, { ...lb, date: '2026-11-01' }, 'VALIDATION');           // past
  await err('admin.addLesson', admin, { ...lb, end: '09:00' }, 'VALIDATION');                 // end before start
  await err('admin.addLesson', admin, { ...lb, room: '' }, 'VALIDATION');
  await err('admin.addLesson', admin, { ...lb, kind: 'party' }, 'VALIDATION');
  const l = await ok('admin.addLesson', admin, lb);
  await err('admin.addLesson', admin, { ...lb, start: '11:00', end: '12:00' }, 'CONFLICT');  // same teacher overlaps
  await err('admin.addLesson', admin, { ...lb, teacherId: 't1', start: '10:30', end: '11:00' }, 'CONFLICT'); // same room overlaps
  await err('admin.addLesson', admin, { ...lb, teacherId: 't1', room: '502', start: '10:30', end: '11:00' }, 'CONFLICT'); // same group overlaps
  await ok('admin.addLesson', admin, { ...lb, start: '11:30', end: '12:30' });                // back-to-back is fine
  // the new teacher now sees the group and the lesson; the moved student is notified and sees it
  assert.equal((await ok('staff.groups', ntTok)).groups[0].list.length, 1);
  const wk = await ok('staff.lessons', ntTok, { weekStart: '2026-11-16' });
  assert.ok(wk.days.some((d) => d.lessons.some((x) => x.id === l.id)));
  assert.ok(!JSON.stringify(db()).includes('Teach#2026x'));
});
