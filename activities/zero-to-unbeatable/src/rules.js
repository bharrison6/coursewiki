/* =====================================================================
   Zero to Unbeatable — Step 1: the hand-written rules

   This file is the opposite of engine.js in every way that matters, and
   that contrast is the point of the first step of the demo.

   engine.js contains no tic-tac-toe knowledge at all. It has a table of
   numbers and a rule for changing them, and the skill appears out of
   twenty thousand games. This file contains nothing BUT tic-tac-toe
   knowledge, all of it written down in advance by a person, and it has
   played zero games. It is an if/else ladder, checked in order, first
   match wins:

     1  Win              a line with two of mine and an empty third
     2  Block            a line with two of yours and an empty third
     3  Fork             a square that makes two threats at once
     4  Block the fork   deny you the same, by taking the square or by
                         making a threat you are forced to answer
     5  Centre           the square on four lines
     6  Opposite corner  you are in a corner, take the one across
     7  Empty corner     three lines each
     8  Empty side       whatever is left

   That ladder is Newell and Simon's, from their 1972 tic-tac-toe
   program, and versions of it have been retyped into introductory
   programming courses ever since. Most people would call it AI. It is
   worth being blunt that for a board this small it is also the BETTER
   piece of engineering: it is two hundred lines instead of a table of
   19,683 numbers, it answers instantly, it needs no training run, and
   you can read it and check it. Learning earns its keep when nobody can
   write the rules down -- not here.

   Two things this file must provide that a plain rule bot would not:

   WHY.  Every decision comes back with the rule that fired and the
   squares that triggered it, so the app can say "Rule 2 - Block: you had
   two in the top row" instead of just moving. The logic being visible is
   the whole request.

   A DEPTH DIAL.  Run only the first N rules and the rest are switched
   off. Two rules -- win and block -- is what most people write first,
   and it loses. Eight cannot be beaten. Both claims are checked by the
   same exhaustive search that checks the learned agent, in
   OG.verifyPolicy, because a demo that proves one side and asserts the
   other is not making the comparison it says it is.

   Ties inside a rule (two free corners, say) are broken by coin flip
   from a seeded stream, exactly as the learned agent breaks ties, so a
   rehearsed run reproduces. The verifier branches over the whole tie
   set rather than one pick, so the proof covers every flip.
   ===================================================================== */

const RULES = (function (OG) {
'use strict';

const { LINES, POW3, WINNER, TOMOVE, legalList, child, cellsOf, NCODE } = OG;

/* Prepositional forms, because these end up mid-sentence: "it answered
   in the top left", "a threat in the centre". app.js keeps a terser set
   for aria labels, where a bare noun reads better. */
const SQUARE = ['the top left', 'the top middle', 'the top right',
                'the middle left', 'the centre', 'the middle right',
                'the bottom left', 'the bottom middle', 'the bottom right'];

/* Indexed to match OG.LINES exactly. */
const LINE_NAME = ['the top row', 'the middle row', 'the bottom row',
                   'the left column', 'the middle column', 'the right column',
                   'the top-left diagonal', 'the top-right diagonal'];

const CORNERS  = [0, 2, 6, 8];
const SIDES    = [1, 3, 5, 7];
const OPPOSITE = { 0: 8, 2: 6, 6: 2, 8: 0 };

/* The ladder, as it is evaluated and as the panel lists it. `gist` is
   what appears beside the rule number when it has not fired. */
const LADDER = [
  { id: 1, name: 'Win',             gist: 'two of mine and an empty third — take it' },
  { id: 2, name: 'Block',           gist: 'two of yours and an empty third — take it' },
  { id: 3, name: 'Fork',            gist: 'a square that makes two threats at once' },
  { id: 4, name: 'Block the fork',  gist: 'stop you doing the same' },
  { id: 5, name: 'Centre',          gist: 'the square that sits on four lines' },
  { id: 6, name: 'Opposite corner', gist: 'you took a corner — take the one across' },
  { id: 7, name: 'Empty corner',    gist: 'any free corner; three lines each' },
  { id: 8, name: 'Empty side',      gist: 'whatever is left' }
];

/* The depth presets offered in the app. Two is what a person writes
   first; four adds the forks and is still beatable; eight is the whole
   ladder. */
const DEPTHS = [
  { n: 2, label: 'First 2', title: 'Win and block only' },
  { n: 4, label: 'First 4', title: 'Win, block, fork, block the fork' },
  { n: 8, label: 'All 8',   title: 'The whole ladder' }
];
/* The app OPENS on two rules, not eight: stage 1a's Predict card asks
   whether the learner can beat the First 2 rules, so the opponent they are
   handed first has to be that one. Every engine caller passes its depth
   explicitly; this default only decides the opening state of the UI. */
const DEFAULT_DEPTH = 2;

/* ------------------------------------------------------------------ *
 * Reading a board
 * ------------------------------------------------------------------ */

/* Every square that would complete a line for `mark` right now, with
   the line it completes. */
function winningCells(code, mark) {
  const cells = cellsOf(code), out = [];
  for (let L = 0; L < 8; L++) {
    let mine = 0, empty = -1, blocked = false;
    for (const i of LINES[L]) {
      const v = cells[i];
      if (v === mark) mine++;
      else if (v === 0) empty = i;
      else blocked = true;
    }
    if (!blocked && mine === 2 && empty >= 0) out.push({ cell: empty, line: L });
  }
  return out;
}

/* Squares where `mark` would come away with two winning replies at
   once. A square that simply wins is rule 1's business, not a fork.
 *
 * The threats have to be on two DIFFERENT squares. Two lines can both
 * be waiting on the same square -- a corner reply to an opposite-corner
 * opening does exactly that -- and one block kills both, so counting
 * lines instead of squares invents forks that are not there. The
 * exhaustive search caught this: it made the ladder refuse the only
 * moves that save the double-corner position, and the eight-rule bot
 * lost as second player. */
function forkCells(code, mark) {
  const out = [];
  for (const m of legalList(code)) {
    const after = child(code, m, mark);
    if (WINNER[after] === mark) continue;
    const threats = threatSquares(after, mark);
    if (threats.length >= 2) out.push({ cell: m, threats });
  }
  return out;
}

function threatSquares(code, mark) {
  return Array.from(new Set(winningCells(code, mark).map(x => x.cell)));
}

/* ------------------------------------------------------------------ *
 * The ladder
 * ------------------------------------------------------------------ */

/* Returns { ruleId, options }, where every option is a square the rule
   would accept, carrying whatever triggered it. ruleId 0 means the
   ladder ran out -- only reachable when the depth dial has switched the
   lower rules off, because rules 5 to 8 between them cover every square
   on the board. */
function decideUncached(code, depth) {
  const mine = TOMOVE[code], theirs = mine === 1 ? 2 : 1;
  const cells = cellsOf(code);
  const empty = legalList(code);
  if (!empty.length) return null;

  /* 1 — win */
  if (depth >= 1) {
    const w = winningCells(code, mine);
    if (w.length) return { ruleId: 1, options: w.map(o => ({ cell: o.cell, line: o.line })) };
  }

  /* 2 — block */
  if (depth >= 2) {
    const b = winningCells(code, theirs);
    if (b.length) return { ruleId: 2, options: b.map(o => ({ cell: o.cell, line: o.line })) };
  }

  /* 3 — fork */
  if (depth >= 3) {
    const f = forkCells(code, mine);
    if (f.length) return { ruleId: 3, options: f.map(o => ({ cell: o.cell, threats: o.threats })) };
  }

  /* 4 — block the fork.
     One fork square: stand on it. Two or more and standing on one is no
     use, so force instead — make a threat of your own that has to be
     answered, and check that the square they are forced onto is not
     itself their fork. That second clause is the whole difficulty of
     rule 4 and the reason the double-corner opening is answered on an
     edge rather than a corner. */
  if (depth >= 4) {
    const theirForks = forkCells(code, theirs);
    if (theirForks.length === 1) {
      return { ruleId: 4, how: 'take',
               options: [{ cell: theirForks[0].cell, threats: theirForks[0].threats }] };
    }
    if (theirForks.length > 1) {
      const forcing = [];
      for (const m of empty) {
        const after = child(code, m, mine);
        if (WINNER[after] === mine) continue;          // rule 1 handled that
        const t = winningCells(after, mine);
        if (t.length !== 1) continue;                  // no threat, or a fork (rule 3)
        const replied = child(after, t[0].cell, theirs);
        if (WINNER[replied] === theirs) continue;      // the block wins it for them
        /* The one condition that matters: the square they are forced
           onto must not be a forking square for them. Their block may
           perfectly well leave them ONE threat -- that just gets
           blocked in turn by rule 2 next time round. Rejecting that
           case too is the difference between a ladder that draws the
           double-corner opening and one that loses it. */
        if (threatSquares(replied, theirs).length >= 2) continue;
        forcing.push({ cell: m, threat: t[0].cell, line: t[0].line });
      }
      if (forcing.length) return { ruleId: 4, how: 'force', options: forcing };
      /* Nothing forces cleanly: take a fork square and make them find
         the other one. Never reached at full depth on a legal board;
         kept because a rule ladder with a hole in it is not a ladder. */
      return { ruleId: 4, how: 'take',
               options: theirForks.map(o => ({ cell: o.cell, threats: o.threats })) };
    }
  }

  /* 5 — centre */
  if (depth >= 5 && cells[4] === 0) return { ruleId: 5, options: [{ cell: 4 }] };

  /* 6 — opposite corner */
  if (depth >= 6) {
    const o = CORNERS.filter(c => cells[c] === theirs && cells[OPPOSITE[c]] === 0)
                     .map(c => ({ cell: OPPOSITE[c], from: c }));
    if (o.length) return { ruleId: 6, options: o };
  }

  /* 7 — empty corner */
  if (depth >= 7) {
    const o = CORNERS.filter(c => cells[c] === 0).map(c => ({ cell: c }));
    if (o.length) return { ruleId: 7, options: o };
  }

  /* 8 — empty side */
  if (depth >= 8) {
    const o = SIDES.filter(c => cells[c] === 0).map(c => ({ cell: c }));
    if (o.length) return { ruleId: 8, options: o };
  }

  /* 0 — off the end of a shortened ladder. The author did not write a
     rule for this position, so there is nothing to consult. */
  return { ruleId: 0, options: empty.map(c => ({ cell: c })) };
}

/* decide() is pure, and the exhaustive search calls it tens of
   thousands of times, so the answers are kept. Keyed by depth and
   position; cleared by nothing, because nothing changes. */
const _cache = new Map();
function decide(code, depth) {
  depth = depth == null ? DEFAULT_DEPTH : depth;
  const k = depth * NCODE + code;
  let d = _cache.get(k);
  if (d === undefined) { d = decideUncached(code, depth); _cache.set(k, d); }
  return d;
}

/* Every square this ladder might play here — the rule-bot counterpart
   of OG.argmaxMoves, and what the verifier branches over. */
function moves(code, depth) {
  const d = decide(code, depth);
  return d ? d.options.map(o => o.cell) : [];
}

/* One move, with its justification. The seeded stream breaks ties. */
function move(code, depth, rnd) {
  const d = decide(code, depth);
  if (!d) return null;
  const opt = d.options[((rnd ? rnd() : Math.random()) * d.options.length) | 0];
  return {
    move: opt.cell,
    ruleId: d.ruleId,
    rule: d.ruleId ? LADDER[d.ruleId - 1] : null,
    why: explain(code, d, opt, depth),
    cells: triggerCells(d, opt)
  };
}

/* The squares to light up on the board as the reason. */
function triggerCells(d, opt) {
  switch (d.ruleId) {
    case 1: case 2: return LINES[opt.line].slice();
    case 3: return opt.threats.slice();
    case 4: return d.how === 'force' ? [opt.threat] : opt.threats.slice();
    case 6: return [opt.from];
    default: return [];
  }
}

/* One sentence, second person, naming the squares. Kept short on
   purpose: this reads under the board on a phone, and a five-line
   explanation would push the board off the top of the screen. */
function explain(code, d, opt, depth) {
  const list = cs => cs.map(c => SQUARE[c]).join(' and ');
  switch (d.ruleId) {
    case 1:
      return `It had two in ${LINE_NAME[opt.line]} and the third square was free.`;
    case 2:
      return `You had two in ${LINE_NAME[opt.line]}, so it took the third square.`;
    case 3:
      return `That gives it two ways to win at once — ${list(opt.threats)}. You can only block one.`;
    case 4:
      return d.how === 'force'
        ? `You had two different forking squares and it cannot stand on both, so it made a threat ` +
          `of its own at ${SQUARE[opt.threat]}. Answer that first.`
        : `That was the square that would have given you two threats at once. It stood on it.`;
    case 5:
      return `Nothing urgent, so it took the middle — the only square on four lines.`;
    case 6:
      return `You are in ${SQUARE[opt.from]}, so it answered in the corner straight across.`;
    case 7:
      return `Nothing urgent, so it took a free corner: three lines each, against two for a side.`;
    case 8:
      return `No corner left, so it took a side.`;
    default:
      return `Nothing in the ladder covers this — rules ${depth + 1} to 8 are switched off, ` +
             `so it picked a free square.`;
  }
}

/* Playable as an opponent, same shape as OG.greedyMove / OG.naiveMove:
   a code and a stream in, a square out. */
function ruleMove(code, rnd, depth) {
  const r = move(code, depth, rnd);
  return r ? r.move : -1;
}

/* ------------------------------------------------------------------ *
 * Proof — the same search, run on the other kind of player
 *
 * OG.verifyPolicy takes a policy, not an agent, precisely so this can
 * happen. Same tree, same branching over the opponent's every legal
 * move and over this player's every tie-break, same words in the
 * banner. The only difference is where the policy came from.
 *
 * bestWinChance is added because "a losing line exists" is a weak thing
 * to say about a bot that also flips coins: it is true of a player who
 * loses one game in a thousand. The exact figure separates "beatable in
 * principle" from "the room will beat it".
 * ------------------------------------------------------------------ */

/* A representative game the ladder loses, read off the same table that
   produced the percentage: the challenger plays its best square, and at
   the bot's turns the branch that keeps the challenger's chances
   highest -- which is the way it typically goes wrong, not whichever
   losing leaf a depth-first search happened to reach first. Those two
   are very different games: the first one the search finds needs the
   bot to flip four particular coins in a row.

   `prob` is how often this exact game occurs if the challenger plays
   this way, so the screen can be honest that a shortened ladder still
   flips coins and no single sequence is a guarantee. */
function losingGame(depth, botMark) {
  const mv = code => moves(code, depth);
  const wc = OG.winChance(mv, botMark);
  if (wc.root <= 0) return null;
  const you = botMark === 1 ? 2 : 1;
  const plies = [];
  let code = 0, prob = 1;

  while (!OG.isTerminal(code)) {
    const mover = OG.TOMOVE[code];
    const opts = mover === you ? OG.legalList(code) : mv(code);
    let pick = opts[0], bestP = -1;
    for (const m of opts) {
      const q = wc.at(OG.child(code, m, mover));
      if (q > bestP) { bestP = q; pick = m; }
    }
    const d = mover === botMark ? decide(code, depth) : null;
    code = OG.child(code, pick, mover);
    if (mover === botMark) prob /= opts.length;
    plies.push({
      cell: pick, mark: mover, bot: mover === botMark,
      ruleId: d ? d.ruleId : null, choices: opts.length,
      /* did that move leave two threats the bot has no rule for? */
      forks: mover === you && threatSquares(code, you).length >= 2
    });
  }
  return { plies, prob, chance: wc.root, botWon: OG.WINNER[code] === botMark };
}

const _reports = new Map();
function report(depth) {
  depth = depth == null ? DEFAULT_DEPTH : depth;
  if (_reports.has(depth)) return _reports.get(depth);
  const mv = code => moves(code, depth);
  const v = OG.verifyPolicy(mv);
  const r = {
    depth,
    safe: v.safe, asFirst: v.asFirst, asSecond: v.asSecond,
    lines: v.lines, positions: v.positions,
    /* how often a challenger playing perfectly actually wins, exactly */
    beatsFirst:  OG.bestWinChance(mv, 1),
    beatsSecond: OG.bestWinChance(mv, 2),
    /* a game it loses, to show rather than assert */
    gameFirst:  v.asFirst.safe  ? null : losingGame(depth, 1),
    gameSecond: v.asSecond.safe ? null : losingGame(depth, 2)
  };
  _reports.set(depth, r);
  return r;
}

/* ------------------------------------------------------------------ */

return {
  LADDER, DEPTHS, DEFAULT_DEPTH, SQUARE, LINE_NAME, CORNERS, SIDES, OPPOSITE,
  winningCells, forkCells,
  decide, moves, move, ruleMove, triggerCells, explain, threatSquares,
  report, losingGame
};
})(typeof OG !== 'undefined' ? OG : require('./engine.js'));

if (typeof module !== 'undefined' && module.exports) module.exports = RULES;
