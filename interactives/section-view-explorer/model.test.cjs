'use strict';
// Run: node --test interactives/section-view-explorer/model.test.cjs
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path'), { execFileSync } = require('node:child_process');
const M = require('./model.js'), R = require('./render.js');
const N = M.SIDES, shrink = Math.cos(Math.PI / N);

// Independent 1D oracle: material along the line y = s at height z, from true circles.
function trueChord(part, s, z) {
  let set = [];
  const op = (a, b, fn) => {
    const xs = [...new Set([...a.flat(), ...b.flat()])].sort((p, q) => p - q), out = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      const m = (xs[i] + xs[i + 1]) / 2, ia = a.some(([p, q]) => m > p && m < q), ib = b.some(([p, q]) => m > p && m < q);
      if (fn(ia, ib)) { if (out.length && out[out.length - 1][1] === xs[i]) out[out.length - 1][1] = xs[i + 1]; else out.push([xs[i], xs[i + 1]]); }
    }
    return out;
  };
  let slack = 0;
  for (const f of part.features) {
    const g = f.box || f.cyl;
    if (!(z > g.z0 && z < g.z1)) continue;
    let iv = [];
    if (f.box) { if (s > g.y0 && s < g.y1) iv = [[g.x0, g.x1]]; }
    else {
      const d = Math.abs(s - g.cy);
      if (d < g.r) { const w = Math.sqrt(g.r * g.r - d * d); iv = [[g.cx - w, g.cx + w]]; }
      // The inscribed polygon lies between radius r cos(pi/N) and r: bound its chord error.
      slack += 2 * (Math.sqrt(Math.max(0, g.r * g.r - d * d)) - Math.sqrt(Math.max(0, (g.r * shrink) ** 2 - d * d)));
    }
    set = op(set, iv, f.op === 'add' ? (a, b) => a || b : (a, b) => a && !b);
  }
  return { length: set.reduce((t, [p, q]) => t + q - p, 0), slack, set };
}
function trueSectionArea(part, s, lo = -Infinity, hi = Infinity) {
  const zs = [...new Set(part.features.flatMap(f => { const g = f.box || f.cyl; return [g.z0, g.z1]; }))].sort((a, b) => a - b);
  let area = 0, bound = 0;
  for (let i = 0; i + 1 < zs.length; i++) {
    const h = zs[i + 1] - zs[i], c = trueChord(part, s, (zs[i] + zs[i + 1]) / 2);
    area += h * c.set.reduce((t, [p, q]) => t + Math.max(0, Math.min(q, hi) - Math.max(p, lo)), 0);
    bound += h * c.slack;
  }
  return { area, bound };
}
const positions = part => { const p = part.plane; return [p.min, p.min / 2 + 0.5, 0, 7, p.max - 3]; };

test('full sections match true-circle areas within the stated polygon bound, for every part and position', () => {
  for (const part of M.parts) for (const s of positions(part)) {
    const r = M.compute(part.id, { mode: 'full', s }), t = trueSectionArea(part, s);
    assert.ok(Math.abs(r.view.capArea - t.area) <= t.bound + 1e-9, part.id + ' s=' + s + ': ' + r.view.capArea + ' vs ' + t.area + ' ± ' + t.bound);
  }
  // Through the axis every polygon chord is exact, so the worked example is exact.
  assert.equal(M.compute('bushing', { mode: 'full', s: 0 }).view.capArea, 920);
  assert.equal(M.compute('pulley', { mode: 'full', s: 0 }).view.capArea, 952);
  assert.ok(Math.abs(M.compute('bracket', { mode: 'full', s: -10 }).view.capArea - (80 * 12 - 14 * 8)) < 1e-9, 'through the hole center, exact to rounding');
});

test('transverse slice of the bushing body is the R20/R10 annulus within the polygon bound', () => {
  const W = M.whole('bushing'), body = W.bands.find(b => b.z0 === 0 && b.z1 === 30);
  const area = M._internal.regionArea(W.P, body.sets), exact = Math.PI * (20 ** 2 - 10 ** 2);
  const polygon = N / 2 * Math.sin(2 * Math.PI / N) * (20 ** 2 - 10 ** 2);
  assert.ok(Math.abs(exact - 942.4778) < 1e-4);
  assert.ok(Math.abs(area - polygon) < 1e-9, 'slice equals the stated inscribed-polygon annulus');
  assert.ok(Math.abs(area - exact) <= (Math.PI - N / 2 * Math.sin(2 * Math.PI / N)) * (20 ** 2 + 10 ** 2), 'and lies within the polygon bound of 942.4778 mm²');
});

test('hatched cells are material at the plane and unhatched cells are not (true-circle oracle)', () => {
  const cases = [];
  for (const part of M.parts) for (const s of positions(part)) for (const flip of [false, true]) cases.push([part, { mode: 'full', s, flip }]);
  for (const id of ['bushing', 'pulley']) for (const flip of [false, true]) cases.push([M.byId[id], { mode: 'half', flip }]);
  for (const [a, b] of [[-10, 3], [-20, 10], [5, -5]]) for (const flip of [false, true]) cases.push([M.byId.bracket, { mode: 'offset', a, b, flip }]);
  let checked = 0;
  for (const [part, cut] of cases) {
    const r = M.compute(part.id, cut), dir = cut.flip ? -1 : 1, c = r.cut;
    for (const cell of r.view.cells) {
      const x = dir * (cell.ua + cell.ub) / 2, z = (cell.z0 + cell.z1) / 2, w = cell.ub - cell.ua;
      if (w < 0.2) continue;                                   // a sliver inside polygon tolerance
      const y = M.planeAt(part, c, x) + dir * 1e-6;
      const nearCircle = part.features.some(f => f.cyl && Math.abs(Math.hypot(x - f.cyl.cx, y - f.cyl.cy) - f.cyl.r) < 0.05);
      if (nearCircle) continue;
      const kind = cell.seg ? cell.seg.src.kind : 'none';
      if (kind === 'keep') { assert.ok(M.isMaterial(part, x, y, z), part.id + ' ' + JSON.stringify(cut) + ' hatched void at x=' + x + ' z=' + z); checked++; }
      else if (c.mode !== 'half' || dir * x > 0) {
        // Unhatched in a sectioned region: nothing solid may sit on the plane there.
        assert.ok(!M.isMaterial(part, x, y, z), part.id + ' ' + JSON.stringify(cut) + ' missed material at x=' + x + ' z=' + z); checked++;
      }
    }
  }
  assert.ok(checked > 500, 'oracle sampled ' + checked + ' cells');
});

test('a half section hatches the sectional half of the view and shows the outside on the other half', () => {
  for (const id of ['bushing', 'pulley']) for (const flip of [false, true]) {
    const half = M.compute(id, { mode: 'half', flip }), full = M.compute(id, { mode: 'full', s: 0, flip });
    const capCells = half.view.cells.filter(c => c.seg && c.seg.src.kind === 'keep');
    assert.ok(capCells.length > 0);
    assert.ok(capCells.every(c => c.ua >= -1e-9), id + ': hatch only right of the center line');
    const rightOfFull = full.view.cells.filter(c => c.seg && c.seg.src.kind === 'keep' && c.ua >= -1e-9).reduce((s, c) => s + (c.ub - c.ua) * (c.z1 - c.z0), 0);
    assert.ok(Math.abs(half.view.capArea - rightOfFull) < 1e-9, id + ': hatched half equals that half of the full section');
    assert.ok(Math.abs(half.view.capArea - full.view.capArea / 2) < 1e-9, id + ': symmetric part, so exactly half the full section area');
    const t = flip ? trueSectionArea(M.byId[id], 0, -Infinity, 0) : trueSectionArea(M.byId[id], 0, 0, Infinity);
    assert.ok(Math.abs(half.view.capArea - t.area) <= t.bound / 2 + 1e-9);
    const exterior = half.view.cells.filter(c => c.ub <= 1e-9 && c.seg);
    assert.ok(exterior.every(c => c.seg.src.leaf.feature.op === 'add'), id + ': unsectioned half shows only outside surfaces; interior stays hidden');
    assert.ok(!half.view.lines.some(l => Math.abs(l[0]) < 1e-6 && Math.abs(l[2]) < 1e-6), id + ': no object line on the center line');
    assert.ok(half.view.axes.includes(0), id + ': a center line divides the halves');
  }
  assert.throws(() => M.compute('bracket', { mode: 'half' }), /no half section/);
});

test('region descriptions: the unsectioned half is described as outside view, and every stated depth is behind the plane', () => {
  for (const id of ['bushing', 'pulley']) for (const flip of [false, true]) {
    const v = M.compute(id, { mode: 'half', flip }).view;
    const outside = v.faces.filter(f => f.label.u < 0), inside = v.faces.filter(f => f.label.u > 0 && f.type === 'surface');
    assert.ok(outside.length >= 2, id + ' has exterior regions');
    for (const f of outside) { assert.equal(f.type, 'surface'); assert.match(f.describe, /not sectioned/); assert.match(f.describe, /in front of the cutting plane/); assert.doesNotMatch(f.describe, /behind/); }
    for (const f of inside) assert.match(f.describe, /about \d+\.\d mm behind the plane/);
  }
  for (const part of M.parts) for (const mode of part.modes) for (const flip of [false, true]) for (let s = part.plane.min; s <= part.plane.max; s += 3) {
    for (const f of M.compute(part.id, { mode, s, flip }).view.faces) {
      const m = f.describe.match(/about (-?[0-9.]+) mm behind/);
      if (m) assert.ok(Number(m[1]) > 0, part.id + ' ' + mode + ' s=' + s + ': ' + f.describe);
    }
  }
});

test('an offset section joins two genuine cuts with no line at the jog, and the 3D cap includes the jog face', () => {
  const part = M.byId.bracket, j = part.offset.jog;
  for (const [a, b] of [[-10, 3], [-20, 10]]) {
    const r = M.compute('bracket', { mode: 'offset', a, b });
    const left = trueSectionArea(part, a, -Infinity, j), right = trueSectionArea(part, b, j, Infinity);
    assert.ok(Math.abs(r.view.capArea - left.area - right.area) <= left.bound + right.bound + 1e-9, 'area is the left leg at a plus the right leg at b');
    for (const row of r.view.rows) for (let i = 0; i + 1 < row.length; i++) {
      if (Math.abs(row[i].ub - j) < 1e-9 && row[i].seg && row[i + 1].seg && row[i].seg.src.kind === 'keep' && row[i + 1].seg.src.kind === 'keep')
        assert.equal(row[i].edgeRight, false, 'cut-to-cut at the jog draws no line');
    }
    const mesh = M.meshData(r.kept), jogArea = capArea(mesh, 'x', j);
    const expectJog = Math.abs(b - a) * 12;                    // the base is solid along x = jog between the legs
    assert.ok(Math.abs(jogArea - expectJog) < 1e-6, 'jog cap ' + jogArea + ' vs ' + expectJog);
  }
  assert.throws(() => M.compute('bushing', { mode: 'offset' }), /no offset section/);
});

function capArea(mesh, axis, value) {
  const p = mesh.cap.pos;
  let total = 0;
  for (let i = 0; i < p.length; i += 9) {
    const A = [p[i], p[i + 1], p[i + 2]], B = [p[i + 3], p[i + 4], p[i + 5]], C = [p[i + 6], p[i + 7], p[i + 8]];
    const k = axis === 'x' ? 0 : 1;
    if (![A, B, C].every(v => Math.abs(v[k] - value) < 1e-9)) continue;
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    total += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }
  return total;
}

test('3D caps lie exactly on the plane and match the hatched SVG area; solids stay closed', () => {
  for (const part of M.parts) for (const s of [part.plane.min + 2, 0, part.plane.max - 5]) for (const flip of [false, true]) {
    const r = M.compute(part.id, { mode: 'full', s, flip }), kept = M.meshData(r.kept), rem = M.meshData(M.removed(r));
    const p = kept.cap.pos;
    for (let i = 1; i < p.length; i += 3) assert.equal(p[i], s, 'cap vertex on plane y = ' + s);
    assert.ok(Math.abs(capArea(kept, 'y', s) - r.view.capArea) < 1e-6, part.id + ' s=' + s + ': cap face equals hatched area');
    const whole = M.volume(M.whole(part.id)), vk = M.volume(r.kept), vr = M.volume(M.removed(r));
    assert.ok(Math.abs(vk + vr - whole) < 1e-6 * whole, 'kept + removed = whole');
    assert.ok(Math.abs(M.meshVolume(kept) - vk) < 1e-6 * whole, 'kept surface encloses its volume');
    assert.ok(Math.abs(M.meshVolume(rem) - vr) < 1e-6 * whole, 'removed surface encloses its volume');
  }
});

test('flipping the arrows views the other side: mirrored layout, same geometry', () => {
  for (const id of ['bushing', 'pulley']) for (const s of [-15, 0, 9]) {
    const a = M.compute(id, { mode: 'full', s }), b = M.compute(id, { mode: 'full', s: -s, flip: true });
    assert.ok(Math.abs(a.view.capArea - b.view.capArea) < 1e-9, id + ' symmetric about its axis');
  }
  const front = M.compute('bracket', { mode: 'full', s: 3 }), back = M.compute('bracket', { mode: 'full', s: 3, flip: true });
  assert.ok(Math.abs(front.view.capArea - back.view.capArea) < 1e-9, 'same plane, same cut face');
  assert.ok(front.view.faces.some(f => /upright/.test(f.describe)) && !back.view.faces.some(f => /upright/.test(f.describe)), 'upright is beyond the plane only when looking toward the back');
});

test('top view hides the body under the flange and shows the counterbore and bore', () => {
  const radii = new Set(M.topView('bushing').polylines.map(pl => Math.round(Math.max(...pl.map(p => Math.hypot(p[0], p[1]))))));
  assert.deepEqual([...radii].sort((a, b) => a - b), [10, 15, 30]);
});

test('prediction scoring marks right and wrong selections and skips slivers', () => {
  const v = M.compute('bushing', { mode: 'full', s: 0 }).view, cuts = v.faces.filter(f => f.type === 'cut').map(f => f.n);
  assert.deepEqual(cuts, [2, 4]);
  assert.deepEqual(M.score(v, new Set(cuts)), { results: M.score(v, new Set(cuts)).results, right: 4, total: 4 });
  assert.equal(M.score(v, new Set()).right, 2);
  const one = M.score(v, new Set([2, 3]));
  assert.deepEqual(one.results.map(r => r.correct), [true, true, false, false]);
  // Every scored region is offered as a selectable region, and nothing else is.
  for (const part of M.parts) for (const s of positions(part)) {
    const r = M.compute(part.id, { mode: 'full', s }), svg = R.sheet(r, { interactive: true, predict: { selected: new Set(), revealed: false } });
    const total = M.score(r.view, new Set()).total;
    assert.ok(total >= 1, part.id + ' s=' + s + ' has something to predict');
    assert.equal((svg.match(/role="button"/g) || []).length, total, part.id + ' s=' + s);
  }
});

test('invalid inputs are refused rather than drawn', () => {
  assert.throws(() => M.compute('bushing', { mode: 'full', s: 30 }), RangeError);
  assert.throws(() => M.compute('bushing', { mode: 'full', s: NaN }), RangeError);
  assert.throws(() => M.compute('bracket', { mode: 'offset', a: -30, b: 3 }), RangeError);
  assert.throws(() => M.compute('gear', { mode: 'full', s: 0 }), /Unknown part/);
});

test('renderer: no element IDs, hatching only where the plane cuts, blank outline while predicting', () => {
  const r = M.compute('bushing', { mode: 'full', s: 0 });
  const plain = R.sheet(r), predict = R.sheet(r, { interactive: true, predict: { selected: new Set(), revealed: false } });
  assert.doesNotMatch(plain + predict, /\sid="/);
  assert.equal((plain.match(/class="sve-hatch"/g) || []).length, 2);
  assert.equal((predict.match(/class="sve-hatch"/g) || []).length, 0);
  assert.equal((predict.match(/role="button"/g) || []).length, 4);
  assert.match(plain, /SECTION A–A/);
  const revealed = R.sheet(r, { interactive: true, predict: { selected: new Set([3]), revealed: true } });
  // Region 3 (bore, not cut) chosen; regions 2 and 4 (cut) missed: three wrong faces and three wrong badges.
  assert.equal((revealed.match(/is-wrong/g) || []).length, 6);
  for (const m of ['1 ✓', '2 ✗', '3 ✗', '4 ✗']) assert.ok(revealed.includes('>' + m + '<'), m);
});

test('the static lesson in the page matches the shared model and renderer', () => {
  execFileSync(process.execPath, [path.join(__dirname, 'static.cjs'), '--check'], { stdio: 'pipe' });
});
