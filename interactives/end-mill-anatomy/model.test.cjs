'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('./model.js'),D=require('./render.js'),A=require('../cutter-geometry/axial.js');
test('mounting changes projection without stretching catalog geometry',()=>{
  const a=M.selection({tool:'reduced',projection:75}),b=M.selection({tool:'reduced',projection:85});
  assert.equal(a.spec,b.spec);assert.equal(a.insertion,25);assert.equal(b.insertion,15);
  assert.deepEqual([a.spec.oal,a.spec.loc,a.spec.lbs],[100,20,70]);
});
test('matched OAL comparison separates long flute and reduced neck',()=>{
  const a=M.SPECS.longFlute,b=M.SPECS.reduced;
  assert.equal(a.oal,b.oal);assert.equal(a.lbs,b.lbs);assert.notEqual(a.loc,b.loc);
  assert.equal(A.section(a,40).region,'cutting');assert.equal(A.section(b,40).region,'neck');
});
test('side and static lessons carry dimensions limits and attribution',()=>{
  const side=D.side(M.SPECS.reduced,75,'test-'),lesson=D.staticLesson();
  assert.doesNotMatch(lesson,/\sid=/,'reusable static markup remains intrinsically ID-free');
  for(const text of ['LOC 20 mm','LBS 70 mm','OAL 100 mm','holder-face projection 75 mm'])assert.match(side,new RegExp(text));
  assert.match(lesson,/not a grip recommendation/);assert.match(lesson,/LBS includes LOC plus any relieved neck/);
  assert.match(lesson,/do not establish center-cutting end-face geometry/);
  assert.match(lesson,/not watertight manufacturing CAD/);
  assert.match(D.side(M.SPECS.longFlute,75,'long-'),/no reduced-neck interval/);
  assert.doesNotMatch(D.side(M.SPECS.longFlute,75,'long-'),/a reduced neck extends/);
  const narrow=A.catalog({...M.SPECS.reduced,neckDiameter:8});
  assert.notEqual(D.side(narrow,75,'narrow-'),side,'side diameters derive from the canonical axial sections');
  assert.match(side,/strokes are schematic/,'side view does not claim a measured helix projection');
  assert.ok(side.indexOf('class="ema-holder')>side.indexOf('class="ema-shank'),'opaque holder is painted after the inserted shank');
  assert.match(side,/L[^V]+ 87V177L[^ ]+ 192H55Z/,'holder nose uses the labeled face plane');
  assert.doesNotMatch(side+lesson,/NaN|undefined|Infinity/);
});
test('standalone anatomy art retains the accepted three end-profile silhouettes',()=>{
  const svg=fs.readFileSync(path.join(__dirname,'../../media/mill-setup/end-mill-anatomy.svg'),'utf8');
  assert.match(svg,/transform="translate\(0 70\)"/);
  assert.match(svg,/M112 421v85h100v-85/);assert.match(svg,/M352 421v65q0 20 20 20h60q20 0 20-20v-65/);
  assert.match(svg,/M592 421v35a50 50 0 0 0 100 0v-35/);
});
test('module manifest uses shared runtime and shared cutter geometry',()=>{
  const conf=fs.readFileSync(path.join(__dirname,'interactive.conf'),'utf8');
  assert.match(conf,/^@@REQUIRES: three-runtime, cutter-geometry$/m);
  assert.doesNotMatch(conf,/milling-simulator/);
});
test('3D scene is event driven and does not copy a vendor bundle',()=>{
  const source=fs.readFileSync(path.join(__dirname,'scene3d.js'),'utf8');
  assert.match(source,/CourseWikiThree/);assert.match(source,/CourseWikiCutterAxial/);
  assert.doesNotMatch(source,/setAnimationLoop|three-bundle|milling-simulator/);
  assert.match(source,/requestAnimationFrame\(render\)/);
});
