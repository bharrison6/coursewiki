/* ============================================================================
   cutter-geometry / cutter.js - one drawing of a fluted end mill, shared by
   every machining demo that shows a cutter.

   WHAT IS DRAWN. A slice straight across the fluted part of an end mill,
   seen looking down its axis from the spindle. From there a standard
   right-hand cutter turns clockwise, which is why the demos spin it that
   way. Because it is a cut through solid tool steel, the body carries the
   section hatching a drawing would give it.

   Each tooth, walking from its cutting tip against the rotation:
     cutting edge   the tip, at the cutter radius - the only point that
                    touches the finished surface
     margin         a very short land at full radius behind the edge
     clearance      two ground flats falling away from the circle, so the
                    tooth's back never rubs the surface it has just cut
     heel           where the back of the tooth turns down into the next
                    flute
   and in front of each edge, in the direction it turns:
     rake face      a nearly radial face the chip slides along, leaned back
                    a few degrees (positive rake)
     gullet         the rounded valley the chip curls in; its floor is the
                    core, the solid centre that gives the tool its stiffness

   Proportions are illustrative and stated in one place, profile(). More
   flutes means a thicker core and shallower valleys: a stiffer tool with
   less room for chips. Nothing here is a manufacturer's dimension.

   API (browser global CourseWikiCutter, or CommonJS):
     render({ radius, teeth, idPrefix })  -> '<g ...>...</g>' SVG fragment,
         centred on the origin, in SVG screen coordinates (y down).
     geometry({ radius, teeth })          -> the same outline as numbers.
     profile(n)                           -> proportions for n flutes.
   teeth is [{ psi, engaged }, ...]: psi is the angle of a cutting tip in
   radians, mathematical convention (x right, y up, counter-clockwise
   positive). Each cutting tip lands exactly at radius and psi. Teeth may be
   unevenly spaced. Pure and deterministic: no DOM, no clock.
   ==========================================================================*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiCutter = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TAU = 2 * Math.PI;

  /* Proportions for an n-flute cutter, as fractions of the radius unless
     named as an angle. */
  function profile(n) {
    var k = Math.max(1, Math.round(n) || 1);
    var core = k <= 2 ? 0.52 : (k === 3 ? 0.56 : (k === 4 ? 0.6 : (k === 5 ? 0.63 : (k === 6 ? 0.66 : 0.68))));
    return {
      flutes: k,
      core: core,                                // core radius / radius
      faceRoot: core + 0.55 * (1 - core),        // where the flat rake face meets the gullet
      rake: 8 * Math.PI / 180,                   // radial rake angle
      margin: 0.025,                             // margin width, radians
      primary: 0.14,                             // end of primary relief, radians (capped per gap)
      primaryDrop: 0.03,                         // primary relief falls this far below the radius
      heel: k <= 2 ? 0.36 : (k === 3 ? 0.42 : 0.48), // heel position, fraction of the gap behind the edge
      heelDrop: 0.08                             // heel sits this far below the radius
    };
  }

  function pol(r, a) { return { x: r * Math.cos(a), y: r * Math.sin(a) }; }
  function add(p, q, k) { return { x: p.x + q.x * k, y: p.y + q.y * k }; }
  function len(p) { return Math.hypot(p.x, p.y); }
  function unit(p) { var l = len(p) || 1; return { x: p.x / l, y: p.y / l }; }
  function mod(a, m) { var r = a % m; return r < 0 ? r + m : r; }

  function check(opts) {
    var o = opts || {};
    if (!(o.radius > 0) || !isFinite(o.radius)) throw new Error('cutter radius must be a positive number');
    if (!Array.isArray(o.teeth) || !o.teeth.length) throw new Error('cutter needs at least one tooth');
    o.teeth.forEach(function (t) {
      if (!t || typeof t.psi !== 'number' || !isFinite(t.psi)) throw new Error('every tooth needs a finite psi');
    });
    return o;
  }

  /* The rake face and gullet in front of the tooth at angle b, whose
     neighbour ahead (in the direction of rotation) sits a gap g earlier. */
  function flute(R, P, b, g) {
    var u = pol(1, b), w = { x: -u.y, y: u.x };          // radial out, counter-clockwise
    var tip = pol(R, b);
    // Lean the face back against the rotation by the rake angle.
    var d = add({ x: -u.x * Math.cos(P.rake), y: -u.y * Math.cos(P.rake) }, w, Math.sin(P.rake));
    var face = add(tip, d, R * (1 - P.faceRoot) / Math.cos(P.rake));
    var ahead = { x: -d.y, y: d.x };                     // left of d: the way the tooth turns
    var rc = R * P.core;
    // Gullet: a circle tangent to the face whose floor just touches the core.
    var lo = 0, hi = 3 * R;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (len(add(face, ahead, mid)) - mid > rc) lo = mid; else hi = mid;
    }
    var rho = (lo + hi) / 2;
    var centre = add(face, ahead, rho);
    var floor = add(centre, unit(centre), -rho);
    return { psi: b, gap: g, tip: tip, faceDir: d, ahead: ahead, face: face,
      gullet: { x: centre.x, y: centre.y, r: rho }, floor: floor };
  }

  /* Outline points walking counter-clockwise from tooth A (angle a) to the
     next tooth B. Ends just before B's tip; B's segment starts with it. */
  function gapPoints(R, P, a, fl) {
    var g = fl.gap, pts = [], i;
    var m = Math.min(P.margin, 0.08 * g), p = Math.min(P.primary, 0.3 * P.heel * g);
    pts.push(pol(R, a));
    for (i = 1; i <= 3; i++) pts.push(pol(R, a + m * i / 3));
    // Relief: a quick primary drop, then a slow fall to the heel, so the
    // back of the tooth stays clear of the circle the edge cuts.
    var heelA = a + P.heel * g, span = heelA - a - m;
    for (i = 1; i <= 16; i++) {
      var x = i / 16, th = a + m + span * x, ang = th - a - m;
      var drop = P.primaryDrop * Math.min(1, ang / (p - m)) + (P.heelDrop - P.primaryDrop) * Math.max(0, (ang - (p - m)) / (span - (p - m)));
      pts.push(pol(R * (1 - drop), th));
    }
    var heel = pts[pts.length - 1];
    // Heel rounds down into the gullet floor, level at both ends so it
    // meets the relief and the gullet without a kink.
    var rh = len(heel), rf = len(fl.floor);
    var fa = heelA + mod(Math.atan2(fl.floor.y, fl.floor.x) - heelA, TAU);
    for (i = 1; i <= 16; i++) {
      var t = i / 16, e = t * t * (3 - 2 * t);
      pts.push(pol(rh + (rf - rh) * e, heelA + (fa - heelA) * t));
    }
    // Up the gullet arc to the foot of the rake face.
    var C = fl.gullet, b0 = Math.atan2(fl.floor.y - C.y, fl.floor.x - C.x);
    var b1 = Math.atan2(fl.face.y - C.y, fl.face.x - C.x);
    var db = mod(b1 - b0 + Math.PI, TAU) - Math.PI;
    for (i = 1; i <= 14; i++) pts.push(add(C, pol(C.r, b0 + db * i / 14), 1));
    return pts;                                                  // the face runs straight on to B
  }

  function geometry(opts) {
    var o = check(opts), R = o.radius, P = profile(o.teeth.length);
    var order = o.teeth.map(function (t, i) { return { psi: t.psi, i: i, engaged: !!t.engaged }; })
      .sort(function (p, q) { return mod(p.psi, TAU) - mod(q.psi, TAU); });
    var n = order.length, flutes = new Array(n), outline = [];
    for (var j = 0; j < n; j++) {
      var cur = order[j], prev = order[(j + n - 1) % n];
      var g = n === 1 ? TAU : mod(cur.psi - prev.psi, TAU);
      if (g < 1e-6) throw new Error('two teeth share one angle');
      flutes[cur.i] = flute(R, P, cur.psi, g);
    }
    for (j = 0; j < n; j++) {
      var a = order[j], next = order[(j + 1) % n];
      var fl = flutes[next.i];
      outline = outline.concat(gapPoints(R, P, a.psi, fl));
    }
    return {
      radius: R, profile: P, core: R * P.core,
      tips: o.teeth.map(function (t) { return { psi: t.psi, x: R * Math.cos(t.psi), y: R * Math.sin(t.psi), engaged: !!t.engaged }; }),
      flutes: flutes,
      outline: outline
    };
  }

  function num(v) { var r = Math.round(v * 100) / 100; return (r === 0 ? 0 : r).toString(); }
  function sp(p) { return num(p.x) + ' ' + num(-p.y); }           // math y-up to SVG y-down
  function poly(pts) {
    var d = 'M' + sp(pts[0]);
    for (var i = 1; i < pts.length; i++) d += 'L' + sp(pts[i]);
    return d + 'Z';
  }

  function render(opts) {
    var o = check(opts);
    var id = String(o.idPrefix || '');
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) throw new Error('idPrefix must start with a letter and use only letters, digits, - and _');
    var G = geometry(o), R = G.radius;
    var hatch = Math.max(3, R * 0.07);
    var body = poly(G.outline);
    var out = ['<g class="cw-cutter">'];
    out.push('<defs>' +
      '<radialGradient id="' + id + '-steel" cx="0.38" cy="0.32" r="0.75">' +
      '<stop offset="0" class="cw-cutter-steel-hi"/><stop offset="1" class="cw-cutter-steel-lo"/></radialGradient>' +
      '<pattern id="' + id + '-hatch" patternUnits="userSpaceOnUse" width="' + num(hatch) + '" height="' + num(hatch) +
      '" patternTransform="rotate(45)"><path class="cw-cutter-hatch-line" d="M0 0V' + num(hatch) + '"/></pattern>' +
      '</defs>');
    out.push('<path class="cw-cutter-body" fill="url(#' + id + '-steel)" d="' + body + '"/>');
    out.push('<path class="cw-cutter-hatch" fill="url(#' + id + '-hatch)" d="' + body + '"/>');
    // The cutting edge of each tooth: down the rake face, round the tip and
    // along the margin.
    G.flutes.forEach(function (fl, i) {
      var m = Math.min(G.profile.margin, 0.08 * fl.gap);
      var edge = [fl.face, fl.tip, { x: R * Math.cos(fl.psi + m), y: R * Math.sin(fl.psi + m) }];
      out.push('<path class="cw-cutter-edge' + (G.tips[i].engaged ? ' is-engaged' : '') + '" d="M' +
        sp(edge[0]) + 'L' + sp(edge[1]) + 'L' + sp(edge[2]) + '"/>');
    });
    // Drafting centre mark: the axis, not a hole.
    var c = R * 0.12;
    out.push('<path class="cw-cutter-axis" d="M' + num(-c) + ' 0H' + num(c) + 'M0 ' + num(-c) + 'V' + num(c) + '"/>');
    out.push('</g>');
    return out.join('');
  }

  return { render: render, geometry: geometry, profile: profile };
});
