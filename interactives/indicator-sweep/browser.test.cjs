'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { browserURL, skip, launch } = require('../../tests/support/browser.cjs');

test('indicator sweep first use, phone themes, print, no-JS and independent mounts', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-indicator-sweep-')), browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = browserURL.replace(/\/$/, '') + '/machining/milling-workholding.html';
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    const root = page.locator('[data-interactive="indicator-sweep"]');
    assert.equal(await root.count(), 1); assert.equal(await root.getAttribute('data-is-ready'), 'true');
    assert.match(await root.locator('[data-is-readout]').textContent(), /Contact at 100\.000 mm \+0\.060 mm/);
    assert.match(await root.locator('[data-is-readout]').textContent(), /Right − left \+0\.060 mm/);
    assert.match(await root.locator('.is-lab .is-svg').textContent(), /Comparison reading \(mm\)/);
    assert.match(await root.locator('.is-lab .is-svg').textContent(), /Same gain after re-zero; changing jaw geometry may rescale/);
    assert.match(await root.locator('.is-lab .is-svg').textContent(), /\+0\.080.*−0\.020/s);
    await root.locator('[data-is="position"]').fill('50');
    assert.match(await root.locator('[data-is-readout]').textContent(), /Contact at 50\.000 mm \+0\.030 mm/);
    await root.locator('[data-is="position"]').fill('100');
    const defaultSpan = await root.locator('.is-lab .is-reading').evaluate(node => node.getBBox().height);
    await root.locator('input[type="radio"][value="same"]').check(); await root.locator('[data-is-test]').click();
    assert.match(await root.locator('[data-is-feedback]').textContent(), /remains \+0\.060 mm/);
    assert.ok(Math.abs(await root.locator('.is-lab .is-reading').evaluate(node => node.getBBox().height) - defaultSpan) < .01, 'default curve span is unchanged by re-zeroing');
    await root.locator('[data-is-reset]').click();
    const adjustment = root.locator('[data-is="adjustment"]');
    await adjustment.fill('0.240'); await adjustment.blur();
    assert.match(await root.locator('[data-is-readout]').textContent(), /Right − left \+0\.300 mm/);
    const adjustedSpan = await root.locator('.is-lab .is-reading').evaluate(node => node.getBBox().height);
    await root.locator('[data-is="position"]').fill('50'); await root.locator('[data-is-zero]').click();
    assert.match(await root.locator('[data-is-readout]').textContent(), /Contact at 50\.000 mm 0\.000 mm/);
    assert.ok(Math.abs(await root.locator('.is-lab .is-reading').evaluate(node => node.getBBox().height) - adjustedSpan) < .01, '0.300 mm curve span is unchanged by re-zeroing');
    await root.locator('[data-is-reset]').click();
    await root.locator('[data-is="kind"]').selectOption('bump');
    assert.match(await root.locator('[data-is-readout]').textContent(), /Center reference \+0\.080 mm/);
    assert.match(await root.locator('[data-is-readout]').textContent(), /Right − left 0\.000 mm/);
    await root.locator('[data-is="response"]').selectOption('-1');
    assert.match(await root.locator('[data-is-readout]').textContent(), /Center reference −0\.080 mm/);
    await root.locator('[data-is="kind"]').selectOption('slope');
    await adjustment.focus(); await page.keyboard.press('Control+A'); await page.keyboard.type('-0.060'); await adjustment.blur();
    assert.equal(await adjustment.inputValue(), '-0.06', 'negative decimal survives real keyboard entry');
    assert.match(await root.locator('[data-is-readout]').textContent(), /Right − left 0\.000 mm/);
    for (const limit of ['-1', '1']) {
      await adjustment.fill(limit); await adjustment.blur();
      const cy = Number(await root.locator('.is-lab .is-contact').getAttribute('cy'));
      assert.ok(cy >= 35 && cy <= 130, `adjustment ${limit}: contact remains inside physical panel at cy ${cy}`);
    }
    await root.locator('[data-is="position"]').fill('100'); await root.locator('[data-is-zero]').click();
    await adjustment.fill('-1'); await adjustment.blur();
    assert.match(await root.locator('.is-lab .is-svg').textContent(), /zero (?:above|below) frame/);
    assert.ok(await root.locator('.is-lab .is-dot').evaluate(node => { const y = Number(node.getAttribute('cy')); return y >= 240 && y <= 300; }), 'contact reading remains inside quantitative frame after a large stored-zero geometry change');
    assert.equal(await root.locator('.is-lab .is-svg').evaluate(node => { const a = node.querySelector('.is-gain-note').getBBox(), b = node.querySelector('.is-zero-frame-note').getBBox(); return a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y; }), true, 'gain disclosure and off-frame-zero notice do not overlap');
    await root.locator('[data-is-reset]').click();
    await root.locator('[data-is="position"]').focus(); await page.keyboard.press('ArrowLeft');
    assert.equal(await root.locator('[data-is="position"]').inputValue(), '99');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme); await page.setViewportSize({ width: 375, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme} page overflow`);
      assert.equal(await root.evaluate(node => node.scrollWidth <= node.clientWidth), true, `${theme} module overflow`);
      assert.ok(await root.locator('[data-is-test]').evaluate(node => node.getBoundingClientRect().height) >= 44, `${theme} prediction action is at least 44px tall`);
      assert.equal(await root.locator('.is-lab .is-svg text').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height >= 10)), true, `${theme} diagram labels remain legible at phone width`);
      const clipped = await root.locator('.is-lab .is-svg text').evaluateAll(nodes => nodes.map(node => { const box = node.getBBox(); return { text: node.textContent, x: box.x, right: box.x + box.width, y: box.y, bottom: box.y + box.height }; }).filter(box => box.x < -0.5 || box.right > 640.5 || box.y < -0.5 || box.bottom > 400.5));
      assert.deepEqual(clipped, [], `${theme} diagram labels stay inside the viewBox`);
      const gutter = await root.locator('.is-lab .is-svg').evaluate(node => { const tick = node.querySelector('.is-tick').getBBox(), labels = [...node.querySelectorAll('.is-tick-label')].map(label => label.getBBox()), dot = node.querySelector('.is-dot').getBBox(); return { tickRight: tick.x + tick.width, dotRight: dot.x + dot.width, labelLeft: Math.min(...labels.map(label => label.x)) }; });
      assert.ok(gutter.labelLeft > gutter.tickRight && gutter.labelLeft > gutter.dotRight, `${theme} tick labels have a clear gutter from tick strokes and endpoint dot: ${JSON.stringify(gutter)}`);
      await page.screenshot({ path: path.join(out, `indicator-${theme}.png`), fullPage: true });
    }
    assert.equal(await root.evaluate(node => { const e = document.createElement('div'); e.style.cssText = 'width:2000px;height:1px'; node.append(e); const hit = node.scrollWidth > node.clientWidth; e.remove(); return hit; }), true, 'positive overflow control');
    const presentationPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await presentationPage.goto(url + '?p=mill-setup-and-tooling&present=1', { waitUntil: 'networkidle' });
    await presentationPage.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    const presentationRoot = presentationPage.locator('[data-interactive="indicator-sweep"]');
    assert.ok(await presentationRoot.locator('[data-is-test]').evaluate(node => node.getBoundingClientRect().height) >= 44, 'presentation prediction action is at least 44px tall');
    assert.equal(await presentationRoot.evaluate(node => node.scrollWidth <= node.clientWidth), true, 'presentation module has no horizontal overflow');
    await presentationPage.close();
    await page.emulateMedia({ media: 'print' });
    assert.equal(await root.locator('.is-lab').evaluate(node => getComputedStyle(node).display), 'none');
    assert.equal(await root.locator('.is-static').evaluate(node => getComputedStyle(node).display), 'block');
    await page.pdf({ path: path.join(out, 'indicator-print.pdf'), printBackground: true }); await page.emulateMedia({ media: 'screen' });
    const mounts = await page.evaluate(() => { const a = document.querySelector('[data-interactive="indicator-sweep"]'), b = a.cloneNode(true); b.querySelector('.is-lab').remove(); b.classList.remove('is-live'); delete b.dataset.isReady; a.after(b); const s = document.createElement('script'); s.src = document.querySelector('script[src*="indicator-sweep/demo.js"]').src; document.body.append(s); return new Promise(resolve => setTimeout(() => resolve(document.querySelectorAll('[data-is-ready]').length), 100)); });
    assert.equal(mounts, 2); assert.deepEqual(await page.locator('[data-interactive="indicator-sweep"] [id]').evaluateAll(nodes => { const seen = new Set(); return nodes.map(n => n.id).filter(id => seen.has(id) || !seen.add(id)); }), []);
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } }), noJsPage = await noJs.newPage();
    await noJsPage.goto(url, { waitUntil: 'networkidle' }); await noJsPage.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    assert.equal(await noJsPage.locator('[data-interactive="indicator-sweep"] .is-static').isVisible(), true);
    assert.match(await noJsPage.locator('[data-interactive="indicator-sweep"] .is-static').textContent(), /Equal endpoints can hide/);
    assert.equal(await noJsPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await noJs.close();
    await page.goto(browserURL.replace(/\/$/, '') + '/practice.html#indicator-rezero-left', { waitUntil: 'networkidle' });
    for (const [id, correct, wrong] of [
      ['indicator-rezero-left', '-0.030', '0.030'], ['indicator-rezero-span', '0.060', '0.030'],
      ['indicator-hidden-midspan', '2', '1'], ['indicator-zero-meaning', '3', '2']
    ]) {
      const item = page.locator('#' + id);
      for (const [value, state] of [[correct, 'correct'], [wrong, 'incorrect']]) {
        await item.locator('[data-practice-input]').fill(value); await item.locator('[data-practice-check]').click();
        assert.equal(await item.getAttribute('data-state'), state, id + ' ' + value);
      }
    }
    assert.deepEqual(errors, []); console.log(`PASS evidence: ${out}`);
  } finally { await browser.close(); }
});

