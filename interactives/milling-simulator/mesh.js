/* Derived display mesh. Analytic cuts and inspection remain authoritative.
   Footprints are polygonized before triangulation, so adjacent surface levels
   have separate vertices and vertical sides. No common grid interpolates a wall.
   Arc sagitta <= 0.01 mm; curved top triangles are refined against the shared
   primitive floor query to 0.025 mm at edge/centroid probes. These are display
   tolerances, not inspection tolerances or a proof of arbitrary CAD accuracy. */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiMillingSim,
    node ? require('./geometry-bundle.js') : root.CourseWikiMeshLib);
  if (node) module.exports = api; else root.CourseWikiMillingMesh = api;
})(typeof self !== 'undefined' ? self : this, function (M, G) {
  'use strict';
  var ARC = 0.01, HEIGHT = 0.025;
  function capsule(p, radius) {
    var r = radius == null ? p.r : radius;
    if (!(r > 1e-8)) return [];
    var n = Math.max(12, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - Math.min(ARC, r / 8) / r))));
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
  function seed(tris, point) {
    var out = [];
    tris.forEach(function (t) {
      var v = [area(t[0], t[1], point), area(t[1], t[2], point), area(t[2], t[0], point)];
      if (Math.min.apply(null, v) < -1e-9 || t.some(function (p) { return Math.hypot(p[0] - point[0], p[1] - point[1]) < 1e-8; })) { out.push(t); return; }
      for (var k = 0; k < 3; k++) if (v[k] > 1e-10) out.push([t[k], t[(k + 1) % 3], point]);
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
    regions.forEach(function (region) {
      function height(p) {
        var h = region.flat;
        region.cones.forEach(function (cut) { h = Math.min(h, M.primitiveFloor(cut, p[0], p[1])); });
        return Math.max(st.bottom, h);
      }
      var tris = triangles(region.shape);
      region.cones.forEach(function (p) { tris = seed(tris, [p.ax, p.ay]); tris = seed(tris, [p.bx, p.by]); });
      function surface(t, depth) {
        var hs = t.map(height), ab = midpoint(t[0],t[1]), bc = midpoint(t[1],t[2]), ca = midpoint(t[2],t[0]);
        var mid = [(t[0][0]+t[1][0]+t[2][0])/3,(t[0][1]+t[1][1]+t[2][1])/3];
        var err = region.cones.length ? Math.max(Math.abs(height(ab)-(hs[0]+hs[1])/2), Math.abs(height(bc)-(hs[1]+hs[2])/2),
          Math.abs(height(ca)-(hs[2]+hs[0])/2),Math.abs(height(mid)-(hs[0]+hs[1]+hs[2])/3)) : 0;
        if (err > HEIGHT && depth < 9) {
          surface([t[0],ab,ca],depth+1); surface([ab,t[1],bc],depth+1); surface([ca,bc,t[2]],depth+1); surface([ab,bc,ca],depth+1); return;
        }
        maxError = Math.max(maxError,err); if (err > HEIGHT) unresolved++;
        if (Math.max.apply(null,hs) > st.bottom+1e-8) emit(t[0].concat(hs[0]),t[1].concat(hs[1]),t[2].concat(hs[2]),'top');
      }
      tris.forEach(function (t) {
        surface(t,0);
        emit(t[2].concat(st.bottom),t[1].concat(st.bottom),t[0].concat(st.bottom),'bottom');
      });
      region.shape.forEach(function (poly) { poly.forEach(function (ring) {
        for (var k=0;k<ring.length-1;k++) {
          var a=ring[k],b=ring[k+1],ha=height(a),hb=height(b);
          // Interior coincident faces are occluded by the adjacent solid. Keeping
          // each region closed gives explicit step walls and no open top seams.
          emit(a.concat(ha),a.concat(st.bottom),b.concat(st.bottom),'wall');
          emit(a.concat(ha),b.concat(st.bottom),b.concat(hb),'wall');
        }
      }); });
    });
    return { positions:new Float32Array(pos),colors:new Float32Array(colors),
      stats:{regions:regions.length,triangles:pos.length/9,top:topCount,wall:wallCount,bottom:bottomCount,
        arcError:ARC,heightProbeError:maxError,unresolved:unresolved,milliseconds:Date.now()-started},open:open };
  }
  return { build:build,capsule:capsule,ARC_ERROR:ARC,HEIGHT_ERROR:HEIGHT };
});
