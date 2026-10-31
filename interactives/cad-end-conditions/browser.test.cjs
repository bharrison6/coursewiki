'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const B = require('../../tests/support/browser.cjs');
const base = B.browserURL && B.browserURL.replace(/\/+$/, '');

test('end-condition first use, goals, native controls, modes, no-JS and offline aggregate', { skip: B.skip }, async () => {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-det102-cad-end-conditions-'));
  const browser = await B.launch();
  async function navigate(page, route) {
    const response = await page.goto(base + route);
    assert.equal(response && response.status(), 200, 'Expected HTTP 200 at ' + route);
  }
  try {
    for (const asset of ['model.js', 'render.js', 'demo.js', 'demo.css']) {
      const response = await fetch(base + '/interactives/cad-end-conditions/' + asset);
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(__dirname, asset)));
    }
    for (const width of [1280, 390]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await navigate(page, '/engineering-graphics/extrude-and-revolve.html?p=part-features');
      await page.evaluate(value => { document.documentElement.dataset.theme = value; document.querySelectorAll('details.xcard').forEach(card => { card.open = true; }); }, theme);
      const lab = page.locator('.cec-lab'), q = key => lab.locator('[data-cec="' + key + '"]');
      await lab.waitFor();
      assert.match(await q('feedback').textContent(), /12 mm blind cut currently crosses the 10 mm plate/);
      assert.equal(await q('removed').locator('strong').textContent(), '10 mm');
      assert.equal(await q('floor').locator('strong').textContent(), '0 mm');
      assert.match(await q('drawing').locator('svg').getAttribute('aria-label'), /open through plate/);
      await q('prediction').selectOption('floor');
      const url = page.url(); await q('test').press('Enter'); assert.equal(page.url(), url);
      assert.match(await q('feedback').textContent(), /Prediction matches.*4 mm of floor remains.*goal is not met/i);
      assert.equal(await q('removed').locator('strong').textContent(), '12 mm');
      assert.equal(await q('floor').locator('strong').textContent(), '4 mm');

      await q('goal').selectOption('retained-pocket'); await q('prediction').selectOption('floor'); await q('test').press('Space');
      assert.match(await q('feedback').textContent(), /Prediction matches.*goal is met/i);
      assert.equal(await q('prediction').inputValue(), 'floor');
      await q('thickness').fill('20');
      assert.equal(await q('prediction').inputValue(), '', 'draft thickness invalidates the old prediction');
      assert.match(await q('feedback').textContent(), /draft.*last accepted geometry/i);
      assert.equal(await q('floor').locator('strong').textContent(), '4 mm', 'draft input does not relabel the accepted drawing');
      await q('thickness').fill('16');
      await q('goal').selectOption('through-cut');
      assert.equal(await q('prediction').inputValue(), '', 'a setup change clears the tested prediction');
      assert.equal(await q('floor').locator('strong').textContent(), '0 mm', 'a setup change restores the 10 mm starting plate');
      await q('goal').selectOption('retained-pocket');
      await q('end-type').selectOption('through-all'); await q('prediction').selectOption('open'); await q('test').click();
      assert.match(await q('feedback').textContent(), /Through all follows.*goal is not met/i);
      assert.equal(await q('depth').isDisabled(), true);

      await q('reset').click(); await q('thickness').fill('0.001'); await q('prediction').selectOption('floor'); await q('test').click();
      assert.match(await q('feedback').textContent(), /0.01 to 1000 mm.*last accepted geometry remains/i);
      assert.equal(await q('removed').locator('strong').textContent(), '10 mm');
      await q('reset').click(); await q('depth').fill('0'); await q('end-type').selectOption('through-all');
      assert.equal(await q('end-type').inputValue(), 'through-all', 'an inactive invalid blind input cannot block Through all');
      assert.equal(await q('depth').inputValue(), '12');
      assert.equal(await q('depth').isDisabled(), true);
      await q('end-type').selectOption('blind'); await q('depth').fill('0'); await q('depth').dispatchEvent('change');
      assert.equal(await q('end-type').inputValue(), 'blind'); assert.equal(await q('depth').inputValue(), '12');
      assert.match(await q('feedback').textContent(), /Controls returned to the last accepted setup/);
      await q('depth').fill('0.3'); await q('depth').dispatchEvent('change'); await q('thickness').fill('0.3'); await q('prediction').selectOption('open'); await q('test').click();
      assert.equal(await q('floor').locator('strong').textContent(), '0 mm');
      assert.match(await q('feedback').textContent(), /Prediction matches/);

      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.evaluate(() => { const control = document.createElement('div'); control.id = 'cec-overflow-control'; control.style.cssText = 'width:2200px;min-width:2200px;height:1px'; document.body.append(control); });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), true);
      await page.locator('#cec-overflow-control').evaluate(node => node.remove());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await lab.screenshot({ path: path.join(evidence, width + '-' + theme + '.png') });

      if (width === 1280 && theme === 'light') {
        await page.evaluate(() => { const original = document.querySelector('[data-interactive="cad-end-conditions"]'), copy = original.cloneNode(true); copy.querySelector('.cec-lab').remove(); copy.classList.remove('cec-live'); delete copy.dataset.cecReady; original.after(copy); });
        const src = await page.locator('script[src*="cad-end-conditions/demo.js"]').getAttribute('src'); await page.addScriptTag({ url: new URL(src, page.url()).href });
        const labs = page.locator('.cec-lab'); assert.equal(await labs.count(), 2);
        await labs.nth(1).locator('[data-cec="end-type"]').selectOption('through-all');
        assert.equal(await labs.nth(0).locator('[data-cec="end-type"]').inputValue(), 'blind');
        assert.equal(await labs.nth(1).locator('[data-cec="end-type"]').inputValue(), 'through-all');
        await page.locator('[data-interactive="cad-end-conditions"]').nth(1).evaluate(node => node.remove());
        await page.emulateMedia({ media: 'print' }); assert.equal(await lab.isVisible(), false); assert.equal(await page.locator('.cec-static').isVisible(), true);
        await page.pdf({ path: path.join(evidence, 'ordinary-print.pdf'), format: 'Letter', printBackground: true });
      }
      assert.deepEqual(errors, []); await context.close();
    }

    const presentation = await browser.newContext({ viewport: { width: 1280, height: 800 } }), presented = await presentation.newPage();
    await navigate(presented, '/engineering-graphics/extrude-and-revolve.html?p=part-features&present=1');
    await presented.locator('.cec-lab').waitFor(); assert.equal(await presented.locator('.cec-lab').isVisible(), true); await presentation.close();

    const nojs = await browser.newContext({ javaScriptEnabled: false }), plain = await nojs.newPage();
    await navigate(plain, '/engineering-graphics/extrude-and-revolve.html');
    const card = plain.locator('details.xcard').filter({ has: plain.locator('.cec-static') }); await card.locator(':scope > summary').click();
    assert.equal(await plain.locator('.cec-static').isVisible(), true); assert.equal(await plain.locator('.cec-static svg').count(), 3);
    assert.match(await plain.locator('.cec-static').textContent(), /Worked thickness edit.*floor 4 mm.*selected plate thickness/is);
    await plain.pdf({ path: path.join(evidence, 'nojs-print.pdf'), format: 'Letter', printBackground: true }); await nojs.close();

    const offline = await browser.newContext(), aggregate = await offline.newPage();
    const aggregateURL = base + '/print/track-part-features.html', siblingRequests = [];
    await aggregate.route('**/*', route => { if (route.request().url() === aggregateURL) return route.continue(); siblingRequests.push(route.request().url()); return route.abort(); });
    const response = await aggregate.goto(aggregateURL); assert.equal(response.status(), 200);
    await aggregate.evaluate(() => document.querySelectorAll('details.xcard').forEach(card => { card.open = true; }));
    const aggregateLab = aggregate.locator('.cec-lab'); await aggregateLab.waitFor();
    await aggregateLab.locator('[data-cec="prediction"]').selectOption('floor'); await aggregateLab.locator('[data-cec="test"]').click();
    assert.match(await aggregateLab.locator('[data-cec="feedback"]').textContent(), /4 mm of floor remains/);
    assert.equal(siblingRequests.every(url => new URL(url).hostname === 'fonts.googleapis.com'), true, 'Only optional shared font requests may be attempted offline');
    await aggregate.emulateMedia({ media: 'print' }); assert.equal(await aggregateLab.isVisible(), false); assert.equal(await aggregate.locator('.cec-static').isVisible(), true);
    await aggregate.pdf({ path: path.join(evidence, 'offline-print.pdf'), format: 'Letter', printBackground: true });
    await offline.close(); console.log('Evidence: ' + evidence);
  } finally { await browser.close(); }
});
