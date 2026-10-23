/* Derived display mesh. Analytic cuts and inspection remain authoritative.
   Footprints are polygonized before triangulation, so adjacent surface levels
   have separate vertices and vertical sides. No common grid interpolates a wall.
   Arc sagitta <= 0.01 mm; conical sectors preserve their analytic slope and
   intersecting floor planes preserve lower-envelope ridges. Edge/centroid
   checks report the residual surface error. These are display
   tolerances, not inspection tolerances or a proof of arbitrary CAD accuracy. */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiMillingSim,
    node ? require('./geometry-bundle.js') : root.CourseWikiMeshLib);
  if (node) module.exports = api; else root.CourseWikiMillingMesh = api;
})(typeof self !== 'undefined' ? self : this, function (M, G) {
  'use strict';
  var ARC = 0.01, HEIGHT = 0.025;
  function arcSteps(p) { var r=p.r,t=Math.min(ARC, p.cone?HEIGHT*.3/p.cone:ARC);return Math.max(12,Math.ceil(Math.PI/Math.acos(Math.max(-1,1-Math.min(t,r/8)/r)))); }
  function capsule(p, radius) {
    var r = radius == null ? p.r : radius;
    if (!(r > 1e-8)) return [];
    var n = arcSteps(p);
    var a = Math.atan2(p.by - p.ay, p.bx - p.ax), ring = [];
    for (var k = 0; k <= n; k++) {
      var t = a - Math.PI / 2 + Math.PI * k / n;
      ring.push([p.bx + r * Math.cos(t), p.by + r * Math.sin(t)]);
    }
    for (var j = 0; j <= n; j++) {
      var u = a + Math.PI / 2 + Math.PI * j / n;
      ring.push([p.ax + r * Math.cos(u), p.ay + r * Math.sin(u)]);
    }
    ring.push(ring[0].slice()); return [[ring]];
  }
  function union(shapes) {
    if (!shapes.length) return [];
    return shapes.length === 1 ? shapes[0] : G.clip.union.apply(null, shapes);
  }
  function bbox(shape) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    shape.forEach(function (poly) { poly[0].forEach(function (p) {
      b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]);
    }); }); return b;
  }
  function intersects(a, b) { return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]; }
  function area(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
  function midpoint(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  function pointKey(p) { return p[0].toFixed(8)+','+p[1].toFixed(8); }
  function edgeKey(a,b) { var x=pointKey(a),y=pointKey(b);return x<y?x+'|'+y:y+'|'+x; }
  function contains(shape,p) {
    function ringInside(r){var on=false;for(var i=0,j=r.length-1;i<r.length;j=i++)if((r[i][1]>p[1])!==(r[j][1]>p[1])&&p[0]<(r[j][0]-r[i][0])*(p[1]-r[i][1])/(r[j][1]-r[i][1])+r[i][0])on=!on;return on;}
    return shape.some(function(poly){return ringInside(poly[0])&&!poly.slice(1).some(ringInside);});
  }
  function triangles(shape) {
    var out = [];
    shape.forEach(function (poly) {
      var coords = [], holes = [];
      poly.forEach(function (ring, i) {
        if (i) holes.push(coords.length / 2);
        ring.slice(0, -1).forEach(function (p) { coords.push(p[0], p[1]); });
      });
      var ix = G.earcut(coords, holes, 2);
      for (var i = 0; i < ix.length; i += 3) {
        var t = ix.slice(i, i + 3).map(function (k) { return [coords[k * 2], coords[k * 2 + 1]]; });
        if (area(t[0], t[1], t[2]) < 0) t.reverse(); out.push(t);
      }
    }); return out;
  }
  function build(sim, options) {
    var opt = options || {}, st = sim.stock, started = Date.now();
    var stock = [[[[st.x0, st.y0], [st.x1, st.y0], [st.x1, st.y1], [st.x0, st.y1], [st.x0, st.y0]]]];
    var flats = {}, cones = [], through = [];
    sim.prims.forEach(function (p) {
      if (p.z >= st.rawTop) return;
      if (p.cone) cones.push(p);
      else (flats[p.z] || (flats[p.z] = [])).push(capsule(p));
      if (p.z <= st.bottom) {
        var radius = p.cone ? Math.min(p.r, (st.bottom - p.z) / p.cone) : p.r;
        if (radius > 0) through.push(capsule(p, radius));
      }
    });
    var open = union(through), remain = open.length ? G.clip.difference(stock, open) : stock, regions = [];
    Object.keys(flats).map(Number).sort(function (a, b) { return a - b; }).forEach(function (z) {
      if (!remain.length || z <= st.bottom) return;
      var foot = union(flats[z]), hit = G.clip.intersection(remain, foot);
      if (hit.length) regions.push({ shape: hit, flat: z, cones: [] });
      remain = G.clip.difference(remain, foot);
    });
    if (remain.length) regions.push({ shape: remain, flat: st.rawTop, cones: [] });
    // A plunge followed by a deeper/equal sweep on the same centreline adds no
    // visible surface. Remove that display redundancy without altering history.
    cones=cones.filter(function(p,i){return !cones.some(function(q,j){return i!==j&&(q.z<p.z||j>i)&&q.z<=p.z&&q.cone===p.cone&&q.r>=p.r&&M.segDist(p.ax,p.ay,q.ax,q.ay,q.bx,q.by)<1e-9&&M.segDist(p.bx,p.by,q.ax,q.ay,q.bx,q.by)<1e-9;});});
    cones.forEach(function (p) {
      var next = [];
      regions.forEach(function (region) {
        var radius = Math.min(p.r, (region.flat - p.z) / p.cone);
        if (!(radius > 0)) { next.push(region); return; }
        var foot = capsule(p, radius);
        if (!intersects(bbox(region.shape), bbox(foot))) { next.push(region); return; }
        var hit = G.clip.intersection(region.shape, foot);
        if (!hit.length) { next.push(region); return; }
        var rest = G.clip.difference(region.shape, foot);
        if (rest.length) next.push({ shape: rest, flat: region.flat, cones: region.cones });
        next.push({ shape: hit, flat: region.flat, cones: region.cones.concat([p]) });
      }); regions = next;
    });
    var pos = [], colors = [], topCount = 0, wallCount = 0, bottomCount = 0, unresolved = 0, maxError = 0;
    function emit(a, b, c, kind) {
      var cross = [(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]),
        (b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]), (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])];
      if (Math.hypot.apply(null, cross) < 1e-12) return;
      pos.push.apply(pos, a.concat(b, c));
      var color = opt.color ? opt.color((a[0]+b[0]+c[0])/3, (a[1]+b[1]+c[1])/3, (a[2]+b[2]+c[2])/3, kind) : [1,1,1];
      colors.push.apply(colors, color.concat(color, color));
      if (kind === 'top') topCount++; else if (kind === 'wall') wallCount++; else bottomCount++;
    }
    regions.forEach(function(region){region.bounds=bbox(region.shape);region.height=function(p){var h=region.flat;region.cones.forEach(function(cut){h=Math.min(h,M.primitiveFloor(cut,p[0],p[1]));});return Math.max(st.bottom,h);};});
    regions.forEach(function (region) {
      var height=region.height;
      var floors=[function(){return region.flat;}].concat(region.cones.map(function(cut){return function(p){return Math.max(st.bottom,M.primitiveFloor(cut,p[0],p[1]));};}));
      var pieces=[region.shape];
      // Partition polygons into analytic strip halves and cone sectors BEFORE
      // triangulation. Splitting an existing triangulation on every radial ray
      // multiplies invisible interior edges and makes tiny cuts expensive.
      region.cones.forEach(function(p){
        var dx=p.bx-p.ax,dy=p.by-p.ay,l=Math.hypot(dx,dy),a=l?Math.atan2(dy,dx):0,R=p.r*2;
        var r=Math.min(p.r,(region.flat-p.z)/p.cone),n=arcSteps({r:Math.max(r,1e-8),cone:p.cone}),cells=[];
        function polygon(ring){ring.push(ring[0].slice());cells.push([[ring]]);}
        if(l>1e-8){var nx=-dy/l*R,ny=dx/l*R;[-1,1].forEach(function(sign){polygon([[p.ax,p.ay],[p.bx,p.by],[p.bx+nx*sign,p.by+ny*sign],[p.ax+nx*sign,p.ay+ny*sign]]);});}
        var centers=l>1e-8?[[p.bx,p.by,a-Math.PI/2,n],[p.ax,p.ay,a+Math.PI/2,n]]:[[p.ax,p.ay,0,2*n]];
        centers.forEach(function(c){for(var k=0;k<c[3];k++){var aa=c[2]+k*Math.PI/n,bb=aa+Math.PI/n;polygon([[c[0],c[1]],[c[0]+R*Math.cos(aa),c[1]+R*Math.sin(aa)],[c[0]+R*Math.cos(bb),c[1]+R*Math.sin(bb)]]);}});
        var next=[];pieces.forEach(function(piece){var pb=bbox(piece);cells.forEach(function(cell){if(!intersects(pb,bbox(cell)))return;var hit=G.clip.intersection(piece,cell);if(hit.length)next.push(hit);});});pieces=next;
      });
      var tris=[];pieces.forEach(function(piece){tris.push.apply(tris,triangles(piece));});
      function smoothError(t){
        if(!region.cones.length)return 0;var probes=[midpoint(t[0],t[1]),midpoint(t[1],t[2]),midpoint(t[2],t[0]),[(t[0][0]+t[1][0]+t[2][0])/3,(t[0][1]+t[1][1]+t[2][1])/3]],worst=0;
        floors.slice(1).forEach(function(fn){var hs=t.map(fn),interp=[(hs[0]+hs[1])/2,(hs[1]+hs[2])/2,(hs[2]+hs[0])/2,(hs[0]+hs[1]+hs[2])/3];probes.forEach(function(p,k){worst=Math.max(worst,Math.abs(fn(p)-interp[k]));});});return worst;
      }
      var boundary=new Map();
      function top(a,b,c){
        if(Math.max(a[2],b[2],c[2])<=st.bottom+1e-8)return;
        emit(a,b,c,'top');[a,b,c].forEach(function(p,k,arr){var q=arr[(k+1)%3],key=edgeKey(p,q),old=boundary.get(key);if(old)old.count++;else boundary.set(key,{a:p,b:q,count:1});});
      }
      tris.forEach(function(t){
        var err=smoothError(t);maxError=Math.max(maxError,err);if(err>HEIGHT)unresolved++;
        var denominator=area(t[0],t[1],t[2]);if(Math.abs(denominator)<1e-14)return;
        var planes=floors.map(function(fn){return t.map(fn);}).filter(function(h,i,all){return !all.slice(0,i).some(function(q){return h.every(function(v,k){return Math.abs(v-q[k])<1e-9;});});});
        function at(h,p){var b=area(t[0],p,t[2])/denominator,c=area(t[0],t[1],p)/denominator;return h[0]*(1-b-c)+h[1]*b+h[2]*c;}
        // The minimum of linear floor planes has ridges. Clip those planes
        // explicitly; joining minimum corner heights would cut the ridges off.
        planes.forEach(function(h,i){var poly=t.slice();planes.forEach(function(other,j){if(i===j||!poly.length)return;var output=[];
          for(var k=0;k<poly.length;k++){var a=poly[k],b=poly[(k+1)%poly.length],da=at(h,a)-at(other,a),db=at(h,b)-at(other,b);if(da<=1e-9)output.push(a);if((da<0&&db>0)||(da>0&&db<0)){var f=da/(da-db);output.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]);}}
          poly=output;
        });for(var k=1;k<poly.length-1;k++)if(area(poly[0],poly[k],poly[k+1])>1e-12)top(poly[0].concat(at(h,poly[0])),poly[k].concat(at(h,poly[k])),poly[k+1].concat(at(h,poly[k+1])));});
        emit(t[2].concat(st.bottom),t[1].concat(st.bottom),t[0].concat(st.bottom),'bottom');
      });
      var originalEdges=[];region.shape.forEach(function(poly){poly.forEach(function(ring){for(var k=0;k<ring.length-1;k++)originalEdges.push([ring[k],ring[k+1]]);});});
      boundary.forEach(function(edge){
        if(edge.count!==1)return;var a=edge.a,b=edge.b,mid=midpoint(a,b),len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<1e-9)return;
        if(!originalEdges.some(function(e){return M.segDist(mid[0],mid[1],e[0][0],e[0][1],e[1][0],e[1][1])<1e-7;}))return;
        var outside=[mid[0]+(b[1]-a[1])/len*1e-6,mid[1]-(b[0]-a[0])/len*1e-6];
        var neighbor=regions.find(function(r){return r!==region&&outside[0]>=r.bounds[0]&&outside[0]<=r.bounds[2]&&outside[1]>=r.bounds[1]&&outside[1]<=r.bounds[3]&&contains(r.shape,outside);});
        var lowA=neighbor?neighbor.height(a):st.bottom,lowB=neighbor?neighbor.height(b):st.bottom,lowM=neighbor?neighbor.height(mid):st.bottom;
        if(Math.max(height(a)-lowA,height(b)-lowB,height(mid)-lowM)<1e-7)return;
        // Only the exposed height difference is a wall. Continuous cone-region
        // partitions make no wall, and wall tops are the final refined top edges.
        lowA=Math.min(lowA,a[2]);lowB=Math.min(lowB,b[2]);
        emit(a,[a[0],a[1],lowA],[b[0],b[1],lowB],'wall');emit(a,[b[0],b[1],lowB],b,'wall');
      });
    });
    return { positions:new Float32Array(pos),colors:new Float32Array(colors),
      stats:{regions:regions.length,triangles:pos.length/9,top:topCount,wall:wallCount,bottom:bottomCount,
        arcError:ARC,heightProbeError:maxError,unresolved:unresolved,milliseconds:Date.now()-started},open:open };
  }
  return { build:build,capsule:capsule,ARC_ERROR:ARC,HEIGHT_ERROR:HEIGHT };
});
