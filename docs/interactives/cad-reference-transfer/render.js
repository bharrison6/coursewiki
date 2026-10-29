(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiCadReferenceDraw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var rank = { drawing: 0, assembly: 1, subassembly: 2, part: 3 };
  function esc(value) { return String(value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function lookup(list) { var out = Object.create(null); list.forEach(function (value) { out[value] = true; }); return out; }
  function graph(graph, report, prefix) {
    var groups = [[], [], [], []], roots = lookup(report.roots), required = lookup(report.required), included = lookup(report.included);
    var missing = lookup(report.missingFromPackage), unavailable = lookup(report.unavailableFromSource), extras = lookup(report.extras);
    var unresolved = Object.create(null), unresolvedEdges = Object.create(null);
    report.unresolvedReferences.forEach(function (edge) { unresolved[edge.to] = true; unresolvedEdges[edge.from + '\u0000' + edge.to] = true; });
    graph.nodes.forEach(function (node) { groups[rank[node.kind]].push(node); });
    var maxRows = Math.max.apply(Math, groups.map(function (items) { return Math.max(1, items.length); }));
    var width = 850, height = Math.max(190, maxRows * 92 + 70), nodeW = 166, nodeH = 58, positions = Object.create(null);
    groups.forEach(function (items, column) {
      var available = height - 70, step = available / Math.max(1, items.length);
      items.forEach(function (node, row) { positions[node.id] = { x: 25 + column * 215, y: 42 + row * step, node: node }; });
    });
    var marker = esc(prefix) + '-arrow', out = [];
    out.push('<svg class="crt-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Directed CAD reference graph. Arrows point from a document to each document it requires."><defs><marker id="' + marker + '" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0L9 4.5L0 9Z"/></marker></defs>');
    graph.edges.forEach(function (edge) {
      var from = positions[edge.from], to = positions[edge.to];
      if (!from || !to) return;
      var x1 = from.x + nodeW, y1 = from.y + nodeH / 2, x2 = to.x, y2 = to.y + nodeH / 2;
      var bend = (x1 + x2) / 2, broken = unresolvedEdges[edge.from + '\u0000' + edge.to] ? ' crt-edge-broken' : '';
      out.push('<path class="crt-edge' + broken + '" d="M' + x1 + ' ' + y1 + 'H' + bend + 'V' + y2 + 'H' + x2 + '" marker-end="url(#' + marker + ')"><title>' + esc(from.node.label + ' requires ' + to.node.label) + '</title></path>');
    });
    graph.nodes.forEach(function (node) {
      var p = positions[node.id], classes = ['crt-node'];
      if (roots[node.id]) classes.push('crt-root');
      if (unavailable[node.id]) classes.push('crt-unavailable');
      else if (unresolved[node.id]) classes.push('crt-unresolved');
      else if (missing[node.id]) classes.push('crt-missing');
      else if (included[node.id]) classes.push('crt-included');
      else if (extras[node.id]) classes.push('crt-extra');
      else if (required[node.id]) classes.push('crt-required');
      out.push('<g class="' + classes.join(' ') + '"><rect x="' + p.x + '" y="' + p.y + '" width="' + nodeW + '" height="' + nodeH + '" rx="7"/><text x="' + (p.x + 10) + '" y="' + (p.y + 22) + '"><tspan class="crt-node-label">' + esc(node.label) + '</tspan><tspan x="' + (p.x + 10) + '" dy="20" class="crt-node-locator">' + esc(node.locator) + '</tspan></text></g>');
    });
    out.push('</svg>'); return out.join('');
  }
  return { graph: graph };
});
