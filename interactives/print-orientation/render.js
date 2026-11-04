(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiPrintOrientation);
  if (node) module.exports = api; else root.CourseWikiPrintOrientationDraw = api;
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';
  if (!M) throw new Error('Print-orientation model unavailable');
  // Official palette colours used as data colours; text never sits on them.
  var COLORS = Object.freeze({ neutral: '#B9C0C8', support: '#FF4500', 'down-ok': '#ECAC00', bed: '#00A4E3', parallel: '#00A4E3', normal: '#FF4500' });
  var CLASS_LABEL = Object.freeze({ up: 'upward', vertical: 'vertical', bed: 'on the plate', 'first-layer': 'within the first layer', support: 'needs support', 'down-ok': 'downward, steep enough' });
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function n1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function n2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function int(v) { var s = String(Math.round(v)); return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function area(v) { return int(v) + ' mm²'; }
  function deg(v) { return Math.round(v) + '°'; }
  function classColor(cls) { return cls === 'support' ? COLORS.support : cls === 'down-ok' ? COLORS['down-ok'] : (cls === 'bed' || cls === 'first-layer') ? COLORS.bed : COLORS.neutral; }
  function shade(hex, k) {
    var v = parseInt(hex.slice(1), 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255;
    function c(x) { return Math.max(0, Math.min(255, Math.round(x * k))); }
    return '#' + ((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1);
  }
  function angleColor(a) {
    // 0 deg (parallel to the layer planes) lite blue to 90 deg (normal to them) red orange.
    var t = Math.max(0, Math.min(1, a / 90)), p = [0, 164, 227], q = [255, 69, 0];
    return 'rgb(' + p.map(function (x, i) { return Math.round(x + (q[i] - x) * t); }).join(',') + ')';
  }
  function describeState(s) {
    if (s.lay === 'side') return 'on its side (bend profile flat on the plate)';
    var preset = M.PRESETS.filter(function (p) { return p.lay === 'upright' && p.spin === s.spin; })[0];
    return (preset ? preset.label.toLowerCase() : 'upright, turned ' + deg(s.spin) + ' about its width');
  }

  // ---------- orthographic part view (SVG), painter-sorted faces ----------
  var EYE = (function () { var e = [0.82, -1.3, 0.95], l = Math.hypot(e[0], e[1], e[2]); return [e[0] / l, e[1] / l, e[2] / l]; })();
  var RIGHT = (function () { var r = [-EYE[1], EYE[0], 0], l = Math.hypot(r[0], r[1]); return [r[0] / l, r[1] / l, 0]; })();
  var UP = [EYE[1] * RIGHT[2] - EYE[2] * RIGHT[1], EYE[2] * RIGHT[0] - EYE[0] * RIGHT[2], EYE[0] * RIGHT[1] - EYE[1] * RIGHT[0]];
  var LIGHT = (function () { var l = [0.35, -0.55, 0.76], m = Math.hypot(l[0], l[1], l[2]); return [l[0] / m, l[1] / m, l[2] / m]; })();
  function d3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function proj(p) { return [d3(p, RIGHT), -d3(p, UP)]; }
  // ---------- BSP over the fixed part mesh (part frame) ----------
  var BSP = null;
  function planeOf(pts) {
    var n = [0, 0, 0];
    for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); }
    var l = Math.hypot(n[0], n[1], n[2]); n = [n[0] / l, n[1] / l, n[2] / l];
    return { n: n, d: d3(n, pts[0]) };
  }
  function splitBy(plane, item, front, back, coplanar) {
    var e = 1e-6, dist = item.pts.map(function (p) { return d3(plane.n, p) - plane.d; }), f = 0, b = 0;
    dist.forEach(function (x) { if (x > e) f++; else if (x < -e) b++; });
    if (!f && !b) { (coplanar || front).push(item); return; }
    if (!b) { front.push(item); return; }
    if (!f) { back.push(item); return; }
    var F = [], B = [], k = item.pts.length, closed = !item.seg;
    for (var i = 0; i < k; i++) {
      var j = (i + 1) % k, p = item.pts[i], q = item.pts[j], dp = dist[i], dq = dist[j];
      if (dp >= -e) F.push(p); if (dp <= e) B.push(p);
      if (!closed && j === 0) break;
      if ((dp > e && dq < -e) || (dp < -e && dq > e)) { var t = dp / (dp - dq), m = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])]; F.push(m); B.push(m); }
    }
    if (F.length >= (closed ? 3 : 2)) front.push(Object.assign({}, item, { pts: F }));
    if (B.length >= (closed ? 3 : 2)) back.push(Object.assign({}, item, { pts: B }));
  }
  function buildBsp(list) {
    if (!list.length) return null;
    var node = { plane: list[0].plane, polys: [list[0]], front: null, back: null }, F = [], B = [];
    for (var i = 1; i < list.length; i++) splitBy(node.plane, list[i], F, B, node.polys);
    node.front = buildBsp(F); node.back = buildBsp(B);
    return node;
  }
  function bspTree() {
    if (BSP) return BSP;
    var list = [];
    M.MESH.faces.forEach(function (f, fi) {
      var plane = planeOf(f.pts);
      if (f.pts.length === 4) list.push({ face: fi, pts: f.pts, plane: plane });
      else f.tris.forEach(function (t) { list.push({ face: fi, pts: [f.pts[t[0]], f.pts[t[1]], f.pts[t[2]]], plane: plane }); });
    });
    // Splitting on the outer walls first keeps fragments few.
    list.sort(function (a, b) { return b.pts.length - a.pts.length; });
    BSP = buildBsp(list);
    return BSP;
  }
  function bspOrder(segments, eye) {
    var out = [];
    function walk(node, segs) {
      if (!node) { segs.forEach(function (s) { out.push(s); }); return; }
      var F = [], B = [];
      segs.forEach(function (s) { splitBy(node.plane, s, F, B, F); });
      var facing = d3(node.plane.n, eye) > 0;
      walk(facing ? node.back : node.front, facing ? B : F);
      if (facing) node.polys.forEach(function (p) { if (d3(p.plane.n, eye) > 1e-9) out.push(p); });
      walk(facing ? node.front : node.back, facing ? F : B);
    }
    walk(bspTree(), segments);
    return out;
  }
  function partView(analysis, opts) {
    opts = opts || {};
    var W = opts.width || 560, H = opts.height || 430, items = [], plate = 46;
    var faces = analysis.faces;
    // Plate and grid
    var corners = [[-plate, -plate, 0], [plate, -plate, 0], [plate, plate, 0], [-plate, plate, 0]].map(proj);
    var all = corners.slice();
    faces.forEach(function (f) { f.pts.forEach(function (p) { all.push(proj(p)); }); });
    var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    all.forEach(function (p) { lo[0] = Math.min(lo[0], p[0]); lo[1] = Math.min(lo[1], p[1]); hi[0] = Math.max(hi[0], p[0]); hi[1] = Math.max(hi[1], p[1]); });
    var pad = 14, sc = Math.min((W - 2 * pad) / (hi[0] - lo[0]), (H - 2 * pad - 24) / (hi[1] - lo[1]));
    var ox = pad + ((W - 2 * pad) - (hi[0] - lo[0]) * sc) / 2 - lo[0] * sc, oy = pad + 24 + ((H - 2 * pad - 24) - (hi[1] - lo[1]) * sc) / 2 - lo[1] * sc;
    function xy(p) { var q = proj(p); return Math.round(ox + q[0] * sc) + ' ' + Math.round(oy + q[1] * sc); }
    function path(pts) { return 'M' + pts.map(xy).join('L') + 'Z'; }
    var out = '<svg class="po-view" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.aria || ('Bracket ' + describeState(analysis.state))) + '">';
    out += '<path class="po-plate" d="' + path([[-plate, -plate, 0], [plate, -plate, 0], [plate, plate, 0], [-plate, plate, 0]]) + '"/>';
    var grid = '';
    for (var g = -plate + 10; g < plate; g += 10) grid += 'M' + xy([g, -plate, 0]) + 'L' + xy([g, plate, 0]) + 'M' + xy([-plate, g, 0]) + 'L' + xy([plate, g, 0]);
    out += '<path class="po-grid" d="' + grid + '"/>';
    // Projected support footprint on the plate
    var foot = '';
    faces.forEach(function (f) { if (f.cls !== 'support') return; f.tris.forEach(function (t) { foot += path([t[0], t[1], t[2]].map(function (i) { return [f.pts[i][0], f.pts[i][1], 0]; })); }); });
    if (foot) out += '<path class="po-foot" d="' + foot + '"/>';
    // Correct back-to-front order from a BSP tree built once in the part frame; support pillars are
    // segments split and ordered by the same tree, so the part hides pillars behind it.
    var place = analysis.placement, Mt = [0, 1, 2].map(function (i) { return [0, 1, 2].map(function (j) { return place.M[j][i]; }); });
    var eyePart = [0, 1, 2].map(function (i) { return d3(Mt[i], EYE); });
    var clsByFeatureFace = analysis.faces.map(function (f) { return f.cls; });
    var pillars = opts.pillars === false ? [] : M.supportPillars(analysis, 3).map(function (p) {
      function back(w) { var q = [w[0] - place.offset[0], w[1] - place.offset[1], w[2] - place.offset[2]]; return [d3(Mt[0], q), d3(Mt[1], q), d3(Mt[2], q)]; }
      return { seg: true, pts: [back([p[0], p[1], 0]), back(p)] };
    });
    bspOrder(pillars, eyePart).forEach(function (item) {
      if (item.seg) { items.push({ svg: '<path class="po-pillar" d="M' + xy(place.toWorld(item.pts[0])) + 'L' + xy(place.toWorld(item.pts[1])) + '"/>' }); return; }
      var cls = clsByFeatureFace[item.face], wn = analysis.faces[item.face].normal;
      var fill = shade(classColor(cls), 0.62 + 0.04 * Math.round(9.5 * Math.max(0, d3(wn, LIGHT))));
      var d = 'M' + item.pts.map(function (q) { return xy(place.toWorld(q)); }).join('L') + 'Z', prev = items[items.length - 1];
      if (prev && prev.fill === fill) prev.d += d; else items.push({ fill: fill, d: d });
    });
    out += items.map(function (i) { return i.svg || '<path d="' + i.d + '" fill="' + i.fill + '" stroke="' + i.fill + '" stroke-width="0.6" stroke-linejoin="round"/>'; }).join('');
    // Fibre path and load arrow, drawn on top on whichever end face looks toward the viewer.
    var s = analysis.state;
    if (s.load !== 'none') {
      var P = M.PART, y = d3(place.M.map(function (r) { return r[1]; }), EYE) < 0 ? -0.2 : P.width + 0.2;
      var mid = P.t / 2, Cc = P.t + P.r, rm = P.r + P.t / 2, pts = [[P.arm - 2, mid]];
      pts.push([Cc, mid]);
      if (s.load === 'hang') { for (var k = 1; k <= 12; k++) { var th = (270 - 90 * k / 12) * Math.PI / 180; pts.push([Cc + rm * Math.cos(th), Cc + rm * Math.sin(th)]); } pts.push([mid, P.back - 2]); }
      var line = '';
      for (var i = 0; i + 1 < pts.length; i++) {
        var a = pts[i], b = pts[i + 1], ang = M.layerAngle([b[0] - a[0], 0, b[1] - a[1]], s);
        line += '<path class="po-fibre" style="stroke:' + (opts.revealLoad === false ? 'var(--ink-soft)' : angleColor(ang)) + '" d="M' + xy(place.toWorld([a[0], y, a[1]])) + 'L' + xy(place.toWorld([b[0], y, b[1]])) + '"/>';
      }
      var origin = s.load === 'hang' ? [P.arm - 3, P.width / 2, 0] : [P.arm, P.width / 2, P.t / 2], dir = s.load === 'hang' ? [0, 0, -1] : [1, 0, 0];
      var o = place.toWorld(origin), e = place.toWorld([origin[0] + dir[0] * 22, origin[1], origin[2] + dir[2] * 22]);
      var A = proj(o), B = proj(e), dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, hs = 9 / sc;
      var tip = [B[0], B[1]], l1 = [B[0] - ux * hs * 1.6 + uy * hs, B[1] - uy * hs * 1.6 - ux * hs], l2 = [B[0] - ux * hs * 1.6 - uy * hs, B[1] - uy * hs * 1.6 + ux * hs];
      function sp(q) { return (ox + q[0] * sc).toFixed(1) + ' ' + (oy + q[1] * sc).toFixed(1); }
      out += line + '<g class="po-arrow"><path d="M' + sp(A) + 'L' + sp(tip) + '"/><path class="po-arrow-head" d="M' + sp(tip) + 'L' + sp(l1) + 'L' + sp(l2) + 'Z"/></g>';
    }
    if (opts.title) out += '<text class="po-svg-title" x="12" y="22">' + esc(opts.title) + '</text>';
    return out + '</svg>';
  }

  // ---------- stair-step section ----------
  function stairFigure(sec, opts) {
    opts = opts || {};
    if (!sec) return '';
    var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    sec.poly.forEach(function (p) { lo[0] = Math.min(lo[0], p[0]); lo[1] = Math.min(lo[1], p[1]); hi[0] = Math.max(hi[0], p[0]); hi[1] = Math.max(hi[1], p[1]); });
    var W = 300, Hh = 300, pad = 16, sc = Math.min((W - 2 * pad) / (hi[0] - lo[0]), (Hh - 2 * pad) / (hi[1] - lo[1]));
    function X(u) { return (pad + (u - lo[0]) * sc).toFixed(1); }
    function Y(v) { return (Hh - pad - (v - lo[1]) * sc).toFixed(1); }
    function merged() {
      // Join stacked vertical step edges that share an x position (e.g. a vertical wall) into one stroke.
      var vert = {}, other = [];
      sec.boundary.forEach(function (g) { if (Math.abs(g[0][0] - g[1][0]) < 1e-9) { var k = g[0][0].toFixed(6); (vert[k] = vert[k] || []).push([Math.min(g[0][1], g[1][1]), Math.max(g[0][1], g[1][1])]); } else other.push(g); });
      Object.keys(vert).forEach(function (k) {
        var list = vert[k].sort(function (a, b) { return a[0] - b[0]; }), cur = list[0].slice(), x = Number(k);
        for (var i = 1; i < list.length; i++) { if (list[i][0] <= cur[1] + 1e-9) cur[1] = Math.max(cur[1], list[i][1]); else { other.push([[x, cur[0]], [x, cur[1]]]); cur = list[i].slice(); } }
        other.push([[x, cur[0]], [x, cur[1]]]);
      });
      return other;
    }
    function stepsPath(Xf, Yf) { return merged().map(function (s) { return 'M' + Xf(s[0][0]) + ' ' + Yf(s[0][1]) + 'L' + Xf(s[1][0]) + ' ' + Yf(s[1][1]); }).join(''); }
    function outline(Xf, Yf, feature) {
      var d = '';
      for (var i = 0; i < sec.poly.length; i++) { if (feature && sec.feat[i] !== feature) continue; var a = sec.poly[i], b = sec.poly[(i + 1) % sec.poly.length]; d += 'M' + Xf(a[0]) + ' ' + Yf(a[1]) + 'L' + Xf(b[0]) + ' ' + Yf(b[1]); }
      return d;
    }
    // Zoom windows centred on the 45-degree point of each curved face (in the part's own profile).
    var c = sec.center;
    // In the upright lay the profile turns by -spin in world x-z (x' = x cos + z sin, z' = -x sin + z cos).
    function onArc(radius) { var a0 = 225 * Math.PI / 180, x = radius * Math.cos(a0), z = radius * Math.sin(a0), s = sec.state.spin * Math.PI / 180; return [c[0] + x * Math.cos(s) + z * Math.sin(s), c[1] - x * Math.sin(s) + z * Math.cos(s)]; }
    var half = opts.half || 2.5, zooms = [{ key: 'inner-fillet', title: 'Inner fillet', at: onArc(sec.radii.inner) }, { key: 'outer-round', title: 'Outer round', at: onArc(sec.radii.outer) }];
    var over = '<svg class="po-stair-over" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Section through the bracket in a vertical plane, with ' + sec.layers.length + ' layers of ' + n2(sec.layerHeight) + ' mm. Boxes mark the two magnified curved faces.">';
    over += '<path class="po-true" d="' + outline(X, Y) + '"/><path class="po-steps" d="' + stepsPath(X, Y) + '"/>';
    zooms.forEach(function (z, i) { over += '<rect class="po-zoombox" x="' + X(z.at[0] - half) + '" y="' + Y(z.at[1] + half) + '" width="' + (2 * half * sc).toFixed(2) + '" height="' + (2 * half * sc).toFixed(2) + '"/><text class="po-zoomlabel" x="' + X(z.at[0] + half) + '" y="' + Y(z.at[1] + half) + '" dx="3" dy="10">' + (i + 1) + '</text>'; });
    over += '<path class="po-plate-line" d="M' + X(lo[0]) + ' ' + Y(0) + 'H' + X(hi[0]) + '"/></svg>';
    var zoomSvgs = zooms.map(function (z, i) {
      var S = 260, k = S / (2 * half), x0 = z.at[0] - half, y1 = z.at[1] + half;
      function ZX(u) { return ((u - x0) * k).toFixed(1); }
      function ZY(v) { return ((y1 - v) * k).toFixed(1); }
      var fills = '';
      sec.layers.forEach(function (L) {
        if (L.z1 < z.at[1] - half || L.z0 > z.at[1] + half) return;
        L.intervals.forEach(function (iv) { if (iv[1] < x0 || iv[0] > x0 + 2 * half) return; fills += '<rect class="po-layer" x="' + ZX(Math.max(iv[0], x0 - 1)) + '" y="' + ZY(L.z1) + '" width="' + ((Math.min(iv[1], x0 + 2 * half + 1) - Math.max(iv[0], x0 - 1)) * k).toFixed(2) + '" height="' + ((L.z1 - L.z0) * k).toFixed(2) + '"/>'; });
      });
      var gap = sec.gap(z.key);
      return '<figure class="po-zoom"><svg viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="' + esc(z.title + ' magnified ' + Math.round(k / sc) + ' times relative to the section: layer slabs of ' + n2(sec.layerHeight) + ' mm against the true curve; largest gap ' + n2(gap) + ' mm.') + '">' +
        '<svg x="0" y="0" width="' + S + '" height="' + S + '" viewBox="0 0 ' + S + ' ' + S + '" overflow="hidden">' + fills + '<path class="po-true is-zoom" d="' + outline(ZX, ZY) + '"/></svg>' +
        '<rect class="po-zoomframe" x="0.5" y="0.5" width="' + (S - 1) + '" height="' + (S - 1) + '"/><path class="po-scalebar" d="M12 ' + (S - 14) + 'h' + k.toFixed(2) + '"/><text class="po-scaletext" x="12" y="' + (S - 20) + '">1 mm</text></svg>' +
        '<figcaption><strong>' + (i + 1) + ' ' + z.title + '</strong>: largest gap between the true curve and the layer steps in this cut <strong>' + n2(gap) + ' mm</strong></figcaption></figure>';
    }).join('');
    return '<div class="po-stairs"><figure class="po-zoom po-zoom-over">' + over + '<figcaption>Vertical cut through the front of the bracket: thin line = CAD shape, stepped line = ' + sec.layers.length + ' layers of ' + n2(sec.layerHeight) + ' mm.</figcaption></figure>' + zoomSvgs + '</div>';
  }
  function planFigure(analysis) {
    // Side lay: every layer contains the whole bend profile; the curved faces are vertical walls.
    var place = analysis.placement, pr = M.MESH.profile, y = 0;
    var poly = pr.pts.map(function (v) { var w = place.toWorld([v[0], y, v[1]]); return [w[0], w[1]]; });
    var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    poly.forEach(function (p) { lo[0] = Math.min(lo[0], p[0]); lo[1] = Math.min(lo[1], p[1]); hi[0] = Math.max(hi[0], p[0]); hi[1] = Math.max(hi[1], p[1]); });
    var W = 300, pad = 16, sc = Math.min((W - 2 * pad) / (hi[0] - lo[0]), (W - 2 * pad) / (hi[1] - lo[1]));
    function P(p) { return (pad + (p[0] - lo[0]) * sc).toFixed(2) + ' ' + (W - pad - (p[1] - lo[1]) * sc).toFixed(2); }
    var d = 'M' + poly.map(P).join('L') + 'Z', curve = '';
    for (var i = 0; i < poly.length; i++) if (pr.feat[i] === 'inner-fillet' || pr.feat[i] === 'outer-round') curve += 'M' + P(poly[i]) + 'L' + P(poly[(i + 1) % poly.length]);
    return '<div class="po-stairs is-plan"><figure class="po-zoom po-zoom-over"><svg class="po-stair-over" viewBox="0 0 ' + W + ' ' + W + '" role="img" aria-label="Top view of one layer: the whole bend profile, including both curved faces, lies inside every layer."><path class="po-layer-plan" d="' + d + '"/><path class="po-curve" d="' + curve + '"/></svg>' +
      '<figcaption>Top view of one layer. On its side, each layer contains the whole bend, so the nozzle draws both curves within the layer. Their surfaces are vertical walls: layer height adds no steps to them.</figcaption></figure></div>';
  }

  // ---------- readouts and comparison ----------
  function supportText(a) {
    if (a.supportSum < 0.5) return 'No unsupported overhang below ' + deg(a.threshold) + '.';
    var t = area(a.supportSum) + ' of downward faces flatter than ' + deg(a.threshold) + ', projected onto the plate';
    if (a.toPart > 0.5) t += ' (' + area(a.toPart) + ' would land on the part)';
    return t + '.';
  }
  function overlapText(a) {
    if (a.supportSum < 0.5) return '';
    var tol = Math.max(3, 0.01 * a.supportSum);
    return a.overlap > tol ? 'Flagged faces overlap in plan by about ' + area(a.overlap) + '; plate footprint about ' + area(a.supportUnion) + '.' : 'Flagged faces do not overlap in plan; plate footprint about ' + area(a.supportUnion) + '.';
  }
  function loadText(load) {
    if (!load) return 'No load selected.';
    if (load.max <= 1e-6) return 'Every stretched direction lies within the layers (0°): no part of the load has to cross the bonds between layers. The road (raster) direction inside each layer is set by the slicer and is not modelled here.';
    var where = load.load === 'hang' ? 'Around the bend the stretched direction ranges from ' + deg(load.min) + ' to ' + deg(load.max) + ' from the layer planes' : 'The arm is stretched at ' + deg(load.max) + ' to the layer planes';
    return where + (load.mostlyNormal ? '. Part of it is mostly normal to the layers, so that load must cross the bonds between layers.' : '. It stays mostly within the layers; road direction inside each layer is not modelled.');
  }
  function readouts(a, sec) {
    var load = a.load, contact = a.totals.bed;
    var stair = a.state.lay === 'side' ? 'none on the curved faces (vertical walls)' : (sec ? 'inner ' + n2(sec.gap('inner-fillet')) + ' mm, outer ' + n2(sec.gap('outer-round')) + ' mm' : '—');
    return '<dl class="po-readout">' +
      '<div class="' + (a.supportSum >= 0.5 ? 'is-warn' : '') + '"><dt>Unsupported overhang (proxy)</dt><dd><strong>' + (a.supportSum >= 0.5 ? area(a.supportSum) : 'none') + '</strong><span>' + esc(supportText(a)) + ' ' + esc(overlapText(a)) + '</span></dd></div>' +
      '<div><dt>Resting on the plate</dt><dd><strong>' + (contact >= 0.5 ? area(contact) : 'edge only') + '</strong><span>' + (contact >= 0.5 ? 'Downward faces on the plate are supported by it.' : 'Only an edge or curve touches the plate: a narrow start.') + '</span></dd></div>' +
      '<div><dt>Height and layers</dt><dd><strong>' + n1(a.height) + ' mm · ' + int(a.layers) + ' layers</strong><span>⌈' + n1(a.height) + ' ÷ ' + n2(a.state.layer) + '⌉ at ' + n2(a.state.layer) + ' mm</span></dd></div>' +
      '<div class="' + (load && load.mostlyNormal ? 'is-warn' : '') + '" data-po-load-readout><dt>Load-to-layer angle</dt><dd><strong>' + (load ? 'up to ' + deg(load.max) : '—') + '</strong><span>' + esc(loadText(load)) + '</span></dd></div>' +
      '<div><dt>Layer steps on the curves</dt><dd><strong>' + esc(stair) + '</strong><span>Measured in the drawn cut; not a roughness value.</span></dd></div>' +
      '</dl>';
  }
  function consequence(a, opts) {
    // Compact, colour-keyed result placed beside the controls that change it.
    opts = opts || {};
    var L = a.load, sup = a.supportSum >= 0.5;
    var text = '<p><span class="po-swatch ' + (sup ? 'is-support' : 'is-neutral') + '"></span><strong>' + (sup ? area(a.supportSum) + ' needs support' : 'No unsupported overhang') + '</strong> at ' + deg(a.threshold) + ' · ' + n1(a.height) + ' mm · ' + int(a.layers) + ' layers' +
      (L && opts.revealLoad ? ' · load up to ' + deg(L.max) + ' from the layers' : '') + '</p>';
    return '<div class="po-consequence' + (sup ? ' is-warn' : '') + '">' + text + (opts.thumb ? partView(a, { width: 300, height: 230, pillars: true, revealLoad: !!opts.revealLoad, aria: 'Small view: bracket ' + describeState(a.state) + '; red-orange faces need support.' }) : '') + '</div>';
  }
  function compareTable(rows, opts) {
    opts = opts || {};
    var head = '<table class="po-compare"><caption>' + esc(opts.caption || 'Saved orientations') + '</caption><thead><tr><th scope="col">Orientation</th><th scope="col">Unsupported overhang (projected)</th><th scope="col">On the plate</th><th scope="col">Height · layers</th><th scope="col">Load-to-layer angle (max)</th></tr></thead><tbody>';
    return head + rows.map(function (r) {
      var a = r.analysis, L = a.load;
      return '<tr><th scope="row">' + esc(r.label) + '</th><td>' + (a.supportSum >= 0.5 ? area(a.supportSum) : 'none') + '</td><td>' + (a.totals.bed >= 0.5 ? area(a.totals.bed) : 'edge only') + '</td><td>' + n1(a.height) + ' mm · ' + int(a.layers) + '</td><td>' + (L ? deg(L.max) + ' <small>(' + esc(M.LOADS[L.load].short.toLowerCase()) + ')</small>' : '—') + '</td></tr>';
    }).join('') + '</tbody></table>';
  }
  function legend() {
    return '<ul class="po-legend"><li><span class="po-swatch is-support"></span>Needs support: downward and flatter than the threshold</li><li><span class="po-swatch is-downok"></span>Downward but at or steeper than the threshold</li><li><span class="po-swatch is-bed"></span>Resting on the plate, or inside the first layer</li><li><span class="po-swatch is-neutral"></span>Upward or vertical: never flagged</li><li><span class="po-swatch is-fibre"></span>Stretched path: blue = parallel to layers, red-orange = normal to them</li></ul>';
  }

  // ---------- complete static lesson (no-JS, search and print) ----------
  function staticLesson() {
    var a = M.analyze({ spin: 0, lay: 'upright', layer: 0.2, load: 'hang' }), b = M.analyze({ spin: 0, lay: 'side', layer: 0.2, load: 'hang' });
    var stairSec = M.section({ spin: 0, lay: 'upright', layer: 0.3 });
    return '<p><strong>Challenge:</strong> this bracket will be screwed to a wall and carry a weight hanging from its arm. Which way up should it print? Read three consequences together: overhangs that need support, the direction of the load relative to the layers, and the steps that layers leave on curved faces.</p>' +
      '<p>The bracket: arm ' + M.PART.arm + ' mm, back plate ' + M.PART.back + ' mm, both ' + M.PART.t + ' mm thick and ' + M.PART.width + ' mm wide, a ' + M.PART.r + ' mm inner fillet with a concentric ' + (M.PART.r + M.PART.t) + ' mm outer round, and a ' + M.PART.gussetT + ' mm gusset across the inside corner. These are chosen illustrative dimensions.</p>' +
      legend() +
      '<div class="po-static-grid"><figure>' + partView(a, { title: 'A. Arm flat on the plate', aria: 'Bracket standing with its arm flat on the plate and the back plate vertical. The lower half of the outer round is flagged for support; the stretched path around the bend turns from parallel to normal to the layers.' }) + readouts(a, M.section({ spin: 0, lay: 'upright', layer: 0.2 })) + '</figure>' +
      '<figure>' + partView(b, { title: 'B. On its side', aria: 'Bracket lying on its side with the bend profile flat on the plate. The gusset underside, over the open inside corner, is flagged for support; the stretched path lies in the layer planes.' }) + readouts(b, null) + '</figure></div>' +
      compareTable([{ label: 'A. Arm flat on the plate', analysis: a }, { label: 'B. On its side', analysis: b }], { caption: 'Two orientations of the same bracket, 0.20 mm layers, 45° threshold, hanging weight' }) +
      '<p><strong>What the comparison shows:</strong> standing up (A), the bend\'s stretched path must turn through the layer stack, so part of it pulls layers apart, and the lower outer round needs support. On its side (B), the stretched path lies within the layers and the curves print as vertical walls, but the gusset now overhangs the open corner. Neither is free: you choose which consequence to accept, or change the design (for example a chamfer instead of a downward-facing round, or no gusset).</p>' +
      '<h3>Layer steps on a curved face</h3>' + stairFigure(stairSec) +
      '<h3>How the numbers are worked out</h3><ul>' +
      '<li><strong>Build direction:</strong> +z, from the plate toward later layers. Layers are horizontal planes.</li>' +
      '<li><strong>Face inclination</strong> θ = arccos|n<sub>z</sub>| from the horizontal plate (0° horizontal, 90° vertical), where n is the face\'s outward unit normal. A face is downward when n<sub>z</sub> &lt; 0.</li>' +
      '<li><strong>Needs support</strong> when downward and θ is less than the threshold (45° here; 44° is flagged, 46° and exactly 45° are not). A face resting on the plate, or lying wholly within the first layer, is supported by the plate. Upward and vertical faces are never flagged.</li>' +
      '<li><strong>Unsupported-overhang proxy</strong> A<sub>s</sub> = Σ A<sub>i</sub>·|n<sub>z,i</sub>| over flagged faces: their area projected onto the plate. Example A: the outer round is flagged from ' + M.PART.width + ' × (18 sin 45° − 18 sin 5.6°) ≈ ' + area(a.supportSum) + ' (the lowest facet sits inside the first layer).</li>' +
      '<li><strong>Layers</strong> N = ⌈H ÷ h⌉. Example A: ⌈50 ÷ 0.20⌉ = 250.</li>' +
      '<li><strong>Load-to-layer angle</strong> φ = arcsin|d<sub>z</sub>| for the stretched direction d: 0° lies within the layers; 90° is normal to them and must cross the bonds between layers. Within a layer, the slicer also chooses the road (raster) direction; this model does not include it.</li>' +
      '<li><strong>Layer steps</strong>: each layer is the cut at its mid-height, extruded straight up through the layer. The figure measures the largest gap between that stepped outline and the CAD curve in one vertical cut.</li></ul>' +
      '<p><strong>Model limits:</strong> a geometric teaching model, not a slicer. The support figure is a projected-area proxy: it is not support volume, print time or a promise that a face will print. Bridging between two supported edges, support landing on the part, interface gaps, cooling and removal are not modelled. The 45° threshold is an adjustable guideline, not a universal limit. The load angle is a direction only: no strength value, failure prediction or material data.</p>';
  }

  return Object.freeze({ COLORS: COLORS, CLASS_LABEL: CLASS_LABEL, partView: partView, stairFigure: stairFigure, planFigure: planFigure,
    readouts: readouts, consequence: consequence, compareTable: compareTable, legend: legend, staticLesson: staticLesson, describeState: describeState,
    angleColor: angleColor, format: { area: area, deg: deg, n1: n1, n2: n2, int: int } });
});
