'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../../interactives/tool-deflection/model.js');
const D = require('../../interactives/tool-deflection/render.js');
const U = require('../../interactives/tool-deflection/demo.js');
const s = { length: 40, diameter: 10, force: 100, modulus: 600 };
function near(a, b, tolerance = 1e-8) { assert.ok(Math.abs(a - b) < tolerance, `${a} should equal ${b}`); }
test('defined-input cantilever oracles use consistent N, mm, GPa and micrometers', () => {
  near(M.sectionMoment(10), 490.8738521234052);
  near(M.solve(s).micrometers, 7.243318298937815);
  near(M.at(s, 20) * 1000, 2.263536968418067);
  near(M.at(s, 20) / M.at(s, 40), 5 / 16);
  near(M.solve({ ...s, length: 80 }).micrometers, 57.94654639150252);
  near(M.solve({ ...s, diameter: 20 }).micrometers, 0.4527073936836134);
});
test('clamp is fixed in displacement and slope; free-end moment is zero', () => {
  assert.equal(M.at(s, 0), 0); assert.equal(M.slope(s, 0), 0);
  for (const x of [0, 5, 20, 39]) {
    assert.ok(M.at(s, x + 1) > M.at(s, x));
    near((M.at(s, x + 0.001) - M.at(s, x)) / 0.001, M.slope(s, x), 1e-8);
  }
  near((M.slope(s, 40) - M.slope(s, 39.999)) / .001, 0, 1e-8);
});
test('length cubed, diameter to the fourth, load and modulus factors compose', () => {
  const base = M.solve(s).tip;
  near(M.solve({ ...s, length: 80 }).tip / base, 8);
  near(M.solve({ ...s, diameter: 20 }).tip / base, 1 / 16);
  near(M.solve({ ...s, force: 200 }).tip / base, 2);
  near(M.solve({ ...s, modulus: 1200 }).tip / base, .5);
  const cmp = M.compare({ ...s, length: 80, diameter: 20, force: 200, modulus: 300 }, s);
  near(cmp.ratio, 2);
  near(Object.values(cmp.factors).reduce((a, b) => a * b, 1), cmp.ratio);
  near(M.solve(s).stiffness * M.solve(s).tip, s.force);
});
test('zero load is exactly zero; a zero baseline has no finite bending ratio', () => {
  const zero = { ...s, force: 0 };
  assert.equal(M.solve(zero).tip, 0); assert.equal(M.at(zero, 20), 0);
  assert.equal(M.compare(s, zero).ratio, null);
  assert.equal(U.ratioText(M.compare(zero, zero)), 'Both tools are unloaded');
  assert.equal(U.ratioText(M.compare(s, zero)), 'Baseline is unloaded');
});
test('reject nonpositive geometry/stiffness and nonfinite or negative loads', () => {
  for (const key of ['length', 'diameter', 'modulus']) for (const value of [0, -1, NaN, Infinity])
    assert.throws(() => M.solve({ ...s, [key]: value }), RangeError);
  for (const force of [-1, NaN, Infinity]) assert.throws(() => M.solve({ ...s, force }), RangeError);
  for (const x of [-1, 41, NaN]) assert.throws(() => M.at(s, x), RangeError);
});
test('model validity concerns surface for short beams and large displacement', () => {
  assert.equal(U.validity(s), '');
  assert.match(U.validity({ ...s, length: 20, diameter: 20 }), /short, thick beam/);
  const extreme = { length: 120, diameter: 4, force: 400, modulus: 200 };
  assert.ok(M.solve(extreme).relative > .01);
  assert.match(U.validity(extreme), /small-deflection/);
});
test('both beams share scale, their paths come from the model, and reference stays fixed', () => {
  const long = { ...s, length: 80 }, scale = D.commonScale(s, long);
  assert.equal(scale, 100);
  const svg = D.pair(s, long), paths = [...svg.matchAll(/data-tip-mm="([^"]+)" data-bend-scale="([^"]+)"/g)];
  assert.equal(paths.length, 2);
  near(Number(paths[0][1]), M.solve(long).tip); near(Number(paths[1][1]), M.solve(s).tip);
  assert.equal(paths[0][2], paths[1][2]);
  assert.ok(svg.includes(D.shape(s, 250, scale)));
  const points = [...D.shape(s, 250, scale).matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
  near(points[0][0], 80); near(points[0][1], 250 - s.diameter * D.GEOMETRY_SCALE / 2);
  near(points[40][0], 80 + s.length * D.GEOMETRY_SCALE);
  near(points[40][1], 250 + M.solve(s).tip * D.GEOMETRY_SCALE * scale - s.diameter * D.GEOMETRY_SCALE / 2, .0001);
  const ref = x => [...x.matchAll(/class="td-reference" d="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ref(svg).length, 2);
  assert.deepEqual(ref(D.pair(s, s)), ref(D.pair({ ...s, force: 200 }, s)));
  const extreme = { length: 120, diameter: 4, force: 400, modulus: 200 };
  assert.ok(D.commonScale(extreme, long) < 100);
  const scales = [...D.pair(extreme, long).matchAll(/data-bend-scale="([^"]+)"/g)].map(m => m[1]);
  assert.equal(scales[0], scales[1]);
});
test('wall offset is a one-sided tip displacement, and zero load leaves no strip', () => {
  assert.match(D.wall(s), /7\.243 µm extra material/);
  assert.match(D.wall({ ...s, force: 0 }), /class="td-extra"[^>]+height="0"/);
  assert.match(D.wall(s), /one-sided wall pass/);
});
test('prediction trials change one independent variable and agree with their answers', () => {
  for (const [key, e] of Object.entries(U.EXPERIMENTS)) {
    const t = U.trial(key); near(M.compare(t.current, t.baseline).ratio, e.answer);
    assert.deepEqual(Object.keys(t.current).filter(k => t.current[k] !== t.baseline[k]), [key]);
  }
  assert.throws(() => U.trial('unknown'));
});
