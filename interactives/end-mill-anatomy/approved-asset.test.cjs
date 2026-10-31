'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const T=require('../three-runtime/three-bundle.js'),A=require('./approved-asset.js');
test('approved GLB identity, units, mesh and semantic anchors survive the production loader',async()=>{
 const bytes=Buffer.from(A.base64,'base64');assert.equal(bytes.length,953120);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),A.sha256);
 assert.deepEqual(bytes,fs.readFileSync(require('node:path').join(__dirname,'../../media/mill-setup/endmill-review-v6/endmill.glb')));
 assert.notEqual(crypto.createHash('sha256').update(Buffer.concat([bytes,Buffer.from([0])])).digest('hex'),A.sha256);
 const gltf=await new T.GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 gltf.scene.rotation.x=Math.PI/2;gltf.scene.scale.setScalar(1000);gltf.scene.updateMatrixWorld(true);
 const box=new T.Box3().setFromObject(gltf.scene);assert.ok(Math.abs(box.max.z-76)<.001);assert.ok(Math.abs(box.max.x-box.min.x-12)<.001);
 let count=0,triangles=0;gltf.scene.traverse(o=>{if(o.isMesh){count++;triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;}});
 assert.equal(count,3,'the official loader preserves the three authored material primitives');assert.equal(triangles,48804);
 assert.ok(gltf.scene.getObjectByName('EndMill_12mm_4F_30deg'));
 for(const [name,expected] of Object.entries(A.anchors)){
  const n=gltf.scene.getObjectByName('anchor_'+name);assert.ok(n,name);const p=n.getWorldPosition(new T.Vector3());
  expected.forEach((x,i)=>assert.ok(Math.abs(p.getComponent(i)-x)<.001,name+' transform'));
 }
 assert.equal(A.specification.reduced_neck,false);assert.equal(A.specification.length_of_cut_mm,26);
});
