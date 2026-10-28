/* Optional browser check. Set CW_PLAYWRIGHT_MODULE and CW_CHROMIUM if not on default paths.
   No installation or generated-site mutation is performed by this test. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.CW_PLAYWRIGHT_MODULE || 'playwright');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

test('two roots, keyboard, reset, repeat initialization, mobile, print and no-JS fallback', async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CW_CHROMIUM ? { executablePath: process.env.CW_CHROMIUM } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const root = '<div data-interactive="drive-selection"><div class="ds-live" hidden></div><div class="ds-static">Static example</div></div>';
    const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
      read('../../theme/msu-theme.css') + read('../../theme/app.css') + read('demo.css') +
      '</style></head><body><main style="padding:16px">' + root + root + '<div data-interactive="unrelated">Untouched module</div></main></body></html>';
    await page.setContent(html);
    await page.addScriptTag({ content: read('model.js') });
    await page.addScriptTag({ content: read('demo.js') });
    const first = page.locator('[data-interactive="drive-selection"]').first();
    const second = page.locator('[data-interactive="drive-selection"]').nth(1);
    assert.equal(await page.locator('[data-ds-ready]').count(), 2);
    const initial = await second.innerText();
    const timing = first.locator('[data-ds-field="timing"]');
    await timing.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    assert.equal(await timing.inputValue(), 'flexible', 'native keyboard selection');
    assert.equal(await second.innerText(), initial, 'other instance unchanged');
    assert.equal(await first.locator('[data-fit="excluded"]').count(), 1);
    assert.equal(await page.locator('[data-interactive="unrelated"]').innerText(), 'Untouched module');
    await page.addScriptTag({ content: read('demo.js') });
    assert.equal(await page.locator('select').count(), 8, 'repeat init does not duplicate controls');
    await first.locator('button').click();
    assert.equal(await first.locator('[data-fit="excluded"]').count(), 2);
    const overflow = element => element.scrollWidth > element.clientWidth + 1;
    assert.equal(await first.evaluate(overflow), false, '390px root fits');
    await first.evaluate(element => {
      const probe = document.createElement('div');
      probe.id = 'overflow-control';
      probe.style.cssText = 'width:2000px;height:20px';
      element.append(probe);
    });
    assert.equal(await first.evaluate(overflow), true, 'nonzero-height positive control proves the overflow probe');
    await page.locator('#overflow-control').evaluate(element => element.remove());
    await page.emulateMedia({ media: 'print' });
    assert.equal(await first.locator('.ds-controls').isVisible(), false);
    assert.equal(await first.locator('.ds-static').isVisible(), true);
    assert.equal(await first.locator('.ds-results').isVisible(), true);
    const nojs = await browser.newContext({ javaScriptEnabled: false });
    const fallback = await nojs.newPage();
    await fallback.setContent(html);
    assert.equal(await fallback.locator('.ds-static').first().isVisible(), true);
    assert.equal(await fallback.locator('.ds-live').first().isVisible(), false);
    assert.deepEqual(errors, []);
    await nojs.close();
  } finally { await browser.close(); }
});
