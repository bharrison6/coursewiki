'use strict';
/* Actual browser regression, opt in against a generated site:
   COURSEWIKI_BROWSER_URL=<site root> node --test --test-concurrency=2 <this file>
   Requires playwright on Node's module path and its Chromium, or CHROME_PATH.
   COURSEWIKI_BROWSER_SOURCE=1 serves this checkout's demo.js in the test browser.
   No model state is injected and operating clicks never use driver auto-scroll. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { browserURL: base, skip, launch } = require('../support/browser.cjs');

test('visible lathe position fields retain scroll, focus, selection and edits', { skip }, async () => {
  const browser = await launch();
  try {
    for (const [width, height] of [[1440, 900], [1366, 768], [375, 844], [390, 844]]) {
      for (const present of [false, true]) for (const theme of ['light', 'dark']) {
        const label = `${width}x${height}/${present ? 'presentation' : 'reading'}/${theme}`;
        const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 500,
          hasTouch: width < 500, colorScheme: theme, reducedMotion: theme === 'dark' ? 'reduce' : 'no-preference' });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        if (process.env.COURSEWIKI_BROWSER_SOURCE) {
          await page.route('**/interactives/turning-simulator/demo.js*', route => route.fulfill({ contentType: 'text/javascript',
            body: fs.readFileSync(path.join(__dirname, '../../interactives/turning-simulator/demo.js'), 'utf8') }));
        }
        try {
          const url = new URL('machining/lathe-operations.html', base.endsWith('/') ? base : base + '/');
          url.search = '?p=machining-fundamentals' + (present ? '&present=1' : '');
          url.hash = 'lathe-simulator-make-the-part-on-the-drawing';
          await page.goto(url.href, { waitUntil: 'networkidle' });
          await page.waitForTimeout(150);
          async function tap(selector) {
            const element = page.locator(selector).first();
            const hit = await element.evaluate(e => {
              const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
              return { x, y, good: r.height > 0 && e.contains(document.elementFromPoint(x, y)) };
            });
            assert.ok(hit.good, label + ' target hit: ' + selector);
            await page.mouse.click(hit.x, hit.y);
          }
          const scroll = () => page.evaluate(() => scrollY);
          async function stationary(y, detail) {
            await page.waitForTimeout(25);
            assert.equal(await scroll(), y, label + ' ' + detail);
          }
          if (width === 1440 && !present && theme === 'light') {
            const ordinary = new URL(url); ordinary.hash = '';
            await page.goto(ordinary.href, { waitUntil: 'networkidle' });
            // Setup through the ordinary disclosure, then a real wheel gesture.
            const summary = page.locator('summary').filter({ hasText: 'Lathe simulator: make the part on the drawing' });
            if (!await summary.evaluate(e => e.parentElement.open)) { await summary.click(); }
            await page.waitForTimeout(150);
            const z = await page.locator('[data-ts-in="z"]').boundingBox();
            await page.mouse.wheel(0, z.y - height / 2); await page.waitForTimeout(150);
            const y = await scroll();
            await tap('[data-ts-in="z"]'); await stationary(y, 'ordinary entry Z click');
            await tap('[data-ts-in="x"]'); await stationary(y, 'ordinary entry X click');
            await page.goto(url.href, { waitUntil: 'networkidle' });
          }
          for (const tool of ['turn', 'knurl', 'thread']) {
            await tap(`[data-ts-tool="${tool}"]`);
            if (tool === 'turn') {
              await tap('[data-ts-turning]'); await page.keyboard.press('End'); await page.keyboard.press('Enter');
              assert.equal(await page.locator('[data-ts-turning]').inputValue(), 'face');
            }
            if (tool === 'thread') {
              await tap('[data-ts-tpi]'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
            }
            const aligned = await scroll();
            await page.mouse.wheel(0, 30); await page.waitForTimeout(100);
            const y = await scroll();
            assert.ok(y - aligned >= 20, label + ' real wheel movement proves the scroll probe');
            for (const axis of tool === 'thread' ? ['z', 'x', 'stop'] : ['z', 'x']) {
              const selector = `[data-ts-in="${axis}"]`;
              for (let i = 0; i < 2; i++) { await tap(selector); await stationary(y, axis + ' pointer click'); }
              await page.keyboard.press('Control+A');
              const selected = await page.locator(selector).evaluate(e => [e.selectionStart, e.selectionEnd, e.value.length]);
              assert.deepEqual(selected, [0, selected[2], selected[2]], label + ' selection');
              await stationary(y, axis + ' select text');
              const value = axis === 'x' ? '1.123' : '-0.234';
              await page.keyboard.type(value); await stationary(y, axis + ' typing/key release');
              assert.equal(await page.locator(selector).inputValue(), value);
              assert.equal(await page.locator(selector).evaluate(e => document.activeElement === e), true);
              await page.keyboard.press('Tab'); await stationary(y, axis + ' tab/blur');
              await page.keyboard.press('Shift+Tab'); await stationary(y, axis + ' shift-tab');
              assert.equal(await page.locator(selector).evaluate(e => document.activeElement === e), true);
            }
            // An intentional tool action still aligns the workspace, including footer clearance.
            await tap('[data-ts-tool="groove"]');
            assert.ok(Math.abs(await scroll() - aligned) <= 1, label + ' explicit action aligns');
          }
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
});
