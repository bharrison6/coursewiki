'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const B = require('../../tests/support/browser.cjs');
const base = B.browserURL && B.browserURL.replace(/\/+$/, '');

test('reference-transfer scenarios, repairs, independent roots, phones, themes, no-JS and offline aggregate', { skip: B.skip }, async () => {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-det102-cad-reference-transfer-'));
  const browser = await B.launch();
  async function navigate(page, route) {
    const response = await page.goto(base + route);
    assert.equal(response && response.status(), 200, 'Expected HTTP 200 at ' + base + route);
  }
  try {
    for (const asset of ['model.js', 'render.js', 'demo.js', 'demo.css']) {
      const response = await fetch(base + '/interactives/cad-reference-transfer/' + asset);
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(__dirname, asset)));
    }
    for (const width of [1280, 390, 375]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await navigate(page, '/engineering-graphics/cad-files-and-documents.html');
      await page.evaluate(value => { document.documentElement.dataset.theme = value; document.querySelectorAll('details.xcard').forEach(card => { card.open = true; }); }, theme);
      const lab = page.locator('.crt-lab'), q = key => lab.locator('[data-crt="' + key + '"]');
      await lab.waitFor();
      assert.match(await q('prompt').textContent(), /drawing.*model view/i);
      assert.equal(await q('results').locator('div').nth(2).locator('strong').textContent(), '1');
      await lab.locator('.crt-predict input[value="incomplete"]').check(); await q('check').press('Enter');
      assert.match(await q('status').textContent(), /Prediction matches.*Package incomplete.*Bracket model/);
      await q('package').locator('input[value="bracket-model"]').check(); await q('check').click();
      assert.match(await q('status').textContent(), /Package complete.*Every reachable required edge resolves/);

      await q('scenario').selectOption('shared');
      assert.equal(await q('results').locator('div').first().locator('strong').textContent(), '6');
      assert.equal(await q('graph').locator('text').filter({ hasText: 'Shared pivot pin' }).count(), 1);
      assert.equal(await q('graph').locator('.crt-edge').count(), 6);
      await q('collect').click(); await lab.locator('.crt-predict input[value="complete"]').check(); await q('check').click();
      assert.match(await q('status').textContent(), /Prediction matches.*Package complete/);
      assert.equal(await q('package').locator('input:checked').count(), 6);

      await q('scenario').selectOption('unavailable'); await lab.locator('.crt-predict input[value="incomplete"]').check(); await q('check').click();
      assert.match(await q('status').textContent(), /Package incomplete.*Purchased motor model/);
      assert.equal(await q('results').locator('div').nth(3).locator('strong').textContent(), '1');
      await q('collect').click(); assert.equal(await q('package').locator('input[value="motor"]').isChecked(), false);
      await q('check').click(); assert.match(await q('status').textContent(), /Unavailable at source: Purchased motor model/);

      await q('scenario').selectOption('retarget'); await lab.locator('.crt-predict input[value="incomplete"]').check(); await q('check').click();
      assert.match(await q('status').textContent(), /Locator mismatches: 1/); assert.equal(await q('repairs').locator('button').count(), 1);
      await q('repairs').locator('button').press('Enter'); assert.equal(await q('repairs').locator('button').count(), 0);
      await lab.locator('.crt-predict input[value="complete"]').check(); await q('check').click(); assert.match(await q('status').textContent(), /Package complete/);
      await q('reset').click(); assert.equal(await q('repairs').locator('button').count(), 1, 'reset restores actual unresolved graph state');

      await q('scenario').selectOption('shared');
      await q('roots').locator('input[value="right-arm"]').check(); await q('roots').locator('input[value="clamp-drawing"]').uncheck();
      await q('collect').click(); assert.equal(await q('package').locator('input:checked').count(), 2);
      assert.equal(await q('results').locator('div').first().locator('strong').textContent(), '2');
      const rootBox = await lab.boundingBox(); assert.ok(rootBox.width <= width + 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.evaluate(() => { const control = document.createElement('div'); control.id = 'crt-overflow-control'; control.style.width = '2200px'; document.body.append(control); });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), true);
      await page.locator('#crt-overflow-control').evaluate(node => node.remove());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await lab.screenshot({ path: path.join(evidence, width + '-' + theme + '.png') });

      if (width === 1280 && theme === 'light') {
        await page.evaluate(() => { const original = document.querySelector('[data-interactive="cad-reference-transfer"]'), copy = original.cloneNode(true); copy.querySelector('.crt-lab').remove(); copy.classList.remove('crt-live'); delete copy.dataset.crtReady; original.after(copy); });
        const src = await page.locator('script[src*="cad-reference-transfer/demo.js"]').getAttribute('src'); await page.addScriptTag({ url: new URL(src, page.url()).href });
        const labs = page.locator('.crt-lab'); assert.equal(await labs.count(), 2);
        await labs.nth(1).locator('[data-crt="scenario"]').selectOption('unavailable');
        assert.equal(await labs.nth(0).locator('[data-crt="scenario"]').inputValue(), 'shared');
        assert.equal(await labs.nth(1).locator('[data-crt="scenario"]').inputValue(), 'unavailable');
        await page.locator('[data-interactive="cad-reference-transfer"]').nth(1).evaluate(node => node.remove());
        await page.emulateMedia({ media: 'print' }); assert.equal(await lab.isVisible(), false); assert.equal(await page.locator('.crt-static').isVisible(), true);
        await page.pdf({ path: path.join(evidence, 'ordinary-print.pdf'), format: 'Letter', printBackground: true });
      }
      assert.deepEqual(errors, []); await context.close();
    }

    const nojs = await browser.newContext({ javaScriptEnabled: false }), plain = await nojs.newPage();
    await navigate(plain, '/engineering-graphics/cad-files-and-documents.html');
    const card = plain.locator('details.xcard').filter({ has: plain.locator('.crt-static') }); await card.locator('summary').click();
    assert.equal(await plain.locator('.crt-static').isVisible(), true);
    assert.match(await plain.locator('.crt-static').textContent(), /dependency closure|shared pivot pin|teaching model/i);
    assert.equal(await plain.locator('.crt-static svg').count(), 1);
    await plain.pdf({ path: path.join(evidence, 'nojs-print.pdf'), format: 'Letter', printBackground: true }); await nojs.close();

    const offline = await browser.newContext(), aggregate = await offline.newPage();
    const aggregateURL = base + '/print/track-cad-platform-workflow.html', siblingRequests = [];
    await aggregate.route('**/*', route => { if (route.request().url() === aggregateURL) return route.continue(); siblingRequests.push(route.request().url()); return route.abort(); });
    const response = await aggregate.goto(aggregateURL); assert.equal(response.status(), 200);
    await aggregate.evaluate(() => document.querySelectorAll('details.xcard').forEach(card => { card.open = true; }));
    const aggregateLab = aggregate.locator('.crt-lab'); await aggregateLab.waitFor();
    await aggregateLab.locator('[data-crt="scenario"]').selectOption('retarget');
    assert.equal(await aggregateLab.locator('[data-crt="repairs"] button').count(), 1);
    assert.equal(siblingRequests.every(url => new URL(url).hostname === 'fonts.googleapis.com'), true, 'Only optional shared font requests may be attempted offline');
    await aggregate.emulateMedia({ media: 'print' }); assert.equal(await aggregateLab.isVisible(), false); assert.equal(await aggregate.locator('.crt-static').isVisible(), true);
    await aggregate.pdf({ path: path.join(evidence, 'offline-aggregate-print.pdf'), format: 'Letter', printBackground: true });
    await offline.close(); console.log('Evidence: ' + evidence);
  } finally { await browser.close(); }
});
