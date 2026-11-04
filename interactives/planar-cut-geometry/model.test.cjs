'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./model.js'),M=require('../milling-simulator/model.js');
test('milling retains the same public primitives and exact historical arithmetic',()=>{
  assert.equal(M.segDist,G.segDist);assert.equal(M.sdCapsule,G.sdCapsule);
  // Frozen pre-extraction oracle: guards floating-point behavior used by inspection and meshing.
  function original(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;let t=0;if(l2>0){t=((px-ax)*dx+(py-ay)*dy)/l2;t=t<0?0:t>1?1:t;}const ex=px-(ax+t*dx),ey=py-(ay+t*dy);return Math.sqrt(ex*ex+ey*ey);}
  let seed=91;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32*100-50);
  for(let i=0;i<5000;i++){const a=Array.from({length:6},rand);if(i%5===0){a[4]=a[2];a[5]=a[3];}const radius=Math.abs(rand());assert.equal(G.segDist(...a),original(...a));assert.equal(G.sdCapsule(...a,radius),original(...a)-radius);}
});
test('finite tool footprint includes end discs, straight sides and a zero-length plunge',()=>{
  assert.equal(G.sdCapsule(5,2,0,0,10,0,2),0);assert.equal(G.sdCapsule(-2,0,0,0,10,0,2),0);assert.equal(G.sdCapsule(5,3,0,0,10,0,2),1);assert.equal(G.sdCapsule(3,4,0,0,0,0,2),3);
});
test('regenerated embedded worker and direct mesher produce the same cut surface',()=>{
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),Mesh=require('../milling-simulator/mesh.js');
  const sim=M.create();assert.ok(sim.loadTool('em8').ok);for(const p of [{x:40,y:30,z:5},{z:-3},{x:60}])assert.equal(sim.moveTo(p).blocked,null);assert.ok(sim.prims.length>0);
  const snapshot=JSON.parse(JSON.stringify({stock:sim.stock,prims:sim.prims,threads:sim.threads}));
  const expected=Mesh.build(snapshot),scope={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../milling-simulator/mesh-worker-source.js'),'utf8'),scope);
  let result;const worker={self:{postMessage:r=>{result=r;}}};vm.runInNewContext(scope.CourseWikiMillingWorkerSource,worker);
  worker.self.onmessage({data:{id:7,epoch:2,version:sim.version,snapshot}});
  assert.equal(result.error,undefined);assert.equal(result.id,7);assert.equal(result.epoch,2);
  assert.deepEqual(Array.from(result.mesh.positions),Array.from(expected.positions));assert.deepEqual(Array.from(result.mesh.colors),Array.from(expected.colors));
});
