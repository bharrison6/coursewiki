'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { browserURL, skip, launch } = require('../../tests/support/browser.cjs');

test('fiber-orientation first-use, phone SVG, no-JS table, print and practice', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'coursewiki-fiber-orientation-'));
  const browser = await launch();
  try {
    const url = browserURL.replace(/\/$/, '') + '/materials-and-processes/fiber-direction-and-stiffness.html';
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 375, height: 900 }, colorScheme: theme });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
      const root = page.locator('[data-interactive="fiber-orientation"]');
      assert.equal(await root.count(), 1);
      assert.equal(await root.getAttribute('data-fo-ready'), 'true');
      assert.equal(await root.locator('[data-fo="experiment"]').isHidden(), true);
      assert.equal(await root.locator('[data-fo="reveal"]').isDisabled(), true);
      await root.locator('input[value="90"]').check();
      await root.locator('[data-fo="reveal"]').click();
      assert.match(await root.locator('[data-fo="feedback"]').textContent(), /0° stretches least/);
      assert.match(await root.locator('[data-fo="readings"]').textContent(), /10\.00 GPa/);
      await root.locator('[data-angle="-45"]').click();
      assert.match(await root.locator('[data-fo="readings"]').textContent(), /375\.0 µε/);
      assert.match(await root.locator('[data-fo="svg-desc"]').textContent(), /Fibers at -45 degrees/);
      await root.locator('[data-angle="45"]').click();
      assert.match(await root.locator('[data-fo="readings"]').textContent(), /-375\.0 µε/);
      await root.locator('[data-angle="90"]').click();
      const ninety = await root.locator('[data-fo="readings"]').textContent();
      assert.match(ninety, /0\.0 µε/);
      assert.doesNotMatch(ninety, /-0\.0 µε/);
      const labels = await root.locator('.fo-load-label, .fo-free-label').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, height: node.getBoundingClientRect().height, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })));
      assert.ok(labels.every(label => label.height >= 15), 'phone SVG labels >=15px actual height: ' + JSON.stringify(labels));
      const svg = await root.locator('[data-fo="svg"]').boundingBox();
      assert.ok(labels.every(label => label.left >= svg.x && label.right <= svg.x + svg.width), 'labels remain inside SVG: ' + JSON.stringify(labels));
      const arrow = await root.locator('marker path').first().evaluate(node => getComputedStyle(node).fill);
      const line = await root.locator('.fo-load line').first().evaluate(node => getComputedStyle(node).stroke);
      assert.equal(arrow, line, theme + ' arrowhead matches traction line');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, theme + ' document overflow');
      assert.equal(await root.evaluate(node => node.scrollWidth <= node.clientWidth), true, theme + ' module overflow');
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(out, `fiber-orientation-${theme}.png`), fullPage: true });
      await page.close();
    }

    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
    const page = await noJs.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    const root = page.locator('[data-interactive="fiber-orientation"]');
    assert.equal(await root.locator('.fo-lab').count(), 0);
    assert.equal(await root.locator('.fo-static').isVisible(), true);
    const region = root.locator('[role="region"]');
    assert.equal(await region.evaluate(node => node.scrollWidth > node.clientWidth), true, 'phone table has bounded scroll region');
    await region.focus();
    assert.equal(await region.evaluate(node => document.activeElement === node), true, 'table is keyboard reachable');
    const last = await region.evaluate(node => { node.scrollLeft = node.scrollWidth; const a = node.getBoundingClientRect(), b = node.querySelector('thead th:last-child').getBoundingClientRect(); return { scrolled: node.scrollLeft > 0, visible: b.left >= a.left - 1 && b.right <= a.right + 1 }; });
    assert.deepEqual(last, { scrolled: true, visible: true });
    await page.emulateMedia({ media: 'print' });
    assert.equal(await root.locator('.fo-static').isVisible(), true);
    assert.equal(await region.evaluate(node => node.querySelector('table').getBoundingClientRect().right <= node.getBoundingClientRect().right + 1), true, 'print table fits inside its region');
    await page.pdf({ path: path.join(out, 'fiber-orientation-nojs-print.pdf'), printBackground: true });
    await noJs.close();

    const practice = await browser.newPage({ viewport: { width: 900, height: 800 } });
    await practice.goto(browserURL.replace(/\/$/, '') + '/practice.html#fiber-axis-strain', { waitUntil: 'networkidle' });
    for (const [id, correct, wrong] of [
      ['fiber-axis-strain', '0.025', '0.00025'], ['fiber-45-stiffness', '12.90', '0.129'],
      ['fiber-angle-symmetry', '2', '1'], ['fiber-stiffness-not-strength', '3', '1'], ['fiber-stress-force', '2000', '20']
    ]) {
      for (const [value, state] of [[correct, 'correct'], [wrong, 'incorrect']]) {
        const item = practice.locator('#' + id);
        await item.locator('[data-practice-input]').fill(value);
        await item.locator('[data-practice-check]').click();
        assert.equal(await item.getAttribute('data-state'), state, id + ' ' + value);
      }
    }
    await practice.close();
    console.log('PASS evidence: ' + out);
  } finally { await browser.close(); }
});
