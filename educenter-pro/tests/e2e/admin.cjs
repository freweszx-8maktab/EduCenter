const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5500';
const OUT = process.env.OUT;
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  const txt = (s) => page.locator(s).first().innerText();
  const toast = async () => { await page.waitForSelector('.toast'); const t = await txt('.toast'); await page.evaluate(() => document.querySelectorAll('.toast').forEach((x) => x.remove())); return t; };
  const signIn = async (u, p, url) => { await page.goto(BASE + '/index.html'); await page.fill('#login', u); await page.fill('#password', p); await Promise.all([page.waitForURL(url), page.click('#submit')]); await page.waitForSelector('#page-title'); };
  const signOut = async () => { await page.evaluate(() => sessionStorage.clear()); };
  const go = async (id, sel) => { await page.click(`.sidebar [data-nav="${id}"]`); await page.waitForFunction(([id, sel]) => location.hash === '#/' + id && document.querySelector('.nav__link[aria-current="page"]')?.dataset.nav === id && !document.querySelector('.skeleton') && document.querySelector(sel), [id, sel]); };
  const balance = async () => { await page.goto(BASE + '/student.html#/coins'); await page.waitForSelector('.balance__value'); return Number((await txt('.balance__value')).replace(/\D/g, '')); };

  await signIn('admin', 'Admin#2026', '**/teacher.html');
  check('admin login opens the staff cabinet as administrator', (await txt('.usercard__role')) === 'Администратор');
  check('admin sees 11 sections (8 + accounts, groups, rewards)', (await page.locator('.sidebar .nav__link').count()) === 11);
  await signOut(); await signIn('nargiza', 'Teacher#2026', '**/teacher.html');
  check('teacher does NOT see admin sections', (await page.locator('.sidebar [data-nav="accounts"], .sidebar [data-nav="rewards"]').count()) === 0);
  await page.goto(BASE + '/teacher.html#/accounts'); await page.waitForSelector('.error-state'); await page.waitForTimeout(300);
  check('teacher opening #/accounts gets the not-found page, no admin UI', (await page.locator('[data-new]').count()) === 0 && (await txt('.error-state h3')).length > 0, (await txt('.error-state h3')));
  await signOut();

  await signIn('admin', 'Admin#2026', '**/teacher.html');
  await go('accounts', '[data-new]');
  const n0 = await page.locator('tbody tr').count();
  await page.click('[data-new]'); await page.waitForSelector('.modal');
  await page.click('.modal [type=submit]');
  await page.waitForSelector('.modal [data-err]:not([hidden])');
  check('accounts: empty form is rejected inside the dialog', (await txt('.modal [data-err]')).length > 3);
  await page.fill('#n-name', 'Тест Е2Е'); await page.fill('#n-login', 'e2e.student'); await page.fill('#n-pw', 'weak'); await page.fill('#n-ph', '+998 90 111 22 33'); await page.fill('#n-em', 'e2e@mail.example');
  await page.click('.modal [type=submit]');
  await page.waitForFunction(() => /Пароль/.test(document.querySelector('.modal [data-err]')?.textContent || ''));
  check('accounts: weak password is rejected', (await txt('.modal [data-err]')).includes('Пароль'));
  await page.fill('#n-pw', 'Strong#2026'); await page.click('.modal [type=submit]');
  check('accounts: student created', (await toast()).includes('e2e.student'));
  await page.waitForFunction((n) => document.querySelectorAll('tbody tr').length === n + 1, n0);
  check('accounts: row added to the list', true);

  // the new student can sign in and sees clean empty states, not errors
  await signOut(); await signIn('e2e.student', 'Strong#2026', '**/student.html');
  const routes = ['overview', 'schedule', 'attendance', 'performance', 'assignments', 'coins', 'achievements', 'notifications', 'profile', 'settings'];
  let bad = [];
  for (const r of routes) { await page.goto(`${BASE}/student.html#/${r}`); await page.waitForSelector('#page-title'); await page.waitForTimeout(150); if (await page.locator('[data-retry]').count()) bad.push(r); }
  check('new student: all 10 pages render without error states', bad.length === 0, bad.join(','));

  // disable → the open session is cut, login refused
  await signOut(); await signIn('admin', 'Admin#2026', '**/teacher.html'); await go('accounts', '[data-toggle]');
  await page.fill('#q', 'e2e'); await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
  await page.click('[data-toggle]'); await page.waitForSelector('.modal'); await page.click('.modal [data-x="ok"]');
  check('accounts: disabled', (await toast()).includes('отключён'));
  await page.waitForFunction(() => document.body.innerText.includes('Отключён'));
  await signOut(); await page.goto(BASE + '/index.html'); await page.fill('#login', 'e2e.student'); await page.fill('#password', 'Strong#2026'); await page.click('#submit');
  await page.waitForSelector('#login-alert .alert');
  check('disabled student cannot log in', (await page.url()).includes('index.html'));

  // rewards: create → student redeems → admin cancels → points return
  await signIn('admin', 'Admin#2026', '**/teacher.html'); await go('rewards', '[data-new]');
  await page.click('[data-new]'); await page.waitForSelector('.modal');
  await page.fill('#w-t', 'E2E стикерпак'); await page.fill('#w-c', '10'); await page.fill('#w-s', '3');
  await page.click('.modal [type=submit]'); check('rewards: created', (await toast()).includes('сохранена'));
  await page.waitForFunction(() => document.body.innerText.includes('E2E стикерпак'));
  await signOut(); await signIn('dilshod', 'Student#2026', '**/student.html');
  const b0 = await balance();
  await page.click('[data-tab="shop"]'); await page.waitForSelector('[data-redeem]');
  const card = page.locator('.tile-card', { hasText: 'E2E стикерпак' });
  await card.locator('[data-redeem]').click(); await page.waitForSelector('.modal'); await page.click('.modal [data-x="ok"]'); await toast();
  const b1 = await balance();
  check('student: points spent on redemption', b1 === b0 - 10, `${b0} → ${b1}`);
  await signOut(); await signIn('admin', 'Admin#2026', '**/teacher.html'); await go('rewards', '[data-issue]');
  check('rewards: request appears in the admin queue', (await page.locator('tbody tr', { hasText: 'E2E стикерпак' }).count()) >= 1);
  await page.locator('tbody tr', { hasText: 'E2E стикерпак' }).locator('[data-cancel]').click(); await page.waitForSelector('.modal'); await page.click('.modal [data-x="ok"]');
  check('rewards: cancel confirms refund', (await toast()).includes('возвращены'));
  await signOut(); await signIn('dilshod', 'Student#2026', '**/student.html');
  const b2 = await balance();
  check('student: points returned after cancel', b2 === b0, `${b2} vs ${b0}`);
  check('student: refunded row is labelled', (await page.locator('body').innerText()).toLowerCase().includes('возврат'));


  // organisation: group → teacher → lesson (+ conflict) → move a student → new teacher signs in
  await signOut(); await signIn('admin', 'Admin#2026', '**/teacher.html'); await go('org', '[data-group]');
  const waitErr = async (re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('.modal [data-err]')?.textContent || ''), re.source);
  await page.click('[data-group]'); await page.waitForSelector('.modal'); await page.fill('#g-n', 'E2E группа'); await page.click('.modal [type=submit]');
  check('org: group created', (await toast()).includes('Группа создана'));
  await page.waitForFunction(() => document.body.innerText.includes('E2E группа'));
  await page.click('[data-teacher]'); await page.waitForSelector('.modal'); await page.click('.modal [type=submit]'); await waitErr(/./);
  check('org: teacher form rejects an empty submit', (await txt('.modal [data-err]')).length > 3);
  await page.fill('#t-n', 'E2E Учитель'); await page.fill('#t-l', 'e2e.teacher'); await page.fill('#t-p', 'Teach#2026x'); await page.fill('#t-e', 'e2e.t@mail.example');
  await page.click('.modal [type=submit]'); await waitErr(/предмет/i);
  check('org: at least one subject is required', true);
  await page.check('input[name=subject][value="Grammar"]'); await page.click('.modal [type=submit]');
  check('org: teacher created', (await toast()).includes('Преподаватель создан'));
  await page.waitForFunction(() => document.body.innerText.includes('e2e.teacher'));
  const day = new Date(Date.now() + 10 * 86400000); const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  const fillLesson = async () => { await page.selectOption('#l-g', { label: 'E2E группа' }); await page.selectOption('#l-t', { label: 'E2E Учитель — Grammar' }); await page.selectOption('#l-s', 'Grammar'); await page.fill('#l-d', iso); await page.fill('#l-r', 'E2E9'); };
  await page.click('[data-lesson]'); await page.waitForSelector('.modal'); await fillLesson(); await page.click('.modal [type=submit]');
  check('org: lesson added', (await toast()).includes('Занятие добавлено'));
  await page.click('[data-lesson]'); await page.waitForSelector('.modal'); await fillLesson(); await page.click('.modal [type=submit]'); await waitErr(/Пересечение/);
  check('org: a double-booking is refused inside the dialog', (await txt('.modal [data-err]')).includes('Пересечение'));
  await page.click('.modal [data-x="cancel"]');
  await go('accounts', '[data-move]');
  await page.locator('[data-move]').first().click(); await page.waitForSelector('.modal');
  await page.selectOption('#mv-g', { label: 'E2E группа' }); await page.click('.modal [type=submit]');
  check('accounts: student moved to another group', (await toast()).includes('переведён'));
  await page.waitForFunction(() => document.body.innerText.includes('E2E группа'));
  await signOut(); await signIn('e2e.teacher', 'Teach#2026x', '**/teacher.html');
  check('new teacher gets the teacher cabinet (8 sections, no admin pages)', (await page.locator('.sidebar .nav__link').count()) === 8 && (await txt('.usercard__role')) === 'Преподаватель');
  await go('students', '[data-open]');
  check('new teacher sees the moved student in the new group', (await page.locator('[data-open]').count()) === 1 && (await txt('#main')).includes('E2E группа'));

  check('no console errors/warnings', errs.length === 0, [...new Set(errs)].join(' | '));
  console.log(results.join('\n'));
  await browser.close();
})();
