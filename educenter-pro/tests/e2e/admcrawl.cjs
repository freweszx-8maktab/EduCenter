const { chromium } = require('playwright');
const BASE = process.env.BASE;
(async () => {
  const b = await chromium.launch(); const probs = [];
  for (const [w, h, n] of [[1920, 1080, 'desktop'], [1366, 768, 'laptop'], [768, 1024, 'tablet'], [390, 844, 'm390'], [360, 740, 'm360']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage(); const errs = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(BASE + '/index.html'); await page.fill('#login', 'admin'); await page.fill('#password', 'Admin#2026');
    await Promise.all([page.waitForURL('**/teacher.html'), page.click('#submit')]);
    for (const r of ['accounts', 'org', 'rewards']) {
      await page.goto(`${BASE}/teacher.html#/${r}`); await page.waitForSelector('#page-title'); await page.waitForTimeout(250);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      if (m.sw > m.iw + 1) probs.push(`${n} ${r}: overflow ${m.sw}>${m.iw}`);
      if (n === 'm360' && r === 'org') { await page.click('[data-lesson]'); await page.waitForSelector('.modal'); const mm = await page.evaluate(() => { const e = document.querySelector('.modal').getBoundingClientRect(); return { r: e.right, iw: innerWidth }; }); if (mm.r > mm.iw + 1) probs.push('modal overflow on 360'); await page.screenshot({ path: process.env.OUT + '/a-lesson-modal-360.png' }); }
    }
    if (errs.length) probs.push(`${n}: ${[...new Set(errs)].join(' | ')}`);
    await ctx.close();
  }
  console.log(probs.length ? 'ADMIN CRAWL PROBLEMS:\n' + probs.join('\n') : 'ADMIN CRAWL OK (3 pages × 5 viewports + modal)');
  await b.close();
})();
