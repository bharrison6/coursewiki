'use strict';
// Browser checks for the section view explorer. Skips unless Playwright and
// COURSEWIKI_BROWSER_URL are configured (tests/support/browser.cjs). Evidence goes to the OS temp folder.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { browserURL, skip, launch } = require('../../tests/support/browser.cjs');
const M = require('./model.js');
const PAGE = '/engineering-graphics/section-views.html';
const ROOT = '[data-interactive="section-view-explorer"]';

async function open(browser, opts = {}) {
  const page = await browser.newPage({ viewport: opts.viewport || { width: 1280, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.googleapis|ERR_CERT_AUTHORITY_INVALID/.test(m.text() + JSON.stringify(m.location()))) errors.push(m.text()); });
  await page.goto(browserURL.replace(/\/$/, '') + PAGE + (opts.query || ''), { waitUntil: 'networkidle' });
  await page.locator('details').evaluateAll(ns => ns.forEach(n => { n.open = true; }));
  return { page, errors };
}
const ready = page => page.waitForFunction(s => [...document.querySelectorAll(s)].every(n => n.dataset.sveReady === 'true' || n.dataset.sveReady === 'no-3d'), ROOT);

test('section explorer: predict, check, keyboard, 3D, modes, phone, presentation, no-JS and independent roots', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-section-explorer-')), browser = await launch();
  try {
    const { page, errors } = await open(browser);
    await ready(page);
    const root = page.locator(ROOT), live = root.locator('.sve-live');
    assert.equal(await root.getAttribute('data-sve-ready'), 'true', 'WebGL view initialised');
    assert.equal(await root.getAttribute('data-phase'), 'predict', 'opens on the prediction challenge');
    assert.equal(await live.locator('[data-face][role="button"]').count(), 4);
    assert.equal(await live.locator('.sve-hatch').count(), 0, 'blank outline before checking');
    assert.match(await live.locator('[data-sve-readout]').textContent(), /hidden until you check/);

    // Keyboard: select the two cut walls, check, and get them all right.
    for (const n of [2, 4]) { await live.locator('[data-face="' + n + '"][role="button"]').focus(); await page.keyboard.press(n === 2 ? 'Enter' : ' '); }
    assert.equal(await live.locator('[aria-pressed="true"]').count(), 2);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.face), '4', 'focus stays on the region after redraw');
    await page.screenshot({ path: path.join(out, 'bushing-full-predict-selected-light-1280.png'), fullPage: false });
    await live.locator('[data-sve-act="predict"]').click();
    assert.match(await live.locator('.sve-status').textContent(), /^4 of 4 regions right/);
    assert.equal(await live.locator('[data-sve-results] li.is-right').count(), 4);
    await root.screenshot({ path: path.join(out, 'bushing-full-revealed-right-light-1280.png') });
    // A wrong prediction is scored as wrong.
    await live.locator('[data-sve-act="predict"]').click();
    await live.locator('[data-face="3"][role="button"]').focus(); await page.keyboard.press('Enter');
    await live.locator('[data-sve-act="predict"]').click();
    assert.match(await live.locator('.sve-status').textContent(), /^1 of 4 regions right/);
    assert.equal(await live.locator('[data-sve-results] li.is-wrong').count(), 3);
    await root.screenshot({ path: path.join(out, 'bushing-full-revealed-wrong-light-1280.png') });

    // Slider by keyboard; the browser shows exactly the model's hatched area.
    const range = live.locator('[data-sve-range="s"]');
    await range.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(([sel, v]) => document.querySelector(sel).dataset.capArea === v, [ROOT, M.compute('bushing', { mode: 'full', s: -5 }).view.capArea.toFixed(3)]);
    assert.equal(await range.inputValue(), '-5');
    assert.equal(Number(await root.getAttribute('data-cap-area')), Number(M.compute('bushing', { mode: 'full', s: -5 }).view.capArea.toFixed(3)));
    assert.equal(await root.getAttribute('data-phase'), 'explore', 'moving the plane after checking returns to exploring');
    assert.ok(await live.locator('.sve-hatch').count() > 0);

    // 3D: cut solid with real cap faces; keyboard moves the plane without page navigation.
    const scene = live.locator('[data-sve-scene]'), canvas = live.locator('canvas.sve-webgl');
    assert.equal(await root.getAttribute('data-sve-scene'), 'cut');
    assert.ok(Number(await scene.getAttribute('data-cap-triangles')) > 0);
    const url = page.url();
    await canvas.focus(); await page.keyboard.press('PageUp'); await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    assert.equal(page.url(), url, 'canvas keys do not trigger page navigation');
    assert.equal(await range.inputValue(), '-4', 'Page Up moves the plane one millimetre back');
    await page.keyboard.press('Home'); await page.waitForTimeout(50);
    assert.equal(await scene.getAttribute('data-camera-view'), 'orbit');
    await live.locator('[data-sve-view="arrows"]').click(); await page.waitForTimeout(100);
    assert.equal(await scene.getAttribute('data-along-arrows'), 'true', 'looking along the arrows hides the removed piece and plane fill');
    await live.locator('[data-sve-view="orbit"]').click();

    // Three plane positions per part, each with 3D and drawing, light theme.
    for (const part of M.parts) {
      await live.locator('input[value="' + part.id + '"]').check();
      await live.locator('input[value="full"]').check();
      for (const s of [part.plane.min + 4, 0, Math.round(part.plane.max * 0.55)]) {
        await range.fill(String(s)); await range.dispatchEvent('input');
        await page.waitForFunction(([sel, v]) => document.querySelector(sel).dataset.capArea === v, [ROOT, M.compute(part.id, { mode: 'full', s }).view.capArea.toFixed(3)]);
        await page.waitForTimeout(120);
        await live.locator('.sve-work').screenshot({ path: path.join(out, part.id + '-full-s' + s + '-light-1280.png') });
      }
    }
    // Modes: the bracket has no half section, the revolved parts have no offset.
    await live.locator('input[value="bracket"]').check();
    assert.equal(await live.locator('input[value="half"]').isDisabled(), true);
    await live.locator('input[value="offset"]').check();
    assert.equal(await live.locator('.sve-slider[data-leg="a"]').isVisible(), true);
    assert.equal(await live.locator('.sve-slider[data-leg="s"]').isVisible(), false);
    assert.equal(Number(await root.getAttribute('data-cap-area')), Number(M.compute('bracket', { mode: 'offset', a: -10, b: 3 }).view.capArea.toFixed(3)));
    await live.locator('.sve-work').screenshot({ path: path.join(out, 'bracket-offset-light-1280.png') });
    await live.locator('[data-sve-act="flip"]').click();
    assert.match(await live.locator('[data-sve-readout]').textContent(), /reversed left to right/);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(120);
    await live.locator('.sve-work').screenshot({ path: path.join(out, 'bracket-offset-flipped-dark-1280.png') });
    await live.locator('input[value="pulley"]').check(); await live.locator('input[value="half"]').check();
    assert.equal(await live.locator('[data-sve-range="s"]').isDisabled(), true, 'half sections sit on the center lines');
    await page.waitForTimeout(120);
    await live.locator('.sve-work').screenshot({ path: path.join(out, 'pulley-half-flipped-dark-1280.png') });

    // Phone width in both themes.
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: 390, height: 900 });
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      await live.locator('[data-sve-act="reset"]').click(); await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no page overflow at 390px ' + theme);
      assert.equal(await root.evaluate(n => n.scrollWidth <= n.clientWidth), true, 'no mount overflow at 390px ' + theme);
      const small = await live.locator('button, .sve-choice label, input[type="range"]').evaluateAll(ns => ns.filter(n => n.offsetParent && n.getBoundingClientRect().height < 43.5).map(n => n.textContent || n.outerHTML.slice(0, 40)));
      assert.deepEqual(small, [], '44px targets');
      await root.screenshot({ path: path.join(out, 'phone-390-predict-' + theme + '.png') });
    }
    assert.deepEqual(errors, []);
    await page.close();

    // Presentation mode.
    const pres = await open(browser, { query: '?p=section-and-auxiliary-views&present=1', viewport: { width: 1366, height: 768 } });
    await ready(pres.page);
    await pres.page.locator(ROOT).scrollIntoViewIfNeeded();
    await pres.page.screenshot({ path: path.join(out, 'presentation-1366-light.png') });
    assert.equal(await pres.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(pres.errors, []);
    await pres.page.close();

    // Two roots initialised by one loader stay independent.
    const multi = await browser.newPage({ viewport: { width: 1280, height: 1000 } }), merrors = [];
    multi.on('pageerror', e => merrors.push(e.message));
    await multi.route('**/section-view-explorer/demo.js*', r => r.abort());
    await multi.goto(browserURL.replace(/\/$/, '') + PAGE, { waitUntil: 'networkidle' });
    await multi.locator('details').evaluateAll(ns => ns.forEach(n => { n.open = true; }));
    assert.equal(await multi.locator(ROOT + ' [id]').count(), 0, 'static fallback is ID-free');
    const src = await multi.locator('script[src*="/section-view-explorer/demo.js"]').evaluate(n => n.src);
    await multi.evaluate(s => { const a = document.querySelector(s); a.after(a.cloneNode(true)); }, ROOT);
    await multi.unroute('**/section-view-explorer/demo.js*');
    await multi.evaluate(u => { const s = document.createElement('script'); s.src = u + '&two-roots=1'; document.body.append(s); }, src);
    await multi.waitForFunction(s => document.querySelectorAll(s + '[data-sve-ready="true"]').length === 2, ROOT);
    const roots = multi.locator(ROOT);
    await roots.nth(1).locator('input[value="pulley"]').check();
    assert.equal(await roots.nth(0).getAttribute('data-part'), 'bushing');
    assert.equal(await roots.nth(1).getAttribute('data-part'), 'pulley');
    assert.deepEqual(await multi.locator(ROOT + ' [id]').evaluateAll(ns => { const seen = new Set(); return ns.map(n => n.id).filter(id => seen.has(id) || !seen.add(id)); }), [], 'no duplicate ids across roots');
    assert.deepEqual(merrors, []);
    await multi.close();

    // No JavaScript: the worked full section and the other two figures remain.
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } }), np = await ctx.newPage();
    await np.goto(browserURL.replace(/\/$/, '') + PAGE, { waitUntil: 'networkidle' });
    await np.locator('details').evaluateAll(ns => ns.forEach(n => { n.open = true; }));
    const stat = np.locator(ROOT + ' .sve-static');
    assert.equal(await stat.isVisible(), true);
    assert.match(await stat.textContent(), /Worked example: a full section through the flanged bushing/);
    assert.match(await stat.textContent(), /= 920 mm²/);
    assert.equal(await stat.locator('svg.sve-svg').count(), 3);
    await stat.screenshot({ path: path.join(out, 'nojs-static-390-light.png') });
    await ctx.close();
    console.log('PASS evidence: ' + out);
  } finally { await browser.close(); }
});

// Review fix (v2): the result of Check and of the plane controls must be on screen beside the control.
test('section explorer: Check grade and plane changes appear in the viewport at 1280x900 and 390x844', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-section-explorer-viewport-')), browser = await launch();
  try {
    for (const [width, height] of [[1280, 900], [390, 844]]) {
      const { page, errors } = await open(browser, { viewport: { width, height } });
      await ready(page);
      const live = page.locator(ROOT + ' .sve-live');
      const box = loc => loc.evaluate(n => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
      const section = () => live.locator('[data-face]').evaluateAll(ns => ns.reduce((a, n) => { const r = n.getBoundingClientRect(); return { top: Math.min(a.top, r.top), bottom: Math.max(a.bottom, r.bottom) }; }, { top: 1e9, bottom: -1e9 }));
      const seen = (r, what) => assert.ok(r.top >= 0 && r.bottom <= height, width + 'x' + height + ': ' + what + ' on screen ' + JSON.stringify(r));
      await live.locator('.sve-badge').first().scrollIntoViewIfNeeded();
      for (const n of [2, 4]) { const b = await live.locator('.sve-badge').filter({ hasText: new RegExp('^' + n + '\\b') }).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
      await live.locator('[data-sve-act="predict"]').click();
      assert.match(await live.locator('.sve-status').textContent(), /^4 of 4 regions right/);
      seen(await section(), 'graded SECTION A–A after Check'); seen(await box(live.locator('.sve-status')), 'grade after Check');
      assert.equal(await live.locator('.sve-badge.is-right').count(), 4);
      await page.screenshot({ path: path.join(out, 'viewport-' + width + 'x' + height + '-after-check-light.png') });
      const range = live.locator('[data-sve-range="s"]'), before = await page.locator(ROOT).getAttribute('data-cap-area');
      await range.click();
      for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(([s, v]) => document.querySelector(s).dataset.capArea !== v, [ROOT, before]);
      seen(await section(), 'changed SECTION A–A after moving the plane'); seen(await box(range), 'plane slider'); seen(await box(live.locator('.sve-status')), 'status after moving the plane');
      await page.screenshot({ path: path.join(out, 'viewport-' + width + 'x' + height + '-after-plane-keys-light.png') });
      await live.locator('input[value="pulley"]').check(); await live.locator('input[value="half"]').check();
      await live.locator('[data-sve-act="predict"]').click(); await live.locator('[data-sve-act="predict"]').click();
      assert.match(await live.locator('.sve-status').textContent(), /regions right/);
      seen(await section(), 'half section after reveal'); seen(await box(live.locator('.sve-status')), 'grade after reveal');
      await page.screenshot({ path: path.join(out, 'viewport-' + width + 'x' + height + '-pulley-half-revealed-light.png') });
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS evidence: ' + out);
  } finally { await browser.close(); }
});
