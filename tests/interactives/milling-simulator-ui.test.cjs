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
function loadSummary(s, id) {
  const commit = s.commit.bind(s);
  let summary = null;
  s.commit = () => (summary = commit());
  const result = s.loadTool(id);
  s.commit = commit;
  assert.equal(result.ok, true, result.message);
  assert.ok(summary, 'the tool change committed an engine summary');
  return summary;
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

test('the isometric view marks every cell as the top view does', () => {
  for (const job of JOBS) {
    const s = M.create();
    deepPass(s);
    const F = U.targetField(s, job);
    let excess = 0, over = 0;
    for (let k = 0; k < s.nx * s.ny; k++) {
      const i = k % s.nx, j = (k - i) / s.nx, h = s.rasterAt(i, j);
      const v = U.cellState(h, F.lo[k], F.hi[k], s.stock.bottom), t = U.isoTint(h, F.lo[k], F.hi[k], F.nom[k], s.stock.bottom, false);
      assert.equal(t ? t.kind : 0, v, job.id + ' cell ' + k);
      if (t && t.kind === 1) { excess++; assert.equal(t.alpha, U.excessAlpha(h - F.nom[k]), 'as strong as the top view'); }
      if (t && t.kind === 2) over++;
    }
    assert.ok(excess > 0 && over > 0, job.id + ': both marks appear');
  }
  // a gouge the last inspection found between cell centres stays marked
  assert.equal(U.isoTint(5, 0, 10, 0, -20, true).kind, 2);
  assert.equal(U.isoTint(5, 0, 10, 0, -20, false), null);
});

test('shared display fields retain exact inspection boundaries, including curved limits', () => {
  const s = M.create();
  for (const job of JOBS) {
    const f = U.targetField(s, job);
    for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) {
      const k = i + j * s.nx, e = {};
      I.envAt(job, s.cellX(i), s.cellY(j), e);
      assert.equal(f.lo[k], e.lo, `${job.id} lower ${k}`);
      assert.equal(f.hi[k], e.hi, `${job.id} upper ${k}`);
      for (const bound of [e.lo, e.hi]) if (Number.isFinite(bound) && bound > s.stock.bottom) {
        assert.equal(U.cellState(bound, f.lo[k], f.hi[k], s.stock.bottom), 0);
        assert.equal(U.isoTint(bound, f.lo[k], f.hi[k], f.nom[k], s.stock.bottom, false), null);
      }
    }
  }
  for (const [id, x, y] of [['tapped', 14.375, 26.375], ['boss', 25.875, 15.875]]) {
    const e = {};
    I.envAt(J.BY_ID[id], x, y, e);
    assert.equal(U.cellState(e.lo - 1e-6, e.lo, e.hi, s.stock.bottom), 2, 'a real excursion still fails');
  }
});

test('one prominent switch chooses 3D or the existing top/front and isometric views', () => {
  const src = fs.readFileSync(path.join(MOD, 'demo.js'), 'utf8');
  assert.match(src, /button\('Top and front', \{ 'aria-pressed': 'true'/);
  assert.match(src, /button\('Isometric', \{ 'aria-pressed': 'false'/);
  assert.match(src, /button\('3D', \{ 'aria-pressed': 'false'/);
  assert.match(src, /role: 'group', 'aria-label': 'View of the work'/);
  assert.ok(!/button\('More views'/.test(src), 'the isometric is not hidden behind More views');
  assert.match(src, /vTop\.hidden = vFront\.hidden = l !== 'flat';/);
  assert.match(src, /isoCanvas\.addEventListener\('keydown', wheelKeys\)/);
  const css = fs.readFileSync(path.join(MOD, 'demo.css'), 'utf8');
  assert.match(css, /\.ms-viewbar \{ position: absolute;/, 'the switch adds no height to the bench');
  assert.match(css, /\.ms-iso-canvas \{ aspect-ratio: 190 \/ 181;/, 'the isometric takes the space of the pair');
  const page = fs.readFileSync(path.join(__dirname, '..', '..', 'collections', 'machining', 'pages', 'milling-operations.html'), 'utf8').replace(/\s+/g, ' ');
  assert.match(page, /<em>Inspect \/ orbit<\/em>/);
  assert.match(page, /<em>Home<\/em> restores the view/);
});

test('jog directions and orientation arrows follow the actual rotated tool projection', () => {
  const expected = [
    ['lower right', 'upper right'], ['lower left', 'lower right'],
    ['upper left', 'lower left'], ['upper right', 'upper left']
  ];
  const compact = ['X+ ↘ · Y+ ↗ · Z+ ↑', 'X+ ↙ · Y+ ↘ · Z+ ↑',
    'X+ ↖ · Y+ ↙ · Z+ ↑', 'X+ ↗ · Y+ ↖ · Z+ ↑'];
  for (let rot = 0; rot < 4; rot++) {
    for (const [i, axis] of ['x', 'y', 'z'].entries()) {
      const a = U.isoProject(50, 30, 20, rot);
      for (const sign of [-1, 1]) {
        const b = U.isoProject(50 + (axis === 'x' ? 10 * sign : 0), 30 + (axis === 'y' ? 10 * sign : 0), 20 + (axis === 'z' ? 10 * sign : 0), rot);
        const v = U.isoAxis(axis, rot);
        assert.ok(Math.abs(b[0] - a[0] - v[0] * 10 * sign) < 1e-9);
        assert.ok(Math.abs(b[1] - a[1] - v[1] * 10 * sign) < 1e-9);
        const label = U.jogDirection(axis, sign, 'iso', rot);
        assert.equal(label.includes('left'), b[0] < a[0] - 1e-9);
        assert.equal(label.includes('right'), b[0] > a[0] + 1e-9);
        assert.equal(/up/.test(label), b[1] < a[1]);
        assert.equal(/low|down/.test(label), b[1] > a[1]);
      }
      if (i < 2) assert.equal(U.jogDirection(axis, 1, 'iso', rot), expected[rot][i] + ' on screen');
    }
    const cue = U.isoOrientation(rot);
    for (const axis of ['X', 'Y', 'Z']) assert.match(cue, new RegExp('>' + axis + '\\+<'));
    assert.ok(cue.includes('Positive machine directions:'));
    assert.ok(cue.includes(compact[rot]), 'the compact phone key points the same way');
  }
  assert.equal(U.jogDirection('x', 1, 'flat', 2), 'right in top view', 'the top view has its own fixed orientation');
  assert.equal(U.jogDirection('y', 1, 'flat', 2), 'up in top view');
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
  assert.match(m.text, /lower it beside the block, then feed across/);
  assert.doesNotMatch(m.text, /lower Z to cut/);
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

test('move feedback separates modeled small removal, sub-grid evidence, true zero and stops', () => {
  const face = M.create();
  face.loadTool('fm50');
  go(face, { x: -30, y: 30, z: 20 }); go(face, { z: 0 });
  const faceCut = go(face, { x: 130 });
  assert.ok(faceCut.volume > 0.05);
  let m = U.describeMove(faceCut, face);
  assert.equal(m.title, 'Cut.');
  assert.match(m.text, /Removed approximately .* \(grid estimate\)/);

  const drill = M.create();
  drill.loadTool('dr6.6');
  go(drill, { x: 15, y: 30, z: 2 });
  const normal = go(drill, { z: -21.94 });
  assert.ok(normal.volume > 0.05);
  m = U.describeMove(normal, drill);
  assert.equal(m.title, 'Cut.');
  assert.match(m.text, /Removed approximately 709 mm³ \(grid estimate\)/);

  const before = I.inspect(drill, J.BY_ID.pocket).rows.find((r) => r.id === 'hole-left');
  assert.match(before.checks.map((c) => c.text).join(' '), /Not through yet/);
  const small = go(drill, { z: -23 });
  assert.ok(small.volume > 0 && small.volume < 0.05, small.volume);
  assert.equal(small.subGridCut, false);
  const after = I.inspect(drill, J.BY_ID.pocket).rows.find((r) => r.id === 'hole-left');
  assert.match(after.checks.map((c) => c.text).join(' '), /Through at the minimum allowed diameter/);
  m = U.describeMove(small, drill);
  assert.equal(m.title, 'Cut.');
  assert.equal(m.kind, 'cut');
  assert.match(m.text, /small modeled amount \(positive grid estimate below the displayed volume precision\)/);
  assert.doesNotMatch(m.text, /sub-grid|between display samples|0\.0 mm³/i);

  const repeated = go(drill, { z: -23 });
  assert.equal(repeated.volume, 0);
  assert.equal(repeated.subGridCut, false);
  m = U.describeMove(repeated, drill);
  assert.equal(m.title, 'Nothing cut.');
  assert.equal(m.kind, 'air');
  assert.match(m.text, /no modeled metal under its footprint/);
  assert.doesNotMatch(m.text, /beside the block/);

  const outside = M.create();
  outside.loadTool('fm50');
  m = U.describeMove(go(outside, { x: -40 }), outside);
  assert.equal(m.title, 'Nothing cut.');
  assert.match(m.text, /beside the block: there is no modeled metal under the cutter/);

  const air = M.create();
  air.loadTool('fm50');
  m = U.describeMove(go(air, { x: 50 }), air);
  assert.equal(m.title, 'Nothing cut.');
  assert.match(m.text, /19\.00 mm above the metal/);

  const subGrid = M.create();
  subGrid.loadTool('fm50');
  go(subGrid, { x: -30, y: 18, z: 20 }); go(subGrid, { z: 0 }); go(subGrid, { x: 130 });
  go(subGrid, { y: 42 }); go(subGrid, { x: -30 });
  subGrid.loadTool('em12');
  go(subGrid, { x: 81, y: -10, z: 20 }); go(subGrid, { z: -6 }); go(subGrid, { y: 70 });
  go(subGrid, { x: 92 }); go(subGrid, { y: -10 }); go(subGrid, { x: 100 }); go(subGrid, { y: 70 }); go(subGrid, { z: 20 });
  subGrid.loadTool('sp12'); go(subGrid, { x: 10, y: 10, z: 2 });
  const unresolved = go(subGrid, { z: -0.15 });
  assert.equal(unresolved.volume, 0);
  assert.equal(unresolved.subGridCut, true);
  m = U.describeMove(unresolved, subGrid);
  assert.equal(m.title, 'Cut.');
  assert.match(m.text, /between display samples/);
  assert.doesNotMatch(m.text, /positive grid estimate/);

  const stopped = M.create();
  stopped.loadTool('em6'); go(stopped, { x: 50, y: 30, z: 5 });
  const blocked = stopped.moveTo({ z: -20 });
  assert.ok(blocked.volume > 0, 'the move removed material before the stop');
  assert.equal(blocked.blocked.code, 'reach');
  m = U.describeMove(blocked, stopped);
  assert.equal(m.title, 'Stopped.');
  assert.equal(m.kind, 'stop');
  assert.equal(m.warn, true);
  assert.doesNotMatch(m.text, /Removed approximately|small modeled amount/);

  const changed = M.create();
  const tool = loadSummary(changed, 'fm50');
  assert.equal(tool.kind, 'tool');
  m = U.describeMove(tool, changed);
  assert.equal(m.title, 'Tool changed.');
  assert.equal(m.kind, 'info');
  assert.match(m.text, /Face mill Ø50 loaded/);
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

test('the facing suggestion returns from either side in Y before promising a cutting pass', () => {
  for (const y of [-40, 100]) {
    const s = M.create(); s.loadTool('fm50'); go(s, {x:50, y});
    const first = U.nextStep(s, J.BY_ID.shoulder);
    assert.equal(first.fill.y, 30);
    assert.equal(first.fill.z, M.SETUP.clearZ);
    let steps=0, suggestion;
    while ((suggestion=U.nextStep(s,J.BY_ID.shoulder)) && steps<5) {
      go(s,Object.assign({},s.pos,suggestion.fill)); steps++;
    }
    assert.equal(steps,3); assert.ok(s.removed>0);
    assert.equal(I.inspect(s,J.BY_ID.shoulder).overcut,false);
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
  assert.doesNotMatch(js, /\bf\.(?:x0|x1|y0|y1|cx|cy|floor|rMax|depth|width)\b/, 'feature choices read labels/ids, not a second geometry definition');
  assert.doesNotMatch(js, /#[0-9a-f]{3,6}\b/i, 'canvas colours come from theme tokens');
  for (const token of ['--cat1', '--cat2', '--cat3']) assert.ok(js.includes("'" + token + "'"), token);
  const cssText = fs.readFileSync(path.join(MOD, 'demo.css'), 'utf8');
  const screen = cssText.slice(0, cssText.indexOf('@media print'));
  assert.doesNotMatch(screen.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-f]{3,6}\b/i, 'screen styles use theme tokens only');
  // the meanings the lesson depends on are stated in the interface
  for (const words of ['tool centre', 'tool tip', 'grid estimate', 'not certified measurement', 'Z +1.00']) assert.ok(js.includes(words), words);
});
