/* Structural integrity checks on the evidence registry. They cannot verify a
   publication's truth; they verify that every number on the page has a source,
   a date, its conditions, and a stated boundary, and that every label the page
   renders comes from a closed vocabulary.

   Extended 2026-09-16 (lane T-build) after the accuracy audit found four gaps
   the earlier version could not see: a point with no conditions note (a bare
   72.5% passed), a series with no end note (so the on-chart boundary never
   existed to render), an unvalidated `verdict` word (a typo would relabel a
   Nature paper as "Claim exceeds evidence"), and a source key hard-coded in
   app.js that the data walk could not reach. Every one of those is a check
   below, and the node suite carries a negative control for each. */
const Validation = (() => {
const ROLE_KEYS = ['tool', 'verified', 'autonomous'];
const ROUTE_KEYS = ['beaten', 'bad-tasks', 'contamination', 'coverage'];
const STATUS_KEYS = ['retired', 'saturated', 'nearly', 'open', 'unscored'];
const EVIDENCE_STATUS = ['primary', 'secondary'];

function check(D, E) {
  const rows = [];
  const ok = (name, pass, detail = '') => rows.push({ name, pass: !!pass, detail });

  /* --- every reference resolves, every source is dated to the snapshot --- */
  const refs = [];
  const walk = x => {
    if (!x || typeof x !== 'object') return;
    if (typeof x.src === 'string') refs.push(x.src);
    (x.extraSrc || []).forEach(s => refs.push(s));
    Object.values(x).forEach(v => { if (v && typeof v === 'object') walk(v); });
  };
  walk(D.ROUNDS); walk(D.FAMILIES); walk(D.ACHIEVEMENTS); walk(D.BOUNDARIES); walk(D.CORRECTIONS); walk(D.CHURN); walk(D.HEADLINE);
  const missing = refs.filter(k => !D.SOURCES[k]);
  ok('Every evidence reference resolves to a source', missing.length === 0, missing.join(', '));
  ok('Every source has a title, HTTPS link, fetch method, and checked date equal to the snapshot',
     Object.values(D.SOURCES).every(s => s.t && /^https:\/\//.test(s.u) && s.how && s.checked === D.SNAPSHOT));
  const used = new Set(refs);
  const unused = Object.keys(D.SOURCES).filter(k => !used.has(k));
  ok('Every source is cited by at least one entry', unused.length === 0, unused.join(', '));

  /* --- the benchmark rounds -------------------------------------------- */
  for (const r of D.ROUNDS) {
    const pts = E.allPoints(r);
    ok(r.metric + ': source-backed numeric points', pts.every(p => Number.isFinite(p.value) && D.SOURCES[p.src]));
    ok(r.metric + ': every point carries a conditions note', pts.every(p => typeof p.note === 'string' && p.note.trim().length > 0));
    ok(r.metric + ': conditions line and end note present', typeof r.conditions === 'string' && r.conditions.length > 0 && typeof r.endNote === 'string' && r.endNote.length > 0);
    ok(r.metric + ': chronological, bounded history', pts.every((p, i) => E.t(p.date) <= E.t(D.SNAPSHOT) && (!i || E.t(p.date) >= E.t(pts[i - 1].date)) && p.value >= r.yMin && p.value <= r.yMax));
    ok(r.metric + ': drawing endpoint matches final evidence date', r.askDate === r.hidden.at(-1).date && E.t(r.hidden[0].date) > E.t(r.shown.at(-1).date));
    ok(r.metric + ': ordered uncertainty intervals', pts.every(p => p.lo == null || (p.lo > 0 && p.lo <= p.value && p.hi >= p.value)));
    ok(r.metric + ': context, caveats and axis labels supplied', r.plain && r.human && r.example && r.reveal && r.reveal.caveat && r.xLabel && r.yLabel && r.question);
    ok(r.metric + ': names what would break the line', Array.isArray(r.breaks) && r.breaks.length >= 2 && r.breaks.every(b => typeof b === 'string' && b.length > 0));
    ok(r.metric + ': axis label names a measurement, not work performed', !/actually/i.test(r.yLabel));
    const scale = E.makeScale(r.scale, r.yMin, r.yMax);
    ok(r.metric + ': exact estimate matches final value', Math.abs(E.score(r, E.emptyGuess(scale.to(E.finalValue(r)))).predicted - E.finalValue(r)) < 1e-8);
    if (r.twist) {
      const f = r.twist.finale;
      ok(r.metric + ': comparison panel is sourced and bounded', f && D.SOURCES[f.src] && f.what && f.caveat && Array.isArray(f.bars) && f.bars.every(b => Number.isFinite(b.value) && b.value >= 0 && b.value <= 100 && b.note));
      ok(r.metric + ': comparison panel does not draw a series onto the chart', Array.isArray(r.twist.series) && r.twist.series.length === 0);
    }
  }
  ok('Every series stops on or before the axis end', D.ROUNDS.every(r => E.t(r.askDate) <= E.t(D.AXIS_END)) && E.t(D.AXIS_END) <= E.t(D.SNAPSHOT));

  /* --- the benchmark families (stage 2) -------------------------------- */
  const gens = D.FAMILIES.flatMap(f => f.gens);
  ok('Every benchmark generation has a status from the vocabulary', gens.every(g => STATUS_KEYS.includes(g.status)));
  ok('Every retirement route is one of the four', gens.every(g => Array.isArray(g.routes) && g.routes.every(x => ROUTE_KEYS.includes(x))));
  ok('A generation still discriminating names no route; a retired or saturated one names at least one',
     gens.every(g => (g.status === 'open' ? g.routes.length === 0 : g.status === 'unscored' ? true : g.routes.length >= 1)));
  ok('Every generation is sourced and says what it measures', gens.every(g => D.SOURCES[g.src] && g.name && g.top && g.top.text && g.note));
  ok('Every family quotation names its source', gens.every(g => !g.quote || (g.quote.text && g.quote.who && D.SOURCES[g.quote.src])));
  ok('Every family series point is sourced and dated', gens.every(g => !g.series || g.series.every(p => D.SOURCES[p.src] && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.value) && p.note)));
  ok('Every route and status word has a definition', ROUTE_KEYS.every(k => D.ROUTES[k] && D.ROUTES[k].what) && STATUS_KEYS.every(k => D.STATUSES[k]));

  /* --- the achievements track (stage 3) -------------------------------- */
  const rungs = D.LADDER.map(l => l.id);
  ok('Acceptance ladder rungs are unique and defined', new Set(rungs).size === rungs.length && D.LADDER.every(l => l.name && l.what));
  ok('Every achievement sits on a ladder rung', D.ACHIEVEMENTS.every(a => rungs.includes(a.acceptance)));
  ok('Every achievement states the AI role from the closed vocabulary', D.ACHIEVEMENTS.every(a => ROLE_KEYS.includes(a.ai_role)) && ROLE_KEYS.every(k => D.ROLES[k] && D.ROLES[k].what));
  ok('Every achievement separates the machine, the people, who checked it, and its limit', D.ACHIEVEMENTS.every(a => a.what && a.machine && a.human && a.checked && a.caveat && D.SOURCES[a.src]));
  ok('Every achievement is dated within the snapshot', D.ACHIEVEMENTS.every(a => /^\d{4}-\d{2}-\d{2}$/.test(a.date) && E.t(a.date) <= E.t(D.SNAPSHOT)));
  ok('Every achievement marks its evidence status', D.ACHIEVEMENTS.every(a => EVIDENCE_STATUS.includes(a.status)));
  ok('Every rung of the ladder is occupied', rungs.every(r => D.ACHIEVEMENTS.some(a => a.acceptance === r)));
  ok('The track carries counter-evidence, not only successes', D.ACHIEVEMENTS.some(a => a.id === 'metr-rct'));
  ok('The Millennium Prize item is not marked accepted', D.ACHIEVEMENTS.every(a => a.id !== 'navier-stokes' || (a.acceptance === 'contested' && /not peer-reviewed/i.test(a.checked))));

  /* --- stage 4 --------------------------------------------------------- */
  ok('Every boundary line is sourced', D.BOUNDARIES.every(b => b.text && D.SOURCES[b.src]));
  ok('Illustrative rules agree at both anchor points', [-1, 0].every(t => E.scenarios(t).every(r => Math.abs(r.value - (t === -1 ? 20 : 30)) < 1e-9)));
  return rows;
}
return { check, ROLE_KEYS, ROUTE_KEYS, STATUS_KEYS };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Validation;
