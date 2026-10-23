/* =====================================================================
   Zero to Unbeatable — user interface

   Owns: the game you play, the training montage, the era ledger, the
   brain inspector, the two map stages (1d and Model types), and the
   demo's half of the lesson shell's contract — the `stagechange` and
   `lessonreset` listeners at the bottom. All of the learning lives in
   engine.js; nothing in this file touches the value table except to
   read it for display. The shell (../tools/lesson-shell, injected before
   this file) owns the header, the stage tablist, the dialogs, the check
   cards and Reset's kit-owned half; nothing here shows or hides a stage.
   ===================================================================== */

(function () {
'use strict';

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const MARK = ['', '✕', '◯'];              // ✕ and ◯
const CELLNAME = ['top left', 'top middle', 'top right',
                  'middle left', 'the centre', 'middle right',
                  'bottom left', 'bottom middle', 'bottom right'];

const S = {
  /* Step 1 'rules', step 2 'one' board, step 3 'ult' — ultimate
     tic-tac-toe. The app opens on the rules so the arc reads left to
     right: a thing a person wrote, then a thing that wrote itself, then
     a world where neither writing it nor checking it is on offer. */
  mode: 'rules',
  stage: 0,            // the shell's stage index; 0-2 host the board, 3 and 4 are maps
  predictions: {},     // Predict-card answers by key: rules, one, net (1d and Model types have no Predict: they are maps)
  resetting: false,    // true only between onReset() and the lessonreset handler
  method: null,        // stage 1d: the training-method card that is pressed
  family: null,        // stage 1d: the architecture-family card that is pressed
  half: 'methods',     // stage 1d: which of its three parts is showing
  nochange: null,      // stage 1d: the no-weight-change card that is pressed
  depth: RULES.DEFAULT_DEPTH,   // how many of the eight rules are switched on
  ruleRec: {},         // depth -> your record against that ladder
  ruleCounts: {},      // depth -> how many moves each rule decided
  lastRule: null,      // the decision behind the move it just made
  live: null,          // the one-board agent that keeps training
  liveU: null,         // step 3's brain: one number per board picture and turn
  neural: null,        // frozen table teacher plus a separate shared-weight model
  teacherSession: null,
  neuralRun: 0,        // reset invalidates asynchronous work from an older lesson
  neuralRec: { w: 0, l: 0, d: 0 },
  neuralBurst: 50000,
  cancelTraining: false,
  eras: [],            // frozen snapshots, index === era number
  era: 0,              // which one you are playing
  game: null,          // one-board game in progress
  match: null,         // ultimate match in progress
  focus: 0,            // the board shown full size: the one you were sent
                       // to, or the one you picked when the send freed you
  burst: OG.HP.burst,
  burstU: ULT.HPU.burst,
  brain: false,
  seed: '',
  // These streams deliberately never share state.  A reader (the report) or
  // a player must not be able to alter the next training example.
  rng: Math.random,              // training only
  liveRng: { rules: Math.random, one: Math.random, ult: Math.random }, // independent playable-game streams
  measureSalt: '',               // immutable for one reset/session
  humanFirstNext: true,
  alwaysFirst: false,
  training: false,
  lastLearned: null
};
const isUlt   = () => S.mode === 'ult';
const isRules = () => S.mode === 'rules';
const isNet   = () => S.mode === 'net';

function ultimateReportAvailable() {
  return UI_STATE.canOpenUltimateLearnedReport(S);
}

const fmt = n => n.toLocaleString('en-US');
/* compact so an era label still fits a projector-sized dropdown */
const fmtk = n => n >= 1000 ? (n / 1000).toFixed(n % 1000 && n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k' : String(n);
const sgn = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);

/* A value in [-1,1] as a colour, staying inside the Murray State palette:
   red-orange for losing, brand navy for even, gold for winning. Warm
   hues at both ends are hard to tell apart with some kinds of colour
   blindness, so every heat square also prints its signed number and the
   ink flips to navy on the light end to keep that number legible. */
const HEAT_LOSE = [255, 69, 0];     /* #FF4500 */
const HEAT_EVEN = [10, 49, 97];     /* #0A3161 */
const HEAT_WIN  = [236, 172, 0];    /* #ECAC00 */

function heatRGB(v) {
  const t = Math.max(-1, Math.min(1, v));
  const mix = (a, b, k) => a.map((x, i) => Math.round(x + (b[i] - x) * k));
  return t < 0 ? mix(HEAT_EVEN, HEAT_LOSE, -t) : mix(HEAT_EVEN, HEAT_WIN, t);
}
function heat(v) { const c = heatRGB(v); return `rgb(${c[0]},${c[1]},${c[2]})`; }
function heatInk(v) {
  const c = heatRGB(v);
  const lin = x => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  return L > 0.34 ? '#00142B' : '#F3F7FF';
}

/* ------------------------------------------------------------------ *
 * Eras
 * ------------------------------------------------------------------ */

function snapshotLandmarks(agent) {
  return OG.LANDMARKS.map(L => ({
    id: L.id,
    values: OG.moveValues(agent, L.code)
  }));
}

/* How many positions would this agent now play differently from the
   last one? A number that keeps moving after the landmark cards have
   gone quiet -- which is itself the point being made. */
function policyDiff(a, b) {
  let n = 0;
  for (let i = 0; i < OG.OPEN_POSITIONS.length; i++) {
    const c = OG.OPEN_POSITIONS[i];
    const x = OG.argmaxMoves(a, c).join(','), y = OG.argmaxMoves(b, c).join(',');
    if (x !== y) n++;
  }
  return n;
}

function makeEra(n, agent, prevAgent, mix, kind, ultStats) {
  const verified = OG.verifyUnbeatable(agent);
  const e = {
    n, agent, brain: ULT.cloneBrain(S.liveU),
    kind: kind || 'one',
    games: agent.games, seen: agent.seen,
    matches: S.liveU.matches, seenU: S.liveU.seen, seededU: S.liveU.seeded,
    eps: OG.epsilonAt(agent.games), epsU: ULT.epsilonAt(S.liveU.matches),
    verified, mix: mix || null, ult: ultStats || null,
    landmarks: snapshotLandmarks(agent),
    changed: prevAgent ? policyDiff(prevAgent, agent) : null,
    rec: { w: 0, l: 0, d: 0 },
    recU: { w: 0, l: 0, d: 0 }
  };
  console.log(
    `[Zero to Unbeatable] Era ${n} — ${fmt(e.games)} training games, ${fmt(e.seen)} positions seen.\n` +
    `           Exhaustive check, agent moving first:  ${verified.asFirst.safe ? 'no losing line exists' : 'A LOSING LINE EXISTS'}` +
    ` (${fmt(verified.asFirst.lines)} lines, ${fmt(verified.asFirst.positions)} positions)\n` +
    `           Exhaustive check, agent moving second: ${verified.asSecond.safe ? 'no losing line exists' : 'A LOSING LINE EXISTS'}` +
    ` (${fmt(verified.asSecond.lines)} lines, ${fmt(verified.asSecond.positions)} positions)\n` +
    `           VERDICT: ${verified.safe ? 'UNBEATABLE — zero losses across every reachable line, both roles.'
                                          : 'still beatable.'}`);
  return e;
}

function currentEra() { return UI_STATE.selectedEra(S); }

function resetAll(resetStage) {
  S.neuralRun++;
  S.training = false;
  $('#montage').hidden = true;
  S.rng = OG.makeRng(S.seed || null);
  /* Keep one-board and ultimate play in distinct streams.  Switching
     modes must not make a prior one-board move alter a rehearsed ultimate
     reply (or vice versa).  A blank seed deliberately starts fresh streams. */
  const liveSeed = mode => S.seed
    ? 'live-play:' + S.seed + ':' + mode
    : 'live-play:' + Math.random().toString(36).slice(2) + ':' + mode;
  S.liveRng = {
    rules: OG.makeRng(liveSeed('rules')),
    one:   OG.makeRng(liveSeed('one')),
    ult:   OG.makeRng(liveSeed('ult'))
  };
  S.measureSalt = S.seed ? 'measure:' + S.seed : 'measure:' + Math.random().toString(36).slice(2);
  S.live = OG.newAgent();
  S.liveU = ULT.newBrain();
  S.neural = null;
  S.teacherSession = null;
  S.neuralRec = { w: 0, l: 0, d: 0 };
  S.cancelTraining = true;
  S.eras = [makeEra(0, OG.cloneAgent(S.live), null, null, 'one')];
  S.era = 0;
  S.humanFirstNext = true;
  S.lastLearned = null;
  S.lastRule = null;
  S.depth = RULES.DEFAULT_DEPTH;
  S.brain = false;
  $('#btn-brain').ariaPressed = 'false';
  $('#btn-brain').textContent = 'Show move scores';
  $('#brain-readout').hidden = true;
  $('#selftest-out').textContent = '';
  if (resetStage) {
    S.mode = 'rules';
    S.burst = OG.HP.burst;
    S.burstU = ULT.HPU.burst;
    S.neuralBurst = 50000;
  }
  S.match = null;
  S.focus = 0;
  S.ruleRec = {};
  S.ruleCounts = {};
  RULES.DEPTHS.forEach(d => resetRuleTally(d.n));
  $('#btn-learned').hidden = true;
  /* applyMode paints every panel the current step needs and starts the
     game, so a reset and a step change go through the same door. */
  applyMode();
}

/* Measurement is a pure reader.  Its seed is derived from a frozen era, not
   from S.rng, so reopening a card cannot perturb a later burst. */
function measureRng(era, label) {
  return OG.makeRng(S.measureSalt + ':' + era.n + ':' + era.games + ':' + era.matches + ':' + label);
}

/* Hand step 2's table over to step 3's brain. Done on entering the
   mode, and repeated on every entry until step 3 has actually trained,
   so the handover always reflects whatever step 2 knows by then. */
function maybeSeed() {
  if (S.liveU.matches > 0) return 0;
  S.liveU = ULT.newBrain();
  const n = ULT.seedFromAgent(S.liveU, S.live);
  S.eras.forEach(e => {
    if (e.brain.matches === 0) {
      e.brain = ULT.cloneBrain(S.liveU);
      e.seenU = S.liveU.seen; e.seededU = S.liveU.seeded;
    }
  });
  return n;
}

/* Step 1 keeps its own record and its own tally per ladder depth: a
   two-rule bot and an eight-rule bot are different opponents, and
   pooling their scores would hide exactly the thing the step is for. */
function resetRuleTally(depth) {
  S.ruleRec[depth] = { w: 0, l: 0, d: 0 };
  S.ruleCounts[depth] = new Array(9).fill(0);   // index 0 is "off the ladder"
}

function currentRec() {
  if (isRules()) return S.ruleRec[S.depth] || (resetRuleTally(S.depth), S.ruleRec[S.depth]);
  if (isNet()) return S.neuralRec;
  return isUlt() ? currentEra().recU : currentEra().rec;
}

/* What to call the thing you are playing, wherever the copy needs it. */
function oppLabel() { return isRules() ? 'The rules' : isNet() ? 'The network' : 'Era ' + S.era; }

/* ------------------------------------------------------------------ *
 * The game
 * ------------------------------------------------------------------ */

function newGame() {
  if (isUlt()) return newMatch();
  const humanFirst = S.alwaysFirst ? true : S.humanFirstNext;
  S.humanFirstNext = !humanFirst;
  S.game = {
    code: 0,
    humanMark: humanFirst ? 1 : 2,
    aiMark: humanFirst ? 2 : 1,
    over: false, result: null, lastCell: -1, winLine: null,
    thinking: false
  };
  S.lastRule = null;
  renderBoard();
  renderStatus();
  renderRuleFired();
  if (!humanFirst && (!isNet() || (S.neural && S.neural.model))) aiTurn(420);
}

function winningLine(code) {
  const w = OG.WINNER[code];
  if (!w) return null;
  const cells = OG.cellsOf(code);
  for (const L of OG.LINES) if (cells[L[0]] === w && cells[L[1]] === w && cells[L[2]] === w) return L;
  return null;
}

function applyMove(cell) {
  const g = S.game;
  const mover = OG.TOMOVE[g.code];
  g.code = OG.child(g.code, cell, mover);
  g.lastCell = cell;
  const w = OG.WINNER[g.code];
  if (w !== 0) {
    g.over = true;
    g.winLine = winningLine(g.code);
    g.result = (w === g.humanMark) ? 'win' : 'loss';
  } else if (OG.NEMPTY[g.code] === 0) {
    g.over = true;
    g.result = 'draw';
  }
  if (g.over) {
    const rec = currentRec();
    if (g.result === 'win') rec.w++; else if (g.result === 'loss') rec.l++; else rec.d++;
    renderScore();
    if (isRules() && S.depth === 2) {
      /* The fact is the search's: a two-rule ladder HAS losing lines in
         both roles. The learner's game either shows one or it does not;
         a draw or a loss is not evidence that two rules are enough. */
      revealPrediction('rules', 'yes', 'The exhaustive search finds losing lines for a two-rule ladder in both roles. ' +
        (g.result === 'win'
          ? 'You just played one of them: two rules can be beaten, and only a person adding rules would change that.'
          : 'Not this game — that is your play, not proof the ladder is safe. Open Details for the game that shows it, then try the fork.'),
        VERDICT_SEARCH);
    } else if (S.mode === 'one' && S.era === 1) {
      revealOne();
    }
  }
}

/* ------------------------------------------------------------------ *
 * Ultimate tic-tac-toe
 *
 * The one thing the UI has to get right here is the SEND: which board
 * you are allowed to play in was decided by the cell your opponent just
 * played. S.focus is the board on screen at full size — normally the
 * board you were sent to, and only your own choice when the send landed
 * on a finished board and freed you.
 * ------------------------------------------------------------------ */

function newMatch() {
  const humanFirst = S.alwaysFirst ? true : S.humanFirstNext;
  S.humanFirstNext = !humanFirst;
  S.match = ULT.newMatch();
  S.match.humanMark = humanFirst ? 1 : 2;
  S.focus = 4;                       /* free choice on move one; start in the middle */
  renderUlt(); renderStatus();
  if (!humanFirst) ultAiTurn(500);
}

function ultResult() {
  const m = S.match;
  if (!m.over) return null;
  if (m.winner === 3) return 'draw';
  return m.winner === m.humanMark ? 'win' : 'loss';
}

/* Are you free to choose a board, or were you sent to one? */
const freeChoice = m => m.send === ULT.ANYWHERE;

/* Where the full-size pane should point after a move. When the send
   names a board there is nothing to decide; when it frees you, keep
   whatever you were looking at if it is still playable. */
function pickFocus(m, prefer) {
  if (!freeChoice(m)) return m.send;
  if (m.r[prefer] === 0) return prefer;
  for (let i = 0; i < 9; i++) if (m.r[(prefer + i) % 9] === 0) return (prefer + i) % 9;
  return prefer;
}

function applyUlt(move) {
  const m = S.match;
  ULT.applyMove(m, move);
  S.focus = pickFocus(m, S.focus);
  if (m.over) {
    const rec = currentEra().recU, r = ultResult();
    if (r === 'win') rec.w++; else if (r === 'loss') rec.l++; else rec.d++;
    renderScore();
  }
}

function onUltCell(cell) {
  const m = S.match;
  if (!m || m.over || m.thinking || S.training) return;
  if (m.turn !== m.humanMark) return;
  if (m.r[S.focus] !== 0) return;
  /* belt and braces: the module owns the send rule, so ask it rather
     than re-deriving the answer here */
  if (ULT.legalMoves(m).indexOf(S.focus * 9 + cell) < 0) return;
  applyUlt(S.focus * 9 + cell);
  renderUlt(); renderStatus();
  if (!m.over) ultAiTurn(360);
}

function ultAiTurn(delay) {
  const m = S.match;
  m.thinking = true;
  renderUlt(); renderStatus();
  setTimeout(() => {
    if (!S.match || S.match !== m || m.over) return;
    applyUlt(ULT.greedyMove(currentEra().brain, m, S.liveRng.ult));
    m.thinking = false;
    renderUlt(); renderStatus();
  }, S.brain ? Math.max(delay, 1300) : delay);
}

function onCell(cell) {
  const g = S.game;
  if (!g || g.over || g.thinking || S.training) return;
  if (OG.TOMOVE[g.code] !== g.humanMark) return;
  if (OG.cellsOf(g.code)[cell] !== 0) return;
  /* The rule it last used stays on screen while you think about your
     reply -- that sentence is the thing a presenter points at, and
     blanking it the instant you tap is how you lose the room. */
  applyMove(cell);
  renderBoard(); renderStatus(); renderRuleFired();
  if (!g.over) aiTurn(340);
}

function aiTurn(delay) {
  const g = S.game;
  g.thinking = true;
  /* Paint before it moves: with the inspector on, this is the moment the
     heatmap shows ITS options rather than yours, so hold it long enough
     to be read. */
  renderBoard(); renderStatus();
  setTimeout(() => {
    if (!S.game || S.game !== g || g.over) return;
    let cell;
    if (isRules()) {
      /* The ladder returns the square AND the rule that chose it, which
         is the only reason step 1 can narrate itself. */
      const d = RULES.move(g.code, S.depth, S.liveRng.rules);
      S.lastRule = d;
      S.ruleCounts[S.depth][d.ruleId]++;
      cell = d.move;
    } else if (isNet() && S.neural && S.neural.model) {
      /* This is the crucial boundary: the player consults the network's
         weights through NET.greedyMove, never the frozen teacher table. */
      cell = NET.greedyMove(S.neural.model, g.code, S.liveRng.one);
    } else {
      cell = OG.greedyMove(currentEra().agent, g.code, S.liveRng.one);
    }
    applyMove(cell);
    g.thinking = false;
    renderBoard(); renderStatus(); renderRuleFired();
    if (isRules()) renderRulesPanel();
  }, S.brain ? Math.max(delay, 1250) : delay);
}

/* ------------------------------------------------------------------ *
 * Rendering — board
 * ------------------------------------------------------------------ */

const boardEl = $('#board');
for (let i = 0; i < 9; i++) {
  const b = document.createElement('button');
  b.className = 'cell'; b.dataset.i = i; b.setAttribute('role', 'gridcell');
  b.addEventListener('click', () => onCell(i));
  boardEl.appendChild(b);
}

function networkInputs(code) {
  const cells = OG.cellsOf(code), labels = [], states = ['empty', 'X', 'O'];
  for (let cell = 0; cell < 9; cell++) {
    for (let state = 0; state < 3; state++) {
      labels.push({ label: `${CELLNAME[cell]} = ${states[state]}`, active: cells[cell] === state });
    }
  }
  const turn = OG.TOMOVE[code];
  labels.push({ label: 'X to move', active: turn === 1 });
  labels.push({ label: 'O to move', active: turn === 2 });
  return labels;
}

function renderNetworkInspector() {
  const el = $('#network-view');
  el.hidden = !isNet();
  if (!isNet()) return;
  if (!S.neural || !S.neural.model) {
    NETWORK_VIEW.render(el, { net: null });
    return;
  }
  const code = S.game ? S.game.code : 0;
  NET.predict(S.neural.model, code); // refreshes forward-pass activation buffers; weights stay unchanged
  const marks = 9 - OG.NEMPTY[code];
  NETWORK_VIEW.render(el, {
    net: S.neural.model.net,
    initial: S.neural.initial,
    inputs: networkInputs(code),
    boardLabel: marks ? `the current game board after ${marks} move${marks === 1 ? '' : 's'}` : 'the current empty game board'
  });
}

function renderBoard() {
  const g = S.game, cells = OG.cellsOf(g.code);
  const agent = currentEra().agent;
  const neuralReady = !isNet() || !!(S.neural && S.neural.model);
  const showHeat = UI_STATE.canShowMoveScores(S);
  const vals = showHeat && isNet() && S.neural && S.neural.model
    ? OG.legalList(g.code).map(cell => ({ cell, value: NET.predict(S.neural.model, OG.child(g.code, cell, OG.TOMOVE[g.code])), visits: 0 }))
    : showHeat ? OG.moveValues(agent, g.code) : [];
  const picks = showHeat && isNet() && S.neural && S.neural.model
    ? NET.policyMoves(S.neural.model, g.code) : showHeat ? OG.argmaxMoves(agent, g.code) : [];
  const byCell = {}; vals.forEach(v => byCell[v.cell] = v);
  /* The squares that set the rule off — the two you already had in a row,
     the corner it answered. Marking them on the board is what turns
     "it played there" into "it played there because of this". They come
     off the board once you have replied, since they described the board
     as it was when the rule looked at it; the sentence underneath stays. */
  const freshRule = isRules() && S.lastRule && !g.over &&
                    g.lastCell >= 0 && cells[g.lastCell] === g.aiMark;
  const trig = freshRule ? S.lastRule.cells : [];

  $$('.cell', boardEl).forEach((el, i) => {
    const m = cells[i];
    el.className = 'cell' + (m ? ' mk' + m : ' open') +
      (g.lastCell === i && m ? ' last' : '') +
      (g.winLine && g.winLine.includes(i) ? ' win' : '') +
      (trig.includes(i) ? ' trig' : '') +
      (showHeat && !m ? ' heat' : '') +
      (showHeat && picks.includes(i) ? ' pick' : '');
    el.disabled = !!m || g.over || g.thinking || !neuralReady || OG.TOMOVE[g.code] !== g.humanMark;
    el.style.background = '';
    el.style.color = '';
    if (m) {
      el.textContent = MARK[m];
      el.setAttribute('aria-label', CELLNAME[i] + ', ' + (m === g.humanMark ? 'yours' : 'its'));
      return;
    }
    if (showHeat && byCell[i]) {
      const v = byCell[i];
      el.style.background = heat(v.value);
      el.style.color = heatInk(v.value);
      el.innerHTML = isNet()
        ? `<span class="v">${sgn(v.value)}</span>`
        : `<span class="v">${sgn(v.value)}</span><span class="n">seen ${fmt(v.visits)}×</span>`;
      el.setAttribute('aria-label', isNet()
        ? `${CELLNAME[i]}: network predicted score ${v.value.toFixed(2)}`
        : `${CELLNAME[i]}: learned score ${v.value.toFixed(2)}, seen ${v.visits} times`);
    } else {
      el.textContent = '';
      el.setAttribute('aria-label', CELLNAME[i] + ', empty');
    }
  });
  renderBrainReadout();
  renderNetworkInspector();
}

/* The meta-grid, plus the one board you are actually playing in.
 *
 * Eighty-one live cells on a phone would be 36px each and the forced
 * board would be a thin outline somewhere inside a wall of glyphs. Two
 * square panes instead: the meta-grid on the left, and the board you
 * were sent to at full size on the right, its squares as big as they
 * are in the one-board game. Ultimate rules make that split MORE
 * honest than it was for nine independent boards, because you do not
 * choose which board to play in — the pane is showing you the only
 * board you are allowed to touch. */
const ultMeta = $('#ult-meta'), ultFocus = $('#ult-focus');
for (let b = 0; b < 9; b++) {
  const mb = document.createElement('button');
  mb.className = 'mb'; mb.dataset.b = b; mb.type = 'button';
  for (let c = 0; c < 9; c++) { const i = document.createElement('i'); mb.appendChild(i); }
  mb.addEventListener('click', () => {
    /* only ever a real choice when the send freed you */
    if (!S.match || !freeChoice(S.match) || S.match.r[b] !== 0) return;
    S.focus = b; renderUlt(); renderStatus();
  });
  ultMeta.appendChild(mb);
}
/* Pressing or tab-focusing a square lights the board it would send the
   opponent to. That is the whole rule, shown rather than described, and
   it costs one class name. */
function previewSend(cell) {
  const m = S.match;
  if (!m || m.over) return;
  const dest = (cell === null || m.r[cell] !== 0) ? -1 : cell;
  $$('.mb', ultMeta).forEach((mb, b) => mb.classList.toggle('dest', b === dest));
  ultFocus.classList.toggle('free-dest', cell !== null && dest < 0);
}
for (let c = 0; c < 9; c++) {
  const el = document.createElement('button');
  el.className = 'cell'; el.dataset.c = c; el.setAttribute('role', 'gridcell');
  el.addEventListener('click', () => onUltCell(c));
  el.addEventListener('pointerenter', () => previewSend(c));
  el.addEventListener('pointerdown', () => previewSend(c));
  el.addEventListener('focus', () => previewSend(c));
  el.addEventListener('pointerleave', () => previewSend(null));
  el.addEventListener('blur', () => previewSend(null));
  ultFocus.appendChild(el);
}

/* Boards are named by where they sit, never by number: "the middle
   board" is findable on a projector at the back of a room and "board 5"
   is not. Every use reads "the <name> board", so no name carries its
   own article. */
const BOARDNAME = ['top left', 'top middle', 'top right',
                   'middle left', 'middle', 'middle right',
                   'bottom left', 'bottom middle', 'bottom right'];

function renderUlt() {
  const m = S.match;
  if (!m) return;
  const brain = currentEra().brain;
  const RES = ['', 'X', 'O', '—'];
  const free = freeChoice(m);
  const yours = !m.over && m.turn === m.humanMark;

  $$('.mb', ultMeta).forEach((mb, b) => {
    const cells = OG.cellsOf(m.b[b]);
    const live = m.r[b] === 0;
    /* `sent` is the board the rules point at; `open` is a board you may
       pick because the send freed you. Both are gold, and only one of
       them can be on screen at a time, so there is never a question
       about where the next mark goes. */
    const sent = !m.over && !free && b === m.send;
    const open = !m.over && free && live;
    mb.className = 'mb' + (m.r[b] ? ' done r' + m.r[b] : '') +
      (sent ? ' sent' : '') + (open ? ' open' : '') +
      (b === S.focus && live ? ' focus' : '') +
      (m.metaLine && m.metaLine.indexOf(b) >= 0 ? ' metawin' : '') +
      (m.last && m.last.board === b ? ' last' : '');
    mb.disabled = !open;
    $$('i', mb).forEach((i, c) => { i.className = cells[c] ? 'm' + cells[c] : ''; });
    mb.setAttribute('aria-label', 'The ' + BOARDNAME[b] + ' board' +
      (m.r[b] === 0 ? ', in play' : m.r[b] === 3 ? ', drawn' :
       ', won by ' + (m.r[b] === m.humanMark ? 'you' : 'it')) +
      (sent ? ' — you must play here' : open ? ' — you may play here' : ''));
    let tag = mb.querySelector('.tag');
    if (!tag) { tag = document.createElement('span'); tag.className = 'tag'; mb.appendChild(tag); }
    tag.textContent = m.r[b] ? RES[m.r[b]] : '';
  });

  /* The caption under the panes: the send rule, in words, on every
     single turn — it is the rule the whole act turns on, and a ring
     round a board does not say WHY the ring is there. The board count
     rides on its second line rather than in a row of its own, which is
     what keeps TRAIN above the fold on a 320x568 screen. */
  const t = ULT.tally(m);
  const you = m.humanMark === 1 ? t.x : t.o, its = m.humanMark === 1 ? t.o : t.x;
  const cap = $('#ult-where');
  cap.className = m.over ? 'over' : free ? 'free' : 'sent';
  cap.innerHTML =
    `<span class="uw-say">` + (m.over
      ? `<b>Match over.</b>`
      : !yours
        ? `<b>Its turn</b> — it must play ${free ? 'anywhere it likes' : 'in the <b>' + BOARDNAME[m.send] + '</b> board'}`
        : free
          ? `<b>Play anywhere.</b> It sent you to a finished board, so the whole grid is open — tap a board.`
          : `<b>You must play in the ${BOARDNAME[m.send]} board</b> — its last square sent you there.`) +
    `</span>` +
    `<span class="uw-score"><b class="you">${you}</b>–<b class="ai">${its}</b> boards` +
    (t.d ? ` · ${t.d} drawn` : '') + ` · three in a row wins</span>`;

  const code = m.b[S.focus], cells = OG.cellsOf(code);
  const playable = yours && m.r[S.focus] === 0 && (free || m.send === S.focus);
  const showHeat = S.brain && !m.over && m.r[S.focus] === 0;
  const mark = m.turn;
  const picks = showHeat ? ULT.policyMoves(brain, m).filter(mv => ((mv / 9) | 0) === S.focus)
                              .map(mv => mv % 9) : [];
  $$('.cell', ultFocus).forEach((el, c) => {
    const v = cells[c];
    /* Where this square would send the opponent. `.sends-free` is the
       loaded one: a square whose board is finished hands them the whole
       grid, and nothing about the picture inside this board says so. */
    const sendsFree = !v && m.r[c] !== 0;
    el.className = 'cell' + (v ? ' mk' + v : ' open') +
      (m.last && m.last.board === S.focus && m.last.cell === c && v ? ' last' : '') +
      (!v && sendsFree ? ' sends-free' : '') +
      (showHeat && !v ? ' heat' : '') + (picks.indexOf(c) >= 0 ? ' pick' : '');
    el.disabled = !!v || !playable || m.thinking;
    el.style.background = ''; el.style.color = '';
    if (v) { el.textContent = MARK[v]; el.setAttribute('aria-label', CELLNAME[c] + ', taken'); return; }
    const dest = sendsFree ? 'sends it anywhere' : 'sends it to the ' + BOARDNAME[c] + ' board';
    if (showHeat) {
      const val = ULT.moveValue(brain, code, c, mark);
      const after = code + mark * OG.POW3[c], opp = mark === 1 ? 2 : 1;
      const seen = brain.hits(after, opp);
      el.style.background = heat(val); el.style.color = heatInk(val);
      const note = seen ? 'seen ' + fmt(seen) + '×' : 'never seen';
      el.innerHTML = `<span class="v">${sgn(val)}</span>` +
        `<span class="n">${note}</span>` +
        `<span class="s" aria-hidden="true">${sendsFree ? '✦' : c + 1}</span>`;
      el.setAttribute('aria-label', CELLNAME[c] + ': ' + val.toFixed(2) + ', ' + note + ', ' + dest);
    } else {
      el.innerHTML = `<span class="s" aria-hidden="true">${sendsFree ? '✦' : c + 1}</span>`;
      el.setAttribute('aria-label', CELLNAME[c] + ', empty, ' + dest);
    }
  });

  renderBrainReadout();
}

function renderStatus() {
  if (isUlt()) return renderUltStatus();
  const g = S.game, el = $('#status');
  el.className = '';
  if (isNet() && (!S.neural || !S.neural.model)) {
    el.innerHTML = `<div><span class="big">Create learning examples first</span><br><span class="sub">This board stays inactive until the earlier learner has created the examples this network will practice from.</span></div>`;
    return;
  }
  if (g.over) {
    const rules = isRules();
    const t = g.result === 'win'
        ? ['You win.', rules ? `${S.depth} rules were not enough.` : oppLabel() + ' let you through.']
      : g.result === 'loss'
        ? ['It beat you.', rules ? 'The ladder had a rule for every square.'
                                 : oppLabel() + ' found a line you missed.']
        : ['Drawn.', 'Neither of you got through.'];
    el.classList.add(g.result === 'win' ? 'you-win' : g.result === 'loss' ? 'you-lose' : 'drawn');
    el.innerHTML = `<div><span class="big">${t[0]}</span><br><span class="sub">${t[1]}</span></div>`;
    return;
  }
  if (g.thinking) { el.innerHTML = `<div><span class="sub">${isRules() ? 'Checking the rules in order' : oppLabel() + ' is choosing'}…</span></div>`; return; }
  const yours = OG.TOMOVE[g.code] === g.humanMark;
  el.innerHTML = `<div><span class="big">${yours ? 'Your move' : 'Its move'}</span><br>` +
    `<span class="sub">you are ${MARK[g.humanMark]} ${g.humanMark === 1 ? '(you go first)' : '(it goes first)'}</span></div>`;
}

function renderUltStatus() {
  const m = S.match, el = $('#status');
  el.className = '';
  if (!m) return;
  if (m.over) {
    const r = ultResult();
    const t = r === 'win' ? ['You win the match.', 'Three boards in a row — and it never saw them coming.']
            : r === 'loss' ? ['It wins the match.', 'Three boards in a row.']
            : ['Match drawn.', 'All 81 squares gone and nobody made a line of three boards.'];
    el.classList.add(r === 'win' ? 'you-win' : r === 'loss' ? 'you-lose' : 'drawn');
    el.innerHTML = `<div><span class="big">${t[0]}</span><br><span class="sub">${t[1]}</span></div>`;
    return;
  }
  if (m.thinking) {
    el.innerHTML = `<div><span class="sub">Era ${S.era} is choosing a square…</span></div>`;
    return;
  }
  /* #ult-where directly above already says whose turn it is and which
     board they are stuck in, so while a match is running this row
     carries only the thing that is nowhere else — which mark is yours.
     Saying it twice would cost a line, and a line is what stands
     between TRAIN and the bottom of a 320x568 screen. The result keeps
     its full two-line treatment; by then nobody is mid-match. */
  el.innerHTML = `<div><span class="sub">you are ${MARK[m.humanMark]} · ` +
    `it is ${MARK[m.humanMark === 1 ? 2 : 1]}</span></div>`;
}

/* ------------------------------------------------------------------ *
 * Step 1 — the logic, visible
 * ------------------------------------------------------------------ */

/* The one-line commentary under the board. It names the rule by number
   so the eye can find it in the list beside, and says what on the board
   set it off. */
function renderRuleFired() {
  const el = $('#rule-fired');
  el.hidden = !isRules();
  if (!isRules()) return;
  const d = S.lastRule;
  if (!d) {
    el.className = 'waiting';
    el.innerHTML = `<div class="rf-line">Every move it makes is decided by the list beside the board, ` +
      `checked from the top. Play a square and it will tell you which rule answered you.</div>`;
    return;
  }
  el.className = d.ruleId === 0 ? 'nofire' : '';
  cue(d.ruleId === 0
    ? `No rule applied: rules ${S.depth + 1}–8 are switched off, so it played a free square at random.`
    : `Rule ${d.ruleId} answered you — ${d.rule.name}. The list decided; nothing was learned.`, d.ruleId === 0);
  const head = d.ruleId === 0
    ? `<b>No rule</b> <span class="rf-off">rules ${S.depth + 1}–8 are switched off</span>`
    : `<b>Rule ${d.ruleId} · ${d.rule.name}</b>`;
  el.innerHTML = `<div class="rf-line"><span class="rf-head">${head}</span> ${d.why}</div>`;
}

/* The ladder itself. Built from RULES.LADDER rather than retyped, so the
   list on screen cannot drift from the code that runs. */
function renderRulesPanel() {
  const panel = $('#rules-panel');
  panel.hidden = !isRules();
  if (!isRules()) return;
  const counts = S.ruleCounts[S.depth] || [];
  const total = counts.reduce((a, b) => a + b, 0);
  const fired = S.lastRule ? S.lastRule.ruleId : -1;

  $('#rp-sub').textContent = S.depth === 8
    ? 'all eight in play'
    : `${S.depth} of 8 in play`;

  $('#rule-list').innerHTML = RULES.LADDER.map(r => {
    const off = r.id > S.depth;
    const n = counts[r.id] || 0;
    return `<li class="rule${off ? ' off' : ''}${r.id === fired ? ' fired' : ''}">` +
      `<span class="rn">${r.id}</span>` +
      `<span class="rt"><b>${r.name}</b><span class="rg">${r.gist}</span></span>` +
      `<span class="rc">${off ? 'off' : (n ? '×' + n : '')}</span></li>`;
  }).join('') +
    (S.depth < 8
      ? `<li class="rule fallback${fired === 0 ? ' fired' : ''}"><span class="rn">—</span>` +
        `<span class="rt"><b>Nothing left to check</b>` +
        `<span class="rg">the author stopped writing rules — it plays a free square</span></span>` +
        `<span class="rc">${counts[0] ? '×' + counts[0] : ''}</span></li>`
      : '');

  const r = RULES.report(S.depth);
  $('#rp-foot').innerHTML = total
    ? `${fmt(total)} move${total === 1 ? '' : 's'} decided so far. ` +
      (S.depth === 8
        ? `None of them came from experience: this fixed policy has had no training.`
        : `Rules ${S.depth + 1}–8 are switched off. Open Details to see the game that costs it.`)
    : (S.depth === 8
        ? `Eight rules, written out in advance by a person. This is a fixed policy with no training process. ` +
          `Open Details for the search across all ${fmt(r.lines)} games playable against it.`
        : `A shortened ladder. Rules ${S.depth + 1}–8 are switched off, which opens up ` +
          `${fmt(r.lines)} playable games instead of ${fmt(RULES.report(8).lines)}.`);
}

function renderBrainReadout() {
  const el = $('#brain-readout');
  el.hidden = !S.brain;
  if (!S.brain) return;
  if (isUlt()) return renderUltReadout();
  if (isNet()) {
    const n = S.neural, m = n && n.metrics;
    if (!m) { el.innerHTML = '<div>Create learning examples before there are network weights to inspect.</div>'; return; }
    el.innerHTML = `<div>These values come from a forward pass through <b>${fmt(m.params)} learned parameters</b>—connection weights and biases. The frozen learning examples are not queried while you play.</div>` +
      `<div style="margin-top:.5em">${fmt(m.updates)} updates · train MSE ${m.trainMse.toFixed(3)} · held-out MSE ${m.heldMse.toFixed(3)}.</div>` +
      `<div class="legend"><span>lower predicted value</span><span class="ramp"></span><span>higher predicted value</span></div>`;
    return;
  }
  const e = currentEra(), g = S.game;
  const yours = !g.over && OG.TOMOVE[g.code] === g.humanMark;
  const whose = g.over ? 'The game is over, so there is nothing left to score.'
    : yours ? 'These are its scores for <b>your</b> options — higher is better for you. The same table reads both sides of the board.'
            : 'These are its scores for <b>its own</b> options. It will play one of the outlined squares.';
  el.innerHTML =
    `<div>${whose}</div>` +
    `<div style="margin-top:.5em">Era ${e.n}’s learned memory: <b>${fmt(e.seen)}</b> positions with a score attached, ` +
    `out of <b>${fmt(OG.OPEN_POSITIONS.length + 958)}</b> that can occur.</div>` +
    `<div class="legend"><span>losing</span><span class="ramp"></span><span>winning</span></div>`;
}

/* The inspector is where the shortcut is visible rather than argued.
   What it prints is exactly what the agent is looking at, so the two
   things it is NOT looking at are conspicuous by their absence. */
function renderUltReadout() {
  const el = $('#brain-readout'), e = currentEra(), m = S.match, brain = e.brain;
  const blind = m && !m.over ? ULT.blindFraction(brain, m) : 0;
  const slots = ULT.SPACE.slots;
  el.innerHTML =
    `<div>Scores for the ${BOARDNAME[S.focus]} board only — how much each square would improve ` +
    `<b>that one board</b>. That is the whole calculation, and it is the shortcut: it says ` +
    `nothing about where this board sits on the grid, and nothing about where the square ` +
    `you pick would send it next.</div>` +
    `<div style="margin-top:.5em">Era ${e.n}'s table: <b>${fmt(brain.seen)}</b> of the ` +
    `<b>${fmt(slots)}</b> entries this game can use have a number in them` +
    (brain.seeded ? `, <b>${fmt(brain.seeded)}</b> of them handed straight over from 1b`
                  : '') + '.</div>' +
    (m && !m.over && blind > 0
      ? `<div style="margin-top:.5em">Right now <b>${Math.round(blind * 100)}%</b> of the squares it ` +
        `is weighing up sit on a board picture it has never met. It reads 0.00 for every one of ` +
        `them, which looks exactly like "even".</div>`
      : m && !m.over
        ? `<div style="margin-top:.5em">It has met every board picture on offer here at least once. ` +
          `Early in a match that is normal; the strange ones turn up later.</div>` : '') +
    `<div class="legend"><span>losing</span><span class="ramp"></span><span>winning</span></div>`;
}

function renderScore() {
  const r = currentRec();
  $('#score-row').innerHTML =
    `<div class="sc win"><span class="n">${r.w}</span><span class="k">you won</span></div>` +
    `<div class="sc draw"><span class="n">${r.d}</span><span class="k">drawn</span></div>` +
    `<div class="sc loss"><span class="n">${r.l}</span><span class="k">you lost</span></div>`;
  renderEraStrip();
}

/* Step 1's stand-in for the era dropdown: how much of the ladder is
   switched on. Same segmented control as the burst sizes, same
   mechanism, no second widget invented. */
function renderDepthSeg() {
  const seg = $('#depth-seg');
  seg.innerHTML = RULES.DEPTHS.map(d =>
    `<button data-d="${d.n}" class="${d.n === S.depth ? 'on' : ''}" ` +
    `aria-pressed="${d.n === S.depth}" title="${d.title}">${d.label} rules</button>`).join('');
  $$('#depth-seg button').forEach(b => b.addEventListener('click', () => {
    const n = +b.dataset.d;
    if (n === S.depth) return;
    S.depth = n;
    $('#selftest-out').textContent = '';
    if (!S.ruleRec[n]) resetRuleTally(n);
    renderDepthSeg(); renderScore(); renderRulesPanel(); renderBanner();
    newGame();
  }));
}

function renderEraSelect() {
  const sel = $('#era-select');
  sel.innerHTML = S.eras.map(e =>
    `<option value="${e.n}">Era ${e.n} · ` +
    (isUlt()
      ? (e.matches ? fmtk(e.matches) + ' matches' : 'no ultimate practice')
      : (e.n === 0 ? 'newborn' : fmtk(e.games) + ' games') + (e.verified.safe ? ' · unbeatable' : '')) +
    `</option>`).join('');
  sel.value = String(S.era);
  renderEraStrip();
}

/* "You vs Era 0: 3-0-0. You vs Era 4: 0-1-4." — the whole arc in one line.
   In step 1 the same strip carries your record against each length of
   ladder, which is the beat the step is built around: 2 rules 3-0-0,
   8 rules 0-2-1. */
function renderEraStrip() {
  const el = $('#era-strip');
  if (isRules()) {
    const played = RULES.DEPTHS.filter(d => {
      const r = S.ruleRec[d.n]; return r && r.w + r.l + r.d > 0;
    });
    el.hidden = played.length === 0;
    if (!played.length) return;
    el.innerHTML = '<span class="k">your record</span>' + played.map(d => {
      const r = S.ruleRec[d.n];
      return `<span class="chip${d.n === S.depth ? ' on' : ''}">${d.n} rules ` +
        `<b class="w">${r.w}</b>–<b class="d">${r.d}</b>–<b class="l">${r.l}</b></span>`;
    }).join('');
    return;
  }
  if (isNet()) { el.hidden = true; return; }
  const key = isUlt() ? 'recU' : 'rec';
  const played = S.eras.filter(e => e[key].w + e[key].l + e[key].d > 0);
  el.hidden = played.length === 0;
  if (!played.length) return;
  el.innerHTML = '<span class="k">your record</span>' + played.map(e =>
    `<span class="chip${e.n === S.era ? ' on' : ''}">E${e.n} ` +
    `<b class="w">${e[key].w}</b>–<b class="d">${e[key].d}</b>–<b class="l">${e[key].l}</b></span>`).join('');
}

/* What to notice about the era on screen, for the value-table stage. */
function eraCue() {
  const e = currentEra();
  if (!e) return '';
  if (e.n === 0) return 'Era 0 knows nothing: every value in its table is zero, so every legal move ties and it picks at random.';
  return `Era ${e.n} after ${fmt(e.games)} games: ` + (e.verified.safe
    ? 'no losing line in either role — verified unbeatable.'
    : 'still beatable — a losing line exists.');
}

function renderTrain() {
  /* Step 1 has nothing to train: the skill is already in the file. */
  $('#train-panel').hidden = isRules();
  if (isRules()) return;
  if (isNet()) {
    const n = S.neural, m = n && n.metrics;
    $('.t-main', $('#btn-train')).textContent = !n ? 'Create learning examples' : (S.training ? 'Training — stop' : 'Train network');
    $('#train-sub').textContent = !n ? '20,000 seeded games, then freeze what it learned' : fmt(S.neuralBurst) + ' training updates';
    const sizes = [25000, 50000, 100000];
    $('#burst-seg').innerHTML = sizes.map(b => `<button data-b="${b}" class="${b === S.neuralBurst ? 'on' : ''}" aria-pressed="${b === S.neuralBurst}">${fmt(b)}</button>`).join('');
    $$('#burst-seg button').forEach(b => b.addEventListener('click', () => { S.neuralBurst = +b.dataset.b; renderTrain(); }));
    $('#burst-seg').setAttribute('aria-label', 'Neural-network training updates');
    if (m && m.updates > 0) {
      const ratio = m.trainMse > 0 ? m.heldMse / m.trainMse : 1;
      /* The generalisation evidence and the fit evidence arrive together.
         Read alone, "held-out 0.5 vs practised 0.4" says the network is
         WORSE on unseen boards — the lookup-table intuition in the demo's
         own voice. What proves the shared weights carry is that held-out
         error FELL from its untrained baseline, on positions no update
         ever touched. Checkpoint 0 is recorded when the model is created
         (recordNeuralCheckpoint in trainNeural), so it is present here. */
      const b0 = S.neural.checkpoints.get(0);
      const fell = b0 && b0.metrics.heldMse > m.heldMse;
      cue(`On positions kept out of training, error went from ${b0 ? b0.metrics.heldMse.toFixed(3) : '?'} untrained to ${m.heldMse.toFixed(3)} after ${fmt(m.updates)} updates` +
        (fell ? ' — it fell, and no update ever saw those boards. ' : ' — it did not fall this time. ') +
        `Practised error is ${m.trainMse.toFixed(3)}. Lower is closer to the frozen teacher; neither number is playing strength.`);
      revealPrediction('net', ratio > 1.5 ? 'higher' : 'same',
        `Measured: held-out ${m.heldMse.toFixed(3)}, practised ${m.trainMse.toFixed(3)} (ratio ${ratio.toFixed(2)}; this demo calls it clearly higher above 1.5×). Train more and watch whether the gap moves.`);
    } else if (m) {
      cue(`Examples ready: ${fmt(m.train)} practised, ${fmt(m.held)} held out. The weights are still random — press Train network.`);
    }
    $('#train-stats').innerHTML = !m
      ? `<p class="help"><b>Preparation is explicit.</b> A fresh copy of the 1b algorithm plays 20,000 seeded games, freezes its current estimates, then keeps some board positions out of training to check the network later. No labels come from a solved-game oracle.</p>`
      : `<div class="st"><span class="n">${fmt(m.params)}</span><span class="k">parameters</span></div>` +
        `<div class="st"><span class="n">${fmt(m.train)}</span><span class="k">train examples</span></div>` +
        `<div class="st"><span class="n">${fmt(m.held)}</span><span class="k">held-out examples</span></div>` +
        `<p class="help">${fmt(m.groups)} related board groups stay together. The network’s average error is ${m.trainMse.toFixed(3)} on examples it practiced and ${m.heldMse.toFixed(3)} on positions kept out of training. ${S.training ? 'Use Stop training or choose another tab to stop after this small batch.' : 'Those held-out positions are never used by an update.'}</p>`;
    return;
  }
  const e = S.eras[S.eras.length - 1];
  const ult = isUlt();
  $('.t-main', $('#btn-train')).textContent = ult ? 'Train on ultimate' : 'Train the AI';
  $('#burst-seg').setAttribute('aria-label', ult ? 'Ultimate training matches' : 'Training games');
  $('#train-sub').textContent = ult ? fmt(S.burstU) + ' matches' : fmt(S.burst) + ' games';
  const sizes = ult ? ULT.HPU.bursts : OG.HP.bursts;
  const cur = ult ? S.burstU : S.burst;
  $('#burst-seg').innerHTML = sizes.map(b =>
    `<button data-b="${b}" class="${b === cur ? 'on' : ''}" aria-pressed="${b === cur}">${fmt(b)}</button>`).join('');
  $$('#burst-seg button').forEach(b => b.addEventListener('click', () => {
    if (isUlt()) S.burstU = +b.dataset.b; else S.burst = +b.dataset.b;
    renderTrain();
  }));
  $('#train-stats').innerHTML = ult
    ? `<div class="st"><span class="n">${fmt(e.matches)}</span><span class="k">matches trained</span></div>` +
      `<div class="st"><span class="n">${fmt(e.seenU)}</span><span class="k">pictures seen</span></div>` +
      `<div class="st"><span class="n">${fmt(ULT.SPACE.slots)}</span><span class="k">entries it can use</span></div>`
    : `<div class="st"><span class="n">${S.eras.length - 1}</span><span class="k">eras</span></div>` +
      `<div class="st"><span class="n">${fmt(e.games)}</span><span class="k">games trained</span></div>` +
      `<div class="st"><span class="n">${fmt(e.seen)}</span><span class="k">positions seen</span></div>`;
}

/* A game the shortened ladder loses, drawn as boards rather than
   described. `losingGame` picks the representative one, so this is how
   it typically goes wrong rather than a freak sequence. */
function losingGameHTML(g) {
  let code = 0;
  const frames = [];
  g.plies.forEach(p => {
    code = OG.child(code, p.cell, p.mark);
    frames.push(
      `<div class="lg-step${p.forks ? ' fork' : ''}">${miniHTML(code)}` +
      `<span class="lg-who">${p.bot ? 'it' : 'you'}</span></div>`);
  });
  const forkAt = g.plies.findIndex(p => p.forks);
  return `<div class="lg">${frames.join('')}</div>` +
    (forkAt >= 0
      ? `<p class="lg-note">The marked move leaves <b>two</b> ways to win at once. Stopping that is ` +
        `<b>rule 4</b>, and rule 4 is switched off — so it blocks one and loses to the other.</p>`
      : '');
}

/* The proof line lives in the kit's Details drawer, inside the "What is
   live" section of the stage it belongs to. One .banner element per host,
   created on first use; the other hosts are emptied so a stale proof from
   another stage is never one drawer-open away. */
function bannerEl() {
  const key = isRules() ? 'rules' : (isNet() || isUlt()) ? 'net' : 'one';
  ['rules', 'one', 'net'].forEach(k => { if (k !== key) $('#banner-' + k).innerHTML = ''; });
  const host = $('#banner-' + key);
  let el = $('.banner', host);
  if (!el) { el = document.createElement('div'); el.className = 'banner'; host.appendChild(el); }
  return el;
}

function renderBanner() {
  const el = bannerEl();
  const top = currentEra();

  /* ---- Step 1: the same search, run on the hand-written ladder ---- */
  if (isRules()) {
    const r = RULES.report(S.depth);
    el.hidden = false;
    el.classList.toggle('quiet', !r.safe);
    if (r.safe) {
      el.innerHTML =
        `<h3>Eight written rules produce a policy with no losing line.</h3>` +
        `<p>Every game that can still be played against these eight rules was searched, with the ` +
        `rules moving first and moving second, and in none of them do they lose. That is the same ` +
        `exhaustive search used in 1b, run on a rule-based opponent.</p>` +
        `<p>Where the skill came from is the whole difference. Every bit of this one came out of a ` +
        `person's design and none of it out of training experience. Its policy stays fixed during play ` +
        `and would need to be redesigned for a different game. For this small game it is short, fast, and readable. ` +
        `The Value table and Neural Network show two representations that this demo fits from experience.</p>` +
        `<div class="proof">Proof: ${fmt(r.lines)} complete game lines searched · ` +
        `${fmt(r.positions)} positions examined · 0 losses · both roles · ` +
        `re-run any time from Settings &rarr; Run the full self-test.</div>`;
      return;
    }
    const game = r.gameSecond || r.gameFirst;
    const pct = v => (v * 100).toFixed(0) + '%';
    el.innerHTML =
      `<h3>${S.depth} rules is not enough, and here is the game that shows it.</h3>` +
      `<p>The same search that proves the full ladder safe finds losing lines in this one. Playing ` +
      `your best you beat it <b>${pct(r.beatsSecond)}</b> of the time when you move first and ` +
      `<b>${pct(r.beatsFirst)}</b> when it does — worked out exactly over every line, not sampled.</p>` +
      (game ? losingGameHTML(game) : '') +
      `<p>It still flips a coin whenever no rule applies, so this exact game comes up about ` +
      `${game ? '1 in ' + Math.round(1 / game.prob) : 'some'} times; something like it comes up ` +
      `most games. Switch to <b>All 8</b> and none of it works any more.</p>` +
      /* Deliberately NOT "n positions examined" here. The safety search
         stops at the first losing line it finds, so its position count
         is a few dozen and quoting it would read as a thorough search
         that came up clean, which is the opposite of what happened. */
      `<div class="proof">${fmt(r.lines)} complete game lines are playable against this ladder · ` +
      `the search finds losing ones in both roles and stops there · ` +
      `the percentages come from a separate pass over every line.</div>`;
    return;
  }

  if (isNet()) {
    el.hidden = false; el.classList.add('quiet');
    if (!S.neural) {
      el.innerHTML = `<h3>The Neural Network is a model fitted with supervised learning.</h3>` +
        `<p>First, a fresh copy of 1b's tabular reinforcement learner plays 20,000 seeded games. Its current value estimates are frozen as target examples. Then a smaller set of shared weights is fitted to approximate them.</p>` +
        `<p>The value table stores one number for each position. The Neural Network shares weights across positions. That gives it an answer for a position kept out of training, but does not guarantee a good answer.</p>`;
      return;
    }
    const m = S.neural.metrics;
    const baseline = S.neural.checkpoints.get(0);
    const point = S.neural.checkpoints.get(m.updates);
    el.innerHTML = `<h3>Shared weights now approximate a frozen learned table.</h3>` +
      `<p><b>Prediction error:</b> MSE is the average squared difference between a predicted score and the frozen example’s score; zero means an exact match. On practiced examples it went from ${baseline.metrics.trainMse.toFixed(3)} before training to ${m.trainMse.toFixed(3)} now. On positions kept out of training it went from ${baseline.metrics.heldMse.toFixed(3)} to ${m.heldMse.toFixed(3)}. Related rotations and reflections stay together.</p>` +
      `<p><b>Reproducible sampled comparison:</b> each 100-game check uses the same random seed and scoring procedure; game paths can change as the network changes. Before training: ${baseline.play.wins} won, ${baseline.play.draws} drawn, ${baseline.play.losses} lost; now: ${point.play.wins} won, ${point.play.draws} drawn, ${point.play.losses} lost. The policy diagnostic ${point.policy.safe ? 'finds no losing line' : 'finds a losing line'}; this tab still makes no automatic unbeatable claim.</p>` +
      `<p class="proof">During play the network evaluates the board that each legal move would create. The frozen learning examples are absent from that decision.</p>` +
      `<p>The optional <b>Ultimate tic-tac-toe</b> extension is the second button above the board: a table learner inherited from 1b, playing a game its inputs cannot fully see.</p>`;
    return;
  }

  /* Optional advanced extension: ultimate tic-tac-toe. */
  if (isUlt()) {
    const SP = ULT.SPACE, SV = ULT.SOLVED;
    const e38 = v => (v / 1e38).toFixed(1) + ' × 10³⁸';
    el.hidden = false;
    el.classList.add('quiet');
    el.innerHTML =
      `<h3>What happens when the learner cannot see the whole game?</h3>` +
      `<p>This optional extension changes the representation. The learner scores each small board but omits where that board sits and where a move sends the opponent. More training cannot restore inputs it never receives.</p>` +
      `<p><b>Ordinary tic-tac-toe: ${fmt(ULT.SMALLGAMES)} complete games.</b> The app can exhaustively check a displayed policy on that smaller game.</p>` +
      `<p><b>Ultimate tic-tac-toe: an upper bound of about ${e38(SP.bound)} board descriptions.</b> ` +
      `This is not a count of legal game states, so it cannot by itself prove that enumeration is ` +
      `impossible. The meaningful limitation here is representational: the inherited one-board ` +
      `learner omits where a board sits on the meta-grid and where a square sends the opponent. ` +
      `An ordinary neural network given the same incomplete inputs omits those facts too.</p>` +
      `<p><b>A nearby published variant is solved.</b> ${SV.authors} proved in ${SV.year} that the first player ` +
      `has a forced win — <b>in at most ${SV.atMost} moves</b>, with the second player able to hold ` +
      `out <b>at least ${SV.atLeast}</b>. Nobody visited ${e38(SP.bound)} positions to do it. They ` +
      `wrote down a strategy and proved it always works, which is what mathematics is for. <b>A ` +
      `proof does not require checking every case</b> — that is the most interesting thing on this ` +
      `page, and it is why "too big to search" and "unknowable" are not the same sentence.</p>` +
      `<p>The opponent here does not run that strategy, and this app does not claim the published proof for its different rules. Its results are sampled measurements of this learner.</p>` +
      `<div class="proof">${SV.title} · ${SV.ref} · ` +
      `Worth reading before quoting: the paper proves this for the variant in which ` +
      `${SV.variant}. The playable game uses the commoner convention, where a won board frees ` +
      `you too. The published strategy leans on sending the second player back into a board ` +
      `the first has already won, which this page would not allow. Near neighbours, not the same ` +
      `game, so the result is quoted rather than claimed for the playable game.</div>` +
      `<div class="proof">` +
      (S.liveU.seeded
        ? `Handed over from 1b: ${fmt(S.liveU.seeded)} of the ${fmt(SP.slots)} entries this ` +
          `game can use`
        : `The table learner has not trained yet, so there was nothing to hand over — this table started at ` +
          `zero, of ${fmt(SP.slots)} entries the game can use`) +
      ` · filled so far ${fmt(S.liveU.seen)} · matches trained ${fmt(S.liveU.matches)}</div>`;
    return;
  }
  el.classList.remove('quiet');
  if (!top.verified.safe) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML =
    `<h3>You can no longer beat this. Neither can anyone. The best a human can do is tie.</h3>` +
    `<p>That is not a claim from playing it a lot of times. Every game that can still be played ` +
    `against Era ${top.n} was searched, with Era ${top.n} moving first and moving second, and in ` +
    `none of them does it lose.</p>` +
    `<p>Tic-tac-toe ends here because it is small: about five and a half thousand positions, so a ` +
    `table can hold all of them. Chess has more possible games than there are atoms in the observable universe, and language ` +
    `has no fixed number at all. Larger systems therefore use representations that share parameters ` +
    `across inputs. That tradeoff can reach new cases, but it replaces separate stored estimates with a shared approximation.</p>` +
    `<div class="proof">Proof: ${fmt(top.verified.lines)} complete game lines searched · ` +
    `${fmt(top.verified.positions)} positions examined · 0 losses · both roles · ` +
    `re-run any time from Settings &rarr; Run the full self-test.</div>`;
}

/* ------------------------------------------------------------------ *
 * Training montage
 * ------------------------------------------------------------------ */

const MONTAGE_MS = 2400;         /* the maths takes ~30ms; see the note in
                                    the Details drawer. This is a paced
                                    visualisation, honestly labelled. */

function raf() { return new Promise(r => requestAnimationFrame(r)); }
async function pauseUntil(t) { while (performance.now() < t) await raf(); }

function miniHTML(code) {
  const c = OG.cellsOf(code);
  return '<div class="mini">' + Array.from(c).map(v =>
    `<i class="${v ? 'm' + v : ''}">${MARK[v] || ''}</i>`).join('') + '</div>';
}

/* Evaluation has one fixed independent stream per prepared model. A checkpoint
   is measured once and cached, so merely opening a panel cannot change or
   repeatedly resample the comparison. */
function recordNeuralCheckpoint() {
  const n = S.neural, m = n.metrics;
  if (n.checkpoints.has(m.updates)) return n.checkpoints.get(m.updates);
  const play = NET.scoreVs(n.model, OG.randomMove, 100,
    OG.makeRng('neural-fixed-evaluation:' + n.model.seed));
  const policy = OG.verifyPolicy(code => NET.policyMoves(n.model, code));
  const point = { metrics: m, play, policy };
  n.checkpoints.set(m.updates, point);
  return point;
}

async function train() {
  if (S.training) return;
  if (isNet()) return trainNeural();
  if (isUlt()) return trainUlt();
  S.training = true;
  const size = S.burst;
  const prev = OG.cloneAgent(S.live);
  const ov = $('#montage'); ov.hidden = false;
  $('#m-count').classList.add('blur');
  $('#m-count-sub').textContent = 'games played against itself and against chance';
  $('#m-left-label').textContent = 'exploration ε'; $('#m-left-note').textContent = 'how often it tries a random square instead of its best one';
  $('#m-wr-label').textContent = 'wins vs a random player';
  $('#m-wr-note').textContent = 'measured live, 200 fresh games each sample';
  $('#m-wr-fill').parentElement.parentElement.hidden = false;
  $('#btn-stop-training').hidden = true;
  $('#m-boards').classList.remove('ult');
  $('#m-boards').innerHTML = Array.from({ length: 6 }, () => miniHTML(0)).join('');

  const STEPS = 36, per = Math.ceil(size / STEPS);
  const t0 = performance.now();
  let done = 0, selfPlay = 0, vsRandom = 0, wr = null, pool = [];

  for (let i = 0; i < STEPS; i++) {
    const n = Math.min(per, size - done);
    if (n > 0) {
      const r = OG.trainGames(S.live, n, S.rng, { sampleEvery: Math.max(1, Math.floor(n / 3)) });
      done += n; selfPlay += r.selfPlay; vsRandom += r.vsRandom;
      pool = pool.concat(r.samples).slice(-24);
    }
    if (i % 6 === 3) {
      const s = OG.vsRandom(S.live, 200, S.rng);
      wr = s.winRate;
    }
    /* paint */
    $('#m-count').textContent = fmt(done);
    const eps = OG.epsilonAt(S.live.games);
    $('#m-eps').textContent = eps.toFixed(2);
    $('#m-eps-fill').style.width = (eps * 100).toFixed(1) + '%';
    if (wr !== null) {
      $('#m-wr').textContent = (wr * 100).toFixed(0) + '%';
      $('#m-wr-fill').style.width = (wr * 100).toFixed(1) + '%';
    }
    $('#m-prog').style.width = ((i + 1) / STEPS * 100).toFixed(1) + '%';
    if (pool.length) {
      $('#m-boards').innerHTML = Array.from({ length: 6 }, () => {
        const t = pool[(Math.random() * pool.length) | 0];
        return miniHTML(t[(Math.random() * t.length) | 0]);
      }).join('');
    }
    await pauseUntil(t0 + MONTAGE_MS * (i + 1) / STEPS);
  }

  $('#m-count').classList.remove('blur');
  await pauseUntil(t0 + MONTAGE_MS + 160);

  const era = makeEra(S.eras.length, OG.cloneAgent(S.live), prev, { selfPlay, vsRandom });
  S.eras.push(era);
  S.era = era.n;
  ov.hidden = true;
  S.training = false;
  renderEraSelect(); renderTrain(); renderBanner();
  newGame(); renderScore();
  renderLearnedPanel();
  cue(`Era ${era.n} after ${fmt(era.games)} games: ` + (era.verified.safe
    ? 'the exhaustive search finds no losing line in either role — verified unbeatable.'
    : `still beatable — a losing line exists. ${era.changed === null ? '' : fmt(era.changed) + ' positions are now played differently from the last era.'}`), !era.verified.safe);
  if (era.n === 1) revealOne();
}

/* The neural tab has two visible phases. Preparation is ordinary seeded
   reinforcement learning, and fitting is supervised learning from the frozen
   result. Neither phase is an oracle or a hidden lookup during play. */
async function trainNeural() {
  const run = ++S.neuralRun;
  const current = () => run === S.neuralRun;
  if (!S.neural) {
    S.training = true; S.cancelTraining = false;
    const ov = $('#montage'); ov.hidden = false;
    $('#m-count').classList.remove('blur');
    $('#m-count-sub').textContent = 'seeded tic-tac-toe games creating learning examples';
    $('#m-wr-label').textContent = 'preparation'; $('#m-wr').textContent = 'working';
    $('#m-left-label').textContent = 'games prepared'; $('#m-left-note').textContent = 'a fresh copy of the 1b algorithm is playing these seeded games';
    $('#m-wr-note').textContent = 'the values are frozen only after all 20,000 games finish';
    $('#btn-stop-training').hidden = false; $('#m-wr-fill').parentElement.parentElement.hidden = false;
    const session = NET.startTeacher(S.seed || 'demo', 20000);
    S.teacherSession = session;
    while (!session.complete && !S.cancelTraining) {
      const r = NET.trainTeacherBatch(session, 500);
      $('#m-count').textContent = fmt(r.games) + ' / ' + fmt(r.total);
      $('#m-eps').textContent = r.complete ? 'complete' : 'preparing';
      $('#m-eps-fill').style.width = (100 * r.games / r.total).toFixed(1) + '%';
      $('#m-prog').style.width = (100 * r.games / r.total).toFixed(1) + '%';
      await raf();
      if (!current()) return;
    }
    if (!current()) return;
    if (!S.cancelTraining && session.complete) {
      const teacher = NET.freezeTeacher(session);
      const model = NET.newSupervised(teacher, S.seed || 'demo');
      S.neural = {
        teacher, model, metrics: NET.metrics(model), checkpoints: new Map(), cancelled: false,
        initial: NETWORK_VIEW.snapshot(model.net)
      };
      recordNeuralCheckpoint();
    }
    S.teacherSession = null; S.training = false; ov.hidden = true;
    renderTrain(); renderBanner(); newGame();
    return;
  }
  const neural = S.neural;
  S.training = true; S.cancelTraining = false;
  const target = S.neuralBurst, batch = 512, ov = $('#montage'); ov.hidden = false;
  $('#m-count').classList.remove('blur'); $('#m-count-sub').textContent = 'labelled afterstates fitted by shared neural-network weights';
  $('#m-left-label').textContent = 'full passes'; $('#m-left-note').textContent = 'one pass means each training example has been used once';
  $('#m-wr-label').textContent = 'positions kept out'; $('#m-wr-note').textContent = 'average squared score error, recalculated every 5,120 updates; lower is closer';
  $('#btn-stop-training').hidden = false;
  $('#m-wr-fill').parentElement.parentElement.hidden = true;
  let done = 0;
  while (done < target && !S.cancelTraining) {
    const n = Math.min(batch, target - done);
    const light = NET.trainBatch(neural.model, n, false);
    done += n;
    if (done % 5120 === 0 || done === target) {
      neural.metrics = NET.metrics(neural.model);
      renderNetworkInspector();
    }
    $('#m-count').textContent = fmt(light.updates);
    $('#m-eps').textContent = light.epoch + ' passes';
    $('#m-wr').textContent = S.neural.metrics.heldMse.toFixed(3) + ' MSE';
    $('#m-prog').style.width = (100 * done / target).toFixed(1) + '%';
    await raf();
    if (!current()) return;
  }
  if (!current()) return;
  neural.cancelled = S.cancelTraining;
  neural.metrics = NET.metrics(neural.model);
  recordNeuralCheckpoint();
  S.training = false; ov.hidden = true;
  renderTrain(); renderBanner(); newGame();
}

function miniUHTML(m) {
  let h = '<div class="miniu">';
  for (let b = 0; b < 9; b++) {
    const c = OG.cellsOf(m.b[b]);
    h += `<div class="mub${m.r[b] ? ' r' + m.r[b] : ''}">`;
    for (let i = 0; i < 9; i++) h += `<i class="${c[i] ? 'm' + c[i] : ''}"></i>`;
    h += '</div>';
  }
  return h + '</div>';
}

/* The live bar during an ultimate burst is deliberately measured
   against the BOARD-LOCAL hand-written player — the one that shares the
   agent's blind spot — because that is the opponent it can actually
   improve against, and watching a number move is the point of a
   montage. The card afterwards then shows the other opponent, where the
   same number does not move at all. */
async function trainUlt() {
  S.training = true;
  const size = S.burstU;
  const ov = $('#montage'); ov.hidden = false;
  $('#m-count').classList.add('blur');
  $('#m-count-sub').textContent = 'matches played against itself and against chance';
  $('#m-left-label').textContent = 'exploration ε'; $('#m-left-note').textContent = 'how often it tries a random square instead of its best one';
  $('#m-boards').classList.add('ult');
  $('#m-boards').innerHTML = miniUHTML(ULT.newMatch()).repeat(3);
  $('#m-wr-label').textContent = 'holds or beats the board-local player';
  $('#m-wr-note').textContent = 'measured live against the stated comparison player';
  $('#btn-stop-training').hidden = true;
  $('#m-wr-fill').parentElement.parentElement.hidden = false;

  const STEPS = 30, per = Math.ceil(size / STEPS);
  const t0 = performance.now();
  let done = 0, selfPlay = 0, vsRandom = 0, hold = null, pool = [];
  let ms = 0;

  for (let i = 0; i < STEPS; i++) {
    const n = Math.min(per, size - done);
    if (n > 0) {
      const c0 = performance.now();
      const r = ULT.trainMatches(S.liveU, n, S.rng, { sampleEvery: Math.max(1, Math.floor(n / 2)) });
      ms += performance.now() - c0;
      done += n; selfPlay += r.selfPlay; vsRandom += r.vsRandom;
      pool = pool.concat(r.samples).slice(-12);
    }
    if (i % 7 === 4) {
      const sc = ULT.vsHeuristic(S.liveU, 40, S.rng);
      hold = (sc.wins + sc.draws) / sc.matches;
    }
    $('#m-count').textContent = fmt(done);
    const eps = ULT.epsilonAt(S.liveU.matches);
    $('#m-eps').textContent = eps.toFixed(2);
    $('#m-eps-fill').style.width = (eps * 100).toFixed(1) + '%';
    if (hold !== null) {
      $('#m-wr').textContent = (hold * 100).toFixed(0) + '%';
      $('#m-wr-fill').style.width = (hold * 100).toFixed(1) + '%';
    }
    $('#m-prog').style.width = ((i + 1) / STEPS * 100).toFixed(1) + '%';
    if (pool.length) {
      $('#m-boards').innerHTML = Array.from({ length: 3 }, () =>
        miniUHTML(pool[(Math.random() * pool.length) | 0])).join('');
    }
    await pauseUntil(t0 + MONTAGE_MS * (i + 1) / STEPS);
  }
  $('#m-count').classList.remove('blur');
  await pauseUntil(t0 + MONTAGE_MS + 160);

  const era = makeEra(S.eras.length, OG.cloneAgent(S.live), null, null, 'ult',
    { selfPlay, vsRandom, matches: size, ms });
  S.eras.push(era);
  S.era = era.n;
  ov.hidden = true;
  $('#m-boards').classList.remove('ult');
  S.training = false;
  renderEraSelect(); renderTrain(); renderBanner();
  newGame(); renderScore();
  buildLearnedUlt(era, S.eras[era.n - 1]);
  $('#btn-learned').hidden = false;
  $('#learned').showModal();
}

/* ------------------------------------------------------------------ *
 * "What it learned"
 * ------------------------------------------------------------------ */

function landmarkCard(L, now, before) {
  const cells = OG.cellsOf(L.code);
  const nowBy = {}, beforeBy = {};
  now.values.forEach(v => nowBy[v.cell] = v);
  if (before) before.values.forEach(v => beforeBy[v.cell] = v);

  const picks = new Set(now.values
    .filter(v => v.value >= Math.max.apply(null, now.values.map(x => x.value)) - 1e-9)
    .map(v => v.cell));

  let grid = '';
  for (let i = 0; i < 9; i++) {
    if (cells[i]) {
      grid += `<div class="lc-cell mk${cells[i]}">${MARK[cells[i]]}</div>`;
      continue;
    }
    const v = nowBy[i], b = beforeBy[i];
    const d = b ? v.value - b.value : 0;
    const cls = !b || Math.abs(d) < 0.02 ? '' : (d > 0 ? ' up' : ' down');
    grid += `<div class="lc-cell${cls}" style="background:${heat(v.value)};color:${heatInk(v.value)}">` +
      (b
        ? `<span class="value-pair"><span class="before">${sgn(b.value)}</span>` +
          `<span class="arrow" aria-hidden="true">↓</span><span class="after">${sgn(v.value)}</span>` +
          `<span class="cell-delta">Δ ${sgn(d)}</span></span>`
        : `<span class="lv">${sgn(v.value)}</span>`) +
      `</div>`;
  }

  /* the sentence */
  let line;
  if (L.key === null) {
    const spread = Math.max.apply(null, now.values.map(v => v.value)) -
                   Math.min.apply(null, now.values.map(v => v.value));
    if (!before) {
      line = `<span class="flat">Untrained baseline.</span> Every legal opening has its initialized ` +
        `value of +0.00. The tie shows that no preference has been learned yet.`;
    } else {
      const beforeSpread = Math.max.apply(null, before.values.map(v => v.value)) -
                           Math.min.apply(null, before.values.map(v => v.value));
      line = `<span class="flat">Opening-score spread: ${beforeSpread.toFixed(2)} before, ` +
        `${spread.toFixed(2)} now.</span> ` + (spread < 0.05
          ? `Its recorded opening preferences are now nearly tied.`
          : `It still rates some openings above others; later training may flatten this row.`);
    }
  } else {
    const keys = [L.key].concat(L.keyAlso || []);
    /* "it knows this" means EVERY square it might now pick is a right one.
       Getting it right sometimes is not getting it right: the agent breaks
       ties by coin flip, so one wrong square in the tie set is a loss
       waiting to happen. */
    const allRight = set => set.size > 0 && Array.from(set).every(m => keys.includes(m));
    const rightNow = allRight(picks);
    const rightBefore = before ? (function () {
      const best = Math.max.apply(null, before.values.map(x => x.value));
      return allRight(new Set(before.values.filter(v => v.value >= best - 1e-9).map(v => v.cell)));
    })() : false;
    const kv = nowBy[L.key], kb = before ? beforeBy[L.key] : null;
    const worst = now.values.reduce((a, b) => a.value < b.value ? a : b);
    /* Only talk about the squares that lose once they actually read as
       losses. Early on nothing is negative yet, and "the squares that
       lose have fallen to +0.00" is nonsense on a projector. */
    const punished = worst.value < -0.05;
    if (!before) {
      line = `<span class="flat">Untrained baseline.</span> ${cap(L.learned)} is not distinguished ` +
             `yet; every legal square shown starts at +0.00.`;
    } else if (rightNow && !rightBefore) {
      line = `<span class="up">It learned this one.</span> ${cap(L.learned)}: ` +
             `was ${kb ? sgn(kb.value) : '+0.00'}, now ${sgn(kv.value)}.` +
             (punished ? ` The squares that lose have fallen to ${sgn(worst.value)}.`
                       : ` It has not yet worked out that the other squares are bad.`);
    } else if (rightNow) {
      line = `<span class="flat">It already knew this.</span> ${cap(L.learned)} is still its choice ` +
             `at ${sgn(kv.value)}` +
             (punished ? `, against ${sgn(worst.value)} for the squares that lose.` : '.');
    } else {
      line = `<span class="down">Not yet.</span> It still rates a losing square as highly as ` +
             `${L.learned}. Train it again.`;
    }
  }

  return `<details class="lc"><summary><span class="lc-title">${L.title}</span>` +
         `<span class="lc-ask">${L.ask}</span></summary><div class="lc-body">` +
         (before ? `<div class="value-legend">Each open square: before ↓ now · Δ change</div>` :
           `<div class="value-legend">Each open square: initialized value</div>`) +
         `<div class="lc-grid">${grid}</div><div class="delta">${line}</div></div></details>`;
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function buildLearned(era, before) {
  const baseline = !before;
  const gamesAdded = baseline ? 0 : era.games - before.games;
  const changed = baseline ? null
    : (era.changed === null ? policyDiff(before.agent, era.agent) : era.changed);
  $('#learned-inline-title').textContent = baseline
    ? 'Era 0 · untrained baseline'
    : `Era ${era.n} · changes from Era ${before.n}`;
  $('#learned-inline-sub').textContent = baseline
    ? '0 training games · every recorded table value starts at +0.00'
    : `${fmt(gamesAdded)} new value-table games · ${fmt(era.games)} cumulative · exploration ${before.eps.toFixed(2)} → ${era.eps.toFixed(2)}`;

  const mix = era.mix
    ? `${fmt(era.mix.selfPlay)} against itself and ${fmt(era.mix.vsRandom)} against a random mover`
    : '';
  const head = baseline
    ? `<div class="headline"><b>This is the recorded starting snapshot.</b> The table has seen ` +
      `<b>${fmt(era.seen)} positions</b> and all legal moves tie at +0.00. Those equal values are initialization, ` +
      `not learned knowledge. A full policy search finds losing lines.</div>`
    : `<div class="headline">` + (era.mix
      ? `It played <b>${mix}</b> in this burst. `
      : `No value-table games were played in this era; it records optional Ultimate training while retaining the table snapshot. `) +
      `Recorded positions: ` +
      `<b>${fmt(before.seen)} → ${fmt(era.seen)}</b>. Its preferred-move set changed on ` +
      `<b>${fmt(changed)} of ${fmt(OG.OPEN_POSITIONS.length)} checked open positions</b> compared ` +
      `with Era ${before.n}. ` + (era.verified.safe
        ? `<b>A full search now finds no losing line.</b>`
        : `A full search still finds losing lines.`) + `</div>`;

  const cards = OG.LANDMARKS.map(L => landmarkCard(
    L,
    era.landmarks.find(x => x.id === L.id),
    before ? before.landmarks.find(x => x.id === L.id) : null)).join('');

  $('#learned-inline-body').innerHTML = head + cards;
}

function renderLearnedPanel() {
  const panel = $('#learned-report');
  if (S.mode !== 'one') { panel.hidden = true; return; }
  const selected = UI_STATE.selectedEraComparison(S);
  panel.hidden = !selected.era;
  if (selected.era) buildLearned(selected.era, selected.before);
}

/* The ultimate card shows no landmark positions, because what matters
   here is not what it learned about any one picture — it is that the
   decomposition it inherited has stopped being able to represent the
   game. So the card reports the measurements that establish that, each
   one beside the control that keeps it honest. */
function buildLearnedUlt(era, before) {
  $('#learned-title').textContent = 'Era ' + era.n + ' — ultimate tic-tac-toe';
  $('#learned-sub').textContent =
    fmt(era.matches) + ' matches · exploration ' + era.epsU.toFixed(2);

  const SP = ULT.SPACE;
  /* Cache a report once. Every measurement has its own deterministic
     stream, so the card is a literal read-only view of a frozen era and
     reopening it cannot perturb the next burst. */
  const metrics = era.metricsU || (era.metricsU = {
    recU: ULT.measureRecurrence(era.brain, ULT.HPU.burst, measureRng(era, 'recU')),
    rec1: ULT.measureRecurrenceSingle(era.agent, OG.HP.burst, measureRng(era, 'rec1')),
    local: ULT.vsHeuristic(era.brain, 200, measureRng(era, 'local')),
    aware: ULT.vsSendAware(era.brain, 200, measureRng(era, 'aware')),
    rnd: ULT.vsRandom(era.brain, 100, measureRng(era, 'random')),
    /* 400 rather than a token sample, because the interesting split —
       a match-winning move with another board win tied against it — is
       rare, and a rate printed off a handful of chances would be noise
       dressed as a finding. It costs about 60 ms. */
    blind: ULT.measureBlindness(era.brain, 400, measureRng(era, 'blind'), ULT.heuristicMove)
  });
  const { recU, rec1, local, aware, rnd, blind } = metrics;
  const grew = before ? era.seenU - before.seenU : era.seenU;
  const pc = v => Math.round(100 * v) + '%';

  const head =
    `<div class="headline">${fmt(era.matches)} matches in ${Math.round(era.ult.ms)} ms — ` +
    `${fmt(era.ult.selfPlay)} against itself and ${fmt(era.ult.vsRandom)} against chance. ` +
    `Its table now holds <b>${fmt(era.seenU)}</b> of the ${fmt(SP.slots)} entries this game can ` +
    `use` + (grew > 0 && before ? `, ${fmt(grew)} of them new this burst` : '') +
    (era.seededU ? `. <b>${fmt(era.seededU)}</b> came straight over from what it learned on one ` +
      `board — ${Math.round(100 * era.seededU / SP.slots)}% of what it needs, free.` : '.') +
    `</div>`;

  const cards = [
    /* ---- BEAT 1, part one: the meta-grid is invisible ---- */
    `<div class="lc"><h3>It cannot see the game it is playing</h3>` +
    `<div class="ask">Measured over ${fmt(blind.matches)} matches. The first row is a ` +
    `<b>control</b>: a free win inside one board is exactly what a per-board table CAN see, so ` +
    `if that number were low nothing below it would mean anything.</div>` +
    `<table class="cmp"><tr><th></th><th>taken</th><th>of</th><th>rate</th></tr>` +
    `<tr><td>a free win in a board <i>(control)</i></td><td>${fmt(blind.boardWinTaken)}</td>` +
    `<td>${fmt(blind.boardWinChances)}</td><td>${pc(blind.boardWinRate)}</td></tr>` +
    `<tr class="hi"><td>a move that wins the <b>match</b></td><td>${fmt(blind.matchWinTaken)}</td>` +
    `<td>${fmt(blind.matchWinChances)}</td><td>${pc(blind.matchWinRate)}</td></tr>` +
    `<tr><td>&nbsp;&nbsp;…when it is the only board win</td><td>${fmt(blind.aloneTaken)}</td>` +
    `<td>${fmt(blind.aloneChances)}</td><td>${pc(blind.aloneRate)}</td></tr>` +
    /* Only print the rate for the rare split once there are enough
       chances behind it to mean anything. A percentage off four
       chances is noise wearing a finding's clothes. */
    `<tr><td>&nbsp;&nbsp;…when another board win ties</td><td>${fmt(blind.rivalTaken)}</td>` +
    `<td>${fmt(blind.rivalChances)}</td><td>${blind.rivalChances >= 10
      ? pc(blind.rivalRate) : '<i>too few</i>'}</td></tr></table>` +
    `<div class="delta"><span class="down">A move that wins the match scores the same as any ` +
    `other board win.</span> When it is the only board win going it takes it at the control rate — ` +
    `it is taking a board win, and this one happens to end the match. ` +
    (blind.rivalChances >= 10
      ? `When a different board win ties with it, it flips a coin. `
      : `The last row is the sharpest case and also the rarest; train again and it fills in. `) +
    `Winning three boards <i>in a row</i> is a fact about where boards sit on the grid, and a ` +
    `table indexed by the picture inside a board has nowhere to keep it.</div></div>`,

    /* ---- BEAT 1, part two: the send is invisible ---- */
    `<div class="lc"><h3>And it cannot see where it is sending you</h3>` +
    `<div class="ask">The square you play names the board your opponent plays in next. Counted ` +
    `over the ${fmt(blind.giftTurns)} turns where some moves handed the opponent a board they ` +
    `could win at once and some did not — a real choice, in other words.</div>` +
    `<div class="score3">` +
    `<span class="s3 l"><b>${pc(blind.giftRate)}</b>it gave it away</span>` +
    `<span class="s3 d"><b>${pc(blind.giftChanceRate)}</b>blind choosing would</span>` +
    `<span class="s3 w"><b>${fmt(blind.giftAvoidable)}</b>were free to avoid</span></div>` +
    `<div class="delta"><span class="down">It hands over an immediate win at about the rate you ` +
    `would get by not looking</span> — because it is not looking. The small margin under chance ` +
    `is not foresight: taking the square an opponent needs is a <i>block</i>, which is visible one ` +
    `board at a time, and a blocked board is no longer a gift. It gets that much for free and ` +
    `nothing else. Of the giveaways it did make, <b>${pc(blind.avoidableRate)}</b> had an ` +
    `equally top-scoring square sitting right beside them that would not have — the table rated ` +
    `the two identically, so a coin picked the bad one.</div></div>`,

    /* ---- the consequence: the wall, with a control ---- */
    `<div class="lc"><h3>Which is why it stops getting better</h3>` +
    `<div class="ask">Two hand-written opponents, 200 matches each, alternating who starts. They ` +
    `are the <b>same player</b> apart from three clauses: win the match if you can, do not send ` +
    `them somewhere they win, and weigh a board by how many lines of three it sits on. The ` +
    `learner has never been shown either of them.</div>` +
    `<table class="cmp"><tr><th></th><th>won</th><th>drawn</th><th>lost</th></tr>` +
    `<tr><td>board-local rules <i>(control)</i></td><td>${local.wins}</td><td>${local.draws}</td>` +
    `<td>${local.losses}</td></tr>` +
    `<tr class="hi"><td>the same, plus the three clauses</td><td>${aware.wins}</td>` +
    `<td>${aware.draws}</td><td>${aware.losses}</td></tr></table>` +
    `<div class="delta">${local.losses < aware.losses - 20
      ? `<span class="down">It improves against the opponent that shares its blind spot, and not ` +
        `against the one that does not.</span> Keep pressing Train and watch: the first row keeps ` +
        `falling, the second one stops. The three clauses are an afternoon's work for a person — ` +
        `and all three are things this memory has no slot for, so no amount of experience puts ` +
        `them in.`
      : `Early days: it is still losing to both. Train it again and watch which row moves.`}` +
    ` Against a player choosing at random it wins ${rnd.wins} of ${rnd.matches}.</div></div>`,

    /* ---- beat 2, live: nothing repeats ---- */
    `<div class="lc"><h3>Does anything ever come round twice?</h3>` +
    `<div class="ask">Learning from experience only works if the experience repeats. Counted by ` +
    `playing one burst's worth of each — ${fmt(OG.HP.burst)} single games, ` +
    `${fmt(ULT.HPU.burst)} matches of about ${Math.round(recU.plies)} moves — and tallying every ` +
    `position met. A position here includes <b>which board you were sent to</b>: the same 81 ` +
    `marks with the opponent pointed somewhere else is not the same position.</div>` +
    `<table class="cmp"><tr><th></th><th>one board</th><th>ultimate</th></tr>` +
    `<tr><td>positions met</td><td>${fmt(rec1.positions)}</td><td>${fmt(recU.positions)}</td></tr>` +
    `<tr><td>different ones</td><td>${fmt(rec1.distinct)}</td><td>${fmt(recU.distinct)}</td></tr>` +
    `<tr class="hi"><td>times each came round</td><td>${(rec1.positions / rec1.distinct).toFixed(1)}×</td>` +
    `<td>${(recU.positions / recU.distinct).toFixed(2)}×</td></tr></table>` +
    `<div class="delta"><span class="down">Essentially nothing repeats.</span> A table over whole ` +
    `positions could never learn anything here, because it would never see the same page twice. ` +
    `The only reason this one learns at all is that it looks at <b>one board at a time</b> — and ` +
    `a person chose that shortcut. The two cards above are the bill for it.</div></div>`,

    /* ---- what could not come across ---- */
    `<div class="lc"><h3>What it could not carry over</h3>` +
    `<div class="ask">On one board, the marks tell you whose turn it is. Here you can play twice ` +
    `in the same board while your opponent is busy elsewhere, so a board can hold three of yours ` +
    `and one of theirs — a picture ordinary tic-tac-toe cannot produce at all.</div>` +
    `<div class="delta">` +
    (era.seededU
      ? `The table learner handed over <b>${fmt(era.seededU)}</b> entries. This game can use ` +
        `<b>${fmt(SP.slots)}</b>, so <b>${Math.round(100 - 100 * era.seededU / SP.slots)}%</b> of ` +
        `what it needed had to be learned from nothing.`
      : `The table learner has not trained yet, so nothing came across at all and every one of the ` +
        `<b>${fmt(SP.slots)}</b> entries started at zero. Train 1b first and come back: it ` +
        `hands over what it can, and it is a small fraction.`) +
    ` Turn the inspector on during a match and it will tell you how many of the squares it is ` +
    `weighing up right now sit on a picture it has never seen.</div></div>`
  ].join('');

  $('#learned-body').innerHTML = head + cards;
  S.lastLearned = era.n;
}

/* ------------------------------------------------------------------ *
 * Self-test — the proof, on demand, in the console and on screen
 * ------------------------------------------------------------------ */

function selfTest() {
  const out = [];
  const line = (ok, txt) => out.push(`<span class="${ok ? 'ok' : 'no'}">${ok ? 'PASS' : 'FAIL'}</span>  ${txt}`);
  let fails = 0;
  const check = (ok, txt) => { if (!ok) fails++; line(ok, txt); };

  const e = currentEra();

  /* Step 1 gets the same treatment as step 2, because the claim being
     checked is the same claim. */
  if (isRules()) {
    const r = RULES.report(S.depth);
    check(r.asFirst.safe === (S.depth >= 7),
      `${S.depth} rules moving first: ` +
      (r.asFirst.safe ? `no losing line among ${fmt(r.asFirst.lines)} searched`
                      : `a losing line exists among ${fmt(r.asFirst.lines)} searched (expected below 7 rules)`));
    check(r.asSecond.safe === (S.depth >= 7),
      `${S.depth} rules moving second: ` +
      (r.asSecond.safe ? `no losing line among ${fmt(r.asSecond.lines)} searched`
                       : `a losing line exists among ${fmt(r.asSecond.lines)} searched (expected below 7 rules)`));
    const two = RULES.report(2), eight = RULES.report(8);
    check(!two.safe && eight.safe,
      'the two-rule ladder is beatable and the eight-rule ladder is not — both by exhaustive search');
    check(RULES.moves(0, 8).length > 0 && RULES.LADDER.length === 8,
      'the ladder on screen is the ladder that runs: 8 rules, all reachable');
    out.push('');
    out.push(`        best play beats ${S.depth} rules ` +
      `${(r.beatsSecond * 100).toFixed(1)}% of the time when you move first, ` +
      `${(r.beatsFirst * 100).toFixed(1)}% when it does (exact, over every line)`);
    out.push(fails ? `<span class="no">${fails} check(s) failed for the ${S.depth}-rule ladder</span>`
                   : `<span class="ok">all checks passed for the ${S.depth}-rule ladder</span>`);
    $('#selftest-out').innerHTML = out.join('\n');
    console.log('[Zero to Unbeatable] self-test for the ' + S.depth + '-rule ladder\n' +
      out.join('\n').replace(/<[^>]+>/g, ''));
    return;
  }

  if (isNet()) {
    if (!S.neural) {
      check(true, 'no network snapshot exists yet — create learning examples first');
      out.push('<span class="ok">This screen did not run a gradient check or make a playing claim.</span>');
    } else {
      const point = S.neural.checkpoints.get(S.neural.metrics.updates);
      const base = S.neural.checkpoints.get(0);
      check(!!point, 'the current neural checkpoint has a cached independent evaluation');
      check(point && point.metrics.updates === S.neural.model.updates,
        `the cached snapshot matches ${fmt(S.neural.model.updates)} weight updates`);
      check(point && point.play.games === 100,
        'reproducible sampled comparison contains 100 fixed-seed random games');
      check(point && typeof point.policy.safe === 'boolean',
        `the exact current network policy ${point && point.policy.safe ? 'has no losing line' : 'has a losing line'}`);
      if (point && base) {
        out.push('');
        out.push(`        baseline ${base.play.wins} won, ${base.play.draws} drawn, ${base.play.losses} lost`);
        out.push(`        current  ${point.play.wins} won, ${point.play.draws} drawn, ${point.play.losses} lost`);
        out.push(`        prediction error: practiced ${point.metrics.trainMse.toFixed(3)}, kept out ${point.metrics.heldMse.toFixed(3)}`);
      }
      out.push('<span class="ok">This checks the actual displayed network snapshot. Gradient validation belongs to src/neural.test.js.</span>');
    }
    $('#selftest-out').innerHTML = out.join('\n');
    console.log('[Zero to Unbeatable] neural snapshot self-test\n' + out.join('\n').replace(/<[^>]+>/g, ''));
    return;
  }

  /* Step 3 gets sampled benchmarks and structural checks, never a
     proof — the space cannot be searched, and printing "all checks
     passed" here would read as one. */
  if (isUlt()) {
    const r = measureRng(e, 'selftest-ult');
    const local = ULT.vsHeuristic(e.brain, 100, r), random = ULT.vsRandom(e.brain, 100, r);
    const aware = ULT.vsSendAware(e.brain, 100, r);
    const b = ULT.measureBlindness(e.brain, 60, r, ULT.heuristicMove);
    check(e.brain && e.matches >= 0, 'the ultimate brain is present and measurable');
    check(local.matches === 100 && random.matches === 100 && aware.matches === 100,
      'sampled benchmarks ran: 100 matches against each of three opponents');
    check(ULT.SPACE.pictures === 18753 && ULT.SPACE.classes === 2694,
      `the state-space count is recomputed live: ${fmt(ULT.SPACE.pictures)} reachable board ` +
      `pictures, ${fmt(ULT.SPACE.classes)} up to symmetry`);
    check(typeof ULT.verifyUnbeatable === 'undefined',
      'no unbeatability proof is on offer, and none can be — that is the honest result');
    out.push('');
    out.push(`        vs board-local rules  ${local.wins} won, ${local.draws} drawn, ${local.losses} lost of 100`);
    out.push(`        vs send-aware rules   ${aware.wins} won, ${aware.draws} drawn, ${aware.losses} lost of 100`);
    out.push(`        vs random play        ${random.wins} won, ${random.draws} drawn, ${random.losses} lost of 100`);
    out.push(`        free board win taken ${Math.round(100 * b.boardWinRate)}% (control), ` +
             `match-winning move taken ${Math.round(100 * b.matchWinRate)}%`);
    out.push(fails ? `<span class="no">${fails} sampled benchmark check(s) failed for Era ${e.n}</span>`
                   : `<span class="ok">sampled benchmarks passed for Era ${e.n} — measured, not proved</span>`);
    $('#selftest-out').innerHTML = out.join('\n');
    console.log('[Zero to Unbeatable] sampled benchmarks for Era ' + e.n + '\n' +
      out.join('\n').replace(/<[^>]+>/g, ''));
    return;
  }
  /* 1. a newborn is a coin flip */
  const fresh = OG.newAgent(), r = OG.makeRng('selftest');
  const s1 = OG.sampleMoveCounts(fresh, 0, 9000, r);
  const c1 = OG.chiSquareUniform(s1.counts);
  check(c1.chi2 < 26.12,
    `newborn plays uniformly at random — chi-squared ${c1.chi2.toFixed(2)} on ${fmt(c1.n)} moves, ` +
    `df ${c1.df} (fails above 26.12, p=0.001)`);

  /* 2. exhaustive unbeatability of the era on the board */
  const v = OG.verifyUnbeatable(e.agent);
  check(v.asFirst.safe, `Era ${e.n} moving first: no losing line among ${fmt(v.asFirst.lines)} searched`);
  check(v.asSecond.safe, `Era ${e.n} moving second: no losing line among ${fmt(v.asSecond.lines)} searched`);

  /* 3. blind-spot check against uniform random play */
  const rr = OG.makeRng('blindspot');
  const b1 = OG.vsRandom(e.agent, 5000, rr, 1), b2 = OG.vsRandom(e.agent, 5000, rr, 2);
  check(b1.losses === 0, `5,000 games vs a random opponent, moving first: ${b1.losses} losses`);
  check(b2.losses === 0, `5,000 games vs a random opponent, moving second: ${b2.losses} losses`);

  out.push('');
  out.push(fails ? `<span class="no">${fails} check(s) failed for Era ${e.n}</span>`
                 : `<span class="ok">all checks passed for Era ${e.n}</span>`);
  if (!v.safe) out.push('(Era ' + e.n + ' is still beatable — that is expected until it has trained enough.)');

  $('#selftest-out').innerHTML = out.join('\n');
  console.log('[Zero to Unbeatable] self-test for Era ' + e.n + '\n' +
    out.join('\n').replace(/<[^>]+>/g, ''));
}

/* ------------------------------------------------------------------ *
 * Explainer copy
 * ------------------------------------------------------------------ */


$('#about-text').innerHTML =
  `Types of AI was built by Bryant Harrison, Murray State University. ` +
  `It runs entirely on this device: no network request is made, no account exists, ` +
  `nothing is stored, and no AI service is involved. Reloading the page returns it to Era 0. ` +
  `1a is a hand-written ${RULES.LADDER.length}-rule symbolic model with nothing learned in it. ` +
  `1b is a value table fitted by reinforcement learning; 1c is a Neural Network fitted by supervised learning to frozen table estimates. Models and learning methods are separate, combinable choices. The settings for 1b are: ` +
  `Learning rate ${OG.HP.alphaFloor}, discount ${OG.HP.gamma}, &epsilon; ${OG.HP.epsStart.toFixed(2)}→` +
  `${OG.HP.epsEnd.toFixed(2)} over ${fmt(OG.HP.epsTau)} games, ` +
  `${Math.round(OG.HP.mixSelfPlay * 100)}% self-play, ` +
  `${Math.round(OG.HP.exploringStarts * 100)}% dealt starts.`;

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

/* One place decides what each playable mode shows. Everything it hides is
   [hidden], so a mode never pays for the panels of another -- which is what
   keeps the TRAIN button above the fold in 1b with a full-height rule
   ladder living in the same column. The shell shows and hides STAGES;
   this shows and hides the activity's panels within the moved block. */
function applyMode() {
  const ult = isUlt(), rules = isRules();
  document.body.classList.toggle('step-rules', rules);
  document.body.classList.toggle('step-ult', ult);
  $('#board-wrap').hidden = ult;
  $('#ult-wrap').hidden = !ult;
  /* The board switch belongs to stage 1c: it shows for the network and
     for the ultimate extension it opens, and for nothing else. */
  $('#board-switch').hidden = !(isNet() || ult);
  $$('#board-switch .map-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.board === S.mode)));
  $('#era-select').hidden = rules || isNet();
  $('#opp-row').hidden = rules || isNet();
  $('#depth-seg').hidden = !rules;
  $('#btn-brain').hidden = rules;
  $('.ctl-brain').hidden = rules;
  $('#btn-learned').hidden = !ult || !ultimateReportAvailable();
  if (ultimateReportAvailable()) $('#btn-learned').textContent = `Review Era ${S.era} changes`;
  if (rules && S.brain) {          // the inspector reads a value table; there is not one here
    S.brain = false;
    $('#btn-brain').setAttribute('aria-pressed', 'false');
    $('#btn-brain').textContent = 'Show move scores';
    $('#brain-readout').hidden = true;
  }
  if (ult) maybeSeed();
  if (rules) renderDepthSeg();
  /* The cue belongs to the mode on screen; a rule that fired in 1a must not
     sit under 1b's board. renderTrain and renderRuleFired repaint it. */
  cue(isRules() ? '' : ult ? 'Ultimate tic-tac-toe: the learner scores each small board but cannot see where it sits or where a move sends you.'
    : isNet() ? '' : eraCue());
  /* renderRuleFired belongs here and not only in newGame(): a match has
     no rule commentary to draw, so leaving step 1 for step 3 used to
     strand the panel on screen, and on a phone that pushed TRAIN below
     the fold. One place decides what a step shows; this is it. */
  renderEraSelect(); renderTrain(); renderLearnedPanel(); renderRulesPanel(); renderRuleFired();
  renderBanner(); renderScore(); renderNetworkInspector();
  newGame();
}

$('#btn-train').addEventListener('click', () => {
  if (isNet() && S.training) { S.cancelTraining = true; return; }
  train();
});
/* 1c's board switch. Not gated on having trained: the ultimate learner is
   S.liveU, a table seeded from 1b's table by maybeSeed() inside applyMode,
   and nothing in its path reads S.neural. Switching mid-training stops the
   burst first, as a stage change does. */
$$('#board-switch .map-btn').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.board === S.mode) return;
  if (S.training) S.cancelTraining = true;
  S.mode = b.dataset.board;
  $('#selftest-out').textContent = '';
  applyMode();
}));
$('#btn-stop-training').addEventListener('click', () => { S.cancelTraining = true; });
$('#btn-newgame').addEventListener('click', newGame);
function renderPlay() { if (isUlt()) renderUlt(); else renderBoard(); }

$('#btn-brain').addEventListener('click', () => {
  S.brain = !S.brain;
  $('#btn-brain').setAttribute('aria-pressed', String(S.brain));
  $('#btn-brain').textContent = S.brain ? 'Hide move scores' : 'Show move scores';
  renderPlay();
});
$('#era-select').addEventListener('change', e => {
  S.era = +e.target.value;
  $('#selftest-out').textContent = '';
  renderScore(); renderTrain(); renderLearnedPanel(); renderBanner();
  if (!isUlt()) cue(eraCue());
  $('#btn-learned').hidden = !isUlt() || !ultimateReportAvailable();
  if (ultimateReportAvailable()) $('#btn-learned').textContent = `Review Era ${S.era} changes`;
  newGame();
});
$('#btn-learned').addEventListener('click', e => {
  if (!ultimateReportAvailable()) return;
  const era = currentEra(), prev = S.eras[S.era - 1];
  buildLearnedUlt(era, prev);
  $('#learned').showModal();
});
/* The shell opens the Details drawer; the proof line inside it is kept
   fresh here so it reflects the era and ladder on screen at that moment. */
document.addEventListener('click', e => {
  if (e.target.closest && e.target.closest('.details-trigger')) renderBanner();
}, true);
$('#btn-selftest').addEventListener('click', () => {
  $('#selftest-out').textContent = 'working…';
  setTimeout(selfTest, 30);
});
$('#chk-first').addEventListener('change', e => { S.alwaysFirst = e.target.checked; });
$('#in-seed').addEventListener('change', e => { S.seed = e.target.value.trim(); });

/* ------------------------------------------------------------------ *
 * The observation cue (A4) and the Predict cards (A2)
 * ------------------------------------------------------------------ */

/* One cue for the three playable stages, because it is one board. */
function cue(text, warm) {
  const el = $('#cue-play');
  el.textContent = text;
  el.classList.toggle('cue-warm', !!warm);
}

const PREDICT_LABELS = {
  rules: { yes: 'yes, you can beat two rules', no: 'no, two rules are enough' },
  one: { unbeatable: 'unbeatable after one burst', beatable: 'still beatable after one burst' },
  net: { same: 'held-out error about the same as practised', higher: 'held-out error clearly higher' }
};
function echoEl(key) { return $('.predict-btns[data-predict="' + key + '"]').parentElement.querySelector('.echo'); }
function echo(key, html) { const e = echoEl(key); e.innerHTML = html; e.hidden = false; }
$$('.predict-btn').forEach(b => b.addEventListener('click', () => {
  const group = b.parentElement, key = group.dataset.predict;
  $$('.predict-btn', group).forEach(x => x.setAttribute('aria-pressed', 'false'));
  b.setAttribute('aria-pressed', 'true');
  S.predictions[key] = b.dataset.answer;
  echo(key, 'You predicted: <b>' + PREDICT_LABELS[key][b.dataset.answer] + '</b>. Now try it.');
}));
/* "You predicted X; the board says Y." Called at the moment the answer
   exists; silent when no prediction was made.

   `words` names WHAT is agreeing or disagreeing. The default pair is right
   when the learner watched the answer happen (a measured ratio, a card's
   definition). It is wrong when the answer is a fact about the model that
   the learner's own game can neither prove nor refute — "unbeatable" is a
   verdict of the exhaustive search, and a learner who predicted it and then
   lost has seen nothing that contradicts them. Those callers pass words
   that say "the search", and a sentence that separates the two. */
const VERDICT_DEFAULT = { ok: 'Confirmed.', no: 'Not what happened.' };
const VERDICT_SEARCH = { ok: 'The search agrees.', no: 'The search says otherwise.' };
function revealPrediction(key, answerKey, sentence, words) {
  const p = S.predictions[key];
  if (!p) return;
  const w = words || VERDICT_DEFAULT;
  const ok = answerKey === null ? null : p === answerKey;
  echo(key, 'You predicted <b>' + PREDICT_LABELS[key][p] + '</b>. ' +
    (ok === null ? '' : ok ? '<span class="ok">' + w.ok + '</span> ' : '<span class="bad">' + w.no + '</span> ') + sentence);
}

/* Stage 1b's reveal. The prediction was about ERA 1 — "unbeatable" or
   "still beatable" after one burst — and that is a property the exhaustive
   search settles, not the learner's record. "Beatable" means a losing line
   EXISTS; it does not mean a given player finds it, and losing to a
   beatable table looks exactly like losing to an unbeatable one. So the
   sentence always states the search's verdict first, and then, once the
   learner has played Era 1, says how their own record relates to it — and
   never lets the record overrule the verdict in either direction. Called
   when Era 1 is frozen and again after every game against it. */
function revealOne() {
  const era = S.eras[1];
  if (!era || !S.predictions.one) return;
  const safe = era.verified.safe;
  const r = era.rec, n = r.w + r.d + r.l;
  const rec = `${r.w}–${r.d}–${r.l}`;
  const verdict = safe
    ? 'Era 1 has <b>no losing line</b> in either role after one burst — verified unbeatable.'
    : 'Era 1 <b>still has a losing line</b> after one burst, so it is beatable in principle.';
  let own;
  if (n === 0) {
    own = safe
      ? 'Play it: you cannot win, and a draw is the best result on offer.'
      : 'Whether you find that line is a separate question from whether it exists. Play it and look.';
  } else if (safe) {
    own = r.w > 0
      ? `Your record against it is ${rec}. A win against a policy the search called safe should not be possible; ` +
        'Settings → Run the full self-test is the tool for checking that.'
      : `Your record against it is ${rec}: no wins, which is exactly what no losing line means. ` +
        'Losing or drawing does not prove it, though — losing to a beatable table looks the same. The search is what settles it.';
  } else {
    own = r.w > 0
      ? `Your record against it is ${rec}: you found a losing line yourself.`
      : `Your record against it is ${rec}: you have not found the line yet. That says something about your play, ` +
        'not about the table — a losing line exists whether or not this game found it.';
  }
  revealPrediction('one', safe ? 'unbeatable' : 'beatable', verdict + ' ' + own, VERDICT_SEARCH);
}

/* ------------------------------------------------------------------ *
 * Stage 1d — the training-method cards
 * ------------------------------------------------------------------ */

const USES_LABEL = { '1a': '1a Symbolic AI', '1b': '1b Value table', '1c': '1c Neural Network' };
const METHOD_CUE = {
  /* The "in this demo" answer lives HERE and nowhere on the card face
     (operator, 2026-09-16: the Supervised card's visible text gave away what
     pressing it reveals). A card shows the general definition, an example
     and its "used for" line; the press writes which playable model used it. */
  supervised: '1c: the network fits frozen scores that a fresh 1b table produced — inputs paired with targets, and the targets came from another model, not a person. A student fitting a teacher\u2019s outputs is the shape of distillation.',
  reinforcement: '1b: the table updates a position value after each win, loss and draw it plays in training, including games against itself — rewards, not targets.',
  none: '1a: eight rules are fixed text; nothing in it is fitted, and the only way its play changes is switching rules on or off.',
  unsupervised: 'none of the three: no playable model here looks for structure without a target or a reward.',
  'self-supervised': 'none of the three: 1b plays itself, but it learns from game rewards, so that is reinforcement learning, not self-supervision.',
  'semi-supervised': 'none of the three: nothing here mixes a small labelled set with a larger unlabelled one.'
};
function renderMethods() {
  $$('.method-card').forEach(c => {
    const on = c.dataset.method === S.method;
    c.setAttribute('aria-pressed', String(on));
    const uses = c.dataset.uses.split(',').filter(Boolean).map(k => USES_LABEL[k]).join(' · ');
    $('.uses', c).textContent = on ? uses : '';
  });
  const out = $('#cue-4');
  if (!S.method) { out.textContent = ''; return; }
  const card = $('.method-card[data-method="' + S.method + '"]');
  out.textContent = $('b', card).textContent + ' → ' + METHOD_CUE[S.method];
}
$$('.method-card').forEach(c => c.addEventListener('click', () => {
  S.method = S.method === c.dataset.method ? null : c.dataset.method;
  renderMethods();
}));

/* The other half of 1d: the architecture families, along the axis the
   stage's own refresh line defines -- what a model STORES and how it
   COMPUTES an answer. These restate the card text under the same Reasoned
   kicker; no figure and no external claim is made. */
const FAMILY_CUE = {
  linear:   { stores: 'one learned coefficient per input feature, plus an offset', computes: 'a weighted sum of the features — squashed into a probability for the logistic kind' },
  tree:     { stores: 'a tree of learned yes/no questions with an answer at each leaf', computes: 'the route one example takes down the tree, one question at a time' },
  ensemble: { stores: 'many trees, or a sequence of them', computes: 'a combination of their answers — a vote or an average, or a running total of corrections' },
  knn:      { stores: 'the training examples themselves', computes: 'a distance from the new example to each stored one, then an answer from the closest few' },
  svm:      { stores: 'a boundary, pinned by the examples nearest to it and their weights', computes: 'which side of the boundary a new example falls, and how far from it' },
  bayes:    { stores: 'probabilities — what was believed before, and how each kind of evidence shifts it', computes: 'an updated probability once the evidence arrives' }
};
function renderFamilies() {
  $$('.family-card').forEach(c => {
    const on = c.dataset.family === S.family;
    c.setAttribute('aria-pressed', String(on));
    $('.holds', c).textContent = on ? 'stores · computes — below' : '';
  });
  const out = $('#cue-4b');
  if (!S.family) { out.textContent = ''; return; }
  const card = $('.family-card[data-family="' + S.family + '"]'), f = FAMILY_CUE[S.family];
  out.textContent = $('b', card).textContent + ' → stores ' + f.stores + '; computes ' + f.computes + '.';
}
$$('.family-card').forEach(c => c.addEventListener('click', () => {
  S.family = S.family === c.dataset.family ? null : c.dataset.family;
  renderFamilies();
}));
/* The third part of 1d: ways behaviour changes while the trained
   parameters do not. The cards carry the Sourced general claim; the press
   writes the Reasoned line about this demo, read from its code:
   rules.js forkCells / rule 4 try each empty square on a copy of the board
   (a look-ahead redone every turn, nothing fitted), and OG.verifyPolicyRole
   in engine.js is a CHECKER of a policy -- it never chooses a move in play,
   so this line must not say the demo's search changes how anything plays. */
const NOCHANGE_CUE = {
  context: 'nothing in this demo reads a prompt. The nearest case is 1b\u2019s question: its eras are frozen, so a different result against one comes from how the game went, not from anything it learned.',
  retrieval: 'nothing in this demo looks anything up in an outside store. 1b\u2019s table is read on every move, but it is the model\u2019s own learned values, not an external memory.',
  search: '1a. Rules 3 and 4 try each empty square on a copy of the board and count the threats it would make — a small look-ahead, redone every turn, with nothing learned. The exhaustive search elsewhere in this demo is different: it checks a player for losing lines and never picks a move.'
};
function renderNochange() {
  $$('.nochange-card').forEach(c => {
    const on = c.dataset.nochange === S.nochange;
    c.setAttribute('aria-pressed', String(on));
    $('.holds', c).textContent = on ? 'in this demo — below' : '';
  });
  const out = $('#cue-4c');
  if (!S.nochange) { out.textContent = ''; return; }
  const card = $('.nochange-card[data-nochange="' + S.nochange + '"]');
  out.textContent = $('b', card).textContent + ' → in this demo: ' + NOCHANGE_CUE[S.nochange];
}
$$('.nochange-card').forEach(c => c.addEventListener('click', () => {
  S.nochange = S.nochange === c.dataset.nochange ? null : c.dataset.nochange;
  renderNochange();
}));
/* Which part of 1d is showing. Three buttons, one card visible at a time;
   the stage's check card and the Details drawer are outside all of them. */
const HALVES = { methods: '#methods-card', families: '#families-card', nochange: '#nochange-card' };
function renderHalf() {
  /* Scoped to #map-switch: the 1c board switch reuses the .map-btn look
     and must not be driven by 1d's state (found in the browser pass). */
  $$('#map-switch .map-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.half === S.half)));
  Object.entries(HALVES).forEach(([half, sel]) => { $(sel).hidden = S.half !== half; });
}
$$('#map-switch .map-btn').forEach(b => b.addEventListener('click', () => { S.half = b.dataset.half; renderHalf(); }));

/* ------------------------------------------------------------------ *
 * Model types — built from src/model-types.js, the dated Hugging Face
 * catalogue. Nothing here fetches; the links are the learner's to follow.
 * ------------------------------------------------------------------ */

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderTypes() {
  const T = MODEL_TYPES;
  $('#types-qual').textContent = 'Hugging Face task catalogue, fetched ' + T.FETCHED;
  $('#types-title').textContent = T.FEATURED.length === 12 ? 'Twelve types you will meet first' : T.FEATURED.length + ' types you will meet first';
  $('#type-grid').innerHTML = T.FEATURED.map(f =>
    `<details class="type-card" data-slug="${f.slug}"><summary><b>${esc(f.name)}</b>` +
    `<span class="io"><i>${esc(f.in)}</i> in &rarr; <i>${esc(f.out)}</i> out</span>` +
    (f.also ? `<span class="also">also called: ${esc(f.also)}</span>` : '') + `</summary>` +
    `<div class="body"><q>${esc(f.quote)}</q>` +
    `<span class="n">${fmt(f.n)} models filed under ${esc(f.name)} on ${T.FETCHED} · group: ${esc(f.group)}</span>` +
    `<a href="${f.models}" target="_blank" rel="noopener">Browse models of this type on Hugging Face &rarr;</a> ` +
    `<a href="${f.page}" target="_blank" rel="noopener">Task page &rarr;</a></div></details>`).join('');
  $('#all-types-lede').textContent = `${T.count} types in ${T.GROUPS.length} groups, in the catalogue's own order, with the model count each carried on ${T.FETCHED}. The hub listed ${fmt(T.SOURCES.hubTotal)} models in total that day.`;
  $('#type-groups').innerHTML = T.GROUPS.map(g =>
    `<h4>${esc(g.name)}</h4><div class="type-chips">` + g.tasks.map(t =>
      `<a class="type-chip" href="${T.modelsUrl(t.slug)}" target="_blank" rel="noopener" aria-label="${esc(t.name)}, ${fmt(t.n)} models on Hugging Face">${esc(t.name)}<small>${fmt(t.n)}</small></a>`).join('') + '</div>').join('');
  $$('.type-card').forEach(d => d.addEventListener('toggle', () => {
    if (!d.open) return;
    const f = T.FEATURED.find(x => x.slug === d.dataset.slug);
    $('#cue-5').textContent = `${f.name}: ${f.in} in, ${f.out} out. That is the whole definition of the type; it says nothing about what is inside.`;
  }));
  /* Beyond one catalogue: built from T.BEYOND, each link the model's own
     page as recorded in the data, never typed into the markup. Always open
     (no press): the example and its link are the content. A stand-in card
     says so on its face. */
  $('#beyond-grid').innerHTML = T.BEYOND.map(b =>
    `<article class="type-card beyond-card"><b>${esc(b.type)}</b>` +
    `<span class="io"><i>${esc(b.in)}</i> in &rarr; <i>${esc(b.out)}</i> out</span>` +
    `<span class="also">example: ${esc(b.example)} (${esc(b.org)})` +
    (b.standIn ? ' &mdash; one current example of the type' : '') + `</span>` +
    `<div class="body"><q>${esc(b.quote)}</q>` +
    `<span class="n"><span class="k-sourced">Sourced</span> fetched ${esc(b.fetched)}</span>` +
    `<a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.example)} &mdash; its own page &rarr;</a></div></article>`).join('');
}
renderTypes();

/* ------------------------------------------------------------------ *
 * The shell's two events
 * ------------------------------------------------------------------ */

const PLAYABLE = ['rules', 'one', 'net'];
function setLens(lens) {
  document.body.dataset.lens = lens;
  $$('.lens-btn').forEach(b => {
    const on = b.dataset.lens === lens;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}
/* A tab was selected. The shell has already shown the panel; this moves the
   one shared board into that stage's host and repaints it for the mode the
   stage teaches. Stages 4 and 5 are maps and host nothing.

   THE RESET ORDERING HAZARD (ADOPTING.md §4 step 7). The shell's Reset calls
   selectStage(0) — which fires `stagechange` — BEFORE it dispatches
   `lessonreset`, so a handler that renders from activity state renders the
   PRE-reset state into freshly reset chrome. This demo cannot make
   `stagechange` chrome-only: the board is one element moved between three
   stage hosts, so a tab change genuinely has to repaint the activity. So the
   reset path is made to render EXACTLY ONCE instead, from `lessonreset`:
   `onReset` (consulted by the shell before anything else, and passed through)
   raises S.resetting, this handler then does the chrome half only — stage
   index, lens, and moving the board home — and the `lessonreset` handler
   lowers the flag and does the single authoritative render. Without the flag
   the final state is still correct, because `lessonreset` fires last and
   repaints; the flag is what makes that a guarantee rather than an ordering
   coincidence, and it stops the stale paint being visible for a frame. */
function onStage(index) {
  S.stage = index;
  const lens = index >= 4 ? 'types' : 'architecture';
  const lensChanged = document.body.dataset.lens !== lens;
  setLens(lens);
  if (lensChanged && document.activeElement && document.activeElement.classList.contains('stage-tab')
      && !document.activeElement.offsetParent) {
    $('.lens-btn[data-lens="' + lens + '"]').focus();
  }
  if (index < 3) {
    const host = $('#host-' + (index + 1)), act = $('#activity');
    if (act.parentElement !== host) host.appendChild(act);
    const mode = (index === 2 && isUlt()) ? 'ult' : PLAYABLE[index];
    if (mode !== S.mode) {
      if (S.training) S.cancelTraining = true;
      S.mode = mode;
      $('#selftest-out').textContent = '';
      if (!S.resetting) applyMode();
    }
  } else if (S.training) {
    S.cancelTraining = true;
  }
}
document.addEventListener('stagechange', e => onStage(e.detail.index));
/* Not a veto: it returns a truthy value so the reset proceeds. It exists only
   to mark the window in which `stagechange` must not paint (see onStage). */
window.lessonShell.onReset = () => { S.resetting = true; return true; };
$$('.lens-btn').forEach(b => b.addEventListener('click', () => window.lessonShell.selectStage(+b.dataset.stage)));

/* Reset, in place (kit v2). The shell has already closed every dialog,
   restored the tabs, the check cards, the .echo lines and the .obs-cue
   lines, sent the drawer back to stage 1, selected stage 1 (which ran
   onStage(0) above: board moved home, mode 'rules', applyMode) and scrolled
   to the top. This is the half only this file can know about.

   THE ENUMERATION, written before the handler:
     S.* — every property resetAll(true) already rewound for the old
       in-place reset (this demo never reloaded): the rng streams, the live
       agents, the neural model and teacher session, the era list, era,
       records, depth, brain, lastRule, lastLearned, humanFirstNext, and
       the burst sizes and the ultimate match/focus added for this pass.
       S.seed is READ from the seed field (a rehearsal seed is the reason
       Reset exists), S.alwaysFirst is a preference and stays.
     S.predictions, S.method, S.stage — the fields this pass added.
     Generated DOM: every .predict-btn's aria-pressed; every .method-card's
       aria-pressed and .uses text (renderMethods); every .type-card
       <details> closed; #cue-4 and #cue-5 (renderMethods empties #cue-4;
       #cue-5 is a .obs-cue and the shell restored it); the three
       #banner-* hosts (renderBanner via applyMode repaints the current one
       and empties the others); #learned-body and the learned subtitle;
       #network-view's dataset.layer / dataset.neuron (the inspector's
       build-once state) and its innerHTML (repainted by applyMode);
       #selftest-out (resetAll); #montage hidden (resetAll).
     Form controls: #in-seed keeps its value on purpose; #era-select is
       rebuilt by renderEraSelect; the burst and depth segments are rebuilt
       by renderTrain / renderDepthSeg.
     DELIBERATELY NOT RESTORED, because it is unobservable: the #btn-train
       label and #train-sub still read whatever the neural stage left there.
       resetAll's applyMode lands on 1a, where renderTrain sets
       #train-panel[hidden] and returns before touching them, so the stale
       text sits inside a hidden panel; renderTrain rewrites both
       unconditionally when 1b or 1c is next visited, before the panel can be
       seen. Measured in the browser: "Train network" immediately after Reset,
       "Create learning examples" on arriving at 1c. Stated rather than
       assumed, per ADOPTING.md's enumeration discipline.
     Not touched: presentation mode and the Guide (the shell's rule). */
document.addEventListener('lessonreset', () => {
  S.resetting = false;
  S.cancelTraining = true;
  S.seed = $('#in-seed').value.trim();
  S.predictions = {};
  S.method = null; S.family = null; S.nochange = null; S.half = 'methods';
  $$('.predict-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
  $$('.type-card').forEach(d => { d.open = false; });
  $('#learned-body').innerHTML = '';
  $('#learned-sub').textContent = '';
  const nv = $('#network-view');
  delete nv.dataset.layer; delete nv.dataset.neuron;
  renderMethods(); renderFamilies(); renderNochange(); renderHalf();
  resetAll(true);
});

/* ------------------------------------------------------------------ */

resetAll();
renderScore();
renderMethods(); renderFamilies(); renderNochange(); renderHalf();
/* The shell may already have selected a stage from a #stage-N hash before
   this script ran, and the old public deep links (#rules, #learning,
   #neural) are honoured through the flags the shell parsed. */
{
  const F = window.lessonShell.flags;
  const legacy = F.has('neural') ? 2 : F.has('learning') ? 1 : F.has('rules') ? 0 : null;
  if (legacy !== null) window.lessonShell.selectStage(legacy);
  else onStage(Math.max(0, $$('.stage-tab').findIndex(t => t.getAttribute('aria-selected') === 'true')));
}
console.log('[Zero to Unbeatable] ready. Era 0 knows nothing: every value in its table is zero, ' +
            'so every legal move ties and it picks uniformly at random.');

})();
