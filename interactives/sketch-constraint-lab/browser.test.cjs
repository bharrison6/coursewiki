'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const B = require('../../tests/support/browser.cjs');
const evidence = path.join(os.tmpdir(), 'acc-det102-sketch-constraint-lab');
test('real first-use, keyboard, pointer, themes, phones, reference/conflict, print and independent roots', { skip: B.skip }, async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await B.launch();
  const lessonURL = B.browserURL.replace(/\/+$/, '') + '/engineering-graphics/fully-defined-sketches.html';
  async function openLesson(page) {
    const response = await page.goto(lessonURL);
    assert.equal(response && response.status(), 200, 'Expected lesson HTTP 200 at ' + lessonURL);
  }
  try {
    for (const width of [1280, 390, 375]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await openLesson(page);
      await page.evaluate(t => { document.documentElement.dataset.theme = t; document.querySelectorAll('details.xcard').forEach(d => d.open = true); }, theme);
      const lab = page.locator('.sc-lab'), sc = key => lab.locator(`[data-sc="${key}"]`);
      await lab.waitFor();
      assert.match(await sc('status').textContent(), /Fully defined — 0 DOF/);
      await sc('grow').click(); assert.match(await sc('feedback').textContent(), /Choose what you predict/);
      await sc('prediction').selectOption('fixed'); await sc('grow').click();
      assert.match(await sc('readings').textContent(), /0 \/ 80 mm/);
      assert.match(await sc('feedback').textContent(), /Prediction matches/);
      await sc('anchor').selectOption('center');
      assert.match(await sc('readings').textContent(), /-32 \/ 32 mm/);
      await sc('prediction').selectOption('left'); await sc('grow').click();
      assert.match(await sc('readings').textContent(), /-40 \/ 40 mm/);
      await sc('reset').click();
      const upper = lab.locator('[data-corner="upper"]'), shape = lab.locator('.sc-shape');
      await upper.focus(); const before = await shape.getAttribute('x'); await upper.press('ArrowRight');
      assert.equal(await shape.getAttribute('x'), before);
      await lab.locator('.sc-settings > summary').click(); await sc('anchorX').uncheck();
      assert.match(await sc('status').textContent(), /1 DOF remain/);
      await upper.focus(); await upper.press('ArrowRight');
      assert.match(await sc('readings').textContent(), /1 \/ 65 mm/);
      await upper.press('Shift+ArrowRight'); assert.match(await sc('readings').textContent(), /6 \/ 70 mm/);
      await sc('undo').click(); assert.match(await sc('readings').textContent(), /0 \/ 64 mm/);
      await upper.scrollIntoViewIfNeeded(); const box = await upper.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 16, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
      assert.notEqual(await shape.getAttribute('x'), before);
      assert.match(await sc('readings').textContent(), /64 × 22 mm/);
      await sc('undo').click(); await sc('anchorX').check(); await sc('widthOn').uncheck(); await sc('extra').selectOption('reference');
      assert.match(await sc('status').textContent(), /1 DOF remain/);
      await upper.focus(); await upper.press('ArrowRight'); assert.match(await sc('readings').textContent(), /65 mm — measurement only/);
      await sc('agree').click(); assert.match(await sc('status').textContent(), /4 independent conditions from 5 active equations/);
      assert.match(await sc('status').textContent(), /1 redundant/);
      const valid = await shape.getAttribute('width'); await sc('conflict').click();
      assert.match(await sc('status').textContent(), /No feasible rectangle/); assert.equal(await shape.getAttribute('width'), valid);
      await upper.focus(); await upper.press('ArrowRight'); assert.match(await sc('feedback').textContent(), /Resolve the input/);
      await sc('extra').selectOption('reference'); assert.match(await sc('status').textContent(), /Fully defined/); assert.match(await sc('feedback').textContent(), /No free motion remains/);
      await sc('width').fill('0'); await sc('width').blur(); assert.match(await sc('status').textContent(), /1 to 120/); assert.equal(await shape.getAttribute('width'), valid);
      await sc('width').fill(''); await sc('width').blur(); assert.match(await sc('status').textContent(), /Blank/);
      await upper.focus(); await upper.press('ArrowRight'); assert.match(await sc('feedback').textContent(), /Resolve the input/);
      await sc('widthOn').uncheck(); assert.match(await sc('status').textContent(), /Under-defined/); assert.equal(await sc('width').isDisabled(), true); assert.match(await sc('feedback').textContent(), /Test the remaining motion/);
      await sc('widthOn').check(); assert.equal(await sc('width').isEnabled(), true); assert.match(await sc('status').textContent(), /Blank/);
      await sc('width').fill('64'); await sc('width').blur(); assert.match(await sc('status').textContent(), /Fully defined/);
      await sc('height').fill('120'); await sc('height').blur();
      const inFrame = () => shape.evaluate(n => { const x = +n.getAttribute('x'), y = +n.getAttribute('y'); return x >= 0 && y >= 0 && x + +n.getAttribute('width') <= 600 && y + +n.getAttribute('height') <= 310; });
      assert.equal(await inFrame(), true);
      await sc('anchorX').uncheck(); const lower = lab.locator('[data-corner="lower"]'); await lower.focus();
      for (let n = 0; n < 27; n++) await lower.press('Shift+ArrowRight');
      assert.match(await sc('readings').textContent(), /135 \/ 199 mm/); assert.equal(await inFrame(), true);
      if (width === 375 && theme === 'dark') await lab.screenshot({ path: path.join(evidence, '375-dark-large-translated.png') });
      // The overflow instrument must detect a deliberately oversized positive control.
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll('.sc-lab, .sc-lab *, #sc-overflow-control')].some(n => { const r = n.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1); }));
      assert.equal(await overflow(), false);
      await page.evaluate(() => { const n = document.createElement('div'); n.id = 'sc-overflow-control'; n.style.width = '2000px'; document.body.append(n); });
      assert.equal(await overflow(), true); await page.locator('#sc-overflow-control').evaluate(n => n.remove());
      assert.equal(await overflow(), false);
      await sc('reset').click(); await lab.locator('.sc-settings > summary').click(); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(evidence, `${width}-${theme}.png`), fullPage: true });
      assert.deepEqual(errors, []);
      if (width === 1280 && theme === 'light') {
        await page.evaluate(() => { const root = document.querySelector('[data-interactive="sketch-constraint-lab"]'); const copy = root.cloneNode(true); copy.querySelector('.sc-lab').remove(); copy.classList.remove('sc-live'); delete copy.dataset.sketchReady; root.after(copy); });
        const script = await page.locator('script[src*="sketch-constraint-lab/demo.js"]').getAttribute('src'); await page.addScriptTag({ url: new URL(script, page.url()).href });
        const labs = page.locator('.sc-lab'); assert.equal(await labs.count(), 2);
        await labs.nth(1).locator('.sc-settings > summary').click();
        await labs.nth(1).locator('[data-sc="width"]').fill('90'); await labs.nth(1).locator('[data-sc="width"]').blur();
        assert.match(await labs.nth(0).locator('[data-sc="readings"]').textContent(), /64 × 22/);
        assert.match(await labs.nth(1).locator('[data-sc="readings"]').textContent(), /90 × 22/);
        await page.locator('[data-interactive="sketch-constraint-lab"]').nth(1).evaluate(n => n.remove());
        await page.emulateMedia({ media: 'print' });
        assert.equal(await labs.nth(0).isVisible(), false); assert.equal(await page.locator('.sc-static').first().isVisible(), true);
        await page.pdf({ path: path.join(evidence, 'lesson-js-print.pdf'), format: 'Letter', printBackground: true });
      }
      await context.close();
    }
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage(); await openLesson(page);
    await page.locator('details.xcard > summary').first().click();
    assert.equal(await page.locator('.sc-static').isVisible(), true);
    assert.match(await page.locator('.sc-static').textContent(), /DOF = 4 − rank/);
    await page.pdf({ path: path.join(evidence, 'lesson-nojs-print.pdf'), format: 'Letter', printBackground: true });
    await page.screenshot({ path: path.join(evidence, 'nojs.png'), fullPage: true }); await context.close();
    console.log('Evidence: ' + evidence);
  } finally { await browser.close(); }
});
