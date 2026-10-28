const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');
test('counterbore callout associates each size and depth with its feature', () => {
  const r = model.calculate({});
  assert.deepEqual(r.lines, ['2X ⌀.300 THRU', '⌴ ⌀.600 ↧ .150']);
  assert.equal(r.recessDepth, .15);
  assert.match(r.reading, /2 holes, each .300 in diameter/);
});
test('through condition does not inherit unused depth or recess inputs', () => {
  const r = model.calculate({ type: 'through', count: 1, depth: '', recess: '' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines, ['⌀.300 THRU']);
});
test('blind depth measures full diameter and includes room for the illustrative point', () => {
  const r = model.calculate({ type: 'blind', depth: .4 });
  assert.match(r.lines[0], /↧ .400$/);
  assert.ok(r.pointDepth > .09 && r.pointDepth < .091);
  assert.equal(model.calculate({ type: 'blind', depth: .75 }).ok, false);
});
test('countersink geometry uses half the included angle and radial difference', () => {
  const ninety = model.calculate({ type: 'countersink' });
  assert.ok(Math.abs(ninety.recessDepth - .15) < 1e-12);
  const sixty = model.calculate({ type: 'countersink', diameter: .2, recess: .6, angle: 60 });
  assert.ok(Math.abs(sixty.recessDepth - .2 * Math.sqrt(3)) < 1e-12);
  assert.ok(sixty.recessDepth > ninety.recessDepth);
  assert.equal(model.calculate({ type: 'countersink', angle: 30, recess: 1, thickness: .5 }).ok, false);
});
test('spotface uses a stated depth and an unambiguous written note', () => {
  assert.deepEqual(model.calculate({ type: 'spotface' }).lines, ['2X ⌀.300 THRU', 'SPOTFACE ⌀.600 ↧ .150']);
});
test('reject invalid, empty, nonfinite and unrepresentable input without a sketch', () => {
  for (const p of [{type:'invalid'}, {diameter:''}, {diameter:NaN}, {diameter:Infinity},
    {diameter:0}, {diameter:.3004}, {count:2.5}, {count:13}, {recess:.3}, {depth:.8}, {type:'countersink',angle:0}]) {
    const r = model.calculate(p); assert.equal(r.ok, false, JSON.stringify(p)); assert.equal(model.sketch(r), '');
  }
});
test('all hole types draw finite sections and calculations remain independent', () => {
  const baseline = model.calculate({});
  for (const type of ['through','blind','counterbore','countersink','spotface']) {
    const r = model.calculate({type});
    assert.equal(r.ok,true); assert.match(model.sketch(r), /SECTION THROUGH ONE HOLE/);
    assert.doesNotMatch(model.sketch(r), /NaN|Infinity|undefined/);
  }
  model.calculate({diameter:.9,recess:1.2});
  assert.deepEqual(model.calculate({}), baseline);
});
