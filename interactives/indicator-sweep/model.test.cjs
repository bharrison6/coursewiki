'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('./model.js'), D = require('./render.js'), U = require('./demo.js');
const near = (a, b, t = 1e-10) => assert.ok(Math.abs(a - b) <= t, `${a} should equal ${b}`);

test('100 mm slope gives the stated +0.060 mm endpoint difference', () => {
  const s = { ...M.PRESETS.slope };
  near(M.surface(s, 0), 0); near(M.surface(s, 100), .06);
  near(M.result(s).left, 0); near(M.result(s).right, .06); near(M.result(s).endpointDifference, .06);
});

test('re-zeroing subtracts one constant and preserves all pairwise differences', () => {
  const before = { ...M.PRESETS.slope }, after = M.withZero(before, 50);
  near(M.result(after).left, -.03); near(M.result(after).center, 0); near(M.result(after).right, .03);
  near(M.result(after).endpointDifference, M.result(before).endpointDifference);
  near(M.result(after).range, M.result(before).range);
  assert.deepEqual(U.prediction(before, after), { before: .06, after: .06 });
});

test('equal endpoints do not hide the midspan bump from a full sweep', () => {
  const s = { ...M.PRESETS.bump }, r = M.result(s);
  near(r.left, 0); near(r.right, 0); near(r.center, .08); near(r.endpointDifference, 0); near(r.range, .08);
  assert.ok(M.samples(s).some(p => p.x === 50 && Math.abs(p.reading - .08) < 1e-12));
});

test('contact response reverses readings while physical displacement stays fixed', () => {
  const positive = { ...M.PRESETS.slope }, negative = M.withResponse(positive, -1);
  near(M.surface(positive, 100), M.surface(negative, 100));
  near(M.result(positive).endpointDifference, .06); near(M.result(negative).endpointDifference, -.06);
});

test('stored zero remains fixed when geometry changes after zeroing', () => {
  const zeroed = M.withZero({ ...M.PRESETS.slope }, 50);
  near(M.reading(zeroed, 50), 0);
  const moved = M.rotate(zeroed, -.0002, 25);
  near(moved.zeroValue, .03); near(M.reading(moved, 50), -.005);
  near(M.result(moved).endpointDifference, .04);
});

test('rotation about explicit pivots moves both ends while preserving the chosen point', () => {
  const base = { ...M.PRESETS.slope };
  for (const [pivot, expected] of [[0, 0], [25, .015], [50, .03], [100, .06]]) {
    const rotated = M.rotate(base, -.0006, pivot);
    near(rotated.m, 0); near(M.surface(rotated, 0), expected); near(M.surface(rotated, 100), expected);
    near(M.surface(rotated, pivot), M.surface(base, pivot));
    near(M.result(rotated).endpointDifference, 0);
  }
  const selected = M.withPivot(base, 50);
  near(M.surface(selected, 0), M.surface(base, 0)); near(M.surface(selected, 100), M.surface(base, 100));
});

test('increments compose, pivot changes offset, and translation is not alignment', () => {
  const base = { ...M.PRESETS.slope };
  const returned = M.rotate(M.rotate(base, -.0003, 25), .0003, 25);
  near(returned.a, base.a); near(returned.m, base.m);
  const leftPivot = M.rotate(base, -.0002, 0), midPivot = M.rotate(base, -.0002, 50);
  near(leftPivot.m, midPivot.m); near(M.result(leftPivot).endpointDifference, .04); near(M.result(midPivot).endpointDifference, .04);
  near(M.surface(midPivot, 0) - M.surface(leftPivot, 0), .01);
  const translated = { ...base, a: .05 };
  near(M.result(translated).endpointDifference, .06); near(M.result(translated).range, .06);
});

test('the local bump stays attached and cannot be removed as linear tilt', () => {
  const tiltedBump = { ...M.PRESETS.bump, m: .0006 };
  const rotated = M.rotate(tiltedBump, -.0006, 25), result = M.result(rotated);
  near(rotated.m, 0); near(result.left, .015); near(result.center, .095); near(result.right, .015);
  near(result.endpointDifference, 0); near(result.range, .08);
});

test('validation rejects invalid bounds, response, positions and sample counts', () => {
  for (const changes of [{ length: 99 }, { length: 101 }, { margin: 0 }, { margin: 2 }, { a: .251 }, { m: .0021 }, { bump: .201 }, { bump: Infinity }, { pivot: -1 }, { pivot: 101 }, { pivotY: 1 }, { travel: -.001 }, { travel: .00004 }, { travel: .0041 }, { response: 0 }, { zeroX: -1 }, { position: 101 }, { kind: 'wave' }])
    assert.throws(() => M.result({ ...M.DEFAULT, ...changes }), RangeError);
  near(M.surface(M.DEFAULT, -1), -.0006); near(M.surface(M.DEFAULT, 101), .0606);
  for (const x of [-1.001, 101.001, NaN]) assert.throws(() => M.reading(M.DEFAULT, x), RangeError);
  for (const count of [2, 502, 4.5]) assert.throws(() => M.samples(M.DEFAULT, count), RangeError);
  for (const increment of [-.0011, -.00004, .00004, .0011, NaN]) assert.throws(() => M.rotate(M.DEFAULT, increment, 25), RangeError);
  for (const increment of [-.0006, -.0001, 0, .0001, .0006]) assert.doesNotThrow(() => M.rotate(M.DEFAULT, increment, 25));
  const unchanged = { ...M.DEFAULT }; assert.throws(() => M.rotate(unchanged, .00004, 25), RangeError); assert.deepEqual(unchanged, M.DEFAULT);
  assert.throws(() => M.rotate({ ...M.DEFAULT, travel: .004 }, .0001, 25), RangeError);
  assert.throws(() => M.rotate({ ...M.DEFAULT, a: .249 }, -.001, 100), RangeError);
});

test('renderer and static lesson expose physical sign, zero and model limits', () => {
  const svg = D.draw(M.DEFAULT), lesson = D.staticLesson();
  assert.match(svg, /toward body/); assert.match(svg, /deviation exaggerated, not to scale/); assert.match(svg, /digital value uses the exact model/);
  assert.match(svg, /is-vise/); assert.match(svg, /is-pivot-label[^>]*>P25\.000/); assert.match(svg, /is-digital-value[^>]*>\+0\.060/);
  assert.match(svg, /class="is-pivot" cx="193\.00" cy="82\.00"/);
  assert.match(D.draw(M.rotate(M.DEFAULT, -.0006, 25)), /class="is-pivot" cx="193\.00" cy="82\.00"/);
  assert.doesNotMatch(svg, /is-reading|is-tick|Comparison reading|NaN|Infinity/);
  assert.match(D.draw({ ...M.DEFAULT, position: 25 }), /is-digital-value[^>]*>\+0\.015/);
  assert.match(D.readout(M.DEFAULT), /Stored zero <strong>at 0\.000 mm/);
  assert.match(D.readout(M.DEFAULT), /Measuring span <strong>0–100 mm; 1 mm face margins/);
  assert.match(D.readout(M.DEFAULT), /Accumulated \|d\| <strong>0\.0000 \/ 0\.0040 mm\/mm/);
  assert.match(D.readout(M.rotate(M.DEFAULT, -.0006, 25)), /Accumulated \|d\| <strong>0\.0006 \/ 0\.0040 mm\/mm/);
  assert.match(D.readout(M.DEFAULT), /Model summary — full sweep range <strong>0\.060 mm/);
  assert.match(lesson, /a \+ m·x \+ b·4/); assert.match(lesson, /both ends become \+0\.015 mm/); assert.match(lesson, /re-zeroing is optional convenience/i);
  assert.match(lesson, /universal tolerance/); assert.match(lesson, /not a literal scale/); assert.match(lesson, /MIT, Introduction to the Mill/);
  assert.equal((lesson.match(/class="is-static-grid"/g) || []).length, 1);
});

test('physical jaw shape and numeric comparisons preserve the approved zero lessons', () => {
  const path = svg => svg.match(/class="is-jaw" d="([^"]+)"/)[1];
  const baseline = { ...M.PRESETS.slope }, baselineZeroed = M.withZero(baseline, 50);
  assert.equal(path(D.draw(baseline)), path(D.draw(baselineZeroed)), 'default physical jaw is unchanged by re-zeroing');
  near(M.result(baselineZeroed).range, .06); near(M.result(baselineZeroed).endpointDifference, .06);
  assert.match(D.readout(baselineZeroed), /Left reference <strong>−0\.030 mm.*Center reference <strong>0\.000 mm.*Right reference <strong>\+0\.030 mm/s);

  const rotated = M.rotate(baseline, -.0006, 25), rotatedZeroed = M.withZero(rotated, 50);
  near(M.result(rotated).range, 0); near(M.result(rotatedZeroed).range, 0);
  assert.equal(path(D.draw(rotated)), path(D.draw(rotatedZeroed)), 'rotated physical jaw is unchanged by re-zeroing');

  const bump = { ...M.PRESETS.bump }, aligned = { ...M.PRESETS.aligned };
  assert.notEqual(path(D.draw(bump)), path(D.draw(aligned)), 'physical view retains the midspan high spot');
  const bumpReadout = D.readout(bump);
  assert.match(bumpReadout, /Left reference <strong>0\.000 mm/); assert.match(bumpReadout, /Center reference <strong>\+0\.080 mm/);
  assert.match(bumpReadout, /Right reference <strong>0\.000 mm/); assert.match(bumpReadout, /Model summary — full sweep range <strong>0\.080 mm/);

  const oldZero = M.withZero(M.rotate({ ...M.PRESETS.slope }, .0004, 25), 100);
  const movedFar = M.rotate(oldZero, -.0008, 50);
  assert.match(D.draw(movedFar), /is-digital-value/);
  assert.match(D.readout(movedFar), /Stored zero <strong>at 100\.000 mm/);
  assert.doesNotMatch(D.draw(movedFar) + D.readout(movedFar), /NaN|Infinity/);
});

test('rotation and exact extrema agree with an independent small-angle oracle', () => {
  function oracleRotate(s, d, p) { return { ...s, a: s.a - p * d, m: s.m + d, pivot: p }; }
  function oracleSurface(s, x) { const t = x / s.length; return s.a + s.m * x + s.bump * 4 * t * (1 - t); }
  function oracleResult(s) {
    const xs = [0, s.length], candidate = s.bump ? s.length / 2 + s.m * s.length * s.length / (8 * s.bump) : -1;
    if (candidate > 0 && candidate < s.length) xs.push(candidate);
    const readings = xs.map(x => s.response * oracleSurface(s, x) - s.zeroValue);
    return { min: Math.min(...readings), max: Math.max(...readings) };
  }
  for (const pivot of [0, 25, 50, 100]) for (const response of [-1, 1]) for (const zeroX of [0, 25, 50, 100]) {
    let source = { ...M.PRESETS.bump, m: .0006, response };
    source = M.withZero(source, zeroX);
    const actual = M.rotate(source, -.0004, pivot), expected = oracleRotate(source, -.0004, pivot);
    near(actual.a, expected.a); near(actual.m, expected.m);
    for (const x of [0, 13, 50, 87, 100]) near(M.surface(actual, x), oracleSurface(expected, x));
    const oracle = oracleResult(expected), result = M.result(actual);
    near(result.min, oracle.min); near(result.max, oracle.max);
  }
});

test('complete action histories stay within a finite-face exact rigid-transform oracle', () => {
  function createOracle(s) {
    return { base: { a: s.a, m: s.m, bump: s.bump, length: s.length, margin: s.margin },
      c: 1, sn: 0, tx: 0, ty: 0, response: s.response, zeroX: s.zeroX, zeroValue: s.zeroValue };
  }
  function basePoint(o, u) {
    const b = o.base, t = u / b.length;
    return { x: u, y: b.a + b.m * u + b.bump * 4 * t * (1 - t) };
  }
  function point(o, u) {
    const q = basePoint(o, u);
    return { x: o.c * q.x - o.sn * q.y + o.tx, y: o.sn * q.x + o.c * q.y + o.ty };
  }
  function rotateExact(o, angle, px, py = 0) {
    const c = Math.cos(angle), sn = Math.sin(angle), old = { ...o };
    o.c = c * old.c - sn * old.sn; o.sn = sn * old.c + c * old.sn;
    o.tx = c * old.tx - sn * old.ty + px - c * px + sn * py;
    o.ty = sn * old.tx + c * old.ty + py - sn * px - c * py;
  }
  function atMachineX(o, target) {
    let lo = -o.base.margin, hi = o.base.length + o.base.margin, a = point(o, lo), b = point(o, hi);
    assert.ok(a.x <= target && b.x >= target, `finite face lost machine-x contact at ${target}: [${a.x}, ${b.x}]`);
    for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (point(o, mid).x < target) lo = mid; else hi = mid; }
    return point(o, (lo + hi) / 2);
  }
  function setZero(o, x) { o.zeroX = x; o.zeroValue = o.response * atMachineX(o, x).y; }
  function setResponse(o, response) { o.response = response; setZero(o, o.zeroX); }
  function exactExtrema(o) {
    const left = atMachineX(o, 0), right = atMachineX(o, 100), candidates = [left, right], b = o.base;
    if (b.bump && Math.abs(o.c) > 1e-12) {
      const u = b.length / 2 + (b.m + o.sn / o.c) * b.length * b.length / (8 * b.bump);
      if (u > -b.margin && u < b.length + b.margin) {
        const q = point(o, u); if (q.x > 0 && q.x < 100) candidates.push(q);
      }
    }
    const readings = candidates.map(q => o.response * q.y - o.zeroValue);
    return { min: Math.min(...readings), max: Math.max(...readings) };
  }
  function verify(initial, actions) {
    let model = { ...initial }, oracle = createOracle(initial), maxError = 0;
    for (const action of actions) {
      if (action.type === 'pivot') model = M.withPivot(model, action.p);
      if (action.type === 'rotate') { model = M.rotate(model, action.d, action.p); rotateExact(oracle, action.d, action.p, 0); }
      if (action.type === 'zero') { model = M.withZero(model, action.x); setZero(oracle, action.x); }
      if (action.type === 'response') { model = M.withResponse(model, action.value); setResponse(oracle, action.value); }
      for (const x of [0, 13, 25, 50, 75, 87, 100]) {
        const exact = oracle.response * atMachineX(oracle, x).y - oracle.zeroValue, error = Math.abs(M.reading(model, x) - exact);
        maxError = Math.max(maxError, error);
      }
      const exactRange = exactExtrema(oracle), actual = M.result(model);
      maxError = Math.max(maxError, Math.abs(actual.min - exactRange.min), Math.abs(actual.max - exactRange.max));
    }
    assert.ok(maxError <= .0001, `unrounded history error ${maxError} exceeds 0.0001 mm`);
  }
  const histories = [
    ...[0, 25, 50, 100].map(p => [{ type: 'rotate', d: -.0006, p }]),
    [{ type: 'pivot', p: 50 }, { type: 'rotate', d: -.0004, p: 50 }, { type: 'zero', x: 25 }, { type: 'rotate', d: .0002, p: 25 }, { type: 'response', value: -1 }],
    [{ type: 'rotate', d: .001, p: 0 }, { type: 'rotate', d: -.001, p: 100 }, { type: 'rotate', d: .001, p: 0 }, { type: 'rotate', d: -.001, p: 100 }],
    [{ type: 'rotate', d: -.0006, p: 25 }, { type: 'zero', x: 50 }, { type: 'rotate', d: .0003, p: 50 }]
  ];
  for (const response of [-1, 1]) for (const zeroX of [0, 25, 50, 100]) {
    let initial = { ...M.PRESETS.bump, m: .0006, response }; initial = M.withZero(initial, zeroX);
    for (const history of histories) verify(initial, history);
  }
});

