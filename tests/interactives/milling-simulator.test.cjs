// Focused tests for interactives/milling-simulator: the part model, the
// machine rules, and the inspection of the part that is left.
// Run: node --test --test-concurrency=2 tests/interactives/milling-simulator.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MOD = path.join(ROOT, 'interactives', 'milling-simulator');
const M = require(path.join(MOD, 'model.js'));
const I = require(path.join(MOD, 'inspect.js'));
const J = require(path.join(MOD, 'jobs.js'));

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

/* A move the learner makes; fails the test if the machine refuses it,
   unless the caller says a refusal is expected. */
function go(s, target, expectCode) {
  const r = s.moveTo(target);
  if (expectCode) {
    assert.ok(r.blocked, `expected ${expectCode} for ${JSON.stringify(target)}`);
    assert.equal(r.blocked.code, expectCode, r.blocked.message);
  } else {
    assert.equal(r.blocked, null, r.blocked && `${JSON.stringify(target)}: ${r.blocked.code} ${r.blocked.message}`);
  }
  return r;
}
function load(s, id) { const r = s.loadTool(id); assert.ok(r.ok, r.message); return r; }
function report(s, id) { return I.inspect(s, J.BY_ID[id]); }
function row(rep, id) { return rep.rows.find((r) => r.id === id); }
function why(rep) {
  return rep.rows.map((r) => `${r.id}:${r.status} ${r.checks.filter((c) => !c.ok).map((c) => c.text).join(' | ')}`).join('\n');
}

/* Two face-mill passes across the whole top at Z 0. */
function faceTop(s) {
  load(s, 'fm50');
  go(s, { x: -30, y: 18, z: 20 }); go(s, { z: 0 }); go(s, { x: 130 });
  go(s, { y: 42 }); go(s, { x: -30 });
}

/* ---- the part model ------------------------------------------------------*/

test('a fresh block is the raw stock everywhere, and the raster agrees', () => {
  const s = M.create();
  near(s.heightAt(0.1, 0.1), 1, 1e-12, 'raw top');
  near(s.heightAt(99.9, 59.9), 1, 1e-12, 'raw top');
  assert.equal(s.heightAt(-0.1, 30), -Infinity, 'no stock off the block');
  assert.equal(s.nx * s.ny, 400 * 240);
  assert.ok(s.raster.every((v) => v === 1));
});

test('the raster equals the exact surface at every cell centre after a varied session', () => {
  const s = M.create();
  faceTop(s);
  load(s, 'em8'); go(s, { x: 50, y: 30, z: 5 }); go(s, { z: -6 }); go(s, { x: 62.3, y: 37.9 });
  load(s, 'sp12'); go(s, { x: 20, y: 20, z: 3 }); go(s, { z: -2.7 }); go(s, { x: 30, y: 25 });
  load(s, 'dr5'); go(s, { x: 80, y: 30, z: 2 }); go(s, { z: -23 });
  let worst = 0;
  for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) {
    const d = Math.abs(s.rasterAt(i, j) - s.heightAt(s.cellX(i), s.cellY(j)));
    if (d > worst) worst = d;
  }
  assert.ok(worst < 1e-9, `raster departs from the exact surface by ${worst}`);
  // and rebuilding the raster from the cuts alone gives the same picture
  const copy = Float64Array.from(s.raster);
  s.rebuildRaster();
  for (let k = 0; k < copy.length; k++) assert.equal(Math.max(copy[k], -20), Math.max(s.raster[k], -20));
});

test('removed volume is the swept solid: a facing pass is width x length x depth', () => {
  const s = M.create();
  load(s, 'fm50');
  go(s, { x: -30, y: 18, z: 20 }); go(s, { z: 0 });
  const r = go(s, { x: 130 });
  // the cutter covers Y -7..43 of a 0..60 block: 43 x 100 x 1
  near(r.volume, 4300, 1e-6, 'first pass');
  const r2 = go(s, { y: 42 }) && go(s, { x: -30 });
  near(r2.volume, 1700, 1e-6, 'second pass takes only the strip the first one left');
  const s2 = M.create();
  load(s2, 'em12'); go(s2, { x: 50, y: 30, z: 5 });
  const p = go(s2, { z: -6 });
  near(p.volume, Math.PI * 36 * 7, Math.PI * 36 * 7 * 0.01, 'plunge: a cylinder of the cutter 7 mm deep (from the raw top)');
});

test('undo puts back exactly what the move took, back to the raw block', () => {
  const s = M.create();
  faceTop(s);
  load(s, 'em10'); go(s, { x: 35, y: 30, z: 5 }); go(s, { z: -5 }); go(s, { x: 65 });
  load(s, 'dr5'); go(s, { x: 15, y: 30, z: 2 }); go(s, { z: -16 }); go(s, { z: 2 });
  load(s, 'tapM6'); go(s, { x: 15, y: 30, z: 2 }); go(s, { z: -14 });
  assert.equal(s.threads.length, 1);
  const before = Float64Array.from(s.raster);
  load(s, 'em12'); go(s, { x: 50, y: 30, z: 5 }); go(s, { z: -8 });
  s.undo(); s.undo(); s.undo();                    // two moves and the tool change
  assert.equal(s.tool.id, 'tapM6', 'the tool change is undone too');
  assert.deepEqual(Array.from(s.raster), Array.from(before), 'cells restored');
  assert.equal(s.threads.length, 1);
  s.undo();
  assert.equal(s.threads.length, 0, 'undoing the tapping removes its thread');
  let n = 0;
  while (s.canUndo()) { s.undo(); n++; }
  assert.ok(n > 10);
  assert.ok(s.raster.every((v) => v === 1), 'every cell back to the raw top');
  assert.equal(s.prims.length, 0);
  assert.equal(s.tool, null);
  assert.deepEqual(s.pos, M.SETUP.home);
  near(s.removed, 0, 1e-9, 'removed volume back to zero');
});

test('moves run the safe way round: up before across, across before down', () => {
  const s = M.create();
  load(s, 'em8');
  let p = s.plan({ x: 50, y: 30, z: -3 });
  assert.deepEqual(p.legs.map((l) => l.axis), ['xy', 'z'], 'going down: across first');
  go(s, { x: 50, y: 30, z: 5 });
  s.pos.z = -3;
  p = s.plan({ x: 10, y: 10, z: 10 });
  assert.deepEqual(p.legs.map((l) => l.axis), ['z', 'xy'], 'going up: up first');
  p = s.plan({ x: 500 });
  assert.ok(p.note, 'past the travel is clamped, with a note');
  assert.equal(p.target.x, M.SETUP.travel.x1);
});

test('typed numbers accept a true minus sign and a decimal comma', () => {
  assert.equal(M.parseNum('−6.5'), -6.5);
  assert.equal(M.parseNum(' -6,5 '), -6.5);
  assert.equal(M.parseNum('+3'), 3);
  assert.ok(Number.isNaN(M.parseNum('')));
  assert.ok(Number.isNaN(M.parseNum('6 mm')));
  assert.equal(M.fmtSigned(-6, 2), '−6.00');
  assert.equal(M.fmtSigned(-0.0001, 2), '0.00', 'never minus zero');
  assert.equal(M.fmtSigned(1, 2), '+1.00');
});

/* ---- the machine rules ---------------------------------------------------*/

test('a face mill cannot be pushed down into metal, and the refusal removes nothing', () => {
  const s = M.create();
  load(s, 'fm50');
  go(s, { x: 50, y: 30, z: 5 });
  const r = go(s, { z: 0 }, 'plunge');
  assert.equal(r.volume, 0);
  near(s.pos.z, 1, 1e-4, 'it stops on the surface');
  assert.ok(s.raster.every((v) => v === 1));
  // beside the part it goes down freely, then feeds across
  go(s, { z: 5 }); go(s, { x: -30 }); go(s, { z: 0 }); go(s, { x: 20 });
});

test('a face mill cuts no deeper than its inserts reach', () => {
  const s = M.create();
  load(s, 'fm50');
  go(s, { x: -30, y: 30, z: -3.1 });
  go(s, { x: 10 }, 'reach');                       // 4.1 mm deep from the raw top
  const s2 = M.create();
  load(s2, 'fm50');
  go(s2, { x: -30, y: 30, z: -2.9 });
  go(s2, { x: 130 });                              // 3.9 mm: fine
});

test('drills, taps and the boring bar only feed along their axis', () => {
  for (const id of ['dr5', 'tapM6', 'bore']) {
    const s = M.create();
    if (id === 'tapM6' || id === 'bore') { load(s, 'dr10'); go(s, { x: 50, y: 30, z: 2 }); go(s, { z: -12 }); go(s, { z: 2 }); }
    load(s, id);
    go(s, { x: 50, y: 30, z: 2 });
    go(s, { z: id === 'tapM6' ? 1.5 : -5 });
    if (id === 'tapM6') { s.pos.z = -3; }
    go(s, { x: 60 }, 'side');
    // raised clear, the same move is fine
    go(s, { z: 5 }); go(s, { x: 60 });
  }
});

test('a refused move stops at the contact and can always be backed out', () => {
  const s = M.create();
  load(s, 'em10'); go(s, { x: 50, y: 30, z: 5 }); go(s, { z: -6 }); go(s, { x: 70 });
  load(s, 'dr5');
  go(s, { x: 60, y: 30, z: 2 }); go(s, { z: -4 });   // inside the slot, above its floor
  go(s, { x: 80 }, 'side');                         // runs into the slot's end wall
  // the exact contact is X 72.50; contact is found on the 0.25 mm raster
  const stopped = s.pos.x;
  assert.ok(stopped >= 72.5 - 1e-6 && stopped <= 72.5 + 0.25, `stops where the drill meets the wall (${stopped})`);
  go(s, { x: 55 });                                 // and backs away again
});

test('end mills plunge, but only as deep as their flutes reach', () => {
  const s = M.create();
  load(s, 'em6');
  go(s, { x: 50, y: 30, z: 5 });
  go(s, { z: -11.9 });                              // 12.9 mm from the raw top: within 13
  go(s, { z: 5 }); go(s, { x: 70 });
  go(s, { z: -15 }, 'reach');
  near(s.pos.z, 1 - 13, 1e-3, 'stops with the flutes just buried');
});

test('the vise jaws, the parallels and the vise floor are in the way', () => {
  const s = M.create();
  load(s, 'em12');
  go(s, { x: 50, y: 3, z: 5 });
  go(s, { z: -10 }, 'jaw');                         // 6 mm radius reaches over the front jaw
  near(s.pos.z, M.SETUP.jawTop, 1e-3, 'stops at the top of the jaw');
  const s2 = M.create();
  load(s2, 'dr6.6'); go(s2, { x: 50, y: 4, z: 5 });
  go(s2, { z: -23 }, 'parallel');
  const s3 = M.create();
  load(s3, 'dr6.6'); go(s3, { x: 50, y: 30, z: 5 });
  go(s3, { z: -23 });                               // between the parallels: through
  go(s3, { z: -40 }, 'floor');
});

test('the boring head needs a pilot hole and adjusts only when clear of the work', () => {
  const s = M.create();
  load(s, 'bore');
  assert.equal(s.tool.dia, 20);
  go(s, { x: 50, y: 30, z: 2 });
  go(s, { z: -5 }, 'pilot');
  assert.ok(!s.setBoreDia(50).ok, 'beyond its range');
  load(s, 'dr10'); go(s, { x: 50, y: 30, z: 2 }); go(s, { z: -24 }); go(s, { z: 2 });
  load(s, 'bore');
  assert.ok(s.setBoreDia(18.5).ok);
  go(s, { x: 50, y: 30, z: 2 }); go(s, { z: -21 });
  assert.ok(!s.setBoreDia(20).ok, 'cannot be adjusted down in the hole');
  go(s, { z: 2 });
  assert.ok(s.setBoreDia(20).ok);
  go(s, { z: -21 });
  const o = s.openingAt(50, 30, -10, 15);
  const c = M.fitCircle(o.pts);
  near(2 * c.r, 20, 0.01, 'bored diameter is the setting');
});

test('side cuts report climb or conventional the way a clockwise cutter meets the metal', () => {
  const s = M.create();
  load(s, 'em12');
  go(s, { x: -10, y: -4, z: -2 });
  // feeding +X along the front edge: the metal is on the cutter's left
  assert.equal(go(s, { x: 40 }).side, 'conventional');
  go(s, { y: -3 });
  // feeding back -X with the metal now on the right
  assert.equal(go(s, { x: -10 }).side, 'climb');
  go(s, { x: 50, y: 30 });
  assert.equal(go(s, { x: 90 }).side, 'both', 'a slot the full width of the cutter');
});

/* ---- tapping ------------------------------------------------------------*/

function drilled(id, x, depth) {
  const s = M.create();
  load(s, id); go(s, { x, y: 30, z: 2 }); go(s, { z: depth }); go(s, { z: 2 });
  return s;
}

test('a tap needs a hole of the tap-drill size, lined up, and stops at the drill point', () => {
  let s = M.create();
  load(s, 'tapM6'); go(s, { x: 15, y: 30, z: 2 }); go(s, { z: -10 }, 'tap-nohole');
  assert.equal(s.threads.length, 0);
  s = drilled('dr4.2', 15, -16); load(s, 'tapM6'); go(s, { x: 15, y: 30, z: 2 });
  go(s, { z: -10 }, 'tap-small');
  s = drilled('dr6', 15, -16); load(s, 'tapM6'); go(s, { x: 15, y: 30, z: 2 });
  go(s, { z: -10 }, 'tap-large');
  s = drilled('dr5', 15, -16); load(s, 'tapM6'); go(s, { x: 15.4, y: 30, z: 2 });
  go(s, { z: -10 }, 'tap-align');
  // centred, too deep for the hole: it stops where the point narrows the hole
  s = drilled('dr5', 15, -10); load(s, 'tapM6'); go(s, { x: 15, y: 30, z: 2 });
  go(s, { z: -14 }, 'tap-bottom');
  assert.ok(s.pos.z < -8.5 && s.pos.z > -8.8, `stops at the start of the drill point (${s.pos.z})`);
  assert.equal(s.threads.length, 1);
  near(s.threads[0].fullBottom, s.pos.z + 4, 1e-9, 'full thread ends four pitches above the tip');
  // within reach, a normal tapping pass
  s = drilled('dr5', 15, -16); load(s, 'tapM6'); go(s, { x: 15, y: 30, z: 2 }); go(s, { z: -14 });
  assert.equal(s.threads[0].quality, 'ok');
  near(s.threads[0].hole, 5, 0.01, 'hole size read from the metal');
});

test('an M8 tap in the M6 clearance-size hole cuts an undersize thread, which inspection rejects', () => {
  const s = drilled('dr6.6', 15, -16);
  load(s, 'tapM8'); go(s, { x: 15, y: 30, z: 2 }); go(s, { z: -12 });
  assert.equal(s.threads[0].quality, 'tight');
});

test('a tap passes through a countersink to the hole below', () => {
  const s = M.create();
  load(s, 'sp12'); go(s, { x: 15, y: 30, z: 2 }); go(s, { z: -3.5 }); go(s, { z: 2 });
  load(s, 'dr5'); go(s, { x: 15, y: 30, z: 2 }); go(s, { z: -16 }); go(s, { z: 2 });
  load(s, 'tapM6'); go(s, { x: 15, y: 30, z: 2 }); go(s, { z: -14 });
  assert.equal(s.threads.length, 1);
});

/* ---- the jobs: made by real tool moves ----------------------------------*/

function job1EndMill(s) {
  faceTop(s);
  load(s, 'em12');
  go(s, { x: 81, y: -10, z: 20 }); go(s, { z: -6 });
  go(s, { y: 70 }); go(s, { x: 92 }); go(s, { y: -10 }); go(s, { x: 100 }); go(s, { y: 70 });
  go(s, { z: 20 });
}

test('job 1 made with a face mill and an end mill', () => {
  const s = M.create();
  let rep = report(s, 'shoulder');
  assert.equal(rep.complete, false);
  assert.equal(row(rep, 'top').status, 'none');
  job1EndMill(s);
  rep = report(s, 'shoulder');
  assert.ok(rep.complete, why(rep));
  assert.equal(rep.excessCells + rep.overCells, 0);
});

test('job 1 made with the face mill alone, in two passes for the shoulder', () => {
  const s = M.create();
  faceTop(s);
  for (const z of [-4, -6]) { go(s, { x: 100, y: -30, z: 5 }); go(s, { z }); go(s, { y: 90 }); go(s, { z: 5 }); }
  const rep = report(s, 'shoulder');
  assert.ok(rep.complete, why(rep));
});

test('job 1: the cutter put on the wall line instead of one radius off it cuts too far, and undo recovers', () => {
  const s = M.create();
  faceTop(s);
  load(s, 'em12');
  go(s, { x: 75, y: -10, z: 20 }); go(s, { z: -6 }); go(s, { y: 70 }); go(s, { z: 20 });
  let rep = report(s, 'shoulder');
  assert.equal(rep.overcut, true);
  const r = row(rep, 'shoulder');
  assert.equal(r.status, 'over');
  assert.ok(r.checks.some((c) => /cut 6\.00 mm too far/.test(c.text)), why(rep));
  assert.ok(rep.overCells > 0);
  s.undo(); s.undo(); s.undo(); s.undo();          // back to before the wrong pass
  rep = report(s, 'shoulder');
  assert.equal(rep.overcut, false);
  go(s, { x: 81, y: -10, z: 20 }); go(s, { z: -6 });
  go(s, { y: 70 }); go(s, { x: 92 }); go(s, { y: -10 }); go(s, { x: 100 }); go(s, { y: 70 });
  rep = report(s, 'shoulder');
  assert.ok(rep.complete, why(rep));
});

function pocket(s, tool, r) {
  load(s, tool);
  const x0 = 30 + r, x1 = 70 - r, y0 = 18 + r, y1 = 42 - r;
  go(s, { x: 50, y: 30, z: 5 }); go(s, { z: -6 });
  for (let y = y0; y <= y1 + 1e-9; y += r) { go(s, { x: x0, y }); go(s, { x: x1, y }); }
  go(s, { x: x0, y: y0 }); go(s, { x: x1, y: y0 }); go(s, { x: x1, y: y1 }); go(s, { x: x0, y: y1 }); go(s, { x: x0, y: y0 });
  go(s, { z: 5 });
}
function throughHoles(s, id) {
  load(s, id);
  for (const x of [15, 85]) { go(s, { x, y: 30, z: 5 }); go(s, { z: -23 }); go(s, { z: 5 }); }
}

test('job 2 made with the 8 mm end mill, and again with the 6 mm', () => {
  for (const [tool, r] of [['em8', 4], ['em6', 3]]) {
    const s = M.create();
    faceTop(s); pocket(s, tool, r); throughHoles(s, 'dr6.6');
    const rep = report(s, 'pocket');
    assert.ok(rep.complete, tool + '\n' + why(rep));
    const pr = row(rep, 'pocket');
    assert.match(pr.measured, new RegExp('corners R' + r + '\\.0'));
  }
});

test('job 2: a 12 mm end mill leaves corners too round to pass', () => {
  const s = M.create();
  faceTop(s); pocket(s, 'em12', 6); throughHoles(s, 'dr6.6');
  const rep = report(s, 'pocket');
  assert.equal(rep.complete, false);
  const pr = row(rep, 'pocket');
  assert.equal(pr.status, 'todo');
  assert.ok(pr.checks.some((c) => !c.ok && /about R6\.0, rounder than R4/.test(c.text)), why(rep));
  assert.ok(pr.checks.filter((c) => /wall/.test(c.text)).every((c) => c.ok), 'its walls are right');
});

test('job 2: a 6.0 drill gives undersize clearance holes', () => {
  const s = M.create();
  faceTop(s); pocket(s, 'em8', 4); throughHoles(s, 'dr6');
  const rep = report(s, 'pocket');
  const h = row(rep, 'hole-left');
  assert.ok(h.checks.some((c) => !c.ok && /6\.00: 0\.60 mm too small/.test(c.text)), why(rep));
});

function job3(s, opts) {
  opts = opts || {};
  if (!opts.faceLast) faceTop(s);
  load(s, opts.slotTool || 'em10');
  go(s, { x: 35, y: 30, z: 5 }); go(s, { z: -5 }); go(s, { x: 65 }); go(s, { z: 5 });
  load(s, 'sp12');
  for (const x of [15, 85]) { go(s, { x, y: 30, z: 2 }); go(s, { z: -3.5 }); go(s, { z: 2 }); }
  load(s, 'dr5');
  for (const x of [15, 85]) { go(s, { x, y: 30, z: 2 }); go(s, { z: opts.drillTo || -16 }); go(s, { z: 2 }); }
  load(s, 'tapM6');
  for (const x of [15, 85]) { go(s, { x, y: 30, z: 2 }); go(s, { z: -14 }, opts.tapExpect); go(s, { z: 2 }); }
  if (opts.faceLast) faceTop(s);
}

test('job 3 made in the usual order, and with the top faced last', () => {
  for (const faceLast of [false, true]) {
    const s = M.create();
    job3(s, { faceLast });
    const rep = report(s, 'tapped');
    assert.ok(rep.complete, why(rep));
    const t = row(rep, 'tap-left');
    assert.ok(t.checks.some((c) => c.ok && /Full thread reaches 10\.00 deep/.test(c.text)));
    assert.ok(t.checks.some((c) => c.ok && /Countersink Ø7\.00/.test(c.text)), why(rep));
  }
});

test('job 3: a slot cut with an 8 mm cutter down its centre line is too narrow', () => {
  const s = M.create();
  job3(s, { slotTool: 'em8' });
  const rep = report(s, 'tapped');
  const r = row(rep, 'slot');
  assert.ok(r.checks.some((c) => !c.ok && /Width 8\.00: 2\.00 mm too narrow/.test(c.text)), why(rep));
});

test('job 3: drilled too shallow, the tap bottoms out and the thread is short', () => {
  const s = M.create();
  job3(s, { drillTo: -12, tapExpect: 'tap-bottom' });
  const rep = report(s, 'tapped');
  const t = row(rep, 'tap-left');
  assert.ok(t.checks.some((c) => !c.ok && /Full thread reaches 6\.\d\d deep; the drawing needs 10\.00/.test(c.text)), why(rep));
});

function job4(s, opts) {
  opts = opts || {};
  faceTop(s);
  if (opts.endMill) {
    load(s, 'em12');
    for (const z of [-2.5, -5]) {
      go(s, { x: -10, y: -10, z: 5 }); go(s, { z });
      for (const y of [-3, 6]) { go(s, { x: -10, y }); go(s, { x: 110, y }); }
      for (const y of [54, 63]) { go(s, { x: 110, y }); go(s, { x: -10, y }); }
      for (const x of [-3, 6, 12, 19]) { go(s, { x, y: 6 }); go(s, { x, y: 54 }); }
      go(s, { x: 81, y: 54 });                     // round the back of the boss, not across it
      for (const x of [81, 88, 94, 103]) { go(s, { x, y: 54 }); go(s, { x, y: 6 }); }
      go(s, { x: 19, y: 9 }); go(s, { x: 81, y: 9 }); go(s, { x: 81, y: 51 }); go(s, { x: 19, y: 51 }); go(s, { x: 19, y: 9 });
      go(s, { z: 5 });
    }
  } else {
    load(s, 'fm50');
    for (const z of [-4, -5]) {
      for (const x of [0, 100]) { go(s, { x, y: -40, z: 5 }); go(s, { z }); go(s, { y: 100 }); go(s, { z: 5 }); }
      for (const y of [-10, 70]) { go(s, { x: -30, y, z: 5 }); go(s, { z }); go(s, { x: 130 }); go(s, { z: 5 }); }
    }
  }
  if (opts.millPilot) { load(s, 'em12'); go(s, { x: 50, y: 30, z: 5 }); go(s, { z: -21 }); go(s, { z: 5 }); }
  else { load(s, 'dr10'); go(s, { x: 50, y: 30, z: 5 }); go(s, { z: -24 }); go(s, { z: 5 }); }
  load(s, 'bore'); assert.ok(s.setBoreDia(20).ok);
  go(s, { x: 50, y: 30, z: 5 }); go(s, { z: -21 }); go(s, { z: 5 });
  load(s, 'sp12');
  for (const x of [25, 75]) { go(s, { x, y: 10, z: 5 }); go(s, { z: -1 }); go(s, { y: 50 }); go(s, { z: 5 }); }
  for (const y of [15, 45]) { go(s, { x: 20, y, z: 5 }); go(s, { z: -1 }); go(s, { x: 80 }); go(s, { z: 5 }); }
}

test('job 4 made with the face mill round the boss, a drilled pilot and the boring head', () => {
  const s = M.create();
  job4(s);
  const rep = report(s, 'boss');
  assert.ok(rep.complete, why(rep));
  assert.match(row(rep, 'bore').measured, /Ø20\.00 through/);
  assert.equal(row(rep, 'chamfer').measured, '1.00 / 1.00 / 1.00 / 1.00');
});

test('job 4 made with an end mill round the boss and a milled pilot hole', () => {
  const s = M.create();
  job4(s, { endMill: true, millPilot: true });
  const rep = report(s, 'boss');
  assert.ok(rep.complete, why(rep));
});

/* ---- features spoiled by later cuts ----------------------------------------*/

test('a later cut through a finished thread is caught, whatever came before it', () => {
  const s = M.create();
  job3(s);
  assert.ok(report(s, 'tapped').complete);
  // a careless slot pass straight through the left tapped hole
  load(s, 'em10'); go(s, { x: 15, y: 15, z: 5 }); go(s, { z: -5 }); go(s, { y: 45 }); go(s, { z: 5 });
  const rep = report(s, 'tapped');
  assert.equal(rep.complete, false);
  assert.equal(rep.overcut, true);
  const t = row(rep, 'tap-left');
  assert.equal(t.status, 'over');
  assert.ok(t.checks.some((c) => !c.ok && /top of the thread was cut away down to Z −5\.00/.test(c.text)), why(rep));
  assert.equal(row(rep, 'tap-right').status, 'ok', 'the other hole is untouched');
  s.undo(); s.undo(); s.undo(); s.undo(); s.undo();
  assert.ok(report(s, 'tapped').complete, 'undo recovers the finished part');
});

test('drilling a bigger hole through a tapped one strips its thread', () => {
  const s = M.create();
  job3(s);
  load(s, 'dr6.8'); go(s, { x: 85, y: 30, z: 2 }); go(s, { z: -16 });
  const rep = report(s, 'tapped');
  const t = row(rep, 'tap-right');
  assert.ok(t.checks.some((c) => !c.ok && /cut away by a later cut/.test(c.text)), why(rep));
});

test('a part with a stray cut anywhere is not complete, and the stray is located', () => {
  const s = M.create();
  job1EndMill(s);
  load(s, 'dr5'); go(s, { x: 40, y: 40, z: 2 }); go(s, { z: -3 });
  const rep = report(s, 'shoulder');
  assert.equal(rep.complete, false);
  const top = row(rep, 'top');
  assert.equal(top.status, 'over');
  assert.ok(top.checks.some((c) => /around X 40 Y 40|below Z 0\.00/.test(c.text)), why(rep));
});

/* ---- the job data --------------------------------------------------------*/

test('every job feature has an inspection, sits on the block and is drawn', () => {
  const known = Object.keys(I.MEASURE);
  for (const job of J.JOBS) {
    assert.ok(job.title && job.brief, job.id);
    for (const f of job.features) {
      assert.ok(known.includes(f.type), `${job.id}/${f.id}: ${f.type}`);
      assert.ok(f.label, f.id);
      if (f.type === 'hole') assert.ok(f.cx > 0 && f.cx < 100 && f.cy > 0 && f.cy < 60);
    }
    if (!job.free) {
      assert.ok(job.hints.length >= 3, job.id + ' hints');
      assert.ok(job.dims.length >= 3, job.id + ' dims');
    }
    for (const d of job.dims) assert.ok(['top', 'front'].includes(d.view));
  }
  // every through hole is clear of the parallels, so each job can be made
  for (const job of J.JOBS) for (const f of job.features) {
    if (f.type !== 'hole' || !f.through) continue;
    for (const p of M.SETUP.parallels) assert.ok(f.cy - f.d / 2 > p.y1 || f.cy + f.d / 2 < p.y0, `${f.id} clears ${p.name}`);
  }
});

test('the inspection of a whole job is quick enough to run after every move', () => {
  const s = M.create();
  job3(s);
  const t0 = Date.now();
  for (let k = 0; k < 5; k++) report(s, 'tapped');
  const per = (Date.now() - t0) / 5;
  assert.ok(per < 400, `inspection took ${per} ms`);
});
