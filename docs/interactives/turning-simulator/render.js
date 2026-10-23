/* ============================================================================
   turning-simulator / render.js - the simulator's pictures, as SVG strings.

   Pure functions of the model's state, so the same code draws the live view,
   the page's printed figures and the tests' expectations. No DOM here.

   THE VIEW is the lathe seen from the front, in one of two views of the work,
   each drawn whole:
     'section'  the work cut in half along its centerline, the way a section
                drawing shows a part: metal hatched, a hole open, a thread or
                knurl as its profile
     'normal'   the outside of the work as it looks on the machine, with its
                thread and knurl; a hole is a dashed hidden line, and a tool
                inside the work is hidden behind it
   Tools on the cross slide come in from above, in the plane the section is
   cut on, so the tool and the metal it touches are in the same plane.
   The tool outlines are drawn from the model's own edge functions.

   Colours are classes only; demo.css maps them to theme tokens.
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiTurning);
  if (node) { module.exports = api; } else { root.CourseWikiTurningRender = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  if (!M) { return null; }

  var S = 160;            // SVG units per inch in the lathe view
  var COL = M.COL;
  var TOP = 3;            // how far up (in) a holder or shank is drawn

  function r1(v) { var n = Math.round(v * 10) / 10; return (Object.is(n, -0) ? 0 : n); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  /* ---- the view's frame ----------------------------------------------------*/
  function frame(T, toolId) {
    var R = T.stock.dia / 2;
    if (toolId === 'knurl') { return box(T.stock.zJaw - 0.62, 0.85, -(R + 0.85), R + 0.85, R); }
    return box(T.stock.zJaw - 0.62, 0.85, -(R + 0.34), R + 0.74, R);
  }
  function box(zMin, zMax, rMin, rMax, R) {
    var f = { S: S, R: R, zMin: zMin, zMax: zMax, rMax: rMax, rMin: rMin };
    f.W = r1((f.zMax - f.zMin) * S); f.H = r1((f.rMax - f.rMin) * S);
    f.x = function (z) { return r1((z - f.zMin) * S); };
    f.y = function (r) { return r1((f.rMax - r) * S); };
    f.z = function (x) { return x / S + f.zMin; };
    f.r = function (y) { return f.rMax - y / S; };
    return f;
  }

  /* ---- the work --------------------------------------------------------------*/
  function runs(p) {
    var out = [], a = -1;
    for (var i = 0; i < p.n; i++) {
      if (M.has(p, i)) { if (a < 0) { a = i; } }
      else if (a >= 0) { out.push([a, i - 1]); a = -1; }
    }
    if (a >= 0) { out.push([a, p.n - 1]); }
    return out;
  }
  /* The outer radius as drawn in section: a knurl's teeth shown as a sawtooth
     between root and crest, at the knurl's pitch. */
  function topR(p, i) {
    if (p.thO[i]) { return M.envOut(p, i); }
    if (p.kB[i] > 0) {
      var pk = M.TOOLS.knurl.pitch, root = p.kB[i] - p.kP[i], full = p.kB[i] + p.kP[i];
      var f = ((M.zc(p, i) / pk) % 1 + 1) % 1;
      return Math.min(p.ro[i], root + (full - root) * (1 - Math.abs(2 * f - 1)));
    }
    return p.ro[i];
  }
  function insideProfile(p, i) { return p.thI[i] ? M.envIn(p, i) : p.ri[i]; }
  /* A threaded solid is not axisymmetric. The section therefore shows an
     explicitly schematic crest/root envelope, not two mirrored notch trains
     pretending to be opposite intersections of a single-start helix. */
  function threadRoots(p, f, a, b, inside) {
    var tags = inside ? p.thI : p.thO, radii = inside ? p.ri : p.ro;
    var roots = [], crests = [];
    for (var i = a; i <= b; i++) {
      var w = Math.ceil((tags[i] > 0 ? tags[i] : 1 / 16) / (2 * COL)) + 1;
      var root = radii[i];
      for (var k = Math.max(a, i - w); k <= Math.min(b, i + w); k++) { root = inside ? Math.max(root, radii[k]) : Math.min(root, radii[k]); }
      root = inside ? Math.min(root, M.outerEnvelope(p, i)) : Math.max(root, M.innerEnvelope(p, i));
      roots.push([M.zc(p, i), root]);
      crests.push([M.zc(p, i), inside ? M.envIn(p, i) : M.envOut(p, i)]);
    }
    var d = 'M' + line(f, simplify(roots));
    var band = 'M' + line(f, simplify(roots)) + 'L' + line(f, simplify(crests).reverse()) + 'Z';
    return { line: d + flipY(d, f), band: band + flipY(band, f) };
  }
  /* Points along a run, flat stretches as two column edges, slopes as centres. */
  function pts(p, a, b, fn) {
    var out = [], i = a;
    while (i <= b) {
      var v = fn(i), j = i;
      while (j + 1 <= b && Math.abs(fn(j + 1) - v) < 1e-7) { j++; }
      if (j > i) { out.push([p.zL + i * COL, v], [p.zL + (j + 1) * COL, v]); }
      else { out.push([M.zc(p, i), v]); }
      i = j + 1;
    }
    return out;
  }
  /* Drop points that lie within `tol` inches of the line through their
     neighbours (Ramer-Douglas-Peucker). Flanks, chamfers and flats become a
     few points; nothing visible changes. */
  function simplify(list, tol) {
    var n = list.length;
    if (n < 3) { return list; }
    var keep = new Uint8Array(n), stack = [[0, n - 1]], t = tol || 0.0003;
    keep[0] = keep[n - 1] = 1;
    while (stack.length) {
      var seg = stack.pop(), a = seg[0], b = seg[1];
      var ax = list[a][0], ay = list[a][1], dx = list[b][0] - ax, dy = list[b][1] - ay;
      var len = Math.sqrt(dx * dx + dy * dy) || 1e-12, best = -1, bi = -1;
      for (var i = a + 1; i < b; i++) {
        var d = Math.abs(dy * (list[i][0] - ax) - dx * (list[i][1] - ay)) / len;
        if (d > best) { best = d; bi = i; }
      }
      if (best > t) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
    }
    return list.filter(function (q, i) { return keep[i]; });
  }
  function line(f, list, sign) {
    var s = sign || 1;
    return list.map(function (q) { return f.x(q[0]) + ' ' + f.y(s * q[1]); }).join('L');
  }
  /* The same path reflected in the centerline: the other half of a whole view.
     Built as geometry, not as a transform, so section hatching keeps one
     direction across the whole part. These paths use only M, L, H, V and Z. */
  function flipY(d, f) {
    var y0 = f.y(0), out = '', cmd = '', k = 0;
    (d.match(/[MLHVZ]|-?(?:\d+\.?\d*|\.\d+)/g) || []).forEach(function (tk) {
      if (/^[MLHVZ]$/.test(tk)) { cmd = tk; k = 0; out += cmd; return; }
      var v = parseFloat(tk);
      if (cmd === 'V' || (cmd !== 'H' && k % 2 === 1)) { v = r1(2 * y0 - v); }
      out += (k % 2 === 1 && cmd !== 'H' && cmd !== 'V' ? ' ' : (k > 0 ? 'L' : '')) + v;
      k++;
    });
    return out;
  }
  function viewOf(view) { return view === 'normal' ? 'normal' : 'section'; }
  /* Paths for the work in one view. Every key is always present, empty when the
     view does not draw it, so a live picture can update the same elements. */
  function workPaths(p, f, view) {
    var sec = [], ext = [], edges = [], threads = [], roots = [], envelopes = [], knurls = [], bore = [], hidden = [];
    var normal = viewOf(view) === 'normal';
    runs(p).forEach(function (rn) {
      var a = rn[0], b = rn[1], zA = p.zL + a * COL, zB = p.zL + (b + 1) * COL;
      var top = simplify(pts(p, a, b, function (i) { return topR(p, i); }));
      var bot = simplify(pts(p, a, b, function (i) { return insideProfile(p, i); })).reverse();
      var hasHole = false;
      for (var hk = a; hk <= b; hk++) { if (p.ri[hk] > 0.0005) { hasHole = true; break; } }
      if (hasHole) { var bl = simplify(pts(p, a, b, function (i) { return insideProfile(p, i); })); bore.push('M' + f.x(zA) + ' ' + f.y(0) + 'L' + line(f, bl) + 'L' + f.x(zB) + ' ' + f.y(0) + 'Z'); }
      // Seen from outside, a hole is its wall drawn as a hidden line.
      var h0 = -1;
      for (var hc = a; hc <= b + 1; hc++) {
        var open = hc <= b && p.ri[hc] > 0.0005;
        if (open && h0 < 0) { h0 = hc; }
        if (!open && h0 >= 0) { hidden.push('M' + line(f, simplify(pts(p, h0, hc - 1, function (i) { return insideProfile(p, i); })))); h0 = -1; }
      }
      sec.push('M' + f.x(zA) + ' ' + f.y(insideProfile(p, a)) + 'L' + f.x(zA) + ' ' + f.y(top[0][1]) + 'L' + line(f, top) +
        'L' + f.x(zB) + ' ' + f.y(top[top.length - 1][1]) + 'L' + f.x(zB) + ' ' + f.y(bot[0][1]) + 'L' + line(f, bot) + 'Z');
      var outer = simplify(pts(p, a, b, function (i) { return p.thO[i] ? M.envOut(p, i) : p.ro[i]; }));
      ext.push('M' + f.x(zA) + ' ' + f.y(0) + 'L' + f.x(zA) + ' ' + f.y(-outer[0][1]) + 'L' + line(f, outer, -1) +
        'L' + f.x(zB) + ' ' + f.y(-outer[outer.length - 1][1]) + 'L' + f.x(zB) + ' ' + f.y(0) + 'Z');
      // Edges seen on the outside: steps, and corners where the slope changes.
      var lastX = -1e9;
      for (var i = a + 1; i <= b; i++) {
        if (p.thO[i] !== 0 || p.thO[i - 1] !== 0 || p.kB[i] > 0 || p.kB[i - 1] > 0) { continue; }
        var step = Math.abs(p.ro[i] - p.ro[i - 1]) > 0.003;
        var corner = i > a + 1 && i < b && Math.abs((p.ro[i + 1] - p.ro[i]) - (p.ro[i] - p.ro[i - 1])) > 0.0006;
        if (!step && !corner) { continue; }
        var zx = p.zL + i * COL;
        if (zx - lastX < 0.012) { continue; }
        lastX = zx;
        edges.push('M' + f.x(zx) + ' ' + f.y(0) + 'V' + f.y(-Math.max(p.ro[i], p.ro[i - 1])));
      }
      // Thread crest lines and knurl diamonds over tagged stretches.
      var i0 = -1;
      for (var k = a; k <= b + 1; k++) {
        var tagged = k <= b && p.thO[k] !== 0;
        if (tagged && i0 < 0) { i0 = k; }
        if (!tagged && i0 >= 0) { threads.push(threadLines(p, f, i0, k - 1)); var tr = threadRoots(p, f, i0, k - 1, false); roots.push(tr.line); envelopes.push(tr.band); i0 = -1; }
      }
      i0 = -1;
      for (k = a; k <= b + 1; k++) {
        var insideThread = k <= b && p.thI[k] !== 0;
        if (insideThread && i0 < 0) { i0 = k; }
        if (!insideThread && i0 >= 0) { var ti = threadRoots(p, f, i0, k - 1, true); roots.push(ti.line); envelopes.push(ti.band); i0 = -1; }
      }
      i0 = -1;
      for (k = a; k <= b + 1; k++) {
        var kn = k <= b && p.kB[k] > 0;
        if (kn && i0 < 0) { i0 = k; }
        if (!kn && i0 >= 0) { knurls.push(knurlLines(p, f, i0, k - 1)); i0 = -1; }
      }
    });
    var w = { sec: sec.join(''), ext: ext.join(''), bore: bore.join(''), edges: edges.join(''), knurl: knurls.join(''), hidden: hidden.join('') };
    if (normal) {
      return { sec: '', bore: '', threadEnvelope: '', ext: w.ext + flipY(w.ext, f), edges: w.edges + flipY(w.edges, f), threads: threads.join(''),
        knurl: w.knurl + flipY(w.knurl, f), hidden: w.hidden + flipY(w.hidden, f) };
    }
    return { sec: w.sec + flipY(w.sec, f), bore: w.bore + flipY(w.bore, f), threadEnvelope: envelopes.join(''), ext: '', edges: '', threads: roots.join(''), knurl: '', hidden: '' };
  }
  /* A thread seen from outside: one crest line per pitch, leaning half a pitch
     across the whole diameter. */
  function threadLines(p, f, a, b) {
    var pitch = p.thO[a] > 0 ? p.thO[a] : 1 / 16, out = '';
    var z0 = p.zL + a * COL, z1 = p.zL + (b + 1) * COL;
    var kHi = Math.floor(-z0 / pitch - 0.5), kLo = Math.ceil(-z1 / pitch - 0.5);
    for (var k = kLo; k <= kHi; k++) {
      var zc = -(k + 0.5) * pitch, i = M.colAt(p, zc);
      if (i < a || i > b) { continue; }
      var R = M.envOut(p, i);
      var xa = Math.max(z0, Math.min(z1, zc - pitch / 4)), xb = Math.max(z0, Math.min(z1, zc + pitch / 4));
      out += 'M' + f.x(xa) + ' ' + f.y(-R) + 'L' + f.x(xb) + ' ' + f.y(R);
    }
    return out;
  }
  /* Liang-Barsky clip of the segment (x0,y0)-(x1,y1) to a box. */
  function clip(x0, y0, x1, y1, bx0, by0, bx1, by1) {
    var t0 = 0, t1 = 1, dx = x1 - x0, dy = y1 - y0;
    var P = [-dx, dx, -dy, dy], Q = [x0 - bx0, bx1 - x0, y0 - by0, by1 - y0];
    for (var k = 0; k < 4; k++) {
      if (P[k] === 0) { if (Q[k] < 0) { return null; } continue; }
      var t = Q[k] / P[k];
      if (P[k] < 0) { if (t > t1) { return null; } if (t > t0) { t0 = t; } }
      else { if (t < t0) { return null; } if (t < t1) { t1 = t; } }
    }
    return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
  }
  function knurlLines(p, f, a, b) {
    var pk = M.TOOLS.knurl.pitch * 2, out = '';
    var z0 = p.zL + a * COL, z1 = p.zL + (b + 1) * COL, R = 0;
    for (var i = a; i <= b; i++) { if (p.ro[i] > R) { R = p.ro[i]; } }
    var run = R * 0.58; // the diamond's lines at 30 degrees across the visible half
    for (var s = -1; s <= 1; s += 2) {
      for (var z = Math.floor((z0 - run) / pk) * pk; z <= z1 + run; z += pk) {
        var c = clip(z, 0, z + s * run, -R, z0, -R, z1, 0);
        if (c) { out += 'M' + f.x(c[0]) + ' ' + f.y(c[1]) + 'L' + f.x(c[2]) + ' ' + f.y(c[3]); }
      }
    }
    return out;
  }

  /* ---- the drawing's outline over the work, placed at Z0 ---------------------*/
  function ghostPaths(T, f, view) {
    var L = T.length.L, br = [0, L];
    T.outside.concat(T.inside).forEach(function (sg) { br.push(sg.from, sg.to); });
    T.chamfers.forEach(function (c) { br.push(c.edge === 'back-od' ? L - c.c : c.c); });
    br.sort(function (a, b) { return a - b; });
    var ss = [];
    br.forEach(function (b) { ss.push(Math.max(0, b - 1e-6), Math.min(L, b + 1e-6)); });
    ss = ss.filter(function (v, i) { return i === 0 || Math.abs(v - ss[i - 1]) > 1e-9; });
    var g = ss.map(function (s) { return M.profileAt(T, s); });
    var top = ss.map(function (s, i) { return [-s, g[i].ro]; });
    var inn = ss.map(function (s, i) { return [-s, g[i].ri]; }).reverse();
    var d = 'M' + line(f, top) + 'L' + line(f, inn) + 'Z';
    var dBot = 'M' + f.x(0) + ' ' + f.y(0) + 'L' + line(f, top, -1) + 'L' + f.x(-L) + ' ' + f.y(0);
    var roots = '';
    T.outside.forEach(function (sg) {
      if (sg.kind === 'thread') {
        var rr = (sg.root[0] + sg.root[1]) / 4;
        roots += 'M' + f.x(-sg.from) + ' ' + f.y(rr) + 'H' + f.x(-sg.to) + 'M' + f.x(-sg.from) + ' ' + f.y(-rr) + 'H' + f.x(-sg.to);
      }
    });
    var inRoots = '';
    T.inside.forEach(function (sg) {
      if (sg.kind === 'thread') {
        var rr = (sg.root[0] + sg.root[1]) / 4;
        inRoots += 'M' + f.x(-sg.from) + ' ' + f.y(rr) + 'H' + f.x(-sg.to);
      }
    });
    // From outside only the part's silhouette and its outside thread show.
    if (viewOf(view) === 'normal') { return { top: flipY(dBot, f), bottom: dBot, roots: roots }; }
    return { top: d, bottom: flipY(d, f), roots: roots + inRoots + flipY(inRoots, f) };
  }

  /* ---- metal still to come off, and where the work is already too small -------*/
  function comparePaths(st, f, view) {
    var c = M.compare(st), p = st.work, normal = viewOf(view) === 'normal';
    function strips(list, mirror) {
      var out = '', k = 0;
      while (k < list.length) {
        var j = k;
        while (j + 1 < list.length && list[j + 1][0] === list[j][0] + 1) { j++; }
        var hi = [], lo = [];
        for (var m = k; m <= j; m++) {
          var i = list[m][0], za = p.zL + i * COL, zb = za + COL;
          hi.push([za, list[m][2]], [zb, list[m][2]]);
          lo.push([za, list[m][1]], [zb, list[m][1]]);
        }
        var sg = mirror ? -1 : 1;
        out += 'M' + line(f, simplify(hi), sg) + 'L' + line(f, simplify(lo).reverse(), sg) + 'Z';
        k = j + 1;
      }
      return out;
    }
    function marks(list, kind) {
      var out = '', sel = list.filter(function (q) { return q[1] === kind; }).map(function (q) { return q[0]; });
      var k = 0;
      while (k < sel.length) {
        var j = k;
        while (j + 1 < sel.length && sel[j + 1] === sel[j] + 1) { j++; }
        var seg = [];
        for (var m = k; m <= j; m++) {
          var i = sel[m], v = kind === 'out' ? p.ro[i] : p.ri[i];
          seg.push([p.zL + i * COL, v], [p.zL + (i + 1) * COL, v]);
        }
        seg = simplify(seg);
        out += 'M' + line(f, seg) + 'M' + line(f, seg, -1);
        k = j + 1;
      }
      return out;
    }
    // From outside, metal still in a hole and a bore cut too big are out of sight.
    return { excess: strips(c.excessOut, false) + (normal ? '' : strips(c.excessIn, false)),
      excessBottom: strips(c.excessOut, true) + (normal ? '' : strips(c.excessIn, true)),
      under: marks(c.under, 'out') + (normal ? '' : marks(c.under, 'in')), counts: { excess: c.excessOut.length + c.excessIn.length, under: c.under.length } };
  }

  /* ---- tools, in local units: origin at the reference point, y down ------------*/
  function lp(dz, dr) { return r1(dz * S) + ' ' + r1(-dr * S); }
  function sample(fn, a, b, br) {
    var xs = [], k;
    for (k = 0; a + k * 0.002 < b - 1e-9; k++) { xs.push(a + k * 0.002); }
    (br || []).forEach(function (v) { if (v > a && v < b) { xs.push(v - 1e-6, v + 1e-6); } });
    xs.push(b);
    xs.sort(function (u, v) { return u - v; });
    return simplify(xs.map(function (z) { return [z, fn(z)]; }).filter(function (q) { return isFinite(q[1]); }), 0.0002);
  }
  function poly(list, close) { return 'M' + list.map(function (q) { return lp(q[0], q[1]); }).join('L') + (close ? 'Z' : ''); }

  var INSERT_TOP = { turn: 0.20, face: 0.75, chamfer: 0.15, groove: 0.70, thread: 0.06, knurl: 0.25 };

  function knurlHead(hand, mirrored) {
    var t = M.TOOLS.knurl, edge = sample(t.edge, t.cut.from, t.cut.to, [0]);
    var wheel = edge.concat(edge.slice().reverse().map(function (p) { return [p[0], 0.60 - p[1]]; }));
    var out = '<g class="ts-knurl-wheel" data-hand="' + (hand > 0 ? 'right' : 'left') + '">';
    out += '<path class="ts-tool-body" d="' + poly([[-.3,.25],[-.3,.75],[.3,.75],[.3,.25],[.2,.25],[.2,.62],[-.2,.62],[-.2,.25]], true) + '"/>';
    out += '<path class="ts-tool-wheel" d="' + poly(wheel, true) + '"/>';
    var width = (2 * t.wheelHalf - 2 * t.wheelChamfer) * S, period = t.pitch * S, teeth = '';
    // Mirroring the lower carrier must not mirror the physical tooth hand.
    var projectedHand = mirrored ? -hand : hand;
    for (var y = -width; y <= .56 * S + width; y += period) { teeth += 'M0 ' + r1(y) + 'L' + r1(width) + ' ' + r1(y + projectedHand * width * .58); }
    out += '<svg class="ts-knurl-barrel" x="' + r1((-t.wheelHalf + t.wheelChamfer) * S) + '" y="' + r1(-.58 * S) + '" width="' + r1(width) + '" height="' + r1(.56 * S) + '" overflow="hidden" aria-hidden="true">' +
      '<path class="ts-tool-knurl ts-knurl-teeth" style="--ts-knurl-period:' + r1(period) + 'px" d="' + teeth + '"/></svg>';
    [-1, 1].forEach(function (sign) { out += '<ellipse class="ts-tool-wheel-end" cx="' + r1(sign * .171 * S) + '" cy="' + r1(-.3 * S) + '" rx="' + r1(.016 * S) + '" ry="' + r1(.28 * S) + '"/>'; });
    out += '<path class="ts-tool-axle" d="M' + lp(-.28, .3) + 'L' + lp(.28, .3) + '"/>';
    out += '<path class="ts-tool-edge is-forming" d="' + poly(edge, false) + '"/></g>';
    return out;
  }

  function toolShape(toolId, opt) {
    var t = M.TOOLS[toolId], o = opt || {};
    var out = '';
    if (toolId === 'knurl') {
      out += knurlHead(1);
      out += '<g data-ts-knurl-lower transform="translate(0 ' + r1((o.gap == null ? 1 : o.gap) * S) + ') scale(1 -1)">' + knurlHead(-1, true) + '</g>';
    } else if (t.side === 'out') {
      var br = [t.cut.from, t.cut.to, 0];
      var edge = sample(t.edge, t.span[0], t.span[1], br);
      var bodyTop = toolId === 'chamfer' ? 0.85 : TOP;
      var body = [[edge[0][0], bodyTop]].concat(edge, [[edge[edge.length - 1][0], bodyTop]]);
      out += '<path class="ts-tool-body" d="' + poly(body, true) + '"/>';
      var top = INSERT_TOP[toolId];
      var ins = sample(t.edge, t.cut.from, t.cut.to, [0]);
      var insert = [[ins[0][0], top]].concat(ins, [[ins[ins.length - 1][0], top]]);
      out += '<path class="ts-tool-insert' + (toolId === 'knurl' ? ' ts-tool-wheel' : '') + '" d="' + poly(insert, true) + '"/>';
      if (toolId === 'chamfer') {
        out += '<circle class="ts-tool-fastener" cx="0" cy="' + r1(-.32 * S) + '" r="' + r1(.035 * S) + '"/>';
        out += '<text class="ts-tool-label" x="0" y="' + r1(-.48 * S) + '" text-anchor="middle">90° form</text>';
      }
      if (toolId === 'knurl') {
        var kl = '';
        for (var z = -0.18; z <= 0.18; z += 0.06) { kl += 'M' + lp(z - 0.04, 0.22) + 'L' + lp(z + 0.04, 0.02) + 'M' + lp(z + 0.04, 0.22) + 'L' + lp(z - 0.04, 0.02); }
        out += '<path class="ts-tool-knurl" d="' + kl + '"/>';
        out += '<path class="ts-tool-edge is-forming" d="' + poly(ins, false) + '"/>';
      } else {
        out += '<path class="ts-tool-edge" d="' + poly(ins, false) + '"/>';
      }
    } else if (t.side === 'in') {
      var bar = t.bar, hd = t.head;
      var head = sample(t.edge, hd[0], hd[1], [0]).map(function (q) { return [q[0], -q[1]]; });
      out += '<path class="ts-tool-body" d="' + poly([[bar.to, -bar.top - bar.dia - 0.06], [bar.to, TOP], [bar.to + t.holder, TOP], [bar.to + t.holder, -bar.top - bar.dia - 0.06]], true) + '"/>';
      out += '<path class="ts-tool-bar" d="' + poly([[bar.from, -bar.top], [bar.to, -bar.top], [bar.to, -bar.top - bar.dia], [bar.from, -bar.top - bar.dia]], true) + '"/>';
      out += '<path class="ts-tool-insert" d="' + poly([[head[0][0], -bar.top]].concat(head, [[head[head.length - 1][0], -bar.top]]), true) + '"/>';
      out += '<path class="ts-tool-edge" d="' + poly(head, false) + '"/>';
    } else {
      var fn = toolId === 'drill' ? t.radiusFor(o.drill || M.drillSize({ drill: '0.5000' })) : t.radius;
      var end = toolId === 'drill' ? t.flute : t.cutTo;
      var bodyTo = toolId === 'drill' ? t.flute + 0.6 : t.bodyTo;
      var prof = sample(fn, 0, bodyTo, [end]);
      var upper = prof.map(function (q) { return [q[0], Math.max(0, q[1])]; });
      var lower = upper.slice().reverse().map(function (q) { return [q[0], -q[1]]; });
      out += '<path class="ts-tool-body" d="' + poly([[bodyTo, 0.55], [bodyTo + 1.2, 0.55], [bodyTo + 1.2, -0.55], [bodyTo, -0.55]], true) + '"/>';
      out += '<path class="ts-tool-insert" d="' + poly(upper.concat(lower), true) + '"/>';
      var lipEnd = toolId === 'drill' ? 0.3004 * (o.drill || 0.5) + 0.002 : end;
      var cutPart = upper.filter(function (q) { return q[0] <= lipEnd + 1e-9; });
      out += '<path class="ts-tool-edge" d="' + poly(cutPart, false) + '"/>';
      if (toolId === 'drill') {
        var D = (o.drill || 0.5) / 2, fl = '';
        for (var zf = D * 0.65 + 0.06; zf < t.flute - 0.1; zf += 0.16) { fl += 'M' + lp(zf, -D) + 'L' + lp(zf + 0.12, D); }
        out += '<path class="ts-tool-flute" d="' + fl + '"/>';
      }
    }
    out += '<g class="ts-ref"><circle r="3.2"/><path d="M-6 0H6M0 -6V6"/></g>';
    return out;
  }

  /* A small picture of a tool for its button, framed on its cutting end. */
  function toolIcon(toolId) {
    var t = M.TOOLS[toolId], b;
    if (t.side === 'out') {
      var ext = toolId === 'turn' ? [-0.06, 0.62] : toolId === 'face' ? [-0.10, 0.35] : toolId === 'groove' ? [-0.35, 0.33] : toolId === 'thread' ? [-0.3, 0.38] : [-0.34, 0.34];
      var up = toolId === 'groove' || toolId === 'face' ? 0.80 : 0.52;
      b = [ext[0], -up, ext[1] - ext[0], up + 0.08];
      if (toolId === 'knurl') { b = [-.32, -.62, .64, 1.44]; }
    } else if (t.side === 'in') {
      b = [-0.1, -0.12, 0.95, 0.62];
    } else {
      b = [-0.08, -0.33, 1.05, 0.66];
    }
    var vb = [b[0] * S, b[1] * S, b[2] * S, b[3] * S].map(r1).join(' ');
    return '<svg class="ts-icon" viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' +
      toolShape(toolId, { drill: 0.5, gap: 0.2 }).replace(/<g class="ts-ref">[\s\S]*?<\/g>/, '') + '</svg>';
  }

  /* ---- the chuck -----------------------------------------------------------------*/
  function chuck(T, f, hatch, view) {
    var R = T.stock.dia / 2, zJ = T.stock.zJaw, zj0 = zJ - M.JAW_LEN;
    var out = '';
    out += '<rect class="ts-chuck" x="' + f.x(f.zMin - 0.2) + '" y="' + f.y(R + M.BODY_UP) + '" width="' + r1((zj0 - f.zMin + 0.2) * S) + '" height="' + r1(2 * (R + M.BODY_UP) * S) + '"/>';
    out += '<rect class="ts-jaw" x="' + f.x(zj0) + '" y="' + f.y(R + M.JAW_UP) + '" width="' + r1(M.JAW_LEN * S) + '" height="' + r1(M.JAW_UP * S) + '"/>';
    out += '<rect class="ts-jaw" x="' + f.x(zj0) + '" y="' + f.y(-R) + '" width="' + r1(M.JAW_LEN * S) + '" height="' + r1(M.JAW_UP * S) + '"/>';
    // the end of the bar held in the jaws, in the same view as the rest of the work
    out += '<rect class="' + (viewOf(view) === 'normal' ? 'ts-ext' : 'ts-sec" fill="' + hatch) + '" x="' + f.x(zj0) + '" y="' + f.y(R) + '" width="' + r1(M.JAW_LEN * S) + '" height="' + r1(2 * R * S) + '"/>';
    var cx = f.x(zJ - M.JAW_LEN / 2), cy = r1((f.y(R + M.JAW_UP)) / 2);
    // A separate axial end view: seen from the tailstock toward the chuck.
    // The CCW arrow tangent and its negative screen rotation agree. The
    // invisible guide gives the rotating group's bounding box an exact center.
    out += '<g class="ts-chuck-end" role="img" aria-label="Chuck end view from the tailstock: counterclockwise forward rotation" transform="translate(' + cx + ' ' + cy + ')">' +
      '<circle class="ts-spin-ring" r="21"/><g class="ts-spin"><circle class="ts-spin-guide" r="20"/>' +
      '<path class="ts-spin-arc" d="M14 0A14 14 0 1 0 0 14"/><path class="ts-spin-head" d="M-5 9L1 14L-5 19"/></g></g>';
    out += '<text class="ts-lbl" x="' + r1(cx + 27) + '" y="' + r1(cy - 2) + '">Chuck end</text>';
    out += '<text class="ts-spin-view" x="' + r1(cx + 27) + '" y="' + r1(cy + 12) + '">from tailstock</text>';
    return out;
  }

  /* ---- the whole view --------------------------------------------------------------*/
  function defs(id) {
    return '<defs>' +
      '<pattern id="' + id + '-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
        '<rect class="ts-hatch-bg" width="7" height="7"/><line class="ts-hatch-line" x1="0" y1="0" x2="0" y2="7"/></pattern>' +
      '</defs>';
  }
  var VIEW_SAYS = { section: 'cut in half along its centerline', normal: 'seen from outside' };
  /* opts: { idPrefix, view ('section', the default, or 'normal'), ghost (default
     true), tint (default true), label }. Both views carry the same elements, so a
     live picture updates them in place. A tool is drawn over the work, except a
     tool inside it seen from outside, which the work hides. */
  function scene(st, opts) {
    var o = opts || {}, id = o.idPrefix || 'ts', view = viewOf(o.view);
    var T = M.target(st.targetId), f = frame(T, st.tool);
    var w = workPaths(st.work, f, view), g = ghostPaths(T, f, view), c = comparePaths(st, f, view);
    var t = M.TOOLS[st.tool];
    var hatch = 'url(#' + id + '-hatch)';
    var tx = f.x(st.tz), ty = f.y(st.tr);
    var label = o.label || ('The work in the lathe, ' + VIEW_SAYS[view] + ', with the ' + t.name.toLowerCase() + ' at X ' + M.fmt(st.tr * 2) + ', Z ' + M.fmt(st.tz) + '.');
    if (M.hasThreads(st.work) && view === 'section') { label += ' Threads are schematic crest and root envelopes, not a helical section.'; }
    var tool = '<g class="ts-tool" data-ts="tool" transform="translate(' + tx + ' ' + ty + ')">' + toolShape(st.tool, { drill: M.drillSize(st), gap: 2 * st.tr }) + '</g>';
    var behind = view === 'normal' && t.side !== 'out';
    return '<svg class="ts-view is-' + view + '" viewBox="0 0 ' + f.W + ' ' + f.H + '" role="img" aria-label="' + esc(label) + '" focusable="false">' +
      defs(id) +
      '<g class="ts-machine">' + chuck(T, f, hatch, view) + '</g>' +
      '<g class="ts-z0"><path d="M' + f.x(0) + ' ' + f.y(T.stock.dia / 2 + 0.70) + 'V' + f.y(-(T.stock.dia / 2 + 0.30)) + '"/>' +
        '<text class="ts-lbl" x="' + r1(f.x(0) + 5) + '" y="' + f.y(T.stock.dia / 2 + 0.70) + '" dy="12">Z0</text></g>' +
      (behind ? tool : '') +
      '<path class="ts-bore" data-ts="bore" d="' + w.bore + '"/>' +
      '<path class="ts-sec" data-ts="sec" fill="' + hatch + '" d="' + w.sec + '"/>' +
      '<path class="ts-thread-envelope" data-ts="thread-envelope" d="' + w.threadEnvelope + '"/>' +
      '<path class="ts-ext" data-ts="ext" d="' + w.ext + '"/>' +
      '<path class="ts-hidden" data-ts="hidden" d="' + w.hidden + '"/>' +
      '<path class="ts-edge" data-ts="edges" d="' + w.edges + '"/>' +
      '<path class="ts-thread" data-ts="threads" d="' + w.threads + '"/>' +
      '<path class="ts-knurl" data-ts="knurl" d="' + w.knurl + '"/>' +
      '<path class="ts-axis" d="M0 ' + f.y(0) + 'H' + f.W + '"/>' +
      '<path class="ts-excess" data-ts="excess" d="' + (o.tint === false ? '' : c.excess) + '"/>' +
      '<path class="ts-excess" data-ts="excess-bottom" d="' + (o.tint === false ? '' : c.excessBottom) + '"/>' +
      '<path class="ts-ghost" data-ts="ghost-top" d="' + (o.ghost === false ? '' : g.top) + '"/>' +
      '<path class="ts-ghost" data-ts="ghost-bottom" d="' + (o.ghost === false ? '' : g.bottom) + '"/>' +
      '<path class="ts-ghost-root" data-ts="ghost-roots" d="' + (o.ghost === false ? '' : g.roots) + '"/>' +
      '<path class="ts-under" data-ts="under" d="' + (o.tint === false ? '' : c.under) + '"/>' +
      (behind ? '' : tool) +
      '<g class="ts-chips" data-ts="chips"></g>' +
      '</svg>';
  }

  /* ---- the drawing of the part --------------------------------------------------------
     A dimensioned half-section of the target as it would sit in the chuck: the
     front face on the right. Lengths are dimensioned from the front face, the way
     the inspection measures them. The specification table on the page carries
     the limits; the drawing shows nominal sizes. */
  function drawing(T, opts) {
    var o = opts || {}, id = o.idPrefix || ('tsd-' + T.id);
    var L = T.length.L, R = 0;
    T.outside.forEach(function (sg) { R = Math.max(R, outer(sg) / 2); });
    var DS = Math.min(280 / L, 170 / (2 * R));
    var W = 540, x0 = 40, xF = x0 + L * DS;   // front face on the right
    var lens = distinctLengths(T);
    var topY = 40 + lens.length * 28, cy = topY + R * DS, botY = cy + R * DS;
    var X = function (s) { return r1(xF - s * DS); };
    var Y = function (r) { return r1(cy - r * DS); };
    var ss = [];
    [0, L].concat(flatten(T)).forEach(function (b) { ss.push(Math.max(0, b - 1e-6), Math.min(L, b + 1e-6)); });
    ss.sort(function (a, b) { return a - b; });
    var g = ss.map(function (s) { return M.profileAt(T, s); });
    var topPts = ss.map(function (s, i) { return X(s) + ' ' + Y(g[i].ro); });
    var inPts = ss.map(function (s, i) { return X(s) + ' ' + Y(g[i].ri); }).reverse();
    var botPts = ss.map(function (s, i) { return X(s) + ' ' + Y(-g[i].ro); });
    var art = '';
    if (T.inside.length) { art += '<path class="ts-bore" d="M' + X(0) + ' ' + Y(0) + 'L' + inPts.slice().reverse().join('L') + 'L' + X(L) + ' ' + Y(0) + 'Z"/>'; }
    art += '<path class="ts-sec" fill="url(#' + id + '-hatch)" d="M' + topPts.join('L') + 'L' + inPts.join('L') + 'Z"/>';
    art += '<path class="ts-ext" d="M' + X(0) + ' ' + Y(0) + 'L' + botPts.join('L') + 'L' + X(L) + ' ' + Y(0) + 'Z"/>';
    var edgeD = '';
    T.outside.forEach(function (sg, k) {
      if (k > 0) { edgeD += 'M' + X(sg.from) + ' ' + Y(0) + 'V' + Y(-Math.max(outer(sg), outer(T.outside[k - 1])) / 2); }
      if (sg.kind === 'thread') {
        var p = 1 / sg.tpi, rr = (sg.root[0] + sg.root[1]) / 4, rc = sg.crest[1] / 2, tl = '';
        art += '<path class="ts-dthin" d="M' + X(sg.from) + ' ' + Y(rr) + 'H' + X(sg.to) + 'M' + X(sg.from) + ' ' + Y(-rr) + 'H' + X(sg.to) + '"/>';
        for (var s = sg.from + p / 2; s < sg.to - p / 4; s += p) { tl += 'M' + X(s + p / 8) + ' ' + Y(-rc) + 'L' + X(s - p / 8) + ' ' + Y(0); }
        art += '<path class="ts-thread" d="' + tl + '"/>';
      }
      if (sg.kind === 'knurl') {
        var kd = '', rk = sg.d / 2, pk = 0.08, run = rk * 0.58;
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          for (var z = sg.from - run; z <= sg.to + run; z += pk) {
            var c = clip(z, 0, z + sgn * run, -rk, sg.from, -rk, sg.to, 0);
            if (c) { kd += 'M' + X(c[0]) + ' ' + Y(c[1]) + 'L' + X(c[2]) + ' ' + Y(c[3]); }
          }
        }
        art += '<path class="ts-knurl" d="' + kd + '"/>';
      }
    });
    T.inside.forEach(function (sg) {
      if (sg.kind === 'thread') { var rr = (sg.root[0] + sg.root[1]) / 4; art += '<path class="ts-dthin" d="M' + X(sg.from) + ' ' + Y(rr) + 'H' + X(sg.to) + '"/>'; }
    });
    T.chamfers.forEach(function (c) {
      if (c.edge === 'front-od') { edgeD += 'M' + X(c.c) + ' ' + Y(0) + 'V' + Y(-outer(T.outside[0]) / 2); }
      if (c.edge === 'back-od') { edgeD += 'M' + X(L - c.c) + ' ' + Y(0) + 'V' + Y(-outer(T.outside[T.outside.length - 1]) / 2); }
    });
    art += '<path class="ts-edge" d="' + edgeD + '"/>';
    art += '<path class="ts-axis" d="M' + r1(x0 - 16) + ' ' + r1(cy) + 'H' + r1(xF + 16) + '"/>';

    // lengths from the front face, one row each, the shortest nearest the part
    var dim = '';
    var rowY = function (k) { return r1(topY - 20 - (lens.length - 1 - k) * 28); };
    lens.forEach(function (s, k) {
      var y = rowY(k), xs = X(s);
      var rAt = Math.max(M.profileAt(T, Math.min(L, s + 1e-6)).ro, M.profileAt(T, Math.max(0, s - 1e-6)).ro);
      dim += '<path class="ts-dext" d="M' + xs + ' ' + r1(Y(rAt) - 3) + 'V' + r1(y - 5) + '"/>';
      dim += '<path class="ts-dline" marker-start="url(#' + id + '-arr)" marker-end="url(#' + id + '-arr)" d="M' + xF + ' ' + y + 'H' + xs + '"/>';
      dim += '<text class="ts-dtxt ts-halo" x="' + r1((xF + xs) / 2) + '" y="' + r1(y - 5) + '" text-anchor="middle">' + M.fmt(s) + '</text>';
    });
    var faceTop = rowY(0) - 5;
    dim += '<path class="ts-dext" d="M' + xF + ' ' + r1(Y(outer(T.outside[0]) / 2 - frontChamfer(T)) - 3) + 'V' + r1(faceTop) + '"/>';
    dim += '<text class="ts-dlbl" x="' + r1(xF + 6) + '" y="' + r1(faceTop + 4) + '">front face</text>';

    // notes to the right of the front face: edge chamfer, the hole, its chamfer
    var right = [];
    T.chamfers.forEach(function (c) {
      if (c.edge === 'front-od') { right.push({ ay: Y(outer(T.outside[0]) / 2 - c.c / 2), ax: X(c.c / 2), text: M.fmt(c.c) + ' × 45° chamfer' }); }
    });
    if (T.inside.length) {
      var b = T.inside[0];
      right.push({ ay: Y(insideR(b)), ax: X(0.04), text: b.kind === 'thread' ? b.tpi + ' threads per inch inside, through' : 'Hole Ø' + M.fmt(b.d) + ', through' });
      T.chamfers.forEach(function (c) { if (c.edge === 'front-bore') { right.push({ ay: Y(insideR(b) + c.c / 2), ax: X(c.c / 2), text: M.fmt(c.c) + ' × 45° at the hole' }); } });
    }
    right.sort(function (a, b2) { return a.ay - b2.ay; });
    var ny = faceTop + 4, notes = '', texts = '';
    right.forEach(function (n) {
      var y = Math.max(n.ay - 14, ny + 20); ny = y;
      var tx = r1(xF + 34);
      notes += '<path class="ts-dleader" marker-start="url(#' + id + '-arr)" d="M' + n.ax + ' ' + n.ay + 'L' + r1(xF + 28) + ' ' + r1(y - 4) + 'H' + r1(tx - 3) + '"/>';
      texts += '<text class="ts-dtxt ts-halo" x="' + tx + '" y="' + r1(y) + '">' + esc(n.text) + '</text>';
    });

    // callouts under the part, each under its feature, staggered when they would collide
    var below = T.outside.map(function (sg) { return { x: X((sg.from + sg.to) / 2), ay: Y(-outer(sg) / 2), text: calloutText(sg) }; });
    T.chamfers.forEach(function (c) {
      if (c.edge === 'back-od') { below.push({ x: X(L - c.c / 2), ay: Y(-outer(T.outside[T.outside.length - 1]) / 2 + c.c / 2), text: M.fmt(c.c) + ' × 45° chamfer' }); }
    });
    below.sort(function (a, b2) { return a.x - b2.x; });
    var rowsEnd = [], rowsUsed = 0;
    below.forEach(function (n) {
      var w = textW(n.text), cx = Math.max(6 + w / 2, Math.min(W - 6 - w / 2, n.x));
      var row = 0;
      while (rowsEnd[row] !== undefined && cx - w / 2 < rowsEnd[row] + 14) { row++; }
      rowsEnd[row] = cx + w / 2; rowsUsed = Math.max(rowsUsed, row + 1);
      var ty = r1(botY + 34 + row * 26);
      notes += '<path class="ts-dleader" marker-start="url(#' + id + '-arr)" d="M' + n.x + ' ' + r1(n.ay + 1) + 'V' + r1(ty - 15) + (Math.abs(cx - n.x) > 2 ? 'H' + r1(cx) : '') + '"/>';
      texts += '<text class="ts-dtxt ts-halo" x="' + r1(cx) + '" y="' + ty + '" text-anchor="middle">' + esc(n.text) + '</text>';
    });
    var H = r1(Math.max(botY + 34 + (rowsUsed - 1) * 26 + 12, ny + 12));
    return '<svg class="ts-drawing-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-labelledby="' + id + '-t ' + id + '-d" focusable="false">' +
      '<title id="' + id + '-t">' + esc('Drawing: ' + T.title) + '</title>' +
      '<desc id="' + id + '-d">' + esc(describe(T)) + '</desc>' +
      '<defs><pattern id="' + id + '-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
        '<rect class="ts-hatch-bg" width="7" height="7"/><line class="ts-hatch-line" x1="0" y1="0" x2="0" y2="7"/></pattern>' +
        '<marker id="' + id + '-arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path class="ts-arrowhead" d="M0 0L8 4L0 8z"/></marker></defs>' +
      art + dim + notes + texts + '</svg>';
  }
  function outer(sg) { return sg.kind === 'thread' ? sg.crest[1] : sg.d; }
  function insideR(sg) { return sg.kind === 'thread' ? sg.crest[0] / 2 : sg.d / 2; }
  function frontChamfer(T) { var c = T.chamfers.filter(function (x) { return x.edge === 'front-od'; })[0]; return c ? c.c : 0; }
  function flatten(T) {
    var out = [];
    T.outside.concat(T.inside).forEach(function (sg) { out.push(sg.from, sg.to); });
    T.chamfers.forEach(function (c) { out.push(c.edge === 'back-od' ? T.length.L - c.c : c.c); });
    return out;
  }
  function distinctLengths(T) {
    var v = T.shoulders.map(function (s) { return s.at; }).concat([T.length.L]);
    return v.filter(function (x, i) { return v.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
  }
  function textW(t) { return t.length * 7.6; }
  function calloutText(sg) {
    if (sg.kind === 'thread') { return 'Ø' + M.fmt(sg.d) + ', ' + sg.tpi + ' threads per inch'; }
    if (sg.kind === 'knurl') { return 'Diamond knurl, Ø' + M.fmt(sg.d) + ' over points'; }
    if (sg.kind === 'groove') { return 'Groove Ø' + M.fmt(sg.d); }
    return 'Ø' + M.fmt(sg.d) + (sg.asBar ? ' (bar size)' : '');
  }
  function describe(T) {
    var parts = [T.title + ', ' + M.fmt(T.length.L) + ' in long, from ' + M.fmt(T.stock.dia) + ' in bar.'];
    T.outside.forEach(function (sg) { parts.push(sg.label + ': ' + calloutText(sg) + ', from ' + M.fmt(sg.from) + ' to ' + M.fmt(sg.to) + ' in from the front face.'); });
    T.inside.forEach(function (sg) { parts.push(sg.label + ' inside: ' + (sg.kind === 'thread' ? sg.tpi + ' threads per inch' : 'Ø' + M.fmt(sg.d)) + ', through.'); });
    T.chamfers.forEach(function (c) { parts.push(M.fmt(c.c) + ' in by 45 degree chamfer at the ' + (c.edge === 'front-od' ? 'front edge' : c.edge === 'back-od' ? 'back edge' : 'mouth of the hole') + '.'); });
    return parts.join(' ');
  }

  /* ---- the part once it has been cut off, on its own ----------------------------------*/
  function partFigure(piece, opts) {
    var o = opts || {}, id = o.idPrefix || 'ts-part', view = viewOf(o.view);
    var a = -1, b = -1, R = 0;
    for (var i = 0; i < piece.n; i++) { if (M.has(piece, i)) { if (a < 0) { a = i; } b = i; if (piece.ro[i] > R) { R = piece.ro[i]; } } }
    if (a < 0) { return ''; }
    var zA = piece.zL + a * COL, zB = piece.zL + (b + 1) * COL, m = 0.06;
    var f = box(zA - m, zB + m, -R - m, R + m, R), w = workPaths(piece, f, view);
    var label = o.label || 'The part as it came off the lathe, ' + VIEW_SAYS[view] + '.';
    if (view === 'section' && M.hasThreads(piece)) { label += ' Thread bands are schematic crest/root envelopes.'; }
    return '<svg class="ts-part-svg is-' + view + '" viewBox="0 0 ' + f.W + ' ' + f.H + '" role="img" aria-label="' + esc(label) + '" focusable="false">' +
      defs(id) + '<path class="ts-bore" d="' + w.bore + '"/><path class="ts-sec" fill="url(#' + id + '-hatch)" d="' + w.sec + '"/>' +
      '<path class="ts-thread-envelope" d="' + w.threadEnvelope + '"/>' +
      '<path class="ts-ext" d="' + w.ext + '"/><path class="ts-hidden" d="' + w.hidden + '"/><path class="ts-edge" d="' + w.edges + '"/><path class="ts-thread" d="' + w.threads + '"/>' +
      '<path class="ts-knurl" d="' + w.knurl + '"/><path class="ts-axis" d="M0 ' + f.y(0) + 'H' + f.W + '"/></svg>';
  }

  /* ---- printed scenes the page carries ------------------------------------------------
     Each is a state the simulator reaches by replaying learner actions, so a
     printed picture cannot drift from what the live one would show. */
  var SCENES = {
    'pin-turning': {
      target: 'stepped-pin',
      label: 'The stepped pin part-way through: the end faced with the facing blade, the body turned short of its shoulder, and the roughing tool halfway along the first pin pass. The angled shoulder allowance still needs radial facing. The dashed outline is the drawing; the tinted metal is still to come off.',
      ops: [['tool', 'face'], ['sp', true], ['mv', 0, 1.4], ['x', 0], ['x', 1.4], ['sp', false], ['tool', 'turn'], ['sp', true],
        ['mv', 0.1, 0.880], ['z', -1.21], ['x', 1.1], ['z', 0.1], ['x', 0.750], ['z', -1.21], ['x', 1.1], ['z', 0.1], ['x', 0.620], ['z', -0.30]]
    }
  };
  function sceneState(name) {
    var sc = SCENES[name], st = M.create(sc.target);
    M.play(st, sc.ops);
    return st;
  }
  function staticScene(name) {
    return scene(sceneState(name), { idPrefix: 'ts-static-' + name, label: SCENES[name].label });
  }

  return {
    S: S, VIEWS: ['section', 'normal'], frame: frame, box: box, partFigure: partFigure, simplify: simplify, flipY: flipY,
    workPaths: workPaths, ghostPaths: ghostPaths, comparePaths: comparePaths,
    toolShape: toolShape, toolIcon: toolIcon, chuck: chuck, scene: scene, drawing: drawing, describe: describe,
    SCENES: SCENES, sceneState: sceneState, staticScene: staticScene, esc: esc
  };
});
