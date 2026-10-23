# Prompting Strategies

*The roleplay at the centre of this demo is called **The Stranger**, which is where the folder
and the guide filenames get their name.*

A single-file, offline classroom demo of **why prompts work**. A student's question sits on
the screen with three toggleable blocks of text beside it, and the "AI" answers. Flip a lever,
ask again, and the answer changes in exactly one dimension.

Open `index.html`. No install, no accounts, **no network of any kind at runtime** — every
response is hand-authored and baked into the file, so it behaves identically on a projector,
on a phone with airplane mode on, and off a thumb drive in a room with no wifi.

**Companion:** `presenter-sheet.html` / `The-Stranger-Presenter-Sheet.pdf` — the live roleplay
script in three acts, house rules, a running order under 12 minutes, discussion questions, and
a second page of eight target cards to print and cut out. That file is also the **presenter
notes inside the app**: `build.js` injects it into `index.html`, so the paper, the PDF and the
overlay are one document from one source and `node build.js --check` fails if they drift.

---

## The three levers

| lever | what it adds to the prompt | what it fixes |
|---|---|---|
| **1 — Context** | who I am, what class, what I'm working with | an answer aimed at everybody, which is an answer aimed at nobody |
| **2 — Success spec** | what a finished answer looks like: format, length, audience, what to include | a right answer you cannot use tonight |
| **3 — Expert keywords** | the domain's vocabulary | "the bottom gets stretched" when you needed *tension* and *neutral axis* |

The assembled prompt is on screen the whole time, colour-coded to match the levers, so a room
watches the prompt grow as the toggles flip.

## Four questions, sixty-four hand-written answers

| scenario | the question | why it's here |
|---|---|---|
| The test | *Help me get ready for my test.* | the classroom thread — sophomore biology, two hours, a Friday test |
| The bridge | *Why do bridges stay up?* | the keyword showcase — load path, bending moment, neutral axis |
| The email | *Write an email to my boss.* | workplace relevance — asking a short-staffed manager for two days off |
| The essay | *Here's my essay. Is it any good?* | a real draft is attached in all eight states; only the success spec ever says "don't rewrite it for me" |

Eight lever states per scenario. The four states where the success spec is off get **three**
alternate answers each, one per target card — 16 authored responses per scenario, **64 in
total, ~25,700 words**, written from a blank page each. No templating: a gate fails
`python tools/validate.py` if any two of the 64 share more than 5% of their sentences
(current worst: **0.00%**).

**Read that precisely.** The gate lives in `tools/validate.py`, which is a separate step run by
hand before a build. `build.js` never invokes it and never re-derives it, so a clean
`node build.js --check` is **not** evidence that any content gate holds -- and `--check` now says
so on its own output, in those words, so the claim cannot be made by silence.

What `build.js --check` *does* enforce about content is a **staleness pin**: if any authored file
in `src/content/` is newer than the merged `src/content.json`, the build refuses and tells you to
run the validator. That needs no gate logic, so it forks nothing. `validate.py` takes no arguments
and unconditionally rewrites `src/content.json`, so it cannot be called from a `--check` that must
write nothing, and re-implementing its seven gates in JavaScript would be a second copy that
drifts. **Residual gap, on the record:** the pin does not catch a hand-edit of `src/content.json`
itself, which would look fresh and ship ungated. Never edit the merged file. This README said "fails
the build" until 2026-09-16; that was wrong about the mechanism, and the gate is a
**verbatim-reuse** gate rather than a similarity gate -- it compares normalised sentences for
exact identity, so two paraphrases of one sentence score as fully distinct.

### The no-strawman rule

The all-levers-off answer is **competent but aimed at nobody** — general, hedged, covering
every case because it cannot tell which one you are, and ending by asking for the thing the
context lever would have supplied. It is not stupid and it is not broken. The demo collapses
the moment a room decides the bad answer was rigged, so the bland answers were written to
survive being read aloud to a colleague.

Each single-lever state improves in exactly that lever's dimension, and nothing else: context
alone is personal but shapeless; success spec alone is the right shape filled with generic
content; keywords alone is expert register aimed at the wrong person. The isolation notes are
in a comment block at the top of the built `index.html`, one sentence per state.

## Two stage mechanics

**The target deck** (lever 2). Somebody has to decide what a good answer looks like. If the
asker doesn't, the model does — silently. With lever 2 off, pressing Ask deals a card
(*Length: exhaustive*, *Audience: someone who missed the whole semester*, *Format: dense
paragraphs*…) and the answer is written to that card. The deck lives **inside the lever 2
panel**, and turning the lever on strikes the card names through and shoves the deck aside:
you took the decision back. Eight cards ship as a printable cut-out sheet so the presenter can
run the same beat live with paper.

**The jargon meter** (lever 3). Every response has its domain vocabulary pre-tagged. A counter
under the answer tallies the terms as they stream, and a toggle lights them up in the text.
Keyword-off answers carry 0–4. Keyword-on answers carry 15–20, of which **13–20 are words the
student never typed** — handed over for free because the prompt signalled a register.

## Classroom features

- **Guide (?).** The Guide opens on every load: the three levers, what every control does, and
  the shape of the twelve minutes. Dismiss it with `Esc`, a tap outside it, or *Got it*. The
  **?** at the top right brings it back at any point, at any screen width — it is the one
  control that never goes away.
- **Settings (⚙).** The menu beside the **?**, with three standard items at the top.
  **Open Presenter Notes** shows the printable presenter sheet on screen — the same file,
  injected at build time, not a summary of it. **Presentation mode** is the projector build of
  the app — big type, the 1–10 class score strip, pin-to-compare, and the card picker inside
  lever 2; switch it off and you are in student mode. **Reset** returns the whole demo to its
  fresh-load state — question 1, levers off, no answer on screen, scoreboard cleared,
  highlighter off, card picker back to Random — and deliberately leaves Presentation mode
  alone, since that is a property of the room rather than of the demo. Below those, the
  expert-term highlighter, a way back to the Guide, and the closing slide. On a phone the mode
  switch and the closing slide move into this menu, so the toolbar stays a thumb wide.
- **Scoreboard.** Score each answer 1–10 from the room; the chart plots score against levers
  pulled and the curve climbs across the session on its own.
- **Compare.** Pin any answer beside the next one for A/B.
- **Presentation mode** (Settings, or the footer) — projector-sized type, a `Notes` button in
  the header, and the presenter tools: the 1-10 class score strip under each answer, **Pin to
  compare**, the **Scoreboard**, and the card picker inside lever 2. Off is the student build:
  smaller type, no class scoring, and the target card always drawn at random.
- **Check yourself** — each stage closes with a *"which lever would fix this?"* item carrying
  written feedback on every option, right and wrong, and stage 3 adds the accuracy-brief case.
  These twelve items were the old student walkthrough's quizzes; they are now the A6 item bank,
  generated into the built file from `src/learn.json` so there is still one source for them.
- **Closing slide:** *When AI gives you a useless answer, ask which lever you left unpulled — when it is wrong, out of date, refusing, or past what it can do, no lever fixes that.*

Keys: `1` `2` `3` levers · `0` all off · `9` all on · `Enter` ask · `Space` skip typing ·
`H` highlight · `R` replay card · `P` pin. The stage tabs switch levers and take Arrow/Home/End;
`Esc` closes any dialog. Keys are ignored while a dialog is open, so the shell owns `Esc`.

## Theme

Murray State. MSU Blue `#002144` is the surface family, MSU Gold `#ECAC00` the accent and
lever 1, Lite Blue `#00A4E3` lever 2. Red Orange `#FF4500` is reserved for a genuine failure
state — this app has exactly one, a wrong answer on a check-yourself item — so it never shows up
as decoration. Lever 3 keeps its violet: it is the third leg of a colour code that is also
printed on the presenter sheet and on the cut-out target cards, and the paper has no fourth
ink to give it.

## Build

`index.html` is generated; do not edit it directly.

```
node build.js            # src/ + presenter-sheet.html -> index.html (refuses any network or storage call)
node build.js --check    # parity check, writes nothing
node tools/pdf.mjs       # presenter-sheet.html -> The-Stranger-Presenter-Sheet.pdf
node tools/pdf.mjs --check   # the sheet parses and the PDF exists; writes nothing
```

`build.js` also injects the presenter sheet: it lifts the `<style id="guide-css">` stylesheet
and the `.guide-scope` body out of `presenter-sheet.html` and drops them into the notes overlay,
so **Settings → Open Presenter Notes shows that file itself**. `--check` fails if `index.html`
has fallen behind the sheet, which is what keeps the paper, the PDF and the app in agreement.
It carries one more gate: the eight cut-out target cards on page two of the sheet are verified
field by field against `src/scenarios.json`, so the printed deck cannot drift from the deck the
app deals. `tools/pdf.mjs` uses a system Chrome (`CHROME_PATH`, else the usual install
locations) and Node builtins; nothing is installed and nothing is downloaded.

The authoring pipeline is Python, and is only needed if you change a response:

```
python tools/validate.py    # merges src/content/*.json -> src/content.json, enforces the gates
node   build.js
python tools/playtest.py    # STALE -- see the note below; does not currently run
```

`tools/companion.py` is **retired to a signpost**. It used to generate `presenter-sheet.html`
and the PDF from a copy of the sheet embedded in its own source, which made it a second source
for a file that is edited by hand — running it would silently have reverted those edits. The
sheet is now authored directly, the PDF comes from `tools/pdf.mjs`, and the one piece of real
logic it held (deriving the eight target cards from `src/scenarios.json`) lives on in `build.js`
as the parity gate described above.

`tools/validate.py` enforces seven content gates: every tagged term occurs verbatim on a word
boundary, no term is a substring of another in its list, keyword-on states carry ≥10 terms
absent from their own prompt, keyword-off states carry ≤4, no pair of variants shares >5% of
its sentences, the card shapes hold (dense = no headings or bullets anywhere; listicle = exactly
ten items), and the markdown stays inside the renderer's subset.

`tools/playtest.py` is **stale and does not run**, measured 2026-09-16: it opens
`the-stranger.html` and reads `build/content.json`, and neither path has existed since the demo
was renamed and its sources moved under `src/`. It also needs Playwright, which this checkout
does not have. What it was written to check is real and still worth having — all 64 states
render their authored text, the jargon counter equals the tag list, every tagged term gets
marked in the DOM, the typewriter is skippable, the card draw replays — but **do not cite it as
evidence until it is repaired**; it is listed here so nobody mistakes its presence for a passing
suite. The 2026-09-16 retrofit verified the equivalent properties by driving the built file in a
real browser over a local static server instead.

> Note on convention: every other demo here builds with `node build.js` alone, and this one
> does too. The Python tools are additive — content validation and browser acceptance tests
> that have no JS equivalent in the repo yet. If that split is unwelcome, the validator is the
> piece worth porting; the build itself is already Node.

## Source layout

```
index.html                     built, self-contained, 370 KB
build.js                       src/ + ../tools/lesson-shell -> index.html; offline guard, deck parity gate
src/template.html              the markup, on the shared lesson-shell parts (A0-A10)
src/styles.css                 the ACTIVITY styles only -- the shell's are shared, not copied
src/app.js                     the activity: levers, prompt, deck, answer, typewriter, meter, scoring
src/demo-guide.html            CANONICAL presenter sheet: the printable page, the PDF, and the in-app notes
presenter-sheet.html           generated from src/demo-guide.html (kept as the public URL)
The-Stranger-Presenter-Sheet.pdf   rendered from presenter-sheet.html by tools/pdf.mjs
src/cases.json                 authored cases that are not lever fixtures (the accuracy-brief case)
src/content/<scenario>_on.json the four success-spec-on responses per scenario
src/content/<scenario>_off.json the twelve success-spec-off responses (4 states x 3 cards)
src/content.json               merged + gate-checked bundle (generated by tools/validate.py)
src/scenarios.json             the four questions, their three lever blocks, the 8-card deck
src/learn.json                 the 12-item check bank, the walkthrough states, the attached essay, closing line
src/AUTHORING.md               the rules the responses were written to — read this before editing one
src/essay-draft.md             the student essay attached in all eight states of scenario 4
tools/pdf.mjs                  presenter-sheet.html -> the PDF, via a system Chrome
tools/                         validate.py, playtest.py (STALE), companion.py (retired signpost)
../tools/lesson-shell/         the SHARED kit: tokens, shell CSS, shell behaviour, version stamp.
                               A build-time dependency only -- index.html stays one self-contained
                               file with zero <script src> and zero <link href>.
```
