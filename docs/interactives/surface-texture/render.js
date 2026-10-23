/* ============================================================================
   surface-texture / render.js - the lab's pictures, as SVG strings.

   Pure functions of a surface, an analysed trace and a callout, so the same
   code draws the live views, the page's printed figures and the tests'
   expectations. No DOM. Colours are classes only; demo.css maps them to
   theme tokens.

     pictorial(spec, o)   the patch of surface as a block, seen from the front
                          right and above, with its marks, the stylus trace
                          and (optionally) the direction a drawing view looks
     profiles(an, o)      the measured profile with its mean line, and the
                          roughness profile with sections, Ra, Rz and Rt
     symbol(c, o)         a surface texture callout: ISO 21920 or ISO 1302
                          symbol, a grade number, or triangle marks
     triangles(n, o)      n downward triangles

   HEIGHTS ARE EXAGGERATED. A micrometre-high mark on a millimetre-wide patch
   is invisible at true scale, so every figure draws heights some stated
   number of times larger than lengths and prints that number.
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module && module.exports;
  var api = node
    ? factory(require('./surface.js'), require('./profile.js'), require('./notation.js'))
    : factory(root.CourseWikiTextureSurface, root.CourseWikiTextureProfile, root.CourseWikiTextureNotation);
  if (node) { module.exports = api; } else { root.CourseWikiTextureRender = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S, P, N) {
  'use strict';
  if (!S || !P || !N) { return null; }

  var C30 = Math.cos(Math.PI / 6);

  function r1(v) { var n = Math.round(v * 10) / 10; return Object.is(n, -0) ? 0 : n; }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function attrs(o) {
    var out = '';
    for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k) && o[k] !== null && o[k] !== undefined) { out += ' ' + k + '="' + esc(o[k]) + '"'; } }
    return out;
  }
  function el(tag, o, body) { return '<' + tag + attrs(o) + (body === undefined ? '/>' : '>' + body + '</' + tag + '>'); }
  function txt(o, s) { return el('text', o, esc(s)); }
  /* Compact path data: the points are rounded to 0.1 first, then written as
     one absolute move and relative line steps between the ROUNDED points, so
     nothing drifts. Numbers drop their leading zero; a minus sign doubles as
     the separator. */
  function num(v) { var t = String(v); return t.replace(/^(-?)0\./, '$1.'); }
  function pathOf(pts) {
    if (!pts.length) { return ''; }
    var px = r1(pts[0][0]), py = r1(pts[0][1]), d = 'M' + num(px) + ' ' + num(py);
    if (pts.length > 1) { d += 'l'; }
    for (var i = 1; i < pts.length; i++) {
      var x = r1(pts[i][0]), y = r1(pts[i][1]);
      var dx = num(r1(x - px)), dy = num(r1(y - py));
      var pair = (i > 1 && dx.charAt(0) !== '-' ? ' ' : '') + dx + (dy.charAt(0) === '-' ? '' : ' ') + dy;
      d += pair; px = x; py = y;
    }
    return d;
  }

  /* Largest 1-2-5 number not above v; smallest 1-2-5 step giving at most n steps over span. */
  function niceDown(v) {
    if (!(v > 0)) { return 1; }
    var e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e;
    return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e;
  }
  function niceStep(span, n) {
    var raw = span / Math.max(1, n), e = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e;
  }
  function decimals(step) { return step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step) - 1e-9)); }
  function fmt(v, d) { var s = v.toFixed(d); return s === '-0' || /^-0\.0*$/.test(s) ? s.slice(1) : s; }
  function fmtMm(v) { return fmt(v, v < 1 ? 2 : v < 10 ? 1 : 0).replace(/\.0$/, ''); }

  var PATTERN_WORDS = {
    parallel: 'parallel marks running front to back',
    crossed: 'two sets of marks crossing, each 30 degrees off front-to-back',
    multi: 'marks running in many directions',
    circular: 'circular marks around the centre',
    radial: 'marks radiating from the centre',
    particulate: 'scattered pits with no direction'
  };
  var RELATION_WORDS = {
    across: 'across the marks',
    along: 'along the marks',
    shallow: 'at a shallow angle to both sets of marks',
    'radius-across': 'along a radius, across the circular marks',
    'radius-along': 'through the centre, along the radial marks',
    none: 'over marks that have no single direction'
  };

  /* =========================================================================
     The block of surface
     =======================================================================*/
  function pictorial(spec, o) {
    o = o || {};
    var lc = o.lc || 0.8, dir = o.dir === 'y' ? 'y' : 'x', id = o.idPrefix || 'st-pic', mini = !!o.mini;
    var a = (P.SECTIONS / 2 + P.MARGIN) * lc;            // half the window: the whole trace fits
    var W = mini ? 240 : 560;
    var ak = (mini ? 0.8 : 0.7) * W / (4 * C30), k = ak / a;
    var T = mini ? 18 : 40;
    var traced = o.trace !== false, tr = traced ? (o.traceData || P.trace(spec, dir, lc)) : null;

    // height range over the window, for the exaggeration
    var zmin = Infinity, zmax = -Infinity;
    function seen(z) { if (z < zmin) { zmin = z; } if (z > zmax) { zmax = z; } }
    for (var gi = 0; gi <= 40; gi++) { for (var gj = 0; gj <= 40; gj++) { seen(S.heightAt(spec, -a + gi * a / 20, -a + gj * a / 20)); } }
    for (var e = 0; e <= 400; e++) { var t = -a + e * a / 200; seen(S.heightAt(spec, t, -a)); seen(S.heightAt(spec, a, t)); seen(S.heightAt(spec, t, 0)); seen(S.heightAt(spec, 0, t)); }
    if (tr) { for (var ti = 0; ti < tr.z.length; ti++) { seen(tr.z[ti]); } }
    var pv = Math.max(zmax - zmin, 1e-6);
    var target = mini ? 16 : 34;
    var E = Math.max(1, niceDown(target / (pv * k / 1000)));
    var zmid = (zmax + zmin) / 2, zk = E * k / 1000;
    var zHalf = (pv / 2) * zk;

    var top = (mini ? 8 : 40) + zHalf;
    var cx = W / 2, cy = top + ak;
    function X(x, y) { return cx + (x + y) * C30 * k; }
    function Y(x, y, z) { return cy + (x - y) * 0.5 * k - (z - zmid) * zk; }
    function pt(x, y, z) { return [X(x, y), Y(x, y, z === undefined ? S.heightAt(spec, x, y) : z)]; }
    var baseY = function (x, y) { return Y(x, y, zmin) + T; };
    var H = Math.ceil(cy + ak + zHalf + T + (mini ? (o.view ? 30 : 10) : 46));

    // The block edges are a schematic overview; the measured trace below
    // retains its resolved peaks and valleys even when marks are subpixel.
    var n = Math.round(Math.min(mini ? 200 : 900, Math.max(mini ? 70 : 220, (2 * a / spec.spacing) * (mini ? 5 : 9)))), i;
    var front = [], right = [], back = [], left = [];
    for (i = 0; i <= n; i++) {
      var u = -a + 2 * a * i / n;
      front.push(pt(u, -a)); right.push(pt(a, u)); back.push(pt(-u, a)); left.push(pt(-a, -u));
    }
    var out = [];
    out.push(el('path', { 'class': 'st-face-top', d: pathOf(front.concat(right, back, left)) + 'Z' }));

    // marks
    var minGap = (mini ? 3.2 : 2.6) / (k * C30);
    var cr = S.crests(spec, a, minGap), d = '';
    cr.segments.forEach(function (s) {
      var len = Math.hypot(s[2] - s[0], s[3] - s[1]), m = Math.max(2, Math.ceil(len / (a / (mini ? 3 : 12)))), pts = [];
      for (var j = 0; j <= m; j++) { pts.push(pt(s[0] + (s[2] - s[0]) * j / m, s[1] + (s[3] - s[1]) * j / m)); }
      d += pathOf(pts);
    });
    cr.circles.forEach(function (c) {
      var m = Math.max(mini ? 16 : 20, Math.min(160, Math.ceil(c[2] * k / (mini ? 5 : 4)))), run = [];
      for (var j = 0; j <= m; j++) {
        var th = (j / m) * Math.PI * 2, x = c[0] + c[2] * Math.sin(th), y = c[1] + c[2] * Math.cos(th);
        if (Math.abs(x) <= a && Math.abs(y) <= a) { run.push(pt(x, y)); }
        else { if (run.length > 1) { d += pathOf(run); } run = []; }
      }
      if (run.length > 1) { d += pathOf(run); }
    });
    out.push(el('path', { 'class': 'st-crest', d: d }));

    var sl = S.scratchLine(spec, a);
    if (sl) {
      var sp = [];
      for (var q = 0; q <= 60; q++) { sp.push(pt(sl[0] + (sl[2] - sl[0]) * q / 60, sl[1] + (sl[3] - sl[1]) * q / 60)); }
      out.push(el('path', { 'class': 'st-scratch', d: pathOf(sp) }));
    }

    // the two visible sides; their top edges are the surface's own profile there
    var x0 = -a, x1 = a;
    out.push(el('path', { 'class': 'st-face-front', d: pathOf(front.concat([[X(x1, -a), baseY(x1, -a)], [X(x0, -a), baseY(x0, -a)]])) + 'Z' }));
    out.push(el('path', { 'class': 'st-face-side', d: pathOf(right.concat([[X(a, a), baseY(a, a)], [X(a, -a), baseY(a, -a)]])) + 'Z' }));
    out.push(el('path', { 'class': 'st-edge', d: pathOf(front) + pathOf(right) }));

    // the trace
    var tpts = function (s0, s1) {
      var i0 = Math.round((s0 - tr.pos[0]) / tr.dx), i1 = Math.round((s1 - tr.pos[0]) / tr.dx);
      return columns(tr.pos, tr.z, i0, i1,
        function (s) { return dir === 'y' ? X(0, s) : X(s, 0); },
        function (z, s) { return dir === 'y' ? Y(0, s, z) : Y(s, 0, z); }, mini ? 1 : 0.7);
    };
    var e0 = -(P.SECTIONS / 2) * lc, e1 = -e0;
    if (traced) {
      out.push(el('path', { 'class': 'st-trace-extra', d: pathOf(tpts(-a, e0)) + pathOf(tpts(e1, a)) }));
      out.push(el('path', { 'class': 'st-trace', d: pathOf(tpts(e0, e1)) }));
      var ticks = '';
      for (var s = 0; s <= P.SECTIONS; s++) {
        var at = e0 + s * lc, h = a * 0.07;
        var p1 = dir === 'y' ? pt(-h, at, S.heightAt(spec, 0, at)) : pt(at, -h, S.heightAt(spec, at, 0));
        var p2 = dir === 'y' ? pt(h, at, S.heightAt(spec, 0, at)) : pt(at, h, S.heightAt(spec, at, 0));
        ticks += 'M' + r1(p1[0]) + ' ' + r1(p1[1]) + 'L' + r1(p2[0]) + ' ' + r1(p2[1]);
      }
      out.push(el('path', { 'class': 'st-trace-tick', d: ticks }));
    }

    if (!mini) {
      // stylus at the start of the trace
      var st = dir === 'y' ? pt(0, -a) : pt(-a, 0), sx = r1(st[0]), sy = r1(st[1]);
      out.push(el('path', { 'class': 'st-stylus', d: 'M' + sx + ' ' + sy + 'L' + (sx - 4) + ' ' + (sy - 9) + 'L' + (sx - 4) + ' ' + (sy - 30) + 'L' + (sx + 4) + ' ' + (sy - 30) + 'L' + (sx + 4) + ' ' + (sy - 9) + 'Z' }));
      out.push(txt({ 'class': 'st-lbl', x: sx, y: sy - 36, 'text-anchor': 'middle' }, 'STYLUS'));
      // face names, set on the faces
      var fx = X(-0.45 * a, -a), fy = (Y(-0.45 * a, -a, zmid) + baseY(-0.45 * a, -a)) / 2 + 4;
      out.push(txt({ 'class': 'st-face-lbl', x: r1(fx), y: r1(fy), 'text-anchor': 'middle', transform: 'rotate(30 ' + r1(fx) + ' ' + r1(fy) + ')' }, 'FRONT'));
      var rx = X(a, 0.45 * a), ry = (Y(a, 0.45 * a, zmid) + baseY(a, 0.45 * a)) / 2 + 4;
      out.push(txt({ 'class': 'st-face-lbl', x: r1(rx), y: r1(ry), 'text-anchor': 'middle', transform: 'rotate(-30 ' + r1(rx) + ' ' + r1(ry) + ')' }, 'RIGHT SIDE'));
      // the width of the (square) patch, dimensioned under the front edge, or
      // under the right side edge when the front view's arrow is in the way
      var onSide = o.view === 'front';
      var q0 = onSide ? [a, -a] : [-a, -a], q1 = onSide ? [a, a] : [a, -a];
      var dy0 = baseY(q0[0], q0[1]) + 16, dy1 = baseY(q1[0], q1[1]) + 16;
      var dx0 = X(q0[0], q0[1]) + (onSide ? 10 : 0), dx1 = X(q1[0], q1[1]) + (onSide ? 10 : 0);
      out.push(el('path', { 'class': 'st-dim', d: 'M' + r1(dx0) + ' ' + r1(dy0) + 'L' + r1(dx1) + ' ' + r1(dy1), 'marker-start': 'url(#' + id + '-arr)', 'marker-end': 'url(#' + id + '-arr)' }));
      var mx = (dx0 + dx1) / 2 + (onSide ? 8 : 0), my = (dy0 + dy1) / 2 + 17;
      out.push(txt({ 'class': 'st-tick', x: r1(mx), y: r1(my), 'text-anchor': 'middle', transform: 'rotate(' + (onSide ? -30 : 30) + ' ' + r1(mx) + ' ' + r1(my - 4) + ')' }, fmtMm(2 * a) + ' mm'));
      out.push(txt({ 'class': 'st-small', x: 10, y: H - 10 }, 'Heights ×' + E + (cr.every > 1 ? ' · every ' + ordinal(cr.every) + ' mark line drawn' : '')));
    }

    // which way the chosen drawing view looks
    if (o.view === 'front' || o.view === 'side') {
      var zf = zmid, len = a * (mini ? 0.7 : 0.5), tip, tail;
      var at2 = mini ? 0 : 0.4 * a;
      if (o.view === 'front') { tip = [X(at2, -a), (Y(at2, -a, zf) + baseY(at2, -a)) / 2]; tail = [X(at2, -a - len), (Y(at2, -a - len, zf) + baseY(at2, -a - len)) / 2]; }
      else { tip = [X(a, -at2), (Y(a, -at2, zf) + baseY(a, -at2)) / 2]; tail = [X(a + len, -at2), (Y(a + len, -at2, zf) + baseY(a + len, -at2)) / 2]; }
      out.push(el('path', { 'class': 'st-viewdir', d: 'M' + r1(tail[0]) + ' ' + r1(tail[1]) + 'L' + r1(tip[0]) + ' ' + r1(tip[1]), 'marker-end': 'url(#' + id + '-varr)' }));
      if (!mini) {
        out.push(txt({ 'class': 'st-lbl st-viewdir-lbl', x: r1(tail[0] + (o.view === 'front' ? -4 : 4)), y: r1(tail[1] + 16), 'text-anchor': o.view === 'front' ? 'end' : 'start' }, o.view === 'front' ? 'FRONT VIEW' : 'SIDE VIEW'));
      }
    }

    var rel = S.relation(spec.lay, dir);
    var title = o.title || 'A patch of surface with ' + PATTERN_WORDS[spec.lay];
    var desc = o.desc || ('A ' + fmtMm(2 * a) + ' mm square patch of surface with ' + PATTERN_WORDS[spec.lay] + ', ' + fmtMm(spec.spacing) + ' mm apart' +
      (spec.wave > 0 ? ', on a gentle waviness' : '') + (spec.scratch ? ', and one deep scratch' : '') + '. ' +
      (traced ? 'The stylus trace runs ' + (dir === 'y' ? 'front to back' : 'left to right') + ', ' + RELATION_WORDS[rel] + '. ' +
      'The solid part of the trace is the evaluation length, five sections of ' + fmtMm(lc) + ' mm. ' : '') +
      'Heights are drawn ' + E + ' times larger than widths.' +
      (o.view ? ' An arrow shows the direction the ' + N.VIEWS[o.view].name.toLowerCase() + ' looks.' : '') +
      (cr.every > 1 ? ' Only every ' + ordinal(cr.every) + ' mark line is drawn.' : ''));
    var defs = el('defs', {},
      el('marker', { id: id + '-arr', markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: 'auto-start-reverse' }, el('path', { 'class': 'st-arrowhead', d: 'M0 0L8 4L0 8z' })) +
      el('marker', { id: id + '-varr', markerWidth: mini ? 6 : 9, markerHeight: mini ? 6 : 9, refX: mini ? 5 : 8, refY: mini ? 3 : 4.5, orient: 'auto', markerUnits: 'strokeWidth' },
        el('path', { 'class': 'st-viewdir-head', d: mini ? 'M0 0L6 3L0 6z' : 'M0 0L9 4.5L0 9z' })));
    var svg = '<svg' + attrs({ 'class': 'st-pictorial' + (mini ? ' st-mini' : ''), viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-labelledby': id + '-t ' + id + '-d', focusable: 'false' }) + '>' +
      el('title', { id: id + '-t' }, esc(title)) + el('desc', { id: id + '-d' }, esc(desc)) + defs + out.join('') + '</svg>';
    return { svg: svg, exaggeration: E, every: cr.every, width: 2 * a, relation: rel };
  }

  function ordinal(n) { return n === 2 ? 'second' : n === 3 ? 'third' : n + 'th'; }

  /* =========================================================================
     The profiles
     =======================================================================*/
  /* One sample per pixel column would drop the peaks the numbers come from,
     so each column keeps its lowest and highest samples, in order. */
  function columns(pos, v, a, b, xm, ym, res) {
    var pts = [], col = null, lo = null, hi = null, w = res || 1;
    function flush() {
      if (col === null) { return; }
      if (lo.i === hi.i) { pts.push([xm(pos[lo.i]), ym(lo.v, pos[lo.i])]); }
      else if (lo.i < hi.i) { pts.push([xm(pos[lo.i]), ym(lo.v, pos[lo.i])], [xm(pos[hi.i]), ym(hi.v, pos[hi.i])]); }
      else { pts.push([xm(pos[hi.i]), ym(hi.v, pos[hi.i])], [xm(pos[lo.i]), ym(lo.v, pos[lo.i])]); }
    }
    for (var i = a; i <= b; i++) {
      var c = Math.floor(xm(pos[i]) / w);
      if (c !== col) { flush(); col = c; lo = { i: i, v: v[i] }; hi = { i: i, v: v[i] }; }
      else { if (v[i] < lo.v) { lo = { i: i, v: v[i] }; } if (v[i] > hi.v) { hi = { i: i, v: v[i] }; } }
    }
    flush();
    return pts;
  }

  function profiles(an, o) {
    o = o || {};
    var id = o.idPrefix || 'st-prof', compact = !!o.compact, res = o.res || 1;
    var tr = an.trace, lc = an.lc, pos = tr.pos;
    var W = compact ? 400 : 640, padL = compact ? 40 : 52, padR = compact ? 46 : 62;
    var plotW = W - padL - padR;
    var showPrimary = o.primary !== false;
    var s0 = pos[0], s1 = pos[pos.length - 1];
    function xm(s) { return padL + (s - s0) / (s1 - s0) * plotW; }
    var pxPerMm = plotW / (s1 - s0);
    var out = [], y = 0;
    var fs = compact ? 1.3 : 1;   // labels grow on a phone, where the figure is drawn small

    var e0 = pos[tr.i0], e1 = pos[tr.i1];
    var parts = { primary: null, rough: null };

    if (showPrimary) {
      y += 30 * fs;
      out.push(txt({ 'class': 'st-lbl', x: padL, y: y - 10 }, 'MEASURED PROFILE'));
      var lgx = padL + plotW, lgy = y - 14;
      out.push(el('path', { 'class': 'st-w', d: 'M' + r1(lgx - (compact ? 112 : 186)) + ' ' + r1(lgy) + 'h' + (compact ? 18 : 22) }));
      out.push(txt({ 'class': 'st-small', x: r1(lgx), y: r1(lgy + 4), 'text-anchor': 'end' }, compact ? 'mean line' : 'mean line, which is the waviness'));
      var pTop = y, pH = compact ? 120 : 130, pBot = pTop + pH;
      var pmin = Infinity, pmax = -Infinity;
      for (var i = 0; i < tr.z.length; i++) { if (tr.z[i] < pmin) { pmin = tr.z[i]; } if (tr.z[i] > pmax) { pmax = tr.z[i]; } }
      var pstep = niceStep(pmax - pmin, compact ? 3 : 4);
      var plo = Math.floor(pmin / pstep) * pstep, phi = Math.ceil(pmax / pstep) * pstep;
      if (phi - plo < pstep) { phi = plo + pstep; }
      var ymP = function (v) { return pBot - (v - plo) / (phi - plo) * pH; };
      // the extra trace each side of the evaluation length
      out.push(el('rect', { 'class': 'st-extra', x: r1(xm(s0)), y: r1(pTop), width: r1(xm(e0) - xm(s0)), height: pH }));
      out.push(el('rect', { 'class': 'st-extra', x: r1(xm(e1)), y: r1(pTop), width: r1(xm(s1) - xm(e1)), height: pH }));
      out.push(axisY(plo, phi, pstep, ymP, padL, W - padR));
      out.push(el('rect', { 'class': 'st-frame', x: padL, y: r1(pTop), width: plotW, height: pH }));
      out.push(el('path', { 'class': 'st-p', d: pathOf(columns(pos, tr.z, 0, tr.z.length - 1, xm, ymP, res)) }));
      out.push(el('path', { 'class': 'st-w', d: pathOf(columns(pos, an.mean, tr.i0, tr.i1, xm, ymP, res)) }));
      if (!compact) {
        out.push(txt({ 'class': 'st-small st-halo', x: r1(xm(s1) - 4), y: r1(pBot - 6), 'text-anchor': 'end' }, 'extra trace for the filter'));
      }
      out.push(txt({ 'class': 'st-tick', x: 4, y: r1(pTop - 12) }, 'µm'));
      out.push(scaleNote(W - padR + 6, pBot + 12, pH / (phi - plo) * 1000 / pxPerMm, compact));
      parts.primary = { top: pTop, bottom: pBot, lo: plo, hi: phi };
      y = pBot + (compact ? 14 : 18);
    }

    // roughness
    y += 32 * fs;
    out.push(txt({ 'class': 'st-lbl', x: padL, y: y - 10 }, compact ? 'ROUGHNESS PROFILE' : 'ROUGHNESS PROFILE = MEASURED − MEAN LINE'));
    var rTop = y, rH = compact ? 150 : 160, rBot = rTop + rH;
    var rmax = Math.max(Math.abs(an.rt.peak.v), Math.abs(an.rt.valley.v), 1e-6) * 1.12;
    var rstep = niceStep(2 * rmax, compact ? 3 : 4);
    var rlim = Math.ceil(rmax / rstep) * rstep;
    if (o.roughLimit && o.roughLimit >= rmax) {
      rlim = o.roughLimit; rstep = niceStep(2 * rlim, compact ? 3 : 4);
    }
    var ymR = function (v) { return rTop + rH / 2 - v / rlim * (rH / 2); };
    out.push(axisY(-rlim, rlim, rstep, ymR, padL, W - padR));
    out.push(el('rect', { 'class': 'st-frame', x: padL, y: r1(rTop), width: plotW, height: rH }));
    out.push(txt({ 'class': 'st-tick', x: 4, y: r1(rTop - 12) }, 'µm'));
    out.push(scaleNote(W - padR + 6, rBot + 12, rH / (2 * rlim) * 1000 / pxPerMm, compact));

    var rpts = columns(pos, an.rough, tr.i0, tr.i1, xm, ymR, res);
    var y0 = ymR(0);
    // the roughness line closes along the mean line, so one path is both the line and its shaded area
    var rArea = el('path', { 'class': 'st-r', d: pathOf(rpts.concat([[xm(e1), y0], [xm(e0), y0]])) + 'Z' });
    // sections
    var secD = '', zD = '', labels = [];
    an.sections.forEach(function (sec) {
      var xa = xm(pos[sec.a]), xb = xm(pos[sec.b]);
      secD += 'M' + r1(xb) + ' ' + r1(rTop) + 'V' + r1(rBot);
      if (sec.index === 1) { secD += 'M' + r1(xa) + ' ' + r1(rTop) + 'V' + r1(rBot); }
      var yp = ymR(sec.peak.v), yv = ymR(sec.valley.v);
      zD += 'M' + r1(xa + 2) + ' ' + r1(yp) + 'H' + r1(xb - 2) + 'M' + r1(xa + 2) + ' ' + r1(yv) + 'H' + r1(xb - 2);
      labels.push(txt({ 'class': 'st-sec-num', x: r1((xa + xb) / 2), y: r1(rTop + 14 * fs), 'text-anchor': 'middle' }, String(sec.index)));
    });
    out.push(el('path', { 'class': 'st-section', d: secD }));
    out.push(el('path', { 'class': 'st-zline', d: zD }));
    out.push(el('path', { 'class': 'st-mean', d: 'M' + r1(xm(e0)) + ' ' + r1(y0) + 'H' + r1(xm(e1)) }));
    out.push(el('path', { 'class': 'st-ra-line', d: 'M' + r1(xm(e0)) + ' ' + r1(ymR(an.Ra)) + 'H' + r1(xm(e1)) + 'M' + r1(xm(e0)) + ' ' + r1(ymR(-an.Ra)) + 'H' + r1(xm(e1)) }));
    out.push(rArea);
    // each section's height as a bar at its right-hand end, peak and valley marked where they are
    var marks = '';
    an.sections.forEach(function (sec) {
      var xb = xm(pos[sec.b]) - 6, yp = ymR(sec.peak.v), yv = ymR(sec.valley.v);
      marks += el('path', { 'class': 'st-zbar', d: 'M' + r1(xb) + ' ' + r1(yp) + 'V' + r1(yv) });
      var px = xm(pos[sec.peak.i]), vx = xm(pos[sec.valley.i]);
      marks += el('path', { 'class': 'st-peak', d: 'M' + r1(px) + ' ' + r1(yp - 2) + 'l-4 -7h8z' });
      marks += el('path', { 'class': 'st-valley', d: 'M' + r1(vx) + ' ' + r1(yv + 2) + 'l-4 7h8z' });
    });
    out.push(marks);
    out.push(labels.join(''));
    // the Ra lines are named in the empty extra-trace margin, clear of the profile
    out.push(txt({ 'class': 'st-small', x: r1(xm(e0) - 5), y: r1(ymR(an.Ra) - 2), 'text-anchor': 'end' }, '+Ra'));
    out.push(txt({ 'class': 'st-small', x: r1(xm(e0) - 5), y: r1(ymR(-an.Ra) + 11), 'text-anchor': 'end' }, '−Ra'));
    out.push(txt({ 'class': 'st-small', x: r1(xm(e0) - 5), y: r1(y0 + 4), 'text-anchor': 'end' }, 'mean'));

    // Rt: the whole evaluation length's highest peak to lowest valley
    var bx = W - padR + (compact ? 12 : 16), ytp = ymR(an.rt.peak.v), ytv = ymR(an.rt.valley.v);
    out.push(el('path', { 'class': 'st-rt', d: 'M' + r1(xm(pos[an.rt.peak.i])) + ' ' + r1(ytp) + 'H' + r1(bx + 5) + 'M' + r1(xm(pos[an.rt.valley.i])) + ' ' + r1(ytv) + 'H' + r1(bx + 5) }));
    out.push(el('path', { 'class': 'st-rt-bar', d: 'M' + r1(bx) + ' ' + r1(ytp) + 'V' + r1(ytv), 'marker-start': 'url(#' + id + '-arr)', 'marker-end': 'url(#' + id + '-arr)' }));
    out.push(txt({ 'class': 'st-lbl', x: r1(bx + 7), y: r1((ytp + ytv) / 2 + 4) }, 'Rt'));

    // section heights, under the plot
    y = rBot + 16 * fs;
    var zt = '';
    an.sections.forEach(function (sec) {
      var xa = xm(pos[sec.a]), xb = xm(pos[sec.b]);
      zt += txt({ 'class': 'st-tick', x: r1((xa + xb) / 2), y: r1(y), 'text-anchor': 'middle' }, (compact ? '' : 'Z' + sec.index + ' ') + N.fmtUm(sec.height));
    });
    out.push(zt);
    // distance along the trace
    y += 10 * fs;
    var span = s1 - s0, xstep = niceStep(span, compact ? 4 : 7), xt = '';
    for (var v = 0; v <= span + 1e-9; v += xstep) {
      var xx = xm(s0 + v);
      xt += el('path', { 'class': 'st-axis-tick', d: 'M' + r1(xx) + ' ' + r1(y) + 'v5' }) +
        txt({ 'class': 'st-tick', x: r1(xx), y: r1(y + 18 * fs), 'text-anchor': 'middle' }, fmt(v, decimals(xstep)));
    }
    out.push(el('path', { 'class': 'st-axis', d: 'M' + padL + ' ' + r1(y) + 'H' + (padL + plotW) }));
    out.push(xt);
    out.push(txt({ 'class': 'st-small', x: padL + plotW, y: r1(y + 34 * fs), 'text-anchor': 'end' }, 'mm along the trace'));
    var H = Math.ceil(y + 42 * fs);
    parts.rough = { top: rTop, bottom: rBot, lim: rlim };

    var desc = 'Top: the measured profile along the trace, with the filter\'s mean line through it; that mean line is the waviness. ' +
      'Bottom: the roughness profile, which is the measured profile minus the mean line, over the five ' + fmtMm(lc) + ' mm sections of the evaluation length. ' +
      'Ra ' + N.fmtUm(an.Ra) + ' µm is shown as dashed lines at plus and minus Ra. ' +
      'Section heights from peak to valley: ' + an.sections.map(function (sc) { return N.fmtUm(sc.height); }).join(', ') + ' µm; their mean is Rz ' + N.fmtUm(an.Rz) + ' µm. ' +
      'The largest peak-to-valley height over the whole evaluation length is Rt ' + N.fmtUm(an.Rt) + ' µm. Heights are drawn far larger than lengths.';
    if (!showPrimary) { desc = desc.replace(/^Top:[^.]*\.[^.]*\. Bottom: the/, 'The'); }
    var defs = el('defs', {}, el('marker', { id: id + '-arr', markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: 'auto-start-reverse' }, el('path', { 'class': 'st-arrowhead', d: 'M0 0L8 4L0 8z' })));
    var svg = '<svg' + attrs({ 'class': 'st-profiles' + (compact ? ' st-compact' : ''), viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-labelledby': id + '-t ' + id + '-d', focusable: 'false' }) + '>' +
      el('title', { id: id + '-t' }, esc(o.title || (showPrimary ? 'The measured profile, its mean line, and the roughness profile' : 'The roughness profile and its sections'))) +
      el('desc', { id: id + '-d' }, esc(desc)) + defs + out.join('') + '</svg>';
    return { svg: svg, parts: parts, xm: xm, width: W, height: H };
  }

  /* Heights in a plot are drawn this many times larger than lengths. */
  function scaleNote(x, y, ratio, compact) {
    if (compact) { return txt({ 'class': 'st-small', x: r1(x), y: r1(y) }, '×' + Math.round(ratio)); }
    return txt({ 'class': 'st-small', x: r1(x), y: r1(y) }, 'heights') + txt({ 'class': 'st-small', x: r1(x), y: r1(y + 14) }, '×' + Math.round(ratio));
  }

  function axisY(lo, hi, step, ym, x0, x1) {
    var d = '', g = '', t = '', dec = decimals(step);
    for (var v = lo; v <= hi + step * 1e-6; v += step) {
      var yy = r1(ym(v));
      g += 'M' + x0 + ' ' + yy + 'H' + x1;
      d += 'M' + (x0 - 5) + ' ' + yy + 'H' + x0;
      t += txt({ 'class': 'st-tick', x: x0 - 8, y: r1(yy + 4), 'text-anchor': 'end' }, fmt(Math.abs(v) < step * 1e-6 ? 0 : v, dec));
    }
    return el('path', { 'class': 'st-grid', d: g }) + el('path', { 'class': 'st-axis-tick', d: d }) + t;
  }

  /* =========================================================================
     The callout
     =======================================================================*/
  /* Schematic proportions after the ISO 1302 graphics: legs at 60 degrees to
     the surface, short leg about 1.4 and long leg about 3 text heights. The
     standards dimension these exactly; this is a teaching drawing. */
  var TH = 14;   // text height in SVG units
  function legs(vx, vy) {
    var H1 = 1.4 * TH, H2 = 3 * TH, t = Math.tan(Math.PI / 3);
    return { H1: H1, H2: H2, A: [vx - H1 / t, vy - H1], B: [vx + H2 / t, vy - H2], C: [vx + H1 / t, vy - H1] };
  }
  /* The mark that tells an ISO 21920 symbol from an ISO 1302 one: a short,
     separate dash above the short leg, clear of both legs. */
  function currentDash(g) {
    var y = g.A[1] - 0.45 * TH;
    return [g.A[0] - 0.15 * TH, y, g.A[0] + 0.95 * TH, y];
  }

  function symbol(c, o) {
    o = o || {};
    c = N.makeCallout(c);
    var id = o.idPrefix || 'st-sym';
    var block = !!o.block;
    var ex = N.expressible(c);
    var out = [], W, H, title, desc;
    if (c.notation === 'current' || c.notation === 'legacy') {
      var req = ex.ok ? N.requirementText(c) : '';
      var reqW = Math.max(4.2, req.length * 0.62) * TH;
      var vx = (block ? 70 : 34), vy = (block ? 82 : 70);
      var g = legs(vx, vy);
      var lineEnd = g.B[0] + reqW + 0.6 * TH;
      W = Math.ceil(lineEnd + (block ? 70 : 14));
      H = vy + (block ? 70 : 12);
      if (block) {
        out.push(el('rect', { 'class': 'st-view-block', x: 20, y: vy, width: W - 40, height: 46 }));
        out.push(txt({ 'class': 'st-lbl', x: W / 2, y: vy + 66, 'text-anchor': 'middle' }, o.viewName ? o.viewName.toUpperCase() : 'DRAWING VIEW'));
      } else {
        out.push(el('path', { 'class': 'st-sym-surface', d: 'M6 ' + vy + 'H' + (W - 6) }));
      }
      var d = 'M' + r1(g.A[0]) + ' ' + r1(g.A[1]) + 'L' + vx + ' ' + vy + 'L' + r1(g.B[0]) + ' ' + r1(g.B[1]) + 'H' + r1(lineEnd);
      if (c.process === 'removal') { d += 'M' + r1(g.A[0]) + ' ' + r1(g.A[1]) + 'H' + r1(g.C[0]); }
      out.push(el('path', { 'class': 'st-sym-line', d: d }));
      if (c.process === 'prohibited') {
        var cc = 0.6 * g.H1;
        out.push(el('circle', { 'class': 'st-sym-line', cx: vx, cy: r1(vy - cc), r: r1(cc / 2) }));
      }
      if (c.notation === 'current') {
        var dd = currentDash(g);
        out.push(el('path', { 'class': 'st-sym-line st-sym-dash', d: 'M' + r1(dd[0]) + ' ' + r1(dd[1]) + 'H' + r1(dd[2]) }));
      }
      if (req) { out.push(txt({ 'class': 'st-req', x: r1(g.B[0] + 0.3 * TH), y: r1(g.B[1] + 1.15 * TH) }, req)); }
      if (c.lay) {
        if (c.notation === 'current') {
          out.push(txt({ 'class': 'st-req st-lay', x: r1(g.B[0] + 0.3 * TH), y: r1(g.B[1] - 0.35 * TH) }, c.lay));
        } else {
          // beside the long leg, clear of it, below the line
          out.push(txt({ 'class': 'st-req st-lay', x: r1(g.C[0] + 0.45 * TH), y: r1(vy - 0.2 * TH) }, c.lay));
        }
      }
      var conv = N.CONVENTIONS[c.notation];
      title = conv.name + ': ' + N.PROCESS[c.process].name.toLowerCase() + (req ? ', ' + req + ' µm' : '');
      desc = 'Schematic ' + conv.standard + ' symbol. A check-mark shape whose short left leg and long right leg meet at the surface' +
        (c.process === 'removal' ? ', with a bar across the top of the short leg closing the lower triangle' : '') +
        (c.process === 'prohibited' ? ', with a circle in the V touching both legs' : '') +
        '. A line runs right from the top of the long leg' + (req ? ', with ' + req + ' written below it' : '') + '.' +
        (c.notation === 'current' ? ' A separate short dash floats above the short leg, touching neither leg.' : '') +
        (c.lay ? ' Lay symbol ' + N.LAY[c.lay].name.toLowerCase() + (c.notation === 'current' ? ', written above the line.' : ', written beside the long leg.') : '') +
        (block ? ' The symbol stands on the top edge of the part in the ' + (o.viewName || 'drawing view').toLowerCase() + '.' : '');
    } else if (c.notation === 'ngrade') {
      W = 200; H = 96;
      var gr = ex.ok ? N.nGrade(c.value) : null;
      out.push(el('rect', { 'class': 'st-grade-box', x: 40, y: 14, width: 120, height: 56, rx: 4 }));
      out.push(txt({ 'class': 'st-grade', x: 100, y: 54, 'text-anchor': 'middle' }, gr ? gr.grade : '—'));
      out.push(txt({ 'class': 'st-small', x: 100, y: 88, 'text-anchor': 'middle' }, gr ? '= Ra ' + N.fmtUm(gr.ra) + ' µm' : 'no grade for this'));
      title = gr ? 'Grade number ' + gr.grade : 'No grade number';
      desc = gr ? 'The legacy roughness grade ' + gr.grade + ', which stands for Ra ' + N.fmtUm(gr.ra) + ' micrometres.' : ex.why;
    } else {
      var row = ex.ok ? N.triangleRow(c.value) : null;
      var tri = triangles(row ? row.marks : 0, { bare: true });
      W = Math.max(200, tri.width + 40); H = 96;
      out.push('<g transform="translate(' + r1((W - tri.width) / 2) + ' 18)">' + tri.body + '</g>');
      out.push(txt({ 'class': 'st-small', x: W / 2, y: 88, 'text-anchor': 'middle' }, row ? 'listed with Ra ' + row.ra.map(N.fmtUm).join(', ') + ' µm' : 'not listed'));
      title = row ? row.marks + ' triangle mark' + (row.marks > 1 ? 's' : '') : 'No triangle mark listed';
      desc = row ? 'Historical triangle marks: ' + row.marks + ' downward triangles. A catalog comparison lists them with Ra ' + row.ra.map(N.fmtUm).join(', ') + ' micrometres and calls the comparison approximate.' : ex.why;
    }
    var svg = '<svg' + attrs({ 'class': 'st-symbol st-symbol-' + c.notation, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-labelledby': id + '-t ' + id + '-d', focusable: 'false' }) + '>' +
      el('title', { id: id + '-t' }, esc(title)) + el('desc', { id: id + '-d' }, esc(desc)) + out.join('') + '</svg>';
    return { svg: svg, width: W, height: H };
  }

  /* n downward triangles, each standing on a point. */
  function triangles(n, o) {
    o = o || {};
    var s = o.size || 30, gap = 6, h = s * C30, body = '';
    for (var i = 0; i < n; i++) {
      var x = i * (s + gap);
      body += el('path', { 'class': 'st-tri', d: 'M' + r1(x) + ' 0H' + r1(x + s) + 'L' + r1(x + s / 2) + ' ' + r1(h) + 'Z' });
    }
    var width = Math.max(0, n * s + (n - 1) * gap);
    if (o.bare) { return { body: body, width: width, height: h }; }
    var id = o.idPrefix || 'st-tri';
    var svg = '<svg' + attrs({ 'class': 'st-triangles', viewBox: '-2 -2 ' + r1(width + 4) + ' ' + r1(h + 4), role: 'img', 'aria-labelledby': id + '-t', focusable: 'false' }) + '>' +
      el('title', { id: id + '-t' }, n + ' downward triangle' + (n > 1 ? 's' : '')) + body + '</svg>';
    return { svg: svg, width: width, height: h };
  }

  /* =========================================================================
     The page's printed figures. The page embeds these strings verbatim and
     the page test checks that it still does, so the no-JavaScript and paper
     figures are the live renderer's output, not a copy that can drift.
     =======================================================================*/
  var EQUAL_RA = 1.6;
  function equalSpec(shape) {
    var spec = S.make({ shape: shape });
    spec.height = P.heightForRa(spec, 'x', 0.8, EQUAL_RA);
    return spec;
  }
  var LAY_FIGS = {
    '=': { lay: 'parallel', view: 'side' }, '⊥': { lay: 'parallel', view: 'front' },
    X: { lay: 'crossed' }, M: { lay: 'multi' }, C: { lay: 'circular' }, R: { lay: 'radial' }, P: { lay: 'particulate' }
  };
  var LAY_KEY = { '=': 'parallel', '⊥': 'perpendicular', X: 'crossed', M: 'multi', C: 'circular', R: 'radial', P: 'particulate' };
  function staticFigures() {
    var f = {};
    f.surface = function () { return pictorial(S.make(), { lc: 0.8, dir: 'x', idPrefix: 'st-static-surface' }); };
    f.profiles = function () { return profiles(P.measure(S.make(), 'x', 0.8), { idPrefix: 'st-static-prof', res: 2 }); };
    S.SHAPE_ORDER.forEach(function (shape) {
      f['equal-' + shape] = function () {
        return profiles(P.measure(equalSpec(shape), 'x', 0.8), { idPrefix: 'st-static-eq-' + shape, primary: false, roughLimit: 20, res: 2, title: 'Roughness profile: ' + S.SHAPES[shape].label.toLowerCase() });
      };
    });
    ['legacy', 'current'].forEach(function (conv) {
      N.PROCESS_ORDER.forEach(function (proc) {
        f['symbol-' + conv + '-' + proc] = function () { return symbol({ notation: conv, process: proc, param: 'Ra', value: 3.2 }, { idPrefix: 'st-static-sym-' + conv + '-' + proc }); };
      });
    });
    N.LAY_ORDER.forEach(function (sym) {
      var d = LAY_FIGS[sym];
      f['lay-' + LAY_KEY[sym]] = function () {
        return pictorial(S.make({ lay: d.lay, spacing: 0.6, wave: 0 }), { lc: 0.8, dir: 'x', mini: true, trace: false, view: d.view || null, idPrefix: 'st-static-lay-' + LAY_KEY[sym] });
      };
    });
    N.TRIANGLES.rows.forEach(function (row) {
      f['triangles-' + row.marks] = function () { return triangles(row.marks, { size: 16, idPrefix: 'st-static-tri-' + row.marks }); };
    });
    return f;
  }
  var STATIC = null;
  function staticFigure(name) {
    STATIC = STATIC || staticFigures();
    if (!STATIC[name]) { throw new Error('no static figure ' + name); }
    return STATIC[name]();
  }
  function staticNames() { STATIC = STATIC || staticFigures(); return Object.keys(STATIC); }

  return {
    EQUAL_RA: EQUAL_RA,
    equalSpec: equalSpec,
    staticFigure: staticFigure,
    staticNames: staticNames,
    LAY_FIGS: LAY_FIGS,
    LAY_KEY: LAY_KEY,
    niceDown: niceDown,
    niceStep: niceStep,
    pictorial: pictorial,
    profiles: profiles,
    columns: columns,
    symbol: symbol,
    legs: legs,
    currentDash: currentDash,
    triangles: triangles,
    RELATION_WORDS: RELATION_WORDS,
    PATTERN_WORDS: PATTERN_WORDS
  };
});
