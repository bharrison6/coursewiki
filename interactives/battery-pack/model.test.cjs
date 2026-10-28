const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { calculate } = require('./model.js');
const base = { voltage: 3.6, capacity: 2.4, series: 3, parallel: 2, rate: 3, load: 1.2 };
function close(a,b) { assert.ok(Math.abs(a-b) < 1e-9, `${a} != ${b}`); }
test('paper example and conservation of cell energy', () => {
  const r = calculate(base);
  close(r.packVoltage,10.8); close(r.packCapacity,4.8); close(r.energy,51.84);
  close(r.maxCurrent,14.4); close(r.runtime,4); assert.equal(r.overloaded,false);
  for (let s=1;s<=8;s++) for(let p=1;p<=5;p++) {
    close(calculate({...base,series:s,parallel:p}).energy,s*p*base.voltage*base.capacity);
  }
});
test('series and parallel have distinct effects at constant pack current', () => {
  const r=calculate(base), s=calculate({...base,series:6}), p=calculate({...base,parallel:4});
  close(s.packVoltage,2*r.packVoltage); close(s.runtime,r.runtime); close(s.maxCurrent,r.maxCurrent);
  close(p.packVoltage,r.packVoltage); close(p.runtime,2*r.runtime); close(p.maxCurrent,2*r.maxCurrent);
});
test('zero load and continuous-rating boundary', () => {
  assert.equal(calculate({...base,load:0}).runtime,null);
  const max=calculate(base).maxCurrent;
  assert.equal(calculate({...base,load:max}).overloaded,false);
  assert.equal(calculate({...base,load:max+.01}).overloaded,true);
});
test('invalid values never produce plausible results', () => {
  for (const key of Object.keys(base)) for(const value of [NaN,Infinity,-1]) {
    assert.throws(()=>calculate({...base,[key]:value}),RangeError);
  }
  for(const key of ['voltage','capacity','series','parallel','rate']) assert.throws(()=>calculate({...base,[key]:0}),RangeError);
  for(const key of ['series','parallel']) assert.throws(()=>calculate({...base,[key]:1.5}),RangeError);
  assert.throws(()=>calculate({...base,voltage:Number.MAX_VALUE}),RangeError);
});
test('practice keys accept rounded results and reject wrong methods', () => {
  const text=fs.readFileSync(path.join(__dirname,'../../practice/energy-storage-and-batteries.html'),'utf8');
  const records=[...text.matchAll(/data-practice-id="([^"]+)"[^>]*data-answer="([^"]+)" data-tolerance="([^"]+)"/g)];
  assert.equal(records.length,11,'positive control: all eleven items extracted');
  const checks={
    'battery-energy-wh':[2.35*3.7,8.695,[2.35,2350*3.7]],
    'battery-energy-joules':[2.35*3.7*3600,31300,[8.695*1000,8.695/3600]],
    'battery-c-rate':[4*2.35,9.4,[4/2.35]],
    'battery-runtime':[4.7/1.8,2.611,[4.7/1.8*60,1.8/4.7]],
    'battery-pack-voltage':[4*3.6,14.4,[3*3.6]],
    'battery-pack-capacity':[3*2.5,7.5,[4*2.5]],
    'battery-pack-energy':[4*3*3.6*2.5,108,[7.5,14.4]],
    'battery-primary-choice':[1,1,[2]],'battery-secondary-choice':[2,2,[1]],
    'storage-reservoir-choice':[1,1,[2]],'storage-portable-choice':[2,2,[1]]
  };
  for(const [,id,key,tolerance] of records) {
    const [exact,rounded,wrong]=checks[id], answer=Number(key), tol=Number(tolerance);
    close(exact,answer);
    const accepts=x=>Math.abs(x-answer)<=tol;
    assert.ok(accepts(rounded),id+' rounded');
    assert.ok(accepts(Number(exact.toPrecision(4))),id+' four significant figures');
    wrong.forEach(x=>assert.equal(accepts(x),false,id+' rejects '+x));
    assert.equal(accepts(answer+tol+1),false,'negative control for answer window');
  }
});
