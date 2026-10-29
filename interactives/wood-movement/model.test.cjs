const test = require('node:test');
const assert = require('node:assert/strict');
const {species, calculate, attachmentTravel} = require('./model.js');
const base = {speciesIndex:13, orientation:'flat-width', dimension:9.15, unit:'in', initialMC:8, finalMC:11};
const near = (a,b,t=1e-12) => assert.ok(Math.abs(a-b)<t, `${a} != ${b}`);
test('Handbook white-fir example in inches and millimeters', () => {
  const r = calculate(base);
  near(r.change, .0672525);
  near(r.change, .0672, .0001);
  assert.equal(r.change.toFixed(3), '0.067');
  assert.equal(r.finalDimension.toFixed(3), '9.217');
  const mm = calculate({...base, dimension:232, unit:'mm'});
  near(mm.change, 1.7052);
  assert.equal(mm.change.toFixed(3), '1.705');
  near(mm.finalDimension, 233.7052);
  for (const wrong of [9.15 * .07, r.change / 100, r.change / 10000]) {
    assert.ok(Math.abs(r.change-wrong) > .005, 'wrong method must fail even at displayed rounding');
  }
});
test('all 17 named rows match primary USDA Table 13-5, printed page 13-17', () => {
  // Independently transcribed by species from the primary table, not from model.js.
  // https://research.fs.usda.gov/download/treesearch/62261.pdf#page=17
  const table = {
    'Ash, white': [.00169,.00274], 'Basswood, American': [.00230,.00330],
    'Beech, American': [.00190,.00431], 'Birch, yellow': [.00256,.00338],
    'Cherry, black': [.00126,.00248], 'Hickory, true': [.00259,.00411],
    'Maple, red (soft maple)': [.00137,.00289], 'Maple, sugar (hard maple)': [.00165,.00353],
    'Red oak, northern red': [.00137,.00304], 'White oak, white': [.00194,.00376],
    'Poplar, yellow (yellow-poplar)': [.00158,.00289], 'Walnut, black': [.00190,.00274],
    'Douglas-fir, Coast-type': [.00165,.00267], 'Fir, white': [.00112,.00245],
    'Pine, loblolly (a southern yellow pine)': [.00165,.00259],
    'Pine, ponderosa': [.00133,.00216], 'Cedar, western red': [.00111,.00234]
  };
  assert.equal(species.length, Object.keys(table).length);
  for (const row of species) assert.deepEqual([row.radial,row.tangential], table[row.name], row.name);
  // Matching controls: these rows were already correct in the original estimator.
  for (const name of ['Douglas-fir, Coast-type','Fir, white','Cedar, western red']) {
    const row = species.find(s => s.name === name);
    near(calculate({...base,speciesIndex:species.indexOf(row),dimension:100,initialMC:10,finalMC:11}).change,100*table[name][1]);
  }
});
test('orientation, sign, boundaries, units and zero movement', () => {
  for (let i=0; i<species.length; i++) {
    for (const [orientation,c] of [['flat-width',species[i].tangential],['quarter-width',species[i].radial],['flat-thickness',species[i].radial],['unknown',species[i].tangential]]) {
      const r = calculate({...base,speciesIndex:i,orientation,initialMC:14,finalMC:6});
      near(r.change, -9.15*c*8);
      assert.ok(r.finalDimension < base.dimension);
    }
  }
  assert.equal(calculate({...base,finalMC:8}).change,0);
  near(calculate({...base,dimension:9.15*25.4,unit:'mm'}).change, calculate(base).change*25.4);
});
test('reject invalid data and either MC outside inclusive 6–14%', () => {
  for (const key of ['initialMC','finalMC']) for (const value of [5,15,5.999,14.001,NaN,Infinity,'8',null]) {
    assert.throws(()=>calculate({...base,[key]:value}), /Both moisture contents/);
  }
  for (const dimension of [0,-1,NaN,Infinity,'9.15']) assert.throws(()=>calculate({...base,dimension}),RangeError);
  for (const speciesIndex of [-1,17,1.5,'13']) assert.throws(()=>calculate({...base,speciesIndex}),RangeError);
  for (const orientation of ['width','toString']) assert.throws(()=>calculate({...base,orientation}),RangeError);
  assert.throws(()=>calculate({...base,unit:'cm'}),RangeError);
  assert.throws(()=>calculate({...base,dimension:Number.MAX_VALUE,initialMC:6,finalMC:14}),RangeError);
});
const attached = {...base,anchor:'center',outward:.04,inward:.02};
test('one reference preserves total change while redistributing edge displacement', () => {
  for (const finalMC of [6,8,8.001,11,14]) {
    const center = attachmentTravel({...attached,finalMC});
    const edge = attachmentTravel({...attached,finalMC,anchor:'left-edge'});
    near(center.points[1].displacement-center.points[0].displacement,center.change);
    near(edge.points[0].displacement,0);
    near(edge.points[1].displacement,center.change);
    near(center.points[1].displacement,center.change/2);
    near(center.reference,base.dimension/2);
    assert.equal(center.change,calculate({...base,finalMC}).change);
  }
  const center = attachmentTravel(attached), edge = attachmentTravel({...attached,anchor:'left-edge'});
  near(center.points[0].displacement,-.03362625); near(center.points[1].displacement,.03362625);
  assert.equal(center.points[0].direction,'outward'); assert.equal(center.points[0].status,'within');
  assert.equal(edge.points[1].status,'exceeds'); near(edge.points[1].remaining,-.0272525);
});
test('signed inward travel uses inward allowance, not total or outward allowance', () => {
  const r = attachmentTravel({...attached,finalMC:6});
  near(r.points[0].displacement,.0224175); near(r.points[1].displacement,-.0224175);
  for (const point of r.points) {
    near(point.signedTravel,-.0224175); assert.equal(point.direction,'inward');
    assert.equal(point.status,'exceeds'); near(point.remaining,-.0024175);
  }
  // Positive/negative controls for the same directional comparison.
  assert.equal(attachmentTravel({...attached,finalMC:6,inward:.03,outward:0}).points[1].status,'within');
  assert.equal(attachmentTravel({...attached,finalMC:6,inward:0,outward:100}).points[1].status,'exceeds');
  assert.equal(attachmentTravel({...attached,outward:.03362625}).points[1].status,'at-limit');
  assert.equal(attachmentTravel({...attached,outward:.03362625-1e-8}).points[1].status,'exceeds');
  assert.equal(attachmentTravel({...attached,outward:.03362625+1e-8}).points[1].status,'within');
  assert.equal(attachmentTravel({...attached,finalMC:8,inward:0,outward:0}).points[1].status,'stationary');
});
test('travel is unit equivalent and recomputed from the fixed installation state', () => {
  const inch = attachmentTravel(attached);
  const mm = attachmentTravel({...attached,unit:'mm',dimension:232.41,inward:.508,outward:1.016});
  near(mm.finalDimension,234.1182135);
  for (let i=0;i<2;i++) {
    near(mm.points[i].displacement,inch.points[i].displacement*25.4);
    assert.equal(mm.points[i].status,inch.points[i].status);
  }
  attachmentTravel({...attached,finalMC:14}); attachmentTravel({...attached,finalMC:6});
  assert.deepEqual(attachmentTravel(attached),inch);
  near(base.dimension,9.15);
});
test('attachment inputs reject invalid clearance or anchor without changing canonical calculator', () => {
  for (const key of ['inward','outward']) for (const value of [-1,NaN,Infinity,'0',null]) assert.throws(()=>attachmentTravel({...attached,[key]:value}),RangeError);
  for (const anchor of ['right','toString',null]) assert.throws(()=>attachmentTravel({...attached,anchor}),RangeError);
  assert.throws(()=>attachmentTravel({...attached,orientation:'flat-thickness'}),/width direction/);
  assert.equal(calculate({...base,orientation:'flat-thickness'}).direction,'radial');
});
test('drawing continues past exceeded travel and uses one common comparison scale', () => {
  const render = require('./render.js');
  const center = attachmentTravel(attached), edge = attachmentTravel({...attached,anchor:'left-edge'});
  const svg = render.comparison(center,edge);
  assert.match(svg,/data-anchor="center"/); assert.match(svg,/data-anchor="left-edge"/);
  assert.match(svg,/exceeds by 0.0273 in/); assert.match(svg,/data-displacement="0.067252499/);
  assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
  assert.match(svg,/cx="473"/); // right endpoint 405 + 68; not clamped to the smaller window
  assert.match(render.comparison(center,edge,true),/At installation/);
  assert.doesNotMatch(render.comparison(center,edge,true),/exceeds by/);
  assert.equal(render.format(.000000001,'in',true),'+1.00e-9');
  assert.equal(render.format(-.0224175,'in',true),'−0.0224');
});
test('new practice accepts its displayed rounding and rejects wrong methods', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(__dirname+'/../../practice/wood-movement-design.html','utf8');
  const keys = [...source.matchAll(/data-practice-id="([^"]+)"[^>]*data-answer="([^"]+)" data-tolerance="([^"]+)" data-unit="([^"]+)"/g)];
  assert.equal(keys.length,5);
  const expected = {
    'wood-movement-center-travel':[.03362625,.0336,[.0673,.000336,.0336*100]],
    'wood-movement-edge-travel':[.0672525,.0673,[.0336,.000673]],
    'wood-movement-inward-travel':[-.0224175,-.0224,[.0224,-.0448]],
    'wood-movement-directional-window':[2,2,[1,3]],
    'wood-movement-interior-point':[.016813125,.0168,[.0336,.0673]]
  };
  for (const [,id,key,tolerance,unit] of keys) {
    const [answer,shown,wrong] = expected[id]; near(Number(key),answer);
    assert.ok(Math.abs(shown-Number(key))<=Number(tolerance),id+' displayed answer');
    for (const n of wrong) assert.ok(Math.abs(n-Number(key))>Number(tolerance),id+' wrong method '+n);
    if (id==='wood-movement-directional-window') assert.equal(unit,'choice');
  }
});
test('common display normalization stays finite for subnormal movement and very large clearance', () => {
  const render = require('./render.js');
  for (const input of [
    {...attached,dimension:1e-320,inward:0,outward:0},
    {...attached,dimension:Number.MIN_VALUE,inward:0,outward:0},
    {...attached,inward:Number.MAX_VALUE,outward:Number.MAX_VALUE},
    {...attached,finalMC:8,inward:0,outward:0}
  ]) {
    const center=attachmentTravel(input), edge=attachmentTravel({...input,anchor:'left-edge'});
    for (const preview of [false,true]) {
      const drawing=render.comparison(center,edge,preview);
      assert.doesNotMatch(drawing,/NaN|Infinity|undefined/);
      for (const [,value] of drawing.matchAll(/\b(?:x|y|cx|cy|width|height)="([^"]+)"/g)) assert.ok(Number.isFinite(Number(value)),value);
    }
  }
  const input={...attached,dimension:1e-320,inward:0,outward:0};
  const drawing=render.comparison(attachmentTravel(input),attachmentTravel({...input,anchor:'left-edge'}));
  assert.match(drawing,/cx="473"/,'tiny physical movement remains a finite visible comparison');
  assert.match(drawing,/exceeds by/,'render fix retains the unrestrained demand beyond zero travel');
});
