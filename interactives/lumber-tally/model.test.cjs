const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('./model.js');
const sale = { thickness: '4/4', width: 7, length: 9 };
const actual = { thickness: '3/4', width: 7, length: 9 };
const base = { quantity: 1, sale, actual, same: false, units: 'ft' };
test('page example keeps tally and physical volume separate without rounding', () => {
  assert.deepEqual(m.row(base), { quantity: 1, tallyEach: 5.25, physicalEach: 3.9375, tally: 5.25, physical: 3.9375 });
  assert.equal(m.row(base).physical.toFixed(2), '3.94');
});
test('all-inch form agrees with mixed units for both bases', () => {
  assert.deepEqual(m.row({ ...base, units: 'in', sale: { ...sale, length: 108 }, actual: { ...actual, length: 108 } }), m.row(base));
});
test('multiple boards and rows sum unrounded volumes, with cost on the tally', () => {
  const sum = m.total([m.row({ ...base, quantity: 3 }), m.row({ ...base, quantity: 2, same: true, sale: { thickness: '8/4', width: 6, length: 8 } })]);
  assert.deepEqual(sum, { tally: 31.75, physical: 27.8125 });
  assert.equal(m.cost(sum.tally, '2.37'), 75.2475);
  assert.equal(m.cost(sum.tally, 0), 0);
});
test('20 percent material loss needs 1.25 times the needed volume', () => {
  assert.equal(m.allowance(10, 20), 12.5);
  assert.equal(m.allowance(10, 0), 10);
  assert.equal(m.allowance(0, 20), 0);
  assert.notEqual(m.allowance(10, 20), 10 * 1.2);
});
test('wrong divisors and mixing bases cannot match the independent answers', () => {
  assert.notEqual(m.row(base).tally, 1 * 7 * 9);
  assert.notEqual(m.row(base).tally, 1 * 7 * 9 / 144);
  const r = m.row({ ...base, actual: { thickness: .75, width: 6, length: 8 } });
  assert.equal(r.tally, 5.25); assert.equal(r.physical, 3);
  for (const mixed of [.75 * 7 * 9 / 12, 1 * 6 * 8 / 12]) {
    assert.notEqual(r.tally, mixed); assert.notEqual(r.physical, mixed);
  }
});
test('same dimensions requires explicit selection; missing actual data is not substituted', () => {
  assert.throws(() => m.row({ ...base, actual: undefined }), RangeError);
  assert.throws(() => m.row({ ...base, same: undefined }), RangeError);
  assert.equal(m.row({ ...base, same: true, actual: undefined }).physical, 5.25);
});
test('decimal, fractional and quarter-thickness entries', () => {
  for (const [s, n] of [['3/4', .75], ['4/4', 1], ['8/4', 2], ['1-1/2', 1.5], ['1 1/2', 1.5], [' .75 ', .75]]) assert.equal(m.number(s), n);
});
test('blank, negative, malformed, nonfinite and out-of-range entries are rejected', () => {
  for (const s of ['', ' ', '-1', '1/0', 'Infinity', NaN, '7 inches', '1/2/3', '0x10']) assert.throws(() => m.number(s), RangeError);
  for (const quantity of [0, -1, 1.5, '', Infinity, 9007199254740992]) assert.throws(() => m.row({ ...base, quantity }), RangeError);
  for (const thickness of [0, -1, '']) assert.throws(() => m.row({ ...base, sale: { ...sale, thickness } }), RangeError);
  assert.throws(() => m.row({ ...base, units: 'yards' }), RangeError);
  for (const p of ['', -1, 100, 101]) assert.throws(() => m.allowance(10, p), RangeError);
  assert.throws(() => m.cost(5.25, ''), RangeError);
  assert.throws(() => m.cost(Infinity, 2), RangeError);
  assert.throws(() => m.boardFeet({ thickness: '9'.repeat(200), width: '9'.repeat(200), length: 1 }, 'ft'), RangeError);
});
