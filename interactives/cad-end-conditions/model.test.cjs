const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./model.js');
const R = require('./render.js');

const spec = (plateThickness, endType, blindDepth, goal = 'through-cut') => ({ plateThickness, endType, blindDepth, goal });

test('blind cut is clipped to the selected plate instead of removing imaginary material', () => {
  const result = M.solve(spec(10, 'blind', 12));
  assert.equal(result.ok, true);
  assert.deepEqual(result.result, { requestedDepth: 12, removedDepth: 10, floorThickness: 0, isOpen: true, goalMet: true });
});

test('thickening the plate exposes the fixed blind depth and retained floor', () => {
  const result = M.solve(spec(16, 'blind', 12));
  assert.deepEqual(result.result, { requestedDepth: 12, removedDepth: 12, floorThickness: 4, isOpen: false, goalMet: false });
});

test('through all follows both plate thicknesses', () => {
  for (const thickness of [10, 16, 37.5]) {
    const result = M.solve(spec(thickness, 'through-all', 12));
    assert.deepEqual(result.result, { requestedDepth: null, removedDepth: thickness, floorThickness: 0, isOpen: true, goalMet: true });
  }
});

test('exact blind equality is an open cut with zero floor', () => {
  const result = M.solve(spec(12, 'blind', 12));
  assert.equal(result.result.removedDepth, 12);
  assert.equal(result.result.floorThickness, 0);
  assert.equal(result.result.isOpen, true);
});

test('hundredth-millimeter arithmetic makes equality and a one-count floor exact', () => {
  const noisyEquality = M.solve(spec(.1 + .2, 'blind', .3));
  assert.equal(noisyEquality.parameters.plateThickness, .3);
  assert.equal(noisyEquality.result.floorThickness, 0);
  assert.equal(noisyEquality.result.isOpen, true);
  assert.equal(noisyEquality.result.goalMet, true);
  const oneCount = M.solve(spec(10, 'blind', 9.99));
  assert.equal(oneCount.result.floorThickness, .01);
  assert.equal(oneCount.result.isOpen, false);
  assert.equal(M.formatMm(oneCount.result.floorThickness), '.01 mm'.replace(/^\./, '0.'));
});

test('a retained-pocket goal reverses the assessment without changing geometry', () => {
  const pocket = M.solve(spec(16, 'blind', 12, 'retained-pocket'));
  const through = M.solve(spec(16, 'through-all', 12, 'retained-pocket'));
  assert.equal(pocket.result.goalMet, true);
  assert.equal(through.result.goalMet, false);
  assert.equal(pocket.result.floorThickness, 4);
  assert.equal(through.result.floorThickness, 0);
});

test('invalid domains and undeclared inputs are rejected', () => {
  for (const bad of [0, -1, .001, 1.001, Infinity, NaN, 1000.01]) assert.equal(M.solve(spec(bad, 'blind', 12)).ok, false);
  for (const bad of [0, -1, .001, 1.001, Infinity, NaN, 1000.01]) assert.equal(M.solve(spec(10, 'blind', bad)).ok, false);
  assert.equal(M.solve(spec(.01, 'blind', .01)).ok, true);
  assert.equal(M.solve(spec(12.34, 'blind', 5.67)).ok, true);
  assert.equal(M.solve(spec(10, 'up-to-face', 12)).ok, false);
  assert.equal(M.solve(spec(10, 'blind', 12, 'strong-floor')).ok, false);
  assert.equal(M.solve({ ...spec(10, 'blind', 12), extra: true }).ok, false);
});

test('accepted input is copied and frozen', () => {
  const input = spec(10, 'blind', 12);
  const accepted = M.solve(input);
  input.plateThickness = 99;
  assert.equal(accepted.parameters.plateThickness, 10);
  assert.equal(Object.isFrozen(accepted), true);
  assert.equal(Object.isFrozen(accepted.parameters), true);
  assert.equal(Object.isFrozen(accepted.result), true);
});

test('a rejected update keeps the exact accepted state and never mutates it', () => {
  const state = M.initial();
  const rejected = M.update(state, { plateThickness: 0 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.state, state);
  assert.equal(state.parameters.plateThickness, 10);
  assert.equal(state.result.removedDepth, 10);
  assert.equal(M.update(state, { unknown: 2 }).state, state);
});

test('update rejects forged shallow and deep frozen objects that resemble accepted state', () => {
  const real = M.initial();
  const shallow = Object.freeze({ ok: true, parameters: real.parameters, result: real.result });
  assert.equal(M.update(shallow, { plateThickness: 16 }).ok, false);
  const copied = Object.freeze({
    ok: true,
    parameters: Object.freeze({ ...real.parameters }),
    result: Object.freeze({ ...real.result })
  });
  const rejected = M.update(copied, { plateThickness: 16 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.state, copied);
});

test('valid updates derive a new frozen state and leave the prior state unchanged', () => {
  const before = M.initial();
  const after = M.update(before, { plateThickness: 16 });
  assert.equal(after.ok, true);
  assert.notEqual(after, before);
  assert.equal(before.parameters.plateThickness, 10);
  assert.equal(before.result.floorThickness, 0);
  assert.equal(after.result.floorThickness, 4);
  assert.equal(Object.isFrozen(after), true);
});

test('formatting stays compact and explicit in millimeters', () => {
  assert.equal(M.formatMm(4), '4 mm');
  assert.equal(M.formatMm(12.5), '12.5 mm');
  assert.equal(M.formatMm(0.125), '0.13 mm');
  assert.equal(M.formatMm(NaN), '');
});

test('open rendering uses two side bodies and no lower stroke across the opening', () => {
  const drawing = R.svg(M.solve(spec(10, 'blind', 12)));
  const material = /class="cec-material" d="([^"]+)"/.exec(drawing)[1];
  const cut = /class="cec-cut" d="([^"]+)"/.exec(drawing)[1];
  assert.match(material, /Z M315 /, 'open plate is two separate material paths');
  assert.doesNotMatch(material, /H315V/, 'material does not bridge the opening');
  assert.doesNotMatch(cut, /V[^ ]+H205Z/, 'cut outline has no lower closing stroke');
  const pocket = R.svg(M.solve(spec(16, 'blind', 12, 'retained-pocket')));
  assert.match(pocket, /class="cec-material" d="[^"]*H205V[^H]+H315V/, 'retained floor stays continuous material');
});
