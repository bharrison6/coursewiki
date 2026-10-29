'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const B = require('../../tests/support/browser.cjs');
const base = B.browserURL && B.browserURL.replace(/\/+$/, '');

test('state-history native flow, independent mounts, presentation keys, phones, noJS and offline', { skip: B.skip }, async () => {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-det102-state-history-'));
  const browser = await B.launch();
  async function navigate(page, route) {
    const response = await page.goto(base + route);
    assert.equal(response && response.status(), 200, 'Expected HTTP 200 at ' + route);
  }
  try {
    for (const asset of ['model.js', 'scenarios.js', 'render.js', 'demo.js', 'demo.css']) {
      const response = await fetch(base + '/interactives/cad-state-history/' + asset);
      assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(__dirname, asset)));
    }
    for (const width of [1280, 390, 375]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
      const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(String(error)));
      await navigate(page, '/engineering-graphics/cad-history-and-sharing.html');
      await page.evaluate(selected => { document.documentElement.dataset.theme = selected; document.querySelectorAll('details.xcard').forEach(card => card.open = true); }, theme);
      const lab = page.locator('.csh-lab'), q = key => lab.locator('[data-csh="' + key + '"]'); await lab.waitFor();
      assert.deepEqual(await q('order').locator('li strong').allTextContents(), ['Mounting sketch', 'Base extrude', 'Edge fillet']);
      assert.equal(await q('history').locator('li').count(), 1);
      await q('value').fill('72'); await q('edit').click(); assert.match(await q('feedback').textContent(), /position 1/); assert.equal(await q('history').locator('li').count(), 2);
      await q('snapshot').click(); await q('branch').click(); assert.equal(await q('workspace').inputValue(), 'lightweight');
      await lab.locator('input[value="base-extrude"]').check(); await q('value').fill('8'); await q('edit').click();
      const rows = q('comparison').locator('tbody tr');
      assert.match(await rows.filter({ hasText: 'Main workspace' }).textContent(), /72 mm.*12 mm.*2 mm/);
      assert.match(await rows.filter({ hasText: 'Design review' }).textContent(), /72 mm.*12 mm.*2 mm/);
      assert.match(await rows.filter({ hasText: 'Lightweight branch' }).textContent(), /72 mm.*8 mm.*2 mm/);
      await q('view').selectOption('snapshot:design-review'); assert.equal(await q('workspace').inputValue(), 'lightweight'); assert.match(await q('feedback').textContent(), /did not restore or edit/);
      await q('workspace').selectOption('main'); await lab.locator('input[value="mount-sketch"]').check(); await q('value').fill('101'); await q('edit').click();
      assert.match(await q('feedback').textContent(), /declared feature range/); assert.match(await rows.filter({ hasText: 'Main workspace' }).textContent(), /72 mm/);
      await q('reset').click(); assert.equal(await q('history').locator('li').count(), 1); assert.equal(await q('workspace').locator('option').count(), 1);
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('.csh-lab, .csh-lab *, #csh-wide-control')].some(element => { const box = element.getBoundingClientRect(); return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1); }));
      assert.equal(await overflow(), false); await page.evaluate(() => { const n = document.createElement('div'); n.id = 'csh-wide-control'; n.style.width = '2000px'; document.body.append(n); });
      assert.equal(await overflow(), true); await page.locator('#csh-wide-control').evaluate(node => node.remove()); assert.equal(await overflow(), false);
      await lab.screenshot({ path: path.join(evidence, width + '-' + theme + '.png') }); assert.deepEqual(errors, []); await context.close();
    }

    // Duplicate the authored mount in the HTML response before the one module load.
    const multi = await browser.newContext(); const page = await multi.newPage();
    await page.route('**/engineering-graphics/cad-history-and-sharing.html', async route => {
      const response = await route.fetch(), body = await response.text();
      const marker = '<div data-interactive="cad-state-history">', start = body.indexOf(marker), end = body.indexOf('</div>\n  </div>', start) + '</div>\n  </div>'.length;
      assert.ok(start >= 0 && end > start); const mount = body.slice(start, end);
      await route.fulfill({ response, body: body.slice(0, end) + mount + body.slice(end) });
    });
    await navigate(page, '/engineering-graphics/cad-history-and-sharing.html'); await page.evaluate(() => document.querySelectorAll('details.xcard').forEach(card => card.open = true));
    const labs = page.locator('.csh-lab'); assert.equal(await labs.count(), 2);
    const ids = await page.locator('.csh-lab [id]').evaluateAll(nodes => nodes.map(node => node.id)); assert.equal(new Set(ids).size, ids.length);
    const names = await page.locator('.csh-lab input[type="radio"]').evaluateAll(nodes => nodes.map(node => node.name)); assert.equal(new Set(names).size, 2);
    assert.equal(await page.locator('.csh-lab label[for]').evaluateAll(labels => labels.every(label => document.getElementById(label.htmlFor))), true);
    await labs.nth(1).locator('[data-csh="value"]').fill('72'); await labs.nth(1).locator('[data-csh="edit"]').click();
    assert.equal(await labs.nth(0).locator('[data-csh="history"] li').count(), 1); assert.equal(await labs.nth(1).locator('[data-csh="history"] li').count(), 2); await multi.close();

    const presenting = await browser.newContext(); const panel = await presenting.newPage();
    await navigate(panel, '/engineering-graphics/cad-history-and-sharing.html?p=cad-platform-workflow&present=1');
    const card = panel.locator('details.xcard').filter({ has: panel.locator('.csh-lab') }); await card.evaluate(node => node.open = true);
    const button = card.locator('[data-csh="edit"]'); await card.locator('[data-csh="value"]').fill('72'); await button.focus(); const before = panel.url(); await button.press('Space');
    assert.equal(panel.url(), before); assert.equal(await card.locator('[data-csh="history"] li').count(), 2); await presenting.close();

    const nojs = await browser.newContext({ javaScriptEnabled: false }); const plain = await nojs.newPage(); await navigate(plain, '/engineering-graphics/cad-history-and-sharing.html');
    await plain.locator('details.xcard').filter({ has: plain.locator('.csh-static') }).locator('summary').click();
    assert.equal(await plain.locator('.csh-static').isVisible(), true); assert.match(await plain.locator('.csh-static').textContent(), /Design review.*72.*12.*2.*Lightweight branch/s);
    await plain.pdf({ path: path.join(evidence, 'ordinary-nojs.pdf'), format: 'Letter', printBackground: true }); await nojs.close();

    const offline = await browser.newContext(); const aggregate = await offline.newPage(), url = base + '/print/track-cad-platform-workflow.html', secondary = [];
    await aggregate.route('**/*', route => { if (route.request().url() === url) return route.continue(); secondary.push(route.request().url()); return route.abort(); });
    const response = await aggregate.goto(url); assert.equal(response.status(), 200); await aggregate.evaluate(() => document.querySelectorAll('details.xcard').forEach(card => card.open = true));
    const lab = aggregate.locator('.csh-lab'); await lab.waitFor(); await lab.locator('[data-csh="value"]').fill('72'); await lab.locator('[data-csh="edit"]').click(); assert.equal(await lab.locator('[data-csh="history"] li').count(), 2);
    assert.equal(secondary.every(item => new URL(item).hostname === 'fonts.googleapis.com'), true); await aggregate.emulateMedia({ media: 'print' }); assert.equal(await lab.isVisible(), false); assert.equal(await aggregate.locator('.csh-static').isVisible(), true);
    await aggregate.pdf({ path: path.join(evidence, 'offline-track.pdf'), format: 'Letter', printBackground: true }); await offline.close();
    console.log('Evidence: ' + evidence);
  } finally { await browser.close(); }
});
