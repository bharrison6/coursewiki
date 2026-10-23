/* Slow pin for Act 2's shipped numbers.
 *
 * selftest.test.js runs 150-step smokes so it stays fast. That leaves the four
 * numbers a presenter actually reads aloud - Model D 54%, Model S 96%, the
 * verified-voting curve, and the STaR rounds - asserted nowhere. This file runs
 * the real arc, exactly as worker.js does, and fails if any of them move.
 *
 *   node src/arc.test.js        (~4-6 minutes)
 *
 * If it fails after a deliberate change, update BOTH this file and the numbers
 * quoted in README.md and src/demo-guide.html (which is now the only copy of the
 * presenter notes - build.js injects it into the app).
 */
'use strict';
const GB = require('./engine.js');
const ARITH = require('./arith.js');

let failed = 0;
function eq(label, got, want) {
  const ok = got === want;
  if (!ok) failed++;
  console.log((ok ? '  ok  ' : '  FAIL') + '  ' + label + ': ' + got + (ok ? '' : ' (expected ' + want + ')'));
}

function train(kind) {
  const cfg = kind === 'direct' ? ARITH.CFG_DIRECT : ARITH.CFG_SCRATCH;
  const total = kind === 'direct' ? ARITH.STEPS_DIRECT : ARITH.STEPS_SCRATCH;
  const m = GB.createModel(cfg);
  const adam = GB.createAdam(m, 0.006);
  const rng = GB.makeRng(ARITH.SEED_DATA);
  for (let i = 0; i < total; i++) ARITH.trainStep(GB, m, adam, kind, rng, ARITH.lrAt(i, total));
  return Math.round(ARITH.evalAcc(GB, m, kind, 100, 777, 14).acc * 100);
}

console.log('Act 2 arc - the numbers the guide tells presenters to rehearse');
eq('Model D (direct) exam', train('direct'), 54);
eq('Model S (scratchpad) exam', train('scratch'), 96);

const mid = GB.createModel(ARITH.CFG_MID);
const adamM = GB.createAdam(mid, 0.006);
const rngM = GB.makeRng(ARITH.SEED_MID);
for (let i = 0; i < ARITH.STEPS_MID; i++) {
  ARITH.trainStep(GB, mid, adamM, 'scratch', rngM, ARITH.lrAt(i, ARITH.STEPS_MID));
}
eq('mid model alone', Math.round(ARITH.evalAcc(GB, mid, 'scratch', 100, 888).acc * 100), 49);

console.log('2.3 verified voting - accuracy bought with attempts, not training');
const want23 = { 1: 60, 2: 62, 4: 68, 8: 78 };
for (const N of [1, 2, 4, 8]) {
  const rng = GB.makeRng(500), srng = GB.makeRng(1499);
  let ok = 0;
  for (let i = 0; i < 50; i++) {
    const p = ARITH.makeProblem(rng);
    if (ARITH.solveVerified(GB, mid, p, N, 0.8, srng).answer === p.sum) ok++;
  }
  eq('N=' + N, Math.round(ok / 50 * 100), want23[N]);
}

console.log('2.4 STaR rounds - it trains on its own certified work');
const wantAcc = [77, 83, 84, 85];
const wantKept = [82, 93, 101, 98];
for (let round = 1; round <= 4; round++) {
  const res = ARITH.starRound(GB, mid, {
    nProblems: 120, K: 3, temp: 0.8, ftSteps: 60, lr: 0.0015, seed: 1000 + round * 17,
  });
  eq('round ' + round + ' kept of 120', res.kept, wantKept[round - 1]);
  eq('round ' + round + ' accuracy',
     Math.round(ARITH.evalAcc(GB, mid, 'scratch', 100, 888).acc * 100), wantAcc[round - 1]);
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nall shipped Act 2 numbers reproduce');
process.exit(failed ? 1 : 0);
