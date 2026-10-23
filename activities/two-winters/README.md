# AI Winters: Boom and Bust

**Has this happened before?** — Demo 4 of 17, Part two ("Where it is going"), in
*AI: From Zero to Takeoff* (`tours/zero-to-takeoff.json`).
(Folder and URL stay `two-winters`; the two winters are still what it is about.)

`takeoff` ends with the room having considered AI gains alongside limits and measurement
conditions. The
honest next question, and you will get it, is *"is this another bubble?"* This demo
answers with evidence rather than reassurance. It compares two AI contractions that had
overlapping pressures but different causes, and asks which historical analogies survive
contact with evidence.

One HTML file. Runs offline. No AI at runtime, no network requests, nothing stored on the
device.

---

## The one thing the room should leave with

Before calling a historical claim right or wrong, ask what sort of claim it is. A forecast
needs an outcome and a time window. A contemporary assessment needs evidence about its own
conditions. The activity is a curated teaching selection, not a representative accuracy
sample of optimists, pessimists, or the field.

---

## The four stages

| Stage | What it is | Time |
|-----|-----------|------|
| **1 — Claims** | Ten curated, sourced claims, 1950–2024, speaker and date hidden. Score five time-bounded forecasts; classify four assessments or untimed ambitions without grading them against the future. | 7–9 min |
| **2 — History** | A scrubbable 1950–2026 timeline in six rows: landmark results plus five comparison lenses. It shows different pathways, not a fixed sequence. | 3–4 min |
| **3 — Compare** | Choose one lens, then inspect three era cards. Each Details panel holds the full explanation and named sources. Two present questions remain openly unresolved. | 2–3 min |
| **4 — Today** | Expand a similarity beside a difference; supporting cut and source lists open on request. | 2–3 min |

### The five comparison lenses

The lanes in Stage 2 and selected lens in Stage 3 make causes comparable. They do **not** assert that
every contraction follows this order or that the present is completing a third cycle:

1. **Claims and ambitions** — what people said the technology could soon do.
2. **Institutional bets** — public or private commitments made under uncertainty.
3. **Constraints** — technical or economic limits that became salient.
4. **Reassessment** — reports, researchers, or markets revising expectations.
5. **Withdrawal** — funding, markets, or institutional attention pulling back.

---

## How to present it

The full session plan is `presenter-guide.html` (and its PDF), and the same text is
readable on screen at **Settings → Open Presenter Notes** so you never need a second
window. It is the same file, injected at build time, not a summary of it. Short version:

- **Presentation mode** (Settings) enlarges everything for a projector.
- **Settings → Reset** returns the whole demo to its start between rooms, in place —
  no reload, so nothing flashes on a projector; answers, Stage 1, the timeline and every
  opened card return to their fresh-load state — and leaves Presentation mode on.
- **The `?` button is Guide** — the short how-to panel, which opens on first load.
- **Do the first two cards yourself, out loud.** Then hand it over. Ask for a show of
  hands on the year *before* dragging the slider. The room being wrong together is the
  experience.
- **Short of time?** Keep four cards: Simon & Newell 1957, ALPAC 1966, Schank & Minsky
  1984, Amodei 2024. Use ALPAC to explain assessment versus forecast, then skip to Stage 3.
- **In Stage 2, do not narrate a cycle.** Drag slowly and ask what differs between the two
  historical pathways under each comparison lens.
- **If someone asks where this came from**, open **Settings → Run the self-test** in front
  of them. It re-derives live that every claim resolves to a declared source, that no
  source is cited and never used, and that the counts quoted on screen match the data.

---

## Sourcing — the part that matters

This demo's entire claim to credibility is that every sentence on screen resolves to
something a sceptic can go and check.

- Every claim carries a `src` id resolving to an entry in `SOURCES`, and a **status**:
  - `primary` — checked against the document itself during the build: the paper, the
    report's own text, the lab's own page, the official results table.
  - `reported` — a specific, retrievable secondary source that names its own underlying
    scholarship. Used where the primary is a printed book, a paywall, or a page scan.
- No source URL is a journal or organisation homepage; the test suite enforces that every
  URL points at a specific page.
- **What could not be sourced was cut, and the cuts are on the page.** Stage 4 lists seven
  claims that were researched and left out, with the reason for each — including a dollar
  figure for XCON's savings at Digital (sources disagree, and the primary is paywalled)
  and an unsupported claim that ALPAC predicted machine translation would never work.
- **There is no continuous funding series**, because none exists in sourceable form. The
  demo shows four funding examples with different bases: programme budgets, programme
  expenditure, and a private round. They use three currencies and cannot be combined without
  shared price-year and accounting assumptions.
- **Winter date ranges are conventional, not crisp.** The starts are well attested; the
  ends are argued over. The bands are drawn with a soft right edge and each carries a note
  saying exactly where historians disagree.
- **Dates show only what was verified.** Every timeline event declares its precision, and
  the app prints a year, a month or a day accordingly. *Perceptrons* is dated 1969, not
  "Jan 1969" — printing a month nobody checked is a small fabrication, and there is no
  budget for small ones here.

Where a claim rests on a printed history rather than a document — Crevier 1993,
McCorduck 2004 — the historian is named on the claim itself.

---

## Building

Sources live in `src/`. `index.html` is the committed build output; do not edit it. The
build also reads the shared lesson shell at `../tools/lesson-shell/` (tokens, shell CSS,
dialog/tablist/presentation-mode behaviour) — a build-time-only dependency; the shipped
`index.html` stays one self-contained file (see `build.js`'s own head comment).

```bash
node build.js                              # writes index.html and presenter-guide.html
node build.js --check                      # verifies both match the canonical build; writes nothing
node src/playtest.test.js                  # dataset + engine tests
node src/contract.test.js                  # built index.html against CONTRACT.md's Required UX
node ../tools/lesson-shell/check-shell.js two-winters   # kit adoption: tokens, parts, kickers, self-contained
node tools/pdf.mjs                         # regenerates Two-Winters-Presenter-Guide.pdf
node tools/pdf.mjs --check                 # verifies the guide parses and the PDF exists
```

`build.js` refuses to write a file containing an external `src` or `href` on any
resource-loading tag, so a stray CDN reference fails the build rather than shipping.

### Files

| File | What it is |
|------|-----------|
| `src/data.js` | Every claim, source, comparison lens, and cut-list entry. The only file with facts in it. |
| `SPEC.md` | Teaching objective, historical guardrails, interaction model, and verification contract. |
| `src/engine.js` | Pure functions: dates, the year scale, the scoring. No DOM. |
| `src/timeline.js` | The Stage 2 canvas — lanes, winter bands, scrubber. Hand-rolled 2d context. |
| `src/app.js` | The four stages' own rendering, the live self-test, and the item-level "read more" popovers for a single timeline event or comparison cell. The header, stage tablist, and the Guide/Settings/Details/Presenter-Notes dialogs are the shared lesson shell's, not this file's. |
| `src/styles.css` | The activity's own styles only — the shared shell owns the chrome. |
| `src/template.html` | The app shell markup, built against `../tools/lesson-shell/partials.html`'s vocabulary. `build.js` fills the shell's placeholders plus this demo's own JS bundle marker. |
| `src/demo-guide.html` | **Canonical** presenter guide (renamed from `presenter-guide.html`, kept as the shipped output filename in `demo.json`). Its `<style id="guide-css">` block and its `.guide-scope` div are lifted into the app so the on-screen notes and the printable guide cannot drift. Both markers must start a line and occur exactly once outside a comment, or `build.js` refuses to run. |
| `src/playtest.test.js` | 81 checks on the data and the engine. Run before committing. |
| `src/contract.test.js` | Checks the built `index.html` against CONTRACT.md's Required UX against the shared shell's markup: the Guide button and dialog, the four Settings labels (asserted inside the Settings dialog only, never against the injected guide text), the in-place Reset contract (no navigation primitive in the shell, the `lessonreset` dispatch, this demo's listener), and a clean guide injection (re-using `../tools/lesson-shell/guide-contract.js`'s own extraction). |
| `tools/pdf.mjs` | Guide → PDF. Prefers Playwright, falls back to a system Chrome or Edge. |

### The PDF tool differs from its neighbours

`takeoff/tools/pdf.mjs` and friends require Playwright. This repository has no
`node_modules`, so `tools/pdf.mjs` here tries Playwright first and otherwise drives a
system Chrome or Edge with `--print-to-pdf`. Set `CHROME_PATH` if your browser is
somewhere unusual; nothing is hardcoded to one machine.

---

## Modifying it

**Adding or changing a claim** means editing `src/data.js` and nothing else.

- A prediction card needs `id, quote, who, role, where, year, kind, verdict, verdictLine,
  what, status, src`. `kind` is what it *is* (`promise` / `assessment` / `warning`);
  `verdict` is the forecast outcome (`no` / `yes` / `late` / `open`) or `context` for a
  dated assessment that must not be graded against the future.
- A timeline event needs `d, p, stage, era, label, text, status, src`, plus an optional
  `money` block if it is one of the funding commitments. `p` is how much of the date you
  actually verified — `'y'`, `'m'` or `'d'` — and the app prints only that much. An event
  whose day is unknown is stored on the 1st so it sorts and plots; the tests refuse to let
  it claim day precision.
- Any new `src` id must exist in `SOURCES` and must actually be used — the test suite
  fails in both directions, so a dangling reference and an orphaned source are both build
  breaks.

The tests also enforce the teaching model. If you add a card, update the forecast,
assessment, and warning counts that the scorecard uses; assessments must remain unscored as
future forecasts. The same is true of the money panel's "four funding examples" caption and the
"ten claims" line in the guide.

Then: `node src/playtest.test.js && node build.js && node src/contract.test.js`.

---

## Contract compliance

Built against the shared lesson shell at `../tools/lesson-shell/` (fleet-wide template;
see `plan-demo-fleet-format-alignment` in the memory store for the full template).

| Item | State |
|------|-------|
| Guide dialog on load, dismissible, reopenable from the `?` button (named **Guide**) | yes — shell-owned |
| Settings menu offering **Open Presenter Notes**, **Presentation mode**, **Reset** | yes, shell-owned — plus this demo's own **Run the self-test** |
| **Reset** returns the whole demo to fresh-load state | yes — in place, no reload: the shell restores its chrome and dispatches `lessonreset`; `src/app.js`'s `resetActivity()` restores the activity. Presentation mode is left alone by design |
| Presenter notes openable in-app, and identical to the printable guide | yes — injected from `src/demo-guide.html` at build time; `node build.js --check` fails on drift |
| Murray State theme | yes — kit tokens: navy `#002144`, gold `#ECAC00`, lite blue `#00A4E3` |
| Red-orange `#FF4500` reserved for genuine failure states | yes — a wrong verdict, the "money leaves" stage, a failed self-test check, an unresolved source. Nothing else. |
| Attribution visible | yes, in the footer on every stage and the credit pill |
| Mobile | phone-first; verified at 320px with zero horizontal overflow and no tap target under 36px, in all four stages, in both normal and presenter mode |
| Offline, no runtime inference | yes — zero external `src`/`href` in the shipped file, enforced by the build |

---

Bryant Harrison · Murray State University. Sources checked September 2026.

### Interaction checks

`node tools/ui.test.cjs` uses an available Playwright installation (and optional `CHROME_PATH`)
to exercise the complete deck, all five lenses and fifteen era Details panels, focus return,
Settings, presenter notes, self-test and Reset at 1280, 390 and 320 pixels.
It checks runtime requests and page overflow; screenshots go to an OS temporary directory
unless `QA_OUTPUT` is set. No browser dependency is shipped in the offline demo.
