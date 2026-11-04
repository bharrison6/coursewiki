'use strict';
// Browser checks for the sweep and loft lab. Skips unless Playwright and
// COURSEWIKI_BROWSER_URL (a server over docs/) are available; evidence goes to the OS temp dir.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { browserURL, skip, launch } = require('../../tests/support/browser.cjs');
const PAGE = '/engineering-graphics/sweeps-and-lofts.html';
// Web fonts come from a third-party host the theme links; an offline sandbox cannot reach it.
const fontNoise = /fonts\.(googleapis|gstatic)\.com/;

async function open(browser, opts, out) {
  const context = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 } }, opts || {}));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_(CERT_AUTHORITY_INVALID|FAILED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => { if (!fontNoise.test(r.url())) errors.push('request failed: ' + r.url()); });
  await page.route(fontNoise, (r) => r.abort());
  await page.goto(browserURL.replace(/\/$/, '') + PAGE, { waitUntil: 'networkidle' });
  await page.locator('details.xcard').evaluateAll((ns) => ns.forEach((n) => { n.open = true; }));
  return { context, page, errors };
}
async function setRange(loc, value) { await loc.evaluate((n, v) => { n.value = String(v); n.dispatchEvent(new Event('input', { bubbles: true })); }, value); }

test('sweep and loft lab: controls, keyboard, predictions, independence, fallbacks', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-sweep-loft-lab-')), browser = await launch();
  try {
    const { context, page, errors } = await open(browser);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-interactive="sweep-loft-lab"]')].every((n) => n.dataset.sllReady));
    const modes = await page.$$eval('[data-interactive="sweep-loft-lab"]', (ns) => ns.map((n) => n.dataset.sllMode + ':' + n.dataset.sllReady));
    assert.deepEqual(modes, ['sweep:true', 'loft:true', 'challenge:true'], 'all three mounts live with WebGL');
    assert.equal(await page.locator('canvas.sll-webgl').count(), 2);
    assert.equal(await page.locator('[data-interactive="sweep-loft-lab"].sll-ready > .sll-static').evaluateAll((ns) => ns.every((n) => getComputedStyle(n).display === 'none')), true, 'static lesson hidden once live');

    // sweep: keyboard on native sliders crosses the boundary exactly
    const sw = page.locator('[data-sll-mode="sweep"]').first();
    assert.equal(await sw.getAttribute('data-sll-state'), 'clear');
    await sw.locator('[data-sll="size"]').focus(); await page.keyboard.press('End');           // Ø40 on the 20 mm arc
    assert.equal(await sw.getAttribute('data-sll-state'), 'degenerate', 'reach 20 = bend 20');
    await page.keyboard.press('ArrowLeft');                                                     // Ø39
    assert.equal(await sw.getAttribute('data-sll-state'), 'clear');
    await sw.locator('[data-sll="bend"]').focus(); await page.keyboard.press('ArrowLeft');     // bend 19.5 < reach 19.5? equal
    assert.equal(await sw.getAttribute('data-sll-state'), 'degenerate');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await sw.getAttribute('data-sll-state'), 'folds');
    assert.match(await sw.locator('[data-sll="status"]').textContent(), /folds through itself/);
    assert.ok(Number(await sw.locator('.sll-canvas').getAttribute('data-red-vertices')) > 0, 'red vertices come from the mesh');
    await sw.locator('.sll-detail > summary').click();
    await sw.locator('[data-sll-view="top"]').scrollIntoViewIfNeeded();
    await sw.screenshot({ path: path.join(out, 'sweep-arc-fold-1280-light.png') });

    // canvas keyboard orbit changes pixels, does not navigate, and Home restores the view
    const canvas = sw.locator('canvas.sll-webgl');
    await sw.locator('[data-sll-view="iso"]').click(); await page.waitForTimeout(80);
    await canvas.evaluate((n) => n.blur());
    const before = await canvas.screenshot(), url = page.url();
    await canvas.focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(80);
    assert.equal(page.url(), url, 'arrow keys on the canvas do not change page');
    assert.equal(before.equals(await canvas.screenshot()), false, 'orbit changes the rendering');
    await page.keyboard.press('Home'); await page.waitForTimeout(80);
    await canvas.evaluate((n) => n.blur()); await page.waitForTimeout(80);
    assert.equal(before.equals(await canvas.screenshot()), true, 'Home restores the saved view');
    await sw.locator('.sll-detail > summary').click();

    // helix: local test passes while neighbouring coils collide
    await sw.locator('[data-sll="path"]').selectOption('helix');
    await setRange(sw.locator('[data-sll="size"]'), 20); await setRange(sw.locator('[data-sll="bend"]'), 30); await setRange(sw.locator('[data-sll="pitch"]'), 16);
    assert.equal(await sw.getAttribute('data-sll-state'), 'coil');
    assert.match(await sw.locator('[data-sll="status"]').textContent(), /local bend test cannot see this clash/);
    assert.equal(await sw.locator('[data-sll="plan"]').isHidden(), true, 'plan view is for planar paths only');

    // play / pause and reset
    await sw.locator('[data-sll="reset"]').click();
    assert.equal(await sw.getAttribute('data-sll-state'), 'clear');
    await sw.locator('[data-sll="play"]').click(); await page.waitForTimeout(600);
    const p1 = Number(await sw.locator('[data-sll="progress"]').inputValue());
    await sw.locator('[data-sll="play"]').click(); const p2 = Number(await sw.locator('[data-sll="progress"]').inputValue());
    await page.waitForTimeout(400);
    assert.ok(p1 > 0 && p1 < 100, 'travel advanced'); assert.equal(Number(await sw.locator('[data-sll="progress"]').inputValue()), p2, 'pause stops travel');

    // prediction scoring: requires a choice, scores once per scenario
    await sw.locator('[data-sll-panel="predict"]').click();
    await sw.locator('[data-sll="test"]').click();
    assert.match(await sw.locator('[data-sll="feedback"]').textContent(), /Choose a prediction first/);
    await sw.locator('.sll-predict input[value="clean"]').check(); await sw.locator('[data-sll="test"]').click();
    assert.match(await sw.locator('[data-sll="feedback"]').textContent(), /Your prediction matches/);
    assert.match(await sw.locator('[data-sll="score"]').textContent(), /1 of 1/);
    await sw.locator('[data-sll="next"]').click();
    await sw.locator('.sll-predict input[value="clean"]').check(); await sw.locator('[data-sll="test"]').click();
    assert.match(await sw.locator('[data-sll="feedback"]').textContent(), /Not this time/);
    assert.match(await sw.locator('[data-sll="score"]').textContent(), /1 of 2/);
    assert.equal(await sw.getAttribute('data-sll-state'), 'folds', 'tested scenario is loaded into the lab');

    // loft: connector shift twists, 180° pinches, restoring returns to matched; order folds
    const lo = page.locator('[data-sll-mode="loft"]'), circle = lo.locator('[data-sll="circle"]');
    await circle.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    assert.equal(await lo.getAttribute('data-sll-state'), 'twisted');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    assert.equal(await lo.getAttribute('data-sll-state'), 'pinched');
    assert.ok(Number(await lo.locator('.sll-canvas').getAttribute('data-red-rings')) > 0);
    await lo.screenshot({ path: path.join(out, 'loft-pinch180-1280-light.png') });
    await page.keyboard.press('Home');
    assert.equal(await lo.getAttribute('data-sll-state'), 'matched');
    await lo.locator('[data-sll="order"]').selectOption('slot,circle,square');
    assert.equal(await lo.getAttribute('data-sll-state'), 'matched', 'reversed order: same surface');
    await lo.locator('[data-sll="order"]').selectOption('square,slot,circle');
    assert.equal(await lo.getAttribute('data-sll-state'), 'folded');
    await lo.locator('.sll-detail > summary').click();
    await lo.locator('[data-sll="section"]').click();
    assert.equal(await lo.locator('.sll-canvas').getAttribute('data-section'), 'on');
    await lo.locator('.sll-detail > summary').click();

    // challenge
    const ch = page.locator('[data-sll-mode="challenge"]');
    await ch.locator('input[value="sweep"]').check(); await ch.locator('[data-sll="ch-check"]').click();
    assert.match(await ch.locator('[data-sll="ch-ffb"]').textContent(), /^Yes\./);
    await ch.locator('input[value="size"]').check(); await ch.locator('[data-sll="ch-apply"]').click();
    assert.match(await ch.locator('[data-sll="ch-xfb"]').textContent(), /Not the target yet.*no longer the Ø20/);
    await ch.locator('input[value="radius"]').check(); await ch.locator('[data-sll="ch-apply"]').click();
    assert.match(await ch.locator('[data-sll="ch-xfb"]').textContent(), /That matches the target/);
    assert.match(await ch.locator('[data-sll="ch-score"]').textContent(), /0 of 1/, 'first try counts');

    // a second sweep mount initialises independently, with no shared ids
    await page.evaluate(() => { const d = document.createElement('div'); d.setAttribute('data-interactive', 'sweep-loft-lab'); d.setAttribute('data-sll-mode', 'sweep'); d.id = 'second-mount'; document.querySelector('[data-sll-mode="challenge"]').after(d); window.CourseWikiSweepLoftLab.init(); });
    await page.waitForFunction(() => document.getElementById('second-mount').dataset.sllReady);
    const second = page.locator('#second-mount');
    await setRange(second.locator('[data-sll="size"]'), 30); await setRange(second.locator('[data-sll="bend"]'), 10);
    assert.equal(await second.getAttribute('data-sll-state'), 'folds');
    await sw.locator('[data-sll-panel="explore"]').click();
    await sw.locator('[data-sll="reset"]').click();
    assert.equal(await sw.getAttribute('data-sll-state'), 'clear');
    assert.equal(await second.getAttribute('data-sll-state'), 'folds', 'mounts keep separate state');
    const dupes = await page.$$eval('[data-interactive="sweep-loft-lab"] [id]', (ns) => { const seen = new Set(); return ns.map((n) => n.id).filter((id) => seen.has(id) || !seen.add(id)); });
    assert.deepEqual(dupes, []);

    // phone and dark theme: no horizontal overflow, controls at least 44 px tall
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: 390, height: 860 });
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, theme + ' 390 overflow');
      const small = await page.$$eval('[data-sll-mode="sweep"] .sll-live :is(button, select, .sll-choice, input[type=range])', (ns) => ns.filter((n) => n.offsetParent && n.getBoundingClientRect().height < 43.5).map((n) => n.outerHTML.slice(0, 60)));
      assert.deepEqual(small, [], 'targets >= 44 px');
      await sw.screenshot({ path: path.join(out, 'sweep-390-' + theme + '.png') });
    }
    assert.deepEqual(errors, []);
    await context.close();

    // reduced motion: travel steps instead of animating
    const rm = await open(browser, { reducedMotion: 'reduce' });
    const rsw = rm.page.locator('[data-sll-mode="sweep"]');
    await rm.page.waitForFunction(() => document.querySelector('[data-sll-mode="sweep"]').dataset.sllReady);
    assert.equal((await rsw.locator('[data-sll="play"]').textContent()).trim(), 'Step along path');
    const r0 = Number(await rsw.locator('[data-sll="progress"]').inputValue());
    await rsw.locator('[data-sll="play"]').click();
    assert.equal(Number(await rsw.locator('[data-sll="progress"]').inputValue()), Math.min(100, Math.floor(r0 / 10) * 10 + 10));
    assert.deepEqual(rm.errors, []); await rm.context.close();

    // no WebGL: the same SVG renderer fills the stage
    const ng = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    await ng.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, o) { return /webgl/.test(k) ? null : g.call(this, k, o); }; });
    const np = await ng.newPage(); const nerr = []; np.on('pageerror', (e) => nerr.push(e.message));
    await np.route(fontNoise, (r) => r.abort());
    await np.goto(browserURL.replace(/\/$/, '') + PAGE, { waitUntil: 'networkidle' });
    assert.equal(await np.locator('[data-sll-mode="sweep"]').getAttribute('data-sll-ready'), 'fallback');
    assert.equal(await np.locator('[data-sll-mode="sweep"] .sll-canvas svg.sll-iso').count(), 1);
    assert.equal(await np.locator('[data-sll-mode="loft"] .sll-canvas svg.sll-loft').count(), 1);
    assert.deepEqual(nerr, []); await ng.close();

    // no JavaScript: the static lesson inside each mount carries the teaching
    const nj = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } }), jp = await nj.newPage();
    await jp.goto(browserURL.replace(/\/$/, '') + PAGE, { waitUntil: 'domcontentloaded' });
    await jp.locator('details.xcard').evaluateAll((ns) => ns.forEach((n) => { n.open = true; }));
    assert.equal(await jp.locator('[data-interactive="sweep-loft-lab"] .sll-static').count(), 3);
    assert.match(await jp.locator('[data-sll-mode="sweep"]').textContent(), /reach toward the centre of curvature ≥ local bend radius/);
    assert.equal(await jp.locator('[data-interactive="sweep-loft-lab"] [id]').count(), 0, 'static fallback is ID-free');
    await jp.screenshot({ path: path.join(out, 'nojs-390.png'), fullPage: true });
    await nj.close();
    console.log('PASS evidence: ' + out);
  } finally { await browser.close(); }
});

test('ordinary actions show the current scene and bounded diagnostic without scripted page jumps', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-sweep-visible-')), browser = await launch();
  try {
    for (const [width, theme] of [[390, 'light'], [1280, 'dark']]) {
      const { context, page, errors } = await open(browser, { viewport: { width, height: width === 390 ? 844 : 900 } });
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
      const sw = page.locator('[data-sll-mode="sweep"]').first(), lo = page.locator('[data-sll-mode="loft"]').first();
      async function capture(root, name, fullScene) {
        const r = await root.evaluate(m => {
          const box = key => { const b=m.querySelector('[data-sll="'+key+'"]').getBoundingClientRect(); return {top:b.top,bottom:b.bottom,height:b.height}; };
          return {scene:box('scene'),brief:box('brief'),height:innerHeight};
        });
        const visible = Math.max(0, Math.min(r.scene.bottom,r.height)-Math.max(r.scene.top,56));
        assert.ok(visible >= r.scene.height * (fullScene ? .98 : .65), name + ': changing geometry visible ' + JSON.stringify(r));
        if (fullScene) assert.ok(r.brief.top >= 56 && r.brief.bottom <= r.height, name + ': diagnostic visible');
        await page.screenshot({path:path.join(out,width+'-'+name+'.png')});
      }
      await sw.locator('[data-sll="play"]').scrollIntoViewIfNeeded();
      const before=await page.evaluate(()=>scrollY);
      await sw.locator('[data-sll="play"]').click(); await page.waitForTimeout(350);
      assert.ok(Math.abs((await page.evaluate(()=>scrollY))-before)<2,'Play does not jump the page');
      await capture(sw,'play',true); await sw.locator('[data-sll="play"]').click();
      await sw.locator('[data-sll="size"]').focus(); await page.waitForTimeout(350); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
      await capture(sw,'size',false);
      await sw.locator('[data-sll-panel="predict"]').click();
      await sw.locator('.sll-predict input[value="clean"]').check();
      await sw.locator('[data-sll="test"]').scrollIntoViewIfNeeded(); const testY=await page.evaluate(()=>scrollY);
      await sw.locator('[data-sll="test"]').click(); await capture(sw,'prediction',true);
      assert.ok(Math.abs((await page.evaluate(()=>scrollY))-testY)<2,'Check does not jump the page');
      assert.match(await sw.locator('[data-sll="brief"]').textContent(),/Prediction matches/);
      await lo.locator('[data-sll="circle"]').focus(); await page.waitForTimeout(350); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
      await capture(lo,'loft-connector',false);
      assert.equal(await lo.getAttribute('data-sll-state'),'twisted');
      await sw.locator('[data-sll-panel="explore"]').click();
      await sw.locator('[data-sll="path"]').selectOption('helix'); await sw.locator('[data-sll="shape"]').selectOption('rectangle');
      await sw.locator('[data-sll="turned"]').check();
      for (const [key,value] of [['size',12],['bend',8],['pitch',12]]) await setRange(sw.locator('[data-sll="'+key+'"]'),value);
      assert.equal(await sw.getAttribute('data-sll-state'),'local-pass');
      assert.match(await sw.locator('[data-sll="brief"]').textContent(),/global clearance not established/);
      assert.doesNotMatch(await sw.locator('[data-sll="r-whole"]').textContent(),/Builds|Whole sweep/);
      await sw.locator('[data-sll="play"]').click(); await page.waitForTimeout(150); await capture(sw,'unproven-helix',true);
      await sw.locator('[data-sll="play"]').click();
      assert.deepEqual(errors,[]); await context.close();
    }
    console.log('Visible action evidence: '+out);
  } finally { await browser.close(); }
});
