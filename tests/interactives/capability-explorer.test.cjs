'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../../interactives/capability-explorer/model.js');
const D = require('../../interactives/capability-explorer/render.js');
const U = require('../../interactives/capability-explorer/demo.js');
function near(a, b, tolerance = 1e-10) { assert.ok(Math.abs(a - b) <= tolerance, `${a} should equal ${b}`); }
test('centred and shifted hand calculations distinguish Cp from Cpk', () => {
  const s = { lsl: -6, usl: 6, mean: 0, sigma: 1 };
  near(M.solve(s).cp, 2); near(M.solve(s).cpk, 2);
  near(M.solve({ ...s, mean: 1 }).cpk, 2 - 1 / 3);
  near(M.solve({ ...s, mean: -1 }).cpk, 2 - 1 / 3);
  near(M.solve({ ...s, sigma: 2 }).cp, 1);
  const pair = U.trial();
  near(M.solve(pair.before).cp, M.solve(pair.after).cp);
  near(M.solve(pair.before).cpk - M.solve(pair.after).cpk, 1 / 3);
  assert.deepEqual(Object.keys(pair.before).filter(k => pair.before[k] !== pair.after[k]), ['mean']);
});
test('normal tail fractions agree with independent probability values', () => {
  for (const [limit, ppm] of [[3, 2699.796063], [1, 317310.507863]]) {
    const r = M.solve({ lsl: -limit, usl: limit, mean: 0, sigma: 1 });
    near(r.ppm, ppm, .15); near(r.below, r.above); near(r.total, r.below + r.above);
  }
  const r = M.solve({ lsl: -1, usl: 3, mean: 0, sigma: 1 });
  near(r.below, .158655253931, 7.5e-8); near(r.above, .001349898032, 7.5e-8);
  assert.ok(M.normalCDF(-9) > 0); near(M.normalCDF(0), .5);
});
test('Cpk stays negative outside either limit; boundary mean leaves half outside', () => {
  for (const mean of [-4, 4]) near(M.solve({ lsl: -3, usl: 3, mean, sigma: 1 }).cpk, -1 / 3);
  const r = M.solve({ lsl: -3, usl: 3, mean: 3, sigma: 1 });
  near(r.cpk, 0); near(r.above, .5);
});
test('reject invalid inputs rather than producing plausible numbers', () => {
  for (const key of ['lsl', 'usl', 'mean', 'sigma']) for (const value of [NaN, Infinity, -Infinity, undefined, '20'])
    assert.throws(() => M.solve({ ...M.DEFAULT, [key]: value }), RangeError);
  for (const sigma of [0, -1]) assert.throws(() => M.solve({ ...M.DEFAULT, sigma }), RangeError);
  for (const usl of [19.95, 19]) assert.throws(() => M.solve({ ...M.DEFAULT, usl }), RangeError);
  assert.throws(() => M.solve(null), RangeError);
});
test('erf approximation respects its absolute error bound and odd symmetry', () => {
  // Independent reference values, not recomputed with this approximation.
  for (const [x, expected] of [[0, 0], [.1, .1124629160182849], [.5, .5204998778130465], [1, .8427007929497149], [1.5, .9661051464753108], [2, .9953222650189527], [3, .9999779095030014], [5, .9999999999984626]]) {
    near(M.erf(x), expected, 1.5e-7); near(M.erf(-x), -expected, 1.5e-7);
  }
  near(M.erf(Infinity), 1); near(M.erf(-Infinity), -1);
  assert.throws(() => M.erf(NaN), RangeError);
});
test('presets teach the intended comparison and preserve a common plot scale', () => {
  const a = M.solve(M.PRESETS.precise), b = M.solve(M.PRESETS.wide);
  near(a.cp, 10 / 3); near(a.cpk, 1 / 3); near(a.ppm, 158655.253931, .15);
  near(b.cp, 2 / 3); near(b.cpk, b.cp); near(b.ppm, 45500.263896, .15);
  assert.ok(a.ppm > b.ppm);
  const limits = s => D.curve(s).match(/class="ce-limit" d="([^"]+)"/)[1];
  assert.equal(limits(M.PRESETS.precise), limits(M.PRESETS.wide));
  assert.equal((D.curve(M.DEFAULT).match(/class="ce-tail"/g) || []).length, 2);
  assert.match(D.readout({ ...M.DEFAULT, mean: 20.06 }), /-0.33/);
});
