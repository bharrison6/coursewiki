#!/usr/bin/env node
/* ==========================================================================
   AI Winters: Boom and Bust — the built page against CONTRACT.md's Required UX.

   Run: node src/contract.test.js   (after `node build.js`)

   Rewritten for the lesson-shell retrofit (fleet/two-winters). The demo no
   longer owns its own Guide/Settings/Reset chrome — that is
   `../tools/lesson-shell`'s `behaviourScript()`, shared with every other
   retrofitted demo — so this file checks the SAME CONTRACT.md properties
   against the kit's markup and behaviour instead of re-deriving them, and
   leans on `guide-contract.js` (the same module build.js uses) for the guide
   extraction rather than re-parsing it a second, divergent way.

   The trap this file is written around, unchanged from before the retrofit.
   Once the presenter guide is injected into the page, the guide's own prose
   names "Open Presenter Notes", "Presentation mode" and "Reset" — so a
   document-wide search for those labels matches the answer key rather than
   the menu. Every label assertion below is therefore made against the
   Settings dialog ALONE, sliced out by its `<dialog>...</dialog>` bounds
   (dialogs do not nest in this file, so the first `</dialog>` after the
   opening tag is unambiguous), and that slice is first asserted to contain
   no `.guide-scope` markup. A positive control (the labels are found where
   they should be) and a negative control (they are also present elsewhere,
   so the scoping is doing real work) are both reported.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const gc = require('../../tools/lesson-shell/guide-contract');

const INDEX = path.join(__dirname, '..', 'index.html');
const GUIDE_SRC = path.join(__dirname, 'demo-guide.html');
const html = fs.readFileSync(INDEX, 'utf8');

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, detail) {
  if (cond) { pass++; results.push(['PASS', name, detail]); }
  else { fail++; results.push(['FAIL', name, detail]); }
}
function note(text) { results.push(['NOTE', text, '']); }

const TITLE = 'AI Winters: Boom and Bust';

/* ------------------------------------------------------------- slicing --- */

/** The whole `<dialog ... id="ID">...</dialog>` block. Dialogs are not
 *  nested anywhere in this file's markup, so the first `</dialog>` after the
 *  opening tag is unambiguous — no balanced-tag counting needed. */
function dialogBlock(id) {
  const re = new RegExp('<dialog\\b[^>]*\\bid="' + id + '"[^>]*>');
  const m = re.exec(html);
  if (!m) return null;
  const close = html.indexOf('</dialog>', m.index);
  if (close < 0) return null;
  return html.slice(m.index, close + '</dialog>'.length);
}

/** The text of the first <button> in `block` whose content trims to `label`. */
function hasButtonLabelled(block, label) {
  const re = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  for (let m; (m = re.exec(block)) !== null; ) {
    if (decode(m[1]).replace(/<[^>]*>/g, '').trim() === label) return true;
  }
  return false;
}

const ENT = { '&mdash;': '—', '&ndash;': '–', '&rsquo;': '’', '&lsquo;': '‘',
  '&ldquo;': '“', '&rdquo;': '”', '&middot;': '·', '&amp;': '&',
  '&nbsp;': ' ', '&times;': '×', '&#9881;': '⚙', '&rarr;': '→' };
const decode = s => s.replace(/&[a-z#0-9]+;/gi, e => ENT[e] != null ? ENT[e] : e);

/* ==================== 1. the retitle, everywhere in-app ================== */

{
  const t = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
  ok('<title> carries the display title', decode(t).indexOf(TITLE) === 0, t.trim());

  const brand = (html.match(/<div class="brandline">[\s\S]*?<h1>([\s\S]*?)<\/h1>/i) || [])[1] || '';
  ok('The header brand carries the display title',
     decode(brand).toUpperCase().indexOf(TITLE.toUpperCase()) === 0, brand.trim().slice(0, 60));

  ok('The injected guide heading carries the display title',
     new RegExp('<h1>' + TITLE + ' &mdash; presenter guide</h1>').test(html));

  ok('No stale "TWO WINTERS" all-caps wordmark is left in the chrome',
     !/<h1>TWO WINTERS/.test(html));
}

/* ========================= 2. the Guide button =========================== */

{
  const btn = (html.match(/<button[^>]*id="guide-open"[^>]*>[\s\S]*?<\/button>/i) || [])[0] || '';
  ok('The Guide button exists in the header', btn.length > 0);
  ok('Its accessible name is exactly Guide', /aria-label="Guide"/.test(btn), btn);
  ok('Its tooltip is exactly Guide', /title="Guide"/.test(btn), btn);
  ok('It still carries the ? glyph', /<span aria-hidden="true">\?<\/span>/.test(btn));

  const g = dialogBlock('guide');
  ok('The Guide dialog exists', !!g);
  const h2 = g && (g.match(/<h2 id="guide-title">([\s\S]*?)<span/i) || [])[1];
  ok('The Guide dialog heading reads exactly "Guide"', (h2 || '').trim() === 'Guide', String(h2));
  ok('The Guide dialog opens on load (kit v2: Reset no longer reloads, so there is no '
     + '"arrived from a Reset" case and the old hash-flag guard must be gone)',
     /if \(guide && !guide\.open\) \{/.test(html) && /guide\.showModal\(\);/.test(html)
     && !/flags\.has\('reset'\)/.test(html));
  ok('The Guide dialog is dismissible (native <dialog> Escape/backdrop/close button) and reopenable '
     + 'from at least two places (header + footer)',
     !!g && /<form method="dialog"><button type="submit" aria-label="Close">/.test(g)
     && (html.match(/class="[^"]*\bguide-open\b[^"]*"/g) || []).length >= 2);
}

/* ===================== 3. the Settings menu, scoped ====================== */

const settings = dialogBlock('settings');
ok('The Settings dialog exists', !!settings);

if (settings) {
  /* The guard that makes every assertion below mean something. */
  ok('The Settings block contains no injected guide markup (no answer key inside it)',
     !/guide-scope/.test(settings));
  ok('The Settings block is a plausible size, not the whole document',
     settings.length > 400 && settings.length < html.length / 4,
     settings.length + ' chars of ' + html.length);

  ok('Settings offers a button labelled exactly "Open Presenter Notes"',
     hasButtonLabelled(settings, 'Open Presenter Notes'));
  ok('Settings offers a button labelled exactly "Presentation mode"',
     hasButtonLabelled(settings, 'Presentation mode'));
  ok('Settings offers a button labelled exactly "Reset"',
     hasButtonLabelled(settings, 'Reset'));
  ok('Settings offers the demo-specific "Run the self-test" option, after the fixed triad',
     hasButtonLabelled(settings, 'Run the self-test')
     && settings.indexOf('id="reset-btn"') < settings.indexOf('id="btn-selftest"'));

  /* Negative control for the scoping: the same labels DO appear elsewhere in
     the document (the injected guide names them), so a document-wide search
     would have passed even with an empty menu. */
  const outside = html.split(settings).join('');
  note('scoping control — "Open Presenter Notes" outside the Settings block: '
     + (outside.split('Open Presenter Notes').length - 1) + ' occurrence(s); '
     + '"Presentation mode": ' + (outside.split('Presentation mode').length - 1) + '; '
     + '"Reset": ' + (outside.split('Reset').length - 1)
     + '  (a document-wide assertion would match these instead of the menu)');
}

/* ==================== 4. Reset is in place, no reload ====================
   Kit v2 (operator ruling 2026-09-16). The shell restores what the kit owns
   and dispatches `lessonreset`; this demo's resetActivity() restores the
   activity. The old section here asserted that the shell reached
   location.reload() — that assertion is now inverted.

   What is checkable statically: the button; NO navigation primitive anywhere
   in the shell's script (the load-bearing negative, because the way in-place
   regresses is a reload creeping back in); the dispatch; the veto consulted
   first; and this demo's listener. What is NOT checkable here — that the
   answers, timeline, lenses and opened cards actually come back — is why the
   browser pass is non-waivable, and P2-progress/K2-progress carry that
   evidence with its sentinel control.

   Prose is not code: the shell's Reset comment explains that v1 called
   location.reload(), so block comments are stripped before the negative
   scan, and the scan is proved on bait first (guide-contract.js's rule). */
{
  const scripts = html.split('<script>').slice(1).map(c => c.split('</script>')[0]);
  const shellJs = scripts.find(s => s.includes('window.lessonShell = {')) || '';
  const appJs = scripts.find(s => s.includes('AI Winters: Boom and Bust self-test')) || '';
  const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  ok('The shell script and the app script were both found in the built file',
     shellJs.length > 0 && appJs.length > 0);
  ok('A #reset-btn control exists', /id="reset-btn"/.test(html));
  ok('POSITIVE CONTROL — the navigation scan sees a reload when one is present',
     /location\.reload\(\)/.test(decomment(shellJs + '\nlocation.reload();')));
  ok("The shell's script contains no navigation primitive: Reset is in place",
     !/location\.reload\(\)|location\.replace\(|location\.assign\(|location\.href\s*=/.test(decomment(shellJs)));
  ok("The shell's Reset consults onReset() first and a false return cancels it",
     /if \(window\.lessonShell\.onReset && window\.lessonShell\.onReset\(\) === false\) return false;/.test(shellJs));
  ok("The shell dispatches 'lessonreset' after restoring its own chrome",
     /document\.dispatchEvent\(new CustomEvent\('lessonreset'/.test(shellJs));
  ok("This demo listens for 'lessonreset' (the required half of the contract)",
     /addEventListener\('lessonreset'/.test(appJs));
  ok('The dead #reset hash flag from the reload era is gone',
     !/flags\.has\('reset'\)/.test(shellJs) && !/f\.push\('presenting'\)/.test(shellJs));
}

/* ============= 5. the notes are the guide, injected cleanly ==============
   Re-derives the SAME extraction build.js uses (guide-contract.js), rather
   than re-parsing the guide a second, potentially divergent way, and checks
   the exact injected text is present verbatim in the built file. */
{
  const guideSrc = fs.readFileSync(GUIDE_SRC, 'utf8');
  const guide = gc.extractGuide(guideSrc);

  ok('The extracted guide stylesheet begins with a .guide-scope rule (guide-contract.js '
     + 'already refuses an unscoped sheet at build time; this re-checks the shipped file)',
     /^\.guide-scope\b/.test(guide.css.trim()));
  ok('The exact extracted guide stylesheet text is injected in the built page, verbatim',
     html.includes(guide.css));
  ok('The exact extracted guide body (.guide-scope div) is injected in the built page, verbatim, '
     + 'exactly once',
     html.split(guide.html).length - 1 === 1);

  const notes = dialogBlock('presenter-notes');
  ok('The guide body is injected inside the Presenter Notes dialog', !!notes && notes.includes(guide.html));

  ok('The Presenter Notes dialog opens from a .notes-open trigger, and the shell\'s dialog-swap '
     + 'logic closes whichever dialog the trigger was pressed inside before opening the new one '
     + '(so Notes opened from Settings closes Settings, from Guide closes Guide, etc. — a general '
     + 'rule rather than one hardcoded pair)',
     /const b = e\.target\.closest && e\.target\.closest\('\.notes-open'\);/.test(html)
     && /if \(host\) host\.close\(\);/.test(html));

  /* The guide is one document, not a summary of one: the printable copy's
     body must be byte-identical to what the app shows — the same string,
     asserted twice above (verbatim-injected, and present in the dialog),
     and here confirmed against the ACTUAL presenter-guide.html on disk. */
  const guideOut = path.join(__dirname, '..', 'presenter-guide.html');
  const printedMatches = fs.existsSync(guideOut) && fs.readFileSync(guideOut, 'utf8') === guideSrc;
  ok('The shipped presenter-guide.html is byte-identical to src/demo-guide.html (one source, '
     + 'not a copy that can drift)', printedMatches);
}

/* ======================== 6. offline at runtime ========================== */

{
  const banned = [['fetch(', /\bfetch\s*\(/], ['XMLHttpRequest', /XMLHttpRequest/],
    ['WebSocket', /WebSocket/], ['@import', /@import/], ['url(http', /url\(\s*['"]?https?:/i],
    ['navigator.sendBeacon', /sendBeacon/], ['EventSource', /EventSource/],
    ['import(', /\bimport\s*\(/]];
  for (const [name, re] of banned) ok(`No ${name} anywhere in the shipped page`, !re.test(html), name);

  /* Loading tags may not reach the network at all. Anchors may: the guide link
     and the outbound source links are the point of the demo. */
  const offenders = [];
  html.replace(/<(script|link|img|iframe|source|video|audio|embed|object)\b[^>]*>/gi, tag => {
    if (/\b(src|href|data)\s*=\s*["']?https?:/i.test(tag)) offenders.push(tag.slice(0, 80));
    return tag;
  });
  ok('No resource-loading tag points at http(s)', offenders.length === 0, offenders.join(' | '));

  /* Positive control: the detector must actually fire on a page that offends. */
  const control = '<img src="https://example.com/x.png"><script src="https://cdn.example.com/y.js"></script>';
  const found = [];
  control.replace(/<(script|link|img|iframe|source|video|audio|embed|object)\b[^>]*>/gi, tag => {
    if (/\b(src|href|data)\s*=\s*["']?https?:/i.test(tag)) found.push(tag);
    return tag;
  });
  ok('POSITIVE CONTROL: the same detector finds 2 offenders in a deliberately bad page',
     found.length === 2, found.length + ' found');

  const anchors = (html.match(/<a\b[^>]*href="https?:[^"]*"/gi) || []);
  note(`outbound <a href="http(s)…"> links: ${anchors.length} (sources and the guide link; these are `
     + 'user-initiated navigations, not runtime fetches)');
}

/* ================================ report ================================= */

for (const [tag, name, detail] of results) {
  console.log(tag.padEnd(4), name + (detail ? ' — ' + detail : ''));
}
console.log(`\n${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail ? 1 : 0);
