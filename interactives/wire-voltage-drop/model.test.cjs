'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const M = require('./model.js'), D = require('./render.js');
const near = (a,b,t) => assert.ok(Math.abs(a-b)<=t, `${a} != ${b} ± ${t}`);
test('AWG diameter agrees with definition at five gauges', () => {
  for (const n of [10,12,14,18,22]) near(M.diameter(n),0.127*92**((36-n)/39),1e-12);
  for (const [n,mm] of [[10,2.588],[12,2.053],[14,1.628],[18,1.024],[22,.6438]]) near(M.diameter(n),mm,.0005);
});
test('resistance references within 0.5 percent', () => {
  for (const [awg,r] of [[10,.999],[12,1.588],[14,2.525],[18,6.385]]) near(M.solve({...M.DEFAULT,awg}).ohmsPer1000Ft,r,r*.005);
});
test('units, loop, scaling and conservation', () => {
  const s=M.DEFAULT,r=M.solve(s);
  near(r.loopM,30.48,1e-12);
  near(r.drop,M.solve({...s,length:15.24,unit:'m'}).drop,1e-12);
  near(r.loss,r.drop*s.current,1e-12);
  near(r.loadVoltage+r.drop,s.voltage,1e-12);
  near(M.solve({...s,current:10}).loss,4*r.loss,1e-12);
  near(M.solve({...s,length:100}).drop,2*r.drop,1e-12);
  near(M.solve({...s,length:0}).loss,0,0);
  assert.ok(M.solve({...s,awg:20}).loopResistance>r.loopResistance);
  assert.equal(M.solve({...s,voltage:5,current:30,awg:30}).feasible,false);
});
test('invalid input never yields a plausible result', () => {
  for (const patch of [{awg:3},{awg:31},{awg:12.5},{length:-1},{current:0},{voltage:0},{unit:'yards'},{length:NaN}]) assert.throws(()=>M.solve({...M.DEFAULT,...patch}),RangeError);
});
test('wrong-method controls are rejected by independent expected resistance', () => {
  const expected=.63845115303796,tolerance=.001;
  const correct=M.solve(M.DEFAULT).loopResistance;
  near(correct,expected,tolerance);
  // Each intentionally defective answer must cause the same assertion to fail.
  const invertedDiameterM=.127*92**((18-36)/39)/1000;
  const invertedResistance=1.724e-8*30.48/(Math.PI*invertedDiameterM**2/4);
  for (const wrong of [correct/2,correct/4,correct/M.FT,invertedResistance]) {
    assert.throws(()=>near(wrong,expected,tolerance),assert.AssertionError);
  }
  assert.throws(()=>assert.ok(M.diameter(22)>M.diameter(18)),assert.AssertionError);
});
test('all five practice keys admit rounding and reject wrong methods', () => {
  const bank=fs.readFileSync(path.join(__dirname,'../../practice/electrical-units.html'),'utf8');
  const r=M.solve(M.DEFAULT),round=n=>Number(n.toPrecision(4));
  const d=round(.127*92**((36-18)/39))/1000;
  const area=round(Math.PI*d*d/4), resistance=round(1.724e-8*30.48/area), drop=round(5*resistance);
  const cases=[['wire-loop-resistance','loopResistance',resistance],['wire-run-drop','drop',drop],['wire-percent-drop','percent',round(drop/24*100)],['wire-load-voltage','loadVoltage',round(24-drop)]];
  for(const [id,key,rounded] of cases) {
    const tag=bank.match(new RegExp('<div[^>]+id="'+id+'"[^>]*>'))[0];
    const answer=Number(tag.match(/data-answer="([^"]+)"/)[1]), tol=Number(tag.match(/data-tolerance="([^"]+)"/)[1]);
    near(r[key],answer,1e-12); near(rounded,answer,tol); near(round(answer),answer,tol);
    for(const factor of [.5,.25,1/M.FT,92**(72/39)]) {
      const wrong=key==='loadVoltage'?24-r.drop*factor:r[key]*factor;
      assert.throws(()=>near(wrong,answer,tol),assert.AssertionError);
    }
  }
  const choose=factor=>[18,16,14,12,10].find(awg=>M.solve({...M.DEFAULT,awg}).percent*factor<6);
  assert.equal(choose(1),14);
  for(const factor of [.5,.25,1/M.FT]) assert.notEqual(choose(factor),14);
  assert.match(bank,/id="wire-smallest-gauge"[^>]+data-answer="14"[^>]+data-tolerance="0.01"/);
});
test('generated static lesson is current and carries worked values', () => {
  const source=fs.readFileSync(path.join(__dirname,'../../collections/engineering/pages/wire-and-wire-gauge.html'),'utf8');
  assert.ok(source.includes(D.staticLesson()));
  assert.match(D.staticLesson(),/<table>/); assert.match(D.staticLesson(),/0.6385/);
  assert.match(D.staticLesson(),/15.96/); assert.match(source,/<noscript>/);
});
