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
    assert.match(await root.textContent(), /0\.0001 mm\/mm control steps.*not real-vise quantization/s);
    assert.match(await root.locator('.is-lab .is-digital-value').textContent(), /\+0\.060/);
    assert.match(await root.locator('.is-lab .is-svg').getAttribute('aria-label'), /reads \+0\.060 mm/);
    assert.match(await root.locator('[data-is-readout]').textContent(), /Right − left \+0\.060 mm/);
    assert.match(await root.locator('.is-lab .is-svg').textContent(), /deviation exaggerated, not to scale/);
    assert.match(await root.locator('.is-lab .is-svg').textContent(), /digital value uses the exact model/);
    assert.equal(await root.locator('.is-lab .is-reading, .is-lab .is-tick').count(), 0, 'comparison graph is absent');
    await root.locator('[data-is="position"]').fill('50');
    assert.match(await root.locator('.is-lab .is-digital-value').textContent(), /\+0\.030/);
    await root.locator('[data-is="position"]').fill('100');
    const defaultJaw = await root.locator('.is-lab .is-jaw').getAttribute('d'), defaultVise = await root.locator('.is-lab .is-vise').getAttribute('d');
    await root.locator('[data-is="pivot"]').selectOption('50');
    assert.equal(await root.locator('.is-lab .is-jaw').getAttribute('d'), defaultJaw, 'selecting a pivot does not move the jaw');
    assert.equal(await root.locator('.is-lab .is-vise').getAttribute('d'), defaultVise, 'selecting a pivot does not move the vise body');
    assert.match(await root.locator('.is-lab .is-svg').textContent(), /P50\.000/);
    assert.match(await root.locator('[data-is-readout]').textContent(), /Next pivot P=\(50\.000, 0\) mm/);
    await root.locator('[data-is="pivot"]').selectOption('25');
    await root.locator('[data-is-apply]').click();
    assert.equal(await root.locator('.is-lab .is-pivot').getAttribute('cy'), '82.00', 'world pivot marker remains on y = 0 reference after vise rotation');
    assert.match(await root.locator('[data-is-readout]').textContent(), /Left reference \+0\.015 mm.*Center reference \+0\.015 mm.*Right reference \+0\.015 mm/s);
    assert.match(await root.locator('[data-is-readout]').textContent(), /Right − left 0\.000 mm.*Model summary — full sweep range 0\.000 mm/s);
    assert.match(await root.locator('[data-is-readout]').textContent(), /Accumulated \|d\| 0\.0006 \/ 0\.0040 mm\/mm/);
    assert.match(await root.locator('.is-lab .is-digital-value').textContent(), /\+0\.015/);
    assert.match(await root.locator('[data-is-feedback]').textContent(), /Left moved \+0\.015 mm; right moved −0\.045 mm/);
    const rotatedJaw = await root.locator('.is-lab .is-jaw').getAttribute('d'), rotatedVise = await root.locator('.is-lab .is-vise').getAttribute('d');
    await root.locator('[data-is="position"]').fill('50'); await root.locator('[data-is-zero]').click();
    assert.match(await root.locator('.is-lab .is-digital-value').textContent(), /^0\.000$/);
    assert.equal(await root.locator('.is-lab .is-jaw').getAttribute('d'), rotatedJaw, 'optional zero does not move the jaw');
    assert.equal(await root.locator('.is-lab .is-vise').getAttribute('d'), rotatedVise, 'optional zero does not move the vise body');
    const mainReadout = await root.locator('[data-is-readout]').textContent();
    await root.locator('.is-optional').evaluate(node => { node.open = true; });
    await root.locator('input[type="radio"][value="same"]').check(); await root.locator('[data-is-test]').click();
    assert.match(await root.locator('[data-is-predict-feedback]').textContent(), /remains \+0\.060 mm.*main vise was not changed/);
    assert.equal(await root.locator('[data-is-readout]').textContent(), mainReadout, 'optional prediction uses isolated state');
    await root.locator('[data-is-reset]').click();
    await root.locator('[data-is="kind"]').selectOption('bump');
    assert.match(await root.locator('[data-is-readout]').textContent(), /Center reference \+0\.080 mm/);
    assert.match(await root.locator('[data-is-readout]').textContent(), /Right − left 0\.000 mm/);
    const bumpJaw = await root.locator('.is-lab .is-jaw').getAttribute('d');
    await root.locator('[data-is="increment"]').fill('-0.0006'); await root.locator('[data-is="increment"]').blur();
    await root.locator('[data-is-apply]').click();
    assert.equal(await root.locator('.is-lab .is-jaw').getAttribute('d') === bumpJaw, false, 'tilt changes but does not erase the attached bump');
    assert.match(await root.locator('[data-is-readout]').textContent(), /Model summary — full sweep range 0\.113 mm/);
    await root.locator('[data-is="response"]').selectOption('-1');
    assert.match(await root.locator('.is-lab .is-digital-value').textContent(), /\+0\.060/);
    assert.match(await root.locator('[data-is-readout]').textContent(), /Right − left \+0\.060 mm/);
    await root.locator('[data-is="kind"]').selectOption('slope');
    const increment = root.locator('[data-is="increment"]');
    const stagedJaw = await root.locator('.is-lab .is-jaw').getAttribute('d');
    await increment.focus(); await page.keyboard.press('Control+A'); await page.keyboard.type('-0.0004'); await increment.blur();
    assert.equal(await increment.inputValue(), '-0.0004', 'negative decimal survives real keyboard entry');
    assert.equal(await root.locator('.is-lab .is-jaw').getAttribute('d'), stagedJaw, 'staging an increment alone does not move the vise');
    const beforeInvalid = { jaw: await root.locator('.is-lab .is-jaw').getAttribute('d'), digital: await root.locator('.is-lab .is-digital-value').textContent(), readout: await root.locator('[data-is-readout]').textContent() };
    await increment.fill('0.00004'); await increment.blur(); await root.locator('[data-is-apply]').click();
    assert.match(await root.locator('[data-is-feedback]').textContent(), /multiple of 0\.0001 mm per mm/);
    assert.deepEqual({ jaw: await root.locator('.is-lab .is-jaw').getAttribute('d'), digital: await root.locator('.is-lab .is-digital-value').textContent(), readout: await root.locator('[data-is-readout]').textContent() }, beforeInvalid, 'off-grid typed increment is rejected without changing state');
    for (const limit of ['-0.001', '0.001']) {
      await root.locator('[data-is-reset]').click(); await increment.fill(limit); await increment.blur(); await root.locator('[data-is-apply]').click();
      const cy = Number(await root.locator('.is-lab .is-contact').getAttribute('cy'));
      assert.ok(cy >= 35 && cy <= 130, `rotation increment ${limit}: contact remains inside physical panel at cy ${cy}`);
    }
    await root.locator('[data-is-reset]').click(); await increment.fill('0.0004'); await increment.blur(); await root.locator('[data-is-apply]').click();
    await root.locator('[data-is="position"]').fill('100'); await root.locator('[data-is-zero]').click(); await root.locator('[data-is="pivot"]').selectOption('50');
    await increment.fill('-0.0008'); await increment.blur(); await root.locator('[data-is-apply]').click();
    assert.match(await root.locator('.is-lab .is-digital-value').textContent(), /−0\.040/);
    assert.match(await root.locator('[data-is-readout]').textContent(), /Stored zero at 100\.000 mm/);
    await root.locator('[data-is-reset]').click();
    await root.locator('[data-is="position"]').focus(); await page.keyboard.press('ArrowLeft');
    assert.equal(await root.locator('[data-is="position"]').inputValue(), '99');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme); await page.setViewportSize({ width: 375, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme} page overflow`);
      assert.equal(await root.evaluate(node => node.scrollWidth <= node.clientWidth), true, `${theme} module overflow`);
      assert.ok(await root.locator('[data-is-test]').evaluate(node => node.getBoundingClientRect().height) >= 44, `${theme} prediction action is at least 44px tall`);
      assert.equal(await root.locator('.is-lab .is-svg text').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height >= 10)), true, `${theme} diagram labels remain legible at phone width`);
      const clipped = await root.locator('.is-lab .is-svg text').evaluateAll(nodes => nodes.map(node => { const box = node.getBBox(); return { text: node.textContent, x: box.x, right: box.x + box.width, y: box.y, bottom: box.y + box.height }; }).filter(box => box.x < -0.5 || box.right > 640.5 || box.y < -0.5 || box.bottom > 230.5));
      assert.deepEqual(clipped, [], `${theme} diagram labels stay inside the viewBox`);
      assert.equal(await root.locator('.is-lab .is-svg').evaluate(node => { const a = node.querySelector('.is-pivot-label').getBBox(), b = node.querySelector('.is-pivot-line').getBBox(); return a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y; }), true, `${theme} pivot label does not cross its leader`);
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
    assert.equal(await root.locator('.is-static-grid').evaluate(node => getComputedStyle(node).display), 'block', 'print uses one fragmentable flow');
    assert.equal(await root.locator('.is-static-grid > figure').first().evaluate(node => getComputedStyle(node).breakInside), 'auto', 'tall first demonstration may split between coherent blocks');
    assert.equal(await root.locator('.is-static-grid > figure').nth(1).evaluate(node => getComputedStyle(node).breakInside), 'avoid', 'short bump demonstration stays together');
    assert.equal(await root.locator('.is-static-grid .is-svg').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).breakInside === 'avoid')), true, 'physical drawings stay together in print');
    assert.equal(await root.locator('.is-static-grid .is-readout').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).breakInside === 'avoid')), true, 'numeric summaries stay together in print');
    assert.equal(await root.locator('.is-static > p').first().evaluate(node => getComputedStyle(node).breakAfter), 'avoid', 'first-use intro stays with the first demonstration');
    await page.pdf({ path: path.join(out, 'indicator-print.pdf'), printBackground: true }); await page.emulateMedia({ media: 'screen' });
    const mounts = await page.evaluate(() => { const a = document.querySelector('[data-interactive="indicator-sweep"]'), b = a.cloneNode(true); b.querySelector('.is-lab').remove(); b.classList.remove('is-live'); delete b.dataset.isReady; a.after(b); const s = document.createElement('script'); s.src = document.querySelector('script[src*="indicator-sweep/demo.js"]').src; document.body.append(s); return new Promise(resolve => setTimeout(() => resolve(document.querySelectorAll('[data-is-ready]').length), 100)); });
    assert.equal(mounts, 2); assert.deepEqual(await page.locator('[data-interactive="indicator-sweep"] [id]').evaluateAll(nodes => { const seen = new Set(); return nodes.map(n => n.id).filter(id => seen.has(id) || !seen.add(id)); }), []);
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } }), noJsPage = await noJs.newPage();
    await noJsPage.goto(url, { waitUntil: 'networkidle' }); await noJsPage.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    assert.equal(await noJsPage.locator('[data-interactive="indicator-sweep"] .is-static').isVisible(), true);
    assert.match(await noJsPage.locator('[data-interactive="indicator-sweep"] .is-static').textContent(), /Equal endpoints can hide/);
    assert.match(await noJsPage.locator('[data-interactive="indicator-sweep"] .is-static').textContent(), /apply the same small corrective rotation about different illustrative pivots/i);
    assert.doesNotMatch(await noJsPage.locator('[data-interactive="indicator-sweep"] .is-static').textContent(), /before and after zeroing at midspan/i);
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

