/* =====================================================================
   Zero to Unbeatable — Ultimate Tic-Tac-Toe

   Step 3. Nine small boards in a 3x3 meta-grid, and one extra rule that
   changes everything:

     THE CELL YOU PLAY IN DECIDES WHICH BOARD YOUR OPPONENT PLAYS IN.

   Play the centre cell of any board and your opponent is sent to the
   centre board. If they are sent to a board that is already finished --
   won or full -- they may play anywhere. Win a small board by three in
   a row inside it; win the MATCH by winning three small boards in a row
   on the meta-grid. A small board that fills with nobody winning it is
   a draw and counts for NEITHER side on the meta-grid, and if all 81
   squares fill without a meta-line, the match is drawn.

   Why this is the right world to break the demo on
   ------------------------------------------------
   The old step 3 was nine INDEPENDENT boards, first to five. That game
   let a person choose a shortcut -- score one board at a time and add
   up -- and the shortcut worked, because the boards really were
   independent and five of anything is five. Ultimate rules delete both
   halves of that:

   1. A board's worth now depends on WHERE IT SITS. Winning the centre
      board puts you on four meta-lines; winning an edge board puts you
      on two. A table indexed by the picture inside a board cannot tell
      those apart, because the picture is the same.

   2. Your move also decides WHERE YOUR OPPONENT PLAYS. Two moves that
      leave a board looking identical can send the opponent somewhere
      they win instantly, or somewhere they have nothing. A per-board
      table scores them the same, because it only ever looks at the
      board that changed.

   Both of those are measured rather than asserted -- see
   measureBlindness() below, and the card the app shows after a burst.
   The agent still plays: it takes free board wins and blocks board
   threats, because those ARE visible one board at a time. It walks past
   the other two, and that is the act.

   What is NOT in here
   -------------------
   A fix. Finding a representation that couples the boards and looks at
   where a move sends the opponent is exactly what the next rung is for,
   and it is a separate build. This file is the honest failure.

   The state space
   ---------------
   Also computed here rather than quoted, because the counts are the
   other half of the act: SPACE at the bottom of the file works out how
   many small-board pictures this game can actually produce, how many
   survive the one symmetry that is left, and the upper bound on whole
   positions that follows.
   ===================================================================== */

const ULT = (function (OG) {
'use strict';

const { POW3, NCODE, WINNER, NEMPTY, TOMOVE, CELLS, LINES, moverOf } = OG;

const BOARDS = 9;
const ANYWHERE = -1;          /* m.send when you may play in any live board */

/* ------------------------------------------------------------------ *
 * Match state
 *
 * The meta-grid is itself a tic-tac-toe board, so it is stored as one:
 * metaCode() packs "who owns each board" into the same base-3 code the
 * engine already understands, and WINNER[] decides the match. One set
 * of tables, one definition of three-in-a-row, used at both scales.
 * ------------------------------------------------------------------ */

function newMatch() {
  return {
    b: new Int32Array(BOARDS),     /* board codes */
    r: new Uint8Array(BOARDS),     /* 0 live, 1 X took it, 2 O took it, 3 drawn */
    send: ANYWHERE,                /* board you must play in, or ANYWHERE */
    turn: 1,
    over: false,
    winner: 0,                     /* 0 none yet, 1 X, 2 O, 3 drawn match */
    metaLine: null,                /* the three boards that ended it */
    plies: 0,
    last: null                     /* {board, cell, mark} */
  };
}

function cloneMatch(m) {
  return { b: Int32Array.from(m.b), r: Uint8Array.from(m.r), send: m.send,
           turn: m.turn, over: m.over, winner: m.winner, metaLine: m.metaLine,
           plies: m.plies, last: m.last };
}

function boardOutcome(code) {
  const w = WINNER[code];
  if (w === 1 || w === 2) return w;
  if (NEMPTY[code] === 0) return 3;
  return 0;
}

/* A drawn board counts for neither side, so it contributes 0 -- the
   same as a board still in play. That is the convention this demo
   states on the page, and the one the literature uses. */
function metaCode(m) {
  let c = 0;
  for (let i = 0; i < BOARDS; i++) {
    const w = m.r[i];
    if (w === 1 || w === 2) c += w * POW3[i];
  }
  return c;
}

function metaLineOf(code, w) {
  const off = code * 9;
  for (const L of LINES) {
    if (CELLS[off + L[0]] === w && CELLS[off + L[1]] === w && CELLS[off + L[2]] === w) return L;
  }
  return null;
}

function tally(m) {
  let x = 0, o = 0, d = 0;
  for (let i = 0; i < BOARDS; i++) {
    if (m.r[i] === 1) x++; else if (m.r[i] === 2) o++; else if (m.r[i] === 3) d++;
  }
  return { x, o, d };
}

/* Every legal move, as board*9 + cell. This is the ONE place the send
   rule is enforced, so nothing downstream can quietly forget it. */
function movesOf(m, out) {
  out.length = 0;
  if (m.send >= 0) {
    const off = m.b[m.send] * 9;
    for (let c = 0; c < 9; c++) if (CELLS[off + c] === 0) out.push(m.send * 9 + c);
    return out;
  }
  for (let i = 0; i < BOARDS; i++) {
    if (m.r[i] !== 0) continue;
    const off = m.b[i] * 9;
    for (let c = 0; c < 9; c++) if (CELLS[off + c] === 0) out.push(i * 9 + c);
  }
  return out;
}
function legalMoves(m) { return movesOf(m, []); }

/* returns true if the match ended on this move */
function applyMove(m, move) {
  const board = (move / 9) | 0, cell = move % 9, mark = m.turn;
  m.b[board] += mark * POW3[cell];
  m.last = { board, cell, mark };
  m.plies++;
  const out = boardOutcome(m.b[board]);
  if (out) m.r[board] = out;

  /* THE RULE. The cell just played names the next board; a finished
     board frees the choice. */
  m.send = m.r[cell] === 0 ? cell : ANYWHERE;

  const meta = metaCode(m);
  const w = WINNER[meta];
  if (w === 1 || w === 2) {
    m.over = true; m.winner = w; m.metaLine = metaLineOf(meta, w);
  } else if (legalMoves(m).length === 0) {
    m.over = true; m.winner = 3;          /* 81 squares full, no meta-line */
  } else {
    m.turn = mark === 1 ? 2 : 1;
  }
  return m.over;
}

/* The whole position as one key, for counting repeats. The active board
   is part of it, and has to be: the same 81 marks with the opponent sent
   somewhere else is a different position. Ordinary tic-tac-toe never had
   to carry anything but the picture. */
function matchKey(m) {
  let s = '';
  for (let i = 0; i < BOARDS; i++) s += m.b[i] + ',';
  return s + '|' + m.send;
}

/* ------------------------------------------------------------------ *
 * Small helpers about a single board, kept local so this file depends
 * on the engine's tables and nothing else.
 * ------------------------------------------------------------------ */

/* cells that would complete a line for `mark` in this board picture */
function winningCells(code, mark) {
  const off = code * 9, out = [];
  for (const L of LINES) {
    let mine = 0, empty = -1, other = 0;
    for (const i of L) {
      const v = CELLS[off + i];
      if (v === mark) mine++; else if (v === 0) empty = i; else other++;
    }
    if (mine === 2 && other === 0 && empty >= 0 && out.indexOf(empty) < 0) out.push(empty);
  }
  return out;
}
const canWinHere = (code, mark) => winningCells(code, mark).length > 0;

/* Would this move win the match outright? It wins a board, and that
   board completes three in a row on the meta-grid. */
function winsMatch(m, move) {
  const board = (move / 9) | 0, cell = move % 9, mark = m.turn;
  if (m.r[board] !== 0) return false;
  if (WINNER[m.b[board] + mark * POW3[cell]] !== mark) return false;
  return WINNER[metaCode(m) + mark * POW3[board]] === mark;
}

/* Would this move win a small board, whether or not it ends the match? */
function winsBoard(m, move) {
  const board = (move / 9) | 0, cell = move % 9, mark = m.turn;
  return m.r[board] === 0 && WINNER[m.b[board] + mark * POW3[cell]] === mark;
}

/* Does this move hand the opponent a board they can win immediately?
   Being sent to a finished board is the worst gift of all -- it hands
   over the whole grid -- so it counts whenever any live board has a win
   waiting in it. */
function isGift(m, move) {
  const board = (move / 9) | 0, cell = move % 9, mark = m.turn;
  const opp = mark === 1 ? 2 : 1;
  const after = m.b[board] + mark * POW3[cell];
  const closed = boardOutcome(after) !== 0;
  const codeOf = i => (i === board ? after : m.b[i]);
  const doneOf = i => (i === board ? closed : m.r[i] !== 0);
  if (!doneOf(cell)) return canWinHere(codeOf(cell), opp);
  for (let i = 0; i < BOARDS; i++) if (!doneOf(i) && canWinHere(codeOf(i), opp)) return true;
  return false;
}

/* ------------------------------------------------------------------ *
 * The brain: ONE NUMBER PER BOARD PICTURE, from X's point of view,
 * carrying whose turn it is.
 *
 *   U[picture, turn] = how this board ends up for X, given it is
 *                      `turn`'s move.  +1 X takes it, -1 O takes it.
 *
 * This is the decomposition a person chose, ported unchanged from the
 * independent-boards version of this act, and it is deliberately not
 * repaired. It has no slot for where the board sits on the meta-grid
 * and no slot for where a move sends the opponent, which is exactly
 * what measureBlindness() below goes and measures.
 *
 * The store sits behind three calls -- at(), hits(), nudge() -- and
 * everything below this point reaches its memory through them and
 * nothing else. That is the seam a different kind of memory would be
 * fitted into later; keeping it honest now costs nothing.
 * ------------------------------------------------------------------ */

const HPU = {
  /* Tuned the same way the one-board agent was: on the shape of the arc.
     The measured arc is printed by src/playtest.test.js and quoted on
     the card the app shows after a burst. */
  alphaFloor: 0.60,   /* the target is a Bellman backup, not a noisy sample,
                         so a high rate is correct here as on one board */
  alphaWarm: 1,
  gamma:    0.90,     /* a board banked now is worth more than the same board
                         banked in three moves' time */
  epsStart: 1.00,
  epsEnd:   0.20,
  epsTau:   2000,     /* matches, not games */
  mixSelfPlay: 0.60,
  exploringStarts: 0.35, /* fraction of training matches that open with a run
                            of random moves. A great many board pictures --
                            including winning ones -- are only ever reached
                            down an odd line, and a picture it has never been
                            rewarded on reads 0.00, so it walks past a free
                            win. */
  burst: 600,         /* an ultimate match runs far longer than a game of
                         tic-tac-toe, and every live board is backed up on
                         every ply */
  bursts: [200, 600, 1500]
};

function epsilonAt(matches) {
  return HPU.epsEnd + (HPU.epsStart - HPU.epsEnd) * Math.exp(-matches / HPU.epsTau);
}

/* U is indexed by code * 2 + (turn - 1). */
const USIZE = NCODE * 2;
const ui = (code, t) => code * 2 + t - 1;

function newBrain() {
  return {
    kind: 'table',
    U: new Float32Array(USIZE),   /* board value to X, given whose turn it is */
    N: new Uint32Array(USIZE),
    matches: 0,
    seen: 0,
    seeded: 0,                    /* entries handed over from step 2 */
    set(code, t, value, n) {
      const k = code * 2 + t - 1;
      if (this.N[k] === 0) this.seen++;
      this.N[k] = n;
      this.U[k] = value;
    },
    at(code, t) { return this.U[code * 2 + t - 1]; },
    hits(code, t) { return this.N[code * 2 + t - 1]; },
    nudge(code, t, target) {
      const k = code * 2 + t - 1;
      if (this.N[k] === 0) this.seen++;
      const a = Math.max(HPU.alphaFloor, HPU.alphaWarm / (HPU.alphaWarm + this.N[k]));
      this.N[k]++;
      this.U[k] += a * (target - this.U[k]);
    }
  };
}

function cloneBrain(b) {
  const c = newBrain();
  c.U.set(b.U); c.N.set(b.N);
  c.matches = b.matches; c.seen = b.seen; c.seeded = b.seeded;
  return c;
}

/* Hand over everything step 2 learned that still means something here.
   Its V[code] is the value to whoever just moved into `code`, and for a
   balanced position the mark counts say who that was -- so it converts
   exactly into "value to X with the OTHER player to move". The pictures
   that only exist once you can play twice in the same board, and the
   second turn value of every picture, start at zero: unknown, and
   visibly so. */
function seedFromAgent(brain, agent) {
  let n = 0;
  for (let code = 1; code < NCODE; code++) {
    const t = TOMOVE[code];
    if (t === 0 || WINNER[code] === 3) continue;       /* cannot occur */
    if (agent.N[code] === 0) continue;                 /* never learned */
    const x = moverOf(code) === 1 ? agent.V[code] : -agent.V[code];
    brain.set(code, t, x, agent.N[code]);
    n++;
  }
  brain.seeded = n;
  return n;
}

/* Value of a candidate move to the player making it. Both terms are read
   with the OPPONENT to move: leaving them on move in a board they are
   about to win is worth -1, and blocking it is worth 0, which is where
   blocking comes from without anybody writing a rule about rows.

   And this is the shortcut. Every board except the one being touched is
   assumed to cancel -- true when the boards were independent, false here
   twice over. */
function moveValue(brain, code, cell, mark) {
  const opp = mark === 1 ? 2 : 1;
  const d = brain.at(code + mark * POW3[cell], opp) - brain.at(code, opp);
  return mark === 1 ? d : -d;
}

/* Every move that ties for best, minus any whose resulting board picture
   it has never seen when a seen one ties with it -- the same confidence
   tie-break as step 2, and the same reason: an unseen picture and a
   picture known to be even both read 0.00. */
function policyMoves(brain, m) {
  const moves = legalMoves(m), mark = m.turn, opp = mark === 1 ? 2 : 1;
  let best = -Infinity;
  const vals = moves.map(mv => {
    const v = moveValue(brain, m.b[(mv / 9) | 0], mv % 9, mark);
    if (v > best) best = v;
    return v;
  });
  const tied = moves.filter((mv, i) => vals[i] >= best - 1e-9);
  const tried = tied.filter(mv =>
    brain.hits(m.b[(mv / 9) | 0] + mark * POW3[mv % 9], opp) > 0);
  return tried.length ? tried : tied;
}

function greedyMove(brain, m, rnd) {
  const t = policyMoves(brain, m);
  return t[(rnd() * t.length) | 0];
}

/* Exploration for training only, and NOT a coin flip. When it explores
   it goes where it knows least: the move whose resulting board picture
   it has seen the fewest times, ties broken by coin flip. That contains
   no tic-tac-toe knowledge -- it cannot tell a winning square from any
   other, only a familiar one from a strange one. It is off during
   play. */
function exploreMove(brain, m, rnd) {
  const moves = legalMoves(m), mark = m.turn, opp = mark === 1 ? 2 : 1;
  let fewest = Infinity;
  const counts = moves.map(mv => {
    const n = brain.hits(m.b[(mv / 9) | 0] + mark * POW3[mv % 9], opp);
    if (n < fewest) fewest = n;
    return n;
  });
  const rarest = moves.filter((mv, i) => counts[i] === fewest);
  return rarest[(rnd() * rarest.length) | 0];
}

function epsGreedyMove(brain, m, eps, rnd) {
  if (rnd() < eps) return exploreMove(brain, m, rnd);
  return greedyMove(brain, m, rnd);
}

function randomMove(m, rnd) {
  const mv = legalMoves(m);
  return mv[(rnd() * mv.length) | 0];
}

/* How many of the squares it is weighing up right now sit on a board
   picture it has never seen. The honest measure of "out of its depth". */
function blindFraction(brain, m) {
  const moves = legalMoves(m);
  if (!moves.length) return 0;
  const mark = m.turn, opp = mark === 1 ? 2 : 1;
  let blind = 0;
  for (const mv of moves) {
    const after = m.b[(mv / 9) | 0] + mark * POW3[mv % 9];
    if (brain.hits(after, opp) === 0) blind++;
  }
  return blind / moves.length;
}

/* board pictures that can only happen with the whole grid open: one
   player has moved in this board more often than alternating turns
   would allow */
function isImpossibleAlone(code) { return TOMOVE[code] === 0; }

/* ------------------------------------------------------------------ *
 * Training
 *
 * Step 2's rule, with the turn carried explicitly. Every live board is
 * a real situation being experienced on every ply, so every live board
 * gets a backup on every ply.
 *
 * Nothing here consults the rules of winning. A finished board's value
 * arrives as a reward when a board actually finishes; the backup below
 * only ever reads numbers already in the table.
 *
 * And nothing here consults the MATCH result, because the memory has
 * nowhere to put it. That is not an oversight -- it is the shortcut
 * being what it is.
 * ------------------------------------------------------------------ */

function backup(brain, code, t) {
  const off = code * 9;
  let best = t === 1 ? -Infinity : Infinity;
  const opp = t === 1 ? 2 : 1;
  for (let c = 0; c < 9; c++) {
    if (CELLS[off + c] !== 0) continue;
    const v = brain.at(code + t * POW3[c], opp);
    if (t === 1) { if (v > best) best = v; } else { if (v < best) best = v; }
  }
  if (best === Infinity || best === -Infinity) return;      /* no legal move */
  brain.nudge(code, t, HPU.gamma * best);
}

/* a board just finished: its result is the reward, and it is worth that
   whoever is to move */
function reward(brain, code, z) {
  brain.nudge(code, 1, z);
  brain.nudge(code, 2, z);
}

function playMatch(brain, rnd, mode, eps, learn, wildPlies) {
  const m = newMatch();
  let wild = wildPlies | 0;
  for (;;) {
    const brainSeat = mode === 0 || (mode === 1 && m.turn === 1) || (mode === 2 && m.turn === 2);
    const mv = (wild-- > 0) ? randomMove(m, rnd)
             : brainSeat ? epsGreedyMove(brain, m, eps, rnd) : randomMove(m, rnd);
    const board = (mv / 9) | 0, turn = m.turn;
    applyMove(m, mv);

    if (learn) {
      const r = m.r[board];
      if (r !== 0) reward(brain, m.b[board], r === 1 ? 1 : r === 2 ? -1 : 0);
      const nextTurn = m.over ? (turn === 1 ? 2 : 1) : m.turn;
      for (let b = 0; b < BOARDS; b++) {
        if (m.r[b] === 0) backup(brain, m.b[b], nextTurn);
      }
      if (m.r[board] === 0) backup(brain, m.b[board], turn);
    }
    if (m.over) return m;
  }
}

const KEY_CAP = 400000;        /* stop growing the repeat counter here */

function trainMatches(brain, count, rnd, opts) {
  opts = opts || {};
  const sampleEvery = opts.sampleEvery | 0;
  const samples = [];
  let selfPlay = 0, vsRandom = 0, plies = 0;
  const half = HPU.mixSelfPlay + (1 - HPU.mixSelfPlay) / 2;

  for (let g = 0; g < count; g++) {
    const eps = epsilonAt(brain.matches);
    const r = rnd();
    const mode = r < HPU.mixSelfPlay ? 0 : (r < half ? 1 : 2);
    if (mode === 0) selfPlay++; else vsRandom++;
    const wild = rnd() < HPU.exploringStarts ? 1 + ((rnd() * 30) | 0) : 0;
    const m = playMatch(brain, rnd, mode, eps, true, wild);
    brain.matches++;
    plies += m.plies;
    if (sampleEvery && (g % sampleEvery) === 0) samples.push(cloneMatch(m));
  }
  return { samples, selfPlay, vsRandom, plies, eps: epsilonAt(brain.matches) };
}

/* How often does a whole position ever come round again? This is the
   number that decides whether a table over whole positions could ever
   work, so it is measured rather than asserted. */
function measureRecurrence(brain, matches, rnd) {
  const seen = new Map();
  let positions = 0, repeats = 0, plies = 0;
  for (let g = 0; g < matches; g++) {
    const m = newMatch();
    const eps = epsilonAt(brain.matches);
    for (;;) {
      const k = matchKey(m);
      positions++;
      const c = seen.get(k);
      if (c !== undefined) { seen.set(k, c + 1); repeats++; }
      else if (seen.size < KEY_CAP) seen.set(k, 1);
      applyMove(m, epsGreedyMove(brain, m, eps, rnd));
      if (m.over) { plies += m.plies; break; }
    }
  }
  return { positions, repeats, distinct: seen.size, rate: repeats / positions,
           plies: plies / matches };
}

/* the same measurement on one board, so the two numbers can sit side by
   side on the card */
function measureRecurrenceSingle(agent, games, rnd) {
  const seen = new Map();
  let positions = 0, repeats = 0;
  for (let g = 0; g < games; g++) {
    let code = 0;
    for (;;) {
      positions++;
      const c = seen.get(code);
      if (c !== undefined) { seen.set(code, c + 1); repeats++; } else seen.set(code, 1);
      code += TOMOVE[code] * POW3[OG.epsGreedyMove(agent, code, OG.epsilonAt(agent.games), rnd)];
      if (WINNER[code] !== 0 || NEMPTY[code] === 0) break;
    }
  }
  return { positions, repeats, distinct: seen.size, rate: repeats / positions };
}

/* ------------------------------------------------------------------ *
 * THE MEASUREMENT THE ACT IS BUILT ON
 *
 * The claim is that the per-board decomposition is blind to the two
 * things ultimate rules added. Claims like that are cheap, so this
 * measures them -- and it measures a control alongside, so a null
 * cannot pass for a finding.
 *
 *   boardWin   a legal move wins a small board, and does not end the
 *              match. Does it take it? This is the CONTROL: board wins
 *              are visible one board at a time, so a working agent
 *              takes nearly all of them, and a probe that could not see
 *              this one would prove nothing about the other two.
 *
 *   matchWin   a legal move wins a small board AND that board completes
 *              three in a row on the meta-grid, so the move wins the
 *              match outright. Does it take it? The decomposition
 *              scores this move exactly as it scores the control,
 *              because the picture inside the board is all it looks at.
 *              Split two ways, which is where the mechanism shows:
 *              ALONE, when the match-winning move is the only board win
 *              on offer, it takes it at the control rate -- it is
 *              taking a board win, and this one happens to end the
 *              match. RIVAL, when some other board win ties with it,
 *              it flips a coin between them, because to this memory the
 *              two moves are the same move.
 *
 *   gift       its move hands the opponent a board they can win
 *              immediately. Measured against the rate you would get by
 *              choosing uniformly among the same legal moves -- the
 *              same test the newborn one-board agent is held to in
 *              step 2. It lands slightly under chance, and the reason
 *              is worth stating rather than hiding: taking the square
 *              an opponent needs is a BLOCK, which is visible one board
 *              at a time, and a blocked board is no longer a gift. It
 *              gets that much for free and nothing else.
 *
 *   avoidable  of the gifts it did give, how many had an equally
 *              top-scoring non-gift sitting in the same tie set. Those
 *              are the ones where the table rated the two moves
 *              identically and a coin flip picked the bad one. This is
 *              the send being invisible, stated as a count.
 * ------------------------------------------------------------------ */

function measureBlindness(brain, matches, rnd, oppMove) {
  const opp = oppMove || ((m, mark, r) => randomMove(m, r));
  const out = {
    matches,
    boardWinChances: 0, boardWinTaken: 0,
    matchWinChances: 0, matchWinTaken: 0,
    aloneChances: 0, aloneTaken: 0,
    rivalChances: 0, rivalTaken: 0,
    giftTurns: 0, giftsGiven: 0, giftChance: 0, giftAvoidable: 0
  };
  for (let g = 0; g < matches; g++) {
    const m = newMatch(), seat = 1 + (g % 2);
    while (!m.over) {
      if (m.turn !== seat) { applyMove(m, opp(m, m.turn, rnd)); continue; }
      const moves = legalMoves(m);
      const mv = greedyMove(brain, m, rnd);

      const matchWins = moves.filter(x => winsMatch(m, x));
      const boardWins = moves.filter(x => winsBoard(m, x) && !winsMatch(m, x));
      if (matchWins.length) {
        const took = matchWins.indexOf(mv) >= 0;
        out.matchWinChances++;
        if (took) out.matchWinTaken++;
        if (boardWins.length) { out.rivalChances++; if (took) out.rivalTaken++; }
        else { out.aloneChances++; if (took) out.aloneTaken++; }
      } else if (boardWins.length) {
        out.boardWinChances++;
        if (boardWins.indexOf(mv) >= 0) out.boardWinTaken++;
      }

      /* Only ask about the gift where there is a choice to get wrong:
         if every legal move is a gift, or none is, nothing is revealed. */
      let gifts = 0;
      for (const x of moves) if (isGift(m, x)) gifts++;
      if (gifts > 0 && gifts < moves.length) {
        out.giftTurns++;
        out.giftChance += gifts / moves.length;
        if (isGift(m, mv)) {
          out.giftsGiven++;
          /* was an equally top-scoring move sitting there that would
             not have given it away? */
          if (policyMoves(brain, m).some(x => !isGift(m, x))) out.giftAvoidable++;
        }
      }
      applyMove(m, mv);
    }
  }
  out.boardWinRate = out.boardWinChances ? out.boardWinTaken / out.boardWinChances : 0;
  out.matchWinRate = out.matchWinChances ? out.matchWinTaken / out.matchWinChances : 0;
  out.aloneRate = out.aloneChances ? out.aloneTaken / out.aloneChances : 0;
  out.rivalRate = out.rivalChances ? out.rivalTaken / out.rivalChances : 0;
  out.giftRate = out.giftTurns ? out.giftsGiven / out.giftTurns : 0;
  out.giftChanceRate = out.giftTurns ? out.giftChance / out.giftTurns : 0;
  out.avoidableRate = out.giftsGiven ? out.giftAvoidable / out.giftsGiven : 0;
  return out;
}

/* ------------------------------------------------------------------ *
 * Opponents, for measurement only. The learner never reads either.
 * ------------------------------------------------------------------ */

const CELLW = c => (c === 4 ? 14 : (c === 0 || c === 2 || c === 6 || c === 8) ? 8 : 4);
/* how many meta-lines a board sits on: centre 4, corners 3, edges 2 */
const BOARDW = [3, 2, 3, 2, 4, 2, 3, 2, 3];

/* THE BOARD-LOCAL PLAYER. Written out the way somebody would explain
   tic-tac-toe to you, with no idea that this is ultimate tic-tac-toe:
   take a win, block a loss, otherwise prefer the middle. It reasons
   about the board in front of it and nothing else -- which is exactly
   the decomposition the learner uses, written by hand instead of
   learned. Racing the two therefore says something about the
   decomposition rather than about learning. */
function heuristicMove(m, mark, rnd) {
  const opp = mark === 1 ? 2 : 1;
  const moves = legalMoves(m);
  for (const who of [mark, opp]) {
    for (const mv of moves) {
      const b = (mv / 9) | 0;
      if (WINNER[m.b[b] + who * POW3[mv % 9]] === who) return mv;
    }
  }
  let best = -Infinity, bestMove = -1;
  for (const mv of moves) {
    const b = (mv / 9) | 0, c = mv % 9, off = m.b[b] * 9;
    let score = CELLW(c);
    for (const L of LINES) {
      if (L.indexOf(c) < 0) continue;
      let mine = 0, theirs = 0;
      for (const i of L) {
        const v = CELLS[off + i];
        if (v === mark) mine++; else if (v === opp) theirs++;
      }
      if (theirs === 0) score += 5 + mine * 10;
      if (mine === 0) score += theirs * 6;
    }
    if (score > best) { best = score; bestMove = mv; }
  }
  return bestMove < 0 ? moves[(rnd() * moves.length) | 0] : bestMove;
}

/* THE SAME PLAYER, PLUS THE TWO THINGS ULTIMATE RULES ADDED. Identical
   board-local reasoning, and then: win the match if you can, refuse to
   hand the opponent a board they can win, and weigh a board by how many
   meta-lines it sits on. Three more clauses, all of them things a person
   can write down in an afternoon -- and all three are things the
   learner's memory has no slot for. It is here so the gap has a number
   attached rather than an adjective. */
function sendAwareMove(m, mark, rnd) {
  const opp = mark === 1 ? 2 : 1;
  const moves = legalMoves(m);
  for (const mv of moves) if (winsMatch(m, mv)) return mv;

  let best = -Infinity, bestMove = -1;
  for (const mv of moves) {
    const b = (mv / 9) | 0, c = mv % 9, off = m.b[b] * 9;
    let score = CELLW(c) + 4 * BOARDW[b];
    for (const L of LINES) {
      if (L.indexOf(c) < 0) continue;
      let mine = 0, theirs = 0;
      for (const i of L) {
        const v = CELLS[off + i];
        if (v === mark) mine++; else if (v === opp) theirs++;
      }
      if (theirs === 0) score += 5 + mine * 10;
      if (mine === 0) score += theirs * 6;
    }
    if (WINNER[m.b[b] + mark * POW3[c]] === mark) score += 40 + 12 * BOARDW[b];
    if (winningCells(m.b[b], opp).indexOf(c) >= 0) score += 30 + 10 * BOARDW[b];
    if (isGift(m, mv)) score -= 120;
    if (score > best) { best = score; bestMove = mv; }
  }
  return bestMove < 0 ? moves[(rnd() * moves.length) | 0] : bestMove;
}

/* result from the brain's point of view: 1 win, 0 draw, -1 loss */
function playAgainst(brain, oppMove, rnd, brainMark) {
  const m = newMatch();
  for (;;) {
    const mv = (m.turn === brainMark) ? greedyMove(brain, m, rnd)
                                      : oppMove(m, m.turn, rnd);
    applyMove(m, mv);
    if (m.over) {
      if (m.winner === 3) return 0;
      return m.winner === brainMark ? 1 : -1;
    }
  }
}

function scoreVs(brain, oppMove, matches, rnd, brainMark) {
  let w = 0, l = 0, d = 0;
  for (let i = 0; i < matches; i++) {
    const mark = brainMark || (1 + (i % 2));
    const r = playAgainst(brain, oppMove, rnd, mark);
    if (r > 0) w++; else if (r < 0) l++; else d++;
  }
  return { wins: w, losses: l, draws: d, matches, winRate: w / matches, lossRate: l / matches };
}

const randomOpponent = (m, mark, rnd) => randomMove(m, rnd);
const vsRandom    = (brain, n, rnd, mark) => scoreVs(brain, randomOpponent, n, rnd, mark);
const vsHeuristic = (brain, n, rnd, mark) => scoreVs(brain, heuristicMove, n, rnd, mark);
const vsSendAware = (brain, n, rnd, mark) => scoreVs(brain, sendAwareMove, n, rnd, mark);

/* two hand-written players against each other, so the send-aware
   clauses can be priced on their own */
function scoreHeadToHead(a, b, matches, rnd) {
  let aw = 0, bw = 0, d = 0;
  for (let i = 0; i < matches; i++) {
    const aMark = 1 + (i % 2);
    const m = newMatch();
    while (!m.over) applyMove(m, (m.turn === aMark ? a : b)(m, m.turn, rnd));
    if (m.winner === 3) d++; else if (m.winner === aMark) aw++; else bw++;
  }
  return { a: aw, b: bw, draws: d, matches };
}

/* ------------------------------------------------------------------ *
 * THE SIZE OF THE THING
 *
 * Worked out here, once, so the page, the README and the test suite all
 * quote the same arithmetic instead of three copies of a number.
 *
 * A small-board picture can occur inside an ultimate match if and only
 * if the board was still open when the last mark landed on it. So:
 * either nobody has a line, or exactly one player does AND at least one
 * of that player's marks can be lifted to leave a board with no line at
 * all. Everything else -- both players aligned, or a line plus extra
 * marks that could only have been played after the board closed -- is
 * unreachable.
 * ------------------------------------------------------------------ */

function pictureIsReachable(code) {
  const w = WINNER[code];
  if (w === 0) return true;             /* no line: open, or a full draw */
  if (w === 3) return false;            /* both players aligned: impossible */
  const off = code * 9;
  for (let c = 0; c < 9; c++) {
    if (CELLS[off + c] !== w) continue;
    if (WINNER[code - w * POW3[c]] === 0) return true;   /* this mark closed it */
  }
  return false;
}

/* the eight symmetries of a square, as cell permutations */
const SYMMETRIES = (function () {
  const out = [];
  for (const flip of [0, 1]) for (let rot = 0; rot < 4; rot++) {
    const p = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      let rr = r, cc = c;
      if (flip) cc = 2 - cc;
      for (let k = 0; k < rot; k++) { const t = rr; rr = cc; cc = 2 - t; }
      p[r * 3 + c] = rr * 3 + cc;
    }
    out.push(p);
  }
  return out;
})();

const SPACE = (function () {
  const ok = new Uint8Array(NCODE);
  let pictures = 0;
  for (let c = 0; c < NCODE; c++) if (pictureIsReachable(c)) { ok[c] = 1; pictures++; }

  const canon = new Set();
  for (let c = 0; c < NCODE; c++) {
    if (!ok[c]) continue;
    const off = c * 9;
    let best = Infinity;
    for (const p of SYMMETRIES) {
      let q = 0;
      for (let i = 0; i < 9; i++) q += CELLS[off + i] * POW3[p[i]];
      if (q < best) best = q;
    }
    canon.add(best);
  }

  /* The upper bound. Nine pictures, times where you were sent (one of
     the nine boards, or "anywhere"), divided by the one symmetry that
     survives -- rotating or reflecting the WHOLE 9x9 at once.

     Whose turn it is needs no factor of its own: the marks already say,
     because they strictly alternate across the whole grid. And dividing
     by eight is the MOST that symmetry can ever buy, since a symmetric
     position has fewer than eight images -- so the division is generous
     rather than sly. The result is still an over-count, because it
     counts nine-picture combinations no single game could produce. */
  const per = BigInt(pictures);
  const combos = per ** 9n;
  const bound = combos * BigInt(10) / BigInt(8);
  const raw = BigInt(3) ** BigInt(81);

  /* a billion positions a second, ever since the big bang */
  const secondsSinceBigBang = 13.8e9 * 365.25 * 24 * 3600;
  const countable = secondsSinceBigBang * 1e9;

  return {
    pictures, picturesTotal: NCODE,
    classes: canon.size,
    sendStates: 10, symmetry: 8,
    slots: pictures * 2,              /* table entries this game can use */
    combos: Number(combos),
    bound: Number(bound),
    raw81: Number(raw),
    boundOverRaw: Number(bound) / Number(raw),
    countable,
    timesCountable: Number(bound) / countable,
    isReachable: c => ok[c] === 1
  };
})();

/* Ordinary tic-tac-toe, for the row above it on the card: every
   complete game, counted by walking all of them -- which is the point,
   since this is the scale at which "check every one" is a method. */
const SMALLGAMES = (function () {
  let games = 0;
  (function walk(code) {
    if (WINNER[code] !== 0 || NEMPTY[code] === 0) { games++; return; }
    const mv = TOMOVE[code];
    for (let i = 0; i < 9; i++) if (CELLS[code * 9 + i] === 0) walk(code + mv * POW3[i]);
  })(0);
  return games;
})();

/* The published result, quoted where the app would otherwise print a
   proof banner. Checked against the paper itself rather than a summary
   of it -- including the part that does not quite fit. */
const SOLVED = {
  authors: 'Bertholon, Géraud-Stewart, Kugelmann, Lenoir and Naccache',
  title: 'At Most 43 Moves, At Least 29: Optimal Strategies and Bounds for Ultimate Tic-Tac-Toe',
  ref: 'arXiv:2006.02353',
  year: 2020,
  atMost: 43,
  atLeast: 29,
  /* The paper frees your choice only when the sent-to field is FULL: a
     field that has been WON but still has empty squares must be played
     in, to no effect. This demo uses the commoner convention, where a
     won board frees you too. Near neighbours, not the same game, and
     the page says so rather than overclaiming the theorem. */
  variant: 'you are freed only when the board you are sent to is FULL, and a board ' +
           'that has been won but still has empty squares must be played in anyway'
};

/* ------------------------------------------------------------------ */

return {
  BOARDS, ANYWHERE, HPU, SPACE, SMALLGAMES, SOLVED, SYMMETRIES,
  newMatch, cloneMatch, applyMove, legalMoves, tally, boardOutcome,
  metaCode, metaLineOf, matchKey, winningCells, winsMatch, winsBoard, isGift,
  newBrain, cloneBrain, seedFromAgent, moveValue, policyMoves, greedyMove,
  epsGreedyMove, exploreMove, randomMove, blindFraction, isImpossibleAlone,
  epsilonAt, ui, pictureIsReachable,
  trainMatches, playMatch, backup, reward,
  measureRecurrence, measureRecurrenceSingle, measureBlindness,
  heuristicMove, sendAwareMove, playAgainst, scoreVs, scoreHeadToHead,
  vsRandom, vsHeuristic, vsSendAware
};
})(typeof OG !== 'undefined' ? OG : require('./engine.js'));

if (typeof module !== 'undefined' && module.exports) module.exports = ULT;
