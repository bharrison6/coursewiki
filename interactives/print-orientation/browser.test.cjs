'use strict';
// Opt-in browser suite: PLAYWRIGHT_MODULE / COURSEWIKI_BROWSER_URL per tests/support/browser.cjs.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { browserURL, skip, launch } = require('../../tests/support/browser.cjs');
const ROOT = '[data-interactive="print-orientation"]';
function pageURL(track) { return (browserURL || '').replace(/\/$/, '') + '/engineering-graphics/3d-printing-from-cad.html' + (track ? '?p=' + track : ''); }
async function open(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('details.xcard').evaluateAll(ns => ns.forEach(n => { n.open = true; }));
}
async function ready(page, value) { await page.waitForFunction(v => document.querySelector('[data-interactive="print-orientation"]')?.dataset.poReady === v, value); }

test('print orientation: keyboard and pointer use, live consequences, phone, fallback, independent roots, no-JS', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-print-orientation-')), browser = await launch();
  try {
    // Reduced motion also turns off the theme's smooth scrolling, which otherwise races Playwright's own scrolling.
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, reducedMotion: 'reduce' }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await open(page, pageURL('digital-fabrication')); await ready(page, 'true');
    const root = page.locator(ROOT).first(), status = root.locator('[data-po-status]');
    assert.equal(await root.locator('canvas.po-webgl').count(), 1);
    assert.match(await status.textContent(), /arm flat on the plate/i);
    const startURL = page.url();

    // Keyboard: preset button, range arrows, load radio arrows, prediction and check.
    await root.locator('[data-po-preset="inverted"]').focus(); await page.keyboard.press('Enter');
    assert.equal(await root.getAttribute('data-po-state'), 'upright:180:hang');
    assert.match(await root.locator('.po-live .po-readout').textContent(), /1,310 mm²/);
    await root.locator('[data-po="spin"]').focus(); await page.keyboard.press('ArrowLeft');
    assert.equal(await root.getAttribute('data-po-state'), 'upright:175:hang'); assert.equal(page.url(), startURL, 'range arrows do not change page');
    await root.locator('input[name$="-load"][value="hang"]').focus(); await page.keyboard.press('ArrowDown');
    assert.equal(await root.getAttribute('data-po-state'), 'upright:175:pull');
    assert.match(await root.locator('.po-live [data-po-load-readout]').textContent(), /Predict first/);
    await root.locator('input[name$="-predict"][value="parallel"]').focus(); await page.keyboard.press('Space');
    await root.locator('[data-po-action="check"]').focus(); await page.keyboard.press('Enter');
    assert.match(await root.locator('[data-po-feedback]').textContent(), /^Matches\. Largest load-to-layer angle: 5°/);
    assert.match(await root.locator('[data-po-score]').textContent(), /checked: 1\. Matched: 1/);
    assert.match(await root.locator('.po-live [data-po-load-readout]').textContent(), /up to 5°/);

    // Pointer: the hanging load upright is mostly normal somewhere; predicting parallel is marked wrong.
    await root.locator('[data-po-preset="base"]').click(); await root.locator('input[name$="-load"][value="hang"]').check();
    await root.locator('input[name$="-predict"][value="parallel"]').check(); await root.locator('[data-po-action="check"]').click();
    assert.match(await root.locator('[data-po-feedback]').textContent(), /^Not this time\. Largest load-to-layer angle: 90°/);
    await root.locator('[data-po-preset="side"]').click();
    assert.match(await root.locator('.po-live [data-po-load-readout]').textContent(), /Predict first/, 'a new orientation asks again');
    await root.locator('[data-po-action="reveal"]').click();
    assert.match(await root.locator('.po-live [data-po-load-readout]').textContent(), /up to 0°/);
    assert.match(await root.locator('.po-live .po-readout').textContent(), /428 mm²/);
    assert.ok(Number(await root.locator('[data-po-scene]').getAttribute('data-pillars')) > 0, 'support pillars drawn');
    await page.screenshot({ path: path.join(out, 'desktop-side-revealed-light.png'), fullPage: false });

    // Threshold and layer controls change the flagged area and the layer count.
    await root.locator('[data-po-preset="base"]').click();
    await root.locator('[data-po="threshold"]').fill('30');
    assert.match(await root.locator('.po-live .po-readout').textContent(), /flatter than 30°/);
    await root.locator('[data-po="layer"]').fill('0.1');
    assert.match(await root.locator('.po-live .po-readout').textContent(), /500 layers/);
    assert.match(await root.locator('[data-po-stairs]').textContent(), /500 layers of 0\.10 mm/);

    // Comparison table.
    await root.locator('[data-po-action="save"]').click(); await root.locator('[data-po-preset="side"]').click(); await root.locator('[data-po-action="save"]').click();
    assert.equal(await root.locator('.po-live .po-compare tbody tr').count(), 2);
    await root.locator('[data-po-action="clear"]').click(); assert.equal(await root.locator('.po-live .po-compare').count(), 0);

    // Canvas keyboard orbit changes pixels, does not navigate the track, Home restores the saved view.
    await root.locator('[data-po-action="reset"]').click();
    const canvas = root.locator('canvas.po-webgl');
    const shot = async () => { await canvas.evaluate(n => n.blur()); await page.waitForTimeout(80); const b = await canvas.screenshot(); await canvas.focus(); return b; };
    await canvas.focus(); const base = await shot();
    await page.keyboard.press('ArrowRight');
    assert.equal(page.url(), startURL, 'canvas orbit does not trigger playlist navigation');
    assert.equal(base.equals(await shot()), false, 'keyboard orbit changes rendered pixels');
    await page.keyboard.press('Home');
    assert.equal(base.equals(await shot()), true, 'Home restores the default view');

    for (const width of [390, 1280]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 }); await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(120);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no page overflow ' + width + ' ' + theme);
      assert.equal(await root.evaluate(n => n.scrollWidth <= n.clientWidth + 1), true, 'no module overflow ' + width + ' ' + theme);
      const small = await root.locator('button, input[type="range"], .po-radio').evaluateAll(ns => ns.filter(n => n.offsetParent && n.getBoundingClientRect().height < 44).length);
      assert.equal(small, 0, 'controls keep 44 px targets');
      await root.locator('.po-stage').screenshot({ path: path.join(out, 'stage-' + width + '-' + theme + '.png') });
    }
    assert.deepEqual(errors, []);

    // v2: consequences and save confirmation stay beside the controls at phone and desktop sizes (real clicks/keys).
    for (const [w, h] of [[390, 844], [1280, 900]]) {
      const vp = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce' }), vpErrors = [];
      vp.on('pageerror', e => vpErrors.push(e.message));
      await open(vp, pageURL('digital-fabrication')); await ready(vp, 'true');
      const r = vp.locator(ROOT).first(), near = r.locator('[data-po-near="settings"]'), inView = loc => loc.evaluate(n => { const t = n.querySelector('p') || n, b = t.getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return b.top >= 0 && b.bottom <= innerHeight && !!hit && t.contains(hit); }); // text actually visible, not under the fixed track bar
      const slider = r.locator('[data-po="threshold"]'); await slider.click();
      const before = await near.textContent();
      for (let i = 0; i < 6; i++) await vp.keyboard.press('ArrowRight');
      const after = await near.textContent();
      assert.notEqual(after, before, 'threshold change shows a consequence beside the slider');
      assert.match(after, /needs support at \d+°/); assert.equal(await inView(near), true, 'consequence visible while using the slider ' + w);
      await r.locator('.po-controls fieldset').first().evaluate(n => n.scrollIntoView({ block: 'start' })); // the reader scrolls to the controls, then clicks
      await r.locator('[data-po-preset="side"]').click();
      assert.match(await r.locator('[data-po-near="orientation"]').textContent(), /428 mm² needs support/);
      assert.equal(await inView(r.locator('[data-po-near="orientation"]')), true, 'orientation consequence visible ' + w);
      const save = r.locator('[data-po-action="save"]'); await save.click();
      const note = r.locator('[data-po-saved-note]');
      assert.match(await note.textContent(), /Saved: on its side.*1 saved/); assert.equal(await inView(note), true, 'save confirmation visible ' + w);
      assert.equal(await r.locator('[data-po-saved-mini] li').count(), 1);
      await r.locator('[data-po-action="reset"]').click();
      assert.equal(await r.locator('[data-po-saved-mini] li').count(), 1, 'Reset orientation keeps the saved table, as labelled');
      await r.locator('[data-po-action="clear"]').click();
      assert.equal(await r.locator('[data-po-saved-mini] li').count(), 0); assert.equal(await r.locator('[data-po-score]').textContent(), '');
      await vp.screenshot({ path: path.join(out, 'v2-near-consequence-' + w + '.png') });
      assert.equal(await vp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(vpErrors, []); await vp.close();
    }

    // WebGL unavailable: the same model is drawn by the shared SVG renderer.
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    await ctx.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { return /webgl/.test(t) ? null : g.call(this, t, o); }; });
    const fb = await ctx.newPage(), fbErrors = []; fb.on('pageerror', e => fbErrors.push(e.message));
    await open(fb, pageURL()); await ready(fb, 'fallback');
    assert.equal(await fb.locator(ROOT + ' svg[data-po-fallback]').count(), 1);
    await fb.locator(ROOT + ' [data-po-preset="inverted"]').click();
    assert.match(await fb.locator(ROOT + ' svg[data-po-fallback]').getAttribute('aria-label'), /upside down/i);
    assert.deepEqual(fbErrors, []); await ctx.close();

    // Two roots from one loader stay independent.
    const multi = await browser.newPage({ viewport: { width: 1200, height: 900 } }), multiErrors = []; multi.on('pageerror', e => multiErrors.push(e.message));
    await multi.route('**/print-orientation/demo.js*', r => r.abort()); await open(multi, pageURL());
    assert.equal(await multi.locator(ROOT + ' [id]').count(), 0, 'static fallback is ID-free');
    const src = await multi.locator('script[src*="/print-orientation/demo.js"]').evaluate(n => n.src);
    await multi.evaluate(() => { const a = document.querySelector('[data-interactive="print-orientation"]'); a.after(a.cloneNode(true)); });
    await multi.unroute('**/print-orientation/demo.js*');
    await multi.evaluate(s => { const el = document.createElement('script'); el.src = s + (s.includes('?') ? '&' : '?') + 'two-roots=1'; document.body.append(el); }, src);
    await multi.waitForFunction(() => document.querySelectorAll('[data-po-ready="true"]').length === 2);
    const roots = multi.locator(ROOT);
    await roots.nth(1).locator('[data-po-preset="side"]').click();
    assert.equal(await roots.nth(0).getAttribute('data-po-state'), 'upright:0:hang'); assert.equal(await roots.nth(1).getAttribute('data-po-state'), 'side:0:hang');
    assert.deepEqual(await multi.locator(ROOT + ' [id]').evaluateAll(ns => { const seen = new Set(); return ns.map(n => n.id).filter(id => seen.has(id) || !seen.add(id)); }), [], 'no duplicate ids');
    assert.deepEqual(multiErrors, []); await multi.close();

    // No JavaScript: the static lesson carries the comparison.
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } }), np = await noJs.newPage();
    await open(np, pageURL());
    assert.equal(await np.locator(ROOT + ' .po-static').isVisible(), true);
    const text = await np.locator(ROOT).textContent();
    assert.match(text, /A\. Arm flat on the plate/); assert.match(text, /B\. On its side/); assert.match(text, /Model limits/);
    await np.screenshot({ path: path.join(out, 'nojs-390.png'), fullPage: true }); await noJs.close();
    console.log('PASS evidence: ' + out);
  } finally { await browser.close(); }
});
