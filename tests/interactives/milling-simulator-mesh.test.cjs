'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../../interactives/milling-simulator/model.js');
const Mesh = require('../../interactives/milling-simulator/mesh.js');
function go(s, p) { const r=s.moveTo(p); assert.equal(r.blocked,null,r.blocked&&r.blocked.message); }
function load(s,id) { assert.ok(s.loadTool(id).ok); }
function face(s) { load(s,'fm50'); go(s,{x:-30,y:18,z:20});go(s,{z:0});go(s,{x:130});go(s,{y:42});go(s,{x:-30}); }
function height(mesh,x,y) {
  const p=mesh.positions; let h=-Infinity;
  for(let i=0;i<p.length;i+=9){
    const ax=p[i],ay=p[i+1],bx=p[i+3],by=p[i+4],cx=p[i+6],cy=p[i+7];
    const d=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(d)<1e-12)continue;
    const a=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/d,b=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/d,c=1-a-b;
    if(Math.min(a,b,c)>=-1e-7)h=Math.max(h,a*p[i+2]+b*p[i+5]+c*p[i+8]);
  }return h;
}
test('shared primitive query exactly reproduces analytic height without changing the model',()=>{
  const s=M.create();face(s);load(s,'sp12');go(s,{x:50,y:30,z:3});go(s,{z:-2});
  const version=s.version,prims=JSON.stringify(s.prims);
  for(let x=44;x<=56;x+=.137){const exact=Math.max(s.stock.bottom,Math.min(s.stock.rawTop,...s.prims.map(p=>M.primitiveFloor(p,x,30))));assert.ok(Math.abs(exact-s.heightAt(x,30))<1e-9);}
  Mesh.build(s);assert.equal(s.version,version);assert.equal(JSON.stringify(s.prims),prims);
});
test('a flat pocket has flat floors, vertical walls and bounded round boundaries',()=>{
  const s=M.create();face(s);load(s,'em8');go(s,{x:34,y:22,z:3});go(s,{z:-6});
  for(const p of [{x:66},{y:30},{x:34},{y:38},{x:66},{y:22}])go(s,p);
  const mesh=Mesh.build(s);assert.equal(mesh.stats.unresolved,0);
  for(const [x,y,z] of [[29.97,30,0],[30.03,30,-6],[69.97,30,-6],[70.03,30,0],[50,17.97,0],[50,18.03,-6],[50,41.97,-6],[50,42.03,0],[50,30,-6]])assert.ok(Math.abs(height(mesh,x,y)-z)<1e-5,`${x},${y}`);
  const p=mesh.positions;let wall=false;
  for(let i=0;i<p.length;i+=9){if(Math.abs(p[i]-30)<1e-5&&Math.abs(p[i+3]-30)<1e-5&&Math.abs(p[i+6]-30)<1e-5&&Math.max(p[i+2],p[i+5],p[i+8])>=-1e-5&&Math.min(p[i+2],p[i+5],p[i+8])<=-6)wall=true;}
  assert.ok(wall,'explicit vertical X30 wall');
  for(let a=0;a<Math.PI/2;a+=.08){const x=34-4*Math.cos(a),y=22-4*Math.sin(a);assert.equal(s.heightAt(x-.03*Math.cos(a),y-.03*Math.sin(a)),0);assert.ok(height(mesh,x+.03*Math.cos(a),y+.03*Math.sin(a))<-5.99);}
});
test('drill breakthrough is the actual cone exit, not the whole tool footprint or a bottom lid',()=>{
  const s=M.create();face(s);load(s,'dr6.6');go(s,{x:15,y:30,z:3});go(s,{z:-21});
  const partial=Mesh.build(s),exit=1/M.TOOL_BY_ID['dr6.6'].cone;
  assert.equal(height(partial,15,30),-Infinity,'center is open');
  assert.equal(height(partial,15+exit-.03,30),-Infinity,'inside actual exit open');
  assert.ok(height(partial,15+exit+.03,30)>-20,'material just outside exit');
  assert.ok(height(partial,18.1,30)<-18,'conical wall still exists within drill radius');
  go(s,{z:-22});const full=Mesh.build(s);assert.equal(height(full,18.25,30),-Infinity);assert.ok(height(full,18.35,30)>-.01);
  s.undo();const restored=Mesh.build(s);assert.ok(height(restored,18.1,30)>-20,'Undo restores partial breakthrough');
});
test('a sub-grid spot cut retains its actual apex and bounded cone, including after Undo',()=>{
  const s=M.create();face(s);load(s,'sp12');go(s,{x:50,y:30,z:2});go(s,{z:-.05});
  const mesh=Mesh.build(s);assert.ok(Math.abs(height(mesh,50,30)+.05)<1e-5);assert.ok(Math.abs(height(mesh,50.02,30)+.03)<.003);assert.ok(Math.abs(height(mesh,50.08,30))<1e-7);assert.equal(mesh.stats.unresolved,0);
  s.undo();assert.equal(height(Mesh.build(s),50,30),0);
});
test('overlapping cone floors retain their ridge and emit no protruding internal partition wall',()=>{
  const s=M.create();face(s);load(s,'sp12');
  go(s,{x:35,y:20,z:3});go(s,{z:-4});go(s,{x:65,y:40});go(s,{z:3});go(s,{x:35,y:40});go(s,{z:-4});go(s,{x:65,y:20});
  const mesh=Mesh.build(s),p=mesh.positions;
  for(let i=0;i<p.length;i+=9){
    const a=[p[i],p[i+1],p[i+2]],b=[p[i+3],p[i+4],p[i+5]],c=[p[i+6],p[i+7],p[i+8]];
    const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(area)>1e-8)continue;
    for(const [u,v]of[[a,b],[b,c],[c,a]]){const len=Math.hypot(v[0]-u[0],v[1]-u[1]);if(len<1e-6)continue;const x=(u[0]+v[0])/2,y=(u[1]+v[1])/2,z=(u[2]+v[2])/2,dx=(v[1]-u[1])/len*.03,dy=-(v[0]-u[0])/len*.03;const actual=Math.max(s.heightAt(x+dx,y+dy),s.heightAt(x-dx,y-dy));assert.ok(z<=actual+.04,`wall curtain ${x},${y}: ${z} above ${actual}`);}
  }
  for(const [x,y]of[[46.3944492340,27.5962991714],[50,30],[49.1,29.3],[51.3,30.5]])assert.ok(Math.abs(height(mesh,x,y)-s.heightAt(x,y))<.025,`crossed cone surface ${x},${y}`);
  assert.equal(mesh.stats.unresolved,0);
});
test('off-center conical envelope intersection is resolved between the refinement probes',()=>{
  const s=M.create();face(s);
  for(const p of [{ax:38.6024259566,ay:36.7650024220,bx:50.5668452499,by:33.4476975072,z:-4.3536401775},{ax:59.5809579734,ay:24.1017818218,bx:39.6624608943,by:39.8681091005,z:-3.2554665804}])s.addPrim({...p,r:6,cone:1});
  const mesh=Mesh.build(s),x=50.7896787367,y=31.7912092150;
  assert.ok(Math.abs(height(mesh,x,y)-s.heightAt(x,y))<.025,'retain the lower-envelope ridge, rather than joining minimum corner samples');
  assert.equal(mesh.stats.unresolved,0);
});
