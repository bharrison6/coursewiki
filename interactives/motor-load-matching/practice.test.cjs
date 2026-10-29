'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const motor = require('../dc-motor-curve/model.js');
const gears = require('../gear-ratios/model.js');
const model = require('./model.js').create(motor, gears);
const source = fs.readFileSync(path.resolve(__dirname, '../../practice/motor-load-matching.html'), 'utf8');

function item(id) {
  const start = source.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `${id} exists`);
  const end = source.indexOf('</div>', start);
  const block = source.slice(start, end);
  const attr = name => {
    const match = block.match(new RegExp(`${name}="([^"]+)"`));
    assert.ok(match, `${id} has ${name}`);
    return match[1];
  };
  return { answer: Number(attr('data-answer')), tolerance: Number(attr('data-tolerance')) };
}
function accepts(problem, value) { return Math.abs(value - problem.answer) <= problem.tolerance; }

test('five original matching problems have expected answers and discriminating tolerances', () => {
  assert.equal((source.match(/data-practice-id="motor-match-/g) || []).length, 5);
  const r = model.compare({ stallTorque: 0.8, noLoadSpeed: 120, outputLoadTorque: 0.6,
    driverTeeth: 20, drivenTeeth: 40, efficiency: 90 });
  const reflected = item('motor-match-reflected-torque');
  assert.ok(accepts(reflected, Number(r.geared.requiredMotorTorque.toPrecision(4))));
  assert.equal(accepts(reflected, 0.3), false, 'ignoring mesh loss is rejected');
  const speed = item('motor-match-output-speed');
  assert.ok(accepts(speed, Number(r.geared.outputSpeed.toPrecision(4))));
  assert.equal(accepts(speed, r.geared.motorSpeed), false, 'motor speed is rejected as output speed');
  const power = item('motor-match-output-power');
  assert.ok(accepts(power, Number(r.geared.outputPower.toPrecision(4))));
  assert.ok(accepts(power, (1 / 3) * 70 * 2 * 3.14 / 60 * 0.9), 'pi = 3.14 route is accepted');
  assert.equal(accepts(power, (1 / 3) * 70), false, 'torque times rpm is rejected');
  const explanation = item('motor-match-power-explanation');
  assert.ok(accepts(explanation, 3));
  assert.equal(accepts(explanation, 1), false);
  const overload = model.compare({ ...r.input, outputLoadTorque: 0.9 });
  const overloadProblem = item('motor-match-direct-overload');
  assert.equal(overload.direct.state, 'overload');
  assert.ok(accepts(overloadProblem, Number(overload.geared.outputSpeed.toPrecision(4))));
  assert.equal(accepts(overloadProblem, overload.geared.motorSpeed), false);
});
