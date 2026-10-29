/* Pure axial end-mill geometry. Three-independent by design.
   z=0 is the tool tip; z increases toward the shank end. */
(function (root, factory) {
  'use strict';
  var api = factory(typeof module === 'object' && module.exports ? require('./cutter.js') : root.CourseWikiCutter);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiCutterAxial = api;
})(typeof self !== 'undefined' ? self : this, function (Cutter) {
  'use strict';
  var TAU = Math.PI * 2;
  function finite(value, name) {
    if (!Number.isFinite(value)) throw new RangeError(name + ' must be finite');
    return value;
  }
  function catalog(input) {
    if (input && input.__axialCatalog === true) return input;
    var s = Object.assign({}, input || {});
    ['oal','loc','lbs','cutterDiameter','shankDiameter','neckDiameter','helixDeg','flutes'].forEach(function (key) { finite(s[key], key); });
    if (!(s.oal > 0 && s.loc > 0 && s.loc <= s.lbs && s.lbs < s.oal)) throw new RangeError('Require 0 < LOC <= LBS < OAL so the tool has a plain shank');
    if (!(s.cutterDiameter > 0 && s.shankDiameter > 0 && s.neckDiameter > 0)) throw new RangeError('Diameters must be positive');
    if (!Number.isInteger(s.flutes) || s.flutes < 2 || s.flutes > 8) throw new RangeError('Flutes must be an integer from 2 to 8');
    if (!(s.helixDeg > 0 && s.helixDeg < 60)) throw new RangeError('Helix angle must be between 0 and 60 degrees');
    if (s.lbs > s.loc && !(s.neckDiameter < s.shankDiameter && s.neckDiameter <= s.cutterDiameter)) throw new RangeError('A reduced neck must be smaller than the shank and no larger than the cutter');
    if (s.lbs === s.loc && Math.abs(s.neckDiameter - s.shankDiameter) > 1e-9) throw new RangeError('A tool without neck length uses the shank diameter after LOC');
    s.pitchDeg = 360 / s.flutes;
    Object.defineProperty(s, '__axialCatalog', { value: true, enumerable: false });
    return Object.freeze(s);
  }
  function mounting(spec, projection) {
    spec = catalog(spec); finite(projection, 'Holder-face projection');
    if (!(projection >= spec.lbs && projection < spec.oal)) throw new RangeError('Holder face must lie on the plain shank, at or beyond LBS and before the shank end');
    return Object.freeze({ spec: spec, projection: projection, insertion: spec.oal - projection });
  }
  function toothAngles(spec, z) {
    spec = catalog(spec); finite(z, 'Axial position');
    var twist = Math.min(Math.max(z, 0), spec.loc) * Math.tan(spec.helixDeg * Math.PI / 180) / (spec.cutterDiameter / 2);
    return Array.from({ length: spec.flutes }, function (_, i) { return { psi: i * TAU / spec.flutes + twist, engaged: false }; });
  }
  function rotatePoint(p, angle) {
    var c = Math.cos(angle), s = Math.sin(angle);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
  }
  function radialRing(points, radius) {
    return points.map(function (p) {
      var d = Math.hypot(p.x, p.y) || 1;
      return { x: radius * p.x / d, y: radius * p.y / d };
    });
  }
  function circle(count, radius) {
    return Array.from({ length: count }, function (_, i) {
      var a = i * TAU / count; return { x: radius * Math.cos(a), y: radius * Math.sin(a) };
    });
  }
  function section(spec, z, count) {
    spec = catalog(spec); finite(z, 'Axial position');
    if (z < 0 || z > spec.oal) throw new RangeError('Axial position must lie on the tool');
    var baseTeeth = Array.from({ length: spec.flutes }, function (_, i) { return { psi: i * TAU / spec.flutes, engaged: false }; });
    var canonical = Cutter.geometry({ radius: spec.cutterDiameter / 2, teeth: baseTeeth });
    count = count || canonical.outline.length;
    if (count !== canonical.outline.length) throw new RangeError('Section count must preserve the canonical cutter outline identity');
    if (z <= spec.loc + 1e-9) {
      // Rotate one canonical outline instead of regenerating sorted flutes at
      // each z. Vertex i therefore remains the same surface point through wrap.
      var twist = z * Math.tan(spec.helixDeg * Math.PI / 180) / (spec.cutterDiameter / 2);
      return Object.freeze({ z: z, region: 'cutting',
        points: canonical.outline.map(function (p) { return rotatePoint(p, twist); }),
        tips: canonical.tips.map(function (p) { return rotatePoint(p, twist); }) });
    }
    var diameter = z < spec.lbs - 1e-9 ? spec.neckDiameter : spec.shankDiameter;
    return Object.freeze({ z: z, region: z < spec.lbs - 1e-9 ? 'neck' : 'shank',
      points: circle(count, diameter / 2) });
  }
  function axialStations(spec, cuttingSegments) {
    spec = catalog(spec);
    cuttingSegments = cuttingSegments === undefined ? 18 : cuttingSegments;
    if (!Number.isInteger(cuttingSegments) || cuttingSegments < 4 || cuttingSegments > 72) throw new RangeError('Cutting segments must be an integer from 4 to 72');
    var zs = Array.from({ length: cuttingSegments + 1 }, function (_, i) { return spec.loc * i / cuttingSegments; });
    function add(z) { if (!zs.some(function (v) { return Math.abs(v - z) < 1e-9; })) zs.push(z); }
    if (spec.oal > spec.loc) {
      add(spec.loc + Math.min(0.001, (spec.oal - spec.loc) / 1000));
    }
    if (spec.lbs > spec.loc) {
      add(spec.lbs - Math.min(0.001, (spec.lbs - spec.loc) / 1000));
    }
    add(spec.lbs); add(spec.oal);
    return zs.sort(function (a, b) { return a - b; });
  }
  function mesh(spec, options) {
    spec = catalog(spec); options = options || {};
    if (typeof options.triangulate !== 'function') throw new RangeError('Mesh generation requires an injected polygon triangulator');
    var cuttingSegments = options.cuttingSegments === undefined ? 18 : options.cuttingSegments;
    if (!Number.isInteger(cuttingSegments) || cuttingSegments < 4 || cuttingSegments > 72) throw new RangeError('Cutting segments must be an integer from 4 to 72');
    var first = section(spec, 0), n = first.points.length, positions = [], indices = [], groups = [], components = [];
    function addComponent(region, rings) {
      var base=positions.length/3, count=rings[0].points.length, start=indices.length;
      rings.forEach(function (ring) { ring.points.forEach(function (p) { positions.push(p.x,p.y,ring.z); }); });
      for (var j=0;j<rings.length-1;j++) for (var i=0;i<count;i++) {
        var a=base+j*count+i,b=base+j*count+(i+1)%count,c=base+(j+1)*count+(i+1)%count,d=base+(j+1)*count+i;
        indices.push(a,b,c,a,c,d);
      }
      var bottom=options.triangulate(rings[0].points),top=options.triangulate(rings[rings.length-1].points),last=base+(rings.length-1)*count;
      function signedArea(points) {
        var sum=0;for(var i=0;i<points.length;i++){var p=points[i],q=points[(i+1)%points.length];sum+=p.x*q.y-q.x*p.y;}return sum/2;
      }
      function validTriangles(triangles, points) {
        if(!Array.isArray(triangles)||triangles.length!==points.length-2)return false;
        var polygonArea=signedArea(points),sign=Math.sign(polygonArea),sum=0,scale=Math.max(1,Math.abs(polygonArea));
        if(!sign)return false;
        for(var k=0;k<triangles.length;k++){
          var t=triangles[k];
          if(!Array.isArray(t)||t.length!==3||!t.every(function(i){return Number.isInteger(i)&&i>=0&&i<count;})||new Set(t).size!==3)return false;
          var triangleArea=signedArea(t.map(function(i){return points[i];}));
          if(Math.sign(triangleArea)!==sign||Math.abs(triangleArea)<=scale*1e-12)return false;
          sum+=triangleArea;
        }
        return Math.abs(sum-polygonArea)<=scale*1e-9;
      }
      if (!validTriangles(bottom,rings[0].points)||!validTriangles(top,rings[rings.length-1].points)) throw new Error('Injected triangulator must return a complete same-winding area-conserving polygon triangulation');
      bottom.forEach(function(t){indices.push(base+t[0],base+t[2],base+t[1]);});
      top.forEach(function(t){indices.push(last+t[0],last+t[1],last+t[2]);});
      groups.push(Object.freeze({region:region,start:start,count:indices.length-start}));
      components.push(Object.freeze({region:region,vertexStart:base,vertexCount:rings.length*count,ringSize:count,ringCount:rings.length,z0:rings[0].z,z1:rings[rings.length-1].z}));
    }
    var cuttingRings=Array.from({length:cuttingSegments+1},function(_,i){return section(spec,spec.loc*i/cuttingSegments,n);});
    addComponent('cutting',cuttingRings);
    var roundCount=Math.max(48,spec.flutes*12);
    if (spec.lbs>spec.loc) addComponent('neck',[
      {z:spec.loc,points:circle(roundCount,spec.neckDiameter/2)},
      {z:spec.lbs,points:circle(roundCount,spec.neckDiameter/2)}
    ]);
    addComponent('shank',[
      {z:spec.lbs,points:circle(roundCount,spec.shankDiameter/2)},
      {z:spec.oal,points:circle(roundCount,spec.shankDiameter/2)}
    ]);
    return Object.freeze({ spec:spec,positions:positions,indices:indices,groups:groups,components:components,
      triangles:indices.length/3,note:'Separate closed cutting, neck and shank display solids meet at shoulders. Caps close display solids and do not establish center-cutting end-face geometry.' });
  }
  function anchors(spec, projection) {
    var mounted = mounting(spec, projection), s = mounted.spec;
    return Object.freeze({ tip: 0, loc: s.loc, lbs: s.lbs, oal: s.oal, neckStart: s.lbs > s.loc ? s.loc : null,
      holderFace: mounted.projection, projection: mounted.projection, insertion: mounted.insertion });
  }
  return Object.freeze({ catalog: catalog, mounting: mounting, toothAngles: toothAngles, section: section,
    axialStations: axialStations, mesh: mesh, anchors: anchors });
});
