'use strict';
// Browser checks for the tensile-test lab. Opt-in: needs Playwright and COURSEWIKI_BROWSER_URL (a server over docs/).
// Evidence (screenshots, PDFs) goes to the OS temp folder, never the repo.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const B = require('../../tests/support/browser.cjs');
const evidence = process.env.TENSILE_EVIDENCE_DIR || path.join(os.tmpdir(), 'coursewiki-tensile-test');
const baseURL = (B.browserURL || '').replace(/\/+$/, '');
const pageURL = baseURL + '/materials-and-processes/metals-and-their-properties.html';
const FONT = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

async function newPage(browser, opts) {
  const context = await browser.newContext(opts);
  // The shared optional web-font request is answered locally so a sandbox without that host adds no noise.
  await context.route(FONT, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { context, page, errors };
}
async function openLab(page, present) {
  const response = await page.goto(pageURL + (present ? '?p=metals-and-heat-treatment&present=1' : ''));
  assert.equal(response.status(), 200);
  await page.evaluate(() => document.querySelectorAll('details.xcard').forEach(n => { n.open = true; }));
  const lab = page.locator('.tt-lab').first();
  await lab.waitFor();
  return lab;
}
const num = async (lab, key) => parseFloat((await lab.locator('[data-r="' + key + '"]').textContent()).replace(/[^0-9.\-]/g, ''));
// Presentation mode snaps panels and keeps a fixed track bar at the bottom; bring a control to mid-screen first.
async function press(locator) { await locator.evaluate(n => n.scrollIntoView({ block: 'center', behavior: 'instant' })); await locator.click(); }
const shot = (target, name) => target.screenshot({ path: path.join(evidence, name + '.png') });
async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 ||
    [...document.querySelectorAll('.tt-lab *')].some(n => { const r = n.getBoundingClientRect(); return r.width > 0 && !n.closest('.tt-tablewrap') && (r.left < -1 || r.right > window.innerWidth + 1); }));
}
// Every label must sit inside its own drawing; text cut off by the SVG edge is a defect even when the page does not overflow.
async function clippedText(page, scope) {
  return page.evaluate(sel => [...document.querySelectorAll(sel + ' svg text')].filter(n => n.getBoundingClientRect().width > 0).filter(n => {
    const r = n.getBoundingClientRect(), s = n.ownerSVGElement.getBoundingClientRect();
    return r.left < s.left - 1 || r.right > s.right + 1 || r.top < s.top - 1 || r.bottom > s.bottom + 1;
  }).map(n => n.textContent), scope || '.tt-lab');
}
async function smallTargets(page) {
  return page.evaluate(() => [...document.querySelectorAll('.tt-lab :is(button, select, input[type=range], input[type=number], summary)')]
    .filter(n => n.offsetParent !== null).map(n => [n.outerHTML.slice(0, 60), n.getBoundingClientRect().height]).filter(x => x[1] < 43.5));
}

test('stretch, neck after the peak, scored unload prediction, fracture and the brittle curve across widths, themes and modes', { skip: B.skip }, async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await B.launch();
  try {
    for (const width of [1280, 390]) for (const theme of ['light', 'dark']) for (const present of [false, true]) {
      const tag = width + '-' + theme + '-' + (present ? 'present' : 'read');
      const { context, page, errors } = await newPage(browser, { viewport: { width, height: 1000 }, colorScheme: theme });
      const lab = await openLab(page, present);
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
      const spec = lab.locator('[data-tt-stage] svg.tt-specimen');
      assert.equal(await spec.getAttribute('data-neck'), '0');
      assert.equal(await num(lab, 'stress'), 0);
      assert.deepEqual(await smallTargets(page), [], tag + ' 44 px targets');
      assert.equal(await overflow(page), false, tag + ' overflow');
      await shot(lab, 'lab-initial-' + tag);
      // Neck appears only after the peak (UTS), on either side of the slider position of the peak.
      const u = await page.evaluate(() => { const M = window.CourseWikiTensileTest, c = M.curveById('ductile'); return M.sliderAt(c, M.peak(c).strain) * 1000; });
      const slider = lab.locator('[data-tt-slider]');
      await slider.fill(String(Math.floor(u)));
      assert.equal(await spec.getAttribute('data-neck'), '0', tag + ' no neck before the peak');
      assert.equal(await lab.locator('[data-tt-mark="uts"]').count(), 0);
      await slider.fill(String(Math.ceil(u) + 2));
      assert.equal(await spec.getAttribute('data-neck'), '1', tag + ' neck after the peak');
      assert.ok(await lab.locator('[data-tt-mark="uts"]').count() >= 1);
      assert.deepEqual(await clippedText(page), [], tag + ' labels inside drawings (necking)');
      await shot(lab, 'lab-necking-' + tag);
      // Unload and predict from the displayed readouts: a correct answer is scored as a match.
      await press(lab.locator('[data-tt-reset]'));
      await slider.fill('600');
      const strain = await num(lab, 'strain'), stress = await num(lab, 'stress');
      assert.equal(await lab.locator('[data-tt-unload]').count(), 0, 'unload line hidden until unloading');
      await press(lab.locator('[data-tt-predict]'));
      const guess = lab.locator('[data-tt-guess]');
      assert.equal(await guess.evaluate(n => n === document.activeElement), true, 'focus moves to the prediction');
      await guess.fill((strain - stress / 200000 * 100).toFixed(3));
      assert.deepEqual(await smallTargets(page), [], tag + ' 44 px targets with the prediction open');
      await shot(lab, 'lab-predict-' + tag);
      await page.keyboard.press('Enter');
      await lab.locator('[data-tt-feedback][data-result]').waitFor();
      await page.waitForFunction(() => document.querySelector('[data-interactive="tensile-test"]').dataset.ttStage === 'slack');
      assert.match(await lab.locator('[data-tt-feedback]').textContent(), /Prediction matches/);
      assert.equal(await num(lab, 'stress'), 0);
      assert.ok(await lab.locator('[data-tt-unload]').count() >= 1, 'unload line drawn');
      assert.ok(await lab.locator('[data-tt-set]').count() >= 1 && await lab.locator('[data-tt-pred]').count() >= 1);
      assert.match(await lab.locator('[data-tt-score]').textContent(), /1 of 1/);
      await shot(lab, 'lab-unloaded-match-' + tag);
      // Ignoring the elastic spring-back is not scored as correct.
      await slider.fill('700');
      const s2 = await num(lab, 'strain');
      await press(lab.locator('[data-tt-predict]'));
      await guess.fill(String(s2));
      await press(lab.locator('[data-tt-check]'));
      await lab.locator('[data-tt-feedback][data-result]').waitFor();
      assert.doesNotMatch(await lab.locator('[data-tt-feedback]').textContent(), /Prediction matches/);
      assert.match(await lab.locator('[data-tt-score]').textContent(), /1 of 2/);
      // Fracture, then the brittle curve: no neck, no offset yield, and the UI says undefined rather than zero.
      await page.waitForFunction(() => document.querySelector('[data-interactive="tensile-test"]').dataset.ttStage === 'slack');
      await slider.fill('1000');
      assert.equal(await spec.getAttribute('data-fractured'), '1');
      assert.match(await lab.locator('[data-tt-found]').textContent(), /Elongation after fracture29\.8%/);
      assert.equal(await slider.isDisabled(), true);
      assert.deepEqual(await clippedText(page), [], tag + ' labels inside drawings (ductile fracture)');
      await shot(lab, 'lab-fractured-ductile-' + tag);
      await lab.locator('[data-tt-curve]').selectOption('brittle');
      await slider.fill('1000');
      assert.equal(await spec.getAttribute('data-neck'), '0');
      assert.match(await lab.locator('[data-tt-found]').textContent(), /None: fractured before the offset line met the curve \(undefined, not zero\)/);
      assert.equal(await lab.locator('[data-tt-mark="yield"]').count(), 0);
      assert.deepEqual(await clippedText(page), [], tag + ' labels inside drawings (brittle fracture)');
      for (const id of ['alloy', 'polymer']) {
        await lab.locator('[data-tt-curve]').selectOption(id);
        await slider.fill('1000');
        assert.deepEqual(await clippedText(page), [], tag + ' labels inside drawings (' + id + ')');
        if (width === 1280 && !present) await shot(lab, 'lab-fractured-' + id + '-' + tag);
      }
      await lab.locator('[data-tt-curve]').selectOption('brittle');
      await slider.fill('1000');
      await shot(lab, 'lab-fractured-brittle-' + tag);
      assert.equal(await overflow(page), false, tag + ' overflow after use');
      assert.deepEqual(errors, [], tag + ' page errors');
      await context.close();
    }
  } finally { await browser.close(); }
});

test('ordinary keyboard flow keeps the unloading demonstration beside the answer at 390x844 and 1280x900', { skip: B.skip }, async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await B.launch();
  try {
    for (const [width, height] of [[390, 844], [1280, 900]]) for (const pages of [3, 7]) {
      const tag = width + 'x' + height + '-pageup' + pages;
      const { context, page, errors } = await newPage(browser, { viewport: { width, height } });
      assert.equal((await page.goto(pageURL)).status(), 200);
      // Open the card the way a reader does: click its heading.
      const card = page.locator('details.xcard').filter({ has: page.locator('[data-interactive="tensile-test"]') });
      await card.locator(':scope > summary').click();
      const lab = card.locator('.tt-lab');
      await lab.locator('[data-tt-slider]').focus();
      for (let i = 0; i < pages; i++) await page.keyboard.press('PageUp');
      assert.ok(await num(lab, 'strain') > 0);
      if (pages === 3) { // 0.926 % strain on specimen A: on the level yield plateau, not strain hardening
        assert.equal(await num(lab, 'stress'), 250);
        const status = await lab.locator('[data-tt-status]').textContent();
        assert.match(status, /stays level/); assert.doesNotMatch(status, /rises|hardens/);
        assert.equal(await lab.locator('[data-r="stage"]').textContent(), 'Yield plateau');
      }
      await lab.locator('[data-tt-predict]').click();
      assert.equal(await lab.locator('[data-tt-guess]').evaluate(n => n === document.activeElement), true, tag + ' focus in the answer box');
      await page.keyboard.type('0');
      // Let Playwright's own (smooth) scroll-to-target settle first, so any later movement would be the lab's.
      await lab.locator('[data-tt-check]').scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
      await lab.locator('[data-tt-check]').click();
      const panelTop = () => page.evaluate(() => Math.round(document.querySelector('[data-tt-predictbox]').getBoundingClientRect().top));
      const topAtClick = await panelTop();
      const inView = async (what) => {
        const res = await page.evaluate(() => {
          const top = (document.querySelector('.appbar') || { getBoundingClientRect: () => ({ bottom: 0 }) }).getBoundingClientRect().bottom;
          const box = sel => { const r = document.querySelector(sel).getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
          const items = { specimen: box('[data-tt-uv] .tt-specimen'), plot: box('[data-tt-uv] .tt-plot'), feedback: box('.tt-predict [data-tt-feedback]') };
          return { top, h: window.innerHeight, items };
        });
        for (const [k, [a, b]] of Object.entries(res.items)) assert.ok(a >= res.top - 1 && b <= res.h + 1, tag + ' ' + what + ': ' + k + ' ' + a + '..' + b + ' outside ' + Math.round(res.top) + '..' + res.h);
      };
      await page.waitForTimeout(350);
      assert.match(await lab.locator('.tt-predict [data-tt-feedback]').textContent(), /Unloading/, tag + ' still animating');
      await inView('during the unloading animation');
      await page.screenshot({ path: path.join(evidence, 'flow-unloading-mid-' + tag + '-light.png') });
      await lab.locator('[data-tt-feedback][data-result]').waitFor();
      await inView('after unloading');
      assert.ok(Math.abs(await panelTop() - topAtClick) <= 4, tag + ' no automatic page jump: the panel stays where it was clicked');
      assert.ok(await lab.locator('[data-tt-uv] [data-tt-unload]').count() === 1 || pages <= 3, tag + ' unloading line drawn');
      assert.equal(await lab.locator('[data-tt-uv] [data-tt-set]').count(), 1, tag + ' actual set marked in the paired view');
      assert.equal(await lab.locator('[data-tt-uv] [data-tt-pred]').count(), 1, tag + ' prediction marked in the paired view');
      assert.equal(await page.evaluate(() => { const n = document.querySelector('[data-tt-uv]'); return getComputedStyle(n).overflowY === 'visible' && n.scrollHeight <= n.clientHeight + 1; }), true, tag + ' no nested scroll frame');
      assert.equal(await lab.locator('[data-tt-cancel]').evaluate(n => n === document.activeElement), true, tag + ' focus stays in the panel');
      assert.match(await lab.locator('[data-tt-uv-read]').textContent(), /σ = 0\.0 MPa/);
      await page.screenshot({ path: path.join(evidence, 'flow-unloaded-result-' + tag + '-light.png') });
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
});

test('run, auto-pause at yield and peak, pause, reduced motion, keyboard, drag and hover', { skip: B.skip }, async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await B.launch();
  try {
    const { context, page, errors } = await newPage(browser, { viewport: { width: 1280, height: 1000 }, reducedMotion: 'no-preference' });
    const lab = await openLab(page, false), status = lab.locator('[data-tt-status]'), spec = lab.locator('[data-tt-stage] svg.tt-specimen');
    await lab.locator('[data-tt-run]').click();
    await page.waitForFunction(() => /Paused at the 0\.2% offset yield/.test(document.querySelector('[data-tt-status]').textContent), null, { timeout: 15000 });
    assert.equal(await num(lab, 'stress'), 250);
    await lab.locator('[data-tt-run]').click();
    await page.waitForFunction(() => /Paused at the peak/.test(document.querySelector('[data-tt-status]').textContent), null, { timeout: 30000 });
    assert.equal(await num(lab, 'stress'), 400);
    assert.equal(await spec.getAttribute('data-neck'), '0', 'paused exactly at the peak: no neck yet');
    await lab.locator('[data-tt-run]').click();
    await page.waitForTimeout(500);
    await lab.locator('[data-tt-run]').click(); // pause
    assert.equal(await lab.locator('[data-tt-run]').textContent(), 'Continue test');
    const held = await num(lab, 'strain');
    await page.waitForTimeout(400);
    assert.equal(await num(lab, 'strain'), held, 'paused');
    assert.equal(await spec.getAttribute('data-neck'), '1');
    // Keyboard: the native slider is the crosshead.
    await lab.locator('[data-tt-reset]').focus(); await page.keyboard.press('Enter');
    assert.equal(await num(lab, 'strain'), 0);
    await lab.locator('[data-tt-slider]').focus();
    for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight');
    assert.ok(await num(lab, 'strain') > 0);
    await page.keyboard.press('End');
    assert.equal(await spec.getAttribute('data-fractured'), '1');
    await lab.locator('[data-tt-reset]').click();
    // Drag the specimen to stretch it.
    const box = await lab.locator('[data-tt-stage]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
    assert.ok(await num(lab, 'strain') > 0.5, 'drag stretched the specimen');
    // Hover reads the curve.
    await lab.locator('[data-tt-plots]').evaluate(n => n.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const plot = await lab.locator('[data-tt-plots] svg').first().boundingBox();
    await page.mouse.move(plot.x + plot.width * 0.2, plot.y + plot.height * 0.5);
    assert.match(await lab.locator('[data-tt-pointer]').textContent(), /On the curve at|not tested yet/);
    await page.mouse.move(plot.x + plot.width * 0.16 + 1, plot.y + plot.height * 0.5);
    const zoom = await lab.locator('[data-tt-plots] svg').nth(1).boundingBox();
    await page.mouse.move(zoom.x + zoom.width * (80 + 0.325 / 1.0 * 420) / 520, zoom.y + zoom.height * 0.4);
    assert.match(await lab.locator('[data-tt-pointer]').textContent(), /0\.2% offset yield: the dashed line has slope E/);
    assert.deepEqual(errors, []);
    await context.close();
    // Reduced motion: no animation; Run steps between events.
    const rm = await newPage(browser, { viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
    const lab2 = await openLab(rm.page, false), run = lab2.locator('[data-tt-run]');
    assert.equal(await run.textContent(), 'Step to next event');
    await run.click(); assert.match(await lab2.locator('[data-tt-status]').textContent(), /offset yield/);
    await run.click(); assert.match(await lab2.locator('[data-tt-status]').textContent(), /Paused at the peak/);
    await run.click(); assert.equal(await lab2.locator('[data-tt-stage] svg.tt-specimen').getAttribute('data-fractured'), '1');
    await lab2.locator('[data-tt-reset]').click();
    await lab2.locator('[data-tt-slider]').fill('600'); await lab2.locator('[data-tt-predict]').click();
    await lab2.locator('[data-tt-guess]').fill('1'); await lab2.locator('[data-tt-check]').click();
    assert.equal(await lab2.locator('[data-tt-feedback]').isVisible(), true, 'reduced motion unloads immediately');
    assert.deepEqual(rm.errors, []);
    await rm.context.close();
  } finally { await browser.close(); }
});

test('independent mounts, comparison quiz, print, no-JS fallback, search and offline aggregate', { skip: B.skip }, async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await B.launch();
  try {
    const { context, page, errors } = await newPage(browser, { viewport: { width: 1280, height: 1000 } });
    const lab = await openLab(page, false);
    await page.evaluate(() => { const first = document.querySelector('[data-interactive="tensile-test"]'); const copy = first.cloneNode(true); copy.querySelector('.tt-lab').remove(); copy.classList.remove('tt-ready'); delete copy.dataset.ttReady; delete copy.dataset.ttStage; first.after(copy); });
    const src = await page.locator('script[src*="tensile-test/demo.js"]').getAttribute('src');
    await page.addScriptTag({ url: new URL(src, page.url()).href }); await page.addScriptTag({ url: new URL(src, page.url()).href });
    assert.equal(await page.locator('.tt-lab').count(), 2, 'each root initializes once');
    const second = page.locator('.tt-lab').nth(1);
    await second.locator('[data-tt-curve]').selectOption('polymer'); await second.locator('[data-tt-slider]').fill('900');
    assert.equal(await num(lab, 'strain'), 0, 'first mount unchanged');
    const ids = await page.evaluate(() => [...document.querySelectorAll('.tt-lab [id]')].map(n => n.id));
    assert.equal(new Set(ids).size, ids.length, 'no duplicate ids across mounts');
    await page.locator('[data-interactive="tensile-test"]').nth(1).evaluate(n => n.remove());
    // Compare and rank.
    for (const [k, v] of [['stiffness', 'ductile'], ['strength', 'ductile'], ['ductility', 'ductile'], ['toughness', 'ductile']]) await lab.locator('[data-tt-quiz="' + k + '"]').selectOption(v);
    await lab.locator('[data-tt-quizcheck]').click();
    const result = await lab.locator('[data-tt-quizresult]').textContent();
    assert.equal((result.match(/Yes, /g) || []).length, 3); assert.match(result, /Ductility: Not A\. It is D/);
    assert.equal(await lab.locator('[data-tt-ranks]').isVisible(), true);
    await lab.locator('[data-tt-show][value="polymer"]').uncheck();
    assert.equal(await lab.locator('[data-tt-compare] [data-series="polymer"]').count(), 0);
    await shot(lab.locator('.tt-section-title'), 'compare-heading-1280-light');
    await page.locator('.tt-ranks').screenshot({ path: path.join(evidence, 'compare-ranks-1280-light.png') });
    // Print view: the static lesson replaces the live lab.
    await page.emulateMedia({ media: 'print' });
    assert.equal(await lab.isVisible(), false); assert.equal(await page.locator('.tt-static').isVisible(), true);
    await page.pdf({ path: path.join(evidence, 'page-js-print.pdf'), format: 'Letter', printBackground: true, margin: { top: '.5in', bottom: '.5in', left: '.5in', right: '.5in' } });
    assert.deepEqual(errors, []);
    await context.close();
    // No JavaScript: the annotated fallback is present and readable.
    const nojs = await newPage(browser, { javaScriptEnabled: false, viewport: { width: 390, height: 1000 } });
    assert.equal((await nojs.page.goto(pageURL)).status(), 200);
    await nojs.page.locator('details.xcard').filter({ has: nojs.page.locator('.tt-static') }).locator('summary').first().click();
    const fb = nojs.page.locator('[data-interactive="tensile-test"] .tt-static');
    assert.equal(await fb.isVisible(), true);
    assert.ok(await fb.locator('svg.tt-plot').count() >= 4);
    assert.deepEqual(await clippedText(nojs.page, '.tt-static'), [], 'static labels inside drawings at 390 px');
    assert.match(await fb.textContent(), /Permanent set = 10\.0% − 0\.185% = 9\.815%/);
    await fb.screenshot({ path: path.join(evidence, 'static-nojs-390-light.png') });
    await nojs.page.pdf({ path: path.join(evidence, 'page-nojs-print.pdf'), format: 'Letter', printBackground: true, margin: { top: '.5in', bottom: '.5in', left: '.5in', right: '.5in' } });
    const search = await (await nojs.page.request.get(baseURL + '/search-index.js')).text();
    assert.match(search, /0\.2% offset/); assert.match(search, /permanent set/i);
    await nojs.context.close();
    // Offline aggregate: the module is inlined and works with every sibling request blocked.
    const off = await newPage(browser, { viewport: { width: 1280, height: 1000 } });
    const requests = [];
    await off.page.route('**/*', route => { if (route.request().isNavigationRequest()) return route.continue(); requests.push(route.request().url()); return route.abort(); });
    assert.equal((await off.page.goto(baseURL + '/print/track-metals-and-heat-treatment.html')).status(), 200);
    await off.page.evaluate(() => document.querySelectorAll('details.xcard').forEach(n => { n.open = true; }));
    const agg = off.page.locator('.tt-lab'); await agg.waitFor();
    await agg.locator('[data-tt-slider]').fill('600');
    assert.ok(await num(agg, 'stress') > 250);
    assert.deepEqual(requests.filter(u => u.startsWith(baseURL + '/')), [], 'no sibling asset requests');
    assert.deepEqual(off.errors.filter(e => !/ERR_FAILED|net::/.test(e)), []);
    await off.page.emulateMedia({ media: 'print' });
    await off.page.pdf({ path: path.join(evidence, 'aggregate-metals-track-print.pdf'), format: 'Letter', printBackground: true });
    await off.context.close();
  } finally { await browser.close(); }
});
