'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path');
const A = require(path.join(__dirname, '../../interactives/cutter-geometry/axial.js'));
const T = require(path.join(__dirname, '../../interactives/three-runtime/three-bundle.js'));
const triangulate = points => T.ShapeUtils.triangulateShape(points.map(p=>new T.Vector2(p.x,p.y)), []);
const near = (a,b,t=1e-9) => assert.ok(Math.abs(a-b)<=t, `${a} ~= ${b}`);
const reduced = { oal:100, loc:20, lbs:70, cutterDiameter:12, neckDiameter:10, shankDiameter:12, helixDeg:40, flutes:4 };
const longFlute = { oal:100, loc:70, lbs:70, cutterDiameter:12, neckDiameter:12, shankDiameter:12, helixDeg:40, flutes:4 };

test('catalog dimensions and mounting projection remain separate', () => {
  const s=A.catalog(reduced), a=A.mounting(s,75), b=A.mounting(s,85);
  assert.equal(s.oal,100); assert.equal(s.loc,20); assert.equal(s.lbs,70);
  assert.equal(a.spec,b.spec); assert.equal(a.insertion,25); assert.equal(b.insertion,15);
  assert.deepEqual(A.anchors(s,75),{tip:0,loc:20,lbs:70,oal:100,neckStart:20,holderFace:75,projection:75,insertion:25});
});

test('LBS includes cutting length and reduced neck', () => {
  const s=A.catalog(reduced);
  assert.equal(s.lbs-s.loc,50);
  assert.equal(A.section(s,10).region,'cutting');
  assert.equal(A.section(s,30).region,'neck');
  assert.equal(A.section(s,80).region,'shank');
});

test('axial sweep preserves canonical vertex identity and helix', () => {
  const s=A.catalog(reduced), a=A.section(s,0), b=A.section(s,20);
  assert.equal(a.points.length,b.points.length);
  const angle = p => Math.atan2(p.y,p.x);
  const actual=Math.atan2(Math.sin(angle(b.tips[0])-angle(a.tips[0])),Math.cos(angle(b.tips[0])-angle(a.tips[0])));
  const expected=20*Math.tan(40*Math.PI/180)/(12/2);
  near(Math.atan2(Math.sin(actual-expected),Math.cos(actual-expected)),0,1e-9);
  const firstA=angle(a.points[0]), firstB=angle(b.points[0]);
  near(Math.atan2(Math.sin(firstB-firstA-expected),Math.cos(firstB-firstA-expected)),0,1e-9);
  // Corresponding vertices remain identical after undoing twists beyond 2π.
  const long={...reduced,loc:70,neckDiameter:12,helixDeg:55}, base=A.section(long,0), wrapped=A.section(long,70);
  const twist=70*Math.tan(55*Math.PI/180)/(12/2), c=Math.cos(-twist), sin=Math.sin(-twist);
  wrapped.points.forEach((p,i)=>{
    near(p.x*c-p.y*sin,base.points[i].x,1e-8);
    near(p.x*sin+p.y*c,base.points[i].y,1e-8);
  });
  // Independent tangent check: tangential travel / axial travel recovers helix.
  const dz=.01, q0=A.section(reduced,5).tips[0], q1=A.section(reduced,5+dz).tips[0];
  const a0=Math.atan2(q0.y,q0.x),a1=Math.atan2(q1.y,q1.x);
  const dpsi=Math.atan2(Math.sin(a1-a0),Math.cos(a1-a0));
  near(Math.atan((reduced.cutterDiameter/2)*dpsi/dz),reduced.helixDeg*Math.PI/180,1e-6);
  assert.ok(dpsi>0,'positive z advances the edge counter-clockwise in the declared math view');
});

test('mesh is finite indexed closed and covers every axial region', () => {
  const m=A.mesh(reduced,{cuttingSegments:12,triangulate});
  assert.ok(m.positions.every(Number.isFinite)); assert.ok(m.indices.every(Number.isInteger));
  assert.ok(m.indices.every(i=>i>=0&&i<m.positions.length/3));
  assert.deepEqual(m.groups.map(g=>g.region),['cutting','neck','shank']);
  assert.equal(m.triangles,m.indices.length/3);
  assert.match(m.note,/do not establish center-cutting end-face geometry/);
  assert.equal(m.indices.length,m.triangles*3);
  assert.equal(m.groups.reduce((n,g)=>n+g.count,0),m.indices.length,'region groups cover every triangle index');
});

test('display mesh is a valid closed embedding for every separate solid', () => {
  const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
  function triArea(m,a,b,c){
    const p=[a,b,c].map(i=>({x:m.positions[i*3],y:m.positions[i*3+1],z:m.positions[i*3+2]}));
    const u={x:p[1].x-p[0].x,y:p[1].y-p[0].y,z:p[1].z-p[0].z},v={x:p[2].x-p[0].x,y:p[2].y-p[0].y,z:p[2].z-p[0].z};
    return Math.hypot(u.y*v.z-u.z*v.y,u.z*v.x-u.x*v.z,u.x*v.y-u.y*v.x)/2;
  }
  for(const spec of [reduced,longFlute]){
    const m=A.mesh(spec,{cuttingSegments:24,triangulate}),edges=new Map();
    for(let i=0;i<m.indices.length;i+=3){
      const t=m.indices.slice(i,i+3);assert.ok(triArea(m,...t)>1e-10,'no degenerate display triangle');
      for(const [a,b] of [[t[0],t[1]],[t[1],t[2]],[t[2],t[0]]])edges.set(edgeKey(a,b),(edges.get(edgeKey(a,b))||0)+1);
    }
    assert.ok([...edges.values()].every(n=>n===2),'every component edge belongs to exactly two triangles');
    assert.deepEqual(m.groups.map(g=>g.region),spec.lbs>spec.loc?['cutting','neck','shank']:['cutting','shank']);
    assert.ok(m.components.every(c=>c.z1>c.z0),'components have positive axial length');
    for(const component of m.components){
      const group=m.groups.find(g=>g.region===component.region),caps={bottom:[],top:[]};
      for(let at=group.start;at<group.start+group.count;at+=3){
        const ids=m.indices.slice(at,at+3),zs=ids.map(i=>m.positions[i*3+2]);
        if(zs.every(z=>Math.abs(z-component.z0)<1e-9))caps.bottom.push(ids);
        if(zs.every(z=>Math.abs(z-component.z1)<1e-9))caps.top.push(ids);
      }
      function signedTri(ids){const p=ids.map(i=>({x:m.positions[i*3],y:m.positions[i*3+1]}));return ((p[1].x-p[0].x)*(p[2].y-p[0].y)-(p[1].y-p[0].y)*(p[2].x-p[0].x))/2;}
      const bottomArea=caps.bottom.reduce((a,t)=>a+signedTri(t),0),topArea=caps.top.reduce((a,t)=>a+signedTri(t),0);
      assert.ok(bottomArea<0&&topArea>0,component.region+' caps wind outward');
      function ringArea(offset){let a=0;for(let i=0;i<component.ringSize;i++){const j=(i+1)%component.ringSize,x1=m.positions[(offset+i)*3],y1=m.positions[(offset+i)*3+1],x2=m.positions[(offset+j)*3],y2=m.positions[(offset+j)*3+1];a+=x1*y2-x2*y1;}return Math.abs(a/2);}
      near(Math.abs(bottomArea),ringArea(component.vertexStart),1e-5);
      near(Math.abs(topArea),ringArea(component.vertexStart+(component.ringCount-1)*component.ringSize),1e-5);
    }
  }
});

test('matched OAL tools differ in LOC and neck without changing overall size', () => {
  const a=A.catalog(reduced), b=A.catalog(longFlute);
  assert.equal(a.oal,b.oal); assert.notEqual(a.loc,b.loc); assert.equal(a.lbs,b.lbs);
  assert.equal(A.section(a,40).region,'neck'); assert.equal(A.section(b,40).region,'cutting');
});

test('pitch is radial spacing and distinct from helix', () => {
  const s=A.catalog(reduced);
  assert.equal(s.pitchDeg,90); assert.equal(s.helixDeg,40);
});

test('invalid dimensional relationships and mesh controls refuse', () => {
  for(const bad of [
    {...reduced,loc:0},{...reduced,lbs:19},{...reduced,oal:70},{...reduced,oal:69},{...reduced,neckDiameter:12.1},
    {...reduced,flutes:1},{...reduced,helixDeg:60}
  ]) assert.throws(()=>A.catalog(bad),RangeError);
  assert.throws(()=>A.mounting(reduced,100),RangeError);
  assert.throws(()=>A.mounting(reduced,69),/plain shank/);
  assert.throws(()=>A.section(reduced,-1),RangeError);
  assert.throws(()=>A.mesh(reduced,{cuttingSegments:2,triangulate}),RangeError);
  assert.throws(()=>A.mesh(reduced,{cuttingSegments:12}),/injected polygon triangulator/);
  const valid=points=>triangulate(points);
  const one=points=>[valid(points)[0]];
  const repeated=points=>Array(points.length-2).fill(valid(points)[0]);
  const reversed=points=>valid(points).map(t=>[t[0],t[2],t[1]]);
  for(const bad of [()=>[],()=>[[0,1]],()=>[[0,1,1]],()=>[[-1,1,2]],()=>[[0,1,99999]],()=>[[0,1,1.5]],one,repeated,reversed])
    assert.throws(()=>A.mesh(reduced,{cuttingSegments:12,triangulate:bad}),/complete same-winding area-conserving/);
});
