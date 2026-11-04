'use strict';
// Validates the embedded cutaway GLB through the production loader, then measures the actual meshes
// (not the lab's formulas) to confirm the right-hand thread sign and which flanks touch.
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const T = require('../three-runtime/three-bundle.js'), A = require('./model-asset.js'), M = require('./model.js');

const bytes = Buffer.from(A.base64, 'base64');
async function load() {
  const gltf = await new T.GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const scene = gltf.scene; scene.scale.setScalar(1000); // metres to millimetres, as the live scene does
  scene.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.side = T.DoubleSide; }); });
  scene.updateMatrixWorld(true);
  return { gltf, scene, screw: scene.getObjectByName('Screw'), carriage: scene.getObjectByName('Carriage'), nut: scene.getObjectByName('Nut') };
}
// Solid intervals along a line parallel to the screw axis, at radius r and Blender angle theta
// (theta from Blender +Y toward +Z; glTF (x, y, z) = Blender (x, z, -y)).
function intervals(node, r, thetaDeg, x0, x1) {
  const t = thetaDeg * Math.PI / 180, y = r * Math.sin(t), z = -r * Math.cos(t);
  const ray = new T.Raycaster(new T.Vector3(-400, y, z), new T.Vector3(1, 0, 0), 0, 1000);
  const xs = ray.intersectObject(node, true).map(h => h.point.x).sort((a, b) => a - b)
    .filter((x, i, a) => i === 0 || x - a[i - 1] > 1e-6);
  assert.equal(xs.length % 2, 0, 'ray enters and leaves a closed solid');
  const out = [];
  for (let i = 0; i < xs.length; i += 2) if (xs[i + 1] > x0 && xs[i] < x1) out.push([xs[i], xs[i + 1]]);
  return out;
}
// For every screw tooth wholly inside the nut, the axial gap to the nut tooth on each side.
function flankGaps(parts) {
  parts.scene.updateMatrixWorld(true);
  const c = parts.carriage.position.x * 1000, lo = c - 14, hi = c + 14, r = 9, theta = 301.875;
  const screw = intervals(parts.screw, r, theta, lo, hi), nut = intervals(parts.nut, r, theta, lo - 3, hi + 3);
  const gaps = [];
  for (const [a, b] of screw) {
    if (a < lo + 2 || b > hi - 2) continue;
    const left = nut.filter(n => n[1] <= a + 0.05).pop(), right = nut.find(n => n[0] >= b - 0.05);
    assert.ok(left && right, 'each inner screw tooth sits between two nut teeth');
    gaps.push({ minus: a - left[1], plus: right[0] - b });
  }
  assert.ok(gaps.length >= 4, 'several engaged teeth are measured');
  for (const [a, b] of screw) for (const [p, q] of nut) assert.ok(Math.min(b, q) - Math.max(a, p) < 0.02, 'no interference');
  return gaps;
}
function pose(parts, state) {
  const p = M.referencePose(state); assert.ok(p, 'the 3D model is posed only at its own settings');
  parts.screw.rotation.x = p.screwDegrees * Math.PI / 180; parts.carriage.position.x = p.carriageMm / 1000;
  return p;
}

test('GLB header, identity, named nodes and finite bounds survive the production loader', async () => {
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF'); assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length); assert.equal(bytes.length, A.byteLength);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), A.sha256);
  const parts = await load();
  for (const name of ['BacklashAssembly', 'Frame', 'Screw', 'Carriage', 'Nut']) assert.ok(parts.scene.getObjectByName(name), name);
  assert.equal(parts.nut.parent, parts.carriage, 'the nut rides on the carriage');
  for (const n of [parts.screw, parts.carriage, parts.nut]) {
    assert.deepEqual(n.position.toArray(), [0, 0, 0]); assert.deepEqual(n.rotation.toArray().slice(0, 3), [0, 0, 0]);
  }
  const box = new T.Box3().setFromObject(parts.scene);
  for (const v of [box.min, box.max]) for (const k of ['x', 'y', 'z']) assert.ok(Number.isFinite(v[k]));
  assert.ok(Math.abs(box.min.x + 122) < 0.01 && Math.abs(box.max.x - 102) < 0.01, 'base plate spans -122..102 mm');
  const screwBox = new T.Box3().setFromObject(parts.screw);
  assert.ok(Math.abs(screwBox.max.y - 24.6) < 0.01, 'dial phase marker reaches 24.6 mm');
  let triangles = 0; parts.scene.traverse(o => { if (o.isMesh) triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  assert.ok(triangles > 25000 && triangles < 40000, 'lean but helical: ' + triangles + ' triangles');
  assert.equal(A.geometry.leadMm, M.GEOMETRY.lead); assert.equal(A.geometry.clearanceMm, M.GEOMETRY.clearance);
});

test('measured thread: negative rotation about +X advances the helix toward +X by L per turn (right hand)', async () => {
  const parts = await load(), base = intervals(parts.screw, 9, 301.875, -30, 30);
  parts.screw.rotation.x = -36 * Math.PI / 180; parts.scene.updateMatrixWorld(true);
  const turned = intervals(parts.screw, 9, 301.875, -30, 30);
  // match each turned tooth to the base tooth just behind it
  const shifts = turned.slice(1, -1).map(([a]) => { const prior = base.filter(b => b[0] <= a + 1e-6).pop(); return a - prior[0]; });
  for (const s of shifts) assert.ok(Math.abs(s - 0.5) < 0.02, 'shift ' + s + ' mm for -36 degrees (5 mm lead)');
  const widths = base.map(([a, b]) => b - a).slice(1, -1);
  for (const w of widths) assert.ok(Math.abs(w - 2.0) < 0.02, 'tooth width at mid-depth ' + w);
});

test('measured contact: centred nut clears both flanks; seated nut touches the driving flank only', async () => {
  const parts = await load();
  // Neutral GLB state: carriage 0, screw 0, nut centred: 0.5 mm each side.
  for (const g of flankGaps(parts)) { assert.ok(Math.abs(g.minus - 0.5) < 0.02); assert.ok(Math.abs(g.plus - 0.5) < 0.02); }
  // Exact model settings: drive forward (+X), then measure the actual meshes.
  let s = M.create({ lead: 5, clearance: 1.0 }); s = M.turnBy(s, 137);
  assert.equal(M.contact(s), 'forward'); assert.equal(pose(parts, s).screwDegrees, M.screwDegrees(s), 'model screw angle is the handwheel angle');
  for (const g of flankGaps(parts)) {
    assert.ok(g.plus < 0.02, 'screw tooth +X flank pushes the nut toward +X: gap ' + g.plus);
    assert.ok(Math.abs(g.minus - 1.0) < 0.02, 'full clearance opens behind the tooth: ' + g.minus);
  }
  // Reverse part way: the screw turns, the carriage holds, both flanks are clear.
  const held = M.turnBy(s, -9); assert.equal(held.carriage, s.carriage); assert.equal(M.contact(held), 'free');
  pose(parts, held);
  for (const g of flankGaps(parts)) { assert.ok(g.plus > 0.3 && g.minus > 0.3); assert.ok(Math.abs(g.plus + g.minus - 1.0) < 0.03); }
  // Through the full clearance: the opposite flank seats and the carriage follows toward -X.
  const back = M.turnBy(s, -30); assert.equal(M.contact(back), 'reverse'); assert.ok(back.carriage < s.carriage);
  pose(parts, back);
  for (const g of flankGaps(parts)) { assert.ok(g.minus < 0.02, 'pushing toward -X closes the -X flank'); assert.ok(Math.abs(g.plus - 1.0) < 0.02); }
});

test('random handwheel walks at the model settings: no interference and the measured contact matches the model', async () => {
  const parts = await load(); let s = M.create(), x = 7;
  for (let i = 0; i < 24; i++) {
    x = (x * 1103515245 + 12345) % 2147483648; const n = ((x >> 8) % 61) - 30; s = M.turnBy(s, n === 0 ? 1 : n);
    pose(parts, s); const gaps = flankGaps(parts), c = M.contact(s);
    for (const g of gaps) {
      if (c === 'forward') assert.ok(g.plus < 0.02 && Math.abs(g.minus - 1) < 0.02);
      else if (c === 'reverse') assert.ok(g.minus < 0.02 && Math.abs(g.plus - 1) < 0.02);
      else assert.ok(g.plus > 0.005 && g.minus > 0.005 && Math.abs(g.plus + g.minus - 1) < 0.03);
    }
  }
});
