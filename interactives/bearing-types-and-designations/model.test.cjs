'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('./model.js'),D=require('./render.js');
test('NSK source-checked envelopes preserve the same bore without inventing OD or width arithmetic',()=>{
  const rows=[['6005',25,47,12,'1','0'],['6205',25,52,15,'0','2'],['6305',25,62,17,'0','3']];
  for(const[code,d,od,w,ws,ds]of rows){const r=M.lookup(code);assert.equal(r.supported,true);assert.deepEqual([r.row.d,r.row.D,r.row.B,r.row.widthSeries,r.row.diameterSeries],[d,od,w,ws,ds]);assert.match(r.row.source,new RegExp('/'+code+'-apn.html$'));assert.equal(M.bore(code),d);}
  assert.equal(M.catalog[1].D-M.catalog[0].D,5);assert.equal(M.catalog[2].D-M.catalog[1].D,10);
});
test('ordinary supported metric bore pattern handles boundaries and refuses unrelated systems',()=>{
  for(const [c,d]of[['6200',10],['6201',12],['6202',15],['6203',17],['6204',20],['6205',25],['6296',480]])assert.equal(M.bore(c),d);
  for(const c of['6297','688','63/22','R4','NU205','52205','6205ZZ','6205/C3','ABC','6205.0',''])assert.equal(M.bore(c),null,c);
});
test('unlisted and suffixed orders stay unsupported: no plausible catalog substitution',()=>{
  for(const c of['6200','6206','30205','6205ZZ','6205 C3','6205P6',null,'<script>']){const r=M.lookup(c);assert.equal(r.supported,false);assert.equal(r.row,undefined);}
  assert.equal(M.lookup(' 6205 ').row.code,'6205');assert.ok(Object.isFrozen(M.catalog[0]));
});
test('boundary drawings use constant scale and exact bore/OD/width extents',()=>{
  for(const row of M.catalog){const s=D.dimensionSvg(row);assert.ok(s.includes('r="'+row.D*1.5+'"'));assert.ok(s.includes('r="'+row.d*1.5+'"'));assert.ok(s.includes('width="'+row.B*3+'"'));assert.match(s,/Boundary envelope, internal parts omitted/);}
});
test('the complete family set has finite, ID-free reusable drawings and explicit load limits',()=>{
  assert.equal(M.families.length,12);assert.equal(new Set(M.families.map(f=>f.id)).size,12);
  for(const f of M.families){const svg=D.familySvg(f);assert.doesNotMatch(svg,/NaN|Infinity|\bid=/);assert.match(svg,/<title>/);assert.match(svg,/viewBox="0 0 480 540"/);}
  assert.equal(M.families.find(f=>f.id==='thrust-ball').radial,false);
  assert.equal(M.families.find(f=>f.id==='cylindrical').axial,0);
  assert.match(M.families.find(f=>f.id==='thrust-spherical').note,/while axial load is present/);
  assert.equal((D.atlas().match(/\[\[img:/g)||[]).length,12);
  assert.throws(()=>D.familySvg('unknown'),RangeError);
});
test('angular-contact raceways are tangent at the inclined load line and do not intersect the ball',()=>{
  const g=D.angularGeometry(),v=[Math.sin(35*Math.PI/180),-Math.cos(35*Math.PI/180)];
  for(const [race,sign]of[[g.outer,1],[g.inner,-1]]){
    const P=[g.ball.x+sign*19*v[0],g.ball.y+sign*19*v[1]],dx=P[0]-race.x,dy=P[1]-race.y;
    assert.ok(Math.abs(Math.hypot(dx,dy)-22)<1e-10,'contact lies on groove circle');
    assert.ok(Math.abs(dx*v[1]-dy*v[0])<1e-10,'groove normal follows contact line');
    assert.ok(Math.abs(Math.hypot(race.x-235,race.y-101)+19-22)<1e-10,'internal circle tangency');
    for(let a=0;a<360;a++){const t=a*Math.PI/180,x=235+19*Math.cos(t),y=101+19*Math.sin(t);assert.ok(Math.hypot(x-race.x,y-race.y)<=22+1e-10,'ball stays inside groove cavity');}
  }
  for(const [left,right]of[g.outerArc,g.innerArc]){assert.ok(left[0]<216);assert.ok(right[0]>254);}
  const svg=D.familySvg('angular-contact');assert.ok(svg.includes(g.outerPath));assert.ok(svg.includes(g.innerPath));
  // The normal's axial component is positive at the outer contact for +X thrust.
  assert.ok(g.normal[0]>0&&g.normal[1]<0);
});
