# Adopting the lesson shell

Read this before you retrofit a demo. `index.js`'s head comment is the
five-minute version — the file list, the markers, the build wiring. This is the
part that head comment cannot fit, and it is the part that costs time if nobody
tells you:

> **Adopting the kit is not a reskin.** You are not dropping a stylesheet on top
> of a demo that already works. You are **deleting** the demo's own dialog,
> overlay, act-navigation and reset machinery, and **rewiring** its activity to
> react to the three events the shell dispatches. The visual change is the small half.

That sentence exists because the `two-winters` lane had to infer it by reading
`ion-flight/src/app.js` line by line and noticing what it does *not* contain.
It sized the job "S" from the CSS and found an "M" underneath. Nobody should
have to discover that twice.

---

## 1. The boundary, in one sentence

**If the kit named the class, the shell owns it. Everything else is yours.**

Every disagreement below resolves to that sentence.

### The shell owns

| Thing | Where it lives |
|---|---|
| Header, brand kicker, `?`/Settings/Notes buttons, footer, credit pill | `partials.html` A0 |
| The stage tablist: click, Arrow/Home/End, roving tabindex, `#stage-N` hash, the gate clamp | `behaviourScript()` |
| Showing and hiding `section.stage` panels | `selectStage()` |
| The four dialogs — Guide, Settings, Details, Presenter Notes — with swap-not-stack, Escape, backdrop click and focus return | `behaviourScript()` |
| The Guide opening on load | `behaviourScript()` |
| Presentation mode (`body.presenter`) and the header Notes button | `setPresentation()` |
| A6 check cards: `aria-pressed`, per-option feedback, no score | `behaviourScript()` |
| **The A2 intro disclosure** — collapsible stage intro at phone width | `behaviourScript()`, §4b |
| **Reset** — in place, no reload | `resetLesson()`, §4 |
| All of the above's CSS | `tokens.css` + `shell.css` |

### The demo owns

Everything inside `.workbench` and anything else your `app.js` generates: your
engine, your data, your canvases, your controls, your per-item popovers, your
self-test. Plus your activity-only CSS in `src/styles.css`, which is injected
**after** the shell's so you can override any shell rule without `!important`.

### Which surface: the kit's navy `.workbench`, or a light panel of your own

The convention three lanes arrived at independently, now the rule:

> **Navy is the live device or instrument. Light is decisions and evidence.**

- **`.workbench` (navy)** — the thing the learner *operates*. The spectrometer,
  the game board, the ladder-logic rung editor, the canvas, the readout that
  changes when a control moves. It reads as apparatus: you are looking at a
  machine doing something.
- **A light panel — `.card`, or your own class** — what the learner *decides*,
  *records* or *reads as evidence*. Prediction capture, a verdict grid, a
  sources table, a comparison of two runs, anything the learner is reasoning
  over rather than driving.

Two consequences worth stating, because both were learned the hard way:

- The six provenance kickers and `.control-label` already have on-navy variants
  in `shell.css`, so a kicker inside `.workbench` reads correctly with no extra
  CSS. Outside it, use a light panel and the default variants.
- **Check your own text colours on navy.** `what-the-survey-missed` shipped
  navy-on-navy in `#interpretRecap b` — invisible, and no static check could see
  it. On navy, emphasis is gold (`var(--gold-lite)`), never `var(--navy)`.

A demo that is *all* navy has usually mislabelled its decision surfaces as
apparatus; a demo with no navy at all usually has an instrument it has not
committed to.

**`.workbench` and `.card` carry `margin-bottom: 18px`, for the stacked
case.** Two panels one above the other space themselves. Put them side by side
as **children of a grid with `gap`** and that margin is added *to* the gap, so
the rows come out uneven. The kit cannot see your grid (it does not know your
class names, and there is no parent selector that says "my parent lays out
with `gap`"), so this one is yours: zero it, scoped to the grid so a standalone
panel keeps the fleet spacing —

```css
.workspace-grid > .workbench, .workspace-grid > .card { margin-bottom: 0; }
```

— which is exactly what `glass-box` did. Not a kit defect to patch around; a
documented seam.

---

## 2. Converting a demo that predates the kit — what to DELETE

This is the checklist. Every line is something `ion-flight` and `two-winters`
both had before the retrofit and neither has now.

- [ ] **Your overlay/dialog system.** `open()`, `close()`, `modalStack`,
      `lockScroll`, the `.overlay`/`.sheet` divs, the Escape handler, the
      focus-return logic, the backdrop click. All of it. The shell's dialogs
      are native `<dialog>` elements and do every one of those things.
- [ ] **Your act/stage navigation.** The click handlers, the keyboard handling,
      the `aria-selected` bookkeeping, the show/hide of stage panels, any hash
      routing. `selectStage()` is the only thing that may move a stage.
- [ ] **Your `resetDemo()`.** Replaced by a `lessonreset` listener — §4.
- [ ] **Your presentation/projector toggle** and any checkbox that drove it.
      Listen for `presentationchange` instead.
- [ ] **Every CSS rule for chrome the shell now draws** — header, act nav,
      stage intro, lesson strip, eyebrow, overlay/sheet/dialog, generic button
      and focus resets. Leaving them in means two rules fighting, and the one
      that wins is the one that happens to be later.
- [ ] **Duplicate palette tokens.** If you had `--sky` and the kit has `--lite`
      at the identical value, rename your references to the kit's name. Check
      the hex is genuinely identical first; if it is not, that is a design
      decision, not a rename.
- [ ] **Your own `#details` id**, if you had one, and any other id the kit
      reserves — the list is at the top of `partials.html`. A duplicate id does
      not throw; it silently gives one of the two elements to the other. See §5.
- [ ] **Your claim on the viewport.** `body { overflow: hidden }`, `height:
      100vh` on a root element, `position: fixed` on the game container —
      anything that made the demo *be* the screen. A kit page is a document
      that scrolls: header, stage intro, activity, check card, footer. Leave
      the viewport lock in and the stage intro, the check card and the footer
      all exist and **cannot be scrolled to**; the lesson is on the page and
      unreachable, and no static check sees it (`topping-out` shipped exactly
      this before its browser pass). Every game-shaped demo has one of these.
      Delete it and let the activity size to its box — see the canvas notes
      below.

### If your activity is a canvas: it stops being fullscreen and becomes a box

A pre-kit game usually treated the window as its stage. Under the kit the
canvas lives inside a stage panel, sized by the page, and three things follow.
`fuel-golf`, `ladder-lab` and `topping-out` all converged on the same shape
independently, so treat it as the shape rather than one lane's taste:

- **Read the canvas's box, not the window.** `grep` your source for
  `window.innerWidth`, `window.innerHeight` and raw `e.clientX` / `e.clientY`;
  every hit is a fullscreen assumption. Size from `canvas.getBoundingClientRect()`
  (or the host's), and turn pointer coordinates into canvas space by
  subtracting that rect and scaling by `canvas.width / rect.width`. A window
  `resize` listener is not enough, because **the box changes when the window
  does not**: a stage switch, presentation mode, a breakpoint crossing, the
  intro disclosure opening. Use **one `ResizeObserver`** on the host and let it
  be the only thing that resizes the canvas.
- **One activity, relocated between stage hosts — never one canvas per
  stage.** If stages 1–3 all show the same device, keep a single canvas and
  move it (`host.append(canvas)`) in your `stagechange` handler. Three canvases
  mean three contexts, three sets of listeners and three copies of the state to
  keep in step, and Reset has to rewind all of them (§4 enumeration item 6
  exists because of this).
- **Guard `draw()` on a zero-size box.** A canvas inside a hidden stage panel,
  or inside a closed disclosure, measures `0×0`. Drawing into it throws in some
  paths and silently paints nothing in others; either way a frame loop that
  runs while the stage is hidden burns work for a box nobody sees. Return early
  when `rect.width === 0`.
- **`min-height` plus `aspect-ratio` drives the *used width*, and it will
  overflow a narrow breakpoint.** A box with `aspect-ratio: 16 / 9; min-height:
  360px` is 640px wide before any `width` rule is consulted, so at 390px it
  runs off the right edge of the page — and every static check passes, because
  nothing in the markup is wrong. Clamp with `max-width: 100%` (and let
  `min-height` go if it fights). How to *measure* it is in §6.

> ### ⚠ The `.hidden` trap — read this before you delete a stylesheet
>
> Deleting your chrome stylesheet **also deletes your `.hidden` rule**, and the
> kit's `[hidden] { display: none !important }` backs the **attribute**, not the
> class. If your JS keeps calling `classList.add('hidden')`, every panel it
> controls silently renders **stacked** — and `build.js --check`, `check-shell`
> and `build-hub --check` all stay green, because your markup and your contract
> are both still correct. It shows up only in a browser, under a per-panel
> render assertion (`checkVisibility()`, §6). `should-have-known-that` shipped
> straight into it mid-build (setup / turn / play panels stacked).
>
> **Since v3 the kit ships `.hidden { display: none !important }` itself**, so a
> retrofit onto v3 or later cannot hit this. Two things still apply:
>
> - **`.hidden` is now a reserved kit class.** If your `.hidden` means anything
>   other than `display: none`, rename it — the shell's `!important` wins and
>   your version would fail silently. `check-shell.js` fails a build that
>   redefines it, so this is caught rather than discovered in a room.
> - **Prefer the `hidden` attribute in new code.** `el.hidden = true` is the
>   platform's, carries the right semantics to assistive technology, and is
>   already covered. The class exists to rescue demos that predate this rule,
>   not as the recommended spelling.
>
> Retrofitting onto a kit **older than v3**? Either keep the one rule when you
> delete the stylesheet, or convert the JS to the attribute.
>
> **When you audit for it, tell the class apart from the property.** A grep
> for `\.hidden\b` matches `node.hidden`, `if (row.hidden)` and
> `rows.hidden.at(-1)` — JavaScript property access, which was always fine —
> as readily as `classList.add('hidden')` or a `.hidden {` CSS rule. Counted
> that way, one demo reported 56 "sites" and had **zero** class-form uses;
> another was told it had 6 and had none. Count the class form
> (`classList.*('hidden')`, `class="… hidden …"`, `.hidden {` in a stylesheet)
> and the attribute form separately, and only the first is exposed to this
> trap. Three lanes were sent chasing a problem they did not have on a count
> that conflated the two.

### What to KEEP, and not get talked out of

Your activity's mechanism. The retrofit is a format pass: the physics, the
fixtures, the scoring, the drawing code should come out byte-identical unless a
defect was found in them. If a stage's node suite changes, be able to say why.

Your per-item drill-downs, if you have them. They are part of the activity, not
a duplicate of the shell's Details drawer. Give yours a distinct id and say so
in a comment — `two-winters/src/app.js` is the worked example.

---

## 3. The three events

The shell talks to the demo through exactly three events on `document` —
**`stagechange`**, **`lessonreset`** and **`presentationchange`**. There is no
other coupling and no configuration object. (Earlier editions of this file
said "two" and left the third to the delete-checklist in §2; `glass-box`
counted.)

### `stagechange` — a tab was selected

```js
document.addEventListener('stagechange', e => {
  const i = e.detail.index;          // 0-based
  // build or refresh whatever stage i shows; cancel anything in flight
});
```

Fires on click, on keyboard navigation, on a `#stage-N` hash at load, on your
own `window.lessonShell.selectStage(n)`, and once during a reset. It fires even
when the index did not change, so handle the no-op case.

Your `app.js` does **not** show or hide the panel — the shell already did. Your
handler exists to do the work the shell cannot: lazily build a canvas, re-run a
layout measurement, cancel an animation that belongs to the stage being left.

### Gating a stage: two mechanisms, for two different reasons

A demo sometimes needs the learner to have done something before the next
stage is useful. There are two ways to say so, and they are not
interchangeable — pick by *why* the gate exists (`fuel-golf` worked both out
and used both):

| | **Tab gate** | **Evidence gate** |
|---|---|---|
| Use when | the next stage **makes no sense** without the previous result — there is no week to run without a schedule, no orbit to compare without a first burn | the **prediction is the point**: the stage exists so the learner commits before seeing the evidence |
| Mechanism | `disabled` on the stage tab **in the template markup**; your `app.js` removes it when the prerequisite lands | the tab stays live; the stage renders its intro and prediction capture, and **withholds the activity** (the plot, the reveal, the Run button) until a prediction is recorded |
| What Reset does | the shell's pre-`app.js` snapshot re-locks it (§4 step 3) — for free, *because* it was authored in markup | your `lessonreset` handler hides the activity again and clears the captured prediction |
| What the learner sees | a tab they cannot select yet, with a `title` saying why | a stage they can visit, read and predict on, that has not shown its hand |

**A gate consults the persisted evidence it guards, and re-arms only on
Reset.** (Operator directive on replayability, from `R-fuel-golf`.) Derive
`gated` from what the learner has actually done — the completion record, the
saved run, the captured prediction — not from in-memory state alone. A gate
that re-arms on every page load protects the *tenth* encounter as though it
were the first: `fuel-golf`'s stage 2 evidence gate re-armed on reload even
though the completion badge on screen proved the level was escaped, and while
re-gated, picking the level ran it in the hidden host at 0 px. A gate protects
the first encounter; the second time through, the evidence is already there
and the gate should read it. Reset clears the progress it reads, and so
legitimately re-arms it — that is the one path back to gated, and it is the
learner's own choice. At least five demos gate, so this is the fleet's shape,
not one demo's.

A tab gate applied only at runtime (`tab.disabled = true` in `app.js`, nothing
in the markup) comes back **unlocked** after Reset, because the snapshot was
taken before your script ran. An evidence gate implemented as a tab gate makes
the learner unable to *reach* the question they are meant to predict on, which
defeats the predict-then-observe method the template is built around. Neither
mistake is visible to a static check.

### `lessonreset` — put your activity back

Required. §4.

### `presentationchange` — the projector toggle moved

```js
document.addEventListener('presentationchange', e => {
  const on = e.detail.on;            // true when body.presenter was just applied
  // re-measure a canvas, switch to your big-UI variant, nothing else
});
```

Fires from the header Notes button and the Settings toggle, and once at load
(the init call runs before your script, so if you need the initial state read
`document.body.classList.contains('presenter')` directly). The shell has
already toggled `body.presenter`, resized its own type scale and, since v3,
held the phone intro disclosure open; your handler is for the things only you
can do — a canvas that must re-measure its box, a control set that has a
projector layout. Reset does **not** touch presentation mode (§4), so do not
undo it from `lessonreset`.

---

## 4. The reset contract

**Reset is in place. No page reload.** (Operator ruling, 2026-09-16. Kit v1
reloaded the page; v2 does not.)

A reload was trivially correct — it threw the document away, so every variable
came back at its initial value for free. In-place buys a demo that does not
blank-flash on a projector mid-session and does not re-run every boot path, and
the price is that correctness is now something you have to actually do.

### What the shell guarantees

In this order, when `#reset-btn` is pressed:

1. **`onReset()` is consulted.** Returning `false` **cancels the entire reset** —
   nothing below runs. This is the veto path.
2. **Every open `<dialog>` closes** — not only the shell's four. Yours too.
3. **Every stage tab returns to its first-load chrome** from a snapshot taken
   before your `app.js` ran: `disabled` (so a gate re-locks), class (so
   `complete` marks clear), `title`, and the `.stage-mark` glyph.
   **Author your gate in the template markup** (`disabled` on the tab), not
   only in `app.js` — the snapshot is taken before your script runs, so a
   gate applied solely at runtime would come back *unlocked* after Reset.
4. **Every A6 check card** drops its `aria-pressed` answer and clears its
   feedback line.
5. **Every A2 `.echo` and A4 `.obs-cue`** returns to its snapshotted first-load
   content.
6. **The A5 Details drawer** goes back to stage 1, subtitle restored.
7. **`selectStage(0)`** — stage 1. This also fires `stagechange`.
   **Ordering hazard**: this `stagechange` fires *before* step 9, so a
   `stagechange` handler that renders from your activity state will render
   the *pre-reset* state into freshly reset chrome (missing-time hit exactly
   this: a stale Predict echo resurrected mid-reset). Do not render activity
   state from `stagechange`; render it from your interaction handlers and
   from your `lessonreset` handler. If you must, guard on
   **`window.lessonShell.resetting`** — provided since v3:

   ```js
   document.addEventListener('stagechange', e => {
     if (window.lessonShell.resetting) return;   // chrome only, mid-reset
     render(e.detail.index);
   });
   ```

   `resetting` is `true` from before step 1 until after step 9 has dispatched,
   and `try/finally` keeps it honest through an `onReset` veto or a throwing
   listener. **Do not write that guard into your `lessonreset` handler.** The
   flag is still true while step 9 runs, by design: your handler restores state
   and re-renders by calling your own render directly, which the guard above
   does not touch. Guarding `lessonreset` would suppress the very render the
   reset exists to perform.

   **Why the order was not simply reversed** (asked at every unfreeze): this
   file and `index.js` both guarantee that `lessonreset` fires *last*, so the
   demo has the final word over any node both touch. Every merged demo is
   written against that guarantee. Reversing would also swap a known hazard for
   a new one — your `lessonreset` handler would run *before* step 3 restored
   the tab chrome, so a handler reading tab state would read the post-session
   gates. The flag fixes the move-the-instrument pattern without moving anyone
   else's ground.
7b. **The A2 intro disclosure returns to its default for the current width**
   (v3) — recomputed, not restored from the load-time snapshot, so a rotation
   between load and Reset cannot leave it half-open.
8. **The page scrolls to the top.**
9. **`lessonreset` is dispatched.**

### What the shell deliberately does not touch

- **Presentation mode.** A presenter resets between rooms; re-shrinking the
  projector each time would be hostile. CONTRACT.md says the same.
- **The Guide.** It does not reopen. A reset is not a fresh arrival — the person
  who pressed it has already read the Guide.
- **Your activity.** The shell cannot know what it holds. Step 9 is for that.

### What Reset is not for: data that outlives the session

**Reset restores the lesson's own state.** Data that outlives the session and
was not created by it — saved records, a class leaderboard, other people's
results — is **out of scope**, and stays where it is. (Operator ruling,
2026-09-16, on `fuel-golf`, whose pre-kit `resetDemo()` wiped the leaderboards
behind a two-step confirm.)

The reason is the shape of the control. A8's "fresh-load demo state" was
written about answers, echoes and a canvas — things one learner made in the
last ten minutes and can make again. The kit's Reset is **one unconfirmed
click**. Pointing it at a store that holds another class period's scores turns
a "start this exercise over" affordance into an unrecoverable delete, and a
learner who pressed it to clear their own answers gets no warning. Persisted
third-party data is not "demo state" in A8's sense.

Two conditions, so the divergence is visible rather than silent:

- **Say so where the learner meets the control.** The Reset affordance, or the
  Settings menu it lives in, or the Guide, states that Reset does not clear
  the leaderboard (or whatever the store is). A learner should not have to
  press it to find out.
- **Keep your own confirmed clear.** If the demo had a two-step "clear all
  scores", it keeps it — as its own control, with its own confirmation, not
  folded into Reset and not removed because Reset exists.

A demo that has no such store has nothing to do here. A demo that does and is
unsure which side of the line a given value falls on: ask, in the progress file,
rather than deciding by default in either direction.

### What you must implement

```js
document.addEventListener('lessonreset', () => {
  // 1. every variable your module closes over, back to its initial value
  // 2. every node your app.js generated, back to its first-load content
  //    (including any `dataset.built` guard you use to build a stage once)
  // 3. re-render stage 1
});
```

It fires **last**, after the shell has finished, so you have the final word over
any node you both touch. It is **not cancelable** — the veto lives in
`onReset()`, so there is exactly one place to refuse a reset.

### How to get this right, rather than approximately right

Write the enumeration down before you write the handler. A reload was correct by
construction; in-place is correct only if the list is complete, and the failure
mode is quiet — a stale answer, a `<details>` still open, a counter that did not
go back — which no build check and no node suite can see.

Enumerate, in this order:

1. **Every property of your state object.** Not "reset the state object" — walk
   the properties. One of them is usually a cached sub-object (a timeline, a
   chart) that must be *rewound* rather than *dropped*, because dropping it and
   rebuilding would double-bind its event listeners.
2. **Every `hidden` you toggle**, every class you add, every `style.width` you
   set, every `dataset.*` flag you use as a build-once guard.
3. **Every node you filled with `innerHTML`** that starts empty in the template.
4. **Every form control** — a slider keeps its value; the template's `value="…"`
   attribute does not reassert itself.
5. **Every `<details>` element you generated.** Open ones stay open.
6. **Anything you appended to the DOM in a place the shell does not manage**,
   including an element you *moved* between hosts.

Then verify it in a browser, with a control: change state, press Reset, and
assert both that the state is back *and* that no navigation happened — a
sentinel on `window` set before Reset must still be there afterwards. If the
sentinel is gone, something reloaded and you have proved nothing about your
handler.

### If in-place is wrong for your demo

It is a legitimate finding, not a failure. If your activity holds state that
genuinely cannot be restored without a reload — a third-party widget with no
teardown, a WebGL context you cannot re-initialise — **say so and escalate**
rather than shipping a handler that half-works. A reset that silently leaves
one thing behind is worse than a reload, because nobody can see it.

### Taking the whole reset over

If you need to, veto and do it yourself:

```js
window.lessonShell.onReset = () => { myOwnRewind(); return false; };
```

`check-shell.js` accepts that as implementing the contract. It does **not**
accept `window.lessonShell.onReset = null`, which is what a demo that has not
implemented the contract leaves behind.

---

## 4b. The A2 intro disclosure — collapsible stage intro at phone width

**Operator ruling, 2026-09-16: "collapsible intro at phone width."** New in v3.
**You do not have to do anything to get this**, and there is nothing to copy
into your template — but read what it assumes, because two of the assumptions
are things your markup can break.

### What it does

At **≤480px**, and not in presentation mode, the shell wraps your stage's
`.lesson-strip` in a native `<details class="intro-more">` and **closes it**.
Collapsed, the learner sees the eyebrow, the stage title, the stage question,
the **Details** pill and a summary line reading
*Before you start · Predict · Try · Takeaway*. The prerequisite `.refresh` is
hidden by a CSS `:has()` rule at the same time.

Above 480px, and in presentation mode at any width, the summary is
`display: none` and the element is held open — so **desktop and the projector
are exactly as they were in v2**, same geometry, no toggle, nothing extra in
the accessibility tree.

### Why it exists, in numbers

At 320px the full intro measured **726–775px against a 568–578px viewport** —
more than one whole screen before the activity starts. That put
`zero-to-unbeatable`'s Train button **1979px** down and `ion-flight`'s Run
button **2327px** down, 4.1 screens. Both shapes, so it is the template's cost,
not one demo's.

**Be honest about what this does not fix.** On `ion-flight` the intro is only
31% of that distance; 55% is the demo's own pre-control content, and for a demo
that captures a prediction before its Run button that content is *required* to
be there. Collapsing the intro buys you the first screen, not the button.

### What your markup must not do

- **Do not hide `.stage-question` at phone width.** `check-shell.js` fails a
  built file whose `max-width: 480px` block hides it. Collapsing the one line
  that orients the learner defeats the point of collapsing at all.
- **Keep `.stage-intro` labelled by its `h2`.** `aria-labelledby="stage-N-title"`
  is why the `h2` stays visible rather than going behind the toggle; if you
  point it somewhere else, you lose that reason and probably the accessible
  name too.
- **Write your prediction echo into `.echo` inside the strip, as A2 says.** The
  shell watches the disclosure and re-opens it if an `.echo` gains content while
  collapsed — feedback the learner cannot see would break the predict-then-
  observe loop. An echo you render somewhere else does not get that.

### If your demo genuinely should not collapse

Override it in your own CSS — yours lands after the shell's:

```css
@media (max-width: 480px) { .intro-more > summary { display: none; } }
```

…and say why in a comment. The element is held open whenever the summary is
hidden, so this is safe; it is not a way to hide content.

---

## 4c. A6 check-card feedback: the lead is yours, not the kit's

The shared handler writes **a bold lead, then your `data-feedback`**. Since v3
the lead comes from the card:

```html
<section class="check" data-correct-lead="Supported." data-wrong-lead="Not what the detector showed.">
```

Defaults are demo-neutral — **`Correct.`** and **`Not quite.`** Set your own
when your demo has a better word for it (`Supported.` / `Not what the detector
showed.` is `ion-flight`'s evidence framing, and it should set them explicitly).

**Why this is a documented contract and not an implementation detail**: v2
hardcoded `"Not what the detector showed."` into the *shared* handler, and it
rendered in **all eight** built demos — so a learner working through PLC ladder
logic, AI winters or wavelet compression was told what "the detector" showed.
It survived two pilots and four builds because nothing looked for it.
`check-shell.js` now blocklists that sentence and requires the handler to read a
per-card lead, so the same class of leak fails a build rather than shipping.

The lead is set as **text**, not markup. `data-feedback` still accepts inline
markup, as it always has.

---

## 5. Two things that will bite you

### `#details` is the kit's, not yours

The shell's per-stage Details drawer is `#details`. That is also the most
natural id for a demo's own per-item drill-down, and both are called "Details"
on screen. They are different mechanisms:

| | Kit's `#details` (A5) | Your per-item popover (A3) |
|---|---|---|
| Scope | the whole stage | one event, cell or row |
| Content | fixed five sections: what is live, how it works, assumptions, sources, boundary | whatever that item says |
| Opened by | `.details-trigger` in the stage intro | a control inside your activity |
| Owned by | the shell | you |

Do not fold them together. Name yours something else — `#item-details` — and
give its trigger an `aria-label` that names the item. `check-shell.js` fails a
built file that defines any id twice, so a collision fails the build, but the
design decision is yours to get right before it gets there. The reserved list is
at the top of `partials.html`.

### `assertNoExternalRefs`'s allow-list is narrower than it looks

Only `script`, `link`, `img`, `iframe`, `source`, `video`, `audio`, `embed` and
`object` are scanned. **`<a>` is not**, and never has been. Your Details
drawer's Sources list — a screenful of `<a href="https://…">` — is invisible to
this check and needs no entry in `allow`. The allow-list is for a *same-folder
file referenced by one of the scanned tags*, which in practice means the single
entry `'demo-guide.html'`. If you are adding a URL to it, stop and re-read what
you are doing.

---

## 5b. Absence claims in learner copy: say what you checked, not what does not exist

**A demo may not assert that a capability does not exist. It may state what it
checked, where, and when.** (Fleet rule, 2026-09-16, after the third instance.)

A negative claim is cheap to write, expensive to verify, and nothing in the
build, the contract or the checks distinguishes *we did not find it* from *it
does not exist*. `front-doors` shipped "One row is uneven, and it **stays**
uneven" — a prediction wearing a fact's clothes — about a competitor's product
line, and it was false against four months of public documentation on a host
the demo already cited. Two more failures of the same shape happened in review
prose in the same program.

The fix is a form of words, and it is also the better lesson:

| Do not write | Write |
|---|---|
| Google has no consumer-plan peer at door 3. | No consumer-plan peer at door 3 was found on `support.google.com` or `one.google.com`, checked 16 September 2026. |
| No version of this door works on your question overnight. | Neither vendor page describes an unattended overnight run (checked `<host>`, `<date>`). |
| The word appears nowhere in the catalogue. | The word did not appear in the catalogue page fetched on `<date>` (search + a positive control on a word that is there). |

The scoped form is *checkable* — a reader can repeat it — and it teaches the
habit the fleet exists to teach. It also survives the product changing, which
the bare negative does not.

**Why this is a rule and not a check.** A lint for absolute-negative wording was
prototyped and measured against every built demo (`check-shell.js` head comment
records the numbers). The same words carry the demo's legitimate negatives —
"this page runs no model and makes no network request", "there is no combined
score", "a future cannot" — and what separates those from a world-capability
claim is *whose* capability the sentence is about, which a regex cannot read.
It would have warned 183 times on a compliant fleet. So this is the L1
reviewer's lens: read the copy for negatives, and for each one ask *checked
where, when?* — and if the answer is not on the page, it goes on the page or the
sentence goes.

---

## 6. Before you call it done

```
node build.js && node tools/pdf.mjs && node build.js --check
node <your node suites>
node ../tools/lesson-shell/check-shell.js <slug>
node ../tools/lesson-shell/check-shell.js --self-test
node ../tools/build-hub.js --check
```

**Then count your `</script>` closers**, before you trust any of the green
above. A build step that escapes `</script>` document-wide — to embed the guide,
or a JSON blob, or anything with a closing tag in it — can eat the template's
*own* closers and ship a page that runs **no JavaScript at all**, with an
**empty console**, because nothing ever executed to complain. `build --check`,
the engine suites, `check-shell` and `build-hub --check` all stay green: the
markup is well-formed, the strings are all present, the stamp matches.
`topping-out` shipped this. Assert the count you expect
(`grep -o '</script>' index.html | wc -l`), write the expected number down, and
re-assert it after every rebuild — a rebuild against a new kit version must not
change it.

And the browser pass, which is **not waivable** and is the only thing here that
can see a runtime DOM failure. Both defects the kit has shipped so far — a
`HierarchyRequestError` that killed every render, and stage panels pinned shut
by a `hidden` attribute `selectStage` did not clear — passed every command in
that list.

The browser pass must, at minimum:

- serve over a **local static server**. `file://` does not permit interaction in
  this environment;
- prove the console reader is live on a bait page **first**, then show the demo's
  console clean on a **fresh tab — not a reload**. The reader's buffer is
  per-tab and **survives navigation**, so a reload after a bait page, or after
  an earlier broken build, reports the old entries as if they were this load's.
  Open a new tab for the clean capture. Then emit a positive control (a
  `console.error` of your own) **after** the clean capture, in the same tab, and
  show it arrives — proving the reader was live *for that tab* rather than
  quietly detached. A control fired before the capture proves nothing about the
  capture;
- **visit every stage and assert each panel actually renders**, with
  **`element.checkVisibility()`** as the primary probe. Tab state is not panel
  state: a tab can report `aria-selected="true"` over a panel that is not on
  the screen, which is exactly how the `hidden` defect shipped. If a stage is
  gated, drive the real interaction to open the gate.

  `checkVisibility()` and not `display` / `offsetParent`, because **since v3
  every demo has a `<details>` in every stage** (§4b), and inside a closed
  `<details>` an element reports `display: grid`, a live `offsetParent` and a
  non-zero bounding rect while being genuinely unrendered. K3 measured it on
  the lesson strip: 377px wide, `offsetParent` = `BODY`, not on screen. Only
  `checkVisibility()` returns `false` there. `display !== 'none'` plus a live
  `offsetParent` is still a fine *secondary* signal for stage panels, which are
  not inside a disclosure — but the primary assertion is `checkVisibility()`,
  and for anything inside the intro (the strip, the echo, the refresh line) it
  is the only one that is not a false positive;
- **measure overflow at exact widths through a same-origin `<iframe>`**, not by
  resizing the pane. The browser pane emulates a viewport by *scaling* its own
  frame, so a "390px" pane may be rendering at 400 and rounding — a layout that
  overflows by six pixels passes. Load the built page in an iframe sized to
  exactly `390×844` (and `320×568`, `1024×768`, `1440×900`) on a scratch page
  served from the same origin, and read `scrollWidth > clientWidth` and each
  suspect box's `getBoundingClientRect().right` inside it. That is how the
  `aspect-ratio` overflow in §2 is caught; it is invisible any other way;
- exercise **Reset with its control**, per §4 — sentinel on `window`, navigation
  entries `1 → 1`, and at phone width the intro disclosure back to collapsed;
- **when a source check comes up empty, try the other reader before you write
  the null.** `get_page_text` silently omits collapsed accordion content
  (`R-front-doors` nearly shipped a fabricated stale-citation finding on it);
  `find` false-nulled on an arXiv page where `get_page_text` had the text
  (`glass-box`). The two fail in opposite directions. **Neither reader alone
  supports an absence claim** — a null from one is a prompt to run the other,
  with a positive control on a string you know is on the page, and only a null
  from both, controlled, is worth writing down (and then in the §5b form:
  what you checked, where, when).

## 7. Rebuilding after a kit change

The stamp carries the kit version **and** a hash of the kit's CSS, and
`check-shell.js` compares both. Change the kit and every demo built against the
old one goes red until it is rebuilt. That is the back-propagation guarantee
working, not a bug — but it means a kit change during a batch invalidates every
demo in that batch, which is why the kit freezes before the batches start.

A behaviour-only change (like v1 → v2) leaves the CSS hash identical. That is
precisely why `VERSION` exists alongside the hash: bump it, or the change is
invisible to every check.
