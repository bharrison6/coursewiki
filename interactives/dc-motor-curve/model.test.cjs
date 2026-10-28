const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { operatingPoint: point } = require('./model.js');
const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);

test('endpoints, a loaded point, and overload have distinct meanings', () => {
  const free = point(.8, 3000, 0);
  assert.equal(free.speed, 3000); assert.equal(free.power, 0);
  const load = point(.8, 3000, .2);
  assert.equal(load.speed, 2250); close(load.omega, 75 * Math.PI); close(load.power, 15 * Math.PI);
  const stall = point(.8, 3000, .8);
  assert.equal(stall.state, 'stall'); assert.equal(stall.speed, 0); assert.equal(stall.power, 0);
  const overload = point(.8, 3000, .81);
  assert.equal(overload.state, 'overload'); assert.equal(overload.speed, null); assert.equal(overload.power, null);
});

test('sampled power is bounded by the analytically derived maximum', () => {
  for (const [stall, speed] of [[.8, 3000], [1.2, 3600], [.001, 1], [1000, 100000]]) {
    const peak = point(stall, speed, stall / 2);
    close(peak.power, peak.peakPower, 1e-6);
    assert.equal(peak.speed, speed / 2);
    for (let i = 0; i <= 100; i++) {
      const a = point(stall, speed, stall * i / 100);
      assert.ok(a.power <= peak.power + 1e-6);
      close(a.power, point(stall, speed, stall * (1 - i / 100)).power, 1e-6);
    }
  }
});

test('invalid domains are rejected', () => {
  for (const args of [[0,3000,0], [-1,3000,0], [1,0,0], [1,3000,-1], [NaN,1,0], [1,Infinity,0], [1,1,NaN], [Number.MAX_VALUE,Number.MAX_VALUE,0]]) {
    assert.throws(() => point(...args), RangeError);
  }
});

const bank = fs.readFileSync(path.join(__dirname, '../../practice/electric-motors.html'), 'utf8');
function answer(id) {
  const root = bank.match(new RegExp(`<div[^>]+id="${id}"[^>]*>`));
  assert.ok(root, `missing practice item ${id}`);
  return { value: Number(root[0].match(/data-answer="([^"]+)"/)[1]), tolerance: Number(root[0].match(/data-tolerance="([^"]+)"/)[1]) };
}
function accepts(key, value) { return Math.abs(key.value - value) <= key.tolerance; }
test('practice keys accept printed and four-significant-figure intermediate answers', () => {
  const examples = [
    ['motor-load-speed', 2250, 2250],
    ['motor-load-power', 47.12, .2 * 235.6],
    ['motor-peak-speed', 1800, 1800],
    ['motor-peak-power', 113.1, .6 * 188.5]
  ];
  for (const [id, printed, rounded] of examples) {
    const key = answer(id);
    assert.ok(accepts(key, printed)); assert.ok(accepts(key, rounded));
  }
  close(answer('motor-load-power').value, .2 * (2250 / 60) * 2 * Math.PI);
  close(answer('motor-peak-power').value, .6 * (1800 / 60) * 2 * Math.PI);
});
test('power tolerances accept pi = 3.14 and reject the previous narrow windows', () => {
  for (const [id, torque, rpm, rounded, oldTolerance] of [
    ['motor-load-power', .2, 2250, 47.10, .02],
    ['motor-peak-power', .6, 1800, 113.04, .05]
  ]) {
    const key = answer(id);
    const approximate = torque * rpm * 2 * 3.14 / 60;
    assert.ok(accepts(key, approximate));
    assert.ok(accepts(key, rounded));
    // Regression control: both answers failed with the former tolerances.
    assert.equal(accepts({ ...key, tolerance: oldTolerance }, rounded), false);
  }
});
test('wrong methods and wrong choices fail the actual bank tolerances', () => {
  for (const [id, wrong] of [
    ['motor-load-speed',750], ['motor-load-power',450], ['motor-load-power',.8 * 3000 * Math.PI / 30],
    ['motor-peak-speed',3600], ['motor-peak-power',1080], ['motor-peak-power',452.4], ['motor-peak-power',1.2 * 3600 * Math.PI / 30], ['motor-peak-power',0]
  ]) assert.equal(accepts(answer(id), wrong), false);
  for (const [id, correct] of [['motor-open-loop-hold',2],['motor-no-brushes',3],['motor-simple-dc',1],['motor-feedback',2]]) {
    for (let choice = 1; choice <= 3; choice++) assert.equal(accepts(answer(id),choice),choice === correct);
  }
  // Positive control: deliberately corrupting the key must reject the correct answer.
  assert.equal(accepts({ value: 450, tolerance: .02 }, 47.12), false);
});
