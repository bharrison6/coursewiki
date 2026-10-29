(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiCadReferenceTransfer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KINDS = Object.freeze(['part', 'subassembly', 'assembly', 'drawing']);

  var SCENARIOS = Object.freeze({
    drawing: Object.freeze({
      id: 'drawing', title: 'Drawing and model', prompt: 'Package the drawing so its model view can resolve.',
      roots: Object.freeze(['bracket-drawing']), initiallySelected: Object.freeze(['bracket-drawing']),
      nodes: Object.freeze([
        Object.freeze({ id: 'bracket-drawing', label: 'Bracket drawing', kind: 'drawing', locator: 'bracket.slddrw', available: true }),
        Object.freeze({ id: 'bracket-model', label: 'Bracket model', kind: 'part', locator: 'bracket.sldprt', available: true })
      ]),
      edges: Object.freeze([Object.freeze({ from: 'bracket-drawing', to: 'bracket-model', locator: 'bracket.sldprt' })])
    }),
    shared: Object.freeze({
      id: 'shared', title: 'Assembly with a shared component',
      prompt: 'Follow every required edge. The shared pin belongs in the package once.',
      roots: Object.freeze(['clamp-drawing']), initiallySelected: Object.freeze(['clamp-drawing', 'clamp-assembly', 'left-arm', 'base']),
      nodes: Object.freeze([
        Object.freeze({ id: 'clamp-drawing', label: 'Clamp drawing', kind: 'drawing', locator: 'clamp.slddrw', available: true }),
        Object.freeze({ id: 'clamp-assembly', label: 'Clamp assembly', kind: 'assembly', locator: 'clamp.sldasm', available: true }),
        Object.freeze({ id: 'left-arm', label: 'Left arm subassembly', kind: 'subassembly', locator: 'left-arm.sldasm', available: true }),
        Object.freeze({ id: 'right-arm', label: 'Right arm subassembly', kind: 'subassembly', locator: 'right-arm.sldasm', available: true }),
        Object.freeze({ id: 'shared-pin', label: 'Shared pivot pin', kind: 'part', locator: 'pivot-pin.sldprt', available: true }),
        Object.freeze({ id: 'base', label: 'Clamp base', kind: 'part', locator: 'base.sldprt', available: true })
      ]),
      edges: Object.freeze([
        Object.freeze({ from: 'clamp-drawing', to: 'clamp-assembly', locator: 'clamp.sldasm' }),
        Object.freeze({ from: 'clamp-assembly', to: 'left-arm', locator: 'left-arm.sldasm' }),
        Object.freeze({ from: 'clamp-assembly', to: 'right-arm', locator: 'right-arm.sldasm' }),
        Object.freeze({ from: 'clamp-assembly', to: 'base', locator: 'base.sldprt' }),
        Object.freeze({ from: 'left-arm', to: 'shared-pin', locator: 'pivot-pin.sldprt' }),
        Object.freeze({ from: 'right-arm', to: 'shared-pin', locator: 'pivot-pin.sldprt' })
      ])
    }),
    unavailable: Object.freeze({
      id: 'unavailable', title: 'Unavailable source component',
      prompt: 'A checked box cannot create a source file that is unavailable.',
      roots: Object.freeze(['fixture-assembly']), initiallySelected: Object.freeze(['fixture-assembly', 'frame', 'motor']),
      nodes: Object.freeze([
        Object.freeze({ id: 'fixture-assembly', label: 'Test fixture assembly', kind: 'assembly', locator: 'fixture.sldasm', available: true }),
        Object.freeze({ id: 'frame', label: 'Fixture frame', kind: 'part', locator: 'frame.sldprt', available: true }),
        Object.freeze({ id: 'motor', label: 'Purchased motor model', kind: 'part', locator: 'motor-42.sldprt', available: false })
      ]),
      edges: Object.freeze([
        Object.freeze({ from: 'fixture-assembly', to: 'frame', locator: 'frame.sldprt' }),
        Object.freeze({ from: 'fixture-assembly', to: 'motor', locator: 'motor-42.sldprt' })
      ])
    }),
    retarget: Object.freeze({
      id: 'retarget', title: 'Changed symbolic locator',
      prompt: 'The cover has a new declared locator. Retarget the exact reference that still expects the old locator.',
      roots: Object.freeze(['guard-drawing']), initiallySelected: Object.freeze(['guard-drawing', 'guard-assembly', 'cover']),
      nodes: Object.freeze([
        Object.freeze({ id: 'guard-drawing', label: 'Guard drawing', kind: 'drawing', locator: 'guard.slddrw', available: true }),
        Object.freeze({ id: 'guard-assembly', label: 'Guard assembly', kind: 'assembly', locator: 'guard.sldasm', available: true }),
        Object.freeze({ id: 'cover', label: 'Clear cover', kind: 'part', locator: 'cover-rev-b.sldprt', available: true })
      ]),
      edges: Object.freeze([
        Object.freeze({ from: 'guard-drawing', to: 'guard-assembly', locator: 'guard.sldasm' }),
        Object.freeze({ from: 'guard-assembly', to: 'cover', locator: 'cover.sldprt' })
      ])
    })
  });

  function fail(message) { throw new TypeError(message); }
  function isText(value) { return typeof value === 'string' && value.trim().length > 0; }
  function copyGraph(graph) {
    var copy = Object.assign({}, graph, {
      nodes: graph.nodes.map(function (node) { return Object.assign({}, node); }),
      edges: graph.edges.map(function (edge) { return Object.assign({}, edge); })
    });
    if (Array.isArray(graph.roots)) copy.roots = graph.roots.slice();
    if (Array.isArray(graph.initiallySelected)) copy.initiallySelected = graph.initiallySelected.slice();
    return copy;
  }

  function validateGraph(graph) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) fail('Graph requires node and edge arrays.');
    var byId = Object.create(null);
    graph.nodes.forEach(function (node, index) {
      if (!node || !isText(node.id) || !isText(node.label) || !isText(node.locator)) fail('Node ' + index + ' requires id, label, and locator.');
      if (KINDS.indexOf(node.kind) < 0) fail('Node ' + node.id + ' has an unknown kind.');
      if (typeof node.available !== 'boolean') fail('Node ' + node.id + ' requires a source-availability flag.');
      if (byId[node.id]) fail('Duplicate node id: ' + node.id + '.');
      byId[node.id] = node;
    });
    var edgeKeys = Object.create(null);
    graph.edges.forEach(function (edge, index) {
      if (!edge || !isText(edge.from) || !isText(edge.to) || !isText(edge.locator)) fail('Edge ' + index + ' requires from, to, and locator.');
      if (!byId[edge.from] || !byId[edge.to]) fail('Edge ' + edge.from + ' -> ' + edge.to + ' names an unknown node.');
      var key = edge.from + '\u0000' + edge.to;
      if (edgeKeys[key]) fail('Duplicate required edge: ' + edge.from + ' -> ' + edge.to + '.');
      edgeKeys[key] = true;
    });
    return { graph: graph, byId: byId };
  }

  function uniqueIds(ids, label, byId, allowEmpty) {
    if (!Array.isArray(ids) || (!allowEmpty && ids.length === 0)) fail(label + ' requires at least one id.');
    var seen = Object.create(null);
    return ids.map(function (id) {
      if (!isText(id) || !byId[id]) fail(label + ' names unknown id: ' + id + '.');
      if (seen[id]) fail(label + ' repeats id: ' + id + '.');
      seen[id] = true; return id;
    });
  }

  function closure(graph, rootIds) {
    var checked = validateGraph(graph), roots = uniqueIds(rootIds, 'Roots', checked.byId), outgoing = Object.create(null);
    graph.edges.forEach(function (edge) { (outgoing[edge.from] || (outgoing[edge.from] = [])).push(edge); });
    var queue = roots.slice(), visited = Object.create(null), required = [], edges = [];
    while (queue.length) {
      var id = queue.shift();
      if (visited[id]) continue;
      visited[id] = true; required.push(id);
      (outgoing[id] || []).forEach(function (edge) { edges.push(edge); if (!visited[edge.to]) queue.push(edge.to); });
    }
    return { roots: roots, required: required, edges: edges };
  }

  function analyzePackage(graph, rootIds, selectedIds) {
    var checked = validateGraph(graph), selected = uniqueIds(selectedIds, 'Package selection', checked.byId, true);
    var reach = closure(graph, rootIds), requiredSet = Object.create(null), selectedSet = Object.create(null);
    reach.required.forEach(function (id) { requiredSet[id] = true; }); selected.forEach(function (id) { selectedSet[id] = true; });
    var unavailable = reach.required.filter(function (id) { return !checked.byId[id].available; });
    var missing = reach.required.filter(function (id) { return checked.byId[id].available && !selectedSet[id]; });
    var unresolved = reach.edges.filter(function (edge) { return edge.locator !== checked.byId[edge.to].locator; }).map(function (edge) {
      return { from: edge.from, to: edge.to, expected: edge.locator, actual: checked.byId[edge.to].locator };
    });
    var included = selected.filter(function (id) { return checked.byId[id].available; });
    var selectedButUnavailable = selected.filter(function (id) { return !checked.byId[id].available; });
    return { complete: missing.length === 0 && unavailable.length === 0 && unresolved.length === 0,
      roots: reach.roots, required: reach.required, included: included, missingFromPackage: missing,
      unavailableFromSource: unavailable, selectedButUnavailable: selectedButUnavailable,
      unresolvedReferences: unresolved, extras: selected.filter(function (id) { return !requiredSet[id]; }) };
  }

  function retarget(graph, fromId, toId) {
    var checked = validateGraph(graph), found = false, next = copyGraph(graph);
    next.edges = next.edges.map(function (edge) {
      if (edge.from !== fromId || edge.to !== toId) return edge;
      found = true; return Object.assign({}, edge, { locator: checked.byId[toId].locator });
    });
    if (!found) fail('No required edge exists from ' + fromId + ' to ' + toId + '.');
    return next;
  }

  function scenario(id) {
    if (!Object.prototype.hasOwnProperty.call(SCENARIOS, id)) fail('Unknown scenario: ' + id + '.');
    return copyGraph(SCENARIOS[id]);
  }

  return { KINDS: KINDS, SCENARIOS: SCENARIOS, scenario: scenario, validateGraph: validateGraph,
    closure: closure, analyzePackage: analyzePackage, retarget: retarget };
});
