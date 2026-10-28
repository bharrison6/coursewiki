# Drive selection explorer

Four qualitative inputs screen flat/V-belts, timing belts, roller chain and a single gear pair. There is no numerical score or claimed load rating. The page explains the assumptions, gives a static example and links the manufacturer's guides used to check the rules.

Only two inputs exclude a family: synchronization excludes friction belts; a separated-shaft layout excludes a single compact gear pair. Speed and environment add conditions to review. Positive engagement still has limits from compliance, clearance and, for chains, chordal action.

`model.js` has no DOM dependency. `demo.js` initializes every root independently, uses native labeled selects and scopes all DOM updates. Print retains the selected case and results plus the static example. Without JavaScript, the authored example remains available.

Run the model and independent practice-answer checks:

```text
node --test interactives/drive-selection/model.test.cjs
```

Optional UI test requires an existing Playwright installation and Chromium. Set `CW_PLAYWRIGHT_MODULE` to the module path and `CW_CHROMIUM` to the executable if they are not on the defaults, then run:

```text
node --test interactives/drive-selection/browser.test.cjs
```

The UI test uses an in-memory fixture with the site's actual styles. Check generated pages and the Engineering print aggregate separately after running the site build; the fixture does not claim to test the build pipeline.
