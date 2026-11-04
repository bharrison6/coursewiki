'use strict';
// node --test interactives/sweep-loft-lab/model.test.cjs
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const M = require('./model.js'), R = require('./render.js'), L = require('./lessons.js');

const base = (patch) => Object.assign(M.defaults(), patch);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.sqrt(dot(a, a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

test('arc of radius R: the local test flags exactly when half-width >= R (within 1e-9)', () => {
  for (const R0 of [5, 10, 12.5, 17.25, 19.5]) {
    const at = (hw) => M.sweep(base({ path: 'arc', shape: 'circle', bend: R0, size: 2 * hw }));
    const below = at(R0 - 1e-7), equal = at(R0), above = at(R0 + 1e-7);
    assert.equal(below.summary.state, 'clear', 'R=' + R0 + ' just below');
    assert.equal(equal.summary.state, 'degenerate', 'R=' + R0 + ' equal is singular');
    assert.equal(above.summary.state, 'folds', 'R=' + R0 + ' just above');
    assert.equal(below.samples.some((q) => q.flagged), false);
    // flagged stretch is the whole arc and nothing on the straight legs
    const flagged = equal.samples.filter((q) => q.flagged);
    assert.ok(flagged.every((q) => Math.abs(Math.hypot(q.p[0], q.p[1]) - R0) < 1e-9), 'only arc points flag');
    // measured along the sampled polyline (120 chords per arc), so slightly short of pi*R
    assert.ok(Math.abs(equal.summary.flaggedLength - Math.PI * R0) < 2e-4 * Math.PI * R0);
  }
  // the coordinator's named cases on R10
  const r = (d) => M.sweep(base({ path: 'arc', shape: 'circle', bend: 10, size: d })).summary.state;
  assert.deepEqual([r(19.998), r(20), r(20.002)], ['clear', 'degenerate', 'folds']);
});

test('degenerate arc case: the inner wall collapses onto the centre of curvature', () => {
  const s = M.sweep(base({ path: 'arc', shape: 'circle', bend: 10, size: 20 }));
  const mid = s.samples[Math.floor(s.samples.length / 2)];
  const inner = [mid.p[0] + mid.reach * mid.centre[0], mid.p[1] + mid.reach * mid.centre[1], 0];
  assert.ok(len(inner) < 1e-9, 'innermost profile point sits on the arc centre');
  const fold = M.sweep(base({ path: 'arc', shape: 'circle', bend: 10, size: 24 }));
  const m2 = fold.samples[Math.floor(fold.samples.length / 2)];
  const inner2 = [m2.p[0] + m2.reach * m2.centre[0], m2.p[1] + m2.reach * m2.centre[1], 0];
  assert.ok(Math.abs(len(inner2) - 2) < 1e-9 && dot(inner2, m2.p) < 0, 'past the centre: on the far side, 2 mm out');
});

test('red vertices are where the swept surface really runs backwards along the path', () => {
  for (const p of [base({ path: 'arc', bend: 10, size: 26 }), base({ path: 's-curve', bend: 8, size: 24 }), base({ path: 'helix', shape: 'rectangle', size: 40, bend: 12, pitch: 60 })]) {
    const s = M.sweep(p);
    let checked = 0;
    for (let i = 1; i < s.samples.length - 2; i++) {
      // a central difference across a curvature jump (arc/leg joint) is not meaningful
      if (p.path === 'arc' && (s.samples[i - 1].kappa === 0) !== (s.samples[i + 1].kappa === 0)) continue;
      for (let j = 0; j < s.rings[i].length; j++) {
        const f = s.fold[i][j];
        if (Math.abs(f) < 0.05) continue; // finite differences are not decisive near zero
        const ds = dot(sub(s.rings[i + 1][j], s.rings[i - 1][j]), s.samples[i].t);
        const dc = dot(sub(s.samples[i + 1].p, s.samples[i - 1].p), s.samples[i].t);
        assert.equal(Math.sign(ds), Math.sign(f * dc), p.path + ' sample ' + i + ' vertex ' + j);
        checked++;
      }
    }
    assert.ok(checked > 1000);
    assert.ok(s.fold.some((ring) => ring.some((f) => f < 0)), p.path + ' has a real fold');
  }
});

test('rectangle: only the extent toward the centre of curvature matters', () => {
  const flat = M.sweep(base({ path: 'arc', shape: 'rectangle', size: 30, bend: 12, turned: false }));
  const turned = M.sweep(base({ path: 'arc', shape: 'rectangle', size: 30, bend: 12, turned: true }));
  assert.equal(flat.summary.maxReach, 15); assert.equal(flat.summary.state, 'folds');
  assert.equal(turned.summary.maxReach, 7.5); assert.equal(turned.summary.state, 'clear');
  // support value equals the farthest actual profile vertex toward the centre
  const q = flat.samples[60], far = Math.max(...flat.profile.points.map((pt) => pt[0] * q.centreUV[0] + pt[1] * q.centreUV[1]));
  assert.ok(Math.abs(far - q.reach) < 1e-9);
});

test('frames stay orthonormal and continuous: no flips on the helix or at the S-curve inflection', () => {
  for (const p of [base({ path: 'arc' }), base({ path: 's-curve', bend: 5 }), base({ path: 'helix', bend: 5, pitch: 12 }), base({ path: 'helix', bend: 60, pitch: 60 })]) {
    const s = M.sweep(p);
    let maxStep = 0;
    s.samples.forEach((q, i) => {
      assert.ok(Math.abs(dot(q.e1, q.t)) < 1e-12 && Math.abs(len(q.e1) - 1) < 1e-12);
      const e2 = cross(q.t, q.e1); assert.ok(len(sub(e2, q.e2)) < 1e-12);
      if (i) maxStep = Math.max(maxStep, Math.acos(Math.min(1, dot(q.e1, s.samples[i - 1].e1))));
    });
    assert.ok(maxStep * 180 / Math.PI < 12, p.path + ' max frame step ' + (maxStep * 180 / Math.PI).toFixed(2) + '°');
  }
  // the centre of curvature swaps sides at the S-curve inflection; the frame does not
  const s = M.sweep(base({ path: 's-curve', bend: 8 }));
  const before = s.samples.find((q) => q.p[0] < -1 && q.p[0] > -3), after = s.samples.find((q) => q.p[0] > 1 && q.p[0] < 3);
  assert.ok(dot(before.centre, after.centre) < 0, 'centre direction flips');
  assert.ok(dot(before.e1, after.e1) > 0.9, 'profile frame does not');
});

test('helix: the rotation-minimising frame rolls against the Frenet frame by 2*pi*h/sqrt(a^2+h^2) per turn', () => {
  for (const [a, pitch] of [[20, 40], [30, 16], [8, 60]]) {
    const s = M.sweep(base({ path: 'helix', bend: a, pitch }));
    const perTurn = Math.round((s.samples.length - 1) / M.HELIX_TURNS);
    const angle = (q) => { const N = q.centre, B = cross(q.t, N); return Math.atan2(dot(q.e1, B), dot(q.e1, N)); };
    const raw = (angle(s.samples[perTurn]) - angle(s.samples[0])) * 180 / Math.PI;
    const wrapErr = (x) => Math.abs((((x % 360) + 540) % 360) - 180);
    const err = Math.min(wrapErr(raw - s.helix.rollPerTurnDeg), wrapErr(raw + s.helix.rollPerTurnDeg));
    assert.ok(err < 0.5, 'a=' + a + ' roll ' + raw.toFixed(2) + ' vs ' + s.helix.rollPerTurnDeg.toFixed(2));
    assert.ok(Math.abs(s.summary.minRho - (a * a + s.helix.h ** 2) / a) < 1e-9);
  }
});

test('S-curve: the tightest bend equals the slider and only the tight stretches fail', () => {
  for (const rho of [5, 8, 23.5, 60]) {
    const s = M.sweep(base({ path: 's-curve', bend: rho, size: 4 }));
    assert.ok(Math.abs(s.summary.minRho - rho) < 1e-9);
  }
  const s = M.sweep(base({ path: 's-curve', bend: 8, size: 20 }));
  assert.equal(s.summary.state, 'folds');
  assert.ok(s.summary.flaggedFraction > 0 && s.summary.flaggedFraction < 0.2);
  s.samples.filter((q) => q.flagged).forEach((q) => assert.ok(q.rho <= 10 + 1e-9));
  assert.equal(s.samples.find((q) => Math.abs(q.p[0]) < 1e-9).flagged, false, 'inflection is clear');
});

test('helix coil check: an independent brute-force distance agrees, and local-clear coils can still collide', () => {
  const s = M.sweep(base({ path: 'helix', shape: 'circle', size: 20, bend: 30, pitch: 16 }));
  assert.equal(s.summary.state, 'clear', 'local test passes');
  assert.equal(s.coil.touches, true, 'neighbouring turns collide');
  // brute force: closest pair of path points at least half a turn apart (dense resampling)
  const hp = s.helix; let best = Infinity;
  const pt = (th) => [hp.a * Math.cos(th), hp.a * Math.sin(th), hp.h * th];
  for (let i = 0; i <= 2000; i++) for (const dth of [2 * Math.PI - 0.6, 2 * Math.PI - 0.3, 2 * Math.PI, 2 * Math.PI + 0.3]) {
    for (let k = -30; k <= 30; k++) { const d = dth + k * 0.01; best = Math.min(best, len(sub(pt(d), pt(0)))); }
  }
  assert.ok(Math.abs(best - s.coil.distance) < 1e-3, best + ' vs ' + s.coil.distance);
  const open = M.sweep(base({ path: 'helix', shape: 'circle', size: 20, bend: 30, pitch: 30 }));
  assert.equal(open.coil.touches, false);
  assert.equal(open.overall, 'local-pass', 'no chord contact is not proof of clearance');
  const steep = M.sweep(base({ path: 'helix', shape: 'circle', size: 20, bend: 5, pitch: 60 }));
  assert.equal(steep.coil.distance, null, 'no double-normal chord when turns spread apart monotonically');
});

test('invalid sweep inputs are rejected with a message, never silently clamped', () => {
  const bad = [{}, base({ size: NaN }), base({ size: 3.9 }), base({ size: 40.1 }), base({ bend: 4.99 }), base({ bend: Infinity }), base({ pitch: 11 }),
    base({ path: 'spiral' }), base({ shape: 'hexagon' }), base({ size: '16' }), base({ turned: 'yes' }), Object.assign(base({}), { extra: 1 }), null, []];
  bad.forEach((p) => { const r = M.sweep(p); assert.equal(r.ok, false); assert.ok(r.error.length > 10); });
});

const loftP = (patch) => { const p = M.loftDefaults(); if (patch.order) p.order = patch.order; Object.assign(p.starts, patch.starts || {}); return p; };
const maxDev = (a, b) => Math.max(...a.rings.flatMap((ring, i) => ring.map((v, j) => len(sub(v, b.rings[i][j])))));

test('loft vertex correspondence follows each profile start point (connector)', () => {
  const r = M.loft(loftP({ starts: { square: 45, circle: 90, slot: 0 } }));
  const st = r.spanRings;
  assert.ok(len(sub(r.rings[0][0], [30, 30, 0])) < 1e-9, 'square starts at its 45° corner');
  assert.ok(len(sub(r.rings[st][0], [0, 22, 45])) < 1e-9, 'circle starts at 90°');
  assert.ok(len(sub(r.rings[2 * st][0], [28, 0, 90])) < 1e-9, 'slot starts at its right end');
  // stations are interpolated exactly and vertices advance counter-clockwise by equal length
  r.stations.forEach((s, k) => s.points.forEach((p, j) => assert.ok(len(sub(p, r.rings[k * st][j])) < 1e-9)));
  assert.ok(M.polyArea(r.stations[1].points) > 0);
});

test('a cyclic start-point shift twists the loft; restoring it restores the exact geometry', () => {
  const base0 = M.loft(M.loftDefaults());
  assert.equal(base0.summary.state, 'matched');
  const t90 = M.loft(loftP({ starts: { circle: 90 } }));
  assert.equal(t90.summary.state, 'twisted');
  assert.ok(Math.abs(Math.abs(t90.summary.twists[0]) - 90) < 1e-6 && Math.abs(Math.abs(t90.summary.twists[1]) - 90) < 1e-6);
  assert.ok(maxDev(t90, base0) > 10, 'mesh visibly changes');
  assert.ok(len(sub(t90.rings[t90.spanRings][0], base0.rings[base0.spanRings][0])) > 20, 'connector moves');
  // every twisted section is still a simple positive polygon (checked independently)
  t90.rings.forEach((ring) => { assert.ok(M.polyArea(ring) > 0); assert.ok(M.isSimple(ring)); });
  const back = M.loft(loftP({ starts: { circle: 0 } }));
  assert.equal(maxDev(back, base0), 0, 'restoring the connector restores the geometry exactly');
});

test('a 180° connector mismatch makes sections cross themselves; red rings are those sections', () => {
  const r = M.loft(loftP({ starts: { circle: 180 } }));
  assert.equal(r.summary.state, 'pinched');
  const nonSimple = r.rings.map((ring) => !M.isSimple(ring) || M.polyArea(ring) <= 0);
  assert.ok(nonSimple.some(Boolean), 'some rendered section really crosses');
  nonSimple.forEach((bad, i) => { if (bad) assert.equal(r.ringBad[i], true, 'crossing ring ' + i + ' is red'); });
});

test('reversing the whole station order builds the same surface backwards; skipping a station folds', () => {
  const fwd = M.loft(M.loftDefaults()), rev = M.loft(loftP({ order: ['slot', 'circle', 'square'] }));
  assert.equal(rev.summary.state, fwd.summary.state);
  assert.ok(len(sub(rev.rings[0][0], fwd.rings[0][0])) > 50, 'mesh order changes');
  const n = fwd.rings.length;
  fwd.rings.forEach((ring, i) => ring.forEach((v, j) => assert.ok(len(sub(v, rev.rings[n - 1 - i][j])) < 1e-9)));
  const skip = M.loft(loftP({ order: ['square', 'slot', 'circle'] }));
  assert.equal(skip.summary.state, 'folded');
  assert.ok(skip.ringDoubled.some(Boolean));
  const zs = skip.rings.map((r) => r[0][2]);
  assert.ok(Math.max(...zs) >= 90 - 1e-9 && zs[zs.length - 1] === 45, 'travels up to the slot then back to the circle');
});

test('invalid loft inputs are rejected', () => {
  [{}, { order: ['square', 'circle'], starts: M.loftDefaults().starts }, { order: ['square', 'square', 'slot'], starts: M.loftDefaults().starts },
    loftP({ starts: { circle: 360 } }), loftP({ starts: { circle: 12.5 } }), loftP({ starts: { circle: -45 } }), { order: ['square', 'circle', 'slot'], starts: { square: 0, circle: 0 } }]
    .forEach((p) => { const r = M.loft(p); assert.equal(r.ok, false); assert.ok(r.error.length > 10); });
});

test('SVG output is ID-free, finite, and marks failure only where the model fails', () => {
  const ok = M.sweep(base({ path: 'arc', size: 16, bend: 12 })), bad = M.sweep(base({ path: 'arc', size: 30, bend: 12 }));
  const svgs = [R.sweepPlan(ok), R.sweepPlan(bad), R.sweepIso(bad), R.marginChart(bad), R.loftIso(M.loft(M.loftDefaults())), R.loftIso(M.loft(loftP({ starts: { circle: 180 } })))];
  svgs.forEach((s) => { assert.doesNotMatch(s, /\sid=|NaN|undefined|Infinity/); assert.match(s, /^<svg[^>]+role="img"[^>]+aria-label="[^"]+"/); });
  assert.doesNotMatch(R.sweepPlan(ok), /sll-bad/); assert.doesNotMatch(R.marginChart(ok), /sll-band/);
  assert.match(R.sweepPlan(bad), /sll-bad/); assert.match(R.marginChart(bad), /sll-band/);
  assert.doesNotMatch(R.loftIso(M.loft(M.loftDefaults())), /sll-bad/);
});

test('static lessons carry one building and one failing sweep, the loft cases, and match the page', () => {
  const s = L.staticSweep(), l = L.staticLoft(), c = L.staticChallenges();
  [s, l, c].forEach((h) => assert.doesNotMatch(h, /\sid=|NaN|undefined/));
  assert.match(s, /BUILDS · Ø16 rod/); assert.match(s, /FAILS · Ø30 rod/);
  assert.match(s, /reach toward the centre of curvature ≥ local bend radius/);
  assert.match(s, /not a complete validity check/);
  ['MATCHED', 'CIRCLE START \\+90°', 'CIRCLE START \\+180°', 'ORDER: SQUARE, SLOT, CIRCLE'].forEach((t) => assert.match(l, new RegExp(t)));
  const out = cp.spawnSync(process.execPath, [path.join(__dirname, 'static.cjs'), '--check'], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
});

test('prediction grading follows the geometry and accepts either failure when both happen', () => {
  L.SWEEP_ROUNDS.forEach((rd) => { const actual = L.sweepOutcomes(M.sweep(rd.params)); actual.forEach((a) => assert.equal(L.gradeSweep(rd, a).correct, true)); });
  const both = { id: 'both', text: '', params: base({ path: 'helix', shape: 'circle', size: 20, bend: 8, pitch: 12 }) };
  assert.equal(L.gradeSweep(both, 'fold').correct, true);
  assert.equal(L.gradeSweep(both, 'coil').correct, true);
  assert.equal(L.gradeSweep(both, 'clean').correct, false);
  const expected = { 'circle-90': 'twisted', 'circle-180': 'pinched', reversed: 'matched', skip: 'folded' };
  L.LOFT_ROUNDS.forEach((rd) => { assert.equal(L.gradeLoft(rd, expected[rd.id]).correct, true); assert.equal(L.gradeLoft(rd, 'nonsense').correct, false); });
});

test('every challenge starts failing, its matching fix reaches the goal, and decoys do not', () => {
  L.CHALLENGES.forEach((c) => {
    assert.equal(L.failing(c.current, L.run(c.current)), true, c.id + ' current fails');
    const goal = L.run(c.goal); assert.equal(L.failing(c.goal, goal), false, c.id + ' goal builds');
    assert.equal(c.fixes.filter((f) => f.matches).length, 1);
    c.fixes.forEach((f) => {
      if (f.matches) assert.deepEqual(f.params, c.goal.params);
      else { assert.ok(f.why && f.why.length > 20); if (f.params) assert.notDeepEqual(f.params, c.goal.params); }
    });
    assert.ok(c.featureWhy[c.feature]);
  });
});

test('manifest uses the shared runtime; scene is event driven and loads no other engine', () => {
  const conf = fs.readFileSync(path.join(__dirname, 'interactive.conf'), 'utf8');
  assert.match(conf, /^@@REQUIRES: three-runtime$/m);
  assert.match(conf, /^@@JS: model.js, render.js, lessons.js, scene3d.js, demo.js$/m);
  const scene = fs.readFileSync(path.join(__dirname, 'scene3d.js'), 'utf8');
  assert.match(scene, /CourseWikiThree/); assert.doesNotMatch(scene, /setAnimationLoop|https?:\/\/|import\s/);
  const demo = fs.readFileSync(path.join(__dirname, 'demo.js'), 'utf8');
  assert.match(demo, /prefers-reduced-motion/);
});

/* ---------- v2 regression: never call unproven full geometry "Builds" ---------- */
// Independent section-section intersection (written here, no model collision code):
// the line where two section planes meet, clipped by each section (rectangle slabs or disk).
function sectionsOf(p) {
  const s = M.sweep(p);
  return s.samples.map((q) => ({ c: q.p, n: q.t, e1: q.e1, e2: q.e2, shape: p.shape, hu: s.profile.halfU, hv: s.profile.halfV, r: p.size / 2 }));
}
function clip(sec, P, d) {
  if (sec.shape === 'rectangle') {
    let lo = -Infinity, hi = Infinity;
    for (const [ax, h] of [[sec.e1, sec.hu], [sec.e2, sec.hv]]) {
      const a = dot(sub(P, sec.c), ax), b = dot(d, ax);
      if (Math.abs(b) < 1e-15) { if (Math.abs(a) > h) return null; continue; }
      let t1 = (-h - a) / b, t2 = (h - a) / b; if (t1 > t2) [t1, t2] = [t2, t1];
      lo = Math.max(lo, t1); hi = Math.min(hi, t2);
    }
    return lo <= hi ? [lo, hi] : null;
  }
  const w = sub(P, sec.c), A = dot(d, d), B = 2 * dot(w, d), C = dot(w, w) - sec.r * sec.r, D = B * B - 4 * A * C;
  return D < 0 ? null : [(-B - Math.sqrt(D)) / (2 * A), (-B + Math.sqrt(D)) / (2 * A)];
}
function meet(A, B) {
  const d = cross(A.n, B.n), dd = dot(d, d);
  if (dd < 1e-18) return null;
  const hA = dot(A.n, A.c), hB = dot(B.n, B.c), u = cross(B.n, d), v = cross(d, A.n);
  const P = [(u[0] * hA + v[0] * hB) / dd, (u[1] * hA + v[1] * hB) / dd, (u[2] * hA + v[2] * hB) / dd];
  const a = clip(A, P, d), b = clip(B, P, d);
  if (!a || !b) return null;
  const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]);
  return lo <= hi ? [P[0] + d[0] * (lo + hi) / 2, P[1] + d[1] * (lo + hi) / 2, P[2] + d[2] * (lo + hi) / 2] : null;
}
const COUNTER = base({ path: 'helix', shape: 'rectangle', size: 12, bend: 8, pitch: 12, turned: true });

test('v2 counterexample: turned 12 x 6 bar, coil radius 8, pitch 12 really self-intersects', () => {
  const S = sectionsOf(COUNTER), x = meet(S[56], S[144]);
  assert.ok(x, 'sections 56 and 144 meet');
  const expected = [-4.89031038, -1.35026622, -2.65598190];
  assert.ok(len(sub(x, expected)) < 1e-6, 'reported point reproduced: ' + x.join(', '));
  for (const k of [56, 144]) {
    const sec = S[k], w = sub(x, sec.c);
    assert.ok(Math.abs(dot(w, sec.n)) < 1e-12, 'point lies in section plane ' + k);
    assert.ok(Math.abs(dot(w, sec.e1)) <= sec.hu + 1e-12 && Math.abs(dot(w, sec.e2)) <= sec.hv + 1e-12, 'point inside rectangle ' + k);
  }
});

test('v2 counterexample: verdict, status and grading stay truthful', () => {
  const r = M.sweep(COUNTER), v = R.sweepVerdict(r);
  assert.equal(r.summary.state, 'clear', 'local test passes');
  assert.equal(r.coil.touches, false, 'the chord check finds no contact');
  assert.equal(r.overall, 'local-pass');
  assert.equal(r.global.status, 'unknown');
  assert.doesNotMatch(v.title, /^Builds/);
  assert.match(v.title, /Local test passes; global clearance not established/);
  assert.match(v.coil.text, /does not prove the coils clear/);
  assert.equal(v.fails, false); assert.equal(v.established, false);
  assert.doesNotMatch(R.sweepIso(r), /Builds/);
  const round = { id: 'counter', text: '', params: COUNTER };
  assert.deepEqual(L.sweepOutcomes(r), []);
  for (const c of L.SWEEP_CHOICES) { const g = L.gradeSweep(round, c.id); assert.equal(g.correct, null); assert.equal(g.ungraded, true); assert.match(g.text, /^Not graded/); }
  assert.equal(L.failing({ kind: 'sweep' }, r), false);
});

test('v2: "Builds" only where global clearance is established (U-bend), and a brute scan agrees there', () => {
  const sizes = [4, 10, 18, 26, 34, 40], bends = [5, 9.5, 14, 20, 33, 60];
  for (const path of ['arc', 's-curve', 'helix']) for (const shape of ['circle', 'rectangle']) for (const turned of shape === 'rectangle' ? [false, true] : [false])
    for (const size of sizes) for (const bend of bends) for (const pitch of path === 'helix' ? [12, 30, 60] : [30]) {
      const r = M.sweep(base({ path, shape, size, bend, pitch, turned })), v = R.sweepVerdict(r);
      if (r.overall === 'builds') assert.equal(path, 'arc', 'builds claimed only on the arc');
      if (path !== 'arc' && r.summary.state === 'clear' && !(r.coil && r.coil.touches)) assert.equal(r.overall, 'local-pass');
      if (!v.established) { assert.doesNotMatch(v.title, /Builds/); assert.equal(L.sweepOutcomes(r).length, 0); }
      if (v.coil && !v.coil.touches) assert.doesNotMatch(v.coil.text, /so they clear|they clear\./);
    }
  // sanity check of the analytic U-bend claim with the independent section scan
  for (const p of [base({ path: 'arc', size: 18, bend: 10 }), base({ path: 'arc', shape: 'rectangle', size: 38, bend: 20 }), base({ path: 'arc', shape: 'rectangle', size: 38, bend: 10, turned: true }), base({ path: 'arc', size: 39, bend: 20 })]) {
    assert.equal(M.sweep(p).overall, 'builds');
    const S = sectionsOf(p); let hits = 0;
    for (let i = 0; i < S.length; i++) for (let j = i + 6; j < S.length; j++) if (meet(S[i], S[j])) hits++;
    assert.equal(hits, 0, JSON.stringify(p));
  }
});

test('v2: loft claims stay within what is checked', () => {
  const twisted = R.loftVerdict(M.loft(loftP({ starts: { circle: 90 } }))), matched = R.loftVerdict(M.loft(M.loftDefaults()));
  [twisted, matched].forEach((v) => { assert.doesNotMatch(v.title + v.text, /valid|Builds/); assert.match(v.text, /Checked \d+ cross-sections; none crosses itself/); });
  for (const order of [['square', 'slot', 'circle'], ['circle', 'square', 'slot'], ['circle', 'slot', 'square'], ['slot', 'square', 'circle']]) {
    const r = M.loft(loftP({ order })), v = R.loftVerdict(r);
    assert.equal(r.summary.state, 'folded');
    if (/through itself/.test(v.title)) assert.equal(r.summary.foldCrosses, true);
  }
  L.LOFT_CHOICES.forEach((c) => assert.doesNotMatch(c.label, /valid/));
});
