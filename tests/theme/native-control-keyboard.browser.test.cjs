'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { browserURL, skip, launch } = require('../support/browser.cjs');

const APP = path.resolve(__dirname, '../../theme/app.js');
const PAGE = '/machining/milling-cutter-selection.html?p=det-330';

async function open(browser, present) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/theme/app.js*', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript; charset=utf-8',
    body: fs.readFileSync(APP)
  }));
  await page.goto(browserURL.replace(/\/$/, '') + PAGE + (present ? '&present=1' : ''), { waitUntil: 'networkidle' });
  return { page, errors };
}

async function panel(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('.xcard:not(.deck-wiki-only)')];
    let best = 0, distance = Infinity;
    cards.forEach((card, index) => {
      const current = Math.abs(card.getBoundingClientRect().top);
      if (current < distance) { distance = current; best = index; }
    });
    return best;
  });
}

test('native controls keep Enter and Space before presentation navigation', { skip, timeout: 90000 }, async () => {
  const browser = await launch();
  try {
    for (const present of [false, true]) {
      const { page, errors } = await open(browser, present);
      try {
        await page.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
        const root = page.locator('[data-interactive="end-mill-anatomy"]');
        await page.waitForFunction(() => document.querySelector('[data-interactive="end-mill-anatomy"]')?.dataset.emaReady === 'true');
        const beforeURL = page.url(), beforePanel = await panel(page);

        const side = root.locator('[data-ema-view="side"]');
        await side.focus();
        await page.keyboard.press('Space');
        await page.waitForFunction(() => document.querySelector('[data-ema-scene]').dataset.cameraView === 'side');
        assert.equal(page.url(), beforeURL, `${present ? 'presentation' : 'reading'} Space keeps the page`);
        assert.equal(await panel(page), beforePanel, `${present ? 'presentation' : 'reading'} Space keeps the panel`);

        const end = root.locator('[data-ema-view="end"]');
        await end.focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('[data-ema-scene]').dataset.cameraView === 'end');
        assert.equal(page.url(), beforeURL, `${present ? 'presentation' : 'reading'} Enter keeps the page`);
        assert.equal(await panel(page), beforePanel, `${present ? 'presentation' : 'reading'} Enter keeps the panel`);

        const nested = page.locator('.deeper > summary').first();
        const details = nested.locator('..');
        await details.evaluate(node => { node.open = false; });
        await nested.focus();
        await page.keyboard.press('Space');
        assert.equal(await details.getAttribute('open') !== null, true, `${present ? 'presentation' : 'reading'} Space opens a nested disclosure`);
        assert.equal(page.url(), beforeURL);
        assert.equal(await panel(page), beforePanel);

        if (present) {
          const heading = page.locator('.xcard:not(.deck-wiki-only) > summary').first();
          assert.equal(await heading.getAttribute('tabindex'), '-1', 'presentation panel headings leave the tab order');
          assert.equal(await heading.getAttribute('aria-disabled'), 'true', 'presentation panel heading is not advertised as a live disclosure');
          await heading.evaluate(node => node.click());
          assert.notEqual(await heading.locator('..').getAttribute('open'), null, 'presentation panel stays open after click activation');

          await root.evaluate(node => {
            const body = node.closest('.xcard').querySelector('.body');
            const editable = document.createElement('div');
            editable.setAttribute('contenteditable', 'plaintext-only');
            editable.dataset.testNativeEditable = '';
            const inherited = document.createElement('span');
            inherited.tabIndex = 0;
            inherited.textContent = 'edit';
            editable.append(inherited);
            const noneditable = document.createElement('div');
            noneditable.tabIndex = 0;
            noneditable.dataset.testNoneditable = '';
            noneditable.textContent = 'presentation navigation target';
            body.append(editable, noneditable);
          });
          const inherited = page.locator('[data-test-native-editable] > span');
          assert.equal(await inherited.evaluate(node => node.isContentEditable), true, 'descendant inherits plaintext-only editability');
          const editablePanel = await panel(page);
          await inherited.focus();
          await page.keyboard.press('End');
          await page.keyboard.press('Space');
          await page.keyboard.type('X');
          await page.keyboard.press('Enter');
          await page.keyboard.type('Y');
          const edited = await page.locator('[data-test-native-editable]').innerText();
          assert.match(edited, /X/);
          assert.match(edited, /Y/);
          assert.equal(await panel(page), editablePanel, 'inherited plaintext-only Space and Enter keep the panel');
          assert.equal(page.url(), beforeURL, 'inherited plaintext-only editing keeps the page');

          const noneditable = page.locator('[data-test-noneditable]');
          await noneditable.focus();
          const noneditablePanel = await panel(page);
          await page.keyboard.press('Space');
          await page.waitForTimeout(350);
          assert.notEqual(await panel(page), noneditablePanel, 'focusable noneditable Space still advances panels');

          await page.locator('body').focus();
          const bodyPanel = await panel(page);
          await page.keyboard.press('Space');
          await page.waitForTimeout(350);
          assert.notEqual(await panel(page), bodyPanel, 'body Space still advances presentation panels');
        }
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
});
