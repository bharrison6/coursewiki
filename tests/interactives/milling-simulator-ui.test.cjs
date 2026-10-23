'use strict';
/* Focused tests for the milling simulator's working interface: the finished
   part laid over the block (demo.js and draw.js) is the inspection's own
   verdict, every move says whether it cut, and the optional first-use
   suggestions are ordinary moves that face the top without spoiling it.
   Run: node --test --test-concurrency=2 tests/interactives/milling-simulator-ui.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MOD = path.join(__dirname, '..', '..', 'interactives', 'milling-simulator');
const M = require(path.join(MOD, 'model.js'));
const I = require(path.join(MOD, 'inspect.js'));
const J = require(path.join(MOD, 'jobs.js'));
const D = require(path.join(MOD, 'draw.js'));
const U = require(path.join(MOD, 'demo.js'));
const JOBS = J.JOBS.filter((j) => !j.free);

function go(s, target) {
  const r = s.moveTo(target);
  assert.equal(r.blocked, null, r.blocked && r.blocked.message);
  return r;
}
/* One face-mill pass half a millimetre too deep along the front of the block. */
function deepPass(s) {
  s.loadTool('fm50');
  go(s, { x: -30, y: 20, z: 20 }); go(s, { z: -0.5 }); go(s, { x: 130 });
}

test('the top-view overlay marks every cell as the inspection does', () => {
  for (const job of JOBS) {
    const s = M.create();
    deepPass(s);
    const F = U.targetField(s, job), cmp = I.compare(s, job);
    let excess = 0, over = 0;
    for (let k = 0; k < s.nx * s.ny; k++) {
      const i = k % s.nx, j = (k - i) / s.nx;
      const v = U.cellState(s.rasterAt(i, j), F.lo[k], F.hi[k], s.stock.bottom);
      if (v === 1) { excess++; assert.ok(cmp.status[k] >= 1, job.id + ' cell ' + k + ' is excess in both'); }
      if (cmp.status[k] === 1) assert.equal(v, 1, job.id + ' cell ' + k);
      if (v === 2) { over++; assert.equal(cmp.status[k], 2, job.id + ' cell ' + k + ' is cut too far in both'); }
    }
    assert.ok(excess > 0 && over > 0, job.id + ': the pass leaves metal to remove and a gouge');
  }
});

test('the overlay is strongest where most metal is still to come off', () => {
  const job = J.BY_ID.shoulder, s = M.create(), F = U.targetField(s, job);
  const k = (x, y) => Math.floor((x - s.stock.x0) / M.CELL) + Math.floor((y - s.stock.y0) / M.CELL) * s.nx;
  const depth = (x, y) => s.heightAt(x, y) - F.nom[k(x, y)];
  assert.ok(Math.abs(depth(40, 30) - 1) < 1e-6, 'the facing allowance is 1 mm');
  assert.ok(Math.abs(depth(90, 30) - 7) < 1e-6, 'over the shoulder, 7 mm');
  assert.ok(U.excessAlpha(depth(90, 30)) > U.excessAlpha(depth(40, 30)) + 0.3);
  for (let d = 0; d < 25; d += 0.5) assert.ok(U.excessAlpha(d + 0.5) >= U.excessAlpha(d), 'never weaker for more metal');
});

test('the section shows metal to remove, metal cut too far and the finished profile', () => {
  const job = J.BY_ID.shoulder, s = M.create();
  const fresh = D.renderSection(s, job, 'front', 30, {});
  assert.match(fresh, /class="ms-excess"/);
  assert.doesNotMatch(fresh, /class="ms-over"/);
  assert.match(fresh, /class="ms-target-line"/);
  const pts = [];
  for (let u = 0; u <= 100; u += 0.25) pts.push([u, Math.max(s.heightAt(Math.min(u, 100 - 1e-9), 30), s.stock.bottom)]);
  const c = D.sectionCompare(job, 'front', 30, pts);
  const z = (u) => -c.target.find((q) => Math.abs(q[0] - u) < 1e-9)[1];
  assert.equal(z(50), 0, 'finished top at Z 0');
  assert.equal(z(90), -6, 'shoulder floor at Z -6');
  deepPass(s);
  assert.match(D.renderSection(s, job, 'front', 20, {}), /class="ms-over"/, 'the gouge shows in the section through it');
  assert.doesNotMatch(D.renderSection(s, J.BY_ID.free, 'front', 30, {}), /ms-excess|ms-over|ms-target-line/, 'free practice has no drawing');
  assert.doesNotMatch(D.renderSection(s, job, 'front', 30, { target: false }), /ms-excess|ms-over|ms-target-line/, 'the overlay can be turned off');
});

test('every move says whether it cut, and an air move says how far above the metal it is', () => {
  const s = M.create();
  s.loadTool('fm50');
  let m = U.describeMove(go(s, { x: 50 }), s);
  assert.equal(m.title, 'Nothing cut.');
  assert.match(m.text, /19\.00 mm above the metal/);
  m = U.describeMove(go(s, { x: -40 }), s);
  assert.equal(m.title, 'Nothing cut.');
  assert.match(m.text, /beside the block/);
  go(s, { z: 0 });
  m = U.describeMove(go(s, { x: 130 }), s);
  assert.equal(m.title, 'Cut.');
  assert.match(m.text, /Removed approximately .* \(grid estimate\)/);
  const r = s.moveTo({ x: 50, z: -10 });
  m = U.describeMove(r, s);
  assert.equal(m.title, 'Stopped.');
  assert.equal(m.warn, true);
});

test('the first-use suggestions are ordinary moves that face the top and then stop', () => {
  for (const job of JOBS) {
    for (const tool of ['fm50', 'em12']) {
      const s = M.create();
      let ns = U.nextStep(s, job);
      assert.ok(ns && !ns.fill && /Choose a tool/.test(ns.text), 'first, a tool');
      s.loadTool(tool);
      go(s, { x: 50 });                       // over the block, as a learner might
      let steps = 0;
      while ((ns = U.nextStep(s, job)) && steps < 5) {
        assert.ok(ns.fill && ns.label, job.id + ' ' + tool + ': ' + ns.text);
        go(s, Object.assign({ x: s.pos.x, y: s.pos.y, z: s.pos.z }, ns.fill));
        steps++;
      }
      assert.equal(steps, 3, 'off the block, down to Z 0 beside it, then across');
      assert.ok(s.removed > 0, 'the last step cut metal');
      const rep = I.inspect(s, job);
      assert.equal(rep.overcut, false, job.id + ' ' + tool + ': the facing pass cut nothing the drawing keeps');
      assert.match(rep.rows[0].measured, /Z 0\.00/, 'part of the top is at Z 0.00');
    }
  }
  const s = M.create();
  assert.match(U.nextStep(s, J.BY_ID.free).text, /Choose a tool/);
  s.loadTool('fm50');
  assert.equal(U.nextStep(s, J.BY_ID.free), null, 'free practice suggests nothing more');
  for (const id of ['dr5', 'tapM6', 'sp12', 'bore']) {
    const h = M.create(); h.loadTool(id);
    const n = U.nextStep(h, J.BY_ID.pocket);
    assert.ok(n && !n.fill, id + ' is told how it is used, not given a move');
  }
});

test('the progress line is the inspection in words', () => {
  const job = J.BY_ID.shoulder, s = M.create();
  assert.equal(U.progressLine(I.inspect(s, job)), 'Nothing cut yet.');
  s.loadTool('fm50'); go(s, { x: -30, y: 30, z: 0 }); go(s, { x: 130 });
  assert.match(U.progressLine(I.inspect(s, job)), /^0 of 2 callouts match\. Top face at Z 0\.00: /);
  const t = M.create(); deepPass(t);
  assert.match(U.progressLine(I.inspect(t, job)), /undo to before the mistake\. Where: Top face at Z 0\.00\./);
});

test('the rack offers every tool, by kind', () => {
  const ids = U.KINDS.flatMap((k) => k.tools.map((t) => t.id));
  assert.deepEqual(ids.slice().sort(), M.TOOLS.map((t) => t.id).sort());
  assert.deepEqual(U.KINDS.map((k) => k.kind), ['face', 'end', 'spot', 'drill', 'tap', 'bore']);
});

test('the interface keeps no target geometry or colours of its own', () => {
  const js = fs.readFileSync(path.join(MOD, 'demo.js'), 'utf8');
  for (const call of ['I.envAt(', 'I.nominalAt(', 'D.targetOutline(', 'D.renderSection(', 'I.inspect(']) assert.ok(js.includes(call), call);
  assert.doesNotMatch(js, /\.features\b/, 'demo.js reads no drawing features itself');
  assert.doesNotMatch(js, /#[0-9a-f]{3,6}\b/i, 'canvas colours come from theme tokens');
  for (const token of ['--cat1', '--cat2', '--cat3']) assert.ok(js.includes("'" + token + "'"), token);
  const cssText = fs.readFileSync(path.join(MOD, 'demo.css'), 'utf8');
  const screen = cssText.slice(0, cssText.indexOf('@media print'));
  assert.doesNotMatch(screen.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-f]{3,6}\b/i, 'screen styles use theme tokens only');
  // the meanings the lesson depends on are stated in the interface
  for (const words of ['tool centre', 'tool tip', 'grid estimate', 'not certified measurement', 'Z +1.00']) assert.ok(js.includes(words), words);
});
