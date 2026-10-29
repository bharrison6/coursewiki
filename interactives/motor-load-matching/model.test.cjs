'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const motor = require('../dc-motor-curve/model.js');
const gears = require('../gear-ratios/model.js');
const model = require('./model.js').create(motor, gears);

const baseline = Object.freeze({ stallTorque: 0.8, noLoadSpeed: 120, outputLoadTorque: 0.6,
  driverTeeth: 20, drivenTeeth: 40, efficiency: 90 });
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} should be within ${tolerance} of ${expected}`);

test('same output load compares direct drive with a lossy 2:1 reduction', () => {
  const r = model.compare(baseline);
  assert.equal(r.reduction, 2);
  close(r.meshEfficiency, 0.9);
  assert.equal(r.direct.state, 'running');
  close(r.direct.outputSpeed, 30);
  close(r.direct.outputPower, 0.6 * Math.PI);
  assert.equal(r.geared.state, 'running');
  close(r.geared.requiredMotorTorque, 1 / 3);
  close(r.geared.motorSpeed, 70);
  close(r.geared.outputSpeed, 35);
  close(r.geared.outputTorque, 0.6);
  close(r.geared.motorShaftPower, 7 * Math.PI / 9);
  close(r.geared.outputPower, 0.7 * Math.PI);
  assert.equal(r.faster, 'geared');
});

test('overload is reported without forcing an impossible gear operating point', () => {
  const directOverload = model.compare({ ...baseline, outputLoadTorque: 0.9 });
  assert.equal(directOverload.direct.state, 'overload');
  assert.equal(directOverload.direct.outputSpeed, null);
  assert.equal(directOverload.geared.state, 'running');
  const bothOverload = model.compare({ ...baseline, outputLoadTorque: 2 });
  assert.equal(bothOverload.direct.state, 'overload');
  assert.equal(bothOverload.geared.state, 'overload');
  assert.equal(bothOverload.geared.outputPower, null);
  assert.equal(bothOverload.faster, 'neither');
});

test('stall and zero external load keep zero output power distinct', () => {
  const directStall = model.compare({ ...baseline, outputLoadTorque: 0.8 });
  assert.equal(directStall.direct.state, 'stall');
  assert.equal(directStall.direct.outputSpeed, 0);
  assert.equal(directStall.direct.outputPower, 0);
  const unloaded = model.compare({ ...baseline, outputLoadTorque: 0 });
  assert.equal(unloaded.direct.state, 'running');
  close(unloaded.direct.outputSpeed, 120);
  assert.equal(unloaded.direct.outputPower, 0);
  close(unloaded.geared.outputSpeed, 60);
  assert.equal(unloaded.geared.outputPower, 0);
});

test('the canonical gear loss changes reflected torque and output power', () => {
  const ideal = model.compare({ ...baseline, efficiency: 100 });
  const lossy = model.compare(baseline);
  close(ideal.geared.requiredMotorTorque, 0.3);
  assert.ok(lossy.geared.requiredMotorTorque > ideal.geared.requiredMotorTorque);
  assert.ok(lossy.geared.outputSpeed < ideal.geared.outputSpeed);
  close(lossy.geared.outputPower, lossy.geared.motorShaftPower * 0.9);
});

test('a valid 59:60 near-one reduction remains distinct from direct drive', () => {
  const r = model.compare({ ...baseline, driverTeeth: 59, drivenTeeth: 60 });
  close(r.reduction, 60 / 59);
  assert.equal(r.direct.state, 'running');
  assert.equal(r.geared.state, 'running');
  assert.equal(r.faster, 'direct');
  assert.ok(r.geared.outputSpeed < r.direct.outputSpeed);
});

test('input bounds protect both canonical dependency domains', () => {
  for (const changes of [
    { stallTorque: 0 }, { stallTorque: 11 }, { noLoadSpeed: 0 }, { noLoadSpeed: 241 },
    { outputLoadTorque: -1 }, { outputLoadTorque: 11 }, { driverTeeth: 19 },
    { driverTeeth: 20.5 }, { driverTeeth: 60 }, { drivenTeeth: 20 }, { drivenTeeth: 61 },
    { driverTeeth: 40, drivenTeeth: 20 }, { driverTeeth: 40, drivenTeeth: 40 },
    { efficiency: 0 }, { efficiency: 101 }
  ]) assert.throws(() => model.compare({ ...baseline, ...changes }), RangeError);
});
