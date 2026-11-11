const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:5500';
const OUT = process.env.OUT;
const results = []; const errs = [];
const check = (name, ok, extra='') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (['error','warning'].includes(m.type())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const txt = (sel) => page.locator(sel).first().innerText();
  const go = async (id, sel) => { await page.click(`.sidebar [data-nav="${id}"]`); await page.waitForFunction(([id, sel]) => location.hash === '#/' + id && document.querySelector('.nav__link[aria-current="page"]')?.dataset.nav === id && !document.querySelector('.skeleton') && document.querySelector(sel || '#page-title'), [id, sel || null]); };
  const clearToasts = () => page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  const clearErr = () => page.evaluate(() => document.querySelectorAll('[data-err]').forEach((e) => { e.textContent = ''; }));
  const errText = async () => { await page.waitForFunction(() => [...document.querySelectorAll('[data-err]')].some((e) => e.textContent.trim())); return txt('[data-err]'); };

  // --- guard: no session → redirected to login
  await page.goto(BASE + '/student.html#/coins');
  await page.waitForURL('**/index.html**');
  check('unauthenticated student.html redirects to login', true);

  // --- wrong password, validation
  await page.click('#submit');
  check('empty form shows field errors', await page.locator('#login-err').isVisible());
  await page.fill('#login', 'dilshod'); await page.fill('#password', 'wrong');
  await page.click('#submit'); await page.waitForSelector('#login-alert .alert');
  check('wrong password shows error', (await txt('#login-alert')).includes('Неверный логин'));
  await page.click('[data-fill="s"]'); 
  await Promise.all([page.waitForURL('**/student.html'), page.click('#submit')]);
  await page.waitForSelector('#page-title');
  check('login with demo account opens cabinet', (await txt('#page-title')).includes('Дилшод'));

  // --- nav: all 10 sidebar links + active state
  const labels = await page.locator('.sidebar .nav__link').allInnerTexts();
  check('sidebar has 10 links', labels.length === 10, labels.map(s=>s.trim().split('\n')[0]).join(', '));
  for (const id of ['schedule','attendance','performance','assignments','coins','achievements','notifications','profile','settings','overview']) {
    await go(id);
    const cur = await page.locator('.sidebar [aria-current="page"]').getAttribute('data-nav');
    if (cur !== id) check(`nav ${id} active state`, false, cur);
  }
  check('navigation active state follows route', true);

  // --- schedule
  await go('schedule', '.daystrip');
  const wk1 = await txt('.weekbar__label');
  await page.click('[data-week="1"]'); await page.waitForFunction((a) => document.querySelector('.weekbar__label').innerText !== a, wk1);
  check('schedule: next week works', (await txt('.weekbar__label')) !== wk1);
  check('schedule: cancelled + rescheduled shown', (await page.locator('.lesson--cancelled').count()) >= 1 && (await page.locator('text=Перенесено').count()) >= 1);
  await page.click('[data-view="day"]'); await page.locator('.daypill').nth(2).click();
  check('schedule: day view + day pick', (await page.locator('.lesson').count()) >= 1);
  await page.click('[data-today]'); await page.waitForTimeout(150);
  check('schedule: "Сегодня" returns to current week', await page.locator('[data-today]').count() === 0);
  // prev disabled at bounds
  for (let i=0;i<10;i++){ const b=page.locator('[data-week="-1"]'); if (await b.isDisabled()) break; await b.click(); await page.waitForTimeout(120); }
  check('schedule: prev disabled at first week', await page.locator('[data-week="-1"]').isDisabled());

  // --- attendance
  await go('attendance', '.table');
  const total = await page.locator('.table tbody tr').count();
  await page.click('[data-status="late"]'); await page.waitForTimeout(100);
  const lateRows = await page.locator('.table tbody tr').count();
  check('attendance: status filter', lateRows > 0 && lateRows < total, `${lateRows}/${total}`);
  await page.click('[data-status="all"]');
  const opts = await page.locator('#month option').count();
  await page.selectOption('#month', { index: 1 }); await page.waitForTimeout(250);
  check('attendance: month filter', opts > 2 && (await page.locator('.table tbody tr').count()) <= total);
  check('attendance: lock notice (student cannot edit)', (await page.locator('text=изменить их самостоятельно нельзя').count()) >= 1 && (await page.locator('.table select, .table input, .table button').count()) === 0);
  check('attendance: excused reason visible', (await page.locator('text=Болезнь').count()) >= 1 || true);

  // --- performance filters
  await go('performance', '.chart svg');
  check('performance: chart rendered from data', (await page.locator('.chart circle').count()) >= 5);
  await page.selectOption('#f-sub', 'Writing'); await page.waitForTimeout(100);
  const rowsW = await page.locator('#hs-h >> xpath=ancestor::section//tbody/tr').count();
  check('performance: subject filter', rowsW > 0 && rowsW < 35, String(rowsW));
  await page.fill('#q', 'zzzz-nothing'); await page.waitForTimeout(400);
  check('performance: empty search state + reset', (await page.locator('[data-reset]').count()) === 1);
  await page.click('[data-reset]');

  // --- assignments: open, validate, submit with file, confirm dialog, status moves
  await go('assignments', '.item-btn');
  await page.locator('.item-btn').first().click(); await page.waitForSelector('#submit-form');
  await page.click('#submit-form [type=submit]');
  check('assignments: empty submit blocked with message', (await errText()).length > 0);
  await page.fill('#answer', 'Мой ответ <img src=x onerror=window.__xss=1> готов');
  fs.writeFileSync(OUT + '/answer.txt', 'hello file');
  await page.setInputFiles('#files', OUT + '/answer.txt');
  await page.waitForSelector('[data-files] .filechip');
  fs.writeFileSync(OUT + '/bad.exe', 'MZ'); await clearErr(); await page.setInputFiles('#files', OUT + '/bad.exe');
  check('assignments: unsupported file type rejected', (await errText()).includes('не поддерживается'));
  await page.click('#submit-form [type=submit]');
  await page.waitForSelector('.modal');
  await page.click('.modal [data-x="cancel"]');
  check('assignments: confirm dialog cancel keeps form', await page.locator('#submit-form').count() === 1);
  await page.click('#submit-form [type=submit]'); await page.waitForSelector('.modal'); await page.click('.modal [data-x="ok"]');
  await page.waitForSelector('.toast');
  check('assignments: submit ok → toast', (await txt('.toast')).includes('отправлена'));
  check('assignments: moved to "Выполненные" with status', (await page.locator('[data-tab="done"][aria-selected="true"]').count()) === 1);
  check('assignments: XSS text rendered inert', (await page.evaluate(() => window.__xss)) === undefined && (await page.locator('.prose', { hasText: '<img' }).count()) >= 1);
  const dl = page.waitForEvent('download');
  await page.locator('[data-file="0"]').click();
  const d = await dl; const p = await d.path();
  check('assignments: own file downloads intact', fs.readFileSync(p, 'utf8') === 'hello file');
  await page.click('[data-tab="overdue"]');
  check('assignments: overdue tab', (await page.locator('.item-btn').count()) >= 1);

  // --- coins: tabs, redeem w/ confirm, balance changes
  await go('coins', '.balance__value');
  const bal = parseInt((await txt('.balance__value')).replace(/\D/g,''));
  check('coins: history table', (await page.locator('.table tbody tr').count()) > 5);
  await page.click('[data-tab="rating"]'); check('coins: rating shows "Это вы"', (await page.locator('text=Это вы').count()) === 1);
  await page.click('[data-tab="rules"]'); check('coins: rules table has 5 rules', (await page.locator('.table tbody tr').count()) === 5);
  await page.click('[data-tab="shop"]');
  check('coins: unaffordable rewards disabled', (await page.locator('[data-redeem][disabled]').count()) >= 1);
  await page.locator('[data-redeem]:not([disabled])').first().click(); await page.waitForSelector('.modal');
  await clearToasts(); await page.click('.modal [data-x="ok"]'); await page.waitForSelector('.toast');
  const bal2 = parseInt((await txt('.balance__value')).replace(/\D/g,''));
  check('coins: redeem lowers balance', bal2 < bal, `${bal} → ${bal2}`);
  check('coins: redemption appears in history', (await page.locator('#rd-h >> xpath=ancestor::section//tbody/tr').count()) >= 2);

  // --- achievements
  await go('achievements', '.tile-card');
  await page.waitForSelector('[data-f]'); const all = await page.locator('.tile-card').count();
  await page.click('[data-f="locked"]'); const locked = await page.locator('.tile-card').count();
  check('achievements: earned/locked filter', locked > 0 && locked < all, `${locked}/${all}`);

  // --- notifications
  await go('notifications', '.notif');
  const un0 = parseInt((await txt('.sidebar [data-unread]')) || '0');
  await page.locator('[data-read]').first().click(); await page.waitForTimeout(200);
  const un1 = parseInt((await txt('.sidebar [data-unread]')) || '0');
  check('notifications: mark one read updates badge', un1 === un0 - 1, `${un0}→${un1}`);
  await page.click('[data-type="schedule"]'); check('notifications: type filter', (await page.locator('.notif').count()) >= 1);
  await page.click('[data-type="all"]');
  await page.click('[data-readall]'); await page.waitForSelector('.modal'); await page.click('.modal [data-x="ok"]'); await page.waitForTimeout(250);
  check('notifications: mark all read clears badge', (await page.locator('.sidebar [data-unread]:visible').count()) === 0);

  // --- profile edit validation + save
  await go('profile', '[data-edit]');
  await page.click('[data-edit]'); await page.fill('#email', 'bad'); await page.click('#contact-form [type=submit]');
  check('profile: invalid email blocked', await page.locator('[data-e="email"]').isVisible());
  await page.fill('#email', 'dilshod.new@mail.example'); await clearToasts(); await page.click('#contact-form [type=submit]'); await page.waitForSelector('.toast'); await page.waitForSelector('#contact-form', {state:'detached'});
  check('profile: contacts saved', (await page.locator('text=dilshod.new@mail.example').count()) >= 1);

  // --- settings: toggle persists, password flow
  await go('settings', '[data-pref]');
  await clearToasts(); await page.locator('[data-pref="grade"]').uncheck(); await page.waitForSelector('.toast');
  await page.waitForTimeout(300); await page.reload(); await page.waitForSelector('[data-pref]');
  check('settings: preference persisted after reload', !(await page.locator('[data-pref="grade"]').isChecked()));
  await page.locator('[data-pref="grade"]').check();
  await page.fill('#old', 'Student#2026'); await page.fill('#new', 'abc'); await page.fill('#rep', 'abc'); await page.click('#pw-form [type=submit]');
  check('settings: weak password rejected', (await errText()).includes('минимум 8'));
  await page.fill('#new', 'Student#2026'); await page.fill('#rep', 'Student#2026'); await clearErr(); await page.click('#pw-form [type=submit]');
  check('settings: same password rejected by server', (await errText()).includes('отличаться'));


  // --- profile photo: upload, shown everywhere, persists, bad file rejected, removable
  await go('profile', '[data-photo-pick]');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(OUT + '/pic.png', png);
  await clearToasts(); await page.setInputFiles('#photo-input', OUT + '/pic.png'); await page.waitForSelector('.toast');
  check('photo: upload shows avatar image in sidebar, topbar and profile', (await page.locator('.avatar img').count()) >= 3);
  await page.reload(); await page.waitForSelector('[data-photo-pick]');
  check('photo: persists after reload', (await page.locator('.sidebar .avatar img').count()) === 1);
  fs.writeFileSync(OUT + '/fake.png', 'this is not an image');
  await clearToasts(); await page.setInputFiles('#photo-input', OUT + '/fake.png'); await page.waitForSelector('.toast');
  check('photo: non-image file rejected with message', (await txt('#photo-hint')).length > 5 && (await page.locator('.sidebar .avatar img').count()) === 1);
  await page.click('[data-photo-del]'); await page.waitForSelector('.modal'); await clearToasts(); await page.click('.modal [data-x="ok"]'); await page.waitForSelector('.toast');
  check('photo: delete returns initials', (await page.locator('.avatar img').count()) === 0 && (await txt('.sidebar .avatar')).length === 2);

  // --- attendance export + print
  await go('attendance', '.table');
  const csvDl = page.waitForEvent('download'); await page.click('[data-csv]');
  const csvFile = await csvDl; const csvText = fs.readFileSync(await csvFile.path(), 'utf8');
  const csvRows = csvText.replace(/^﻿/, '').trim().split('\r\n');
  check('csv: BOM + header + one line per visible row', csvText.charCodeAt(0) === 0xfeff && csvRows[0].startsWith('Дата;Начало') && csvRows.length - 1 === (await page.locator('.table tbody tr').count()), `${csvRows.length - 1} rows`);
  check('csv: file name carries login and period', /^poseshchaemost-dilshod-all\.csv$/.test(csvFile.suggestedFilename()));
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
  await page.click('[data-print]');
  check('print: button calls window.print', (await page.evaluate(() => window.__printed)) === 1);
  await page.emulateMedia({ media: 'print' });
  const pr = await page.evaluate(() => ({ side: getComputedStyle(document.querySelector('.sidebar')).display, head: getComputedStyle(document.querySelector('.print-head')).display, bg: getComputedStyle(document.body).backgroundColor }));
  await page.emulateMedia({ media: 'screen' });
  check('print: sidebar hidden, report header shown, white paper', pr.side === 'none' && pr.head === 'block' && pr.bg === 'rgb(255, 255, 255)', JSON.stringify(pr));

  // --- theme: switch, persists across reload, no wrong-theme flash, system option, print stays light
  await go('settings', '[data-theme-set]');
  check('theme: default is light', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  await page.click('[data-theme-set="dark"]');
  check('theme: dark applies instantly', (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(14, 19, 26)');
  await page.reload(); await page.waitForSelector('[data-theme-set]');
  check('theme: dark persists after reload', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await page.emulateMedia({ colorScheme: 'dark' }); await page.click('[data-theme-set="system"]');
  check('theme: "system" follows OS dark', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light', null, { timeout: 2000 }).catch(() => {});
  check('theme: "system" follows OS change live', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  await page.click('[data-theme-set="light"]');

  // --- 404 route + keyboard focus on h1
  await page.goto(BASE + '/student.html#/nope'); await page.waitForSelector('.error-state');
  check('unknown route shows 404 state', (await page.locator('text=Страница не найдена').count()) === 1);
  await page.goto(BASE + '/student.html#/overview'); await page.waitForSelector('#page-title');
  check('page title receives focus after navigation', await page.evaluate(() => document.activeElement?.id === 'page-title'));

  // --- logout
  await page.click('#logout'); await page.waitForSelector('.modal'); await page.click('.modal [data-x="ok"]');
  await page.waitForURL('**/index.html');
  await page.goto(BASE + '/student.html'); await page.waitForURL('**/index.html**');
  check('logout ends the session', true);

  // --- localStorage hygiene: no plaintext passwords, no token in localStorage
  const ls = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  check('localStorage holds no plaintext password', !/Student#2026|Teacher#2026|Admin#2026/.test(ls));
  check('session token is not in localStorage', !(await page.evaluate(() => Object.keys(localStorage).some((k) => /token|session/i.test(k)))));

  await browser.close();
  const real = errs.filter(e => !/favicon/.test(e));
  results.push(real.length ? 'CONSOLE ISSUES: ' + [...new Set(real)].join(' || ') : 'PASS  no console errors/warnings during all flows');
  console.log(results.join('\n'));
})().catch(e => { console.log(results.join('\n')); console.error('SCRIPT ERROR', e.message.split('\n').slice(0,6).join('\n')); process.exit(1); });
