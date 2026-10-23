'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const OG = require('./engine.js');
const NET = require('./net.js');
const VIEW = require('./network-view.js');

test('architecture counts come from the live supervised model arrays', () => {
  const model = NET.newSupervised(OG.newAgent(), 'network-view-shape');
  assert.deepEqual(VIEW.architecture(model.net), {
    inputs: 29, h1: 28, h2: 18, outputs: 1,
    weights: 1334, biases: 47, params: 1381
  });
});

test('signed weight colors preserve negative, neutral, and positive meaning', () => {
  assert.equal(VIEW.weightColor(0, 1), 'rgb(10, 49, 97)');
  assert.equal(VIEW.weightColor(-1, 1), 'rgb(184, 129, 183)');
  assert.equal(VIEW.weightColor(1, 1), 'rgb(236, 172, 0)');
  assert.notEqual(VIEW.weightColor(-0.4, 1), VIEW.weightColor(0.4, 1));
});

test('each inspector layer reads the correct incoming weight indices', () => {
  const net = {
    H1: 2, H2: 3,
    W1: Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7]), b1: Float32Array.from([8, 9]),
    W2: Float32Array.from([100, 101, 102, 103, 104, 105]), b2: Float32Array.from([106, 107, 108]),
    W3: Float32Array.from([200, 201, 202]), b3: 203,
    a1: Float32Array.from([1, 0]), a2: Float32Array.from([0, 2, 3])
  };
  const inputs = Array.from({ length: 4 }, (_, i) => ({ label: `input ${i}`, active: i === 0 }));
  assert.deepEqual(VIEW.inspectLayer(net, 'W1', 1, inputs).rows.map(r => r.value), [1, 3, 5, 7]);
  assert.deepEqual(VIEW.inspectLayer(net, 'W2', 2, inputs).rows.map(r => r.value), [102, 105]);
  assert.deepEqual(VIEW.inspectLayer(net, 'W3', 0, inputs).rows.map(r => r.value), [200, 201, 202]);
});

test('rendering the inspector leaves every weight and bias unchanged', () => {
  const model = NET.newSupervised(OG.newAgent(), 'network-view-read-only');
  NET.predict(model, 0);
  const before = VIEW.snapshot(model.net);
  const container = {
    dataset: {}, innerHTML: '',
    querySelector: () => ({ addEventListener() {}, focus() {} })
  };
  VIEW.render(container, {
    net: model.net, initial: before,
    inputs: Array.from({ length: 29 }, (_, i) => ({ label: `input ${i + 1}`, active: i < 10 })),
    boardLabel: 'the current test board'
  });
  assert.deepEqual(VIEW.snapshot(model.net), before);
  assert.match(container.innerHTML, /1,381 parameters/);
  assert.match(container.innerHTML, /Simplified connected overview/);
});
