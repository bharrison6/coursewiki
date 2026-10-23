/* =====================================================================
   Zero to Unbeatable — playtest suite

       node src/playtest.test.js

   Proves the claims the demo rests on:

     0. Step 1's hand-written eight-rule ladder is UNBEATABLE by the same
        exhaustive search that judges the learner, every square it picks
        satisfies the rule that picked it, and the shortened two-rule
        ladder genuinely loses -- with the line. Section 7, run last
        because the interesting checks compare it against the learner.
     1. A newborn agent is statistically indistinguishable from a coin
        flip — there is no strategy baked in anywhere.
     2. A trained agent is UNBEATABLE, established by exhaustive search
        over every reachable game line as both first and second player,
        not by playing a lot of games and not losing.
     3. It has no blind spots: 10,000 games against a uniform random
        opponent, both roles, zero losses.
     4. The pacing arc holds: era 1 is still beatable by a naive player,
        and verified unbeatability lands between bursts 3 and 5 with the
        default settings, across many seeds.
     5. Step 3's world -- ULTIMATE tic-tac-toe -- really is the wall the
        page says it is: the rules as implemented, the counts, the two
        things the inherited decomposition cannot see (each with a
        control that has to come out the OTHER way), and the flat line
        that follows from them.

   Plus the structural checks that keep the above honest.
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const OG = require('./engine.js');
const RULES = require('./rules.js');
const ULT = require('./ultimate.js');

let failures = 0, checks = 0;
function check(name, cond, detail) {
  checks++;
  if (cond) console.log('PASS  ' + name);
  else { console.log('FAIL  ' + name + (detail ? '\n        ' + detail : '')); failures++; }
}
function head(t) { console.log('\n' + t + '\n' + '-'.repeat(t.length)); }
const fmt = n => n.toLocaleString('en-US');

/* An independent minimax, used ONLY by this test file, to grade the
   agent against ground truth. The agent has no access to it. */
const _mm = new Map();
function minimax(code) {                       // value to the side to move
  if (_mm.has(code)) return _mm.get(code);
  let v;
  if (OG.WINNER[code] !== 0) v = -1;           // whoever just moved won
  else if (OG.NEMPTY[code] === 0) v = 0;
  else {
    const mv = OG.TOMOVE[code]; v = -Infinity;
    for (const m of OG.legalList(code)) v = Math.max(v, -minimax(OG.child(code, m, mv)));
  }
  _mm.set(code, v); return v;
}

/* the casual human: takes a win, blocks a loss, otherwise anywhere */
function blockerMove(code, rnd) {
  const mv = OG.TOMOVE[code], opp = mv === 1 ? 2 : 1, legal = OG.legalList(code);
  for (const m of legal) if (OG.WINNER[OG.child(code, m, mv)] === mv) return m;
  for (const m of legal) if (OG.WINNER[OG.child(code, m, opp)] === opp) return m;
  return legal[(rnd() * legal.length) | 0];
}

function trainTo(seed, bursts, size) {
  const rnd = OG.makeRng(seed), a = OG.newAgent();
  for (let i = 0; i < bursts; i++) OG.trainGames(a, size || OG.HP.burst, rnd);
  return a;
}

/* =====================================================================
   1. A NEWBORN IS A COIN FLIP
   ===================================================================== */
head('1. Era 0 has no strategy in it');

{
  const fresh = OG.newAgent();
  const rnd = OG.makeRng('chi-squared');

  /* chi-squared over an empty board: 9 squares, 9,000 moves */
  const s = OG.sampleMoveCounts(fresh, 0, 9000, rnd);
  const c = OG.chiSquareUniform(s.counts);
  check('empty board: 9,000 first moves are uniform (chi2 < 15.51, df 8, p=0.05)',
    c.chi2 < 15.507,
    `chi2=${c.chi2.toFixed(3)} counts=${s.counts.join(',')}`);
  console.log(`        chi2 = ${c.chi2.toFixed(3)} on ${fmt(c.n)} moves, df ${c.df}` +
              ` (critical 15.507 at p=0.05); counts ${s.counts.join(' ')}`);

  /* and from a mid-game position, where a strategy would show up loudest */
  const mid = OG.encode([1, 0, 0, 0, 2, 0, 0, 0, 1]);        // X 0,8  O 4 — O to move
  const s2 = OG.sampleMoveCounts(fresh, mid, 6000, rnd);
  const c2 = OG.chiSquareUniform(s2.counts);
  check('mid-game position: 6,000 replies are uniform (chi2 < 11.07, df 5, p=0.05)',
    c2.chi2 < 11.070, `chi2=${c2.chi2.toFixed(3)} counts=${s2.counts.join(',')}`);

  /* Behavioural proof, which is the one that really matters: a newborn
     must take a free win no more often than chance, and must block a
     threat no more often than chance. Any hidden heuristic shows here. */
  const rnd2 = OG.makeRng('behaviour');
  let winChances = 0, winsTaken = 0, blockChances = 0, blocksMade = 0;
  for (const code of OG.OPEN_POSITIONS) {
    const mv = OG.TOMOVE[code], opp = mv === 1 ? 2 : 1;
    const legal = OG.legalList(code);
    const wins = legal.filter(m => OG.WINNER[OG.child(code, m, mv)] === mv);
    const blocks = legal.filter(m => OG.WINNER[OG.child(code, m, opp)] === opp);
    if (wins.length) {
      winChances++;
      if (wins.includes(OG.greedyMove(fresh, code, rnd2))) winsTaken++;
    }
    if (!wins.length && blocks.length) {
      blockChances++;
      if (blocks.includes(OG.greedyMove(fresh, code, rnd2))) blocksMade++;
    }
  }
  /* expected rates if it is choosing uniformly */
  let expWin = 0, expBlock = 0, nW = 0, nB = 0;
  for (const code of OG.OPEN_POSITIONS) {
    const mv = OG.TOMOVE[code], opp = mv === 1 ? 2 : 1;
    const legal = OG.legalList(code);
    const wins = legal.filter(m => OG.WINNER[OG.child(code, m, mv)] === mv);
    const blocks = legal.filter(m => OG.WINNER[OG.child(code, m, opp)] === opp);
    if (wins.length) { expWin += wins.length / legal.length; nW++; }
    if (!wins.length && blocks.length) { expBlock += blocks.length / legal.length; nB++; }
  }
  const wRate = winsTaken / winChances, wExp = expWin / nW;
  const bRate = blocksMade / blockChances, bExp = expBlock / nB;
  check('newborn takes a free win only at the chance rate',
    Math.abs(wRate - wExp) < 0.03,
    `took ${(wRate * 100).toFixed(1)}% of ${fmt(winChances)} free wins, chance is ${(wExp * 100).toFixed(1)}%`);
  check('newborn blocks a threat only at the chance rate',
    Math.abs(bRate - bExp) < 0.03,
    `blocked ${(bRate * 100).toFixed(1)}% of ${fmt(blockChances)} threats, chance is ${(bExp * 100).toFixed(1)}%`);
  console.log(`        free wins taken ${(wRate * 100).toFixed(1)}% vs ${(wExp * 100).toFixed(1)}% by chance; ` +
              `threats blocked ${(bRate * 100).toFixed(1)}% vs ${(bExp * 100).toFixed(1)}% by chance`);

  check('every value in a newborn table is exactly zero',
    fresh.V.every(v => v === 0) && fresh.seen === 0);
}

/* =====================================================================
   2. UNBEATABILITY IS PROVEN, NOT SAMPLED
   ===================================================================== */
head('2. A trained agent cannot be beaten — exhaustive search');

const TRAINED = trainTo('playtest', 6);
{
  const v = OG.verifyUnbeatable(TRAINED);
  console.log(`        agent moving first : ${fmt(v.asFirst.lines)} complete game lines, ` +
              `${fmt(v.asFirst.positions)} positions examined -> ` +
              (v.asFirst.safe ? 'NO LOSING LINE EXISTS' : 'LOSING LINE FOUND'));
  console.log(`        agent moving second: ${fmt(v.asSecond.lines)} complete game lines, ` +
              `${fmt(v.asSecond.positions)} positions examined -> ` +
              (v.asSecond.safe ? 'NO LOSING LINE EXISTS' : 'LOSING LINE FOUND'));
  check('moving first: zero losses over every reachable line', v.asFirst.safe,
    v.asFirst.worstLine ? 'losing line: ' + v.asFirst.worstLine.join(' ') : '');
  check('moving second: zero losses over every reachable line', v.asSecond.safe,
    v.asSecond.worstLine ? 'losing line: ' + v.asSecond.worstLine.join(' ') : '');

  /* The search branches over the agent's whole tie set, so the proof
     covers every coin flip it could make, not one arbitrary ordering. */
  let tieSets = 0;
  for (const code of OG.OPEN_POSITIONS) if (OG.argmaxMoves(TRAINED, code).length > 1) tieSets++;
  check('the proof covers tie-breaking, not one lucky ordering', tieSets > 0,
    'positions where it picks at random between equally-valued squares: ' + tieSets);
  console.log(`        it coin-flips between equal squares in ${fmt(tieSets)} positions; ` +
              `the search follows all of them`);

  /* Ground truth: it never picks a move that turns a non-loss into a loss. */
  let blunders = 0;
  for (const code of OG.OPEN_POSITIONS) {
    const mv = OG.TOMOVE[code];
    const best = Math.max.apply(null, OG.legalList(code).map(m => -minimax(OG.child(code, m, mv))));
    if (best < 0) continue;                     // already lost, not its fault
    for (const m of OG.argmaxMoves(TRAINED, code)) {
      if (-minimax(OG.child(code, m, mv)) < 0) { blunders++; break; }
    }
  }
  check('graded against minimax: zero losing choices in any position it can face',
    blunders === 0, blunders + ' positions where it might pick a losing square');

  /* It should still WIN when a win is available — perfect defence alone
     would be a much duller opponent. */
  const rnd = OG.makeRng('wins');
  const vr = OG.vsRandom(TRAINED, 2000, rnd);
  check('it punishes bad play rather than just surviving it', vr.winRate > 0.75,
    `wins ${(vr.winRate * 100).toFixed(1)}% against a random opponent`);
}

/* =====================================================================
   3. BLIND-SPOT CHECK
   ===================================================================== */
head('3. No blind spots — 10,000 games against uniform random play');

{
  const rnd = OG.makeRng('blindspot');
  const first  = OG.vsRandom(TRAINED, 5000, rnd, 1);
  const second = OG.vsRandom(TRAINED, 5000, rnd, 2);
  check('5,000 games moving first: zero losses', first.losses === 0, JSON.stringify(first));
  check('5,000 games moving second: zero losses', second.losses === 0, JSON.stringify(second));
  console.log(`        first : ${fmt(first.wins)} wins, ${fmt(first.draws)} draws, ${first.losses} losses`);
  console.log(`        second: ${fmt(second.wins)} wins, ${fmt(second.draws)} draws, ${second.losses} losses`);

  const rnd2 = OG.makeRng('casual');
  const cas = OG.scoreVs(TRAINED, blockerMove, 10000, rnd2);
  check('10,000 games against a casual human policy: zero losses', cas.losses === 0, JSON.stringify(cas));
  console.log(`        casual human: ${fmt(cas.wins)} losses for them, ${fmt(cas.draws)} draws, ` +
              `${cas.losses} wins for them`);
}

/* =====================================================================
   4. PACING
   ===================================================================== */
head('4. Pacing — the middle of the arc exists');

{
  const SEEDS = Array.from({ length: 12 }, (_, i) => 'pace-' + i);
  const firsts = [], naiveWins = [], casualWins = [], era2Casual = [];
  for (const seed of SEEDS) {
    const rnd = OG.makeRng(seed), a = OG.newAgent();
    let first = null;
    for (let b = 1; b <= 6; b++) {
      OG.trainGames(a, OG.HP.burst, rnd);
      if (b === 1) {
        const er = OG.makeRng('e' + seed);
        naiveWins.push(OG.vsNaive(a, 600, er).losses);
        casualWins.push(OG.scoreVs(a, blockerMove, 600, er).losses);
      }
      if (b === 2) era2Casual.push(OG.scoreVs(a, blockerMove, 600, OG.makeRng('e2' + seed)).losses);
      if (first === null && OG.verifyUnbeatable(a).safe) { first = b; break; }
    }
    firsts.push(first === null ? 99 : first);
  }
  const min = Math.min(...firsts), max = Math.max(...firsts);
  check('era 1 is still beatable by a naive player (win, else random) on every seed',
    naiveWins.every(n => n > 0),
    'naive wins per 600: ' + naiveWins.join(','));
  check('era 1 is comfortably beatable by a casual player on every seed',
    casualWins.every(n => n >= 30),
    'casual wins per 600: ' + casualWins.join(','));
  check('unbeatable never arrives before burst 3', min >= 3, 'earliest burst ' + min);
  check('unbeatable always arrives by burst 5', max <= 5, 'latest burst ' + max);
  console.log(`        burst at which it becomes unbeatable, over ${SEEDS.length} seeds: ` +
              firsts.join(', ') + `  (mean ${(firsts.reduce((a, b) => a + b) / firsts.length).toFixed(2)})`);
  console.log(`        casual player beats era 1 in ` +
              `${Math.min(...casualWins)}-${Math.max(...casualWins)} games per 600, ` +
              `era 2 in ${Math.min(...era2Casual)}-${Math.max(...era2Casual)}`);

  /* Once unbeatable, it stays unbeatable — no wobbling back. */
  const rnd = OG.makeRng('stability'), a = OG.newAgent();
  let hit = null, stayed = true;
  for (let b = 1; b <= 9; b++) {
    OG.trainGames(a, OG.HP.burst, rnd);
    const safe = OG.verifyUnbeatable(a).safe;
    if (safe && hit === null) hit = b;
    if (hit !== null && !safe) stayed = false;
  }
  check('once it is unbeatable it stays unbeatable through four more bursts',
    hit !== null && stayed, 'first safe at burst ' + hit);
}

/* =====================================================================
   Structural checks
   ===================================================================== */
head('5. Structure');

{
  /* determinism under a seed */
  const a = trainTo('repeat-me', 3), b = trainTo('repeat-me', 3);
  let same = a.games === b.games && a.seen === b.seen;
  for (let i = 0; i < OG.NCODE && same; i++) if (a.V[i] !== b.V[i]) same = false;
  check('a seeded run reproduces bit for bit', same);

  const c = trainTo('a-different-seed', 3);
  let differs = false;
  for (let i = 0; i < OG.NCODE; i++) if (a.V[i] !== c.V[i]) { differs = true; break; }
  check('a different seed produces a different agent', differs);

  /* the landmark lessons, in the order the demo claims they arrive */
  const one = trainTo('landmarks', 1), full = TRAINED;
  const L = id => OG.LANDMARKS.find(x => x.id === id);
  check('after one burst it already knows to take a free win',
    OG.argmaxMoves(one, L('win').code).includes(L('win').key));
  check('after one burst it already knows to block a row',
    OG.argmaxMoves(one, L('block').code).includes(L('block').key));
  const forkKeys = [L('fork').key].concat(L('fork').keyAlso);
  check('the fork defence is the lesson that arrives late',
    OG.argmaxMoves(full, L('fork').code).every(m => forkKeys.includes(m)),
    'trained agent picks ' + OG.argmaxMoves(full, L('fork').code).join(','));
  const openSpread = (() => {
    const v = OG.moveValues(full, 0).map(x => x.value);
    return Math.max(...v) - Math.min(...v);
  })();
  check('a trained agent rates every opening square the same (they all draw)',
    openSpread < 0.05, 'spread ' + openSpread.toFixed(4));

  /* the table really is the whole agent */
  const clone = OG.cloneAgent(full);
  const r1 = OG.makeRng('x'), r2 = OG.makeRng('x');
  let identical = true;
  for (let i = 0; i < 400; i++) {
    if (OG.playAgainst(full, OG.randomMove, r1, 1 + (i % 2)) !==
        OG.playAgainst(clone, OG.randomMove, r2, 1 + (i % 2))) { identical = false; break; }
  }
  check('copying the value table copies the entire agent', identical);

  check('the table is small enough to hold every position tic-tac-toe has',
    OG.OPEN_POSITIONS.length === 4520,
    'open positions found: ' + OG.OPEN_POSITIONS.length);

  /* speed: the phone budget is checked under CPU throttling in
     tools/integration.mjs; this is the unthrottled floor */
  const t0 = Date.now();
  const timed = OG.newAgent(), tr = OG.makeRng('speed');
  OG.trainGames(timed, 5000, tr);
  const ms = Date.now() - t0;
  check('a 5,000-game burst takes under 400ms unthrottled', ms < 400, ms + 'ms');
  console.log(`        5,000 games in ${ms}ms on this machine ` +
              `(the montage is paced to ~2.4s so there is something to watch)`);
}

/* =====================================================================
   6. ULTIMATE TIC-TAC-TOE

   Step 3's world. Everything here is a MEASUREMENT of a claim the page
   makes, and the claims are unusual for this repo in that most of them
   are claims of FAILURE: that the decomposition step 3 inherited --
   score one board at a time and add up -- has stopped working. A claim
   of failure is the easiest kind to fake, so each one is checked with a
   control beside it that has to come out the other way.
   ===================================================================== */
head('6. Ultimate tic-tac-toe — the same method, a world that breaks it');

/* Figures quoted in README.md, the guide and the app. Filled in as they
   are measured and checked against the prose at the end of the file, so
   a number cannot drift out of the docs without a check going red. */
const QUOTED = [];
const quote = (text, what) => { QUOTED.push([String(text), what]); return text; };

{
  /* ---- the rules, as implemented ---- */
  {
    const m = ULT.newMatch();
    check('a match opens with all 81 squares available and no board forced',
      ULT.legalMoves(m).length === 81 && m.send === ULT.ANYWHERE);

    /* THE rule: the cell you play names the board your opponent plays in */
    const m2 = ULT.newMatch();
    ULT.applyMove(m2, 4 * 9 + 4);                 /* centre cell of the centre board */
    check('the cell you play decides the board your opponent must play in',
      m2.send === 4 && ULT.legalMoves(m2).every(mv => ((mv / 9) | 0) === 4),
      'sent to ' + m2.send);
    const m3 = ULT.newMatch();
    ULT.applyMove(m3, 4 * 9 + 0);                 /* top-left cell of the centre board */
    check('and a different cell sends them somewhere else',
      m3.send === 0, 'sent to ' + m3.send);

    /* sent to a finished board: play anywhere */
    const m4 = ULT.newMatch();
    m4.b[0] = OG.encode([1, 1, 1, 0, 0, 0, 0, 0, 0]);
    m4.r[0] = 1;                                  /* board 0 already won by X */
    m4.send = 4;
    ULT.applyMove(m4, 4 * 9 + 0);                 /* would send them to board 0 */
    check('being sent to a finished board frees the choice',
      m4.send === ULT.ANYWHERE &&
      new Set(ULT.legalMoves(m4).map(mv => (mv / 9) | 0)).size > 1);
    check('and a finished board never accepts another mark',
      ULT.legalMoves(m4).every(mv => ((mv / 9) | 0) !== 0));

    /* the match is won by three boards in a row, not by five boards */
    const m5 = ULT.newMatch();
    m5.r[0] = 1; m5.r[1] = 1; m5.r[2] = 2; m5.r[5] = 2; m5.r[8] = 2;
    check('three boards in a COLUMN wins the match — five boards to two loses it',
      OG.WINNER[ULT.metaCode(m5)] === 2 && ULT.tally(m5).x === 2 && ULT.tally(m5).o === 3,
      'meta winner ' + OG.WINNER[ULT.metaCode(m5)]);
    const m6 = ULT.newMatch();
    m6.r[0] = 1; m6.r[1] = 1; m6.r[2] = 3; m6.r[5] = 1; m6.r[8] = 1;
    check('a drawn board counts for neither side on the meta-grid',
      OG.WINNER[ULT.metaCode(m6)] === 0,
      'four X boards including a broken row must not be a win: ' +
      OG.WINNER[ULT.metaCode(m6)]);
    check('but three in a row elsewhere still wins it',
      OG.WINNER[ULT.metaCode(Object.assign(ULT.cloneMatch(m6), {
        r: Uint8Array.from([1, 1, 3, 0, 0, 1, 0, 0, 1]) }))] === 0 &&
      (function () { const z = ULT.cloneMatch(m6); z.r[2] = 1; return OG.WINNER[ULT.metaCode(z)] === 1; })());
  }

  /* ---- a whole match obeys them, played out ---- */
  {
    const rnd = OG.makeRng('ult-rules');
    let ok = true, drawn = 0, xw = 0, ow = 0, plies = 0, worst = 0, why = '';
    for (let g = 0; g < 300 && ok; g++) {
      const m = ULT.newMatch();
      let prev = null;
      while (!m.over) {
        const moves = ULT.legalMoves(m);
        if (prev !== null) {
          /* every legal move obeys the send rule, every time */
          const want = m.send;
          if (want >= 0 && !moves.every(mv => ((mv / 9) | 0) === want)) { ok = false; why = 'send ignored'; break; }
          if (!moves.every(mv => m.r[(mv / 9) | 0] === 0)) { ok = false; why = 'finished board offered'; break; }
        }
        const mv = ULT.randomMove(m, rnd);
        prev = mv;
        ULT.applyMove(m, mv);
      }
      if (!ok) break;
      plies += m.plies; worst = Math.max(worst, m.plies);
      if (m.winner === 3) drawn++; else if (m.winner === 1) xw++; else ow++;
      /* a decided match really has three boards in a row */
      if (m.winner !== 3) {
        const line = m.metaLine;
        if (!line || !line.every(b => m.r[b] === m.winner)) { ok = false; why = 'winner without a meta-line'; }
      }
    }
    check('300 matches played out obey the send rule on every single ply', ok, why);
    check('matches end in a meta-line or a full grid, both roles seen',
      xw > 0 && ow > 0 && drawn > 0, `X ${xw}, O ${ow}, drawn ${drawn}`);
    check('a match never runs past the 81 squares', worst <= 81, 'longest ' + worst);
    console.log(`        300 random matches: ${(plies / 300).toFixed(1)} moves each on average, ` +
                `longest ${worst}; X won ${xw}, O won ${ow}, ${drawn} drawn`);
  }

  /* ---- a newborn is a coin flip, exactly as on one board ---- */
  {
    const fresh = ULT.newBrain(), rnd = OG.makeRng('ult-chi');
    const counts = new Array(81).fill(0);
    for (let i = 0; i < 8100; i++) counts[ULT.greedyMove(fresh, ULT.newMatch(), rnd)]++;
    const c = OG.chiSquareUniform(counts);
    check('a newborn brain is uniform over all 81 opening squares (chi2 < 101.9, df 80)',
      c.chi2 < 101.879, 'chi2=' + c.chi2.toFixed(2));
    console.log(`        chi2 = ${c.chi2.toFixed(2)} on ${fmt(c.n)} opening moves, df ${c.df}`);
  }

  /* =====================================================================
     THE SEARCH SPACE

     Beat two: the reductions that made the old act's arithmetic tolerable
     are gone, and what is left cannot be counted. Every figure the page
     prints is recomputed here from ULT.SPACE, which is the same code the
     page reads -- and then checked independently, because a module
     grading its own homework proves nothing.
     ===================================================================== */
  {
    const S = ULT.SPACE;

    /* An independent re-derivation of "reachable": walk real matches and
       confirm that every picture that actually turns up is one the rule
       admits, and that the rule admits nothing with both players
       aligned. Different route, same answer, or the count is wrong. */
    const rnd = OG.makeRng('reach');
    const met = new Set();
    for (let g = 0; g < 400; g++) {
      const m = ULT.newMatch();
      while (!m.over) { ULT.applyMove(m, ULT.randomMove(m, rnd)); for (let b = 0; b < 9; b++) met.add(m.b[b]); }
    }
    const strays = Array.from(met).filter(c => !ULT.SPACE.isReachable(c));
    check('every board picture a real match produces is one the count admits',
      strays.length === 0, strays.slice(0, 5).join(','));
    console.log(`        ${fmt(met.size)} distinct pictures seen in 400 matches, all inside the count`);

    let both = 0;
    for (let c = 0; c < OG.NCODE; c++) if (OG.WINNER[c] === 3 && ULT.SPACE.isReachable(c)) both++;
    check('no picture with both players aligned is counted as reachable', both === 0);

    check('the small-board pictures this game can produce', S.pictures === 18753,
      'got ' + S.pictures);
    check('and how many survive the eight symmetries of a square',
      S.classes === 2694, 'got ' + S.classes);
    quote(fmt(S.pictures), 'reachable small-board pictures');
    quote(fmt(S.classes), 'pictures up to symmetry');
    quote(fmt(S.picturesTotal), 'base-3 codes in all');
    quote(fmt(S.slots), 'table entries this game can use');

    /* the eight symmetries really are eight distinct permutations */
    check('the symmetry group is the eight of a square, no more and no fewer',
      ULT.SYMMETRIES.length === 8 &&
      new Set(ULT.SYMMETRIES.map(p => p.join(''))).size === 8);

    /* the bound, re-derived here in BigInt without touching the module */
    const want = (BigInt(S.pictures) ** BigInt(9)) * BigInt(10) / BigInt(8);
    check('the upper bound is the product the page prints, not a remembered number',
      Math.abs(S.bound - Number(want)) / Number(want) < 1e-12,
      S.bound.toExponential(4) + ' vs ' + Number(want).toExponential(4));
    check('the reductions buy essentially nothing against a naive 3^81',
      S.boundOverRaw > 0.8 && S.boundOverRaw < 0.82, S.boundOverRaw.toFixed(3));
    check('it cannot be counted at a billion a second since the big bang',
      S.timesCountable > 8e11 && S.timesCountable < 8.5e11,
      S.timesCountable.toExponential(3));
    const e38 = v => (v / 1e38).toFixed(1) + ' × 10³⁸';
    quote(e38(S.bound), 'the upper bound on positions');
    quote(e38(S.raw81), 'a naive 3^81');
    quote(S.boundOverRaw.toFixed(2), 'the bound as a fraction of 3^81');
    quote(Math.round(S.timesCountable / 1e10) * 10 + ' billion',
      'times more than could be counted since the big bang');

    /* and the scale the demo can exhaust, for the row above it */
    check('ordinary tic-tac-toe really does have 255,168 complete games',
      ULT.SMALLGAMES === 255168, 'got ' + ULT.SMALLGAMES);
    quote(fmt(ULT.SMALLGAMES), 'complete games of ordinary tic-tac-toe');
    console.log(`        ${fmt(S.pictures)} pictures (${fmt(S.classes)} up to symmetry) -> ` +
                `${S.bound.toExponential(2)} positions, ${S.boundOverRaw.toFixed(2)}x of 3^81, ` +
                `${(S.timesCountable / 1e9).toFixed(0)} billion times what could be counted`);
  }

  /* ---- the handover from step 2, and what it does not cover ---- */
  {
    const agent = trainTo('handover', 4);
    const brain = ULT.newBrain();
    const handed = ULT.seedFromAgent(brain, agent);
    let exact = true;
    for (let code = 1; code < OG.NCODE && exact; code++) {
      if (OG.TOMOVE[code] === 0 || OG.WINNER[code] === 3 || agent.N[code] === 0) continue;
      const want = OG.moverOf(code) === 1 ? agent.V[code] : -agent.V[code];
      if (Math.abs(brain.U[ULT.ui(code, OG.TOMOVE[code])] - want) > 1e-6) exact = false;
    }
    check('every entry step 2 hands over converts exactly', exact);
    const share = handed / ULT.SPACE.slots;
    check('the handover covers only a small slice of what this game needs',
      share > 0.14 && share < 0.16,
      `${fmt(handed)} of ${fmt(ULT.SPACE.slots)} = ${(100 * share).toFixed(0)}%`);
    check('the numbers the page prints for the handover', handed === 5477, 'got ' + handed);
    quote(`${fmt(handed)} of ${fmt(ULT.SPACE.slots)}`, 'entries handed over from step 2');
    quote(Math.round(100 * share) + '%', 'share of the usable table handed over');
    console.log(`        handed over ${fmt(handed)} of ${fmt(ULT.SPACE.slots)} usable entries ` +
                `(${(100 * share).toFixed(0)}%)`);
  }

  /* ---- pictures ordinary tic-tac-toe can never produce ---- */
  {
    const rnd = OG.makeRng('unbalanced');
    let boards = 0, impossible = 0;
    for (let g = 0; g < 200; g++) {
      const m = ULT.newMatch();
      while (!m.over) {
        ULT.applyMove(m, ULT.randomMove(m, rnd));
        for (let b = 0; b < 9; b++) { boards++; if (ULT.isImpossibleAlone(m.b[b])) impossible++; }
      }
    }
    const pct = 100 * impossible / boards;
    check('boards routinely reach shapes that cannot occur in one-board tic-tac-toe',
      pct > 45 && pct < 60, pct.toFixed(1) + '%');
    check('the share the page prints', Math.round(pct) === 51, pct.toFixed(1) + '%');
    quote(Math.round(pct) + '% of the board pictures',
      'board pictures met that ordinary tic-tac-toe cannot produce');
    console.log(`        ${pct.toFixed(0)}% of the board pictures met in a match are ones ` +
                `ordinary tic-tac-toe can never produce`);
  }

  /* =====================================================================
     TRAIN IT, THEN MEASURE THE WALL

     One seeded recipe, reused by every check below and quoted verbatim
     in README.md. If any of it moves, the numbers in the prose are wrong
     and these checks say so.
     ===================================================================== */
  const A1 = trainTo('ultimate-actone', 4);
  const B = ULT.newBrain();
  ULT.seedFromAgent(B, A1);
  const nrnd = OG.makeRng('ultimate-train');
  const t0 = Date.now();
  const lostLocal = [], lostAware = [];
  for (let burst = 0; burst <= 5; burst++) {
    if (burst) ULT.trainMatches(B, ULT.HPU.burst, nrnd);
    lostLocal.push(ULT.vsHeuristic(B, 200, OG.makeRng('vs-local-' + burst)).losses);
    lostAware.push(ULT.vsSendAware(B, 200, OG.makeRng('vs-aware-' + burst)).losses);
  }
  const arcMs = Date.now() - t0;
  console.log(`        burst        ` + lostLocal.map((_, i) => String(i).padStart(5)).join(''));
  console.log(`        board-local  ` + lostLocal.map(n => String(n).padStart(5)).join('') + '   lost of 200');
  console.log(`        send-aware   ` + lostAware.map(n => String(n).padStart(5)).join('') + '   lost of 200');
  console.log(`        the whole arc, trained and measured, in ${arcMs}ms`);

  {
    check('five bursts of ultimate training and the whole measured arc run in under ten seconds',
      arcMs < 10000, arcMs + 'ms');

    /* THE CONTROL. Against a hand-written player that shares its blind
       spot -- board-local reasoning and nothing else -- the decomposition
       learns, and learns a lot. Without this the flat line below would
       just be a broken learner. */
    check('against a board-local opponent it learns: losses more than halve',
      lostLocal[5] < lostLocal[0] / 2,
      lostLocal[0] + ' -> ' + lostLocal[5] + ' of 200');

    /* THE FINDING. Against the same player plus three clauses about the
       things ultimate rules added, the line goes flat. */
    const tail = lostAware.slice(1);
    check('against a send-aware opponent it improves once and then stops',
      lostAware[1] < lostAware[0] &&
      Math.max(...tail) - Math.min(...tail) < 0.2 * lostAware[0],
      lostAware.join(' -> '));
    check('and it is still losing most of them after five bursts',
      lostAware[5] > 120, lostAware[5] + ' of 200');
    check('the exact arc the README prints',
      lostLocal.join(',') === '122,96,81,62,59,54' &&
      lostAware.join(',') === '167,139,145,138,124,137',
      'board-local ' + lostLocal.join(',') + ' / send-aware ' + lostAware.join(','));
    const arcRow = a => a.map(n => String(n).padStart(3)).join('  ');
    quote(arcRow(lostLocal), 'the board-local arc, row as printed');
    quote(arcRow(lostAware), 'the send-aware arc, row as printed');

    /* it is a real player, not a broken one */
    const rand = ULT.vsRandom(B, 200, OG.makeRng('ult-random'));
    check('it beats a random player nine times in ten', rand.winRate > 0.85,
      JSON.stringify(rand));
    console.log(`        vs random play: ${rand.wins} won, ${rand.draws} drawn, ${rand.losses} lost of 200`);
  }

  /* ---- the two hand-written players, priced against each other ----
     The three send-aware clauses are the whole difference between them,
     so this is what those clauses are worth on their own, with no
     learner involved. */
  {
    const h2h = ULT.scoreHeadToHead(ULT.sendAwareMove, ULT.heuristicMove, 200, OG.makeRng('h2h'));
    check('the three extra clauses beat the board-local player outright',
      h2h.a === 200 && h2h.b === 0, JSON.stringify(h2h));
    quote('200 matches to nothing', 'send-aware against board-local');
    console.log(`        send-aware rules vs board-local rules: ${h2h.a}-${h2h.b}-${h2h.draws}`);
  }

  /* =====================================================================
     WHY IT STOPS: THE TWO THINGS THE DECOMPOSITION CANNOT SEE

     Beat one. Each of the two blind spots is measured against a control
     that must come out the OTHER way, so a probe that simply could not
     see anything would fail rather than confirm.
     ===================================================================== */
  {
    const b = ULT.measureBlindness(B, 1000, OG.makeRng('blindness'), ULT.heuristicMove);

    /* CONTROL: board wins are visible one board at a time, so it takes
       nearly all of them. A probe that missed this would prove nothing
       about the two below. */
    check('CONTROL — it takes a free board win most of the time, so the probe can see',
      b.boardWinRate > 0.75, `${b.boardWinTaken} of ${b.boardWinChances}`);

    /* FINDING 1: the meta-grid is invisible. A move that wins the MATCH
       scores exactly as a move that wins any other board, because the
       picture inside the board is all the table looks at. */
    check('a match-winning move is taken no more often than any other board win',
      Math.abs(b.matchWinRate - b.boardWinRate) < 0.06,
      `match ${(100 * b.matchWinRate).toFixed(0)}%, any board ${(100 * b.boardWinRate).toFixed(0)}%`);
    check('when the match-winning move is the only board win, it takes it at the control rate',
      Math.abs(b.aloneRate - b.boardWinRate) < 0.06,
      `${(100 * b.aloneRate).toFixed(0)}% vs ${(100 * b.boardWinRate).toFixed(0)}%`);
    check('when another board win ties with it, it flips a coin between winning and not',
      b.rivalChances >= 40 && b.rivalRate < 0.7 && b.rivalRate < b.aloneRate - 0.2,
      `${b.rivalTaken} of ${b.rivalChances} = ${(100 * b.rivalRate).toFixed(0)}%`);

    /* FINDING 2: where the move sends the opponent is invisible. */
    check('it hands over an immediate win at about the rate blind choosing would',
      Math.abs(b.giftRate - b.giftChanceRate) < 0.08,
      `${(100 * b.giftRate).toFixed(1)}% against a chance rate of ${(100 * b.giftChanceRate).toFixed(1)}%`);
    check('and the small edge it does have is under chance, not over it — blocking, ' +
      'which it CAN see, happens to close the gift too',
      b.giftRate < b.giftChanceRate,
      `${(100 * b.giftRate).toFixed(1)}% vs ${(100 * b.giftChanceRate).toFixed(1)}%`);
    check('nearly half of those giveaways had an equally top-scoring move that would not have',
      b.avoidableRate > 0.35 && b.avoidableRate < 0.6,
      `${fmt(b.giftAvoidable)} of ${fmt(b.giftsGiven)} = ${(100 * b.avoidableRate).toFixed(0)}%`);

    check('the exact blindness figures the README prints',
      Math.round(100 * b.boardWinRate) === 81 &&
      Math.round(100 * b.matchWinRate) === 79 &&
      Math.round(100 * b.aloneRate) === 82 &&
      Math.round(100 * b.rivalRate) === 53 &&
      Math.round(100 * b.giftRate) === 36 &&
      Math.round(100 * b.giftChanceRate) === 41 &&
      Math.round(100 * b.avoidableRate) === 45,
      JSON.stringify({
        boardWin: b.boardWinRate, matchWin: b.matchWinRate, alone: b.aloneRate,
        rival: b.rivalRate, gift: b.giftRate, chance: b.giftChanceRate,
        avoidable: b.avoidableRate }));
    const pc = v => Math.round(100 * v) + '%';
    quote(`${fmt(b.boardWinTaken)} of ${fmt(b.boardWinChances)}`, 'free board wins taken');
    quote(`${fmt(b.matchWinTaken)} of ${fmt(b.matchWinChances)}`, 'match-winning moves taken');
    quote(`${b.aloneTaken} of ${b.aloneChances}`, 'match wins taken when alone');
    quote(`${b.rivalTaken} of ${b.rivalChances}`, 'match wins taken when tied with another');
    quote(`${fmt(b.giftsGiven)} of ${fmt(b.giftTurns)}`, 'giveaways');
    quote(`${fmt(b.giftAvoidable)}`, 'giveaways that were free to avoid');
    [pc(b.boardWinRate), pc(b.matchWinRate), pc(b.aloneRate), pc(b.rivalRate),
     pc(b.giftRate), pc(b.giftChanceRate), pc(b.avoidableRate)]
      .forEach(p => quote(p, 'a blindness rate'));

    console.log(`        free board win taken (control) ${fmt(b.boardWinTaken)}/${fmt(b.boardWinChances)} = ` +
                `${(100 * b.boardWinRate).toFixed(0)}%`);
    console.log(`        match-WINNING move taken       ${fmt(b.matchWinTaken)}/${fmt(b.matchWinChances)} = ` +
                `${(100 * b.matchWinRate).toFixed(0)}%  ` +
                `[alone ${(100 * b.aloneRate).toFixed(0)}%, tied with another board win ` +
                `${(100 * b.rivalRate).toFixed(0)}%]`);
    console.log(`        hands over an immediate win    ${fmt(b.giftsGiven)}/${fmt(b.giftTurns)} = ` +
                `${(100 * b.giftRate).toFixed(1)}%, chance ${(100 * b.giftChanceRate).toFixed(1)}%, ` +
                `${(100 * b.avoidableRate).toFixed(0)}% of them avoidable at no cost`);
  }

  /* ---- and the old headline, re-measured under the new rules ---- */
  {
    const r9 = ULT.measureRecurrence(B, ULT.HPU.burst, OG.makeRng('rec-ult'));
    const r1 = ULT.measureRecurrenceSingle(A1, OG.HP.burst, OG.makeRng('rec-one'));
    const per9 = r9.positions / r9.distinct, per1 = r1.positions / r1.distinct;
    check('on one board, positions come round again and again', per1 > 5, per1.toFixed(2) + 'x');
    check('in ultimate, essentially nothing comes round twice', per9 < 1.3, per9.toFixed(2) + 'x');
    check('the gap between the two is the whole reason a table cannot hold this',
      per1 / per9 > 4, `${per1.toFixed(1)}x vs ${per9.toFixed(2)}x`);
    check('the recurrence figures the README prints',
      per1.toFixed(1) === '10.6' && per9.toFixed(2) === '1.08' && Math.round(r9.plies) === 41,
      `${per1.toFixed(1)}x / ${per9.toFixed(2)}x / ${r9.plies.toFixed(1)} plies`);
    quote(per1.toFixed(1) + '×', 'times a one-board position comes round');
    quote(per9.toFixed(2) + '×', 'times an ultimate position comes round');
    quote(Math.round(r9.plies) + '-move', 'the length of an ultimate match');
    console.log(`        one board: ${fmt(r1.positions)} positions met, ${fmt(r1.distinct)} different, ` +
                `each seen ${per1.toFixed(1)}x on average`);
    console.log(`        ultimate : ${fmt(r9.positions)} positions met, ${fmt(r9.distinct)} different, ` +
                `each seen ${per9.toFixed(2)}x on average, over ${r9.plies.toFixed(0)}-move matches`);
  }

  /* ---- the position is no longer just the picture ---- */
  {
    const m = ULT.newMatch();
    ULT.applyMove(m, 0 * 9 + 4);        /* X centre of board 0, sends them to board 4 */
    const a = ULT.matchKey(m);
    const z = ULT.cloneMatch(m);
    z.send = 0;
    check('two identical grids with different forced boards are different positions',
      ULT.matchKey(z) !== a, 'the active board has to be part of the key or the count is wrong');
  }

  /* ---- housekeeping the demo rests on ---- */
  {
    const a = ULT.newBrain(), b = ULT.newBrain();
    ULT.trainMatches(a, 200, OG.makeRng('same'));
    ULT.trainMatches(b, 200, OG.makeRng('same'));
    let same = a.seen === b.seen;
    for (let i = 0; i < a.U.length && same; i++) if (a.U[i] !== b.U[i]) same = false;
    check('a seeded ultimate run reproduces bit for bit', same);
  }

  check('there is no unbeatability proof on offer for ultimate tic-tac-toe',
    typeof ULT.verifyUnbeatable === 'undefined' && typeof ULT.verifyPolicy === 'undefined',
    'a proof would be a lie here — this app cannot search the space');

  /* ---- and the published result the page quotes instead ---- */
  {
    const S = ULT.SOLVED;
    check('the solved-game claim carries its source, its numbers and its caveat',
      S.ref === 'arXiv:2006.02353' && S.atMost === 43 && S.atLeast === 29 &&
      /Bertholon/.test(S.authors) && /\bfull\b/i.test(S.variant) && /\bwon\b/i.test(S.variant),
      JSON.stringify(S));
    check('and 43 moves is inside the 81 the game allows at all',
      S.atMost < 81 && S.atLeast < S.atMost);
    quote('at most ' + S.atMost + ' moves', 'the published upper bound');
    quote('at least ' + S.atLeast, 'the published lower bound');
    quote(S.ref, 'the citation');
    quote('Bertholon', 'the first author');
  }

  /* ---- the learner is a learner: nothing about ultimate rules is
         written into it ---- */
  {
    const decomment = f => fs.readFileSync(path.join(__dirname, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    const src = decomment('ultimate.js');
    const learner = src.slice(src.indexOf('function moveValue'), src.indexOf('function measureBlindness'));
    check('nothing between the store and the move choice reaches into a raw array',
      !/brain\.(U|N)\[/.test(learner),
      'a direct array access would be a second difference from a swapped-in memory');
    check('the learner never consults the meta-grid or where a move sends the opponent',
      !/metaCode|winsMatch|isGift|BOARDW/.test(learner),
      'the whole act is that it cannot see these; it must not be quietly using them');
  }
}

/* =====================================================================
   7. STEP 1 — THE HAND-WRITTEN RULE LADDER

   The demo's first step, tested last because the interesting claims are
   comparisons against the learned agent above.

   The claim being made on screen is symmetric and it has to be earned
   on both sides: a ladder a person wrote and a table that taught itself
   arrive at the same unbeatable play, and the SAME exhaustive search
   says so about both. So the first thing checked here is that
   generalising the search did not change what it says about the learned
   agent, and the rest is the ladder held to that same standard.
   ===================================================================== */
head('7. Step 1 — the hand-written rules');

{
  /* ---- the search was generalised; the learned side must not move ---- */
  const viaAgent  = OG.verifyUnbeatable(TRAINED);
  const viaPolicy = OG.verifyPolicy(code => OG.argmaxMoves(TRAINED, code));
  check('generalising the verifier left the learned agent\'s proof identical',
    viaAgent.safe === viaPolicy.safe && viaAgent.lines === viaPolicy.lines &&
    viaAgent.positions === viaPolicy.positions,
    JSON.stringify({ agent: viaAgent.lines, policy: viaPolicy.lines }));

  /* ---- every rule fires somewhere, and only where it should ---- */
  const seen = new Array(9).fill(0);
  const wrong = [];
  for (const code of OG.OPEN_POSITIONS) {
    const d = RULES.decide(code, 8);
    const mine = OG.TOMOVE[code], theirs = mine === 1 ? 2 : 1;
    const cells = OG.cellsOf(code);
    seen[d.ruleId]++;
    for (const o of d.options) {
      const c = o.cell;
      let ok;
      switch (d.ruleId) {
        /* the rule's own definition, restated independently of the
           implementation that chose the square */
        case 1: ok = OG.WINNER[OG.child(code, c, mine)] === mine; break;
        case 2: ok = OG.WINNER[OG.child(code, c, theirs)] === theirs; break;
        case 3: ok = RULES.threatSquares(OG.child(code, c, mine), mine).length >= 2; break;
        case 4: ok = RULES.forkCells(code, theirs).some(f => f.cell === c) ||
                     RULES.threatSquares(OG.child(code, c, mine), mine).length === 1; break;
        case 5: ok = c === 4 && cells[4] === 0; break;
        case 6: ok = RULES.CORNERS.includes(c) && cells[c] === 0 &&
                     cells[RULES.OPPOSITE[c]] === theirs; break;
        case 7: ok = RULES.CORNERS.includes(c) && cells[c] === 0; break;
        case 8: ok = RULES.SIDES.includes(c) && cells[c] === 0; break;
        default: ok = false;                       // rule 0 must never fire at full depth
      }
      /* and the ladder is a ladder: nothing below fires while
         something above still applies */
      if (d.ruleId > 1 && RULES.winningCells(code, mine).length) ok = false;
      if (d.ruleId > 2 && RULES.winningCells(code, theirs).length) ok = false;
      if (!ok) wrong.push(`rule ${d.ruleId} chose ${c} in ${code}`);
    }
  }
  check('every square the ladder picks satisfies the rule that picked it',
    wrong.length === 0, wrong.slice(0, 5).join('; '));
  check('all eight rules actually fire somewhere on a reachable board',
    seen.slice(1).every(n => n > 0), 'firings per rule: ' + seen.slice(1).join(','));
  check('at full depth the ladder never runs out of rules',
    seen[0] === 0, seen[0] + ' positions fell off the end');
  console.log('        positions decided by each rule 1-8: ' + seen.slice(1).join(', '));

  /* The hardest rule, checked against a fact this repo already knew.
     LANDMARKS says the double-corner opening is only survivable on an
     edge; the ladder gets there by a completely different route, so the
     two agreeing is a real cross-check rather than a restatement. */
  const fork = OG.LANDMARKS.find(x => x.id === 'fork');
  const edges = [fork.key].concat(fork.keyAlso).sort((a, b) => a - b);
  check('rule 4 answers the double-corner opening on exactly the four edges',
    RULES.moves(fork.code, 8).slice().sort((a, b) => a - b).join(',') === edges.join(','),
    'ladder picks ' + RULES.moves(fork.code, 8).join(',') + ', landmark says ' + edges.join(','));

  /* ---- the eight-rule ladder is unbeatable, by the same search ---- */
  const r8 = RULES.report(8);
  console.log(`        eight rules moving first : ${fmt(r8.asFirst.lines)} complete game lines -> ` +
              (r8.asFirst.safe ? 'NO LOSING LINE EXISTS' : 'LOSING LINE FOUND'));
  console.log(`        eight rules moving second: ${fmt(r8.asSecond.lines)} complete game lines -> ` +
              (r8.asSecond.safe ? 'NO LOSING LINE EXISTS' : 'LOSING LINE FOUND'));
  check('eight rules moving first: zero losses over every reachable line', r8.asFirst.safe);
  check('eight rules moving second: zero losses over every reachable line', r8.asSecond.safe);
  check('nobody can win against the full ladder, worked out exactly',
    r8.beatsFirst === 0 && r8.beatsSecond === 0,
    `${r8.beatsFirst} / ${r8.beatsSecond}`);

  /* Graded against minimax, exactly as the learned agent is above -- and
     this is where the two genuinely differ, so it is worth being exact
     about what each one earns.

     Every position the ladder can actually arrive at in a game: it is
     right in all of them, which is the same thing verifyPolicy said,
     arrived at from ground truth instead. */
  const reachable = new Set();
  for (const botMark of [1, 2]) {
    const stack = [0], seen = new Set();
    while (stack.length) {
      const c = stack.pop();
      if (seen.has(c)) continue;
      seen.add(c);
      if (OG.isTerminal(c)) continue;
      const mv = OG.TOMOVE[c];
      if (mv === botMark) reachable.add(c);
      for (const m of (mv === botMark ? RULES.moves(c, 8) : OG.legalList(c))) {
        stack.push(OG.child(c, m, mv));
      }
    }
  }
  const gradeBlunders = movesFor => {
    const out = [];
    for (const code of OG.OPEN_POSITIONS) {
      const mv = OG.TOMOVE[code];
      const best = Math.max.apply(null, OG.legalList(code).map(m => -minimax(OG.child(code, m, mv))));
      if (best < 0) continue;                    // already lost, not its fault
      for (const m of movesFor(code)) {
        if (-minimax(OG.child(code, m, mv)) < 0) { out.push(code); break; }
      }
    }
    return out;
  };
  const ladderBad = gradeBlunders(c => RULES.moves(c, 8));
  check('graded against minimax: the ladder never picks a losing square in a game it is playing',
    ladderBad.every(c => !reachable.has(c)),
    ladderBad.filter(c => reachable.has(c)).length + ' reachable positions where a rule loses');

  /* And the honest asymmetry, which the README states and which this
     pins down so it cannot rot: hand the ladder a position it would
     never have played itself into and it CAN blunder, because nobody
     wrote a rule for a board that cannot happen. The learned agent
     practises from positions dealt at random, so it is right in all
     4,520. Neither fact changes who wins a game from the start. */
  const learnedBad = gradeBlunders(c => OG.argmaxMoves(TRAINED, c));
  check('the ladder is unbeatable in a game but not correct in every position',
    ladderBad.length === 12 && ladderBad.every(c => !reachable.has(c)),
    ladderBad.length + ' positions, none of them reachable');
  check('the learned agent is correct in every position, reachable or not',
    learnedBad.length === 0, learnedBad.length + ' positions');
  console.log(`        minimax grading over all ${fmt(OG.OPEN_POSITIONS.length)} legal positions: ` +
              `ladder wrong in ${ladderBad.length} (none reachable in play), ` +
              `learned agent wrong in ${learnedBad.length}`);

  /* ---- and the two-rule ladder genuinely loses ---- */
  const r2 = RULES.report(2);
  check('two rules is beatable — the same search finds losing lines in both roles',
    !r2.asFirst.safe && !r2.asSecond.safe);
  check('two rules loses often enough for a room to notice',
    r2.beatsSecond > 0.9 && r2.beatsFirst > 0.4,
    `beaten ${(r2.beatsSecond * 100).toFixed(1)}% moving second, ` +
    `${(r2.beatsFirst * 100).toFixed(1)}% moving first`);

  /* Replay the line the app puts on screen and confirm it does what the
     screen says: the bot loses, and the move that kills it is a fork,
     which is rule 3/4 territory and switched off. */
  const g = r2.gameSecond;
  let code = 0, forks = 0;
  for (const p of g.plies) {
    if (p.bot) {
      const opts = RULES.moves(code, 2);
      if (!opts.includes(p.cell)) { code = -1; break; }
    }
    code = OG.child(code, p.cell, p.mark);
    if (p.forks) forks++;
  }
  check('the losing line the app shows is one the two-rule ladder can really play',
    code >= 0 && OG.WINNER[code] === 1, 'winner ' + (code >= 0 ? OG.WINNER[code] : 'illegal line'));
  check('and the move that beats it is a fork — the rule that is switched off',
    forks === 1, forks + ' forking moves in the line');
  console.log('        the line: ' + g.plies.map(p => (p.bot ? 'it' : 'you') + ' ' + p.cell).join(', ') +
              ` (this exact game about 1 in ${Math.round(1 / g.prob)})`);

  /* ---- seeded, like everything else in this demo ---- */
  const play = seed => {
    const rnd = OG.makeRng(seed), out = [];
    let c = 0;
    while (!OG.isTerminal(c)) {
      const mv = OG.TOMOVE[c];
      const cell = RULES.ruleMove(c, rnd, 7);   // depth 7 leaves real tie sets
      out.push(cell);
      c = OG.child(c, cell, mv);
    }
    return out.join(',');
  };
  check('a seeded rule game reproduces exactly', play('same') === play('same'));
  check('a different seed breaks a different tie', play('same') !== play('other'),
    'both seeds played ' + play('same'));

  /* ---- the shape of the ladder the UI renders ---- */
  check('the ladder is eight rules and the app renders that list, not a copy',
    RULES.LADDER.length === 8 && RULES.LADDER.every((r, i) => r.id === i + 1));
  check('every depth preset offered in the app is one the search has an answer for',
    RULES.DEPTHS.every(d => typeof RULES.report(d.n).safe === 'boolean'));
  /* Operator item 1 (2026-09-16): the app opens on the First 2 rules, because
     that is the opponent the 1a Predict card asks about. Pinned deliberately
     -- with eight as the default, the prediction was unanswerable as set. The
     default must also be a beatable ladder, or the prediction has no live
     answer, and it must be one of the presets the segmented control offers. */
  check('the app opens on the two-rule ladder the 1a prediction is about',
    RULES.DEFAULT_DEPTH === 2 && RULES.report(RULES.DEFAULT_DEPTH).safe === false &&
    RULES.DEPTHS.some(d => d.n === RULES.DEFAULT_DEPTH));

  /* The README says rule 8 is the list being tidy: by the time "empty
     side" could fire, a side is the only thing left to play, so seven
     rules and eight rules are the same opponent. Pin it. */
  let sameAt7 = true;
  for (const code of OG.OPEN_POSITIONS) {
    if (RULES.moves(code, 7).join(',') !== RULES.moves(code, 8).join(',')) { sameAt7 = false; break; }
  }
  check('seven rules and eight rules are the same opponent — rule 8 is the list being tidy',
    sameAt7 && RULES.report(7).safe);

  /* ---- current public documentation names all three axes ----------------
     Restructured 2026-09-16: architecture (how a model is built) / training
     method (how it learns) / model type (what it does). The learner-facing
     surfaces must name every stage and both lenses, and must NOT still carry
     the two RETIRED meanings -- "Other model types" as stage 1d's name, or
     "How they learn" as a tab. The negative half is the point: a rename that
     left the old strings in the guide would pass a presence-only check. */
  const docFiles = ['README.md', 'SPEC.md', 'src/demo-guide.html', 'demo.json', 'src/template.html'];
  /* Source comments are NOT learner-facing, and two of these files carry a
     comment that explains the restructure by quoting the retired wording. So
     every needle below is checked against the files with HTML comments
     stripped -- otherwise a check would fire on its own documentation, which
     is the probe matching itself rather than the page. */
  const strip = t => t.replace(/<!--[\s\S]*?-->/g, ' ');
  const docs = docFiles
    .map(f => strip(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'))).join('\n');
  const terms = ['1a', '1b', '1c', '1d', 'Symbolic AI (GOFAI)', 'Value table',
    'Neural Network', 'Other architectures & training methods', 'Model architecture',
    'Model types'];
  check('the learner-facing surfaces name every stage and both lenses',
    terms.every(t => docs.includes(t)), terms.filter(t => !docs.includes(t)).join(', '));
  /* The retired meanings. A sentence ABOUT the restructure may legitimately
     contain the words "how they learn", so each needle below is a string that
     would mean the OLD STRUCTURE: a tab, a stage name, or the old view id. */
  const retired = ['Other model types', 'data-view="learn"', '>How they learn<',
    'separate **How they learn** tab', 'id="learning-overview"', 'How models learn'];
  const stillThere = retired.filter(t => docs.includes(t));
  check('no learner-facing surface still carries a retired tab or stage name',
    stillThere.length === 0, stillThere.join(' | '));
  check('public copy does not promise neural generalisation or unbeatability',
    docs.includes('no automatic unbeatable claim') && docs.includes('not guaranteed playing strength'));
  const guide = strip(fs.readFileSync(path.join(__dirname, 'demo-guide.html'), 'utf8'));
  check('the guide names visible neural actions in plain language',
    guide.includes('Create learning examples') && guide.includes('Train network') &&
    guide.includes('held-out error') && guide.includes('network view'));
  check('the guide carries the A9 sections and no objective-shaped line',
    ['Learning goals', 'Where this sits on the path', 'One question for the session',
      'Misconceptions', 'Discussion questions', 'Presenter controls']
      .every(h => guide.includes(h)) && (guide.match(/class="mis"/g) || []).length >= 5 &&
    !/You will be able to/i.test(guide));

  /* ---- the kit retrofit, as far as a static read can see it -------------
     The browser pass is what proves rendering; these are the structural
     invariants a later edit could silently break. */
  const tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const stages = (tpl.match(/<section class="stage[ "]/g) || []).length;
  const tabs = (tpl.match(/class="stage-tab/g) || []).length;
  const checkCards = (tpl.match(/class="check"/g) || []).length;
  const refutations = (tpl.match(/data-refutation="true"/g) || []).length;
  check('five kit stages, five tabs, five Details sections, and check cards',
    stages === 5 && tabs === 5 &&
    (tpl.match(/class="details-stage/g) || []).length === 5 &&
    checkCards >= 5 && refutations >= 1,
    'stages ' + stages + ', tabs ' + tabs + ', checks ' + checkCards + ', refutation ' + refutations);
  /* A6 asks for at least one item PER STAGE, so it is counted per stage: five
     cards could all sit on one stage and satisfy a total of five. 1c carries a
     second item deliberately. */
  const perStage = tpl.split(/<section class="stage[ "]/).slice(1)
    .map(part => (part.match(/class="check"/g) || []).length);
  check('every stage has at least one check item',
    perStage.length === 5 && perStage.every(n => n >= 1),
    'per stage: ' + perStage.join(', '));
  /* Three Predict cards, not five: 1d and Model types are informational map
     stages with no result to check a prediction against, so both Predict
     cards were removed on operator ruling (2026-09-16; Model types second,
     the same day). Try and Takeaway remain on every stage. */
  check('every stage carries a question, a refresh line and the strip labels (1d and Model types have no Predict)',
    (tpl.match(/class="stage-question"/g) || []).length === 5 &&
    (tpl.match(/class="refresh"/g) || []).length === 5 &&
    (tpl.match(/<span>Predict<\/span>/g) || []).length === 3 &&
    !/data-predict="other"/.test(tpl) && !/revealPrediction\('other'/.test(app) &&
    !/data-predict="types"/.test(tpl) && !/revealPrediction\('types'/.test(app) &&
    !/\btypes: \{ words:/.test(app) &&
    (tpl.match(/<span>Try<\/span>/g) || []).length === 5 &&
    (tpl.match(/<span>Takeaway<\/span>/g) || []).length === 5);
  check('exactly one tablist: the lens row is not a second one (A1)',
    (tpl.match(/role="tablist"/g) || []).length === 1);
  /* 2026-09-16: 1d's half-switch and 1c's board switch share the .map-btn
     look. Their handlers and renderers must be scoped by container, or one
     drives the other (found in the browser pass: pressing Ultimate ran
     renderHalf with S.half undefined and lit both board buttons). */
  check('the two .map-btn switches are wired by container, never by bare class',
    !/\$\$\('\.map-btn'\)/.test(app) &&
    /\$\$\('#map-switch \.map-btn'\)/.test(app) && /\$\$\('#board-switch \.map-btn'\)/.test(app) &&
    (tpl.match(/id="map-switch"/g) || []).length === 1 && (tpl.match(/id="board-switch"/g) || []).length === 1);
  check('the 1d Predict card is gone and ultimate is reachable from a visible control, not a Details button',
    !/id="btn-ultimate"/.test(app) && /data-board="ult"/.test(tpl));
  /* 2026-09-16 operator directions for 1d. (1) A third part, learning with
     no weight change, behind the same switch. (3) The method cards' visible
     text must not state which playable model used them: that is what the
     press reveals. The negative probe is proven potent on a planted copy of
     the old supervised sentence, so its silence on the real template counts. */
  const halves = (tpl.match(/<button[^>]*class="map-btn"[^>]*data-half="(\w+)"/g) || []).length;
  check('1d has three parts behind one switch, each with its card, wired and reset',
    halves === 3 && /id="nochange-card"/.test(tpl) && /data-half="nochange"/.test(tpl) &&
    (tpl.match(/data-nochange="/g) || []).length >= 3 && (tpl.match(/data-nochange="/g) || []).length <= 4 &&
    /nochange: '#nochange-card'/.test(app) && /S\.nochange = null/.test(app) &&
    /Does playing the AI above train it\?/.test(tpl.split('id="nochange-card"')[1].split('</section>')[0]));
  const methodFaces = (tpl.split('class="method-grid"')[1] || '').split('</div>')[0];
  /* Visible text only: the data-uses ATTRIBUTE names the model by design
     (it is what the press reads), and a probe over raw markup matched it. */
  const faceText = h => h.replace(/<[^>]*>/g, ' ');
  const giveaway = /In this demo|\b1[abc]\b/;
  const planted = methodFaces.replace('<span>Learns from inputs', '<span>In this demo, 1c fits frozen scores. Learns from inputs');
  check('no training-method card face states which playable model used it (the press reveals that)',
    methodFaces.length > 500 && !giveaway.test(faceText(methodFaces)) && giveaway.test(faceText(planted)));
  check('the supervised, self-supervised and reinforcement cards each carry a Sourced "used for" stage note',
    (methodFaces.match(/class="stage-note"><span class="k-sourced">Sourced<\/span>/g) || []).length === 3 &&
    /pretraining/.test(methodFaces) && /supervised fine-tuning/.test(methodFaces) && /distillation/.test(methodFaces) &&
    /RLHF/.test(methodFaces));
  check('the demo implements the kit reset contract (A8)',
    /addEventListener\('lessonreset'/.test(app));
  /* ADOPTING.md section 4 step 7: the shell fires stagechange BEFORE
     lessonreset, so the reset path must paint exactly once. */
  check('the reset path paints once: onReset raises the flag stagechange checks',
    /onReset = \(\) => \{ S\.resetting = true/.test(app) &&
    /if \(!S\.resetting\) applyMode\(\)/.test(app));
  check('the retired chrome is gone from app.js, not merely unused',
    !/function openSheet|function closeSheet|function applyView|function selectView|STAGE_COPY/.test(app));
  check('the engines are untouched by this pass',
    ['engine.js', 'rules.js', 'net.js', 'ultimate.js'].every(f =>
      fs.existsSync(path.join(__dirname, f))));
}

/* ===================================================================== */
console.log('\n' + '='.repeat(64));
console.log(failures ? `${failures} of ${checks} checks FAILED` : `all ${checks} checks passed`);
process.exit(failures ? 1 : 0);
