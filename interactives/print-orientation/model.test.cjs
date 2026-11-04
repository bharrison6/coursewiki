'use strict';
// Run: node --test interactives/print-orientation/model.test.cjs
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), { execFileSync } = require('node:child_process');
const M = require('./model.js'), D = require('./render.js');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + b + ' got ' + a);
const DEG = Math.PI / 180;

// ---- hand-built fixtures, independent of the bracket builder ----
function quad(a, b, c, d) { // vertices listed counter-clockwise seen from outside
  const n = [0, 0, 0], pts = [a, b, c, d];
  for (let i = 0; i < 4; i++) { const p = pts[i], q = pts[(i + 1) % 4]; n[0] += (p[1] - q[1]) * (p[2] + q[2]); n[1] += (p[2] - q[2]) * (p[0] + q[0]); n[2] += (p[0] - q[0]) * (p[1] + q[1]); }
  const l = Math.hypot(...n);
  return { pts, normal: n.map(v => v / l), area: l / 2, tris: [[0, 1, 2], [0, 2, 3]], feature: 'fixture' };
}
function box(x0, y0, z0, x1, y1, z1) {
  const P = (x, y, z) => [x, y, z];
  return [
    quad(P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0)), // bottom, normal -z
    quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)), // top, +z
    quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)), // front, -y
    quad(P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0)), // back, +y
    quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)), // left, -x
    quad(P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1))  // right, +x
  ];
}
function downward(alpha) { return [Math.sin(alpha * DEG), 0, -Math.cos(alpha * DEG)]; }
function upward(alpha) { return [Math.sin(alpha * DEG), 0, Math.cos(alpha * DEG)]; }

test('fixtures are closed and outward-facing (the instrument is checked before it is trusted)', () => {
  const c = M.meshCheck(box(0, 0, 0, 20, 20, 20));
  assert.equal(c.unmatched, 0); near(c.volume, 8000, 1e-9, 'cube volume');
});

test('inclination is measured from the plate: 0 horizontal, 90 vertical', () => {
  near(M.inclination([0, 0, -1]), 0, 1e-9); near(M.inclination([1, 0, 0]), 90, 1e-9); near(M.inclination(downward(30)), 30, 1e-9);
});

test('overhang classification at the 45 degree threshold and +/- 1 degree', () => {
  assert.equal(M.classifyNormal(downward(44), 45), 'support');
  assert.equal(M.classifyNormal(downward(46), 45), 'down-ok');
  assert.equal(M.classifyNormal(downward(45), 45), 'down-ok', 'equality is printable: the threshold is the flattest printable slope');
  assert.equal(M.classifyNormal(downward(0), 45), 'support', 'downward horizontal, not on the plate');
  assert.equal(M.classifyNormal(downward(0), 45, true), 'bed', 'downward horizontal resting on the plate');
  assert.equal(M.classifyNormal([1, 0, 0], 45), 'vertical');
  assert.equal(M.classifyNormal([0, -1, 0], 45), 'vertical');
  for (const a of [0, 10, 44, 45, 46, 89]) assert.equal(M.classifyNormal(upward(a), 45), 'up', 'upward ' + a);
  assert.equal(M.classifyNormal(upward(0), 45), 'up', 'upward top never flagged');
  // The threshold is adjustable.
  assert.equal(M.classifyNormal(downward(29), 30), 'support'); assert.equal(M.classifyNormal(downward(31), 30), 'down-ok');
  assert.equal(M.classifyNormal(downward(59), 60), 'support'); assert.equal(M.classifyNormal(downward(61), 60), 'down-ok');
});

test('a 20 mm cube on the plate needs no support; the same cube in the air has a 400 mm^2 projected underside', () => {
  const grounded = M.analyzeFaces(box(0, 0, 0, 20, 20, 20), { threshold: 45 });
  assert.equal(grounded.supportSum, 0); assert.equal(grounded.supportUnion, 0);
  near(grounded.totals.bed, 400, 1e-9, 'bed contact');
  near(grounded.rawDownBelowThreshold, 400, 1e-9, 'raw downward-horizontal geometry is still 400 mm^2');
  const floating = M.analyzeFaces(box(0, 0, 10, 20, 20, 30), { threshold: 45, bedZ: 0 });
  near(floating.supportSum, 400, 1e-9, 'elevated underside'); near(floating.toPlate, 400, 1e-9); assert.equal(floating.toPart, 0);
  near(floating.supportUnion, 400, 400 * 0.01, 'raster union within 1%');
  assert.equal(M.layerCount(20, 0.3), 67);
});

test('an elevated ledge with air beneath is flagged; a ledge above another body lands on the part', () => {
  // Step block: lower block 10 x 10 x 10 on the plate, ledge 30 x 10 x 10 on top of it overhanging by 20 mm.
  const lower = box(0, 0, 0, 10, 10, 10).filter((f, i) => i !== 1); // its top is covered by the ledge
  const ledge = box(0, 0, 10, 30, 10, 20);
  ledge[0] = quad([10, 0, 10], [10, 10, 10], [30, 10, 10], [30, 0, 10]); // only the overhanging part of the ledge underside is exposed
  const step = M.analyzeFaces(lower.concat(ledge), { threshold: 45 });
  near(step.supportSum, 200, 1e-9, '20 x 10 mm ledge underside'); near(step.toPlate, 200, 1e-9);
  near(step.totals.bed, 100, 1e-9);
  // Two bodies: a slab hovering over a block: its underside would put support on the block, not the plate.
  const two = M.analyzeFaces(box(0, 0, 0, 30, 10, 5).concat(box(0, 0, 10, 30, 10, 12)), { threshold: 45 });
  near(two.supportSum, 300, 1e-9); near(two.toPart, 300, 1e-9); near(two.toPlate, 0, 1e-9);
  // Overlap is accounted for: the hovering slab and the block top projections do not double count flagged faces;
  // stacking two flagged slabs does.
  const stacked = M.analyzeFaces(box(0, 0, 10, 20, 20, 12).concat(box(0, 0, 20, 20, 20, 22)), { threshold: 45 });
  near(stacked.supportSum, 800, 1e-9); near(stacked.supportUnion, 400, 4); near(stacked.overlap, 400, 4);
});

test('a downward slope at the threshold is printable, one degree flatter is flagged (mesh level)', () => {
  // A wedge underside: a quad tilted 44 / 46 degrees from horizontal, facing down, raised above the plate.
  for (const [alpha, expect] of [[44, 'support'], [46, 'down-ok']]) {
    const c = Math.cos(alpha * DEG), s = Math.sin(alpha * DEG);
    const f = quad([0, 0, 10], [0, 10, 10], [10 * c, 10, 10 + 10 * s], [10 * c, 0, 10 + 10 * s]);
    assert.ok(f.normal[2] < 0, 'fixture faces down');
    assert.equal(M.analyzeFaces([f], { threshold: 45 }).faces[0].cls, expect, alpha + ' degrees');
  }
});

test('layer count is ceil(height / layer height) without floating-point overshoot', () => {
  assert.equal(M.layerCount(20, 0.3), 67); assert.equal(M.layerCount(50, 0.2), 250); assert.equal(M.layerCount(30, 0.1), 300);
  assert.equal(M.layerCount(0.3, 0.1), 3); assert.equal(M.layerCount(77.78, 0.3), 260);
  assert.throws(() => M.layerCount(10, 0)); assert.throws(() => M.layerCount(-1, 0.2));
});

test('the bracket mesh is closed, consistently oriented and has the analytic volume', () => {
  const c = M.meshCheck(M.MESH.faces), pr = M.MESH.profile, P = M.PART;
  assert.equal(c.unmatched, 0, 'every edge matched by its reverse');
  const poly = M.area2(pr.pts), gusset = M.area2(pr.gusset);
  near(c.volume, poly * P.width + gusset * P.gussetT, 1e-6, 'signed volume positive: no inverted normals');
  near(poly, pr.analytic.lArea, 0.5, 'polygonal profile area vs analytic arcs');
  near(gusset, pr.analytic.gussetArea, 0.2, 'gusset area vs analytic');
  M.MESH.faces.forEach(f => { let s = 0; f.tris.forEach(t => { s += M.polygonArea([f.pts[t[0]], f.pts[t[1]], f.pts[t[2]]]); }); near(s, f.area, 1e-6, 'triangulation covers ' + f.feature); });
});

test('bracket support proxy matches the analytic projected areas', () => {
  const P = M.PART, R = P.t + P.r, step = 90 / P.arcSegments;
  // Arm flat: the outer round below 45 degrees is flagged except its lowest facet, which lies inside a 0.20 mm first layer.
  const base = M.analyze({ spin: 0, lay: 'upright', layer: 0.2 });
  near(base.supportSum, P.width * R * (Math.sin(45 * DEG) - Math.sin(step * DEG)), 1e-6, 'outer round projection');
  near(base.totals.bed, (P.arm - R) * P.width, 1e-6, 'arm underside rests on the plate');
  assert.ok(base.faces.filter(f => f.cls === 'support').every(f => f.feature === 'outer-round'));
  // At 0.05 mm the lowest facet (0.087 mm tall) rises above the first layer and is flagged too.
  near(M.analyze({ spin: 0, layer: 0.05 }).supportSum, P.width * R * Math.sin(45 * DEG), 1e-6);
  // On its side: only the gusset underside, hanging over the open inside corner.
  const side = M.analyze({ spin: 0, lay: 'side' });
  near(side.supportSum, M.area2(M.MESH.profile.gusset), 1e-6); assert.equal(side.toPart, 0);
  assert.ok(side.faces.filter(f => f.cls === 'support').every(f => f.feature === 'gusset-face'));
  near(side.totals.bed, M.area2(M.MESH.profile.pts), 1e-6);
  // Upside down: the former arm top (minus the strip under the gusset) now faces down, and so does the inner fillet
  // outside the gusset slab; the outer round faces up. The gusset diagonal at exactly 45 deg is printable.
  const inv = M.analyze({ spin: 180 });
  const armUnder = (P.arm - P.t - P.r) * P.width - (P.gussetLeg - P.r) * P.gussetT;
  near(inv.supportSum, armUnder + (P.width - P.gussetT) * P.r * Math.sin(45 * DEG), 1e-6);
  assert.ok(inv.faces.filter(f => f.feature === 'outer-round').every(f => f.cls === 'up'));
  assert.equal(inv.faces.find(f => f.feature === 'gusset-edge').cls, 'down-ok');
  assert.equal(M.analyze({ spin: 180, threshold: 46 }).faces.find(f => f.feature === 'gusset-edge').cls, 'support');
  // Tilted 45: no face flatter than 45 degrees faces down; only a curve touches the plate.
  const tilt = M.analyze({ spin: 45 }); assert.equal(tilt.supportSum, 0); assert.equal(tilt.totals.bed, 0);
});

test('heights and layer counts of the presets', () => {
  assert.equal(M.analyze({ spin: 0 }).layers, 250); assert.equal(M.analyze({ spin: -90 }).layers, 300);
  assert.equal(M.analyze({ lay: 'side' }).layers, 150); assert.equal(M.analyze({ lay: 'side', layer: 0.3 }).layers, 100);
  near(M.analyze({ spin: 0 }).height, 50, 1e-9);
});

test('rotation keeps areas and unit normals; layers stay parallel to the plate', () => {
  for (const spin of [-180, -135, -37, 0, 23, 90, 180]) for (const lay of ['upright', 'side']) {
    const a = M.analyze({ spin, lay });
    assert.ok(Math.abs(a.zmin) < 1e-9, 'dropped onto the plate');
    a.faces.forEach((f, i) => { near(Math.hypot(...f.normal), 1, 1e-9); near(f.area, M.MESH.faces[i].area, 1e-9); });
    const segs = M.contour(a.placement.faces, a.height / 2); assert.ok(segs.length > 0);
    segs.forEach(s => { assert.equal(s[0][2], a.height / 2); assert.equal(s[1][2], a.height / 2); });
  }
});

test('on its side, spinning on the plate changes nothing physical', () => {
  const ref = M.analyze({ lay: 'side', spin: 0 });
  for (const spin of [-170, -45, 30, 120]) {
    const a = M.analyze({ lay: 'side', spin });
    near(a.supportSum, ref.supportSum, 1e-6); near(a.height, ref.height, 1e-9); assert.equal(a.layers, ref.layers);
    near(a.load.max, 0, 1e-9);
  }
});

test('load-to-layer angle: parallel 0, normal 90, and the upright bend always crosses layers somewhere', () => {
  assert.equal(M.loadReport(M.state({ load: 'pull', spin: 0 })).max, 0);
  near(M.loadReport(M.state({ load: 'pull', spin: -90 })).max, 90, 1e-9);
  near(M.loadReport(M.state({ load: 'pull', spin: 30 })).max, 30, 1e-9);
  for (let spin = -180; spin <= 180; spin += 5) assert.ok(M.loadReport(M.state({ load: 'hang', spin })).max >= 45 - 1e-9, 'upright bend sweeps 90 degrees');
  near(M.loadReport(M.state({ load: 'hang', lay: 'side' })).max, 0, 1e-9);
  assert.equal(M.loadReport(M.state({ load: 'none' })), null);
});

test('prediction grading accepts either answer near the 45 degree boundary', () => {
  assert.deepEqual(M.gradePrediction('normal', 90), { result: 'normal', correct: true });
  assert.deepEqual(M.gradePrediction('parallel', 90), { result: 'normal', correct: false });
  assert.deepEqual(M.gradePrediction('parallel', 0), { result: 'parallel', correct: true });
  assert.equal(M.gradePrediction('parallel', 47).result, 'either'); assert.equal(M.gradePrediction('normal', 43).correct, true);
  assert.throws(() => M.gradePrediction('across', 10));
});

test('quantized section: vertical walls get no steps, gaps stay within one layer and shrink with layer height', () => {
  const s0 = M.section({ spin: 0, layer: 0.2 });
  near(s0.gap('back-outer'), 0, 1e-9, 'vertical outer wall is reproduced exactly');
  near(s0.gap('arm-end'), 0, 1e-9, 'vertical arm end');
  for (const spin of [-90, -30, 0, 15, 45, 120, 180]) for (const layer of [0.05, 0.1, 0.2, 0.3]) {
    const s = M.section({ spin, layer });
    for (const f of ['inner-fillet', 'outer-round']) assert.ok(s.gap(f) <= layer + 1e-6, f + ' ' + spin + ' ' + layer + ' gap ' + s.gap(f));
  }
  const g = [0.3, 0.2, 0.1, 0.05].map(layer => M.section({ spin: 0, layer }).gap('inner-fillet'));
  for (let i = 1; i < g.length; i++) assert.ok(g[i] < g[i - 1], 'finer layers, smaller steps');
  // Convention: the last layer is trimmed to the part height; layers tile [0, H] exactly.
  const s = M.section({ spin: 30, layer: 0.3 }); assert.equal(s.layers.length, M.layerCount(s.height, 0.3));
  near(s.layers[s.layers.length - 1].z1, s.height, 1e-9); s.layers.forEach((L, i) => { if (i) near(L.z0, s.layers[i - 1].z1, 1e-9); });
  assert.equal(M.section({ lay: 'side' }), null, 'on its side the curved faces are vertical walls');
});

test('state validation rejects invalid input', () => {
  for (const bad of [{ spin: NaN }, { spin: '' }, { spin: 181 }, { threshold: 19 }, { threshold: 71 }, { layer: 0 }, { layer: 0.31 }, { layer: 'x' }, { lay: 'diagonal' }, { load: 'torque' }])
    assert.throws(() => M.state(bad), RangeError, JSON.stringify(bad));
  assert.equal(M.state({ spin: '45' }).spin, 45);
});

test('static lesson compares two orientations and matches the page', () => {
  const html = D.staticLesson();
  assert.match(html, /A\. Arm flat on the plate/); assert.match(html, /B\. On its side/); assert.match(html, /<table class="po-compare"/);
  assert.doesNotMatch(html, /\sid="/, 'static fallback is ID-free so several roots can share a page');
  execFileSync(process.execPath, [path.join(__dirname, 'static.cjs')], { stdio: 'pipe' });
});
