const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');

test('component choice persists across every view without changing connections', () => {
  const expected = [['B1+', 'S1.1'], ['S1.2', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'B1-']];
  for (const component of model.components) {
    let state = model.select(model.initial(), 'component', component);
    for (const view of model.views) {
      state = model.select(state, 'view', view);
      assert.equal(state.component, component);
      assert.equal(state.view, view);
      assert.deepEqual(model.connections, expected);
    }
  }
});
test('two roots can retain independent state; updates do not mutate old state', () => {
  const first = model.initial(), second = model.initial();
  const changed = model.select(first, 'component', 'led');
  assert.equal(changed.component, 'led');
  assert.equal(first.component, 'battery');
  assert.equal(second.component, 'battery');
});
test('invalid view or component is rejected', () => {
  assert.throws(() => model.select(model.initial(), 'view', 'unknown'), RangeError);
  assert.throws(() => model.select(model.initial(), 'component', 'motor'), RangeError);
  assert.throws(() => model.select(model.initial(), '__proto__', 'battery'), RangeError);
});
test('wiring defines four distinct conductor nets before an ideal switch closes', () => {
  const terminals = model.connections.flat();
  assert.equal(new Set(terminals).size, 8);
  assert.equal(model.connections.length, 4);
  assert.ok(model.connections.some(net => net.includes('D1.K') && net.includes('B1-')));
  assert.ok(model.connections.some(net => net.includes('D1.A') && net.includes('R1.2')));
});

test('an ideal closed switch merges exactly two conductor groups', () => {
  // Trace terminal connectivity independently with a union-find graph.
  const parent = new Map(model.connections.flat().map(t => [t, t]));
  function find(t) { return parent.get(t) === t ? t : find(parent.get(t)); }
  function join(a, b) { parent.set(find(a), find(b)); }
  const count = () => new Set([...parent.keys()].map(find)).size;
  for (const [a, b] of model.connections) join(a, b);
  assert.equal(count(), 4);
  join('S1.1', 'S1.2');
  assert.equal(count(), 3);
  assert.notEqual(find('D1.A'), find('D1.K'), 'never merge through the LED');
  assert.notEqual(find('B1+'), find('B1-'), 'never merge through the battery');
});

test('comparison includes a selectable schematic and keeps its selection', () => {
  assert.equal(model.initial().view, 'comparison');
  const selected = model.select(model.initial(), 'component', 'led');
  assert.deepEqual(model.select(selected, 'view', 'schematic'), {view: 'schematic', component: 'led'});
});
