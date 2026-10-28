'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');
const D = require('../render.js');
const near = (a,b) => assert.ok(Math.abs(a-b) < 1e-10, `${a} != ${b}`);

test('legacy states without efficiency retain every ideal result', () => {
  for (const mode of M.MODES) {
    const legacy = {...M.DEFAULT, mode}; delete legacy.efficiency;
    assert.deepEqual(M.solve(legacy), M.solve({...legacy, efficiency:100}));
    const r = M.solve(legacy);
    near(r.totalEfficiency, 1);
    near(r.deliveredTorque, r.outputTorque);
    near(r.deliveredPower, r.outputPower);
  }
});
test('losses multiply and reduce torque and power without altering motion or geometry', () => {
  for (const mode of M.MODES) for (const efficiency of [80,95,96,97,100]) for (const direction of [-1,1]) {
    const state = {...M.DEFAULT, mode, a:24, b:60, c:20, d:50, efficiency, direction};
    const ideal = M.solve({...state, efficiency:100}), real = M.solve(state);
    const eta = mode === 'pair' ? efficiency/100 : efficiency*efficiency/10000;
    near(real.totalEfficiency, eta);
    near(real.deliveredTorque, (mode === 'compound' ? 12.5 : 5)*eta);
    near(real.deliveredPower, 8*Math.PI*eta);
    near(real.deliveredPower, real.deliveredTorque*Math.abs(real.output.rpm)*Math.PI/30);
    assert.deepEqual(real.gears, ideal.gears);
    assert.deepEqual(M.rotations(real, 1.25), M.rotations(ideal, 1.25));
    near(M.advance(real, 1, 2), M.advance(ideal, 1, 2));
    assert.equal(D.train(state, .25), D.train({...state, efficiency:100}, .25));
  }
});
test('idler adds a specified mesh loss without adding a reduction stage', () => {
  const pair = M.solve({...M.DEFAULT, efficiency:96});
  for (const idler of [20,33,60]) {
    const r = M.solve({...M.DEFAULT, mode:'idler', idler, efficiency:96});
    assert.equal(r.stages.length, 1);
    assert.equal(r.meshes.length, 2);
    near(r.ratio, pair.ratio);
    near(r.output.rpm, -pair.output.rpm);
    near(r.deliveredTorque, pair.deliveredTorque*.96);
    near(r.totalEfficiency, .9216);
  }
});
test('speed-increasing trains, unloaded drives, and stops have explicit boundaries', () => {
  const fast = M.solve({...M.DEFAULT, a:60, b:20, efficiency:90});
  near(fast.output.rpm, -360); near(fast.deliveredTorque, .6);
  const zeroLoad = M.solve({...M.DEFAULT, torque:0, efficiency:90});
  near(zeroLoad.deliveredTorque, 0); near(zeroLoad.deliveredPower, 0);
  const stopped = M.solve({...M.DEFAULT, rpm:0, efficiency:90});
  assert.equal(stopped.deliveredTorque, null); // rotating efficiency cannot predict holding torque
  near(stopped.outputTorque, 4); near(stopped.deliveredPower, 0);
});
test('invalid efficiency is rejected at the model boundary', () => {
  for (const efficiency of [0,-1,101,NaN,Infinity,null,'96'])
    assert.throws(() => M.solve({...M.DEFAULT, efficiency}), RangeError);
});
