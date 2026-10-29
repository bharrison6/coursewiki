const test = require('node:test');
const assert = require('node:assert/strict');
const { compare, evaluate, validate, scenarios } = require('./model.js');
test('cost equality and alternatives around the crossing', () => {
  assert.deepEqual(compare(120), {quantity:120,a:1080,b:1080,unitA:9,unitB:9,cheaper:'tie'});
  assert.equal(compare(119).cheaper, 'A');
  assert.equal(compare(121).cheaper, 'B');
  assert.equal(compare(60).unitB, 15);
  assert.equal(compare(240).unitA, 8.5);
  assert.equal(compare(240).unitB, 6);
  for (const q of [0,-1,1.5,NaN,Infinity,'120']) assert.throws(() => compare(q), RangeError);
});
test('legacy API retains exact shape, validation and results beyond editable limits', () => {
  for (const q of [1, 39, 60, 119, 120, 121, 240, 10001, 1e9, Number.MAX_SAFE_INTEGER, 1e308]) {
    const a=120+8*q, b=720+3*q;
    assert.deepEqual(compare(q),{quantity:q,a,b,unitA:a/q,unitB:b/q,cheaper:a===b?'tie':a<b?'A':'B'});
  }
});
const original = scenarios[0];
test('bounded cent costs agree with independent BigInt arithmetic across inputs and quantities', () => {
  let count=0;
  for (const fixed of [0,1,12000,9999999,10000000]) for (const variable of [0,1,350,99999,100000]) for (const quantity of [1,39,120,9999,10000]) {
    const fixedB=10000000-fixed, variableB=100000-variable;
    const r=evaluate({fixedA:(fixed/100).toFixed(2),variableA:(variable/100).toFixed(2),fixedB:(fixedB/100).toFixed(2),variableB:(variableB/100).toFixed(2),quantity});
    assert.equal(r.valid,true);
    const a=BigInt(fixed)+BigInt(variable)*BigInt(quantity), b=BigInt(fixedB)+BigInt(variableB)*BigInt(quantity);
    assert.equal(r.result.aCents,Number(a)); assert.equal(r.result.bCents,Number(b));
    assert.equal(r.result.cheaper,a===b?'tie':a<b?'A':'B'); count++;
  }
  assert.equal(count,125);
});
test('crossings distinguish whole, fractional, nonpositive, parallel, all-Q tie and off-chart', () => {
  const whole=evaluate(original); assert.equal(whole.crossing.quantity,120);
  assert.deepEqual(whole.crossing.neighbors.map(n=>n.cheaper),['A','tie','B']);
  const fractional=evaluate(scenarios[1]); assert.equal(fractional.crossing.quantity,38.75);
  assert.deepEqual(fractional.crossing.neighbors.map(n=>[n.quantity,n.aCents,n.bCents,n.cheaper]),[[38,31800,32100,'A'],[39,32400,32300,'B']]);
  assert.equal(evaluate(scenarios[2]).crossing.kind,'parallel');
  assert.equal(evaluate(scenarios[3]).crossing.kind,'nonpositive');
  assert.equal(evaluate(scenarios[4]).crossing.kind,'all');
  const beyond=evaluate(scenarios[5]); assert.equal(beyond.crossing.quantity,1600); assert.equal(beyond.crossing.inChart,false);
  const zero=evaluate({...original,fixedA:720}); assert.equal(zero.crossing.quantity,0); assert.equal(zero.crossing.kind,'nonpositive');
  const subOne=evaluate({...original,fixedA:0,fixedB:'.01',variableA:1000,variableB:0});
  assert.deepEqual(subOne.crossing.neighbors.map(n=>n.quantity),[1]); assert.equal(subOne.result.cheaper,'B');
  const reversed=evaluate({...scenarios[1],fixedA:245,variableA:2,fixedB:90,variableB:6});
  assert.deepEqual(reversed.crossing.neighbors.map(n=>n.cheaper),['B','A']);
  const maxCross=evaluate({...original,fixedA:0,fixedB:100000,variableA:'.01',variableB:0});
  assert.equal(maxCross.crossing.quantity,10000000); assert.equal(maxCross.crossing.neighbors[1].cheaper,'tie');
});
test('cent precision prevents false ties after unit rounding', () => {
  const r=evaluate({...original,fixedA:0,fixedB:'.01',variableA:1,variableB:1,quantity:10000}).result;
  assert.equal(r.cheaper,'A'); assert.equal(r.differenceCents,-1);
  assert.equal((r.unitACents/100).toFixed(4),(r.unitBCents/100).toFixed(4));
});
test('zero chart endpoint is a fixed-cost intercept with undefined unit costs', () => {
  const zero=evaluate(original).chart[0];
  assert.deepEqual(zero,{quantity:0,aCents:12000,bCents:72000,unitACents:null,unitBCents:null,differenceCents:-60000,cheaper:'A'});
  const zeroCost=evaluate({...original,fixedA:0,fixedB:0}).chart[0];
  assert.equal(zeroCost.unitACents,null); assert.equal(zeroCost.unitBCents,null);
  assert.deepEqual(compare(120),{quantity:120,a:1080,b:1080,unitA:9,unitB:9,cheaper:'tie'});
});
test('invalid quantities and costs return errors rather than throw or reuse a result', () => {
  for (const quantity of ['',0,-1,1.5,10001,NaN,Infinity,'1e2','1.0',false,null]) {
    const r=evaluate({...original,quantity}); assert.equal(r.valid,false); assert.ok(r.errors.quantity); assert.equal(r.result,undefined);
  }
  for (const field of ['fixedA','fixedB','variableA','variableB']) for (const value of ['',-1,'0.001','1e2',NaN,Infinity,null,{},'100001','+2','0x10']) {
    const r=evaluate({...original,[field]:value}); assert.equal(r.valid,false,field+'='+String(value)); assert.ok(r.errors[field]);
  }
  assert.equal(validate({...original,fixedA:' 0.10 ',variableA:'.50'}).valid,true);
  assert.equal(evaluate().valid,false);
});
test('existing economics practice answers remain consistent and reject wrong-method controls', () => {
  const fs=require('node:fs'), path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'../../practice/manufacturing-economics.html'),'utf8');
  const answer=Number(html.match(/id="economics-break-even"[^>]*data-answer="([^"]+)"/)[1]);
  const r=evaluate({...original,fixedA:180,variableA:9,fixedB:930,variableB:4,quantity:answer});
  assert.equal(r.result.cheaper,'tie'); assert.equal(r.result.aCents,153000);
  assert.notEqual((930-180)/(9+4),answer);
  const unit=Number(html.match(/id="economics-unit-cost"[^>]*data-answer="([^"]+)"/)[1]);
  assert.equal((350+7.375*80)/80,unit); assert.notEqual(7.375,unit);
});
