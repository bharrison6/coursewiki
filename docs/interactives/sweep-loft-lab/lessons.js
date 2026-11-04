/* Prediction rounds, target-shape challenges and the static (no-JS / print)
   lessons for the sweep and loft lab. Every verdict is computed from the model
   at run time; nothing here stores an answer the geometry could contradict. */
(function (root, factory) {
  var M = root.CourseWikiSweepLoftModel || (typeof require === 'function' ? require('./model.js') : null);
  var R = root.CourseWikiSweepLoftRender || (typeof require === 'function' ? require('./render.js') : null);
  var api = factory(M, R);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.CourseWikiSweepLoftLessons = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, R) {
  'use strict';
  var fmt = M.fmt, esc = R.esc;
  function sweepParams(patch) { var p = M.defaults(); Object.keys(patch).forEach(function (k) { p[k] = patch[k]; }); return p; }
  function loftParams(patch) {
    var p = M.loftDefaults();
    if (patch.order) p.order = patch.order.slice();
    if (patch.starts) Object.keys(patch.starts).forEach(function (k) { p.starts[k] = patch.starts[k]; });
    return p;
  }

  /* ---------- sweep predictions ---------- */
  var SWEEP_CHOICES = [
    { id: 'clean', label: 'Builds cleanly' },
    { id: 'fold', label: 'Folds at a tight bend' },
    { id: 'coil', label: 'Neighbouring coils collide' }
  ];
  var SWEEP_ROUNDS = [
    { id: 'arc-small', text: 'A Ø16 mm round rod around an arc of radius 12 mm.', params: sweepParams({ path: 'arc', shape: 'circle', size: 16, bend: 12 }) },
    { id: 'arc-large', text: 'A Ø30 mm round rod around the same 12 mm arc.', params: sweepParams({ path: 'arc', shape: 'circle', size: 30, bend: 12 }) },
    { id: 'arc-bar', text: 'A 30 × 15 mm bar around the same 12 mm arc, turned so its 15 mm side lies across the bend.', params: sweepParams({ path: 'arc', shape: 'rectangle', size: 30, turned: true, bend: 12 }) },
    { id: 's-curve', text: 'A Ø20 mm rod along an S-curve whose tightest bend radius is 8 mm.', params: sweepParams({ path: 's-curve', shape: 'circle', size: 20, bend: 8 }) },
    { id: 'helix', text: 'A Ø20 mm wire wound into a helix: coil radius 30 mm, pitch 16 mm.', params: sweepParams({ path: 'helix', shape: 'circle', size: 20, bend: 30, pitch: 16 }) }
  ];
  /* Outcomes the lab can establish. A passing local test with no established global
     clearance has no gradable outcome: the lab must not call it clean. */
  function sweepOutcomes(result) {
    var set = [];
    if (result.summary.state !== 'clear') set.push('fold');
    if (result.coil && result.coil.touches) set.push('coil');
    if (!set.length && result.overall === 'builds') set.push('clean');
    return set;
  }
  function gradeSweep(round, choice) {
    var result = M.sweep(round.params), actual = sweepOutcomes(result), v = R.sweepVerdict(result);
    if (!actual.length) return { correct: null, ungraded: true, actual: actual, result: result, text: 'Not graded: ' + v.title + '. ' + v.text + (v.coil ? ' ' + v.coil.text : '') };
    var correct = actual.indexOf(choice) >= 0;
    var text = v.title + '. ' + v.text + (v.coil ? ' ' + v.coil.text : '');
    if (actual.length > 1 && correct) text = 'Accepted: this one fails both ways. ' + text;
    return { correct: correct, actual: actual, result: result, text: text };
  }

  /* ---------- loft predictions ---------- */
  var LOFT_CHOICES = [
    { id: 'matched', label: 'Same shape as now' },
    { id: 'twisted', label: 'Twisted; no checked section crosses itself' },
    { id: 'pinched', label: 'Pinches or crosses itself' },
    { id: 'folded', label: 'Doubles back on itself' }
  ];
  var LOFT_ROUNDS = [
    { id: 'circle-90', text: 'From the matched loft, move the circle’s start point 90° around.', params: loftParams({ starts: { circle: 90 } }) },
    { id: 'circle-180', text: 'From the matched loft, move the circle’s start point 180° around.', params: loftParams({ starts: { circle: 180 } }) },
    { id: 'reversed', text: 'From the matched loft, select the profiles in reverse: slot, circle, square.', params: loftParams({ order: ['slot', 'circle', 'square'] }) },
    { id: 'skip', text: 'From the matched loft, select square, then slot, then circle.', params: loftParams({ order: ['square', 'slot', 'circle'] }) }
  ];
  function gradeLoft(round, choice) {
    var result = M.loft(round.params), v = R.loftVerdict(result), actual = result.summary.state;
    var text = v.title + '. ' + v.text;
    if (round.id === 'reversed') text += ' Reversing every selection builds the same surface from the other end; only the direction of construction changes.';
    return { correct: choice === actual, actual: [actual], result: result, text: text };
  }

  /* ---------- target-shape challenges ---------- */
  var FEATURES = [{ id: 'sweep', label: 'Sweep' }, { id: 'loft', label: 'Loft' }, { id: 'extrude', label: 'Extrude' }];
  var CHALLENGES = [
    {
      id: 'handrail', title: 'U-shaped handrail',
      target: 'One Ø20 mm round section follows a U-shaped centreline with a 30 mm bend radius.',
      current: { kind: 'sweep', params: sweepParams({ path: 'arc', shape: 'circle', size: 20, bend: 8 }) },
      goal: { kind: 'sweep', params: sweepParams({ path: 'arc', shape: 'circle', size: 20, bend: 30 }) },
      feature: 'sweep',
      featureWhy: { sweep: 'Yes: one constant section follows a bent centreline, which is what a sweep states.', loft: 'A loft would need many identical sections placed around the bend; a sweep states “same section along this path” directly.', extrude: 'An extrude only goes in a straight direction; this centreline bends.' },
      fixes: [
        { id: 'radius', text: 'Open the bend radius to 30 mm', params: sweepParams({ path: 'arc', shape: 'circle', size: 20, bend: 30 }), matches: true },
        { id: 'size', text: 'Shrink the rod to Ø12 mm', params: sweepParams({ path: 'arc', shape: 'circle', size: 12, bend: 8 }), matches: false, why: 'It builds, because the 6 mm reach is now inside the 8 mm bend, but it is no longer the Ø20 mm handrail in the target.' },
        { id: 'start', text: 'Move a loft start point', params: null, matches: false, why: 'A sweep has one profile, so there are no loft connectors to move. The failure comes from the bend radius.' }
      ]
    },
    {
      id: 'duct', title: 'Square-to-round duct transition',
      target: 'A duct changes from a 60 mm square, through a Ø44 mm circle, to a 56 × 24 mm slot, with straight, untwisted sides.',
      current: { kind: 'loft', params: loftParams({ starts: { circle: 90 } }) },
      goal: { kind: 'loft', params: loftParams({}) },
      feature: 'loft',
      featureWhy: { loft: 'Yes: the section changes shape at known positions, which is what a loft states.', sweep: 'A basic sweep keeps one section along the path; this section changes from square to round to slot.', extrude: 'An extrude keeps one section along a straight direction; this section changes.' },
      fixes: [
        { id: 'connector', text: 'Move the circle’s start point back to 0° so it lines up with the square and slot', params: loftParams({}), matches: true },
        { id: 'reverse', text: 'Reverse the selection order', params: loftParams({ order: ['slot', 'circle', 'square'], starts: { circle: 90 } }), matches: false, why: 'Reversing the order builds the same surface from the other end. The mismatched connector, and so the twist, stays.' },
        { id: 'radius', text: 'Increase a bend radius', params: null, matches: false, why: 'This loft has no swept bend. The twist comes from which vertices are paired.' }
      ]
    },
    {
      id: 'order', title: 'Three-section transition built out of order',
      target: 'The same square → circle → slot duct, built bottom to top.',
      current: { kind: 'loft', params: loftParams({ order: ['square', 'slot', 'circle'] }) },
      goal: { kind: 'loft', params: loftParams({}) },
      feature: 'loft',
      featureWhy: { loft: 'Yes: three different sections at fixed heights.', sweep: 'The section changes shape, so a constant-section sweep does not describe it.', extrude: 'An extrude keeps one section; this one changes.' },
      fixes: [
        { id: 'order', text: 'Select square, circle, slot: the order the profiles sit along the part', params: loftParams({}), matches: true },
        { id: 'connector', text: 'Move the slot’s start point 90°', params: loftParams({ order: ['square', 'slot', 'circle'], starts: { slot: 90 } }), matches: false, why: 'Moving a connector adds twist, but the loft still jumps to the top profile and back down.' },
        { id: 'size', text: 'Shrink the circle', params: null, matches: false, why: 'The size is not the problem. The loft passes through its profiles in the order selected, so it still doubles back.' }
      ]
    },
    {
      id: 'spring', title: 'Compression spring',
      target: 'Ø16 mm round wire wound with a 24 mm coil radius and a 28 mm pitch.',
      current: { kind: 'sweep', params: sweepParams({ path: 'helix', shape: 'circle', size: 16, bend: 24, pitch: 12 }) },
      goal: { kind: 'sweep', params: sweepParams({ path: 'helix', shape: 'circle', size: 16, bend: 24, pitch: 28 }) },
      feature: 'sweep',
      featureWhy: { sweep: 'Yes: one wire section follows a helical path.', loft: 'The section never changes; a loft would be an awkward way to describe a constant wire.', extrude: 'An extrude cannot follow a helix.' },
      fixes: [
        { id: 'pitch', text: 'Increase the pitch to 28 mm', params: sweepParams({ path: 'helix', shape: 'circle', size: 16, bend: 24, pitch: 28 }), matches: true },
        { id: 'coil', text: 'Increase the coil radius to 40 mm', params: sweepParams({ path: 'helix', shape: 'circle', size: 16, bend: 40, pitch: 12 }), matches: false, why: 'The local bend was already fine. Neighbouring turns are still only about 12 mm apart, so the 16 mm wire still clashes with the next coil.' },
        { id: 'loft', text: 'Rebuild it as a loft through three circles', params: null, matches: false, why: 'Changing the feature does not move the turns apart. The clash is between neighbouring coils.' }
      ]
    }
  ];
  function run(spec) { return spec.kind === 'sweep' ? M.sweep(spec.params) : M.loft(spec.params); }
  function verdict(spec, result) { return spec.kind === 'sweep' ? R.sweepVerdict(result) : R.loftVerdict(result); }
  function figure(spec, result, title, opts) {
    opts = opts || {};
    if (spec.kind === 'loft') return R.loftIso(result, { title: title, width: opts.width || 360, height: opts.height || 330 });
    return R.sweepIso(result, { title: title, width: opts.width || 360, height: opts.height || 300 });
  }
  function failing(spec, result) {
    if (spec.kind === 'loft') return result.summary.state !== 'matched';
    return result.overall === 'fails-local' || result.overall === 'fails-clash';
  }

  /* ---------- static lessons (inside each mount; replaced by the live lab) ---------- */
  function staticSweep() {
    var good = M.sweep(sweepParams({ path: 'arc', shape: 'circle', size: 16, bend: 12 }));
    var bad = M.sweep(sweepParams({ path: 'arc', shape: 'circle', size: 30, bend: 12 }));
    var sc = M.sweep(sweepParams({ path: 's-curve', shape: 'circle', size: 20, bend: 8 }));
    var hx = M.sweep(sweepParams({ path: 'helix', shape: 'circle', size: 20, bend: 30, pitch: 16 }));
    var vh = R.sweepVerdict(hx);
    return '<div class="sll-static">' +
      '<p><strong>The rule this lab tests.</strong> Carry a profile along a path. At each point the path has a <em>bend radius</em> ρ: the radius of the circle that best fits the path there, measured to its <em>centre of curvature</em>. The profile also has a <em>reach toward that centre</em>: how far its edge extends from the path toward the inside of the bend. The inner wall folds through itself where</p>' +
      '<p class="sll-formula">reach toward the centre of curvature ≥ local bend radius ρ</p>' +
      '<p>For a round rod centred on the path, the reach is its radius, so a rod of diameter D fails around a bend when D/2 ≥ ρ. Exactly equal is already a failure: the inner wall shrinks to an edge at the centre of curvature.</p>' +
      '<div class="sll-static-grid">' +
      '<figure>' + R.sweepPlan(good, { title: 'BUILDS · Ø16 rod, 12 mm bend', width: 360, height: 300 }) + '<figcaption>Reach 8 mm is less than the 12 mm bend radius, so the inner edge stays a smaller arc with 4 mm to spare.</figcaption></figure>' +
      '<figure>' + R.sweepPlan(bad, { title: 'FAILS · Ø30 rod, 12 mm bend', width: 360, height: 300 }) + '<figcaption>Reach 15 mm passes the 12 mm bend radius. The inner edge (red) passes the centre of curvature and runs backwards on the far side, folding the wall through itself.</figcaption></figure>' +
      '</div>' +
      '<table><thead><tr><th>Profile on a 12 mm arc</th><th>Reach toward centre</th><th>Result</th></tr></thead><tbody>' +
      '<tr><td>Ø16 mm rod</td><td>8 mm</td><td>Builds (8 &lt; 12)</td></tr>' +
      '<tr><td>Ø24 mm rod</td><td>12 mm</td><td>Fails: inner wall collapses to an edge (12 = 12)</td></tr>' +
      '<tr><td>Ø30 mm rod</td><td>15 mm</td><td>Fails: folds (15 &gt; 12)</td></tr>' +
      '<tr><td>30 × 15 mm bar, 30 mm side across the bend</td><td>15 mm</td><td>Fails: folds</td></tr>' +
      '<tr><td>Same bar turned, 15 mm side across the bend</td><td>7.5 mm</td><td>Builds</td></tr>' +
      '</tbody></table>' +
      '<p><strong>Only the local bend matters for this test.</strong> On an S-curve the bend radius changes along the path, so the failure appears only near the tightest bends. Here a Ø20 mm rod (reach 10 mm) follows an S-curve whose tightest bend radius is 8 mm: ' + fmt(sc.summary.flaggedFraction * 100, 0) + '% of the path fails.</p>' +
      '<figure>' + R.marginChart(sc, { title: 'S-CURVE · Ø20 rod, tightest bend 8 mm' }) + '<figcaption>Where the reach line rises above the bend-radius line, that stretch of the sweep folds (red bands).</figcaption></figure>' +
      '<p><strong>A passing local test is not a complete check.</strong> This lab calls a sweep “builds” only on the U-bend, where the geometry also rules out clashes; anywhere else a passing local test is reported as only that, with global clearance not established. A Ø20 mm wire wound with a 30 mm coil radius bends gently (bend radius ' + fmt(hx.summary.minRho, 1) + ' mm), but with a 16 mm pitch neighbouring turns are only ' + fmt(hx.coil.distance, 1) + ' mm apart, so the wire hits the next coil. ' + esc(vh.coil.text) + '</p>' +
      '<figure>' + R.sweepIso(hx, { title: 'HELIX · no local fold, but the coils collide' }) + '<figcaption>The local test passes everywhere, yet the turns overlap. A real CAD check also looks for clashes between distant parts of the same feature.</figcaption></figure>' +
      '<p class="sll-limit">Teaching model: the profile is centred on the path and carried without avoidable twist (a rotation-minimising frame). The red regions come from the local test only. It is not a complete validity check. The helix chord check can prove that neighbouring coils collide, never that they clear. A given CAD product may report failures differently or offer other orientation options. Sources: Patrikalakis, Maekawa and Cho, <a href="https://web.mit.edu/hyperbook/Patrikalakis-Maekawa-Cho/node237.html">Local self-intersection of pipe surfaces</a> and <a href="https://web.mit.edu/hyperbook/Patrikalakis-Maekawa-Cho/node238.html">Global self-intersection of pipe surfaces</a>; <a href="https://cad.onshape.com/help/Content/PartStudio/sweep.htm">Onshape: Sweep</a>.</p>' +
      '</div>';
  }
  function staticLoft() {
    var cases = [
      { p: loftParams({}), cap: 'Matched start points: each connector runs straight from square to circle to slot.', t: 'MATCHED' },
      { p: loftParams({ starts: { circle: 90 } }), cap: 'Circle start point moved 90°: the connectors spiral. No checked section crosses itself, but it is twisted.', t: 'CIRCLE START +90°' },
      { p: loftParams({ starts: { circle: 180 } }), cap: 'Circle start point moved 180°: paired vertices sit on opposite sides, so sections pass through the middle and cross themselves (red).', t: 'CIRCLE START +180°' },
      { p: loftParams({ order: ['square', 'slot', 'circle'] }), cap: 'Selected square, slot, circle: the loft climbs to the slot, then comes back down to the circle through heights it already occupies (red).', t: 'ORDER: SQUARE, SLOT, CIRCLE' }
    ];
    return '<div class="sll-static">' +
      '<p><strong>What decides a loft’s shape.</strong> Each profile is divided into the same number of points, counted from its <em>start point</em> (the connector) in the same direction. Point 1 of the first profile joins point 1 of the next, and so on; the loft passes through the profiles in the order selected. Three profiles sit on parallel planes: a 60 mm square at the bottom, a Ø44 mm circle 45 mm up, and a 56 × 24 mm slot at 90 mm.</p>' +
      '<div class="sll-static-grid sll-static-four">' + cases.map(function (c) {
        var r = M.loft(c.p);
        return '<figure>' + R.loftIso(r, { title: c.t, width: 360, height: 340 }) + '<figcaption>' + esc(c.cap) + '</figcaption></figure>';
      }).join('') + '</div>' +
      '<table><thead><tr><th>Change</th><th>Result</th><th>Fix</th></tr></thead><tbody>' +
      '<tr><td>Start points do not correspond</td><td>Twist; a large mismatch pinches or crosses itself</td><td>Line up the connectors or start points</td></tr>' +
      '<tr><td>Profiles selected out of their order along the part</td><td>Loft doubles back across heights already occupied</td><td>Select profiles in sequence</td></tr>' +
      '<tr><td>Whole selection reversed</td><td>Same surface, built from the other end</td><td>Nothing to fix</td></tr>' +
      '</tbody></table>' +
      '<p class="sll-limit">Teaching model: every profile runs counter-clockwise, and corresponding points are joined by a smooth curve through all three profiles. A profile drawn in the opposite direction is a separate problem, not modelled here. Twist and crossing come from the actual sections. Source: <a href="https://cad.onshape.com/help/Content/PartStudio/loft.htm">Onshape: Loft</a> (sequential profile order; connections control twist).</p>' +
      '</div>';
  }
  function staticChallenges() {
    return '<div class="sll-static"><p><strong>Choose the feature, then the input to change.</strong> For each target, decide whether a sweep, loft or extrude states it, then which change fixes the failing attempt.</p><ol class="sll-static-challenges">' +
      CHALLENGES.map(function (c) {
        var cur = run(c.current), v = verdict(c.current, cur), fix = c.fixes.filter(function (f) { return f.matches; })[0];
        return '<li><p><strong>' + esc(c.title) + '.</strong> ' + esc(c.target) + ' Current attempt: ' + esc(v.title.toLowerCase()) + '.</p>' +
          '<details><summary>Answer</summary><p><strong>' + esc(FEATURES.filter(function (f) { return f.id === c.feature; })[0].label) + '.</strong> ' + esc(c.featureWhy[c.feature]) + ' <strong>Change:</strong> ' + esc(fix.text) + '.</p></details></li>';
      }).join('') + '</ol></div>';
  }

  return {
    SWEEP_CHOICES: SWEEP_CHOICES, SWEEP_ROUNDS: SWEEP_ROUNDS, gradeSweep: gradeSweep, sweepOutcomes: sweepOutcomes,
    LOFT_CHOICES: LOFT_CHOICES, LOFT_ROUNDS: LOFT_ROUNDS, gradeLoft: gradeLoft,
    FEATURES: FEATURES, CHALLENGES: CHALLENGES, run: run, verdict: verdict, figure: figure, failing: failing,
    staticSweep: staticSweep, staticLoft: staticLoft, staticChallenges: staticChallenges
  };
});
