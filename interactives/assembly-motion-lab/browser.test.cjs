'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const B = require('../../tests/support/browser.cjs');
const base = B.browserURL && B.browserURL.replace(/\/+$/, '');
test('joint first use, motion invariants, recovery, phones/themes, practice, print/noJS and offline aggregate', { skip: B.skip }, async () => {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-det102-assembly-proof-'));
  const browser = await B.launch();
  async function navigate(page, route) {
    const response = await page.goto(base + route);
    assert.equal(response && response.status(), 200, 'Expected HTTP200 at ' + base + route);
  }
  try {
    // Proof belongs to this source freeze: served module bytes must match this checkout.
    for (const asset of ['model.js', 'demo.js', 'demo.css']) {
      const response = await fetch(base + '/interactives/assembly-motion-lab/' + asset);
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(__dirname, asset)));
    }
    for (const width of [1280, 390, 375]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await navigate(page, '/engineering-graphics/assembly-files-and-mates.html');
      await page.evaluate(t => { document.documentElement.dataset.theme = t; document.querySelectorAll('details.xcard').forEach(d => d.open = true); }, theme);
      const lab = page.locator('.am-lab'), q = k => lab.locator('[data-am="' + k + '"]');
      await lab.waitFor(); assert.match(await q('status').textContent(), /2 DOF/);
      await q('prediction').selectOption('2'); await q('test').click();
      assert.match(await q('feedback').textContent(), /Prediction matches.*slide: moved; \+30° spin: moved/);
      assert.match(await q('readings').textContent(), /z = 22 mm.*θ = 65°/);
      await q('seat').check(); assert.match(await q('status').textContent(), /1 DOF.*Slide blocked.*Spin allowed/);
      assert.equal(await q('prediction').inputValue(), '', 'Prediction cleared when conditions change');
      assert.match(await q('readings').textContent(), /z = 0 mm.*θ = 65°/); assert.match(await q('assessment').textContent(), /Goal met/);
      await q('angle').focus(); await q('angle').press('ArrowRight'); assert.match(await q('readings').textContent(), /θ = 66°/);
      await q('z').focus(); await q('z').press('ArrowRight'); assert.match(await q('readings').textContent(), /z = 0 mm/); assert.match(await q('feedback').textContent(), /Slide blocked/);
      await q('lock').check(); assert.match(await q('readings').textContent(), /z = 0 mm.*θ = 0°/);
      assert.match(await q('assessment').textContent(), /hinge cannot turn/);
      await q('test').click(); assert.match(await q('feedback').textContent(), /slide: blocked; \+30° spin: blocked/);
      await q('recover').click(); assert.match(await q('assessment').textContent(), /Goal met/);
      assert.equal(await q('prediction').inputValue(), '', 'Prediction cleared on explicit recovery');
      await q('test').click(); assert.match(await q('readings').textContent(), /z = 0 mm.*θ = 30°/);
      // Changing goal is a diagnosis, not automatic reconfiguration.
      await q('goal').selectOption('slider'); assert.equal(await q('seat').isChecked(), true); assert.equal(await q('lock').isChecked(), false);
      assert.match(await q('assessment').textContent(), /slider cannot travel/);
      await q('recover').click(); await q('test').click();
      assert.match(await q('readings').textContent(), /z = 10 mm.*θ = 0°/);
      assert.match(await q('assessment').textContent(), /Goal met/);
      // Actual pointer manipulation of native slider, with active and blocked motion.
      await q('z').scrollIntoViewIfNeeded(); const box = await q('z').boundingBox();
      await page.mouse.click(box.x + box.width * .7, box.y + box.height / 2);
      assert.notEqual(await q('z').inputValue(), '10');
      const actualZ = await q('z').inputValue();
      await q('angle').scrollIntoViewIfNeeded(); const spinbox = await q('angle').boundingBox();
      await page.mouse.click(spinbox.x + spinbox.width * .75, spinbox.y + spinbox.height / 2);
      assert.equal(await q('angle').inputValue(), '0'); assert.equal(await q('z').inputValue(), actualZ);
      await q('goal').selectOption('fixed'); assert.match(await q('assessment').textContent(), /fixed goal needs/);
      await q('recover').click(); assert.match(await q('status').textContent(), /0 DOF/); assert.match(await q('assessment').textContent(), /Goal met/);
      await q('test').click(); assert.match(await q('readings').textContent(), /z = 0 mm.*θ = 0°/);
      await q('reset').click(); await lab.locator('.am-edit > summary').click();
      await q('value').fill('31'); await q('apply').click(); assert.match(await q('feedback').textContent(), /declared lab range/);
      assert.match(await q('readings').textContent(), /z = 12 mm.*θ = 35°/);
      await q('value').fill(''); await q('apply').click(); assert.match(await q('feedback').textContent(), /finite coordinate/);
      await q('value').fill('-30'); await q('apply').click(); assert.match(await q('readings').textContent(), /z = -30 mm/);
      assert.doesNotMatch(await q('feedback').textContent(), /finite coordinate|lab range/);
      await q('coordinate').selectOption('angle'); await q('value').fill('-361'); await q('apply').click(); assert.match(await q('readings').textContent(), /θ = 359°/);
      await q('value').fill('359.999'); await q('apply').click(); assert.match(await q('readings').textContent(), /θ = 359\.999°/);
      await q('coordinate').selectOption('z'); await q('value').fill('-0.001'); await q('apply').click(); assert.match(await q('readings').textContent(), /z = -0\.001 mm/);
      // Every shaft extent and lever endpoint stays inside its view for the valid domain.
      for (const z of [-30, 30]) {
        await q('coordinate').selectOption('z'); await q('value').fill(String(z)); await q('apply').click();
        assert.equal(await q('shaft').evaluate(n => { const b = n.getBBox(), m = n.transform.baseVal.consolidate().matrix; return b.x + m.e >= 0 && b.x + b.width + m.e <= 480 && b.y >= 0 && b.y + b.height <= 230; }), true);
      }
      for (const angle of [0, 45, 90, 135, 180, 225, 270, 315, 359]) {
        await q('coordinate').selectOption('angle'); await q('value').fill(String(angle)); await q('apply').click();
        assert.equal(await q('lever').evaluate(n => { const svg = n.ownerSVGElement, b = n.getBoundingClientRect(), v = svg.getBoundingClientRect(); return b.left >= v.left && b.right <= v.right && b.top >= v.top + v.height * 35 / 230 && b.bottom <= v.top + v.height * 195 / 230; }), true, 'Lever stays inside drawing, clear of top/bottom labels');
      }
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('.am-lab, .am-lab *, #am-overflow-control')].some(n => { const b = n.getBoundingClientRect(); return b.width > 0 && (b.left < -1 || b.right > innerWidth + 1); }));
      assert.equal(await overflow(), false);
      await page.evaluate(() => { const n = document.createElement('div'); n.id = 'am-overflow-control'; n.style.width = '2000px'; document.body.append(n); });
      assert.equal(await overflow(), true); await page.locator('#am-overflow-control').evaluate(n => n.remove()); assert.equal(await overflow(), false);
      await q('reset').click(); await lab.screenshot({ path: path.join(evidence, width + '-' + theme + '.png') });
      if (width === 1280 && theme === 'light') {
        await page.evaluate(() => { const root = document.querySelector('[data-interactive="assembly-motion-lab"]'), copy = root.cloneNode(true); copy.querySelector('.am-lab').remove(); copy.classList.remove('am-live'); delete copy.dataset.assemblyReady; root.after(copy); });
        const src = await page.locator('script[src*="assembly-motion-lab/demo.js"]').getAttribute('src'); await page.addScriptTag({ url: new URL(src, page.url()).href });
        const labs = page.locator('.am-lab'); assert.equal(await labs.count(), 2);
        await labs.nth(1).locator('[data-am="seat"]').check();
        assert.match(await labs.nth(0).locator('[data-am="status"]').textContent(), /2 DOF/);
        assert.match(await labs.nth(1).locator('[data-am="status"]').textContent(), /1 DOF/);
        await page.locator('[data-interactive="assembly-motion-lab"]').nth(1).evaluate(n => n.remove());
        await page.emulateMedia({ media: 'print' }); assert.equal(await lab.isVisible(), false); assert.equal(await page.locator('.am-static').isVisible(), true);
        await page.pdf({ path: path.join(evidence, 'ordinary-print.pdf'), format: 'Letter', printBackground: true });
      }
      assert.deepEqual(errors, []); await context.close();
    }
    const context = await browser.newContext(); const page = await context.newPage();
    await navigate(page, '/practice.html');
    for (const [id, answer, wrong, categorical] of [['assemblies-hinge-diagnosis', '2', '3', true], ['assemblies-slider-condition', '1', '2', true], ['assemblies-datum-not-freeze', '0', '18', false]]) {
      const item = page.locator('[data-practice-id="' + id + '"]').first(), input = item.locator('[data-practice-input]'), check = item.locator('[data-practice-check]'), feedback = item.locator('[data-practice-feedback]');
      await check.click(); assert.match(await feedback.textContent(), categorical ? /Choose an answer/ : /Enter a number/);
      if (categorical) await input.selectOption(wrong); else await input.fill(wrong);
      await check.click(); assert.match(await feedback.textContent(), /Not yet/);
      if (categorical) await input.selectOption(answer); else await input.fill(answer);
      await check.click(); assert.match(await feedback.textContent(), /Correct/);
    }
    await context.close();
    const nojs = await browser.newContext({ javaScriptEnabled: false }); const plain = await nojs.newPage();
    await navigate(plain, '/engineering-graphics/assembly-files-and-mates.html');
    await plain.locator('details.xcard').filter({ has: plain.locator('.am-static') }).locator('summary').first().click();
    assert.equal(await plain.locator('.am-static').isVisible(), true); assert.match(await plain.locator('.am-static').textContent(), /2 → 1 → 0/);
    await plain.pdf({ path: path.join(evidence, 'nojs-print.pdf'), format: 'Letter', printBackground: true });
    await nojs.close();
    const offline = await browser.newContext(); const aggregate = await offline.newPage();
    const aggregateURL = base + '/print/track-cad-assemblies.html';
    const siblingRequests = []; await aggregate.route('**/*', route => {
      if (route.request().url() === aggregateURL) return route.continue();
      siblingRequests.push(route.request().url()); return route.abort();
    });
    const response = await aggregate.goto(aggregateURL); assert.equal(response.status(), 200);
    await aggregate.evaluate(() => document.querySelectorAll('details.xcard').forEach(d => d.open = true));
    const lab = aggregate.locator('.am-lab'); await lab.waitFor(); await lab.locator('[data-am="seat"]').check();
    assert.match(await lab.locator('[data-am="status"]').textContent(), /1 DOF/);
    await lab.locator('[data-am="test"]').click(); assert.match(await lab.locator('[data-am="readings"]').textContent(), /z = 0 mm.*θ = 65°/);
    // The shared theme may request optional web fonts; these were aborted too.
    // Functional module assets must be fully inlined, with no sibling fetches.
    assert.equal(siblingRequests.every(url => new URL(url).hostname === 'fonts.googleapis.com'), true, 'Only optional shared font requests may be attempted offline');
    await aggregate.emulateMedia({ media: 'print' }); assert.equal(await lab.isVisible(), false); assert.equal(await aggregate.locator('.am-static').isVisible(), true);
    await aggregate.pdf({ path: path.join(evidence, 'offline-aggregate-print.pdf'), format: 'Letter', printBackground: true });
    await offline.close(); console.log('Evidence: ' + evidence);
  } finally { await browser.close(); }
});
