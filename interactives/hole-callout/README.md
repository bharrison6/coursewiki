# Hole callout reader

The module compares five plain hole types: through, blind, counterbore, countersink and
spotface with a stated depth. It uses invented decimal-inch dimensions and does not select
fasteners, tolerances, manufacturing methods or feature locations.

`model.js` validates inputs, builds the callout and draws the ideal section. The countersink
depth is `(major diameter - hole diameter) / (2 * tan(included angle / 2))`. The blind-hole
sketch uses an explicitly assumed 118-degree drill point, whose additional length is
`diameter / (2 * tan(59 degrees))`; the callout specifies full-diameter depth. A sketch that
would break through is rejected. Numeric lengths are limited to .010–4.000 inches and
three decimal places so displayed values agree with the geometry. These are teaching-model
bounds, not standards requirements.

The live spotface note spells out SPOTFACE. The accompanying page illustrates the SF symbol
and explains the separate case where a drawing leaves depth unspecified. The module never
estimates a cleanup depth from an arbitrary surface.

`demo.js` initializes each matching root independently. Each field is labeled, feedback is
announced, and invalid input hides the previous result. The page provides a static worked
callout and original section figures for JavaScript-free reading and printing. The CSS hides
the controls during printing and restores the static explanation.

Run the pure model checks from the repository root:

```text
node --test interactives/hole-callout/model.test.cjs
```

After building the site, run `browser.test.cjs` with an installed Playwright package.
`PLAYWRIGHT_MODULE` may name its absolute module path and `CHROMIUM_PATH` may name an
installed Chromium executable. The check covers generated card/image counts, light and dark
mobile layout, a planted overflow control, invalid input, all five hole types, independent
roots, and all 17 practice items with independent expected answers and wrong-method controls.
It saves local visual review artifacts and two no-JavaScript PDFs under `.verification/`.
Those files are ignored and are not module assets. Compare the PDFs' extracted word
inventories, rather than assuming different page counts mean lost content.

Dimensioning conventions are explained on the topic pages; the current edition is identified
by [ASME's Y14.5 catalog](https://www.asme.org/codes-standards/find-codes-standards/y14-5-dimensioning-tolerancing).
No source-deck or publisher image is included in this module.
