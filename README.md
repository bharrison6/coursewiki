# Coursewiki

Course reference for the Design Engineering Technology program, School of Engineering,
Murray State University.

A page is authored once. It renders as a web page, as slides inside any number of
presentations, and as a self-contained single file — from the same source.

**A presentation is a playlist**, not a page: an ordered selection *of* topics, not a copy of
them. Edit a topic once and every playlist using it follows.

**Name a page for its subject, not the shape of its content.** A title is read in search
results, slide headers and track lists, where the section and group are not visible — it has to
stand on its own. "Before, During and After" became "Equipment Operating Procedure" for exactly
that reason.

## Layout

```
site.conf                      site title, footer, published URL, section order
collections/<id>/
  collection.conf              section title, summary, page groups
  pages/<page-id>.html         one topic per file
decks/<name>.deck              a playlist: an ordered list of page ids
theme/*.css                    shared MSU token layer + the two skins
assets/                        SoE lockups, light and reversed
build-site.ps1                 the generator
docs/                          GENERATED — the site. Never hand-edit.
docs/print/                    GENERATED — one self-contained file per section
                               and per playlist. Print these for PDF.
```

## Build

```powershell
pwsh -File .\build-site.ps1              # the site, into docs\
pwsh -File .\build-site.ps1 -Bundle      # also the single-file copies
pwsh -File .\build-site.ps1 -WhatIf      # compare against disk, write nothing
```

The build fails loudly on a duplicate page id, a duplicate section slug, a `@@SECTION` not in the
collection's `@@GROUPS`, a deck naming a page that does not exist, and a nested
`<section>`. It reports dangling `[[links]]` and pages in no presentation without
failing, because both are normal mid-authoring states.

## Authoring

A page is an `@@FIELD:` header, `@@END`, then a stack of `<section>` blocks:

```html
@@ID: lifting-and-carrying
@@TITLE: Lifting and Carrying
@@SECTION: Universal Rules
@@SUMMARY: One sentence for the card and the page standfirst.
@@STATUS: ready
@@END

<section>
  <h2>Safe manual handling</h2>
  ...
</section>
```

One `<section>` becomes one slide. Two attributes change that:

| Attribute | Effect |
|---|---|
| *(none)* | its own slide |
| `data-deck="with-previous"` | merges onto the slide before it |
| `data-deck="wiki-only"` | never appears in any presentation |

`@@STATUS: pending` marks a page as unfinished — it renders, and its card is
dashed and greyed, but it is excluded from the section's page count.

### Links

`[[page-id]]`, or `[[page-id|link text]]`. Ids are unique across the whole site.
One authored link, five destinations, decided at build time:

| Where it renders | Result |
|---|---|
| A page, same section | `ppe.html` |
| A page, different section | `../lean/5s-workplace-organization.html` |
| A presentation that **includes** the target | `#p-ppe` — jumps to the slide |
| A presentation that **excludes** it | opens the page in a new tab |
| Target does not exist | inert, visibly marked "page pending" |

That is the point of the system: a presentation can reference the whole corpus
without dragging it in, and a page dropped from a presentation degrades to a
link rather than a dead end.

## Deploying

`docs/` is the whole site, with relative links throughout — it opens from disk,
and GitHub Pages can serve it from `main` / `docs` with no CI. `.nojekyll` is
emitted because nothing here needs Jekyll.

`docs/print/` holds one self-contained file per section and per playlist — CSS,
script and logo inlined, no sibling files. Print one for a PDF; it is also what
to upload where a folder cannot be hosted. Canvas rewrites the URL of
every uploaded file, so relative links between separately-uploaded files break;
one file has none to break. Set the published URL in `site.conf` (or pass
`-SiteUrl`) so links *out* of it resolve.

## Design

Palette, type scale and contrast rules come from the university Branding Toolkit
and are recorded in the `official-document-branding` artifact. Three rules the
stylesheet encodes, each of which has caused a real defect:

- Gold `#ECAC00` and Red Orange `#FF4500` both fail contrast as text on white —
  borders, rules and tinted fills only, with navy text inside.
- Navy `#002144` is unreadable on dark; the dark theme switches the accent to the
  official Lite Blue `#00A4E3` rather than inventing a lighter navy.
- A heading never renders smaller than the text it heads.

The logo is never recoloured. Both lockups ship and one is hidden by `display`.
