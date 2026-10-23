# Demo contract

Every demo in this repo meets this contract. It is an **open list** — items get added
as the collection matures; when one is added, backfill every `demo.json` compliance
block with the new key so the gap is visible, not silent.

## Naming & placement

- One folder per demo, named with the demo's **kebab-case title slug** (`bridge-works`,
  `fuel-golf`). The folder name is the demo's public URL on the hosted copy
  (`bharrison6.github.io/examples/<slug>/`) — **never rename a shipped demo**.
- The descriptive layer lives in `demo.json` (topic, discipline, tagline), not the
  folder name. Display titles are descriptive, not cryptic (operator direction
  2026-09-09): a reader should know what the demo is from the title alone; an evocative
  name can survive as the tagline. Folder slugs are unaffected by a retitle.

## Required files

| File | Purpose |
|------|---------|
| `index.html` | The runnable demo. Self-contained at runtime; if built, the committed file is the built output. |
| `README.md` | What it is, how to run/present it, how to modify it. |
| `demo.json` | Manifest: identity, metadata, `built_with` provenance, compliance state. |
| Printable guide (`*.html` + `*.pdf`) | The presenter notes in printable form, declared in `demo.json` → `guide`. One source with the in-app notes (see Required UX). |

Demos with a build step keep `src/`, `build.js`, `tools/` in the folder; the build must
be reproducible from the committed sources.

## Required UX (every demo)

- **Guide (`?`)** — a `?` button in the header, beside Settings, whose accessible name is
  **Guide**. It opens the Guide overlay (how to use or play this demo) on first load;
  dismissible; reopenable anytime from that button. (Operator ruling 2026-09-09; this
  supersedes the earlier "how-to popup" wording — same overlay, now named.)
- **Settings (`⚙`)** — a settings button beside the Guide button. Its menu always contains
  **Open Presenter Notes**, **Presentation mode** (projector-sized type and controls) and
  **Reset** (return the demo to its initial state). It may also carry demo-specific options.
- **Presenter Notes are the printable guide** — the notes opened from Settings and the
  printable guide (`*.html` + `*.pdf`) are one document with one canonical source. The
  in-app notes are generated from that source at build time (no runtime fetch) and the
  PDF is rendered from it; a build check fails when they drift. Editing one copy is a fork.
  Reference implementation: `two-winters/build.js` lifts the guide's `.guide-scope` body
  and its scoped stylesheet into the app.
- **Theme** — Murray State demos use the Murray State theme (MSU Blue `#002144`,
  MSU Gold `#ECAC00`, Lite Blue `#00A4E3`; alert Red Orange `#FF4500` reserved for
  genuine failure states).
- **Attribution** — Bryant Harrison visible on every demo; plus Murray State
  University when built for Murray State. **No other person's name is attached to a
  demo** as author, reviewer, faculty fit, or acknowledgement (operator ruling
  2026-09-09: a demo may say it was built for faculty, never for whom; they did not
  approve their names in this content). Public figures cited inside a demo's own
  material, such as a researcher named in a sample essay, are content, not attribution.
- **Mobile capable** — phone-first or fully responsive; touch works.
- **Offline / no runtime inference** — the page must load and run with **zero network
  requests**: no external scripts, stylesheets, fonts, images or data, and no AI service
  at runtime. Embed everything; `data:` URIs only. The demo must work with the network off.
  - **Outbound hyperlinks are allowed.** An `<a href>` the reader may choose to follow is
    not a network call by the page. This was revisited deliberately on 2026-09-08 when a
    reading-and-watching demo needed real links to books and videos; it replaces an earlier
    blanket "no external href" reading. The test is still *loads and runs offline*, not
    *contains no URLs* — a demo that fetches, embeds or phones home still fails.

## Manifest (`demo.json`)

Copy a neighbor's and edit. Field notes:

- `built_with` — the harnesses/tools that built the demo (`cowork`, `claude-code`,
  `codex`, `gpt`, ...). Empty array = not yet recorded, listed by the build script
  until filled. Record honestly — provenance is part of what this repo demonstrates.
- `compliance` — one key per contract item above; values `true`, `false`, or
  `"unverified"` (evidence suggests yes but nobody has confirmed in-browser).
  Update when retrofitting; never delete a key to hide a gap. Current keys: `readme`,
  `guide`, `guide_button`, `settings_menu`, `presenter_notes`, `presentation_mode`,
  `settings_reset`, `notes_match_guide`, `msu_theme`, `attribution_visible`, `mobile`,
  `offline_no_inference`. (`guide_button` replaced `howto_popup` on 2026-09-09;
  `settings_reset` and `notes_match_guide` were added the same day.)

## Hub generation

`README.md`'s demo table and the launcher card bodies in `index.html` are generated:

```bash
node tools/build-hub.js
```

Edit `demo.json` / `tours/*.json`, then regenerate. Section narrative in `index.html`
stays hand-authored. `--check` verifies without writing (for CI or pre-commit).

## Adding a demo

1. Folder with title slug; meet the contract above.
2. `demo.json` (+ record `built_with`).
3. Add to a tour in `tours/` and drop a stub card
   `<a class="card" href="<slug>/index.html"></a>` where it belongs in `index.html`.
4. `node tools/build-hub.js`.
