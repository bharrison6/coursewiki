'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { browserURL, skip, launch } = require('../../tests/support/browser.cjs');
const PAGE = '/materials-and-processes/making-silicone-molds-from-a-printed-pattern.html';
const ROOT = '[data-interactive="resin-batch"]';
const base = (browserURL || '').replace(/\/$/, '');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-resin-batch-browser-'));
const part = (root, key) => root.locator('[data-rb="' + key + '"]');
const input = (root, key) => root.locator('[data-rb-input="' + key + '"]');
async function open(browser, suffix = '', options = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, ...options });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(base + PAGE + suffix, { waitUntil: 'networkidle' });
  await page.locator('details.xcard').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
  return { page, root: page.locator(ROOT), errors };
}
async function reveal(root, prediction = 'given-a') {
  await root.locator('input[type="radio"][value="' + prediction + '"]').check();
  await part(root, 'reveal').click();
}

test('batch meanings, basis/density controls, unit invariance, tare and invalid recovery', { skip }, async () => {
  const browser = await launch();
  try {
    const { page, root, errors } = await open(browser);
    assert.equal(await root.getAttribute('data-rb-ready'), 'true');
    assert.equal(await part(root, 'reveal').isDisabled(), true);
    assert.equal(await part(root, 'experiment').isHidden(), true);
    await reveal(root, 'same');
    assert.match(await part(root, 'feedback').textContent(), /200 g A \+ 20 g B.*220 g A.*22 g B.*242 g total/);
    assert.match(await root.locator('[data-rb-compare="total"]').textContent(), /A 200 g.*B 20 g.*220 g material/);
    assert.match(await root.locator('[data-rb-compare="given-a"]').textContent(), /A 220 g.*B 22 g.*242 g material/);
    assert.match(await root.locator('.rb-working').textContent(), /220 g × 10\/\(10 \+ 1\) = 200 g.*220 g × 1\/\(10 \+ 1\) = 20 g.*220 g × 1\/10 = 22 g/);
    // The two diagrams use a common scale, not independent 100% normalization.
    const widths = await root.locator('.rb-bar').evaluateAll(nodes => nodes.map(node => [...node.children].reduce((sum, child) => sum + child.getBoundingClientRect().width, 0) / node.getBoundingClientRect().width));
    assert.ok(Math.abs(widths[0] / widths[1] - 220 / 242) < 0.002);
    assert.match(await root.locator('.rb-scale').textContent(), /35 g.*235 g.*200 g.*255 g.*220 g/);
    await part(root, 'mode').selectOption('given-a');
    assert.equal(await root.locator('[data-rb-compare="given-a"]').getAttribute('data-selected'), 'true');
    assert.match(await root.locator('.rb-scale').textContent(), /255 g.*220 g.*277 g.*242 g/);
    await root.locator('[data-rb-preset="mass"]').click();
    assert.match(await root.locator('.rb-components').textContent(), /200 g.*166\.6667 mL.*100 g.*125 mL/);
    assert.match(await part(root, 'equivalent').textContent(), /mass ratio 2:1.*volume ratio 1\.3333:1/);
    assert.match(await root.locator('.rb-spec-compare').textContent(), /by mass gives A 200 g and B 100 g.*by volume gives A 225 g and B 75 g/);
    await part(root, 'basis').selectOption('volume');
    assert.match(await root.locator('.rb-components').textContent(), /225 g.*187\.5 mL.*75 g.*93\.75 mL/);
    assert.match(await part(root, 'equivalent').textContent(), /mass ratio 3:1.*volume ratio 2:1/);
    assert.match(await root.locator('.rb-working').textContent(), /mass weights.*2\.4:0\.8.*VA = mA\/ρA/);
    await part(root, 'unit').selectOption('kg');
    assert.equal(await input(root, 'amount').inputValue(), '0.3');
    assert.equal(await input(root, 'tare').inputValue(), '0.035');
    assert.match(await root.locator('.rb-components').textContent(), /0\.225 kg.*187\.5 mL.*0\.075 kg.*93\.75 mL/);
    assert.match(await root.locator('.rb-scale').textContent(), /0\.035 kg.*0\.26 kg.*0\.335 kg.*0\.3 kg/);
    await part(root, 'unit').selectOption('g');
    await input(root, 'density-a').fill('0.8');
    assert.match(await root.locator('.rb-components').textContent(), /200 g.*250 mL.*100 g.*125 mL/);
    assert.match(await root.locator('.rb-spec-compare').textContent(), /densities are equal/);
    for (const [key, invalid] of [['amount', ''], ['ratio-a', '0'], ['density-b', '-1'], ['tare', '-3']]) {
      const previous = await input(root, key).inputValue();
      await input(root, key).fill(invalid);
      assert.equal(await part(root, 'results').textContent(), '', 'invalid ' + key + ' clears every calculated result');
      assert.equal(await root.locator('.rb-bar').count(), 0, 'invalid ' + key + ' clears bars');
      assert.match(await part(root, 'error').textContent(), /No batch shown/);
      await input(root, key).fill(previous);
      assert.equal(await part(root, 'error').textContent(), '');
      assert.equal(await root.locator('.rb-bar').count(), 2);
    }
    await root.locator('[data-rb-preset="initial"]').click();
    await input(root, 'tare').fill('0');
    assert.match(await root.locator('.rb-scale').textContent(), /No tare: 0 g.*No tare: 200 g.*No tare: 220 g/);
    assert.deepEqual(errors, []);
    await root.screenshot({ path: path.join(out, 'desktop-controls.png') });
  } finally { await browser.close(); }
  console.log('PASS evidence: ' + out);
});

test('reading/presentation, both themes, 375/390px fit and real keyboard input', { skip }, async () => {
  const browser = await launch();
  try {
    for (const theme of ['light', 'dark']) for (const width of [375, 390, 1280]) for (const present of [false, true]) {
      const { page, root, errors } = await open(browser, '?p=manufacturing-documentation' + (present ? '&present=1' : ''), { viewport: { width, height: 900 }, colorScheme: theme });
      await reveal(root);
      await root.locator('[data-rb-preset="volume"]').click();
      const url = page.url();
      await input(root, 'amount').focus();
      await page.keyboard.press('ArrowUp');
      assert.equal(Number(await input(root, 'amount').inputValue()), 301, 'real number input key works');
      assert.equal(page.url(), url, 'control key keeps current lesson');
      // Probe control: this exact document-overflow measurement must catch planted overflow.
      const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      assert.equal(await fits(), true, `${theme}/${width}/${present}: document fits`);
      await page.evaluate(() => { const probe = document.createElement('div'); probe.id = 'rb-overflow-control'; probe.style.cssText = 'position:absolute;left:0;width:200vw;height:1px'; document.body.append(probe); });
      assert.equal(await fits(), false, 'planted positive overflow control fires');
      await page.locator('#rb-overflow-control').evaluate(node => node.remove());
      assert.equal(await fits(), true, 'negative control after removal');
      assert.equal(await root.evaluate(node => node.scrollWidth <= node.clientWidth), true, 'module fits');
      const sizes = await root.locator('button,select,input[type="number"]').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().height));
      assert.ok(sizes.every(height => height >= 43.9), '44px controls');
      assert.deepEqual(errors, []);
      await root.screenshot({ path: path.join(out, `${theme}-${width}-${present ? 'presentation' : 'reading'}.png`) });
      await page.close();
    }
  } finally { await browser.close(); }
});

test('no-JS fallback, fixed worked examples and JS-on/off print', { skip }, async () => {
  const browser = await launch();
  try {
    for (const javaScriptEnabled of [false, true]) {
      const context = await browser.newContext({ javaScriptEnabled, viewport: { width: 375, height: 900 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.goto(base + PAGE, { waitUntil: 'networkidle' });
      await page.locator('details.xcard').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
      const root = page.locator(ROOT), fallback = root.locator('.rb-static');
      if (!javaScriptEnabled) {
        assert.equal(await root.locator('.rb-lab').count(), 0);
        assert.equal(await fallback.isVisible(), true);
        assert.match(await fallback.textContent(), /200 g.*20 g.*220 g.*220 g.*22 g.*242 g/);
        assert.match(await fallback.textContent(), /500\/3 mL.*166\.6667 mL.*125 mL.*225 g.*187\.5 mL.*75 g.*93\.75 mL/);
        const region = fallback.locator('[role="region"]').last();
        await region.focus();
        assert.equal(await region.evaluate(node => document.activeElement === node), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: path.join(out, 'nojs-phone.png'), fullPage: true });
      } else { await reveal(root); }
      await page.emulateMedia({ media: 'print' });
      assert.equal(await fallback.isVisible(), true);
      assert.equal(await root.locator('.rb-lab').isVisible(), false);
      assert.equal(await fallback.locator('table').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().right <= node.parentElement.getBoundingClientRect().right + 1)), true, 'static tables fit print');
      await page.pdf({ path: path.join(out, 'print-' + (javaScriptEnabled ? 'js' : 'nojs') + '.pdf'), printBackground: true, format: 'Letter' });
      await context.close();
    }
  } finally { await browser.close(); }
});

test('standalone aggregate inlines model and two independent roots; existing practice routes work', { skip }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    // Use actual built self-contained aggregate, with network access blocked after the main HTML.
    await page.route('**/*', async route => {
      if (!route.request().isNavigationRequest()) return route.abort();
      const response = await route.fetch();
      const body = await response.text();
      assert.ok(body.includes('<div data-interactive="resin-batch">'), 'actual aggregate contains the authored mount');
      await route.fulfill({ response, body: body.replace('<div data-interactive="resin-batch">', '<div data-interactive="resin-batch"><p>Second-instance fixture in the actual standalone aggregate.</p></div><div data-interactive="resin-batch">') });
    });
    await page.goto(base + '/print/track-manufacturing-documentation.html', { waitUntil: 'networkidle' });
    await page.locator('details.xcard').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    const first = page.locator(ROOT).first();
    assert.equal(await first.getAttribute('data-rb-ready'), 'true');
    const roots = page.locator(ROOT);
    assert.equal(await roots.count(), 2);
    await reveal(roots.nth(0)); await reveal(roots.nth(1), 'total');
    await roots.nth(0).locator('[data-rb-preset="volume"]').click();
    assert.equal(await input(roots.nth(1), 'amount').inputValue(), '220');
    assert.equal(await part(roots.nth(1), 'basis').inputValue(), 'mass');
    assert.match(await roots.nth(1).locator('[data-rb-compare="total"]').textContent(), /200 g.*20 g.*220 g/);
    const duplicates = await roots.evaluateAll(nodes => { const ids = nodes.flatMap(node => [...node.querySelectorAll('[id]')].map(element => element.id)); return ids.filter((id, index) => ids.indexOf(id) !== index); });
    assert.deepEqual(duplicates, []);
    assert.deepEqual(errors, []);
    await page.close();
    const practice = await browser.newPage();
    await practice.goto(base + '/practice.html#documentation-silicone-total', { waitUntil: 'networkidle' });
    for (const [id, correct, wrong] of [['documentation-silicone-total', '30', '33'], ['documentation-silicone-base', '27.5', '25']]) {
      const item = practice.locator('#' + id);
      for (const [value, state] of [[correct, 'correct'], [wrong, 'incorrect']]) {
        await item.locator('[data-practice-input]').fill(value); await item.locator('[data-practice-check]').click();
        assert.equal(await item.getAttribute('data-state'), state, id + ': ' + value);
      }
    }
  } finally { await browser.close(); }
});
