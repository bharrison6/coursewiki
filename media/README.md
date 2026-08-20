# media\ — source images for pages

Drop an image file in here and reference it from a page with the image form of
the ordinary link syntax:

```html
<p>[[img:chip-breaker.png|A curled steel chip about 25 mm across, still hot.]]</p>
```

`[[img:<file>|<alt text>]]`. The part after the `|` is the **alt text and it is
required** — the build fails without it. This is teaching material, it gets read
with a screen reader and printed in black and white, so a picture with no
written equivalent is content that does not reach part of the class. Describe
what the reader is meant to see, not what the file is called.

## What is supported

`.png`, `.jpg` / `.jpeg`, `.webp`, `.svg`. Subfolders work —
`[[img:lathe/tailstock.jpg|…]]` resolves `media\lathe\tailstock.jpg`.

Name files lowercase and hyphenated, and reference them **exactly**. The lookup
is case-sensitive on purpose: Windows would resolve `[[img:Tailstock.jpg]]` to
`tailstock.jpg` and the build would look clean, then GitHub Pages — which is
case-sensitive — would serve a 404. The build reports the mismatch instead.

## What the build does with them

| Where | What it emits |
|---|---|
| A site page | `<img src="../media/<file>?v=<build stamp>">` — the real file, cached once by the browser and re-fetched when its contents change |
| `docs\print\*.html` | `<img src="data:<mime>;base64,…">` — inlined |

The aggregates in `docs\print\` are the PDF fallback and get handed out as
single files, so they cannot reference a sibling. Everything they need is
inside them. That is why a 2 MB photo costs 2 MB in *every* aggregate that
carries the page — export at the size the page actually shows it, and prefer
`.webp` or a well-compressed `.jpg` for photographs.

**Do not reach for an image where the browser can draw it.** The PASS stepper,
the hazard stripes and the category ladder in this site all replaced flat
images from the source decks, and they theme, scale, animate, print and stay
searchable — none of which a screenshot does. Photographs of real equipment,
real signage and real damage are what this folder is for.

## Housekeeping

Everything here is copied into `docs\media\` and published. The repo is public
([[github-pages-has-no-domain-restriction]]), so nothing goes in here that is
not meant to be on the open internet — no photographs of identifiable students,
no whiteboards with names on them, no screenshots of a roster.

An image no page references is reported by the build. It is still published;
delete the file if it is not wanted.
