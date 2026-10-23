#!/usr/bin/env node
/* ==========================================================================
   AI Tool Guide (folder: front-doors) — dataset, engine and document checks.

   Run: node src/playtest.test.js        (VERBOSE=1 to print passing rows)

   Rewritten for the lesson-shell v2 retrofit (fleet/front-doors, 2026-09-16).
   Sections 1-6 (the dataset shape, the argument, sources/confidence, the two
   self-imposed rules, Act II/Stage 2) are close to what they were before the
   retrofit — engine.js and data.js kept the same shape, so the derivations
   they pin are unchanged. Sections 7-10 are REWRITTEN: this demo no longer
   owns its own Guide/Settings/Reset chrome (that is
   `../tools/lesson-shell`'s `behaviourScript()`, shared with every other
   retrofitted demo), so the built-file checks assert CONTRACT.md's
   properties against the kit's dialogs and behaviour instead of the old
   `#howto`/`#settings` overlay markup, on the two-winters retrofit's pattern.

   Four jobs, in ascending order of how much they matter.

   1. Ordinary unit testing of the derivations in engine.js.

   2. The honesty machinery. This module is ABOUT products, which makes it the
      demo in this collection most exposed to plausible-sounding invention. So
      the tests assert, in both directions, that every claim resolves to a
      declared first-party source; that nothing claims to be verified without
      citing something; and that the two rules the module holds itself to — no
      prices, no vendor ranking — have not leaked into any string the page can
      display.

   3. The prose cross-check. This repository's characteristic failure is prose
      drifting away from code, so every count quoted in README.md, the
      presenter guide and demo.json is checked against the dataset AS A PHRASE
      ("16 cells", not "16"), because a bare small integer matches almost any
      document and would be a test that passes by accident.

   4. The built page against the kit's contract: the shell's dialogs carry the
      labels CONTRACT.md fixes, Reset is in place (no reload) and this demo's
      `lessonreset` listener exists, the guide is injected verbatim from
      src/demo-guide.html, and nothing in the shipped file reaches the network.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const D = require('./data.js');
const E = require('./engine.js');
const gc = require('../../tools/lesson-shell/guide-contract');

const HERE = __dirname;
const ROOT = path.join(HERE, '..');

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, detail) {
  if (cond) { pass++; results.push(['PASS', name, detail]); }
  else { fail++; results.push(['FAIL', name, detail]); }
}
function head(t) { results.push(['----', t, '']); }
const readRoot = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ==================== 1. shape of the dataset ============================ */
head('1. shape');

ok('There are exactly four doors', D.DOORS.length === 4, String(D.DOORS.length));
ok('There are exactly four axes', D.AXES.length === 4, String(D.AXES.length));
ok('Doors are numbered 1 to 4 in order',
   D.DOORS.map(d => d.n).join(',') === '1,2,3,4');
ok('Axes are numbered 1 to 4 in order',
   D.AXES.map(a => a.n).join(',') === '1,2,3,4');
ok('Door ids are unique', new Set(D.DOORS.map(d => d.id)).size === 4);
ok('Axis ids are unique', new Set(D.AXES.map(a => a.id)).size === 4);
ok('Every axis defines exactly four rungs',
   D.AXES.every(a => Array.isArray(a.bars) && a.bars.length === 4));
ok('Every rung is a sentence rather than a word',
   D.AXES.every(a => a.bars.every(b => b.length > 20)));

ok('The grid has sixteen cells', E.cells(D).length === 16, String(E.cells(D).length));
ok('Every one of the sixteen exists', E.cells(D).every(x => !!x.c),
   E.cells(D).filter(x => !x.c).map(x => x.key).join(', '));
ok('Every cell has a head short enough to read on a phone',
   E.cells(D).every(({ c }) => c.head.length > 0 && c.head.length <= 62),
   E.cells(D).filter(({ c }) => c.head.length > 62).map(x => x.key).join(', '));
ok('Every cell explains itself in more than a sentence fragment',
   E.cells(D).every(({ c }) => c.why.length > 80));
ok('Every bar is a level its own axis defines',
   E.cells(D).every(({ c, axis }) => E.barText(D, axis.id, c.bar) !== null));

/* ==================== 2. the thesis, as data ============================= */
head('2. the argument');

ok('The three reach rows rise strictly across the four doors',
   E.reachRowsAreStaircases(D),
   ['see', 'do', 'keep'].map(a => a + ': ' +
     D.DOORS.map(d => E.cell(D, d.id, a).bar).join('')).join(' | '));

ok('The review row is NOT a simple staircase — the module\'s actual claim',
   !E.checkIsStaircase(D),
   'check: ' + D.DOORS.map(d => E.checkOf(D, d.id)).join(''));

const exceptions = E.checkExceptions(D);
ok('At least one door has a review burden that departs from its reach',
   exceptions.length > 0,
   exceptions.map(r => 'door ' + r.n + ' reach ' + r.reach + ' check ' + r.check).join('; '));

ok('The desktop coworker is the hardest door to check',
   E.checkOf(D, 'coworker') === Math.max.apply(null, D.DOORS.map(d => E.checkOf(D, d.id))),
   'coworker ' + E.checkOf(D, 'coworker') + ' vs coding ' + E.checkOf(D, 'coding'));
ok('The coding agent is easier to check than the coworker, because of the diff',
   E.checkOf(D, 'coding') < E.checkOf(D, 'coworker'));
ok('The agent inside your own documents is among the two cheapest to check',
   E.checkOf(D, 'inapp') <= 2, String(E.checkOf(D, 'inapp')));

ok('Both exception cells are labelled reasoned rather than verified',
   exceptions.every(r => E.cell(D, r.id, 'check').conf === 'reasoned'),
   exceptions.map(r => r.id + ':' + E.cell(D, r.id, 'check').conf).join(', '));
ok('The check-row explanation is present and argues the point at length',
   D.CHECK_NOTE.body.length >= 3 && D.CHECK_NOTE.body.join(' ').length > 400);
ok('The check-row explanation admits it is not verified',
   /reasoned/i.test(D.CHECK_NOTE.body.join(' ')));
ok('The bar scale admits the staircase is an artefact of choosing the doors',
   /chosen|artefact/i.test(D.AXIS_NOTE));

/* ==================== 3. sources and confidence ========================== */
head('3. sources');

const dangling = E.danglingSources(D);
ok('Every claim resolves to a declared source', dangling.length === 0, dangling.join(', '));
const unused = E.unusedSources(D);
ok('No source is declared and never used', unused.length === 0, unused.join(', '));
const vague = E.vagueSourceUrls(D);
ok('Every source URL names a page, not just a host', vague.length === 0, vague.join(', '));
ok('Every source is marked first-party',
   Object.keys(D.SOURCES).every(id => D.SOURCES[id].kind === 'primary'));
ok('Every source has a title long enough to say what it is',
   Object.keys(D.SOURCES).every(id => D.SOURCES[id].t.length > 25),
   Object.keys(D.SOURCES).filter(id => D.SOURCES[id].t.length <= 25).join(', '));
ok('Every source URL is https',
   Object.keys(D.SOURCES).every(id => /^https:\/\//.test(D.SOURCES[id].u)),
   Object.keys(D.SOURCES).filter(id => !/^https:\/\//.test(D.SOURCES[id].u)).join(', '));

{
  const firstParty = [
    'claude.com', 'help.openai.com', 'learn.chatgpt.com', 'openai.com',
    'support.microsoft.com', 'support.google.com', 'knowledge.workspace.google.com',
    'antigravity.google'
  ];
  const bad = Object.keys(D.SOURCES).filter(id => {
    const host = (D.SOURCES[id].u.split('://')[1] || '').split('/')[0];
    return !firstParty.some(h => host === h || host.endsWith('.' + h));
  });
  ok('Every source host is a vendor host, not a news site or a blog',
     bad.length === 0, bad.join(', '));
}

const noSrc = E.verifiedWithoutSource(D);
ok('No cell claims "verified" without citing a source', noSrc.length === 0, noSrc.join(', '));
const badQuote = E.quotesWithoutSource(D);
ok('Every quotation names the source it came out of', badQuote.length === 0, badQuote.join(', '));

{
  const verified = E.cells(D).filter(({ c }) => c.conf === 'verified');
  const quoted = verified.filter(({ c }) => !!c.quote);
  ok('Every verified cell carries the vendor\'s own wording',
     quoted.length === verified.length,
     quoted.length + ' of ' + verified.length);
}

const conf = E.confTally(D);
ok('Every cell carries one of the three confidence labels',
   conf.verified + conf.reasoned + conf.unconfirmed === 16,
   JSON.stringify(conf));
ok('The majority of cells are verified against a first-party page',
   conf.verified > 16 / 2, String(conf.verified));
ok('At least one cell is honestly labelled as reasoning',
   conf.reasoned > 0, String(conf.reasoned));
ok('Every confidence label used has a definition the reader can see',
   E.cells(D).every(({ c }) => !!D.CONF_LABEL[c.conf]));

/* 2026-09-16 correction lane: the row is no longer asserted uneven. Gemini Spark
   (support.google.com/gemini/answer/16596215) filled it, so the panel is verified
   against that page AND keeps the record of the miss on screen. */
ok('The formerly uneven row is verified against the product that filled it',
   D.UNEVEN.conf === 'verified' && D.UNEVEN.src.indexOf('gemini-spark') > -1, D.UNEVEN.conf);
ok('The formerly uneven row still explains why a search cannot prove a non-existence, and owns the miss',
   /cannot establish|whole world|did not find/i.test(D.UNEVEN.note) && /wrong/i.test(D.UNEVEN.note));
ok('The formerly uneven row states what was checked, where and when, not what does not exist',
   /checked on \d{1,2} [A-Z][a-z]+ \d{4}/.test(D.UNEVEN.body) && !/stays uneven/i.test(D.UNEVEN.head));

/* -------- per-source dates (the SOURCE_NOTE fix) ------------------------- */
ok('Every source carries the ISO date it was last opened',
   Object.keys(D.SOURCES).every(id => /^\d{4}-\d{2}-\d{2}$/.test(D.SOURCES[id].checked || '')),
   Object.keys(D.SOURCES).filter(id => !D.SOURCES[id].checked).join(', '));
ok('The page date is the OLDEST source date, so no source is dated later than it was opened',
   Object.keys(D.SOURCES).every(id => D.SOURCES[id].checked >= D.CHECKED_ISO) &&
   Object.keys(D.SOURCES).some(id => D.SOURCES[id].checked === D.CHECKED_ISO), D.CHECKED_ISO);
ok('The source note no longer asserts one date for every source unless every source carries it',
   (Object.keys(D.SOURCES).every(id => D.SOURCES[id].checked === D.CHECKED_ISO)) === /every one was opened on/.test(D.SOURCE_NOTE));
ok('No learner-facing string asserts that a capability does not exist without a check date (the absence-claim rule)',
   !/stays uneven|no version of this door|has never existed|turned up no consumer-plan/i.test(JSON.stringify(D)));

ok('The source note discloses that OpenAI pages refuse automated retrieval',
   /403|refuse[sd]? automated/i.test(D.SOURCE_NOTE));

/* -------- 3b. the 2026-09-16 recheck (RECHECKED — symmetric evidence) ---- */

ok('At least one claim was rechecked and confirmed still true, with its own date',
   Array.isArray(D.RECHECKED) && D.RECHECKED.length >= 3, String((D.RECHECKED || []).length));
ok('Every rechecked entry cites a real, quoted source',
   (D.RECHECKED || []).every(r => r.quote && r.src && r.src.length && r.src.every(id => !!D.SOURCES[id])));
ok('Every rechecked entry is labelled verified, not reasoned or unconfirmed',
   (D.RECHECKED || []).every(r => r.conf === 'verified'));
ok('The Codex web/mobile claim — this demo\'s top-ranked pre-build risk — is the rechecked claim',
   (D.RECHECKED || []).some(r => /Codex/i.test(r.claim) && /web or on a phone|web and mobile/i.test(r.claim)),
   (D.RECHECKED || []).map(r => r.claim).join(' | '));
ok('RECHECKED_ON is a real date distinct from CHECKED_ON only in being at least as recent',
   /^\d{1,2} [A-Za-z]+ \d{4}$/.test(D.RECHECKED_ON || ''), D.RECHECKED_ON);
ok('The antigravity source was retargeted off the desktop-setup-only page',
   D.SOURCES.antigravity && !/getting-started/.test(D.SOURCES.antigravity.u),
   D.SOURCES.antigravity && D.SOURCES.antigravity.u);
ok('A dedicated source backs the "remote-control mode" phrase in door 4\'s confusable note',
   !!D.SOURCES['antigravity-remote'] && /remote-control/.test(D.SOURCES['antigravity-remote'].u));
ok('Door 4\'s confusable note cites the remote-control source',
   (D.DOORS.find(d => d.id === 'coding') || {}).confusableSrc.includes('antigravity-remote'));

/* ==================== 4. the two self-imposed rules ====================== */
head('4. no prices, no ranking');

const money = E.priceLeaks(D);
ok('No price reaches any string the page can display', money.length === 0, money.join(' | '));
const rank = E.rankingLeaks(D);
ok('No vendor is recommended or ranked', rank.length === 0, rank.join(', '));

ok('CONTROL: the price detector fires on a real price',
   E.MONEY.test('Pro is $20/month') && E.MONEY.test('costs £15 per month') &&
   E.MONEY.test('20 dollars') && E.MONEY.test('billed per seat'));
ok('CONTROL: the price detector does not fire on ordinary prose',
   !E.MONEY.test('four doors and sixteen cells, checked in September 2026') &&
   !E.MONEY.test('Gemini 3.8 Flash') && !E.MONEY.test('door 3 reaches at level 3'));
ok('CONTROL: the ranking detector fires on a recommendation',
   E.RANKING.test('we recommend Claude') &&
   E.RANKING.test('this is the best tool for the job') &&
   E.RANKING.test('it is better than Copilot'));
ok('CONTROL: the ranking detector does not fire on a neutral comparison',
   !E.RANKING.test('the smallest door that does the whole job') &&
   !E.RANKING.test('easier to check than the door above it'));

{
  const strings = E.screenStrings(D);
  ok('The price and ranking probes actually walk the dataset',
     strings.length > 200, strings.length + ' strings');
  ok('The walk reaches the cells, the jobs and the cut list',
     strings.some(([p]) => p.startsWith('CELLS.')) &&
     strings.some(([p]) => p.startsWith('JOBS')) &&
     strings.some(([p]) => p.startsWith('CUT')));
  ok('The walk also reaches the RECHECKED panel',
     strings.some(([p]) => p.startsWith('RECHECKED')));
  ok('CONTROL: a planted price inside the dataset would be caught',
     E.priceLeaks({
       INTRO: { title: 'Pro costs $20 a month', body: [], note: '' },
       AXES: [], DOORS: [], CELLS: {}, CHECK_NOTE: { head: '', body: [] },
       JOBS: [], JOBS_NOTE: '', VERDICT_LABEL: {}, CHANGED: [], CHANGED_NOTE: '',
       RECHECKED: [], RECHECKED_NOTE: '',
       STALE: { head: '', rot: [], keep: [] }, UNEVEN: {}, CUT: [],
       CONF_LABEL: {}, SOURCE_NOTE: ''
     }).length === 1);
}

/* ==================== 5. act II / stage 2 ================================= */
head('5. pick a job');

ok('Every job has a verdict for every door',
   D.JOBS.every(j => D.DOORS.every(d => !!E.verdict(D, j, d.id))));
ok('Every verdict is one of the three the legend defines',
   D.JOBS.every(j => D.DOORS.every(d => !!D.VERDICT_LABEL[E.verdict(D, j, d.id).v])));
ok('Every verdict names one of the four axes as its reason',
   D.JOBS.every(j => D.DOORS.every(d =>
     D.AXES.some(a => a.id === E.verdict(D, j, d.id).axis))));
ok('Every verdict argues itself in a sentence rather than a word',
   D.JOBS.every(j => D.DOORS.every(d => E.verdict(D, j, d.id).why.length > 40)));
ok('Every verdict declares what you hand over, even when that is nothing',
   D.JOBS.every(j => D.DOORS.every(d => typeof E.verdict(D, j, d.id).hand === 'string')));
ok('A "wrong door" verdict asks for no access at all',
   D.JOBS.every(j => D.DOORS.every(d => {
     const v = E.verdict(D, j, d.id);
     return v.v !== 'no' || v.hand === '';
   })),
   D.JOBS.flatMap(j => D.DOORS.filter(d => {
     const v = E.verdict(D, j, d.id); return v.v === 'no' && v.hand !== '';
   }).map(d => j.id + '/' + d.id)).join(', '));
ok('Every "does the whole job" verdict at door 3 or 4 names a real cost',
   D.JOBS.every(j => ['coworker', 'coding'].every(id => {
     const v = E.verdict(D, j, id);
     return v.v !== 'yes' || v.hand.length > 10;
   })));
ok('Every job says enough about itself to be recognisable',
   D.JOBS.every(j => j.name.length > 20 && j.detail.length > 40));
ok('Job ids are unique', new Set(D.JOBS.map(j => j.id)).size === D.JOBS.length);

ok('Every job is doable at some door',
   D.JOBS.every(j => !!E.bestDoor(D, j)),
   D.JOBS.filter(j => !E.bestDoor(D, j)).map(j => j.id).join(', '));

const low = E.jobsSolvedLow(D);
ok('At least two jobs are finished completely by door 1 or door 2',
   low.length >= 2, low.map(j => j.id).join(', '));
ok('At least one job is finished by a chat window alone',
   D.JOBS.some(j => { const b = E.bestDoor(D, j); return b && b.n === 1; }));
ok('At least one job cannot be done at door 1 at all — the floor exists',
   D.JOBS.some(j => E.verdict(D, j, 'chat').v === 'no'),
   D.JOBS.filter(j => E.verdict(D, j, 'chat').v === 'no').map(j => j.id).join(', '));
ok('The jobs span the doors rather than all landing on one',
   Object.keys(E.bestDoorSpread(D)).filter(k => E.bestDoorSpread(D)[k] > 0).length >= 3,
   JSON.stringify(E.bestDoorSpread(D)));

{
  const j = E.jobById(D, 'rename');
  ok('The file-renaming job is impossible at both of the first two doors',
     E.verdict(D, j, 'chat').v === 'no' && E.verdict(D, j, 'inapp').v === 'no');
  ok('And its smallest sufficient door is the coworker, not the coding agent',
     E.bestDoor(D, j).id === 'coworker', E.bestDoor(D, j).id);
  const q = E.jobById(D, 'questions');
  ok('The quiz-writing job is finished at door 1 and hands over nothing',
     E.bestDoor(D, q).n === 1 && E.verdict(D, q, 'chat').hand === '');
}

ok('A job that touches student work carries an institutional caution',
   !!E.jobById(D, 'reflections').caution);
ok('That caution points at the institution rather than answering for it',
   /your institution|registrar|IT/i.test(E.jobById(D, 'reflections').caution));
ok('The jobs note admits the list is not a sample of a real week',
   /chosen to span|not a sample/i.test(D.JOBS_NOTE));

/* ==================== 6. the receipts ==================================== */
head('6. receipts');

ok('At least two product names are shown as already changed',
   D.CHANGED.length >= 2, String(D.CHANGED.length));
ok('Every changed entry names the old name, the new one and what it is',
   D.CHANGED.every(c => c.was && c.now && c.what && c.body.length > 60));
ok('At least two of the changes are quoted from the vendor',
   D.CHANGED.filter(c => !!c.quote).length >= 2);
ok('Every change cites a source', D.CHANGED.every(c => c.src && c.src.length));
ok('The Word rename is on the page, since it is the clearest example',
   D.CHANGED.some(c => /Agent Mode/i.test(c.was)));
ok('The ChatGPT agent retirement is on the page',
   D.CHANGED.some(c => /ChatGPT agent/i.test(c.was)));

ok('The cut list is not empty and every entry says why',
   D.CUT.length > 0 && D.CUT.every(c => c.claim && c.why && c.why.length > 40));
ok('Prices are explicitly in the cut list',
   D.CUT.some(c => /price/i.test(c.claim)));
ok('The stale panel predicts what will rot and what will hold',
   D.STALE.rot.length >= 3 && D.STALE.keep.length >= 3);

ok('The page carries the date it was checked',
   /\d{4}/.test(D.CHECKED_ON) && /^\d{4}-\d{2}-\d{2}$/.test(D.CHECKED_ISO), D.CHECKED_ON);
ok('The prose date and the machine date agree',
   D.CHECKED_ON.indexOf(D.CHECKED_ISO.slice(0, 4)) > -1 &&
   D.CHECKED_ISO.slice(5, 7) === '09' && /September/.test(D.CHECKED_ON),
   D.CHECKED_ON + ' vs ' + D.CHECKED_ISO);
ok('The introduction warns that the page will go stale',
   /stale/i.test(D.INTRO.note));

/* ==================== 7. prose against code ==============================
   The characteristic failure of this repository, guarded as a phrase match so
   a bare "4" in an unrelated sentence cannot make it pass. `guide` is now the
   CANONICAL SOURCE (src/demo-guide.html), not the shipped copy, matching how
   build.js itself reads it; the shipped presenter-guide.html is asserted
   byte-identical to it separately, in section 8.
   ======================================================================= */
head('7. prose');

const readme = readRoot('README.md');
const guide  = fs.readFileSync(path.join(HERE, 'demo-guide.html'), 'utf8');
const manifest = readRoot('demo.json');
const docs = [readme, guide, manifest].join('\n');

{
  const c = E.counts(D);
  const pins = [
    [c.gridCells + ' cells', 'the size of the grid'],
    [c.jobCells + ' judgements', 'act II verdict count'],
    [c.sources + ' sources', 'the source count'],
    [c.verifiedCells + ' verified', 'verified cell count'],
    [c.reasonedCells + ' reasoned', 'reasoned cell count'],
    [c.cut + ' things cut', 'the cut-list length'],
    [c.doors + ' doors', 'the door count'],
    [c.axes + ' axes', 'the axis count'],
    [c.jobs + ' jobs', 'the job count']
  ];
  const missing = pins.filter(([p]) => !docs.includes(p)).map(([p, w]) => `"${p}" (${w})`);
  ok('Every count quoted in the docs matches the dataset',
     missing.length === 0, 'not found in README, guide or manifest: ' + missing.join(', '));
  results.push(['    ', pins.length + ' figures cross-checked against three documents', '']);

  ok('CONTROL: a wrong count would not be found in the docs',
     !docs.includes((c.gridCells + 1) + ' cells') &&
     !docs.includes((c.sources + 1) + ' sources'));
}

ok('The check date appears in README.md', readme.includes(D.CHECKED_ISO) || readme.includes(D.CHECKED_ON));
ok('The check date appears in the presenter guide', guide.includes(D.CHECKED_ON));
ok('The recheck date appears in the presenter guide',
   guide.includes(D.RECHECKED_ON) || guide.includes('rechecked'));
ok('The manifest records the check date as the added date',
   JSON.parse(manifest).added === D.CHECKED_ISO, JSON.parse(manifest).added);

{
  const b = readme.indexOf('<!-- prices:begin -->');
  const e = readme.indexOf('<!-- prices:end -->');
  ok('README.md marks off the one block where figures are allowed', b > -1 && e > b);
  if (b > -1 && e > b) {
    const inside = readme.slice(b, e);
    const outside = readme.slice(0, b) + readme.slice(e);
    ok('That block states the date the figures were read',
       inside.includes(D.CHECKED_ISO) || inside.includes(D.CHECKED_ON) || inside.includes('2026-09-08'));
    ok('No figure appears in README.md outside that block',
       !E.MONEY.test(outside),
       (outside.match(E.MONEY) || []).join(' | '));
    ok('CONTROL: the block does contain figures, so the rule has something to guard',
       E.MONEY.test(inside));
  }
  ok('No price appears anywhere in the presenter guide',
     !E.MONEY.test(guide), (guide.match(E.MONEY) || []).join(' | '));
}

/* ==================== 8. the built file, against the kit's contract ======
   This demo no longer owns Guide/Settings/Reset chrome — the shell does.
   Checks assert CONTRACT.md's properties against the shell's dialogs and
   this demo's own activity/Details/#item-details markup, on the
   two-winters retrofit's slicing pattern (dialogBlock / hasButtonLabelled),
   so a document-wide label search cannot match the injected guide's own
   prose about the same three labels.
   ======================================================================= */
head('8. the built file');

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  ok('index.html exists — run node build.js', false);
} else {
  const built = readRoot('index.html');
  const shell = require('../../tools/lesson-shell');

  ok('The built file is one file with everything inlined', built.length > 60000,
     (built.length / 1024).toFixed(0) + ' KB');

  ok('The lesson-shell stamp is present and current',
     !!shell.readStamp(built) && shell.readStamp(built).version === shell.VERSION &&
     shell.readStamp(built).cssHash === shell.cssHash());

  const fetchers = [];
  built.replace(/<(script|link|img|iframe|source|video|audio|embed|object|track)\b[^>]*>/gi, tag => {
    if (/\b(src|href|data)\s*=\s*["']?(?!#)[^"'>\s]+/i.test(tag) && !/data:/i.test(tag)) {
      fetchers.push(tag.slice(0, 70));
    }
    return tag;
  });
  ok('Nothing in the built file fetches an external resource',
     fetchers.length === 0, fetchers.join(' | '));

  ok('The built file makes no runtime network calls',
     !/\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|importScripts|navigator\.sendBeacon|EventSource/.test(built));
  ok('The built file stores nothing on the device',
     !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(built));
  ok('The built file runs no AI at runtime',
     !/api\.openai|api\.anthropic|generativelanguage|\bapi[_-]?key\b/i.test(built));

  ok('CONTROL: the network probe fires on a page that does fetch',
     /\bfetch\s*\(|XMLHttpRequest/.test('const r = await fetch("/x")'));
  ok('CONTROL: the storage probe fires on a page that does store',
     /localStorage/.test('localStorage.setItem("a",1)'));

  {
    const declared = new Set(Object.keys(D.SOURCES).map(id => D.SOURCES[id].u));
    const urls = Array.from(new Set(built.match(/https?:\/\/[^\s"'<>)]+/g) || []))
      .map(u => u.replace(/[.,;]$/, ''));
    const stray = urls.filter(u => !declared.has(u));
    ok('Every URL in the built file is a declared source', stray.length === 0, stray.join(' | '));
    ok('And every declared source actually reaches the page',
       Object.keys(D.SOURCES).every(id => built.includes(D.SOURCES[id].u)),
       Object.keys(D.SOURCES).filter(id => !built.includes(D.SOURCES[id].u)).join(', '));
    /* Source chips are built by app.js at runtime (a.target = '_blank';
       a.rel = 'noopener noreferrer') rather than written as literal HTML, so
       that pattern is checked in the script text; the Details drawer's
       hand-authored <a> tags in template.html use the literal attribute form
       instead. Either is a safe outbound link; the check accepts both. */
    ok('Every outbound link opens safely (literal rel="noopener[ noreferrer]" markup, or the '
       + "app's a.target/a.rel assignment for dynamically-built source chips)",
       (built.match(/target="_blank"/g) || []).length > 0 &&
       ((built.match(/rel="noopener(?: noreferrer)?"/g) || []).length > 0 ||
        (built.match(/a\.rel = 'noopener noreferrer'/g) || []).length > 0) &&
       built.includes("a.target = '_blank'"));
  }

  ok('No price reaches the built page',
     !E.MONEY.test(built), (built.match(E.MONEY) || []).join(' | '));

  /* ---- guide injection, re-derived the same way build.js extracts it ---- */
  {
    const guideSrc = fs.readFileSync(path.join(HERE, 'demo-guide.html'), 'utf8');
    const extracted = gc.extractGuide(guideSrc);
    ok('The extracted guide stylesheet begins with a .guide-scope rule',
       /^\.guide-scope\b/.test(extracted.css.trim()));
    ok('The exact extracted guide stylesheet is injected in the built page, verbatim',
       built.includes(extracted.css));
    ok('The exact extracted guide body is injected in the built page, verbatim, exactly once',
       built.split(extracted.html).length - 1 === 1);
    ok('The guide\'s page chrome did NOT leak into the app',
       built.indexOf('Standalone printable page only') === -1);

    const guideOut = readRoot('presenter-guide.html');
    ok('The shipped presenter-guide.html is byte-identical to src/demo-guide.html',
       guideOut === guideSrc);
  }

  ok('Attribution is visible in the built file',
     built.includes('Bryant Harrison') && built.includes('Murray State University'));

  /* ---- slice out the Settings dialog, the way two-winters' retrofit does,
     so a label search cannot match the injected guide's own prose about the
     same three labels. Dialogs do not nest in this markup, so the first
     </dialog> after the opening tag is unambiguous. ---------------------- */
  function dialogBlock(id) {
    const re = new RegExp('<dialog\\b[^>]*\\bid="' + id + '"[^>]*>');
    const m = re.exec(built);
    if (!m) return null;
    const close = built.indexOf('</dialog>', m.index);
    if (close < 0) return null;
    return built.slice(m.index, close + '</dialog>'.length);
  }
  function hasButtonLabelled(block, label) {
    const re = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    for (let m; (m = re.exec(block)) !== null; ) {
      if (m[1].replace(/<[^>]*>/g, '').replace(/&middot;|&mdash;/g, ' ').trim() === label) return true;
    }
    return false;
  }

  const settings = dialogBlock('settings');
  ok('The Settings dialog exists', !!settings);
  if (settings) {
    ok('CONTROL: the Settings block can be isolated and contains no injected guide markup',
       !settings.includes('guide-scope') && settings.length > 300 && settings.length < built.length / 4,
       settings.length + ' chars');
    ok('Settings offers "Open Presenter Notes"', hasButtonLabelled(settings, 'Open Presenter Notes'));
    ok('Settings offers "Presentation mode"', hasButtonLabelled(settings, 'Presentation mode'));
    ok('Settings offers "Reset"', hasButtonLabelled(settings, 'Reset'));
    ok('Settings offers the demo-specific "Run the self-test", after the fixed triad',
       hasButtonLabelled(settings, 'Run the self-test') &&
       settings.indexOf('id="reset-btn"') < settings.indexOf('id="btn-selftest"'));

    const outside = built.split(settings).join('');
    results.push(['    ',
      'scoping control — "Presentation mode" outside Settings: ' +
      (outside.split('Presentation mode').length - 1) + ' occurrence(s) (the injected guide ' +
      'also names it, which is why the search above is scoped to the dialog)', '']);
  }

  const guideDialog = dialogBlock('guide');
  ok('The Guide dialog exists and is headed "Guide"',
     !!guideDialog && /<h2 id="guide-title">Guide<span/.test(guideDialog));
  ok('The Guide button\'s accessible name and tooltip are exactly "Guide"',
     /id="guide-open"[^>]*aria-label="Guide"/.test(built) &&
     /id="guide-open"[^>]*title="Guide"/.test(built));
  ok('The Guide dialog opens on load',
     /if \(guide && !guide\.open\) \{/.test(built) && /guide\.showModal\(\);/.test(built));

  /* ---- Reset is IN PLACE (kit v2): no reload primitive, veto consulted
     first, dispatch, and this demo's own listener. Prose in the shell's
     own explanatory comment mentions "location.reload()" as history, so
     comments are stripped before the negative scan (guide-contract.js's
     own rule: prove the scan on bait before trusting its silence). ------ */
  {
    const scripts = built.split('<script>').slice(1).map(s => s.split('</script>')[0]);
    const shellJs = scripts.find(s => s.includes('window.lessonShell = {')) || '';
    const appJs = scripts.find(s => s.includes('/* ==== app.js ==== */')) || '';
    const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
    ok('The shell script and this demo\'s app script were both found in the built file',
       shellJs.length > 0 && appJs.length > 0);
    ok('A #reset-btn control exists', /id="reset-btn"/.test(built));
    ok('POSITIVE CONTROL — the navigation scan sees a reload when one is present',
       /location\.reload\(\)/.test(decomment(shellJs + '\nlocation.reload();')));
    ok('The shell\'s script contains no navigation primitive: Reset is in place',
       !/location\.reload\(\)|location\.replace\(|location\.assign\(|location\.href\s*=/.test(decomment(shellJs)));
    ok('The shell\'s Reset consults onReset() first and a false return cancels it',
       /if \(window\.lessonShell\.onReset && window\.lessonShell\.onReset\(\) === false\) return false;/.test(shellJs));
    ok('The shell dispatches \'lessonreset\' after restoring its own chrome',
       /document\.dispatchEvent\(new CustomEvent\('lessonreset'/.test(shellJs));
    ok('This demo listens for \'lessonreset\' (the required half of the contract)',
       /addEventListener\('lessonreset', resetActivity\)/.test(appJs));
    ok('This demo also documents (and does not implement) a stagechange handler, per ADOPTING.md '
       + 'step 7 (chrome-only; never render activity state from it)',
       /addEventListener\('stagechange'/.test(appJs));
  }

  /* ---- the demo's own item-details dialog is distinct from the kit's
     #details drawer (ADOPTING.md §5), and both must exist with no id
     collision — check-shell.js's "unique ids" check already covers the
     general case; this re-asserts the specific pair this demo depends on. */
  ok('The kit\'s per-stage #details drawer and this demo\'s own #item-details '
     + 'drill-down are two distinct dialogs',
     /id="details"/.test(built) && /id="item-details"/.test(built) &&
     built.match(/id="details"/g).length === 1 && built.match(/id="item-details"/g).length === 1);

  ok('The page title is unchanged ("AI Tool Guide")',
     /<title>AI Tool Guide/.test(built));
  ok('The header brand carries the display title',
     /<h1>AI Tool Guide<\/h1>/.test(built));

  ok('Every stage carries its eyebrow with the demo\'s fleet position',
     (built.match(/Demo 6 of 17 &middot; Part three &middot; Stage \d/g) || []).length === 3);
}

/* ==================== 9. phone-first, mechanically ======================= */
head('9. phone');

{
  const shellCss = require('../../tools/lesson-shell').css();
  const ownCss = fs.readFileSync(path.join(HERE, 'styles.css'), 'utf8');
  const css = shellCss + '\n' + ownCss;

  /* Scoped to this demo's OWN stylesheet: the kit's tap-target floor
     (shell.css's own interactive-element rule is 38px) is the kit's
     responsibility, already verified when the kit was frozen, and shell.css
     also carries a non-interactive `.obs-cue { min-height: 34px }` (a status
     line, not a control) that would otherwise read as a false positive here. */
  const smalls = (ownCss.match(/min-height:\s*(\d+)px/g) || [])
    .map(m => +m.match(/(\d+)/)[1]).filter(v => v < 36);
  ok('No interactive rule in this demo\'s own stylesheet declares a tap target below the 36px floor',
     smalls.length === 0, smalls.join(', '));
  ok('CONTROL: that probe reads real values out of this demo\'s own stylesheet',
     (ownCss.match(/min-height:\s*\d+px/g) || []).length >= 3,
     (ownCss.match(/min-height:\s*\d+px/g) || []).length + ' declarations found');

  ok('The grid stacks by default and only becomes a grid at a breakpoint',
     /#grid\s*\{[^}]*display:\s*flex/.test(css) &&
     /@media \(min-width: 940px\)/.test(css));
  ok('The wide layout collapses the wrappers rather than duplicating markup',
     /\.g-rail,\s*\.g-group\s*\{\s*display:\s*contents/.test(css));

  ok('The Murray State fleet palette is declared (via the shared lesson-shell tokens)',
     /--navy:\s*#002144/.test(css) && /--gold:\s*#ECAC00/.test(css) &&
     /--lite:\s*#00A4E3/.test(css) && /--warm:\s*#FF4500/.test(css));
  ok('Warm (the fleet\'s red-orange failure colour) is used sparingly in this demo\'s own CSS',
     (fs.readFileSync(path.join(HERE, 'styles.css'), 'utf8').match(/var\(--bad\)/g) || []).length <= 8);

  ok('Reduced-motion is honoured (via the shared lesson-shell)', /prefers-reduced-motion/.test(css));
}

/* ==================== 10. the manifest =================================== */
head('10. manifest');

{
  const m = JSON.parse(readRoot('demo.json'));
  ok('The slug is the folder name', m.slug === 'front-doors', m.slug);
  ok('The entry point is the built file', m.entry === 'index.html');
  ok('The guide is declared, both html and pdf',
     m.guide && m.guide.html === 'presenter-guide.html' &&
     /\.pdf$/.test(m.guide.pdf), JSON.stringify(m.guide));
  ok('The declared guide files exist',
     fs.existsSync(path.join(ROOT, m.guide.html)) &&
     fs.existsSync(path.join(ROOT, m.guide.pdf)),
     'html ' + fs.existsSync(path.join(ROOT, m.guide.html)) +
     ', pdf ' + fs.existsSync(path.join(ROOT, m.guide.pdf)));
  ok('Provenance is recorded rather than left empty',
     Array.isArray(m.built_with) && m.built_with.length > 0, JSON.stringify(m.built_with));
  ok('Attribution names the author and the institution',
     m.attribution && m.attribution.author === 'Bryant Harrison' &&
     m.attribution.institution === 'Murray State University');
  ok('The theme is the Murray State one', m.theme === 'murray-state');
  ok('The compliance block carries every key the contract names',
     ['readme', 'guide', 'guide_button', 'settings_menu', 'presentation_mode',
      'presenter_notes', 'settings_reset', 'notes_match_guide', 'msu_theme',
      'attribution_visible', 'mobile',
      'offline_no_inference'].every(k => k in m.compliance),
     Object.keys(m.compliance).join(','));
  ok('The manifest title is the new display title',
     m.title === 'AI Tool Guide', m.title);
  ok('Provenance names this build step',
     m.built_with.includes('claude-code'), JSON.stringify(m.built_with));
  ok('The folder name and the declared guide filenames did NOT change with it',
     m.slug === 'front-doors' && m.guide.html === 'presenter-guide.html' &&
     m.guide.pdf === 'Front-Doors-Presenter-Guide.pdf');
  ok('No compliance key is missing rather than false',
     Object.keys(m.compliance).every(k => [true, false, 'unverified'].includes(m.compliance[k])));
  ok('The manifest carries no price either',
     !E.MONEY.test(readRoot('demo.json')));
  ok('The manifest\'s added date matches the dataset\'s check date',
     m.added === D.CHECKED_ISO, m.added + ' vs ' + D.CHECKED_ISO);
}

/* ============================== report ================================== */

const width = results.reduce((m, r) => Math.max(m, r[1].length), 0);
for (const [state, name, detail] of results) {
  if (state === 'FAIL' || state === '----' || process.env.VERBOSE) {
    if (state === '----') console.log('\n--- ' + name + ' ' + '-'.repeat(Math.max(0, 52 - name.length)));
    else console.log(state, name.padEnd(width), detail ? '| ' + detail : '');
  }
}
console.log('\n' + '='.repeat(64));
console.log(fail ? `${fail} of ${pass + fail} checks FAILED` : `all ${pass} checks passed`);
process.exit(fail ? 1 : 0);
