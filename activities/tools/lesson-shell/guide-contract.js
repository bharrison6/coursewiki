/* ===========================================================================
   lesson-shell / guide-contract.js

   The presenter-notes-are-the-printable-guide contract, as one module every
   demo's build.js requires instead of re-implementing. Generalized from
   glass-box/build.js, which is the only implementation in the fleet that gets
   all four checks right.

   WHY EACH CHECK EXISTS — every one of these is a bug that actually shipped:

   1. LINE-ANCHORED, UNIQUE MARKERS. `source.indexOf('<style id="guide-css">')`
      finds the FIRST occurrence, and a head comment that explains the
      mechanism by naming the marker is exactly the sort of thing that occurs
      first. ion-flight's build.js used plain indexOf and its guide's own head
      comment names `id="guide-css"` on line 10, with the real block on line
      21 — it worked only because the comment's spelling differed by a hair.
      So: markers must start a line, and must do so exactly once, and the
      search runs over a copy with every <!-- --> region blanked to
      same-length spaces so a comment cannot satisfy the requirement.

   2. SCOPE LEAK. The lifted stylesheet lands inside an app that has its own.
      One unscoped rule — `body`, `*`, a bare `h2` — restyles the whole demo
      from inside a hidden overlay, which is a miserable thing to track down.
      Parse the blocks rather than guessing from line shape: the rules are
      written one per line but wrap, so a "line ends with {" heuristic
      inspects nothing and passes vacuously. Refuse a stylesheet that parsed
      to zero rules for the same reason.

   3. PLACEHOLDER COUNT. String.replace with a string argument substitutes the
      FIRST occurrence, so a placeholder named a second time anywhere in the
      file — in a comment explaining the mechanism, say — silently swallows the
      injection and the notes are simply absent from the app. Require exactly
      one of each, and inject with a FUNCTION replacement, because $$ / $& /
      $` / $' inside the injected text would otherwise be eaten as
      substitution patterns.

   4. RUNTIME-LOAD SCAN WITH A POSITIVE CONTROL. Prose is not code: HTML and
      block comments are stripped before the scan, or a source comment that
      merely mentions <iframe> refuses the build (it did, while glass-box was
      being written). Stripping is what makes the scan able to MISS things, so
      the scan is proved on synthetic bait before its silence is believed.
      A null result without its positive control is not evidence.

   API
     const gc = require('../tools/lesson-shell/guide-contract');
     const guide = gc.extractGuide(guideSource);      // { css, html }
     gc.assertPlaceholders(template, [...markers]);   // throws on 0 or >1
     const out = gc.injectOnce(template, marker, text);
     gc.assertNoRuntimeLoads(builtHtml);              // proves itself first
     gc.assertNoExternalRefs(builtHtml, ['demo-guide.html']);
       // ^ the allow-list is for a SAME-FOLDER file referenced by one of the
       //   scanned tags. Outbound <a href="https://..."> source links are not
       //   scanned at all and never need listing — see the note on the
       //   function itself.

   Every function THROWS on failure with a message that names the file concept
   and the fix. A build.js catches nothing: the throw is the refusal.
   =========================================================================== */
'use strict';

const MARKERS = Object.freeze({
  guideCssOpen: '<style id="guide-css">',
  guideBodyOpen: '<div class="guide-scope">',
  guideBodyEnd: '\n</div><!-- /guide -->'
});

/* A copy of `source` with every HTML comment replaced by the same number of
   spaces, so byte offsets into it are valid offsets into the original. */
function maskComments(source) {
  const masked = source.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  if (masked.length !== source.length) {
    throw new Error('guide-contract: the comment mask changed the file length — offsets would be wrong');
  }
  return masked;
}

/* The index of `marker` where it starts a line, requiring exactly one such
   place. Check 1 above is this function. */
function soleLineIndex(haystack, marker, what) {
  const re = new RegExp('^' + marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gm');
  const hits = [];
  let m;
  while ((m = re.exec(haystack))) hits.push(m.index);
  if (hits.length === 0) {
    throw new Error(`guide-contract: ${what} marker missing (it must start a line): ${marker}`);
  }
  if (hits.length > 1) {
    throw new Error(`guide-contract: ${what} marker starts ${hits.length} lines; it must be unique: ${marker}`);
  }
  return hits[0];
}

/* Check 2: every selector in the lifted stylesheet must start with
   .guide-scope, and the sheet must have parsed to at least one rule. */
function assertScoped(css) {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const atRule = flat.match(/@[a-zA-Z-]+/);
  if (atRule) {
    throw new Error(
      `guide-contract: the injectable guide stylesheet contains the at-rule ${atRule[0]}. ` +
      'Page-level chrome (@page, @media) belongs in the guide\'s SECOND <style> block, which is not injected.'
    );
  }
  const leaks = [];
  let rules = 0;
  let m;
  const re = /([^{}]+)\{([^{}]*)\}/g;
  while ((m = re.exec(flat))) {
    rules += 1;
    m[1].split(',').map(s => s.trim()).filter(Boolean).forEach(sel => {
      if (!/^\.guide-scope\b/.test(sel)) leaks.push(sel);
    });
  }
  if (rules === 0) {
    throw new Error('guide-contract: the guide stylesheet parsed to zero rules — the scope check would prove nothing');
  }
  if (leaks.length) {
    throw new Error('guide-contract: the guide stylesheet leaks unscoped rules into the app:\n  ' + leaks.join('\n  '));
  }
  return rules;
}

/* Lift the two injectable pieces out of the canonical printable guide. */
function extractGuide(source) {
  const masked = maskComments(source);

  const cssOpen = soleLineIndex(masked, MARKERS.guideCssOpen, 'guide stylesheet');
  const cssClose = masked.indexOf('\n</style>', cssOpen);
  if (cssClose < 0) {
    throw new Error('guide-contract: the guide-css block is not closed by a line-anchored </style>');
  }
  const css = source.slice(cssOpen + MARKERS.guideCssOpen.length, cssClose).trim();
  assertScoped(css);

  const bodyOpen = soleLineIndex(masked, MARKERS.guideBodyOpen, 'guide body');
  /* The end marker carries a comment, so it cannot be found in the masked
     copy. Requiring it to be unique and AFTER the opening div is what rules
     out a head comment that quotes it. */
  const endHits = [];
  for (let i = source.indexOf(MARKERS.guideBodyEnd); i >= 0; i = source.indexOf(MARKERS.guideBodyEnd, i + 1)) {
    endHits.push(i);
  }
  if (endHits.length !== 1) {
    throw new Error(
      `guide-contract: the guide must contain exactly one line-anchored "</div><!-- /guide -->" (found ${endHits.length})`
    );
  }
  if (endHits[0] < bodyOpen) {
    throw new Error('guide-contract: the guide-scope end marker precedes its opening div');
  }
  const html = source.slice(bodyOpen, endHits[0] + '\n</div>'.length).trim();
  if (!/[^\s]/.test(html.replace(/<[^>]*>/g, ''))) {
    throw new Error('guide-contract: the guide body extracted to no text');
  }
  return { css, html };
}

/* Check 3, the assertion half. */
function assertPlaceholders(template, placeholders) {
  for (const ph of placeholders) {
    const n = template.split(ph).length - 1;
    if (n === 0) throw new Error(`guide-contract: template placeholder missing: ${ph}`);
    if (n > 1) throw new Error(`guide-contract: the template names ${ph} ${n} times; it must appear exactly once`);
  }
}

/* Check 3, the injection half. The function replacement is load-bearing. */
function injectOnce(template, placeholder, text) {
  assertPlaceholders(template, [placeholder]);
  return template.replace(placeholder, () => text);
}

const RUNTIME_LOADS = /<iframe|new\s+XMLHttpRequest|\bfetch\s*\(|new\s+WebSocket|@import|url\(\s*['"]?https?:/i;
const BAIT = Object.freeze(['<iframe src="x.html">', 'fetch("x.json")', '@import "x.css"', 'new WebSocket("wss://x")']);
const decomment = s => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

/* Check 4. Returns the positive-control result so a caller can print it: the
   silence of this scan is only evidence alongside the control that proves the
   scan can speak. */
function assertNoRuntimeLoads(html) {
  const cleaned = decomment(html);
  for (const bait of BAIT) {
    if (!RUNTIME_LOADS.test(decomment(html + '\n' + bait))) {
      throw new Error('guide-contract: the runtime-load scan failed its own positive control: ' + bait);
    }
  }
  if (RUNTIME_LOADS.test(cleaned)) {
    throw new Error('guide-contract: BUILD REFUSED — the page would load something at runtime');
  }
  return { controls: BAIT.length, passed: true };
}

/* Zero <script src> / <link href> to anything off the page.

   WHAT `allow` IS FOR, because the natural first guess is wrong. Only these
   tags are scanned at all:

     script, link, img, iframe, source, video, audio, embed, object

   An <a> IS NOT AMONG THEM and never has been. So the Sources list in the A5
   Details drawer — a screenful of <a href="https://..."> to the papers a demo
   cites — is invisible to this function, needs no entry in `allow`, and will
   not refuse your build. Those links are the point of the drawer; a page that
   could not carry them would be useless.

   `allow` is narrower than that: it lists the same-folder files a SCANNED tag
   may legitimately reference. In practice that is one entry, 'demo-guide.html',
   for the printable-copy link in the presenter-notes dialog. If you find
   yourself adding a URL to `allow`, stop — a scanned tag pointing off the page
   is the thing this check exists to refuse (CONTRACT.md 2026-09-08: an <a href>
   the reader may CHOOSE to follow is not a network call by the page; a <script
   src> or <link href> is one whether they choose it or not).

   The second scan below is the one an <a> cannot escape, and it is deliberately
   narrow: anything script- or stylesheet-shaped pointing at a remote origin is
   refused from anywhere in the document, tag list or not. */
function assertNoExternalRefs(html, allow) {
  const allowed = new Set(allow || []);
  const offenders = [];
  html.replace(/<(script|link|img|iframe|source|video|audio|embed|object)\b[^>]*>/gi, tag => {
    const m = tag.match(/\b(?:src|href|data)\s*=\s*["']([^"']*)["']/i);
    if (m) {
      const ref = m[1];
      const inline = ref.startsWith('#') || ref.startsWith('data:') || ref === '';
      if (!inline && !allowed.has(ref)) offenders.push(tag.slice(0, 110));
    }
    return tag;
  });
  /* And nothing resource-shaped may point at a remote origin from anywhere,
     including an <a>, if it is a stylesheet or a script. */
  const remote = html.match(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']https?:[^"']*["'][^>]*>/gi) || [];
  offenders.push(...remote.map(t => t.slice(0, 110)));
  if (offenders.length) {
    throw new Error('guide-contract: BUILD REFUSED — external references found:\n  ' + offenders.join('\n  '));
  }
  return { offenders: 0 };
}

module.exports = {
  MARKERS,
  BAIT,
  maskComments,
  soleLineIndex,
  assertScoped,
  extractGuide,
  assertPlaceholders,
  injectOnce,
  assertNoRuntimeLoads,
  assertNoExternalRefs
};
