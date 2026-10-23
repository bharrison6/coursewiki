/* ==========================================================================
   AI Tool Guide (folder: front-doors) — the engine.

   Every fact this demo DERIVES rather than states lives here, once. Three
   consumers share it: the screen (app.js), the build-time test suite
   (playtest.test.js) and the self-test button inside Settings. If a number
   in the prose disagrees with a number on the screen, that is because one of
   them stopped calling this file.

   No DOM, no globals beyond the export. Pure functions of DATA.
   ========================================================================== */

const ENGINE = (() => {

/* --------------------------------------------------------------------------
   Grid access.
   -------------------------------------------------------------------------- */

/** Key a cell the one way, everywhere. */
const cellKey = (doorId, axisId) => doorId + '.' + axisId;

/** The cell for a door and axis, or null. Never invents one. */
function cell(D, doorId, axisId) {
  return D.CELLS[cellKey(doorId, axisId)] || null;
}

/** Every cell, flattened, in reading order: door by door, axis by axis. */
function cells(D) {
  const out = [];
  for (const door of D.DOORS) {
    for (const axis of D.AXES) {
      const c = cell(D, door.id, axis.id);
      out.push({ door, axis, c, key: cellKey(door.id, axis.id) });
    }
  }
  return out;
}

/** The wording for a bar value, from the axis that owns the scale. */
function barText(D, axisId, bar) {
  const axis = D.AXES.find(a => a.id === axisId);
  if (!axis || !(bar >= 1 && bar <= axis.bars.length)) return null;
  return axis.bars[bar - 1];
}

/* --------------------------------------------------------------------------
   The thesis, computed rather than asserted.

   `reach` is the highest of the three reach rows for a door. The module
   claims review burden rises with reach; where a door's `check` bar is lower
   than its reach, that is a genuine exception and the page has to own it
   rather than hide it. Both the test suite and the self-test read this.
   -------------------------------------------------------------------------- */

function reachOf(D, doorId) {
  const rows = ['see', 'do', 'keep'].map(a => {
    const c = cell(D, doorId, a);
    return c ? c.bar : 0;
  });
  return Math.max.apply(null, rows);
}

function checkOf(D, doorId) {
  const c = cell(D, doorId, 'check');
  return c ? c.bar : 0;
}

/** Doors whose review burden does not track their reach, with the gap. */
function checkExceptions(D) {
  return D.DOORS
    .map(d => ({ id: d.id, n: d.n, reach: reachOf(D, d.id), check: checkOf(D, d.id) }))
    .filter(r => r.check !== r.reach);
}

/** Is the `check` row monotonic left to right? The module says it is not. */
function checkIsStaircase(D) {
  const bars = D.DOORS.map(d => checkOf(D, d.id));
  return bars.every((v, i) => i === 0 || bars[i - 1] <= v);
}

/** Are the three reach rows each monotonic left to right? The module says yes. */
function reachRowsAreStaircases(D) {
  return ['see', 'do', 'keep'].every(a => {
    const bars = D.DOORS.map(d => { const c = cell(D, d.id, a); return c ? c.bar : 0; });
    return bars.every((v, i) => i === 0 || bars[i - 1] < v);
  });
}

/* --------------------------------------------------------------------------
   Act II — which door fits a job.

   `bestDoor` is the whole teaching payload and it is COMPUTED, so it cannot
   drift away from the verdicts underneath it: the smallest-numbered door
   whose verdict is 'yes'. "Smallest" is deliberate. It is the door that does
   the whole job while handing over the least.
   -------------------------------------------------------------------------- */

function jobById(D, id) { return D.JOBS.find(j => j.id === id) || null; }

function verdict(D, job, doorId) {
  return (job && job.doors && job.doors[doorId]) || null;
}

function bestDoor(D, job) {
  for (const door of D.DOORS) {
    const v = verdict(D, job, door.id);
    if (v && v.v === 'yes') return door;
  }
  return null;
}

/** How many doors can do the whole job, do part of it, or cannot. */
function tally(D, job) {
  const t = { yes: 0, partly: 0, no: 0 };
  for (const door of D.DOORS) {
    const v = verdict(D, job, door.id);
    if (v && t[v.v] !== undefined) t[v.v]++;
  }
  return t;
}

/** Distribution of best-fit doors across every job, keyed by door number. */
function bestDoorSpread(D) {
  const spread = {};
  for (const door of D.DOORS) spread[door.n] = 0;
  for (const job of D.JOBS) {
    const b = bestDoor(D, job);
    if (b) spread[b.n]++;
  }
  return spread;
}

/** Jobs whose smallest sufficient door is 1 or 2 — the module's closing claim. */
function jobsSolvedLow(D) {
  return D.JOBS.filter(j => { const b = bestDoor(D, j); return b && b.n <= 2; });
}

/* --------------------------------------------------------------------------
   Sources and confidence. The honesty machinery, in one place.
   -------------------------------------------------------------------------- */

/** Every src id referenced anywhere in the dataset, with where it was used. */
function sourceUses(D) {
  const uses = {};
  const note = (id, where) => {
    if (!id) return;
    (uses[id] = uses[id] || []).push(where);
  };
  const many = (list, where) => { (list || []).forEach(id => note(id, where)); };

  for (const door of D.DOORS) {
    many(door.costSrc, 'door ' + door.n + ' cost');
    many(door.whereSrc, 'door ' + door.n + ' surfaces');
    many(door.confusableSrc, 'door ' + door.n + ' note');
  }
  for (const { c, key } of cells(D)) {
    if (!c) continue;
    many(c.src, 'cell ' + key);
    note(c.quoteSrc, 'quote in ' + key);
  }
  many(D.CHECK_NOTE.src, 'check note');
  for (const ch of D.CHANGED) many(ch.src, 'changed: ' + ch.was);
  for (const r of (D.RECHECKED || [])) many(r.src, 'rechecked: ' + r.claim);
  many(D.UNEVEN.src, 'uneven row');
  note(D.UNEVEN.quoteSrc, 'uneven row quote');
  return uses;
}

/** Source ids referenced but not declared. Must be empty. */
function danglingSources(D) {
  return Object.keys(sourceUses(D)).filter(id => !D.SOURCES[id]);
}

/** Sources declared but never referenced. Must be empty. */
function unusedSources(D) {
  const uses = sourceUses(D);
  return Object.keys(D.SOURCES).filter(id => !uses[id]);
}

/** A source URL must name a page, not just a host. */
function isSpecificUrl(u) {
  const after = (String(u).split('://')[1] || '');
  const slash = after.indexOf('/');
  return slash > 0 && after.slice(slash + 1).length > 0;
}

function vagueSourceUrls(D) {
  return Object.keys(D.SOURCES).filter(id => !isSpecificUrl(D.SOURCES[id].u));
}

/** Confidence tally across the sixteen grid cells. */
function confTally(D) {
  const t = { verified: 0, reasoned: 0, unconfirmed: 0 };
  for (const { c } of cells(D)) if (c && t[c.conf] !== undefined) t[c.conf]++;
  return t;
}

/** Any cell claiming `verified` must actually cite something. */
function verifiedWithoutSource(D) {
  return cells(D)
    .filter(({ c }) => c && c.conf === 'verified' && !(c.src && c.src.length))
    .map(x => x.key);
}

/** A quote must name the source it came out of, and that source must exist. */
function quotesWithoutSource(D) {
  return cells(D)
    .filter(({ c }) => c && c.quote && !(c.quoteSrc && D.SOURCES[c.quoteSrc]))
    .map(x => x.key);
}

/* --------------------------------------------------------------------------
   The no-prices rule, enforced rather than remembered.

   Anything that looks like money in any of the currencies these vendors
   quote. Run across every string the screen can show.
   -------------------------------------------------------------------------- */

const MONEY = /(?:[$£€¥]\s?\d)|(?:\d+\s?(?:dollars|USD|GBP|EUR))|(?:\bper\s+seat\b)|(?:\/\s?month\b)|(?:\bper\s+month\b)/i;

/** Every string the dataset can put on screen, with a path for the failure. */
function screenStrings(D) {
  const out = [];
  const walk = (v, path) => {
    if (typeof v === 'string') { out.push([path, v]); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, path + '[' + i + ']')); return; }
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        /* Source URLs and ids are not prose and are exempt from the prose rules. */
        if (k === 'u' || k === 'src' || k === 'quoteSrc' || k === 'costSrc' ||
            k === 'whereSrc' || k === 'confusableSrc') continue;
        walk(v[k], path + '.' + k);
      }
    }
  };
  for (const k of ['INTRO', 'AXES', 'AXIS_NOTE', 'DOORS', 'CELLS', 'CHECK_NOTE',
                   'JOBS', 'JOBS_NOTE', 'VERDICT_LABEL', 'CHANGED', 'CHANGED_NOTE',
                   'RECHECKED', 'RECHECKED_NOTE',
                   'STALE', 'UNEVEN', 'CUT', 'CONF_LABEL', 'SOURCE_NOTE']) {
    walk(D[k], k);
  }
  return out;
}

function priceLeaks(D) {
  return screenStrings(D).filter(([, s]) => MONEY.test(s)).map(([p, s]) => p + ': ' + s);
}

/* --------------------------------------------------------------------------
   The no-ranking rule. The module describes capability; it must not tell a
   faculty member which vendor to buy.
   -------------------------------------------------------------------------- */

const RANKING = /\b(?:the best (?:tool|choice|option|product|vendor)|we recommend|you should (?:buy|choose|use instead)|superior to|better than (?:Claude|ChatGPT|Gemini|Copilot|Codex|Antigravity))\b/i;

function rankingLeaks(D) {
  return screenStrings(D).filter(([, s]) => RANKING.test(s)).map(([p]) => p);
}

/* --------------------------------------------------------------------------
   Counts quoted in prose. The test suite cross-checks these against
   README.md, the presenter guide and demo.json, so a number cannot be
   edited into a document without the code that produces it.
   -------------------------------------------------------------------------- */

function counts(D) {
  return {
    doors: D.DOORS.length,
    axes: D.AXES.length,
    gridCells: cells(D).length,
    jobs: D.JOBS.length,
    jobCells: D.JOBS.length * D.DOORS.length,
    sources: Object.keys(D.SOURCES).length,
    cut: D.CUT.length,
    changed: D.CHANGED.length,
    verifiedCells: confTally(D).verified,
    reasonedCells: confTally(D).reasoned,
    lowFitJobs: jobsSolvedLow(D).length
  };
}

return {
  cellKey, cell, cells, barText,
  reachOf, checkOf, checkExceptions, checkIsStaircase, reachRowsAreStaircases,
  jobById, verdict, bestDoor, tally, bestDoorSpread, jobsSolvedLow,
  sourceUses, danglingSources, unusedSources, isSpecificUrl, vagueSourceUrls,
  confTally, verifiedWithoutSource, quotesWithoutSource,
  screenStrings, priceLeaks, rankingLeaks, MONEY, RANKING, counts
};
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
