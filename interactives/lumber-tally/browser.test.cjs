// Run from the repository root; set PLAYWRIGHT_MODULE if Playwright is installed elsewhere.
// Evidence and fixture files remain under .lane-scratch.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
fs.mkdirSync('.lane-scratch', { recursive: true });
fs.writeFileSync('.lane-scratch/fixture.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="../theme/msu-theme.css"><link rel="stylesheet" href="../interactives/lumber-tally/demo.css"><style>body{margin:0;padding:12px}*{box-sizing:border-box}</style></head><body><div data-interactive="lumber-tally"></div><div data-interactive="lumber-tally"></div><script src="../interactives/lumber-tally/model.js"></script><script src="../interactives/lumber-tally/demo.js"></script></body></html>`);
(async () => {
  console.log('Owned test process PID', process.pid);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve('.lane-scratch/fixture.html')).href);
    const roots = page.locator('[data-interactive="lumber-tally"]');
    assert.equal(await roots.count(), 2);
    const first = roots.nth(0), second = roots.nth(1);
    assert.match(await first.locator('.lt-totals').innerText(), /5.25 BF.*3.94 BF/);
    for (const key of ['price', 'needed', 'allowance']) assert.equal(await first.locator(`[data-lt="${key}"]`).inputValue(), '');
    await first.locator('[data-lt="quantity"]').fill('3');
    assert.match(await first.locator('.lt-totals').innerText(), /15.75 BF.*11.81 BF/);
    assert.match(await second.locator('.lt-totals').innerText(), /5.25 BF.*3.94 BF/);
    await first.locator('[data-lt="price"]').fill('2.37');
    assert.match(await first.locator('[data-lt-cost]').innerText(), /\$37.33/);
    await first.locator('[data-lt="needed"]').fill('10');
    await first.locator('[data-lt="allowance"]').fill('20');
    assert.match(await first.locator('[data-lt-buy]').innerText(), /12.50 BF/);
    await first.locator('[data-lt="allowance"]').fill('100');
    assert.match(await first.locator('[data-lt-buy]').innerText(), /less than 100/);
    await first.locator('[data-lt="allowance"]').fill('20');
    await first.locator('[data-lt="same"]').focus();
    await page.keyboard.press('Space');
    assert.match(await first.locator('.lt-totals').innerText(), /15.75 BF.*15.75 BF/);
    await page.keyboard.press('Space');
    assert.match(await first.locator('.lt-totals').innerText(), /15.75 BF.*11.81 BF/);
    await first.locator('[data-lt="units"]').selectOption('in');
    for (const basis of ['sale','actual']) await first.locator(`[data-lt="${basis}-length"]`).fill('108');
    assert.match(await first.locator('.lt-totals').innerText(), /15.75 BF.*11.81 BF/);
    await first.locator('[data-lt-add]').focus(); await page.keyboard.press('Enter');
    assert.equal(await first.locator('.lt-row').count(), 2);
    assert.match(await first.locator('.lt-totals').innerText(), /Complete every row/);
    const added = first.locator('.lt-row').nth(1);
    await added.locator('[data-lt="same"]').check();
    for (const [k,v] of [['sale-thickness','8/4'],['sale-width','6'],['sale-length','8']]) await added.locator(`[data-lt="${k}"]`).fill(v);
    assert.match(await first.locator('.lt-totals').innerText(), /23.75 BF.*19.81 BF/);
    await added.locator('[data-lt-remove]').focus(); await page.keyboard.press('Enter');
    assert.equal(await first.locator('.lt-row').count(), 1);
    await page.addScriptTag({ path: 'interactives/lumber-tally/demo.js' });
    assert.equal(await first.locator('.lt-row').count(), 1);
    assert.match(await first.locator('.lt-totals').innerText(), /15.75 BF.*11.81 BF/);
    for (const theme of ['light','dark']) {
      await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
      const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      assert.equal(await fits(), true, theme + ' 375px overflow');
      await page.evaluate(() => { const probe = document.createElement('div'); probe.id='overflow-probe'; probe.style.cssText='height:10px;width:2000px!important;min-height:10px;width:2000px!important;max-width:none!important'; document.body.append(probe); });
      assert.equal(await fits(), false, 'overflow positive control');
      await page.locator('#overflow-probe').evaluate(e => e.remove());
      await first.screenshot({ path: `.lane-scratch/${theme}.png` });
    }
    await page.emulateMedia({ media:'print' });
    assert.equal(await first.locator('[data-lt-add]').isVisible(), false);
    assert.equal(await first.locator('.lt-row-result').isVisible(), true);
    assert.match(await first.locator('.lt-row-result').innerText(), /108 in/);
    await page.pdf({ path: '.lane-scratch/print.pdf' });
    assert.deepEqual(errors, []);
    console.log('PASS: two roots, idempotence, live totals, blank options, units, same-basis toggle, row add/remove, keyboard, invalid input, both themes at 375px, overflow control, print.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });




