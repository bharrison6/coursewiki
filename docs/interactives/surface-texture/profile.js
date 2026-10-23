/* ============================================================================
   surface-texture / profile.js - a straight stylus trace across a surface,
   the filter that splits it into waviness and roughness, and the numbers
   read from the roughness profile.

   THE TEACHING CALCULATION, stated once so every view says the same thing:

     cutoff        lc, one of CUTOFFS (mm). A section is lc long.
     evaluation    five sections, 5 lc, centred on the middle of the trace.
     trace         lc extra at each end (7 lc in all), so the filter has data
                   on both sides of every evaluated point.
     mean line     a Gaussian weighted average of the measured profile,
                   weights exp(-pi (x / (alpha lc))^2), alpha = sqrt(ln 2 / pi),
                   which keeps half of a wave lc long. Its weights are cut off
                   at +/- lc and rescaled to sum to one. This mean line is
                   the waviness profile.
     roughness     measured profile minus mean line, over the evaluation length.
     Ra            the mean of |roughness| over the evaluation length (the
                   trapezoid rule over the samples).
     Rz            the mean of the five sections' peak-to-valley heights.
     Rt            the peak-to-valley height over the whole evaluation length.

   What it leaves out, on purpose: no short-wavelength (lambda-s) filter, a
   sharp stylus, no form removal, no rules about how many traces a decision
   needs. It is a teaching filter that behaves like the standard Gaussian
   profile filter in the middle of a trace; it is not a compliant instrument.

   Pure functions, no DOM. Loads in the browser as CourseWikiTextureProfile
   and in Node through module.exports; needs surface.js.
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module && module.exports;
  var api = factory(node ? require('./surface.js') : root.CourseWikiTextureSurface);
  if (node) { module.exports = api; } else { root.CourseWikiTextureProfile = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S) {
  'use strict';
  if (!S) { return null; }

  var ALPHA = Math.sqrt(Math.LN2 / Math.PI);
  var CUTOFFS = [0.25, 0.8, 2.5];       // mm
  var PER_CUTOFF = 400;                 // minimum samples per section; Gaussian integration grid
  var SECTIONS = 5;
  var MARGIN = 1;                       // extra trace at each end, in cutoffs

  /* Gaussian weights for one cutoff, sampled every lc / PER_CUTOFF. */
  var weightCache = {};
  function weights(per) {
    per = per || PER_CUTOFF;
    if (weightCache[per]) { return weightCache[per]; }
    var half = per * MARGIN, w = new Float64Array(2 * half + 1), sum = 0;
    for (var i = -half; i <= half; i++) {
      var t = (i / per) / ALPHA;          // x / (alpha lc)
      var v = Math.exp(-Math.PI * t * t);
      w[i + half] = v; sum += v;
    }
    for (var j = 0; j < w.length; j++) { w[j] /= sum; }
    weightCache[per] = w;
    return w;
  }

  /* How much of a sine wave of the given wavelength the mean line keeps:
     the continuous Gaussian's transmission, exp(-pi (alpha lc / wavelength)^2). */
  function meanLineShare(lc, wavelength) {
    var t = ALPHA * lc / wavelength;
    return Math.exp(-Math.PI * t * t);
  }

  /* ---- sample a straight trace ---------------------------------------------------
     dir 'x': left to right along y = 0. dir 'y': front to back along x = 0.
     Position s runs from -(2.5 + MARGIN) lc to +(2.5 + MARGIN) lc. */
  function samplesPerCutoff(spec, lc) {
    // 64 intervals across the narrowest groove: 15% of a mark period, with
    // the closest family spaced at 0.87 periods. This also resolves the
    // irregular detail and the scratch. Radial traces here run through the
    // centre, along the rays, so do not cross their narrowing angular marks.
    var feature = spec.spacing * 0.15 * 0.87;
    return PER_CUTOFF * Math.max(1, Math.ceil(lc * 64 / feature / PER_CUTOFF));
  }

  function trace(spec, dir, lc, sampling) {
    var per = sampling || samplesPerCutoff(spec, lc);
    var n = (SECTIONS + 2 * MARGIN) * per + 1;
    var dx = lc / per;
    var s0 = -(SECTIONS / 2 + MARGIN) * lc;
    var pos = new Float64Array(n), z = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var s = s0 + i * dx;
      pos[i] = s;
      z[i] = dir === 'y' ? S.heightAt(spec, 0, s) : S.heightAt(spec, s, 0);
    }
    return { dir: dir, lc: lc, dx: dx, perCutoff: per, pos: pos, z: z, i0: MARGIN * per, i1: n - 1 - MARGIN * per };
  }

  /* The mean line at every evaluated sample (i0..i1); NaN outside. */
  function meanLine(tr) {
    var per = tr.perCutoff || Math.round(tr.lc / tr.dx);
    if (per > PER_CUTOFF && per % PER_CUTOFF === 0) { return denseMeanLine(tr, per / PER_CUTOFF); }
    var w = weights(per), half = (w.length - 1) / 2, n = tr.z.length, m = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      if (i < tr.i0 || i > tr.i1) { m[i] = NaN; continue; }
      var acc = 0;
      for (var k = -half; k <= half; k++) { acc += w[k + half] * tr.z[i + k]; }
      m[i] = acc;
    }
    return m;
  }

  /* Integrate EVERY fine sample into coarse cells before convolution, rather
     than decimating and losing the grooves. The Gaussian varies slowly on
     this grid (400 cells/cutoff); midpoint quadrature then linear interpolation
     of its output keeps work bounded even at the smallest mark spacing.
     The measured/roughness profiles and their extrema keep the fine grid.
     This is numerical quadrature of the stated teaching filter, not an
     additional short-wavelength filter. */
  function denseMeanLine(tr, q) {
    var cells = (tr.z.length - 1) / q, bins = new Float64Array(cells);
    for (var j = 0; j < cells; j++) {
      var start = j * q, sum = (tr.z[start] + tr.z[start + q]) / 2;
      for (var k = 1; k < q; k++) { sum += tr.z[start + k]; }
      bins[j] = sum / q;
    }
    var half = PER_CUTOFF, w = new Float64Array(2 * half), norm = 0;
    for (var k = -half; k < half; k++) {
      var t = (k + 0.5) / PER_CUTOFF / ALPHA;
      w[k + half] = Math.exp(-Math.PI * t * t); norm += w[k + half];
    }
    var coarse = new Float64Array(cells + 1), a = tr.i0 / q, b = tr.i1 / q;
    for (var j = a; j <= b; j++) {
      var sum = 0;
      for (var k = -half; k < half; k++) { sum += w[k + half] * bins[j + k]; }
      coarse[j] = sum / norm;
    }
    var m = new Float64Array(tr.z.length); m.fill(NaN);
    for (var i = tr.i0; i <= tr.i1; i++) {
      var j = Math.floor(i / q), t = i / q - j;
      m[i] = t === 0 ? coarse[j] : coarse[j] * (1 - t) + coarse[j + 1] * t;
    }
    return m;
  }

  /* Trapezoid mean of |v| over samples a..b. */
  function meanAbs(v, a, b) {
    var acc = 0;
    for (var i = a; i < b; i++) { acc += (Math.abs(v[i]) + Math.abs(v[i + 1])) / 2; }
    return acc / (b - a);
  }

  function extremes(v, a, b) {
    var hi = { i: a, v: v[a] }, lo = { i: a, v: v[a] };
    for (var i = a + 1; i <= b; i++) {
      if (v[i] > hi.v) { hi = { i: i, v: v[i] }; }
      if (v[i] < lo.v) { lo = { i: i, v: v[i] }; }
    }
    return { peak: hi, valley: lo, height: hi.v - lo.v };
  }

  /* ---- analyse a trace ---------------------------------------------------------------
     Returns the three profiles and every number the views print. Indices in
     the result refer to the trace's own samples. */
  function analyse(tr) {
    var mean = meanLine(tr);
    var n = tr.z.length, r = new Float64Array(n);
    for (var i = 0; i < n; i++) { r[i] = (i < tr.i0 || i > tr.i1) ? NaN : tr.z[i] - mean[i]; }
    var sections = [], per = (tr.i1 - tr.i0) / SECTIONS;
    for (var k = 0; k < SECTIONS; k++) {
      var a = tr.i0 + k * per, b = a + per;
      var e = extremes(r, a, b);
      sections.push({ index: k + 1, a: a, b: b, peak: e.peak, valley: e.valley, height: e.height });
    }
    var all = extremes(r, tr.i0, tr.i1);
    var wav = extremes(mean, tr.i0, tr.i1);
    var rz = 0;
    sections.forEach(function (sec) { rz += sec.height; });
    rz /= SECTIONS;
    return {
      trace: tr,
      lc: tr.lc,
      mean: mean,
      rough: r,
      sections: sections,
      Ra: meanAbs(r, tr.i0, tr.i1),
      Rz: rz,
      Rt: all.height,
      rt: all,
      waviness: wav.height,
      wavinessExt: wav
    };
  }

  function measure(spec, dir, lc) { return analyse(trace(spec, dir, lc)); }

  /* ---- hold Ra -------------------------------------------------------------------------
     The mark height that gives a target Ra on this trace, with everything else
     held. Ra is a convex sum of absolute affine terms in mark height. It can
     DECREASE before increasing as marks cancel residual waviness. Find its
     minimum first, then bracket a root on either side. If both roots exist,
     prefer the one closest to the starting height. Report unattainable
     targets explicitly, with the closest available height and Ra range.
     The roughness profile itself IS linear in mark height - marks, detail and
     scratch all scale with it and the filter is linear - so two analysed
     traces give the profile at any height exactly. */
  function solveHeightForRa(spec, dir, lc, target) {
    if (!isFinite(target) || target < 0) { throw new RangeError('Ra target must be a finite nonnegative number'); }
    var h0 = S.LIMITS.height.min, h1 = S.LIMITS.height.max, lo = h0, hi = h1;
    var a = S.make(spec), b = S.make(spec);
    a.height = h0; b.height = h1;
    var ra = analyse(trace(a, dir, lc)), rb = analyse(trace(b, dir, lc));
    var i0 = ra.trace.i0, i1 = ra.trace.i1, buf = new Float64Array(ra.rough.length);
    var at = function (h) {
      var t = (h - h0) / (h1 - h0);
      for (var i = i0; i <= i1; i++) { buf[i] = ra.rough[i] + t * (rb.rough[i] - ra.rough[i]); }
      return meanAbs(buf, i0, i1);
    };
    // Ternary search needs only convexity, not a differentiable response.
    for (var it = 0; it < 48; it++) {
      var l = lo + (hi - lo) / 3, r = hi - (hi - lo) / 3;
      if (at(l) <= at(r)) { hi = r; } else { lo = l; }
    }
    var hm = (lo + hi) / 2, min = at(hm), left = at(h0), right = at(h1);
    if (left <= min) { hm = h0; min = left; }
    if (right <= min) { hm = h1; min = right; }
    var max = Math.max(left, right), tol = 1e-9, height;
    if (target < min - tol) { height = hm; }
    else if (target > max + tol) { height = left >= right ? h0 : h1; }
    else {
      var roots = [];
      [[h0, hm, left], [h1, hm, right]].forEach(function (side) {
        if (side[2] + tol < target) { return; }
        var outer = side[0], inner = side[1];
        for (var k = 0; k < 48; k++) {
          var mid = (outer + inner) / 2;
          if (at(mid) > target) { outer = mid; } else { inner = mid; }
        }
        roots.push((outer + inner) / 2);
      });
      roots.sort(function (a, b) { return Math.abs(a - spec.height) - Math.abs(b - spec.height); });
      height = roots.length ? roots[0] : hm;
    }
    return { height: height, Ra: at(height), target: target, minRa: min, maxRa: max,
      achievable: target >= min - tol && target <= max + tol };
  }

  function heightForRa(spec, dir, lc, target) { return solveHeightForRa(spec, dir, lc, target).height; }

  return {
    ALPHA: ALPHA,
    CUTOFFS: CUTOFFS,
    PER_CUTOFF: PER_CUTOFF,
    SECTIONS: SECTIONS,
    MARGIN: MARGIN,
    weights: weights,
    meanLineShare: meanLineShare,
    trace: trace,
    samplesPerCutoff: samplesPerCutoff,
    meanLine: meanLine,
    analyse: analyse,
    measure: measure,
    heightForRa: heightForRa,
    solveHeightForRa: solveHeightForRa
  };
});
