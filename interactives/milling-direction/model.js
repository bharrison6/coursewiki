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

   THE CHIP, from slice to flight (chips()). Two shapes, kept apart on
   purpose:
     slice    the layer of work the tooth has swept so far, in place. Its
              thickness is the lesson, so it is drawn true to the model.
     chip     where that metal actually goes. It forms at the cutting edge,
              slides down the rake face and curls in the gullet of the
              shared cutter drawing (cutter-geometry), riding round with
              the tooth. Material cut first is furthest along the curl, so
              a climb chip carries its thick end at the curl's tip and a
              conventional chip at its root. When the tooth leaves the work
              the finished chip is let go: same shape, same place, same
              velocity at that instant, then it speeds up, lifts away from
              the work and spins as it fades.
   The chip is an illustration, not a simulation. It is drawn shorter and
   thinner than the slice (real chips come off shorter and THICKER) so that
   it fits the flute at a feed exaggerated many times over; when a heavy
   feed leaves less room, the curl is drawn tighter rather than through
   metal. No force, heat or fluid model is implied by its path. Everything
   is a pure function of time, so pausing, stepping and dragging show
   exactly the frame playback would.
   ==========================================================================*/
(function (root, factory) {
  var cutter = (typeof module === 'object' && module.exports)
    ? require('../cutter-geometry/cutter.js')
    : root.CourseWikiCutter;
  var api = factory(cutter);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiMillingDirection = api;
})(typeof self !== 'undefined' ? self : this, function (Cutter) {
  'use strict';
  if (!Cutter || typeof Cutter.geometry !== 'function') {
    throw new Error('milling-direction needs the cutter-geometry module loaded first');
  }

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
      mode: mode, T: t, params: q,
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

  /* ------------------------------------------------------------------
     The work as one closed outline (math coordinates): the uncut layer on
     the incoming side, the cut boundary, the finished surface and a block
     below it. The drawing fills exactly this, and the chip is kept out of
     exactly this.
     ------------------------------------------------------------------ */
  function workOutline(f, halfWidth, depth) {
    var s = f.side, W = halfWidth, b = f.boundary;
    var crest = b[b.length - 1], bottom = b[0], base = f.finished - depth;
    return [{ x: s * W, y: f.stockTop }, crest].concat(b.slice().reverse())
      .concat([bottom, { x: -s * W, y: f.finished }, { x: -s * W, y: base }, { x: s * W, y: base }]);
  }

  function insidePolygon(p, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  /* How far inside a polygon a point is (0 when outside). */
  function depthInside(p, poly) {
    if (!insidePolygon(p, poly)) return 0;
    var best = Infinity;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
      var t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L, 0, 1);
      best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
    }
    return best;
  }

  /* ------------------------------------------------------------------
     Chips. See the header for what is and is not claimed.
     ------------------------------------------------------------------ */
  var CHIP = {
    length: 0.6,     // chip length as a fraction of the slice's length along the edge
    thick: 0.75,     // chip thickness as a fraction of the slice's, before fitting
    tighten: 0.5,    // the curl closes to this fraction of its starting radius over half a turn
    samples: 36,
    carry: 0.6,      // tooth periods the finished chip rides the flute, sliding out
    clear: 1.05,     // ... until its innermost point is this far out, as a fraction of R
    flight: 1.0      // tooth periods from release until it has faded out
  };

  function rotate(p, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
  }

  var fluteCache = {};
  /* The shared cutter's flute in front of a tooth sitting at psi = 0. */
  function canonicalFlute(R, N) {
    var key = R + '/' + N;
    if (!fluteCache[key]) {
      var teeth = [];
      for (var i = 0; i < N; i++) teeth.push({ psi: i * 2 * Math.PI / N });
      fluteCache[key] = Cutter.geometry({ radius: R, teeth: teeth }).flutes[0];
    }
    return fluteCache[key];
  }

  /* Chip outline for a tooth `progress` through its cut, with the tooth at
     psi = 0. `curl` (0..1] scales the curl radius; `thin` the thickness. */
  function chipLocal(mode, q, progress, curl, thin) {
    var R = q.R, kappa = engagementAngle(q.aeOverD), fl = canonicalFlute(R, q.teeth);
    var swept = clamp(progress, 0, 1) * kappa;
    var L = CHIP.length * R * swept;
    if (L < 1e-6) return null;
    var faceLen = Math.hypot(fl.face.x - fl.tip.x, fl.face.y - fl.tip.y);
    var rho0 = fl.gullet.r * curl;
    var heading = Math.atan2(fl.faceDir.y, fl.faceDir.x);
    var n = CHIP.samples, ds = L / n, back = [], free = [], along = [];
    var pos = { x: fl.tip.x, y: fl.tip.y };
    for (var i = 0; i <= n; i++) {
      var s = i * ds;
      if (i > 0) {
        // Straight down the rake face, then curling away from it into the
        // flute, tighter as it goes.
        var x = s - ds / 2 - faceLen, turn = 0;
        if (x > 0) turn = ds / (rho0 * Math.max(CHIP.tighten, 1 - (1 - CHIP.tighten) * x / (Math.PI * rho0)));
        var mid = heading + turn / 2;
        pos = { x: pos.x + ds * Math.cos(mid), y: pos.y + ds * Math.sin(mid) };
        heading += turn;
      }
      // Metal now at s was cut when the tooth had swept s / (length * R) less.
      var formed = (swept - s / (CHIP.length * R)) / kappa;
      var t = thin * q.fz * chipThicknessRatio(contactAngle(mode, kappa, clamp(formed, 0, 1)));
      var nx = -Math.sin(heading), ny = Math.cos(heading);
      back.push({ x: pos.x, y: pos.y });
      free.push({ x: pos.x + nx * t, y: pos.y + ny * t });
      along.push(s);
    }
    return { points: back.concat(free.slice().reverse()), along: along.concat(along.slice().reverse()), length: L };
  }

  var fitCache = {};
  /* Chip points inside the work anywhere in the cut, leaving out only the
     root, where the chip is still being sheared off the work. A point
     counts once it is more than 1% of the radius inside: the work's cut
     boundary is itself drawn as straight segments, and a point a fraction
     of a pixel past one of those chords has not entered metal. */
  function chipOverlap(mode, q, curl, thin) {
    var count = 0, span = engagementAngle(q.aeOverD) / (2 * Math.PI / q.teeth);
    for (var j = 1; j <= 24; j++) {
      // Stop a hair short of the exit: at full width the next tooth enters
      // at that same instant, and the frame would belong to it.
      var p = Math.min(j / 24, 1 - 1e-6), f = frame(mode, q, p * span);
      var c = chipLocal(mode, q, p, curl, thin);
      if (!c) continue;
      var poly = workOutline(f, 4 * q.R, q.R), root = f.ratio * q.fz * 1.15 + 0.02 * q.R;
      for (var i = 0; i < c.points.length; i++) {
        if (c.along[i] > root && depthInside(rotate(c.points[i], f.teeth[0].psi), poly) > 0.01 * q.R) count++;
      }
    }
    return count;
  }

  /* The roomiest curl that keeps out of the work at every point of the cut.
     Found once per setting, so the chip never changes shape as it grows. */
  function chipFit(mode, q) {
    var key = [mode, q.R, q.aeOverD, q.fz, q.teeth].join('/');
    if (fitCache[key]) return fitCache[key];
    var H = q.fz * peakChipRatio(q.aeOverD);
    var rhoMin = canonicalFlute(q.R, q.teeth).gullet.r * CHIP.tighten;
    // Prefer a full curl at full thickness; give up thickness before curl.
    var best = null;
    search:
    for (var scale = 1; scale > 0.3; scale -= 0.15) {
      for (var curl = 1; curl > 0.25; curl -= 0.1) {
        // No thicker than the tightest part of the curl can hold.
        var thin = scale * Math.min(CHIP.thick, 0.95 * rhoMin * curl / Math.max(H, 1e-9));
        var over = chipOverlap(mode, q, curl, thin);
        if (!best || over < best.overlap) best = { curl: curl, thin: thin, overlap: over };
        if (!over) break search;
      }
    }
    fitCache[key] = best;
    return best;
  }

  /* Every chip in view at time T: the one forming on the cutting tooth, and
     those already let go, each with its age (0 at release, 1 gone). */
  function chips(mode, params, T) {
    checkMode(mode);
    var q = normalise(params);
    var t = typeof T === 'number' && isFinite(T) ? T : 0;
    var fit = chipFit(mode, q);
    var f = frame(mode, q, t);
    var place = function (c, psi) { return c ? c.points.map(function (p) { return rotate(p, psi); }) : null; };
    var out = { attached: null, released: [] };
    if (f.engaged) {
      var c = chipLocal(mode, q, f.progress, fit.curl, fit.thin);
      if (c) out.attached = { points: place(c, f.teeth[0].psi), root: f.contact };
    }
    var pitch = 2 * Math.PI / q.teeth;
    var span = engagementAngle(q.aeOverD) / pitch;
    var done = place(chipLocal(mode, q, 1, fit.curl, fit.thin), f.exitPsi);
    if (!done) return out;
    var c0 = { x: 0, y: 0 };
    done.forEach(function (p) { c0.x += p.x / done.length; c0.y += p.y / done.length; });
    // Carried in the flute, sliding out along the rake face until its
    // innermost point is clear of the cutting circle, then straight on at
    // the velocity it has at that moment.
    var fd = rotate(canonicalFlute(q.R, q.teeth).faceDir, f.exitPsi), u = { x: -fd.x, y: -fd.y };
    var inner = Infinity;
    done.forEach(function (p) { inner = Math.min(inner, p.x * u.x + p.y * u.y); });
    var w = -pitch;                                   // clockwise, radians per tooth period
    var need = Math.max(0, CHIP.clear * q.R - inner), tc = CHIP.carry, A = need / (tc * tc);
    var Pc = rotate({ x: c0.x + u.x * need, y: c0.y + u.y * need }, w * tc);
    var slideV = rotate({ x: u.x * 2 * A * tc, y: u.y * 2 * A * tc }, w * tc);
    var Vc = { x: -w * Pc.y + slideV.x, y: w * Pc.x + slideV.y };
    var first = Math.floor(t - span - CHIP.flight) + 1, last = Math.floor(t - span);
    for (var k = last; k >= first; k--) {
      var tau = t - (k + span);
      if (tau <= 0 || tau >= CHIP.flight) continue;
      var pts;
      if (tau <= tc) {
        var slide = A * tau * tau;
        pts = done.map(function (p) { return rotate({ x: p.x + u.x * slide, y: p.y + u.y * slide }, w * tau); });
      } else {
        var dt = tau - tc;
        pts = done.map(function (p) {
          var r = rotate({ x: p.x - c0.x, y: p.y - c0.y }, w * tau);   // still spinning at the cutter's rate
          return { x: Pc.x + Vc.x * dt + r.x, y: Pc.y + Vc.y * dt + r.y };
        });
      }
      out.released.push({ age: tau / CHIP.flight, carried: tau <= tc, points: pts });
    }
    return out;
  }

  return {
    MODES: MODES,
    CHIP: CHIP,
    workOutline: workOutline,
    insidePolygon: insidePolygon,
    depthInside: depthInside,
    chips: chips,
    chipFit: chipFit,
    chipLocal: chipLocal,
    chipOverlap: chipOverlap,
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
