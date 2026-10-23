# AI Tool Guide — what to ask it with

A phone-first, single-file, offline teaching module about the **surfaces** through which a
person can use AI, and why the surface decides what the tool can actually reach.

It was called **Front Doors** while it was being built. The display title is now *AI Tool
Guide*; the folder, the guide filenames and the public URL keep the old name, and the four
surfaces are still "the four doors" throughout, because that is what the module actually
argues about.

Built for **"AI: From Zero to Takeoff"** (Bryant Harrison, Murray State University), part
three. It runs immediately after **The Stranger**: that module taught the room that *how you
ask* changes what you get, and this one supplies the missing half — a perfectly phrased
request to a browser tab still cannot rename a file on your laptop.

Product claims were checked on **2026-09-16** against first-party sources. That date is
stamped on the page, in the footer, and in the presenter guide, because this is the
fastest-rotting content in the collection and the module is built to say so rather than
pretend otherwise. Retrofitted onto the fleet's shared `lesson-shell` (v2): three **stages**
where the module used to have three acts (The four doors, Pick a job, The receipts), with a
captured prediction at the top of each one.

---

## The argument

> The surface you use decides what the tool can reach — and the further it reaches, the more
> of its work you have to check.

The first half is intuitive. The second is not, and it is the half the module exists for.
Every verdict on the page traces to one of **4 axes**:

1. **Can it see your work?** Nothing but what you hand it, versus your files and connected
   apps, versus a whole project tree.
2. **Can it do things?** Text back into the conversation, versus editing the open document in
   place, versus running commands on your machine.
3. **Does it keep going when you are not watching?** One reply per run (even on a timer),
   versus unattended multi-step work on a schedule or a trigger.
4. **How much must you check?** The cost nobody quotes.

And **4 doors**, deliberately ordered as a ladder of reach:

| # | Door | Products on the check date | Getting in |
|---|------|----------------------------|------------|
| 1 | A chat window | ChatGPT (Chat), Claude, the Gemini app | Free tier on all three |
| 2 | Inside the tools you already have | Docs, Sheets, Slides (Google); Word, Excel, PowerPoint (Microsoft) | Institutional licence |
| 3 | A desktop coworker | Claude Cowork, ChatGPT Work, Gemini Spark | Paid plan |
| 4 | A coding agent | Codex, Claude Code, Antigravity | Two paid, one free tier |

4 doors against 4 axes is **16 cells**. Each one opens the reason, the vendor's own wording,
an honesty label and a link to the page it came from.

### The finding worth the module

Rows 1 to 3 rise neatly left to right — and the page says out loud that this is an artefact
of choosing the doors as a ladder, not a discovery. **Row 4 does not rise**, and that is the
payload:

- **Door 2 is among the cheapest to check.** The agent inside Docs or Word makes its edit
  inside a document that already has undo and version history — in Docs as a suggestion to
  accept or reject; in Word, by Microsoft's own page, as a direct change you undo.
- **Door 4 is easier to check than door 3.** Code comes with a diff, a history and tests, so
  the review has a shape — at the cost of needing to read code, and of the commands it ran
  never appearing in the diff at all.
- **Door 3 is the hardest.** A finished deliverable, assembled across files and apps while
  you were elsewhere, with nothing to compare it against.

That ordering is the one claim on the page no vendor states, so it ships labelled
**reasoned** and the module argues it where the room can push back. Of the 16 cells,
**13 verified** and **3 reasoned** — every one of the reasoned ones is an ordering judgement.

---

## Stage 2 is the stage that lands

**7 jobs** — realistic faculty tasks — against the same 4 doors is another **28 judgements**.
Choose a job and the page shows which doors do the whole thing, which do part of it, which
cannot, and for each one **what you would have to hand over**.

| Job | Smallest door that finishes it |
|-----|-------------------------------|
| Draft ten multiple-choice questions on this week's reading | 1 — a chat window, handing over nothing |
| Turn an assignment sheet into a grading rubric | 1 — a chat window |
| Reformat a syllabus into the department's template | 2 — the agent already inside Docs |
| Summarise eighty student reflections and pull out the themes | 3 — a desktop coworker |
| Find where your lecture notes disagree with the textbook | 3 — a desktop coworker |
| Rename four hundred scanned files from what is inside them | 3 — a desktop coworker |
| Build a small interactive activity like the ones in this collection | 3 — a desktop coworker |

That table is **computed, not authored**: `bestDoor()` in `src/engine.js` returns the
smallest-numbered door whose verdict is *does the whole job*, and the test suite pins the
definition so a future edit cannot quietly turn "smallest" into "first listed".

Two honest notes the page makes about its own list:

- The 7 were chosen to **span** the doors, which makes the higher doors look more necessary
  than a real semester will. The page says so, rather than rigging the distribution.
- Two of the jobs carry an **institutional caution** on screen — student work is protected
  record, and a textbook chapter has a licence. The page points at the registrar and IT
  rather than answering a policy question it has no standing to answer.

The Stage 2 verdicts are **reasoned**, not quoted: no vendor page says anything about eighty
student reflections. Each verdict therefore names the axis that decided it, so a reader can
check the reasoning instead of trusting the answer. That disclosure now renders immediately
beside the verdict cards rather than below the whole stack, closing a split-attention gap the
pre-build accuracy audit found (2026-09-15).

Before the reveal, pick a job and the page asks you to **guess which door finishes it** — the
prediction is echoed against the computed answer once you choose, so "which one is best" never
gets asked before "what do you think, and why".

---

## The honesty machinery

Three labels, used throughout and defined on the page:

- **verified** — a page belonging to the company that makes the product was opened on
  2026-09-16 and says this. The vendor's own wording is usually quoted.
- **reasoned** — follows from the verified facts, but nobody states it in these words. Every
  ordering judgement is reasoned.
- **unconfirmed** — we looked and could not confirm it. Ships anyway, labelled, because a
  blank cell is a claim too.

Retrofitted onto the fleet's shared six-word provenance vocabulary (Live / Measured / Sourced
/ Reasoned / Scripted / Illustrative): `verified` maps to **Sourced** (qualified "verified
&lt;date&gt;"), `reasoned` maps to **Reasoned** — the two words already coincide — and
`unconfirmed` maps to **Sourced**, qualified "unconfirmed" (an unconfirmed cell still rests on
a real page; it is not invented, so it is not Illustrative). Both vocabularies show on screen;
see `sixLabel()` in `src/app.js`.

**19 sources**, every one first-party — a page belonging to the company whose product it
describes. The test suite enforces that: it checks the host of every source against a list of
vendor hosts and fails on a news site or a blog. (One was added in the 2026-09-16 retrofit:
`antigravity-remote`, backing the "remote-control mode" phrase in door 4's confusable note; the
pre-existing `antigravity` source was retargeted from a desktop-setup-only page to
`antigravity.google/docs/overview/`, which actually covers the system-commands/subagents/
browser-control capabilities it is cited for — the dead-citation sweep's must-fix #2.)

Two things worth knowing if you re-verify:

- **openai.com and its help centre return 403 to automated fetching.** The OpenAI facts here
  were read in an ordinary browser from `help.openai.com` and `learn.chatgpt.com`. They open
  normally for a human. Do not let a 403 talk you into downgrading a claim you can simply go
  and read.
- **A non-existence claim cannot be sourced — and this page shipped one that was wrong.**
  The first build reported no consumer-plan Google product at door 3, labelled **unconfirmed**
  and scoped to "we looked at Google's own pages". The 2026-09-16 review found **Gemini Spark**
  (`support.google.com/gemini/answer/16596215`), a personal-account agent on a Google AI Pro or
  Ultra plan, documented on a help centre this page already cited. The panel now records the
  miss and states what was checked, where and when; door 3 lists Spark. The standing rule this
  instantiates: a demo states what it checked, where and on what date — never that a
  capability does not exist.

**9 things cut.** Everything researched during the build and deliberately left off the page,
with the reason, is listed in Stage 3. Two are worth repeating here because they correct the
brief this module was built from:

- *"Microsoft 365 Copilot agent mode reached general availability in April 2026"* — dropped.
  Microsoft's own page for the feature said on the check date that it is **still rolling out
  worldwide to general availability**. The brief was also using the retired name: the page is
  now titled **"Edit with Copilot in Word"** and disposes of the old one in a line —
  *"In earlier releases, this was referred to as Agent Mode."*
- *"GPT Work"* — a name on none of the OpenAI pages this module opened. The correct name is **ChatGPT Work**, and
  OpenAI's help centre states that **ChatGPT agent is no longer available** and names
  ChatGPT Work as what to use instead.

Both of those are **on** the page, in Stage 3, as the evidence that the names have a shelf
life and the doors do not.

---

## Two rules the module holds itself to

**No prices on the page.** Not one figure. Prices on all four doors moved more than once in
the year before the check date, and a wrong number in front of a room of faculty costs more
than a missing one. The screen says only what *kind* of thing it is: free tier, paid personal
plan, institutional licence. `build.js` refuses to write `index.html` if a price leaks into
any string the page can display, and the test suite checks the built file too.

**No vendor recommended or ranked.** Faculty in the room have institutional constraints the
module cannot know about, so it describes capability and stops. This is enforced by the same
mechanism.

Both detectors ship with **controls in both directions** — the test proves each one fires on
a real price and on a real recommendation, and does *not* fire on ordinary prose. A null
result from a probe that cannot fire proves nothing.

### The figures the sources did state

Kept here rather than on the slide, exactly as read, with the date. Re-read them before you
quote any of them anywhere.

<!-- prices:begin -->
> **All figures below were read on 2026-09-08** and are already the most perishable content in
> this repository. They are recorded for the presenter's own orientation, not for the screen.

- **ChatGPT Plus** — $20/month, billed monthly.
  (`help.openai.com/en/articles/6950777-what-is-chatgpt-plus`)
- **Claude** — Pro $17/month with the annual discount, $20 billed monthly; Max $100/month,
  with 5x and 20x usage tiers; Team offers Standard and Premium seats; Enterprise listed at
  $20 per seat plus usage. A university-wide education plan exists covering students, faculty
  and staff. Cowork and Claude Code are both listed as Pro, Max, Team and Enterprise
  features — not on the free plan. (`claude.com/pricing`)
- **Claude Code** — the product page lists Pro at $17–20/month, Max 5x at $100/month and
  Max 20x at $200/month. (`claude.com/product/claude-code`)
- **Antigravity** — the Individual tier is listed at $0/month. Google AI Pro and Google AI
  Ultra tiers exist above it; their figures were not stated on the pricing page as read.
  (`antigravity.google/pricing`)
- **Gemini Enterprise** — no figure stated; the admin page says only that it *"isn't included
  with your Google Workspace subscription"* and must be purchased as separate licences.
- **Microsoft** — no figure was read. The Word page lists the licences by name (Microsoft
  Copilot for organizations, Microsoft 365 Premium for individuals) without prices.

The Antigravity free tier's model list, as read on 2026-09-08, included **Gemini 3.8 Flash,
Gemini 3.7 Flash, Gemini 3.6 Flash, Gemini 3.1 Pro, Claude Sonnet & Opus 4.6, and
gpt-oss-120b** — i.e. models that are not Google's, on Google's free tier. Model names are
the shortest-lived fact available, which is why the page says only that the free tier includes
non-Google models and puts the list here.
<!-- prices:end -->

---

## Running it

Open `index.html`. No server, no build step, no network. About 12 minutes, or 4 if you are
behind — the presenter guide has both timings.

- **?** (top right) is the **Guide** — the how-to overlay. It opens on first load and that
  button reopens it at any point.
- **⚙** opens Settings: **Open Presenter Notes**, **Presentation mode** for a projector,
  **Reset**, and **Run the self-test**.

**Reset** returns the demo to how it opened — Act I, no job picked, no self-test on screen,
every overlay closed. It deliberately leaves Presentation mode alone: the projector is still
a projector, and a reset that switched it off every time would stop being used.

The self-test is the answer to "how do you know any of this?". Press it in front of whoever is
asking. It re-derives, live, the properties the shipped test suite asserts at build time —
every claim resolving to a declared source, no source cited and never used, no price and no
ranking anywhere, and the review row genuinely failing to rise the way the other three do.

**Printable guide:** `presenter-guide.html` and `Front-Doors-Presenter-Guide.pdf` (the
filenames keep the old name, because the hub links to them). The same text appears under
Settings → Open Presenter Notes; the HTML file is canonical and the copy inside the app is
injected at build time, so there is one source of truth. `node build.js --check` fails if
the two ever drift apart.

### The phone case

A four-by-four capability table is the classic thing that ships as a horizontal scroller
nobody reads on a phone. This one does not scroll sideways at any width, and it is not two
copies of the markup either. It is **one** piece of DOM rendered two ways:

- **Below 940px** — four stacked door cards, each carrying its four axis rows with their own
  labels. Reads top to bottom, thumb-sized.
- **At 940px and up** — the two wrapper divs collapse with `display: contents` and their
  children become items of a real five-column CSS grid: an axis rail plus four door columns,
  rows aligned by the grid itself. `app.js` stamps `--col` and `--row` on every grid child;
  the stylesheet only reads them above the breakpoint.

The wrappers are plain `div`s carrying no semantics, so collapsing them out of the box tree
takes nothing out of the accessibility tree with them — the labels and roles live on the
cells. The test suite pins the mechanism, not just the outcome, and checks that no rule in
the stylesheet declares a tap target below the repository's 36px floor.

---

## Modifying it

The demo is generated. **Author under `src/`; never edit `index.html` or
`presenter-guide.html` at the demo root** — they are build output.

```
node front-doors/build.js            # writes index.html + presenter-guide.html
node front-doors/build.js --check    # verifies parity, writes nothing
node front-doors/src/playtest.test.js   # the guard (VERBOSE=1 to see passing rows)
node front-doors/tools/pdf.mjs       # re-render the PDF from the guide
node front-doors/tools/pdf.mjs --check
```

| File | What lives there |
|------|------------------|
| `src/data.js` | Every sentence on screen, every source, every confidence label. Start here. |
| `src/engine.js` | Every fact the demo *derives* — `bestDoor()`, the reach and check comparisons, the price and ranking detectors, the counts. One implementation, three consumers. |
| `src/app.js` | DOM only. Reads `engine.js`; derives nothing of its own. |
| `src/styles.css` | The palette, and the grid mechanism described above. |
| `src/template.html` | Page shell and the four overlays. Carries the build placeholders. |
| `src/presenter-guide.html` | Canonical printable guide. Its `<style id="guide-css">` block is the one lifted into the app, so everything in it must stay scoped to `.guide-scope`; the second, unnamed sheet is page chrome for the printed page and is not extracted. |
| `src/playtest.test.js` | The guard. Run it before you present. |
| `tools/pdf.mjs` | Dependency-free PDF render. Uses Playwright if present, otherwise an installed Chrome or Edge; `CHROME_PATH` wins. |

`build.js` refuses to write if a price leaks, a vendor is ranked, a claim cites a source that
does not exist, anything in the page would fetch an external resource, or any URL in the
output is not a declared source.

### Why the numbers in this file cannot drift

Every count quoted in this README, in the presenter guide and in `demo.json` is cross-checked
against the dataset by the test suite — **as a phrase**, not as a bare integer, because "4"
matches almost any document and would be a test that passes by accident. It looks for
`16 cells`, `28 judgements`, `19 sources`, `13 verified`, `3 reasoned`, `9 things cut`,
`4 doors`, `4 axes`, `7 jobs`. A control asserts that a *wrong* count would not be found, so
the check is known to be capable of failing.

---

## Maintaining it, which this one will need

This is the demo in the collection with a real shelf life. When something moves:

1. **Re-open the sources.** All 19 are listed in Stage 3 and in `src/data.js` under `SOURCES`.
   Expect openai.com to 403 a script; use a browser.
2. **Update the cell, not the prose.** `data.js` is the only place a claim lives. The screen,
   the self-test and the test suite all read from it.
3. **Move the date by re-opening, never by editing a constant.** Each entry in `SOURCES` carries
   `checked`, the ISO date that page was last opened in a real browser; set it only for a page you
   actually re-opened. `CHECKED_ISO` / `CHECKED_ON` are derived as the **oldest** of those dates,
   and `added` in `demo.json` must agree with it (the test suite checks). The 2026-09-16 review found
   the previous single constant had re-dated eleven sources nobody had re-opened.
4. **Add the change to `CHANGED`** rather than silently correcting it. The list of names that
   already moved is the module's best evidence for its own central claim, and it gets stronger
   every time this happens.
5. **Rebuild, re-test, re-render the PDF**, in that order.

If a name on screen has changed by the time you present, say so from the stage. Stage 3
predicted it, and a correction taken gratefully is a better moment than a correct page would
have been.

---

## Contract compliance

Meets [CONTRACT.md](../CONTRACT.md) → **Required UX**: single self-contained `index.html`; a
`?` button named **Guide** beside Settings, opening the Guide overlay on first load and
reopening it on demand; a Settings menu carrying **Open Presenter Notes**, **Presentation
mode** and **Reset**; presenter notes generated at build time from the same file as the
printable guide, with `node build.js --check` failing on drift; Murray State theme; Bryant
Harrison and Murray State University visible; phone-first; printable guide plus PDF;
`built_with` recorded.

**`offline_no_inference` is now `true`, and here is what earned it.** Statically, the built
file contains no `script`, `link`, `img`, `iframe`, `source`, `video`, `audio`, `embed`,
`object` or `track` element that fetches anything; no `fetch`, `XMLHttpRequest`, `WebSocket`,
`EventSource`, `importScripts` or `sendBeacon` call; no `@import` or `url(http…)`; no storage
of any kind; no AI endpoint. Both the build and the test suite enforce all of that.

Dynamically (2026-09-09), the page was loaded in headless Chrome over the DevTools protocol
with `Network.requestWillBeSent` recording, and **every one of its 52 controls was clicked** —
both header buttons, every settings control including the self-test and Reset, all three act
tabs, all four door headers, all sixteen grid cells, all seven job buttons, and every overlay
close. Exactly one request was recorded: the `file://` document itself. The recorder was
proved capable of seeing a request by running it unchanged against a control page that loads a
remote image and calls `fetch` — both showed up. The 21 outbound source links were not
followed, which is the point: they are links a reader may choose to follow, permitted by the
contract's 2026-09-08 amendment, and the page never follows one on its own.

Outbound source links are permitted under the contract's 2026-09-08 amendment: a link the
reader may choose to follow is not a network call by the page. Every one of them is a source
this module declares, and `build.js` fails on any URL that is not.

---

Bryant Harrison · Murray State University · one HTML file, runs offline
