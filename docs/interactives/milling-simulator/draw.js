/* ============================================================================
   milling-simulator / draw.js - the drawings, as SVG markup.

   Pure functions: data in, markup out. Node runs them to produce the printed
   figures in the page source, and the live simulator runs the same ones, so
   the paper copy and the screen cannot drift apart.

   Units are millimetres throughout: one SVG user unit is one millimetre.
   Screen y runs down, so a part's Y (top view) or Z (section) is negated.

   Third-angle projection, as engineering drawings in North America use:
   the top view sits above the front view, the right-hand view to the right
   of it, and all of them at one scale.
   ==========================================================================*/
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiMillingSim,
    node ? require('./inspect.js') : root.CourseWikiMillingInspect);
  if (node) module.exports = api;
  else root.CourseWikiMillingDraw = api;
})(typeof self !== 'undefined' ? self : this, function (M, I) {
  'use strict';

  var ST = M.SETUP.stock;
  function n(v) { var s = (Math.round(v * 100) / 100).toString(); return s === '-0' ? '0' : s; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function p(cls, d, extra) { return '<path class="' + cls + '" d="' + d + '"' + (extra || '') + '/>'; }
  function line(cls, x1, y1, x2, y2) { return p(cls, 'M' + n(x1) + ' ' + n(y1) + 'L' + n(x2) + ' ' + n(y2)); }
  function text(cls, x, y, s, anchor, extra) {
    return '<text class="' + cls + '" x="' + n(x) + '" y="' + n(y) + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') +
      (extra || '') + '>' + esc(s) + '</text>';
  }
  function circle(cls, cx, cy, r) { return '<circle class="' + cls + '" cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '"/>'; }
  function poly(pts, close) {
    var d = '';
    pts.forEach(function (q, k) { d += (k ? 'L' : 'M') + n(q[0]) + ' ' + n(q[1]); });
    return d + (close ? 'Z' : '');
  }
  function dimValue(v) { return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : M.fmt(v, 2).replace(/0$/, ''); }

  /* Drop the middle of every straight run, so a sampled profile stays small. */
  function simplify(pts) {
    if (pts.length < 3) return pts;
    var out = [pts[0]];
    for (var k = 1; k < pts.length - 1; k++) {
      var a = out[out.length - 1], b = pts[k], c = pts[k + 1];
      var cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(cross) > 1e-6) out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /* ======================================================================
     Tools, side on, tip at the origin, screen y down (y = -z).
     ====================================================================*/
  function helix(x0, x1, z0, z1, pitch) {
    var d = '';
    for (var z = z0 + pitch * 0.5; z < z1; z += pitch) {
      var za = z, zb = Math.min(z1, z + (x1 - x0) * 0.55);
      d += 'M' + n(x0) + ' ' + n(-za) + 'L' + n(x1) + ' ' + n(-zb);
    }
    return d;
  }
  function holder(w, z0, len) {
    // a collet chuck: a nut, then the body narrowing into the spindle
    var a = w / 2 + 4, b = w / 2 + 8;
    return p('ms-tool-holder', 'M' + n(-a) + ' ' + n(-z0) + 'L' + n(a) + ' ' + n(-z0) + 'L' + n(b) + ' ' + n(-(z0 + 8)) +
      'L' + n(b) + ' ' + n(-(z0 + len)) + 'L' + n(-b) + ' ' + n(-(z0 + len)) + 'L' + n(-b) + ' ' + n(-(z0 + 8)) + 'Z');
  }
  function toolShape(t) {
    var r = t.dia / 2, out = [];
    switch (t.kind) {
      case 'face':
        out.push(p('ms-tool-body', 'M-22 -3.5L22 -3.5L22 -26L-22 -26Z'));
        [[-25, -18.5], [-3.25, 3.25], [18.5, 25]].forEach(function (s) {
          out.push(p('ms-tool-insert', 'M' + n(s[0]) + ' 0L' + n(s[1]) + ' 0L' + n(s[1] - 1) + ' -5.5L' + n(s[0] + 1) + ' -5.5Z'));
        });
        out.push(p('ms-tool-holder', 'M-11 -26L11 -26L11 -50L-11 -50Z'));
        return { parts: out, top: 50, half: 25 };
      case 'end':
        out.push(p('ms-tool-cut', 'M' + n(-r) + ' 0L' + n(r) + ' 0L' + n(r) + ' ' + n(-t.reach) + 'L' + n(-r) + ' ' + n(-t.reach) + 'Z'));
        out.push(p('ms-tool-helix', helix(-r, r, 0, t.reach, Math.max(3, t.dia * 0.8))));
        out.push(p('ms-tool-body', 'M' + n(-r) + ' ' + n(-t.reach) + 'L' + n(r) + ' ' + n(-t.reach) + 'L' + n(r) + ' ' + n(-(t.reach + 22)) + 'L' + n(-r) + ' ' + n(-(t.reach + 22)) + 'Z'));
        out.push(holder(t.dia, t.reach + 22, 26));
        return { parts: out, top: t.reach + 48, half: r + 8 };
      case 'spot':
        out.push(p('ms-tool-cut', 'M0 0L' + n(r) + ' ' + n(-t.reach) + 'L' + n(-r) + ' ' + n(-t.reach) + 'Z'));
        out.push(p('ms-tool-body', 'M' + n(-r) + ' ' + n(-t.reach) + 'L' + n(r) + ' ' + n(-t.reach) + 'L' + n(r) + ' -34L' + n(-r) + ' -34Z'));
        out.push(holder(t.dia, 34, 26));
        return { parts: out, top: 60, half: r + 8 };
      case 'drill': {
        var h = r * t.cone, fl = 30;
        out.push(p('ms-tool-cut', 'M0 0L' + n(r) + ' ' + n(-h) + 'L' + n(r) + ' ' + n(-fl) + 'L' + n(-r) + ' ' + n(-fl) + 'L' + n(-r) + ' ' + n(-h) + 'Z'));
        out.push(p('ms-tool-helix', helix(-r, r, h, fl, Math.max(2.5, t.dia * 0.9))));
        out.push(p('ms-tool-body', 'M' + n(-r) + ' ' + n(-fl) + 'L' + n(r) + ' ' + n(-fl) + 'L' + n(r) + ' -44L' + n(-r) + ' -44Z'));
        // a key-type drill chuck
        out.push(p('ms-tool-holder', 'M' + n(-r - 2) + ' -44L' + n(r + 2) + ' -44L13 -58L13 -66L-13 -66L-13 -58Z'));
        return { parts: out, top: 66, half: 13 };
      }
      case 'tap': {
        var th = M.THREADS[t.thread], P = th.pitch, R = th.major / 2, rm = th.tapDrill / 2, lead = t.lead * P, len = 16;
        var d = 'M' + n(-rm * 0.92) + ' 0L' + n(rm * 0.92) + ' 0';
        // thread crests on the right, tapering over the lead
        for (var z = 0; z < len; z += P) {
          var f = Math.min(1, z / lead), rc = rm + (R - rm) * f, rn = rm + (R - rm) * Math.min(1, (z + P / 2) / lead);
          d += 'L' + n(rm) + ' ' + n(-z) + 'L' + n(rn) + ' ' + n(-(z + P / 2));
          void rc;
        }
        d += 'L' + n(rm) + ' ' + n(-len) + 'L' + n(-rm) + ' ' + n(-len);
        for (var z2 = len; z2 > 0; z2 -= P) {
          var rn2 = rm + (R - rm) * Math.min(1, (z2 - P / 2) / lead);
          d += 'L' + n(-rm) + ' ' + n(-z2) + 'L' + n(-rn2) + ' ' + n(-(z2 - P / 2));
        }
        d += 'Z';
        out.push(p('ms-tool-cut', d));
        out.push(p('ms-tool-body', 'M' + n(-R * 0.8) + ' ' + n(-len) + 'L' + n(R * 0.8) + ' ' + n(-len) + 'L' + n(R * 0.8) + ' -38L' + n(-R * 0.8) + ' -38Z'));
        out.push(p('ms-tool-holder', 'M-9 -38L9 -38L9 -62L-9 -62Z'));
        return { parts: out, top: 62, half: 9 };
      }
      case 'bore': {
        var bar = t.barDia, x1 = r, x0 = r - bar;
        out.push(p('ms-tool-body', 'M' + n(x0) + ' -1.5L' + n(x1 - 1.5) + ' -1.5L' + n(x1 - 1.5) + ' -30L' + n(x0) + ' -30Z'));
        out.push(p('ms-tool-cut', 'M' + n(x1) + ' 0L' + n(x1 - 3) + ' 0L' + n(x1 - 3) + ' -3L' + n(x1 - 1.5) + ' -3Z'));
        var hw = Math.max(18, r + 6);
        out.push(p('ms-tool-holder', 'M' + n(-hw) + ' -30L' + n(hw) + ' -30L' + n(hw) + ' -46L' + n(-hw) + ' -46Z'));
        out.push(p('ms-tool-holder', 'M-9 -46L9 -46L9 -64L-9 -64Z'));
        out.push(p('ms-tool-axis', 'M0 2L0 -66'));
        return { parts: out, top: 66, half: hw };
      }
    }
    return { parts: [], top: 0, half: 0 };
  }

  /* A tool placed in a view whose screen y is -z, tip at (x, z). */
  function placeTool(t, x, z, cls) {
    var s = toolShape(t);
    return '<g class="ms-tool' + (cls ? ' ' + cls : '') + '" transform="translate(' + n(x) + ' ' + n(-z) + ')">' + s.parts.join('') + '</g>';
  }

  /* One tool on its own, for the rack and the tool card. */
  function renderToolIcon(t, opts) {
    opts = opts || {};
    var s = toolShape(t), pad = 2, w = 2 * s.half + 2 * pad, h = s.top + 2 * pad;
    var scale = opts.height ? opts.height / h : 1;
    return '<svg class="ms-tool-icon" viewBox="' + n(-s.half - pad) + ' ' + n(-s.top - pad) + ' ' + n(w) + ' ' + n(h) + '"' +
      ' width="' + n(w * scale) + '" height="' + n(h * scale) + '" aria-hidden="true" focusable="false">' + s.parts.join('') + '</svg>';
  }

  /* ======================================================================
     Dimensions and notes
     ====================================================================*/
  function arrow(x, y, ux, uy) {
    var L = 2.2, W = 0.75, bx = x - ux * L, by = y - uy * L;
    return p('msd-arrow', 'M' + n(x) + ' ' + n(y) + 'L' + n(bx - uy * W) + ' ' + n(by + ux * W) + 'L' + n(bx + uy * W) + ' ' + n(by - ux * W) + 'Z');
  }
  /* A linear dimension. a, b: the two measured points in screen units along
     the dimension's own axis; at: the dimension line's position across it;
     ext: where the extension lines start, one value or [for a, for b].
     horiz: a horizontal dimension. */
  function linearDim(horiz, a, b, at, ext, label) {
    var out = [], lo = Math.min(a, b), hi = Math.max(a, b), gap = 1, over = 1.5;
    var exts = Array.isArray(ext) ? ext : [ext, ext], eLo = a <= b ? exts[0] : exts[1], eHi = a <= b ? exts[1] : exts[0];
    var ends = [[lo, eLo], [hi, eHi]];
    if (horiz) {
      ends.forEach(function (e) { var dir = at > e[1] ? 1 : -1; out.push(line('msd-ext', e[0], e[1] + dir * gap, e[0], at + dir * over)); });
      out.push(line('msd-dim', lo, at, hi, at));
      if (hi - lo >= 9) { out.push(arrow(lo, at, -1, 0)); out.push(arrow(hi, at, 1, 0)); }
      else {
        out.push(line('msd-dim', lo - 5, at, lo, at)); out.push(line('msd-dim', hi, at, hi + 5, at));
        out.push(arrow(lo, at, 1, 0)); out.push(arrow(hi, at, -1, 0));
      }
      out.push(text('msd-t msd-t-dim', (lo + hi) / 2, at - 1.1, label, 'middle'));
    } else {
      ends.forEach(function (e) { var dir = at > e[1] ? 1 : -1; out.push(line('msd-ext', e[1] + dir * gap, e[0], at + dir * over, e[0])); });
      out.push(line('msd-dim', at, lo, at, hi));
      if (hi - lo >= 9) { out.push(arrow(at, lo, 0, -1)); out.push(arrow(at, hi, 0, 1)); }
      else {
        out.push(line('msd-dim', at, lo - 5, at, lo)); out.push(line('msd-dim', at, hi, at, hi + 5));
        out.push(arrow(at, lo, 0, 1)); out.push(arrow(at, hi, 0, -1));
      }
      var tx = at - 1.1;
      out.push(text('msd-t msd-t-dim', tx, (lo + hi) / 2, label, 'middle', ' transform="rotate(-90 ' + n(tx) + ' ' + n((lo + hi) / 2) + ')"'));
    }
    return out.join('');
  }

  /* ======================================================================
     The job drawing: top view above section A-A
     ====================================================================*/
  var SEC = 34;                         // screen y of Z 0 in the section view
  function topY(y) { return -y; }
  function secY(z) { return SEC - z; }

  function roundedRect(x0, y0, x1, y1, r) {
    // screen coordinates of a part-coordinate rectangle, y flipped
    var a = topY(y1), b = topY(y0);
    if (!r) return 'M' + n(x0) + ' ' + n(a) + 'H' + n(x1) + 'V' + n(b) + 'H' + n(x0) + 'Z';
    return 'M' + n(x0 + r) + ' ' + n(a) + 'H' + n(x1 - r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(x1) + ' ' + n(a + r) +
      'V' + n(b - r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(x1 - r) + ' ' + n(b) + 'H' + n(x0 + r) +
      'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(x0) + ' ' + n(b - r) + 'V' + n(a + r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(x0 + r) + ' ' + n(a) + 'Z';
  }
  function centerMark(cx, cy, r) {
    var e = r + 1.8, y = topY(cy);
    return line('msd-center', cx - e, y, cx + e, y) + line('msd-center', cx, y - e, cx, y + e);
  }

  var TOPVIEW = {
    recess: function (f) {
      var inX0 = f.x0 > ST.x0 + 0.01, inX1 = f.x1 < ST.x1 - 0.01, inY0 = f.y0 > ST.y0 + 0.01, inY1 = f.y1 < ST.y1 - 0.01;
      if (inX0 && inX1 && inY0 && inY1) return p('msd-vis', roundedRect(f.x0, f.y0, f.x1, f.y1, f.rMax || 0));
      var x0 = Math.max(f.x0, ST.x0), x1 = Math.min(f.x1, ST.x1), y0 = Math.max(f.y0, ST.y0), y1 = Math.min(f.y1, ST.y1), out = '';
      if (inX0) out += line('msd-vis', f.x0, topY(y0), f.x0, topY(y1));
      if (inX1) out += line('msd-vis', f.x1, topY(y0), f.x1, topY(y1));
      if (inY0) out += line('msd-vis', x0, topY(f.y0), x1, topY(f.y0));
      if (inY1) out += line('msd-vis', x0, topY(f.y1), x1, topY(f.y1));
      return out;
    },
    slot: function (f) {
      var r = f.width / 2, L = Math.hypot(f.bx - f.ax, f.by - f.ay), ux = (f.bx - f.ax) / L, uy = (f.by - f.ay) / L, nx = -uy, ny = ux;
      var A1 = [f.ax + nx * r, topY(f.ay + ny * r)], B1 = [f.bx + nx * r, topY(f.by + ny * r)];
      var B2 = [f.bx - nx * r, topY(f.by - ny * r)], A2 = [f.ax - nx * r, topY(f.ay - ny * r)];
      return p('msd-vis', 'M' + n(A1[0]) + ' ' + n(A1[1]) + 'L' + n(B1[0]) + ' ' + n(B1[1]) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(B2[0]) + ' ' + n(B2[1]) +
        'L' + n(A2[0]) + ' ' + n(A2[1]) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(A1[0]) + ' ' + n(A1[1]) + 'Z') +
        line('msd-center', f.ax - r - 2, topY(f.ay), f.bx + r + 2, topY(f.by)) +
        line('msd-center', f.ax, topY(f.ay) - 2, f.ax, topY(f.ay) + 2) + line('msd-center', f.bx, topY(f.by) - 2, f.bx, topY(f.by) + 2);
    },
    boss: function (f) { return p('msd-vis', roundedRect(f.x0, f.y0, f.x1, f.y1, 0)); },
    chamfer: function (f) {
      var b = f.boss, c = f.size;
      return p('msd-vis', roundedRect(b.x0 + c, b.y0 + c, b.x1 - c, b.y1 - c, 0)) +
        line('msd-vis', b.x0, topY(b.y0), b.x0 + c, topY(b.y0 + c)) + line('msd-vis', b.x1, topY(b.y0), b.x1 - c, topY(b.y0 + c)) +
        line('msd-vis', b.x0, topY(b.y1), b.x0 + c, topY(b.y1 - c)) + line('msd-vis', b.x1, topY(b.y1), b.x1 - c, topY(b.y1 - c));
    },
    hole: function (f) {
      var out = '', r = f.d / 2, y = topY(f.cy);
      if (f.thread) {
        var th = M.THREADS[f.thread.spec], R = th.major / 2;
        out += circle('msd-vis', f.cx, y, th.tapDrill / 2);
        // the thread's outside diameter: a thin three-quarter circle
        out += p('msd-thin', 'M' + n(f.cx + R) + ' ' + n(y) + 'A' + n(R) + ' ' + n(R) + ' 0 1 0 ' + n(f.cx) + ' ' + n(y + R));
      } else out += circle('msd-vis', f.cx, y, r);
      if (f.csk) out += circle('msd-vis', f.cx, y, f.csk.d / 2);
      return out + centerMark(f.cx, f.cy, f.csk ? f.csk.d / 2 : f.thread ? M.THREADS[f.thread.spec].major / 2 : r);
    }
  };

  /* The section along Y = at: the part's nominal profile, hatched. */
  function sectionProfile(zAt, x0, x1, step) {
    var pts = [];
    for (var x = x0; x <= x1 + 1e-9; x += step) pts.push([x, zAt(x)]);
    return pts;
  }
  function sectionPath(pts, bottom) {
    var poly2 = [[pts[0][0], secY(bottom)]];
    pts.forEach(function (q) { poly2.push([q[0], secY(q[1])]); });
    poly2.push([pts[pts.length - 1][0], secY(bottom)]);
    return poly(simplify(poly2), true);
  }

  function hatchDefs(id, cls) {
    return '<defs><pattern id="' + id + '" patternUnits="userSpaceOnUse" width="2.2" height="2.2" patternTransform="rotate(45)">' +
      '<path class="' + (cls || 'msd-hatch-line') + '" d="M0 0V2.2"/></pattern></defs>';
  }

  function renderDrawing(job, opts) {
    opts = opts || {};
    var id = (opts.idPrefix || 'msd-' + job.id) + '-hatch', out = [];
    var bottom = job.bottom, ys = job.section;
    out.push(hatchDefs(id));
    // ---- top view
    out.push(p('msd-vis msd-outline', roundedRect(ST.x0, ST.y0, ST.x1, ST.y1, 0)));
    job.features.forEach(function (f) { out.push(TOPVIEW[f.type](f)); });
    // cutting plane A-A: direction of sight toward the back (+Y)
    var cy = topY(ys);
    out.push(p('msd-cut', 'M-7 ' + n(cy) + 'H107'));
    out.push(p('msd-cut-end', 'M-7 ' + n(cy) + 'H-3M103 ' + n(cy) + 'H107'));
    out.push(arrow(-5, cy - 5, 0, -1) + line('msd-cut-end', -5, cy, -5, cy - 3));
    out.push(arrow(105, cy - 5, 0, -1) + line('msd-cut-end', 105, cy, 105, cy - 3));
    out.push(text('msd-t msd-t-label', -5, cy - 6.5, 'A', 'middle'));
    out.push(text('msd-t msd-t-label', 105, cy - 6.5, 'A', 'middle'));
    // ---- section A-A
    var zAt = function (x) { return I.nominalAt(job, x, ys); };
    var pts = sectionProfile(zAt, ST.x0, ST.x1, 0.05);
    var d = sectionPath(pts, bottom);
    out.push(p('msd-section', d, ' fill="url(#' + id + ')"'));
    out.push(p('msd-vis msd-section-edge', d));
    job.features.forEach(function (f) {
      if (f.type !== 'hole' || Math.abs(f.cy - ys) > f.d / 2) return;
      var top = f.top == null ? job.top : f.top;
      out.push(line('msd-center', f.cx, secY(top) - 3, f.cx, secY(bottom) + 3));
      if (f.thread) {
        var th = M.THREADS[f.thread.spec], R = th.major / 2;
        var zt = top - (f.csk ? (f.csk.d / 2 - th.tapDrill / 2) : 0), zb = top - f.thread.depth;
        out.push(line('msd-thin', f.cx - R, secY(zt), f.cx - R, secY(zb)));
        out.push(line('msd-thin', f.cx + R, secY(zt), f.cx + R, secY(zb)));
        out.push(line('msd-vis', f.cx - R, secY(zb), f.cx + R, secY(zb)));
      }
    });
    out.push(text('msd-t msd-t-label', 50, secY(bottom) + 7, 'SECTION A–A', 'middle'));
    // ---- dimensions
    job.dims.forEach(function (dm) {
      var label = dm.text || dimValue(Math.abs(dm.to - dm.from));
      var ext = function (dflt, map) {
        var e = dm.ext == null ? dflt : dm.ext;
        return Array.isArray(e) ? e.map(map) : map(e);
      };
      if (dm.view === 'top' && dm.axis === 'x') {
        out.push(linearDim(true, dm.from, dm.to, topY(dm.at), ext(dm.at < 0 ? ST.y0 : ST.y1, topY), label));
      } else if (dm.view === 'top' && dm.axis === 'y') {
        out.push(linearDim(false, topY(dm.from), topY(dm.to), dm.at, ext(dm.at < 0 ? ST.x0 : ST.x1, Number), label));
      } else if (dm.view === 'front' && dm.axis === 'z') {
        out.push(linearDim(false, secY(dm.from), secY(dm.to), dm.at, ext(dm.at < 50 ? ST.x0 : ST.x1, Number), label));
      }
    });
    // ---- notes with leaders
    (job.notes || []).forEach(function (nt) {
      var ax = nt.at[0], ay = nt.at[1], tx = nt.to[0], ty = nt.to[1];
      var L = Math.hypot(tx - ax, ty - ay), r = nt.r || 0;
      var sx = ax + ((tx - ax) / L) * r, sy = ay + ((ty - ay) / L) * r;
      var right = nt.align !== 'left' && !(nt.align == null && tx < ax), shoulder = right ? 3 : -3;
      out.push(line('msd-thin', tx, topY(ty), sx, topY(sy)));
      out.push(arrow(sx, topY(sy), (sx - tx) / Math.hypot(sx - tx, sy - ty), -(sy - ty) / Math.hypot(sx - tx, sy - ty)));
      out.push(line('msd-thin', tx, topY(ty), tx + shoulder, topY(ty)));
      nt.lines.forEach(function (s, k) {
        out.push(text('msd-t msd-t-note', tx + shoulder + (right ? 1 : -1), topY(ty) + 1.1 + k * 4.2, s, right ? 'start' : 'end'));
      });
    });
    var label = opts.label || ('Drawing for job ' + job.n + ': ' + job.title + '. ' + job.brief);
    // room above the top view only for the notes that are there
    var high = ST.y1 + 8;
    (job.notes || []).forEach(function (nt) { high = Math.max(high, nt.to[1] + 4); });
    return '<svg class="msd-svg" viewBox="-30 ' + n(-high) + ' 170 ' + n(high + 66) + '" role="img" aria-label="' + esc(label) + '" focusable="false">' +
      out.join('') + '</svg>';
  }

  /* ======================================================================
     The setup: where the part sits, and where zero is
     ====================================================================*/
  function renderSetup(opts) {
    opts = opts || {};
    var S = M.SETUP, id = (opts.idPrefix || 'msd-setup') + '-hatch', out = [hatchDefs(id)];
    // top view: jaws, parallels hidden under the part, the part, X and Y
    S.jaws.forEach(function (j) {
      out.push(p('msd-jaw', roundedRect(j.x0, j.y0, j.x1, j.y1, 0)));
    });
    S.parallels.forEach(function (q) { out.push(p('msd-hidden', roundedRect(q.x0, q.y0, q.x1, q.y1, 0))); });
    out.push(p('msd-vis msd-outline', roundedRect(ST.x0, ST.y0, ST.x1, ST.y1, 0)));
    out.push(p('msd-axis', 'M0 0H16') + arrow(18, 0, 1, 0) + p('msd-axis', 'M0 0V-16') + arrow(0, -18, 0, -1));
    out.push(circle('msd-origin', 0, 0, 1.4));
    out.push(text('msd-t msd-t-label', 21, 1.2, 'X', 'start'));
    out.push(text('msd-t msd-t-label', 0, -21, 'Y', 'middle'));
    out.push(text('msd-t msd-t-note', 2.5, 5.5, 'X0 Y0', 'start'));
    out.push(text('msd-t msd-t-note', 50, topY(S.jaws[1].y1) - 2, 'back jaw', 'middle'));
    out.push(text('msd-t msd-t-note', 50, topY(S.jaws[0].y0) + 4.6, 'front jaw (operator side)', 'middle'));
    out.push(text('msd-t msd-t-note', 50, topY(30) + 1.2, 'block 100 × 60, finished 20 thick', 'middle'));
    out.push(text('msd-t msd-t-small', 50, topY(4) + 1, 'parallels under the part (hidden)', 'middle'));
    // front view, at the same X: the back jaw behind, the part on parallels
    var jb = S.jaws[1];
    out.push(p('msd-jaw', 'M' + n(jb.x0) + ' ' + n(secY(S.jawTop)) + 'H' + n(jb.x1) + 'V' + n(secY(S.viseFloor)) + 'H' + n(jb.x0) + 'Z'));
    out.push(p('msd-section', 'M0 ' + n(secY(ST.rawTop)) + 'H100V' + n(secY(ST.bottom)) + 'H0Z', ' fill="url(#' + id + ')"'));
    out.push(p('msd-vis', 'M0 ' + n(secY(ST.rawTop)) + 'H100V' + n(secY(ST.bottom)) + 'H0Z'));
    out.push(p('msd-parallel', 'M-30 ' + n(secY(ST.bottom)) + 'H130V' + n(secY(S.viseFloor)) + 'H-30Z'));
    out.push(line('msd-zero', -30, secY(0), 130, secY(0)));
    var tag = function (z, ty, s) {
      out.push(line('msd-thin', 100.5, secY(z), 128, secY(z)) + line('msd-thin', 128, secY(z), 131, ty));
      out.push(text('msd-t msd-t-note', 132, ty + 1.1, s, 'start'));
    };
    tag(ST.rawTop, secY(ST.rawTop) - 4, 'Z +1.00  raw top');
    tag(0, secY(0) + 2.5, 'Z 0.00  finished top');
    tag(S.jawTop, secY(S.jawTop) + 3, 'Z −8.00  top of the jaws');
    tag(ST.bottom, secY(ST.bottom) + 3, 'Z −20.00  bottom, on the parallels');
    var label = opts.label || 'The setup: a 100 by 60 block held by its front and back faces in a vise, sitting on two parallels. X0 Y0 is its front-left corner; Z 0.00 is the finished top, 1 mm below the raw top; the vise jaws reach up to Z −8.00.';
    return '<svg class="msd-svg msd-setup" viewBox="-34 -82 230 154" role="img" aria-label="' + esc(label) + '" focusable="false">' +
      out.join('') + '</svg>';
  }

  /* ======================================================================
     The rack: one of each kind of tool, side on, at one scale
     ====================================================================*/
  var RACK = [
    { id: 'fm50', label: ['Face mill', 'Ø50'] },
    { id: 'em12', label: ['End mill', 'Ø12 shown'] },
    { id: 'sp12', label: ['Spot and', 'chamfer, 90°'] },
    { id: 'dr6.8', label: ['Drill, 118°', 'Ø6.8 shown'] },
    { id: 'tapM8', label: ['Tap', 'M8×1.25 shown'] },
    { id: 'bore', label: ['Boring head', 'set to Ø20'] }
  ];
  function renderRack(opts) {
    opts = opts || {};
    var out = [], x = 0, gap = 9, base = 0;
    RACK.forEach(function (it) {
      var t = M.TOOL_BY_ID[it.id], s = toolShape(t), cx = x + s.half;
      out.push('<g transform="translate(' + n(cx) + ' ' + n(base) + ')">' + s.parts.join('') + '</g>');
      out.push(text('msd-t msd-t-note', cx, base + 6, it.label[0], 'middle'));
      out.push(text('msd-t msd-t-small', cx, base + 10.4, it.label[1], 'middle'));
      x += 2 * s.half + gap;
    });
    out.push(line('msd-zero', -3, base, x - gap + 3, base));
    var label = opts.label || 'The tools in the simulator, side on and to scale, each with its cutting tip on one line: a face mill, an end mill, a spot and chamfer tool with a 90 degree point, a drill with a 118 degree point, a tap, and a boring head.';
    return '<svg class="msd-svg msd-rack" viewBox="-4 -80 ' + n(x - gap + 8) + ' 94" role="img" aria-label="' + esc(label) + '" focusable="false">' +
      out.join('') + '</svg>';
  }

  /* ======================================================================
     Live section views: the part as it is now, through the tool
     ====================================================================*/
  // Z down to -27: past the point of a drill through the part, but no
  // deeper, so the block and the tool above it stay large on the screen
  var VIEW = {
    front: { u0: -45, u1: 145, z0: -27, z1: 34 },
    side: { u0: -30, u1: 90, z0: -27, z1: 34 }
  };
  /* Along a section line: where the metal stands above the finished part
     (still to remove) and where it is cut below it (too far), as closed
     regions between the two profiles, and the finished profile itself.
     Each sample is judged by the inspection's own envelope (inspect.js
     envAt), so a wall inside its tolerance band is never marked as wrong.
     pts: [u, height] samples along the line, heights clamped to the bottom. */
  function sectionCompare(job, axis, at, pts) {
    var env = { lo: 0, hi: 0, owner: 'top', mode: 'set' }, target = [], runs = { 1: [], 2: [] }, cur = null;
    pts.forEach(function (q) {
      var x = axis === 'front' ? q[0] : at, y = axis === 'front' ? at : q[0];
      x = Math.min(Math.max(x, ST.x0 + 1e-9), ST.x1 - 1e-9);
      y = Math.min(Math.max(y, ST.y0 + 1e-9), ST.y1 - 1e-9);
      var zt = I.nominalAt(job, x, y), h = q[1], hv = h <= ST.bottom + 1e-9 ? -Infinity : h;
      I.envAt(job, x, y, env);
      var s = hv > env.hi + 1e-9 ? 1 : hv < env.lo - 1e-9 ? 2 : 0;
      target.push([q[0], -zt]);
      if (!s) { cur = null; return; }
      if (!cur || cur.s !== s) { cur = { s: s, top: [], bot: [] }; runs[s].push(cur); }
      cur.top.push([q[0], -Math.max(h, zt)]);
      cur.bot.push([q[0], -Math.min(h, zt)]);
    });
    // each sample stands for a quarter millimetre, so a run is widened by
    // half a sample at each end and a one-sample run still shows
    function region(list) {
      return list.map(function (r) {
        var a = r.top[0], b = r.top[r.top.length - 1], c = r.bot[0], e = r.bot[r.bot.length - 1];
        var top = [[a[0] - 0.125, a[1]]].concat(r.top, [[b[0] + 0.125, b[1]]]);
        var bot = [[c[0] - 0.125, c[1]]].concat(r.bot, [[e[0] + 0.125, e[1]]]);
        return poly(simplify(top.concat(bot.reverse())), true);
      }).join('');
    }
    return { target: target, excess: region(runs[1]), over: region(runs[2]) };
  }

  /* axis 'front': along X at Y = at (seen from the front);
     axis 'side': along Y at X = at (seen from the right, +Y to the right). */
  function renderSection(sim, job, axis, at, opts) {
    opts = opts || {};
    var V = VIEW[axis], S = M.SETUP, out = [], id = (opts.idPrefix || 'ms-' + axis) + '-hatch';
    var hAt = axis === 'front' ? function (u) { return sim.heightAt(u, at); } : function (u) { return sim.heightAt(at, u); };
    var u0 = axis === 'front' ? ST.x0 : ST.y0, u1 = axis === 'front' ? ST.x1 : ST.y1;
    var inside = axis === 'front' ? (at >= ST.y0 && at <= ST.y1) : (at >= ST.x0 && at <= ST.x1);
    out.push(hatchDefs(id, 'ms-hatch-line'));
    // the vise behind: jaws (cut by a side section), parallels, floor
    if (axis === 'side') {
      S.jaws.forEach(function (j) {
        if (at < j.x0 || at > j.x1) return;
        out.push(p('ms-jaw-cut', 'M' + n(j.y0) + ' ' + n(-S.jawTop) + 'H' + n(j.y1) + 'V' + n(-S.viseFloor) + 'H' + n(j.y0) + 'Z'));
      });
      S.parallels.forEach(function (q) {
        if (at < q.x0 || at > q.x1) return;
        out.push(p('ms-parallel', 'M' + n(q.y0) + ' ' + n(-S.parallelTop) + 'H' + n(q.y1) + 'V' + n(-S.viseFloor) + 'H' + n(q.y0) + 'Z'));
      });
    } else {
      out.push(p('ms-jaw-behind', 'M' + n(S.jaws[1].x0) + ' ' + n(-S.jawTop) + 'H' + n(S.jaws[1].x1) + 'V' + n(-S.viseFloor) + 'H' + n(S.jaws[1].x0) + 'Z'));
      var par = S.parallels.filter(function (q) { return at >= q.y0 && at <= q.y1; })[0];
      out.push(p(par ? 'ms-parallel' : 'ms-parallel-behind', 'M-30 ' + n(-S.parallelTop) + 'H130V' + n(-S.viseFloor) + 'H-30Z'));
    }
    out.push(line('ms-floor', V.u0, -S.viseFloor, V.u1, -S.viseFloor));
    // the part, cut where the section plane passes through it
    if (inside) {
      var pts = [];
      for (var u = u0; u <= u1 + 1e-9; u += 0.25) pts.push([u, Math.max(hAt(Math.min(u, u1 - 1e-9) + (u === u0 ? 1e-9 : 0)), ST.bottom)]);
      var poly2 = [[u0, -ST.bottom]];
      pts.forEach(function (q) { poly2.push([q[0], -q[1]]); });
      poly2.push([u1, -ST.bottom]);
      var d = poly(simplify(poly2), true);
      out.push(p('ms-metal', d) + p('ms-metal-hatch', d, ' fill="url(#' + id + ')"') + p('ms-metal-edge', d));
      // the finished part over it: metal still to remove, metal cut past it,
      // and its outline, judged by the inspection's own envelope
      if (job && !job.free && opts.target !== false) {
        var cmp = sectionCompare(job, axis, at, pts);
        if (cmp.excess) out.push(p('ms-excess', cmp.excess));
        if (cmp.over) out.push(p('ms-over', cmp.over));
        out.push(p('ms-target-line', poly(simplify(cmp.target), false)));
      }
    } else {
      out.push(text('ms-t ms-t-soft', (V.u0 + V.u1) / 2, -2, 'the section line is off the part', 'middle'));
    }
    // zero and the jaw tops, labelled at the left
    out.push(line('ms-zero', V.u0, 0, V.u1, 0));
    out.push(text('ms-t ms-t-axis', V.u0 + 1.5, -1.2, 'Z 0', 'start'));
    out.push(line('ms-jawtop', V.u0, -S.jawTop, V.u1, -S.jawTop));
    out.push(text('ms-t ms-t-axis', V.u0 + 1.5, -S.jawTop - 1.2, 'jaw top', 'start'));
    // the tool
    if (sim.tool) {
      var tu = axis === 'front' ? sim.pos.x : sim.pos.y;
      out.push(placeTool(sim.tool, tu, sim.pos.z, opts.toolClass));
    }
    var w = V.u1 - V.u0, h = V.z1 - V.z0;
    return '<svg class="ms-section-svg" viewBox="' + n(V.u0) + ' ' + n(-V.z1) + ' ' + n(w) + ' ' + n(h) + '" aria-hidden="true" focusable="false">' +
      out.join('') + '</svg>';
  }

  /* The printed figure inside the simulator's root: every job's drawing,
     captioned. This is what a reader without JavaScript, and every
     printout, gets in place of the live machine. */
  function renderJobFigures(jobs) {
    return jobs.filter(function (j) { return !j.free; }).map(function (j) {
      return '<figure class="msd-figure">' +
        '<div class="msd-scroll" tabindex="0" role="region" aria-label="' + esc('Drawing for job ' + j.n + '; scrolls sideways on a narrow screen') + '">' +
        renderDrawing(j, { idPrefix: 'msd-static-' + j.id }) + '</div>' +
        '<figcaption><strong>Job ' + j.n + ': ' + esc(j.title) + '.</strong> ' + esc(j.brief) + '</figcaption></figure>';
    }).join('\n      ');
  }

  /* The drawing's outlines in top-view coordinates (y flipped), for
     overlaying the target on the live view. */
  function targetOutline(job) {
    var out = [p('x', roundedRect(ST.x0, ST.y0, ST.x1, ST.y1, 0))];
    job.features.forEach(function (f) { out.push(TOPVIEW[f.type](f)); });
    var ds = [];
    out.join('').replace(/<path class="msd-(?:vis|thin)[^"]*" d="([^"]+)"/g, function (m, d) { ds.push(d); return m; });
    out.join('').replace(/<circle class="msd-vis" cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g, function (m, cx, cy, r) {
      var R = Number(r);
      ds.push('M' + n(Number(cx) + R) + ' ' + cy + 'A' + r + ' ' + r + ' 0 1 0 ' + n(Number(cx) - R) + ' ' + cy + 'A' + r + ' ' + r + ' 0 1 0 ' + n(Number(cx) + R) + ' ' + cy);
      return m;
    });
    return ds;
  }

  return {
    targetOutline: targetOutline,
    toolShape: toolShape, placeTool: placeTool, renderToolIcon: renderToolIcon,
    renderDrawing: renderDrawing, renderSetup: renderSetup, renderRack: renderRack, renderJobFigures: renderJobFigures,
    renderSection: renderSection, sectionCompare: sectionCompare, VIEW: VIEW, RACK: RACK, simplify: simplify
  };
});
