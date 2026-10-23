/* ==========================================================================
   The Pace of AI Progress — engine.

   Pure functions: date and value scaling, the guess curve, and the scoring
   that turns "the line you drew" into "the factor you were out by". No DOM,
   no canvas — so node can test all of it.
   ========================================================================== */

const ENGINE = (() => {

/* ---- dates --------------------------------------------------------------- */

const DAY = 86400000;

/** ISO date string -> epoch ms. Parsed as UTC so the chart does not shift
 *  by a day depending on which side of the Atlantic the laptop is on. */
function t(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoOf(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(ms, style) {
  const d = new Date(ms);
  if (style === 'short') return MONTHS[d.getUTCMonth()] + ' ’' + String(d.getUTCFullYear()).slice(2);
  if (style === 'year')  return String(d.getUTCFullYear());
  return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

/**
 * Time-axis ticks.
 *
 * Picks a month step so the axis carries roughly four to seven marks whatever
 * the span. The first version drew a gridline only at each 1 January, which
 * meant the bug-fixing round — sixteen months wide — had exactly ONE labelled
 * mark on its x axis. A reader cannot get the scale off a single tick: they
 * cannot tell whether the gap they are being asked to forecast across is three
 * months or three years, which is the one thing they need in order to answer.
 */
function timeTicks(t0, t1, target) {
  const want = target || 8;
  const months = (t1 - t0) / (30.44 * DAY);
  const steps = [1, 2, 3, 6, 12, 24, 60];
  let step = steps[steps.length - 1];
  for (const s of steps) if (months / s <= want) { step = s; break; }

  const d0 = new Date(t0);
  let y = d0.getUTCFullYear();
  let m = Math.ceil(d0.getUTCMonth() / step) * step;
  while (m >= 12) { m -= 12; y++; }

  const out = [];
  for (let guard = 0; guard < 500; guard++) {
    const ms = Date.UTC(y, m, 1);
    if (ms > t1) break;
    if (ms >= t0) out.push({ ms, step, major: m === 0 });
    m += step;
    while (m >= 12) { m -= 12; y++; }
  }
  return out;
}

/** Label for a time tick. Sub-year steps carry the year too — "Apr" alone is
 *  ambiguous on an axis spanning more than one of them. */
function tickLabel(ms, step) {
  const d = new Date(ms);
  if (step >= 12) return String(d.getUTCFullYear());
  return MONTHS[d.getUTCMonth()] + ' \u2019' + String(d.getUTCFullYear()).slice(2);
}

/* ---- value formatting ---------------------------------------------------- */

/** Minutes -> the unit a human would actually say out loud. */
function fmtMinutes(v) {
  if (v < 1)   return Math.round(v * 60) + ' sec';
  if (v < 90)  return round(v, 1) + ' min';
  const h = v / 60;
  if (h < 48)  return round(h, 1) + ' hr';
  return round(h / 24, 1) + ' days';
}

function fmtValue(v, unit) {
  if (unit === 'min') return fmtMinutes(v);
  if (unit === '$')   return '$' + (v >= 1 ? round(v, 2) : v.toFixed(2));
  return round(v, 1) + '%';
}

function round(v, dp) {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

/* ---- scales -------------------------------------------------------------- */

/** Maps a domain to [0,1]. Log scale clamps at a floor so a zero datum (which
 *  ARC-AGI-1 legitimately has) does not blow up — linear rounds never use it. */
function makeScale(kind, min, max) {
  if (kind === 'log') {
    const lo = Math.log10(Math.max(min, 1e-6));
    const hi = Math.log10(max);
    return {
      kind,
      to:   v => (Math.log10(Math.max(v, min)) - lo) / (hi - lo),
      from: u => Math.pow(10, lo + u * (hi - lo)),
      min, max
    };
  }
  return {
    kind: 'linear',
    to:   v => (v - min) / (max - min),
    from: u => min + u * (max - min),
    min, max
  };
}

/**
 * Durations a person would actually say out loud. A log axis built from the
 * usual 1-2-5 ladder produced "1.7 hr", "3.3 hr", "16.7 hr" and "33.3 hr" on
 * the task-length round — arithmetically correct, and meaningless to read.
 * Nobody thinks in 3.3 hours. These are the round numbers of time.
 */
const DURATIONS = [1, 2, 5, 10, 15, 30, 60, 120, 240, 480, 720, 1440, 2880, 5760, 10080];

/** Pick durations spread evenly in log space, so the axis stays legible
 *  whatever range it covers. */
function durationTicks(min, max, count) {
  const want = count || 7;
  const cands = DURATIONS.filter(v => v >= min && v <= max);
  if (cands.length <= want) return cands;
  const gap = Math.log10(max / min) / (want - 1);
  const out = [];
  let last = -Infinity;
  for (const v of cands) {
    const l = Math.log10(v);
    if (l - last >= gap - 1e-9) { out.push(v); last = l; }
  }
  return out;
}

/** Every value on the ladder divides cleanly, so these labels never carry a
 *  decimal point. That is the whole point of the ladder. */
function fmtDurationTick(v) {
  if (v < 60) return v + ' min';
  if (v < 1440) return (v / 60) + ' hr';
  const d = v / 1440;
  return d + (d === 1 ? ' day' : ' days');
}

/** Nice tick values for an axis. A log axis thins from a 1-2-5 ladder to 1-5
 *  and then to decades rather than stacking eleven gridlines on a 300px plot. */
function ticks(scale, count) {
  if (scale.kind === 'log') {
    const want = count || 7;
    const lo = Math.floor(Math.log10(scale.min));
    const hi = Math.ceil(Math.log10(scale.max));
    let last = [];
    for (const mults of [[1, 2, 5], [1, 5], [1]]) {
      const out = [];
      for (let e = lo; e <= hi; e++) {
        for (const m of mults) {
          const v = round(m * Math.pow(10, e), 10);
          if (v >= scale.min && v <= scale.max) out.push(v);
        }
      }
      last = out;
      if (out.length <= want) return out;
    }
    return last;
  }
  const step = niceStep((scale.max - scale.min) / (count || 5));
  const out = [];
  for (let v = Math.ceil(scale.min / step) * step; v <= scale.max + 1e-9; v += step) out.push(round(v, 6));
  return out;
}

function niceStep(raw) {
  const e = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / e;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * e;
}

/* ---- the guess curve ----------------------------------------------------- */

/** The guess is stored as an array of {x, y} in unit space (0..1 across the
 *  predicted region, 0..1 up the value axis), built by dragging. It is
 *  resampled onto a fixed grid so that a fast drag with sparse pointer events
 *  and a slow one produce the same object. */
const GUESS_N = 64;

function emptyGuess(y0) {
  const pts = [];
  for (let i = 0; i < GUESS_N; i++) pts.push({ x: i / (GUESS_N - 1), y: y0 });
  return pts;
}

/** Paint a drag sample into the guess: sets the nearest grid column and
 *  linearly fills any columns skipped since the last sample, so a quick swipe
 *  leaves a continuous line rather than a dotted one. */
function paint(guess, x, y, lastX) {
  const clampedX = clamp(x, 0, 1), clampedY = clamp(y, 0, 1);
  const i = Math.round(clampedX * (GUESS_N - 1));
  if (lastX == null) { guess[i] = { x: i / (GUESS_N - 1), y: clampedY }; return i; }
  const j = Math.round(clamp(lastX, 0, 1) * (GUESS_N - 1));
  const from = Math.min(i, j), to = Math.max(i, j);
  const yFrom = j <= i ? guess[j].y : clampedY;
  const yTo   = j <= i ? clampedY   : guess[j].y;
  for (let k = from; k <= to; k++) {
    const f = to === from ? 1 : (k - from) / (to - from);
    guess[k] = { x: k / (GUESS_N - 1), y: yFrom + (yTo - yFrom) * f };
  }
  return i;
}

/** Has the room actually drawn something, or just tapped once? */
function guessDrawn(guess, y0) {
  return guess.some(p => Math.abs(p.y - y0) > 0.004);
}

/** A forecast is an answer over time, not a changed pixel in its middle. The
 * ask-date endpoint must be deliberately touched and the line must cover most
 * of the unknown period before scoring can use it. */
function guessComplete(guess, y0) {
  const changed = guess.map((p, i) => Math.abs(p.y - y0) > 0.004 ? i : -1).filter(i => i >= 0);
  if (!changed.length) return false;
  const first = changed[0] / (GUESS_N - 1);
  const last = changed[changed.length - 1] / (GUESS_N - 1);
  return first <= 0.15 && last >= 0.95 && last - first >= 0.70;
}

function guessAt(guess, x) {
  const u = clamp(x, 0, 1) * (GUESS_N - 1);
  const i = Math.floor(u), f = u - i;
  if (i >= GUESS_N - 1) return guess[GUESS_N - 1].y;
  return guess[i].y + (guess[i + 1].y - guess[i].y) * f;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/* ---- scoring ------------------------------------------------------------- */

/** Compare the drawn endpoint with the final selected measurement.
 * The legacy direction-adjusted ratio remains available to numerical tests;
 * UI copy compares actual values directly so a falling price stays clear.
 */
function score(round_, guess) {
  const truth = finalValue(round_);
  const scale = makeScale(round_.scale, round_.yMin, round_.yMax);
  const predicted = scale.from(guessAt(guess, 1));
  const falling = isFalling(round_);

  const ratio = falling
    ? (predicted <= 0 ? Infinity : predicted / truth)
    : (predicted <= 0 ? Infinity : truth / predicted);

  return {
    predicted,
    truth,
    ratio,
    miss: isFinite(ratio) ? Math.max(ratio, 1 / ratio) : Infinity,
    under: ratio > 1.0,
    /* Percentage-point gap is still shown for the linear rounds, where it is
       the unit the audience already thinks in. */
    points: round_.unit === '%' ? truth - predicted : null,
    falling
  };
}

function isFalling(round_) {
  const all = allPoints(round_);
  return all[all.length - 1].value < all[0].value;
}

function allPoints(round_) {
  return round_.shown.concat(round_.hidden);
}

function finalValue(round_) {
  const h = round_.hidden;
  return h[h.length - 1].value;
}

/** Median of the per-round ratios, for the closing card. Median rather than
 *  mean because one Infinity (someone drew a flat line on the price round)
 *  should not eat the summary. */
function medianRatio(results) {
  const rs = results.map(r => r.ratio).filter(r => isFinite(r)).sort((a, b) => a - b);
  if (!rs.length) return null;
  const m = Math.floor(rs.length / 2);
  return rs.length % 2 ? rs[m] : (rs[m - 1] + rs[m]) / 2;
}

/* ---- the invented forecast scenario --------------------------------------
   The trend-fitting helpers that used to live here (doublingDays, cadence)
   were removed 2026-09-16: neither was called, and a least-squares doubling
   fit is exactly the extrapolation this demo teaches against. METR's own
   doubling times are quoted from METR, not fitted here. */

/** Deliberately invented score rules; no relationship to benchmark data. */
function scenarios(years) {
  return [
    { name:'Fixed yearly gain',value:30+10*years,note:'Add 10 points each year.' },
    { name:'Fixed proportional gain',value:30*Math.pow(1.5,years),note:'Multiply by 1.5 each year.' },
    { name:'Slowing toward a limit',value:75-45*Math.pow(9/11,years),note:'Approach an assumed ceiling of 75.' }
  ];
}

return {
  scenarios,
  t, isoOf, fmtDate, fmtValue, fmtMinutes, round, clamp,
  makeScale, ticks, niceStep, timeTicks, tickLabel, durationTicks, fmtDurationTick,
  GUESS_N, emptyGuess, paint, guessDrawn, guessComplete, guessAt,
  score, medianRatio, allPoints, finalValue, isFalling, DAY
};
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
