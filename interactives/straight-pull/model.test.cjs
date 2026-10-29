'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('./model.js');
const D = require('./render.js');
const P = id => M.profiles.find(p => p.id === id).stations;
const near = (a,b) => assert.ok(Math.abs(a-b) <= 1e-11*Math.max(1,Math.abs(b)), `${a} ≈ ${b}`);
test('canonical taper, parallel and reverse profiles distinguish separation/contact/interference', () => {
  const draft = M.inspect(P('draft'),5), parallel=M.inspect(P('parallel'),5), reverse=M.inspect(P('reverse'),5);
  assert.equal(draft.pathBlocked,false); assert.equal(draft.status,'separation'); near(draft.maxDelta,-1.25);
  assert.equal(parallel.pathBlocked,false); assert.equal(parallel.status,'contact'); near(parallel.maxDelta,0);
  assert.equal(reverse.pathBlocked,true); assert.equal(reverse.status,'interference'); near(reverse.maxDelta,1.25);
  assert.deepEqual(reverse.positiveIntervals,[{start:0,end:35,startClosed:true,endClosed:true}]);
});
test('wide-mouth local hook has exact analytic depth20 maximum and zero-crossing interval at pull5', () => {
  const r=M.inspect(P('hook'),5);
  assert.equal(r.pathBlocked,true); assert.equal(r.status,'interference'); near(r.maxDelta,4); near(r.maxDepth,20);
  assert.deepEqual(r.points.map(p=>p.depth),[0,15,20,25,35]);
  assert.equal(r.positiveIntervals.length,1); const i=r.positiveIntervals[0];
  near(i.start,50/3); near(i.end,520/23); assert.equal(i.startClosed,false); assert.equal(i.endClosed,false);
  near(M.widthAt(P('hook'),20),22); near(M.widthAt(P('hook'),25),26);
});
test('initial exact fit is contact for all profiles; final clear endpoint does not erase blocked path', () => {
  for(const profile of M.profiles){const zero=M.inspect(profile.stations,0), final=M.inspect(profile.stations,40);
    assert.equal(zero.status,'contact'); near(zero.maxDelta,0); assert.deepEqual(zero.positiveIntervals,[]);
    assert.equal(final.status,'clear-endpoint'); assert.deepEqual(final.points,[]); assert.equal(final.pathBlocked,zero.pathBlocked);
  }
  assert.equal(M.inspect(P('hook'),40).pathBlocked,true);
  assert.equal(M.inspect(P('reverse'),40).pathBlocked,true);
});
test('nonincrease station proof supplies a witness for each rising segment, including tiny pulls', () => {
  for(const profile of M.profiles){const r=M.inspect(profile.stations,5);
    for(const rise of r.rises){const pull=rise.deep-rise.shallow, pose=M.inspect(profile.stations,pull); const delta=M.widthAt(profile.stations,rise.shallow+pull)-M.widthAt(profile.stations,rise.shallow); assert.ok(delta>r.tolerance); assert.equal(pose.pathBlocked,true);}
  }
  assert.equal(M.inspect(P('hook'),1e-5).status,'interference');
  assert.equal(M.inspect([[0,10],[10,8],[20,8],[40,5]],5).pathBlocked,false);
});
test('dimension scaling preserves signs, normalized extrema and analytic intervals', () => {
  for(const scale of [1e-9,1e-3,1,1e3,1e9]) {
    const stations=P('hook').map(([d,w])=>[d*scale,w*scale]), r=M.inspect(stations,5*scale);
    assert.equal(r.pathBlocked,true); near(r.maxDelta/scale,4); near(r.maxDepth/scale,20);
    near(r.positiveIntervals[0].start/scale,50/3); near(r.positiveIntervals[0].end/scale,520/23);
    near(r.tolerance/scale,M.inspect(P('hook'),5).tolerance);
  }
  const tolerated=M.inspect([[0,30],[40,30+Number.EPSILON*30]],5);
  assert.equal(tolerated.pathBlocked,false); assert.equal(tolerated.status,'contact');
});
test('combined knots include translated features and bound every linear subinterval', () => {
  const stations=[[0,12],[7,8],[19,10],[22,7],[40,6]], r=M.inspect(stations,6);
  for(let i=1;i<r.points.length;i++) {
    const a=r.points[i-1], b=r.points[i], d=(a.depth+b.depth)/2;
    near(M.widthAt(stations,d+6)-M.widthAt(stations,d),(a.delta+b.delta)/2);
  }
  const split=M.inspect([[0,10],[10,12],[20,10],[30,12],[40,10]],10);
  assert.equal(split.positiveIntervals.length,2); // Separate positive regions, not one envelope.
});
test('sub-tolerance steps cannot accumulate into a pose obstruction with a clear path verdict', () => {
  for (const scale of [1e-3,1,1e3]) {
    const stations=[[0,30],[10,30+2.5e-13],[20,30+5e-13],[40,30+7.5e-13]].map(([d,w])=>[d*scale,w*scale]);
    const r=M.inspect(stations,20*scale);
    assert.equal(r.pathBlocked,true); assert.equal(r.status,'interference');
    assert.ok(r.rises.some(w=>w.shallow===0 && w.increase>r.tolerance));
  }
});
test('interpolation stays within endpoint bounds and preserves positive constant subnormals', () => {
  const s=[[0,30],[7.610549120232463,30.000000000000284],[12.05318830255419,30.000000000000057],[16.51737389806658,30.000000000000252],[20.812054133042693,30.000000000000426]];
  const r=M.inspect(s,20.800907296106754);
  assert.equal(r.pathBlocked,false);assert.notEqual(r.status,'interference');
  assert.equal(M.widthAt([[0,Number.MIN_VALUE],[40,Number.MIN_VALUE]],20),Number.MIN_VALUE);
  for(let i=1;i<s.length;i++)for(const f of [.001,.3,.5,.99]){const w=M.widthAt(s,s[i-1][0]+(s[i][0]-s[i-1][0])*f);assert.ok(w>=Math.min(s[i-1][1],s[i][1])&&w<=Math.max(s[i-1][1],s[i][1]));}
});
test('invalid stations, pinches and invalid pulls reject', () => {
  for(const stations of [null,[],[[0,1]],[[1,2],[4,1]],[[0,2],[0,1]],[[0,2],[-1,1]],[[0,2],[3,0]],[[0,Infinity],[3,1]],[[0,1],[NaN,2]],[[0,1],[2,2,3]]]) assert.throws(()=>M.inspect(stations,0),RangeError);
  for(const pull of [-1,41,NaN,Infinity,'5',null]) assert.throws(()=>M.inspect(P('hook'),pull),RangeError);
  for(const depth of [-1,41,NaN]) assert.throws(()=>M.widthAt(P('hook'),depth),RangeError);
});
test('pure renderer uses the same four profiles and the exact static hook pose without SVG IDs', () => {
  const fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.resolve(__dirname,'../../collections/materials-and-processes/pages/making-silicone-molds-from-a-printed-pattern.html'),'utf8');
  assert.ok(source.includes(D.diagram('hook',5)), 'static SVG matches pure live renderer byte-for-byte');
  for(const p of M.profiles) for(const pull of [0,5,40]){
    const svg=D.diagram(p.id,pull), r=M.inspect(p.stations,pull);
    assert.doesNotMatch(svg,/\bid=/); assert.doesNotMatch(svg,/NaN|Infinity/);
    assert.equal((svg.match(/class="sp-interference"/g)||[]).length,2*r.positiveIntervals.length);
    assert.match(svg,/Opening at depth zero; positive depth downward/);
  }
});
