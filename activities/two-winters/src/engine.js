/* ==========================================================================
   Two Winters — the engine.

   Pure functions only: date handling, scale maths, and the scoring for the
   prediction round. Nothing here touches the DOM, so node can require it and
   the test suite can hold it to account.
   ========================================================================== */

const ENGINE = (() => {

const DAY = 86400000;

/** ISO date -> epoch ms, parsed as UTC so the app behaves the same in every
 *  timezone. `new Date('1958-07-08')` is already UTC, but the explicit split
 *  survives someone later passing '1958-7-8'. */
function t(iso) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(iso).trim());
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

function isoOf(ms) {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** 'Jul 1958' / '1958' — never locale-dependent, so a screenshot from one
 *  machine matches the test expectations on another. */
function fmtDate(ms, style) {
  const d = new Date(ms);
  if (style === 'year') return String(d.getUTCFullYear());
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function yearOf(ms) { return new Date(ms).getUTCFullYear(); }

/** Show only as much of a date as was actually verified. An event whose day is
 *  unknown is stored on the 1st so it can be sorted and plotted, and `p` says
 *  how much of it to print: 'y' year only, 'm' month and year, 'd' full date.
 *  Printing "Jan 1969" for a book whose publication month nobody checked is a
 *  small fabrication, and this demo does not get to make small ones. */
function fmtEventDate(ms, p) {
  if (p === 'y') return fmtDate(ms, 'year');
  if (p === 'm' || p === undefined) return fmtDate(ms);
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const lerp = (a, b, u) => a + (b - a) * u;

/** Year <-> 0..1 across the app's fixed window. */
function makeYearScale(y0, y1) {
  return {
    y0, y1,
    to: y => clamp((y - y0) / (y1 - y0), 0, 1),
    from: u => y0 + clamp(u, 0, 1) * (y1 - y0),
    toMs: ms => clamp((ms - Date.UTC(y0, 0, 1)) / (Date.UTC(y1, 0, 1) - Date.UTC(y0, 0, 1)), 0, 1)
  };
}

/** Decade ticks inside a year window, always including the ends. */
function decadeTicks(y0, y1, step) {
  const s = step || 10;
  const out = [];
  for (let y = Math.ceil(y0 / s) * s; y <= y1; y += s) out.push(y);
  if (out[0] !== y0) out.unshift(y0);
  if (out[out.length - 1] !== y1) out.push(y1);
  return out;
}

/* --------------------------- stepping the timeline ----------------------
   Lives here rather than in the canvas so the test suite can hold it to
   account. It has already been wrong twice: once because the cursor round
   trip through a 0..1 fraction lost a few hours and left an event
   unreachable, and once because parking the cursor just PAST an event made
   the back button re-select that same event forever.

   The contract: `at` is where the cursor is; a caller that parks the cursor
   on an event parks it at `event.at + STEP_EPS / 2`. Forward looks strictly
   more than STEP_EPS ahead, backward strictly more than STEP_EPS behind, so
   the event currently under the cursor is excluded in both directions.
   ---------------------------------------------------------------------- */

const STEP_EPS = 86400000;   /* one day; every gap in the dataset is far wider */

/** The next (dir > 0) or previous (dir < 0) event from `at`, or null at an end.
 *  `events` must be sorted ascending by `.at`. */
function stepTarget(events, at, dir) {
  if (dir > 0) {
    for (let i = 0; i < events.length; i++) if (events[i].at > at + STEP_EPS) return events[i];
  } else {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].at < at - STEP_EPS) return events[i];
  }
  return null;
}

/** Where to park the cursor so an event is unambiguously "reached". */
function parkAt(event) { return event.at + STEP_EPS / 2; }

/* ------------------------------ scoring --------------------------------
   Two independent judgements per card: how close the year guess was, and
   whether the verdict was right. They are kept separate on purpose — the
   demo's argument is about the verdict half, and mixing them into one
   number would hide it.
   ---------------------------------------------------------------------- */

/** Years off, as a non-negative integer. */
function yearMiss(guess, actual) { return Math.abs(Math.round(guess) - actual); }

/** A band label for a year guess, so the reveal can say something in words.
 *  Boundaries are inclusive-below: 0-3 close, 4-10 near, 11-25 out, else far. */
function missBand(miss) {
  if (miss <= 3) return 'close';
  if (miss <= 10) return 'near';
  if (miss <= 25) return 'out';
  return 'far';
}

const BAND_TEXT = {
  close: 'Within three years.',
  near:  'Within a decade.',
  out:   'Off by a couple of decades.',
  far:   'Off by more than a generation.'
};

/** A verdict guess is correct when it matches. 'open' cards are never scored
 *  either way — they are shown, not marked, because marking an unresolved
 *  claim would be exactly the error this demo is about. */
function verdictCorrect(guess, actual) {
  if (actual === 'open' || actual === 'context') return null;
  if (actual === 'late') return guess === 'no';   /* "did it come true in the window it named?" -> no */
  return guess === actual;
}

/** Roll up a run. Split by `kind` so the scorecard can show the thing that
 *  matters: whether the room is worse at judging promises or dismissals. */
function tally(cards, answers) {
  const acc = {
    answered: 0, scored: 0, verdictRight: 0,
    missTotal: 0, missCount: 0,
    byKind: {},
    open: 0
  };
  for (const c of cards) {
    const a = answers[c.id];
    if (!a) continue;
    acc.answered++;
    if (typeof a.year === 'number') { acc.missTotal += yearMiss(a.year, c.year); acc.missCount++; }
    const ok = verdictCorrect(a.verdict, c.verdict);
    if (ok === null) { acc.open++; continue; }
    acc.scored++;
    if (ok) acc.verdictRight++;
    const k = acc.byKind[c.kind] || (acc.byKind[c.kind] = { n: 0, right: 0 });
    k.n++; if (ok) k.right++;
  }
  acc.medianMiss = acc.missCount ? acc.missTotal / acc.missCount : null;
  return acc;
}

/** The sentence the scorecard leads with. Deliberately refuses to congratulate
 *  a small sample: under four scored cards it says so instead of scoring. */
function verdictSentence(acc) {
  if (acc.scored < 4) return 'Not enough answered to say anything useful — go back and do a few more.';
  const p = acc.verdictRight / acc.scored;
  if (p >= 0.8) return 'You read this record well. Most rooms do not.';
  if (p >= 0.5) return 'About the same as chance-plus-a-bit, which is where most rooms land.';
  return 'You did worse than guessing — which usually means one confident rule was applied to every card.';
}

return {
  DAY, t, isoOf, fmtDate, fmtEventDate, yearOf, clamp, lerp,
  makeYearScale, decadeTicks, STEP_EPS, stepTarget, parkAt,
  yearMiss, missBand, BAND_TEXT, verdictCorrect, tally, verdictSentence
};
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
