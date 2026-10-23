/* Independent checks for Demo 1c's supervised neural approximation.
   Run: node src/neural.test.js */
'use strict';
const OG = require('./engine.js');
const NET = require('./net.js');
let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
  if (!ok) failed++;
}

const teacherA = NET.makeTeacher('neural-test', 20000);
const teacherB = NET.makeTeacher('neural-test', 20000);
check('seeded teacher preparation is deterministic', teacherA.V.every((v, i) => v === teacherB.V[i]));
const teacherSession = NET.startTeacher('neural-test', 20000);
while (!teacherSession.complete) NET.trainTeacherBatch(teacherSession, 500);
const teacherBatched = NET.freezeTeacher(teacherSession);
check('visible batched preparation matches one-shot preparation',
  teacherA.V.every((v, i) => v === teacherBatched.V[i]) && teacherA.N.every((v, i) => v === teacherBatched.N[i]));
const demoTeacher = NET.makeTeacher('demo', 20000);
check('frozen examples remain current table estimates, including unvisited zeroes',
  demoTeacher.N[18802] === 0 && demoTeacher.V[18802] === 0, 'code 18802');

const modelA = NET.newSupervised(teacherA, 'neural-test');
const data = modelA.data;
check('dataset has one row per reachable afterstate', new Set(data.examples.map(x => x.code)).size === data.examples.length,
  data.examples.length + ' positions');
const groups = new Map();
for (const ex of data.examples) {
  const prior = groups.get(ex.group);
  groups.set(ex.group, ex.held);
  if (prior !== undefined && prior !== ex.held) failed++;
}
check('symmetry groups do not cross the train/held-out split', groups.size === data.groups, groups.size + ' groups');

const modelB = NET.newSupervised(teacherB, 'neural-test');
for (let i = 0; i < 60; i++) { NET.trainBatch(modelA, 256); NET.trainBatch(modelB, 256); }
const ma = NET.metrics(modelA), mb = NET.metrics(modelB);
check('seeded weight updates reproduce', ma.trainMse === mb.trainMse && ma.heldMse === mb.heldMse,
  'train ' + ma.trainMse.toFixed(4) + ', held ' + ma.heldMse.toFixed(4));
const grad = NET.finiteDifferenceCheck(modelA);
check('analytic gradient agrees with an independent finite difference', !grad.skipped && grad.error < 1e-3,
  grad.skipped ? 'activation kink' : grad.error.toExponential(2));

const before = NET.policyMoves(modelA, 0).join(',');
teacherA.V.fill(NaN);                         // a policy must not read its former teacher
const after = NET.policyMoves(modelA, 0).join(',');
check('play policy does not consult the frozen teacher', before === after, before);
const fixedA = NET.scoreVs(modelA, OG.randomMove, 100, OG.makeRng('neural-fixed-evaluation:neural-test'));
const fixedB = NET.scoreVs(modelA, OG.randomMove, 100, OG.makeRng('neural-fixed-evaluation:neural-test'));
check('fixed independent evaluation stream replays exactly',
  fixedA.wins === fixedB.wins && fixedA.draws === fixedB.draws && fixedA.losses === fixedB.losses,
  fixedA.wins + '-' + fixedA.draws + '-' + fixedA.losses);

for (const seed of ['a', 'b', 'c']) {
  const t = NET.makeTeacher(seed, 20000), m = NET.newSupervised(t, seed);
  for (let i = 0; i < 40; i++) NET.trainBatch(m, 256);
  const r = NET.scoreVs(m, OG.randomMove, 100, OG.makeRng('play:' + seed));
  console.log('MEASURE ' + seed + ': train MSE ' + NET.metrics(m).trainMse.toFixed(3) +
    ', held MSE ' + NET.metrics(m).heldMse.toFixed(3) + ', vs random ' + r.wins + '-' + r.draws + '-' + r.losses);
}
if (failed) process.exitCode = 1;
