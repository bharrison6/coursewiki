# CourseWiki

Course reference for the Design Engineering Technology program, School of Engineering,
Murray State University.

A topic is authored once. The generator publishes it as a normal web page; tracks select
those real pages at runtime for reading or presentation mode; and the same pages are also
assembled into self-contained printable files.

Name pages for their subject, not the shape of their content. Titles must make sense in
search results, track lists, and presentation panels where collection and group context may
not be visible.

## Layout

```
site.conf                      site title, footer, published URL, section order
collections/<id>/
  collection.conf              section title, summary, page groups
  pages/<page-id>.html         one topic per file
tracks/<name>.track            ordered page/track selections and track hierarchy
theme/*.css                    shared MSU token layer and site behavior
assets/                        SoE lockups and other static assets
media/                         authored images referenced with [[img:...]]
build-site.ps1                 the generator
docs/                          GENERATED — the site. Never hand-edit.
docs/print/                    GENERATED — self-contained section and track aggregates
```

## Build

```powershell
pwsh -File .\build-site.ps1                         # generate the site into docs\
pwsh -File .\build-site.ps1 -Prune                 # also remove stale generated files
pwsh -File .\build-site.ps1 -WhatIf                # report changes without writing
pwsh -File .\build-site.ps1 -SiteUrl "https://example.org/coursewiki"
```

`-Prune`, `-SiteUrl`, and `-WhatIf` are the build script's supported parameters. Set the
published URL in `site.conf` when it should be the default; `-SiteUrl` overrides it for one
run. Edit source files, then regenerate `docs/`; do not hand-edit generated output.

The build validates duplicate page IDs and section slugs, collection groups, track
references, track cycles, empty tracks, malformed page sections, and image references. It
reports dangling page links and other normal mid-authoring conditions without treating them
as build failures.

## Authoring

A page starts with an `@@FIELD:` header, `@@END`, and a stack of `<section>` blocks:

```html
@@ID: lifting-and-carrying
@@TITLE: Lifting and Carrying
@@SECTION: Universal Rules
@@SUMMARY: One sentence for the card and page standfirst.
@@STATUS: ready
@@END

<section>
  <h2>Safe manual handling</h2>
  ...
</section>
```

Each authored `<section>` becomes one disclosure card on the web page, one panel in
presentation mode, and one block in a printable aggregate. `data-deck="with-previous"`
merges a section into the preceding card; `data-deck="wiki-only"` excludes it from
presentation mode. `@@STATUS: pending` keeps a page visible while marking it unfinished.

Use `[[page-id]]` or `[[page-id|link text]]` for page links. Use
`[[img:file.png|descriptive alt text]]` for images in `media/`; image files and alt text are
validated during the build. A missing page link remains a visible pending link so authors
can write cross-references before the target page exists.

Tracks are playlists, not separate copies of page content. A topic track lists page IDs and
may use `>` lines for group headings. A course track can include a topic track with `+`.
Program tracks contain their child courses through `@@PARENT`; their page lists are derived
from those children. This keeps shared content in one source of truth. See the existing
files in `tracks/` for examples.

## Runtime tracks and presentation mode

The generated site applies a track to an ordinary page with the `p` URL parameter:

```text
safety/ppe.html?p=general-safety
safety/ppe.html?p=general-safety&present=1
```

The first URL is reading mode. `&present=1` turns the same page DOM into full-screen panels;
next/previous controls and arrow keys move through the track. No second presentation copy is
generated, so topic edits automatically reach every track that uses them. The generated
`presentations.html` index links to each track and its print file.

## Deploying and printing

`docs/` is the complete GitHub Pages site. It uses relative links, includes `.nojekyll`, and
can be served from the repository's `main` branch and `/docs` folder without a separate CI
pipeline.

`docs/print/` contains self-contained HTML aggregates for each collection section and each
track, including `track-everything.html`. CSS, script, and logos are inlined, so an aggregate
can be printed to PDF or uploaded as a standalone document where a folder cannot be hosted.
Links to pages outside the aggregate use the configured published URL.

## Design

Palette, type scale, and contrast rules follow the university Branding Toolkit. Gold
`#ECAC00` and Red Orange `#FF4500` are used for borders, rules, and tinted fills rather than
small text on white; the dark theme uses Lite Blue `#00A4E3` instead of navy for contrast.
The logo is not recoloured; the appropriate light or reversed lockup is selected by the
theme.
