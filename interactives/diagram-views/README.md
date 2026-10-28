# Diagram views

Compares the same generic battery–switch–resistor–LED loop in pictorial, wiring,
and schematic drawings. Comparison displays the three together (stacked on a
phone); individual views and the supplementary functional block diagram remain
selectable. Component selection persists in every view. Each root owns its state,
and buttons provide keyboard access to the same selection as clicking a part.
Without JavaScript all four figures remain visible. Print shows all figures and
hides controls and selection outlines.

The pure model tracks identity and connections, not current or LED brightness.
No component ratings, package pinouts or construction instructions are implied.
S1 is open in the schematic. Its four conductor nodes become three if an ideal
closed S1 merges the source-to-switch and switch-to-resistor conductors.

## Content and provenance

Both teaching pages are ready. The supplied source extract has slide titles only;
it establishes the topic outline, not the unseen artwork. All SVGs are original.
Symbols are common teaching forms, with buzzer and fuse variation called out.
No standards clauses, symbol numbers or compliance claims are made. The two-panel
symbol sheet keeps each panel short enough for printing. The ladder example uses
one switch-to-relay-coil rung and one relay-contact-to-lamp rung, without seal-in.

The practice bank retains the original 12 items and adds 12 symbol identification
items plus 2 component-node items (26 total). All numbered choices use zero tolerance.

## Verification

Run `node --test interactives/diagram-views/model.test.cjs` from the repository root.
The site-wide Node suite is `node --test --test-concurrency=2 tests/interactives/*.test.cjs`.
Build with `pwsh -NoProfile -File ./build-site.ps1`.

For browser review, open both generated pages at a real 375 CSS-pixel viewport,
expand their cards, and check every view. Measure inline SVG text using computed
font size multiplied by the SVG screen transform scale; for external SVGs use
rendered image width / viewBox width times authored font size. Check the figures
inside the generated practice catalog as well. A deliberately tiny text label
and oversized element should fail the same probes before trusting a pass.

Also verify keyboard selection, two independent roots, repeated initialization,
all numbered answers and wrong choices, light/dark themes, no-JS, and printing.
The controls affect only roots marked `data-interactive="diagram-views"`.
