(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CadStateHistoryRender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function node(doc, tag, className, text) {
    var element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function featureMap(scenario) {
    var map = {};
    scenario.features.forEach(function (feature) { map[feature.id] = feature; });
    return map;
  }
  function eventText(entry, features) {
    if (entry.type === 'workspace-created') return entry.label;
    if (entry.type === 'feature-edited') {
      var feature = features[entry.featureId];
      return entry.label + ': ' + feature.name + ' ' + feature.parameter + ' = ' + entry.value + ' ' + feature.unit;
    }
    if (entry.type === 'snapshot-created') return 'Snapshot fixed: ' + entry.label;
    if (entry.type === 'branch-created') return 'Branch workspace created: ' + entry.label;
    return entry.label;
  }
  function renderFeatureOrder(container, scenario, view) {
    var doc = container.ownerDocument, features = featureMap(scenario), list = node(doc, 'ol', 'csh-feature-list');
    view.featureOrder.forEach(function (id) {
      var feature = features[id], item = node(doc, 'li', 'csh-feature');
      item.appendChild(node(doc, 'strong', '', feature.name));
      item.appendChild(node(doc, 'span', '', feature.parameter + ': ' + view.values[id] + ' ' + feature.unit));
      list.appendChild(item);
    });
    container.replaceChildren(list);
  }
  function renderHistory(container, scenario, view) {
    var doc = container.ownerDocument, features = featureMap(scenario), list = node(doc, 'ol', 'csh-history-list');
    view.history.forEach(function (entry) {
      var item = node(doc, 'li', 'csh-history-event');
      item.appendChild(node(doc, 'span', 'csh-sequence', String(entry.sequence)));
      item.appendChild(node(doc, 'span', '', eventText(entry, features)));
      list.appendChild(item);
    });
    container.replaceChildren(list);
  }
  function stateRows(state) {
    var rows = [];
    Object.keys(state.workspaces).forEach(function (id) { rows.push({ kind: 'workspace', item: state.workspaces[id] }); });
    Object.keys(state.snapshots).forEach(function (id) { rows.push({ kind: 'snapshot', item: state.snapshots[id] }); });
    return rows;
  }
  function renderComparison(container, scenario, state) {
    var doc = container.ownerDocument, table = node(doc, 'table', 'csh-comparison'), head = node(doc, 'thead'), headRow = node(doc, 'tr');
    ['State'].concat(scenario.features.map(function (feature) { return feature.name; })).forEach(function (label) { headRow.appendChild(node(doc, 'th', '', label)); });
    head.appendChild(headRow); table.appendChild(head);
    var body = node(doc, 'tbody');
    stateRows(state).forEach(function (row) {
      var tr = node(doc, 'tr');
      tr.appendChild(node(doc, 'th', '', row.item.name + (row.kind === 'snapshot' ? ' · fixed snapshot' : ' · editable')));
      scenario.features.forEach(function (feature) { tr.appendChild(node(doc, 'td', '', row.item.values[feature.id] + ' ' + feature.unit)); });
      body.appendChild(tr);
    });
    table.appendChild(body); container.replaceChildren(table);
  }
  return { renderFeatureOrder: renderFeatureOrder, renderHistory: renderHistory, renderComparison: renderComparison };
});
