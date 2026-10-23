#!/usr/bin/env node
/* Build front-doors/index.html from src/ plus the shared lesson shell.

     src/template.html    the app shell markup (kit partials + this demo's activity)
     src/styles.css       the ACTIVITY styles (the lesson shell's are shared)
     src/data.js          every claim, source, job verdict and cut entry
     src/engine.js        pure functions: grid access, bestDoor, the honesty machinery
     src/app.js           the view layer: three stages, predictions, self-test
     src/demo-guide.html  the canonical printable presenter guide
     ../tools/lesson-shell/  tokens, shell CSS, shell behaviour, version stamp

   THE SHARED KIT IS A BUILD-TIME DEPENDENCY ONLY. Its CSS and behaviour are
   inlined here, so the shipped index.html is still one self-contained file
   with zero <script src> and zero <link href>. CONTRACT.md's self-containment
   requirement is about the built file; it says the build must be reproducible
   from the committed sources and does not require them to live in this
   folder (orchestrator ruling, 2026-09-15). The build stamps the output with
   a hash of the kit's CSS, so this demo goes red if the kit changes under it.

   ONE SOURCE FOR THE NOTES. src/demo-guide.html is canonical for three
   surfaces: the printable page shipped as presenter-guide.html (the filename
   CONTRACT.md's URL stays on, per A9), the rendered
   Front-Doors-Presenter-Guide.pdf, and the app's Settings -> Open Presenter
   Notes overlay. Its scoped stylesheet and its .guide-scope body are lifted
   verbatim and injected, so nothing is fetched at runtime and --check fails
   the moment any surface drifts.

   This demo is about products, and the two rules it holds itself to are
   worth enforcing at the gate rather than trusting to a reviewer's memory: no
   price reaches the screen, and no vendor is ranked. The build refuses to
   write if either leaks, using the same detectors the shipped test suite and
   the in-app self-test use.

     node build.js           writes index.html and presenter-guide.html
     node build.js --check   verifies both against the canonical build, and
                             that the PDF is no older than the guide; writes
                             nothing, exits 1 on any drift
*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const shell = require('../tools/lesson-shell');
const gc = require('../tools/lesson-shell/guide-contract');

const here = __dirname;
const S = f => fs.readFileSync(path.join(here, 'src', f), 'utf8');
const die = msg => { console.error(msg); process.exit(1); };

const JS_FILES = ['data.js', 'engine.js', 'app.js'];

const paths = {
  index: path.join(here, 'index.html'),
  srcGuide: path.join(here, 'src', 'demo-guide.html'),
  guideOut: path.join(here, 'presenter-guide.html'),
  pdfOut: path.join(here, 'Front-Doors-Presenter-Guide.pdf')
};

function buildHtml() {
  /* ---- the module's own two rules, enforced before anything is built ----
     Loaded through the same engine the app and the tests use, so there is
     one implementation of "is this a price" rather than three. */
  const D = require('./src/data.js');
  const E = require('./src/engine.js');
  const money = E.priceLeaks(D);
  if (money.length) die('build refuses to ship a price on the page:\n  ' + money.join('\n  '));
  const rank = E.rankingLeaks(D);
  if (rank.length) die('build refuses to ship a vendor ranking:\n  ' + rank.join('\n  '));
  const dangling = E.danglingSources(D);
  if (dangling.length) die('build refuses to ship a claim citing a source that does not exist:\n  ' + dangling.join(', '));

  const guideSrc = S('demo-guide.html');
  const guide = gc.extractGuide(guideSrc);

  let js = JS_FILES.map(f => `/* ==== ${f} ==== */\n` + S(f)).join('\n\n');
  js = js.replace(/<\/script/gi, '<\\/script');

  let html = S('template.html');
  const markers = [
    shell.MARKERS.stamp,
    shell.MARKERS.shellCss,
    shell.MARKERS.appCss,
    shell.MARKERS.guideCss,
    shell.MARKERS.shellJs,
    shell.MARKERS.app,
    shell.MARKERS.guide
  ];
  gc.assertPlaceholders(html, markers);

  html = gc.injectOnce(html, shell.MARKERS.stamp, shell.stamp());
  html = gc.injectOnce(html, shell.MARKERS.shellCss, shell.css());
  html = gc.injectOnce(html, shell.MARKERS.appCss, S('styles.css'));
  html = gc.injectOnce(html, shell.MARKERS.guideCss, guide.css);
  html = gc.injectOnce(html, shell.MARKERS.shellJs, shell.behaviourScript());
  html = gc.injectOnce(html, shell.MARKERS.app, js);
  html = gc.injectOnce(html, shell.MARKERS.guide, guide.html);

  /* The one permitted reference is the hyperlink to the printable guide
     sitting beside index.html. CONTRACT.md 2026-09-08: an <a href> the reader
     may choose to follow is not a network call by the page. The outbound
     source links (<a href="https://...">) are the point of this demo and are
     user-initiated navigations, not runtime fetches, so they are not part of
     this allow-list — assertNoExternalRefs only restricts resource-loading
     tags (script/link/img/iframe/source/video/audio/object). */
  gc.assertNoExternalRefs(html, ['presenter-guide.html']);
  const control = gc.assertNoRuntimeLoads(html);

  /* Every remaining URL in the file must be an outbound anchor, and every one
     of those must be a source the dataset declares. A stray link nobody
     signed off on is exactly the sort of thing this collection's contract
     exists to catch — carried over from this demo's pre-kit build.js. */
  {
    const declared = new Set(Object.keys(D.SOURCES).map(id => D.SOURCES[id].u));
    const linked = new Set();
    html.replace(/<a\b[^>]*\bhref\s*=\s*"([^"]+)"/gi, (m, href) => { linked.add(href); return m; });
    const stray = Array.from(linked).filter(u => !declared.has(u) && !u.startsWith('presenter-guide.html'));
    if (stray.length) die('build refuses to ship a link that is not a declared source:\n  ' + stray.join('\n  '));
    const httpish = (html.match(/https?:\/\/[^\s"'<>)]+/g) || [])
      .filter(u => !declared.has(u.replace(/[.,;]$/, '')));
    if (httpish.length) {
      die('build refuses to ship a URL that is not a declared source:\n  ' + Array.from(new Set(httpish)).join('\n  '));
    }
  }

  return { html, guideSrc, guideHtml: guide.html, control };
}

function main(argv) {
  const unknown = argv.filter(a => a !== '--check');
  if (unknown.length) die('Unknown build option: ' + unknown.join(', '));
  const { html, guideSrc, guideHtml, control } = buildHtml();
  const checkOnly = argv.includes('--check');

  if (!checkOnly) {
    fs.writeFileSync(paths.index, html);
    fs.copyFileSync(paths.srcGuide, paths.guideOut);
    console.log('built index.html (' + Math.round(html.length / 1024) + ' KB) and presenter-guide.html');
    console.log('  lesson-shell ' + shell.stamp());
    console.log('  presenter notes injected from src/demo-guide.html: ' +
      guideHtml.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length + ' words');
    console.log('  runtime-load scan passed, proved on ' + control.controls + ' positive controls');
    console.log('NOTE: if the guide changed, re-render the PDF: node tools/pdf.mjs');
    return 0;
  }

  const same = (file, want) => fs.existsSync(file) && fs.readFileSync(file, 'utf8') === want;
  if (!same(paths.index, html)) {
    console.error('build parity MISMATCH -- index.html differs from the canonical build. Run: node build.js');
    console.error('(the in-app presenter notes are generated from src/demo-guide.html, and the shell CSS');
    console.error(' comes from ../tools/lesson-shell, so a change to either requires a rebuild)');
    return 1;
  }
  if (!same(paths.guideOut, guideSrc)) {
    console.error('build parity MISMATCH -- presenter-guide.html differs from src/demo-guide.html. Run: node build.js');
    return 1;
  }
  if (!fs.readFileSync(paths.index, 'utf8').includes(guideHtml)) {
    console.error('build parity MISMATCH -- the in-app presenter notes are not the guide body. Run: node build.js');
    return 1;
  }
  if (!fs.existsSync(paths.pdfOut)) {
    console.error('build parity MISMATCH -- Front-Doors-Presenter-Guide.pdf is missing. Run: node tools/pdf.mjs');
    return 1;
  }
  const lag = fs.statSync(paths.srcGuide).mtimeMs - fs.statSync(paths.pdfOut).mtimeMs;
  if (lag > 2000) {
    console.error('build parity MISMATCH -- Front-Doors-Presenter-Guide.pdf is older than src/demo-guide.html by ' +
      (lag / 1000).toFixed(0) + 's. Run: node tools/pdf.mjs');
    return 1;
  }
  console.log('build parity OK -- index.html, presenter-guide.html and the in-app presenter notes all derive');
  console.log('build parity OK -- from src/demo-guide.html, and the PDF is no older than it; no files written');
  console.log('build parity OK -- lesson-shell ' + shell.stamp());
  return 0;
}

module.exports = { buildHtml, paths };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
