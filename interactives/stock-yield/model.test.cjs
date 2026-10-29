const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate, parse, defaults, limits } = require('./model.js');
const run = values => calculate({ ...defaults, ...values });
test('original example reserves the final full separating kerf', () => {
  const r = run({});
  assert.equal(r.count, 10); assert.equal(r.cuts, 10);
  assert.equal(r.parts, 98000); assert.equal(r.kerfLoss, 2000); assert.equal(r.offcut, 0);
  assert.equal(r.utilization, 98); assert.equal(r.costPerBlank, 4.8);
  assert.deepEqual(r.blanks[9], { number: 10, start: 90000, end: 99800, cutStart: 99800, cutEnd: 100000 });
  assert.equal(run({ kerf: '3' }).count, 9);
  // n-1 would let ten fit at 998 mm; this declared layout must reject that count.
  assert.equal(run({ length: '998' }).count, 9);
});
test('just below, at and above thresholds use exact hundredths', () => {
  assert.equal(run({ length: '999.99' }).count, 9);
  assert.equal(run({ length: '1000' }).count, 10);
  assert.equal(run({ length: '1000.01' }).count, 10);
  assert.equal(run({ blank: '98.01' }).count, 9);
  assert.equal(run({ blank: '97.99' }).count, 10);
  assert.equal(run({ kerf: '1.99' }).count, 10);
  assert.equal(run({ kerf: '2.01' }).count, 9);
  assert.equal(run({ left: '0.01' }).count, 9);
  const r = run({ length: '1000.1', blank: '98.01' });
  assert.equal(r.count, 10); assert.equal(r.offcut, 0);
});
test('zero kerf, zero price, excluded-trim boundary and zero fit', () => {
  const ideal = run({ length: '1000', blank: '100', kerf: '0', price: '0' });
  assert.equal(ideal.count, 10); assert.equal(ideal.kerfLoss, 0); assert.equal(ideal.cuts, 10);
  assert.equal(ideal.costPerBlank, 0);
  const none = run({ length: '50', blank: '100', left: '25', right: '25' });
  assert.equal(none.count, 0); assert.equal(none.cuts, 0); assert.equal(none.offcut, 0);
  assert.equal(none.costPerBlank, null); assert.deepEqual(none.blanks, []);
  assert.equal(none.nextStockLength, 15200);
  const short = run({ length: '50', blank: '100' });
  assert.equal(short.count, 0); assert.equal(short.offcut, 5000); assert.equal(short.costPerBlank, null);
  assert.throws(() => run({ length: '50', left: '25', right: '25.01' }), /trims together/);
});
test('trim, kerf, offcut and parts partition stock; every placed interval is connected', () => {
  let cases = 0;
  for (const length of ['50', '100.01', '249.75', '500', '999.99', '1000', '1200']) {
    for (const blank of ['20', '20.01', '98', '100', '399.99', '400']) {
      for (const kerf of ['0', '0.01', '2', '2.01', '6']) {
        for (const [left, right] of [['0','0'], ['1.23','4.56'], ['25','25']]) {
          const r = run({ length, blank, kerf, left, right }); cases++;
          assert.equal(r.trim + r.parts + r.kerfLoss + r.offcut, r.ticks.length);
          assert.ok(r.offcut >= 0 && r.offcut < r.pitch);
          assert.equal(r.blanks.length, r.count); assert.ok(r.count <= 60);
          assert.equal(r.cuts, r.count);
          let cursor = r.ticks.left;
          for (const b of r.blanks) {
            assert.equal(b.start, cursor); assert.equal(b.end - b.start, r.ticks.blank);
            assert.equal(b.cutStart, b.end); assert.equal(b.cutEnd - b.cutStart, r.ticks.kerf);
            cursor = b.cutEnd;
          }
          assert.equal(cursor, r.offcutStart);
          assert.equal(cursor + r.offcut + r.ticks.right, r.ticks.length);
          assert.equal(r.nextStockLength - r.ticks.length, r.additionalForNext);
          assert.equal(r.nextStockLength, r.trim + (r.count + 1) * r.pitch);
          if (r.nextStockLength <= limits.length[1] * 100) {
            assert.equal(run({ length: (r.nextStockLength / 100).toFixed(2), blank, kerf, left, right }).count, r.count + 1);
            assert.equal(run({ length: ((r.nextStockLength - 1) / 100).toFixed(2), blank, kerf, left, right }).count, r.count);
          }
        }
      }
    }
  }
  assert.equal(cases, 630);
});
test('allocation changes with price and whole count, without remnant credit', () => {
  const exact = run({}), less = run({ length: '999.99' });
  assert.equal(exact.costPerBlank, 48 / 10); assert.equal(less.costPerBlank, 48 / 9);
  assert.equal(run({ price: '96' }).costPerBlank, 2 * exact.costPerBlank);
  assert.equal(less.costRoundedCents, 533);
  assert.equal(run({ price: '0.05' }).costRoundedCents, 1);
  assert.equal(run({ price: '0.04' }).costRoundedCents, 0);
  const trimmed = run({ length: '1000', blank: '100', kerf: '2', left: '10', right: '20', price: '45' });
  assert.equal(trimmed.count, 9); assert.equal(trimmed.offcut, 5200); assert.equal(trimmed.costPerBlank, 5);
});
test('reject unsupported precision, invalid values, missing fields and bounds', () => {
  for (const key of Object.keys(limits)) {
    for (const value of ['', ' ', null, undefined, true, [], {}, 'NaN', NaN, Infinity, '1e2', '-1', '1/2', '2.001', '0x64', '1,000']) {
      assert.throws(() => run({ [key]: value }), RangeError, `${key}: ${String(value)}`);
    }
    const [min, max] = limits[key];
    assert.equal(parse(String(min), key), min * 100); assert.equal(parse(String(max), key), max * 100);
    assert.throws(() => run({ [key]: (max + 0.01).toFixed(2) }), RangeError);
  }
  for (const input of [null, undefined, false, {}]) assert.throws(() => calculate(input), RangeError);
  assert.throws(() => parse('100', 'toString'), RangeError);
  assert.equal(parse(' 00098.10 ', 'blank'), 9810);
});
