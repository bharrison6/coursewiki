/* ============================================================================
   milling-direction / model.js - the geometry of one cutter tooth taking its
   chip in peripheral milling, in climb and in conventional direction.

   Pure and deterministic: no DOM, no clock. demo.js draws whatever this
   returns, and the Node tests call the same functions.

   FRAME OF REFERENCE - one convention, used everywhere:
     Looking along the cutter's axis. The cutter centre stays at the origin
     and the cutter turns CLOCKWISE in both modes. The WORKPIECE is fed past
     it, so every arrow labelled "feed" is the work's motion. Math axes:
     x to the right, y up. The finished surface is the line y = -R.

     climb         the work arrives from the right and feeds left (-x)
     conventional  the work arrives from the left and feeds right (+x)

   With the rotation held the same, reversing the feed is the whole
   difference between the two. A clockwise tooth on the right side of the
   cutter moves down (enters at the top surface, leaves at the finished
   surface); on the left side it moves up (enters at the finished surface,
   leaves at the top).

   ANGLES. psi is the ordinary polar angle of a tooth tip. phi is the angle
   of that tip measured from the bottom ray (psi = -90 deg) toward the side
   the work comes from; it runs 0..kappa across the cut.

   TIME. T counts tooth periods: T = 1 is the cutter turning one tooth pitch,
   during which the work advances one feed per tooth (fz).

   THE MATERIAL BOUNDARY, exactly. A point of the work last touched by a
   tooth tip at polar angle psi was at R*u(psi) at that moment and has moved
   with the work since. If the most recent tooth passed that ray Delta
   radians ago, the work has advanced fz*Delta/pitch in the feed direction,
   so the cut surface sits at  B(psi) = R*u(psi) + fz*(Delta/pitch)*feed.
   That is the trochoid the tooth leaves in the work, with no small-feed
   approximation. The step it has at the engaged tooth is the chip
   thickness at the cutting edge at that instant.

   The chip-thickness READOUT uses the standard approximation
   h = fz * sin(phi), good when fz is much smaller than R - which it always
   is on a real machine. The drawing uses the exact boundary, so the two
   are tested against each other.
   ==========================================================================*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiMillingDirection = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MODES = ['climb', 'conventional'];
  var HALF_PI = Math.PI / 2;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* Positive remainder, so an angle just behind a tooth reads as nearly a
     full pitch rather than as a small negative number. */
  function mod(a, m) { var r = a % m; return r < 0 ? r + m : r; }

  function checkMode(mode) {
    if (MODES.indexOf(mode) < 0) throw new Error('mode must be climb or conventional, not ' + mode);
    return mode;
  }

  /* +1: the work arrives from the +x side (climb). -1: from -x (conventional). */
  function incomingSide(mode) { return checkMode(mode) === 'climb' ? 1 : -1; }

  /* Unit vector of the work's feed motion. */
  function feedDirection(mode) { return { x: -incomingSide(mode), y: 0 }; }

  /* Angle of tooth contact, from radial depth of cut over diameter.
     A tooth is in the work over kappa = acos(1 - 2 ae/D). */
  function engagementAngle(aeOverD) {
    var r = clamp(aeOverD, 0, 1);
    return Math.acos(1 - 2 * r);
  }

  /* Thickest chip as a fraction of feed per tooth. Below half the diameter
     the tooth never reaches 90 degrees, so the chip never gets as thick as
     the feed - the effect machinists call chip thinning. */
  function peakChipRatio(aeOverD) {
    var k = engagementAngle(aeOverD);
    return k >= HALF_PI ? 1 : Math.sin(k);
  }

  /* h / fz at contact angle phi (small-feed approximation). */
  function chipThicknessRatio(phi) { return Math.max(0, Math.sin(phi)); }

  /* Contact angle for a tooth `progress` (0 = entering, 1 = leaving) of the
     way through its cut. Climb starts at the top of the cut and runs down to
     the finished surface; conventional runs the other way. */
  function contactAngle(mode, kappa, progress) {
    var p = clamp(progress, 0, 1);
    return checkMode(mode) === 'climb' ? kappa * (1 - p) : kappa * p;
  }

  /* The whole thickness profile of one chip, sampled entry to exit. */
  function thicknessProfile(mode, aeOverD, samples) {
    var n = Math.max(2, samples | 0), k = engagementAngle(aeOverD), out = [];
    for (var i = 0; i < n; i++) {
      var p = i / (n - 1);
      out.push({ progress: p, ratio: chipThicknessRatio(contactAngle(mode, k, p)) });
    }
    return out;
  }

  /* Polar angle of the ray at contact angle phi on this mode's side. */
  function psiAt(mode, phi) { return -HALF_PI + incomingSide(mode) * phi; }

  /* Ray angle where a tooth enters the work. */
  function entryPsi(mode, kappa) { return checkMode(mode) === 'climb' ? -HALF_PI + kappa : -HALF_PI; }

  /* Direction a clockwise tooth tip is moving at polar angle psi. The pull
     of the cut on the work points broadly this way; only its direction is
     used, never a magnitude. */
  function toothVelocity(psi) { return { x: Math.sin(psi), y: -Math.cos(psi) }; }

  /* Which way the cut pulls on the work, in words the page uses. */
  function forceSense(mode, psi) {
    var v = toothVelocity(psi), f = feedDirection(mode);
    return {
      along: v.x * f.x > 0 ? 'with-feed' : 'against-feed',
      vertical: Math.abs(v.y) < 1e-6 ? 'level' : (v.y < 0 ? 'down' : 'up')
    };
  }

  /* Parameters with their legal ranges applied. R and fz are in drawing
     units; fz is shown exaggerated so a chip is visible at all. */
  function normalise(params) {
    var p = params || {};
    return {
      R: p.R > 0 ? p.R : 100,
      aeOverD: clamp(typeof p.aeOverD === 'number' ? p.aeOverD : 0.25, 0.05, 0.5),
      fz: clamp(typeof p.fz === 'number' ? p.fz : 18, 2, 40),
      teeth: clamp(Math.round(p.teeth || 4), 2, 8)
    };
  }

  /* Where the tool and the work are at time T, everything a drawing needs.
     Coordinates are math-orientation (y up), origin at the cutter centre. */
  function frame(mode, params, T) {
    checkMode(mode);
    var q = normalise(params);
    var R = q.R, fz = q.fz, N = q.teeth;
    var pitch = 2 * Math.PI / N;
    var kappa = engagementAngle(q.aeOverD);
    var s = incomingSide(mode);
    var feed = feedDirection(mode);
    var t = typeof T === 'number' && isFinite(T) ? T : 0;
    var cycle = mod(t, 1);
    var psiEntry = entryPsi(mode, kappa);
    // The tooth that entered at the start of this cycle; clockwise, so its
    // angle falls as time runs.
    var psiLead = psiEntry - cycle * pitch;
    var engagedSpan = kappa / pitch;          // fraction of a cycle spent cutting
    var engaged = cycle <= engagedSpan + 1e-12;
    var progress = engaged ? clamp(cycle / engagedSpan, 0, 1) : null;

    var teeth = [];
    for (var i = 0; i < N; i++) {
      var a = psiLead + i * pitch;
      teeth.push({ psi: a, engaged: engaged && i === 0 });
    }

    function boundaryAt(psi, extraPitches) {
      var delta = mod(psi - psiLead, pitch) + (extraPitches || 0) * pitch;
      var d = fz * delta / pitch;
      return { x: R * Math.cos(psi) + d * feed.x, y: R * Math.sin(psi) + d * feed.y };
    }

    // Cut surface across the engaged sector, from the finished surface (phi
    // = 0) up to the top of the stock (phi = kappa). At the engaged tooth the
    // surface steps from just-cut to not-yet-cut; both points are emitted.
    var STEPS = 48, boundary = [];
    var phiLead = engaged ? s * (psiLead + HALF_PI) : null;
    for (var j = 0; j <= STEPS; j++) {
      var phi = kappa * j / STEPS;
      var nextPhi = kappa * (j + 1) / STEPS;
      if (phiLead === null || Math.abs(phi - phiLead) > 1e-9) boundary.push(boundaryAt(psiAt(mode, phi)));
      if (phiLead !== null && phi - 1e-9 <= phiLead && phiLead < nextPhi - 1e-9) {
        // Either side of the tooth, walking up from the finished surface.
        boundary.push(boundaryAt(psiAt(mode, phiLead - 1e-9)), boundaryAt(psiAt(mode, phiLead + 1e-9)));
      }
    }

    // The chip this tooth has cut so far: between the surface it is leaving
    // behind and the surface the previous tooth left, over the rays it has
    // already swept.
    var chip = null, chipFull = null;
    if (engaged) {
      chip = chipPolygon(psiLead, psiEntry);
      chipFull = arcPoints(psiEntry, psiAt(mode, climbOrder(mode) ? 0 : kappa), 32, R);
    }

    function chipPolygon(fromPsi, toPsi) {
      var inner = [], outer = [], M = 32;
      if (Math.abs(toPsi - fromPsi) < 1e-9) return null;
      for (var k = 0; k <= M; k++) {
        var a = fromPsi + (toPsi - fromPsi) * k / M;
        inner.push(boundaryAt(a));
        outer.push(boundaryAt(a, 1));
      }
      // At the tooth tip itself the just-cut surface is the tip.
      inner[0] = { x: R * Math.cos(fromPsi), y: R * Math.sin(fromPsi) };
      outer[0] = { x: inner[0].x + fz * feed.x, y: inner[0].y + fz * feed.y };
      return inner.concat(outer.reverse());
    }

    var phiNow = engaged ? contactAngle(mode, kappa, progress) : null;
    var psiNow = engaged ? psiLead : null;
    var contact = engaged ? { x: R * Math.cos(psiNow), y: R * Math.sin(psiNow) } : null;

    return {
      mode: mode,
      R: R, fz: fz, teeth: teeth, pitch: pitch,
      kappa: kappa, aeOverD: q.aeOverD,
      stockTop: -R + q.aeOverD * 2 * R,
      finished: -R,
      side: s, feed: feed,
      cycle: cycle,
      workAdvance: fz * t,
      engaged: engaged, progress: progress,
      phi: phiNow,
      ratio: engaged ? chipThicknessRatio(phiNow) : 0,
      contact: contact,
      force: engaged ? forceSense(mode, psiNow) : null,
      velocity: engaged ? toothVelocity(psiNow) : null,
      entryPsi: psiEntry,
      exitPsi: psiAt(mode, climbOrder(mode) ? 0 : kappa),
      entry: { x: R * Math.cos(psiEntry), y: R * Math.sin(psiEntry) },
      exit: (function () { var e = psiAt(mode, climbOrder(mode) ? 0 : kappa); return { x: R * Math.cos(e), y: R * Math.sin(e) }; })(),
      boundary: boundary,
      chip: chip,
      edgePath: chipFull
    };
  }

  /* Climb sweeps phi downward (kappa -> 0); conventional upward (0 -> kappa). */
  function climbOrder(mode) { return mode === 'climb'; }

  function arcPoints(fromPsi, toPsi, n, r) {
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var a = fromPsi + (toPsi - fromPsi) * i / n;
      pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
    return pts;
  }

  /* Exact radial chip thickness at the edge of the engaged tooth, read off
     the step in the boundary. Used by the tests to hold the readout to the
     drawing. */
  function radialStep(f) {
    if (!f.engaged) return 0;
    var psi = f.teeth[0].psi;
    var ux = Math.cos(psi), uy = Math.sin(psi);
    // Uncut surface ahead of the tooth lies on the circle shifted fz along
    // the feed; intersect the tooth's ray with it.
    var px = f.fz * f.feed.x, py = f.fz * f.feed.y;
    var b = ux * px + uy * py;
    var c = px * px + py * py - f.R * f.R;
    var tRay = b + Math.sqrt(b * b - c);
    return f.R - tRay;
  }

  /* Time (in tooth periods) at which the lead tooth is `progress` of the way
     through its cut, in the cycle that contains T. */
  function timeAtProgress(params, T, progress) {
    var q = normalise(params);
    var span = engagementAngle(q.aeOverD) / (2 * Math.PI / q.teeth);
    var base = Math.floor(typeof T === 'number' && isFinite(T) ? T : 0);
    return base + clamp(progress, 0, 1) * span;
  }

  return {
    MODES: MODES,
    clamp: clamp,
    normalise: normalise,
    incomingSide: incomingSide,
    feedDirection: feedDirection,
    engagementAngle: engagementAngle,
    peakChipRatio: peakChipRatio,
    chipThicknessRatio: chipThicknessRatio,
    contactAngle: contactAngle,
    thicknessProfile: thicknessProfile,
    toothVelocity: toothVelocity,
    forceSense: forceSense,
    frame: frame,
    radialStep: radialStep,
    timeAtProgress: timeAtProgress
  };
});
