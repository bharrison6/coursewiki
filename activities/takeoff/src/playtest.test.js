#!/usr/bin/env node
/* Numerical regressions, source-graph controls, and offline/guide contract checks. Source truth requires a separate audit. */

const fs = require('fs');
const path = require('path');
const D = require('./data.js');
const E = require('./engine.js');

let pass = 0, fail = 0;
const results = [];

function ok(name, cond, detail) {
  if (cond) { pass++; results.push(['PASS', name, detail]); }
  else { fail++; results.push(['FAIL', name, detail]); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

/* ======================= 1. dates and formatting ========================= */

ok('ISO dates parse as UTC', E.t('2024-01-01') === Date.UTC(2024, 0, 1));
ok('Dates round-trip', E.isoOf(E.t('2025-11-24')) === '2025-11-24');
ok('Date formatting is stable across timezones',
   E.fmtDate(E.t('2023-03-14')) === 'Mar 2023',
   E.fmtDate(E.t('2023-03-14')));
ok('Minutes format as minutes', E.fmtMinutes(45) === '45 min', E.fmtMinutes(45));
ok('Long horizons format as hours', E.fmtMinutes(678) === '11.3 hr', E.fmtMinutes(678));
ok('Sub-minute horizons format as seconds', E.fmtMinutes(0.033) === '2 sec', E.fmtMinutes(0.033));

/* ============================= 2. scales ================================= */

{
  const lin = E.makeScale('linear', 0, 100);
  ok('Linear scale maps min to 0', lin.to(0) === 0);
  ok('Linear scale maps max to 1', lin.to(100) === 1);
  ok('Linear scale inverts', near(lin.from(lin.to(37.4)), 37.4, 1e-9));

  const log = E.makeScale('log', 1, 1000);
  ok('Log scale maps min to 0', near(log.to(1), 0, 1e-9));
  ok('Log scale maps max to 1', near(log.to(1000), 1, 1e-9));
  ok('Log scale puts a decade at a third', near(log.to(10), 1 / 3, 1e-9));
  ok('Log scale inverts', near(log.from(log.to(42)), 42, 1e-6));
  ok('Log scale clamps below its floor rather than returning -Infinity',
     isFinite(log.to(0)), String(log.to(0)));
}

ok('Log ticks span the decades', E.ticks(E.makeScale('log', 1, 1000), 5).includes(100));
ok('Linear ticks are round numbers',
   E.ticks(E.makeScale('linear', 0, 100), 5).every(v => v % 5 === 0));

/* ====================== 2b. axis values a person can read ================
   A log axis built from the 1-2-5 ladder gave the task-length round eleven
   gridlines reading "1.7 hr", "3.3 hr", "16.7 hr" and "33.3 hr". Correct
   arithmetic; nobody thinks in 3.3 hours.
   ======================================================================== */

{
  const t = E.durationTicks(1, 4000, 7);
  ok('The duration axis produces a handful of ticks', t.length >= 4 && t.length <= 8, t.length + '');
  const labels = t.map(E.fmtDurationTick);
  ok('No duration label carries a decimal point', labels.every(l => !/\./.test(l)), labels.join(' '));
  ok('Duration labels use units a person says out loud',
     labels.every(l => /^\d+ (min|hr|days?)$/.test(l)), labels.join(' | '));
  ok('The duration ladder is in order', t.every((v, i) => i === 0 || v > t[i - 1]));
  ok('Duration ticks stay inside the range', t.every(v => v >= 1 && v <= 4000));
  ok('An hour reads as an hour', E.fmtDurationTick(60) === '1 hr', E.fmtDurationTick(60));
  ok('A day reads as a day, singular', E.fmtDurationTick(1440) === '1 day', E.fmtDurationTick(1440));
  ok('A narrow duration range still yields ticks', E.durationTicks(1, 30, 7).length >= 3);

  /* Log value axes must not stack a dozen gridlines on a short plot. */
  const price = E.makeScale('log', 0.05, 60);
  const pt = E.ticks(price, 7);
  ok('A log value axis thins to at most the target', pt.length <= 7, pt.length + ' ticks');
  /* Every surviving tick must sit on a 1 or a 5 of its decade — the thinning
     drops ticks, it must never invent an awkward one. */
  const mantissa = v => v / Math.pow(10, Math.floor(Math.log10(v) + 1e-9));
  ok('A thinned log axis keeps round values',
     pt.every(v => [1, 2, 5].some(m => Math.abs(mantissa(v) - m) < 1e-6)),
     pt.map(v => v + '(' + E.round(mantissa(v), 3) + ')').join(' '));

  /* And every round the app ships must produce readable y labels. */
  const bad = [];
  for (const r of D.ROUNDS) {
    const sc = E.makeScale(r.scale, r.yMin, r.yMax);
    const ls = r.unit === 'min'
      ? E.durationTicks(sc.min, sc.max, 7).map(E.fmtDurationTick)
      : E.ticks(sc, 7).map(v => E.fmtValue(v, r.unit));
    if (ls.length < 4 || ls.length > 8) bad.push(`${r.id}: ${ls.length} ticks`);
    if (new Set(ls).size !== ls.length) bad.push(`${r.id}: duplicate labels`);
  }
  ok('Every round\u2019s value axis has 4\u20138 distinct labels', bad.length === 0, bad.join(', '));
}

/* ========================== 3. the guess curve =========================== */

{
  const g = E.emptyGuess(0.4);
  ok('A fresh guess is flat', g.every(p => p.y === 0.4));
  ok('A fresh guess is not "drawn"', !E.guessDrawn(g, 0.4));

  E.paint(g, 1, 0.9, null);
  ok('Painting one column marks the guess as drawn', E.guessDrawn(g, 0.4));

  /* A fast swipe delivers sparse pointer samples. The curve must still be
     continuous, or the reveal compares against a line with holes in it. */
  const g2 = E.emptyGuess(0.1);
  let last = null;
  last = E.paint(g2, 0, 0.1, last) / (E.GUESS_N - 1);
  E.paint(g2, 1, 0.9, last);
  const mid = E.guessAt(g2, 0.5);
  ok('A two-sample swipe interpolates the columns between',
     near(mid, 0.5, 0.03), mid.toFixed(3));

  ok('Reading past the end clamps', E.guessAt(g2, 5) === E.guessAt(g2, 1));
  ok('Reading before the start clamps', E.guessAt(g2, -5) === E.guessAt(g2, 0));

  const g3 = E.emptyGuess(0.5);
  E.paint(g3, 0.5, 99, null);
  ok('Painting out of bounds clamps into range', g3.every(p => p.y >= 0 && p.y <= 1));
}

/* ====================== 3b. the time axis ================================
   A chart whose x axis carries one tick tells the reader nothing about the
   scale they are being asked to forecast across. The bug-fixing round spans
   sixteen months and crosses exactly one 1 January, so a year-only axis gave
   it a single mark. These checks exist so that cannot come back.
   ======================================================================== */

{
  const span = (a, b) => ({ t0: E.t(a), t1: E.t(b) });

  const short = span('2024-06-01', '2025-10-01');
  const st = E.timeTicks(short.t0, short.t1);
  ok('A sixteen-month axis gets more than one tick', st.length >= 4, st.length + ' ticks');
  ok('A sixteen-month axis is ticked in months, not years',
     st.every(m => m.step < 12) && /\u2019/.test(E.tickLabel(st[0].ms, st[0].step)),
     E.tickLabel(st[0].ms, st[0].step));

  const long = span('2020-06-01', '2025-01-01');
  const lt = E.timeTicks(long.t0, long.t1);
  ok('A four-year axis is ticked in whole years', lt.every(m => m.step >= 12), lt.length + ' ticks');
  ok('Year ticks are labelled as years', /^\d{4}$/.test(E.tickLabel(lt[0].ms, lt[0].step)),
     E.tickLabel(lt[0].ms, lt[0].step));

  const tiny = span('2025-01-01', '2025-05-01');
  ok('A four-month axis still gets several ticks', E.timeTicks(tiny.t0, tiny.t1).length >= 3);

  /* Ticks must be inside the range, in order, and never runaway. */
  const all = E.timeTicks(E.t('2019-01-01'), E.t('2026-12-31'));
  ok('Ticks stay inside the range',
     all.every(m => m.ms >= E.t('2019-01-01') && m.ms <= E.t('2026-12-31')));
  ok('Ticks come out in order', all.every((m, i) => i === 0 || m.ms > all[i - 1].ms));
  ok('A degenerate range does not hang', E.timeTicks(E.t('2025-01-01'), E.t('2025-01-01')).length <= 1);

  /* And every round the app actually ships must clear the bar. */
  const thin = [];
  for (const r of D.ROUNDS) {
    const pts = E.allPoints(r);
    let t0 = E.t(pts[0].date), t1 = E.t(r.askDate);
    const sp = t1 - t0; t0 -= sp * 0.04; t1 += sp * 0.06;
    const n = E.timeTicks(t0, t1).length;
    if (n < 4) thin.push(`${r.id}: ${n}`);
  }
  ok('Every round\u2019s time axis carries at least four ticks', thin.length === 0, thin.join(', '));
}

/* ============================ 4. scoring =================================
   The scoring identity has to hold on a rising percentage round and on the
   logarithmic one. There is no falling round in this registry any more (the
   Epoch price series was retired from the demo), so the falling branch of
   E.score is exercised on a synthetic round rather than dropped: the code
   path still exists and a future series could use it.
   ======================================================================== */

{
  const r = D.ROUNDS.find(x => x.id === 'gdpval');
  const scale = E.makeScale(r.scale, r.yMin, r.yMax);
  const truth = E.finalValue(r);

  const perfect = E.emptyGuess(scale.to(truth));
  ok('A perfect guess scores 1.0x', near(E.score(r, perfect).ratio, 1, 0.005),
     E.score(r, perfect).ratio.toFixed(4));

  const half = E.emptyGuess(scale.to(truth / 2));
  ok('Guessing half scores 2.0x', near(E.score(r, half).ratio, 2, 0.02),
     E.score(r, half).ratio.toFixed(3));

  ok('A low guess is flagged as under', E.score(r, half).under);
  const high = E.emptyGuess(scale.to(Math.min(truth * 1.15, 99)));
  ok('A high guess is not flagged as under', !E.score(r, high).under);

  /* Monotonicity: drawing lower must never look less wrong. */
  let mono = true, prev = Infinity;
  for (let y = 0.05; y <= 0.95; y += 0.05) {
    const s = E.score(r, E.emptyGuess(y)).ratio;
    if (s > prev) mono = false;
    prev = s;
  }
  ok('Score is monotone decreasing in the height drawn', mono);
  ok('Percentage rounds report a point gap', E.score(r, half).points > 0);
}

{
  /* The logarithmic round: a perfect guess must still score 1.0x, and the
     point gap must NOT be reported, because "minutes" is not a percentage. */
  const r = D.ROUNDS.find(x => x.id === 'metr');
  const scale = E.makeScale(r.scale, r.yMin, r.yMax);
  const perfect = E.emptyGuess(scale.to(E.finalValue(r)));
  ok('A perfect guess on the log round scores 1.0x',
     near(E.score(r, perfect).ratio, 1, 0.02), E.score(r, perfect).ratio.toFixed(3));
  ok('The log round reports no percentage-point gap', E.score(r, perfect).points === null);
  ok('No round in this registry falls', D.ROUNDS.every(x => !E.isFalling(x)));
}

{
  /* The falling branch, on a synthetic round. Retained deliberately: dropping
     the test because no shipped series falls would leave the branch live and
     unexercised. */
  const falling = {
    id: 'synthetic', scale: 'linear', yMin: 0, yMax: 100, unit: '%',
    shown: [{ date: '2024-01-01', value: 80 }],
    hidden: [{ date: '2025-01-01', value: 20 }]
  };
  ok('A synthetic falling round is detected as falling', E.isFalling(falling));
  const scale = E.makeScale('linear', 0, 100);
  ok('A perfect guess on a falling round scores 1.0x',
     near(E.score(falling, E.emptyGuess(scale.to(20))).ratio, 1, 0.02));
  const timid = E.emptyGuess(scale.to(60));
  ok('Not expecting a fall reads as a miss greater than 1x', E.score(falling, timid).ratio > 1);
  ok('Not expecting a fall is flagged as "under"', E.score(falling, timid).under);
}

ok('Median ignores infinities', E.medianRatio([{ratio: 2}, {ratio: 4}, {ratio: Infinity}]) === 3);
ok('Median of an empty set is null', E.medianRatio([]) === null);

/* The trend-fitting helpers are gone on purpose: a least-squares doubling fit
   is the demo's own anti-pattern, and both were dead code. */
for (const gone of ['doublingDays', 'cadence', 'medianMiss']) {
  ok('The trend-fitting helper ' + gone + ' is not exported', E[gone] === undefined);
}

/* ================= 5. the registry, via the shared validator =============
   Every structural rule lives in validation.js so the in-app integrity panel
   and this suite cannot drift. Each negative control below breaks exactly one
   rule, and the validator must notice: a check whose silence has not been
   tested is not evidence.
   ======================================================================== */

const Validation = require('./validation.js');
for (const c of Validation.check(D, E)) ok(c.name, c.pass, c.detail);

const clone = () => JSON.parse(JSON.stringify(D));
const fails = d => Validation.check(d, E).some(c => !c.pass);
ok('Validator accepts the shipped registry (positive control)', Validation.check(D, E).every(c => c.pass));

{ const d = clone(); d.ROUNDS[0].hidden[0].src = 'no-such-source';
  ok('Negative control: a dangling source reference fails', fails(d)); }
{ const d = clone(); delete d.ROUNDS[0].hidden[1].note;
  ok('Negative control: a point with no conditions note fails', fails(d)); }
{ const d = clone(); d.ROUNDS[1].endNote = '';
  ok('Negative control: a series with no end note fails', fails(d)); }
{ const d = clone(); d.ROUNDS[0].breaks = ['only one'];
  ok('Negative control: a round naming fewer than two ways the line breaks fails', fails(d)); }
{ const d = clone(); d.ROUNDS[0].yLabel = 'Bugs actually fixed';
  ok('Negative control: an axis label claiming work performed fails', fails(d)); }
{ const d = clone(); d.ACHIEVEMENTS[0].acceptance = 'solved';
  ok('Negative control: an acceptance status off the ladder fails', fails(d)); }
{ const d = clone(); d.ACHIEVEMENTS[0].ai_role = 'did-it-all';
  ok('Negative control: an AI role outside the vocabulary fails', fails(d)); }
{ const d = clone(); d.FAMILIES[0].gens[0].routes = ['got-bored'];
  ok('Negative control: a retirement route outside the four fails', fails(d)); }
{ const d = clone(); d.FAMILIES[0].gens[0].status = 'dead';
  ok('Negative control: a generation status outside the vocabulary fails', fails(d)); }
{ const d = clone(); d.ACHIEVEMENTS = d.ACHIEVEMENTS.filter(a => a.acceptance !== 'retracted');
  ok('Negative control: an unoccupied ladder rung fails', fails(d)); }
{ const d = clone(); d.ACHIEVEMENTS = d.ACHIEVEMENTS.filter(a => a.id !== 'metr-rct');
  ok('Negative control: dropping the counter-evidence card fails', fails(d)); }
{ const d = clone(); d.ACHIEVEMENTS.find(a => a.id === 'navier-stokes').acceptance = 'peer-reviewed';
  ok('Negative control: promoting Navier-Stokes off the contested rung fails', fails(d)); }
{ const d = clone(); d.SOURCES[Object.keys(d.SOURCES)[0]].checked = '2020-01-01';
  ok('Negative control: a source not dated to the snapshot fails', fails(d)); }
{ const d = clone(); d.SOURCES['orphan-source'] = { t: 'Never cited', u: 'https://example.com', how: 'fetched', checked: d.SNAPSHOT };
  ok('Negative control: a source cited by nothing fails', fails(d)); }

/* ================= 6. the claims this demo must keep making ============== */

for (const years of [-1, 0]) {
  ok('All scenario rules fit the anchor at ' + years,
     E.scenarios(years).every(r => near(r.value, years === -1 ? 20 : 30, 1e-9)));
}
ok('Scenario rules diverge outside the observed anchors', new Set(E.scenarios(3).map(r => r.value)).size === 3);
ok('The compound rule exposes a score above the ceiling', E.scenarios(8)[1].value > 100);
ok('The saturation rule stays below its stated ceiling', E.scenarios(100)[2].value <= 75);

const metr = D.ROUNDS.find(r => r.id === 'metr');
ok('Non-robust Sol estimate is excluded from plotted points',
   !E.allPoints(metr).some(p => p.src === 'metr-sol') && metr.limitations.src === 'metr-sol');
ok('METR intervals are retained on every point', E.allPoints(metr).every(p => p.lo != null && p.hi != null));
ok('METR is presented as the unbounded control case',
   /cannot saturate|no ceiling/i.test(metr.plain) && D.CORRECTIONS.some(c => /bounded scores/i.test(c.answer)));

const fm = D.ROUNDS.find(r => r.id === 'frontiermath');
ok('FrontierMath Tier 4 runs from zero to the shipped frontier',
   E.allPoints(fm)[0].value === 0 && E.finalValue(fm) === 97.6);
ok('The Tier 4 conflict of interest is on the reveal caveat',
   /exclusive access/i.test(fm.reveal.caveat) && /funding from OpenAI/i.test(fm.reveal.caveat));
ok('The v1-to-v2 correction is disclosed', /42%/.test(fm.reveal.caveat));
ok('The honest half ships on the same panel: 2 of 68 on the unsolved set',
   fm.twist.finale.bars.some(b => /2 of 68/.test(b.note) && b.value === 2.9));

const arc = D.ROUNDS.find(r => r.id === 'arc2');
ok('ARC-AGI-2 runs from its early score to the shipped frontier',
   E.allPoints(arc)[0].value === 6.5 && E.finalValue(arc) === 95.0);
ok('The generation comparison names RHAE rather than puzzles solved',
   /Relative Human Action Efficiency/.test(arc.twist.finale.what));
ok('The generation comparison keeps the harness gap at a fixed effort',
   arc.twist.finale.bars.some(b => /62\.7/.test(String(b.value)) || b.value === 62.7) &&
   arc.twist.finale.bars.some(b => b.value === 98.6));
ok('The non-monotone effort finding is taught, not hidden',
   /35\.2/.test(arc.twist.finale.punch) && /17\.5/.test(arc.twist.finale.punch));
ok('The four-thousand-fold cost framing is on the reveal', /\$1\.12/.test(arc.reveal.body) && /4,560/.test(arc.reveal.body));

const tb = D.ROUNDS.find(r => r.id === 'tbench');
ok('The Terminal-Bench series holds one harness fixed',
   E.allPoints(tb).every(p => /Terminus 2/.test(p.note)) && /harness/i.test(tb.conditions));
ok('Saturation is defined by overlapping intervals, not by a high number',
   /indistinguishable/i.test(tb.reveal.body) && /84\.7/.test(tb.reveal.body));
ok('The harness grid holds the model fixed across eight harnesses',
   tb.twist.finale.bars.length === 8 && /Opus 4\.6/.test(tb.twist.finale.what));

/* The GPQA anchor the accuracy audit could not resolve. Both OpenAI figures
   ship with their own page cited, because OpenAI published both: 50.6 is the
   GPT-4o pass@1 row of the o1 post's GPQA Diamond table, and 53.6 is the
   May 2024 launch chart's plain "GPQA" row for the same model. */
const gpqa = D.FAMILIES.find(f => f.id === 'reasoning').gens.find(g => /GPQA/.test(g.name));
const gpt4o = gpqa.series.find(p => p.label === 'GPT-4o');
ok('The GPT-4o GPQA row carries 50.6 with the o1 post as its source',
   gpt4o.value === 50.6 && gpt4o.src === 'openai-o1');
ok('The GPT-4o GPQA row names the 53.6 launch-chart figure too',
   /53\.6/.test(gpt4o.note) && (gpt4o.extraSrc || []).includes('openai-gpt4o'));
ok('The GPQA paper baseline and the PhD line are both carried',
   gpqa.series.some(p => p.value === 39 && p.src === 'gpqa-paper') && /65%/.test(gpqa.human));

/* The GenCast citation the dead-link sweep found drifted: the demo said
   "Nature, December 2024"; the article's own citation is volume 637 (2025). */
ok('The GenCast citation carries its issued volume and year',
   /637/.test(D.SOURCES.gencast.t) && /2025/.test(D.SOURCES.gencast.t) &&
   !/December 2024/.test(D.SOURCES.gencast.t));
const gencast = D.ACHIEVEMENTS.find(a => a.id === 'gencast');
ok('The GenCast card keeps the share-of-comparisons correction',
   /share of comparisons/i.test(gencast.caveat) && /not forecast accuracy/i.test(gencast.caveat));

const ns = D.ACHIEVEMENTS.find(a => a.id === 'navier-stokes');
ok('Navier-Stokes sits on the contested rung', ns.acceptance === 'contested');
ok('Navier-Stokes states Clay has not recognised it',
   /Active/.test(ns.checked) && /not peer-reviewed/i.test(ns.checked));
ok('Navier-Stokes states the two-year rule and the declined prize',
   /two years/i.test(ns.checked) && /do not intend to claim/i.test(ns.checked));
ok('Navier-Stokes credits the human strategy', /Córdoba/.test(ns.human) && /heroes/.test(ns.human));
ok('Navier-Stokes names the unresolved priority dispute', /priority dispute/i.test(ns.caveat));
ok('Navier-Stokes says (C) does not settle (A)', /\(C\) does not settle \(A\)/.test(ns.caveat));
ok('The page refuses the six-word version',
   D.CUT.some(c => /Millennium Prize Problem/.test(c.claim) && /not true/.test(c.why)));

ok('Every rung of the acceptance ladder has an occupant',
   D.LADDER.every(l => D.ACHIEVEMENTS.some(a => a.acceptance === l.id)));
ok('The retracted rung is occupied by the Erdos overclaim',
   D.ACHIEVEMENTS.some(a => a.acceptance === 'retracted' && /Erdős/.test(a.title)));
ok('The Nobel card is the only institutionally recognised item',
   D.ACHIEVEMENTS.filter(a => a.acceptance === 'nobel').length === 1);
ok('The developer-slowdown trial ships', D.ACHIEVEMENTS.some(a => a.id === 'metr-rct' && /19% longer/.test(a.what)));
ok('The prediction-is-not-discovery case keeps its denominator',
   D.ACHIEVEMENTS.some(a => a.id === 'gnome' && /736/.test(a.what) && /380,000/.test(a.what)));

ok('Four retirement routes are defined and all four are used',
   Object.keys(D.ROUTES).length === 4 &&
   Object.keys(D.ROUTES).every(k => D.FAMILIES.some(f => f.gens.some(g => g.routes.includes(k)))));
ok('SWE-bench Verified is retired for bad tasks and contamination, not for being beaten',
   (() => { const g = D.FAMILIES.find(f => f.id === 'swe').gens.find(x => /Verified/.test(x.name));
            return g.status === 'retired' && g.routes.includes('bad-tasks') &&
                   g.routes.includes('contamination') && !g.routes.includes('beaten'); })());
ok('A generation that changed the unit is flagged as counting something different',
   D.FAMILIES.some(f => f.gens.some(g => g.kindChange)));
ok('MMLU saturation is evidenced by its successor’s own paper',
   /over 90%/.test(D.FAMILIES.find(f => f.id === 'reasoning').gens[0].quote.text));
ok('The benchmark-creation rate is carried with its method',
   /2\.3/.test(D.CHURN.text) && /28/.test(D.CHURN.text) && /benchmark_metadata/.test(D.CHURN.note));

ok('Every boundary line is one sentence and sourced',
   D.BOUNDARIES.length >= 4 && D.BOUNDARIES.every(b => D.SOURCES[b.src] && b.text.length < 260));
ok('The closing quotation is the institutional, non-vendor one',
   /not plateauing/.test(D.HEADLINE.text) && D.HEADLINE.src === 'hai-index');

/* Magnitude leads: the stage question, not a caveat, has to carry the size of
   the change. This is the weighting rule from the debunking-bias record, as a
   test rather than an intention. */
ok('The first series leads with the size of the change, in its question',
   /12\.3%/.test(D.ROUNDS[0].question) && /70\.9|thirteen months|share stand/.test(D.ROUNDS[0].question));
/* A magnitude may be written in words — "ninety times longer", "from none to
   all but one" — which reads better on a projector than a digit. What must
   never happen is a headline that states only a caveat. */
const MAGNITUDE = /\d|times|doubled|tripled|none to|all but|seven times|ninety/i;
ok('Every round’s reveal headline states a magnitude, not a hedge',
   D.ROUNDS.every(r => MAGNITUDE.test(r.reveal.headline)),
   D.ROUNDS.filter(r => !MAGNITUDE.test(r.reveal.headline)).map(r => r.id).join(', '));

/* The ARC example puzzle must obey exactly one rule, or the illustration
   teaches a rule that is not there. */
const fall = g => { const out = g.map(row => row.map(() => 0));
  for (let c = 0; c < g[0].length; c++) { const vals = g.map(row => row[c]).filter(Boolean);
    vals.forEach((v, i) => out[g.length - vals.length + i][c] = v); } return out; };
ok('The illustrative ARC puzzle examples and answer obey one rule',
   arc.example.pairs.every(p => JSON.stringify(fall(p.in)) === JSON.stringify(p.out)) &&
   JSON.stringify(fall(arc.example.test)) === JSON.stringify(arc.example.answer));

/* ================= 7. the built file and the kit contract ================ */

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
ok('Different benchmark versions are never joined on the chart', !app.includes('app.chart.twist('));
ok('The axis end is actually wired (the audit’s first defect)', /setAxisEnd\(D\.AXIS_END\)/.test(app));
ok('The dangling mittr-metr source key is gone', !app.includes('mittr-metr'));
ok('The demo implements the in-place reset contract', /addEventListener\('lessonreset'/.test(app));
ok('stagechange is guarded against the reset ordering hazard',
   /S\.resetting/.test(app) && /onReset\s*=/.test(app));
ok('The demo no longer carries its own overlay or act-nav machinery',
   !/function openSheet|function closeSheet|#actnav/.test(app));

const chart = fs.readFileSync(path.join(__dirname, 'chart.js'), 'utf8');
ok('The series boundary is drawn unconditionally, not gated on spare axis space',
   /function boundary\(st\)/.test(chart) && !/edge - lx > 60/.test(chart));

const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
for (const id of ['guide', 'settings', 'details', 'presenter-notes', 'reset-btn',
                  'presentation-btn', 'round-select', 'scenario-years', 'btn-selftest'])
  ok('Required control #' + id, idx.includes('id="' + id + '"'));
for (const label of ['Open Presenter Notes', 'Presentation mode', 'Reset'])
  ok('Required visible label ' + label, idx.includes('>' + label + '<'));
ok('Guide accessible name', idx.includes('aria-label="Guide"'));
for (const k of ['k-sourced', 'k-live', 'k-reasoned', 'k-illustrative'])
  ok('Provenance kicker ' + k + ' is used on the page', idx.includes('class="' + k + '"'));
ok('No stage carries an objective-shaped line', !/You will be able to/i.test(idx));
ok('Every stage panel is present', [1, 2, 3, 4].every(n => idx.includes('id="stage-' + n + '"')));
ok('Every stage has a check-yourself card', (idx.match(/class="check"/g) || []).length >= 4);
ok('A refutation item is marked for the reviewer', idx.includes('data-refutation="true"'));
ok('Every stage has a Details section', (idx.match(/data-details-stage="/g) || []).length >= 4);

const guide = fs.readFileSync(path.join(__dirname, '..', 'presenter-guide.html'), 'utf8');
const body = guide.slice(guide.indexOf('<div class="guide-scope">'), guide.indexOf('</div><!-- /guide -->')) + '</div>';
ok('Canonical guide body is embedded verbatim', idx.includes(body));
const guideWords = body.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
ok('The presenter guide is within the 2,500-word band', guideWords <= 2500, guideWords + ' words');
ok('The guide states the stage Takeaways as goals, not objectives',
   /Learning goals/.test(body) && !/you will be able to/i.test(body));
ok('The guide names the three projector facts', /GDPval/.test(body) && /METR/.test(body) && /Tier 4/.test(body));
ok('The guide gives the presenter the precise Navier-Stokes wording',
   /Active/.test(body) && /not intend to claim/.test(body) && /not peer-reviewed/.test(body));

ok('No external subresources',
   !(idx.match(/<(script|link|img|iframe|source|video|audio)\b[^>]*\b(src|href)\s*=\s*["']?https?:/gi) || []).length);
for (const api of ['fetch(', 'XMLHttpRequest', 'WebSocket', '@import', 'url(http'])
  ok('No runtime network API ' + api, !idx.includes(api));
ok('No storage API is touched', !/localStorage|sessionStorage|indexedDB/.test(idx));

for (const [state, name, detail] of results) if (state === 'FAIL' || process.argv.includes('-v')) console.log(state + ' ' + name + ' ' + detail);
console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' checks.');
process.exit(fail ? 1 : 0);
