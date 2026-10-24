// Optional: times how long each screen takes to draw in a real browser, for a TSM, an RSM (whole team) and the admin
// (whole company). Needs Playwright, which is not part of the app; run it where Playwright is installed:
//   node scripts/load-test/measure-ui.cjs http://localhost:8090
// Rough target: every screen under 150 ms, even for the admin's whole-company view.
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://localhost:8080';
(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  for (const [user, viewAs] of [['tsm0', 'me'], ['rsm0', 'team'], ['alec', 'team']]) {
    const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
    await page.goto(base + '/login'); await page.fill('#u', user); await page.fill('#p', 'password12345');
    const t0 = Date.now(); await page.click('#go');
    await page.waitForFunction(() => typeof S !== 'undefined' && S.status === 'ready' && S.raw.appointments.length > 0, null, { timeout: 120000 });
    const loaded = Date.now() - t0;
    await page.evaluate(v => { S.viewAs = v; applyView(); }, viewAs);
    const times = {};
    for (const view of ['week', 'month', 'plan', 'confirm', 'customers']) times[view] = await page.evaluate(v => { S.view = v; const t = performance.now(); render(); return Math.round(performance.now() - t); }, view);
    console.log(`${user.padEnd(5)} (${viewAs}) first load ${loaded} ms, draw ms ${JSON.stringify(times)}`);
    await page.close();
  }
  await browser.close();
})();
