'use strict';
// Browser acceptance for the chain chordal-action lab. Run after build-site.ps1, with a static
// server over docs/ and the shared browser environment (see tests/support/browser.cjs):
//   COURSEWIKI_BROWSER_URL=http://127.0.0.1:8787 node --test interactives/chain-chordal-action/browser.test.cjs
// Skips without Playwright or COURSEWIKI_BROWSER_URL. Screenshots and PDFs go to the OS temp
// folder (or CC_EVIDENCE_DIR when set), never into the repository.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { browserURL, skip, launch } = require('../../tests/support/browser.cjs');

const ROOT = '[data-interactive="chain-chordal-action"]';
const LAB = ROOT + ' .cc-lab';
// Web fonts load from fonts.googleapis.com; an offline or TLS-intercepted sandbox refuses them.
// That failure is environmental and identical on unchanged pages, so it is held, not counted.
const HELD = /fonts\.googleapis\.com|ERR_CERT_AUTHORITY_INVALID/;

test('chain chordal-action lab in the browser', { skip, timeout: 240000 }, async () => {
  const out = process.env.CC_EVIDENCE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-chain-chordal-'));
  fs.mkdirSync(out, { recursive: true });
  const base = browserURL.replace(/\/$/, ''), url = base + '/engineering/chain-drives.html';
  const browser = await launch();
  const errors = [], held = [];
  const evidence = [];
  async function open(opts, target) {
    const o = Object.assign({ viewport: { width: 1280, height: 900 } }, opts || {}), noScript = o.noScript;
    delete o.noScript;
    const ctx = await browser.newContext(o);
    const page = await ctx.newPage();
    // Page scripts off, as for a no-JS reader; protocol-level evaluation still inspects the DOM.
    if (noScript) await (await ctx.newCDPSession(page)).send('Emulation.setScriptExecutionDisabled', { value: true });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') (HELD.test(m.text()) ? held : errors).push(m.text()); });
    page.on('requestfailed', r => { (HELD.test(r.url() + r.failure().errorText) ? held : errors).push(r.url() + ' ' + r.failure().errorText); });
    await page.goto(target || url);
    await page.evaluate(sel => { document.querySelectorAll(sel).forEach(m => { const d = m.closest('details'); if (d) d.open = true; }); }, ROOT);
    return { ctx, page };
  }
  async function shot(page, name, viewport) {
    const file = path.join(out, name + '.png');
    if (viewport) { await page.screenshot({ path: file }); evidence.push(file); return; }
    await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'start' }), ROOT);
    // Keep the sticky site header from covering the element capture.
    await page.evaluate(() => document.querySelectorAll('body > header, .topbar').forEach(h => { h.style.position = 'static'; }));
    const box = await page.$eval(ROOT, e => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; });
    await page.screenshot({ path: file, fullPage: true, clip: box });
    evidence.push(file);
  }
  const text = (page, sel) => page.$eval(ROOT + ' ' + sel, e => e.textContent);
  // The rendered hub must sit where the layout puts the sprocket centre (catches a nested
  // drive viewport being rescaled by CSS, which shifts the whole mechanism off its gauge).
  async function hubPlaced(page, scope) {
    const lay = { wide: require('./render.js').layout(640), compact: require('./render.js').layout(420) };
    return page.$$eval(scope + ' .cc-scene', (scenes, lay) => scenes.filter(s => s.checkVisibility()).map(s => {
      const box = s.getBoundingClientRect(), k = box.width / s.viewBox.baseVal.width, hub = s.querySelector('.cc-hub').getBoundingClientRect();
      const L = s.viewBox.baseVal.width >= 560 ? lay.wide : lay.compact, cx = L.cx, cy = L.cy;
      return Math.hypot(hub.left + hub.width / 2 - (box.left + cx * k), hub.top + hub.height / 2 - (box.top + cy * k)) < 1.5;
    }), lay);
  }
  try {
    // ---- desktop, light: initial state, controls, trace, prediction ----
    let { ctx, page } = await open({ colorScheme: 'light' });
    assert.equal(await page.$eval(ROOT, e => e.dataset.ccReady), 'true');
    assert.equal(await page.$eval(ROOT + ' > .cc-static', e => e.checkVisibility()), false, 'static hidden when live');
    assert.match(await text(page, '[data-cc-r="ripple"]'), /^6\.03 %$/);
    assert.match(await text(page, '[data-cc-r="rise"]'), /^1\.12 mm$/);
    assert.deepEqual(await hubPlaced(page, LAB), [true], 'live hub placement');
    await shot(page, 'chain-desktop-initial-light');

    const before = { chain: await page.$eval(LAB + ' g[data-cc-chain]', e => e.innerHTML), trace: await page.$eval(LAB + ' .cc-trace', e => e.getAttribute('d')) };
    await page.$eval(ROOT + ' [data-cc-teeth]', e => { e.value = '21'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.match(await text(page, '[data-cc-r="ripple"]'), /^1\.12 %$/);
    assert.match(await text(page, '[data-cc-out="teeth"]'), /21 teeth/);
    assert.notEqual(await page.$eval(LAB + ' g[data-cc-chain]', e => e.innerHTML), before.chain, 'drawing follows N');
    assert.notEqual(await page.$eval(LAB + ' .cc-trace', e => e.getAttribute('d')), before.trace, 'trace follows N');
    assert.equal(await page.$$eval(LAB + ' .cc-sprocket', e => e.length), 1);

    // keyboard: arrow keys move the tooth slider and do not reach the page's presentation keys
    const href = page.url();
    await page.focus(ROOT + ' [data-cc-teeth]');
    await page.keyboard.press('ArrowRight');
    assert.match(await text(page, '[data-cc-out="teeth"]'), /22 teeth/);
    await page.keyboard.press('ArrowLeft');
    assert.equal(page.url(), href);
    await page.click(ROOT + ' [data-cc-inc]');
    assert.match(await text(page, '[data-cc-out="teeth"]'), /22 teeth/);

    // turn by hand: a hand-over (±half tooth) gives v/v_max = cos(180°/N)
    await page.$eval(ROOT + ' [data-cc-hand]', e => { e.value = '50'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    const ratio = Number(await page.$eval(ROOT, e => e.dataset.ccSpeedRatio));
    assert.ok(Math.abs(ratio - Math.cos(Math.PI / 22)) < 1e-6, 'hand-over speed ratio');

    // run animates; pause stops
    await page.click(ROOT + ' [data-cc-run]');
    const p0 = Number(await page.$eval(ROOT, e => e.dataset.ccPhase));
    await page.waitForTimeout(700);
    const p1 = Number(await page.$eval(ROOT, e => e.dataset.ccPhase));
    assert.ok(p1 > p0 + 0.3, 'phase advances while running (' + p0 + ' → ' + p1 + ')');
    await page.click(ROOT + ' [data-cc-run]');
    const p2 = Number(await page.$eval(ROOT, e => e.dataset.ccPhase));
    await page.waitForTimeout(400);
    assert.equal(Number(await page.$eval(ROOT, e => e.dataset.ccPhase)), p2, 'paused');

    // prediction is scored, then both traces are overlaid
    await page.check(ROOT + ' [data-cc-guess="9"][value="2to10"]');
    await page.check(ROOT + ' [data-cc-guess="21"][value="under2"]');
    await page.click(ROOT + ' [data-cc-check]');
    assert.match(await text(page, '[data-cc-score]'), /2 of 2 in the right band/);
    assert.match(await text(page, '[data-cc-lines]'), /9 teeth: 6\.03 %.*21 teeth: 1\.12 %/);
    assert.equal(await page.$eval(LAB + ' [data-cc-questions]', e => e.hidden), true, 'result replaces the questions');
    assert.equal(await page.$$eval(LAB + ' [data-cc-preview] .cc-trace-compare:not(.cc-legend)', e => e.length), 2, 'local comparison preview');
    assert.equal(await page.$$eval(LAB + ' [data-cc-trace] .cc-trace-compare:not(.cc-legend)', e => e.length), 2, 'both traces pinned on the live trace');
    assert.match(await text(page, '[data-cc-out="teeth"]'), /9 teeth/);
    await page.waitForTimeout(500);
    await shot(page, 'chain-desktop-prediction-light');
    await page.click(ROOT + ' [data-cc-again]');
    assert.equal(await page.$eval(LAB + ' [data-cc-questions]', e => e.hidden), false);
    await page.check(ROOT + ' [data-cc-guess="9"][value="over10"]');
    await page.check(ROOT + ' [data-cc-guess="21"][value="2to10"]');
    await page.click(ROOT + ' [data-cc-check]');
    assert.match(await text(page, '[data-cc-score]'), /0 of 2 in the right band/);
    await page.click(ROOT + ' [data-cc-clear]');
    assert.equal(await page.$$eval(LAB + ' [data-cc-trace] .cc-trace-compare:not(.cc-legend)', e => e.length), 0);

    // pitch circle ghost
    await page.click(ROOT + ' [data-cc-run]');
    await page.check(ROOT + ' [data-cc-ghost]');
    assert.ok(await page.$$eval(LAB + ' .cc-ghost', e => e.length) >= 2);
    assert.equal(await page.$$eval(LAB + ' .cc-trace-ghost:not(.cc-legend)', e => e.length), 1, 'ghost line in the trace');
    assert.equal(await page.$$eval(LAB + ' .cc-trace-ghost.cc-legend', e => e.length), 1, 'ghost legend');
    // speed and pitch do not change the ripple percentage
    await page.selectOption(ROOT + ' [data-cc-pitch]', '100');
    await page.$eval(ROOT + ' [data-cc-rpm]', e => { e.value = '600'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.match(await text(page, '[data-cc-r="ripple"]'), /^6\.03 %$/);
    assert.match(await text(page, '[data-cc-r="pulse"]'), /^90 per second$/);
    await page.click(ROOT + ' [data-cc-reset]');
    assert.match(await text(page, '[data-cc-r="ripple"]'), /^6\.03 %$/);
    assert.equal(await page.$eval(ROOT + ' [data-cc-ghost]', e => e.checked), false);

    // independent second mount
    await page.evaluate(sel => {
      const r = document.querySelector(sel), c = r.cloneNode(true);
      c.querySelector('.cc-lab').remove(); delete c.dataset.ccReady; c.classList.remove('cc-live'); r.after(c);
      const s = document.createElement('script'); s.src = document.querySelector('script[src*="chain-chordal-action/demo.js"]').src; document.body.append(s);
    }, ROOT);
    await page.waitForFunction(sel => document.querySelectorAll(sel + '[data-cc-ready]').length === 2, ROOT);
    const ids = await page.$$eval(ROOT + ' [id]', e => e.map(x => x.id));
    assert.equal(new Set(ids).size, ids.length, 'unique ids across mounts');
    await page.$$eval(ROOT + ' [data-cc-teeth]', e => { e[1].value = '30'; e[1].dispatchEvent(new Event('input', { bubbles: true })); });
    const outs = await page.$$eval(ROOT + ' [data-cc-out="teeth"]', e => e.map(x => x.textContent));
    assert.deepEqual(outs, ['9 teeth', '30 teeth'], 'mounts are independent');
    await page.evaluate(sel => document.querySelectorAll(sel)[1].remove(), ROOT);

    // print: lab hidden, static shown, PDF written
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.$eval(ROOT + ' .cc-lab', e => getComputedStyle(e).display), 'none');
    assert.equal(await page.$eval(ROOT + ' > .cc-static', e => getComputedStyle(e).display), 'grid');
    // Printed with print media (as a reader's Print command would), cards opened as app.js does on beforeprint.
    await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
    const pdf = path.join(out, 'chain-drives-page-print.pdf');
    await page.pdf({ path: pdf, format: 'Letter', printBackground: true });
    evidence.push(pdf);
    await page.emulateMedia({ media: 'screen' });
    await ctx.close();

    // ---- desktop dark, with ghost and a few steps ----
    ({ ctx, page } = await open({ colorScheme: 'dark' }));
    await page.check(ROOT + ' [data-cc-ghost]');
    for (let i = 0; i < 3; i++) await page.click(ROOT + ' [data-cc-step]');
    assert.ok(Math.abs(Number(await page.$eval(ROOT, e => e.dataset.ccPhase)) - 0.375) < 1e-9, 'three eighth-tooth steps');
    await shot(page, 'chain-desktop-ghost-dark');
    await ctx.close();

    // ---- paired view: ordinary clicks keep the changing pin/span, gauge and the clicked control in view ----
    // Clicks are real Playwright clicks (they scroll a control into view only if needed). The second pass
    // first parks each control on the bottom edge of the viewport, the far case for a reader scrolling down.
    for (const vp of [{ width: 390, height: 844, isMobile: true, hasTouch: true }, { width: 1280, height: 900 }]) {
      for (const edge of [false, true]) {
        ({ ctx, page } = await open({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch }));
        await page.waitForTimeout(200);
        const seen = sels => page.evaluate(([lab, list]) => {
          const top = document.querySelector('.appbar').getBoundingClientRect().bottom, h = innerHeight;
          return list.map(s => { const e = document.querySelector(lab + ' ' + s); if (!e) return s + ': missing';
            const r = e.getBoundingClientRect(); return r.height > 0 && r.top >= top - 1 && r.bottom <= h + 1 ? 'ok' : s + ': ' + Math.round(r.top) + '..' + Math.round(r.bottom); });
        }, [LAB, sels]);
        const park = sel => edge && page.$eval(LAB + ' ' + sel, e => e.scrollIntoView({ block: 'end', behavior: 'instant' }));
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await park('[data-cc-inc]');
        await page.click(LAB + ' [data-cc-inc]');
        assert.match(await text(page, '[data-cc-out="teeth"]'), /10 teeth/);
        assert.deepEqual(await seen(['.cc-pin-leave', '.cc-gauge-dot', '[data-cc-inc]', '[data-cc-quick]']), ['ok', 'ok', 'ok', 'ok'], vp.width + (edge ? ' edge' : '') + ': tooth click');
        if (!edge) await shot(page, 'chain-v2-paired-tooth-click-' + vp.width, true);
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await park('[data-cc-hand]');
        const size = await page.$eval(LAB + ' [data-cc-hand]', e => ({ w: e.offsetWidth, h: e.offsetHeight }));
        await page.click(LAB + ' [data-cc-hand]', { position: { x: size.w * 0.8, y: size.h / 2 } });
        assert.notEqual(await text(page, '[data-cc-out="hand"]'), 'pin at top', 'hand slider moved by a click');
        assert.deepEqual(await seen(['.cc-pin-leave', '.cc-gauge-dot', '[data-cc-hand]']), ['ok', 'ok', 'ok'], vp.width + (edge ? ' edge' : '') + ': hand click');
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await page.click(LAB + ' [data-cc-guess="9"][value="2to10"]');
        await page.click(LAB + ' [data-cc-guess="21"][value="under2"]');
        await park('[data-cc-check]');
        await page.click(LAB + ' [data-cc-check]');
        await page.waitForTimeout(150);
        const after = await seen(['[data-cc-score]', '[data-cc-preview] svg', '[data-cc-again]']);
        assert.deepEqual(after.slice(0, 2), ['ok', 'ok'], vp.width + (edge ? ' edge' : '') + ': score and comparison visible after Check');
        if (!edge) {
          assert.equal(after[2], 'ok', vp.width + ': Change my answers visible after Check');
          await shot(page, 'chain-v2-check-result-' + vp.width, true);
        }
        await ctx.close();
      }
    }

    // ---- reduced motion: no running animation, stepping only ----
    ({ ctx, page } = await open({ reducedMotion: 'reduce' }));
    assert.equal(await page.$eval(ROOT + ' [data-cc-run]', e => e.hidden), true);
    assert.match(await text(page, '[data-cc-anim]'), /Reduced motion/);
    await page.click(ROOT + ' [data-cc-step]');
    const r0 = Number(await page.$eval(ROOT, e => e.dataset.ccPhase));
    await page.waitForTimeout(500);
    assert.equal(Number(await page.$eval(ROOT, e => e.dataset.ccPhase)), r0);
    assert.equal(r0, 0.125);
    await ctx.close();

    // ---- phone 390 px, light and dark: no overflow, readable text, 44 px targets ----
    for (const theme of ['light', 'dark']) {
      ({ ctx, page } = await open({ viewport: { width: 390, height: 844 }, colorScheme: theme, isMobile: true, hasTouch: true }));
      await page.waitForTimeout(200);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), theme + ': page overflow');
      assert.ok(await page.$eval(ROOT, e => e.scrollWidth <= e.clientWidth), theme + ': module overflow');
      assert.ok(await page.$eval(LAB + ' .cc-scene', e => e.viewBox.baseVal.width === 420), 'compact drawing');
      const small = await page.$$eval(ROOT + ' .cc-lab svg text', els => els.map(t => {
        const svg = t.ownerSVGElement, k = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        return parseFloat(getComputedStyle(t).fontSize) * k;
      }).filter(px => px < 11.5));
      assert.deepEqual(small, [], theme + ': scaled SVG text under 11.5 px');
      const tiny = await page.$$eval(ROOT + ' .cc-lab :is(button, select, input[type="range"], .cc-choices label, .cc-toggle)', els =>
        els.filter(e => e.checkVisibility() && e.getBoundingClientRect().height < 44).map(e => e.outerHTML.slice(0, 60)));
      assert.deepEqual(tiny, [], theme + ': targets under 44 px');
      assert.deepEqual(await hubPlaced(page, LAB), [true], 'phone hub placement');
      await shot(page, 'chain-phone-initial-' + theme);
      await ctx.close();
    }

    // ---- presentation mode inside the drives track ----
    ({ ctx, page } = await open({ viewport: { width: 1600, height: 900 } }, url + '?p=belt-chain-and-gear-drives&present=1'));
    assert.equal(await page.evaluate(() => document.body.classList.contains('presenting')), true);
    await page.evaluate(sel => document.querySelector(sel).closest('.xcard').scrollIntoView({ block: 'start', behavior: 'instant' }), ROOT);
    await page.waitForTimeout(900);
    assert.ok(await page.evaluate(sel => Math.abs(document.querySelector(sel).closest('.xcard').getBoundingClientRect().top) < 80, ROOT), 'lab panel in view');
    assert.equal(await page.$eval(LAB + ' .cc-scene', e => e.viewBox.baseVal.width), 640, 'wide drawing on a projector');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'presentation overflow');
    evidence.push(path.join(out, 'chain-presentation-light.png'));
    await page.screenshot({ path: evidence[evidence.length - 1] });
    await ctx.close();

    // ---- JavaScript off: complete static teaching ----
    ({ ctx, page } = await open({ noScript: true }));
    assert.equal(await page.$eval(ROOT + ' .cc-static', e => e.checkVisibility()), true);
    assert.equal(await page.$(ROOT + ' .cc-lab'), null);
    const fallback = await page.$eval(ROOT + ' .cc-static', e => e.textContent);
    for (const s of ['1 − cos(180°/N)', '6.03 %', '1.12 %', 'Worked example']) assert.ok(fallback.includes(s), s);
    assert.equal(await page.$$eval(ROOT + ' .cc-table tbody tr', e => e.length), 11);
    assert.deepEqual(await hubPlaced(page, ROOT + ' .cc-static'), [true, true], 'static hub placement');
    await shot(page, 'chain-nojs-static-light');
    await page.emulateMedia({ media: 'print' });
    const nojsPdf = path.join(out, 'chain-drives-nojs-print.pdf');
    await page.pdf({ path: nojsPdf, format: 'Letter', printBackground: true });
    evidence.push(nojsPdf);
    await ctx.close();

    // ---- offline track aggregate: the same module inlined once, live and printable ----
    ({ ctx, page } = await open({}, base + '/print/track-belt-chain-and-gear-drives.html'));
    assert.equal(await page.$$eval(ROOT, e => e.length), 1);
    assert.equal(await page.$eval(ROOT, e => e.dataset.ccReady), 'true');
    await page.emulateMedia({ media: 'print' });
    const agg = path.join(out, 'chain-track-aggregate-print.pdf');
    await page.pdf({ path: agg, format: 'Letter', printBackground: true });
    evidence.push(agg);
    await ctx.close();

    assert.deepEqual(errors, [], 'browser errors');
    fs.writeFileSync(path.join(out, 'browser-evidence.json'), JSON.stringify({ url, evidence, held: Array.from(new Set(held)) }, null, 2));
    console.log('Evidence: ' + out + (held.length ? ' (held environmental: ' + Array.from(new Set(held)).length + ' font request failure kinds)' : ''));
  } finally { await browser.close(); }
});
