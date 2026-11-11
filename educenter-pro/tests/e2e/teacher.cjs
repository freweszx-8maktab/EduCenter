const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5500';
const OUT = process.env.OUT;
const ROUTES = ['overview', 'attendance', 'grades', 'assignments', 'students', 'schedule', 'messages', 'profile'];
const VPS = [[1920, 1080, 'desktop'], [1366, 768, 'laptop'], [768, 1024, 'tablet'], [390, 844, 'm390'], [360, 740, 'm360']];
const results = []; const problems = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };

async function signIn(page, user, pw, url) {
  await page.goto(BASE + '/index.html');
  await page.fill('#login', user); await page.fill('#password', pw);
  await Promise.all([page.waitForURL(url), page.click('#submit')]);
}

(async () => {
  const browser = await chromium.launch();

  /* ---------- crawl: every page at 5 viewports ---------- */
  for (const [w, h, name] of VPS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    if (process.env.THEME) await ctx.addInitScript(`try{localStorage.setItem('educenter.theme','${process.env.THEME}')}catch(e){}`);
    const page = await ctx.newPage(); const errs = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await signIn(page, 'nargiza', 'Teacher#2026', '**/teacher.html');
    for (const r of ROUTES) {
      await page.goto(`${BASE}/teacher.html#/${r}`);
      await page.waitForSelector('#page-title', { timeout: 8000 }).catch(() => problems.push(`${name} ${r}: no #page-title`));
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, err: !!document.querySelector('[data-retry]') }));
      if (m.sw > m.iw + 1) {
        const wide = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 4).map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)));
        problems.push(`${name} ${r}: horizontal overflow ${m.sw}>${m.iw} :: ${wide.join(' | ')}`);
      }
      if (m.err) problems.push(`${name} ${r}: error state`);
      if (['desktop', 'm390'].includes(name)) await page.screenshot({ path: `${OUT}/t-${process.env.THEME || 'light'}-${name}-${r}.png`, fullPage: true });
    }
    if (errs.length) problems.push(`${name}: ${[...new Set(errs)].join(' || ')}`);
    await ctx.close();
  }
  console.log(problems.length ? 'CRAWL PROBLEMS:\n' + problems.join('\n') : 'CRAWL OK (8 pages × 5 viewports)');

  /* ---------- flows ---------- */
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  const txt = (s) => page.locator(s).first().innerText();
  const go = async (id, sel) => { await page.click(`.sidebar [data-nav="${id}"]`); await page.waitForFunction(([id, sel]) => location.hash === '#/' + id && document.querySelector('.nav__link[aria-current="page"]')?.dataset.nav === id && !document.querySelector('.skeleton') && document.querySelector(sel || '#page-title'), [id, sel || null]); };
  const toast = async () => { await page.waitForSelector('.toast'); const t = await txt('.toast'); await page.evaluate(() => document.querySelectorAll('.toast').forEach((x) => x.remove())); return t; };

  await page.goto(BASE + '/teacher.html'); await page.waitForURL('**/index.html**');
  check('unauthenticated teacher.html redirects to login', true);

  // a student must land in the student cabinet, and cannot see teacher pages
  await signIn(page, 'dilshod', 'Student#2026', '**/student.html');
  await page.goto(BASE + '/teacher.html'); await page.waitForURL('**/student.html**');
  check('student opening teacher.html is sent back to the student cabinet', true);
  await page.evaluate(() => sessionStorage.clear());

  await signIn(page, 'nargiza', 'Teacher#2026', '**/teacher.html');
  await page.waitForSelector('#page-title');
  check('teacher login opens teacher cabinet', (await txt('#page-title')).includes('Наргиза'));
  await page.goto(BASE + '/student.html'); await page.waitForURL('**/teacher.html**');
  check('teacher opening student.html is sent to the teacher cabinet', true);
  await page.waitForSelector('#page-title');
  check('sidebar has 8 links', (await page.locator('.sidebar .nav__link').count()) === 8);
  check('tab bar has 4 tabs + menu', (await page.locator('.tabbar a').count()) === 4);

  // attendance: open a finished lesson, mark, save, persist
  await go('attendance', '[data-lesson]');
  const items = page.locator('[data-lesson]');
  let opened = false;
  for (let i = 0; i < await items.count(); i++) {
    await items.nth(i).click(); await page.waitForSelector('.split__detail .mark-row, .split__detail .alert');
    if (await page.locator('.mark-row [data-st]:not([disabled])').count()) { opened = true; break; }
  }
  check('attendance: a finished lesson opens with student rows', opened);
  const rows = await page.locator('.mark-row').count();
  check('attendance: all 7 students listed', rows === 7, `${rows}`);
  await page.click('[data-all]');
  check('attendance: "all present" marks every row', (await page.locator('.mark-row [data-st="present"][aria-pressed="true"]').count()) === 7);
  await page.locator('.mark-row').nth(1).locator('[data-st="absent"]').click();
  await page.locator('.mark-row').nth(1).locator('[data-reason]').fill('Болезнь');
  check('attendance: reason field appears for absence', (await page.locator('.mark-row').nth(1).locator('[data-reason]').inputValue()) === 'Болезнь');
  await page.click('[data-save]');
  check('attendance: save confirms', (await toast()).includes('Сохранено'));
  await page.reload(); await page.waitForSelector('.mark-row');
  const st1 = await page.locator('.mark-row').nth(1).locator('[data-st="absent"]').getAttribute('aria-pressed');
  check('attendance: marks persist after reload', st1 === 'true');

  // grades
  await go('grades', '[data-add]');
  await page.click('[data-add]'); await page.waitForSelector('.modal');
  await page.click('.modal [type=submit]');
  check('grades: empty form shows validation inside dialog', (await txt('.modal [data-err]')).length > 3);
  await page.fill('#g-title', 'E2E quiz'); await page.fill('#g-score', '93'); await page.fill('#g-max', '100');
  await page.click('.modal [type=submit]');
  check('grades: grade saved', (await toast()).includes('Оценка выставлена'));
  await page.waitForFunction(() => document.body.innerText.includes('E2E quiz'));
  check('grades: new grade visible in table', true);

  // assignments: create
  await go('assignments', '[data-new]');
  await page.click('[data-new]'); await page.waitForSelector('.modal');
  await page.fill('#a-t', 'E2E homework'); await page.fill('#a-d', 'Do exercises 1-5');
  await page.click('.modal [type=submit]');
  check('assignments: created', (await toast()).includes('Задание выдано'));
  await page.waitForFunction(() => document.querySelector('.split__detail')?.innerText.includes('E2E homework'));
  check('assignments: new assignment opens with student rows', (await page.locator('.split__detail .detail__section').count()) >= 7);

  // students + olympiad
  await go('students', '[data-open]');
  await page.locator('[data-open]').first().click(); await page.waitForSelector('[data-olymp]');
  await page.click('[data-olymp]'); await page.waitForSelector('.modal');
  await page.fill('#o-t', 'Regional Olympiad'); await page.click('.modal [type=submit]');
  check('students: olympiad recorded', (await toast()).includes('30 EduCoins'));

  // schedule: cancel an upcoming lesson
  await go('schedule', '[data-week]');
  await page.click('[data-week="1"]'); await page.waitForTimeout(300);
  const cancel = page.locator('[data-cancel]').first();
  if (await cancel.count()) {
    await cancel.click(); await page.waitForSelector('.modal');
    await page.fill('#c-n', 'Болезнь преподавателя'); await page.click('.modal [type=submit]');
    check('schedule: lesson cancelled', (await toast()).includes('отменено'));
    await page.waitForFunction(() => document.body.innerText.includes('Отменено'));
  } else check('schedule: lesson cancelled', false, 'no upcoming lesson found next week');

  // messages
  await go('messages', '#msg');
  await page.click('#msg [type=submit]');
  check('messages: empty form is rejected', (await txt('#msg [data-err]')).length > 3);
  await page.fill('#m-t', 'Тест'); await page.fill('#m-b', 'Проверка рассылки');
  await page.click('#msg [type=submit]'); await page.waitForSelector('.modal'); await page.click('.modal [data-x="ok"]');
  check('messages: sent after confirmation', (await toast()).includes('отправлено'));

  // the student sees what the teacher did
  const s = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  // (separate context = separate localStorage in local mode, so this check is meaningful only against the Node server)
  await s.close();

  // profile: theme
  await go('profile', '[data-theme-set]');
  await page.click('[data-theme-set="dark"]');
  check('profile: dark theme applies', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await page.click('[data-theme-set="light"]');

  check('no console errors/warnings during flows', errs.length === 0, [...new Set(errs)].join(' | '));
  console.log(results.join('\n'));
  await browser.close();
})();
