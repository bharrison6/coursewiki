'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const M = require('./model.js'), D = require('./render.js');
const SETTINGS = []; for (const lead of M.LEADS) for (const clearance of M.CLEARANCES) SETTINGS.push({ lead, clearance });
function rng(seed) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }

test('the clamp rule reproduces the coordinator check, using phase s directly', () => {
  let c = 0; for (const s of [0, 0.25, 0.5, 0.75, 1.0]) c = M.clampToBand(c, s, 0.2);
  assert.ok(Math.abs(c - 0.9) < 1e-12);
  for (const s of [0.95, 0.9, 0.85, 0.8]) { c = M.clampToBand(c, s, 0.2); assert.ok(Math.abs(c - 0.9) < 1e-12, 'holds at s=' + s); }
  c = M.clampToBand(c, 0.79, 0.2); assert.ok(Math.abs(c - 0.89) < 1e-12);
  assert.ok(Math.abs(M.deadBand(5, 0.2).degrees - 14.4) < 1e-12);
});

test('random handwheel walks never let |s - c| exceed B/2, and the phase follows the right-hand sign', () => {
  for (const o of SETTINGS) {
    const r = rng(17 + o.lead * 100 + o.clearance * 1000); let s = M.create(o);
    for (let i = 0; i < 4000; i++) {
      const n = (r() < 0.5 ? -1 : 1) * Math.floor(r() * 40) * (r() < 0.3 ? 0.25 : 1);
      const before = s; s = M.turnBy(s, n); const snap = M.snapshot(s);
      assert.ok(Math.abs(snap.phase - s.carriage) <= o.clearance / 2 + 1e-9, 'band invariant');
      assert.ok(Math.abs(snap.phase + o.lead * snap.screwDegrees / 360) < 1e-9, 's = -L phi / 360');
      if (s.turn > before.turn) assert.ok(snap.screwDegrees < M.snapshot(before).screwDegrees, 'forward (+X) travel is negative rotation about +X');
      assert.ok(s.carriage >= M.TRAVEL.min - 1e-9 && s.carriage <= M.TRAVEL.max + o.clearance + 1e-9);
    }
  }
});

test('after a reversal the carriage stands still for exactly B of screw travel', () => {
  for (const o of SETTINGS) for (const from of [1, -1]) {
    let s = M.turnBy(M.create(o), from * 300); const c0 = s.carriage, s0 = M.phase(s), step = 0.01;
    let moved = null;
    for (let i = 1; i < 100000 && moved === null; i++) { s = M.turnBy(s, -from * step); if (Math.abs(s.carriage - c0) > 1e-12) moved = Math.abs(M.phase(s) - s0); }
    const stepMm = step * o.lead / M.DIVISIONS;
    assert.ok(moved > o.clearance - 1e-9 && moved <= o.clearance + stepMm + 1e-9, `${o.lead}/${o.clearance}: held for ${moved} mm`);
    const band = M.deadBand(o.lead, o.clearance);
    assert.ok(Math.abs(band.degrees - 360 * o.clearance / o.lead) < 1e-12 && Math.abs(band.divisions * band.divisionMm - o.clearance) < 1e-12);
  }
  assert.deepEqual([M.deadBand(5, 0.2).divisions, M.deadBand(2, 0.2).divisions, M.deadBand(2, 0.2).degrees], [4, 10, 36]);
});

test('same-direction approach lands within 1e-9 of 25.00 mm; direct reversal misses by B', () => {
  for (const o of SETTINGS) {
    const [direct, same] = D.positioningRows(o.lead, o.clearance).map(r => r.a);
    assert.equal(direct.reading, 25); assert.equal(same.reading, 25);
    assert.ok(Math.abs(same.carriage - 25) < 1e-9, 'lands'); assert.equal(same.approach, 'forward');
    assert.ok(Math.abs(direct.error - o.clearance) < 1e-9, 'misses by B'); assert.equal(direct.approach, 'reverse');
  }
  // Backing off by less than B and coming forward again still misses.
  const s = M.replay({ lead: 5, clearance: 0.2 }, [512, -14, 2]).state; // 25.60 -> 24.90 -> 25.00, back-off 0.10 < B
  assert.equal(M.reading(s), 25); assert.ok(Math.abs(s.carriage - 25.1) < 1e-9);
  for (const o of SETTINGS) { const p = M.positioningPlan(o.clearance); assert.ok(p.overshoot - p.target > o.clearance && p.target - p.backTo > o.clearance); }
  assert.throws(() => M.positioningPlan(0), RangeError);
});

test('3D pose exists only at the model\'s own lead and clearance, and then equals the handwheel angle', () => {
  let s = M.turnBy(M.create(), 37); assert.equal(M.isReference(s), true); assert.equal(M.contact(s), 'forward');
  const p = M.referencePose(s); assert.equal(p.carriageMm, s.carriage); assert.equal(p.screwDegrees, M.screwDegrees(s));
  assert.deepEqual(Object.keys(p).sort(), ['carriageMm', 'screwDegrees'], 'pose carries no screw translation and no remapping');
  // During the dead band the model screw turns exactly as far as the handwheel: 3.6 degrees per division.
  const r1 = M.turnBy(s, -1); assert.equal(r1.carriage, s.carriage); assert.ok(Math.abs(M.referencePose(r1).screwDegrees - p.screwDegrees - 3.6) < 1e-9);
  for (const o of SETTINGS) if (!(o.lead === 5 && o.clearance === 1)) assert.equal(M.referencePose(M.turnBy(M.create(o), 50)), null, 'no remapped pose for ' + JSON.stringify(o));
});

test('to-scale thread section: profile matches the Blender specification and contact gaps are 0 and B', () => {
  const A = require('./model-asset.js'), ref = M.threadProfile(5, 1);
  ref.screw.forEach((q, i) => { assert.ok(Math.abs(q[0] - A.geometry.screwProfile[i][0]) < 1e-4); assert.equal(q[1], A.geometry.screwProfile[i][1]); });
  ref.nut.forEach((q, i) => { assert.ok(Math.abs(q[0] - A.geometry.nutProfile[i][0]) < 1e-4); assert.equal(q[1], A.geometry.nutProfile[i][1]); });
  for (const o of SETTINGS) {
    const g = M.threadProfile(o.lead, o.clearance), r = g.rMid, mid = (q0, q1) => q0[0] + (q1[0] - q0[0]) * (r - q0[1]) / (q1[1] - q0[1]);
    // Axial gaps at mid-depth radius between a screw tooth and the nut flanks either side, screw shifted by -u.
    const gaps = u => { const a = mid(g.screw[0], g.screw[1]) - u, b = mid(g.screw[2], g.screw[3]) - u; const nr = mid(g.nut[2], g.nut[3]), nl = mid(g.nut[0], g.nut[1]);
      return { plus: ((nr - b) % o.lead + o.lead) % o.lead, minus: ((a - nl) % o.lead + o.lead) % o.lead }; };
    let s = M.turnBy(M.create(o), 120), q = gaps(M.snapshot(s).offset);
    assert.ok(Math.abs(q.plus) < 1e-9 || Math.abs(q.plus - o.lead) < 1e-9, 'forward drive closes the +X flank'); assert.ok(Math.abs(q.minus - o.clearance) < 1e-9);
    s = M.turnBy(s, -Math.ceil(M.deadBand(o.lead, o.clearance).divisions) - 1); q = gaps(M.snapshot(s).offset);
    assert.ok(Math.abs(q.minus) < 1e-9 || Math.abs(q.minus - o.lead) < 1e-9, 'reverse drive closes the -X flank'); assert.ok(Math.abs(q.plus - o.clearance) < 1e-9);
    assert.match(D.section(s), new RegExp('data-clearance-mm="' + o.clearance + '"'));
  }
});

test('prediction always starts seated on the forward flank, after any earlier moves', () => {
  for (const o of SETTINGS) for (const pre of [[], [100], [100, -37], [-250, 13], [1e5]]) {
    let s = M.create(o); pre.forEach(n => { s = M.turnBy(s, n); });
    const start = M.seatedForward({ lead: s.lead, clearance: s.clearance }, 10);
    assert.equal(M.reading(start), 10); assert.equal(start.carriage, 10); assert.equal(M.contact(start), 'forward');
    // Reversing through less than the dead band leaves the carriage still; one more division moves it.
    const db = M.deadBand(o.lead, o.clearance).divisions, held = M.turnBy(start, -Math.floor(db - 1e-9));
    assert.equal(held.carriage, 10); assert.ok(M.turnBy(start, -Math.ceil(db + 1e-9)).carriage < 10);
  }
  assert.throws(() => M.seatedForward({}, -1), RangeError);
});

test('prediction scoring accepts defensible answers and rejects invalid input', () => {
  assert.equal(M.scorePrediction(5, 0.2, 4, 'divisions').correct, true);
  assert.equal(M.scorePrediction(5, 0.2, 14.4, 'degrees').correct, true);
  assert.equal(M.scorePrediction(5, 0.2, 3, 'divisions').correct, false);
  assert.equal(M.scorePrediction(5, 0.2, 7.2, 'degrees').correct, false);
  // 2 mm lead, 0.05 mm clearance: 2.5 divisions. Either neighbouring whole division is a defensible reading.
  assert.equal(M.scorePrediction(2, 0.05, 2, 'divisions').correct, true); assert.equal(M.scorePrediction(2, 0.05, 3, 'divisions').correct, true);
  assert.equal(M.scorePrediction(2, 0.05, 4, 'divisions').correct, false);
  for (const bad of [NaN, -1, Infinity]) assert.throws(() => M.scorePrediction(5, 0.2, bad, 'divisions'), RangeError);
  assert.throws(() => M.scorePrediction(5, 0.2, 4, 'mm'), RangeError);
});

test('invalid settings and moves are rejected; travel is bounded', () => {
  for (const o of [{ lead: 0 }, { lead: -5 }, { lead: NaN }, { clearance: 0 }, { clearance: -0.1 }, { lead: 2, clearance: 2 }, { clearance: Infinity }, { lead: '5' }])
    assert.throws(() => M.create(o), RangeError, JSON.stringify(o));
  assert.throws(() => M.turnBy(M.create(), NaN), RangeError); assert.throws(() => M.clampToBand(0, 0, -1), RangeError);
  let s = M.turnBy(M.create({ lead: 5, clearance: 0.2 }), 1e6); assert.equal(M.reading(s), M.TRAVEL.max); assert.equal(M.atTravelLimit(s), true);
  assert.equal(M.turnBy(s, 10), s, 'no motion past the end of travel');
  s = M.turnBy(s, -1e7); assert.equal(M.reading(s), M.TRAVEL.min);
  assert.ok(M.TRAVEL.min > -54 + 0.6 && M.TRAVEL.max + 1 < 54, 'lab travel stays inside the model nut full-engagement range');
});

test('shared renderer: static lesson is ID-free, complete and matches the page; live SVGs stay finite', () => {
  const lesson = D.staticLesson();
  assert.doesNotMatch(lesson, /\sid=/); assert.doesNotMatch(lesson, /NaN|undefined|Infinity/);
  for (const t of ['360° × B ÷ L', '14.4°', 'Model limits', 'Reverse straight to the number', '25.20 mm', 'data-width-mm="0.2"']) assert.ok(lesson.includes(t), t);
  assert.equal((lesson.match(/class="bl-section"/g) || []).length, 3);
  let s = M.create({ lead: 2, clearance: 0.05 }); s = M.turnBy(s, -333.25);
  const svg = D.handwheel(s, { from: 0, divisions: 2.5 }) + D.indicator(s) + D.loop([M.snapshot(s)], s, D.loopWindow(s)) + D.section(s) + D.readouts(s);
  assert.doesNotMatch(svg, /NaN|undefined|Infinity/); assert.match(D.indicator(s), />−6\.6\d</);
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'static.cjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('manifest and scene follow the shared runtime pattern without moving the screw', () => {
  const conf = fs.readFileSync(path.join(__dirname, 'interactive.conf'), 'utf8');
  assert.match(conf, /^@@REQUIRES: three-runtime$/m); assert.match(conf, /^@@JS: model-asset\.js, model\.js, render\.js, scene3d\.js, demo\.js$/m);
  const scene = fs.readFileSync(path.join(__dirname, 'scene3d.js'), 'utf8');
  assert.match(scene, /CourseWikiThree/); assert.match(scene, /GLTFLoader/); assert.doesNotMatch(scene, /setAnimationLoop|three-bundle|milling-simulator/);
  assert.doesNotMatch(scene, /screw\.position\.(x|y|z)\s*[-+*/]?=(?!=)|screw\.position\.(set|copy|add)|screw\.(scale|translate)|carriage\.rotation|carriage\.scale/);
  assert.match(scene, /screw\.rotation\.x = /); assert.match(scene, /carriage\.position\.x = /);
});
