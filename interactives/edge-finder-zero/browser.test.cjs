'use strict';
// Browser acceptance for the edge-finder lesson. Skips without Playwright or COURSEWIKI_BROWSER_URL.
// Evidence (screenshots, PDF) goes to the OS temp dir, never into the repo.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { browserURL, skip, launch } = require('../../tests/support/browser.cjs');
const TS = 0.0036; // top-view px per µm, from render.js

// Kick readings in the starting frame for the 10 mm contact (edge ∓ r).
const KICK = { left: ['x', '+32.460'], right: ['x', '+142.460'], front: ['y', '+7.840'], back: ['y', '+77.840'] };
const SETTING = { left: '-5', right: '5', front: '-5', back: '5' };
// Ignore only third-party resource failures caused by the sandbox network (web fonts), never script errors.
const external = text => /fonts\.googleapis\.com|ERR_CERT_AUTHORITY_INVALID|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/.test(text);

async function openAll(page) { await page.locator('details').evaluateAll(ns => ns.forEach(n => { n.open = true; })); }
async function approach(root, page, useKeys) {
  const steps = [['1000', 7], ['100', 3], ['10', 7]];
  for (const [value, count] of steps) {
    await root.locator(`.efz-controls input[type="radio"][value="${value}"]`).check({ force: true });
    for (let i = 0; i < count; i++) {
      if (useKeys) {
        await root.locator('[data-efz-close]').focus();
        const side = await root.locator('input[name$="-side"]:checked').getAttribute('value');
        await page.keyboard.press({ left: 'ArrowRight', right: 'ArrowLeft', front: 'ArrowUp', back: 'ArrowDown' }[side]);
      } else {
        const side = await root.locator('input[name$="-side"]:checked').getAttribute('value');
        await root.locator(`[data-efz-move="${side === 'left' || side === 'front' ? 1 : -1}"]`).click();
      }
    }
  }
}
async function holeOffsets(root, kind) {
  return root.locator('.efz-lab .efz-top').evaluate((svg, k) => {
    const g = svg.querySelector(`[data-hole="${k}"]`), i = svg.querySelector('.efz-intended');
    return { dx: Number(g.dataset.cx) - Number(i.getAttribute('cx')), dy: Number(g.dataset.cy) - Number(i.getAttribute('cy')) };
  }, kind);
}

test('edge finder: four sides, kick, signed check holes, keyboard, themes, print, no-JS, mounts', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-edge-finder-zero-')), browser = await launch();
  const base = browserURL.replace(/\/$/, ''), url = base + '/machining/mill-indicating-and-zero.html';
  const errors = [], held = [];
  function watch(page) {
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') (external(m.text() + JSON.stringify(m.location())) ? held : errors).push('console: ' + m.text()); });
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } }); watch(page);
    await page.goto(url, { waitUntil: 'networkidle' }); await openAll(page);
    const roots = page.locator('[data-interactive="edge-finder-zero"]');
    assert.equal(await roots.count(), 2, 'edge and tool-length mounts');
    assert.deepEqual(await roots.evaluateAll(ns => ns.map(n => n.dataset.efzReady)), ['true', 'true']);
    const root = roots.first();
    assert.match(await root.locator('[data-efz-convention]').textContent(), /\+X points right, \+Y points toward the back/);
    assert.equal(await root.locator('.efz-lab .efz-close').getAttribute('data-phase'), 'free');
    assert.equal(await root.locator('[data-efz-setbtn]').isDisabled(), true, 'cannot set before the kick');

    for (const side of ['left', 'right', 'front', 'back']) {
      await root.locator(`input[name$="-side"][value="${side}"]`).check({ force: true });
      await approach(root, page, side === 'front' || side === 'back');
      assert.equal(await root.locator('.efz-lab .efz-close').getAttribute('data-phase'), 'kick', side + ' kicked');
      assert.match(await root.locator('[data-efz-phase]').textContent(), /KICK/);
      const [axis, reading] = KICK[side];
      assert.equal(await root.locator(`[data-efz-dro="${axis}"]`).textContent(), reading, side + ' kick reading');
      // Jogging further toward the edge is refused once kicked.
      await root.locator('[data-efz-close]').focus();
      await page.keyboard.press({ left: 'ArrowRight', right: 'ArrowLeft', front: 'ArrowUp', back: 'ArrowDown' }[side]);
      assert.match(await root.locator('[data-efz-feedback]').textContent(), /already kicked/);
      assert.equal(await root.locator(`[data-efz-dro="${axis}"]`).textContent(), reading);
      await root.locator('[data-efz-input]').fill(SETTING[side]); await root.locator('[data-efz-setbtn]').click();
      assert.equal(await root.locator(`[data-efz-dro="${axis}"]`).textContent(), SETTING[side].startsWith('-') ? '−5.000' : '+5.000');
      await root.locator('[data-efz-drill]').click();
      await page.waitForFunction(el => el.querySelector('[data-efz-holes] tr[data-kind="yours"]'), await root.elementHandle());
      assert.match(await root.locator('[data-efz-feedback]').textContent(), /lands 20\.000 mm from the .* exactly as drawn/);
      let off = await holeOffsets(root, 'yours');
      assert.ok(Math.abs(off.dx) < 0.02 && Math.abs(off.dy) < 0.02, side + ' correct hole sits on the drawn hole');
      for (const [kind, factor] of [['forgot', 1], ['sign', 2]]) {
        await root.locator(`[data-efz-what="${kind}"]`).click();
        off = await holeOffsets(root, kind);
        const errUm = { left: -5000, right: 5000, front: -5000, back: 5000 }[side] * factor; // signed axis error
        const expected = axis === 'x' ? { dx: errUm * TS, dy: 0 } : { dx: 0, dy: -errUm * TS };
        assert.ok(Math.abs(off.dx - expected.dx) < 0.02 && Math.abs(off.dy - expected.dy) < 0.02, `${side}/${kind}: visible top-view shift ${JSON.stringify(off)} matches signed error ${errUm} µm`);
        const rx = Number(await root.locator(`.efz-lab [data-ruler="${kind}"]`).getAttribute('data-x'));
        assert.ok(Math.abs(rx - (40 + (20 - 5 * factor + 2) * 20)) < 0.02, `${side}/${kind}: ruler marker at ${20 - 5 * factor} mm`);
        assert.match(await root.locator(`[data-efz-holes] tr[data-kind="${kind}"]`).textContent(), new RegExp((5 * factor).toFixed(3) + ' toward edge \\(' + factor + ' r\\)'));
      }
      assert.match(await root.locator('[data-efz-rule]').textContent(), side === 'left' || side === 'front' ? /reading \+ r/ : /reading − r/);
      const signText = await root.locator('[data-efz-what-feedback]').textContent();
      assert.match(signText, /wrong sign contributes 2r = 10\.000 mm toward the edge.*Zero lies 10\.000 mm outside the edge/, side + ': wrong-sign zero is two radii OUTSIDE');
      assert.doesNotMatch(signText, /inside/, side + ': wrong-sign prose never says inside');
      // Close-up orientation is stated: X edges unrotated, Y edges turned 90° with +Y to the right.
      assert.equal(await root.locator('.efz-lab .efz-orient').textContent(), axis === 'x' ? '→ +X   ↑ +Y' : 'turned 90°: → +Y   ↓ +X');
      await page.screenshot({ path: path.join(out, `edge-${side}-mistakes-light-1280.png`), fullPage: false, clip: await root.boundingBox().then(b => ({ x: b.x, y: 0, width: b.width, height: 1000 })) }).catch(() => {});
    }

    // Overshoot with a coarse step: kick appears, the hole carries the overshoot.
    await root.locator('[data-efz-reset]').click();
    await root.locator('input[name$="-side"][value="left"]').check({ force: true });
    await root.locator('.efz-controls input[type="radio"][value="1000"]').check({ force: true });
    for (let i = 0; i < 8; i++) await root.locator('[data-efz-move="1"]').click();
    assert.equal(await root.locator('.efz-lab .efz-close').getAttribute('data-phase'), 'kick');
    assert.match(await root.locator('[data-efz-feedback]').textContent(), /during a 1 mm step.*finer step/);
    await root.locator('[data-efz-input]').fill('abc'); await root.locator('[data-efz-setbtn]').click();
    assert.match(await root.locator('[data-efz-feedback]').textContent(), /Enter a number.*Nothing was changed/);
    assert.equal(await root.locator('[data-efz-drill]').isDisabled(), true, 'invalid entry does not enable drilling');
    await root.locator('[data-efz-input]').fill('-5'); await root.locator('[data-efz-setbtn]').click(); await root.locator('[data-efz-drill]').click();
    await page.waitForFunction(el => /past the trigger/.test(el.querySelector('[data-efz-feedback]').textContent), await root.elementHandle());
    assert.match(await root.locator('[data-efz-feedback]').textContent(), /lands 20\.630 mm .*0\.630 mm further from the edge.*correct for this side.*past the trigger by 0\.630 mm/);
    // Default coarse-jog overshoot: ideal r / 2r contributions are separated from the signed overshoot and the net.
    await root.locator('[data-efz-what="forgot"]').click();
    assert.match(await root.locator('[data-efz-what-feedback]').textContent(), /lands 15\.630 mm .*4\.370 mm closer to the edge.*contributes r = 5\.000 mm toward.*0\.630 mm away.*Net: 5\.000 mm toward and 0\.630 mm away gives 4\.370 mm toward the edge/);
    await root.locator('input[name$="-predict"][value="2r"]').check({ force: true });
    await root.locator('[data-efz-what="sign"]').click();
    const overSign = await root.locator('[data-efz-what-feedback]').textContent();
    assert.match(overSign, /^Your prediction, 2r, matches the wrong-sign contribution\. This kick also carries a 0\.630 mm overshoot, so the net shift is 9\.370 mm, not exactly 2r\./);
    assert.match(overSign, /lands 10\.630 mm .*9\.370 mm closer.*Net: 10\.000 mm toward and 0\.630 mm away gives 9\.370 mm toward the edge/);
    assert.doesNotMatch(overSign, /exactly one tip radius|Prediction matches/);
    assert.match(await root.locator('[data-efz-holes] tr[data-kind="forgot"]').textContent(), /15\.630.*4\.370 toward edge/);

    // Perpendicular arrow does nothing; tip change resets the radius.
    await root.locator('[data-efz-reset]').click();
    const before = await root.locator('[data-efz-dro="x"]').textContent();
    await root.locator('[data-efz-close]').focus(); await page.keyboard.press('ArrowUp');
    assert.match(await root.locator('[data-efz-feedback]').textContent(), /moves along X only/);
    assert.equal(await root.locator('[data-efz-dro="x"]').textContent(), before);
    await root.locator('[data-efz-tip]').selectOption('d6');
    assert.match(await root.locator('[data-efz-convention]').textContent(), /r = 3\.000 mm/);
    await approach(root, page, false);
    assert.equal(await root.locator('[data-efz-dro="x"]').textContent(), '+34.460', '6 mm contact kicks 3 mm outside the left edge');

    // Animation: running changes the tip transform; pause and reduced motion hold it.
    const tip = root.locator('.efz-lab .efz-tip-top');
    await root.locator('[data-efz-reset]').click();
    const t0 = await tip.getAttribute('transform'); await page.waitForTimeout(250);
    assert.notEqual(await tip.getAttribute('transform'), t0, 'tip orbits while running');
    await root.locator('[data-efz-pause]').click();
    assert.equal(await root.locator('[data-efz-pause]').getAttribute('aria-pressed'), 'true');
    const t1 = await tip.getAttribute('transform'); await page.waitForTimeout(250);
    assert.equal(await tip.getAttribute('transform'), t1, 'paused tip holds still');

    // State races: change the setup while an animation is in flight.
    async function toKickAndSet(r, p) { await r.locator('[data-efz-reset]').click(); await r.locator('input[name$="-side"][value="left"]').check({ force: true }); await approach(r, p, false); await r.locator('[data-efz-input]').fill('-5'); await r.locator('[data-efz-setbtn]').click(); }
    await root.locator('[data-efz-tip]').selectOption('d10');
    await toKickAndSet(root, page);
    await root.locator('[data-efz-drill]').click();
    await root.locator('input[name$="-side"][value="right"]').check({ force: true });   // immediately, mid-travel
    await page.waitForTimeout(900);
    assert.equal(await root.locator('input[name$="-side"][value="right"]').isChecked(), true);
    assert.equal(await root.locator('[data-efz-word]').textContent(), 'right edge', 'challenge stays on the new edge');
    assert.equal(await root.locator('[data-efz-dro="x"]').textContent(), '+149.830', 'geometry is the new right-edge start');
    assert.match(await root.locator('.efz-lab .efz-close').getAttribute('aria-label'), /right edge/);
    assert.equal(await root.locator('[data-efz-holes] tr').count(), 0, 'no stale hole from the cancelled drill');
    assert.match(await root.locator('[data-efz-feedback]').textContent(), /Edge changed/);
    await toKickAndSet(root, page);
    await root.locator('[data-efz-drill]').click(); await root.locator('[data-efz-reset]').click(); await page.waitForTimeout(900);
    assert.equal(await root.locator('[data-efz-holes] tr').count(), 0, 'reset mid-travel drops the hole');
    assert.equal(await root.locator('[data-efz-dro="x"]').textContent(), '+25.090');
    await toKickAndSet(root, page);
    await root.locator('[data-efz-drill]').click(); await root.locator('[data-efz-tip]').selectOption('d6'); await page.waitForTimeout(900);
    assert.equal(await root.locator('[data-efz-holes] tr').count(), 0, 'tip change mid-travel drops the hole');
    assert.match(await root.locator('[data-efz-convention]').textContent(), /r = 3\.000 mm/);
    await root.locator('[data-efz-tip]').selectOption('d10');
    const lenRace = roots.nth(1);
    await lenRace.locator('input[name$="-gauge"][value="0"]').check({ force: true });
    await lenRace.locator('[data-efz-touch="t2"]').click();
    await lenRace.locator('input[name$="-gauge"][value="10000"]').check({ force: true });   // immediately, mid-touch
    await page.waitForTimeout(900);
    assert.equal(await lenRace.locator('[data-efz-result="t2"]').textContent(), '', 'no stale T2 result');
    assert.doesNotMatch(await lenRace.locator('[data-efz-lfeedback]').textContent(), /27\.500 = \+27\.500/);
    assert.match(await lenRace.locator('.efz-lab .efz-length [data-station="t2"]').textContent(), /raised/, 'figure shows T2 raised, not touched');
    await lenRace.locator('[data-efz-touch="t2"]').click(); await page.waitForTimeout(900);
    assert.match(await lenRace.locator('[data-efz-result="t2"]').textContent(), /Reading \+37\.500 mm/);
    assert.match(await lenRace.locator('[data-efz-lfeedback]').textContent(), /\+10\.000 \+ 27\.500 = \+37\.500 mm/);
    await lenRace.locator('[data-efz-touch="t1"]').click(); await lenRace.locator('[data-efz-lreset]').click(); await page.waitForTimeout(900);
    assert.equal(await lenRace.locator('[data-efz-result="t1"]').textContent(), '', 'raise mid-touch drops the T1 result');
    // Two mounts animating at once stay independent.
    await toKickAndSet(root, page);
    await root.locator('[data-efz-drill]').click(); await lenRace.locator('[data-efz-touch="t1"]').click(); await page.waitForTimeout(1000);
    assert.equal(await root.locator('[data-efz-holes] tr[data-kind="yours"]').count(), 1);
    assert.match(await lenRace.locator('[data-efz-result="t1"]').textContent(), /Reading \+10\.000 mm/);
    // Tool drawing: diameters on the same scale as lengths (0.0021 px per µm).
    assert.deepEqual(await lenRace.locator('.efz-lab .efz-length .efz-tool').evaluateAll(ns => ns.map(n => Number(n.dataset.diameterPx))), [10000 * 0.0021, 6000 * 0.0021]);
    assert.match(await lenRace.locator('.efz-lab .efz-length').textContent(), /tool lengths and diameters to scale/);
    await lenRace.locator('[data-efz-lreset]').click();

    // Reduced motion: the tip holds still without pausing, and drilling completes at once.
    const rmContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } }), rm = await rmContext.newPage(); watch(rm);
    await rm.goto(url, { waitUntil: 'networkidle' }); await openAll(rm);
    const rmRoot = rm.locator('[data-interactive="edge-finder-zero"]').first(), rmTip = rmRoot.locator('.efz-lab .efz-tip-top');
    await rmTip.scrollIntoViewIfNeeded();
    const r0 = await rmTip.getAttribute('transform'); await rm.waitForTimeout(300);
    assert.equal(await rmTip.getAttribute('transform'), r0, 'reduced motion: no orbit animation');
    await approach(rmRoot, rm, false); await rmRoot.locator('[data-efz-input]').fill('-5'); await rmRoot.locator('[data-efz-setbtn]').click(); await rmRoot.locator('[data-efz-drill]').click();
    assert.equal(await rmRoot.locator('[data-efz-holes] tr[data-kind="yours"]').count(), 1, 'reduced motion: hole stamped without travel animation');
    await rmContext.close();

    // Tool-length stage.
    const len = roots.nth(1);
    await len.locator('input[name$="-gauge"][value="10000"]').check({ force: true });
    await len.locator('[data-efz-predict="t2"]').fill('37.5');
    await len.locator('[data-efz-touch="t1"]').click(); await page.waitForTimeout(800);
    assert.match(await len.locator('[data-efz-result="t1"]').textContent(), /Reading \+10\.000 mm/);
    await len.locator('[data-efz-touch="t2"]').click(); await page.waitForTimeout(800);
    assert.match(await len.locator('[data-efz-result="t2"]').textContent(), /Reading \+37\.500 mm: matches your prediction.*\+27\.500/);
    await len.locator('[data-efz-missing]').click();
    assert.match(await len.locator('[data-efz-lfeedback]').textContent(), /−25\.500 mm: 25\.500 mm below the part top/);
    assert.equal(await root.locator('[data-efz-dro="x"]').count(), 1, 'stage 2 did not touch the edge mount');

    // Reading-mode playlist: an arrow on the focused close-up jogs instead of turning the page.
    const nav = await browser.newPage({ viewport: { width: 1280, height: 1000 } }); watch(nav);
    await nav.goto(url + '?p=mill-setup-and-tooling', { waitUntil: 'networkidle' }); await openAll(nav);
    const navRoot = nav.locator('[data-interactive="edge-finder-zero"]').first();
    await navRoot.locator('[data-efz-close]').focus(); await nav.keyboard.press('ArrowRight'); await nav.waitForTimeout(300);
    assert.match(nav.url(), /mill-indicating-and-zero\.html/, 'page did not navigate');
    assert.equal(await navRoot.locator('[data-efz-dro="x"]').textContent(), '+26.090', 'ArrowRight jogged +1 mm');
    await nav.close();

    // Phone themes: overflow, targets, legible labels inside the viewBox.
    for (const theme of ['light', 'dark']) {
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      await page.setViewportSize({ width: 390, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, theme + ' page overflow');
      for (const r of [root, len]) {
        assert.equal(await r.evaluate(n => n.scrollWidth <= n.clientWidth + 1), true, theme + ' module overflow');
        const small = await r.locator('.efz-lab button:visible, .efz-lab select, .efz-seg span').evaluateAll(ns => ns.filter(n => n.getBoundingClientRect().height < 44).map(n => n.textContent));
        assert.deepEqual(small, [], theme + ' every control is at least 44 px tall');
        const tiny = await r.locator('.efz-lab svg text').evaluateAll(ns => ns.filter(n => n.getBoundingClientRect().height < 10).map(n => n.textContent));
        assert.deepEqual(tiny, [], theme + ' diagram text at least 10 px');
        const clipped = await r.locator('.efz-lab svg').evaluateAll(svgs => svgs.flatMap(svg => { const vb = svg.viewBox.baseVal; return [...svg.querySelectorAll('text')].map(t => ({ t: t.textContent, b: t.getBBox() })).filter(o => o.b.x < -0.5 || o.b.y < -0.5 || o.b.x + o.b.width > vb.width + 0.5 || o.b.y + o.b.height > vb.height + 0.5).map(o => o.t); }));
        assert.deepEqual(clipped, [], theme + ' diagram text stays inside its viewBox');
      }
      await page.screenshot({ path: path.join(out, `page-${theme}-390.png`), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 1000 });
    }

    // Phone: after real jog clicks the contact view stays visible beside the controls, without a page jump.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } }); watch(phone);
    await phone.goto(url, { waitUntil: 'networkidle' }); await openAll(phone);
    const pr = phone.locator('[data-interactive="edge-finder-zero"]').first(), toward = pr.locator('[data-efz-move="1"]');
    await toward.evaluate(n => n.scrollIntoView({ block: 'center', behavior: 'instant' })); await phone.waitForTimeout(200);
    for (let i = 0; i < 3; i++) {
      const y0 = await phone.evaluate(() => scrollY); await toward.click(); await phone.waitForTimeout(50);
      assert.equal(await phone.evaluate(() => scrollY), y0, 'jog click does not move the page');
    }
    const geo = await phone.evaluate(() => { const r = document.querySelector('[data-interactive="edge-finder-zero"]'), c = r.querySelector('.efz-lab .efz-close').getBoundingClientRect(), j = r.querySelector('[data-efz-move="1"]').getBoundingClientRect(), d = r.querySelector('.efz-lab .efz-dro').getBoundingClientRect(), bar = document.querySelector('.appbar').getBoundingClientRect(); return { cTop: c.top, cBottom: c.bottom, jTop: j.top, jBottom: j.bottom, dTop: d.top, bar: bar.bottom, h: innerHeight }; });
    assert.ok(geo.cTop >= geo.bar - 1 && geo.cBottom <= geo.jTop && geo.jBottom <= geo.h, 'contact view fully visible above the jog buttons ' + JSON.stringify(geo));
    assert.ok(geo.dTop >= geo.cBottom - 1, 'readout is not covered by the contact view ' + JSON.stringify(geo));
    assert.equal(await pr.locator('.efz-lab .efz-close').getAttribute('aria-label').then(t => /To trigger|Gap to the trigger point 4\.370/.test(t)), true);
    await phone.screenshot({ path: path.join(out, 'phone-jog-contact-visible-light-390.png') });
    await phone.close();

    // Presentation mode at phone width.
    const pres = await browser.newPage({ viewport: { width: 390, height: 900 } }); watch(pres);
    await pres.goto(url + '?p=mill-setup-and-tooling&present=1', { waitUntil: 'networkidle' }); await openAll(pres);
    for (const r of await pres.locator('[data-interactive="edge-finder-zero"]').all()) {
      assert.equal(await r.evaluate(n => n.scrollWidth <= n.clientWidth + 1), true, 'presentation: no module overflow');
      assert.ok(await r.locator('.efz-lab button').first().evaluate(n => n.getBoundingClientRect().height) >= 44);
    }
    const presJog = pres.locator('[data-interactive="edge-finder-zero"]').first().locator('[data-efz-move="1"]');
    await presJog.evaluate(n => n.scrollIntoView({ block: 'center', behavior: 'instant' })); await pres.waitForTimeout(200);
    await presJog.click(); await presJog.click();
    const pg = await pres.evaluate(() => { const r = document.querySelector('[data-interactive="edge-finder-zero"]'), c = r.querySelector('.efz-lab .efz-close').getBoundingClientRect(), j = r.querySelector('[data-efz-move="1"]').getBoundingClientRect(); return { cTop: c.top, cBottom: c.bottom, jTop: j.top, bar: document.querySelector('.appbar').getBoundingClientRect().bottom }; });
    assert.ok(pg.cTop >= pg.bar - 1 && pg.cBottom <= pg.jTop, 'presentation: contact view visible above the jog buttons ' + JSON.stringify(pg));
    await pres.close();

    // Print: static lesson replaces the lab; PDF for inspection.
    await page.emulateMedia({ media: 'print' });
    assert.equal(await root.locator('.efz-lab').evaluate(n => getComputedStyle(n).display), 'none');
    assert.equal(await root.locator('.efz-static').evaluate(n => getComputedStyle(n).display), 'block');
    await page.pdf({ path: path.join(out, 'mill-indicating-and-zero.pdf'), printBackground: true, format: 'Letter' });
    await page.emulateMedia({ media: 'screen' });

    // Independent extra mount: ids unique and state separate.
    const ready = await page.evaluate(() => { const a = document.querySelector('[data-interactive="edge-finder-zero"]'), b = a.cloneNode(true); b.querySelector('.efz-lab').remove(); b.classList.remove('efz-live'); delete b.dataset.efzReady; a.after(b); const s = document.createElement('script'); s.src = document.querySelector('script[src*="edge-finder-zero/demo.js"]').src; document.body.append(s); return new Promise(res => setTimeout(() => res(document.querySelectorAll('[data-efz-ready]').length), 300)); });
    assert.equal(ready, 3);
    assert.deepEqual(await page.locator('[data-interactive="edge-finder-zero"] [id]').evaluateAll(ns => { const seen = new Set(); return ns.map(n => n.id).filter(id => seen.has(id) || !seen.add(id)); }), []);
    const third = page.locator('[data-interactive="edge-finder-zero"]').nth(1);
    const firstReading = await root.locator('[data-efz-dro="x"]').textContent();
    await third.locator('[data-efz-move="1"]').click();
    assert.equal(await root.locator('[data-efz-dro="x"]').textContent(), firstReading, 'jogging one mount leaves another unchanged');

    // No-JS: the static lesson carries the worked example and the four-side table.
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } }), nj = await noJs.newPage();
    await nj.goto(url, { waitUntil: 'networkidle' }); await openAll(nj);
    const stat = nj.locator('[data-interactive="edge-finder-zero"] .efz-static').first();
    assert.equal(await stat.isVisible(), true);
    assert.match(await stat.textContent(), /Worked example \(left edge, 10 mm contact, r = 5 mm\).*reading \+ r = \+32\.460 \+ 5\.000 = \+37\.460 mm.*15\.000 mm: off by r.*10\.000 mm: off by 2r/s);
    assert.match(await stat.textContent(), /Right edge.*−X.*X = reading − r.*\+5\.000 mm/s);
    assert.match(await nj.locator('[data-interactive="edge-finder-zero"] .efz-static').nth(1).textContent(), /\+37\.500 mm/);
    assert.equal(await nj.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await noJs.close();

    assert.deepEqual(errors, []);
    console.log(`PASS evidence: ${out}${held.length ? `\nHELD (sandbox network, third-party font only): ${[...new Set(held)].join(' | ')}` : ''}`);
  } finally { await browser.close(); }
});
