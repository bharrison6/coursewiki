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
  const moved = M.withAdjustment(zeroed, -.02);
  near(moved.zeroValue, .03); near(M.reading(moved, 50), -.01);
  near(M.result(moved).endpointDifference, .04);
});

test('right-end adjustment cancels only the ideal linear trend', () => {
  let s = M.cancelEndpointTrend({ ...M.PRESETS.slope });
  near(s.adjustment, -.06); near(M.result(s).range, 0);
  s = M.cancelEndpointTrend({ ...M.PRESETS.bump, endRise: .04 });
  near(M.result(s).endpointDifference, 0); near(M.result(s).center, .08); near(M.result(s).range, .08);
});

test('validation rejects invalid bounds, response, positions and sample counts', () => {
  for (const changes of [{ length: 0 }, { length: 501 }, { endRise: 2 }, { bump: Infinity }, { adjustment: -2 }, { response: 0 }, { zeroX: -1 }, { position: 101 }, { kind: 'wave' }])
    assert.throws(() => M.result({ ...M.DEFAULT, ...changes }), RangeError);
  for (const x of [-1, 101, NaN]) assert.throws(() => M.reading(M.DEFAULT, x), RangeError);
  for (const count of [2, 502, 4.5]) assert.throws(() => M.samples(M.DEFAULT, count), RangeError);
});

test('renderer and static lesson expose physical sign, zero and model limits', () => {
  const svg = D.draw(M.DEFAULT), lesson = D.staticLesson();
  assert.match(svg, /toward body/); assert.match(svg, /stored zero at 0\.000 mm/); assert.doesNotMatch(svg, /NaN|Infinity/);
  assert.match(svg, /Comparison reading \(mm\)/); assert.match(svg, /Same gain after re-zero; changing jaw geometry may rescale/);
  assert.match(svg, />\+0\.080<.*>−0\.020</s);
  assert.match(D.readout({ ...M.DEFAULT, position: 25 }), /Contact at 25\.000 mm <strong>\+0\.015 mm/);
  assert.match(lesson, /right minus left/); assert.match(lesson, /universal tolerance/); assert.match(lesson, /Vertical gain comes from the full sweep range/); assert.match(lesson, /MIT, Introduction to the Mill/);
  assert.equal((lesson.match(/class="is-static-grid"/g) || []).length, 1);
});

test('quantitative plot gain is invariant to stored zero, including a nondefault range', () => {
  const path = svg => svg.match(/class="is-reading" d="([^"]+)"/)[1];
  const baseline = { ...M.PRESETS.slope }, baselineZeroed = M.withZero(baseline, 50);
  near(D.frame(baseline).halfScale, .05); near(D.frame(baselineZeroed).halfScale, .05);
  assert.equal(path(D.draw(baseline)), path(D.draw(baselineZeroed)), 'default control keeps the same graphical span');

  const adjusted = M.withAdjustment({ ...M.PRESETS.slope }, .24), adjustedZeroed = M.withZero(adjusted, 50);
  near(M.result(adjusted).range, .3); near(D.frame(adjusted).halfScale, .2025);
  near(D.frame(adjustedZeroed).halfScale, .2025);
  assert.equal(path(D.draw(adjusted)), path(D.draw(adjustedZeroed)), '0.300 mm range keeps the same graphical span after re-zero');
  assert.match(D.draw(adjusted), />\+0\.353<.*>−0\.053</s);
  assert.match(D.draw(adjustedZeroed), />\+0\.203<.*>−0\.203</s);

  const oldZero = M.withZero(M.withAdjustment({ ...M.PRESETS.slope }, 1), 100);
  const movedFar = M.withAdjustment(oldZero, -1), svg = D.draw(movedFar);
  assert.match(svg, /is-zero-frame-note[^>]*>zero above frame — current readings remain in view/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

