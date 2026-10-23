# The Pace of AI Progress

An offline classroom activity for reading AI evidence: estimate where five widely cited benchmark series went, see why the tests keep being replaced, read real achievements by who checked them, and test what two points can tell you about next year. Demo 3 of 17, Part two of *AI: From Zero to Takeoff*. The public folder remains `takeoff/`.

Built on the shared lesson shell at `../tools/lesson-shell` (build-time only — the shipped `index.html` is still one self-contained file). Bryant Harrison · Murray State University.

## Two measures, two grammars, never one scale

The demo carries two kinds of evidence and deliberately refuses to plot them together:

- A **benchmark** value is a *measurement under conditions*. Every point carries the harness, the effort setting and the eval set on the face of the chart, and every series shows where its published record stops.
- An **achievement** is an *event* whose truth is settled by human institutions over months or years. Every card carries an **acceptance status** — a rung of the ladder from Nobel Prize down to retracted — and the **AI's role**: a tool people used, a result the system generated and people verified, or a result produced autonomously under stated rules.

## Run and present

Open `index.html` directly in a browser. No server, network connection, dependency download, AI inference, or storage is needed at runtime. The Guide opens on load and reopens from `?`. Settings contains Open Presenter Notes, Presentation mode, Reset, and the data integrity checks.

1. **Measure** — draw where each of five series went, then reveal the published points with their conditions. Drag on the chart, or focus it and press Up/Down. The reveal reports the published value and the ratio as observations, then names *what would have broken the line*.
2. **Retire** — four benchmark families, generation by generation, with the route by which each retired one stopped measuring what it was meant to: beaten, bad tasks, contamination, or coverage.
3. **Achieve** — fourteen real 2023–2026 events, filterable by acceptance rung and by the AI's role. Every rung from Nobel Prize to retracted has a real occupant.
4. **Forecast** — three rules that fit the same two invented points and diverge by a factor of ten, then the boundary the same sources report.

About 22–28 minutes for all four stages; a ten-minute cut is in [the printable guide](presenter-guide.html). The [PDF](Takeoff-Presenter-Guide.pdf) and the in-app notes both derive from `src/demo-guide.html`.

## What the evidence says

Every source was opened on the snapshot date in `src/data.js` (`SNAPSHOT`), and each source records **how** it was read — fetched, rendered in a browser, or downloaded as a dataset — because two of the leaderboards serve no data to a plain fetch and one host refuses automated fetch entirely. These are selected reports, not a census, a live leaderboard, or a common-budget comparison.

| Series | What is plotted | Main boundary |
|---|---|---|
| GDPval (win-or-tie) | 12.3% → 70.9% on 1,320 real work deliverables across 44 occupations, graded blind by professionals from the same occupations | Vendor-built evaluation; one-shot; excludes the oversight and iteration real work needs. Scores republished by Epoch AI. |
| METR 50% time horizon | 3.5 min → 320 min, with 95% intervals, same methodology at both ends | A fitted 50%-success threshold, not AI runtime and not reliable completion. The non-robust June 2026 estimate is excluded and named in Details. |
| FrontierMath Tier 4 (v2) | 0% → 97.6% on 43 problems Epoch says take a researcher days | Epoch discloses that OpenAI funded the benchmark and holds exclusive access to a subset. v2 corrected errors in 42% of problems; v1 scores are not comparable. |
| ARC-AGI-2 | 6.5% → 95.0% on a test published as "Scale is Not Enough" with an 85% target | Effort settings differ per point and are in each label. ARC-AGI-3 reports RHAE, not puzzles solved, and is shown as a separate comparison. |
| Terminal-Bench 2.0 | 32.6% → 64.7% with the harness held at Terminus 2 | Dates are model release dates. Other harnesses score the same model up to 18 points higher — the next panel shows that grid. |

The achievements track runs from the 2024 Nobel Prize in Chemistry down to a retracted claim, and includes the counter-evidence on purpose: METR's randomised trial found experienced developers **19% slower** with early-2025 tools. The September 2026 Navier–Stokes result is on the **announced, contested** rung — a real, checkable advance on one of the four statements Clay accepts, with AI closing a gap inside a human strategy, not peer-reviewed, not recognised by Clay, no prize possible before 2028 under Clay's own two-year rule, and under an unresolved priority dispute. "AI solved a Millennium Prize Problem" is the wrong sentence and the page says so.

The forecast scenario is **invented**. At years `t` after the second point its rules are `30 + 10t`, `30 * 1.5^t`, and `75 - 45 * (9/11)^t`; all equal 20 at `t=-1` and 30 at `t=0`. Values above the toy score's ceiling of 100 stay visible and are labelled invalid for that scale.

## Modify and verify

Use Node.js for the build and checks, from this folder:

```sh
node build.js
node src/playtest.test.js
node tools/pdf.mjs
node build.js --check
node ../tools/lesson-shell/check-shell.js takeoff
node ../tools/build-hub.js --check
```

`tools/integration.mjs` needs Playwright plus Chrome/Chromium and is a development tool only; `CHROME_PATH` selects the browser. The PDF renderer also works with a system Chrome or Edge without Playwright.

- `src/data.js` — the evidence registry: five series, four benchmark families, the acceptance ladder, fourteen achievements, the boundary lines, and the source table with fetch dates and methods.
- `src/engine.js` — scales, interpolation, scoring and the illustrative rules. It carries no trend-fitting helper on purpose: a least-squares doubling fit is this demo's own anti-pattern.
- `src/validation.js` — the structural checks shared by Node and Settings. They enforce that every point has its conditions, every series names where it stops, every label word is from a closed vocabulary and every ladder rung is occupied. They cannot establish that a source's claim is true.
- `src/chart.js` — the estimate canvas, including the series-boundary marker (the hatched unplotted stretch, the dashed rule and the end note).
- `src/app.js` — the four stages, the Details drawer content, the in-place reset handler, and the live integrity checks.
- `src/template.html` / `src/styles.css` — the page on the lesson shell, and the activity-only styles.
- `src/demo-guide.html` — canonical presenter notes and printable guide, single-sourced to three surfaces.
- `build.js` — the self-contained build, shell and guide injection, and the parity checks.

Rebuild after any change, and re-render the PDF whenever the guide changes. The suite is 242 checks: the numerical regressions (scale round trips, clamps, interpolation, scoring, the falling branch on a synthetic round), then the registry through the shared validator with **fourteen negative controls** — a dangling source, a point with no conditions note, a series with no end note, an off-vocabulary acceptance status, route, role or generation status, an unoccupied ladder rung, the counter-evidence card dropped, Navier–Stokes promoted off the contested rung, a stale source date, an orphan source — then the built file and the kit contract.

## Content decisions

This rebuild replaced a benchmark set the accuracy audit found "accurate but narrow and boundary-blind", and removed the Act II release timeline: it served neither of the demo's two measures, its region filter implied a global catalog it did not have (three of five filter buttons returned an empty state), and its unlock list was dead. Four code defects were fixed in the same pass — `setAxisEnd` was never called, so the "series stops here" marker had never rendered at any ordinary width; the y-axis label "Bugs actually fixed" turned a test-pass rate into work performed; a `mittr-metr` source key was silently dropped; and the `verdict` vocabulary was unvalidated, so a typo could have relabelled a sourced *Nature* paper as "Claim exceeds evidence".

Two citations were corrected: GenCast's label now carries its issued citation (*Nature* **637**, 84–90, 2025, not "December 2024"), and the GPT-4o GPQA figure is shown as **50.6%** with OpenAI's o1-post table as its source *and* the 53.6% from OpenAI's own May 2024 launch chart named beside it — two runs, two pages, one vendor, neither silently chosen.

The scoring loop no longer rewards bold extrapolation. It reports the gap as an observation, drops the praise for a lucky guess, and names what would have broken the line, because the lesson the demo actually wants is that a gap in published history can be estimated and a future cannot.
