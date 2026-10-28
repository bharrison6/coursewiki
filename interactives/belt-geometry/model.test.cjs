'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const M = require('./model.js');
const near = (a,b,t=1e-9) => assert.ok(Math.abs(a-b)<=t, `${a} ≠ ${b} ± ${t}`);
test('specified worked case and rounded inverse', () => {
  const r=M.solve(M.DEFAULT);
  near(r.L,800+150*Math.PI+6.25); near(r.correction,6.25);
  near(M.center(200,100,1277.49),400,.001);
  near(r.wrap,165.63848843708342); near(r.ratio,2); near(r.largeSpeed,600);
  near(r.beltSpeed,120*Math.PI);
});
test('inverse round trips through equal, unequal and close separated pulleys', () => {
  for(const D of [10,100,200,1000]) for(const fraction of [.01,.25,.5,1]) {
    const d=D*fraction;
    for(const gap of [1.001,1.1,2,10,100]) {
      const C=(D+d)/2*gap, L=M.length(D,d,C);
      near(M.center(D,d,L),C,C*1e-12);
      near(M.length(D,d,M.center(D,d,L)),L,L*1e-12);
    }
  }
});
test('unit conversion preserves physical speeds, wrap and ratio', () => {
  const a=M.solve(M.DEFAULT), inches=M.convert(M.DEFAULT,'in'), b=M.solve(inches);
  near(b.L*25.4,a.L); near(b.C*25.4,a.C);
  for(const k of ['beltSpeed','largeSpeed','ratio','wrap']) near(a[k],b[k]);
  near(M.convert(inches,'mm').d,100);
  assert.equal(M.DEFAULT.unit,'mm');
});
test('qualitative behavior: spacing changes length and wrap, not ratio', () => {
  const a=M.solve(M.DEFAULT), b=M.solve({...M.DEFAULT,C:500});
  assert.ok(b.L>a.L); assert.ok(b.wrap>a.wrap); near(b.ratio,a.ratio);
  near(M.solve({...M.DEFAULT,D:100}).wrap,180);
  near(M.solve({...M.DEFAULT,n:0}).beltSpeed,0);
});
test('invalid, overlapping and impossible inputs cannot yield a diagram', () => {
  for(const patch of [{D:0},{d:-1},{D:99},{C:150},{C:NaN},{n:-1},{n:Infinity},{unit:'ft'},{mode:'crossed'},{mode:'length',L:100},{mode:'length',L:600},{D:1e308,C:1e308}]) {
    assert.throws(()=>M.solve({...M.DEFAULT,...patch}),RangeError);
  }
});
test('static worked lesson stays generated from the same renderer', () => {
  execFileSync(process.execPath,[path.join(__dirname,'static.cjs')]);
});
const bank=fs.readFileSync(path.join(__dirname,'../../practice/belt-chain-and-gear-drives.html'),'utf8');
function key(id) {
  const tag=bank.match(new RegExp('<div[^>]*id="'+id+'"[^>]*>'))?.[0];
  assert.ok(tag,'practice item exists: '+id);
  return {answer:Number(tag.match(/data-answer="([^"]+)"/)[1]), tolerance:Number(tag.match(/data-tolerance="([^"]+)"/)[1])};
}
const sig=v=>Number(v.toPrecision(4));
test('practice keys accept exact, displayed, π=3.14 and four-significant-figure methods', () => {
  const B=sig(4*1300-sig(2*3.14*300));
  const values={
    'belt-open-length':[M.length(200,100,400),1277.5,1277.3,sig(800+sig(150*3.14)+6.25)],
    'belt-stock-center':[M.center(200,100,1300),411.3,(B+sig(Math.sqrt(sig(B*B)-320000)))/16],
    'belt-driven-speed':[600,sig(1200/sig(200/100))],
    'belt-linear-speed':[120*Math.PI,377,376.8,sig(sig(3.14*100)*1200)/1000],
    'belt-small-wrap':[M.solve(M.DEFAULT).wrap,165.6,180-2*sig(Math.asin(.125)*180/3.14)]
  };
  for(const [id,answers] of Object.entries(values)) {
    const k=key(id); answers.forEach(v=>near(v,k.answer,k.tolerance));
  }
});
test('wrong-method controls fail the actual practice tolerance windows', () => {
  const wrong={
    'belt-open-length':[800+150*Math.PI, M.length(100,50,400),800+150*Math.PI+300**2/1600],
    'belt-stock-center':[(1300-150*Math.PI)/2],
    'belt-driven-speed':[1200*200/100],
    'belt-linear-speed':[Math.PI*50*1200/1000],
    'belt-small-wrap':[180-2*Math.asin(.125)]
  };
  for(const [id,answers] of Object.entries(wrong)) {
    const k=key(id); answers.forEach(v=>assert.ok(Math.abs(v-k.answer)>k.tolerance,id+' rejects '+v));
  }
  assert.ok(Math.abs(.5-M.solve(M.DEFAULT).ratio)>1,'inverted ratio fails');
});
