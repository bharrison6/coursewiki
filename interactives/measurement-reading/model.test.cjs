const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('./model.js');
const R = require('./render.js');

test('every trainer reading reconstructs exactly, including every sleeve transition', () => {
  for (const mode of M.modes) {
    const count = mode === 'micrometer' ? 1000 : mode === 'vernier-micrometer' ? 10000 : 2000;
    for (let n=0;n<count;n++) {
      const r=M.reading(mode,n);
      assert.equal(r.main%25,0);
      assert.ok(r.thimble>=0 && r.thimble<=24);
      assert.equal(mode==='vernier-micrometer' ? r.main*10+r.thimble*10+r.vernier : r.main+r.thimble+r.vernier,n);
      assert.ok(M.check(r,r.text));
      assert.ok(M.check(r,r.text+'0'));
      assert.ok(!M.check(r,((n+1)/r.factor).toFixed(r.digits)));
      assert.ok(!M.check(r,((n-1)/r.factor).toFixed(r.digits)));
      assert.ok(!M.check(r,(r.value+0.025).toFixed(r.digits)));
    }
  }
});

test('independent boundary fixtures: thimble 0/24 and vernier 0/9', () => {
  for (const [mode,n,main,thimble,vernier] of [
    ['micrometer',0,0,0,0],['micrometer',24,0,24,0],['micrometer',25,25,0,0],
    ['micrometer',99,75,24,0],['micrometer',100,100,0,0],['micrometer',999,975,24,0],
    ['vernier-micrometer',249,0,24,9],['vernier-micrometer',250,25,0,0],
    ['vernier-micrometer',2999,275,24,9],['vernier-micrometer',3000,300,0,0],
    ['vernier-micrometer',9999,975,24,9],['vernier-caliper',1349,1325,0,24],
    ['vernier-caliper',1350,1350,0,0]
  ]) {
    const r=M.reading(mode,n);
    assert.deepEqual([r.main,r.thimble,r.vernier],[main,thimble,vernier]);
    assert.match(M.explain(r),new RegExp(r.text.replace('.','\\.')));
  }
});

test('input checking rejects rounding, malformed, blank, and extra nonzero decimals', () => {
  const r=M.reading('vernier-micrometer',4627);
  for (const input of ['', ' ', 'NaN', 'Infinity', '0x1', '4.627e-1', '0.4627in', '0.46271', '0.46269', '0.4628', '-0.4627']) assert.equal(M.check(r,input),false,input);
  for (const input of ['.4627','0.4627','00.462700',' 0.4627 ']) assert.ok(M.check(r,input),input);
});

test('generator endpoints and invalid model requests', () => {
  for (const mode of M.modes) {
    assert.equal(M.random(mode,()=>0).units,0);
    const expected=mode==='micrometer'?999:mode==='vernier-micrometer'?9999:1999;
    assert.equal(M.random(mode,()=>1-Number.EPSILON).units,expected);
    assert.throws(()=>M.reading(mode,-1),RangeError);
    assert.throws(()=>M.reading(mode,expected+1),RangeError);
    assert.throws(()=>M.reading(mode,0.5),RangeError);
    assert.throws(()=>M.random(mode,()=>1),RangeError);
  }
  assert.throws(()=>M.reading('other',0),RangeError);
});

test('drawn caliper alignment agrees geometrically for all 25 remainders', () => {
  for (let v=0;v<25;v++) {
    const r=M.reading('vernier-caliper',1325+v);
    const svg=R.draw(r);
    const zero=60+r.units-1300;
    const marks=[...svg.matchAll(/<line class="" x1="([\d.]+)" y1="140" x2="[\d.]+" y2="(?:170|188)"/g)].map(m=>Number(m[1]));
    assert.equal(marks.length,26); // positive control: the renderer really supplied the whole vernier.
    const aligned=marks.map((x,i)=>(x-60)%25===0?i:null).filter(i=>i!==null);
    assert.deepEqual(aligned,v===0?[0,25]:[v]);
    assert.equal(marks[0],zero);
  }
});

test('drawn micrometer sleeve vernier aligns at the correct line, including wrap', () => {
  for (const t of [0,12,24]) for(let v=0;v<10;v++) {
    const r=M.reading('vernier-micrometer',2500+t*10+v), svg=R.draw(r);
    const thimbleLines=[...svg.matchAll(/<line class="" x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="\1"/g)].map(m=>Number(m[1]));
    assert.ok(thimbleLines.length>=20); // both scale families are present, not an empty SVG.
    const expected=265-v*18;
    assert.ok(thimbleLines.filter(y=>y===expected).length>=2);
    assert.match(svg,new RegExp(`>${t}</text>`));
  }
});
