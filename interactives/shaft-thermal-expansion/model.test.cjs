const test = require('node:test');
const assert = require('node:assert/strict');
const {calculate} = require('./model.js');
test('thermal-growth practice accepts four-significant-figure rounding but rejects wrong methods', () => {
  const {readFileSync} = require('node:fs');
  const {resolve} = require('node:path');
  const bank = readFileSync(resolve(__dirname, '../../practice/bearings-and-shaft-support.html'), 'utf8');
  const item = bank.match(/<div\b[^>]*id="bearing-thermal-growth"[^>]*>[\s\S]*?<\/div>/g);
  assert.equal(item?.length, 1);
  const attr = name => item[0].match(new RegExp(`${name}="([^"]*)"`))[1];
  const answer = Number(attr('data-answer'));
  const tolerance = Number(attr('data-tolerance'));
  assert.equal(attr('data-unit'), 'mm');
  const accepts = value => Math.abs(value - answer) <= tolerance;
  const round4 = value => Number(value.toPrecision(4));
  const alpha = 5.8e-6 * 1.8;
  const exact = alpha * 600 * 40;
  assert.ok(Math.abs(answer - exact) < 1e-12);
  for (const value of [exact, round4(exact), round4(alpha) * 600 * 40,
    round4(round4(alpha * 600) * 40), round4(round4(alpha * 40) * 600),
    round4(round4(alpha * .6) * 40) * 1000]) {
    assert.ok(accepts(value), `rounded answer ${value} must pass`);
  }
  for (const value of [exact / 1000, exact * 1000, 5.8e-6 * 600 * 40,
    alpha * 600 * (40 * 1.8), alpha * 600 * (40 * 1.8 + 32), alpha * 40]) {
    assert.ok(!accepts(value), `wrong-method answer ${value} must fail`);
  }
  assert.match(item[0], /<strong>0\.2506 mm<\/strong>/);
});
test('cold shaft has no thermal incompatibility with either arrangement', () => {
  for (const mode of ['fixed', 'floating']) assert.deepEqual(calculate(0, mode, .4), {free:0, accommodated:0, restrained:0, limited:false});
});
test('floating travel accommodates growth until its limit', () => {
  assert.equal(calculate(40, 'floating', .4).limited, false);
  const s = calculate(50, 'floating', .4);
  assert.equal(s.accommodated, .4);
  assert.ok(Math.abs(s.restrained-.1) < 1e-12);
  assert.equal(s.limited, true);
  assert.equal(calculate(100, 'floating', 1).restrained, 0);
});
test('two locating ends block all free growth', () => {
  const s = calculate(50, 'fixed', 1);
  assert.equal(s.accommodated, 0);
  assert.equal(s.restrained, .5);
});
test('growth is conserved across the heating and travel ranges', () => {
  for (let heat=0; heat<=100; heat++) for (const travel of [0,.4,1]) for (const mode of ['floating','fixed']) {
    const s=calculate(heat,mode,travel);
    assert.ok(Math.abs(s.free-s.accommodated-s.restrained)<1e-12);
    assert.ok(s.accommodated>=0 && s.accommodated<=travel && s.restrained>=0);
  }
});
test('invalid model inputs are rejected', () => {
  for (const heat of [-1,101,NaN,Infinity,'50']) assert.throws(()=>calculate(heat,'floating',1),RangeError);
  assert.throws(()=>calculate(50,'unknown',1),RangeError);
  for (const travel of [-1,2,NaN]) assert.throws(()=>calculate(50,'floating',travel),RangeError);
});
