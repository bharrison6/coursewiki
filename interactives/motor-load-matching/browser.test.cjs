'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { browserURL, skip, launch } = require('../../tests/support/browser.cjs');

test('motor-load-matching first-use, responsive, print, no-JS and practice acceptance', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-motor-load-matching-'));
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = browserURL.replace(/\/$/, '') + '/engineering/dc-motor-curves.html';
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    const root = page.locator('[data-interactive="motor-load-matching"]');
    await expectCount(root, 1);
    assert.equal(await root.getAttribute('data-mlm-ready'), 'true');
    assert.equal(await root.locator('[data-results]').isHidden(), true);
    assert.equal(await root.locator('[data-reveal]').isDisabled(), true);
    await root.locator('input[value="geared"]').check();
    await root.locator('[data-reveal]').click();
    assert.match(await root.locator('[data-prompt]').textContent(), /Prediction confirmed: gear reduction/);
    const first = await root.locator('[data-results]').textContent();
    assert.match(first, /30 rpm/);
    assert.match(first, /35 rpm/);
    assert.match(first, /shaft power changed from 1\.885 W to 2\.443 W/);

    await setInput(root, 'load', '0.9');
    assert.equal(await root.locator('[data-results]').isHidden(), true, 'input change hides stale result');
    await root.locator('input[value="geared"]').check();
    await root.locator('[data-reveal]').click();
    assert.match(await root.locator('[data-results]').textContent(), /No forward steady operating point/);
    assert.match(await root.locator('[data-results]').textContent(), /22\.5 rpm/);

    await setInput(root, 'load', '2');
    await root.locator('input[value="neither"]').check();
    await root.locator('[data-reveal]').click();
    assert.match(await root.locator('[data-prompt]').textContent(), /Prediction confirmed: neither connection/);
    assert.equal((await root.locator('[data-results]').textContent()).match(/No forward steady operating point/g).length, 2);

    await setInput(root, 'load', '0.6'); await setInput(root, 'driver', '40'); await setInput(root, 'driven', '40');
    await root.locator('input[value="same"]').check(); await root.locator('[data-reveal]').click();
    assert.match(await root.locator('[data-prompt]').textContent(), /driven gear teeth must exceed driver/);
    await setInput(root, 'driver', '40'); await setInput(root, 'driven', '20');
    await root.locator('input[value="neither"]').check(); await root.locator('[data-reveal]').click();
    assert.match(await root.locator('[data-prompt]').textContent(), /21–60 whole driven teeth/);

    await setInput(root, 'driver', '20'); await setInput(root, 'driven', '40'); await setInput(root, 'load', '0.6');
    await root.locator('[data-key="load"]').focus();
    await page.keyboard.press('ArrowUp');
    assert.equal(await root.locator('[data-key="load"]').inputValue(), '0.61', 'real keyboard changes load input');
    await setInput(root, 'load', '0.6');

    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      await page.setViewportSize({ width: 375, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme} document overflow`);
      assert.equal(await root.evaluate(node => node.scrollWidth <= node.clientWidth), true, `${theme} module overflow`);
      assert.equal(await root.locator('label').evaluateAll(nodes => nodes.every(node => parseFloat(getComputedStyle(node).fontSize) >= 12)), true);
      await page.screenshot({ path: path.join(out, `motor-load-mobile-${theme}.png`), fullPage: true });
    }
    assert.equal(await page.evaluate(() => { const e = document.documentElement; const old = e.style.minWidth; e.style.minWidth = '2000px'; const hit = e.scrollWidth > innerWidth; e.style.minWidth = old; return hit; }), true, 'positive document overflow control');
    const overflowControl = await root.evaluate(node => { const e = document.createElement('div'); e.style.cssText = 'width:2000px;min-width:2000px;height:1px'; node.append(e); const result = { hit: node.scrollWidth > node.clientWidth, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, childWidth: e.getBoundingClientRect().width }; e.remove(); return result; });
    assert.equal(overflowControl.hit, true, 'positive module overflow control: ' + JSON.stringify(overflowControl));

    await page.emulateMedia({ media: 'print' });
    assert.equal(await root.locator('.mlm-live').evaluate(node => getComputedStyle(node).display), 'none');
    assert.equal(await root.locator('.mlm-static').evaluate(node => getComputedStyle(node).display), 'block');
    await page.pdf({ path: path.join(out, 'motor-load-print.pdf'), printBackground: true });
    await page.emulateMedia({ media: 'screen' });

    const cloneReady = await page.evaluate(() => {
      const original = document.querySelector('[data-interactive="motor-load-matching"]');
      const clone = original.cloneNode(true); clone.querySelector('.mlm-live').remove(); delete clone.dataset.mlmReady;
      original.after(clone); const script = document.createElement('script');
      script.src = document.querySelector('script[src*="motor-load-matching/demo.js"]').src; document.body.append(script);
      return new Promise(resolve => setTimeout(() => resolve(document.querySelectorAll('[data-mlm-ready]').length), 100));
    });
    assert.equal(cloneReady, 2, 'two independent instances initialize');
    const duplicateIds = await page.locator('[data-interactive="motor-load-matching"] [id]').evaluateAll(nodes => { const seen = new Set(), duplicates = []; nodes.forEach(node => seen.has(node.id) ? duplicates.push(node.id) : seen.add(node.id)); return duplicates; });
    assert.deepEqual(duplicateIds, [], 'instance IDs are unique');

    await page.goto(browserURL.replace(/\/$/, '') + '/practice.html#motor-match-reflected-torque', { waitUntil: 'networkidle' });
    for (const [id, correct, wrong] of [
      ['motor-match-reflected-torque', '0.3333', '0.3'], ['motor-match-output-speed', '35', '70'],
      ['motor-match-output-power', '2.198', '23.33'], ['motor-match-power-explanation', '3', '1'],
      ['motor-match-direct-overload', '22.5', '45']
    ]) {
      for (const [value, state] of [[correct, 'correct'], [wrong, 'incorrect']]) {
        const item = page.locator('#' + id); await item.locator('[data-practice-input]').fill(value); await item.locator('[data-practice-check]').click();
        assert.equal(await item.getAttribute('data-state'), state, `${id} ${value}`);
      }
    }

    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
    const noJsPage = await noJs.newPage();
    await noJsPage.goto(url, { waitUntil: 'networkidle' });
    await noJsPage.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    assert.equal(await noJsPage.locator('[data-interactive="motor-load-matching"] .mlm-static').isVisible(), true);
    assert.equal(await noJsPage.locator('[data-interactive="motor-load-matching"] .mlm-live').count(), 0);
    assert.match(await noJsPage.locator('[data-interactive="motor-load-matching"] .mlm-static').textContent(), /motor shaft power changed/);
    const tableRegion = noJsPage.locator('[data-interactive="motor-load-matching"] .mlm-table-scroll');
    for (const width of [375, 390]) {
      await noJsPage.setViewportSize({ width, height: 900 });
      assert.equal(await noJsPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no-JS ${width}: document overflow`);
      assert.equal(await noJsPage.locator('[data-interactive="motor-load-matching"]').evaluate(node => node.scrollWidth <= node.clientWidth), true, `no-JS ${width}: module clipping`);
      assert.equal(await tableRegion.evaluate(node => node.scrollWidth > node.clientWidth), true, `no-JS ${width}: table has a bounded scroll region`);
      await tableRegion.focus();
      assert.equal(await tableRegion.evaluate(node => document.activeElement === node), true, `no-JS ${width}: table region is keyboard reachable`);
      const lastColumn = await tableRegion.evaluate(node => { node.scrollLeft = node.scrollWidth; const region = node.getBoundingClientRect(), cell = node.querySelector('thead th:last-child').getBoundingClientRect(); return { scrolled: node.scrollLeft > 0, visible: cell.right <= region.right + 1 && cell.left >= region.left - 1 }; });
      assert.deepEqual(lastColumn, { scrolled: true, visible: true }, `no-JS ${width}: last power column is reachable`);
    }
    await noJsPage.emulateMedia({ media: 'print' });
    assert.equal(await tableRegion.evaluate(node => getComputedStyle(node).overflowX), 'visible');
    assert.equal(await tableRegion.evaluate(node => node.querySelector('table').getBoundingClientRect().right <= node.getBoundingClientRect().right + 1), true, 'print table remains inside its region');
    await noJsPage.pdf({ path: path.join(out, 'motor-load-nojs-print.pdf'), printBackground: true });
    await noJs.close();

    const aggregate = fs.readFileSync(path.resolve(__dirname, '../../docs/print/track-det-403.html'), 'utf8');
    assert.ok(aggregate.includes('The same motor and output load, two connections'));
    assert.ok(aggregate.includes('CourseWikiMotorLoad'));
    assert.deepEqual(errors, []);
    console.log(`PASS evidence: ${out}`);
  } finally { await browser.close(); }
});

async function setInput(root, key, value) {
  const input = root.locator(`[data-key="${key}"]`); await input.fill(value); await input.dispatchEvent('input');
}
async function expectCount(locator, count) { assert.equal(await locator.count(), count); }
