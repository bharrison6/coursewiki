'use strict';
/* Actual generated-site regression. Opt in with COURSEWIKI_BROWSER_URL.
   Requires playwright on Node's module path and its Chromium, or CHROME_PATH.
   Pointer actions use visible coordinates, without driver auto-scrolling. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { browserURL: base, skip, launch } = require('../support/browser.cjs');

function controlsFit() {
  const bench = document.querySelector('.ms-workbench');
  const rect = s => document.querySelector(s)?.getBoundingClientRect();
  const top = rect('.appbar')?.bottom || 0;
  const bottom = Math.min(innerHeight, rect('.seqbar')?.top || innerHeight, rect('.present-exit')?.top || innerHeight);
  const failures = [];
  for (const e of bench.querySelectorAll('button,input,select')) {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const label = e.getAttribute('aria-label') || e.textContent || e.id;
    if (r.top < top || r.bottom > bottom) failures.push(label + ' crosses a fixed bar');
    for (const [x, y] of [[r.left + 4, r.top + 4], [r.right - 4, r.top + 4],
      [r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4], [r.x + r.width / 2, r.y + r.height / 2]]) {
      if (!e.contains(document.elementFromPoint(x, y))) failures.push(label + ' is covered');
    }
  }
  for (const e of bench.querySelectorAll('*')) {
    if (['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1)
      failures.push(e.className + ' has a vertical scroll frame');
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) failures.push('document overflows horizontally');
  return failures;
}

test('expanded milling controls fit and position edits preserve manual scroll', { skip, timeout: 180000 }, async () => {
  const browser = await launch();
  try {
    for (const [width, height] of [[1440, 900], [1366, 768], [375, 844], [390, 844]]) {
      for (const present of [false, true]) for (const theme of ['light', 'dark']) {
        const label = `${width}/${present ? 'presentation' : 'reading'}/${theme}`;
        const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 500,
          hasTouch: width < 500, colorScheme: theme, reducedMotion: theme === 'dark' ? 'reduce' : 'no-preference' });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        await page.addInitScript(t => localStorage.setItem('det:theme', JSON.stringify(t)), theme);
        try {
          await page.goto(base.replace(/\/$/, '') + '/machining/milling-operations.html?p=machining-fundamentals' +
            (present ? '&present=1' : '') + '#simulator-make-the-part-on-the-drawing-then-inspect-it', { waitUntil: 'networkidle' });
          await page.evaluate(() => document.fonts.ready);
          await page.locator('.ms-webgl').waitFor();
          await page.waitForFunction(() => document.querySelector('.ms-view-3d').dataset.renderer === 'webgl2');
          async function click(locator) {
            const r = await locator.boundingBox();
            assert.ok(r, label + ': visible pointer target');
            await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
          }
          async function check(stage) {
            await page.waitForTimeout(100);
            assert.deepEqual(await page.evaluate(controlsFit), [], label + ': ' + stage);
          }
          await check('fresh');
          for (const [kind, choice] of [['End mills', 'Load the end mill Ø6'], ['Drills', 'Load the drill Ø6.6'],
            ['Taps', null], ['Boring head', null], ['Spot and chamfer', null], ['Face mill', null]]) {
            await click(page.locator(`[data-kind="${kind}"]`));
            if (choice) await click(page.getByRole('button', { name: choice, exact: true }));
            else if (kind === 'Taps') await click(page.locator('.ms-chip-btn').first());
            await click(page.locator('[data-ms-compare="target"]'));
            await check(kind);
          }
          // A visible edit should preserve a harmless manual offset, including Tab.
          await page.mouse.move(5, 300); await page.mouse.wheel(0, -15); await page.waitForTimeout(100);
          const before = await page.evaluate(() => scrollY);
          await click(page.locator('.ms-go-in').nth(2));
          await page.keyboard.press('Control+A'); await page.keyboard.type('12.5'); await page.keyboard.press('Tab');
          assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) <= 1, label + ': edit moved the page');
          assert.equal(await page.locator('.ms-go-in').nth(2).inputValue(), '12.5');
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
});
