(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('../backlash-kinematics/model.js') : root.CourseWikiBacklashKinematics,
    node ? require('../planar-cut-geometry/model.js') : root.CourseWikiPlanarCut);
  if (node) module.exports = api; else root.CourseWikiBacklashMilling = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (K, G) {
  'use strict';
  const PROFILES = Object.freeze({ circle: { label: 'Circle', hx: 12, hy: 12, corner: 12 }, rectangle: { label: 'Rectangle', hx: 12, hy: 9, corner: 0 }, rounded: { label: 'Rounded rectangle', hx: 12, hy: 9, corner: 4 } });
  const DEFAULTS = Object.freeze({ shape: 'circle', bx: .5, by: .5, winding: 1, start: 0, seat: 1, radius: 2, cell: .1, angleStep: 1 });
  const EXTENT = 20, NEVER = 65535;
  function options(input) {
    const s = Object.assign({}, DEFAULTS, input);
    if (!PROFILES[s.shape] || ![1,-1].includes(s.winding) || ![1,-1].includes(s.seat) || ![0,1,2,3].includes(s.start)) throw new RangeError('Unknown shape or history setting.');
    if (![s.bx,s.by,s.radius,s.cell,s.angleStep].every(Number.isFinite) || s.bx < 0 || s.bx > 1 || s.by < 0 || s.by > 1 || s.radius < 1 || s.radius > 3 || s.cell < .025 || s.cell > .5 || s.angleStep < .25 || s.angleStep > 5) throw new RangeError('Geometry is outside this teaching model.');
    return s;
  }
  // Rounded rectangles include the sharp-cornered rectangle and circle as limiting cases.
  // Tool-centre path = outward parallel curve at one tool radius, NOT the island outline.
  function outline(shape, offset, angleStep) {
    const p = PROFILES[shape]; if (!p) throw new RangeError('Unknown profile.');
    const hx=p.hx+offset, hy=p.hy+offset, cr=p.corner+offset, cx=hx-cr, cy=hy-cr;
    const pts=[[hx,0]];
    function line(x,y) { const a=pts[pts.length-1], n=Math.max(1,Math.ceil(Math.hypot(x-a[0],y-a[1])/.25)); for(let i=1;i<=n;i++)pts.push([a[0]+(x-a[0])*i/n,a[1]+(y-a[1])*i/n]); }
    function arc(x,y,from) { const n=Math.ceil(90/(angleStep||1)); for(let i=1;i<=n;i++){const t=(from+90*i/n)*Math.PI/180;pts.push([x+cr*Math.cos(t),y+cr*Math.sin(t)]);} }
    line(hx,cy);arc(cx,cy,0);line(-cx,hy);arc(-cx,cy,90);line(-hx,-cy);arc(-cx,-cy,180);line(cx,-hy);arc(cx,-cy,270);line(hx,0);
    const clean=[];for(const q of pts)if(!clean.length||Math.hypot(q[0]-clean.at(-1)[0],q[1]-clean.at(-1)[1])>1e-10)clean.push(q);
    clean[clean.length-1]=clean[0].slice();return clean;
  }
  function commandPath(s) {
    const raw=outline(s.shape,s.radius,s.angleStep).slice(0,-1), p=PROFILES[s.shape];
    const starts=[[p.hx+s.radius,0],[0,p.hy+s.radius],[-p.hx-s.radius,0],[0,-p.hy-s.radius]];
    let at=0,best=Infinity;raw.forEach((q,i)=>{const d=Math.hypot(q[0]-starts[s.start][0],q[1]-starts[s.start][1]);if(d<best){best=d;at=i;}});
    return Array.from({length:raw.length+1},(_,i)=>raw[(at+s.winding*i+raw.length*2)%raw.length].slice());
  }
  // A command chord is monotonic in each axis. Split where either play interval first
  // reaches the held position; the actual cutter then follows exact piecewise-linear legs.
  // Joining only the final actual positions would cut a diagonal that never happened.
  function moveSegment(actual, q0, q1, clearance, seat) {
    const ts=[0,1];
    for(let k=0;k<2;k++){
      const d=q1[k]-q0[k], low=seat>0?0:-clearance[k], high=seat>0?clearance[k]:0;
      if(d){const t=(actual[k]-q0[k]-(d>0?low:high))/d;if(t>1e-12&&t<1-1e-12)ts.push(t);}
    }
    ts.sort((a,b)=>a-b);const times=ts.filter((t,i)=>!i||t-ts[i-1]>1e-12);
    const points=times.map(t=>q0.map((v,k)=>{const q=t===1?q1[k]:t===0?v:v+(q1[k]-v)*t;return K.clampBetween(actual[k],q+(seat>0?0:-clearance[k]),q+(seat>0?clearance[k]:0));}));
    return {points,times,end:points.at(-1)};
  }
  function sweep(input) {
    const s=options(input), command=commandPath(s), groups=[], actual=[command[0].slice()], cumulative=[0];
    for(let i=1;i<command.length;i++){
      const m=moveSegment(actual.at(-1),command[i-1],command[i],[s.bx,s.by],s.seat), legs=[];
      for(let k=1;k<m.points.length;k++){legs.push([m.points[k-1],m.points[k]]);actual.push(m.points[k]);}
      groups.push({command:[command[i-1],command[i]],legs,end:m.end});cumulative.push(cumulative.at(-1)+Math.hypot(command[i][0]-command[i-1][0],command[i][1]-command[i-1][1]));
    }
    return {s,command,actual,groups,cumulative,total:cumulative.at(-1)};
  }
  // The raster is only a display and area estimate. Each cell is classified by the same
  // exact capsule query used by the milling simulator; first-hit times preserve removal.
  function raster(data) {
    const cell=40/Math.round(40/data.s.cell), n=Math.round(40/cell), nominal=new Uint16Array(n*n), actual=new Uint16Array(n*n);
    nominal.fill(NEVER);actual.fill(NEVER);
    function stamp(field,leg,time){const a=leg[0],b=leg[1],r=data.s.radius;
      const lo=[Math.min(a[0],b[0])-r,Math.min(a[1],b[1])-r],hi=[Math.max(a[0],b[0])+r,Math.max(a[1],b[1])+r];
      const x0=Math.max(0,Math.floor((lo[0]+EXTENT)/cell)),x1=Math.min(n-1,Math.floor((hi[0]+EXTENT)/cell)),y0=Math.max(0,Math.floor((lo[1]+EXTENT)/cell)),y1=Math.min(n-1,Math.floor((hi[1]+EXTENT)/cell));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const k=y*n+x;if(field[k]!==NEVER)continue;const px=-EXTENT+(x+.5)*cell,py=-EXTENT+(y+.5)*cell;if(G.sdCapsule(px,py,...a,...b,r)<=1e-10)field[k]=time;}
    }
    stamp(nominal,[data.command[0],data.command[0]],0);stamp(actual,[data.command[0],data.command[0]],0);
    data.groups.forEach((g,i)=>{stamp(nominal,g.command,i+1);g.legs.forEach(l=>stamp(actual,l,i+1));});
    return {cell,n,nominal,actual};
  }
  function areas(grid,index) {
    let extra=0,missed=0,removed=0;
    for(let i=0;i<grid.actual.length;i++){const a=grid.actual[i]<=index,n=grid.nominal[i]<=index;if(a)removed++;if(a&&!n)extra++;if(n&&!a)missed++;}
    const a=grid.cell*grid.cell;return {extra:extra*a,missed:missed*a,removed:removed*a};
  }
  // Exact intersection of a capsule with a horizontal measurement line: two end
  // discs plus the rectangular middle. For a vertical section, swap the coordinates.
  function capsuleIntervals(leg,r,axis,fixed) {
    const swap=p=>axis===0?p:[p[1],p[0]],a=swap(leg[0]),b=swap(leg[1]),out=[];
    for(const p of [a,b]){const d=r*r-(fixed-p[1])**2;if(d>=-1e-12){const h=Math.sqrt(Math.max(0,d));out.push([p[0]-h,p[0]+h]);}}
    const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);if(!L)return out;
    const ux=dx/L,uy=dy/L;let lo=-Infinity,hi=Infinity;
    function constrain(k,c,min,max){if(Math.abs(k)<1e-14){if(c<min-1e-12||c>max+1e-12)lo=Infinity;return;}const p=(min-c)/k,q=(max-c)/k;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));}
    constrain(ux,-ux*a[0]+uy*(fixed-a[1]),0,L);constrain(-uy,uy*a[0]+ux*(fixed-a[1]),-r,r);
    if(lo<=hi)out.push([lo,hi]);return out;
  }
  function sectionSpan(legs,r,axis) {
    let left=-Infinity,right=Infinity;
    for(const leg of legs)for(const iv of capsuleIntervals(leg,r,axis,0)){
      if(iv[0]<=0&&iv[1]>=0)return null;
      if(iv[1]<0)left=Math.max(left,iv[1]);if(iv[0]>0)right=Math.min(right,iv[0]);
    }
    return Number.isFinite(left)&&Number.isFinite(right)?{left,right,width:right-left,centre:(right+left)/2}:null;
  }
  function measurements(data,index) {
    const actual=data.groups.slice(0,index).flatMap(g=>g.legs),nominal=data.groups.slice(0,index).map(g=>g.command);
    actual.unshift([data.command[0],data.command[0]]);nominal.unshift([data.command[0],data.command[0]]);
    return [0,1].map(axis=>{const a=sectionSpan(actual,data.s.radius,axis),n=sectionSpan(nominal,data.s.radius,axis);return {actual:a,nominal:n,error:a&&n?a.width-n.width:null};});
  }
  function indexAt(data,fraction) {const distance=Math.max(0,Math.min(1,fraction))*data.total;let i=0;while(i<data.groups.length&&data.cumulative[i+1]<=distance+1e-10)i++;return i;}
  function removedAt(data,x,y,index) {
    if(G.sdCapsule(x,y,...data.command[0],...data.command[0],data.s.radius)<=0)return true;
    return data.groups.slice(0,index).some(g=>g.legs.some(l=>G.sdCapsule(x,y,...l[0],...l[1],data.s.radius)<=0));
  }
  return Object.freeze({PROFILES,DEFAULTS,EXTENT,NEVER,options,outline,commandPath,moveSegment,sweep,raster,areas,capsuleIntervals,sectionSpan,measurements,indexAt,removedAt});
});
