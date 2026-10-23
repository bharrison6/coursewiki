'use strict';
/* Focused tests for the surface texture lab's model: the profile analysis
   (interactives/surface-texture/profile.js), the teaching surfaces
   (surface.js), the drawing notation (notation.js) and the quiz built from
   them (quiz.js).
   Run: node --test --test-concurrency=2 tests/interactives/surface-texture.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MOD = path.join(__dirname, '..', '..', 'interactives', 'surface-texture');
const S = require(path.join(MOD, 'surface.js'));
const P = require(path.join(MOD, 'profile.js'));
const N = require(path.join(MOD, 'notation.js'));
const Q = require(path.join(MOD, 'quiz.js'));

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b);

/* A trace laid out exactly as profile.trace lays it out, with made-up heights. */
function synthetic(lc, fn) {
  const n = (P.SECTIONS + 2 * P.MARGIN) * P.PER_CUTOFF + 1, dx = lc / P.PER_CUTOFF, s0 = -(P.SECTIONS / 2 + P.MARGIN) * lc;
  const pos = new Float64Array(n), z = new Float64Array(n);
  for (let i = 0; i < n; i++) { pos[i] = s0 + i * dx; z[i] = fn(pos[i]); }
  return { dir: 'x', lc, dx, pos, z, i0: P.MARGIN * P.PER_CUTOFF, i1: n - 1 - P.MARGIN * P.PER_CUTOFF };
}

test('the mean line is a normalised Gaussian that keeps half of a wave one cutoff long', () => {
  const w = P.weights();
  near(w.reduce((a, b) => a + b, 0), 1, 1e-12, 'weights sum to one');
  for (let i = 0; i < w.length; i++) assert.equal(w[i], w[w.length - 1 - i]);
  near(P.ALPHA, Math.sqrt(Math.log(2) / Math.PI), 1e-15);
  near(P.meanLineShare(0.8, 0.8), 0.5, 1e-12, 'continuous transmission at the cutoff');
  // and the sampled filter does the same to a real wave
  const an = P.analyse(synthetic(0.8, (x) => Math.sin(2 * Math.PI * x / 0.8)));
  let peak = 0;
  for (let i = an.trace.i0; i <= an.trace.i1; i++) peak = Math.max(peak, Math.abs(an.mean[i]));
  near(peak, 0.5, 0.01, 'sampled mean line amplitude at lambda = lc');
});

test('Ra, Rz and Rt of profiles with known answers', () => {
  // A sine much shorter than the cutoff: Ra = 2A/pi, every section and the whole length span 2A.
  const A = 3, sine = P.analyse(synthetic(0.8, (x) => A * Math.sin(2 * Math.PI * x / 0.05)));
  near(sine.Ra, 2 * A / Math.PI, 0.005 * A, 'sine Ra');
  near(sine.Rz, 2 * A, 0.01 * A, 'sine Rz');
  near(sine.Rt, 2 * A, 0.01 * A, 'sine Rt');
  // Parabolic feed marks, the round-nosed-tool shape: Ra = 4 / (9 sqrt 3) of the peak-to-valley height.
  const H = 4, marks = P.analyse(synthetic(0.8, (x) => { const u = ((x / 0.2) % 1 + 1) % 1, t = 2 * u - 1; return H * t * t; }));
  near(marks.Ra, H * 4 / (9 * Math.sqrt(3)), 0.01 * H, 'parabolic marks Ra');
  near(marks.Rz, H, 0.02 * H);
  // A wave ten cutoffs long stays almost entirely in the mean line.
  const long = P.analyse(synthetic(0.8, (x) => 5 * Math.sin(2 * Math.PI * x / 8 + 0.3)));
  assert.ok(long.Rt < 5 * 2 * (1 - P.meanLineShare(0.8, 8)) * 1.5 + 1e-3, 'long wave leaks only ' + long.Rt);
  assert.ok(long.waviness > 8, 'and shows up as waviness');
});

test('Rz averages five sections; Rt is the whole length; Ra is linear in height', () => {
  const lc = 0.8, base = (x) => Math.sin(2 * Math.PI * x / 0.1);
  const plain = P.analyse(synthetic(lc, base));
  const spike = P.analyse(synthetic(lc, (x) => base(x) - (Math.abs(x - 0.3) < 0.003 ? 10 : 0)));
  assert.equal(plain.sections.length, 5);
  plain.sections.forEach((s, k) => { assert.equal(s.index, k + 1); assert.equal(s.b - s.a, P.PER_CUTOFF); });
  const mean = plain.sections.reduce((a, s) => a + s.height, 0) / 5;
  near(plain.Rz, mean, 1e-12, 'Rz is the mean of the section heights');
  assert.ok(spike.Rt > plain.Rt + 8, 'a deep spike sets Rt');
  near(spike.Rz - plain.Rz, (spike.Rt - plain.Rt) / 5, 0.25, 'and counts once in five for Rz');
  assert.ok(spike.Ra - plain.Ra < 0.05, 'and barely moves Ra');
  assert.ok(Math.max(...spike.sections.map((s) => s.height)) <= spike.Rt + 1e-12);
  const doubled = P.analyse(synthetic(lc, (x) => 2 * base(x) + 0.4 * Math.sin(2 * Math.PI * x / 3)));
  const single = P.analyse(synthetic(lc, (x) => base(x) + 0.2 * Math.sin(2 * Math.PI * x / 3)));
  near(doubled.Ra, 2 * single.Ra, 1e-9); near(doubled.Rz, 2 * single.Rz, 1e-9); near(doubled.Rt, 2 * single.Rt, 1e-9);
});

test('the trace and evaluation length follow the cutoff', () => {
  for (const lc of P.CUTOFFS) {
    const tr = P.trace(S.make(), 'x', lc);
    near(tr.pos[tr.i0], -2.5 * lc, 1e-12); near(tr.pos[tr.i1], 2.5 * lc, 1e-12);
    near(tr.pos[0], -3.5 * lc, 1e-12); near(tr.pos[tr.pos.length - 1], 3.5 * lc, 1e-12);
    const an = P.analyse(tr);
    assert.ok(Number.isNaN(an.rough[0]) && Number.isNaN(an.rough[tr.pos.length - 1]), 'nothing is evaluated outside the evaluation length');
    near(tr.pos[an.sections[4].b] - tr.pos[an.sections[0].a], 5 * lc, 1e-9);
  }
});

test('narrow grooves converge against independent dense Gaussian quadrature', () => {
  const spec = S.make({ spacing: 0.05, shape: 'plateau', wave: 0 });
  const actual = P.measure(spec, 'x', 2.5);
  // Independent reference: integrate the Gaussian directly over 51,200
  // intervals/cutoff, with no source binning. Interpolate only its smooth
  // output, and integrate the residual on that same dense surface grid.
  const lc = 2.5, n = 51200, step = lc / n, z = new Float64Array(7 * n + 1);
  for (let i = 0; i < z.length; i++) z[i] = S.heightAt(spec, -3.5 * lc + i * step, 0);
  const stride = n / 200, mean = new Float64Array(1001), kernel = new Float64Array(2 * n + 1);
  let norm = 0;
  for (let k = -n; k <= n; k++) {
    const w = Math.exp(-Math.PI * (k / n / Math.sqrt(Math.log(2) / Math.PI)) ** 2) * (Math.abs(k) === n ? 0.5 : 1);
    kernel[k + n] = w; norm += w;
  }
  for (let j = 0; j < mean.length; j++) {
    const i = n + j * stride;
    let sum = 0;
    for (let k = -n; k <= n; k++) sum += kernel[k + n] * z[i + k];
    mean[j] = sum / norm;
  }
  let sum = 0, hi = -Infinity, lo = Infinity;
  for (let j = 0; j <= 5 * n; j++) {
    const k = Math.min(999, Math.floor(j / stride)), f = j / stride - k;
    const r = z[n + j] - (mean[k] * (1 - f) + mean[k + 1] * f);
    sum += Math.abs(r) * (j === 0 || j === 5 * n ? 0.5 : 1);
    hi = Math.max(hi, r); lo = Math.min(lo, r);
  }
  const referenceRa = sum / (5 * n);
  near(referenceRa, 1.02517, 0.0001, 'independent converged Ra');
  near(actual.Ra, referenceRa, 0.0005, 'narrow-groove Ra');
  near(actual.Rt, hi - lo, 0.004, 'narrow-groove extrema');
  const matched = P.solveHeightForRa(spec, 'x', lc, 1.6);
  assert.equal(matched.achievable, true);
  near(referenceRa * matched.height / spec.height, 1.6, 0.001, 'actual equal-Ra surface, independently scaled');
});

test('the supported settings resolve narrow shapes and scratch extrema', () => {
  for (const shape of ['plateau', 'peaked']) for (const dir of ['x', 'y']) {
    const s = S.make({ shape, lay: 'multi', spacing: 0.04, scratch: true, wave: 20 });
    const a = P.measure(s, dir, 2.5), fine = P.analyse(P.trace(s, dir, 2.5, a.trace.perCutoff * 4));
    near(a.Ra, fine.Ra, 0.002, shape + ' ' + dir + ' Ra convergence');
    near(a.Rz, fine.Rz, 0.005 * fine.Rz, shape + ' ' + dir + ' Rz within 0.5%');
    near(a.Rt, fine.Rt, 0.005 * fine.Rt, shape + ' ' + dir + ' Rt within 0.5%');
    assert.ok(a.trace.dx <= s.spacing * 0.15 * 0.87 / 64);
  }
});

test('Ra matching handles cancellation, both branches and unreachable targets', () => {
  const s = S.make({ lay: 'crossed', spacing: 0.6, height: 1, wave: 40, waveLength: 1 });
  const a = P.solveHeightForRa(s, 'x', 0.8, 3.905);
  assert.equal(a.achievable, true);
  assert.ok(a.height > 0.2 && a.height < 1, 'root on descending branch');
  near(P.measure(S.make({ ...s, height: a.height }), 'x', 0.8).Ra, 3.905, 1e-8);
  const b = P.solveHeightForRa(S.make({ ...s, height: 15 }), 'x', 0.8, 3.905);
  assert.equal(b.achievable, true); assert.ok(b.height > 1, 'second root on rising branch');
  near(P.measure(S.make({ ...s, height: b.height }), 'x', 0.8).Ra, 3.905, 1e-8);
  for (const target of [0, 100]) {
    const miss = P.solveHeightForRa(s, 'x', 0.8, target);
    assert.equal(miss.achievable, false);
    near(miss.Ra, target === 0 ? miss.minRa : miss.maxRa, 1e-8, 'closest available value');
    near(P.measure(S.make({ ...s, height: miss.height }), 'x', 0.8).Ra, miss.Ra, 1e-8);
  }
  assert.throws(() => P.solveHeightForRa(s, 'x', 0.8, NaN), RangeError);
});

test('the teaching surfaces: direction, filter, scratch and shape behave as the lab says', () => {
  const spec = S.make();
  const across = P.measure(spec, 'x', 0.8), along = P.measure(spec, 'y', 0.8);
  assert.ok(across.Ra > 3 * along.Ra, 'tracing along the marks misses them');
  near(across.Ra, spec.height * 4 / (9 * Math.sqrt(3)), 0.08 * across.Ra, 'rounded marks follow the parabola result');
  const wavy = S.make({ wave: 12 });
  const w08 = P.measure(wavy, 'x', 0.8), w25 = P.measure(wavy, 'x', 2.5);
  assert.ok(w25.Ra > w08.Ra * 1.2 && w25.Rz > w08.Rz * 1.4, 'a longer cutoff counts more of the waviness as roughness');
  near(w08.Ra, P.measure(S.make({ wave: 0 }), 'x', 0.8).Ra, 0.05, 'at 0.8 mm the waviness stays in the mean line');
  const sc = P.measure(S.make({ scratch: true }), 'x', 0.8);
  assert.ok(sc.Rt / across.Rt > sc.Rz / across.Rz && sc.Rz / across.Rz > sc.Ra / across.Ra, 'Rt moves most, then Rz, then Ra');
  // equal Ra, different Rz
  const eq = {};
  for (const shape of S.SHAPE_ORDER) {
    const s = S.make({ shape }); s.height = P.heightForRa(s, 'x', 0.8, 1.6);
    eq[shape] = P.measure(s, 'x', 0.8);
    near(eq[shape].Ra, 1.6, 1e-6, shape + ' held at Ra 1.6');
  }
  assert.ok(eq.plateau.Rz > 1.4 * eq.rounded.Rz && eq.peaked.Rz > 1.4 * eq.rounded.Rz);
  near(eq.plateau.Rz, eq.peaked.Rz, 0.05 * eq.plateau.Rz, 'plateau and peaks share Rz');
  // where the extremes sit tells plateau from peaks
  const pv = (a) => Math.abs(a.rt.peak.v) / Math.abs(a.rt.valley.v);
  assert.ok(pv(eq.plateau) < 0.6 && pv(eq.peaked) > 1.6, 'plateau: deep valleys; peaked: tall peaks');
});

test('every pattern draws and measures, and its trace relation is stated', () => {
  for (const lay of S.PATTERN_ORDER) {
    const s = S.make({ lay });
    for (const dir of ['x', 'y']) {
      const a = P.measure(s, dir, 0.8);
      assert.ok(Number.isFinite(a.Ra) && a.Ra > 0 && a.Rz >= a.Ra && a.Rt >= a.Rz - 1e-12, lay + ' ' + dir);
      assert.ok(typeof S.relation(lay, dir) === 'string');
    }
    const c = S.crests(s, 2.8, 0);
    assert.ok(c.segments.length + c.circles.length > 0, lay + ' has marks to draw');
  }
  // parallel crests are where the surface is highest
  const s = S.make({ wave: 0 }), cr = S.crests(s, 1, 0).segments;
  for (const seg of cr) near(S.marks01(s, seg[0], seg[1]), 1, 1e-9, 'crest at ' + seg[0]);
  assert.equal(S.relation('parallel', 'x'), 'across'); assert.equal(S.relation('parallel', 'y'), 'along');
  assert.equal(S.relation('radial', 'x'), 'radius-along'); assert.equal(S.relation('circular', 'y'), 'radius-across');
  // radial marks: a straight trace through the centre runs along a crest both ways
  const r = S.make({ lay: 'radial' });
  for (const t of [0.5, -0.5]) { near(S.marks01(r, t, 0), 1, 1e-9); near(S.marks01(r, 0, t), 1, 1e-9); }
});

test('legacy N grades are the verified Ra table, and not an Rz conversion', () => {
  assert.deepEqual(N.N_GRADES.map((g) => [g.grade, g.ra]), [
    ['N1', 0.025], ['N2', 0.05], ['N3', 0.1], ['N4', 0.2], ['N5', 0.4], ['N6', 0.8],
    ['N7', 1.6], ['N8', 3.2], ['N9', 6.3], ['N10', 12.5], ['N11', 25], ['N12', 50]]);
  assert.equal(N.nGrade(1.6).grade, 'N7');
  assert.equal(N.nGrade(1.5), null);
  const b = N.nBetween(1.42);
  assert.equal(b.below.grade, 'N6'); assert.equal(b.above.grade, 'N7'); assert.equal(b.exact, null);
  assert.equal(N.nBetween(3.2).exact.grade, 'N8');
  const rz = N.expressible(N.makeCallout({ notation: 'ngrade', param: 'Rz', value: 6.3 }));
  assert.equal(rz.ok, false); assert.match(rz.why, /Ra/);
});

test('the triangle comparison is the catalog\'s rows, exact values only, with its qualification', () => {
  assert.deepEqual(N.TRIANGLES.rows.map((r) => [r.marks, r.ra]), [
    [4, [0.012, 0.025, 0.05, 0.1, 0.2]], [3, [0.4, 0.8, 1.6]], [2, [3.2, 6.3]], [1, [12.5, 25]]]);
  assert.match(N.TRIANGLES.note, /approximate/);
  assert.match(N.TRIANGLES.source.url, /misumi-ec\.com\/book\/NST1_ENG_T01\/pdf\/0520\.pdf$/);
  assert.match(N.TRIANGLES.source.title, /JIS B 0601-2001/);
  assert.equal(N.triangleRow(1.6).marks, 3);
  assert.equal(N.triangleRow(1.0), null, 'values between listed ones are not placed');
  assert.equal(N.triangleRow(50), null);
  assert.equal(N.expressible(N.makeCallout({ notation: 'triangles', value: 50 })).ok, false);
  assert.equal(N.expressible(N.makeCallout({ notation: 'triangles', param: 'Rz', value: 1.6 })).ok, false);
});

test('microinch conversion is exact', () => {
  assert.equal(N.UM_PER_MICROINCH, 0.0254);
  near(N.toMicroinch(25400), 1e6, 1e-6, 'one inch');
  assert.equal(N.fmtMicroinch(1.6), '63.0');
  assert.equal(N.fmtMicroinch(3.2), '126');
  assert.equal(N.fmtUm(0.025), '0.025'); assert.equal(N.fmtUm(12.5), '12.5'); assert.equal(N.fmtUm(-2.345), '−2.35');
});

test('process symbols, conventions and lay say only what the sources say', () => {
  assert.deepEqual(N.PROCESS_ORDER, ['any', 'removal', 'prohibited']);
  assert.match(N.PROCESS.any.reading, /does not forbid machining/);
  assert.match(N.PROCESS.removal.reading, /required/);
  assert.match(N.PROCESS.prohibited.reading, /must not be machined/);
  assert.equal(N.CONVENTIONS.current.standard, 'ISO 21920-1:2021');
  assert.equal(N.CONVENTIONS.legacy.standard, 'ISO 1302:2002');
  assert.match(N.CONVENTIONS.current.note, /dash above the short leg/);
  assert.deepEqual(N.LAY_ORDER, ['=', '⊥', 'X', 'M', 'C', 'R', 'P']);
  // = and the perpendicular sign depend on the view; the same marks take both
  assert.equal(N.laySymbol('parallel', 'front'), '⊥');
  assert.equal(N.laySymbol('parallel', 'side'), '=');
  for (const [p, sym] of [['crossed', 'X'], ['multi', 'M'], ['circular', 'C'], ['radial', 'R'], ['particulate', 'P']]) {
    assert.equal(N.laySymbol(p, 'front'), sym); assert.equal(N.laySymbol(p, 'side'), sym);
  }
  const r = N.reading(N.makeCallout({ notation: 'current', process: 'any', lay: '=' }), 'side');
  assert.equal(r[0], N.PROCESS.any.reading);
  assert.match(r[r.length - 1], /right side view/);
  // grade and triangle notations carry no process mark in this lab
  assert.ok(!N.reading(N.makeCallout({ notation: 'ngrade', value: 0.8 }))[0].includes('Material removal'));
});

test('one trace against one limit: the limit itself passes', () => {
  const c = N.makeCallout({ param: 'Ra', value: 1.6 });
  assert.equal(N.check(c, { Ra: 1.6, Rz: 9 }).pass, true);
  assert.equal(N.check(c, { Ra: 1.6000001, Rz: 9 }).pass, false);
  const z = N.makeCallout({ param: 'Rz', value: 6.3 });
  assert.equal(N.check(z, { Ra: 0.1, Rz: 6.2 }).pass, true);
  assert.equal(N.makeCallout({ value: 1.5 }).value, 1.6, 'limits snap to the series');
});

test('the quiz answers are worked out from the model', () => {
  const items = Q.build();
  assert.equal(items.length, 10);
  assert.equal(new Set(items.map((q) => q.id)).size, items.length);
  for (const q of items) {
    assert.ok(q.options.some((o) => o.id === q.answer), q.id + ' answer is an option');
    assert.ok(q.explain.length > 40, q.id + ' explains itself');
  }
  const by = Object.fromEntries(items.map((q) => [q.id, q]));
  assert.equal(by['removal-prohibited'].answer, 'prohibited');
  assert.equal(by['any-process'].answer, 'any');
  assert.equal(by['which-standard'].answer, 'current');
  assert.equal(by['lay-side'].answer, '=');
  assert.equal(by['lay-front'].answer, '⊥');
  assert.equal(by['n-grade'].answer, '3.2');
  assert.equal(by.triangles.answer, '3');
  assert.equal(by['rz-grade'].answer, 'none');
  assert.equal(by.scratch.answer, 'Rt');
  assert.equal(by.direction.answer, 'smaller');
});
