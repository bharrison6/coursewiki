'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('./model.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`);
function geometry(a, b) { a.forEach((v, i) => near(v, b[i])); }
test('every subset of the four base conditions has the expected rank for either origin choice', () => {
  for (const anchor of ['corner', 'center']) for (let mask = 0; mask < 16; mask++) {
    const s = { ...M.defaults(), anchor };
    ['widthOn', 'heightOn', 'anchorX', 'anchorY'].forEach((k, i) => s[k] = Boolean(mask & 1 << i));
    const result = M.evaluate(s, M.initial(anchor));
    assert.ok(result.ok); assert.equal(result.rank, mask.toString(2).replace(/0/g, '').length);
    assert.equal(result.dof, 4 - result.rank);
    for (const r of M.constraints(s)) near(r.a.reduce((sum, v, i) => sum + v * result.geometry[i], 0), r.b);
  }
});
test('growth changes the solution while both origin choices remain at zero DOF', () => {
  for (const [anchor, expected] of [['corner', [0, 80, 0, 22]], ['center', [-40, 40, -11, 11]]]) {
    const result = M.evaluate({ ...M.defaults(), anchor, width: 80 }, M.initial(anchor));
    assert.equal(result.dof, 0); geometry(result.geometry, expected);
  }
});
test('driving height edits respect corner and center anchoring', () => {
  geometry(M.evaluate({ ...M.defaults(), height: 40 }, M.initial()).geometry, [0, 64, 0, 40]);
  geometry(M.evaluate({ ...M.defaults(), anchor: 'center', height: 40 }, M.initial('center')).geometry, [-32, 32, -20, 20]);
});
test('a reference measurement removes no freedom and follows dragged size', () => {
  const s = { ...M.defaults(), widthOn: false, extra: 'reference' };
  assert.equal(M.evaluate(s, M.initial()).dof, 1);
  const result = M.move(s, M.initial(), [1, 3], [80, 22]);
  assert.equal(result.dof, 1); near(M.measurements(result.geometry).width, 80);
});
test('agreeing duplicate adds one equation and no rank, even under row reordering', () => {
  const s = { ...M.defaults(), extra: 'driving', extraWidth: 64 };
  for (const rows of [M.constraints(s), M.constraints(s).reverse()]) {
    const result = M.solve(rows, M.initial());
    assert.ok(result.ok); assert.equal(result.count, 5); assert.equal(result.rank, 4); assert.equal(result.redundant, 1); assert.equal(result.dof, 0);
  }
});
test('a top driving width becomes independent if the original width is removed', () => {
  const result = M.evaluate({ ...M.defaults(), widthOn: false, extra: 'driving', extraWidth: 74 }, M.initial());
  assert.ok(result.ok); assert.equal(result.rank, 4); geometry(result.geometry, [0, 74, 0, 22]);
});
test('a contradiction reports no feasible DOF and preserves the exact last valid drawing', () => {
  const last = [0, 80, 0, 22], s = { ...M.defaults(), width: 80, extra: 'driving', extraWidth: 90 };
  const result = M.evaluate(s, last);
  assert.equal(result.ok, false); assert.equal(result.reason, 'contradiction'); assert.equal(result.dof, null); assert.deepEqual(result.geometry, last);
  assert.deepEqual(M.move(s, last, [1, 3], [90, 30]).geometry, last);
});
test('invalid/nonpositive and out-of-range dimensions leave the drawing intact', () => {
  for (const key of ['width', 'height', 'extraWidth']) for (const value of [0, -1, NaN, Infinity, 121, '', null]) {
    const last = M.initial(), result = M.evaluate({ ...M.defaults(), extra: key === 'extraWidth' ? 'driving' : 'none', [key]: value }, last);
    assert.equal(result.ok, false); assert.equal(result.reason, 'input'); assert.deepEqual(result.geometry, last);
  }
});
test('inactive dimensions do not gate solving; reactivated invalid values do', () => {
  const s = { ...M.defaults(), widthOn: false, width: NaN, heightOn: false, height: 0, extraWidth: NaN };
  assert.equal(M.evaluate(s, M.initial()).ok, true);
  assert.equal(M.evaluate({ ...s, widthOn: true }, M.initial()).ok, false);
  assert.equal(M.evaluate({ ...s, extra: 'driving' }, M.initial()).ok, false);
});
test('a diagnostic probe starts from the current feasible parameter solution', () => {
  const result = M.move({ ...M.defaults(), width: 80 }, M.initial(), [1], [90]);
  assert.equal(result.ok, true); geometry(result.geometry, [0, 80, 0, 22]);
  for (const r of M.constraints({ ...M.defaults(), width: 80 })) near(r.a.reduce((sum, v, i) => sum + v * result.geometry[i], 0), r.b);
});
test('fully defined corners cannot be dragged', () => {
  for (const anchor of ['corner', 'center']) {
    const s = { ...M.defaults(), anchor }, g = M.initial(anchor);
    const result = M.move(s, g, [1, 3], [g[1] + 10, g[3] + 10]);
    assert.equal(result.moved, false); geometry(result.geometry, g);
  }
});
test('removing horizontal anchor permits translation with fixed width and height', () => {
  const s = { ...M.defaults(), anchorX: false };
  const result = M.move(s, M.initial(), [1, 3], [74, 30]);
  assert.equal(result.dof, 1); geometry(result.geometry, [10, 74, 0, 22]);
});
test('removing width permits corner growth or symmetric growth, not translation', () => {
  geometry(M.move({ ...M.defaults(), widthOn: false }, M.initial(), [1, 3], [80, 22]).geometry, [0, 80, 0, 22]);
  geometry(M.move({ ...M.defaults(), anchor: 'center', widthOn: false }, M.initial('center'), [1, 3], [40, 11]).geometry, [-40, 40, -11, 11]);
});
test('diagnostic motion respects positive sizes and any independent equations', () => {
  const s = { ...M.defaults(), widthOn: false, heightOn: false };
  const last = M.initial(); assert.deepEqual(M.move(s, last, [1, 3], [-20, -20]).geometry, last);
  for (let x = 1; x <= 120; x += 7) {
    const result = M.move(s, last, [1, 3], [x, 50]);
    geometry(result.geometry, [0, x, 0, 50]); assert.equal(result.dof, 2);
  }
});
