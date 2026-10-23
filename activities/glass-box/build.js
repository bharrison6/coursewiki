// Build: concatenate src/ plus the shared lesson shell into a single
// self-contained index.html. Refuses to emit a file containing any external
// src= or href= reference, so the single-file promise cannot rot.
//
//   node build.js          writes index.html and demo-guide.html
//   node build.js --check  verifies both against the canonical build, writes nothing
//
//     src/template.html    the app markup (three stages: LLM, Reasoning, Agents)
//     src/styles.css       the ACTIVITY styles (the lesson shell's are shared)
//     src/engine.js        the tiny transformer: init, forward, backward, sample
//     src/text.js          the character tokenizer and the training text
//     src/arith.js         the three-digit addition task and its verifier
//     src/agent.js         the fictional pizza world, its tools and the policy
//     src/worker.js        the training runtime (in a Worker, or inline)
//     src/app.js           the view layer, and the shell's two events
//     src/demo-guide.html  the canonical printable presenter guide
//     ../tools/lesson-shell/  tokens, shell CSS, shell behaviour, version stamp
//
// THE SHARED KIT IS A BUILD-TIME DEPENDENCY ONLY. Its CSS and behaviour are
// inlined here, so the shipped index.html is still one self-contained file with
// zero <script src> and zero <link href>. CONTRACT.md's self-containment
// requirement is about the built file (orchestrator ruling, 2026-09-15). The
// build stamps the output with a hash of the kit's CSS, so this demo goes red
// if the kit changes under it.
//
// ONE SOURCE FOR THE NOTES. src/demo-guide.html is canonical for three
// surfaces: the printable page shipped at the demo root, Glass-Box-Demo-Guide.pdf,
// and the app's Settings -> Open Presenter Notes overlay. Its scoped stylesheet
// and its .guide-scope body are lifted out verbatim and injected into the app,
// so nothing is fetched at runtime and --check fails the moment any surface
// drifts. Before this, the in-app notes were a hand-written near-copy (1,098
// words against the guide's 1,503) with nothing keeping them honest.
//
// The guide extraction, the placeholder discipline, the external-reference scan
// and the runtime-load scan used to live in this file as hand-rolled copies.
// They were lifted into ../tools/lesson-shell/guide-contract.js when the kit was
// extracted, and this file now calls that one canonical copy instead of keeping
// a second. The kit's version is the same algorithm with one more bait in its
// positive control (it adds `new WebSocket("wss://x")` to the three this file
// used to carry), so the swap strengthens the scan rather than loosening it.
'use strict';
const fs = require('fs');
const path = require('path');
const shell = require('../tools/lesson-shell');
const gc = require('../tools/lesson-shell/guide-contract');

const S = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const die = (msg) => { console.error(msg); process.exit(1); };

// worker.js is included in BOTH bundles: in the worker it wires itself to the
// message pipe; on the page its guard is inert and it just defines
// createWorkerRuntime, which app.js uses as the no-Worker fallback.
const CORE_FILES = ['engine.js', 'text.js', 'arith.js', 'agent.js', 'worker.js'];
const WORKER_FILES = ['engine.js', 'text.js', 'arith.js', 'worker.js'];

// This demo splits its JS across three script blocks rather than the kit's
// single __APP__ one, because WORKER_SRC has to be a string literal the page can
// hand to a Blob, and the core modules must be evaluated before app.js closes
// over them. These two markers are this demo's own; the rest come from the kit.
const MARK_CORE = '/*__CORE__*/';
const MARK_WORKER = '/*__WORKER__*/';

const paths = {
  index: path.join(__dirname, 'index.html'),
  srcGuide: path.join(__dirname, 'src', 'demo-guide.html'),
  guideOut: path.join(__dirname, 'demo-guide.html'),
  pdfOut: path.join(__dirname, 'Glass-Box-Demo-Guide.pdf')
};

function buildHtml() {
  const guideSrc = S('demo-guide.html');
  const guide = gc.extractGuide(guideSrc);

  // A literal </script> in any string would close the inline script early. None
  // of the sources carries one today; neutralising anyway keeps a future edit
  // from silently truncating the page.
  const neutralise = (s) => s.replace(/<\/script/gi, '<\\/script');
  const core = neutralise(CORE_FILES.map((f) => `/* ==== ${f} ==== */\n` + S(f)).join('\n;\n'));
  const workerSrc = WORKER_FILES.map((f) => S(f)).join('\n;\n');
  const app = neutralise(S('app.js'));

  let html = S('template.html');
  const markers = [
    shell.MARKERS.stamp,
    shell.MARKERS.shellCss,
    shell.MARKERS.appCss,
    shell.MARKERS.guideCss,
    shell.MARKERS.shellJs,
    MARK_CORE,
    MARK_WORKER,
    shell.MARKERS.app,
    shell.MARKERS.guide
  ];
  gc.assertPlaceholders(html, markers);

  /* Each injection is exactly-once and uses a function replacement, because a
     dollar-sign substitution pattern in the injected text would otherwise be
     eaten by String.replace. injectOnce does both. */
  html = gc.injectOnce(html, shell.MARKERS.stamp, shell.stamp());
  html = gc.injectOnce(html, shell.MARKERS.shellCss, shell.css());
  html = gc.injectOnce(html, shell.MARKERS.appCss, S('styles.css'));
  html = gc.injectOnce(html, shell.MARKERS.guideCss, guide.css);
  html = gc.injectOnce(html, shell.MARKERS.shellJs, shell.behaviourScript());
  html = gc.injectOnce(html, MARK_CORE, core);
  html = gc.injectOnce(html, MARK_WORKER, 'const WORKER_SRC = ' + JSON.stringify(workerSrc) + ';');
  html = gc.injectOnce(html, shell.MARKERS.app, app);
  html = gc.injectOnce(html, shell.MARKERS.guide, guide.html);

  /* The one permitted reference is the hyperlink to the printable guide beside
     index.html. assertNoExternalRefs only scans resource-loading tags, so the
     outbound <a href> citations in the Details drawer need no entry here. */
  gc.assertNoExternalRefs(html, ['demo-guide.html']);
  const control = gc.assertNoRuntimeLoads(html);

  return { html, guideSrc, guideHtml: guide.html, control };
}

function main(argv) {
  const unknown = argv.filter((a) => a !== '--check');
  if (unknown.length) die('Unknown build option: ' + unknown.join(', '));
  const { html, guideSrc, guideHtml, control } = buildHtml();
  const checkOnly = argv.includes('--check');

  if (!checkOnly) {
    fs.writeFileSync(paths.index, html);
    fs.copyFileSync(paths.srcGuide, paths.guideOut);
    console.log('built index.html (' + Math.round(html.length / 1024) + ' KB) and demo-guide.html');
    console.log('  lesson-shell ' + shell.stamp());
    console.log('  presenter notes injected from src/demo-guide.html: ' +
      guideHtml.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length + ' words');
    console.log('  runtime-load scan passed, proved on ' + control.controls + ' positive controls');
    console.log('NOTE: if the guide changed, re-render the PDF: node tools/pdf.mjs');
    return 0;
  }

  const same = (file, want) => fs.existsSync(file) && fs.readFileSync(file, 'utf8') === want;
  if (!same(paths.index, html)) {
    console.error('build parity MISMATCH — index.html differs from the canonical build. Run: node build.js');
    return 1;
  }
  if (!same(paths.guideOut, guideSrc)) {
    console.error('build parity MISMATCH — demo-guide.html differs from src/demo-guide.html. Run: node build.js');
    return 1;
  }
  // Index parity already implies this, the notes being a substring of the build
  // output. Assert it directly anyway: it is the property the contract names,
  // and a template edit that dropped the placeholder would otherwise pass
  // silently with the notes simply absent from the app.
  if (!fs.readFileSync(paths.index, 'utf8').includes(guideHtml)) {
    console.error('build parity MISMATCH — the in-app presenter notes are not the guide body. Run: node build.js');
    return 1;
  }
  // The PDF is a render, not a copy, so it cannot be compared byte for byte.
  // Freshness is the pin that is available: it must not predate the guide it is
  // a picture of. Two seconds of slack absorbs a fresh checkout, which stamps
  // every file at about the same instant.
  if (!fs.existsSync(paths.pdfOut)) {
    console.error('build parity MISMATCH — Glass-Box-Demo-Guide.pdf is missing. Run: node tools/pdf.mjs');
    return 1;
  }
  const lag = fs.statSync(paths.srcGuide).mtimeMs - fs.statSync(paths.pdfOut).mtimeMs;
  if (lag > 2000) {
    console.error('build parity MISMATCH — Glass-Box-Demo-Guide.pdf is older than src/demo-guide.html by ' +
      (lag / 1000).toFixed(0) + 's. Run: node tools/pdf.mjs');
    return 1;
  }
  console.log('build parity OK — index.html, demo-guide.html and the in-app presenter notes all derive');
  console.log('build parity OK — from src/demo-guide.html, and the PDF is no older than it; no files written');
  console.log('build parity OK — lesson-shell ' + shell.stamp());
  return 0;
}

module.exports = { buildHtml, paths };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
