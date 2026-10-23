/* =====================================================================
   Zero to Unbeatable — learning engine

   Everything the agent knows lives in ONE table of numbers indexed by
   board position. There is no strategy in this file. Nothing anywhere
   says "take the centre", "block a row", "corners are good". The only
   information that ever enters the table is the result of a finished
   game: win = +1, draw = 0, loss = -1.

   Representation
   --------------
   A board is a base-3 integer. Cell i holds 0 (empty), 1 (X) or 2 (O),
   and the board's code is  sum(cell_i * 3^i).  There are 3^9 = 19,683
   codes, so every lookup is a plain array index and a whole training
   burst is a few million array reads.

   What is learned
   ---------------
   AFTERSTATE VALUES.  V[c] is the value of the position that exists
   immediately after somebody moved into it, from the point of view of
   the player who just moved. One table serves both players and both
   roles, because the position itself says whose turn it is: equal mark
   counts means X is to move, otherwise O is.

   The update (off-policy, negamax form of one-step TD / Q-learning):

       if the move just made won the game       target = +1
       else if the board is full                target =  0
       else                target = -gamma * max over the opponent's
                                     replies of V[reply]

   The third line is the whole trick. My position is worth exactly what
   the best thing my opponent can do to me is worth to them, negated.
   Using max rather than the reply the opponent actually played makes
   the update off-policy, so heavy random exploration during training
   does not permanently poison the values it converges to.

   Nothing in the update calls a rule-of-thumb. WINNER[] is consulted
   only to decide whether a game has ENDED and what the reward is --
   that is the reward signal, not strategy.

   ===================================================================== */

const OG = (function () {
'use strict';

/* ------------------------------------------------------------------ *
 * 1. Board tables — precomputed once at load (~200k ops, instant)
 * ------------------------------------------------------------------ */

const POW3 = new Int32Array(10);
POW3[0] = 1;
for (let i = 1; i < 10; i++) POW3[i] = POW3[i - 1] * 3;
const NCODE = POW3[9];                       // 19683

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],           // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],           // columns
  [0, 4, 8], [2, 4, 6]                       // diagonals
];

const CELLS  = new Uint8Array(NCODE * 9);    // decoded board, 9 per code
const WINNER = new Uint8Array(NCODE);        // 0 none, 1 X, 2 O, 3 impossible
const NEMPTY = new Uint8Array(NCODE);        // empty squares left
const TOMOVE = new Uint8Array(NCODE);        // 1 X to move, 2 O to move, 0 unreachable

(function buildTables() {
  for (let code = 0; code < NCODE; code++) {
    let c = code, nx = 0, no = 0, ne = 0;
    const off = code * 9;
    for (let i = 0; i < 9; i++) {
      const v = c % 3; c = (c / 3) | 0;
      CELLS[off + i] = v;
      if (v === 1) nx++; else if (v === 2) no++; else ne++;
    }
    NEMPTY[code] = ne;
    let wx = false, wo = false;
    for (let L = 0; L < 8; L++) {
      const a = LINES[L][0], b = LINES[L][1], d = LINES[L][2];
      const v = CELLS[off + a];
      if (v !== 0 && v === CELLS[off + b] && v === CELLS[off + d]) {
        if (v === 1) wx = true; else wo = true;
      }
    }
    WINNER[code] = (wx && wo) ? 3 : wx ? 1 : wo ? 2 : 0;
    TOMOVE[code] = (nx === no) ? 1 : (nx === no + 1) ? 2 : 0;
  }
})();

function isTerminal(code) { return WINNER[code] !== 0 || NEMPTY[code] === 0; }
function moverOf(code)    { return TOMOVE[code] === 1 ? 2 : 1; }   // who just moved
function cellsOf(code)    { return CELLS.subarray(code * 9, code * 9 + 9); }
function encode(arr)      { let c = 0; for (let i = 0; i < 9; i++) c += arr[i] * POW3[i]; return c; }
function child(code, cell, mark) { return code + mark * POW3[cell]; }

/* legal moves into a caller-supplied buffer; returns how many */
function legalInto(code, out) {
  const off = code * 9; let n = 0;
  for (let i = 0; i < 9; i++) if (CELLS[off + i] === 0) out[n++] = i;
  return n;
}
function legalList(code) {
  const off = code * 9, out = [];
  for (let i = 0; i < 9; i++) if (CELLS[off + i] === 0) out.push(i);
  return out;
}

/* ------------------------------------------------------------------ *
 * 2. Seeded RNG — mulberry32. Same seed, same rehearsal.
 * ------------------------------------------------------------------ */

function hashSeed(s) {
  if (typeof s === 'number') return s >>> 0;
  let h = 2166136261 >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  a = a >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  if (seed === null || seed === undefined || seed === '') return Math.random;
  return mulberry32(hashSeed(seed));
}

/* ------------------------------------------------------------------ *
 * 3. Hyperparameters
 *
 * These are tuned, not guessed. tools/tune.mjs sweeps them and scores
 * each setting on the demo arc, not on final strength: a setting that
 * reaches perfect play in one burst SCORES BADLY, because a student who
 * never sees the clumsy middle never sees the lesson. The chosen values
 * and the measured arc are written up in README.md.
 * ------------------------------------------------------------------ */

const HP = {
  /* Chosen by tools/tune.mjs over 24 seeds. Measured arc with the default
     5,000-game burst: verified unbeatable at burst 3, 4 or 5 (mean 3.9,
     never earlier than 3, never later than 5); era 1 still loses 11-21%
     of games to a casual player who blocks and takes wins. */
  alphaFloor: 0.80,  // learning rate once a position is familiar. Tic-tac-toe
                     // is deterministic, so the TD target carries no noise
                     // and a high rate is correct rather than reckless.
  alphaWarm:  1,     // alpha = max(floor, warm / (warm + visits))
  gamma:   0.95,     // discount: prefer winning sooner, losing later
  epsStart: 1.00,    // era 0 is pure coin-flipping
  epsEnd:   0.25,
  epsTau:   14000,   // games; eps = end + (start-end) * exp(-games/tau).
                     // Long on purpose: exploration is what fills in the
                     // odd corners of the board a student might wander into.
  mixSelfPlay: 0.60, // 60% against itself; the other 40% split evenly between
                     // playing first and second against a random mover
  exploringStarts: 0.20, // fraction of training games that begin from a dealt
                     // position instead of an empty board
  burst:   5000,     // default burst size
  bursts:  [500, 2000, 5000]
};

function epsilonAt(games) {
  return HP.epsEnd + (HP.epsStart - HP.epsEnd) * Math.exp(-games / HP.epsTau);
}

/* ------------------------------------------------------------------ *
 * 4. The agent — a table, a visit counter, and a game counter
 * ------------------------------------------------------------------ */

function newAgent() {
  return {
    V: new Float32Array(NCODE),   // learned value of every afterstate
    N: new Uint32Array(NCODE),    // how many times each was updated
    games: 0,                     // training games lived through
    seen: 0                       // distinct positions with N > 0
  };
}

function cloneAgent(a) {
  return { V: new Float32Array(a.V), N: new Uint32Array(a.N), games: a.games, seen: a.seen };
}

/* Best value the side to move can reach from `code`, per the table
   alone. Used for the bootstrap target and for greedy play. */
const _buf = new Uint8Array(9);
function bestChildValue(agent, code) {
  const mover = TOMOVE[code], V = agent.V;
  const n = legalInto(code, _buf);
  let best = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = V[code + mover * POW3[_buf[i]]];
    if (v > best) best = v;
  }
  return best;
}

/* Every move the agent might actually play from `code`: the moves whose
   afterstate ties for the highest learned value, minus any it has never
   once tried if a tried move ties with it.
 *
 * That second clause is the only tie-break rule in the agent and it is
 * worth being precise about, because "no hard-coded strategy" is the
 * central promise of this demo. It contains no tic-tac-toe knowledge --
 * it does not know what a row is. It says: an unplayed square and a
 * square known to draw both read 0.00, and between two things that look
 * identical, go with the one you have evidence for. Without it a fully
 * trained agent still throws away roughly one game in a thousand by
 * coin-flipping onto a square it has never seen, which is enough to
 * fail the unbeatability proof.
 *
 * Ties among *tried* moves are still broken by coin flip, so the agent
 * keeps varying its play, and a newborn -- every count zero, every value
 * zero -- is still uniformly random over all nine squares. */
function policyMoves(agent, code) {
  const mover = TOMOVE[code], V = agent.V, N = agent.N;
  const legal = legalList(code);
  let best = -Infinity;
  for (const m of legal) { const v = V[code + mover * POW3[m]]; if (v > best) best = v; }
  const tied = [];
  for (const m of legal) if (V[code + mover * POW3[m]] >= best - 1e-9) tied.push(m);
  const tried = tied.filter(m => N[code + mover * POW3[m]] > 0);
  return tried.length ? tried : tied;
}
const argmaxMoves = policyMoves;   // name used by the verifier and the UI

function greedyMove(agent, code, rnd) {
  const ties = policyMoves(agent, code);
  return ties[(rnd() * ties.length) | 0];
}

function epsGreedyMove(agent, code, eps, rnd) {
  if (rnd() < eps) {
    const n = legalInto(code, _buf);
    return _buf[(rnd() * n) | 0];
  }
  return greedyMove(agent, code, rnd);
}

function randomMove(code, rnd) {
  const n = legalInto(code, _buf);
  return _buf[(rnd() * n) | 0];
}

/* Move-by-move view for the brain inspector. */
function moveValues(agent, code) {
  const mover = TOMOVE[code];
  return legalList(code).map(cell => {
    const c = child(code, cell, mover);
    return { cell, code: c, value: agent.V[c], visits: agent.N[c] };
  });
}

/* ------------------------------------------------------------------ *
 * 5. Training
 * ------------------------------------------------------------------ */

/* modes: 0 = self-play (one brain, both chairs)
          1 = agent is X, opponent plays uniformly at random
          2 = agent is O, opponent plays uniformly at random          */
/* Every position that can legally occur and is not already finished,
   found by walking the rules out from an empty board. This is a list of
   POSITIONS, not of moves to make in them -- it carries no more
   information than "here is what a legal tic-tac-toe board looks like".
   There are 4,520 of them. */
const OPEN_POSITIONS = (function () {
  const seen = new Uint8Array(NCODE), out = [];
  (function walk(code) {
    if (seen[code]) return;
    seen[code] = 1;
    if (WINNER[code] !== 0 || NEMPTY[code] === 0) return;
    out.push(code);
    const mover = TOMOVE[code];
    for (let i = 0; i < 9; i++) if (CELLS[code * 9 + i] === 0) walk(code + mover * POW3[i]);
  })(0);
  return Int32Array.from(out);
})();

/* An exploring start: instead of always starting from an empty board,
   drop the trainer into a legal position and play on from there.
 *
 * This is Sutton & Barto's exploring-starts device and it is the single
 * change that makes a provably perfect agent reachable in a few
 * thousand games. Games that all start from move one pile almost every
 * bit of practice onto opening positions -- the nine openings get
 * thousands of visits each while a seven-mark endgame gets two -- and
 * two visits is not enough for a position to learn what it is worth.
 *
 * The starts are dealt round-robin from a shuffled deck rather than
 * drawn at random, because random draws leave a third of the deck
 * untouched after a full deck's worth of draws (the coupon-collector
 * problem) and it is exactly those unpractised endgames that keep the
 * agent one blunder short of perfect.
 *
 * It tells the agent WHERE to practise, never WHAT TO PLAY. */
function reshuffle(agent, rnd) {
  const d = Int32Array.from(OPEN_POSITIONS);
  for (let i = d.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = d[i]; d[i] = d[j]; d[j] = t;
  }
  agent.deck = d; agent.deckAt = 0;
}
function exploringStart(agent, rnd) {
  if (!agent.deck || agent.deckAt >= agent.deck.length) reshuffle(agent, rnd);
  return agent.deck[agent.deckAt++];
}

function playTrainingGame(agent, rnd, mode, eps, traj, fromExploringStart) {
  let code = 0;
  traj.length = 0;
  if (fromExploringStart) {
    code = exploringStart(agent, rnd);
    /* The position we were dropped into is an afterstate too -- somebody
       "moved" into it. Put it at the head of the trajectory so the
       reverse pass updates it last, once the game that followed has
       corrected everything underneath it. Without this, a deep position
       gets its children practised but its own value keeps whatever it
       had, and its parent goes on believing the wrong thing. */
    if (code !== 0) traj.push(code);
  }
  for (;;) {
    const mover = TOMOVE[code];
    const agentSeat = mode === 0 || (mode === 1 && mover === 1) || (mode === 2 && mover === 2);
    const cell = agentSeat ? epsGreedyMove(agent, code, eps, rnd) : randomMove(code, rnd);
    code += mover * POW3[cell];
    traj.push(code);
    if (WINNER[code] !== 0 || NEMPTY[code] === 0) return traj;
  }
}

/* One-step TD over the afterstates of a finished game, applied in
   REVERSE order -- last move first. Reverse order lets the result of
   the game reach the opening move of that same game immediately,
   instead of creeping back one ply per replay. Forward order is the
   more obvious way to write it and was tried first; it leaves deep
   endgame positions with two or three visits and values still near
   zero after 16,000 games, and the agent plateaus a hair short of
   perfect forever. */
function learnFrom(agent, traj) {
  const V = agent.V, N = agent.N, gm = HP.gamma;
  const floor = HP.alphaFloor, warm = HP.alphaWarm;
  for (let t = traj.length - 1; t >= 0; t--) {
    const code = traj[t];
    let target;
    if (WINNER[code] !== 0) target = 1;             // the move just made won
    else if (NEMPTY[code] === 0) target = 0;        // full board, drawn
    else target = -gm * bestChildValue(agent, code);
    if (N[code] === 0) agent.seen++;
    const a = Math.max(floor, warm / (warm + N[code]));
    N[code]++;
    V[code] += a * (target - V[code]);
  }
}

/* Run `count` training games. Callers run this in small chunks so the
   phone can paint a frame between them. */
function trainGames(agent, count, rnd, opts) {
  opts = opts || {};
  const sampleEvery = opts.sampleEvery | 0;
  const samples = [];
  const traj = [];
  let selfPlay = 0, vsRandom = 0;
  const half = HP.mixSelfPlay + (1 - HP.mixSelfPlay) / 2;
  for (let g = 0; g < count; g++) {
    const eps = epsilonAt(agent.games);
    const r = rnd();
    const mode = r < HP.mixSelfPlay ? 0 : (r < half ? 1 : 2);
    if (mode === 0) selfPlay++; else vsRandom++;
    playTrainingGame(agent, rnd, mode, eps, traj, rnd() < HP.exploringStarts);
    learnFrom(agent, traj);
    agent.games++;
    if (sampleEvery && (g % sampleEvery) === 0) samples.push(traj.slice());
  }
  return { samples, selfPlay, vsRandom, eps: epsilonAt(agent.games) };
}

/* ------------------------------------------------------------------ *
 * 6. Opponents used for measurement only (never by the agent)
 * ------------------------------------------------------------------ */

/* The "naive student": takes a win if it is sitting there, otherwise
   plays anywhere. No blocking, no plan. Era 1 must still lose to this
   sometimes or the demo has no middle. */
function naiveMove(code, rnd) {
  const mover = TOMOVE[code];
  const legal = legalList(code);
  for (const m of legal) if (WINNER[child(code, m, mover)] === mover) return m;
  return legal[(rnd() * legal.length) | 0];
}

/* result from the agent's point of view: 1 win, 0 draw, -1 loss */
function playAgainst(agent, oppMove, rnd, agentMark) {
  let code = 0;
  for (;;) {
    const mover = TOMOVE[code];
    const cell = (mover === agentMark) ? greedyMove(agent, code, rnd) : oppMove(code, rnd);
    code += mover * POW3[cell];
    const w = WINNER[code];
    if (w !== 0) return w === agentMark ? 1 : -1;
    if (NEMPTY[code] === 0) return 0;
  }
}

function scoreVs(agent, oppMove, games, rnd, agentMark) {
  let w = 0, l = 0, d = 0;
  for (let i = 0; i < games; i++) {
    const marks = agentMark ? [agentMark] : [1, 2];
    const m = marks[i % marks.length];
    const r = playAgainst(agent, oppMove, rnd, m);
    if (r > 0) w++; else if (r < 0) l++; else d++;
  }
  return { wins: w, losses: l, draws: d, games, winRate: w / games, lossRate: l / games };
}

const vsRandom = (agent, games, rnd, mark) => scoreVs(agent, randomMove, games, rnd, mark);
const vsNaive  = (agent, games, rnd, mark) => scoreVs(agent, naiveMove,  games, rnd, mark);

/* ------------------------------------------------------------------ *
 * 7. Verification — proof, not sampling
 *
 * The adversary is not a minimax player, it is EVERY player: at each of
 * its turns it branches on every legal move, so the search covers every
 * game line reachable against the player under test, minimax lines
 * included.
 *
 * On that player's turn we branch over its entire candidate set, not one
 * pick, because ties are broken by coin flip at play time. So "safe"
 * means: no sequence of legal opponent moves and no tie-break it could
 * flip leads to it losing. That is a proof for the policy as it is
 * actually played, not for one lucky tie-break ordering.
 *
 * The search takes a POLICY, not an agent: movesFor(code) returns every
 * square the player under test might actually choose there, and that is
 * deliberately the only thing the search knows about it. Which is why
 * the same machinery proves the hand-written rule ladder of Step 1 and
 * the learned agent of Step 2 -- two opposite ways of arriving at a
 * policy, held to one standard and reported in the same words.
 * verifyRole / verifyUnbeatable are the learned-agent spelling of it.
 * ------------------------------------------------------------------ */

function verifyPolicyRole(movesFor, mark) {
  const opp = mark === 1 ? 2 : 1;
  const memo = new Int8Array(NCODE);       // 0 unknown, 1 safe, 2 losable
  let positions = 0;
  let worstLine = null;

  function safe(code, path) {
    if (memo[code]) return memo[code] === 1;
    positions++;
    let ok;
    if (WINNER[code] === opp) { ok = false; if (!worstLine) worstLine = path.slice(); }
    else if (WINNER[code] === mark || NEMPTY[code] === 0) ok = true;
    else {
      const mover = TOMOVE[code];
      const moves = (mover === mark) ? movesFor(code) : legalList(code);
      ok = true;
      for (const m of moves) {
        path.push(m);
        const s = safe(code + mover * POW3[m], path);
        path.pop();
        if (!s) { ok = false; break; }
      }
    }
    memo[code] = ok ? 1 : 2;
    return ok;
  }

  const ok = safe(0, []);

  /* Count complete game lines in the same tree (DAG-counted). */
  const lineMemo = new Float64Array(NCODE);
  const lineSeen = new Uint8Array(NCODE);
  function lines(code) {
    if (lineSeen[code]) return lineMemo[code];
    lineSeen[code] = 1;
    let n;
    if (isTerminal(code)) n = 1;
    else {
      const mover = TOMOVE[code];
      const moves = (mover === mark) ? movesFor(code) : legalList(code);
      n = 0;
      for (const m of moves) n += lines(code + mover * POW3[m]);
    }
    lineMemo[code] = n;
    return n;
  }

  return { safe: ok, positions, lines: lines(0), worstLine };
}

function verifyPolicy(movesFor) {
  const first  = verifyPolicyRole(movesFor, 1);
  const second = verifyPolicyRole(movesFor, 2);
  return {
    safe: first.safe && second.safe,
    asFirst: first,
    asSecond: second,
    lines: first.lines + second.lines,
    positions: first.positions + second.positions
  };
}

const verifyRole       = (agent, mark) => verifyPolicyRole(code => argmaxMoves(agent, code), mark);
const verifyUnbeatable = (agent)       => verifyPolicy(code => argmaxMoves(agent, code));

/* How often can a challenger playing its very best actually win? Exact,
   not sampled: the player under test breaks its own ties by coin flip,
   so its node is the average over its candidates, and the challenger's
   node is the maximum over its legal moves. One pass over the position
   DAG.

   This is the number that turns "beatable" into something a room can
   feel. "A losing line exists" is true of a player who loses once in a
   thousand games and of one who loses two games in three, and those are
   not the same demo. */
function winChance(movesFor, mark) {
  const opp = mark === 1 ? 2 : 1;               // the challenger
  const memo = new Float64Array(NCODE);
  const seen = new Uint8Array(NCODE);

  function p(code) {
    if (seen[code]) return memo[code];
    seen[code] = 1;
    let v;
    if (WINNER[code] === opp) v = 1;
    else if (WINNER[code] === mark || NEMPTY[code] === 0) v = 0;
    else if (TOMOVE[code] === opp) {
      v = 0;
      for (const m of legalList(code)) v = Math.max(v, p(code + opp * POW3[m]));
    } else {
      const moves = movesFor(code);
      let s = 0;
      for (const m of moves) s += p(code + mark * POW3[m]);
      v = moves.length ? s / moves.length : 0;
    }
    memo[code] = v;
    return v;
  }
  /* `at` is exposed so a caller can walk the same table to read a
     representative game off it, rather than quoting whichever losing
     leaf a depth-first search happened to reach first. */
  return { root: p(0), at: p };
}

function bestWinChance(movesFor, mark) { return winChance(movesFor, mark).root; }

/* ------------------------------------------------------------------ *
 * 8. Landmark positions for the "what it learned" card
 *
 * Chosen so the three lessons land in the order a person learns them:
 * finish your own row, stop theirs, then the one that takes longest --
 * that a corner reply to the double-corner opening loses to a fork.
 * ------------------------------------------------------------------ */

const _b = (s) => encode(s.split('').map(ch => ch === 'X' ? 1 : ch === 'O' ? 2 : 0));

const LANDMARKS = [
  {
    id: 'win',
    title: 'Finish it',
    code: _b('XX.OO...X'),        // X:0,1,8  O:3,4  — O to move, 5 wins now
    key: 5,
    ask: 'It can win right now by taking the square that completes its own row.',
    learned: 'completing its own row',
    order: 1
  },
  {
    id: 'block',
    title: 'Block your row',
    code: _b('XX..O....'),        // X:0,1  O:4  — O to move, must take 2
    key: 2,
    ask: 'You are one square from three in a row. It has to take that square.',
    learned: 'blocking your open row',
    order: 2
  },
  {
    id: 'fork',
    title: 'The corner trap',
    code: _b('X...O...X'),        // X:0,8  O:4  — O to move, only an edge survives
    key: 1,
    keyAlso: [3, 5, 7],
    ask: 'You took two opposite corners. Answering in a corner loses to a fork three moves later — only an edge holds the draw.',
    learned: 'answering the double corner on an edge',
    order: 3
  },
  {
    id: 'open',
    title: 'The opening',
    code: 0,                      // empty board, X to move
    key: null,
    ask: 'Which square to take first. Watch this one flatten out: against a weak opponent the centre looks best, but against a good one every opening is a draw.',
    learned: 'that the opening barely matters',
    order: 4
  }
];

/* ------------------------------------------------------------------ *
 * 9. Statistical check that a newborn really is a coin flip
 * ------------------------------------------------------------------ */

function chiSquareUniform(counts) {
  const k = counts.length;
  let n = 0; for (const c of counts) n += c;
  const exp = n / k;
  let x2 = 0;
  for (const c of counts) x2 += (c - exp) * (c - exp) / exp;
  return { chi2: x2, df: k - 1, n };
}

function sampleMoveCounts(agent, code, samples, rnd) {
  const legal = legalList(code);
  const idx = new Map(legal.map((m, i) => [m, i]));
  const counts = new Array(legal.length).fill(0);
  for (let i = 0; i < samples; i++) counts[idx.get(greedyMove(agent, code, rnd))]++;
  return { counts, legal };
}

/* ------------------------------------------------------------------ */

return {
  POW3, NCODE, LINES, CELLS, WINNER, NEMPTY, TOMOVE, HP, LANDMARKS,
  OPEN_POSITIONS,
  isTerminal, moverOf, cellsOf, encode, child, legalList, epsilonAt,
  makeRng, mulberry32, hashSeed,
  newAgent, cloneAgent, argmaxMoves, greedyMove, epsGreedyMove, randomMove,
  naiveMove, moveValues, bestChildValue,
  trainGames, learnFrom, playTrainingGame,
  playAgainst, scoreVs, vsRandom, vsNaive,
  verifyUnbeatable, verifyRole, verifyPolicy, verifyPolicyRole, bestWinChance, winChance,
  chiSquareUniform, sampleMoveCounts
};
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OG;
