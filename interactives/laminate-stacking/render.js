/* Pure SVG renderer for laminate-stacking. The live lesson and the static
   no-JS / print fallback both call these functions, so they cannot disagree.
   No element ids are emitted, so several mounts can share one page. */
(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiLaminate);
  if (node) module.exports = api; else root.CourseWikiLaminateDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  var PATCH_MM = 50;            // side of the drawn square patch
  var BASE_MAGNIFICATION = 50;  // out-of-plane exaggeration before any common reduction
  var LOAD_LIMIT = 0.5;         // N/mm, largest resultant offered by the controls
  var ROSE_MAX_GPA = 40;        // fixed radial scale: the ply's fiber-direction modulus

  function n(v) { var s = (Math.round(v * 100) / 100).toFixed(2); return s.replace(/\.?0+$/, '') || '0'; }
  function esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function txt(x, y, value, cls, anchor) {
    return '<text x="' + n(x) + '" y="' + n(y) + '" class="ls-t ' + (cls || '') + '"' +
      (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(value) + '</text>';
  }
  function angleClass(a) { return a === 0 ? 'p0' : a === 90 ? 'p90' : a === 45 ? 'p45' : a === -45 ? 'm45' : 'px'; }
  function angleText(a) { return (a > 0 && a !== 90 ? '+' : a < 0 ? '\u2212' : '') + Math.abs(a) + '\u00b0'; }

  /* Oblique view shared by the ply stack and the loaded patch: x to the right
     (the load axis), y away from the viewer, z up. */
  function projector(cx, cy, R) {
    return function (x, y, z) { return [cx + (x * 0.86 + y * 0.58) * R, cy + (x * 0.34 - y * 0.52) * R - z]; };
  }
  // Distance along the viewing direction (larger = farther), z in units of R.
  function depth(x, y, z) { return -0.6744 * x + y - 0.7493 * z; }
  function poly(points, cls, attrs) {
    return '<polygon class="' + cls + '" points="' + points.map(function (p) { return n(p[0]) + ',' + n(p[1]); }).join(' ') + '"' + (attrs || '') + '/>';
  }
  /* Segments of the lines {p : p . normal = c} inside the square [-1,1]^2. */
  function clipLine(dx, dy, c) {
    var nx = -dy, ny = dx, pts = [];
    [[-1, null], [1, null], [null, -1], [null, 1]].forEach(function (edge) {
      if (edge[0] !== null && Math.abs(ny) > 1e-9) {
        var y = (c - nx * edge[0]) / ny; if (y >= -1 - 1e-9 && y <= 1 + 1e-9) pts.push([edge[0], y]);
      } else if (edge[1] !== null && Math.abs(nx) > 1e-9) {
        var x = (c - ny * edge[1]) / nx; if (x >= -1 - 1e-9 && x <= 1 + 1e-9) pts.push([x, edge[1]]);
      }
    });
    if (pts.length < 2) return null;
    pts.sort(function (a, b) { return (a[0] * dx + a[1] * dy) - (b[0] * dx + b[1] * dy); });
    return [pts[0], pts[pts.length - 1]];
  }

  /* Exploded ply stack. angles listed top to bottom. */
  function stack(angles, opts) {
    var o = opts || {}, count = angles.length, R = 80, W = 446;
    var gap = Math.max(12, Math.min(30, 250 / Math.max(count, 1)));
    var top = 48, H = Math.round(top + 0.86 * R + (count - 1) * gap + 0.86 * R + 58);
    var P = projector(212, top + 0.86 * R, R), out = [];
    var label = o.label || ('Exploded ply stack ' + M.label(angles) + ', top ply first. ' +
      angles.map(function (a, i) { return 'ply ' + (i + 1) + ' ' + angleText(a); }).join(', ') + '.');
    out.push('<svg class="ls-svg ls-stack" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '" focusable="false">');
    for (var i = count - 1; i >= 0; i--) {
      var a = angles[i], z = -i * gap, cls = angleClass(a);
      var c = [P(-1, -1, z), P(1, -1, z), P(1, 1, z), P(-1, 1, z)];
      var lip = 4;
      out.push(poly([c[0], c[1], [c[1][0], c[1][1] + lip], [c[0][0], c[0][1] + lip]], 'ls-ply-edge ls-' + cls));
      out.push(poly([c[3], c[0], [c[0][0], c[0][1] + lip], [c[3][0], c[3][1] + lip]], 'ls-ply-edge ls-' + cls));
      out.push(poly(c, 'ls-ply ls-' + cls, ' data-ply="' + (i + 1) + '" data-angle="' + a + '"'));
      var t = a * Math.PI / 180, dx = Math.cos(t), dy = Math.sin(t), d = [];
      for (var k = -7; k <= 7; k++) {
        var seg = clipLine(dx, dy, k * 0.25);
        if (!seg) continue;
        var p1 = P(seg[0][0], seg[0][1], z), p2 = P(seg[1][0], seg[1][1], z);
        d.push('M' + n(p1[0]) + ' ' + n(p1[1]) + 'L' + n(p2[0]) + ' ' + n(p2[1]));
      }
      out.push('<path class="ls-fiber ls-fiber-' + cls + '" d="' + d.join('') + '"/>');
      var right = P(1, 1, z), lead = P(1, 0, z);
      out.push('<path class="ls-leader" d="M' + n(lead[0] + 6) + ' ' + n(lead[1]) + 'H' + n(W - 104) + '"/>');
      out.push(txt(W - 98, lead[1] + 6, (i + 1) + '  ' + angleText(a), 'ls-plylabel'));
      void right;
    }
    if (count > 1) {
      var midZ = -(count - 1) * gap / 2, m1 = P(-1.18, -1, midZ), m2 = P(1.1, -1, midZ);
      out.push('<path class="ls-mid" d="M' + n(m1[0]) + ' ' + n(m1[1]) + 'L' + n(m2[0]) + ' ' + n(m2[1]) + '"/>');
      out.push(txt(m1[0] - 4, m1[1] + 4, 'midplane', 'ls-small', 'end'));
    }
    var ax = [22, H - 40];
    out.push('<path class="ls-axis" d="M' + n(ax[0]) + ' ' + n(ax[1]) + 'l' + n(0.86 * 44) + ' ' + n(0.34 * 44) +
      'M' + n(ax[0]) + ' ' + n(ax[1]) + 'l' + n(0.58 * 44) + ' ' + n(-0.52 * 44) + '"/>');
    out.push(txt(ax[0] + 0.86 * 44 + 4, ax[1] + 0.34 * 44 + 6, 'x  0\u00b0', 'ls-small'));
    out.push(txt(ax[0] + 0.58 * 44 + 4, ax[1] - 0.52 * 44 - 2, 'y  90\u00b0', 'ls-small'));
    out.push(txt(16, 24, 'TOP FACE', 'ls-small ls-caps'));
    out.push(txt(W - 98, 24, 'ply  angle', 'ls-small'));
    out.push('</svg>');
    return out.join('');
  }

  function rosePath(points, cx, cy, R) {
    return points.map(function (p, i) {
      var r = p.E / ROSE_MAX_GPA * R, t = p.theta * Math.PI / 180;
      return (i ? 'L' : 'M') + n(cx + r * Math.cos(t)) + ' ' + n(cy - r * Math.sin(t));
    }).join('') + 'Z';
  }

  /* Polar plot of directional in-plane modulus. curves: [{points, kind}] */
  function rose(curves, opts) {
    var o = opts || {}, compact = !!o.compact, S = compact ? 220 : 380, cx = S / 2, cy = S / 2 + (compact ? 6 : 6);
    var R = compact ? 86 : 138, out = [];
    out.push('<svg class="ls-svg ls-rose' + (compact ? ' ls-rose-compact' : '') + '" viewBox="0 0 ' + S + ' ' + (S + (compact ? 0 : 6)) + '" role="img" aria-label="' + esc(o.label || 'Polar plot of in-plane modulus') + '" focusable="false">');
    [10, 20, 30, 40].forEach(function (g) {
      out.push('<circle class="ls-ring' + (g === 40 ? ' ls-ring-outer' : '') + '" cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(g / ROSE_MAX_GPA * R) + '"/>');
    });
    [0, 45, 90, 135].forEach(function (a) {
      var t = a * Math.PI / 180;
      out.push('<path class="ls-spoke" d="M' + n(cx - R * Math.cos(t)) + ' ' + n(cy + R * Math.sin(t)) + 'L' + n(cx + R * Math.cos(t)) + ' ' + n(cy - R * Math.sin(t)) + '"/>');
    });
    curves.forEach(function (c) {
      out.push('<path class="ls-curve ls-curve-' + c.kind + '" d="' + rosePath(c.points, cx, cy, R) + '"/>');
    });
    if (!compact) {
      [10, 20, 30, 40].forEach(function (g) {
        var r = g / ROSE_MAX_GPA * R, t = 112.5 * Math.PI / 180;
        out.push(txt(cx + r * Math.cos(t), cy - r * Math.sin(t) + 4, g + (g === 40 ? ' GPa' : ''), 'ls-small ls-ring-label', 'middle'));
      });
      out.push(txt(cx + R + 6, cy + 5, '0\u00b0', 'ls-small'));
      out.push(txt(cx, cy - R - 8, '90\u00b0', 'ls-small', 'middle'));
      out.push(txt(cx + R * 0.72 + 4, cy - R * 0.72 - 4, '45\u00b0', 'ls-small'));
      out.push(txt(cx - R * 0.72 - 4, cy - R * 0.72 - 4, '135\u00b0', 'ls-small', 'end'));
      out.push(txt(cx - R - 6, cy + 5, '180\u00b0', 'ls-small', 'end'));
    } else {
      out.push(txt(cx + R + 3, cy + 5, '0\u00b0', 'ls-small'));
      out.push(txt(cx, cy - R - 5, '90\u00b0', 'ls-small', 'middle'));
    }
    out.push('</svg>');
    return out.join('');
  }

  function roseCurves(L, showPly, cls) {
    var curves = [];
    if (showPly) curves.push({ kind: 'ply', points: M.polar(M.laminate([0]), 'flat', 3) });
    curves.push({ kind: 'flat', points: M.polar(L, 'flat', 3) });
    if (!(cls || M.classify(L, L.layers)).couplingZero) curves.push({ kind: 'free', points: M.polar(L, 'free', 3) });
    return curves;
  }

  /* One common out-of-plane magnification for the given laminates, chosen from
     the largest response any offered load could produce, so the drawn shape
     scales linearly while a slider moves. */
  function commonMagnification(lams) {
    // The height range of the surface is a maximum of linear functions of the
    // curvature, and curvature is linear in (Nx, Ny, Nxy), so the range is
    // convex in the load. Its largest value over the slider box is therefore
    // at one of the eight corners (+-LIMIT each), evaluated exactly.
    var worst = 0, half = PATCH_MM / 2;
    lams.forEach(function (L) {
      [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sy) { [-1, 1].forEach(function (sxy) {
        var k = M.respond(L, { Nx: sx * LOAD_LIMIT, Ny: sy * LOAD_LIMIT, Nxy: sxy * LOAD_LIMIT }).curvature;
        worst = Math.max(worst, M.smallDeflection(k, half, L.h).reliefMm);
      }); }); });
    });
    var allowed = 0.3 * PATCH_MM;   // keeps the drawn surface clear of the panel labels
    if (worst === 0) return BASE_MAGNIFICATION;
    var mag = Math.min(BASE_MAGNIFICATION, allowed / worst);
    return mag >= 10 ? Math.floor(mag) : Math.max(1, Math.floor(mag * 10) / 10);
  }

  /* Loaded square patch drawn from the solved curvature. */
  function panel(L, response, magnification, opts) {
    var o = opts || {}, W = 400, H = 402, R = 100, P = projector(186, 236, R), half = PATCH_MM / 2;
    var pxPerMm = R / half, G = 12, out = [], faces = [];
    function w(u, v) { return M.deflection(response.curvature, u * half, v * half) * magnification * pxPerMm; }
    for (var i = 0; i < G; i++) for (var j = 0; j < G; j++) {
      var u0 = -1 + 2 * i / G, u1 = -1 + 2 * (i + 1) / G, v0 = -1 + 2 * j / G, v1 = -1 + 2 * (j + 1) / G;
      var q = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(function (p) { return [p[0], p[1], w(p[0], p[1])]; });
      var cxm = (u0 + u1) / 2, cym = (v0 + v1) / 2, czm = (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4;
      // Surface normal from the two diagonals, in projected-pixel units.
      var ax = (q[2][0] - q[0][0]) * R, ay = (q[2][1] - q[0][1]) * R, az = q[2][2] - q[0][2];
      var bx = (q[3][0] - q[1][0]) * R, by = (q[3][1] - q[1][1]) * R, bz = q[3][2] - q[1][2];
      var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, len = Math.hypot(nx, ny, nz) || 1;
      var shade = Math.max(0, (nx * -0.45 + ny * -0.35 + nz * 0.82) / len);
      faces.push({ d: depth(cxm, cym, czm / R), pts: q.map(function (p) { return P(p[0], p[1], p[2]); }), shade: shade });
    }
    faces.sort(function (a, b) { return b.d - a.d; });
    var title = o.title || 'Panel';
    var lbl = o.label || (title + ': square patch under in-plane load with zero applied moment.');
    var labelled = o.labels !== false;
    // Without in-figure labels (the live lab puts them in HTML) the view crops to the drawing area.
    var box = labelled ? '0 0 ' + W + ' ' + H : '18 70 350 334';
    out.push('<svg class="ls-svg ls-panel" viewBox="' + box + '" role="img" aria-label="' + esc(lbl) + '" focusable="false">');
    out.push(poly([P(-1, -1, 0), P(1, -1, 0), P(1, 1, 0), P(-1, 1, 0)], 'ls-flat'));
    faces.forEach(function (f) {
      out.push(poly(f.pts, 'ls-face', ' style="fill-opacity:' + (0.16 + 0.5 * f.shade).toFixed(2) + '"'));
    });
    out.push(poly([P(-1, -1, 0), P(1, -1, 0), P(1, 1, 0), P(-1, 1, 0)], 'ls-flat ls-flat-front'));
    var N = response.load;
    function arrow(x0, y0, dx, dy, cls) {
      var a = P(x0, y0, w(x0, y0)), b = P(x0 + dx, y0 + dy, w(x0, y0));
      var ang = Math.atan2(b[1] - a[1], b[0] - a[0]), hs = 7;
      return '<path class="ls-load ' + (cls || '') + '" d="M' + n(a[0]) + ' ' + n(a[1]) + 'L' + n(b[0]) + ' ' + n(b[1]) +
        'M' + n(b[0] - hs * Math.cos(ang - 0.45)) + ' ' + n(b[1] - hs * Math.sin(ang - 0.45)) + 'L' + n(b[0]) + ' ' + n(b[1]) +
        'L' + n(b[0] - hs * Math.cos(ang + 0.45)) + ' ' + n(b[1] - hs * Math.sin(ang + 0.45)) + '"/>';
    }
    var len = 0.34;
    [-0.6, 0, 0.6].forEach(function (s) {
      if (N.Nx) { var sx = N.Nx > 0 ? 1 : -1; out.push(arrow(1.04 + (sx < 0 ? len : 0), s, sx * len, 0)); out.push(arrow(-1.04 - (sx < 0 ? len : 0), s, -sx * len, 0)); }
      if (N.Ny) { var sy = N.Ny > 0 ? 1 : -1; out.push(arrow(s, 1.04 + (sy < 0 ? len : 0), 0, sy * len)); out.push(arrow(s, -1.04 - (sy < 0 ? len : 0), 0, -sy * len)); }
    });
    if (N.Nxy) {
      var ss = N.Nxy > 0 ? 1 : -1;
      out.push(arrow(1.08, -0.3 * ss, 0, 0.6 * ss, 'ls-shear')); out.push(arrow(-1.08, 0.3 * ss, 0, -0.6 * ss, 'ls-shear'));
      out.push(arrow(-0.3 * ss, 1.08, 0.6 * ss, 0, 'ls-shear')); out.push(arrow(0.3 * ss, -1.08, -0.6 * ss, 0, 'ls-shear'));
    }
    if (!labelled) { out.push('</svg>'); return out.join(''); }
    var stackText = o.stackLabel || '';
    if (stackText.length > 36) stackText = stackText.slice(0, 35) + '\u2026';
    out.push(txt(14, 24, title, 'ls-head'));
    out.push(txt(W - 12, 24, 'height \u00d7' + magnification, 'ls-small', 'end'));
    out.push(txt(14, 46, stackText, 'ls-small'));
    var loadText = ['Nx', 'Ny', 'Nxy'].filter(function (k) { return N[k]; }).map(function (k) { return k + ' ' + M.format(N[k], 2); }).join(' \u00b7 ');
    out.push(txt(14, 68, loadText ? loadText + ' N/mm, M = 0' : 'no load, M = 0', 'ls-small'));
    out.push('</svg>');
    return out.join('');
  }

  function curvatureText(k) {
    var parts = [['\u03bax', k.kx], ['\u03bay', k.ky], ['\u03baxy', k.kxy]].map(function (p) {
      return p[0] + ' ' + sci(p[1]) + ' mm\u207b\u00b9';
    });
    return parts.join(' \u00b7 ');
  }
  function sci(v) {
    if (Math.abs(v) < 1e-12) return '0';
    var e = Math.floor(Math.log10(Math.abs(v))), m = v / Math.pow(10, e);
    var sup = String(e).replace('-', '\u207b').replace(/[0-9]/g, function (d) { return '\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079'[d]; });
    return M.format(m, 2) + '\u00d710' + sup;
  }

  /* Complete static lesson used inside the mount for no-JS, search and print. */
  function staticLesson() {
    var cross = [0, 90, 90, 0], qi = [0, 45, -45, 90, 90, -45, 45, 0], unsym = [0, 90];
    var Lc = M.laminate(cross), Lq = M.laminate(qi), Lu = M.laminate(unsym), Lp = M.laminate([0]);
    var Ec0 = M.directionalModulus(Lc, 0), Ec45 = M.directionalModulus(Lc, 45), Eq = M.directionalModulus(Lq, 0);
    var load = { Nx: 0.5 }, ru = M.respond(Lu, load), rc = M.respond(Lc, load);
    var mag = commonMagnification([Lu, Lc]);
    var fig1 = '<figure class="ls-static-figure"><div class="ls-static-pair">' +
      '<div>' + stack(cross) + rose(roseCurves(Lc, true), { label: 'Polar plot for [0/90]s: ' + M.format(Ec0) + ' GPa along 0 and 90 degrees, ' + M.format(Ec45) + ' GPa at 45 degrees.' }) + '</div>' +
      '<div>' + stack(qi) + rose(roseCurves(Lq, true), { label: 'Polar plot for [0/+45/\u221245/90]s: a circle at ' + M.format(Eq) + ' GPa in every direction.' }) + '</div>' +
      '</div><figcaption><strong>Same ply, two balanced symmetric stacks.</strong> Left, cross-ply [0/90]s: ' + M.format(Ec0) +
      ' GPa along 0\u00b0 and 90\u00b0 but only ' + M.format(Ec45) + ' GPa at 45\u00b0. Right, [0/+45/\u221245/90]s: ' + M.format(Eq) +
      ' GPa in every in-plane direction, so the shaded rose is a circle. The dotted outline is one 0\u00b0 ply on its own (40 GPa along the fibers, 10 GPa across), the same ply as the fiber-orientation lesson above. Radius = modulus; outer ring 40 GPa.</figcaption></figure>';
    var fig2 = '<figure class="ls-static-figure"><div class="ls-static-pair">' +
      '<div>' + panel(Lu, ru, mag, { title: 'UNSYMMETRIC', stackLabel: '[0/90], 0\u00b0 ply on top', label: '[0/90] under Nx 0.5 N/mm and zero moment curls about the y axis.' }) + '</div>' +
      '<div>' + panel(Lc, rc, mag, { title: 'SYMMETRIC', stackLabel: '[0/90]s', label: '[0/90]s under the same load stays flat.' }) + '</div>' +
      '</div><figcaption><strong>Same pull, Nx = 0.5 N/mm, no applied moment.</strong> [0/90] curls: ' + curvatureText(ru.curvature) +
      ' (principal radius about ' + Math.round(M.principalCurvatures(ru.curvature).radiusMm) + ' mm). [0/90]s stays flat: all curvatures are zero because B = 0. Height exaggerated \u00d7' + mag +
      ' in both drawings of a ' + PATCH_MM + ' mm square patch; the dashed outline is the unloaded patch and in-plane stretch is not drawn. With no load, both are flat.</figcaption></figure>';
    var rows = [
      ['[0]', [0]], ['[0/90]', unsym], ['[0/90]s', cross], ['[+45/\u221245]', [45, -45]], ['[\u00b145]s', [45, -45, -45, 45]], ['[0/+45/\u221245/90]s', qi]
    ].map(function (r) {
      var L = M.laminate(r[1]), c = M.classify(L, r[1]);
      return '<tr><th>' + r[0] + '</th><td>' + (c.symmetric ? 'yes' : 'no') + '</td><td>' + (c.balanced ? 'yes' : 'no') + '</td><td>' + (c.quasiIsotropic ? 'yes' : 'no') +
        '</td><td>' + M.format(M.directionalModulus(L, 0)) + ' / ' + M.format(M.directionalModulus(L, 45)) + ' / ' + M.format(M.directionalModulus(L, 90)) +
        '</td><td>' + (c.couplingZero ? '0' : M.format(c.Bmax, 1) + ' N') + '</td></tr>';
    }).join('');
    return '<p><strong>Challenge:</strong> using only 0\u00b0, +45\u00b0, \u221245\u00b0 and 90\u00b0 plies, build a laminate that is equally stiff in every in-plane direction. Then find out why an unsymmetric stack curls when it is pulled.</p>' +
      fig1 +
      '<div class="unit-table-wrap" tabindex="0" role="region" aria-label="Laminate comparison table; scroll horizontally to see every column"><table class="unit-table"><caption>Same illustrative plies, 0.125 mm each. E<sub>x</sub> is flat-held (curvature held at zero).</caption><thead><tr><th>Stack (top first)</th><th>Symmetric</th><th>Balanced</th><th>Quasi-isotropic</th><th>E<sub>x</sub> at 0\u00b0 / 45\u00b0 / 90\u00b0, GPa</th><th>Largest |B<sub>ij</sub>|</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p>A single 0\u00b0 ply gives ' + M.format(M.directionalModulus(Lp, 0)) + ' GPa along x and ' + M.format(M.directionalModulus(Lp, 90)) + ' GPa along y, the fiber-orientation result for the same ply.</p>' +
      fig2;
  }

  return { stack: stack, rose: rose, roseCurves: roseCurves, panel: panel, commonMagnification: commonMagnification,
    curvatureText: curvatureText, sci: sci, staticLesson: staticLesson, angleText: angleText, angleClass: angleClass,
    PATCH_MM: PATCH_MM, LOAD_LIMIT: LOAD_LIMIT, BASE_MAGNIFICATION: BASE_MAGNIFICATION, ROSE_MAX_GPA: ROSE_MAX_GPA };
});
