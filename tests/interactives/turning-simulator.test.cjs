'use strict';
/* Focused tests for interactives/turning-simulator/model.js: the lathe engine,
   its refusals, and the inspection.
   Run: node --test --test-concurrency=2 tests/interactives/turning-simulator.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MOD = path.join(__dirname, '..', '..', 'interactives', 'turning-simulator');
const M = require(path.join(MOD, 'model.js'));

/* A tiny driver: each op is what a learner can do with the controls. */
function drive(st, ops) {
  const log = [];
  for (const op of ops) {
    const [k, a, b] = op;
    let r = null;
    if (k === 'sp') { M.setSpindle(st, a); continue; }
    if (k === 'tool') { r = M.selectTool(st, a); assert.ok(r.ok, 'tool change ' + a + ': ' + r.text); continue; }
    if (k === 'drill') { M.setDrill(st, a); continue; }
    if (k === 'tpi') { M.setPitch(st, a); continue; }
    if (k === 'mv') { r = M.move(st, a, b); }
    if (k === 'z') { r = M.move(st, a, st.tr * 2); }
    if (k === 'x') { r = M.move(st, st.tz, a); }
    if (k === 'th') { r = M.threadPass(st, a); }
    log.push({ op, r });
  }
  return log;
}
const stops = (log) => log.filter((e) => e.r && e.r.stop && e.r.stop.code !== 'parted').map((e) => e.r.stop.code);
const tool = (id) => [['sp', false], ['tool', id], ['sp', true]];
const FACE = [['sp', true], ['mv', 0, 1.4], ['x', 0], ['x', 1.4]];

/* One sensible way to make each part. Other orders are tested below. */
const SEQ = {
  'stepped-pin': [
    ...FACE,
    ['mv', 0.1, 0.880], ['z', -1.25], ['x', 1.1], ['z', 0.1],
    ['x', 0.760], ['z', -1.25], ['x', 1.1], ['z', 0.1],
    ['x', 0.750], ['z', -1.25], ['x', 1.1], ['z', 0.1],
    ['x', 0.620], ['z', -0.625], ['x', 0.8], ['z', 0.1],
    ['x', 0.500], ['z', -0.625], ['x', 0.8], ['z', 0.1],
    ...tool('chamfer'), ['mv', 0.0, 0.6], ['x', 0.440], ['x', 0.7],
    ...tool('groove'), ['mv', -1.5, 1.2], ['x', 0]
  ],
  'bushing': [
    ...FACE,
    ['mv', 0.1, 1.125], ['z', -1.2], ['x', 1.4], ['z', 0.1],
    ...tool('center'), ['z', -0.15], ['z', 0.6],
    ['sp', false], ['tool', 'drill'], ['drill', '0.5000'], ['sp', true], ['z', -1.3], ['z', 0.6],
    ...tool('bore'), ['mv', 0.1, 0.580], ['z', -1.10], ['x', 0.55], ['z', 0.1],
    ['x', 0.625], ['z', -1.10], ['x', 0.60], ['z', 0.1],
    ...tool('chamfer'), ['mv', 0.0, 1.2], ['x', 1.065], ['x', 1.3], ['mv', -1.0, 1.3], ['x', 1.065], ['x', 1.3],
    ...tool('csink'), ['z', -0.3425], ['z', 0.6],
    ...tool('groove'), ['mv', -1.0, 1.4], ['x', 0.5]
  ],
  'thumb-screw': [
    ...FACE,
    ['mv', 0.1, 0.860], ['z', -1.40], ['x', 1.1],
    ...tool('knurl'), ['mv', -0.90, 0.95], ['x', 0.840], ['z', -1.21], ['x', 1.0],
    ...tool('turn'), ['mv', 0.1, 0.68], ['z', -0.75], ['x', 1.0], ['z', 0.1], ['x', 0.48], ['z', -0.75], ['x', 1.0], ['z', 0.1],
    ['x', 0.375], ['z', -0.75], ['x', 1.0], ['z', 0.1],
    ...tool('groove'), ['x', 1.0], ['z', -0.625], ['x', 0.290], ['x', 1.0],
    ...tool('chamfer'), ['mv', 0, 0.5], ['x', 0.315], ['x', 0.6],
    ['sp', false], ['tool', 'thread'], ['tpi', 16], ['sp', true],
    ['mv', 0.1, 0.345], ['th', -0.69], ['x', 0.5], ['z', 0.1],
    ['x', 0.318], ['th', -0.69], ['x', 0.5], ['z', 0.1],
    ['x', 0.299], ['th', -0.69], ['x', 0.5], ['z', 0.1],
    ...tool('groove'), ['mv', -1.25, 1.0], ['x', 0]
  ],
  'knurled-nut': [
    ...FACE,
    ['mv', 0.1, 0.860], ['z', -0.70], ['x', 1.1],
    ...tool('knurl'), ['mv', 0.0, 0.95], ['x', 0.840], ['z', -0.40], ['x', 1.0],
    ...tool('center'), ['z', -0.15], ['z', 0.6],
    ['sp', false], ['tool', 'drill'], ['drill', '0.4219'], ['sp', true], ['z', -0.9], ['z', 0.6],
    ['sp', false], ['tool', 'ithread'], ['tpi', 13], ['sp', true],
    ['mv', 0.1, 0.445], ['th', -0.6], ['x', 0.40], ['z', 0.1],
    ['x', 0.469], ['th', -0.6], ['x', 0.40], ['z', 0.1],
    ['x', 0.493], ['th', -0.6], ['x', 0.40], ['z', 0.1],
    ['x', 0.503], ['th', -0.6], ['x', 0.40], ['z', 0.1],
    ...tool('groove'), ['mv', -0.5, 1.0], ['x', 0.3]
  ]
};

/* ---- the stock and the coordinate frame ------------------------------------*/

test('every part starts as a sawn bar a little past Z0, held in the jaws', () => {
  for (const T of M.TARGETS) {
    const st = M.create(T.id);
    assert.equal(st.R, T.stock.dia / 2);
    assert.ok(Math.abs(Math.round(T.stock.zJaw / M.COL) * M.COL - T.stock.zJaw) < 1e-9, 'the jaw face sits on a column edge');
    assert.ok(M.frontZ(st.work) > 0.04 && M.frontZ(st.work) <= T.stock.zEnd + M.COL, 'the sawn end is past Z0');
    const ev = M.evaluate(st);
    assert.equal(ev.items[0].id, 'face');
    assert.equal(ev.items[0].status, 'over', T.id + ': the sawn end is not a faced end');
    assert.match(ev.items[0].hint, /sawn end/);
    // Stock long enough for the part, a parting cut and clearance from the jaws.
    assert.ok(-T.stock.zJaw > T.length.L + 0.125 + 0.25, T.id + ': room to part off clear of the jaws');
    for (const id of M.TOOL_ORDER) {
      const p = M.parkFor(st, id);
      M.selectTool(st, id);
      assert.deepEqual(M.position(st), { z: p.z, x: M.round(p.r * 2, 4) });
    }
  }
});

/* ---- cutting from outside -------------------------------------------------*/

test('facing to the center leaves a flat face at the tool\'s Z; stopping short leaves a nub', () => {
  const st = M.create('stepped-pin');
  const log = drive(st, FACE);
  assert.deepEqual(stops(log), []);
  const ev = M.evaluate(st);
  assert.equal(ev.items[0].status, 'ok');
  assert.ok(Math.abs(ev.zFace) < 1e-9, 'face at Z0');
  // The slice faced off at the center was too thin to survive: no "part" falls.
  assert.equal(st.part, null);

  const short = M.create('stepped-pin');
  drive(short, [['sp', true], ['mv', 0, 1.4], ['x', 0.200], ['x', 1.4]]);
  const f = M.evaluate(short).items[0];
  assert.equal(f.status, 'over');
  assert.match(f.made, /nub/);
  assert.match(f.hint, /X 0/);
});

test('a turning pass cuts its diameter up to a square shoulder and nowhere else', () => {
  const st = M.create('stepped-pin');
  drive(st, [...FACE, ['mv', 0.1, 0.880], ['z', -0.500]]);
  const p = st.work;
  const at = (z) => p.ro[M.colAt(p, z)];
  assert.ok(Math.abs(at(-0.2) - 0.440) < 1e-9, 'cut to the readout diameter');
  assert.ok(Math.abs(at(-0.4995 + 0.016) - 0.440) < 1e-6, 'full depth one nose radius from the stop');
  assert.ok(at(-0.4995) < 0.46, 'cut right up to the stop');
  assert.equal(at(-0.5005), 0.5, 'nothing left of the leading edge is touched');
  assert.equal(at(-0.9), 0.5);
  // The 0.016 in nose radius fillets the inside corner; it never undercuts it.
  for (let z = -0.4995; z < -0.48; z += 0.001) assert.ok(at(z) >= 0.440 - 1e-9 && at(z) <= at(z - 0.001) + 1e-12, 'fillet rises toward the shoulder');
});

test('a cut deeper than the tool takes is refused at contact, by feed or by small jogs', () => {
  const st = M.create('stepped-pin');
  drive(st, FACE);
  M.move(st, 0.1, 0.700);                 // 0.150 off the radius
  const r = M.move(st, -1.0, 0.700);
  assert.equal(r.stop.code, 'engage');
  assert.match(r.stop.text, /at most 0\.100 in/);
  assert.ok(st.tz > -0.03, 'stopped within a few thousandths of the end');
  // Jogging 0.001 at a time is the same cut, and is refused the same way.
  const j = M.create('stepped-pin');
  drive(j, [...FACE, ['mv', 0.01, 0.700]]);
  let code = null;
  for (let k = 0; k < 200 && !code; k++) { const q = M.move(j, j.tz - 0.001, 0.700); if (q.stop) { code = q.stop.code; } }
  assert.equal(code, 'engage');
  // Within the limit it cuts.
  const ok = M.create('stepped-pin');
  drive(ok, [...FACE, ['mv', 0.1, 0.810]]);
  assert.equal(M.move(ok, -1.0, 0.810).stop, null);
});

test('nothing cuts with the spindle stopped, and tools change only when it is', () => {
  const st = M.create('stepped-pin');
  M.move(st, 0.1, 0.9);
  const before = st.work.ro.slice();
  const r = M.move(st, -0.5, 0.9);
  assert.equal(r.stop.code, 'spindle');
  assert.deepEqual(Array.from(st.work.ro), Array.from(before), 'no metal moved');
  M.setSpindle(st, true);
  const t = M.selectTool(st, 'groove');
  assert.equal(t.ok, false);
  assert.match(t.text, /Stop the spindle/);
  assert.equal(st.tool, 'turn');
  M.setSpindle(st, false);
  assert.equal(M.selectTool(st, 'groove').ok, true);
});

test('the tool cannot run into the chuck jaws', () => {
  const st = M.create('stepped-pin');
  M.setSpindle(st, true);
  M.move(st, 0.4, 1.3);
  const r = M.move(st, -2.5, 1.3);
  assert.equal(r.stop.code, 'jaws');
  assert.ok(st.tz >= st.zJaw - 1e-9);
});

test('the blade plunges and parts; sideways in a cut it is refused', () => {
  const st = M.create('stepped-pin');
  drive(st, [...FACE, ...tool('groove'), ['mv', -0.5, 1.2], ['x', 0.800]]);
  const side = M.move(st, -0.45, 0.800);
  assert.equal(side.stop.code, 'side');
  assert.match(side.stop.text, /front edge/);
  // A groove exactly the blade's width, right corner at the readout.
  const p = st.work;
  assert.equal(p.ro[M.colAt(p, -0.4995)], 0.5);
  assert.ok(Math.abs(p.ro[M.colAt(p, -0.5005)] - 0.4) < 1e-9);
  assert.ok(Math.abs(p.ro[M.colAt(p, -0.6245)] - 0.4) < 1e-9);
  assert.equal(p.ro[M.colAt(p, -0.6255)], 0.5);
  // Straight in to the center parts the work off.
  M.move(st, -0.5, 1.2);
  const cut = M.move(st, -0.5, 0);
  assert.equal(cut.parted, true);
  assert.ok(st.part, 'the part dropped');
  const span = (q) => { let a = -1, b = -1; for (let i = 0; i < q.n; i++) if (M.has(q, i)) { if (a < 0) a = i; b = i; } return [a, b]; };
  const [a, b] = span(st.part);
  assert.ok(Math.abs((b - a + 1) * M.COL - 0.5) < 0.0015, 'part is the 0.500 in beyond the blade');
  assert.ok(span(st.work)[1] * M.COL + st.work.zL <= -0.625 + 1e-9, 'the remnant stays in the chuck');
});

/* ---- holes ------------------------------------------------------------------*/

test('the boring bar needs a hole it fits in, and cuts only with its tip', () => {
  const st = M.create('bushing');
  drive(st, [...FACE, ...tool('bore'), ['mv', 0.1, 0.580]]);
  assert.equal(M.move(st, -0.5, 0.580).stop.code, 'nohole');
  drive(st, [...tool('center'), ['z', -0.15], ['z', 0.6], ['sp', false], ['tool', 'drill'], ['drill', '0.2500'], ['sp', true], ['z', -1.0], ['z', 0.6]]);
  drive(st, [...tool('bore'), ['mv', 0.1, 0.30]]);
  const small = M.move(st, -0.5, 0.30);
  assert.ok(['bar', 'nohole', 'body'].includes(small.stop.code), 'a 1/4 in hole is too small for the bar: ' + small.stop.code);
  assert.match(M.explain(st, 'bar'), /0\.450/);
  // With a 1/2 in hole it fits, and the tip opens the hole.
  drive(st, [['sp', false], ['tool', 'drill'], ['drill', '0.5000'], ['sp', true], ['z', -1.2], ['z', 0.6]]);
  drive(st, [...tool('bore'), ['mv', 0.1, 0.560]]);
  assert.equal(M.move(st, -0.8, 0.560).stop, null);
  assert.ok(Math.abs(st.work.ri[M.colAt(st.work, -0.4)] - 0.28) < 1e-9);
  // Pull the tip toward the center and the back of the bar meets the far wall.
  const far = M.move(st, -0.8, 0.30);
  assert.equal(far.stop.code, 'farwall');
  // Run on past the drilled depth and the end of the bar meets the drill point's cone.
  assert.equal(M.move(st, st.tz, 0.560).stop, null, 'back out to the bored size');
  const deep = M.move(st, -1.3, 0.560);
  assert.ok(['bottom', 'body', 'engage'].includes(deep.stop.code), deep.stop.code);
});

test('tailstock tools stay on the centerline; the drill is pecked; a hole without a center is noted', () => {
  const st = M.create('bushing');
  drive(st, [...FACE, ['sp', false], ['tool', 'drill'], ['drill', '0.5000'], ['sp', true]]);
  const sideways = M.move(st, 0.5, 0.3);
  assert.equal(sideways.stop.code, 'axis');
  assert.equal(st.tr, 0);
  const r = M.move(st, -2.0, 0);
  assert.equal(r.stop.code, 'peck');
  assert.ok(Math.abs(st.tz - -1.5) < 0.01, 'three diameters deep, from the face');
  assert.equal(st.notes.noCenter, true);
  M.move(st, 0.5, 0);                    // out of the hole: the chips clear
  assert.equal(M.move(st, -1.8, 0).stop, null, 'after a peck it can go deeper');
  assert.match(M.evaluate(st).notes.join(' '), /does not predict drill wandering/);
  assert.match(M.evaluate(st).notes.join(' '), /not a universal spotting tool/);
  // Center drilled first: no note. And the center drill goes only as deep as its cone.
  const c = M.create('bushing');
  drive(c, [...FACE, ...tool('center')]);
  assert.equal(M.move(c, -0.23, 0).stop, null);
  assert.equal(M.move(c, -0.4, 0).stop.code, 'body');
  drive(c, [['z', 0.6], ['sp', false], ['tool', 'drill'], ['drill', '0.5000'], ['sp', true], ['z', -1.2]]);
  assert.equal(c.notes.noCenter, false);
});

/* ---- threads ----------------------------------------------------------------*/

function threadReady() {
  const st = M.create('thumb-screw');
  const log = drive(st, [...FACE, ['mv', 0.1, 0.800], ['z', -0.75], ['x', 1.0], ['z', 0.1], ['x', 0.600], ['z', -0.75], ['x', 1.0], ['z', 0.1], ['x', 0.400], ['z', -0.75], ['x', 1.0], ['z', 0.1], ['x', 0.375], ['z', -0.75], ['x', 1.0], ...tool('groove'), ['x', 1.0], ['z', -0.625], ['x', 0.290], ['x', 1.0],
    ['sp', false], ['tool', 'thread'], ['tpi', 16], ['sp', true]]);
  assert.deepEqual(stops(log), [], 'fixture: turned and grooved');
  return st;
}
const minima = (p, z0, z1) => {
  const out = [];
  for (let i = M.colAt(p, z0) + 1; i < M.colAt(p, z1) - 1; i++) {
    if (p.ro[i] < p.ro[i - 1] - 1e-12 && p.ro[i] <= p.ro[i + 1]) {
      let j = i; while (p.ro[j + 1] === p.ro[i]) j++;
      out.push(M.zc(p, (i + j) / 2));
    }
  }
  return out;
};

test('a threading pass cuts one notch per pitch, and later passes land in the same notches', () => {
  const st = threadReady();
  drive(st, [['mv', 0.1, 0.350]]);
  const r1 = M.threadPass(st, -0.69);
  assert.equal(r1.stop, null);
  assert.ok(Math.abs(st.tz - -0.6875) < 1e-9, 'the tool rests in the last notch, short of the stop');
  const p = st.work;
  const m1 = minima(p, -0.6, -0.05);
  assert.ok(m1.length >= 8);
  for (let k = 1; k < m1.length; k++) assert.ok(Math.abs(m1[k] - m1[k - 1] - 1 / 16) < 0.0015, 'notches one pitch apart');
  for (const z of m1) assert.ok(Math.abs(z / (1 / 16) - Math.round(z / (1 / 16))) < 0.02, 'on the locked phase');
  drive(st, [['x', 0.5], ['z', 0.1], ['x', 0.330]]);
  M.threadPass(st, -0.69);
  const m2 = minima(st.work, -0.6, -0.05);
  assert.deepEqual(m2.map((z) => M.round(z, 3)), m1.map((z) => M.round(z, 3)), 'same notches, deeper');
  assert.ok(Math.abs(st.work.ro[M.colAt(st.work, m2[2])] - 0.165) < 0.001);
  // Every pass is recorded with its pitch.
  assert.ok(Math.abs(st.work.thO[M.colAt(st.work, -0.3)] - 1 / 16) < 1e-12);
});

test('threading: infeed per pass is limited, the tool must back out, and a wrong pitch crosses the thread', () => {
  const st = threadReady();
  drive(st, [['mv', 0.1, 0.330]]);              // 0.0225 in on the first pass
  const deep = M.threadPass(st, -0.69);
  assert.equal(deep.stop.code, 'infeed');
  assert.match(deep.stop.text, /0\.015 in of infeed per pass/);
  drive(st, [['x', 0.350]]);
  assert.equal(M.threadPass(st, -0.69).stop, null);
  const back = M.move(st, 0.1, 0.350);         // return without backing out
  assert.equal(back.stop.code, 'retract');
  assert.match(back.stop.text, /X above 0\.375/);
  assert.equal(M.setPitch(st, 13).ok, false, 'no gear change with the spindle running');
  drive(st, [['x', 0.5], ['z', 0.1], ['sp', false], ['tpi', 13], ['sp', true], ['x', 0.352]]);
  M.threadPass(st, -0.69);
  assert.ok(Array.from(st.work.thO).some((v) => v === -1), 'columns cut at two pitches');
  const th = M.evaluate(st).items.find((x) => x.label === 'Thread');
  assert.equal(th.status, 'under');
  assert.match(th.made, /Crossed/);
});

test('without a relief groove the threading tool cannot run up to the head', () => {
  const st = M.create('thumb-screw');
  assert.deepEqual(stops(drive(st, [...FACE, ['mv', 0.1, 0.800], ['z', -0.75], ['x', 1.0], ['z', 0.1], ['x', 0.600], ['z', -0.75], ['x', 1.0], ['z', 0.1], ['x', 0.400], ['z', -0.75], ['x', 1.0], ['z', 0.1], ['x', 0.375], ['z', -0.75], ['x', 1.0], ['sp', false], ['tool', 'thread'], ['tpi', 16], ['sp', true], ['mv', 0.1, 0.350]])), []);
  const r = M.threadPass(st, -0.75);
  assert.equal(r.crashed, true);
  assert.equal(r.stop.code, 'threadstop');
  assert.match(r.stop.text, /relief groove/);
  assert.ok(['holder', 'body'].includes(r.crash), r.crash);
  assert.ok(st.tz > -0.75 + 0.03, 'the pass ended before the shoulder');
});

test('the internal threading bar threads a drilled hole from outside the part', () => {
  const st = M.create('knurled-nut');
  drive(st, [...FACE, ...tool('center'), ['z', -0.15], ['z', 0.6], ['sp', false], ['tool', 'drill'], ['drill', '0.4219'], ['sp', true], ['z', -0.9], ['z', 0.6],
    ['sp', false], ['tool', 'ithread'], ['tpi', 13], ['sp', true], ['mv', 0.1, 0.445]]);
  assert.equal(M.threadPass(st, -0.6).stop, null);
  const back = M.move(st, 0.1, st.tr * 2);
  assert.equal(back.stop.code, 'retract');
  assert.match(back.stop.text, /X below 0\.422/);
  assert.ok(Math.abs(st.work.thI[M.colAt(st.work, -0.3)] - 1 / 13) < 1e-12);
});

/* ---- knurling is forming ------------------------------------------------------*/

test('the knurl moves metal instead of removing it: roots sink as far as crests rise', () => {
  const st = M.create('knurled-nut');
  drive(st, [...FACE, ['mv', 0.1, 0.860], ['z', -0.7], ['x', 1.1], ...tool('knurl'), ['mv', -0.3, 0.95]]);
  const r = M.move(st, -0.3, 0.846);
  assert.equal(r.stop, null);
  assert.equal(r.cut, 0, 'no chips');
  assert.equal(r.formed, true);
  const p = st.work, i = M.colAt(p, -0.3);
  assert.ok(Math.abs(p.kB[i] - 0.430) < 1e-9);
  assert.ok(Math.abs(p.kP[i] - 0.007) < 1e-9);
  const crest = p.ro[i], root = p.kB[i] - p.kP[i];
  assert.ok(Math.abs((crest - p.kB[i]) - (p.kB[i] - root)) < 1e-12, 'mean radius stays at the blank');
  assert.ok(Math.abs(2 * crest - 0.874) < 1e-9, 'the diameter over the points grows');
  // Full depth is the limit; and the wheels cannot be pushed into a shoulder.
  assert.equal(M.move(st, -0.3, 0.836).stop.code, 'fulldepth');
  M.move(st, -0.3, 0.840);
  const wall = M.move(st, -0.6, 0.840);
  assert.equal(wall.stop.code, 'shoulder');
});

/* ---- inspection, alternative orders and corrections ---------------------------*/

for (const T of M.TARGETS) {
  test('a sensible sequence makes an accepted ' + T.title.toLowerCase(), () => {
    const st = M.create(T.id);
    const log = drive(st, SEQ[T.id]);
    assert.deepEqual(stops(log).filter((c) => c !== 'air'), [], 'no refusals on the way');
    const ev = M.evaluate(st);
    const bad = ev.items.filter((x) => x.status !== 'ok').map((x) => x.label + ': ' + x.made + ' / ' + x.hint);
    assert.deepEqual(bad, []);
    assert.equal(ev.accepted, true);
    assert.equal(ev.notes.length, 0);
  });
}

test('another valid order also passes: bore before turning the outside, chamfers last', () => {
  const st = M.create('bushing');
  drive(st, [
    ...FACE,
    ...tool('center'), ['z', -0.15], ['z', 0.6],
    ['sp', false], ['tool', 'drill'], ['drill', '0.5000'], ['sp', true], ['z', -1.3], ['z', 0.6],
    ...tool('bore'), ['mv', 0.1, 0.570], ['z', -1.10], ['x', 0.55], ['z', 0.1], ['x', 0.626], ['z', -1.10], ['x', 0.60], ['z', 0.1],
    ...tool('csink'), ['z', -0.3430], ['z', 0.6],
    ...tool('turn'), ['mv', 0.1, 1.125], ['z', -1.2], ['x', 1.4],
    ...tool('chamfer'), ['mv', -1.0, 1.3], ['x', 1.065], ['x', 1.3], ['mv', 0.0, 1.2], ['x', 1.065], ['x', 1.3],
    ...tool('groove'), ['mv', -1.0, 1.4], ['x', 0.5]
  ]);
  const ev = M.evaluate(st);
  assert.deepEqual(ev.items.filter((x) => x.status !== 'ok').map((x) => x.label), []);
  assert.equal(ev.accepted, true);
});

test('inspection says what to do next, and tells fixable from scrap', () => {
  const st = M.create('stepped-pin');
  drive(st, [...FACE, ['mv', 0.1, 0.880], ['z', -1.25], ['x', 1.1], ['z', 0.1], ['x', 0.760], ['z', -1.25], ['x', 1.1], ['z', 0.1]]);
  let ev = M.evaluate(st);
  const body = ev.items.find((x) => x.label === 'Body');
  assert.equal(body.status, 'over');
  assert.match(body.hint, /pass at X 0\.750/);
  const pin = ev.items.find((x) => x.label === 'Pin');
  assert.equal(pin.status, 'over');
  assert.match(pin.hint, /more than one pass/);
  const sh = ev.items.filter((x) => x.label === 'Shoulder');
  assert.equal(sh[0].status, 'missing');
  const len = ev.items.find((x) => x.label === 'Overall length');
  assert.equal(len.status, 'pending');
  assert.match(len.hint, /Z −1\.500/);
  // Too deep is scrap, and it says so.
  drive(st, [['x', 0.740], ['z', -1.25], ['x', 1.1]]);
  ev = M.evaluate(st);
  const under = ev.items.find((x) => x.label === 'Body');
  assert.equal(under.status, 'under');
  assert.match(under.hint, /undo/);
  // A step carried too far is scrap too; one that stops short says where to go.
  const s2 = M.create('stepped-pin');
  drive(s2, [...FACE, ['mv', 0.1, 0.880], ['z', -0.600]]);
  const short = M.evaluate(s2).items.filter((x) => x.label === 'Shoulder')[0];
  assert.equal(short.status, 'over');
  assert.match(short.hint, /Z −0\.625/);
  const s3 = M.create('stepped-pin');
  drive(s3, [...FACE, ['mv', 0.1, 0.880], ['z', -0.650]]);
  assert.equal(M.evaluate(s3).items.filter((x) => x.label === 'Shoulder')[0].status, 'under');
});

test('lengths are measured from the face as it was actually cut', () => {
  const st = M.create('stepped-pin');
  const seq = SEQ['stepped-pin'].map((op) => (op[0] === 'mv' && op[1] === 0 && op[2] === 1.4) ? ['mv', -0.010, 1.4] : op);
  drive(st, seq);
  const ev = M.evaluate(st);
  assert.match(ev.items[0].made, /0\.010 in past Z0/);
  const sh = ev.items.filter((x) => x.label === 'Shoulder');
  assert.match(sh[0].made, /^0\.615/);
  assert.equal(sh[0].status, 'over');
  const len = ev.items.find((x) => x.label === 'Overall length');
  assert.equal(len.made, '1.490 in');
  assert.equal(len.status, 'under');
  assert.equal(ev.accepted, false);
});

test('a knurl that is too shallow, too long a blank, and an unknurled head each say why', () => {
  const st = M.create('thumb-screw');
  drive(st, [...FACE, ['mv', 0.1, 0.900], ['z', -1.40], ['x', 1.1]]);
  let k = M.evaluate(st).items.find((x) => x.label === 'Knurled head');
  assert.equal(k.status, 'missing');
  assert.match(k.hint, /0\.860/);
  drive(st, [...tool('knurl'), ['mv', -0.9, 1.0], ['x', 0.890], ['z', -1.21], ['x', 1.0]]);
  k = M.evaluate(st).items.find((x) => x.label === 'Knurled head');
  assert.equal(k.status, 'over');
  assert.match(k.made, /not fully formed/);
  drive(st, [['mv', -0.9, 1.0], ['x', 0.880], ['z', -1.21], ['x', 1.0]]);
  k = M.evaluate(st).items.find((x) => x.label === 'Knurled head');
  assert.equal(k.status, 'over');
  assert.match(k.hint, /blank decides/);
});

/* ---- undo and determinism ---------------------------------------------------------*/

test('undo restores the work, the tool and its position exactly', () => {
  const st = M.create('thumb-screw');
  drive(st, FACE);
  const snap = M.snapshot(st);
  const ro0 = Array.from(st.work.ro), pos0 = M.position(st);
  drive(st, [['mv', 0.1, 0.860], ['z', -1.0], ...tool('groove'), ['mv', -0.5, 1.0], ['x', 0]]);
  assert.ok(st.part, 'something was parted off');
  M.restore(st, snap);
  assert.deepEqual(Array.from(st.work.ro), ro0);
  assert.deepEqual(M.position(st), pos0);
  assert.equal(st.tool, 'turn');
  assert.equal(st.part, null);
  assert.equal(st.spindle, true);
});

test('the engine is deterministic and every message is complete', () => {
  const a = M.create('knurled-nut'), b = M.create('knurled-nut');
  drive(a, SEQ['knurled-nut']); drive(b, SEQ['knurled-nut']);
  assert.deepEqual(Array.from(a.part.ri), Array.from(b.part.ri));
  const st = M.create('bushing');
  for (const id of M.TOOL_ORDER) {
    M.setSpindle(st, false); M.selectTool(st, id);
    for (const code of ['spindle', 'engage', 'body', 'holder', 'side', 'jaws', 'chuck', 'chuck-body', 'nohole', 'bar', 'bottom', 'farwall', 'fulldepth', 'shoulder', 'peck', 'retract', 'infeed', 'limit', 'axis', 'parted', 'nopass', 'notthread', 'air', 'threadstop']) {
      const t = M.explain(st, code, { engage: 0.12, depth: 1.5, infeed: 0.02, clear: 0.4 });
      assert.ok(t && !/undefined|NaN|null/.test(t), id + '/' + code + ': ' + t);
    }
  }
  for (const T of M.TARGETS) {
    const ev = M.evaluate(M.create(T.id));
    for (const it of ev.items) assert.ok(!/undefined|NaN/.test(JSON.stringify(it)), JSON.stringify(it));
  }
});

test('a solid target rejects an unintended through-bore made with the drill', () => {
  const ops = SEQ['stepped-pin'], st = M.create('stepped-pin');
  const extra = [['sp', false], ['tool', 'drill'], ['drill', '0.2500'], ['sp', true],
    ['z', -0.6], ['z', 0.6], ['z', -1.2], ['z', 0.6], ['z', -1.7], ['z', 0.6]];
  const log = drive(st, [...ops.slice(0, -5), ...extra, ...ops.slice(-5)]);
  assert.deepEqual(stops(log), []);
  assert.equal(2 * st.part.ri[M.colAt(st.part, -0.3)], 0.25);
  const ev = M.evaluate(st);
  assert.equal(ev.accepted, false);
  assert.equal(ev.items.find(x => x.id === 'core').status, 'under');
});

test('every external thread turn needs full depth, not just one finished region', () => {
  const st = M.create('thumb-screw'); let pass = 0;
  const ops = SEQ['thumb-screw'].map(op => op[0] === 'th' && ++pass > 1 ? ['th', -0.25] : op);
  assert.deepEqual(stops(drive(st, ops)), []);
  assert.equal(2 * st.part.ro[M.colAt(st.part, -0.5)], 0.345);
  const ev = M.evaluate(st);
  assert.equal(ev.accepted, false);
  assert.equal(ev.items.find(x => x.id === 'od-0').status, 'over');
});

test('every internal thread turn needs full depth too', () => {
  const st = M.create('knurled-nut'); let pass = 0;
  const ops = SEQ['knurled-nut'].map(op => op[0] === 'th' && ++pass > 1 ? ['th', -0.25] : op);
  assert.deepEqual(stops(drive(st, ops)), []);
  const ev = M.evaluate(st);
  assert.equal(ev.accepted, false);
  assert.equal(ev.items.find(x => x.id === 'id-0').status, 'over');
});

test('equal axial and radial extents do not turn a cylindrical nose into a chamfer', () => {
  const ops = SEQ['stepped-pin'], st = M.create('stepped-pin');
  assert.deepEqual(stops(drive(st, [...ops.slice(0, -11), ['mv', 0.1, 0.440], ['z', -0.030], ['x', 0.800], ...ops.slice(-5)])), []);
  const ev = M.evaluate(st);
  assert.equal(ev.accepted, false);
  const chamfer = ev.items.find(x => x.id === 'ch-0');
  assert.notEqual(chamfer.status, 'ok');
  assert.match(chamfer.made, /not a 45° chamfer/);
});

test('the drawing data agree with themselves', () => {
  for (const T of M.TARGETS) {
    let s = 0;
    for (const sg of T.outside) { assert.ok(Math.abs(sg.from - s) < 1e-9, T.id + ' outside segments are contiguous'); s = sg.to; }
    assert.ok(Math.abs(s - T.length.L) < 1e-9);
    for (const sh of T.shoulders) assert.ok(T.outside.some((sg) => Math.abs(sg.to - sh.at) < 1e-9));
    for (const sg of T.inside) assert.ok(sg.d / 2 >= 0.2, 'a hole the tools can make');
    for (const sg of T.outside.filter((x) => x.kind === 'knurl')) assert.ok(Math.abs(sg.blank + 2 * M.TOOLS.knurl.penFull - sg.d) < 1e-9, 'blank plus a full knurl is the nominal');
    for (const sg of [...T.outside, ...T.inside].filter((x) => x.kind === 'thread')) {
      assert.ok(M.PITCHES.includes(sg.tpi));
      const depth = Math.abs(sg.root[1] - sg.crest[0]) / 2;
      assert.ok(0.004 + 2 * depth * Math.tan(Math.PI / 6) < 1 / sg.tpi, 'the 60 degree tool leaves a flat crest at full depth');
    }
  }
  const bushing = M.target('bushing');
  assert.ok(M.DRILLS.some((d) => d.d >= M.minBore(M.TOOLS.bore) && d.d < bushing.inside[0].d), 'a drill the boring bar fits in');
  const nut = M.target('knurled-nut');
  assert.ok(M.DRILLS.some((d) => d.d >= nut.inside[0].crest[0] && d.d <= nut.inside[0].crest[1] && d.d >= M.minBore(M.TOOLS.ithread)), 'a drill at the thread\'s inside size');
});
