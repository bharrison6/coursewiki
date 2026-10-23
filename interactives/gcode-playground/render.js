/* ============================================================================
   gcode-playground / render.js - the work view, as SVG markup.

   Pure functions: machine state in, markup out. The live simulator draws
   with them and Node runs them to make the printed figure in the page, so
   the paper copy and the screen are the same drawing.

   One SVG, two views at one scale, third-angle as on a drawing: the top
   view above, the front view below it. The front view is a section through
   the block at the tool's Y, seen from the front, with every move projected
   onto it, so a plunge and a retract show as what they are.

   Units: one SVG unit is one millimetre. Screen y runs down, so the top
   view draws -Y and the front view draws -Z.

   The cut is drawn from the milling simulator's own list of cuts: each one
   is the space the tool swept, filled by its depth, shallow first, so the
   deepest cut over a point is the colour that shows there. Colours are
   classes only; demo.css maps them to theme tokens.
   ==========================================================================*/
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = node ? factory(require('../milling-simulator/model.js'), require('./gcode.js'), require('./machine.js'), require('./blocks.js'))
    : factory(root.CourseWikiMillingSim, root.CourseWikiGcode, root.CourseWikiGcodeMachine, root.CourseWikiGcodeBlocks);
  if (node) module.exports = api;
  else root.CourseWikiGcodeRender = api;
})(typeof self !== 'undefined' ? self : this, function (M, G, X, B) {
  'use strict';

  var ST = M.SETUP.stock, SU = M.SETUP;
  var V = { x0: -46, x1: 116, top: 81, bottom: -19, gap: 7, z1: 25, z0: -24 };
  var FOFF = -V.bottom + V.gap + V.z1;          // screen y of Z 0 in the front view
  var FY0 = FOFF - V.z1, FY1 = FOFF - V.z0;      // the front view's top and bottom on screen
  var LEG = FY1 + 3;                             // the legend's top
  var VB = { x: V.x0, y: -V.top, w: V.x1 - V.x0, h: LEG + 14 + V.top };

  function n(v) { var s = (Math.round(v * 100) / 100).toString(); return s === '-0' ? '0' : s; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function path(cls, d, extra) { return d ? '<path class="' + cls + '" d="' + d + '"' + (extra || '') + '/>' : ''; }
  function text(cls, x, y, s, anchor) {
    return '<text class="' + cls + '" x="' + n(x) + '" y="' + n(y) + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(s) + '</text>';
  }
  function rect(cls, x0, y0, x1, y1) {
    return '<rect class="' + cls + '" x="' + n(Math.min(x0, x1)) + '" y="' + n(Math.min(y0, y1)) + '" width="' + n(Math.abs(x1 - x0)) + '" height="' + n(Math.abs(y1 - y0)) + '"/>';
  }
  function fy(z) { return FOFF - z; }

  /* ---- depth bands -----------------------------------------------------------*/
  var BANDS = 8, BAND_MM = 2.5;
  function band(z) {
    if (z <= ST.bottom + 1e-6) return 'thru';
    if (z >= -1e-6) return '0';
    return String(Math.min(BANDS, Math.ceil(-z / BAND_MM - 1e-9)));
  }

  /* ---- the cut, from the milling simulator's list of cuts ----------------------*/
  function cuts(sim) {
    var prims = sim.prims.slice().sort(function (a, b) { return b.z - a.z || a.id - b.id; });
    var out = [];
    prims.forEach(function (p) {
      // A pointed tool is only as wide at the top as its point has gone in.
      var r = p.cone > 0 ? Math.min(p.r, (ST.rawTop - p.z) / p.cone) : p.r;
      if (!(r > 0.01)) return;
      var cls = 'gp-cut gp-d' + band(p.z);
      if (Math.hypot(p.bx - p.ax, p.by - p.ay) < 1e-6) {
        out.push('<circle class="' + cls + '" cx="' + n(p.ax) + '" cy="' + n(-p.ay) + '" r="' + n(r) + '"/>');
      } else {
        out.push('<path class="' + cls + ' gp-sweep" d="M' + n(p.ax) + ' ' + n(-p.ay) + 'L' + n(p.bx) + ' ' + n(-p.by) + '" stroke-width="' + n(2 * r) + '"/>');
      }
    });
    return out.join('');
  }

  /* ---- moves ------------------------------------------------------------------*/
  function arcD(m) {
    var a = m.arc, sweep = a.cw ? 1 : 0;         // clockwise seen from +Z stays clockwise on screen
    if (a.full) {
      var mid = { x: 2 * a.cx - m.from.x, y: 2 * a.cy - m.from.y };
      return 'A' + n(a.r) + ' ' + n(a.r) + ' 0 0 ' + sweep + ' ' + n(mid.x) + ' ' + n(-mid.y) +
        'A' + n(a.r) + ' ' + n(a.r) + ' 0 0 ' + sweep + ' ' + n(m.to.x) + ' ' + n(-m.to.y);
    }
    return 'A' + n(a.r) + ' ' + n(a.r) + ' 0 ' + (Math.abs(a.sweep) > Math.PI ? 1 : 0) + ' ' + sweep + ' ' + n(m.to.x) + ' ' + n(-m.to.y);
  }
  function topD(m) {
    var d = 'M' + n(m.from.x) + ' ' + n(-m.from.y);
    return d + (m.kind === 'arc' ? arcD(m) : 'L' + n(m.to.x) + ' ' + n(-m.to.y));
  }
  function frontD(m) {
    if (m.kind !== 'arc') return 'M' + n(m.from.x) + ' ' + n(fy(m.from.z)) + 'L' + n(m.to.x) + ' ' + n(fy(m.to.z));
    var lo = Math.min(m.from.x, m.to.x), hi = Math.max(m.from.x, m.to.x);
    G.arcPoints(m.from, m.arc, m.to).forEach(function (p) { lo = Math.min(lo, p.x); hi = Math.max(hi, p.x); });
    return 'M' + n(lo) + ' ' + n(fy(m.from.z)) + 'L' + n(hi) + ' ' + n(fy(m.from.z));
  }
  function moveDs(moves, view) {
    var rapid = '', feed = '';
    moves.forEach(function (m) {
      var d = view === 'top' ? topD(m) : frontD(m);
      if (m.kind === 'rapid') rapid += d; else feed += d;
    });
    return { rapid: rapid, feed: feed };
  }
  function plan(moves, view) {
    var d = moveDs(moves, view);
    return path('gp-plan gp-plan-feed', d.feed) + path('gp-plan gp-plan-rapid', d.rapid);
  }
  function highlight(moves, view) {
    var d = moveDs(moves, view);
    return path('gp-hl', d.feed + d.rapid);
  }
  /* Wide invisible strokes, one per line, so a move can be clicked. */
  function hits(moves) {
    var by = {};
    moves.forEach(function (m) { by[m.line] = (by[m.line] || '') + topD(m); });
    return Object.keys(by).map(function (k) { return '<path class="gp-hit" data-line="' + k + '" d="' + by[k] + '"/>'; }).join('');
  }
  /* What the tool actually did: the machine's own record of its motion. */
  function trail(segs, view) {
    var rapid = '', feed = '';
    segs.forEach(function (s) {
      var pts = s.head ? s.pts.concat([s.head]) : s.pts;
      if (pts.length < 2) return;
      var d = pts.map(function (p, k) { return (k ? 'L' : 'M') + n(p.x) + ' ' + n(view === 'top' ? -p.y : fy(p.z)); }).join('');
      if (s.kind === 'rapid') rapid += d; else feed += d;
    });
    return path('gp-trail gp-trail-feed', feed) + path('gp-trail gp-trail-rapid', rapid);
  }

  /* ---- the tool ---------------------------------------------------------------*/
  function toolTop(tool, pos, spinning) {
    var x = n(pos.x), y = n(-pos.y);
    if (!tool) {
      return '<g class="gp-tool gp-tool-none"><circle class="gp-tool-nose" cx="' + x + '" cy="' + y + '" r="2.2"/>' +
        path('gp-tool-cross', 'M' + n(pos.x - 3.5) + ' ' + y + 'H' + n(pos.x + 3.5) + 'M' + x + ' ' + n(-pos.y - 3.5) + 'V' + n(-pos.y + 3.5)) + '</g>';
    }
    var r = tool.dia / 2, out = '<g class="gp-tool' + (spinning ? ' is-spinning' : '') + '">';
    out += '<circle class="gp-tool-disc" cx="' + x + '" cy="' + y + '" r="' + n(r) + '"/>';
    out += path('gp-tool-cross', 'M' + n(pos.x - r - 1.5) + ' ' + y + 'H' + n(pos.x + r + 1.5) + 'M' + x + ' ' + n(-pos.y - r - 1.5) + 'V' + n(-pos.y + r + 1.5));
    if (spinning) {
      // a clockwise arrow, seen from above, as M3 turns the spindle
      var ra = Math.max(1.6, r * 0.62), a0 = Math.PI * 0.75, a1 = -Math.PI * 0.6;
      var p0 = [pos.x + ra * Math.cos(a0), -(pos.y + ra * Math.sin(a0))], p1 = [pos.x + ra * Math.cos(a1), -(pos.y + ra * Math.sin(a1))];
      out += '<g class="gp-spin"><path class="gp-spin-arc" d="M' + n(p0[0]) + ' ' + n(p0[1]) + 'A' + n(ra) + ' ' + n(ra) + ' 0 1 1 ' + n(p1[0]) + ' ' + n(p1[1]) + '"/>';
      var tx = Math.sin(a1), ty = Math.cos(a1);       // direction of travel at the arrow's end, on screen
      var ah = Math.max(0.9, ra * 0.45);
      out += '<path class="gp-spin-head" d="M' + n(p1[0]) + ' ' + n(p1[1]) + 'L' + n(p1[0] - tx * ah - ty * ah * 0.55) + ' ' + n(p1[1] - ty * ah + tx * ah * 0.55) +
        'L' + n(p1[0] - tx * ah + ty * ah * 0.55) + ' ' + n(p1[1] - ty * ah - tx * ah * 0.55) + 'Z"/></g>';
    }
    return out + '</g>';
  }
  /* Side on, tip at (x, z). Only the cutting end is drawn: holders are not modelled. */
  function toolSide(tool, pos) {
    var x = pos.x, z = pos.z, out = '';
    if (!tool) {
      return '<g class="gp-tool gp-tool-none">' + path('gp-tool-cross', 'M' + n(x - 3.5) + ' ' + n(fy(z)) + 'H' + n(x + 3.5) + 'M' + n(x) + ' ' + n(fy(z) - 3.5) + 'V' + n(fy(z) + 3.5)) + '</g>';
    }
    var r = tool.dia / 2, k = tool.kind;
    if (k === 'face') {
      out += rect('gp-tool-cut', x - r, fy(z), x + r, fy(z + 5));
      out += rect('gp-tool-body', x - r + 3, fy(z + 5), x + r - 3, fy(z + 14));
      out += rect('gp-tool-body', x - 11, fy(z + 14), x + 11, fy(z + 40));
    } else if (k === 'drill' || k === 'spot') {
      var h = r * tool.cone, top = k === 'spot' ? tool.reach : 24;
      out += path('gp-tool-cut', 'M' + n(x) + ' ' + n(fy(z)) + 'L' + n(x + r) + ' ' + n(fy(z + h)) + 'L' + n(x + r) + ' ' + n(fy(z + top)) +
        'L' + n(x - r) + ' ' + n(fy(z + top)) + 'L' + n(x - r) + ' ' + n(fy(z + h)) + 'Z');
      out += rect('gp-tool-body', x - r, fy(z + top), x + r, fy(z + 40));
    } else {
      out += rect('gp-tool-cut', x - r, fy(z), x + r, fy(z + tool.reach));
      for (var s = z + 2; s < z + tool.reach - 1; s += Math.max(3, tool.dia * 0.7)) {
        out += path('gp-tool-flute', 'M' + n(x - r) + ' ' + n(fy(s)) + 'L' + n(x + r) + ' ' + n(fy(s + Math.min(tool.dia * 0.5, 4))));
      }
      out += rect('gp-tool-body', x - r, fy(z + tool.reach), x + r, fy(z + 40));
    }
    out += path('gp-tool-axis', 'M' + n(x) + ' ' + n(fy(z - 2)) + 'V' + n(fy(z + 40)));
    return '<g class="gp-tool">' + out + '</g>';
  }

  /* ---- the front section ---------------------------------------------------------*/
  function sectionY(sim) { return Math.min(ST.y1 - 0.01, Math.max(ST.y0 + 0.01, sim.pos.y)); }
  function section(sim, y, idPrefix) {
    var pts = [[ST.x0, fy(ST.bottom)]];
    var last = null;
    for (var x = ST.x0; x <= ST.x1 + 1e-9; x += 0.25) {
      var xx = Math.min(ST.x1 - 1e-6, Math.max(ST.x0 + 1e-6, x));
      var h = Math.max(ST.bottom, sim.heightAt(xx, y));
      if (last === null || Math.abs(h - last) > 1e-9) {
        if (last !== null) pts.push([x, fy(last)]);
        pts.push([x, fy(h)]);
      }
      last = h;
    }
    pts.push([ST.x1, fy(last)]);
    pts.push([ST.x1, fy(ST.bottom)]);
    var d = pts.map(function (p, k) { return (k ? 'L' : 'M') + n(p[0]) + ' ' + n(p[1]); }).join('') + 'Z';
    return path('gp-metal', d) + path('gp-metal-hatch', d, ' fill="url(#' + idPrefix + '-hatch)"') + path('gp-metal-edge', d);
  }

  function contactMark(p, view) {
    if (!p) return '';
    var s = 2.6, cx = p.x, cy = view === 'top' ? -p.y : fy(p.z);
    return '<circle class="gp-contact-ring" cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(s * 1.4) + '"/>' +
      path('gp-contact', 'M' + n(cx - s) + ' ' + n(cy - s) + 'L' + n(cx + s) + ' ' + n(cy + s) + 'M' + n(cx - s) + ' ' + n(cy + s) + 'L' + n(cx + s) + ' ' + n(cy - s));
  }

  /* ======================================================================
     The whole drawing
     state: { sim, moves, trail, hl (moves to highlight), contact, spinning }
     opts:  { idPrefix, label }
     ====================================================================*/
  function frame(opts) {
    var id = opts.idPrefix || 'gp';
    var out = [];
    out.push('<defs><pattern id="' + id + '-hatch" patternUnits="userSpaceOnUse" width="2.4" height="2.4" patternTransform="rotate(45)">' +
      '<path class="gp-hatch-line" d="M0 0V2.4"/></pattern>' +
      '<clipPath id="' + id + '-ctop"><rect x="' + n(V.x0) + '" y="' + n(-V.top) + '" width="' + n(V.x1 - V.x0) + '" height="' + n(V.top - V.bottom) + '"/></clipPath>' +
      '<clipPath id="' + id + '-cfront"><rect x="' + n(V.x0) + '" y="' + n(FY0) + '" width="' + n(V.x1 - V.x0) + '" height="' + n(FY1 - FY0) + '"/></clipPath>' +
      '<clipPath id="' + id + '-cstock"><rect x="' + n(ST.x0) + '" y="' + n(-ST.y1) + '" width="' + n(ST.x1 - ST.x0) + '" height="' + n(ST.y1 - ST.y0) + '"/></clipPath></defs>');
    return out.join('');
  }

  function topStatic() {
    var out = [];
    out.push(rect('gp-bg', V.x0, -V.top, V.x1, -V.bottom));
    SU.jaws.forEach(function (j) { out.push(rect('gp-jaw', Math.max(j.x0, V.x0), -j.y1, Math.min(j.x1, V.x1), -j.y0)); });
    out.push(rect('gp-stock', ST.x0, -ST.y1, ST.x1, -ST.y0));
    return out.join('');
  }
  function topMarks() {
    var out = [];
    out.push(rect('gp-edge', ST.x0, -ST.y1, ST.x1, -ST.y0));
    [0, 50, 100].forEach(function (x) { out.push(path('gp-tick', 'M' + x + ' 0V2.2')); out.push(text('gp-t gp-t-tick', x, 6.6, String(x), 'middle')); });
    [0, 30, 60].forEach(function (y) { out.push(path('gp-tick', 'M0 ' + n(-y) + 'H-2.2')); out.push(text('gp-t gp-t-tick', -3.2, -y + 1.4, String(y), 'end')); });
    out.push(text('gp-t gp-t-axis', 108, 6.6, 'X', 'middle'));
    out.push(text('gp-t gp-t-axis', -3.2, -ST.y1 - 5, 'Y', 'end'));
    out.push('<circle class="gp-origin" cx="0" cy="0" r="1.3"/>');
    out.push(text('gp-t gp-t-note', -2, -3, 'X0 Y0', 'end'));
    var h = SU.home;
    out.push(rect('gp-home', h.x - 1.6, -h.y - 1.6, h.x + 1.6, -h.y + 1.6));
    out.push(text('gp-t gp-t-note', h.x, -h.y + 7, 'start', 'middle'));
    out.push(text('gp-t gp-t-view', V.x0 + 1.5, -V.top + 4.6, 'TOP VIEW', 'start'));
    out.push(text('gp-t gp-t-note', 50, -ST.y1 - 8.4, 'back vise jaw', 'middle'));
    out.push(text('gp-t gp-t-note', 50, 12.4, 'front vise jaw', 'middle'));
    return out.join('');
  }
  function frontStatic() {
    return rect('gp-bg', V.x0, FY0, V.x1, FY1) +
      rect('gp-parallel', V.x0, fy(SU.parallelTop), V.x1, FY1) +
      path('gp-jawtop', 'M' + n(V.x0) + ' ' + n(fy(SU.jawTop)) + 'H' + n(V.x1));
  }
  function frontMarks(y) {
    var out = [];
    out.push(path('gp-zero', 'M' + n(V.x0) + ' ' + n(fy(0)) + 'H' + n(V.x1)));
    [20, 10, 0, -10, -20].forEach(function (z) {
      out.push(path('gp-tick', 'M' + n(V.x0) + ' ' + n(fy(z)) + 'h2.2'));
      out.push(text('gp-t gp-t-tick', V.x0 + 3.2, fy(z) + 1.4, 'Z ' + (z > 0 ? '+' : z < 0 ? '−' : '') + Math.abs(z), 'start'));
    });
    out.push(text('gp-t gp-t-note', 101.5, fy(SU.jawTop) + 4.4, 'jaw top', 'start'));
    out.push('<text class="gp-t gp-t-view" x="' + n(V.x1 - 1.5) + '" y="' + n(FY0 + 4.6) + '" text-anchor="end">FRONT VIEW, CUT AT Y <tspan data-layer="secy">' + esc(M.fmt(y, 1)) + '</tspan></text>');
    return out.join('');
  }
  function legend() {
    var out = [], x = V.x0 + 1.5, y = LEG + 1;
    out.push(text('gp-t gp-t-note', x, y + 3.4, 'Cut depth', 'start'));
    x += 17;
    [['0', 'Z 0'], ['2', '−5'], ['4', '−10'], ['6', '−15'], ['8', '−20'], ['thru', 'through']].forEach(function (b) {
      out.push(rect('gp-cut gp-d' + b[0] + ' gp-swatch', x, y, x + 4.4, y + 4.4));
      out.push(text('gp-t gp-t-note', x + 5.4, y + 3.4, b[1], 'start'));
      x += b[1].length > 4 ? 17 : 12.5;
    });
    x = V.x0 + 1.5; y += 6.5;
    out.push(path('gp-trail gp-trail-feed', 'M' + n(x) + ' ' + n(y + 1.8) + 'h9'));
    out.push(text('gp-t gp-t-note', x + 11, y + 3, 'feed (G1, G2, G3): cuts', 'start'));
    x += 55;
    out.push(path('gp-trail gp-trail-rapid', 'M' + n(x) + ' ' + n(y + 1.8) + 'h9'));
    out.push(text('gp-t gp-t-note', x + 11, y + 3, 'rapid (G0): through the air', 'start'));
    return out.join('');
  }

  function scene(state, opts) {
    opts = opts || {};
    var id = opts.idPrefix || 'gp', sim = state.sim, y = sectionY(sim);
    var moves = state.moves || [], hl = state.hl || [];
    var tool = sim.tool, pos = sim.pos;
    var label = opts.label || 'Top view and front section of the block, with the programmed path and the tool.';
    return '<svg class="gp-svg" viewBox="' + n(VB.x) + ' ' + n(VB.y) + ' ' + n(VB.w) + ' ' + n(VB.h) + '" role="img" aria-label="' + esc(label) + '" focusable="false">' +
      frame({ idPrefix: id }) +
      '<g clip-path="url(#' + id + '-ctop)">' + topStatic() +
      '<g data-layer="cuts" clip-path="url(#' + id + '-cstock)">' + cuts(sim) + '</g>' + topMarks() +
      '<g data-layer="plan">' + plan(moves, 'top') + '</g>' +
      '<g data-layer="hl">' + highlight(hl, 'top') + '</g>' +
      '<g data-layer="trail">' + trail(state.trail || [], 'top') + '</g>' +
      '<g data-layer="hit">' + (opts.hits ? hits(moves) : '') + '</g>' +
      '<g data-layer="tool">' + toolTop(tool, pos, state.spinning) + '</g>' +
      '<g data-layer="contact">' + contactMark(state.contact, 'top') + '</g>' +
      '</g>' +
      '<g clip-path="url(#' + id + '-cfront)">' + frontStatic() +
      '<g data-layer="section">' + section(sim, y, id) + '</g>' + frontMarks(y) +
      '<g data-layer="fplan">' + plan(moves, 'front') + '</g>' +
      '<g data-layer="fhl">' + highlight(hl, 'front') + '</g>' +
      '<g data-layer="ftrail">' + trail(state.trail || [], 'front') + '</g>' +
      '<g data-layer="ftool">' + toolSide(tool, pos) + '</g>' +
      '<g data-layer="fcontact">' + contactMark(state.contact, 'front') + '</g>' +
      '</g>' + legend() + '</svg>';
  }
  /* ======================================================================
     The printed figure: an example program, run to its end
     ====================================================================*/
  function runExample(id) {
    var ex = B.example(id);
    var program = G.interpret(ex.text.join('\n'));
    var m = X.create().load(program);
    m.runToEnd();
    return { example: ex, program: program, machine: m };
  }
  function listing(lines, cls) {
    return '<ol class="' + (cls || 'gp-listing') + '">' + lines.map(function (t) { return '<li><code>' + esc(t) + '</code></li>'; }).join('') + '</ol>';
  }
  function staticFigure(id) {
    var r = runExample(id), m = r.machine, ex = r.example;
    var svg = scene({ sim: m.sim, moves: r.program.moves, trail: m.trail, spinning: false },
      { idPrefix: 'gp-static-' + ex.id, label: 'The block after the program “' + ex.title + '” has run: the top view and a front section, with every rapid and feed move drawn.' });
    return '<figure class="gp-figure">' +
      '<div class="gp-figure-program"><p class="gp-figure-title">' + esc(ex.title) + '</p>' + listing(ex.text) + '</div>' +
      '<div class="gp-figure-view">' + svg + '</div>' +
      '<figcaption><strong>' + esc(ex.title) + '.</strong> ' + esc(ex.brief) +
      ' The program on the left, numbered line by line, and the block after it has run. Solid lines are feed moves, dashed lines are rapids; the darker the cut, the deeper it goes.</figcaption></figure>';
  }

  return {
    V: V, VB: VB, FOFF: FOFF, band: band,
    cuts: cuts, plan: plan, highlight: highlight, hits: hits, trail: trail,
    toolTop: toolTop, toolSide: toolSide, section: section, sectionY: sectionY, contactMark: contactMark,
    scene: scene, runExample: runExample, staticFigure: staticFigure, listing: listing, fy: fy
  };
});
