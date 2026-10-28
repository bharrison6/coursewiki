const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { calculate, convertInputs } = require('./model.js');
const base = { pitch: 2, starts: 3, rpm: 300, torque: 1.2, efficiency: 40, units: 'mm' };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('lead, speed, force and mechanical power agree in SI', () => {
  const r = calculate(base);
  assert.equal(r.lead, 6);
  assert.equal(r.speedMinute, 1800);
  assert.equal(r.speedSecond, 30);
  near(r.theoreticalForce, 1256.6370614359173);
  near(r.actualForce, 502.65482457436696);
  near(r.actualForce * r.speedSecond / 1000, .4 * 1.2 * 2 * Math.PI * 300 / 60);
});
test('starts and efficiency affect different outputs', () => {
  const triple = calculate(base), single = calculate({ ...base, starts: 1 });
  near(triple.speedSecond, single.speedSecond * 3);
  near(triple.actualForce, single.actualForce / 3);
  const low = calculate({ ...base, efficiency: 20 });
  assert.equal(low.speedSecond, triple.speedSecond);
  near(low.actualForce, triple.actualForce / 2);
});
test('unit toggle preserves physical pitch, torque, speed and force', () => {
  const converted = convertInputs(base.pitch, base.torque, 'mm', 'in');
  const inch = calculate({ ...base, ...converted, units: 'in' });
  const metric = calculate(base);
  near(inch.lead * 25.4, metric.lead);
  near(inch.speedSecond * 25.4, metric.speedSecond);
  near(inch.actualForce * 4.4482216152605, metric.actualForce);
  const roundtrip = convertInputs(converted.pitch, converted.torque, 'in', 'mm');
  near(roundtrip.pitch, base.pitch); near(roundtrip.torque, base.torque);
  const actuator = calculate({ pitch: .2, starts: 1, rpm: 900, torque: 12, efficiency: 60, units: 'in' });
  near(actuator.actualForce, 226.1946710584651); assert.equal(actuator.speedMinute, 180);
});
test('invalid, blank-equivalent and overflow inputs fail rather than return misleading results', () => {
  for (const change of [{ pitch: 0 }, { pitch: -1 }, { pitch: NaN }, { starts: 0 }, { starts: 1.5 }, { starts: 13 }, { efficiency: 0 }, { efficiency: 101 }, { rpm: -1 }, { torque: -1 }, { rpm: Infinity }, { units: 'ft' }, { pitch: 1e308, starts: 12 }]) {
    assert.throws(() => calculate({ ...base, ...change }), RangeError);
  }
  assert.equal(calculate({ ...base, rpm: 0 }).speedSecond, 0);
  assert.equal(calculate({ ...base, torque: 0 }).actualForce, 0);
  near(calculate({ ...base, efficiency: 100 }).actualForce, calculate(base).theoreticalForce);
});

const bank = fs.readFileSync(path.join(__dirname, '../../practice/screw-threads-and-lead-screws.html'), 'utf8');
const keys = new Map([...bank.matchAll(/data-practice-id="([^"]+)"[^>]*data-answer="([^"]+)" data-tolerance="([^"]+)"/g)].map(m => [m[1], { answer: +m[2], tolerance: +m[3] }]));
for (const [attempt, accepted] of [[10.18, true], [10.17, true], [10.1736, true], [1.62, false], [0.01017876, false]]) {
  test(`item 5: ${attempt} kN must ${accepted ? 'pass' : 'fail'}`, () => {
    const key = keys.get('screw-vise-force');
    assert.equal(Math.abs(attempt - key.answer) <= key.tolerance, accepted);
  });
}
// Independent arithmetic from each stated problem, rather than answers copied from the model.
const checked = [
  ['screw-triple-lead', 1.5 * 3, 4.5, [1.5]],
  ['screw-acme-speed', 900 * .2, 180, [900 * .2 * .6]],
  ['screw-acme-force', .6 * 2 * Math.PI * 12 / .2, 226, [.6 * 12 / .2, 2 * Math.PI * 12 / .2]],
  ['screw-vise-torque', 120 * .18, 21.6, [120 * .09, 120 * 180]],
  ['screw-vise-force', .3 * 2 * Math.PI * 21.6 / .004 / 1000, 10.18, [.3 * 2 * Math.PI * 21.6 / 4 / 1000]],
  ['screw-vise-speed', 24 * 4 / 60, 1.6, [24 * 4]],
  ['screw-cnc-speed', 480 * (1.5 * 3) / 60, 36, [480 * 1.5 / 60, 36 * .55, 480 * 4.5]],
  ['screw-cnc-force', .55 * 2 * Math.PI * .75 / .0045, 576, [.55 * 2 * Math.PI * .75 / .0015, .55 * .75 / .0045]],
  ['screw-required-torque', 800 * .005 / (2 * Math.PI * .5), 1.27, [800 * .0025 / (2 * Math.PI * .5), 800 * .005 / .5, 800 * .005 * .5 / (2 * Math.PI)]],
  ['screw-unc-pitch', 1 / 20, .05, [.25, 20]],
  ['screw-unf-pitch', 1 / 28, .0357, [.25, 28, .05]],
  ['screw-metric-pitch', 1, 1, [6]],
  ['screw-buttress-choice', 4, 4, [1, 2, 3]],
  ['screw-acme-choice', 3, 3, [1, 2, 4]]
];
test('practice parser has positive and negative controls and exactly 14 items', () => {
  assert.equal(keys.size, 14); assert.ok(keys.has('screw-cnc-speed')); assert.ok(!keys.has('synthetic-missing-item'));
});
for (const [id, exact, printed, wrongMethods] of checked) {
  test(`${id}: exact and printed answers accepted; wrong methods rejected`, () => {
    const key = keys.get(id); assert.ok(key);
    assert.ok(Math.abs(key.answer - exact) < 1e-6, 'answer key independently recomputed');
    assert.ok(Math.abs(key.answer - printed) <= key.tolerance, 'printed rounding accepted');
    for (const wrong of wrongMethods) assert.ok(Math.abs(key.answer - wrong) > key.tolerance, `${wrong} must fail ±${key.tolerance}`);
  });
}
