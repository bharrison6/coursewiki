/* Focused browser acceptance for the redesigned interaction surfaces.
   NODE_PATH may point to an existing Playwright install; CHROME_PATH overrides
   Playwright's bundled Chromium. No dependency is shipped with the demo. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const out = process.env.QA_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'acc-winters-ui-'));
  fs.mkdirSync(out, { recursive: true });
  let checks = 0;
  const check = (value, message) => { assert.ok(value, message); checks++; };
  try {
    for (const width of [1280, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [], requests = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
      await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
      check(await page.locator('#howto').isVisible(), `${width}: Guide opens`);
      await page.keyboard.press('Tab');
      check(await page.evaluate(() => !!document.activeElement.closest('#howto')), 'Guide traps focus');
      check(await page.locator('main').evaluate(e => e.inert), 'Background inert');
      await page.keyboard.press('Escape');
      await page.locator('#btn-begin').click();
      for (let i = 0; i < 10; i++) {
        check(await page.locator('#btn-lock').isDisabled(), 'Cannot lock without classification');
        await page.locator('#verdict-btns button').first().click();
        await page.locator('#btn-lock').click();
        check(await page.locator('#reveal-wrap .src').getAttribute('aria-label') !== 'source', 'Named source');
        if (await page.locator('.rv-year').textContent() === '1958') {
          check(await page.locator('.rv-kind').textContent() === 'This was an untimed ambition.', '1958 untimed context');
        }
        await page.locator('#btn-next-card').click();
      }
      check(await page.locator('#scorecard').isVisible(), 'Complete deck reaches scorecard');
      await page.locator('#actnav [data-act="2"]').click();
      check(await page.locator('#tl-year').textContent() === '2026', 'Exclusive timeline boundary displays last included year');
      await page.locator('#tl-back').click();
      check(await page.locator('#tl-detail .ev-label').isVisible(), 'Timeline step selects event');
      const canvas = await page.locator('#tl').boundingBox();
      await page.mouse.move(canvas.x + 5, canvas.y + 5);
      await page.mouse.move(canvas.x + canvas.width + 8, canvas.y + 5);
      check(await page.locator('#tl-detail button').isVisible(), 'Selection survives pointer leaving canvas for Details');
      await page.locator('#tl-detail button').click();
      check(await page.locator('#details .src').count() > 0, 'Event Details has evidence');
      await page.keyboard.press('Escape');
      check(await page.locator('#tl-detail button').evaluate(e => e === document.activeElement), 'Event focus restores');
      await page.locator('#actnav [data-act="3"]').click();
      for (let lens = 0; lens < 5; lens++) {
        await page.locator('#lens-nav button').nth(lens).click();
        check(await page.locator('#lens-nav [aria-pressed="true"]').count() === 1, 'One selected lens');
        check(await page.locator('#anatomy .an-cell').count() === 3, 'Only three era cards rendered');
        for (let era = 0; era < 3; era++) {
          const button = page.locator('#anatomy .an-cell button').nth(era);
          await button.click();
          check(await page.locator('#details-body p').first().textContent(), 'Era explanation exists');
          await page.keyboard.press('Escape');
          check(await button.evaluate(e => e === document.activeElement), 'Era focus restores');
        }
      }
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(out, `comparison-${width}.png`), fullPage: true });
      await page.locator('#actnav [data-act="4"]').click();
      check(await page.locator('#close details[open]').count() === 0, 'Today initially collapsed');
      await page.locator('#close .item summary').first().click();
      check(await page.locator('#close details[open]').count() === 1, 'Single item expands');
      await page.locator('#btn-settings').click();
      await page.locator('#btn-selftest').click();
      check((await page.locator('.st-head').textContent()).includes('all 17 checks pass'), 'Embedded source/deck checks');
      await page.locator('#chk-presenter').check();
      await page.locator('#btn-notes').click();
      check(await page.locator('#notes .guide-scope').isVisible(), 'Canonical notes open');
      await page.keyboard.press('Escape');
      check(await page.locator('#btn-settings').evaluate(e => e === document.activeElement), 'Notes focus returns to Settings trigger');
      await page.locator('#btn-settings').click();
      await page.locator('#btn-reset').click();
      check(await page.locator('#intro').isVisible(), 'Reset returns opening');
      check(await page.locator('body').evaluate(e => e.classList.contains('presenting')), 'Reset preserves projection preference');
      check(await page.locator('.overlay:visible').count() === 0, 'Reset closes overlays');
      await page.locator('#actnav [data-act="3"]').click();
      check(await page.locator('#lens-nav button').first().getAttribute('aria-pressed') === 'true', 'Reset restores first lens');
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no page overflow in presentation mode`);
      check(errors.length === 0, errors.join('\n'));
      check(requests.length === 0, 'Runtime remains offline');
      await page.close();
    }
    console.log(`${checks} browser checks passed at 1280, 390 and 320px. Screenshots: ${out}`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
