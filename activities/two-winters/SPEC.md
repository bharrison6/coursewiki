# AI Winters: Boom and Bust — teaching specification

## Learning outcome

Students distinguish a time-bounded forecast from a contemporary assessment,
then judge a historical analogy claim-by-claim rather than treating either AI
winter as a deterministic template for the present.

## Experience

1. **Date and classify.** Learners date ten sourced claims. They score forecasts
   only when the claim supplies an outcome and a time horizon. They classify three
   assessments as evidence about their own moment.
2. **Compare events.** A scrubbed timeline groups evidence under five lenses:
   claims and ambitions, institutional bets, constraints, reassessment, and
   withdrawal. The lenses are comparison tools, not ordered stages.
3. **Inspect causal differences.** A three-column comparison shows how the two
   contractions involved different technical, institutional, and market causes.
   Current uncertainty is explicit.
4. **Make a bounded analogy.** Learners weigh what rhymes with the past against
   what is materially different, then ask what evidence would change a conclusion.

## Historical guardrails

- A later result cannot turn a bounded assessment into a failed forecast.
- The first and second winters are conventional date ranges with documented
  uncertainty, not a single homogeneous event.
- Present-day entries do not amount to a predicted third winter.
- Current company statements are dated and labelled as company-reported; they
  are not presented as independent measures of profit or capability.

## Interaction and delivery

The app is a self-contained offline page. Guide opens on entry and reopens from
`?`. Settings exposes Presenter Notes, Presentation mode, and Reset. The
canonical printable guide is injected into the app at build time, then rendered
to PDF. Keyboard-visible focus and labelled source controls keep evidence links
legible on the navy interface and usable on touch and keyboard.

## Verification

`node src/playtest.test.js` checks data, scoring, source coverage, dates, and
the anti-cycle guardrails. `node build.js --check` verifies the built page and
canonical guide. `node src/contract.test.js` checks contract UX and offline
resource loading. `node tools/pdf.mjs` regenerates the printable guide.

## Classroom interface

Cream teaching pages use navy workbenches and gold selected-state accents. The claim
round pairs the quotation with year and classification controls. History pairs its
canvas and slider with a selected-event card. Compare renders one selected lens and
three era cards; their labelled Details buttons open full explanations and sources in
a right-side dialog. Today starts its supporting statements and source lists collapsed.
Dialogs trap keyboard focus, make the background inert, close on Escape and restore
focus to the initiating control. Reset restores the first lens and closes disclosures
while preserving Presentation mode. Source links name the referenced document.

`node tools/ui.test.cjs` checks these interactions across desktop and phone widths.
