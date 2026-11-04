'use strict';
// Opt-in browser suite: skips unless Playwright and COURSEWIKI_BROWSER_URL are available.
// Evidence (screenshots) goes to the OS temp directory, never the repository.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { browserURL, skip, launch } = require('../../tests/support/browser.cjs');
const ROOT = '[data-interactive="backlash-lost-motion"]';
// The sandboxed browser cannot reach the theme's web-font host; that request is not part of this module.
const ignorable = text => /fonts\.googleapis|fonts\.gstatic|ERR_CERT_AUTHORITY_INVALID|ERR_NAME_NOT_RESOLVED/.test(text);
function pageURL(query) { return browserURL.replace(/\/$/, '') + '/engineering/backlash-and-lost-motion.html' + (query || ''); }
async function open(browser, opts) {
  const context = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 } }, opts || {}));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') { const where = (m.location() || {}).url || ''; if (!ignorable(m.text() + ' ' + where)) errors.push('console: ' + m.text() + ' ' + where); } });
  return { context, page, errors };
}
async function ready(page, query) {
  await page.goto(pageURL(query), { waitUntil: 'networkidle' });
  await page.locator('details.xcard').evaluateAll(ns => ns.forEach(n => { n.open = true; }));
  await page.waitForFunction(sel => { const m = document.querySelector(sel); return m && m.dataset.blReady === 'true' && m.dataset.bl3d; }, ROOT, { timeout: 30000 });
  return page.locator(ROOT).first();
}
const num = async (root, key) => Number(await root.getAttribute('data-bl-' + key));
const scene = async root => root.locator('[data-bl-scene]').evaluate(n => ({ deg: Number(n.dataset.screwDeg), mm: Number(n.dataset.carriageMm), x: Number(n.dataset.screwX) }));

test('backlash lab: 3D nodes, loop, keyboard, tasks, layouts, fallback and independent roots', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-backlash-')), browser = await launch();
  try {
    const { context, page, errors } = await open(browser);
    const root = await ready(page, '?p=everything');
    assert.equal(await root.getAttribute('data-bl3d'), 'ready', 'WebGL scene loaded from the embedded GLB');
    // Default settings are the 3D model's own (lead 5 mm, clearance 1.00 mm): the 3D view is linked.
    assert.equal(await root.getAttribute('data-bl3d-linked'), 'true');
    assert.equal(await root.locator('[data-bl-slot="primary"] canvas.bl-webgl').count(), 1, 'linked 3D sits beside the controls');
    // Drive forward, then reverse: the screw node turns exactly with the handwheel, the carriage node holds.
    await root.locator('[data-bl-turn="10"]').click(); await root.locator('[data-bl-turn="10"]').click();
    const a = await scene(root); assert.equal(await num(root, 'carriage'), 1); assert.equal(a.mm, 1);
    await page.waitForTimeout(80); const shotA = await root.locator('canvas').screenshot();
    const steps = [];
    for (let i = 0; i < 3; i++) { await root.locator('[data-bl-turn="-1"]').click(); steps.push(await scene(root)); }
    const b = steps[2];
    assert.equal(await num(root, 'carriage'), 1, 'carriage holds inside the clearance');
    assert.equal(b.mm, 1, '3D carriage node holds');
    [a].concat(steps).reduce((p, q) => { assert.ok(Math.abs(q.deg - p.deg - 3.6) < 1e-3, '3D screw turns 3.6 degrees per division, as the handwheel does'); return q; });
    assert.equal(a.x, 0); assert.equal(b.x, 0, 'screw node is never translated');
    assert.equal(await root.getAttribute('data-bl-contact'), 'free');
    await page.waitForTimeout(80); assert.equal(shotA.equals(await root.locator('canvas').screenshot()), false, 'rendered pixels change as the screw turns');
    for (let i = 0; i < 17; i++) await root.locator('[data-bl-turn="-1"]').click();
    assert.equal(await root.getAttribute('data-bl-contact'), 'reverse');
    assert.ok(Math.abs(await num(root, 'carriage') - 1) < 1e-9, 'dead band ends after exactly B (20 divisions)');
    const seated = await scene(root); assert.ok(Math.abs(seated.deg - a.deg - 72) < 1e-3, '72 degrees of screw turn with the carriage still');
    await root.locator('[data-bl-turn="-1"]').click();
    assert.ok(Math.abs(await num(root, 'carriage') - 0.95) < 1e-9, 'then the carriage follows the screw');
    assert.ok(Math.abs((await scene(root)).mm - 0.95) < 1e-9);
    assert.equal(Number(await root.locator('.bl-live svg.bl-loop').getAttribute('data-width-mm')), 1, 'loop band is B wide');
    assert.match(await root.locator('[data-bl-out="difference"]').textContent(), /\+1\.00 mm/);
    // Keyboard on the handwheel: arrows and Page keys turn it and do not navigate the playlist.
    const url = page.url(), before = await num(root, 'reading');
    await root.locator('[data-bl-wheel]').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    assert.ok(Math.abs(await num(root, 'reading') - before - 0.1) < 1e-9); await page.keyboard.press('PageDown');
    assert.ok(Math.abs(await num(root, 'reading') - before + 0.4) < 1e-9); assert.equal(page.url(), url, 'no playlist navigation');
    // Pointer drag on the handwheel turns it by whole divisions.
    await root.locator('[data-bl-wheel]').evaluate(n => n.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(100);
    const box = await root.locator('[data-bl-wheel]').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height * 128 / 250, r = box.height * 0.35;
    const r0 = await num(root, 'reading');
    await page.mouse.move(cx, cy - r); await page.mouse.down();
    for (let k = 1; k <= 6; k++) { const t = -k * 6 * Math.PI / 180; await page.mouse.move(cx + r * Math.sin(t), cy - r * Math.cos(t)); }
    await page.mouse.up();
    const dragged = (await num(root, 'reading') - r0) / 0.05;
    assert.ok(Math.abs(dragged - Math.round(dragged)) < 1e-6 && dragged >= 8 && dragged <= 11, 'counter-clockwise drag of 36 degrees turns forward about 10 divisions: ' + dragged);
    // Prediction after earlier manual moves (the reviewer's case): the animated reversal must hold the carriage
    // at 10.00 mm for the whole dead band. Pause and resume hold the state.
    await root.locator('[data-bl-mode="predict"]').click();
    assert.equal(await num(root, 'reading'), 10); assert.equal(await num(root, 'carriage'), 10);
    await root.locator('[data-bl-turn="100"]').click(); await root.locator('[data-bl-turn="-10"]').click(); await root.locator('[data-bl-turn="-1"]').click();
    await root.locator('[data-bl="prediction"]').fill('20'); await root.locator('[data-bl-check]').click();
    const samples = [];
    for (let i = 0; i < 400; i++) {
      samples.push(await root.evaluate(n => ({ r: Number(n.dataset.blReading), c: Number(n.dataset.blCarriage), t: n.querySelector('[data-bl-result]').textContent })));
      if (/Correct|Not quite/.test(samples[samples.length - 1].t)) break;
      if (i === 6) { await root.locator('[data-bl-play]').click(); const held = await num(root, 'reading'); await page.waitForTimeout(120); assert.equal(await num(root, 'reading'), held, 'pause holds'); await root.locator('[data-bl-play]').click(); }
    }
    assert.ok(samples.length > 5, 'animation sampled');
    for (const p of samples) { if (10 - p.r < 1 - 1e-9) assert.equal(p.c, 10, 'carriage still at reading ' + p.r); assert.ok(p.r <= 10 + 1e-9, 'reversal starts from the seated 10.00 mm'); }
    assert.match(await root.locator('[data-bl-result]').textContent(), /^Correct\. .*20 divisions = 72\.0°/);
    assert.ok(Math.abs(await num(root, 'carriage') - 9.8) < 1e-9, 'reversal carried on 4 divisions past the dead band');
    await root.locator('[data-bl="unit"]').selectOption('degrees'); await root.locator('[data-bl="prediction"]').fill('7');
    await root.locator('[data-bl-check]').click();
    await page.waitForFunction(sel => /Not quite/.test(document.querySelector(sel + ' [data-bl-result]').textContent), ROOT);
    await page.screenshot({ path: path.join(out, 'v2-predict-result-1280-light.png'), fullPage: false });
    // Positioning at clearance 0.20 mm: the 3D model unlinks, and the to-scale section takes its place.
    await root.locator('[data-bl="clearance"]').selectOption('0.2');
    assert.equal(await root.getAttribute('data-bl3d-linked'), 'false');
    assert.equal(await root.locator('[data-bl-slot="primary"] svg.bl-section[data-clearance-mm="0.2"]').count(), 1, 'section is the coupled view');
    const frozen = await scene(root); await root.locator('[data-bl-turn="10"]').click(); assert.deepEqual(await scene(root), frozen, 'unlinked model is not remapped');
    // Positioning: reverse straight to the number misses by B; backing past and approaching forward lands.
    await root.locator('[data-bl-mode="position"]').click();
    assert.equal(await num(root, 'reading'), 25.6); assert.equal(await root.locator('[data-bl-record]').isDisabled(), true);
    await root.locator('[data-bl-turn="-10"]').click(); await root.locator('[data-bl-turn="-1"]').click(); await root.locator('[data-bl-turn="-1"]').click();
    assert.equal(await num(root, 'reading'), 25); await root.locator('[data-bl-record]').click();
    assert.ok(Math.abs(await num(root, 'carriage') - 25.2) < 1e-9);
    await root.locator('[data-bl-again]').click(); assert.equal(await num(root, 'reading'), 25.6);
    for (const n of [-10, -10, -1, -1, 10]) await root.locator(`[data-bl-turn="${n}"]`).click();
    assert.equal(await num(root, 'reading'), 25); await root.locator('[data-bl-record]').click();
    assert.equal(await num(root, 'carriage'), 25, 'same-direction approach lands exactly');
    assert.match(await root.locator('[data-bl-result]').textContent(), /differ by 0\.20 mm, exactly B/);
    assert.equal(await root.locator('.bl-live .bl-table tbody tr').count(), 2);
    // Settings: a 1.0 mm clearance on a 2 mm lead re-zeroes; the loop widens; still unlinked; link restores 5 / 1.00.
    await root.locator('[data-bl="clearance"]').selectOption('1'); await root.locator('[data-bl="lead"]').selectOption('2');
    assert.equal(Number(await root.locator('.bl-live svg.bl-loop').getAttribute('data-width-mm')), 1);
    assert.match(await root.locator('.bl-readout').textContent(), /50 div = 180\.0°/);
    assert.equal(await root.getAttribute('data-bl3d-linked'), 'false');
    await root.locator('[data-bl-link]').click();
    assert.equal(await root.getAttribute('data-bl3d-linked'), 'true'); assert.equal(await root.locator('[data-bl="lead"]').inputValue(), '5');
    // While operating the controls, the coupled contact view, the handwheel and the buttons are on screen together.
    async function settle() { let last = -1; for (let i = 0; i < 60; i++) { const y = await page.evaluate(() => scrollY); if (y === last) return; last = y; await page.waitForTimeout(150); } }
    async function inView(loc) { return loc.evaluate(n => { const r = n.getBoundingClientRect(), top = document.querySelector('.appbar').getBoundingClientRect().bottom; return r.top >= top - 1 && r.bottom <= innerHeight + 1; }); }
    for (const [w, h] of [[390, 844], [1280, 900]]) for (const linked of [true, false]) {
      await page.setViewportSize({ width: w, height: h });
      await root.locator('[data-bl="clearance"]').selectOption(linked ? '1' : '0.2'); await root.locator('[data-bl-mode="explore"]').click();
      const view = root.locator(linked ? '[data-bl-slot="primary"] .bl-canvas' : '[data-bl-slot="primary"] svg.bl-section');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await root.locator('[data-bl-turn="10"]').click(); await root.locator('[data-bl-turn="-1"]').click(); await settle();
      assert.equal(await inView(view), true, `contact view visible after clicking turn buttons at ${w}, linked ${linked}`);
      assert.equal(await inView(root.locator('[data-bl-turn="-1"]')), true);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      // Real keyboard navigation: Tab from the last task button onto the handwheel, then turn it.
      await root.locator('[data-bl-mode="position"]').evaluate(n => n.focus({ preventScroll: true })); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => 'blWheel' in document.activeElement.dataset), true, 'Tab reaches the handwheel');
      await page.keyboard.press('ArrowLeft'); await settle();
      assert.equal(await inView(view), true, `contact view visible while using the handwheel keys at ${w}, linked ${linked}`);
      assert.equal(await inView(root.locator('[data-bl-wheel]')), true);
      await page.screenshot({ path: path.join(out, `v2-operating-${w}-${linked ? 'linked3d' : 'section'}-light.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 900 }); await root.locator('[data-bl="clearance"]').selectOption('1');
    // Layouts and themes.
    for (const [w, h] of [[1280, 900], [390, 844]]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: w, height: h }); await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no page overflow at ' + w);
      assert.equal(await root.evaluate(n => n.scrollWidth <= n.clientWidth), true, 'no module overflow at ' + w);
      const small = await root.locator('button, select, input').evaluateAll(ns => ns.filter(n => n.offsetParent && n.getBoundingClientRect().height < 44).length);
      assert.equal(small, 0, 'all visible controls are at least 44 px tall');
      await root.screenshot({ path: path.join(out, `v2-lab-${w}-${theme}.png`) });
    }
    assert.deepEqual(errors, []); await context.close();

    // Reduced motion: every lead and clearance, after preconditioning moves, with repeated checks.
    const rm = await open(browser, { reducedMotion: 'reduce' }), rroot = await ready(rm.page);
    for (const lead of ['2', '5']) for (const B of ['0.05', '0.2', '1']) {
      await rroot.locator('[data-bl="lead"]').selectOption(lead); await rroot.locator('[data-bl="clearance"]').selectOption(B);
      await rroot.locator('[data-bl-mode="predict"]').click();
      const L = Number(lead), db = Number(B) * 100 / L, divMm = L / 100;
      for (const pre of [[100, -10, -1], [-10], [100, 100, -1]]) {
        for (const n of pre) await rroot.locator(`[data-bl-turn="${n}"]`).click();
        await rroot.locator('[data-bl="prediction"]').fill(String(db)); await rroot.locator('[data-bl-check]').click();
        assert.match(await rroot.locator('[data-bl-result]').textContent(), /^Correct/, `L ${L} B ${B} pre ${pre}`);
        const expected = 10 - (Math.ceil(db - 1e-9) + 4 - db) * divMm;
        assert.ok(Math.abs(await num(rroot, 'carriage') - expected) < 1e-9, `carriage after the check, L ${L} B ${B}: expected ${expected}`);
      }
    }
    assert.deepEqual(rm.errors, []); await rm.context.close();

    // Two roots initialised by one loader stay independent and share no ids.
    const mm = await open(browser); await mm.page.route('**/backlash-lost-motion/demo.js*', r => r.abort());
    await mm.page.goto(pageURL(), { waitUntil: 'networkidle' });
    assert.equal(await mm.page.locator(ROOT + ' [id]').count(), 0, 'static fallback is ID-free');
    const src = await mm.page.locator('script[src*="/backlash-lost-motion/demo.js"]').evaluate(n => n.src);
    await mm.page.evaluate(sel => { const a = document.querySelector(sel); a.after(a.cloneNode(true)); }, ROOT); await mm.page.unroute('**/backlash-lost-motion/demo.js*');
    await mm.page.evaluate(s => { const el = document.createElement('script'); el.src = s + '&two-roots=1'; document.body.append(el); }, src);
    await mm.page.waitForFunction(sel => [...document.querySelectorAll(sel)].filter(n => n.dataset.bl3d === 'ready').length === 2, ROOT, { timeout: 30000 });
    await mm.page.locator('details.xcard').evaluateAll(ns => ns.forEach(n => { n.open = true; }));
    const roots = mm.page.locator(ROOT); assert.equal(await mm.page.locator('canvas.bl-webgl').count(), 2);
    await roots.nth(1).locator('[data-bl-turn="10"]').click();
    assert.equal(await roots.nth(0).getAttribute('data-bl-reading'), '0'); assert.equal(await roots.nth(1).getAttribute('data-bl-reading'), '0.5');
    assert.deepEqual(await mm.page.locator(ROOT + ' [id]').evaluateAll(ns => { const seen = new Set(); return ns.map(n => n.id).filter(id => seen.has(id) || !seen.add(id)); }), []);
    const mmErrors = mm.errors.filter(e => !/backlash-lost-motion\/demo\.js/.test(e)); assert.deepEqual(mmErrors, []); await mm.context.close();

    // No JavaScript: the static lesson carries the formula, example, figures and comparison.
    const nj = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } }), np = await nj.newPage();
    await np.goto(pageURL(), { waitUntil: 'networkidle' }); await np.locator('details').evaluateAll(ns => ns.forEach(n => { n.open = true; }));
    const fallback = np.locator(ROOT + ' .bl-static'); assert.equal(await fallback.isVisible(), true);
    const text = await fallback.textContent();
    for (const s of ['360° × B ÷ L', '14.4°', 'Reverse straight to the number', '25.20 mm', 'Model limits']) assert.ok(text.includes(s), s);
    assert.equal(await fallback.locator('svg.bl-loop').count(), 1); assert.equal(await fallback.locator('svg.bl-section').count(), 3);
    await np.screenshot({ path: path.join(out, 'v2-nojs-390-light.png'), fullPage: true }); await nj.close();
    console.log('PASS evidence: ' + out);
  } finally { await browser.close(); }
});
