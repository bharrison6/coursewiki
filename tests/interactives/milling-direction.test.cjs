// Focused tests for interactives/milling-direction.
// Run: node --test --test-concurrency=2 tests/interactives/milling-direction.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MOD = path.join(ROOT, 'interactives', 'milling-direction');
const M = require(path.join(MOD, 'model.js'));
const D = require(path.join(MOD, 'demo.js'));
const PAGE = path.join(ROOT, 'collections', 'machining', 'pages', 'climb-and-conventional-milling.html');

const deg = (r) => r * 180 / Math.PI;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const progressPoints = [0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98];

test('engagement angle and chip thinning match the geometry', () => {
  near(deg(M.engagementAngle(0.5)), 90, 1e-9, 'half-diameter cut sweeps a quarter turn');
  near(deg(M.engagementAngle(0.1)), 36.8699, 1e-3, '10% cut');
  near(M.peakChipRatio(0.1), 0.6, 1e-12, 'peak chip at 10% width is 60% of feed');
  near(M.peakChipRatio(0.5), 1, 1e-12, 'peak chip at 50% width is the full feed');
  assert.ok(M.peakChipRatio(0.25) < M.peakChipRatio(0.4), 'wider cut, thicker peak chip');
});

test('climb runs thick to thin, conventional thin to thick, and they mirror', () => {
  for (const ae of [0.05, 0.25, 0.5]) {
    const climb = M.thicknessProfile('climb', ae, 41).map((s) => s.ratio);
    const conv = M.thicknessProfile('conventional', ae, 41).map((s) => s.ratio);
    near(climb[0], M.peakChipRatio(ae), 1e-12, 'climb enters at the peak');
    near(climb[40], 0, 1e-12, 'climb leaves at zero');
    near(conv[0], 0, 1e-12, 'conventional enters at zero');
    near(conv[40], M.peakChipRatio(ae), 1e-12, 'conventional leaves at the peak');
    for (let i = 1; i < 41; i++) {
      assert.ok(climb[i] <= climb[i - 1] + 1e-12, 'climb never thickens');
      assert.ok(conv[i] >= conv[i - 1] - 1e-12, 'conventional never thins');
      near(climb[i], conv[40 - i], 1e-12, 'mirror image');
    }
  }
});

test('readout agrees with the exact drawn boundary when the feed is small', () => {
  const P = { aeOverD: 0.3, fz: 2 };
  for (const mode of M.MODES) {
    for (const p of progressPoints) {
      const f = M.frame(mode, P, M.timeAtProgress(P, 0, p));
      assert.equal(f.engaged, true);
      near(f.progress, p, 1e-9, 'progress round-trips');
      const exact = M.radialStep(f) / P.fz;
      near(exact, f.ratio, 0.02, `${mode} at ${p}`);
    }
  }
});

test('relative motion stays consistent: work feed is the arrow, rotation is clockwise', () => {
  assert.deepEqual(M.feedDirection('climb'), { x: -1, y: 0 });
  assert.deepEqual(M.feedDirection('conventional'), { x: 1, y: 0 });
  const P = { aeOverD: 0.4 };
  for (const p of progressPoints) {
    const c = M.frame('climb', P, M.timeAtProgress(P, 0, p));
    const v = M.frame('conventional', P, M.timeAtProgress(P, 0, p));
    // Clockwise: the tooth's position angle falls as time runs.
    const later = M.frame('climb', P, M.timeAtProgress(P, 0, Math.min(1, p + 0.01)));
    assert.ok(later.teeth[0].psi < c.teeth[0].psi, 'clockwise');
    assert.equal(c.force.along, 'with-feed', 'climb tooth moves with the work where it cuts');
    assert.equal(v.force.along, 'against-feed', 'conventional tooth moves against the work');
    assert.equal(c.force.vertical, 'down', 'climb presses the work down');
    assert.equal(v.force.vertical, 'up', 'conventional lifts the work');
    assert.ok(c.contact.x > 0 && v.contact.x < 0, 'each cuts on the side its work comes from');
  }
});

test('the drawn chip sits in the stock and is thickest where the model says', () => {
  const P = { aeOverD: 0.25, fz: 18 };
  for (const mode of M.MODES) {
    const f = M.frame(mode, P, M.timeAtProgress(P, 0, 0.5));
    assert.ok(f.chip && f.chip.length > 10, 'a chip polygon exists mid-cut');
    for (const q of f.chip) {
      assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y), 'finite');
      assert.ok(q.y >= f.finished - 1e-6 && q.y <= f.stockTop + 1e-6, 'inside the stock layer');
    }
    // The boundary steps by exactly one feed per tooth, along the feed, at the tooth.
    const b = f.boundary;
    let step = null;
    for (let i = 1; i < b.length; i++) if (Math.abs(b[i].y - b[i - 1].y) < 1e-6) step = b[i].x - b[i - 1].x;
    assert.ok(step !== null, 'a step at the tooth');
    near(Math.abs(step), P.fz, 1e-6, `${mode} step is fz`);
  }
  // Between teeth there is no chip and nothing is engaged.
  const span = M.engagementAngle(0.1) / (Math.PI / 2);
  const idle = M.frame('climb', { aeOverD: 0.1 }, span + (1 - span) / 2);
  assert.equal(idle.engaged, false);
  assert.equal(idle.chip, null);
});

test('inputs are clamped, modes are checked, frames are deterministic', () => {
  assert.throws(() => M.frame('down', {}, 0), /climb or conventional/);
  const q = M.normalise({ aeOverD: 9, fz: -3, teeth: 1 });
  assert.equal(q.aeOverD, 0.5); assert.equal(q.fz, 2); assert.equal(q.teeth, 2);
  assert.deepEqual(M.frame('climb', {}, 3.27), M.frame('climb', {}, 3.27));
  assert.deepEqual(M.frame('climb', {}, NaN), M.frame('climb', {}, 0));
});

test('renderers produce clean SVG with the right lesson written on it', () => {
  const P = { aeOverD: 0.25, fz: 18 };
  for (const mode of M.MODES) {
    for (const T of [0, 0.2, 0.6, 1.4]) {
      const svg = D.renderPanel(M.frame(mode, P, T), {});
      assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
      assert.ok(!/NaN|undefined|Infinity/.test(svg), 'no bad numbers');
    }
  }
  const c = D.renderPanel(M.frame('climb', P, 0.1), {});
  const v = D.renderPanel(M.frame('conventional', P, 0.1), {});
  assert.match(c, /Enters thick/); assert.match(c, /Leaves thin/);
  assert.match(v, /Enters thin/); assert.match(v, /Leaves thick/);
  assert.ok(!/NaN|undefined/.test(D.renderGraph(0.25, [{ mode: 'climb', progress: 0.3 }])));
  const back = D.renderBacklash();
  assert.match(back, /against the feed: the nut stays on the driving flank/);
  assert.match(back, /with the feed: the nut can jump the gap/);
});

test('the printed figure in the page is the renderer output for its stated moment', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  const P = { aeOverD: 0.25, fz: 18 };
  const T = M.timeAtProgress(P, 0, 0.35);
  assert.ok(page.includes(D.renderPanel(M.frame('climb', P, T), {})), 'climb figure current');
  assert.ok(page.includes(D.renderPanel(M.frame('conventional', P, T), {})), 'conventional figure current');
  assert.ok(page.includes(D.renderBacklash()), 'backlash figure current');
});

test('page and manifest follow the module contract', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  assert.match(page, /^@@ID: climb-and-conventional-milling$/m);
  assert.match(page, /^@@SECTION: Milling$/m);
  assert.equal((page.match(/data-interactive="milling-direction"/g) || []).length, 1);
  // One <section> per card, never nested.
  let depth = 0;
  for (const tag of page.match(/<\/?section\b/g)) {
    depth += tag === '<section' ? 1 : -1;
    assert.ok(depth >= 0 && depth <= 1, 'no nested sections');
  }
  assert.equal(depth, 0);
  assert.ok(!/<script\b/.test(page), 'assets load through the manifest, not the page');

  const conf = fs.readFileSync(path.join(MOD, 'interactive.conf'), 'utf8');
  assert.match(conf, /^@@ID: milling-direction$/m);
  const js = conf.match(/^@@JS: (.+)$/m)[1].split(',').map((s) => s.trim());
  const css = conf.match(/^@@CSS: (.+)$/m)[1].split(',').map((s) => s.trim());
  assert.deepEqual(js, ['model.js', 'demo.js'], 'model loads before the demo that reads it');
  for (const f of js.concat(css)) assert.ok(fs.existsSync(path.join(MOD, f)), f + ' exists');
});

test('the stylesheet uses theme tokens and never sets gold or red-orange as text', () => {
  const css = fs.readFileSync(path.join(MOD, 'demo.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const outsidePrint = css.slice(0, css.indexOf('@media print'));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(outsidePrint), 'no literal colours outside print');
  for (const rule of css.split('}')) {
    if (/\.mill-t\b|\.mill-t-/.test(rule)) assert.ok(!/fill:\s*var\(--(msu-gold|msu-redorange|cat2|cat3)\)/.test(rule), 'text fill: ' + rule.trim());
  }
  assert.match(css, /\.presenting/); assert.match(css, /@media print/);
});
