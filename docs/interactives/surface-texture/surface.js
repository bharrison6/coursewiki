/* ============================================================================
   surface-texture / surface.js - the teaching surfaces the lab measures.

   A surface is a height map z(x, y) in micrometres over a plane in
   millimetres. It is built from three separate parts, so each can be named
   and switched on its own:

     marks     the repeated tool or process marks. Their direction is the LAY.
     waviness  a longer, gentler undulation, such as vibration or deflection
               leaves behind.
     detail    a small irregular texture, so a trace along the marks still
               finds something to measure.

   and optionally one deep scratch. The plane is unbounded: the view and the
   trace sample the same function over whatever window they need.

   Coordinates: x runs left to right across the part, y runs from front to
   back, z is up. Patterns that have a centre (circular and radial lay) are
   centred on x = 0, y = 0, which is also where every trace crosses.

   These are made-up teaching surfaces. The mark shapes are recognisable
   (rounded valleys between sharp crests, flat tops with narrow grooves) but
   no surface here is a prediction for a process, machine or setting.

   Pure functions, no DOM. Loads in the browser as CourseWikiTextureSurface
   and in Node through module.exports.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) { module.exports = api; }
  else { root.CourseWikiTextureSurface = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;

  function frac(v) { return v - Math.floor(v); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ---- mark shapes --------------------------------------------------------
     One mark period, u in [0, 1). The groove is centred on u = 0.5 and the
     shape returns 0 at the bottom of the groove and 1 at the crest. All three
     have the same peak-to-valley height; they differ in where the material is. */
  var GROOVE = 0.15;  // groove (or peak) width as a fraction of the period, for the narrow shapes
  var SHAPES = {
    rounded: {
      label: 'Rounded valleys, sharp crests',
      note: 'The pattern a round-nosed tool leaves at each pass: rounded valleys that meet in sharp crests.',
      fn: function (u) { var t = 2 * u - 1; return t * t; }
    },
    plateau: {
      label: 'Flat tops, narrow grooves',
      note: 'Mostly flat tops cut by narrow, deep grooves: most of the profile sits above its mean line.',
      fn: function (u) {
        var t = (u - 0.5) / (GROOVE / 2);
        return Math.abs(t) < 1 ? t * t : 1;
      }
    },
    peaked: {
      label: 'Narrow peaks, flat valleys',
      note: 'The plateau turned upside down: narrow peaks stand up from flat valleys.',
      fn: function (u) { return 1 - SHAPES.plateau.fn(frac(u + 0.5)); }
    }
  };
  var SHAPE_ORDER = ['rounded', 'plateau', 'peaked'];

  /* ---- lay patterns ---------------------------------------------------------
     Every pattern returns a height in [0, 1] from the same mark shape, so the
     mark height control means the same thing on all of them. "families" are
     sets of parallel straight marks: angle is the direction the marks run,
     measured from the front-to-back (y) axis toward +x, and spacing is the
     distance between neighbouring marks as a multiple of the mark spacing. */
  var CROSS_ANGLE = 30;   // crossed marks run 30 degrees either side of front-to-back
  var RADIAL_REF = 2;     // radial marks are about one mark spacing apart 2 mm from the centre

  /* The number of radial marks: a multiple of four, so a straight trace
     through the centre, left-right or front-back, runs along a crest on both
     sides of it. */
  function radialCount(s) { return 4 * Math.max(1, Math.round(TAU * RADIAL_REF / (4 * s))); }

  var PATTERNS = {
    parallel: {
      label: 'Parallel marks',
      families: [{ angle: 0, spacing: 1, offset: 0 }],
      shaped: true
    },
    crossed: {
      label: 'Crossed marks',
      families: [{ angle: CROSS_ANGLE, spacing: 1, offset: 0 }, { angle: -CROSS_ANGLE, spacing: 1, offset: 0.5 }],
      shaped: true
    },
    multi: {
      label: 'Many directions',
      families: [
        { angle: 8, spacing: 1.00, offset: 0.10 },
        { angle: 52, spacing: 1.31, offset: 0.62 },
        { angle: 97, spacing: 0.87, offset: 0.35 },
        { angle: 141, spacing: 1.17, offset: 0.81 }
      ],
      shaped: true
    },
    circular: { label: 'Circular marks', shaped: true },
    radial: { label: 'Radial marks', shaped: true },
    particulate: { label: 'Pits, no direction', shaped: false }
  };
  var PATTERN_ORDER = ['parallel', 'crossed', 'multi', 'circular', 'radial', 'particulate'];

  /* Signed distance across a family's marks, in mark periods. */
  function familyPhase(f, s, x, y) {
    var a = f.angle * DEG;
    // marks run along (sin a, cos a); distance is measured along the normal (cos a, -sin a)
    return (x * Math.cos(a) - y * Math.sin(a)) / (s * f.spacing) + f.offset;
  }

  /* A cheap, repeatable hash for the pits: the same cell always gets the same pit. */
  function hash2(i, j, k) {
    var h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return ((h >>> 0) % 100000) / 100000;
  }
  function pit(s, i, j) {
    return {
      x: (i + 0.15 + 0.7 * hash2(i, j, 1)) * s,
      y: (j + 0.15 + 0.7 * hash2(i, j, 2)) * s,
      r: s * (0.32 + 0.24 * hash2(i, j, 3)),
      depth: 0.6 + 0.4 * hash2(i, j, 4)
    };
  }

  function marks01(spec, x, y) {
    var s = spec.spacing, g = SHAPES[spec.shape] ? SHAPES[spec.shape].fn : SHAPES.rounded.fn;
    var P = PATTERNS[spec.lay] || PATTERNS.parallel;
    if (P.families) {
      var h = 1;
      for (var k = 0; k < P.families.length; k++) { h = Math.min(h, g(frac(familyPhase(P.families[k], s, x, y)))); }
      return h;
    }
    if (spec.lay === 'circular') { return g(frac(Math.sqrt(x * x + y * y) / s)); }
    if (spec.lay === 'radial') {
      return g(frac(radialCount(s) * (Math.atan2(x, y) / TAU)));
    }
    // particulate: shallow bowls on a flat top, one per cell of a mark-spacing grid
    var ci = Math.floor(x / s), cj = Math.floor(y / s), best = 1;
    for (var di = -1; di <= 1; di++) {
      for (var dj = -1; dj <= 1; dj++) {
        var p = pit(s, ci + di, cj + dj);
        var dx = x - p.x, dy = y - p.y, q = (dx * dx + dy * dy) / (p.r * p.r);
        if (q < 1) { best = Math.min(best, 1 - p.depth * (1 - q)); }
      }
    }
    return best;
  }

  /* ---- the other parts ------------------------------------------------------*/
  var WAVE_ANGLE = 25;       // waviness crests run 25 degrees off the front-to-back axis
  var DETAIL = 0.07;         // irregular detail, as a fraction of the mark height
  var SCRATCH = { x: 0.3, y: 0, angle: 60, depth: 3 };   // through (0.3, 0) mm, 60 degrees from x; depth x mark height

  function waveAt(spec, x, y) {
    if (!spec.wave) { return 0; }
    var a = WAVE_ANGLE * DEG;
    return (spec.wave / 2) * Math.sin(TAU * (x * Math.cos(a) + y * Math.sin(a)) / spec.waveLength + 0.7);
  }
  function detailAt(spec, x, y) {
    var s = spec.spacing;
    return spec.height * DETAIL * (
      Math.sin(TAU * x / (0.37 * s) + 1.3) * Math.sin(TAU * y / (0.29 * s) + 0.4) +
      0.6 * Math.sin(TAU * (0.8 * x + 0.6 * y) / (0.23 * s) + 2.1) +
      0.5 * Math.sin(TAU * (0.6 * x - 0.8 * y) / (0.31 * s) + 0.5));
  }
  function scratchHalfWidth(spec) { return Math.max(0.006, 0.22 * spec.spacing); }
  function scratchAt(spec, x, y) {
    if (!spec.scratch) { return 0; }
    var a = SCRATCH.angle * DEG;
    var d = Math.abs((x - SCRATCH.x) * Math.sin(a) - (y - SCRATCH.y) * Math.cos(a));
    var b = scratchHalfWidth(spec), t = d / b;
    return t < 1 ? -SCRATCH.depth * spec.height * (1 - t * t) : 0;
  }

  /* Height of the surface in micrometres at (x, y) in millimetres. */
  function heightAt(spec, x, y) {
    return spec.height * marks01(spec, x, y) + detailAt(spec, x, y) + waveAt(spec, x, y) + scratchAt(spec, x, y);
  }

  /* ---- a spec, checked --------------------------------------------------------*/
  var LIMITS = {
    spacing: { min: 0.04, max: 0.6 },     // mm
    height: { min: 0.2, max: 40 },        // um, mark peak-to-valley
    wave: { min: 0, max: 40 },            // um, waviness peak-to-valley
    waveLength: { min: 1, max: 10 }       // mm
  };
  var DEFAULT = { lay: 'parallel', shape: 'rounded', spacing: 0.2, height: 6, wave: 4, waveLength: 2.5, scratch: false };

  function make(over) {
    var s = {}, k;
    for (k in DEFAULT) { if (Object.prototype.hasOwnProperty.call(DEFAULT, k)) { s[k] = DEFAULT[k]; } }
    if (over) { for (k in over) { if (Object.prototype.hasOwnProperty.call(over, k) && over[k] !== undefined) { s[k] = over[k]; } } }
    if (!PATTERNS[s.lay]) { s.lay = DEFAULT.lay; }
    if (!SHAPES[s.shape]) { s.shape = DEFAULT.shape; }
    ['spacing', 'height', 'wave', 'waveLength'].forEach(function (key) {
      var v = Number(s[key]);
      s[key] = clamp(isFinite(v) ? v : DEFAULT[key], LIMITS[key].min, LIMITS[key].max);
    });
    s.scratch = !!s.scratch;
    return s;
  }

  /* ---- which way a straight trace runs relative to the lay ----------------------
     dir 'x' is a left-to-right trace along y = 0; 'y' is front-to-back along x = 0.
     Both pass through the centre of the circular and radial patterns. */
  function relation(lay, dir) {
    if (lay === 'parallel') { return dir === 'x' ? 'across' : 'along'; }
    if (lay === 'crossed') { return dir === 'x' ? 'across' : 'shallow'; }
    if (lay === 'circular') { return 'radius-across'; }
    if (lay === 'radial') { return 'radius-along'; }
    return 'none';
  }

  /* ---- the marks as lines, for drawing ------------------------------------------
     Crest lines of the marks inside a square window |x|, |y| <= half. Families
     are straight segments, circles are radii, radial marks are rays from the
     centre and pits are circles. When marks are closer than minGap mm the
     drawing keeps every n-th one and says so in `every`. */
  function clipLine(px, py, dx, dy, half) {
    // Liang-Barsky against the square window
    var t0 = -Infinity, t1 = Infinity;
    var p = [-dx, dx, -dy, dy], q = [px + half, half - px, py + half, half - py];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) { return null; } continue; }
      var r = q[i] / p[i];
      if (p[i] < 0) { if (r > t0) { t0 = r; } } else if (r < t1) { t1 = r; }
    }
    if (t0 > t1) { return null; }
    return [px + t0 * dx, py + t0 * dy, px + t1 * dx, py + t1 * dy];
  }

  function crests(spec, half, minGap) {
    var s = spec.spacing, out = { segments: [], circles: [], every: 1 };
    var P = PATTERNS[spec.lay];
    var gap = minGap || 0;
    var every = 1;
    if (P.families || spec.lay === 'circular' || spec.lay === 'radial') {
      var tightest = s;
      if (P.families) { P.families.forEach(function (f) { tightest = Math.min(tightest, s * f.spacing); }); }
      while (tightest * every < gap) { every += 1; }
    }
    out.every = every;
    if (P.families) {
      P.families.forEach(function (f) {
        var a = f.angle * DEG, nx = Math.cos(a), ny = -Math.sin(a), dx = Math.sin(a), dy = Math.cos(a);
        var period = s * f.spacing;
        var reach = half * Math.SQRT2 / period + 2;
        var k0 = Math.ceil(-reach - f.offset), k1 = Math.floor(reach - f.offset);
        for (var k = k0; k <= k1; k++) {
          if (((k % every) + every) % every !== 0) { continue; }
          var d = (k - f.offset) * period;   // every shape's crest is at u = 0, where familyPhase is whole
          var seg = clipLine(nx * d, ny * d, dx, dy, half);
          if (seg) { out.segments.push(seg); }
        }
      });
    } else if (spec.lay === 'circular') {
      for (var k = 1; k * s <= half * Math.SQRT2; k++) {
        if (k % every !== 0) { continue; }
        out.circles.push([0, 0, k * s]);
      }
    } else if (spec.lay === 'radial') {
      var n = radialCount(s);
      for (var m = 0; m < n; m++) {
        if (m % every !== 0) { continue; }
        var th = (m / n) * TAU;   // crest where n * atan2(x, y) / TAU is a whole number
        var seg2 = clipLine(0, 0, Math.sin(th), Math.cos(th), half);
        if (seg2) { out.segments.push([0, 0, seg2[2], seg2[3]]); }
      }
    } else {
      var c0 = Math.floor(-half / s) - 1, c1 = Math.floor(half / s) + 1;
      for (var i = c0; i <= c1; i++) {
        for (var j = c0; j <= c1; j++) {
          var p = pit(s, i, j);
          if (Math.abs(p.x) <= half && Math.abs(p.y) <= half) { out.circles.push([p.x, p.y, p.r]); }
        }
      }
    }
    return out;
  }

  /* The scratch, as a line clipped to the window, when it is switched on. */
  function scratchLine(spec, half) {
    if (!spec.scratch) { return null; }
    var a = SCRATCH.angle * DEG;
    return clipLine(SCRATCH.x, SCRATCH.y, Math.cos(a), Math.sin(a), half);
  }

  return {
    SHAPES: SHAPES,
    SHAPE_ORDER: SHAPE_ORDER,
    PATTERNS: PATTERNS,
    PATTERN_ORDER: PATTERN_ORDER,
    CROSS_ANGLE: CROSS_ANGLE,
    WAVE_ANGLE: WAVE_ANGLE,
    SCRATCH: SCRATCH,
    LIMITS: LIMITS,
    DEFAULT: DEFAULT,
    make: make,
    heightAt: heightAt,
    marks01: marks01,
    waveAt: waveAt,
    relation: relation,
    crests: crests,
    scratchLine: scratchLine,
    scratchHalfWidth: scratchHalfWidth
  };
});
