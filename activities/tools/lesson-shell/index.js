/* ===========================================================================
   lesson-shell — the shared lesson shell every demo in the tour is built on.

   ONE CANONICAL COPY, POINTED AT. A demo's build.js requires this module and
   injects what it returns; nothing is vendored into the demo folder. That is
   what stops the nine-copies credit-pill problem from coming back: change the
   pill here, rebuild, and every demo has the new pill.

   THIS IS A BUILD-TIME DEPENDENCY, NOT A RUNTIME ONE. The built index.html
   stays a single self-contained file with zero <script src> and zero
   <link href> — the kit's CSS is inlined into it at build time. CONTRACT.md's
   self-containment requirement is about the BUILT FILE, not about where the
   sources live (orchestrator ruling, 2026-09-15; CONTRACT says "the build must
   be reproducible from the committed sources" and does not say the sources
   must sit inside the demo folder).

   ---------------------------------------------------------------------------
   HOW TO ADOPT IT — the five-minute version

   1. Your demo needs `src/` + `build.js` (template part A10). Move your
      sources in: src/template.html, src/app.js, src/styles.css (your ACTIVITY
      styles only — the shell's are here), src/demo-guide.html, plus whatever
      model/engine files you have.

   2. In src/template.html <head>, three style blocks in this order:

          <style> __SHELL_CSS__ </style>   <- tokens.css + shell.css, from here
          <style> __CSS__ </style>         <- your activity CSS
          <style> __GUIDE_CSS__ </style>   <- lifted from your guide

      Placeholder spelling: in a CSS or JS context each name is wrapped in a
      block comment and in an HTML context in an HTML comment — so the four
      markers a template actually carries are the slash-star forms of
      __SHELL_CSS__, __CSS__, __GUIDE_CSS__ and __SHELL_JS__, plus the
      arrow-bracket forms of __SHELL_STAMP__ and __GUIDE__. (They are spelled
      bare here because a slash-star marker inside this comment would end it.)

      Order matters twice. Your CSS comes after the shell's so you can
      override any shell rule without !important. The guide's comes last
      because .guide-scope p and .lesson-dialog-body p have equal specificity,
      so the guide's rules must be the later ones to win inside the notes.

   3. Copy the markup you need from partials.html and fill in every ALL-CAPS
      slot. Keep the class names exactly — a reviewer greps for them, and
      check-shell.js refuses a built file with a placeholder left in it.

   4. In build.js:

          const shell = require('../tools/lesson-shell');
          const gc = require('../tools/lesson-shell/guide-contract');
          ...
          html = gc.injectOnce(html, SHELL_CSS_MARKER, shell.css());
          html = gc.injectOnce(html, STAMP_MARKER, shell.stamp());
          const guide = gc.extractGuide(read('src/demo-guide.html'));
          html = gc.injectOnce(html, GUIDE_CSS_MARKER, guide.css);
          html = gc.injectOnce(html, GUIDE_MARKER, guide.html);
          gc.assertNoExternalRefs(html, ['demo-guide.html']);
          gc.assertNoRuntimeLoads(html);

      ion-flight/build.js is the worked example — copy it and change the file
      list. It names every marker literally.

   5. Wire the shell's behaviour with `shell.behaviourScript()` injected at
      the __SHELL_JS__ marker — dialogs, the stage tablist keyboard,
      presentation mode, the A6 check cards and Reset. It needs no
      configuration beyond the ids partials.html already uses. Your own app.js
      handles the activity, and calls `window.lessonShell.selectStage(n)` if it
      wants to drive the tabs itself.

   6. REQUIRED, not optional: your app.js listens for `lessonreset` and puts
      the activity back to its first-load state. The shell restores only what
      the kit owns; it cannot know what your activity holds. A demo with no
      reset handler is an incomplete adoption and check-shell.js fails it.

   7. `node build.js && node tools/pdf.mjs && node build.js --check` and then
      `node ../tools/lesson-shell/check-shell.js <slug>`.

   ADOPTING.md beside this file is the long version — what the shell owns,
   what the demo owns, what to DELETE when converting a demo that predates the
   kit, the three events, and the full reset contract. Read it before a retrofit;
   this head comment is the five-minute version of it.

   ---------------------------------------------------------------------------
   THE STAMP. `stamp()` returns an HTML comment carrying the kit version AND a
   short hash of the kit's CSS. check-shell.js compares both against the kit on
   disk, so a demo whose index.html was built before a kit change FAILS rather
   than silently drifting. That is the back-propagation guarantee: you cannot
   change the kit and leave fifteen demos on the old one without a check going
   red.
   =========================================================================== */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/* Bump on any change to tokens.css, shell.css or behaviourScript(). The css
   hash catches the change even if this is forgotten; the version is what a
   human reads in a diff.

   v2 (2026-09-16): Reset became in-place — no page reload — and the
   `lessonreset` event it dispatches is a required part of every demo. The css
   hash is UNCHANGED by that edit, because the change is entirely in
   behaviourScript(), which is exactly the case this version number exists to
   catch.

   v3 (2026-09-16): the batched unfreeze. Six changes:
     1. `window.lessonShell.resetting` is exposed — ADOPTING.md §4 promised it
        and the kit did not provide it.
     2. `.lesson-strip .echo` no longer inherits the card label's uppercase, so
        a captured prediction stops rendering as SHOUTING.
     3. THE A2 STAGE INTRO IS COLLAPSIBLE AT PHONE WIDTH (operator ruling,
        2026-09-16). See the intro-disclosure section of behaviourScript().
     4. The `stagechange`-before-`lessonreset` ordering is DELIBERATELY KEPT;
        (1) is the fix for it. Rationale in the Reset comment below.
     5. ADOPTING.md gains the navy-vs-light panel convention.
     6. The shared A6 check-card handler no longer hardcodes one demo's
        wrong-answer sentence. It reads the lead from the card's own
        data-correct-lead / data-wrong-lead, defaulting to demo-neutral words.
        v2 shipped ion-flight's "Not what the detector showed." into every
        built demo, so learners met a sentence about a mass-spectrometer
        detector in check cards that had nothing to do with detectors.
        (Measured at 8 demos when this was written; the count rises with each
        merge and is a floor, not a total. The fix is count-independent.)
     7. `.hidden` becomes a RESERVED kit class backed by a real rule. Five
        demos had independently written the identical
        `.hidden { display: none !important }`, and a retrofit that correctly
        deletes the demo's chrome stylesheet took the rule with it while the
        JS kept toggling the class — panels rendered stacked, with every
        static check green. check-shell.js fails a demo that redefines it.
   The css hash DOES change this time (2, 3 and 7 all touch shell.css), which
   is what forces the fleet rebuild. That is intended. */
const VERSION = '3';

const DIR = __dirname;
const read = file => fs.readFileSync(path.join(DIR, file), 'utf8');

/* The canonical marker spellings, built here rather than written literally so
   that no source file has to contain a slash-star sequence that would end its
   own explanatory comment. Every demo's build.js imports these instead of
   typing the strings, so the fleet cannot drift into six spellings. */
const C0 = '/' + '*';
const C1 = '*' + '/';
const MARKERS = Object.freeze({
  shellCss: C0 + '__SHELL_CSS__' + C1,
  shellJs: C0 + '__SHELL_JS__' + C1,
  appCss: C0 + '__CSS__' + C1,
  guideCss: C0 + '__GUIDE_CSS__' + C1,
  app: C0 + '__APP__' + C1,
  stamp: '<!--__SHELL_STAMP__-->',
  guide: '<!--__GUIDE__-->'
});

/* The A0 required token names. check-shell.js greps a built index.html for
   every one and fails if any is missing, so this list IS the A0 pass
   criterion. Derived tokens live in tokens.css but are not required here. */
const REQUIRED_TOKENS = Object.freeze([
  '--u', '--navy', '--gold', '--lite', '--warm',
  '--paper', '--cream', '--ink', '--ink-2', '--ink-3', '--line'
]);

/* The class vocabulary a demo must actually use for the template parts to be
   present. One entry per part, so a failure names the part that is missing. */
const REQUIRED_CLASSES = Object.freeze([
  { part: 'A0 header', needle: 'brand-kicker' },
  { part: 'A0 credit pill', needle: 'bh-credit' },
  { part: 'A1 stage tablist', needle: 'role="tablist"' },
  { part: 'A1 stage tabs', needle: 'stage-tab' },
  { part: 'A2 stage intro', needle: 'stage-intro' },
  { part: 'A2 stage question', needle: 'stage-question' },
  { part: 'A2 prerequisite refresh', needle: 'class="refresh"' },
  { part: 'A2 lesson strip', needle: 'lesson-strip' },
  { part: 'A4 observation cue', needle: 'obs-cue' },
  { part: 'A5 Details drawer', needle: 'details-drawer' },
  { part: 'A5 Boundary card', needle: 'evidence-card' },
  { part: 'A6 check yourself', needle: 'check-options' }
]);

/* The six provenance words, and nothing else, are the kicker vocabulary.
   Reasoned joined on orchestrator ruling 2026-09-15 (front-doors audit
   evidence): Scripted stands in for what a live system would have produced,
   Reasoned is the authors' judgement from criteria the page states. Folding
   them forced an honest "could not confirm" to render as Illustrative, i.e.
   as invented. "unconfirmed" is a CONFIDENCE QUALIFIER (.k-qual) that attaches
   to one of these six; it is never a label of its own. */
const KICKERS = Object.freeze([
  'k-live', 'k-measured', 'k-sourced', 'k-reasoned', 'k-scripted', 'k-illustrative'
]);
const QUALIFIER_CLASS = 'k-qual';

/* A2 PHONE INTRO DISCLOSURE (v3, operator ruling 2026-09-16).

   The class the shell gives the <details> it builds around the lesson strip,
   and the label its <summary> carries. check-shell.js greps a built file for
   these, which is how a demo built against a shell that lacks the disclosure
   goes red rather than silently shipping a 2,000px intro.

   WHY THE SHELL BUILDS IT AT RUNTIME RATHER THAN partials.html SHIPPING IT:
   partials.html is a REFERENCE SHEET, not an injected file — a demo's markup
   lives in its own src/template.html. Putting the <details> in partials.html
   would collapse the intro only for demos adopted AFTER this change, and would
   need eight already-merged demos to be hand-edited to catch up. Building it
   in behaviourScript() means every demo inherits it from the rebuild the stamp
   already forces, with no demo-side markup change at all. It is also the
   honest progressive-enhancement story: no script, no wrapper, intro fully
   expanded exactly as v2 rendered it. */
const INTRO_DISCLOSURE = Object.freeze({
  className: 'intro-more',
  /* The ONLY thing that goes behind the toggle in the DOM. The prerequisite
     refresh is hidden by a CSS :has() rule instead of being moved, so that the
     desktop grid keeps byte-identical geometry. The eyebrow, the h2 stage
     title and the stage question are never collapsible — see NEVER_COLLAPSE. */
  moves: Object.freeze(['.lesson-strip']),
  /* Parts a PHONE-WIDTH rule may never hide. check-shell.js fails a built
     stylesheet that hides any of these inside a `max-width: 480px` block.

     Scoped to the phone block on purpose: the pre-existing landscape-short
     block legitimately hides `.stage-intro h2` (a phone on its side on a
     projector table has no height to spare), so a whole-file scan would trip
     on correct, shipped CSS. The h2 is protected structurally instead — the
     shell moves ONLY `.lesson-strip`, and .stage-intro is aria-labelledby the
     h2, so hiding it at phone width would strip the region's accessible
     name. */
  neverCollapse: Object.freeze(['.stage-question']),
  summaryLabel: 'Before you start · Predict · Try · Takeaway',
  breakpointPx: 480
});

/* A6 wrong-answer/right-answer leads. DEMO-NEUTRAL by construction: a demo
   that wants its own framing sets data-correct-lead / data-wrong-lead on the
   .check card. v2 baked ion-flight's "Not what the detector showed." into the
   shared handler and shipped it to all eight built demos. LEAKED_A6 is the
   blocklist check-shell.js enforces so that cannot recur silently. */
const A6_LEADS = Object.freeze({ correct: 'Correct.', wrong: 'Not quite.' });
const LEAKED_A6 = Object.freeze(['Not what the detector showed.']);

/* SHELL-OWNED OUTPUT SURFACES a demo's own script must not write into. The
   boundary is already stated in ADOPTING.md §1 — "A6 check cards:
   aria-pressed, per-option feedback, no score" is the shell's — so a demo
   writing `.check-feedback` is a boundary violation by definition, not merely
   a smell.

   This exists because two merged demos did exactly that, independently, to
   work around the hardcoded wrong-answer sentence while the kit was frozen:
   ladder-lab post-processed the feedback with an innerHTML.replace() and
   takeoff rewrote the <b> lead's textContent. Both were the RIGHT call at the
   time — the kit was frozen and the sentence was wrong on screen — and both
   become dead code the moment the kit is fixed, in the silent way: the
   replace simply stops matching and still looks like it works.

   Note `.echo` and `.obs-cue` are deliberately NOT here. The A2/A4 contract
   says the ACTIVITY fills those, so a demo writing them is correct.

   SHELL_SCRIPT_MARKER is how check-shell.js tells the shell's own injected
   <script> (which of course writes these surfaces) from the demo's. */
const SHELL_OWNED_OUTPUT = Object.freeze(['check-feedback']);
const SHELL_SCRIPT_MARKER = `lesson-shell v${VERSION} behaviour`;
/* VERSION-AGNOSTIC on purpose. check-shell.js uses this, not the string above,
   to decide "is this the shell's own script block". A version-pinned marker
   would fail to recognise the shell inside a file built by an OLDER kit, and
   would then blame the SHELL's legitimate use of a shell-owned surface on the
   demo — noisy, and misleading exactly when a stale build is what you are
   diagnosing. */
const SHELL_SCRIPT_MARKER_RE = /lesson-shell v[0-9a-zA-Z.]+ behaviour/;

function css() {
  return '\n/* ---- lesson-shell/tokens.css ---- */\n' + read('tokens.css') +
         '\n/* ---- lesson-shell/shell.css ---- */\n' + read('shell.css') + '\n';
}

function cssHash() {
  return crypto.createHash('sha256').update(css(), 'utf8').digest('hex').slice(0, 12);
}

function stamp() {
  return `<!-- lesson-shell v${VERSION} css:${cssHash()} -->`;
}

/* Parse a stamp back out of a built file. Returns null when absent. */
function readStamp(html) {
  const m = html.match(/<!--\s*lesson-shell v([0-9a-zA-Z.]+) css:([0-9a-f]{12})\s*-->/);
  return m ? { version: m[1], cssHash: m[2] } : null;
}

/* ---------------------------------------------------------------------------
   The shell's own behaviour. Kept here rather than in a .js file the demo
   copies, for the same reason the CSS is: one copy, pointed at.

   What it owns:
     * the three dialogs (Guide, Settings, Details) and the presenter notes,
       with swap-not-stack, Escape, backdrop click and focus return;
     * the Guide opening on load;
     * the stage tablist: click, Arrow/Home/End with roving tabindex, and the
       URL hash (#stage-2). A disabled tab is skipped by the keyboard and
       clamped to by the hash — see the note in selectStage;
     * presentation mode (body.presenter) and the header Notes button;
     * the A6 check cards: aria-pressed, per-option feedback from
       data-feedback, and nothing scored;
     * Reset — IN PLACE, with no page reload (operator ruling 2026-09-16). It
       restores every piece of kit-owned chrome from a snapshot taken at first
       load and then dispatches `lessonreset`.

   What it does NOT own: the activity. A demo's app.js listens for three events
   on document — `stagechange` to react to a tab change, `presentationchange`
   to react to the projector toggle, and `lessonreset` to
   put its own state back. `lessonreset` is REQUIRED; see the Reset section below
   and ADOPTING.md.

   It exposes window.lessonShell =
     { selectStage, setPresentation, reset, flags, onReset }.
   --------------------------------------------------------------------------- */
function behaviourScript() {
  return `
/* lesson-shell v${VERSION} behaviour — dialogs, stage tablist, presentation
   mode, check cards. Injected by build.js; do not edit in the built file. */
(() => {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const flags = new Set(location.hash.replace(/^#/, '').split(',').filter(Boolean));
  const hashStage = (() => {
    for (const f of flags) { const m = /^stage-(\\d+)$/.exec(f); if (m) return Number(m[1]) - 1; }
    return null;
  })();
  /* Presentation mode has to be on the body before the activity initialises,
     so it is read here and not after. The fragment is stripped on arrival so a
     later manual refresh is an ordinary fresh load. */
  if (flags.has('presenting')) document.body.classList.add('presenter');
  if (flags.size) { try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) { /* some hosts refuse replaceState on file://; a visible fragment is cosmetic */ } }

  /* ---- dialogs ---------------------------------------------------------- */
  const guide = $('#guide'), settings = $('#settings'), notes = $('#presenter-notes'), details = $('#details');
  let opener = null;
  /* Opening a card from inside another one SWAPS them: nesting two modal
     dialogs stacks backdrops and makes Escape ambiguous. */
  const open = (dialog, from) => {
    if (!dialog) return;
    const host = from && from.closest && from.closest('dialog[open]');
    opener = host ? $('#settings-open') : from;
    if (host) host.close();
    dialog.showModal();
    const head = $('.lesson-dialog-head button', dialog);
    if (head) head.focus();
  };
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.guide-open');
    if (!b) return; e.preventDefault(); open(guide, b);
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.notes-open');
    if (!b) return; e.preventDefault(); open(notes, b);
  });
  const settingsOpen = $('#settings-open');
  if (settingsOpen) settingsOpen.addEventListener('click', e => open(settings, e.currentTarget));
  [guide, settings, notes, details].filter(Boolean).forEach(d => {
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    d.addEventListener('close', () => { if (opener && opener.isConnected) opener.focus(); });
  });
  /* A5: the Details trigger in the stage intro, and reopenable from anywhere. */
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.details-trigger');
    if (!b || !details) return;
    e.preventDefault();
    const k = b.dataset.details || '0';
    $$('.details-stage', details).forEach(s => {
      const on = s.dataset.detailsStage === k;
      s.classList.toggle('on', on); s.hidden = !on;
    });
    const sub = $('#details-subtitle');
    const tab = $$('.stage-tab')[Number(k)];
    if (sub && tab) sub.textContent = ($('span:not(.stage-mark)', tab) || {}).textContent || '';
    opener = b;
    details.showModal();
    const head = $('.lesson-dialog-head button', details);
    if (head) head.focus();
  });

  /* ---- A1 stage tablist ------------------------------------------------- */
  const tabs = $$('.stage-tab');
  const panels = $$('section.stage');

  /* ---- the first-load snapshot ------------------------------------------
     Taken here, before the hash can select a stage and before the demo's own
     app.js has run at all (the shell's script tag precedes it). Reset RESTORES
     FROM THIS rather than recomputing, which is what makes an in-place reset
     honest for a gated demo: the gate comes back exactly as the template
     authored it, whether or not the demo has a sync function of its own. */
  const snapshot = {
    tabs: tabs.map(t => {
      const mark = $('.stage-mark', t);
      return {
        disabled: t.disabled,
        className: t.className,
        title: t.getAttribute('title'),
        mark: mark ? mark.textContent : null
      };
    }),
    echoes: $$('.lesson-strip .echo').map(e => ({ node: e, html: e.innerHTML, hidden: e.hidden })),
    cues: $$('.obs-cue').map(c => ({ node: c, text: c.textContent, className: c.className })),
    detailsSubtitle: (($('#details-subtitle') || {}).textContent) || ''
  };
  function selectStage(index, opts) {
    if (!tabs.length) return;
    /* A gated demo (one that unlocks stage k+1 only after stage k's evidence)
       clamps here rather than unlocking: the prediction-before-evidence gate
       IS the pedagogy, and a hash must not route around it. The clamp is
       silent by design; the tab stays visible and disabled so the learner
       still sees the whole route. */
    let i = Math.max(0, Math.min(tabs.length - 1, index));
    while (i > 0 && tabs[i].disabled) i -= 1;
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    /* Clear the hidden attribute as well as toggling the class. shell.css
       carries [hidden] { display: none !important } and NO .stage or .stage.on
       display rule, so panel visibility rests entirely on the attribute: a
       class-only toggle leaves every non-first stage pinned shut by the
       !important, whatever the class says. ion-flight shipped exactly that way
       - stages 2-4 unreachable - and no node suite, build --check, check-shell
       or build-hub --check could see it. Found by the two-winters lane (P2),
       2026-09-16. */
    panels.forEach((p, k) => {
      const on = k === i;
      p.classList.toggle('on', on);
      p.hidden = !on;
    });
    if (opts && opts.focus) tabs[i].focus();
    document.dispatchEvent(new CustomEvent('stagechange', { detail: { index: i } }));
    return i;
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectStage(i));
    tab.addEventListener('keydown', e => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (step) {
        e.preventDefault();
        let j = i;
        do { j = (j + step + tabs.length) % tabs.length; } while (tabs[j].disabled && j !== i);
        selectStage(j, { focus: true });
      } else if (e.key === 'Home') { e.preventDefault(); selectStage(0, { focus: true }); }
      else if (e.key === 'End') { e.preventDefault(); selectStage(tabs.length - 1, { focus: true }); }
    });
  });
  if (hashStage !== null) selectStage(hashStage);

  /* ---- A8 presentation mode --------------------------------------------- */
  function setPresentation(on) {
    document.body.classList.toggle('presenter', on);
    $$('#presentation-btn, #presentation-foot').forEach(b => {
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('active', on);
    });
    document.dispatchEvent(new CustomEvent('presentationchange', { detail: { on } }));
  }
  $$('#presentation-btn, #presentation-foot').forEach(b => b.addEventListener('click', () => {
    setPresentation(!document.body.classList.contains('presenter'));
    if (settings && settings.open) settings.close();
  }));
  setPresentation(document.body.classList.contains('presenter'));

  /* ---- A6 check cards: feedback for every option, nothing scored --------
     THE LEAD COMES FROM THE CARD, NOT FROM THE KIT. v2 hardcoded one demo's
     wrong-answer sentence here, in the SHARED handler, and it rendered in
     every built demo — so a learner reading a check card about PLC ladder
     logic or about AI winters was told what a mass-spectrometer detector had
     shown. The defaults below are demo-neutral; a demo that wants its own
     framing sets data-correct-lead / data-wrong-lead on the .check card.
     check-shell.js blocklists the leaked sentence so this cannot regress
     quietly — and the sentence is deliberately NOT spelled anywhere in this
     function, because everything here is injected into every built file and a
     blocklist that matches its own explanation is worthless. The exact string
     lives in LEAKED_A6 at module scope, which is not injected. The lead is set
     as TEXT, not markup, because it now comes from an authored attribute. */
  $$('.check').forEach(card => {
    const out = $('.check-feedback', card);
    const leadFor = btn => (btn.classList.contains('correct')
      ? (card.dataset.correctLead || ${JSON.stringify(A6_LEADS.correct)})
      : (card.dataset.wrongLead || ${JSON.stringify(A6_LEADS.wrong)}));
    $$('.check-option', card).forEach(btn => btn.addEventListener('click', () => {
      $$('.check-option', card).forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      if (!out) return;
      out.textContent = '';
      const strong = document.createElement('b');
      strong.textContent = leadFor(btn);
      out.appendChild(strong);
      /* data-feedback keeps accepting inline markup, as it always has. */
      out.insertAdjacentHTML('beforeend', ' ' + (btn.dataset.feedback || ''));
    }));
  });

  /* ---- A2 intro disclosure: collapsible stage intro at phone width ------
     Operator ruling, 2026-09-16: "collapsible intro at phone width."

     THE MEASUREMENT IT ANSWERS. At 320px the full A2 intro (eyebrow, stage
     title, stage question, "Before you start" refresh, then the three-card
     Predict/Try/Takeaway strip) runs 726-775px against a 568-578px viewport —
     the intro alone is more than one whole screen — and it put
     zero-to-unbeatable's Train button 1979px down and ion-flight's Run button
     2327px down, i.e. 4.1 screens. Measured on both demos before this change;
     the cost is a property of the template, not of either demo.

     WHAT COLLAPSES, AND WHAT NEVER DOES. Only the lesson strip is MOVED behind
     the toggle (it is the expensive part: 232-359px, up to half the intro) and
     the refresh is hidden by a CSS :has() rule rather than moved, so the
     desktop grid keeps byte-identical geometry. The eyebrow, the h2 and the
     stage question always stay visible: the stage question is the one line
     that orients, and the h2 is the aria-labelledby target of .stage-intro, so
     hiding it would strip that region's accessible name.

     DEFAULT COLLAPSED ON PHONES. The Guide already opens on load and already
     carries the orientation (the demo-level question, "where this sits", a
     step per stage), so a second orientation block between the learner and the
     activity is redundant rather than safer. Collapsed is not unoriented — the
     question is still on screen.

     NATIVE <details>, so Enter/Space, the disclosure role and the expanded
     state all come from the user agent rather than from an aria-expanded
     reimplementation.

     DESKTOP AND THE PROJECTOR ARE UNTOUCHED: shell.css hides the summary above
     480px and under body.presenter, and the element is forced open in both
     cases, so there is no toggle chrome and no geometry change. */
  const introDisclosures = [];
  $$('.stage-intro').forEach(intro => {
    const strip = $('.lesson-strip', intro);
    if (!strip || $('details.${INTRO_DISCLOSURE.className}', intro)) return;
    const d = document.createElement('details');
    d.className = ${JSON.stringify(INTRO_DISCLOSURE.className)};
    d.open = true;
    const sum = document.createElement('summary');
    sum.textContent = ${JSON.stringify(INTRO_DISCLOSURE.summaryLabel)};
    d.appendChild(sum);
    intro.insertBefore(d, strip);
    /* MOVED, never cloned: snapshot.echoes holds node references into the
       strip, and a clone would silently orphan them from Reset. */
    d.appendChild(strip);
    introDisclosures.push(d);
  });
  const phoneMedia = window.matchMedia
    ? window.matchMedia('(max-width: ${INTRO_DISCLOSURE.breakpointPx}px)') : null;
  function introShouldCollapse() {
    if (!phoneMedia || !phoneMedia.matches) return false;
    /* Presentation mode is a projector, where width is not the constraint. */
    return !document.body.classList.contains('presenter');
  }
  /* The ONE place the default is decided, so load, a breakpoint change, a
     presentation-mode toggle and Reset cannot disagree with each other. */
  function applyIntroCollapse() {
    const collapse = introShouldCollapse();
    introDisclosures.forEach(d => { d.open = !collapse; });
  }
  if (phoneMedia && phoneMedia.addEventListener) {
    phoneMedia.addEventListener('change', applyIntroCollapse);
  }
  /* A2's prediction echo is written INTO the strip, so feedback that appeared
     while the strip was collapsed would be invisible — which would break the
     predict-then-observe loop the strip exists for. Re-open on live content. */
  if (window.MutationObserver) {
    introDisclosures.forEach(d => {
      new MutationObserver(() => {
        if (d.open) return;
        if ($$('.echo', d).some(e => !e.hidden && e.textContent.trim() !== '')) d.open = true;
      }).observe(d, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['hidden']
      });
    });
  }
  /* setPresentation() already dispatches presentationchange, so listening is
     enough and the presentation code above needs no edit. The init call it
     makes fires before this listener exists, which is what the direct call is
     for. */
  document.addEventListener('presentationchange', applyIntroCollapse);
  applyIntroCollapse();

  /* ---- Reset: IN PLACE, no page reload -----------------------------------
     Operator ruling 2026-09-16. Until then Reset set a #reset hash and called
     location.reload(), which was trivially correct and threw the page away to
     get there: a reload discards a canvas mid-animation, re-runs every boot
     path, and on a slow projector laptop is a visible blank flash in front of
     a room. In-place costs a real contract instead, and this is it.

     THE DIVISION OF LABOUR — the whole contract in one sentence: if the kit
     named the class, the shell restores it; everything else is the demo's.

     WHAT THE SHELL GUARANTEES, in this order:
       1. 'onReset()' is consulted first and a 'false' return CANCELS the whole
          reset — nothing below runs. That is the veto path, unchanged from v1.
       2. Every open <dialog> closes — not only the shell's four. A demo may
          own one (two-winters' #item-details), and a dialog still open after a
          Reset is un-restored state the learner is looking straight at.
       3. Every stage tab goes back to its first-load chrome from the snapshot:
          'disabled' (so a gate re-locks), class (so 'complete' marks clear),
          title, and the .stage-mark glyph.
       4. Every A6 check card drops its aria-pressed answer and clears its
          feedback line.
       5. Every A2 .echo and A4 .obs-cue returns to its snapshotted first-load
          content. partials.html specifies both as empty on load; the snapshot
          is used rather than a blanket clear so a demo that authored something
          there keeps it.
       6. The A5 Details drawer goes back to showing stage 1, with its
          subtitle restored.
      6b. The A2 intro disclosure returns to its default for the CURRENT width
          (v3) — recomputed, never restored from the load-time snapshot, so a
          rotation between load and Reset cannot leave it half-open.
       7. selectStage(0) — stage 1, which also fires 'stagechange'.
       8. The page scrolls to the top.
       9. 'lessonreset' is dispatched on document.

     THE ORDER OF 7 AND 9 IS DELIBERATE, AND v3 KEPT IT. The stagechange at
     step 7 fires BEFORE lessonreset at step 9, so a stagechange handler that
     renders activity state paints the PRE-reset state into freshly reset
     chrome (missing-time hit exactly this). v3 fixes that with the
     'resetting' flag rather than by reordering, for three reasons:
       * this file and ADOPTING.md both GUARANTEE in writing that lessonreset
         fires last, "so the demo has the final word over any node the two both
         touch". Eight merged demos are written against that guarantee and five
         more builder lanes are in flight; reordering invalidates all of them
         silently.
       * reordering swaps a known hazard for a new one — the demo's lessonreset
         handler would then run before step 3 restored the tab chrome, so any
         handler reading tab state would read the post-session gates.
       * what-the-survey-missed established the hazard is inapplicable to
         render-only-from-actions designs; it bites the move-the-instrument
         pattern ion-flight and missing-time use. The flag fixes precisely that
         pattern WITHOUT changing any event order, so those demos keep working
         unmodified.

     WHAT THE SHELL DOES NOT TOUCH, deliberately:
       * PRESENTATION MODE. A presenter resets between rooms; re-shrinking the
         projector every time would be hostile. CONTRACT.md's wording too.
       * THE GUIDE. It does not reopen. A reset is not a fresh arrival, and the
         learner who pressed it has already read it.
       * THE ACTIVITY. The shell cannot know what a demo holds. That is what
         step 9 is for.

     WHAT THE DEMO MUST IMPLEMENT — required, not optional:

         document.addEventListener('lessonreset', () => {
           // every variable your module closes over, back to its initial value
           // every node your app.js generated, back to its first-load content
           // then re-render stage 1
         });

     'lessonreset' fires LAST, after the shell has finished, so the demo has
     the final word over any node the two both touch. It is not cancelable: the
     veto lives in onReset(), so there is exactly one place to refuse a reset.

     A demo that ships no handler silently keeps its answers, its generated
     DOM and its progress through a Reset that visibly moved everything else.
     check-shell.js fails a built file that carries no handler, with a negative
     control proving it is not merely matching the dispatch below. */
  function resetLesson() {
    /* v3: the flag ADOPTING.md §4 has promised since v2. True from BEFORE the
       onReset veto until AFTER 'lessonreset' has been dispatched, so a
       stagechange handler that genuinely has to paint can skip the one
       stagechange step 7 fires mid-reset:

           document.addEventListener('stagechange', e => {
             if (window.lessonShell.resetting) return;   // chrome only, mid-reset
             render(e.detail.index);
           });

       DO NOT write that guard into your 'lessonreset' handler. The flag is
       still true while 'lessonreset' runs, by design — your handler restores
       state and re-renders by calling your own render directly, which the
       guard above does not touch. Guarding lessonreset would suppress the very
       render the reset exists to perform.

       try/finally, so the veto path and any throw inside a listener both leave
       the flag false rather than wedging every later stagechange. */
    window.lessonShell.resetting = true;
    try {
      return runReset();
    } finally {
      window.lessonShell.resetting = false;
    }
  }
  function runReset() {
    if (window.lessonShell.onReset && window.lessonShell.onReset() === false) return false;
    $$('dialog').forEach(d => {
      if (!d.open) return;
      try { d.close(); } catch (e) { /* a dialog mid-close; it is already going */ }
    });
    tabs.forEach((t, i) => {
      const s = snapshot.tabs[i];
      if (!s) return;
      t.disabled = s.disabled;
      t.className = s.className;
      if (s.title === null) t.removeAttribute('title'); else t.setAttribute('title', s.title);
      const mark = $('.stage-mark', t);
      if (mark && s.mark !== null) mark.textContent = s.mark;
    });
    $$('.check').forEach(card => {
      $$('.check-option', card).forEach(b => b.setAttribute('aria-pressed', 'false'));
      const out = $('.check-feedback', card);
      if (out) out.innerHTML = '';
    });
    snapshot.echoes.forEach(e => { e.node.innerHTML = e.html; e.node.hidden = e.hidden; });
    snapshot.cues.forEach(c => { c.node.textContent = c.text; c.node.className = c.className; });
    $$('.details-stage').forEach((s, i) => { s.classList.toggle('on', i === 0); s.hidden = i !== 0; });
    const sub = $('#details-subtitle');
    if (sub) sub.textContent = snapshot.detailsSubtitle;
    /* 6b. The A2 intro disclosure goes back to ITS DEFAULT FOR THE CURRENT
       WIDTH, recomputed rather than restored from the first-load snapshot.
       Deliberate: if the phone was rotated since load, the snapshotted state is
       the wrong answer, and restoring it is exactly how a reset leaves an
       intro half-open. Recomputing cannot: applyIntroCollapse() is total. */
    applyIntroCollapse();
    selectStage(0);
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) { window.scrollTo(0, 0); }
    document.dispatchEvent(new CustomEvent('lessonreset', { detail: { index: 0 } }));
    return true;
  }
  const resetBtn = $('#reset-btn');
  if (resetBtn) resetBtn.addEventListener('click', () => resetLesson());

  /* ---- A7: the Guide greets every load ---------------------------------- */
  if (guide && !guide.open) {
    opener = $('#guide-open');
    guide.showModal();
    const cta = $('.lesson-dialog-actions button', guide);
    if (cta) cta.focus();
  }

  /* 'resetting' is a live flag, false except inside resetLesson(). See the
     comment there for the guard pattern it exists for, and for the one place
     you must NOT use it. */
  window.lessonShell = {
    selectStage, setPresentation, reset: resetLesson, flags, onReset: null, resetting: false
  };
})();
`;
}

module.exports = {
  VERSION,
  MARKERS,
  QUALIFIER_CLASS,
  REQUIRED_TOKENS,
  REQUIRED_CLASSES,
  KICKERS,
  INTRO_DISCLOSURE,
  A6_LEADS,
  LEAKED_A6,
  SHELL_OWNED_OUTPUT,
  SHELL_SCRIPT_MARKER,
  SHELL_SCRIPT_MARKER_RE,
  css,
  cssHash,
  stamp,
  readStamp,
  behaviourScript
};
