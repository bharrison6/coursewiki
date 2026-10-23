# The Pace of AI Progress: teaching and implementation specification

## Purpose

Teach participants to state what a measurement supports, name the conditions that travel with it, tell a benchmark score apart from an event that institutions have checked, and expose the assumption behind any extrapolation. **The size of the change leads; the discipline of reading it is how the evidence is presented, not the headline.** Neither optimism nor pessimism is the success condition, and understatement is as much a failure as overstatement.

The public slug is `takeoff`. The display title is **The Pace of AI Progress**. The app runs as one offline HTML file, is built against the shared lesson shell (`../tools/lesson-shell`, build-time only), and retains the collection's Guide/Settings contract and visible Bryant Harrison / Murray State attribution.

## Two measures, two grammars

The demo carries two kinds of evidence and must never plot them on one scale.

- **Benchmarks** are measurements under conditions. A benchmark row carries its `conditions` — harness, effort setting, eval set — on the face of the chart, and its series carries an `endNote` saying where the published record stops. Benchmarks saturate.
- **Achievements** are events with an `acceptance` status (a rung of `LADDER`, from Nobel Prize down to retracted) and an `ai_role` (`tool`, `verified`, `autonomous`), both on the face of the card. Achievements do not saturate; they accumulate, and the rung is read before the headline.

`validation.js` enforces both vocabularies as closed sets, and the node suite carries a negative control for each.

## Learning sequence

**Stage 1 — Measure.** Five series, each starting with its early points shown. The learner draws across the shaded region (pointer, or Up/Down/Home/End on the focused chart); the drawn line *is* the stage's Predict and its endpoint is echoed into the lesson strip at reveal. Reveal compares the endpoint with the last published point, reports the ratio and — for percentage series — the point gap, **as observations rather than a score**, and then names *what would have broken this line*: a successor released inside the gap, a harness change, a corrected problem set. A selector allows non-sequential participation. No cross-benchmark average is shown, and no line is projected past its last point.

**Stage 2 — Retire.** Four benchmark families, generation by generation. Each generation shows a status (retired / saturated / nearly / still discriminating / scores not captured) and, where it stopped measuring what it was meant to, the **route**: beaten, bad tasks, contamination, or coverage. A successor that changed the unit is flagged as counting something different. Saturation is defined in its precise sense — top scores inside each other's confidence intervals — not as "the number is high". The status and route chips are labelled **Reasoned**: they are the authors' reading of the quotation shown beside them.

**Stage 3 — Achieve.** Fourteen real 2023–2026 events, filterable by rung and by role, sorted down the ladder. Every rung has an occupant, including **retracted**. The counter-evidence is not optional: METR's randomised trial of experienced developers ships beside the Nobel Prize. An empty filter intersection states what the absence means rather than going blank.

**Stage 4 — Forecast.** The invented score has observations `(t=-1,20)` and `(t=0,30)`. Linear, proportional and saturation rules match both exactly and diverge beyond them; the formulas are in Details and in the guide. Output above the toy ceiling of 100 is shown as invalid for that scale rather than clipped. The saturation ceiling of 75 is an assumption, not a fitted fact. The boundary card then gives the limits the same sources report, one sentence each.

## Evidence policy and snapshot

`src/data.js` owns every embedded value and the source table; `SNAPSHOT` is the date every source was opened, and `validation.js` refuses a source whose `checked` date is not that day. Each source also records **how** it was read — `fetched`, `browser render`, or `dataset download` — because two primary leaderboards serve no data rows to a plain fetch and one publisher's host refuses automated fetch entirely. A claim with no reachable source is left out, never guessed.

- A model release date and an evaluation date must not be silently substituted for each other; where they differ the point's note says which is plotted.
- Where two published figures disagree, **both are given and neither is silently chosen** — GPT-4o's GPQA (50.6% in the o1 post's table, 53.6% on the May 2024 launch chart), and Humanity's Last Exam (46.5% from Epoch, 59.1% from Artificial Analysis for the same model).
- Vendor-built evidence is labelled as such even when it is impressive, and a third party's reproduction of a vendor number is worth more than either alone (FrontierMath Tier 4: OpenAI claims 97.6%; Epoch, which administers the benchmark and discloses OpenAI's funding and exclusive subset access, records the same 97.6%).
- A denominator travels with its numerator: 736 of 380,000 synthesized, 9 of 353 Erdős problems, 2 of 68 on the unsolved set.
- Series values recomputed from a published dataset are marked to that dataset, not to a page that charts it.
- No benchmark generation is joined to another by a line, and ARC-AGI-3's RHAE is never continued from an ARC-AGI-1 or -2 curve.

Source checks are distinct from application integrity tests. A passing test validates references, dates, bounds, vocabularies and arithmetic — not the truth or generality of a publication.

## Architecture and invariant checks

`build.js` requires the kit and its `guide-contract` module, injects the shell CSS, the shell behaviour, the activity CSS, the guide's scoped CSS and body, and the concatenated app at markers that must each occur exactly once, then refuses any external reference or runtime load (the runtime-load scan proves itself on bait first). The output is one self-contained file with zero `<script src>` and zero `<link href>`, stamped with the kit version and a hash of the kit CSS.

The scale engine supports linear and logarithmic mapping, inverse mapping, ticks, pointer interpolation and endpoint comparison. The estimate endpoint is the real ask date, not the padded chart boundary. **The axis always runs to the snapshot date**: `setAxisEnd` is wired at boot, the stretch between the last published point and the snapshot is hatched, a dashed rule marks where the series ends, and the end note is drawn in the top gutter unconditionally — it must render at phone width, which is the case the previous conditional silently dropped. `engine.js` carries no trend-fitting helper: a least-squares doubling fit is this demo's own anti-pattern, and METR's doubling times are quoted from METR.

Guide, Settings, Details and Presenter Notes are the shell's native `<dialog>` elements with swap-not-stack, Escape, backdrop click and focus return; the demo owns none of that machinery. **Reset is in place, with no page reload**: the shell restores what the kit owns and dispatches `lessonreset`, and `app.js` restores the activity from a written-out enumeration. Because the shell fires `stagechange` at reset step 7 — *before* `lessonreset` — and this demo repaints a canvas from chart state, `stagechange` is treated as a chrome event only and an `onReset` hook raises a flag the handler bails on. Presentation mode scales type and enlarges the chart through `fitChart`'s presenter-aware floor, not through CSS, which the inline height would override. On phones a readable explanation and a usable chart take precedence over forcing the activity into one viewport.

Canonical notes are `src/demo-guide.html`; the shipped `presenter-guide.html` and the PDF derive from it, and `build.js --check` verifies three-way parity plus PDF freshness.

## Acceptance evidence

The node suite keeps the numerical checks (scale round trips, clamps, interpolation, scoring, monotonicity, and the falling branch on a synthetic round, since no shipped series falls), then runs the registry through the shared validator with fourteen negative controls, then asserts the claims this demo must keep making and the built file's kit contract.

Browser verification is **not waivable** and must cover: the console clean on a fresh tab with a positive control on a bait page first; **every stage asserted rendering** (`display !== 'none'` and a live `offsetParent`, not merely its tab); draw and reveal driven through the real controls; every Details section; a check card's feedback for a wrong option as well as a right one; Settings and the live integrity checks; **Reset pressed with its own control**, with a `window` sentinel and the navigation-entry count proving no reload, and with the chart and estimate surfaces inspected rather than a sentinel alone; and 320 / 390 / 1024 / 1440-plus-presentation widths with overflow measured by `scrollWidth`. Where the pane cannot be made visible, `requestAnimationFrame` does not tick; a timer stand-in may drive an rAF-gated animation, must be restored before any reset assertion, and must be stated in the evidence.

Committed source and generated surfaces must agree. Changes stay within `takeoff/**`; the root README table and launcher cards are generated from `demo.json` by `tools/build-hub.js`, and publication belongs to the coordinator.
