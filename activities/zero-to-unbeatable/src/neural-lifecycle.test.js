/* Exercise the actual app lifecycle functions with controlled animation frames.
   Run: node --test src/neural-lifecycle.test.js
   DOM rendering and unrelated reset helpers are inert; training uses real NET/OG. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const OG = require('./engine.js');
const NET = require('./net.js');

const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
function appFunction(name) {
  // Top-level declarations begin at column zero; retain the implementation
  // verbatim rather than rewriting its cancellation conditions in this test.
  const declaration = new RegExp('^(?:async )?function ' + name + '\\(', 'm');
  const start = source.search(declaration);
  assert.notEqual(start, -1, 'app function exists: ' + name);
  const end = source.indexOf('\n}', start);
  assert.notEqual(end, -1, 'app function closes: ' + name);
  return source.slice(start, end + 2);
}

function harness(phase) {
  const frames = [], effects = [], nodes = new Map();
  function object(label) {
    const children = new Map();
    return new Proxy({}, {
      get(target, key) {
        if (key in target) return target[key];
        if (['remove', 'add', 'toggle'].includes(key)) {
          return (...args) => effects.push([label + '.' + key, ...args]);
        }
        if (!children.has(key)) children.set(key, object(label + '.' + String(key)));
        return children.get(key);
      },
      set(target, key, value) {
        effects.push([label + '.' + String(key), value]);
        target[key] = value;
        return true;
      }
    });
  }
  const S = { seed: 'lifecycle-test', neuralRun: 0, neural: null,
    teacherSession: null, neuralBurst: 1024, training: false, cancelTraining: false };
  if (phase === 'fitting') {
    const model = NET.newSupervised(OG.newAgent(), S.seed);
    S.neural = { model, metrics: NET.metrics(model), checkpoints: new Map() };
  }
  const context = vm.createContext({
    S, OG, NET, NETWORK_VIEW: { snapshot: () => ({}) },
    ULT: { newBrain: () => ({}) }, RULES: { DEPTHS: [] },
    $: selector => {
      if (!nodes.has(selector)) nodes.set(selector, object(selector));
      return nodes.get(selector);
    },
    fmt: String,
    raf: () => new Promise(resolve => frames.push(resolve)),
    makeEra: () => ({}), resetRuleTally: () => {},
    applyMode: () => effects.push(['applyMode']),
    renderTrain: () => effects.push(['renderTrain']),
    renderBanner: () => effects.push(['renderBanner']),
    renderNetworkInspector: () => effects.push(['renderNetworkInspector']),
    newGame: () => effects.push(['newGame']),
    recordNeuralCheckpoint: () => effects.push(['checkpoint'])
  });
  vm.runInContext(appFunction('resetAll') + '\n' + appFunction('trainNeural'), context);
  return { context, S, frames, effects };
}

for (const phase of ['preparation', 'fitting']) {
  const finalFrame = phase === 'preparation' ? 40 : 2;
  for (const boundary of [1, finalFrame]) {
    test('reset during ' + phase + ' at frame ' + boundary + ' retires the pending run', async () => {
      const h = harness(phase);
      const pending = h.context.trainNeural();
      // Attach a rejection handler immediately; the assertion below observes it.
      const outcome = pending.then(() => ({ error: null }), error => ({ error }));
      for (let frame = 1; frame < boundary; frame++) {
        assert.equal(h.frames.length, 1, 'training reached the expected frame');
        h.frames.shift()();
        await new Promise(setImmediate); // Flush cross-context promise adoption.
      }
      assert.equal(h.frames.length, 1, 'reset happens while a real training frame is pending');
      assert.ok(h.effects.length > 0, 'the harness observes real training UI writes');
      h.context.resetAll();
      assert.equal(h.S.neural, null);
      assert.equal(h.S.teacherSession, null);
      h.effects.length = 0; // Reset's own rendering is expected and permitted.
      h.frames.shift()();
      const result = await outcome;
      assert.equal(result.error, null, result.error && result.error.stack);
      assert.equal(h.S.neural, null, 'the retired run must not publish a model');
      assert.equal(h.S.teacherSession, null, 'the retired teacher must stay discarded');
      assert.equal(h.S.training, false, 'reset leaves no active training flag');
      assert.equal(h.frames.length, 0, 'the retired run must not schedule another frame');
      assert.deepEqual(h.effects, [], 'no stale checkpoint, renderer, new game, or DOM write after reset');
    });
  }

  test('uninterrupted ' + phase + ' publishes a checkpoint and finalizes the UI', async () => {
    const h = harness(phase);
    const pending = h.context.trainNeural();
    for (let frame = 0; frame < finalFrame; frame++) {
      assert.equal(h.frames.length, 1);
      h.frames.shift()();
      await new Promise(setImmediate);
    }
    await pending;
    assert.ok(h.S.neural, 'a healthy run retains or publishes its model');
    assert.equal(h.S.training, false);
    for (const name of ['checkpoint', 'renderTrain', 'renderBanner', 'newGame']) {
      assert.ok(h.effects.some(effect => effect[0] === name), 'positive control observes ' + name);
    }
  });
}
