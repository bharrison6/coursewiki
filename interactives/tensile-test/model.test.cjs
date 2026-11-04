'use strict';
// Independent checks of the tensile-test teaching model: units, boundaries, invariants and invalid input.
// Run: node --test interactives/tensile-test/model.test.cjs
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const M = require('./model.js'), R = require('./render.js');
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + b + ' got ' + a);
const grid = (c, n) => Array.from({ length: n + 1 }, (_, i) => c.fractureStrain * i / n);

test('units: E = 200 GPa at strain 0.001 gives 200 MPa with zero set; 300 MPa at 0.010 unloads to 0.0085', () => {
  const c = M.curveById('ductile');
  assert.equal(c.E, 200000); // MPa
  close(M.stress(c, 0.001), 200, 1e-9, 'stress at 0.1 % strain');
  assert.equal(M.residualStrain(0.001, 200, 200000), 0);
  close(M.residualStrain(0.010, 300, 200000), 0.0085, 1e-15, 'unload intercept');
  // Force and extension use the stated geometry: A0 = pi/4 * 12.5^2 mm^2, L0 = 50 mm.
  close(M.AREA, Math.PI * 12.5 * 12.5 / 4, 1e-12);
  const r = M.reading(M.moveTo(M.createTest('ductile'), 0.001));
  close(r.force, 200 * M.AREA / 1000, 1e-9, 'kN'); close(r.extension, 0.05, 1e-12, 'mm');
});

test('elastic slope equals E on every synthetic curve, and no curve rises above its elastic line', () => {
  for (const c of M.CURVES) {
    close(M.slope(c, 0), c.E, 1e-6 * c.E, c.id + ' initial slope');
    const e = c.linear / 2;
    close(M.stress(c, e) / e, c.E, 1e-6 * c.E, c.id + ' secant in linear part');
    for (const x of grid(c, 4000)) {
      const s = M.stress(c, x);
      assert.ok(s >= 0, c.id + ' nonnegative stress');
      assert.ok(s <= c.E * x + 1e-6, c.id + ' below elastic line at ' + x);
      assert.ok(M.residualStrain(x, s, c.E) >= 0, c.id + ' set never negative');
    }
  }
});

test('permanent set is clamped at zero and invalid inputs are rejected', () => {
  assert.equal(M.residualStrain(0.0005, 100.0000001, 200000), 0);
  assert.equal(M.residualStrain(0, 0, 70000), 0);
  for (const bad of [[NaN, 1, 1], [0.01, Infinity, 1], [0.01, 1, 0], [0.01, 1, -5], [-0.01, 1, 1], [0.01, -1, 1], ['0.01', 1, 1]])
    assert.throws(() => M.residualStrain(...bad), RangeError);
  assert.throws(() => M.stress(M.CURVES[0], -1e-6), RangeError);
  assert.throws(() => M.stress(M.CURVES[0], 0.31), RangeError);
  assert.throws(() => M.curveById('steel-1020'), RangeError);
  assert.throws(() => M.moveTo(M.createTest('ductile'), NaN), RangeError);
});

test('unloading follows slope E, stops at zero load, keeps the work integral, and reloading rejoins the curve', () => {
  for (const c of M.CURVES.filter(x => x.id !== 'brittle')) {
    const eMax = c.fractureStrain * 0.5, sMax = M.stress(c, eMax);
    let st = M.moveTo(M.createTest(c.id), eMax);
    const work = M.reading(st).workDensity, set = M.residualStrain(eMax, sMax, c.E);
    const part = M.moveTo(st, eMax - 0.25 * sMax / c.E);
    const rp = M.reading(part);
    close((sMax - rp.stress) / (eMax - rp.strain), c.E, 1e-6 * c.E, c.id + ' unloading slope');
    assert.equal(rp.stage, 'unloaded'); assert.equal(rp.workDensity, work, 'unloading path is not added to the area');
    const slack = M.moveTo(st, 0);
    close(slack.e, set, 1e-12, c.id + ' cannot go below the permanent set'); assert.equal(M.reading(slack).stress, 0);
    assert.equal(M.reading(slack).stage, 'slack');
    const back = M.moveTo(slack, eMax);
    close(M.reading(back).stress, sMax, 1e-9, 'reload reaches the envelope'); assert.equal(back.eMax, eMax);
    const on = M.moveTo(back, eMax * 1.1);
    close(M.reading(on).stress, M.stress(c, eMax * 1.1), 1e-9, 'continues on the envelope');
  }
  const elastic = M.moveTo(M.moveTo(M.createTest('ductile'), 0.001), 0);
  assert.equal(elastic.e, 0, 'elastic state recovers fully');
});

test('fracture ends the test: load zero, state frozen, elongation after fracture = ef - sf/E', () => {
  for (const c of M.CURVES) {
    const st = M.moveTo(M.createTest(c.id), 99);
    assert.equal(st.fractured, true);
    assert.equal(M.moveTo(st, 0), st, 'no unloading after fracture');
    const r = M.reading(st);
    assert.equal(r.stress, 0); close(r.permanentSet, c.fractureStrain - c.fractureStress / c.E, 1e-12, c.id);
  }
});

test('0.2 % offset yield lies on both the curve and the offset line, and is the first crossing', () => {
  const d = M.offsetYield(M.curveById('ductile'));
  close(d.strain, 0.002 + 250 / 200000, 1e-9, 'plateau intersection'); close(d.stress, 250, 1e-6);
  for (const c of M.CURVES.filter(x => x.id !== 'brittle')) {
    const y = M.offsetYield(c);
    assert.ok(y, c.id + ' has an offset yield');
    close(M.stress(c, y.strain), c.E * (y.strain - 0.002), 1e-6, c.id + ' meets the line');
    for (let e = 0.002; e < y.strain - 1e-7; e += (y.strain - 0.002) / 200)
      assert.ok(M.stress(c, e) > c.E * (e - 0.002), c.id + ' curve above the line before the crossing');
  }
});

test('the brittle curve has no offset yield: null (undefined), never zero, and the UI text says so', () => {
  const c = M.curveById('brittle');
  assert.equal(M.offsetYield(c), null);
  const p = M.properties(c);
  assert.equal(p.yield, null); assert.notEqual(p.yield, 0); assert.equal(p.necks, false);
  for (const e of grid(c, 2000)) if (e >= 0.002) assert.ok(M.stress(c, e) > c.E * (e - 0.002));
  const html = R.staticLesson();
  assert.match(html, /none: fractures first/); assert.match(html, /undefined, not zero/);
  assert.match(fs.readFileSync(path.join(__dirname, 'demo.js'), 'utf8'), /undefined, not zero/);
});

test('area under the curve: exact integral matches an independent trapezoid sum, is nondecreasing, and is in MJ/m^3', () => {
  for (const c of M.CURVES) {
    const n = 20000; let trap = 0, prevA = 0;
    for (let i = 1; i <= n; i++) {
      const e0 = c.fractureStrain * (i - 1) / n, e1 = c.fractureStrain * i / n;
      trap += (M.stress(c, e0) + M.stress(c, e1)) / 2 * (e1 - e0);
      const a = M.area(c, e1); assert.ok(a >= prevA - 1e-12, c.id + ' monotonic'); prevA = a;
    }
    close(M.area(c, c.fractureStrain), trap, 1e-5 * trap, c.id + ' integral');
    // Work on the gauge length: integral of F d(DeltaL) in N*mm = mJ, compared with area x A0 x L0.
    const st = M.moveTo(M.createTest(c.id), c.fractureStrain * 0.999);
    let work = 0;
    for (let i = 1; i <= n; i++) { const e0 = st.eMax * (i - 1) / n, e1 = st.eMax * i / n; work += (M.stress(c, e0) + M.stress(c, e1)) / 2 * M.AREA * (e1 - e0) * M.GEOMETRY.gaugeLength; }
    close(M.reading(st).work, work / 1000, 1e-4 * work / 1000, c.id + ' joules');
  }
  close(M.area(M.curveById('ductile'), 0.001), 0.5 * 200 * 0.001, 1e-12, 'elastic triangle 0.1 MJ/m^3');
});

test('peak is the global maximum and the neck appears only after it (never for the brittle curve)', () => {
  for (const c of M.CURVES) {
    const p = M.peak(c);
    let best = 0; for (const e of grid(c, 20000)) best = Math.max(best, M.stress(c, e));
    assert.ok(best <= p.stress + 1e-9, c.id + ' nothing on the curve exceeds the peak');
    close(p.stress, best, 0.01, c.id + ' peak found within the sampling resolution');
    for (const f of [0, 0.3, 0.999, 1]) assert.equal(M.specimen(M.moveTo(M.createTest(c.id), p.strain * f)).neck, 0, c.id + ' no neck up to the peak');
    if (p.strain < c.fractureStrain) {
      assert.ok(M.specimen(M.moveTo(M.createTest(c.id), p.strain + (c.fractureStrain - p.strain) * 0.2)).neck > 0, c.id + ' neck after the peak');
      const st = M.moveTo(M.createTest(c.id), p.strain + (c.fractureStrain - p.strain) * 0.2);
      assert.equal(M.reading(st).stage, 'necking');
    } else assert.equal(M.specimen(M.moveTo(M.createTest(c.id), 99)).neck, 0, c.id + ' brittle: no neck');
  }
});

test('specimen length follows strain exactly; uniform thinning conserves volume before the peak', () => {
  const c = M.curveById('ductile');
  const st = M.moveTo(M.createTest('ductile'), 0.1), sp = M.specimen(st);
  close(sp.length, 50 * 1.1, 1e-12);
  const plastic = M.residualStrain(0.1, M.stress(c, 0.1), c.E);
  close(sp.diameter * sp.diameter * (1 + plastic), 12.5 * 12.5, 1e-9, 'constant plastic volume');
});

test('prediction scoring: correct set matches; ignoring spring-back or predicting zero does not', () => {
  for (const c of M.CURVES.filter(x => x.id !== 'brittle')) {
    for (const f of [0.1, 0.5, 0.9]) {
      const st = M.moveTo(M.createTest(c.id), c.fractureStrain * f), s = M.stress(c, st.eMax);
      const set = (st.eMax - s / c.E) * 100;
      assert.equal(M.scorePrediction(set, st).status, 'match');
      assert.equal(M.scorePrediction(Number(set.toFixed(3)), st).status, 'match', 'rounded to the readout precision');
      assert.notEqual(M.scorePrediction(st.eMax * 100, st).status, 'match', 'no spring-back');
      assert.equal(M.scorePrediction(0, st).status, 'miss');
      assert.equal(M.scorePrediction(set / 100, st).status, 'match-ratio', 'ratio typed into a percent box');
    }
  }
  const elastic = M.moveTo(M.createTest('ductile'), 0.001);
  assert.equal(M.scorePrediction(0, elastic).status, 'match');
  assert.notEqual(M.scorePrediction(0.1, elastic).status, 'match');
  for (const bad of [NaN, -1, Infinity, undefined]) assert.equal(M.scorePrediction(bad, elastic).status, 'invalid');
  assert.equal(M.scorePrediction(1, M.moveTo(M.createTest('ductile'), 1)).status, 'invalid', 'no prediction after fracture');
});

test('rankings differ by property: stiffest, strongest, most ductile and toughest are not all the same', () => {
  const top = k => M.ranking(k)[0].id;
  assert.equal(top('stiffness'), 'ductile'); assert.equal(top('strength'), 'ductile');
  assert.equal(top('ductility'), 'polymer'); assert.equal(top('toughness'), 'ductile');
  assert.deepEqual(M.ranking('stiffness').map(r => r.id), ['ductile', 'brittle', 'alloy', 'polymer']);
  assert.deepEqual(M.ranking('toughness').map(r => r.id), ['ductile', 'alloy', 'polymer', 'brittle']);
  for (const k of Object.keys(M.PROPERTY_KEYS)) { const r = M.ranking(k); assert.ok(r[0].value > r[1].value * 1.05, k + ' leader is clear'); }
});

test('crosshead mapping is monotonic and spans 0 to fracture with the linear limit at 15 % of travel', () => {
  for (const c of M.CURVES) {
    assert.equal(M.strainAt(c, 0), 0); close(M.strainAt(c, 1), c.fractureStrain, 1e-15);
    close(M.strainAt(c, 0.15), c.linear, 1e-12 * c.linear + 1e-15);
    let prev = -1; for (let u = 0; u <= 1; u += 0.001) { const e = M.strainAt(c, u); assert.ok(e > prev || e === 0); prev = e; close(M.sliderAt(c, e), Math.min(1, u), 1e-9); }
  }
});

test('status follows the actual curve segment: a level plateau is not described as rising or hardening', () => {
  const at = (id, e) => M.moveTo(M.createTest(id), e), c = M.curveById('ductile');
  for (const e of [0.002, 0.005, 0.01, 0.0149]) {
    const st = at('ductile', e);
    close(M.slope(c, e), 0, 1e-9, 'plateau slope'); close(M.reading(st).stress, 250, 1e-9, 'plateau stress');
    assert.equal(M.phase(st), 'plateau');
    const text = R.statusText(st);
    assert.match(text, /level/); assert.doesNotMatch(text, /rises|hardens|hardening/);
    assert.equal(R.stageText(st), 'Yield plateau');
  }
  for (const e of [0.02, 0.05, 0.1]) { const st = at('ductile', e); assert.ok(M.slope(c, e) > 0); assert.equal(M.phase(st), 'hardening'); assert.match(R.statusText(st), /rises/); }
  assert.equal(M.phase(at('ductile', 0.19)), 'near-peak'); assert.match(R.statusText(at('ductile', 0.19)), /flattening/);
  assert.equal(M.phase(at('ductile', 0.25)), 'necking'); assert.ok(M.slope(c, 0.25) < 0); assert.match(R.statusText(at('ductile', 0.25)), /fall/);
  assert.equal(M.phase(at('ductile', 0.001)), 'elastic');
  // Every plastic point on every curve: text claiming a rise needs a positive slope; a falling claim needs a negative one.
  for (const cv of M.CURVES) for (let i = 1; i < 400; i++) {
    const e = cv.fractureStrain * i / 400, st = at(cv.id, e), text = R.statusText(st), k = M.slope(cv, e);
    if (/curve rises/.test(text)) assert.ok(k > 0.0005 * cv.E, cv.id + ' rises claim at ' + e);
    if (/stays level/.test(text)) assert.ok(Math.abs(k) <= 0.0005 * cv.E, cv.id + ' level claim at ' + e);
    if (/stress fall/.test(text)) assert.ok(k < 0, cv.id + ' falling claim at ' + e);
  }
  assert.match(R.staticLesson(), /level yield plateau \(stress constant at 250 MPa up to 1\.5% strain\)/);
});

test('static fallback is current and carries the annotated curve and model limits', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../collections/materials-and-processes/pages/metals-and-their-properties.html'), 'utf8');
  assert.ok(page.includes(R.staticLesson()), 'run node interactives/tensile-test/static.cjs --write');
  const html = R.staticLesson();
  for (const re of [/0\.2% offset/, /data-tt-unload/, /data-tt-mark="uts"/, /class="tt-area"/, /MJ\/m³/, /<em>K<\/em><sub>IC<\/sub>/, /synthetic/i, /ASTM E8\/E8M/, /Callister/, /9\.815%/])
    assert.match(html, re);
  assert.doesNotMatch(html, /NaN|undefined MPa|Infinity/);
});
