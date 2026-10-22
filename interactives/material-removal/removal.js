/* ============================================================================
   material-removal / removal.js - the solid a milling cut takes away, and
   the power that removal implies. Numbers in, numbers or markup out.

     removal rate  Q = ae * ap * vf        mm3/min  (width x depth x table feed)
     travel        L = vf * t / 60         mm       (t in seconds)
     volume        V = ae * ap * L         mm3      solid metal, before it is chips
     power         P = Q * u / 60          W        (u, specific cutting energy, J/mm3)
     1 mechanical horsepower = 745.699871582 W

   u is a material band, not one number, so power is always a band. The
   estimate is power at the cutting edge. Dividing by a drivetrain efficiency
   gives the power the motor shaft must deliver - still not what the machine
   draws from the wall, and not a check of what its motor can supply.

   The drawing is a cavalier view: travel runs across the page, depth runs
   straight down and width recedes at 30 degrees, every direction at the
   same scale. A comparison is drawn from one frame, so its panels share
   that scale and can be compared by eye.

   Pure UMD: browser global CourseWikiRemoval, CommonJS the same object.
   ==========================================================================*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiRemoval = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HP_W = 745.699871582;
  var MM_PER_IN = 25.4;
  var MM3_PER_IN3 = MM_PER_IN * MM_PER_IN * MM_PER_IN;

  function finite(v) { return typeof v === 'number' && isFinite(v); }

  /* ---- the relations ------------------------------------------------------*/
  function removalRate(widthMm, depthMm, feedMmPerMin) { return widthMm * depthMm * feedMmPerMin; }
  function travel(feedMmPerMin, seconds) { return feedMmPerMin * seconds / 60; }
  function volume(widthMm, depthMm, travelMm) { return widthMm * depthMm * travelMm; }
  function power(rateMm3PerMin, energyJPerMm3) { return rateMm3PerMin * energyJPerMm3 / 60; }
  function powerBand(rateMm3PerMin, band) { return [power(rateMm3PerMin, band[0]), power(rateMm3PerMin, band[1])]; }
  function shaftPower(cuttingW, efficiency) { return cuttingW / efficiency; }
  function toHp(watts) { return watts / HP_W; }

  /* Width and depth checked against the cutter. A side cut can be no wider
     than the cutter; a wider path is a second pass, not one cut. */
  function engagementErrors(diameterMm, widthMm, depthMm) {
    var e = [];
    if (finite(diameterMm) && finite(widthMm) && widthMm > diameterMm * (1 + 1e-9)) {
      e.push({ field: 'width', message: 'Width of cut cannot be more than the cutter diameter. A wider path takes more than one pass.' });
    }
    if (finite(widthMm) && !(widthMm > 0)) e.push({ field: 'width', message: 'Width of cut must be more than zero.' });
    if (finite(depthMm) && !(depthMm > 0)) e.push({ field: 'depth', message: 'Depth of cut must be more than zero.' });
    return e;
  }

  /* ---- display ------------------------------------------------------------*/
  function group(intPart) { return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* `n` significant figures, thousands grouped. Estimates are shown to two
     or three figures; more would claim a precision the band does not have. */
  function sig(v, n) {
    if (!finite(v)) return '-';
    if (v === 0) return '0';
    var p = (n || 3) - 1 - Math.floor(Math.log10(Math.abs(v)));
    var places = Math.max(0, p), f = Math.pow(10, p);
    var s = (Math.round(Math.abs(v) * f) / f).toFixed(places);
    var parts = s.split('.');
    return (v < 0 ? '-' : '') + group(parts[0]) + (parts[1] ? '.' + parts[1] : '');
  }

  function showLength(mm, unit) {
    return unit === 'in' ? sig(mm / MM_PER_IN, 3) + ' in' : sig(mm, 3) + ' mm';
  }
  function showVolume(mm3, unit) {
    if (unit === 'in') return sig(mm3 / MM3_PER_IN3, 3) + ' in³';
    return mm3 < 1000 ? sig(mm3, 3) + ' mm³' : sig(mm3 / 1000, 3) + ' cm³';
  }
  function showRate(mm3PerMin, unit) {
    if (unit === 'in') return sig(mm3PerMin / MM3_PER_IN3, 3) + ' in³/min';
    return mm3PerMin < 1000 ? sig(mm3PerMin, 3) + ' mm³/min' : sig(mm3PerMin / 1000, 3) + ' cm³/min';
  }

  /* One power, or a band in one shared unit: W below a kilowatt, kW above. */
  function powerUnit(maxW) { return maxW >= 1000 ? 'kW' : 'W'; }
  function inUnit(w, u) { return u === 'kW' ? w / 1000 : (u === 'hp' ? toHp(w) : w); }
  function span(lo, hi, u, figures) {
    var a = sig(inUnit(lo, u), figures), b = sig(inUnit(hi, u), figures);
    return (a === b ? a : a + '–' + b) + ' ' + u;
  }
  function showPower(lo, hi) {
    if (hi === undefined) hi = lo;
    return span(lo, hi, powerUnit(hi), 2);
  }
  function showHp(lo, hi) {
    if (hi === undefined) hi = lo;
    return span(lo, hi, 'hp', 2);
  }
  /* "110–210 W (0.15–0.28 hp)" */
  function showPowerBoth(lo, hi) { return showPower(lo, hi) + ' (' + showHp(lo, hi) + ')'; }

  /* A specific-energy band said the way a student can use it: watts per
     cm3/min in metric, horsepower per in3/min in inch. Both are J/mm3
     rescaled; the J/mm3 figure goes alongside. */
  function showEnergy(band, unit) {
    var j = sig(band[0], 2) === sig(band[1], 2) ? sig(band[0], 2) : sig(band[0], 2) + '–' + sig(band[1], 2);
    if (unit === 'in') {
      return span(band[0] * MM3_PER_IN3 / 60, band[1] * MM3_PER_IN3 / 60, 'hp', 2).replace(/ hp$/, ' hp per in³/min') + ' (' + j + ' J/mm³)';
    }
    return span(band[0] * 1000 / 60, band[1] * 1000 / 60, 'W', 2) + ' per cm³/min (' + j + ' J/mm³)';
  }

  /* A "nice" length (1, 2 or 5 x 10^k) close to `target`. */
  function niceLength(target) {
    if (!(target > 0)) return 1;
    var e = Math.floor(Math.log10(target)), base = Math.pow(10, e), m = target / base;
    return (m < 1.5 ? 1 : (m < 3.5 ? 2 : (m < 7.5 ? 5 : 10))) * base;
  }
  /* The next 1, 2, 2.5 or 5 x 10^k at or above `v`: an axis end. */
  function niceCeil(v) {
    if (!(v > 0)) return 1;
    var e = Math.floor(Math.log10(v)), base = Math.pow(10, e), m = v / base;
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (m <= steps[i] * (1 + 1e-9)) return steps[i] * base;
    return 10 * base;
  }

  /* ---- how long to watch ----------------------------------------------------
     A time span long enough for the setup to travel about three cutter
     diameters, from a short list of round values. Long enough to read the
     prism, short enough that its cross-section stays visible.            */
  var WINDOWS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 60, 120];
  function autoWindow(feedMmPerMin, diameterMm) {
    for (var i = 0; i < WINDOWS.length; i++) {
      if (travel(feedMmPerMin, WINDOWS[i]) >= 3 * diameterMm) return WINDOWS[i];
    }
    return WINDOWS[WINDOWS.length - 1];
  }
  function showSeconds(s) { return (s < 1 ? sig(s, 2) : sig(s, 3)) + ' s'; }

  /* ========================================================================
     The drawing
     ======================================================================*/
  var COS = Math.cos(Math.PI / 6), SIN = Math.sin(Math.PI / 6);
  var LAYOUT = {
    wide:    { w: 640, maxH: 250, left: 74, right: 16, top: 16, bottom: 58 },
    compact: { w: 400, maxH: 230, left: 70, right: 10, top: 14, bottom: 58 }
  };

  function n(v) { return (Math.round(v * 10) / 10).toString(); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* One frame for a comparison. `runs` all share the cutter and the cut
     cross-section and differ only in table feed; `seconds` is the longest
     time any panel will show. The stock is sized from the cut so the cut
     always reads, and the stock's size is not a quantity of the lesson.  */
  function frame(runs, seconds, compact) {
    var r0 = runs[0], D = r0.diameter, R = D / 2, ae = r0.width, ap = r0.depth;
    var Lmax = 0;
    runs.forEach(function (r) { Lmax = Math.max(Lmax, travel(r.feed, seconds)); });
    var lead = Math.max(0.8 * D, 0.12 * Lmax);
    var f = {
      D: D, R: R, ae: ae, ap: ap, yc: ae - R, seconds: seconds, Lmax: Lmax,
      xs: -R - lead, xe: Lmax + R + Math.max(0.5 * D, 0.06 * Lmax),
      W: ae + Math.max(0.8 * ae, 0.6 * D),
      H: ap + Math.max(0.6 * ap, 0.35 * D)
    };
    f.zTop = f.H + Math.max(0.8 * D, 0.5 * ap);
    var L = LAYOUT[compact ? 'compact' : 'wide'];
    f.layout = L; f.compact = !!compact;
    // projected extent, in mm, of everything drawn
    var pts = [[f.xs, 0, 0], [f.xe, 0, 0], [f.xe, f.W, f.H], [f.xs, f.W, f.H]];
    [0, Lmax].forEach(function (xc) {
      for (var k = 0; k < 16; k++) {
        var a = 2 * Math.PI * k / 16;
        pts.push([xc + R * Math.cos(a), f.yc + R * Math.sin(a), f.zTop]);
        pts.push([xc + R * Math.cos(a), f.yc + R * Math.sin(a), f.H - ap]);
      }
    });
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(function (p) {
      var sx = p[0] + p[1] * COS, sy = -(p[2] + p[1] * SIN);
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    });
    var availW = L.w - L.left - L.right;
    var s = availW / (maxX - minX);
    if ((maxY - minY) * s > L.maxH) s = L.maxH / (maxY - minY);
    f.scale = s;                                        // px per mm, every direction
    f.ox = L.left - minX * s;
    f.oy = L.top - minY * s;
    f.w = L.w;
    f.h = Math.ceil(L.top + (maxY - minY) * s + L.bottom);
    return f;
  }

  function project(f, x, y, z) { return [f.ox + f.scale * (x + y * COS), f.oy - f.scale * (z + y * SIN)]; }
  function pathOf(f, pts, close) {
    return pts.map(function (p, i) { var q = project(f, p[0], p[1], p[2]); return (i ? 'L' : 'M') + n(q[0]) + ' ' + n(q[1]); }).join('') + (close ? 'Z' : '');
  }
  /* The front of the cut: the leading half of the cutter circle, inside
     the width of cut, from y0 to y1. */
  function frontX(f, xc, y) { return xc + Math.sqrt(Math.max(0, f.R * f.R - (y - f.yc) * (y - f.yc))); }
  function arc(f, xc, z, y0, y1) {
    var out = [];
    for (var k = 0; k <= 16; k++) { var y = y0 + (y1 - y0) * k / 16; out.push([frontX(f, xc, y), y, z]); }
    return out;
  }
  function hull(points) {
    var p = points.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var cross = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
    var lower = [], upper = [];
    p.forEach(function (q) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); });
    for (var i = p.length - 1; i >= 0; i--) {
      var q = p[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
      upper.push(q);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }
  function arrowHead(tx, ty, dx, dy, size) {
    var len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    var bx = tx - ux * size, by = ty - uy * size, w = size * 0.55;
    return 'M' + n(tx) + ' ' + n(ty) + 'L' + n(bx - uy * w) + ' ' + n(by + ux * w) + 'L' + n(bx + uy * w) + ' ' + n(by - ux * w) + 'Z';
  }
  function txt(cls, x, y, s, anchor) {
    return '<text class="mr-t ' + cls + '" x="' + n(x) + '" y="' + n(y) + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(s) + '</text>';
  }

  /* One run after `elapsed` seconds, drawn in frame `f`.
     run - { feed (mm/min), width, depth, diameter (mm) }
     o   - { unit, ariaLabel }                                          */
  function renderSweep(run, elapsed, f, o) {
    var opt = o || {}, unit = opt.unit || 'mm';
    var R = f.R, ae = f.ae, ap = f.ap, H = f.H, W = f.W, zf = H - ap, xs = f.xs, xe = f.xe;
    var t = Math.max(0, Math.min(elapsed, f.seconds));
    var L = travel(run.feed, t), xc = L;
    var xf0 = frontX(f, 0, 0), xfT = frontX(f, xc, 0);
    var out = [];
    var V = volume(ae, ap, L);
    out.push('<svg class="mr-svg' + (f.compact ? ' mr-svg-compact' : '') + '" viewBox="0 0 ' + f.w + ' ' + f.h + '" role="img" aria-label="' +
      esc(opt.ariaLabel || ('After ' + showSeconds(t) + ' the cutter has travelled ' + showLength(L, unit) + ' and removed a solid ' +
        showLength(ae, unit) + ' wide by ' + showLength(ap, unit) + ' deep: ' + showVolume(V, unit) + '.')) + '" focusable="false">');

    // ---- the stock, with the cut made so far (back faces first)
    out.push('<path class="mr-stock-side" d="' + pathOf(f, [[xe, 0, 0], [xe, W, 0], [xe, W, H], [xe, 0, H]], true) + '"/>');
    out.push('<path class="mr-cut-wall" d="' + pathOf(f, [[xs, ae, zf], [xc, ae, zf], [xc, ae, H], [xs, ae, H]], true) + '"/>');
    out.push('<path class="mr-cut-floor" d="' + pathOf(f, [[xs, 0, zf], [xfT, 0, zf]].concat(arc(f, xc, zf, 0, ae), [[xs, ae, zf]]), true) + '"/>');
    out.push('<path class="mr-cut-wall" d="' + pathOf(f, arc(f, xc, H, 0, ae).concat(arc(f, xc, zf, ae, 0)), true) + '"/>');
    out.push('<path class="mr-stock-top" d="' + pathOf(f, [[xs, ae, H]].concat(arc(f, xc, H, ae, 0), [[xe, 0, H], [xe, W, H], [xs, W, H]]), true) + '"/>');
    out.push('<path class="mr-stock-front" d="' + pathOf(f, [[xs, 0, 0], [xe, 0, 0], [xe, 0, H], [xfT, 0, H], [xfT, 0, zf], [xs, 0, zf]], true) + '"/>');

    // ---- the solid removed in the time shown, drawn where it used to be.
    // Its two ends are the same front shape, L apart, so it holds exactly
    // width x depth x L however the ends curve.
    if (L > 1e-9) {
      out.push('<path class="mr-removed-hidden" d="' + pathOf(f, arc(f, 0, zf, 0, ae).concat([[xc, ae, zf]]), false) + '"/>');
      out.push('<path class="mr-removed" d="' + pathOf(f, arc(f, xc, H, ae, 0).concat(arc(f, 0, H, 0, ae)), true) + '"/>');
      out.push('<path class="mr-removed mr-removed-front" d="' + pathOf(f, [[xf0, 0, zf], [xfT, 0, zf], [xfT, 0, H], [xf0, 0, H]], true) + '"/>');
    }
    // where the cut stood at the start of the time shown
    out.push('<path class="mr-start" d="' + pathOf(f, arc(f, 0, H, ae, 0).concat([[xf0, 0, zf]]), false) + '"/>');

    // ---- the cutter, where it is now: an outline, so the cut shows through
    var circ = [], top = [];
    for (var k = 0; k < 48; k++) {
      var a = 2 * Math.PI * k / 48, x = xc + R * Math.cos(a), y = f.yc + R * Math.sin(a);
      circ.push(project(f, x, y, zf)); circ.push(project(f, x, y, f.zTop));
      top.push([x, y, f.zTop]);
    }
    var h = hull(circ);
    out.push('<path class="mr-cutter" d="' + h.map(function (q, i) { return (i ? 'L' : 'M') + n(q[0]) + ' ' + n(q[1]); }).join('') + 'Z"/>');
    out.push('<path class="mr-cutter-top" d="' + pathOf(f, top, true) + '"/>');

    // ---- feed direction, above the far end of the cut already made
    var fa = project(f, xs, W, H);
    fa = [fa[0] + 4, fa[1] - 14];
    var fb = [fa[0] + 56, fa[1]];
    out.push('<path class="mr-feed" d="M' + n(fa[0]) + ' ' + n(fa[1]) + 'L' + n(fb[0] - 8) + ' ' + n(fb[1]) + '"/>');
    out.push('<path class="mr-feed-head" d="' + arrowHead(fb[0], fb[1], 1, 0, 11) + '"/>');
    out.push(txt('mr-t-small', fb[0] + 6, fb[1] + 5, 'feed', 'start'));

    // ---- dimensions: depth and width at the left end, travel underneath
    var d0 = project(f, xs, 0, zf), d1 = project(f, xs, 0, H), off = 12;
    out.push('<path class="mr-dim" d="M' + n(d0[0] - off) + ' ' + n(d0[1]) + 'L' + n(d1[0] - off) + ' ' + n(d1[1]) +
      'M' + n(d0[0] - off - 5) + ' ' + n(d0[1]) + 'L' + n(d0[0] - 2) + ' ' + n(d0[1]) +
      'M' + n(d1[0] - off - 5) + ' ' + n(d1[1]) + 'L' + n(d1[0] - 2) + ' ' + n(d1[1]) + '"/>');
    out.push(txt('mr-t-small', d0[0] - off - 6, (d0[1] + d1[1]) / 2 + 5, 'depth', 'end'));
    var w0 = project(f, xs, 0, H), w1 = project(f, xs, ae, H);
    out.push('<path class="mr-dim" d="M' + n(w0[0] - off) + ' ' + n(w0[1] - 8) + 'L' + n(w1[0] - off) + ' ' + n(w1[1] - 8) + '"/>');
    out.push(txt('mr-t-small', (w0[0] + w1[0]) / 2 - off - 6, (w0[1] + w1[1]) / 2 - 12, 'width', 'end'));
    var b0 = project(f, 0, 0, 0), b1 = project(f, xc, 0, 0), by = b0[1] + 18;
    out.push('<path class="mr-dim" d="M' + n(b0[0]) + ' ' + n(by - 6) + 'L' + n(b0[0]) + ' ' + n(by + 6) + 'M' + n(b0[0]) + ' ' + n(by) +
      'L' + n(b1[0]) + ' ' + n(by) + 'M' + n(b1[0]) + ' ' + n(by - 6) + 'L' + n(b1[0]) + ' ' + n(by + 6) + '"/>');
    out.push(txt('mr-t-small', b0[0], by + 20, L > 1e-9 ? 'travel in ' + showSeconds(t) : 'start', 'start'));

    // ---- scale bar, along the travel direction
    var bar = niceLength(70 / f.scale / (unit === 'in' ? MM_PER_IN : 1)) * (unit === 'in' ? MM_PER_IN : 1);
    var sx0 = f.w - f.layout.right - bar * f.scale, sy0 = f.h - 12;
    out.push('<path class="mr-scale" d="M' + n(sx0) + ' ' + (sy0 - 5) + 'L' + n(sx0) + ' ' + sy0 + 'L' + n(sx0 + bar * f.scale) + ' ' + sy0 +
      'L' + n(sx0 + bar * f.scale) + ' ' + (sy0 - 5) + '"/>');
    out.push(txt('mr-t-small', sx0 - 6, sy0, showLength(bar, unit), 'end'));
    out.push('</svg>');
    return out.join('');
  }

  /* ---- power across the materials, at one removal rate --------------------
     Changing the material changes nothing in the cut, only the energy each
     cubic millimetre costs. One axis for every row.                      */
  function powerRows(rateMm3PerMin, materials) {
    return materials.map(function (m) {
      var b = powerBand(rateMm3PerMin, m.energyJMm3);
      return { id: m.id, label: m.label, lo: b[0], hi: b[1], single: Math.abs(b[1] - b[0]) <= 1e-9 * Math.max(1, b[1]) };
    });
  }

  /* HTML, so the labels stay readable at any width. `unit` 'in' sets the
     axis in horsepower; 'mm' in watts or kilowatts. */
  function renderPowerChart(rateMm3PerMin, materials, o) {
    var opt = o || {}, rows = powerRows(rateMm3PerMin, materials);
    var maxW = Math.max.apply(null, rows.map(function (r) { return r.hi; }));
    var u = opt.unit === 'in' ? 'hp' : powerUnit(maxW);
    var axisMax = niceCeil(inUnit(maxW, u));
    var pct = function (w) { return Math.max(0, Math.min(100, inUnit(w, u) / axisMax * 100)); };
    var out = ['<div class="mr-chart" role="group" aria-label="' + esc('Estimated cutting power for each material at ' + showRate(rateMm3PerMin, opt.unit) +
      ', the same cut in every row') + '">'];
    out.push('<p class="mr-chart-head"><span>Material</span><span>Estimated cutting power at ' + esc(showRate(rateMm3PerMin, opt.unit)) + '</span></p>');
    out.push('<ul class="mr-rows">');
    rows.forEach(function (r) {
      var left = pct(r.lo), width = Math.max(pct(r.hi) - left, 0);
      out.push('<li class="mr-row' + (r.id === opt.current ? ' is-current' : '') + '" data-material="' + esc(r.id) + '"' +
        (r.id === opt.current ? ' aria-current="true"' : '') + '>' +
        '<span class="mr-name">' + esc(r.label) + '</span>' +
        '<span class="mr-track" aria-hidden="true"><span class="mr-band' + (r.single ? ' is-single' : '') + '" style="left:' + n(left) + '%;width:' + n(width) + '%"></span></span>' +
        '<span class="mr-val">' + esc(span(r.lo, r.hi, u, 2)) + (r.single ? ' <span class="mr-note">one factor</span>' : '') + '</span></li>');
    });
    out.push('</ul>');
    var ticks = [0, axisMax / 2, axisMax];
    out.push('<p class="mr-row mr-axis-row" aria-hidden="true"><span></span><span class="mr-axis">' + ticks.map(function (v, i) {
      return '<span style="left:' + (i * 50) + '%">' + esc(sig(v, 2) + (i === 2 ? ' ' + u : '')) + '</span>';
    }).join('') + '</span><span></span></p>');
    out.push('</div>');
    return out.join('');
  }

  return {
    HP_W: HP_W, MM_PER_IN: MM_PER_IN, MM3_PER_IN3: MM3_PER_IN3, WINDOWS: WINDOWS, LAYOUT: LAYOUT,
    removalRate: removalRate, travel: travel, volume: volume, power: power, powerBand: powerBand,
    shaftPower: shaftPower, toHp: toHp, engagementErrors: engagementErrors,
    sig: sig, showLength: showLength, showVolume: showVolume, showRate: showRate, showPower: showPower,
    showHp: showHp, showPowerBoth: showPowerBoth, showEnergy: showEnergy, showSeconds: showSeconds,
    niceLength: niceLength, niceCeil: niceCeil, autoWindow: autoWindow,
    frame: frame, project: project, frontX: frontX, renderSweep: renderSweep,
    powerRows: powerRows, renderPowerChart: renderPowerChart
  };
});
