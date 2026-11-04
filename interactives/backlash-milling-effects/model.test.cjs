'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('./model.js'),G=require('../planar-cut-geometry/model.js');
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
test('zero backlash reproduces the entire finite cutter history and removal exactly',()=>{
  for(const shape of Object.keys(M.PROFILES))for(const winding of [-1,1]){
    const d=M.sweep({shape,winding,bx:0,by:0}),grid=M.raster(d);
    d.groups.forEach(g=>{assert.deepEqual(g.end,g.command[1]);});
    assert.deepEqual(grid.actual,grid.nominal);
    for(const p of [.1,.5,1]){const a=M.areas(grid,M.indexAt(d,p));assert.equal(a.extra,0);assert.equal(a.missed,0);}
    for(const v of M.measurements(d,d.groups.length))near(v.error,0);
  }
});
test('a reversal holds for the full clearance; different release times create a real intermediate leg',()=>{
  // Independent review case: q(t)=(1-t,1-t), clearances .2 and .4.
  for(const [t,x,y] of [[.2,1,1],[.3,.9,1],[.4,.8,1],[.5,.7,.9],[1,.2,.4]]){const p=M.moveSegment([1,1],[1,1],[1-t,1-t],[.2,.4],1).end;near(p[0],x);near(p[1],y);}
  const r=M.moveSegment([1,1],[1,1],[-1,0],[.5,.5],1);
  assert.deepEqual(r.times,[0,.25,.5,1]);assert.deepEqual(r.points,[[1,1],[1,1],[.5,1],[-.5,.5]]);
  // The horizontal leg sweeps this point; a false diagonal joining endpoints does not.
  assert.ok(G.sdCapsule(.75,1,...r.points[1],...r.points[2],.02)<0);
  assert.ok(G.sdCapsule(.75,1,...r.points[0],...r.end,.02)>.02);
  near(M.moveSegment([10,0],[10,0],[9.6,0],[.5,0],1).end[0],10);
  near(M.moveSegment([10,0],[10,0],[9.4,0],[.5,0],1).end[0],9.9);
});
test('axis swap with reflected winding preserves geometry; X-only and Y-only act independently',()=>{
  const a=M.sweep({bx:.6,by:0,start:0,winding:1}),b=M.sweep({bx:0,by:.6,start:1,winding:-1});
  assert.equal(a.command.length,b.command.length);
  a.groups.forEach((g,i)=>{near(g.end[0],b.groups[i].end[1]);near(g.end[1],b.groups[i].end[0]);near(g.end[1],g.command[1][1]);});
  const sa=M.measurements(a,a.groups.length),sb=M.measurements(b,b.groups.length);near(sa[0].actual.width,sb[1].actual.width);near(sa[1].actual.width,sb[0].actual.width);
});
test('calibration is seated at the start; winding and start history are retained rather than an imposed ellipse',()=>{
  for(const seat of [-1,1])for(const start of [0,1,2,3]){
    const d=M.sweep({seat,start,bx:.7,by:.3});assert.deepEqual(d.actual[0],d.command[0]);
    for(const g of d.groups)for(let axis=0;axis<2;axis++){const delta=g.end[axis]-g.command[1][axis],B=axis?.3:.7;assert.ok(seat*delta>=-1e-9&&seat*delta<=B+1e-9);}
  }
  const a=M.sweep({winding:1}),b=M.sweep({winding:-1});
  assert.notDeepEqual(a.groups.at(-1).end,b.groups.at(-1).end);
  const c=M.sweep({start:2});assert.notDeepEqual(a.groups.at(-1).end,c.groups.at(-1).end);
});
test('material is a monotone capsule union, not a filled pocket; initial plunge and finite radius count',()=>{
  const d=M.sweep({shape:'rectangle'}),grid=M.raster(d);let last=0;
  for(let i=0;i<=d.groups.length;i+=17){const a=M.areas(grid,i);assert.ok(a.removed>=last);last=a.removed;}
  assert.equal(M.removedAt(d,0,0,d.groups.length),false,'retained island');
  assert.equal(M.removedAt(d,14,0,0),true,'initial plunge');
  assert.equal(M.removedAt(d,14,1.9,0),true);assert.equal(M.removedAt(d,14,2.1,0),false);
  assert.equal(M.removedAt(d,19,19,d.groups.length),false,'outer stock remains');
});
test('section spans intersect swept capsules, including oblique sides and end caps, independently of display grid',()=>{
  const iv=M.capsuleIntervals([[0,0],[10,0]],2,0,1).sort((a,b)=>a[0]-b[0]);near(iv[0][0],-Math.sqrt(3));near(Math.max(...iv.map(v=>v[1])),10+Math.sqrt(3));
  const diagonal=M.capsuleIntervals([[0,0],[10,10]],2,0,5);near(Math.min(...diagonal.map(v=>v[0])),5-2*Math.SQRT2);near(Math.max(...diagonal.map(v=>v[1])),5+2*Math.SQRT2);
  for(const radius of [1,2,3]){const d=M.sweep({shape:'rectangle',radius,bx:.3,by:.7}),s=M.measurements(d,d.groups.length);near(s[0].actual.width,23.7);near(s[1].actual.width,17.3);}
  const a=M.sweep({cell:.5}),b=M.sweep({cell:.025});assert.deepEqual(M.measurements(a,a.groups.length),M.measurements(b,b.groups.length));
});
test('zero-clearance circular sweep converges to an analytic annulus; chord sag remains below the declared bound',()=>{
  const trueArea=Math.PI*(16**2-12**2),errors=[];
  for(const cell of [.2,.1,.05]){const d=M.sweep({bx:0,by:0,cell}),a=M.areas(M.raster(d),d.groups.length);errors.push(Math.abs(a.removed-trueArea));assert.ok(errors.at(-1)<2*Math.PI*28*cell/Math.SQRT2+.1);}
  assert.ok(errors.at(-1)<.5);
  for(const shape of Object.keys(M.PROFILES)){const coarse=M.sweep({shape,bx:.55,by:.25}),fine=M.sweep({shape,bx:.55,by:.25,angleStep:.5});const a=M.measurements(coarse,coarse.groups.length),b=M.measurements(fine,fine.groups.length);for(let i=0;i<2;i++)near(a[i].actual.width,b[i].actual.width,.002);}
  assert.ok(15*(1-Math.cos(Math.PI/360))<.001);
});
test('invalid settings are refused and path starts are explicit cardinal points',()=>{
  for(const patch of [{bx:-1},{by:Infinity},{radius:0},{cell:0},{shape:'pocket'},{seat:0}])assert.throws(()=>M.sweep(patch));
  for(let start=0;start<4;start++){const d=M.sweep({start});const p=d.command[0],q=[[14,0],[0,14],[-14,0],[0,-14]][start];near(p[0],q[0]);near(p[1],q[1]);}
});
