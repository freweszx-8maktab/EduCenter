const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5500';
const OUT = process.env.OUT;
const ROUTES = ['overview','schedule','attendance','performance','assignments','coins','achievements','notifications','profile','settings'];
const VPS = [[1920,1080,'desktop'],[1366,768,'laptop'],[768,1024,'tablet'],[390,844,'m390'],[360,740,'m360']];
(async () => {
  const browser = await chromium.launch();
  const problems = [];
  for (const [w,h,name] of VPS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    if (process.env.THEME) await ctx.addInitScript(`try{localStorage.setItem('educenter.theme','${process.env.THEME}')}catch(e){}`);
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (['error','warning'].includes(m.type())) errs.push(`[console.${m.type()}] ${m.text()}`); });
    page.on('pageerror', e => errs.push(`[pageerror] ${e.message}`));
    page.on('requestfailed', r => { if (!r.url().includes('/api/call')) errs.push(`[reqfailed] ${r.url()}`); });
    await page.goto(BASE + '/index.html');
    await page.fill('#login', 'dilshod'); await page.fill('#password', 'Student#2026');
    await Promise.all([page.waitForURL('**/student.html'), page.click('#submit')]);
    for (const r of ROUTES) {
      await page.goto(`${BASE}/student.html#/${r}`);
      await page.waitForSelector('#page-title', { timeout: 8000 }).catch(() => problems.push(`${name} ${r}: no #page-title`));
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, h1: document.querySelector('#page-title')?.textContent?.trim(), err: !!document.querySelector('[data-retry]') }));
      if (m.sw > m.iw + 1) {
        const wide = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0,4).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)));
        problems.push(`${name} ${r}: horizontal overflow ${m.sw}>${m.iw} :: ${wide.join(' | ')}`);
      }
      if (m.err) problems.push(`${name} ${r}: error state shown`);
      if (['desktop','m390'].includes(name)) await page.screenshot({ path: `${OUT}/${process.env.THEME || 'light'}-${name}-${r}.png`, fullPage: true });
    }
    if (errs.length) problems.push(`${name}: ${[...new Set(errs)].join(' || ')}`);
    await ctx.close();
  }
  await browser.close();
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'ALL PAGES OK on all viewports');
})();
