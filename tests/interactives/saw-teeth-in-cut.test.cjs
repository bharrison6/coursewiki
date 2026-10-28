'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../../interactives/saw-teeth-in-cut/model.js');
const D = require('../../interactives/saw-teeth-in-cut/render.js');
const U = require('../../interactives/saw-teeth-in-cut/demo.js');
function near(a, b, tolerance = 1e-10) { assert.ok(Math.abs(a - b) <= tolerance, `${a} should equal ${b}`); }
const flat = { ...M.PRESETS.fine, thickness: 12.7, pitch: 14 };
test('half-inch flat at 14 TPI has seven teeth throughout the cut', () => {
  for (const depth of [0, 1, 12.7, 25.4]) near(M.at(flat, depth).teeth, 7);
  near(M.solve(flat).min, 7); near(M.solve(flat).max, 7);
});
test('solid round chord at centre is diameter, with symmetric entry and exit', () => {
  const s = { ...M.DEFAULT, type: 'round', diameter: 10 };
  near(M.at(s, 5).length, 10); near(M.at(s, 1).length, 6);
  near(M.at(s, 9).length, 6); near(M.at(s, 0).length, 0); near(M.at(s, 10).length, 0);
});
test('tube top is outer chord; centre is two walls; tangencies are exact maxima', () => {
  const s = { ...M.DEFAULT, diameter: 10, wall: 2, pitch: 1, unit: 'mm' };
  near(M.at(s, 1).length, 6); near(M.at(s, 5).length, 4);
  near(M.at(s, 2).length, 8); near(M.at(s, 8).length, 8);
  assert.deepEqual(M.at(s, 5).intervals, [[-5, -3], [3, 5]]);
  near(M.solve(s).max, 8); near(M.solve(s).min, 0);
  for (const p of M.samples(s)) {
    assert.ok(p.teeth <= 8 + 1e-10); near(p.length, M.at(s, 10 - p.depth).length);
    near(p.intervals.reduce((sum, v) => sum + v[1] - v[0], 0), p.length);
  }
  // A thin wall that is not on the regular sampling grid still reaches its exact peak.
  const thin = { ...s, wall: .0137 };
  assert.ok(M.samples(thin).some(p => p.depth === thin.wall));
  near(M.solve(thin).max, 2 * Math.sqrt(25 - (5 - .0137) ** 2));
});
test('below-three flag uses the unrounded count and does not certify a blade', () => {
  const s = { ...flat, unit: 'mm', pitch: 1 };
  assert.equal(M.at({ ...s, thickness: 2.9999 }, 1).belowThree, true);
  assert.equal(M.at({ ...s, thickness: 3 }, 1).belowThree, false);
  assert.match(D.readout({ ...s, thickness: 2 }, 1), /Below the common rule of thumb of about three teeth/);
});
test('TPI and millimetre pitch represent the same spacing without display rounding', () => {
  near(M.tpiToMM(14), 25.4 / 14); near(M.mmToTPI(25.4 / 14), 14);
  const s = { ...flat, unit: 'mm', pitch: M.tpiToMM(flat.pitch) };
  near(M.at(s, 1).teeth, 7);
  for (let i = 0; i < 50; i++) s.pitch = M.tpiToMM(M.mmToTPI(s.pitch));
  near(M.at(s, 1).teeth, 7);
});
test('rotation swaps contact and feed dimensions; prediction changes only TPI', () => {
  const rotated = M.rotateFlat(flat);
  near(M.depth(rotated), flat.thickness); near(M.at(rotated, 1).teeth, 14);
  assert.deepEqual(M.rotateFlat(rotated), flat);
  assert.throws(() => M.rotateFlat(M.DEFAULT), RangeError);
  const t = U.trial();
  assert.deepEqual(Object.keys(t.before).filter(k => t.before[k] !== t.after[k]), ['pitch']);
  near(M.at(t.after, 25.4).teeth / M.at(t.before, 25.4).teeth, 2);
});
test('guards reject invalid geometry, pitch, units, type and depth', () => {
  for (const [s, keys] of [[flat, ['thickness', 'height', 'pitch']], [M.DEFAULT, ['diameter', 'wall', 'pitch']]])
    for (const key of keys) for (const value of [0, -1, NaN, Infinity, -Infinity, undefined, '2'])
      assert.throws(() => M.solve({ ...s, [key]: value }), RangeError);
  for (const wall of [25.4, 30]) assert.throws(() => M.solve({ ...M.DEFAULT, wall }), RangeError);
  for (const depth of [-1, 51, NaN, Infinity]) assert.throws(() => M.at(M.DEFAULT, depth), RangeError);
  for (const unit of ['', 'in', undefined]) assert.throws(() => M.solve({ ...flat, unit }), RangeError);
  assert.throws(() => M.solve({ ...flat, type: 'angle' }), RangeError);
  assert.throws(() => M.solve(null), RangeError);
  for (const v of [0, -1, NaN, Infinity]) { assert.throws(() => M.tpiToMM(v), RangeError); assert.throws(() => M.mmToTPI(v), RangeError); }
});
test('presets, plots and static explanation expose correct continuous ranges', () => {
  near(M.solve(M.PRESETS.fine).min, 48); near(M.solve(M.PRESETS.fine).max, 48);
  near(M.at(M.PRESETS.tube, 25.4).teeth, 12 / 25.4);
  // Outer radius 25.4, inner radius 24.4: squared half-chord = 49.8.
  near(M.solve(M.PRESETS.tube).max, Math.sqrt(49.8) * 12 / 25.4);
  assert.match(D.staticLesson(), /minimum <strong>0.00/);
  assert.match(D.staticLesson(), /maximum <strong>48.00/);
  assert.match(D.staticLesson(), /gullets may fill with chips/i);
  assert.equal((D.staticLesson().match(/class="st-guide"/g) || []).length, 2);
  assert.match(D.section(M.DEFAULT, 25.4), /st-engaged/);
  assert.doesNotMatch(D.section(M.DEFAULT, 0), /st-tooth st-engaged/);
  for (const s of Object.values(M.PRESETS)) assert.doesNotMatch(D.plot(s, M.depth(s) / 2) + D.section(s, M.depth(s) / 2), /NaN|Infinity/);
});
