'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../../interactives/css-explorer/model.js');
const D = require('../../interactives/css-explorer/render.js');
const s = change => ({ ...M.DEFAULT, ...change });
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} should equal ${b}`);

test('inch and metric CSS agree with independent hand values', () => {
  near(M.solve(s()).rpm, 458.3662361046586);
  near(M.solve(s()).rpm, 458.37, .005);
  near(M.solve(s({ units: 'metric', speed: 120, diameter: 40, od: 40 })).rpm, 954.929658551372);
  near(M.solve(s({ units: 'metric', speed: 120, diameter: 40, od: 40 })).rpm, 954.93, .005);
});
test('ceiling selects the smaller RPM and crossover separates both regimes', () => {
  const cross = M.solve(s()).crossover;
  near(cross, .9167324722093172);
  const metric = M.solve(s({ units: 'metric', speed: 120, od: 40, diameter: 40 }));
  near(metric.crossover, 38.19718634205488);
  for (const units of ['inch', 'metric']) {
    const base = units === 'inch' ? s() : s({ units, speed: 120, od: 100, diameter: 40 });
    const d = M.solve(base).crossover;
    const at = M.solve({ ...base, diameter: d });
    near(at.rpm, 1000); near(at.surfaceSpeed, base.speed); assert.equal(at.clampActive, true);
    const above = M.solve({ ...base, diameter: d * 1.01 });
    assert.equal(above.clampActive, false); near(above.rpm, 1000 / 1.01);
    const below = M.solve({ ...base, diameter: d * .5 });
    assert.equal(below.clampActive, true); near(below.rpm, 1000); near(below.surfaceSpeed, base.speed * .5);
  }
  near(M.solve(s({ clamp: 300 })).rpm, 300);
  assert.equal(M.solve(s({ clamp: 300 })).clampActive, true);
});
test('centre is explicit, finite and zero in surface speed in both units', () => {
  for (const units of ['inch', 'metric']) {
    const r = M.solve(s({ units, diameter: 0 }));
    assert.equal(r.rpm, 1000); assert.equal(r.surfaceSpeed, 0);
    assert.equal(r.clampActive, true); assert.equal(r.unrestricted, null);
  }
});
test('below crossover speed falls linearly; above it speed stays at setpoint', () => {
  near(M.solve(s({ diameter: .5 })).surfaceSpeed, 130.89969389957471);
  for (const speed of [20, 120, 600]) for (const clamp of [100, 1000, 6000]) {
    const base = s({ speed, clamp });
    let previousRPM = 0, previousSpeed = Infinity;
    for (let i = 100; i >= 0; i--) {
      const r = M.solve({ ...base, diameter: base.od * i / 100 });
      assert.ok(r.rpm >= previousRPM - 1e-9 && r.rpm <= clamp);
      assert.ok(r.surfaceSpeed <= previousSpeed + 1e-9 && r.surfaceSpeed <= speed + 1e-9);
      previousRPM = r.rpm; previousSpeed = r.surfaceSpeed;
    }
  }
});
test('model rejects invalid input without mutating valid input', () => {
  for (const key of ['speed', 'clamp', 'od']) for (const value of [0, -1, NaN, Infinity])
    assert.throws(() => M.solve(s({ [key]: value })), RangeError);
  for (const diameter of [-1, 3, NaN, Infinity]) assert.throws(() => M.solve(s({ diameter })), RangeError);
  assert.throws(() => M.solve(s({ units: 'unknown' })), RangeError);
  const frozen = Object.freeze(s()); M.solve(frozen); assert.deepEqual(frozen, M.DEFAULT);
});
test('shared renderer draws crossover, current points and a bounded no-clamp comparison', () => {
  const regular = D.plot(s({ diameter: .5 }), 'rpm', false);
  assert.match(regular, /class="cs-limit"/); assert.match(regular, />D\*</);
  assert.match(regular, /cx="111" cy="68"/);
  assert.doesNotMatch(regular, /class="cs-unclamped"/);
  const compare = D.plot(s({ diameter: 0 }), 'rpm', true);
  assert.match(compare, /class="cs-unclamped"/); assert.doesNotMatch(compare, /NaN|Infinity/);
  assert.match(D.plot(s({ clamp: 100 }), 'rpm', true), /above chart/);
  assert.doesNotMatch(D.plot(s({ clamp: 100 }), 'rpm', true), />D\*</);
  assert.match(D.plot(s({ diameter: 0 }), 'speed'), /cx="48" cy="180"/);
  assert.match(D.endView(s({ diameter: 0 })), /M120 115/);
  assert.match(D.endView(s()), /M196 115/);
});
