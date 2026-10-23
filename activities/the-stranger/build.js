#!/usr/bin/env node
/* Build the-stranger/index.html from src/ plus the shared lesson shell.

     src/template.html     the app markup, on the lesson-shell parts
     src/styles.css        the ACTIVITY styles (the shell's are shared)
     src/app.js            the activity: levers, prompt, deck, answer, meter
     src/content.json      the 64 authored answers, MERGED by tools/validate.py
                           from the eight files in src/content/
     src/learn.json        the walkthrough states, the 12-item check bank,
                           the attached draft and the closing line
     src/cases.json        authored cases that are not lever fixtures
     src/scenarios.json    the four questions and the eight target cards
     src/demo-guide.html   the canonical printable presenter sheet
     ../tools/lesson-shell/  tokens, shell CSS, shell behaviour, version stamp

   THE SHARED KIT IS A BUILD-TIME DEPENDENCY ONLY. Its CSS and behaviour are
   inlined here, so the shipped index.html is still one self-contained file with
   zero <script src> and zero <link href>. The build stamps the output with a
   hash of the kit's CSS, so this demo goes red if the kit changes under it.

   ONE SOURCE FOR THE NOTES. src/demo-guide.html is canonical for three
   surfaces: the printable page shipped as presenter-sheet.html, the rendered
   The-Stranger-Presenter-Sheet.pdf, and Settings -> Open Presenter Notes. The
   shipped filename stays presenter-sheet.html because it is a public URL
   (demo.json -> guide).

   ONE SOURCE FOR THE CHECK BANK. The A6 check cards are GENERATED here from
   src/learn.json's twelve quiz items and src/cases.json, rather than authored
   into the template. Two reasons: the bank already carries written feedback for
   every option and copying it into markup would fork it; and the shell binds
   .check cards at load, before app.js runs, so cards built at runtime would
   never be wired. Generated-into-the-template is the only shape that satisfies
   both.

     node build.js           writes index.html and presenter-sheet.html
     node build.js --check   verifies both against the canonical build, that
                             the notes are the guide body, and that the PDF is
                             no older than the guide; writes nothing, exits 1
*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const shell = require('../tools/lesson-shell');
const gc = require('../tools/lesson-shell/guide-contract');

const here = __dirname;
const S = f => fs.readFileSync(path.join(here, 'src', f), 'utf8');
const J = f => JSON.parse(S(f));
const die = msg => { console.error('BUILD REFUSED — ' + msg); process.exit(1); };

const paths = {
  index: path.join(here, 'index.html'),
  srcGuide: path.join(here, 'src', 'demo-guide.html'),
  guideOut: path.join(here, 'presenter-sheet.html'),
  pdfOut: path.join(here, 'The-Stranger-Presenter-Sheet.pdf')
};

/* The three A6 markers are this demo's own, not the kit's. */
const CHECK_MARKERS = ['<!--__CHECKS_1__-->', '<!--__CHECKS_2__-->', '<!--__CHECKS_3__-->'];
const DATA_MARKER = '__DATA__';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------------------------------------------------------- A6 generation --
   Stage N's item is the bank item whose correct answer is lever N. The bank is
   uniform on that: index 0 is Context, 1 is Success spec, 2 is Expert keywords,
   for all four questions. That is ASSERTED below rather than assumed, so a
   future edit to learn.json that broke the alignment fails the build instead of
   silently showing the wrong item under the wrong lever. */
const LEVER_LABEL = ['Context', 'Success spec', 'Expert keywords'];

function checkCard(opts) {
  const optionHtml = opts.options.map(o =>
    '        <button class="check-option ' + (o.correct ? 'correct' : 'wrong') + '" type="button" aria-pressed="false"\n' +
    '                data-feedback="' + esc(o.feedback) + '">' + esc(o.label) + '</button>'
  ).join('\n');
  return '    <section class="check" data-wrong-lead="Not what this demo showed."' +
    (opts.scenario ? ' data-scenario="' + esc(opts.scenario) + '"' : '') +
    (opts.hidden ? ' hidden' : '') +
    (opts.refutation ? ' data-refutation="true"' : '') +
    ' aria-labelledby="' + opts.id + '-title">\n' +
    '      <span class="eyebrow">' + esc(opts.eyebrow || 'Check yourself') + '</span>\n' +
    '      <h3 id="' + opts.id + '-title">' + esc(opts.question) + '</h3>\n' +
    (opts.prompt ? '      <p class="check-prompt">' + esc(opts.prompt) + '</p>\n' : '') +
    (opts.body || '') +
    '      <div class="check-options">\n' + optionHtml + '\n      </div>\n' +
    '      <p class="check-feedback" role="status" aria-live="polite"></p>\n' +
    '    </section>';
}

function buildChecks(learn, cases, scenarios) {
  const out = [[], [], []];
  const sids = scenarios.map(s => s.id);
  for (const sid of sids) {
    const bank = learn.quizzes[sid];
    if (!bank || bank.length !== 3) die(`learn.json quizzes.${sid} must hold exactly 3 items (found ${bank ? bank.length : 0})`);
    bank.forEach((q, stage) => {
      const correct = q.options.find(o => o.correct);
      if (!correct) die(`learn.json quizzes.${sid}[${stage}] has no correct option`);
      /* The alignment assertion. */
      if (correct.label !== LEVER_LABEL[stage]) {
        die(`learn.json quizzes.${sid}[${stage}] answers "${correct.label}" but stage ${stage + 1} teaches ` +
            `"${LEVER_LABEL[stage]}" — the A6 card would test the wrong lever. Reorder the bank or fix the item.`);
      }
      if (!q.options.every(o => o.feedback && o.feedback.trim())) {
        die(`learn.json quizzes.${sid}[${stage}] has an option with no feedback; A6 requires feedback on every option`);
      }
      out[stage].push(checkCard({
        id: 'check-' + sid + '-' + (stage + 1),
        scenario: sid,
        hidden: sid !== sids[0],
        question: q.stem,
        prompt: 'Which lever would fix it?',
        options: q.options
      }));
    });
  }

  /* The accuracy-brief case closes stage 3. It is the demo's refutation item:
     its wrong options are the two flawed models this demo itself could leave
     behind — "a careful prompt cannot mislead" and "pull another lever". */
  const c = cases.accuracyBrief;
  if (!c) die('src/cases.json is missing accuracyBrief');
  const body =
    '      <span class="panel-kicker"><span class="k-sourced">Sourced</span><span class="k-qual">' + esc(c.kickerQual) + '</span></span>\n' +
    c.setup.map(p => '      <p class="check-prompt">' + p.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>') + '</p>').join('\n') + '\n' +
    '      <p class="check-prompt">' + c.tell.text.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>') + '</p>\n' +
    '      <p class="note">' + esc(c.tell.note) + '</p>\n';
  out[2].push(checkCard({
    id: 'check-accuracy-brief',
    eyebrow: c.eyebrow,
    question: c.check.question,
    prompt: c.check.prompt,
    body,
    options: c.check.options,
    refutation: true
  }));

  return out.map(a => a.join('\n'));
}

/* The printed sheet is hand-authored HTML, so its text carries entities where
   the JSON carries the characters. Decoding is therefore part of comparing
   them, not a way of loosening the comparison: an UNdecoded compare fails on
   every apostrophe and would have to be relaxed to something weaker than
   equality to pass at all. Named set is the sheet's actual vocabulary plus the
   numeric forms. */
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  middot: '·', mdash: '—', ndash: '–', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  times: '×', deg: '°', frac12: '½', rarr: '→'
};
function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z][a-z0-9]*);/gi, (m, name) => {
      const v = NAMED_ENTITIES[name] !== undefined ? NAMED_ENTITIES[name] : NAMED_ENTITIES[name.toLowerCase()];
      return v === undefined ? m : v;
    });
}

/* ------------------------------------------------- the content-gate pin ----
   WHAT THIS DOES AND, MORE IMPORTANTLY, WHAT IT DOES NOT.

   `src/content.json` is GENERATED by `tools/validate.py` from the eight files in
   `src/content/`, and validate.py is where the seven CONTENT GATES live — the
   5% sentence-overlap gate among them. `build.js` does not run them, and until
   2026-09-16 both `README.md` and `demo.json` said the 5% gate "fails the
   build". **It never did.** A clean `node build.js --check` was being offered as
   evidence that a content gate holds, and it was not evidence of that at all
   (accuracy audit M1).

   Why the gates are still not wired in here, stated rather than left implicit:
   validate.py takes no arguments and unconditionally WRITES `src/content.json`
   (and recomputes each response's `words`), so invoking it from `--check` would
   make a verification step write a file, which it must not do. Re-implementing
   its gates in JavaScript would be worse — a second copy of the gate logic is a
   fork, and the two would drift.

   So what is wired here is a STALENESS PIN, which needs no gate logic and
   therefore forks nothing: if any authored source in `src/content/` is newer
   than the merged `src/content.json`, somebody edited content and did not
   re-run the validator, and the build refuses. Same instrument as the PDF
   freshness pin below, for the same reason.

   RESIDUAL GAP, on the record: this does not catch a hand-edit of
   `src/content.json` itself, which would leave it newer than its sources and
   look fresh. That edit ships ungated. The honest mitigation is procedural —
   never edit the merged file — and the fixture-hash proof a build lane runs.
   Do not read a clean `--check` as "the content gates hold". */
function assertContentNotStale() {
  const dir = path.join(here, 'src', 'content');
  const merged = path.join(here, 'src', 'content.json');
  if (!fs.existsSync(dir) || !fs.existsSync(merged)) return 0;
  const mergedAt = fs.statSync(merged).mtimeMs;
  const stale = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .filter(f => fs.statSync(path.join(dir, f)).mtimeMs - mergedAt > 2000);
  if (stale.length) {
    die('src/content.json is older than its authored sources (' + stale.join(', ') + ').\n' +
        '  The merge and the seven content gates live in tools/validate.py, not here.\n' +
        '  Run: python tools/validate.py');
  }
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).length;
}

/* ------------------------------------------------------------ deck parity --
   Carried over verbatim in intent from the pre-kit build: the eight cut-out
   cards printed on page two of the presenter sheet are checked field by field
   against src/scenarios.json, so the paper deck and the on-screen deck cannot
   drift. `turns up in:` is DERIVED from which questions use each card. */
function assertDeckParity(guideSrc, cards, scenarios) {
  /* Parse the printed cards into fields, then match BY LABEL rather than by
     position: an order-dependent check would pass or fail on the sheet's layout
     rather than on its content, and the layout is allowed to change. */
  const printed = (guideSrc.match(/<div class="card">[\s\S]*?<\/div>\s*<\/div>|<div class="card">[\s\S]*?(?=<div class="card">)/g) || [])
    .map(block => {
      const pick = cls => {
        const m = block.match(new RegExp('<div class="' + cls + '">([\\s\\S]*?)<\\/div>'));
        return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : null;
      };
      return { icon: pick('ci'), label: pick('cl'), sub: pick('cs'), used: pick('cw') };
    })
    .filter(c => c.label);

  const ids = Object.keys(cards);
  if (printed.length !== ids.length) {
    die(`the presenter sheet prints ${printed.length} target cards; src/scenarios.json defines ${ids.length}`);
  }

  for (const id of ids) {
    const c = cards[id];
    const want = {
      icon: c.icon,
      label: String(c.label).replace(/\s+/g, ' ').trim(),
      sub: String(c.sub).replace(/\s+/g, ' ').trim(),
      /* DERIVED, not authored: which questions actually use this card. The
         printed name is the question's tab label with its leading article
         dropped ("The bridge" -> "bridge"), which is what the sheet has always
         used; the scenario *id* is "bridges" and would not match. */
      used: 'turns up in: ' + scenarios
        .filter(s => s.cards.includes(id))
        .map(s => s.tab.replace(/^the\s+/i, ''))
        .join(' · ')
    };
    const got = printed.find(p => p.label === want.label);
    if (!got) die(`printed target card missing for "${want.label}" (src/scenarios.json id "${id}")`);
    for (const field of ['icon', 'sub', 'used']) {
      if (got[field] !== want[field]) {
        die(`printed target card "${want.label}" has a ${field} that does not match src/scenarios.json.\n` +
            `  expected: ${want[field]}\n  printed:  ${got[field]}`);
      }
    }
  }
  return ids.length;
}

/* --------------------------------------------------------------- the build -- */
function buildHtml() {
  const content = J('content.json');
  const learn = J('learn.json');
  const cases = J('cases.json');
  const scenariosSrc = J('scenarios.json');

  if (!Array.isArray(content.scenarios) || !content.scenarios.length) die('src/content.json carries no scenarios');

  const data = Object.assign({}, content, {
    guide: learn.guide,
    quizzes: learn.quizzes,
    draftTitle: learn.draftTitle,
    draft: learn.draft,
    closing: learn.closing
  });

  /* The single-lever isolation notes travel with the build as a comment block,
     so the claim "flipping one lever changes exactly one dimension" is
     auditable from the shipped file alone. It is the AUTHOR'S per-state note,
     asserted rather than machine-checked — the README says so in those words. */
  const notes = [];
  let responseCount = 0, wordCount = 0;
  for (const sc of content.scenarios) {
    notes.push(`  ${sc.id}: ${sc.title}`);
    const c0 = sc.cards[0];
    for (const k of [`000|${c0}`, `100|${c0}`, '010', `001|${c0}`, '011', '111']) {
      const r = sc.responses[k];
      if (r) notes.push(`    ${k.padEnd(18)} ${r.note}`);
    }
    for (const k of Object.keys(sc.responses)) {
      responseCount++;
      wordCount += sc.responses[k].words || 0;
    }
  }

  const blob = JSON.stringify(data).replace(/<\//g, '<\\/');
  if (/<\/script/i.test(blob)) die('the data blob can close the script tag');

  const sourceCount = assertContentNotStale();

  const guideSrc = S('demo-guide.html');
  const deckCount = assertDeckParity(guideSrc, content.cards, scenariosSrc.scenarios);
  const guide = gc.extractGuide(guideSrc);
  const checks = buildChecks(learn, cases, content.scenarios);

  let html = S('template.html');
  const markers = [
    shell.MARKERS.stamp, shell.MARKERS.shellCss, shell.MARKERS.appCss,
    shell.MARKERS.guideCss, shell.MARKERS.shellJs, shell.MARKERS.app,
    shell.MARKERS.guide, DATA_MARKER, ...CHECK_MARKERS
  ];
  gc.assertPlaceholders(html, markers);

  html = gc.injectOnce(html, shell.MARKERS.stamp, shell.stamp());
  html = gc.injectOnce(html, shell.MARKERS.shellCss, shell.css());
  html = gc.injectOnce(html, shell.MARKERS.appCss, S('styles.css'));
  html = gc.injectOnce(html, shell.MARKERS.guideCss, guide.css);
  html = gc.injectOnce(html, shell.MARKERS.shellJs, shell.behaviourScript());
  html = gc.injectOnce(html, shell.MARKERS.guide, guide.html);
  CHECK_MARKERS.forEach((m, i) => { html = gc.injectOnce(html, m, checks[i]); });
  html = gc.injectOnce(html, DATA_MARKER, blob);
  html = gc.injectOnce(html, shell.MARKERS.app, S('app.js').replace(/<\/script/gi, '<\\/script'));

  /* The one permitted reference is the hyperlink to the printable guide beside
     index.html. assertNoExternalRefs scans resource-loading tags only; an <a>
     the reader may choose to follow is not a network call by the page. */
  gc.assertNoExternalRefs(html, ['presenter-sheet.html']);
  const control = gc.assertNoRuntimeLoads(html);

  /* This demo's own extra guard, kept from the pre-kit build because it is
     stricter than the kit's and it is the whole offline promise: no storage API
     may appear either, and the scan runs on the ASSEMBLED output so it covers
     the injected guide and the data blob. */
  const offenders = [...new Set(html.replace(/<!--[\s\S]*?-->/g, ' ')
    .match(/(localStorage|sessionStorage|indexedDB|XMLHttpRequest|new\s+WebSocket|new\s+EventSource)/gi) || [])];
  if (offenders.length) die('network or storage references found: ' + offenders.join(', '));

  const banner = `<!--
  PROMPTING STRATEGIES (THE STRANGER) — a fully deterministic classroom demo about why
  prompts work. Every response in this file was written by hand at build time. There is no
  model, no API key, and no request of any kind at runtime. Open it from a thumb
  drive on a machine with the wifi off; it behaves identically.
  ${content.scenarios.length} scenarios x 8 lever states, with three alternate
  target-deck responses for each of the four states where the success spec is off:
  ${responseCount} authored responses, ${wordCount.toLocaleString('en-US')} words.

  Built on the shared lesson shell at tools/lesson-shell (build-time only). The presenter
  notes in Settings are src/demo-guide.html, injected here at build time: one document, one
  source, and \`node build.js --check\` fails if any surface drifts.

  SINGLE-LEVER ISOLATION — what each lever, and only that lever, changed. This is the
  AUTHOR'S per-state note, not a machine-checked property; it is emitted here so a reader
  can audit the claim from the shipped file.
${notes.join('\n')}
-->
`;
  html = html.replace('<!doctype html>\n', () => '<!doctype html>\n' + banner);

  return { html, guideSrc, guideHtml: guide.html, control, responseCount, wordCount, deckCount, sourceCount };
}

function main(argv) {
  const unknown = argv.filter(a => a !== '--check');
  if (unknown.length) die('Unknown build option: ' + unknown.join(', '));
  const { html, guideSrc, guideHtml, control, responseCount, wordCount, deckCount, sourceCount } = buildHtml();
  const checkOnly = argv.includes('--check');

  if (!checkOnly) {
    fs.writeFileSync(paths.index, html);
    fs.copyFileSync(paths.srcGuide, paths.guideOut);
    console.log(`built index.html (${Math.round(html.length / 1024)} KB, ${responseCount} authored responses, ${wordCount.toLocaleString('en-US')} words)`);
    console.log('  lesson-shell ' + shell.stamp());
    console.log(`  presenter notes injected from src/demo-guide.html (${guideHtml.length} chars); presenter-sheet.html rewritten from it`);
    console.log(`  deck parity OK — ${deckCount} printed target cards match src/scenarios.json`);
    console.log(`  runtime-load scan passed, proved on ${control.controls} positive controls`);
    console.log(`  content not stale — ${sourceCount} authored sources are no newer than src/content.json`);
    console.log('  NOTE: the seven CONTENT gates (incl. the 5% sentence-overlap gate) live in');
    console.log('        tools/validate.py and are NOT run here. This build checks assembly only.');
    console.log('NOTE: if the guide changed, re-render the PDF: node tools/pdf.mjs');
    return 0;
  }

  const same = (file, want) => fs.existsSync(file) && fs.readFileSync(file, 'utf8') === want;
  if (!same(paths.index, html)) {
    console.error('build parity MISMATCH -- index.html differs from the canonical build. Run: node build.js');
    console.error('(the presenter notes come from src/demo-guide.html and the shell CSS from');
    console.error(' ../tools/lesson-shell, so a change to either requires a rebuild)');
    return 1;
  }
  if (!same(paths.guideOut, guideSrc)) {
    console.error('build parity MISMATCH -- presenter-sheet.html differs from src/demo-guide.html. Run: node build.js');
    return 1;
  }
  if (!fs.readFileSync(paths.index, 'utf8').includes(guideHtml)) {
    console.error('build parity MISMATCH -- the in-app presenter notes are not the guide body. Run: node build.js');
    return 1;
  }
  if (!fs.existsSync(paths.pdfOut)) {
    console.error('build parity MISMATCH -- The-Stranger-Presenter-Sheet.pdf is missing. Run: node tools/pdf.mjs');
    return 1;
  }
  /* The PDF is a render, not a copy, so it cannot be compared byte for byte.
     Freshness is the pin that is available: it must not predate the guide it is
     a picture of. Two seconds of slack absorbs a fresh checkout. */
  const lag = fs.statSync(paths.srcGuide).mtimeMs - fs.statSync(paths.pdfOut).mtimeMs;
  if (lag > 2000) {
    console.error('build parity MISMATCH -- The-Stranger-Presenter-Sheet.pdf is older than src/demo-guide.html by ' +
      (lag / 1000).toFixed(0) + 's. Run: node tools/pdf.mjs');
    return 1;
  }
  console.log('build parity OK -- index.html, presenter-sheet.html and the in-app presenter notes all derive');
  console.log('build parity OK -- from src/demo-guide.html, and the PDF is no older than it; no files written');
  console.log(`build parity OK -- ${responseCount} authored responses, ${deckCount} printed target cards match src/scenarios.json`);
  console.log('build parity OK -- lesson-shell ' + shell.stamp());
  console.log(`build parity OK -- ${sourceCount} authored sources are no newer than src/content.json`);
  console.log('NOT CHECKED HERE -- the seven content gates (incl. the 5% sentence-overlap gate) live');
  console.log('NOT CHECKED HERE -- in tools/validate.py. A clean --check is not evidence they hold.');
  return 0;
}

module.exports = { buildHtml, paths };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
