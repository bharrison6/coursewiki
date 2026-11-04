'use strict';
// Run after build-site.ps1 with a case-sensitive static server over docs/:
//   COURSEWIKI_BROWSER_URL=http://127.0.0.1:8787 PLAYWRIGHT_MODULE=<path> node --test interactives/dc-motor-commutation/browser.test.cjs
// Skips without Playwright or a server URL. Screenshots and PDFs go to the OS temp folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { browserURL, skip, launch } = require('../../tests/support/browser.cjs');

const repo = path.resolve(__dirname, '../..');
const MOUNT = '[data-interactive="dc-motor-commutation"]';
// The theme's external web fonts can be unreachable in an offline sandbox; only
// that specific failure is held. Every same-origin failure still fails the test.
const isFontNetworkNoise = m => /Failed to load resource/.test(m.text()) && /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test((m.location() || {}).url || '');

test('dc-motor-commutation browser acceptance', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-dc-motor-commutation-'));
  const base = browserURL.replace(/\/$/, '');
  const pageURL = base + '/engineering/electric-motor-principles.html';
  const browser = await launch();
  const problems = [];
  const watch = page => {
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !isFontNetworkNoise(m)) problems.push('console: ' + m.text() + ' ' + ((m.location() || {}).url || '')); });
    page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) problems.push('HTTP ' + r.status() + ' ' + r.url()); });
  };
  async function open(options = {}, url = pageURL) {
    const context = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 } }, options));
    const page = await context.newPage();
    watch(page);
    await page.goto(url);
    await page.waitForSelector(MOUNT + '[data-dmcc-ready]', { state: 'attached' });
    await page.evaluate(sel => { const d = document.querySelector(sel).closest('details'); if (d) d.open = true; }, MOUNT);
    return { context, page };
  }
  const text = (page, sel) => page.locator(MOUNT).first().locator(sel).innerText();
  const torque = async page => Number((await text(page, '[data-out="torque"]')).replace('−', '-').split(' ')[0]);
  const theta = async page => Number((await text(page, '[data-out="theta"]')).replace('°', ''));
  try {
    // ---- Desktop: page structure, readouts, keyboard ------------------------
    let { context, page } = await open();
    const sections = (fs.readFileSync(path.join(repo, 'collections/engineering/pages/electric-motor-principles.html'), 'utf8').match(/<section[ >]/g) || []).length;
    assert.equal(await page.locator('.xcard').count(), sections);
    assert.equal(await page.evaluate(sel => getComputedStyle(document.querySelector(sel + ' > .dmcc-static')).display, MOUNT), 'none');
    assert.equal(await page.locator(MOUNT + ' .dmcc-live').count(), 1);
    assert.equal(await theta(page), 30);
    assert.equal(await torque(page), 0.5);
    const slider = page.locator(MOUNT + ' input[type="range"]');
    await slider.focus();
    for (let i = 0; i < 60; i += 1) await page.keyboard.press('ArrowRight');
    assert.equal(await theta(page), 90);
    assert.equal(await torque(page), 1);
    await page.keyboard.press('Home');
    assert.equal(await theta(page), 0);
    assert.equal(await torque(page), 0);
    assert.match(await text(page, '[data-out="current"]'), /none/);
    assert.equal(page.url(), pageURL, 'arrow keys inside the slider do not navigate away');

    // Every live control meets the 44 px target.
    const small = await page.evaluate(sel => [...document.querySelectorAll(sel + ' .dmcc-live :is(button, .dmcc-seg label, .dmcc-choices label, input[type=range])')]
      .filter(e => e.offsetParent !== null).map(e => e.getBoundingClientRect()).filter(r => r.height < 43.5 || r.width < 43.5).length, MOUNT);
    assert.equal(small, 0, 'controls at least 44 px');

    // ---- Commutator run: torque never negative, rotor advances -------------
    await page.click(MOUNT + ' [data-act="reset"]');
    await page.click(MOUNT + ' [data-act="run"]');
    const commutated = [];
    for (let i = 0; i < 16; i += 1) { await page.waitForTimeout(120); commutated.push(await torque(page)); }
    await page.click(MOUNT + ' [data-act="run"]');
    assert.ok(commutated.every(v => v >= 0), 'commutated torque never negative: ' + commutated);
    assert.notEqual(await theta(page), 30, 'rotor moved');
    await page.screenshot({ path: path.join(out, 'desktop-commutator-running.png') });

    // ---- Slip rings change the behaviour visibly ---------------------------
    await page.check(MOUNT + ' input[value="slip"]');
    await page.locator(MOUNT + ' input[type="range"]').fill('150');
    await page.click(MOUNT + ' [data-act="run"]');
    const slip = [];
    for (let i = 0; i < 20; i += 1) { await page.waitForTimeout(100); slip.push(await torque(page)); }
    assert.ok(slip.some(v => v < 0) && slip.some(v => v > 0), 'slip-ring torque reverses: ' + slip);
    assert.match(await page.locator(MOUNT + ' .dmcc-live .dmcc-cutaway').getAttribute('aria-label'), /slip rings/);
    await page.click(MOUNT + ' [data-act="reset"]');

    // ---- Direction: reverse I, swap B, both ---------------------------------
    assert.equal(await text(page, '[data-out="sense"]'), 'counterclockwise');
    await page.click(MOUNT + ' [data-act="supply"]');
    assert.equal(await text(page, '[data-out="sense"]'), 'clockwise');
    await page.click(MOUNT + ' [data-act="field"]');
    assert.equal(await text(page, '[data-out="sense"]'), 'counterclockwise');
    assert.equal(await theta(page), 210, 'swapping magnets moves theta (from B) by 180 at a fixed rotor position');
    await page.click(MOUNT + ' [data-act="reset"]');

    // ---- Predictions are scored on the first try ----------------------------
    await page.check(MOUNT + ' [data-choices] input[value="across"]');
    await page.click(MOUNT + ' [data-act="check"]');
    assert.match(await text(page, '[data-verdict]'), /^✓ Yes/);
    assert.match(await text(page, '[data-score]'), /1 of 1/);
    assert.equal(await theta(page), 30, 'checking alone changes nothing in the lab');
    await page.click(MOUNT + ' [data-act="trylab"]');
    assert.equal(await page.locator(MOUNT + ' .dmcc-live .dmcc-trace-figure .dmcc-curve').count(), 1, 'trace revealed');
    assert.equal(await theta(page), 0);
    assert.equal(await page.evaluate(s => document.activeElement === document.querySelector(s + ' [data-act="run"]'), MOUNT), true, 'focus moves to the lab controls');
    // v2 teaching consistency at theta = 0 with the ideal split ring: the lab shows no
    // current and no force at the gap instant, and the feedback says exactly that.
    assert.match(await text(page, '[data-out="current"]'), /none: brushes on the gaps/);
    assert.match(await text(page, '[data-out="force"]'), /^0/);
    const why = await text(page, '[data-feedback]');
    assert.match(why, /brushes on the gaps/);
    assert.match(why, /no current and feels no force/);
    assert.doesNotMatch(why, /still have their full size/);
    assert.match(await text(page, '[data-result-caption]'), /^Result: θ = 10°/);
    assert.match(await page.locator(MOUNT + ' [data-result-figure] svg').getAttribute('aria-label'), /theta 10 degrees/);
    await page.click(MOUNT + ' [data-act="nextq"]');
    await page.check(MOUNT + ' [data-choices] input[value="same"]');
    await page.click(MOUNT + ' [data-act="check"]');
    assert.match(await text(page, '[data-verdict]'), /^✗ Not quite/);
    assert.equal(await page.locator(MOUNT + ' [data-choices] label[data-mark="wrong"]').count(), 1);
    assert.equal(await page.locator(MOUNT + ' [data-choices] label[data-mark="answer"]').count(), 1);
    await page.check(MOUNT + ' [data-choices] input[value="along"]');
    await page.click(MOUNT + ' [data-act="check"]');
    assert.match(await text(page, '[data-score]'), /1 of 2/, 'a retry does not change the first-try score');
    await page.click(MOUNT + ' [data-act="nextq"]');
    await page.check(MOUNT + ' [data-choices] input[value="reverses"]');
    await page.click(MOUNT + ' [data-act="check"]');
    assert.equal(await page.locator(MOUNT + ' [data-act="run"]').getAttribute('aria-pressed'), 'false', 'checking never starts an animation');
    await page.click(MOUNT + ' [data-act="trylab"]');
    assert.equal(await page.locator(MOUNT + ' [data-act="run"]').getAttribute('aria-pressed'), 'false', 'trying in the lab sets up but does not start it');
    assert.match(await text(page, '[data-status]'), /slip rings/);
    await page.click(MOUNT + ' [data-act="nextq"]');
    await page.check(MOUNT + ' [data-choices] input[value="ripple"]');
    await page.click(MOUNT + ' [data-act="check"]');
    await page.click(MOUNT + ' [data-act="trylab"]');
    assert.match(await text(page, '[data-averages]'), /0\.71/);
    assert.match(await text(page, '[data-out="torque"]'), /\(/, 'two-coil torque shows both coils');
    await page.locator(MOUNT).first().screenshot({ path: path.join(out, 'desktop-two-coils-revealed.png') });

    // ---- Independent second mount ------------------------------------------
    await page.evaluate(sel => {
      const r = document.querySelector(sel), c = r.cloneNode(true);
      c.removeAttribute('data-dmcc-ready'); c.querySelector('.dmcc-live').remove(); r.after(c);
      const s = document.createElement('script'); s.src = document.querySelector('script[src*="dc-motor-commutation/demo.js"]').src; document.body.append(s);
    }, MOUNT);
    await page.waitForFunction(sel => document.querySelectorAll(sel + '[data-dmcc-ready]').length === 2, MOUNT);
    const second = page.locator(MOUNT).nth(1);
    assert.equal(await second.locator('[data-out="theta"]').innerText(), '30°');
    await second.locator('[data-act="fwd"]').click();
    assert.equal(await second.locator('[data-out="theta"]').innerText(), '45°');
    assert.match(await text(page, '[data-out="torque"]'), /\(/, 'first mount unchanged');
    assert.equal(await page.evaluate(() => new Set([...document.querySelectorAll('[id]')].map(e => e.id)).size === document.querySelectorAll('[id]').length), true, 'unique DOM ids');
    await context.close();

    // ---- Reduced motion gives step mode -------------------------------------
    ({ context, page } = await open({ reducedMotion: 'reduce' }));
    assert.equal(await page.locator(MOUNT + ' [data-act="run"]').isVisible(), false);
    await page.click(MOUNT + ' [data-act="step"]');
    assert.equal(await theta(page), 45);
    await page.check(MOUNT + ' input[value="slip"]');
    await page.locator(MOUNT + ' input[type="range"]').fill('180');
    await page.click(MOUNT + ' [data-act="step"]');
    assert.match(await text(page, '[data-status]'), /No torque at θ = 180°.*stable rest position/);
    await page.locator(MOUNT + ' input[type="range"]').fill('195');
    await page.click(MOUNT + ' [data-act="step"]');
    assert.equal(await theta(page), 180, 'slip-ring torque steps the coil back');
    // v2: rest-angle explanations come from the torque either side, for the actual polarity.
    const restAt = async deg => { await page.locator(MOUNT + ' input[type="range"]').fill(String(deg)); await page.click(MOUNT + ' [data-act="step"]'); return text(page, '[data-status]'); };
    let msg = await restAt(0);
    assert.match(msg, /unstable/); assert.match(msg, /toward the stable angle, θ = 180°/); assert.doesNotMatch(msg, /points back toward this angle/);
    await page.click(MOUNT + ' [data-act="supply"]');
    msg = await restAt(0);
    assert.match(msg, /stable rest position/); assert.doesNotMatch(msg, /unstable/);
    msg = await restAt(180);
    assert.match(msg, /unstable/); assert.match(msg, /θ = 0°/);
    await page.click(MOUNT + ' [data-act="supply"]');
    await page.click(MOUNT + ' [data-act="field"]');
    msg = await restAt(180);
    assert.match(msg, /stable rest position/, 'with the magnets swapped, theta from B = 180 is still the stable angle for this supply');
    await page.click(MOUNT + ' [data-act="field"]');
    await page.check(MOUNT + ' input[value="commutator"]');
    msg = await restAt(0);
    assert.match(msg, /Dead spot at θ = 0°/); assert.match(msg, /the same way, counter-clockwise/);
    await context.close();

    // ---- v2: every action shows its consequence on screen ------------------
    for (const [width, height] of [[1280, 900], [390, 844]]) {
      ({ context, page } = await open({ viewport: { width, height } }));
      const visible = sel => page.evaluate(s => {
        const e = document.querySelector(s); if (!e) return null;
        const r = e.getBoundingClientRect(), header = document.querySelector('.appbar');
        const top = header ? header.getBoundingClientRect().bottom : 0;
        return { ok: r.height > 0 && r.top >= top - 1 && r.bottom <= innerHeight + 1, top: Math.round(r.top), bottom: Math.round(r.bottom), header: Math.round(top) };
      }, sel);
      // Click Run the normal way (Playwright scrolls it into view): the motor must be fully visible.
      await page.click(MOUNT + ' [data-act="run"]');
      let v = await visible(MOUNT + ' .dmcc-view-end svg');
      assert.ok(v.ok, width + ' end view visible after Run ' + JSON.stringify(v));
      if (width >= 1000) { v = await visible(MOUNT + ' .dmcc-view-cut svg'); assert.ok(v.ok, 'cutaway visible after Run ' + JSON.stringify(v)); }
      assert.ok((await visible(MOUNT + ' [data-status]')).ok, 'status visible after Run');
      await page.screenshot({ path: path.join(out, 'v2-after-run-' + width + 'x' + height + '.png') });
      await page.click(MOUNT + ' [data-act="run"]');
      // A reading position: the lab's setup at the top of the screen, then Run.
      await page.evaluate(s => { const e = document.querySelector(s + ' .dmcc-setup'); scrollTo(0, scrollY + e.getBoundingClientRect().top - 70); }, MOUNT);
      await page.click(MOUNT + ' [data-act="step"]');
      assert.ok((await visible(MOUNT + ' .dmcc-view-end svg')).ok, width + ' end view visible after Step from reading position');
      // Check a prediction the normal way: the result figure and verdict must be on screen.
      await page.check(MOUNT + ' [data-choices] input[value="along"]');
      await page.click(MOUNT + ' [data-act="check"]');
      for (const sel of [' [data-result-figure] svg', ' [data-verdict]']) {
        v = await visible(MOUNT + sel);
        assert.ok(v.ok, width + sel + ' visible after Check ' + JSON.stringify(v));
      }
      await page.screenshot({ path: path.join(out, 'v2-after-check-' + width + 'x' + height + '.png') });
      await page.click(MOUNT + ' [data-act="trylab"]');
      await page.waitForTimeout(900); // the requested smooth scroll
      assert.ok((await visible(MOUNT + ' .dmcc-view-end svg')).ok, width + ' lab view visible after Try this in the lab ' + JSON.stringify(await visible(MOUNT + ' .dmcc-view-end svg')));
      assert.ok((await visible(MOUNT + ' [data-act="run"]')).ok);
      await page.screenshot({ path: path.join(out, 'v2-after-trylab-' + width + 'x' + height + '.png') });
      if (width < 1000) {
        // Narrow: one view at a time, chosen by the learner.
        assert.equal(await page.locator(MOUNT + ' .dmcc-view-cut').isVisible(), false);
        await page.check(MOUNT + ' input[value="cut"]');
        assert.equal(await page.locator(MOUNT + ' .dmcc-view-cut').isVisible(), true);
        assert.equal(await page.locator(MOUNT + ' .dmcc-view-end').isVisible(), false);
      }
      await context.close();
    }

    // ---- Phone widths, both themes; presentation mode ------------------------
    for (const scheme of ['light', 'dark']) {
      ({ context, page } = await open({ viewport: { width: 390, height: 844 }, colorScheme: scheme }));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), scheme + ' phone overflow');
      await page.locator(MOUNT).first().screenshot({ path: path.join(out, 'phone-' + scheme + '.png') });
      await context.close();
    }
    ({ context, page } = await open({}, pageURL + '?p=electric-motors&present=1'));
    assert.equal(await page.evaluate(() => document.body.classList.contains('presenting')), true);
    await page.locator(MOUNT).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'presentation.png') });
    await context.close();

    // ---- No JavaScript: the static lesson is the teaching ---------------------
    ({ context } = { context: await browser.newContext({ javaScriptEnabled: false }) });
    page = await context.newPage();
    await page.goto(pageURL);
    await page.evaluate(sel => document.querySelector(sel).closest('details').open = true, MOUNT).catch(() => {});
    const staticInfo = await page.$eval(MOUNT, r => ({ live: r.querySelectorAll('.dmcc-live').length, svgs: r.querySelectorAll('.dmcc-static svg').length, text: r.textContent }));
    assert.equal(staticInfo.live, 0);
    assert.equal(staticInfo.svgs, 3, 'two views and the torque-angle figure');
    assert.match(staticInfo.text, /τ = N·B·I·A·sin θ/);
    assert.match(staticInfo.text, /0\.024 N·m/);
    assert.match(staticInfo.text, /Whenever current flows/);
    assert.match(staticInfo.text, /brushes sit on the gaps at that instant/);
    await context.close();

    // ---- Print: static figures replace the live lab --------------------------
    ({ context, page } = await open());
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.$eval(MOUNT + ' .dmcc-live', e => getComputedStyle(e).display), 'none');
    assert.equal(await page.$eval(MOUNT + ' > .dmcc-static', e => getComputedStyle(e).display), 'block');
    fs.writeFileSync(path.join(out, 'electric-motor-principles.pdf'), await page.pdf({ format: 'Letter', printBackground: true }));
    await context.close();

    // ---- Offline aggregate inlines and initializes the module -----------------
    const aggregate = fs.readFileSync(path.join(repo, 'docs/print/track-electric-motors.html'), 'utf8');
    assert.ok(aggregate.includes('CourseWikiCommutation') && aggregate.includes('DC-MOTOR-COMMUTATION-TRACE'));
    ({ context, page } = await open({}, base + '/print/track-electric-motors.html'));
    assert.equal(await page.locator(MOUNT + '[data-dmcc-ready]').count(), 1);
    await context.close();

    assert.deepEqual(problems, []);
    console.log('PASS: structure, keyboard, 44px targets, commutator run, slip reversal, direction rules, scored predictions, theta-0 gap consistency, polarity-derived rest messages, Run/Step/Check/Try-in-lab outcomes on screen at 1280x900 and 390x844, two mounts, reduced-motion steps, phone light/dark, presentation, no-JS static, print media, offline aggregate. Evidence: ' + out);
  } finally { await browser.close(); }
});
