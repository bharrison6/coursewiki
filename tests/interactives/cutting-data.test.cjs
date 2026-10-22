'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const file = path.join(__dirname, '../../interactives/feeds-and-speeds/cutting-data.js');
const D = require(file);
const near = (a,b) => assert.ok(Math.abs(a-b) < 1e-10 * Math.max(1,Math.abs(b)), `${a} != ${b}`);

test('ten named materials use the verified general-purpose chart anchors', () => {
  assert.equal(D.materials.length,10);
  assert.equal(new Set(D.materials.map(x=>x.id)).size,10);
  // Independent transcription anchors: GARR printed p.290, half-inch column.
  const rows = [
    ['al-6061-t6',300,500,.0035,.0048],
    ['steel-1018',150,200,.0014,.0024],
    ['stainless-304',100,150,.0015,.0020],
    ['iron-gray-30',175,225,.0025,.0035],
    ['brass-c360',200,400,.0035,.0048],
    ['ti-6al-4v',100,150,.0013,.0020]
  ];
  for(const [id,low,high,fLow,fHigh] of rows) {
    const g=D.guidance(id,12.7);
    near(g.vcMMin[0]/.3048,low);near(g.vcMMin[1]/.3048,high);
    near(g.fzMm[0]/25.4,fLow);near(g.fzMm[1]/25.4,fHigh);
  }
});

test('guidance keeps source diameter knots and explicitly limits interpolation', () => {
  const g=D.guidance('steel-1018',.28125*25.4);
  near(g.fzMm[0]/25.4,.0011);near(g.fzMm[1]/25.4,.00175);
  for(const d of [0,1,25.4001,Infinity,NaN,undefined,'12.7']) assert.equal(D.guidance('al-6061-t6',d).fzMm,null);
  assert.ok(D.guidance('al-6061-t6',25.4).fzMm);
  assert.ok(D.guidance('al-6061-t6',1.5875).fzMm);
  assert.equal(D.guidance('missing',12.7),null);
  assert.equal(D.get('missing'),null);
});

test('power conversion reproduces Kennametal M446 worked example independently', () => {
  // 0.200 x 1.64 x 19.5 = 6.396 in3/min, divided by K1.56 = 4.1 hp.
  const qMm3Min=.2*1.64*19.5*25.4**3;
  const watts=qMm3Min*D.energyFromK(1.56)/60;
  near(watts/745.6998715822702,4.1);
  const al=D.get('al-6061-t6');
  near(al.energyJMm3[0]*25.4**3/60/745.6998715822702,1/6.25);
  near(al.energyJMm3[1]*25.4**3/60/745.6998715822702,1/3.33);
  for(const x of [0,-1,Infinity,NaN,'1.56']) assert.throws(()=>D.energyFromK(x));
});

test('each material carries ordered numeric bounds, condition, and public source provenance', () => {
  for(const m of D.materials) {
    for(const range of [m.vcMMin,m.energyJMm3]) {
      assert.ok(range.every(x=>Number.isFinite(x)&&x>0));assert.ok(range[0]<=range[1]);
    }
    assert.ok(m.condition.length>8&&m.powerBasis.includes('HB'));
    assert.ok(m.notes.some(x=>x.includes('20%')));
    assert.ok(m.notes.some(x=>x.includes('interpolated')));
    assert.equal(m.sources.length,2);
    for(const source of m.sources)assert.ok(source.url.startsWith('https://'));
    for(let i=0;i<m.chipLoads.length;i++) {
      const k=m.chipLoads[i];assert.ok(k.minMm>0&&k.minMm<=k.maxMm);
      if(i)assert.ok(k.diameterMm>m.chipLoads[i-1].diameterMm);
    }
  }
});

test('plain browser script exposes the same data without a module runtime', () => {
  const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(file,'utf8'),context);
  assert.equal(context.CourseWikiCuttingData.materials.length,10);
  near(context.CourseWikiCuttingData.guidance('al-6061-t6',12.7).fzMm[0],.0035*25.4);
});
