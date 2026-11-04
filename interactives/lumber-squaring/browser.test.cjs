'use strict';
// Opt-in browser checks: requires Playwright and COURSEWIKI_BROWSER_URL (a server over docs/).
// Evidence goes to the OS temp folder, never the repository.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { browserURL, skip, launch } = require('../../tests/support/browser.cjs');
const PAGE = '/materials-and-processes/milling-rough-lumber-square.html';
const ROOT = '[data-interactive="lumber-squaring"]';

function own(errors) { return errors.filter(e => !/fonts\.(googleapis|gstatic)\.com/.test(e)); }
async function openPage(browser, opts = {}, query = '') {
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, reducedMotion: opts.reducedMotion || 'no-preference' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console ' + m.text() + ' ' + (m.location().url || '')); });
  await page.goto(browserURL.replace(/\/$/, '') + PAGE + query, { waitUntil: 'load' });
  await page.locator('details.xcard').evaluateAll(ns => ns.forEach(n => { n.open = true; }));
  await page.waitForFunction(s => document.querySelector(s)?.dataset.lsReady, ROOT);
  return { context, page, errors };
}
// The skip button is clicked in-page: the status line reflows while the animation runs.
async function skipAnim(root) { await root.locator('[data-ls="skip"]').evaluate(b => { if (!b.disabled) b.click(); }); }
async function idle(page, root) { await page.waitForFunction(el => el.dataset.lsBusy !== 'true', await root.elementHandle(), { timeout: 20000 }); }
async function run(page, root, op, pred, opts = {}) {
  await root.locator('input[name$="-op"][value="' + op + '"]').check();
  if (opts.planer) await root.locator('[data-ls="planer"]').selectOption(opts.planer);
  await root.locator('input[name$="-pred"][value="' + pred + '"]').check();
  await root.locator('[data-ls="apply"]').click();
  if (!opts.watch) await skipAnim(root);
  await idle(page, root);
}

test('lumber squaring: keyboard, predictions, sequences, undo, independent mounts', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-lumber-squaring-')), browser = await launch();
  try {
    const { page, errors } = await openPage(browser, {}, '?p=shaping-wood');
    const root = page.locator(ROOT).first(), startURL = page.url();
    assert.ok(['3d', 'svg'].includes(await root.getAttribute('data-ls-ready')));
    // Keyboard: arrow keys move between native radios and stay inside the module.
    await root.locator('input[name$="-board"][value="cup"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await root.locator('input[name$="-board"]:checked').getAttribute('value'), 'bow');
    assert.equal(page.url(), startURL, 'arrow keys in the module do not change playlist page');
    await page.keyboard.press('ArrowLeft');
    await root.locator('input[name$="-op"][value="plane"]').focus(); await page.keyboard.press('Space');
    await root.locator('input[name$="-pred"][value="copies"]').focus(); await page.keyboard.press('Space');
    assert.equal(await root.locator('[data-ls="apply"]').isEnabled(), true);
    await root.locator('[data-ls="apply"]').focus(); await page.keyboard.press('Enter');
    await skipAnim(root);
    await idle(page, root);
    assert.match(await root.locator('[data-ls="feedback"]').textContent(), /Your prediction was right/);
    assert.match(await root.locator('[data-ls="readout"]').textContent(), /Face A out of flat\s*6\.2 mm/);
    await page.screenshot({ path: path.join(out, 'cup-planer-first.png') });
    // Undo, then the reference order finishes the board.
    await root.locator('[data-ls="undo"]').click();
    assert.equal(await root.getAttribute('data-ls-history'), '');
    for (const op of ['joint-face', 'joint-edge', 'plane', 'rip', 'crosscut']) await run(page, root, op, op === 'joint-face' ? 'flat' : 'true');
    assert.equal(await root.getAttribute('data-ls-finished'), 'true');
    assert.match(await root.locator('[data-ls="score"]').textContent(), /6 of 6 right/);
    assert.equal(await root.locator('.ls-check.is-ok').count(), 5);
    // Wrong answers are scored wrong; ambiguous true outcomes are both accepted.
    await root.locator('input[name$="-board"][value="bow"]').check();
    await run(page, root, 'plane', 'true', { planer: 'flexible' });
    assert.match(await root.locator('[data-ls="feedback"]').textContent(), /Not this time/);
    await run(page, root, 'joint-face', 'short');
    assert.match(await root.locator('[data-ls="feedback"]').textContent(), /Your prediction was right.*flat.*and.*thickness/s);
    // Comparison panel.
    await root.locator('[data-ls="compare-box"] summary').click(); await root.locator('[data-ls="compare"]').click();
    assert.equal(await root.locator('[data-ls="compare-out"] svg.ls-strip').count(), 2);
    // A second, independent mount on the same page.
    const src = await page.locator('script[src*="lumber-squaring/demo.js"]').getAttribute('src');
    await page.evaluate(s => { const m = document.createElement('div'); m.dataset.interactive = 'lumber-squaring'; m.id = 'second-ls'; document.querySelector('main').appendChild(m); const sc = document.createElement('script'); sc.src = s; document.body.appendChild(sc); }, src);
    await page.waitForFunction(() => document.getElementById('second-ls')?.dataset.lsReady);
    const second = page.locator('#second-ls'), firstHistory = await root.getAttribute('data-ls-history');
    await run(page, second, 'rip', 'copies');
    assert.equal(await second.getAttribute('data-ls-history'), 'rip');
    assert.equal(await root.getAttribute('data-ls-history'), firstHistory, 'first mount untouched');
    assert.equal(await page.locator(ROOT + ' input[name$="-board"]:checked').count(), 2, 'radio groups are per mount');
    assert.deepEqual(own(errors), []);
  } finally { await browser.close(); }
});

test('lumber squaring: animation controls, reduced motion and phone layout', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-lumber-squaring-')), browser = await launch();
  try {
    const a = await openPage(browser);
    const root = a.page.locator(ROOT).first();
    if (await root.getAttribute('data-ls-ready') === '3d') {
      await root.locator('input[name$="-op"][value="plane"]').check(); await root.locator('input[name$="-pred"][value="copies"]').check();
      await root.locator('[data-ls="apply"]').click();
      await a.page.waitForTimeout(300); await root.locator('[data-ls="pause"]').click();
      assert.equal(await root.locator('[data-ls="pause"]').getAttribute('aria-pressed'), 'true');
      const held = await root.locator('[data-ls="status"]').textContent();
      await a.page.waitForTimeout(1200);
      assert.equal(await root.locator('[data-ls="status"]').textContent(), held, 'paused animation holds its stage');
      assert.equal(await root.getAttribute('data-ls-busy'), 'true');
      await skipAnim(root); await idle(a.page, root);
      await root.locator('canvas').screenshot({ path: path.join(out, 'released-cup.png') });
    }
    assert.deepEqual(own(a.errors), []);
    await a.context.close();
    const b = await openPage(browser, { reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
    const r2 = b.page.locator(ROOT).first();
    await r2.locator('input[name$="-op"][value="joint-face"]').check(); await r2.locator('input[name$="-pred"][value="flat"]').check();
    await r2.locator('[data-ls="apply"]').click();
    await idle(b.page, r2);
    assert.equal(await r2.getAttribute('data-ls-history'), 'joint-face');
    const layout = await b.page.evaluate(s => {
      const m = document.querySelector(s), box = m.getBoundingClientRect();
      const small = [...m.querySelectorAll('.ls-live button, .ls-live select, .ls-choice, .ls-live summary')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(r => r.height < 44 || r.width < 44).length;
      return { overflow: document.documentElement.scrollWidth - innerWidth, wider: [...m.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > box.right + 1).length, small };
    }, ROOT);
    assert.deepEqual(layout, { overflow: 0, wider: 0, small: 0 });
    await r2.screenshot({ path: path.join(out, 'phone-reduced-motion.png') });
    assert.deepEqual(own(b.errors), []);
  } finally { await browser.close(); }
});

test('ordinary Apply keeps press/cut/release visible without page jumps; feedback follows the restored board', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-lumber-visible-')), browser = await launch();
  try {
    for (const [width, theme] of [[390, 'light'], [1280, 'dark']]) {
      const { context, page, errors } = await openPage(browser, { viewport: { width, height: width === 390 ? 844 : 900 } });
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
      const root = page.locator(ROOT).first();
      assert.equal(await root.getAttribute('data-ls-ready'), '3d', 'this regression must observe actual animation');
      await root.locator('input[name$="-op"][value="plane"]').check();
      await root.locator('input[name$="-pred"][value="copies"]').check();
      // Bring the ordinary button into view as a learner would, then do not scroll during the action.
      const apply = root.locator('[data-ls="apply"]');
      await apply.scrollIntoViewIfNeeded();
      const beforeY = await page.evaluate(() => scrollY);
      await apply.click();
      async function visible(name) {
        const data = await root.evaluate(m => {
          const rect = s => { const r = m.querySelector(s).getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
          return { y: scrollY, height: innerHeight, scene: rect('[data-ls="scene"]'), apply: rect('[data-ls="apply"]'), status: rect('[data-ls="status"]'), feedback: rect('[data-ls="feedback"]') };
        });
        assert.ok(Math.abs(data.y - beforeY) < 2, name + ': no automatic page jump');
        for (const key of ['scene', 'apply', 'status']) assert.ok(data[key].top >= 55 && data[key].bottom <= data.height, name + ': ' + key + ' is fully visible ' + JSON.stringify(data));
        assert.ok(data.feedback.top < data.height - 40, name + ': useful feedback visible');
        await page.screenshot({ path: path.join(out, width + '-' + name + '.png') });
      }
      await page.waitForFunction(el => /feed rollers/.test(el.textContent), await root.locator('[data-ls="status"]').elementHandle());
      assert.match(await root.locator('[data-ls="feedback"]').textContent(), /Machining in progress/);
      await visible('press');
      await page.waitForFunction(el => /knives cut/.test(el.textContent), await root.locator('[data-ls="status"]').elementHandle());
      await visible('cut');
      await root.locator('[data-ls="pause"]').click();
      const held = await root.locator('canvas').screenshot();
      await page.waitForTimeout(250);
      assert.deepEqual(await root.locator('canvas').screenshot(), held, 'paused drawing holds its actual geometry');
      assert.match(await root.locator('[data-ls="feedback"]').textContent(), /^Paused/);
      await root.locator('[data-ls="pause"]').click();
      await page.waitForFunction(el => /^Released:/.test(el.textContent), await root.locator('[data-ls="status"]').elementHandle());
      await visible('release'); await idle(page, root); await visible('done');
      assert.match(await root.locator('[data-ls="feedback"]').textContent(), /Your prediction was right/);
      await root.locator('[data-ls="undo"]').click();
      assert.match(await root.locator('[data-ls="feedback"]').textContent(), /^Undone.*thickness 36/s);
      assert.equal(await root.locator('[data-ls="apply"]').isEnabled(), false, 'undo requires a fresh prediction');
      await root.locator('input[name$="-pred"][value="copies"]').check();
      await root.locator('[data-ls="planer"]').focus();
      await root.locator('[data-ls="planer"]').selectOption('rigid');
      assert.equal(await root.locator('[data-ls="apply"]').isEnabled(), false, 'a support change invalidates the prediction');
      assert.match(await root.locator('[data-ls="feedback"]').textContent(), /support changed/);
      assert.equal(await root.locator('[data-ls="planer"]').evaluate(e => e === document.activeElement), true, 'mode control keeps keyboard focus');
      await root.locator('[data-ls="reset"]').click();
      assert.equal(await root.locator('input[name$="-op"]:checked').count(), 0);
      assert.doesNotMatch(await root.locator('[data-ls="feedback"]').textContent(), /Your prediction was right|Undone|Machining/);
      // The recovered correction must also survive its actual learner UI.
      await root.locator('input[name$="-board"][value="crook"]').check();
      await run(page, root, 'plane', 'true', { planer: 'flexible' });
      assert.match(await root.locator('[data-ls="feedback"]').textContent(), /Your prediction was right.*flat and parallel/s);
      assert.deepEqual(own(errors), []); await context.close();
    }
    console.log('Visible-action evidence: ' + out);
  } finally { await browser.close(); }
});
