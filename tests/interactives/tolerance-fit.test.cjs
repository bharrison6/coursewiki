'use strict';
/* Focused tests for interactives/tolerance-fit/model.js.
   Run: node --test --test-concurrency=2 tests/interactives/tolerance-fit.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const MODULE_DIR = path.join(__dirname, '..', '..', 'interactives', 'tolerance-fit');
const M = require(path.join(MODULE_DIR, 'model.js'));
const MINUS = '−';

const spec = (unit, nominal, hu, hl, su, sl) =>
  ({ unit, nominal, hole: { upper: hu, lower: hl }, shaft: { upper: su, lower: sl } });

test('the three anchor formulas', () => {
  const s = spec('in', 7500, 10, 0, 6, -2);          // hole 0.7500-0.7510, shaft 0.7498-0.7506
  assert.deepEqual(M.limits(s, 'hole'), { min: 7500, max: 7510, tolerance: 10 });
  assert.deepEqual(M.limits(s, 'shaft'), { min: 7498, max: 7506, tolerance: 8 });
  assert.equal(M.clearance(7506, 7501), 5);           // selected = hole - shaft
  const e = M.envelope(s);
  assert.equal(e.min, 7500 - 7506);                   // hole min - shaft max
  assert.equal(e.max, 7510 - 7498);                   // hole max - shaft min
  assert.equal(e.kind, 'transition');
  assert.deepEqual(e.tightest, { hole: 7500, shaft: 7506 });
  assert.deepEqual(e.loosest, { hole: 7510, shaft: 7498 });
});

test('fit kind, including both boundaries', () => {
  assert.deepEqual([M.envelope(spec('in', 7500, 10, 0, -10, -20)).kind, M.envelope(spec('in', 7500, 10, 0, -10, -20)).boundary], ['clearance', false]);
  const zeroMin = M.envelope(spec('in', 7500, 10, 0, 0, -8));
  assert.equal(zeroMin.min, 0);
  assert.equal(zeroMin.kind, 'clearance');
  assert.equal(zeroMin.boundary, true);
  const zeroMax = M.envelope(spec('in', 7500, 10, 0, 18, 10));   // shaft 7510-7518: loosest pair is line-to-line
  assert.equal(zeroMax.max, 0);
  assert.equal(zeroMax.kind, 'interference');
  assert.equal(zeroMax.boundary, true);
  assert.equal(M.envelope(spec('in', 7500, 10, 0, 25, 15)).kind, 'interference');
  // One count across the line flips the kind.
  assert.equal(M.envelope(spec('in', 7500, 10, 0, 1, -8)).kind, 'transition');
  assert.equal(M.envelope(spec('in', 7500, 10, 0, -1, -8)).boundary, false);
});

test('pair kind is decided by the integer sign, with zero its own case', () => {
  assert.equal(M.pairKind(1), 'clearance');
  assert.equal(M.pairKind(0), 'line-to-line');
  assert.equal(M.pairKind(-1), 'interference');
  // The float version of this subtraction is the trap the integers avoid.
  assert.notEqual(0.7506 - 0.7500, 0.0006);
  assert.equal(M.format(M.clearance(7500, 7506), 'in'), MINUS + '0.0006');
});

test('limits are inclusive: a part on a limit passes inspection', () => {
  const lim = { min: 7500, max: 7510 };
  assert.deepEqual(M.inspect(7500, lim), { inSpec: true, state: 'at-min', by: 0 });
  assert.deepEqual(M.inspect(7510, lim), { inSpec: true, state: 'at-max', by: 0 });
  assert.deepEqual(M.inspect(7505, lim), { inSpec: true, state: 'inside', by: 0 });
  assert.deepEqual(M.inspect(7499, lim), { inSpec: false, state: 'under', by: 1 });
  assert.deepEqual(M.inspect(7513, lim), { inSpec: false, state: 'over', by: 3 });
});

test('the reveal: two in-spec parts that still interfere', () => {
  const trap = M.PRESETS.in.find((p) => p.id === 'trap');
  const r = M.evaluate(trap.spec, trap.actual.hole, trap.actual.shaft);
  assert.equal(r.hole.inSpec, true);
  assert.equal(r.shaft.inSpec, true);
  assert.equal(r.clearance, -3);
  assert.equal(r.kind, 'interference');
  assert.equal(r.inSpecButInterferes, true);
  assert.equal(r.envelope.kind, 'transition');
  // Line-to-line is not interference, so it is not the reveal.
  assert.equal(M.evaluate(trap.spec, 7503, 7503).inSpecButInterferes, false);
  // An out-of-spec shaft that interferes is a rejected part, not the reveal.
  assert.equal(M.evaluate(trap.spec, 7502, 7508).inSpecButInterferes, false);
  // A clearance drawing cannot produce it with any in-spec pair.
  const slides = M.PRESETS.in.find((p) => p.id === 'slides').spec;
  for (let h = 7500; h <= 7510; h++) for (let s = 7480; s <= 7490; s++) {
    assert.equal(M.evaluate(slides, h, s).inSpecButInterferes, false);
  }
});

test('formatting never prints a signed zero or a float tail', () => {
  assert.equal(M.format(0, 'in'), '0.0000');
  assert.equal(M.format(0, 'in', { signed: true }), '0.0000');
  assert.equal(M.format(-6, 'in'), MINUS + '0.0006');
  assert.equal(M.format(12, 'in', { signed: true }), '+0.0012');
  assert.equal(M.format(7500, 'in'), '0.7500');
  assert.equal(M.format(20000, 'mm'), '20.000');
  assert.equal(M.format(-25, 'mm', { signed: true }), MINUS + '0.025');
  assert.equal(M.withUnit(M.format(5, 'mm'), 'mm'), '0.005 mm');
  assert.throws(() => M.format(0.5, 'in'));
});

test('radial gap is exactly half the diametral clearance', () => {
  assert.equal(M.formatHalf(12, 'in'), '0.0006');
  assert.equal(M.formatHalf(5, 'in'), '0.00025');        // odd count: one more decimal, not rounded
  assert.equal(M.formatHalf(-3, 'in'), MINUS + '0.00015');
  assert.equal(M.formatHalf(0, 'in'), '0.0000');
  assert.equal(M.formatHalf(7, 'mm'), '0.0035');
  for (let c = -40; c <= 40; c++) {
    const radial = Number(M.formatHalf(c, 'in').replace(MINUS, '-'));
    const diametral = Number(M.format(c, 'in').replace(MINUS, '-'));
    assert.ok(Math.abs(radial * 2 - diametral) < 1e-12, `count ${c}`);
  }
});

test('typed decimals parse to exact counts', () => {
  assert.deepEqual(M.parseToCounts('0.7500', 'in'), { ok: true, counts: 7500, rounded: false });
  assert.deepEqual(M.parseToCounts('.001', 'in'), { ok: true, counts: 10, rounded: false });
  assert.deepEqual(M.parseToCounts('-0.0008', 'in'), { ok: true, counts: -8, rounded: false });
  assert.deepEqual(M.parseToCounts(MINUS + '0.0008', 'in'), { ok: true, counts: -8, rounded: false });
  assert.deepEqual(M.parseToCounts('+0.025', 'mm'), { ok: true, counts: 25, rounded: false });
  assert.deepEqual(M.parseToCounts('20', 'mm'), { ok: true, counts: 20000, rounded: false });
  assert.deepEqual(M.parseToCounts('0.00025', 'in'), { ok: true, counts: 3, rounded: true });   // half away from zero
  assert.deepEqual(M.parseToCounts('-0.00025', 'in'), { ok: true, counts: -3, rounded: true });
  assert.deepEqual(M.parseToCounts('0.00024', 'in'), { ok: true, counts: 2, rounded: true });
  assert.deepEqual(M.parseToCounts('-0', 'in'), { ok: true, counts: 0, rounded: false });
  assert.equal(M.parseToCounts('', 'in').ok, false);
  assert.equal(M.parseToCounts('.', 'in').ok, false);
  assert.equal(M.parseToCounts('1.2.3', 'in').ok, false);
  assert.equal(M.parseToCounts('abc', 'in').ok, false);
});

test('validation refuses drawings the lab cannot honestly draw', () => {
  assert.equal(M.validateSpec(spec('in', 7500, 10, 0, -10, -20)).ok, true);
  assert.equal(M.validateSpec(spec('in', 7500, 0, 0, -10, -20)).ok, false);    // no tolerance band
  assert.equal(M.validateSpec(spec('in', 7500, 0, 10, -10, -20)).ok, false);   // upper below lower
  assert.equal(M.validateSpec(spec('in', 0, 10, 0, -10, -20)).ok, false);
  assert.equal(M.validateSpec(spec('in', 100, 30, 0, -10, -20)).ok, false);    // over a quarter of nominal
  assert.equal(M.validateSpec(spec('ft', 7500, 10, 0, -10, -20)).ok, false);
});

test('every preset is valid and its starting parts say what its title says', () => {
  for (const unit of ['in', 'mm']) {
    const byId = Object.fromEntries(M.PRESETS[unit].map((p) => [p.id, p]));
    assert.deepEqual(Object.keys(byId).sort(), ['either', 'pressed', 'slides', 'trap', 'zero']);
    for (const p of M.PRESETS[unit]) {
      assert.equal(p.spec.unit, unit);
      assert.equal(M.validateSpec(p.spec).ok, true, `${unit}/${p.id}`);
      const r = M.evaluate(p.spec, p.actual.hole, p.actual.shaft);
      assert.equal(r.bothInSpec, true, `${unit}/${p.id} starts with legal parts`);
      const w = M.viewWindow(p.spec);
      assert.ok(p.actual.hole >= w.min && p.actual.hole <= w.max && p.actual.shaft >= w.min && p.actual.shaft <= w.max);
    }
    assert.equal(M.envelope(byId.slides.spec).kind, 'clearance');
    assert.equal(M.envelope(byId.slides.spec).boundary, false);
    assert.equal(M.envelope(byId.either.spec).kind, 'transition');
    assert.equal(M.evaluate(byId.either.spec, byId.either.actual.hole, byId.either.actual.shaft).kind, 'clearance');
    assert.equal(M.envelope(byId.pressed.spec).kind, 'interference');
    assert.equal(M.evaluate(byId.trap.spec, byId.trap.actual.hole, byId.trap.actual.shaft).inSpecButInterferes, true);
    assert.equal(M.envelope(byId.zero.spec).min, 0);
    assert.equal(M.evaluate(byId.zero.spec, byId.zero.actual.hole, byId.zero.actual.shaft).kind, 'line-to-line');
  }
});

test('the challenge answer key matches the arithmetic', () => {
  for (const unit of ['in', 'mm']) {
    assert.equal(M.CHALLENGES[unit].length, 5);
    const kinds = new Set();
    for (const [i, c] of M.CHALLENGES[unit].entries()) {
      assert.equal(M.validateSpec(c.spec).ok, true, `${unit} #${i + 1}`);
      assert.equal(M.envelope(c.spec).kind, c.answer, `${unit} #${i + 1}`);
      kinds.add(c.answer);
    }
    assert.deepEqual([...kinds].sort(), ['clearance', 'interference', 'transition']);
    assert.ok(M.CHALLENGES[unit].some((c) => M.envelope(c.spec).boundary), `${unit} carries a boundary case`);
  }
});

test('view window: shared by both parts and padded past every limit', () => {
  const s = spec('in', 7500, 10, 0, 6, -2);
  const w = M.viewWindow(s);
  assert.ok(w.min < 7498 && w.max > 7510);
  assert.equal(M.clamp(9000, w.min, w.max), w.max);
});

test('magnification is a round number and keeps every size inside the band', () => {
  for (const unit of ['in', 'mm']) {
    for (const p of M.PRESETS[unit]) {
      const mag = M.magnification(p.spec, 160, 30);
      assert.ok([1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000].includes(mag.factor), `${unit}/${p.id} x${mag.factor}`);
      assert.ok(mag.magnified);
      const w = M.viewWindow(p.spec);
      const reachPx = (Math.max(Math.abs(w.min - p.spec.nominal), Math.abs(w.max - p.spec.nominal)) / 2) * mag.pxPerCount;
      assert.ok(reachPx <= 30 + 1e-9, `${unit}/${p.id} reach ${reachPx}`);
      // The label is honest: pixels per count = true scale x factor.
      assert.ok(Math.abs(mag.pxPerCount - (160 / p.spec.nominal) * mag.factor) < 1e-12);
    }
  }
});

test('pair share is an exact count over the legal grid', () => {
  // Brute force against the closed form.
  for (const s of [spec('in', 7500, 10, 0, 6, -2), spec('in', 7500, 10, 0, -10, -20), spec('in', 7500, 10, 0, 25, 15), spec('in', 7500, 10, 0, 0, -8)]) {
    const h = M.limits(s, 'hole'), sh = M.limits(s, 'shaft');
    let interfere = 0, touch = 0, clear = 0;
    for (let a = h.min; a <= h.max; a++) for (let b = sh.min; b <= sh.max; b++) {
      const k = M.pairKind(a - b);
      if (k === 'interference') interfere++; else if (k === 'line-to-line') touch++; else clear++;
    }
    assert.deepEqual(M.pairShare(s), { total: (h.max - h.min + 1) * (sh.max - sh.min + 1), interfere, lineToLine: touch, clear });
  }
  assert.equal(M.pairShare(spec('in', 7500, 10, 0, -10, -20)).interfere, 0);
  assert.equal(M.pairShare(spec('in', 7500, 10, 0, 25, 15)).clear, 0);
});

test('sampling is seeded, in spec, and counted correctly', () => {
  const s = spec('in', 7500, 10, 0, 6, -2);
  const a = M.samplePairs(s, 100, M.mulberry32(42));
  const b = M.samplePairs(s, 100, M.mulberry32(42));
  assert.deepEqual(a, b);
  assert.equal(a.pairs.length, 100);
  assert.equal(a.counts.clearance + a.counts['line-to-line'] + a.counts.interference, 100);
  for (const p of a.pairs) {
    assert.ok(p.hole >= 7500 && p.hole <= 7510 && p.shaft >= 7498 && p.shaft <= 7506);
    assert.equal(p.kind, M.pairKind(p.hole - p.shaft));
  }
});

test('the module loads as a plain browser script with no module system', () => {
  const src = fs.readFileSync(path.join(MODULE_DIR, 'model.js'), 'utf8');
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox);
  assert.equal(typeof sandbox.ToleranceFitModel.envelope, 'function');
});

test('manifest names exactly the files that exist, in load order', () => {
  const conf = fs.readFileSync(path.join(MODULE_DIR, 'interactive.conf'), 'utf8');
  const field = (k) => (conf.match(new RegExp('^@@' + k + ':\\s*(.*)$', 'm')) || [])[1];
  assert.equal(field('ID'), 'tolerance-fit');
  assert.match(conf, /^@@END\s*$/m);
  const js = field('JS').split(',').map((x) => x.trim());
  assert.deepEqual(js, ['model.js', 'demo.js']);
  for (const f of [...js, ...field('CSS').split(',').map((x) => x.trim())]) {
    assert.ok(fs.existsSync(path.join(MODULE_DIR, f)), f);
  }
});
