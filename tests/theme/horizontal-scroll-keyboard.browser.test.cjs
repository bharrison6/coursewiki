'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { browserURL, skip, launch } = require('../support/browser.cjs');

const PAGE = '/machining/mill-toolholding.html?p=mill-setup-and-tooling';
const EXISTING_SCROLL_PAGE = '/materials-and-processes/bills-of-materials.html?p=manufacturing-documentation';

test('focused horizontal regions keep arrow keys before track navigation', { skip }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-coursewiki-horizontal-scroll-'));
  const browser = await launch();
  try {
    await checkExistingProductionRegion(browser);
    await checkReadingMode(browser, out);
    await checkPresentationMode(browser, out);
    console.log('PASS evidence: ' + out);
  } finally {
    await browser.close();
  }
});

async function openPage(browser, suffix, options = {}) {
  const page = await browser.newPage({ viewport: { width: 375, height: 900 }, ...options });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(browserURL.replace(/\/$/, '') + suffix, { waitUntil: 'networkidle' });
  await page.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
  return { page, errors };
}

async function checkExistingProductionRegion(browser) {
  const { page, errors } = await openPage(browser, EXISTING_SCROLL_PAGE);
  try {
    const region = page.locator('.unit-table-wrap').first();
    const dimensions = await region.evaluate(node => ({
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
      overflowX: getComputedStyle(node).overflowX,
      tabIndex: node.tabIndex
    }));
    assert.equal(dimensions.tabIndex, 0, 'existing region is natively keyboard focusable');
    assert.equal(dimensions.overflowX, 'auto');
    assert.ok(dimensions.scrollWidth > dimensions.clientWidth, 'existing region has real horizontal overflow');
    await region.focus();
    const right = await pressAndRead(page, region, 'ArrowRight');
    assert.ok(right.after.left > right.before.left, 'right arrow scrolls an existing authored region');
    assert.equal(right.after.url, right.before.url, 'existing authored region keeps the page in reading mode');
    await region.evaluate(node => { node.scrollLeft = node.scrollWidth; });
    const edge = await pressAndRead(page, region, 'ArrowRight');
    assert.equal(edge.after.url, edge.before.url, 'existing authored region keeps the right edge');
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

async function installRegions(page) {
  await page.locator('table').first().evaluate(table => {
    const region = document.createElement('div');
    region.dataset.testScroll = 'real-table';
    region.tabIndex = 0;
    region.style.cssText = 'display:block;width:338px;max-width:100%;overflow-x:auto;';
    table.before(region);
    region.append(table);
    table.style.width = '528px';
    table.style.minWidth = '528px';

    const nestedRegion = document.createElement('div');
    nestedRegion.dataset.testScroll = 'nested';
    nestedRegion.tabIndex = -1;
    nestedRegion.style.cssText = 'width:250px;overflow-x:auto;white-space:nowrap;';
    const inner = document.createElement('span');
    inner.tabIndex = 0;
    inner.textContent = 'Focused descendant' + ' — wide content'.repeat(20);
    inner.style.display = 'inline-block';
    nestedRegion.append(inner);
    region.after(nestedRegion);

    const noOverflow = document.createElement('div');
    noOverflow.dataset.testScroll = 'none';
    noOverflow.tabIndex = 0;
    noOverflow.style.cssText = 'width:250px;overflow-x:auto;';
    noOverflow.textContent = 'No horizontal overflow';
    nestedRegion.after(noOverflow);
  });
}

async function pressAndRead(page, region, key) {
  const before = await region.evaluate(node => ({ left: node.scrollLeft, url: location.href, y: scrollY }));
  await page.keyboard.press(key);
  await page.waitForTimeout(180);
  const after = await region.evaluate(node => ({ left: node.scrollLeft, url: location.href, y: scrollY }));
  return { before, after };
}

async function panelState(page) {
  return page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('.xcard'));
    let index = 0;
    let distance = Infinity;
    panels.forEach((panel, candidate) => {
      const next = Math.abs(panel.getBoundingClientRect().top);
      if (next < distance) { distance = next; index = candidate; }
    });
    return { index, y: scrollY, top: panels[index].getBoundingClientRect().top };
  });
}

async function checkReadingMode(browser, out) {
  const { page, errors } = await openPage(browser, PAGE);
  try {
    // The DET 130 candidate adds this wrapper around the real classic table.
    // Model that pending DOM explicitly while keeping product content untouched.
    await installRegions(page);
    const region = page.locator('[data-test-scroll="real-table"]');
    await region.focus();
    const right = await pressAndRead(page, region, 'ArrowRight');
    assert.equal(right.after.url, right.before.url, 'right arrow does not leave a focused scroll region');
    assert.ok(right.after.left > right.before.left, 'right arrow scrolls the real table region');

    const max = await region.evaluate(node => { node.scrollLeft = node.scrollWidth; return node.scrollLeft; });
    const edgeRight = await pressAndRead(page, region, 'ArrowRight');
    assert.equal(edgeRight.before.left, max);
    assert.equal(edgeRight.after.left, max, 'right edge stays owned by the region');
    assert.equal(edgeRight.after.url, edgeRight.before.url, 'right edge does not fall through to page navigation');

    const left = await pressAndRead(page, region, 'ArrowLeft');
    assert.ok(left.after.left < left.before.left, 'left arrow scrolls back from the right edge');
    await region.evaluate(node => { node.scrollLeft = 0; });
    const edgeLeft = await pressAndRead(page, region, 'ArrowLeft');
    assert.equal(edgeLeft.after.left, 0, 'left edge stays owned by the region');
    assert.equal(edgeLeft.after.url, edgeLeft.before.url, 'left edge does not fall through to page navigation');

    const nested = page.locator('[data-test-scroll="nested"]');
    await nested.locator('span').focus();
    const nestedMove = await pressAndRead(page, nested, 'ArrowRight');
    assert.ok(nestedMove.after.left > nestedMove.before.left, 'focused descendant lets its scrollable ancestor handle the arrow');
    assert.equal(nestedMove.after.url, nestedMove.before.url);

    const search = page.locator('.search input');
    await search.fill('abc');
    await search.focus();
    const inputURL = page.url();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    assert.equal(page.url(), inputURL, 'existing input guard still owns arrow keys');

    await page.screenshot({ path: path.join(out, 'reading-scroll-region.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }

  const outside = await openPage(browser, PAGE);
  try {
    await installRegions(outside.page);
    const noOverflow = outside.page.locator('[data-test-scroll="none"]');
    await noOverflow.focus();
    assert.equal(await noOverflow.evaluate(node => node.scrollWidth <= node.clientWidth), true);
    await outside.page.keyboard.press('ArrowRight');
    await outside.page.waitForURL(/milling-cutter-selection\.html\?p=mill-setup-and-tooling/);
    assert.deepEqual(outside.errors, []);
  } finally {
    await outside.page.close();
  }
}

async function checkPresentationMode(browser, out) {
  const { page, errors } = await openPage(browser, EXISTING_SCROLL_PAGE + '&present=1');
  try {
    const region = page.locator('.unit-table-wrap').first();
    await region.focus();
    // Presentation scroll snapping settles after focus moves into a panel.
    // Measure the arrow from that settled state, not during the focus scroll.
    await page.waitForTimeout(1800);
    const beforePanel = await panelState(page);
    const right = await pressAndRead(page, region, 'ArrowRight');
    const afterPanel = await panelState(page);
    assert.ok(right.after.left > right.before.left, 'presentation mode leaves horizontal arrow scrolling native');
    assert.equal(right.after.url, right.before.url);
    assert.equal(afterPanel.index, beforePanel.index, 'presentation mode keeps the same panel while the region is focused');
    assert.ok(Math.abs(afterPanel.y - beforePanel.y) < 10, 'presentation mode keeps the settled panel position');

    await region.evaluate(node => { node.scrollLeft = node.scrollWidth; });
    const beforeEdgePanel = await panelState(page);
    const edge = await pressAndRead(page, region, 'ArrowRight');
    const afterEdgePanel = await panelState(page);
    assert.equal(edge.after.url, edge.before.url, 'presentation right edge does not leave the current page');
    assert.equal(afterEdgePanel.index, beforeEdgePanel.index, 'presentation right edge does not advance panels');
    assert.ok(Math.abs(afterEdgePanel.y - beforeEdgePanel.y) < 10, 'presentation right edge keeps the settled panel position');

    await page.locator('.nav-toggle').focus();
    await page.waitForTimeout(500);
    const beforeOutside = await panelState(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(350);
    const afterOutside = await panelState(page);
    assert.notEqual(afterOutside.index, beforeOutside.index, 'outside the region, presentation arrow navigation still advances a panel');

    await page.screenshot({ path: path.join(out, 'presentation-scroll-region.png'), fullPage: false });
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}
