'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('./model.js');
test('all four joint conditions preserve the intended coordinates and all three goals', () => {
  for (const seat of [false, true]) for (const lock of [false, true]) {
    const s = M.conditions(M.defaults(), seat, lock).state;
    assert.equal(M.valid(s), true); assert.equal(s.z, seat ? 0 : 12); assert.equal(s.angle, lock ? 0 : 35);
    assert.deepEqual(M.freedoms(s), { slide: !seat, spin: !lock, dof: +!seat + +!lock });
    for (const goal of Object.keys(M.goals)) assert.equal(M.assess(s, goal).matches, seat === M.goals[goal].seat && lock === M.goals[goal].lock);
    for (const z of [-30, -12.5, 0, 24.2, 30]) {
      const r = M.move(s, 'z', z); assert.equal(r.ok, true); assert.equal(r.state.z, seat ? 0 : z); assert.equal(r.state.angle, s.angle); assert.equal(r.blocked, seat);
      for (const angle of [-1080, -361, -1, 0, 35, 360, 721.5]) {
        const t = M.move(r.state, 'angle', angle); assert.equal(t.ok, true); assert.equal(M.valid(t.state), true);
        assert.equal(t.state.angle, lock ? 0 : M.wrap(angle)); assert.equal(t.state.z, r.state.z); assert.equal(t.blocked, lock);
      }
    }
  }
});
test('conditions enforce datums instead of freezing arbitrary placements; recovery restores motion', () => {
  let s = M.move(M.defaults(), 'angle', 211).state; s = M.move(s, 'z', -23).state;
  s = M.conditions(s, true, true).state; assert.deepEqual(s, { seat: true, lock: true, z: 0, angle: 0 });
  assert.equal(M.assess(s, 'hinge').matches, false); assert.match(M.assess(s, 'hinge').message, /restore spin/);
  s = M.conditions(s, true, false).state; assert.equal(M.assess(s, 'hinge').matches, true);
  assert.equal(M.move(s, 'angle', 25).state.angle, 25); assert.equal(M.move(s, 'z', 10).state.z, 0);
  s = M.conditions(s, false, true).state; assert.equal(M.assess(s, 'slider').matches, true);
  assert.equal(M.move(s, 'z', -10).state.z, -10); assert.equal(M.move(s, 'angle', 25).state.angle, 0);
});
test('finite/range validation leaves last valid placement; invalid conditions/states do not propagate', () => {
  const s = M.defaults();
  for (const coordinate of ['z', 'angle']) for (const value of [NaN, Infinity, -Infinity, '', null, '15', undefined]) {
    const r = M.move(s, coordinate, value); assert.equal(r.ok, false); assert.equal(r.state, s);
  }
  for (const z of [-30.01, 30.01, 1e300]) assert.equal(M.move(s, 'z', z).ok, false);
  assert.equal(M.move(s, 'angle', Number.MAX_VALUE).ok, true);
  for (const bad of [null, {}, {...s, seat: true}, {...s, lock: true}, {...s, angle: 360}]) {
    assert.equal(M.valid(bad) || false, false); assert.equal(M.move(bad, 'z', 0).ok, false); assert.equal(M.conditions(bad, true, true).ok, false);
  }
  assert.equal(M.conditions(s, 'true', false).ok, false); assert.equal(M.move(s, 'x', 5).ok, false);
  assert.equal(M.assess(s, 'missing').ok, false); assert.equal(M.assess(s, '__proto__').ok, false);
  assert.equal(M.move(s, 'z', 20).state.z, 20); assert.deepEqual(s, M.defaults());
});
test('normalization preserves small positive and near-turn angles without needless addition', () => {
  for (const angle of [1e-20, 0.001, 359.999]) assert.equal(M.wrap(angle), angle);
  assert.equal(M.wrap(-0.001), 359.999);
  assert.equal(M.valid(M.move(M.defaults(), 'angle', -1e-20).state), true);
  assert.equal(M.move(M.defaults(), 'z', -0.001).state.z, -0.001);
});
