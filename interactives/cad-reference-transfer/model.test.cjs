'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('./model.js');

test('drawing closure includes its referenced model', () => {
  const graph = M.scenario('drawing');
  assert.deepEqual(M.closure(graph, graph.roots).required, ['bracket-drawing', 'bracket-model']);
  assert.deepEqual(M.analyzePackage(graph, graph.roots, []).missingFromPackage, ['bracket-drawing', 'bracket-model']);
  const report = M.analyzePackage(graph, graph.roots, ['bracket-drawing']);
  assert.deepEqual(report.missingFromPackage, ['bracket-model']);
  assert.equal(report.complete, false);
  assert.equal(M.analyzePackage(graph, graph.roots, ['bracket-drawing', 'bracket-model']).complete, true);
});

test('transitive closure deduplicates a shared component and supports multiple roots', () => {
  const graph = M.scenario('shared');
  const fromDrawing = M.closure(graph, ['clamp-drawing']);
  assert.deepEqual(new Set(fromDrawing.required), new Set(['clamp-drawing', 'clamp-assembly', 'left-arm', 'right-arm', 'base', 'shared-pin']));
  assert.equal(fromDrawing.required.filter(id => id === 'shared-pin').length, 1);
  const twoRoots = M.closure(graph, ['clamp-drawing', 'right-arm']);
  assert.equal(twoRoots.required.filter(id => id === 'shared-pin').length, 1);
  assert.equal(twoRoots.required.length, 6);
});

test('static fallback uses the canonical shared-component locator', () => {
  const graph = M.scenario('shared');
  const locator = graph.nodes.find(node => node.id === 'shared-pin').locator;
  const page = fs.readFileSync(path.join(__dirname, '../../collections/engineering-graphics/pages/cad-files-and-documents.html'), 'utf8');
  const fallback = page.match(/<div class="crt-static">([\s\S]*?)<\/div>\s*<\/div>\s*<p>Use a reference-aware workflow/);
  assert.ok(fallback, 'static fallback remains inside the interactive mount');
  assert.match(fallback[1], new RegExp('>' + locator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '<'));
});

test('package omission and source unavailability remain distinct', () => {
  const graph = M.scenario('unavailable');
  const omitted = M.analyzePackage(graph, graph.roots, ['fixture-assembly']);
  assert.deepEqual(omitted.missingFromPackage, ['frame']);
  assert.deepEqual(omitted.unavailableFromSource, ['motor']);
  assert.deepEqual(omitted.selectedButUnavailable, []);
  const checkedUnavailable = M.analyzePackage(graph, graph.roots, ['fixture-assembly', 'frame', 'motor']);
  assert.deepEqual(checkedUnavailable.missingFromPackage, []);
  assert.deepEqual(checkedUnavailable.unavailableFromSource, ['motor']);
  assert.deepEqual(checkedUnavailable.selectedButUnavailable, ['motor']);
  assert.equal(checkedUnavailable.complete, false, 'selecting an unavailable source cannot make the package complete');
});

test('retarget updates only the intended symbolic reference', () => {
  const graph = M.scenario('retarget');
  const before = M.analyzePackage(graph, graph.roots, graph.initiallySelected);
  assert.deepEqual(before.unresolvedReferences, [{ from: 'guard-assembly', to: 'cover', expected: 'cover.sldprt', actual: 'cover-rev-b.sldprt' }]);
  assert.equal(before.complete, false);
  const fixed = M.retarget(graph, 'guard-assembly', 'cover');
  assert.equal(M.analyzePackage(fixed, fixed.roots, fixed.initiallySelected).complete, true);
  assert.equal(fixed.edges.find(edge => edge.from === 'guard-drawing').locator, 'guard.sldasm');
  assert.equal(graph.edges.find(edge => edge.from === 'guard-assembly').locator, 'cover.sldprt', 'input graph remains unchanged');
});

test('retarget supports a validated minimal graph without scenario metadata', () => {
  const graph = { nodes: [
    { id: 'assembly', label: 'Assembly', kind: 'assembly', locator: 'assembly.sldasm', available: true },
    { id: 'part', label: 'Part', kind: 'part', locator: 'part-new.sldprt', available: true }
  ], edges: [{ from: 'assembly', to: 'part', locator: 'part-old.sldprt' }] };
  const fixed = M.retarget(graph, 'assembly', 'part');
  assert.equal(fixed.edges[0].locator, 'part-new.sldprt');
  assert.equal(graph.edges[0].locator, 'part-old.sldprt');
  assert.equal(Object.hasOwn(fixed, 'roots'), false);
});

test('display labels do not define reference identity', () => {
  const graph = M.scenario('drawing');
  graph.nodes.find(node => node.id === 'bracket-model').label = 'Mounting bracket, polished';
  assert.equal(M.analyzePackage(graph, graph.roots, ['bracket-drawing', 'bracket-model']).complete, true);
});

test('cycles terminate while reachable nodes remain deduplicated', () => {
  const graph = { nodes: [
    { id: 'a', label: 'A', kind: 'assembly', locator: 'a.sldasm', available: true },
    { id: 'b', label: 'B', kind: 'subassembly', locator: 'b.sldasm', available: true }
  ], edges: [
    { from: 'a', to: 'b', locator: 'b.sldasm' },
    { from: 'b', to: 'a', locator: 'a.sldasm' }
  ] };
  assert.deepEqual(M.closure(graph, ['a']).required, ['a', 'b']);
  assert.equal(M.analyzePackage(graph, ['a'], ['a', 'b']).complete, true);
});

test('validation rejects duplicate ids, malformed edges, unknown roots and unknown package ids', () => {
  const graph = M.scenario('drawing');
  assert.throws(() => M.validateGraph({ nodes: [graph.nodes[0], graph.nodes[0]], edges: [] }), /Duplicate node id/);
  assert.throws(() => M.validateGraph({ nodes: graph.nodes, edges: [{ from: 'bracket-drawing', to: 'missing', locator: 'x.sldprt' }] }), /unknown node/);
  assert.throws(() => M.validateGraph({ nodes: graph.nodes, edges: [{ from: 'bracket-drawing', to: 'bracket-model' }] }), /requires from, to, and locator/);
  assert.throws(() => M.closure(graph, ['missing']), /unknown id/);
  assert.throws(() => M.analyzePackage(graph, graph.roots, ['missing']), /unknown id/);
});
