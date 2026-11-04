'use strict';
// Browser checks for laminate-stacking. Skips without Playwright or
// COURSEWIKI_BROWSER_URL (a server over docs/). Evidence goes to the OS temp dir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { browserURL, skip, launch } = require('../../tests/support/browser.cjs');

const PAGE = '/materials-and-processes/fiber-direction-and-stiffness.html';
const MOUNT_END = '<!-- /LAMINATE-STACKING-STATIC -->';

// Web fonts are external; serve them empty so the check does not depend on the network.
async function offlineFonts(context) {
  await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
}
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
  return errors;
}
async function openCard(page) {
  await page.locator('details.xcard:has([data-interactive="laminate-stacking"])').evaluateAll(ns => ns.forEach(n => { n.open = true; }));
}
async function settle(page) {
  let last = -1;
  for (let i = 0; i < 20; i++) { const y = await page.evaluate(() => scrollY); if (y === last) return; last = y; await page.waitForTimeout(50); }
}
const plies = root => root.locator('[data-ls-plies] li .ls-plyname').allTextContents();

test('laminate-stacking: build, rose, quiz, free-panel load, drag/keyboard, themes, phone, no-JS, print', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-laminate-stacking-'));
  const base = browserURL.replace(/\/$/, '');
  const browser = await launch();
  try {
    for (const [theme, width] of [['light', 1280], ['dark', 390], ['light', 390], ['dark', 1280]]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
      await offlineFonts(context);
      const page = await context.newPage();
      const errors = watch(page);
      await page.goto(base + PAGE, { waitUntil: 'networkidle' });
      await openCard(page);
      const root = page.locator('[data-interactive="laminate-stacking"]');
      assert.equal(await root.count(), 1);
      assert.equal(await root.getAttribute('data-ls-ready'), 'true');
      assert.equal(await root.locator('.ls-static').isVisible(), false, 'static hidden on screen when live');
      assert.equal(await page.locator('[data-interactive="fiber-orientation"]').getAttribute('data-fo-ready'), 'true', 'existing module still initialises');

      // One 0 deg ply reproduces the single-ply lesson.
      assert.equal(await root.locator('[data-ls-e0]').textContent(), '40.00 GPa');
      assert.equal(await root.locator('[data-ls-e90]').textContent(), '10.00 GPa');
      const rose0 = await root.locator('[data-ls-rose] .ls-curve-flat').getAttribute('d');

      // Build [0/+45/-45/90] then mirror: quasi-isotropic.
      for (const a of ['45', '-45', '90']) await root.locator(`[data-ls-add="${a}"]`).click();
      assert.notEqual(await root.locator('[data-ls-rose] .ls-curve-flat').getAttribute('d'), rose0, 'stack edit reshapes rose');
      assert.equal(await root.locator('[data-ls-rose] .ls-curve-free').count(), 1, 'unsymmetric shows free-to-curve curve');
      assert.equal(await root.locator('.ls-badge').nth(2).getAttribute('data-on'), 'true', 'A is isotropic even before mirroring');
      await root.locator('[data-ls-mirror]').click();
      assert.equal(await root.locator('[data-ls-plies] li').count(), 8);
      assert.equal(await root.locator('[data-ls-rose] .ls-curve-free').count(), 0, 'symmetric: one curve');
      const e = await Promise.all(['e0', 'e45', 'e90'].map(k => root.locator(`[data-ls-${k}]`).textContent()));
      assert.deepEqual(e, ['20.74 GPa', '20.74 GPa', '20.74 GPa']);
      assert.deepEqual(await root.locator('.ls-badge').evaluateAll(ns => ns.map(n => n.dataset.on)), ['true', 'true', 'true', 'false']);
      await page.screenshot({ path: path.join(out, `qi-${theme}-${width}.png`), fullPage: false });

      // Keyboard reorder on the handle, then pointer drag.
      await root.locator('[data-ls-reset]').click();
      await root.locator('[data-ls-add="90"]').click();
      await root.locator('[data-ls-add="45"]').click();
      assert.deepEqual((await plies(root)).map(t => t.replace(/\s+/g, ' ').trim()), ['1 0° top', '2 90°', '3 +45° bottom']);
      await root.locator('[data-ls-plies] li').first().locator('[data-ls-handle]').focus();
      await page.keyboard.press('ArrowDown');
      assert.deepEqual((await plies(root)).map(t => t.replace(/\s+/g, ' ').trim()), ['1 90° top', '2 0°', '3 +45° bottom'], 'ArrowDown moved ply 1 to position 2');
      assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-ls-handle')), true, 'focus follows the moved ply');
      await root.locator('[data-ls-plies]').evaluate(n => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await settle(page);
      const h = await root.locator('[data-ls-plies] li').nth(0).locator('[data-ls-handle]').boundingBox();
      const last = await root.locator('[data-ls-plies] li').nth(2).boundingBox();
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
      await page.mouse.down();
      await page.mouse.move(h.x + h.width / 2, last.y + last.height / 2 + 4, { steps: 8 });
      await page.mouse.up();
      assert.deepEqual((await plies(root)).map(t => t.replace(/\s+/g, ' ').trim()), ['1 0° top', '2 +45°', '3 90° bottom'], 'drag moved the top ply to the bottom ' + theme + width);

      // Free panel: [0/90] under Nx with zero moment curls; mirrored stays flat; zero load flat.
      await root.locator('[data-ls-try="cross-unsym"]').click();
      assert.equal(await root.locator('[data-ls-out="Nx"]').textContent(), '0.50');
      const ra = await root.locator('[data-ls-read-a]').textContent(), rb = await root.locator('[data-ls-read-b]').textContent();
      assert.match(ra, /κx −7\.87×10⁻⁴/); assert.match(rb, /κx 0 mm⁻¹ · κy 0 mm⁻¹ · κxy 0 mm⁻¹$/);
      assert.equal(await root.locator('[data-ls-sum-a]').textContent(), 'curls, tightest radius ≈ 1271 mm');
      assert.equal(await root.locator('[data-ls-sum-b]').textContent(), 'flat');
      assert.equal(await root.locator('[data-ls-preset]').inputValue(), 'cross-unsym');
      await root.locator('[data-ls-reverse]').click();
      assert.match(await root.locator('[data-ls-read-a]').textContent(), /κx 7\.87×10⁻⁴/, 'reversed order reverses curvature');
      assert.match(await root.locator('[data-ls-read-a]').textContent(), /εx 109\.3 µε/, 'reversed order keeps midplane strain');
      assert.equal(await root.locator('[data-ls-preset]').inputValue(), '', 'preset selector follows the actual stack');
      assert.match(await root.locator('[data-ls-preset] option:checked').textContent(), /Custom: \[90\/0\]/);
      await root.locator('[data-ls-mirror]').click();
      assert.match(await root.locator('[data-ls-preset] option:checked').textContent(), /Custom: \[90\/0\]s/);
      await root.locator('[data-ls-try="angle-unsym"]').click();
      assert.equal(await root.locator('[data-ls-preset]').inputValue(), 'angle-unsym');
      assert.equal(await root.locator('[data-ls-sum-a]').textContent(), 'twists, tightest radius ≈ 2542 mm', 'principal radius uses engineering twist');
      await root.locator('[data-ls-try="cross-unsym"]').click();
      await root.locator('[data-ls-mirror]').click();
      assert.equal(await root.locator('[data-ls-preset]').inputValue(), 'cross-sym', 'mirror of [0/90] selects [0/90]s');
      await root.locator('[data-ls-try="cross-unsym"]').click();
      await root.locator('[data-ls-load="Ny"]').fill('0.5');
      assert.equal(await root.locator('[data-ls-sum-a]').textContent(), 'saddle, tightest radius ≈ 1271 mm');
      assert.equal(await root.locator('[data-ls-validity]').isVisible(), true, 'saddle range from edge midpoints exceeds thickness');
      await root.locator('[data-ls-zero]').click();
      assert.equal(await root.locator('[data-ls-sum-a]').textContent(), 'flat', 'zero load: no spontaneous warp');
      assert.match(await root.locator('[data-ls-panel-cap]').textContent(), /No load \(N = 0, M = 0\): both panels are flat/);
      await root.locator('[data-ls-load="Nx"]').focus();
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
      assert.equal(await root.locator('[data-ls-out="Nx"]').textContent(), '0.20', 'slider is keyboard operable');
      await root.locator('[data-ls-preset]').selectOption('qi-unsym');
      assert.match(await root.locator('.ls-badge').nth(1).textContent(), /held flat, a pull along x or y does not shear it\. This stack is unsymmetric/);
      await root.locator('[data-ls-mirror]').click();
      assert.match(await root.locator('.ls-badge').nth(1).textContent(), /B = 0 as well: a pull along x or y does not shear it, held flat or free/);

      // Prediction: both quasi-isotropic orderings are right; scored per option.
      await root.locator('[data-ls-option="c"] input').check();
      await root.locator('[data-ls-option="d"] input').check();
      await root.locator('[data-ls-check]').click();
      assert.match(await root.locator('[data-ls-quiz-feedback]').textContent(), /^All four judged correctly/);
      assert.equal(await root.locator('[data-ls-multiples] figure').count(), 4);
      await root.locator('[data-ls-option="d"] input').uncheck();
      await root.locator('[data-ls-check]').click();
      assert.match(await root.locator('[data-ls-quiz-feedback]').textContent(), /^3 of 4 judged correctly/);
      await root.locator('[data-ls-load-stack="b"]').click();
      assert.equal(await root.locator('[data-ls-plies] li').count(), 4);

      // Layout: 44 px targets, no overflow, legible SVG text.
      const small = await root.locator('.ls-lab button, .ls-lab select, .ls-lab input[type="range"], .ls-option, .ls-toggle').evaluateAll(ns =>
        ns.filter(n => n.offsetParent !== null).map(n => { const b = n.getBoundingClientRect(); return { t: n.textContent.trim().slice(0, 20), w: b.width, h: b.height }; })
          .filter(b => b.h < 43.5 || b.w < 43.5));
      assert.deepEqual(small, [], 'targets >= 44 px');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no page overflow');
      assert.equal(await root.evaluate(n => n.scrollWidth <= n.clientWidth + 1), true, 'no module overflow');
      // Effective font size = CSS font-size x (rendered SVG width / viewBox width).
      const tiny = await root.locator('.ls-lab svg text').evaluateAll(ns => ns.map(n => { const s = n.ownerSVGElement;
        return { t: n.textContent, px: parseFloat(getComputedStyle(n).fontSize) * s.getBoundingClientRect().width / s.viewBox.baseVal.width }; }).filter(x => x.px < 12));
      assert.deepEqual(tiny, [], 'rendered SVG labels at least 12 px');
      const outside = await root.locator('.ls-lab svg').evaluateAll(svgs => svgs.flatMap(s => { const b = s.getBoundingClientRect();
        return [...s.querySelectorAll('text')].map(t => t.getBoundingClientRect()).filter(r => r.left < b.left - 1 || r.right > b.right + 1).map(r => [r.left, r.right, b.left, b.right]); }));
      assert.deepEqual(outside, [], 'labels stay inside their SVG');
      assert.deepEqual(errors, []);
      await root.screenshot({ path: path.join(out, `lab-${theme}-${width}.png`) });
      await context.close();
    }

    // Action -> visible consequence, after real clicks/focus, with the control
    // scrolled to the middle and to the bottom edge of the viewport.
    for (const [width, height] of [[390, 844], [1280, 900]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      await offlineFonts(context);
      const page = await context.newPage();
      const errors = watch(page);
      await page.goto(base + PAGE, { waitUntil: 'networkidle' });
      await openCard(page);
      const root = page.locator('[data-interactive="laminate-stacking"]');
      // Visible band: below the sticky site header, above the viewport bottom.
      const seen = async sel => root.locator(sel).first().evaluate(n => { const bar = document.querySelector('header.appbar'), top = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
        const r = n.getBoundingClientRect(), vis = Math.min(r.bottom, innerHeight) - Math.max(r.top, top);
        return { frac: vis / Math.min(r.height, innerHeight - top), top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
      // [control, outputs that must be visible with the control centred, outputs that must be
      // visible with the control at the bottom edge (the position Playwright's own auto-scroll
      // often leaves a clicked control in; results are placed above their controls), how]
      const rose = '[data-ls-rose] svg', read = '.ls-read', stat = '[data-ls-status]', stack = '[data-ls-stack] svg';
      const pa = '[data-ls-panel-a] svg', pb = '[data-ls-panel-b] svg', sa = '[data-ls-sum-a]', sb = '[data-ls-sum-b]', cap = '[data-ls-panel-cap]';
      const cases = [
        ['[data-ls-add="90"]', [rose, read, stat, stack], [rose, read], 'click'],
        ['[data-ls-mirror]', [stat, stack], [stat, stack], 'click'],
        ['[data-ls-reverse]', [stat, stack], [stat, stack], 'click'],
        ['[data-ls-plies] li:first-child [data-ls-down]', [stack], [stack], 'click'],
        ['[data-ls-try="angle-unsym"]', [pa, pb, sa, sb, cap], [pa, pb, sa, sb, cap], 'click'],
        ['[data-ls-try="cross-unsym"]', [pa, pb, sa, cap], [pa, pb, sa, cap], 'click'],
        ['[data-ls-load="Nx"]', [pa, sa, cap], [pa, sa, cap], 'key'],
        ['[data-ls-load="Nxy"]', [pa, sa], [pa, sa], 'key'],
        ['[data-ls-zero]', [pa, sa], [pa, sa], 'click']
      ];
      const report = [];
      for (const block of ['center', 'end']) {
        await root.locator('[data-ls-reset]').click();
        await root.locator('[data-ls-add="90"]').click();
        for (const [control, centred, atEnd, how] of cases) {
          // On desktop the rose and readouts sit BESIDE the builder controls (level with them),
          // so with a builder control at the very bottom edge they are below the fold by geometry;
          // only the centred case is required there. The pull panels sit above their controls.
          const besideOnDesktop = width > 800 && /add/.test(control);
          const outputs = block === 'center' ? centred : besideOnDesktop ? [] : atEnd;
          const c = root.locator(control).first();
          await c.evaluate((n, b) => n.scrollIntoView({ block: b, inline: 'nearest', behavior: 'instant' }), block);
          const before = await c.evaluate(n => n.getBoundingClientRect().top);
          if (how === 'click') await c.click(); else { await c.focus(); await page.keyboard.press('ArrowRight'); }
          await settle(page);
          // The control must stay where the learner's pointer or finger is. Content above it may
          // change height (the browser's scroll anchoring compensates); reordering moves focus with
          // the ply, by at most one row.
          const after = await root.locator(control.replace(':first-child', ':nth-child(2)')).first().evaluate(n => n.getBoundingClientRect().top).catch(() => before);
          const jump = Math.abs((control.includes('data-ls-down') ? after : await c.evaluate(n => n.getBoundingClientRect().top)) - before);
          assert.ok(jump <= (control.includes('data-ls-down') ? 64 : 4), 'control stays in place after ' + control + ': moved ' + Math.round(jump) + ' px');
          for (const o of outputs) { const v = await seen(o); if (v.frac < 0.6) report.push(`${width} ${block} ${control} -> ${o} ${JSON.stringify(v)}`); }
        }
        await page.screenshot({ path: path.join(out, `visibility-${width}-${block}.png`) });
      }
      assert.deepEqual(report, [], 'outputs at least 60% visible next to their controls');
      assert.deepEqual(errors, []);
      await context.close();
    }

    // Two independent mounts on one page.
    {
      const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
      await offlineFonts(context);
      await context.route('**' + PAGE, async route => {
        const res = await route.fetch(); let html = await res.text();
        const a = html.indexOf('<div data-interactive="laminate-stacking">');
        const b = html.indexOf('</div>', html.indexOf('</div>', html.indexOf(MOUNT_END)) + 6) + 6;
        html = html.slice(0, b) + html.slice(a, b) + html.slice(b);
        await route.fulfill({ response: res, body: html, headers: { ...res.headers(), 'content-type': 'text/html; charset=utf-8' } });
      });
      const page = await context.newPage();
      const errors = watch(page);
      await page.goto(base + PAGE, { waitUntil: 'networkidle' });
      await openCard(page);
      const roots = page.locator('[data-interactive="laminate-stacking"]');
      assert.equal(await roots.count(), 2);
      await roots.nth(1).locator('[data-ls-add="90"]').click();
      await roots.nth(1).locator('[data-ls-try="angle-unsym"]').click();
      assert.equal(await roots.nth(0).locator('[data-ls-plies] li').count(), 1, 'first mount unaffected');
      assert.equal(await roots.nth(0).locator('[data-ls-out="Nx"]').textContent(), '0.00');
      assert.equal(await roots.nth(1).locator('[data-ls-plies] li').count(), 2);
      const ids = await page.evaluate(() => { const seen = {}; return [...document.querySelectorAll('[id]')].map(n => n.id).filter(id => (seen[id] = (seen[id] || 0) + 1) === 2); });
      assert.deepEqual(ids, [], 'no duplicate DOM ids');
      assert.deepEqual(errors, []);
      await context.close();
    }

    // No JavaScript: the static lesson carries the teaching; print shows it.
    {
      const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
      await offlineFonts(context);
      const page = await context.newPage();
      await page.goto(base + PAGE, { waitUntil: 'networkidle' });
      await openCard(page);
      const root = page.locator('[data-interactive="laminate-stacking"]');
      assert.equal(await root.locator('.ls-lab').count(), 0);
      assert.equal(await root.locator('.ls-static').isVisible(), true);
      assert.equal(await root.locator('.ls-static .ls-rose').count(), 2, 'two static polar plots');
      assert.equal(await root.locator('.ls-static .ls-panel').count(), 2, 'static curl comparison');
      assert.match(await root.locator('.ls-static').textContent(), /20\.74 GPa in every in-plane direction/);
      await page.screenshot({ path: path.join(out, 'nojs-light-390.png'), fullPage: true });
      await context.close();
    }
    {
      const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
      await offlineFonts(context);
      const page = await context.newPage();
      await page.goto(base + PAGE, { waitUntil: 'networkidle' });
      await page.emulateMedia({ media: 'print' });
      const root = page.locator('[data-interactive="laminate-stacking"]');
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      assert.equal(await root.locator('.ls-lab').isVisible(), false, 'live lab hidden in print');
      assert.equal(await root.locator('.ls-static').isVisible(), true, 'static lesson printed');
      await page.pdf({ path: path.join(out, 'page-print.pdf'), format: 'Letter', printBackground: true });
      await context.close();
    }
    console.log('PASS evidence: ' + out);
  } finally { await browser.close(); }
});
