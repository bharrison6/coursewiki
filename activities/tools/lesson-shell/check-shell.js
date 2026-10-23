#!/usr/bin/env node
/* ===========================================================================
   lesson-shell / check-shell.js — does this built index.html actually carry
   the kit, and the parts the template names?

     node tools/lesson-shell/check-shell.js <slug> [<slug> ...]
     node tools/lesson-shell/check-shell.js --all      every demo with a stamp

   Exit 0 = pass, 1 = fail. Every failure names the template part at fault.

   WHAT IT PROVES, AND WHY EACH ONE IS HERE

   1. The STAMP is present, and its version AND css hash match the kit on disk.
      This is the back-propagation guarantee. Change the kit, and every demo
      built against the old one goes red until it is rebuilt — you cannot leave
      fifteen demos on a stale shell silently.

   2. Every A0 required token NAME appears. A demo that renamed --lite to --sky
      still renders, and would still pass a screenshot review, and would then
      quietly fork the palette. This is the A0 pass criterion, mechanized.

   3. The class vocabulary for A1, A2, A4, A5 and A6 appears. Presence is not
      quality — a reviewer still reads the copy — but absence is decisive, and
      it is the cheapest thing to get wrong when adopting the kit from the
      artifacts alone.

   4. No ALL-CAPS placeholder from partials.html survived into the built file.
      Adopting by copy-paste is the intended route, so shipping "STAGE TITLE"
      to the public site is the likeliest single failure of this whole pass.

   5. Only the six provenance words are used as kickers, and "unconfirmed" is
      never one of them — it is a qualifier in .k-qual that attaches to one of
      the six. (Orchestrator ruling 2026-09-15, on front-doors audit evidence:
      folding an honest "could not confirm" onto Illustrative renders it as
      INVENTED, a worse claim than the truth.)

   5b. Two STRUCTURAL label checks, which are the reliable half of "no
      unlabeled claim surface":
        * every .details-stage carries at least one kicker — the drawer's first
          fixed section IS the provenance statement, so a stage with none has
          skipped it;
        * every block marked .claim opens with a kicker.

      WHAT THIS CANNOT DO, stated rather than papered over: there is no
      reliable way to detect a claim in unmarked prose. "A longer tube always
      improves resolution" and "the tube is 1.50 m" are the same shape to a
      regex. So a builder who simply does not wrap a claim in .claim escapes
      check 5b entirely. That gap is real and it is why L1 review is a human
      lens reading src/, not a grep. A check that pretended to close it would
      pass vacuously and be worse than its absence, because it would retire
      the reviewer's attention. What 5b buys is that the marked surface cannot
      rot, and that a details-stage cannot ship with no provenance at all.
      Scope: the learner-facing page minus the injected presenter guide
      (guide-contract's MARKERS) — the guide is a different document with
      its own vocabulary and is not drawer prose (glass-box, K4).

   6. Zero <script src> and zero <link href> to anything but a same-folder
      hyperlink: the built file is self-contained (CONTRACT.md).

   7. The credit pill's text is EXACTLY the fleet spec, with no suffix.

   8. The demo IMPLEMENTS THE RESET CONTRACT. Reset is in-place as of kit v2:
      the shell restores what the kit owns and dispatches `lessonreset`, and
      the demo restores its own activity. A demo with no handler keeps every
      answer through a Reset that visibly moved everything else, and no other
      check in this file or in any node suite can see that.

      SPECIFICITY, because this one could easily match itself: the shell's own
      behaviour script contains the string `lessonreset` — it dispatches the
      event — so a bare grep for the word passes on EVERY kit-built page,
      demo handler or not. The check looks for a LISTENER (or a non-null
      onReset veto), which the shell never installs, and --self-test carries a
      negative control that is the dispatch alone and must FAIL.

   9. No id is defined twice. This is the general form of the collision the
      two-winters lane hit: the kit's per-stage drawer is `#details`, which is
      also the most natural name for a demo's own per-item drill-down, and a
      duplicate id does not error — querySelector silently returns whichever
      came first, so the kit's drawer or the demo's popover quietly stops
      working. RESERVED_IDS below is the kit's list; this check is wider than
      that list on purpose, because a demo colliding with ITSELF breaks the
      same way. Scanned outside <script> blocks only: an id spelled inside
      generated markup in app.js is a string, not necessarily a live element,
      and guessing costs more than it buys. Stated rather than papered over —
      a collision created entirely at runtime by app.js is out of reach here
      and belongs to the browser pass.

   WHAT WAS TRIED AND NOT SHIPPED — an absence-claim lint (K4, 2026-09-16).
   After three absence-claim failures in the fleet program (one of them a demo
   shipping "One row is uneven, and it stays uneven" against four months of
   public docs), a warn-only lint for absolute-negative phrasing in visible
   learner copy was prototyped here and measured against all 14 built demos,
   with <script>, <style>, comments and <a> stripped. A BROAD word list
   (never / cannot / nowhere / there is no / does not exist / no version of /
   stays …) tripped 5/5 bait sentences and 6/8 legitimate ones, and produced
   183 warnings on a corpus that had already been corrected. A NARROW list
   tuned to prediction-shaped phrases got false positives down to 2/8 but
   missed 2/5 of the real failures — and one of its remaining false positives
   was the fleet's standard self-containment sentence ("This page runs no
   model and makes no network request"), which is a true, checkable negative
   that must never warn. There is no regex operating point between those two:
   the feature that separates "Google has no consumer-plan peer" from "there
   is no combined score" is WHOSE capability the sentence is about, and that
   is semantic. A lint that warns 183 times on compliant copy is tuned out on
   day one, and a lint that misses "Copilot cannot accept tracked changes"
   retires the reviewer's attention without earning it. The rule itself
   stands and lives in ADOPTING.md §5b; enforcing it is the L1 reviewer's
   lens, as it is for 5b's unmarked claims above.

   PROVING THE CHECKS ARE POTENT. --self-test runs every check against
   synthetic bait that should trip it, and fails if any check stays silent. A
   checker whose silence has not been tested is not evidence. Run it whenever
   you change this file:

     node tools/lesson-shell/check-shell.js --self-test
   =========================================================================== */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const shell = require('./index.js');

const REPO = path.resolve(__dirname, '..', '..');
const PILL_TEXT = 'Bryant Harrison &middot; Murray State University';

/* The ALL-CAPS slots partials.html asks the builder to fill in. A built file
   containing any of these shipped a template hole to a public URL. */
const PLACEHOLDERS = Object.freeze([
  'DEMO DISPLAY TITLE', 'STAGE TITLE', 'SHORT NAME', 'ONE LINE QUESTION?',
  'THE ONE QUESTION THIS STAGE ANSWERS?', 'TWO OR THREE SENTENCES',
  'A CONCRETE PREDICTION PROMPT', 'EXACT CONTROL NAME',
  'A PLAIN DECLARATIVE CLAIM', 'PANEL TITLE', 'CONTROL NAME',
  'WHAT IS LIVE HERE', 'ONE RETRIEVAL QUESTION', 'CORRECT OPTION',
  'THE FLAWED MODEL, STATED', 'WHAT THIS DEMO DOES NOT CLAIM',
  'THE FORMULA, IF THERE IS ONE', 'EACH ONE, PLAINLY', 'LESSON STAGES',
  'PART FOUR &middot; EXAMPLE PROJECTS',
  'WHAT THIS DEMO PUTS BACK, IN ITS OWN NOUNS'
]);

/* Check 8. A LISTENER, not the word: the shell's own script dispatches
   `lessonreset`, so the bare string is present on every kit-built page. The
   shell never calls addEventListener for it and never ASSIGNS onReset (its
   object literal writes `onReset: null`, a colon), so both of these are
   demo-only shapes. RESET_VETO deliberately refuses `= null`, which is what a
   demo that has not implemented the contract leaves behind. */
const RESET_LISTENER = /addEventListener\s*\(\s*['"]lessonreset['"]/;
const RESET_VETO = /\.onReset\s*=\s*(?!null\b)\S/;

/* Check 9. The ids the kit's own markup defines; a demo must not reuse one.
   `details` is the one that has actually bitten: it is the natural name for a
   demo's per-item drill-down as well as the kit's per-stage drawer. Name yours
   something else — two-winters uses #item-details. */
const RESERVED_IDS = new Set([
  'brandbar', 'guide', 'guide-open', 'guide-title', 'settings', 'settings-open',
  'settings-title', 'settings-menu', 'presenter-notes', 'presenter-notes-title',
  'details', 'details-title', 'details-subtitle', 'presentation-btn',
  'presentation-foot', 'reset-btn'
]);

/* Script bodies are excluded from the id scan: an id spelled in a JS string is
   not by itself a second element. Stripping is what lets a scan miss things,
   so --self-test's bait for this check is markup-level, and the limitation is
   stated in the head comment rather than hidden. */
function stripScripts(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>');
}

/* The injected presenter guide, from guide-contract's opening div to its
   line-anchored end marker. Both strings are the contract's own (MARKERS in
   guide-contract.js), so a change there changes this in one place. A file
   with no guide, or a malformed one, is returned untouched — extractGuide
   already refuses to build those. */
const gc = require('./guide-contract.js');
function stripGuide(html) {
  const open = gc.MARKERS.guideBodyOpen;
  const end = gc.MARKERS.guideBodyEnd.trim();
  const a = html.indexOf(open);
  if (a < 0) return html;
  const b = html.indexOf(end, a);
  if (b < 0) return html;
  return html.slice(0, a) + '<div class="guide-scope"></div>' + html.slice(b + end.length);
}

/* Every check is a function returning an array of failure strings. Keeping
   them in one table is what lets --self-test iterate them. */
const CHECKS = Object.freeze([
  ['A0 kit stamp', html => {
    const got = shell.readStamp(html);
    if (!got) return ['no lesson-shell stamp — build.js must inject shell.stamp() at <!--__SHELL_STAMP__-->'];
    const out = [];
    if (got.version !== shell.VERSION) {
      out.push(`built against lesson-shell v${got.version}, the kit on disk is v${shell.VERSION} — rebuild`);
    }
    if (got.cssHash !== shell.cssHash()) {
      out.push(`shell CSS has changed since this was built (stamp ${got.cssHash}, kit ${shell.cssHash()}) — rebuild`);
    }
    return out;
  }],
  ['A0 palette tokens', html => shell.REQUIRED_TOKENS
    .filter(t => !new RegExp('\\' + t + '\\s*:').test(html))
    .map(t => `required token ${t} is not defined`)],
  ['A1/A2/A4/A5/A6 parts', html => shell.REQUIRED_CLASSES
    .filter(c => !html.includes(c.needle))
    .map(c => `${c.part} missing (no "${c.needle}" in the built file)`)],
  ['template placeholders', html => PLACEHOLDERS
    .filter(p => html.includes(p))
    .map(p => `an unfilled partials.html placeholder shipped: "${p}"`)],
  ['A3 kicker vocabulary', html => {
    const used = (html.match(/class="k-[a-z-]+"/g) || []).map(s => s.slice(7, -1));
    const bad = [...new Set(used)]
      .filter(k => k !== shell.QUALIFIER_CLASS)
      .filter(k => !shell.KICKERS.includes(k));
    const out = bad.map(k => `${k} is not one of the six provenance words (${shell.KICKERS.join(', ')})`);
    /* "unconfirmed" as a LABEL is the specific mistake the ruling names. */
    if (/class="k-(?:unconfirmed|verified)"/.test(html)) {
      out.push('"unconfirmed"/"verified" are confidence qualifiers, not provenance labels — put them in a k-qual span beside one of the six');
    }
    return out;
  }],
  ['A5 detail labels', rawHtml => {
    const out = [];
    /* THE INJECTED GUIDE IS OUT OF SCOPE. The presenter notes are the printable
       teacher guide, injected verbatim between guide-contract's two markers.
       That document has its own vocabulary, and glass-box's guide used
       `<div class="mis"><div class="claim">…` for the misconception STATEMENT
       — a plan-mandated card, and a different mechanism that happens to share
       the kit's class name. Read as drawer prose it "has no provenance
       kicker", and the lane had to rewrite a correct guide to get green. The
       scan below is about the learner-facing Details drawer, so the guide
       region is cut out before anything is matched. --self-test carries the
       glass-box shape as a must-accept control, and a kicker-less .claim
       placed AFTER the guide as the potency control. */
    const html = stripGuide(rawHtml);
    /* Every .details-stage must carry at least one kicker: the drawer's first
       fixed section IS the provenance statement. */
    const stages = html.match(/<section[^>]*class="[^"]*details-stage[^"]*"[\s\S]*?(?=<section[^>]*class="[^"]*details-stage|<\/div>\s*<form method="dialog" class="lesson-dialog-actions")/g) || [];
    stages.forEach((s, i) => {
      if (!shell.KICKERS.some(k => s.includes(`"${k}"`))) {
        out.push(`details-stage ${i} carries no provenance kicker — the drawer's first fixed section is the live/measured/sourced statement`);
      }
    });
    /* Every .claim block must open with one. Flat blocks only, so the scan is
       honest about what it read. */
    const claims = html.match(/<div class="claim">[\s\S]*?<\/div>/g) || [];
    claims.forEach((c, i) => {
      if (/<div\b/.test(c.slice(18))) {
        out.push(`claim block ${i} contains a nested <div>; keep .claim blocks flat so the label check can read them`);
      } else if (!shell.KICKERS.some(k => c.includes(`"${k}"`))) {
        out.push(`claim block ${i} has no provenance kicker: ${c.replace(/<[^>]*>/g, ' ').trim().slice(0, 60)}...`);
      }
    });
    return out;
  }],
  ['self-contained', html => {
    const out = [];
    const tags = html.match(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["'][^"']+["'][^>]*>/gi) || [];
    tags.forEach(t => out.push(`a resource is loaded at runtime: ${t.slice(0, 90)}`));
    return out;
  }],
  ['A0 credit pill', html => {
    const m = html.match(/<div class="bh-credit"[^>]*>([\s\S]*?)<\/div>/);
    if (!m) return ['no .bh-credit element'];
    const text = m[1].trim();
    return text === PILL_TEXT ? [] : [`credit pill text is "${text}", the fleet spec is "${PILL_TEXT}"`];
  }],
  ['A8 reset contract', html => {
    if (!/id="reset-btn"/.test(html)) return ['no #reset-btn — Settings must carry the contract triad'];
    if (RESET_LISTENER.test(html) || RESET_VETO.test(html)) return [];
    return ['the demo implements no reset handler: Reset is in-place as of kit v2, so the demo must ' +
            "addEventListener('lessonreset', ...) to restore its own activity (or take the whole reset " +
            'over by assigning a non-null window.lessonShell.onReset). Without one, every answer and ' +
            'every node the activity generated survives a Reset. See ADOPTING.md.'];
  }],
  /* 10. The A2 phone intro disclosure is present AND has not been made to hide
     the wrong thing. Three separate properties, reported under one name:

       a) the built file carries the shell's disclosure at all. It is created
          at RUNTIME by behaviourScript() (partials.html is a reference sheet,
          not an injected file), so the evidence is in the injected script, not
          in the markup — which is also why a demo cannot opt out of it.
       b) it is a NATIVE <details>/<summary>. That is where Enter/Space, the
          disclosure role and the expanded state come from; a div with a click
          handler gives a learner on a screen reader nothing.
       c) NOTHING IN THE neverCollapse LIST IS HIDDEN AT PHONE WIDTH. A
          collapsible intro that takes the stage question with it defeats its
          own purpose: the question is the one line that orients, and the whole
          ruling is about reaching the activity without losing the plot. The
          scan is scoped to `max-width: 480px` blocks, because the
          landscape-short block legitimately hides other intro parts. */
  ['A2 phone intro disclosure', html => {
    const out = [];
    const d = shell.INTRO_DISCLOSURE;
    const scripts = (html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || []).join('\n');
    if (!scripts.includes(d.className)) {
      out.push(`no "${d.className}" disclosure in the injected shell script — this file was built ` +
               'against a shell with no collapsible phone intro (operator ruling 2026-09-16); rebuild');
    }
    if (!/createElement\(\s*['"]summary['"]\s*\)/.test(scripts)) {
      out.push('the intro disclosure is not a native <summary> — keyboard operation and the ' +
               'expanded state would have to be reimplemented, and a screen reader would get nothing');
    }
    /* Scoped scan: only the phone blocks. */
    const phoneBlocks = [];
    const re = new RegExp('@media[^{]*max-width:\\s*' + d.breakpointPx + 'px[^{]*\\{', 'g');
    let m;
    while ((m = re.exec(html))) {
      /* Walk braces from the block's opening brace so a nested rule cannot cut
         the block short. */
      let depth = 1, i = m.index + m[0].length;
      for (; i < html.length && depth > 0; i += 1) {
        if (html[i] === '{') depth += 1;
        else if (html[i] === '}') depth -= 1;
      }
      phoneBlocks.push(html.slice(m.index, i));
    }
    const phoneCss = phoneBlocks.join('\n');
    d.neverCollapse.forEach(sel => {
      const hide = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '[^{}]*\\{[^{}]*display\\s*:\\s*none', 'i');
      if (hide.test(phoneCss)) {
        out.push(`"${sel}" is hidden at phone width — the collapsible intro must keep it visible; ` +
                 'collapsing the line that orients the learner defeats the ruling it implements');
      }
    });
    return out;
  }],
  /* 11. The shared A6 handler must be DEMO-NEUTRAL. v2 hardcoded one demo's
     wrong-answer sentence into the shell and shipped it to all eight built
     demos, so a learner met "Not what the detector showed." in check cards
     about PLC ladder logic, AI winters and wavelet compression. It survived
     two pilots and four builds because nothing looked for it. Two properties:
       a) no sentence from LEAKED_A6 appears in the injected script;
       b) the handler actually reads a per-card lead, so a demo CAN supply its
          own wording — without that, neutrality is just a different demo's
          sentence winning. */
  ['A6 feedback vocabulary', html => {
    const out = [];
    if (!html.includes('check-option')) return out;
    const scripts = (html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || []).join('\n');
    /* COMMENTS ARE STRIPPED BEFORE THE BLOCKLIST SCAN, and this is not
       tidiness — it is the difference between a check and a tautology. The
       first run of this check failed both rebuilt demos on the kit's OWN
       comment explaining the leak, which behaviourScript() injects into every
       built file; takeoff carries a comment documenting it too. A blocklist
       that matches its own documentation reports a defect that is not there
       and hides the one that is. The kit's comment was also reworded so the
       sentence appears nowhere in injected code — both halves, because either
       alone leaves the check matching prose.

       The strip is deliberately conservative and its limit is stated: a `//`
       or slash-star sequence inside a string literal would over-strip. That
       costs a false NEGATIVE (a missed leak), never a false positive, which is
       the right direction for a check that reds a whole fleet. */
    const code = scripts
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^[ \t]*\/\/.*$/gm, ' ');
    shell.LEAKED_A6.forEach(s => {
      if (code.includes(s)) {
        out.push(`the shared A6 handler hardcodes a demo-specific sentence: "${s}". Take the lead ` +
                 "from the card's own data-correct-lead / data-wrong-lead instead — every demo " +
                 'built on this shell renders it, whatever its subject.');
      }
    });
    if (!/dataset\.wrongLead/.test(code)) {
      out.push('the shared A6 handler reads no per-card wrong-answer lead (data-wrong-lead), so a ' +
               'demo cannot supply its own wording and the kit picks the sentence for all of them');
    }
    return out;
  }],
  /* 12. `.hidden` is a RESERVED kit class as of v3 (shell.css). This check is
     the price of that claim being safe: the kit overrides `.hidden` with
     !important, so a demo that means anything else by it would be silently
     overridden — trading a visible stacking bug for an invisible one. Rather
     than not claim the name, the collision is made loud.

     Scoped to <style> blocks so JS property access (`if (x.hidden)`,
     `rows.hidden.at(-1)` — both real in takeoff) cannot be read as CSS. */
  /* 13. A DEMO MUST NOT WRITE INTO SHELL-OWNED OUTPUT. The coupling the kit
     exists to eliminate, and the only check here that is about a BOUNDARY
     rather than a defect.

     Two merged demos independently reached into `.check-feedback` — which
     ADOPTING.md §1 assigns to the shell — to rewrite the wrong-answer sentence
     the frozen kit hardcoded: ladder-lab with
     `out.innerHTML = out.innerHTML.replace(...)`, takeoff by rewriting the
     <b> lead's textContent. Both were the right call while the kit was frozen.
     Both go DEAD SILENTLY the moment the kit is fixed: the replace stops
     matching, the regex stops testing true, and the code still looks live. A
     doc note cannot catch that; a check can, and it catches the next nine
     copies rather than these two.

     Note what is deliberately NOT guarded: `.echo` and `.obs-cue`. The A2/A4
     contract says the activity fills those, so a demo writing them is correct.
     Guarding them would red every properly built demo.

     THE SHELL'S OWN SCRIPT IS EXCLUDED by its marker comment, because of
     course it writes these surfaces — it owns them. That exclusion is the
     check's must-accept control in --self-test; without it this reds the
     entire fleet. */
  ['shell-owned output', html => {
    const out = [];
    const blocks = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
    const demoBlocks = blocks.filter(b => !shell.SHELL_SCRIPT_MARKER_RE.test(b));
    shell.SHELL_OWNED_OUTPUT.forEach(surface => {
      demoBlocks.forEach(b => {
        if (!b.includes(surface)) return;
        out.push(`a demo script references "${surface}", which the shell owns (ADOPTING.md §1). ` +
                 'Post-processing what the shell rendered is the coupling the kit exists to remove, ' +
                 'and it dies silently when the shell changes. Supply the wording through the card ' +
                 '(data-correct-lead / data-wrong-lead) instead.');
      });
    });
    return out;
  }],
  ['reserved .hidden class', html => {
    const out = [];
    const styles = (html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n');
    const rules = styles.match(/(^|[\s,{}])\.hidden\b[^{}]*\{[^{}]*\}/g) || [];
    rules.forEach(r => {
      const body = r.slice(r.indexOf('{') + 1, r.lastIndexOf('}'));
      /* Anything that is not "display: none" is a redefinition. A demo
         re-stating display:none (with or without !important) is harmless and
         must stay quiet — several demos legitimately still carry their own. */
      const decls = body.split(';').map(d => d.trim()).filter(Boolean);
      const bad = decls.filter(d => !/^display\s*:\s*none\s*(!important)?$/i.test(d));
      if (bad.length) {
        out.push('.hidden is a lesson-shell reserved class (display:none !important) and this file ' +
                 `redefines it: "${bad.join('; ').slice(0, 70)}". The shell's !important wins, so the ` +
                 'redefinition would fail silently — rename your class.');
      }
    });
    return out;
  }],
  ['unique ids', html => {
    const seen = new Map();
    const dupes = [];
    stripScripts(html).replace(/\sid\s*=\s*"([^"]+)"/g, (_, id) => {
      const n = (seen.get(id) || 0) + 1;
      seen.set(id, n);
      if (n === 2) dupes.push(id);
      return _;
    });
    return dupes.map(id => `id "${id}" is defined more than once${
      RESERVED_IDS.has(id) ? ' — and it is a lesson-shell reserved id; rename YOUR element' : ''
    }. A duplicate id does not error: querySelector takes the first and the other element silently stops working.`);
  }]
]);

function checkHtml(html) {
  const failures = [];
  for (const [name, fn] of CHECKS) {
    for (const msg of fn(html)) failures.push(`${name}: ${msg}`);
  }
  return failures;
}

/* --- the self-test: every check must trip on bait -------------------------
   Built from a file that PASSES, then broken one way per check. A check that
   stays silent on its own bait cannot be trusted when it is silent on a real
   demo. */
function selfTest() {
  const good = [
    '<!doctype html><html><head><style>:root{',
    shell.REQUIRED_TOKENS.map(t => `${t}: 0;`).join(''),
    '}</style></head><body>', shell.stamp(),
    shell.REQUIRED_CLASSES.map(c => `<i ${c.needle.includes('=') ? c.needle : 'class="' + c.needle + '"'}></i>`).join(''),
    '<span class="k-live">Live</span><span class="k-qual">seed 41</span>',
    '<section class="details-stage on" data-details-stage="0">',
    '<span class="panel-kicker"><span class="k-measured">Measured</span> x</span>',
    '<div class="claim"><span class="panel-kicker"><span class="k-reasoned">Reasoned</span> y</span><p>z</p></div>',
    '</section></div>\n<form method="dialog" class="lesson-dialog-actions"><button>Back to activity</button></form>',
    '<button id="reset-btn">Reset</button>',
    `<div class="bh-credit">${PILL_TEXT}</div>`,
    /* A phone block, the shape shell.css really has: it reveals the intro
       summary and hides the header icon labels. Bait below adds a rule hiding
       the stage question to it; a must-accept case below leaves it as is. */
    '<style>@media (max-width: 480px){ .intro-more > summary { display: flex; }',
    ' .icon-label { display: none; } }</style>',
    /* TWO script blocks, because that is the real shape of a built page and
       one of the v3 checks depends on telling them apart. First the SHELL's,
       carrying its marker comment — it legitimately writes .check-feedback,
       and if the 'shell-owned output' check cannot see that it is the shell,
       it reds every demo in the fleet. */
    `<script>/* ${shell.SHELL_SCRIPT_MARKER} */`,
    'document.dispatchEvent(new CustomEvent(\'lessonreset\'));',
    /* The v3 shell shapes the two new checks read: the runtime-built intro
       disclosure, and an A6 lead taken from the card rather than the kit. */
    'const d = document.createElement(\'details\'); d.className = \'intro-more\';',
    'const sum = document.createElement(\'summary\');',
    'const fb = card.querySelector(\'.check-feedback\');',
    'const lead = card.dataset.wrongLead || \'Not quite.\';</script>',
    /* Then the DEMO's, which must carry the reset listener and must NOT touch
       shell-owned output. */
    '<script>document.addEventListener(\'lessonreset\', () => {});</script>',
    '</body></html>'
  ].join('');
  const baseline = checkHtml(good);
  if (baseline.length) {
    console.error('SELF-TEST FAILED — the synthetic passing page does not pass:');
    baseline.forEach(f => console.error('  ' + f));
    return 1;
  }
  /* Each bait names the check AND a substring the failure must contain, so a
     check cannot appear to trip because a DIFFERENT failure in the same check
     fired. That distinction matters for 5b, whose two halves are separate
     properties reported under one check name. */
  const bait = [
    ['A0 kit stamp', 'is v', good.replace(shell.stamp(), '<!-- lesson-shell v0 css:000000000000 -->')],
    ['A0 palette tokens', '--lite', good.replace('--lite: 0;', '--sky: 0;')],
    ['A1/A2/A4/A5/A6 parts', 'observation cue', good.replace('class="obs-cue"', 'class="status"')],
    ['template placeholders', 'STAGE TITLE', good.replace('</body>', '<h2>STAGE TITLE</h2></body>')],
    ['A3 kicker vocabulary', 'six provenance words', good.replace('class="k-live"', 'class="k-realtime"')],
    /* "unconfirmed" promoted to a label is the specific mistake the ruling
       names, so it gets its own bait rather than riding on the generic one. */
    ['A3 kicker vocabulary', 'confidence qualifiers, not provenance labels', good.replace('class="k-live"', 'class="k-unconfirmed"')],
    /* 5b half one: a details-stage with NO kicker anywhere in it. */
    ['A5 detail labels', 'carries no provenance kicker',
      good.replace('<span class="k-measured">Measured</span>', 'Measured')
          .replace('<span class="k-reasoned">Reasoned</span>', 'Reasoned')],
    /* 5b half two: a .claim block whose label was taken off, with the stage's
       own kicker left in place so only the claim check can fire. */
    ['A5 detail labels', 'claim block 0 has no provenance kicker',
      good.replace('<span class="k-reasoned">Reasoned</span>', 'Reasoned')],
    /* 5b scope potency: the guide is cut out, but a kicker-less .claim that sits
       OUTSIDE the guide region — after it in the document — must still trip.
       Without this, "strip the guide" could quietly become "strip the rest". */
    ['A5 detail labels', 'claim block 1 has no provenance kicker',
      good.replace('</body>', gc.MARKERS.guideBodyOpen + '<p>notes</p>' + gc.MARKERS.guideBodyEnd +
        '<div class="claim"><p>unlabelled drawer prose</p></div></body>')],
    /* 5b guard: a nested div makes the claim scan unable to read the block, so
       it must say so rather than pass. */
    ['A5 detail labels', 'nested <div>',
      good.replace('<div class="claim">', '<div class="claim"><div>')],
    ['self-contained', 'theme.css', good.replace('</head>', '<link href="theme.css" rel="stylesheet"></head>')],
    ['A0 credit pill', 'three amigos', good.replace(PILL_TEXT, PILL_TEXT + ' &middot; built with the three amigos')],
    /* Check 8's NEGATIVE CONTROL, and the reason this check is worth having:
       the page below still carries the shell's own dispatch of `lessonreset`,
       so a grep for the word passes. Only the listener is gone. If this bait
       stays silent, the check is matching the kit rather than the demo. */
    ['A8 reset contract', 'implements no reset handler',
      good.replace("document.addEventListener('lessonreset', () => {});", "window.lessonShell.onReset = null;")],
    /* And the veto path must be accepted, not merely the listener: a demo that
       takes the whole reset over satisfies the contract. Asserted as a
       baseline-shaped page that must produce NO failure (see below). */
    ['unique ids', 'defined more than once',
      good.replace('<button id="reset-btn">Reset</button>', '<button id="reset-btn">Reset</button><i id="reset-btn"></i>')],
    /* --- v3 bait: the A2 phone intro disclosure, three properties --------- */
    /* (a) built against a shell with no disclosure at all — the stale-build
       case the whole ruling depends on catching. */
    ['A2 phone intro disclosure', 'was built against a shell with no collapsible phone intro',
      good.replace("d.className = 'intro-more';", "d.className = 'intro-block';")],
    /* (b) a div-with-a-click-handler instead of the native element: it looks
       identical in a screenshot and gives a screen-reader user nothing. */
    ['A2 phone intro disclosure', 'not a native <summary>',
      good.replace("document.createElement('summary')", "document.createElement('div')")],
    /* (c) THE ONE THE RULING IS ABOUT: a collapsed intro that takes the stage
       question with it. The question is the line that orients; hiding it to
       win height defeats the purpose of collapsing at all. */
    ['A2 phone intro disclosure', 'is hidden at phone width',
      good.replace('.icon-label { display: none; }',
        '.icon-label { display: none; } .stage-question { display: none; }')],
    /* --- v3 bait: the A6 wording leak ------------------------------------ */
    /* The exact defect v2 shipped to all eight demos: one demo's sentence,
       hardcoded in the SHARED handler. */
    ['A6 feedback vocabulary', 'hardcodes a demo-specific sentence',
      good.replace("const lead = card.dataset.wrongLead || 'Not quite.';",
        "const lead = '<b>Not what the detector showed.</b> ';")],
    /* And the other half: a handler that hardcodes nothing but also offers no
       way for a demo to supply its own lead is not neutral, it has just picked
       a different demo's sentence to impose. Feedback supplied, hardcoded
       string gone, per-card lead still missing — must trip. */
    ['A6 feedback vocabulary', 'reads no per-card wrong-answer lead',
      good.replace("const lead = card.dataset.wrongLead || 'Not quite.';",
        "const lead = 'Not quite.'; const body = btn.dataset.feedback;")],
    /* --- v3 bait: a demo reaching into shell-owned output ----------------- */
    /* Shaped exactly like the two shims that shipped: ladder-lab's
       innerHTML.replace and takeoff's <b> textContent rewrite. Both are in a
       DEMO block, so the marker exclusion must not save them. */
    ['shell-owned output', 'which the shell owns',
      good.replace("<script>document.addEventListener('lessonreset', () => {});</script>",
        "<script>document.addEventListener('lessonreset', () => {});" +
        "document.querySelectorAll('.check-option').forEach(b => b.addEventListener('click', () => {" +
        "const o = b.closest('.check').querySelector('.check-feedback');" +
        "if (o) o.innerHTML = o.innerHTML.replace('x', 'y');}));</script>")],
    /* --- v3 bait: a demo redefining the reserved .hidden class ------------ */
    ['reserved .hidden class', 'redefines it',
      good.replace('.icon-label { display: none; }',
        '.icon-label { display: none; } } .hidden { display: flex; opacity: .5; } @media (max-width: 480px){')],
    /* Check 9's stripping control: the SAME duplicate, spelled inside a
       <script>, must NOT trip it — otherwise the check is reading JS strings
       as markup and would red every demo that builds HTML at runtime. Asserted
       below with the other must-not-trip cases. */
  ];
  let bad = 0;
  for (const [name, needle, html] of bait) {
    const hit = checkHtml(html).some(f => f.startsWith(name + ':') && f.includes(needle));
    console.log(`  ${hit ? 'trips ' : 'SILENT'}  ${name} — "${needle}"`);
    if (!hit) bad += 1;
  }
  /* The other half: pages a check must STAY SILENT on. A check that trips on
     everything is as useless as one that trips on nothing, and both of these
     are shapes a real demo has or will have. */
  const quiet = [
    ['A8 reset contract', 'a demo that takes the whole reset over with an onReset veto',
      good.replace("document.addEventListener('lessonreset', () => {});",
        'window.lessonShell.onReset = () => { rewind(); return false; };')],
    ['unique ids', 'the same duplicate id spelled inside a <script> string',
      good.replace('</body>', '<script>var s = \'<i id="reset-btn"></i>\';</script></body>')],
    /* The neverCollapse scan must read ONLY the phone blocks, and must not
       simply fire on any display:none inside one. `.icon-label` hidden at
       <=480 is real, shipped, correct shell.css — if this trips, the check is
       matching the media query rather than the selector. */
    ['A2 phone intro disclosure', 'a phone block hiding .icon-label, which is correct and shipped', good],
    /* And the scoping control: the landscape-short block genuinely hides intro
       parts a phone-portrait block may not. A whole-file scan would red every
       demo on shipped CSS. */
    ['A2 phone intro disclosure', 'the landscape-short block hiding intro parts outside the phone block',
      good.replace('</head>', '<style>@media (orientation: landscape) and (max-height: 560px)' +
        '{ .stage-question { display: none } }</style></head>')],
    /* A demo RE-STATING display:none for .hidden is harmless and common —
       several demos still carry their own copy, and the retrofit does not
       require deleting it. Must stay quiet or the check reds correct files. */
    ['reserved .hidden class', 'a demo restating .hidden as display:none !important, which is harmless',
      good.replace('</head>', '<style>.hidden{display:none !important;}</style></head>')],
    /* And the scoping control: JS property access spelled `.hidden` is not a
       CSS rule. Both of these shapes are real in takeoff/index.html, and a
       whole-file scan would red it. */
    ['reserved .hidden class', 'JS property access spelled .hidden, which is not a CSS rule',
      good.replace('</body>', '<script>if (r.hidden) { x = rows.hidden.at(-1).label; }</script></body>')],
    /* THE SELF-MATCH CONTROL, and the reason it exists: the first run of the
       A6 blocklist failed both rebuilt demos on the kit's own comment
       explaining the leak — a check matching its own documentation. A demo or
       a kit may DISCUSS the leaked sentence in a comment; only executable code
       may not contain it. If this bait goes noisy the check has become a
       tautology again. */
    /* THE EXCLUSION CONTROL, and the reason the check is safe to ship: the
       shell's OWN block references .check-feedback because it owns it. The
       baseline `good` page carries exactly that. If this goes noisy the check
       reds all eleven merged demos on correct code. */
    ['shell-owned output', "the shell's own block writing .check-feedback, which it owns", good],
    /* And the demo-owned A2/A4 surfaces the activity is REQUIRED to fill must
       not be mistaken for shell-owned output. */
    ['shell-owned output', 'a demo writing .echo and .obs-cue, which the A2/A4 contract assigns to it',
      good.replace("<script>document.addEventListener('lessonreset', () => {});</script>",
        "<script>document.addEventListener('lessonreset', () => {});" +
        "document.querySelector('.echo').innerHTML = 'observed 1.4 ms';" +
        "document.querySelector('.obs-cue').textContent = 'the heavier ion lands later';</script>")],
    /* THE GUIDE-SCOPE CONTROL: glass-box's misconception cards, exactly as its
       guide first shipped them — a nested `.claim` with no kicker, inside the
       injected guide. The drawer scan must not read it. If this goes noisy the
       scan has escaped its scope again and will fail a plan-mandated part. */
    ['A5 detail labels', 'a .mis card with a nested kicker-less .claim inside the injected guide (glass-box)',
      good.replace('</body>', '<div class="lesson-dialog-body guide-host">' + gc.MARKERS.guideBodyOpen +
        '<section><h2>Misconceptions to expect</h2>' +
        '<div class="mis"><div class="claim">It is understanding the story.</div><span>It is predicting tokens.</span></div>' +
        '</section>' + gc.MARKERS.guideBodyEnd + '</div></body>')],
    ['A6 feedback vocabulary', 'a comment discussing the leaked sentence, which is not a leak',
      good.replace("const lead = card.dataset.wrongLead || 'Not quite.';",
        "/* v2 hardcoded 'Not what the detector showed.' here; fixed in v3. */\n" +
        "const lead = card.dataset.wrongLead || 'Not quite.';")]
  ];
  for (const [name, what, html] of quiet) {
    const noisy = checkHtml(html).filter(f => f.startsWith(name + ':'));
    console.log(`  ${noisy.length ? 'FALSE+' : 'quiet '}  ${name} — ${what}`);
    if (noisy.length) { noisy.forEach(f => console.error('    ' + f)); bad += 1; }
  }
  if (bad) {
    console.error(`SELF-TEST FAILED — ${bad} check(s) stayed silent on their own bait, or fired on a page they must accept.`);
    return 1;
  }
  console.log(`check-shell self-test: the synthetic page passes, all ${bait.length} checks trip on their bait, and ${quiet.length} must-accept pages stay quiet.`);
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  let slugs = argv.filter(a => !a.startsWith('--'));
  if (argv.includes('--all') || !slugs.length) {
    slugs = fs.readdirSync(REPO, { withFileTypes: true })
      .filter(e => e.isDirectory() && fs.existsSync(path.join(REPO, e.name, 'index.html')))
      .map(e => e.name)
      .filter(slug => shell.readStamp(fs.readFileSync(path.join(REPO, slug, 'index.html'), 'utf8')));
    if (!slugs.length) {
      console.error('no demo carries a lesson-shell stamp yet; name a slug explicitly to check one anyway');
      return 1;
    }
  }
  let failed = 0;
  for (const slug of slugs) {
    const file = path.join(REPO, slug, 'index.html');
    if (!fs.existsSync(file)) { console.error(`${slug}: no index.html at ${file}`); failed += 1; continue; }
    const failures = checkHtml(fs.readFileSync(file, 'utf8'));
    if (failures.length) {
      failed += 1;
      console.error(`${slug}: FAIL (${failures.length})`);
      failures.forEach(f => console.error('  ' + f));
    } else {
      console.log(`${slug}: lesson-shell v${shell.VERSION} carried, all template parts present, self-contained`);
    }
  }
  return failed ? 1 : 0;
}

module.exports = { checkHtml, PLACEHOLDERS, PILL_TEXT };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
