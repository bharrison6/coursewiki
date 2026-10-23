#!/usr/bin/env python3
"""RETIRED. The presenter sheet is hand-authored now, not generated.

This script used to write presenter-sheet.html and a PDF from a copy of the sheet
embedded in its own source. That made it a SECOND source for a file people also edit
by hand: running it would have silently reverted any edit made to presenter-sheet.html
-- including the guide-scope structure the app now depends on. It also needed
Playwright, which this repository does not install.

Where each half of it went:

  the printable sheet   presenter-sheet.html is canonical and is edited directly. It is
                        also the source of the in-app presenter notes: build.js lifts its
                        scoped stylesheet and its .guide-scope body into index.html, and
                        `node build.js --check` fails if the two drift.

  the PDF               `node tools/pdf.mjs` renders The-Stranger-Presenter-Sheet.pdf from
                        that same file, using a system Chrome. Node builtins only.

  the card derivation   the one piece of real logic here -- deriving the eight cut-out
                        target cards, and which scenario each turns up in, from
                        src/scenarios.json -- now lives in build.js as a PARITY GATE. It
                        verifies the printed cards against the deck the app actually deals
                        and fails the build on a mismatch, instead of regenerating them.

Nothing here is worth running; it is kept as a signpost, not as a tool.
"""
import sys

print(__doc__)
print("Nothing was written. Use:  node build.js   and   node tools/pdf.mjs")
sys.exit(1)
