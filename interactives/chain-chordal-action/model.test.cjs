'use strict';
// Run: node --test interactives/chain-chordal-action/model.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const M = require('./model.js');
const D = require('./render.js');
const demo = require('./demo.js');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);
const allN = Array.from({ length: 25 }, (_, i) => i + 6);

test('acceptance values: 9 and 21 teeth', () => {
  close(M.ripple(9) * 100, 6.0307, 5e-4, 'ripple(9) %');
  close(M.ripple(21) * 100, 1.1169, 5e-4, 'ripple(21) %');
  // Independent hand values: 1 − cos 20° and 1 − cos(60/7)°.
  close(M.ripple(9), 1 - Math.cos(20 * Math.PI / 180), 1e-15);
  close(M.ripple(21), 1 - Math.cos(60 / 7 * Math.PI / 180), 1e-15);
});

test('coordinator check: 6 teeth on #40 chain', () => {
  const p = M.pitchOf('40');
  assert.equal(p, 12.7);
  close(M.pitchRadius(6, p), 12.7, 1e-12, 'hexagon: R equals p');
  close(M.ripple(6) * 100, 13.3975, 5e-5);
  close(M.rise(6, p), 1.7015, 5e-5);
});

test('rise is R(1 − cos(180°/N)) and the span drop never exceeds it', () => {
  for (const N of allN) for (const p of [6.35, 12.7, 31.75]) {
    const R = p / (2 * Math.sin(Math.PI / N));
    close(M.pitchRadius(N, p), R, 1e-12);
    close(M.rise(N, p), R * (1 - Math.cos(Math.PI / N)), 1e-12);
    for (let k = 0; k <= 40; k++) {
      const I = M.instant(N, p, 120, k / 40);
      assert.ok(I.drop >= -1e-12 && I.drop <= M.rise(N, p) + 1e-12, `N=${N} drop in range`);
      close(I.height + I.drop, R, 1e-12);
    }
  }
});

test('speed trace repeats exactly once per tooth, peaks at a pin, dips at hand-over', () => {
  for (const N of allN) {
    for (let k = 0; k < 50; k++) {
      const t = -3 + k * 0.137;
      close(M.instant(N, 12.7, 100, t).speedRatio, M.instant(N, 12.7, 100, t + 1).speedRatio, 1e-12, `N=${N} period 1 tooth`);
    }
    close(M.instant(N, 12.7, 100, 0).speedRatio, 1, 1e-15);
    close(M.instant(N, 12.7, 100, 0.5).speedRatio, Math.cos(Math.PI / N), 1e-12);
    // Half a tooth is NOT a period: the peak and the dip differ.
    assert.ok(Math.abs(M.instant(N, 12.7, 100, 0).speedRatio - M.instant(N, 12.7, 100, 0.5).speedRatio) > 1e-4);
    const a = M.leavingAngle(N, 0.4999999), b = M.leavingAngle(N, 0.5);
    assert.ok(a > 0 && b < 0, 'hand-over switches the leaving pin from past-top to before-top');
    close(Math.cos(a), Math.cos(b), 1e-6, 'speed is continuous at hand-over');
  }
});

test('fractional ripple is independent of speed and pitch; pulses scale with speed', () => {
  for (const N of [6, 9, 17, 21, 30]) {
    const ratios = [];
    for (const rpm of [30, 120, 600]) for (const c of M.PITCHES) {
      const s = M.summary(N, c.p, rpm);
      ratios.push((s.vmax - s.vmin) / s.vmax);
      close(s.pulseHz, N * rpm / 60, 1e-12);
    }
    ratios.forEach(r => close(r, M.ripple(N), 1e-12));
  }
});

test('average of the instantaneous speed over one tooth is N·p·n (one pitch per tooth)', () => {
  for (const N of [6, 9, 21, 30]) for (const rpm of [60, 450]) {
    const p = 9.525, steps = 20000;
    let sum = 0;
    for (let i = 0; i < steps; i++) sum += M.instant(N, p, rpm, (i + 0.5) / steps).speed;
    close(sum / steps, N * p * rpm / 60000, 1e-9, `N=${N} mean speed m/s`);
    const s = M.summary(N, p, rpm);
    close(s.vmean / s.vmax, M.meanFactor(N), 1e-12);
    // Shigley's form divides the same spread by the average speed.
    close((s.vmax - s.vmin) / s.vmean, M.rippleOfMean(N), 1e-12);
  }
});

test('ripple falls roughly as 1/N² (small-angle check, not the code path)', () => {
  for (const N of [9, 12, 21, 30]) close(M.ripple(N) / (Math.PI ** 2 / (2 * N * N)), 1, 0.012);
  assert.ok(M.ripple(9) / M.ripple(21) > 5 && M.ripple(9) / M.ripple(21) < 5.6);
});

test('chain pose: rigid one-pitch links, pins on the polygon, level spans, continuous hand-over', () => {
  for (const N of [6, 7, 9, 10, 21, 30]) for (const p of [6.35, 31.75]) {
    for (let k = 0; k < 30; k++) {
      const phase = -2 + k * 0.173, P = M.pose(N, p, phase, 8 * p);
      const chain = P.bottom.slice().reverse().concat(P.wrap.slice().reverse(), P.top);
      for (let i = 0; i + 1 < chain.length; i++) {
        assert.equal(chain[i].j - chain[i + 1].j, 1, 'consecutive absolute pin indices');
        close(Math.hypot(chain[i].x - chain[i + 1].x, chain[i].y - chain[i + 1].y), p, 1e-9, 'link length');
      }
      P.wrap.forEach(q => close(Math.hypot(q.x, q.y), P.R, 1e-9, 'wrapped pin on pitch circle'));
      P.top.forEach(q => close(q.y, P.wrap[0].y, 1e-12, 'top span level'));
      P.bottom.forEach(q => close(q.y, P.wrap[P.wrap.length - 1].y, 1e-12, 'bottom span level'));
      close(P.wrap[0].y, M.instant(N, p, 100, phase).height, 1e-9, 'leaving height matches instant()');
      assert.ok(P.top.every(q => q.x > P.wrap[0].x) && P.bottom.every(q => q.x > P.wrap[P.wrap.length - 1].x), 'spans run to the right');
    }
    // Pins keep their place across the top hand-over (phase 0.5) and the bottom one.
    for (const h of [0.5, N / 2 + 0.5]) {
      const before = M.pose(N, p, h - 1e-9, 8 * p), after = M.pose(N, p, h + 1e-9, 8 * p);
      const where = P => new Map(P.bottom.concat(P.wrap, P.top).map(q => [q.j, q]));
      const A = where(before), B = where(after);
      for (const [j, q] of A) if (B.has(j)) {
        close(q.x, B.get(j).x, 1e-6, `pin ${j} x continuous`); close(q.y, B.get(j).y, 1e-6, `pin ${j} y continuous`);
      }
    }
  }
});

test('invalid inputs are refused with RangeError', () => {
  for (const N of [2, 6.5, NaN, Infinity, '9']) assert.throws(() => M.ripple(N), RangeError);
  for (const p of [0, -1, NaN, Infinity]) assert.throws(() => M.pitchRadius(9, p), RangeError);
  for (const rpm of [-1, NaN, Infinity]) assert.throws(() => M.summary(9, 12.7, rpm), RangeError);
  assert.throws(() => M.instant(9, 12.7, 100, Infinity), RangeError);
  assert.throws(() => M.pitchOf('41x'), RangeError);
  assert.throws(() => M.trace(9, 1, 1), RangeError);
  assert.throws(() => M.pose(9, 12.7, 0, -3), RangeError);
  // A stopped sprocket is valid: ripple is defined, speeds are zero, tooth period infinite.
  const s = M.summary(9, 12.7, 0);
  assert.equal(s.vmax, 0); assert.equal(s.toothPeriod, Infinity); close(s.ripple, M.ripple(9), 0);
});

test('trace samples include the exact hand-over dips', () => {
  const t = M.trace(9, -3, 0, 7);
  const dips = t.filter(q => Math.abs(q[0] - Math.round(q[0] - 0.5) - 0.5) < 1e-12);
  assert.equal(dips.length, 3);
  dips.forEach(q => close(q[1], Math.cos(Math.PI / 9), 1e-12));
  for (let i = 1; i < t.length; i++) assert.ok(t[i][0] >= t[i - 1][0]);
});

test('prediction scoring: bands, and both ripple normalizations agree on the band', () => {
  assert.equal(demo.band(M.ripple(9)), '2to10');
  assert.equal(demo.band(M.rippleOfMean(9)), '2to10');
  assert.equal(demo.band(M.ripple(21)), 'under2');
  assert.equal(demo.band(M.rippleOfMean(21)), 'under2');
  assert.equal(demo.band(M.ripple(6)), 'over10');
  assert.equal(demo.scorePrediction({ 9: '2to10', 21: 'under2' }).correct, 2);
  assert.equal(demo.scorePrediction({ 9: 'under2', 21: 'under2' }).correct, 1);
  assert.equal(demo.scorePrediction({ 9: 'over10', 21: '2to10' }).correct, 0);
});

test('renderer: finite geometry for every tooth count, layout and chain size', () => {
  for (const N of allN) for (const c of M.PITCHES) for (const width of [640, 420]) {
    const st = { teeth: N, chain: c.id, rpm: 120 };
    const svg = D.scene(st, 0.37, { width, ghost: true, uid: 't' }) + D.traceChart({ width, teeth: N, from: -3, to: 0.37, cursor: true, ghost: true, compare: [9, 21] });
    assert.ok(!/NaN|Infinity|undefined/.test(svg), `N=${N} ${c.id} ${width}`);
  }
  const sp = D.sprocketPath(12, 120, 60);
  assert.equal((sp.d.match(/A/g) || []).length, 24, 'one seat arc and one tip arc per tooth');
  assert.ok(sp.tip > 120, 'tooth tips stand outside the pitch circle');
});

test('static fallback carries the formulas, worked example and N-vs-ripple table', () => {
  const html = D.staticLesson();
  for (const s of ['R = p / (2 sin(180°/N))', '1 − cos(180°/N)', 'R (1 − cos(180°/N))', '18.57 mm', '6.03 %', '1.12 %', '13.40 %', '0.55 %', '0.476']) assert.ok(html.includes(s), s);
  assert.equal((html.match(/<tr/g) || []).length, D.TABLE_TEETH.length + 1);
  const r = spawnSync(process.execPath, [path.join(__dirname, 'static.cjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
