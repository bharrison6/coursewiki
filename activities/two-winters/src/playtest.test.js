#!/usr/bin/env node
/* ==========================================================================
   Two Winters — dataset and engine checks.

   Run: node src/playtest.test.js

   Two jobs. The first is ordinary unit testing of the date helpers, the year
   scale and the scoring. The second matters more: this demo's entire claim to
   credibility is that every sentence on screen resolves to a source somebody
   can go and check. These tests assert that, in both directions, and assert
   that the numbers stated in prose agree with the data actually shipped.
   ========================================================================== */

const D = require('./data.js');
const E = require('./engine.js');

let pass = 0, fail = 0;
const results = [];

function ok(name, cond, detail) {
  if (cond) { pass++; results.push(['PASS', name, detail]); }
  else { fail++; results.push(['FAIL', name, detail]); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ======================= 1. dates and formatting ========================= */

ok('ISO dates parse as UTC', E.t('1973-04-01') === Date.UTC(1973, 3, 1));
ok('Dates round-trip', E.isoOf(E.t('1987-06-01')) === '1987-06-01');
ok('A malformed date is NaN rather than a silent wrong answer', isNaN(E.t('not a date')));
ok('Date formatting is stable across timezones',
   E.fmtDate(E.t('1958-07-08')) === 'Jul 1958', E.fmtDate(E.t('1958-07-08')));
ok('Year-only formatting works', E.fmtDate(E.t('1966-11-01'), 'year') === '1966');
ok('yearOf reads the UTC year', E.yearOf(E.t('1992-06-01')) === 1992);

/* ============================= 2. scales ================================= */

{
  const s = E.makeYearScale(1950, 2027);
  ok('Year scale maps the low end to 0', s.to(1950) === 0);
  ok('Year scale maps the high end to 1', s.to(2027) === 1);
  ok('Year scale inverts', near(s.from(s.to(1987)), 1987, 1e-9));
  ok('Year scale clamps rather than running off the chart', s.to(1900) === 0 && s.to(2200) === 1);
  const ticks = E.decadeTicks(1950, 2027, 10);
  ok('Decade ticks include both ends', ticks[0] === 1950 && ticks[ticks.length - 1] === 2027);
  ok('Decade ticks are decades in between', ticks.slice(1, -1).every(y => y % 10 === 0));
}

/* ======================= 2b. stepping the timeline =======================
   Both bugs this code has actually had, pinned as tests. Walk the real event
   list forward from before the start and backward from after the end, and
   assert every event is reached exactly once in each direction. */

{
  const evs = D.EVENTS.map(e => ({ id: e.d + ' ' + e.label, at: E.t(e.d) }))
                      .sort((a, b) => a.at - b.at);

  const walk = dir => {
    const start = dir > 0 ? evs[0].at - 10 * E.DAY : evs[evs.length - 1].at + 10 * E.DAY;
    let at = start, hops = 0;
    const got = [];
    for (;;) {
      const t = E.stepTarget(evs, at, dir);
      if (!t) break;
      got.push(t.id);
      at = E.parkAt(t);          /* exactly what the canvas does */
      if (++hops > evs.length + 5) { got.push('RUNAWAY'); break; }
    }
    return got;
  };

  const fwd = walk(1);
  ok('Stepping forward reaches every event', fwd.length === evs.length,
     `${fwd.length} of ${evs.length}`);
  ok('Stepping forward reaches them in order',
     fwd.join('|') === evs.map(e => e.id).join('|'));

  const back = walk(-1);
  ok('Stepping backward reaches every event', back.length === evs.length,
     `${back.length} of ${evs.length}` + (back.includes('RUNAWAY') ? ' (RUNAWAY: back button is stuck)' : ''));
  ok('Stepping backward reaches them in reverse order',
     back.join('|') === evs.map(e => e.id).reverse().join('|'));
  ok('Stepping never revisits an event', new Set(fwd).size === fwd.length &&
     new Set(back).size === back.length);

  ok('Stepping stops at each end rather than wrapping',
     E.stepTarget(evs, evs[evs.length - 1].at + E.DAY * 2, 1) === null &&
     E.stepTarget(evs, evs[0].at - E.DAY * 2, -1) === null);

  /* The stepper's tolerance is only safe while no two events sit inside it. */
  let tightest = Infinity;
  for (let i = 1; i < evs.length; i++) tightest = Math.min(tightest, evs[i].at - evs[i - 1].at);
  ok('No two events are closer together than the stepper tolerance',
     tightest > E.STEP_EPS * 2,
     'tightest gap ' + (tightest / E.DAY).toFixed(0) + ' days vs tolerance ' +
     (E.STEP_EPS / E.DAY).toFixed(0) + ' day');
}

/* ============================= 3. scoring ================================ */

ok('A perfect year guess misses by zero', E.yearMiss(1973, 1973) === 0);
ok('Year miss is symmetric', E.yearMiss(1980, 1973) === E.yearMiss(1966, 1973));
ok('Year miss rounds a fractional guess', E.yearMiss(1973.4, 1973) === 0);
ok('Miss bands are ordered', ['close','near','out','far'].every((b, i) =>
   [E.missBand(0), E.missBand(7), E.missBand(20), E.missBand(60)][i] === b));
ok('Every miss band has text', ['close','near','out','far'].every(b => !!E.BAND_TEXT[b]));

ok('An unresolved claim is never marked', E.verdictCorrect('yes', 'open') === null &&
   E.verdictCorrect('no', 'open') === null);
ok('A dated assessment is not marked as a future forecast',
   E.verdictCorrect('context', 'context') === null && E.verdictCorrect('no', 'context') === null);
ok('A straight yes/no verdict scores normally',
   E.verdictCorrect('yes', 'yes') === true && E.verdictCorrect('no', 'yes') === false);
ok('A "true, but far too late" card marks "it didn\'t" as correct',
   E.verdictCorrect('no', 'late') === true && E.verdictCorrect('yes', 'late') === false);

{
  /* Perfect play, then a wipeout, on the real deck. */
  const perfect = {};
  D.CARDS.forEach(c => { perfect[c.id] = { year: c.year, verdict: c.verdict === 'late' ? 'no' : c.verdict }; });
  const a = E.tally(D.CARDS, perfect);
  ok('Perfect play scores every scorable card', a.verdictRight === a.scored && a.scored > 0);
  ok('Perfect play has zero average miss', a.medianMiss === 0);
  ok('Perfect play leaves two open forecasts and four assessments unscored', a.open === 6);

  const wrong = {};
  D.CARDS.forEach(c => { wrong[c.id] = { year: 1950, verdict: c.verdict === 'yes' ? 'no' : 'yes' }; });
  const b = E.tally(D.CARDS, wrong);
  ok('Wrong play scores nothing', b.verdictRight === 0);
  ok('The scorecard refuses to praise a tiny sample',
     E.verdictSentence({ scored: 2, verdictRight: 2 }).indexOf('Not enough') === 0);
  ok('The scorecard calls a bad run a bad run',
     E.verdictSentence(b).indexOf('worse than guessing') > -1);
}

/* ==================== 4. every claim has a source ======================== */

const declared = Object.keys(D.SOURCES);
const used = new Set();
const missing = [];
function useSrc(id, where) {
  used.add(id);
  if (!D.SOURCES[id]) missing.push(`${where} -> ${id}`);
}

D.CARDS.forEach(c => useSrc(c.src, 'card ' + c.id));
D.EVENTS.forEach(e => useSrc(e.src, 'event ' + e.d));
D.RHYMES.forEach((r, i) => useSrc(r.src, 'rhyme ' + i));
D.DIFFERENT.forEach((r, i) => useSrc(r.src, 'different ' + i));
D.ANATOMY.forEach(r => ['w1', 'w2', 'now'].forEach(k =>
  r[k].src.forEach(id => useSrc(id, `anatomy ${r.stage}.${k}`))));

ok('Every claim resolves to a declared source', missing.length === 0, missing.join('; '));

const unused = declared.filter(id => !used.has(id));
ok('No source is declared and never used', unused.length === 0, unused.join(', '));

ok('Every source has a title and a URL',
   declared.every(id => D.SOURCES[id].t && D.SOURCES[id].u));
ok('Every source URL is http(s)',
   declared.every(id => /^https?:\/\//.test(D.SOURCES[id].u)));
ok('Every source URL points at a specific page, not a bare host',
   declared.every(id => {
     const rest = D.SOURCES[id].u.split('://')[1] || '';
     const slash = rest.indexOf('/');
     return slash > 0 && rest.length > slash + 1;
   }),
   declared.filter(id => {
     const rest = D.SOURCES[id].u.split('://')[1] || '';
     const slash = rest.indexOf('/');
     return !(slash > 0 && rest.length > slash + 1);
   }).join(', '));

ok('Every claim declares a status we recognise',
   D.CARDS.every(c => c.status === 'primary' || c.status === 'reported') &&
   D.EVENTS.every(e => e.status === 'primary' || e.status === 'reported'));

/* ================= 5. the timeline says what it means ==================== */

const evAt = D.EVENTS.map(e => ({ ...e, at: E.t(e.d) }));
ok('Every event date parses', evAt.every(e => !isNaN(e.at)),
   evAt.filter(e => isNaN(e.at)).map(e => e.d).join(', '));
ok('Events are stored in chronological order',
   evAt.every((e, i) => i === 0 || evAt[i - 1].at <= e.at),
   evAt.filter((e, i) => i > 0 && evAt[i - 1].at > e.at).map(e => e.d).join(', '));

const laneIds = D.STAGES.map(s => s.id).concat(['result']);
ok('Every event sits in a declared lane',
   D.EVENTS.every(e => laneIds.indexOf(e.stage) > -1),
   D.EVENTS.filter(e => laneIds.indexOf(e.stage) < 0).map(e => e.stage).join(', '));
ok('There are exactly five stages, in the order the demo narrates',
   D.STAGES.map(s => s.id).join('>') === 'promise>money>limit>naming>withdrawal');

ok('Every event carries a label and a body',
   D.EVENTS.every(e => e.label && e.text && e.label.length > 3 && e.text.length > 30));

/* Date precision. An event stored on the 1st of a month with no `p` would be
   printed as though the month were known, which would be a fabrication the
   size of a month. Every event declares how much of its date was verified. */
ok('Every event declares its date precision',
   D.EVENTS.every(e => ['y', 'm', 'd'].indexOf(e.p) > -1),
   D.EVENTS.filter(e => ['y','m','d'].indexOf(e.p) < 0).map(e => e.d).join(', '));
ok('An event claiming day precision is not sitting on a placeholder 1 January',
   D.EVENTS.filter(e => e.p === 'd').every(e => !/-01-01$/.test(e.d)),
   D.EVENTS.filter(e => e.p === 'd' && /-01-01$/.test(e.d)).map(e => e.d).join(', '));
ok('An event with year precision prints only the year',
   E.fmtEventDate(E.t('1969-01-01'), 'y') === '1969');
ok('An event with month precision prints month and year',
   E.fmtEventDate(E.t('1972-07-01'), 'm') === 'Jul 1972');
ok('An event with day precision prints the day',
   E.fmtEventDate(E.t('1958-07-08'), 'd') === '8 Jul 1958');

/* Each band is a bounded historical contraction. The lenses help compare
   causes; they do not assert a universal ordered mechanism. */
D.WINTERS.forEach(w => {
  const start = E.t(w.from), end = E.t(w.to);
  ok(`${w.label}: at least one withdrawal falls inside it`,
     D.EVENTS.some(e => e.stage === 'withdrawal' && E.t(e.d) >= start && E.t(e.d) <= end));
  ok(`${w.label}: starts before it ends`, start < end);
  ok(`${w.label}: carries its own uncertainty note`,
     !!w.note && w.note.length > 40 && !!w.range);
});

ok('The second winter starts after the first one ends',
   E.t(D.WINTERS[1].from) > E.t(D.WINTERS[0].to));

ok('Both historical paths have multiple comparison lenses represented',
   D.WINTERS.every(w => new Set(D.EVENTS.filter(e => E.t(e.d) <= E.t(w.to)).map(e => e.stage)).size >= 4));

/* ================= 6. prose agrees with the data ========================= */

const kindCount = k => D.CARDS.filter(c => c.kind === k).length;
ok('Five time-bounded promises, as the scorecard says', kindCount('promise') === 5, String(kindCount('promise')));
ok('Four dated or untimed assessments are shown without outcome scoring', kindCount('assessment') === 4, String(kindCount('assessment')));
ok('One warning, as the scorecard says', kindCount('warning') === 1, String(kindCount('warning')));
ok('The three kinds account for the whole deck',
   kindCount('promise') + kindCount('assessment') + kindCount('warning') === D.CARDS.length);
ok('The activity contains ten dated claims', D.CARDS.length === 10);

ok('Exactly two forecasts are left open', D.CARDS.filter(c => c.verdict === 'open').length === 2);
ok('Every assessment is explicitly marked as context, not a prediction',
   D.CARDS.filter(c => c.kind === 'assessment').every(c => c.verdict === 'context'));
ok('No promise in the deck arrived inside its own window',
   D.CARDS.filter(c => c.kind === 'promise').every(c => c.verdict !== 'yes'));

ok('Every card carries a year, a verdict, a verdict line and an explanation',
   D.CARDS.every(c => typeof c.year === 'number' && c.verdict && c.verdictLine &&
                      c.what && c.what.length > 60));
ok('Every card year falls inside the timeline window',
   D.CARDS.every(c => c.year >= 1950 && c.year <= 2026),
   D.CARDS.filter(c => c.year < 1950 || c.year > 2026).map(c => c.id).join(', '));
ok('Card ids are unique', new Set(D.CARDS.map(c => c.id)).size === D.CARDS.length);

/* Where a card names a year, an event on the timeline should back it up.
   Not every event is a card, but every card ought to be locatable. */
const eventYears = new Set(D.EVENTS.map(e => E.yearOf(E.t(e.d))));
const orphanCards = D.CARDS.filter(c => c.verdict !== 'open' && !eventYears.has(c.year));
ok('Every resolved card has a timeline event in the same year',
   orphanCards.length === 0, orphanCards.map(c => c.id + '@' + c.year).join(', '));

/* The anatomy grid must be complete in shape, and honest about its gaps. */
ok('The anatomy grid covers all five stages',
   D.ANATOMY.length === 5 &&
   D.ANATOMY.map(r => r.stage).join('>') === D.STAGES.map(s => s.id).join('>'));
ok('Every anatomy cell has a heading and a body',
   D.ANATOMY.every(r => ['w1','w2','now'].every(k => r[k].head && r[k].body.length > 40)));
/* The present column must leave exactly two stages open — the binding limit,
   which nobody has identified, and the withdrawal, which has not happened.
   Filling either in would be the demo committing the error it is about. */
ok('The present column leaves exactly two stages openly pending',
   D.ANATOMY.filter(r => r.now.pending).length === 2,
   D.ANATOMY.filter(r => r.now.pending).map(r => r.stage).join(', '));
ok('The two pending stages are the limit and the withdrawal',
   D.ANATOMY.filter(r => r.now.pending).map(r => r.stage).join('+') === 'limit+withdrawal');
ok('The first two winters have no pending cells',
   D.ANATOMY.every(r => !r.w1.pending && !r.w2.pending));
ok('A pending cell never asserts a figure of its own',
   D.ANATOMY.filter(r => r.now.pending).every(r => !/\$\d|£\d|¥\d|\d+%/.test(r.now.head)));

ok('Both closing columns have at least four items',
   D.RHYMES.length >= 4 && D.DIFFERENT.length >= 4);
ok('The cut list is not empty and every entry says why', D.CUT.length > 0 &&
   D.CUT.every(c => c.claim && c.why && c.why.length > 40));

/* The money panel promises four sourced commitments; count them. */
const moneyEvents = D.EVENTS.filter(e => e.money);
ok('The money panel shows exactly four funding examples',
   moneyEvents.length === 4, String(moneyEvents.length));
ok('Every money figure carries its own note and unit',
   moneyEvents.every(e => e.money.note && e.money.unit && typeof e.money.amount === 'number'));
ok('No two money figures are silently compared in a single currency',
   new Set(moneyEvents.map(e => e.money.unit)).size > 1);

/* ============================== report ================================== */

const width = results.reduce((m, r) => Math.max(m, r[1].length), 0);
for (const [state, name, detail] of results) {
  if (state === 'FAIL' || process.env.VERBOSE) {
    console.log(state, name.padEnd(width), detail ? '| ' + detail : '');
  }
}
console.log(`\n${pass} passed, ${fail} failed, ${pass + fail} total`);
if (fail) process.exit(1);
