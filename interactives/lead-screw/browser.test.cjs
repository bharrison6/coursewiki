const test = require('node:test');
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const browserURL = process.env.COURSEWIKI_BROWSER_URL;
if (!chromium || !browserURL) {
  test('lead-screw browser acceptance', { skip: 'Requires Playwright and COURSEWIKI_BROWSER_URL' }, () => {});
} else {
// Run after build-site.ps1. Set PLAYWRIGHT_MODULE to an installed playwright package if needed.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const docs = path.resolve(__dirname, '../../docs');
const evidence = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'coursewiki-lead-screw-'));
fs.mkdirSync(evidence, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

(async () => {
  const origin = browserURL.replace(/\/$/, '');
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    for (const [slug, cards] of [['screw-threads', 5], ['lead-screws', 6]]) {
      await page.goto(`${origin}/engineering/${slug}.html`);
      // Resize screenshots must show the final layout, not the sidebar's transition frame.
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
      assert.equal(await page.locator('.xcard').count(), cards);
      assert.equal(await page.locator('.xcard[open]').count(), 0, 'fresh cards start closed');
      await page.locator('.xcard').evaluateAll(nodes => nodes.forEach(n => { n.open = true; }));
      assert.equal(await page.locator('img.content-img').evaluateAll(nodes => nodes.filter(n => !n.complete || !n.naturalWidth).length), 0);
      for (const theme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: theme });
        for (const width of [1280, 375]) {
          await page.setViewportSize({ width, height: 900 });
          const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
          assert.equal(await overflow(), false, `${slug} ${theme} ${width} overflow`);
          // A known wide element proves that the same document-level probe can detect overflow.
          await page.evaluate(() => { const p = document.createElement('div'); p.id = 'ls-overflow-control'; p.style.width = '3000px'; p.style.height = '1px'; document.body.append(p); });
          assert.equal(await overflow(), true, 'overflow positive control');
          await page.locator('#ls-overflow-control').evaluate(n => n.remove());
          await page.screenshot({ path: path.join(evidence, `${slug}-${theme}-${width}.png`), fullPage: true });
        }
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    const root = page.locator('[data-interactive="lead-screw"]').first();
    const result = root.locator('.ls-results');
    assert.match(await result.innerText(), /30 mm\/s/);
    await root.locator('[data-ls="efficiency"]').fill('20');
    assert.match(await result.innerText(), /30 mm\/s/);
    assert.match(await result.innerText(), /251\.327 N/);
    await root.locator('[data-ls="starts"]').fill('1');
    assert.match(await result.innerText(), /10 mm\/s/);
    await root.locator('[data-ls="units"]').selectOption('in');
    assert.match(await result.innerText(), /lbf/);
    await root.locator('[data-ls="units"]').selectOption('mm');
    assert.ok(Math.abs(Number(await root.locator('[data-ls="pitch"]').inputValue()) - 2) < 1e-12);
    await root.locator('[data-ls="pitch"]').fill('');
    assert.equal(await result.innerText(), '');
    assert.match(await root.locator('.ls-error').innerText(), /finite number/);
    await root.locator('[data-ls="pitch"]').fill('2');
    const original = await result.innerText();
    await root.evaluate(node => {
      const clone = node.cloneNode(true); clone.id = 'ls-second-instance'; delete clone.dataset.lsReady;
      document.body.append(clone);
      const unrelated = document.createElement('div'); unrelated.dataset.interactive = 'unrelated-test'; unrelated.id = 'ls-unrelated'; unrelated.textContent = 'untouched'; document.body.append(unrelated);
    });
    await page.addScriptTag({ path: path.join(__dirname, 'demo.js') });
    await page.locator('#ls-second-instance [data-ls="pitch"]').fill('4');
    assert.equal(await result.innerText(), original, 'roots have independent state');
    assert.equal(await page.locator('#ls-unrelated').innerText(), 'untouched');
    await page.locator('#ls-second-instance').evaluate(n => n.remove());
    await page.locator('#ls-unrelated').evaluate(n => n.remove());
    await page.pdf({ path: path.join(evidence, 'lead-screws-live.pdf'), format: 'Letter', printBackground: true });

    await page.goto(`${origin}/practice.html`);
    assert.equal(await page.locator('[data-practice-id^="screw-"]').count(), 14);
    const bank = fs.readFileSync(path.join(__dirname, '../../practice/screw-threads-and-lead-screws.html'), 'utf8');
    for (const m of bank.matchAll(/data-practice-id="([^"]+)"[^>]*data-answer="([^"]+)"/g)) {
      const item = page.locator(`[data-practice-id="${m[1]}"]`);
      await item.evaluate(n => { for (let p = n.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; });
      const input = item.locator('[data-practice-input]');
      if ((await input.evaluate(n => n.tagName)) === 'SELECT') await input.selectOption(m[2]);
      else await input.fill(m[2]);
      await item.locator('[data-practice-check]').click();
      assert.equal(await item.getAttribute('data-state'), 'correct', m[1]);
    }
    const cnc = page.locator('[data-practice-id="screw-cnc-speed"]');
    for (const wrong of ['12', '19.8', '2160']) {
      await cnc.locator('[data-practice-input]').fill(wrong); await cnc.locator('[data-practice-check]').click();
      assert.equal(await cnc.getAttribute('data-state'), 'incorrect');
    }
    const force = page.locator('[data-practice-id="screw-cnc-force"]');
    await force.locator('[data-practice-input]').fill('91.6667'); await force.locator('[data-practice-check]').click();
    assert.equal(await force.getAttribute('data-state'), 'incorrect');

    await page.goto(`${origin}/print/section-engineering.html`);
    const aggregateLead = page.locator('[data-interactive="lead-screw"]');
    const aggregateGears = page.locator('[data-interactive="gear-ratios"]');
    assert.equal(await aggregateLead.count(), 1);
    assert.equal(await aggregateGears.count(), 1);
    await aggregateLead.evaluate(n => { for (let p = n.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; });
    const gearText = await aggregateGears.innerText();
    await aggregateLead.locator('[data-ls="pitch"]').fill('3');
    assert.equal(await aggregateGears.innerText(), gearText, 'lead screw and gear modules coexist');

    const noJS = await browser.newContext({ javaScriptEnabled: false });
    const print = await noJS.newPage();
    await print.goto(`${origin}/print/section-engineering.html`);
    assert.equal(await print.locator('[data-interactive="lead-screw"] .ls-static').count(), 1);
    await print.pdf({ path: path.join(evidence, 'engineering-closed.pdf'), format: 'Letter', printBackground: true });
    await print.locator('details').evaluateAll(nodes => nodes.forEach(n => { n.open = true; }));
    await print.pdf({ path: path.join(evidence, 'engineering-open.pdf'), format: 'Letter', printBackground: true });
    assert.deepEqual(errors, []);
    console.log('PASS: 11 cards, 14 practice checks, wrong methods, light/dark at 375/1280 px, unit conversion, invalid input, independent roots, no-JS aggregate and PDFs.');
  } finally { await browser.close();  }
})().catch(e => { console.error(e);  process.exitCode = 1; });

}
