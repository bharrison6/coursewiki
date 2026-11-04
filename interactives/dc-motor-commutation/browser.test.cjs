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
    assert.match(await text(page, '[data-feedback]'), /^Yes\./);
    assert.match(await text(page, '[data-score]'), /1 of 1/);
    assert.equal(await page.locator(MOUNT + ' .dmcc-live .dmcc-trace .dmcc-curve').count(), 1, 'trace revealed');
    assert.equal(await theta(page), 0);
    await page.click(MOUNT + ' [data-act="nextq"]');
    await page.check(MOUNT + ' [data-choices] input[value="same"]');
    await page.click(MOUNT + ' [data-act="check"]');
    assert.match(await text(page, '[data-feedback]'), /^Not quite\./);
    await page.check(MOUNT + ' [data-choices] input[value="along"]');
    await page.click(MOUNT + ' [data-act="check"]');
    assert.match(await text(page, '[data-score]'), /1 of 2/, 'a retry does not change the first-try score');
    for (let i = 0; i < 2; i += 1) await page.click(MOUNT + ' [data-act="nextq"]');
    await page.check(MOUNT + ' [data-choices] input[value="ripple"]');
    await page.click(MOUNT + ' [data-act="check"]');
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
    assert.match(await text(page, '[data-status]'), /No torque at θ = 180°/);
    await page.locator(MOUNT + ' input[type="range"]').fill('195');
    await page.click(MOUNT + ' [data-act="step"]');
    assert.equal(await theta(page), 180, 'slip-ring torque steps the coil back');
    await context.close();

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
    console.log('PASS: structure, keyboard, 44px targets, commutator run, slip reversal, direction rules, scored predictions, two mounts, reduced-motion steps, phone light/dark, presentation, no-JS static, print media, offline aggregate. Evidence: ' + out);
  } finally { await browser.close(); }
});
