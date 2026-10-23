/* =====================================================================
   Zero to Unbeatable — hyperparameter sweep

   Scores settings on the SHAPE OF THE ARC, not on final strength. A
   setting that reaches perfect play in one burst fails here: a student
   who never sees the clumsy middle never sees the lesson.

   Targets, with the default burst:
     * era 1 still loses to a naive player (takes a win, else random)
     * verified unbeatable never before burst 3
     * verified unbeatable by burst 5 on every seed

     node tools/tune.mjs           # characterise the shipped settings
     node tools/tune.mjs --sweep   # grid search around them
   ===================================================================== */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const OG = require('../src/engine.js');

const SEEDS = Array.from({ length: 12 }, (_, i) => 'tune-' + i);
const BURST = OG.HP.burst;
const MAX = 8;

/* casual human: takes a win, blocks a loss, else anywhere */
function blockerMove(code, rnd) {
  const mv = OG.TOMOVE[code], opp = mv === 1 ? 2 : 1, legal = OG.legalList(code);
  for (const m of legal) if (OG.WINNER[OG.child(code, m, mv)] === mv) return m;
  for (const m of legal) if (OG.WINNER[OG.child(code, m, opp)] === opp) return m;
  return legal[(rnd() * legal.length) | 0];
}

function arc(seed, collect) {
  const rnd = OG.makeRng(seed), a = OG.newAgent();
  const eras = [];
  let first = null;
  for (let b = 1; b <= MAX; b++) {
    OG.trainGames(a, BURST, rnd);
    const safe = OG.verifyUnbeatable(a).safe;
    if (collect) {
      const er = OG.makeRng('ev' + seed + b);
      const cas = OG.scoreVs(a, blockerMove, 1000, er);
      const rd = OG.vsRandom(a, 1000, er);
      eras.push({
        era: b, games: a.games, seen: a.seen,
        eps: +OG.epsilonAt(a.games).toFixed(3),
        casualWins: cas.losses, casualDraws: cas.draws,
        randWins: rd.losses, winVsRandom: +(rd.winRate * 100).toFixed(0), safe
      });
    }
    if (safe) { first = b; break; }
  }
  return { first: first === null ? 99 : first, eras };
}

function score(label) {
  const rows = SEEDS.map(s => arc(s, false));
  const firsts = rows.map(r => r.first);
  const era1 = SEEDS.map(s => {
    const rnd = OG.makeRng(s), a = OG.newAgent();
    OG.trainGames(a, BURST, rnd);
    return OG.vsNaive(a, 600, OG.makeRng('n' + s)).losses;
  });
  const ok = firsts.every(f => f >= 3 && f <= 5) && era1.every(l => l > 0);
  console.log((ok ? 'OK   ' : '  -  ') + label.padEnd(56) +
    ' unbeatable@[' + Math.min(...firsts) + '..' + Math.max(...firsts) + ']' +
    ' mean ' + (firsts.reduce((a, b) => a + b) / firsts.length).toFixed(2) +
    ' · era1 naive wins ' + Math.min(...era1) + '-' + Math.max(...era1) + '/600');
  return ok;
}

if (process.argv.includes('--sweep')) {
  const base = { ...OG.HP };
  for (const alphaFloor of [0.5, 0.8, 1.0])
    for (const epsEnd of [0.15, 0.25, 0.4])
      for (const epsTau of [8000, 14000, 20000])
        for (const exploringStarts of [0.1, 0.2, 0.35])
          for (const mixSelfPlay of [0.4, 0.6]) {
            Object.assign(OG.HP, { alphaFloor, epsEnd, epsTau, exploringStarts, mixSelfPlay });
            score(`a=${alphaFloor} epsEnd=${epsEnd} tau=${epsTau} starts=${exploringStarts} self=${mixSelfPlay}`);
          }
  Object.assign(OG.HP, base);
} else {
  const t0 = Date.now();
  console.log('SHIPPED: ' + JSON.stringify({
    alphaFloor: OG.HP.alphaFloor, gamma: OG.HP.gamma, epsStart: OG.HP.epsStart,
    epsEnd: OG.HP.epsEnd, epsTau: OG.HP.epsTau, mixSelfPlay: OG.HP.mixSelfPlay,
    exploringStarts: OG.HP.exploringStarts, burst: OG.HP.burst
  }) + '\n');
  score('shipped settings');
  console.log('\nA typical run (seed "demo"), burst = ' + BURST.toLocaleString() + ':\n');
  console.log('era  games   seen   eps    wins-vs-random  casual player beats it  verified');
  for (const e of arc('demo', true).eras) {
    console.log(
      String(e.era).padStart(2) + '  ' +
      String(e.games).padStart(6) + '  ' +
      String(e.seen).padStart(5) + '  ' +
      e.eps.toFixed(2).padStart(5) + '  ' +
      (e.winVsRandom + '%').padStart(12) + '  ' +
      (e.casualWins + ' of 1000').padStart(22) + '  ' +
      (e.safe ? 'UNBEATABLE' : '-'));
  }
  console.log('\n' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
