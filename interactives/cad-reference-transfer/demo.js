(function () {
  'use strict';
  var M = window.CourseWikiCadReferenceTransfer, D = window.CourseWikiCadReferenceDraw, sequence = 0;
  if (!M || !D) return;
  document.querySelectorAll('[data-interactive="cad-reference-transfer"]').forEach(function (root) {
    if (root.dataset.crtReady) return;
    root.dataset.crtReady = 'true';
    var instance = 'crt-' + (++sequence), scenarioId = 'drawing', graph, roots, selected;
    var live = document.createElement('div'); live.className = 'crt-lab';
    live.innerHTML = '<div class="crt-heading"><label for="' + instance + '-scenario">Teaching scenario<select id="' + instance + '-scenario" data-crt="scenario"></select></label><p data-crt="prompt"></p></div>' +
      '<p class="crt-scope"><strong>Declared teaching graph:</strong> each stable node ID represents one intended document; its display label and symbolic locator are separate. This lab reads or changes no files and does not reproduce a CAD system\'s search, cloud, or PDM rules.</p>' +
      '<div class="crt-workbench"><div><div class="crt-graph-scroll" tabindex="0" role="region" aria-label="Reference graph; scroll horizontally if needed" data-crt="graph"></div><p class="crt-legend"><span class="crt-key crt-key-root"></span> intended deliverable <span class="crt-key crt-key-included"></span> included <span class="crt-key crt-key-missing"></span> omitted <span class="crt-key crt-key-unavailable"></span> unavailable or unresolved. Arrow A → B means A requires B.</p></div><div class="crt-choices"><fieldset data-crt="roots"><legend>1 · Intended deliverables</legend></fieldset><fieldset data-crt="package"><legend>2 · Files selected for the package</legend></fieldset></div></div>' +
      '<fieldset class="crt-predict"><legend>3 · Predict before checking</legend><label><input type="radio" name="' + instance + '-prediction" value="complete"> All required references resolve</label><label><input type="radio" name="' + instance + '-prediction" value="incomplete"> At least one required reference is unresolved</label></fieldset>' +
      '<div class="crt-actions"><button type="button" data-crt="check">Check this package</button><button type="button" data-crt="collect">Select reachable available files</button><button type="button" data-crt="reset">Reset scenario</button></div>' +
      '<output class="crt-status" data-crt="status" aria-live="polite">Choose a scenario, intended deliverable, and package.</output><div class="crt-results" data-crt="results"></div><div class="crt-repairs" data-crt="repairs"></div>';
    root.insertBefore(live, root.firstChild); root.classList.add('crt-live');
    function q(key) { return live.querySelector('[data-crt="' + key + '"]'); }
    Object.keys(M.SCENARIOS).forEach(function (id) { var option = document.createElement('option'); option.value = id; option.textContent = M.SCENARIOS[id].title; q('scenario').appendChild(option); });
    function node(id) { return graph.nodes.find(function (item) { return item.id === id; }); }
    function checkedValues(box) { return Array.from(box.querySelectorAll('input:checked')).map(function (input) { return input.value; }); }
    function checkbox(node, name, checked, unavailable) {
      var label = document.createElement('label'); label.className = unavailable ? 'crt-choice-unavailable' : '';
      label.innerHTML = '<input type="checkbox" name="' + name + '" value="' + node.id + '"' + (checked ? ' checked' : '') + '><span><strong>' + node.label + '</strong><small>' + node.kind + ' · ' + node.locator + (unavailable ? ' · unavailable at source' : '') + '</small></span>';
      return label;
    }
    function report() { return M.analyzePackage(graph, roots, selected); }
    function list(ids) { return ids.length ? ids.map(function (id) { return node(id).label; }).join(', ') : 'none'; }
    function draw() { q('graph').innerHTML = D.graph(graph, report(), instance); }
    function renderChoices() {
      q('roots').querySelectorAll('label').forEach(function (label) { label.remove(); });
      q('package').querySelectorAll('label').forEach(function (label) { label.remove(); });
      graph.nodes.forEach(function (item) {
        q('roots').appendChild(checkbox(item, instance + '-root', roots.indexOf(item.id) >= 0, !item.available));
        q('package').appendChild(checkbox(item, instance + '-package', selected.indexOf(item.id) >= 0, !item.available));
      });
      q('roots').querySelectorAll('input').forEach(function (input) { input.addEventListener('change', function () {
        var next = checkedValues(q('roots'));
        if (!next.length) { input.checked = true; q('status').textContent = 'Keep at least one intended deliverable selected.'; return; }
        roots = next; update('Deliverables changed. Recheck the package against the new reachable set.');
      }); });
      q('package').querySelectorAll('input').forEach(function (input) { input.addEventListener('change', function () { selected = checkedValues(q('package')); update('Package selection changed. Predict, then check its actual reference state.'); }); });
    }
    function renderResults() {
      var r = report();
      q('results').innerHTML = '<div><strong>' + r.required.length + '</strong><span>reachable required nodes</span></div><div><strong>' + r.included.length + '</strong><span>available and selected</span></div><div><strong>' + r.missingFromPackage.length + '</strong><span>available but omitted</span></div><div><strong>' + r.unavailableFromSource.length + '</strong><span>unavailable at source</span></div><div><strong>' + r.unresolvedReferences.length + '</strong><span>symbolic-reference mismatch</span></div>';
      q('repairs').innerHTML = '';
      r.unresolvedReferences.forEach(function (edge) {
        var row = document.createElement('div'); row.className = 'crt-repair';
        row.innerHTML = '<p><strong>' + node(edge.from).label + '</strong> expects <code>' + edge.expected + '</code>, while the intended <strong>' + node(edge.to).label + '</strong> declares <code>' + edge.actual + '</code>.</p><button type="button">Retarget this declared edge</button>';
        row.querySelector('button').addEventListener('click', function () { graph = M.retarget(graph, edge.from, edge.to); update('Retargeted the exact declared edge. The node identity did not change; recheck package completeness.'); });
        q('repairs').appendChild(row);
      });
    }
    function update(message) { draw(); renderResults(); if (message) q('status').textContent = message; }
    function load(id) {
      scenarioId = id; graph = M.scenario(id); roots = graph.roots.slice(); selected = graph.initiallySelected.slice();
      q('scenario').value = id; q('prompt').textContent = graph.prompt; live.querySelectorAll('.crt-predict input').forEach(function (input) { input.checked = false; });
      renderChoices(); update('Scenario loaded. Select intended deliverables and package files, then predict before checking.');
    }
    q('scenario').addEventListener('change', function () { load(this.value); });
    q('check').addEventListener('click', function () {
      var r = report(), prediction = live.querySelector('.crt-predict input:checked'), matched = prediction && ((prediction.value === 'complete') === r.complete);
      var detail = r.complete ? 'Every reachable required edge resolves in this teaching graph.' : 'Available but omitted: ' + list(r.missingFromPackage) + '. Unavailable at source: ' + list(r.unavailableFromSource) + '. Locator mismatches: ' + r.unresolvedReferences.length + '.';
      q('status').textContent = (prediction ? (matched ? 'Prediction matches. ' : 'Compare your prediction. ') : 'Choose a prediction before the next check. ') + (r.complete ? 'Package complete. ' : 'Package incomplete. ') + detail;
    });
    q('collect').addEventListener('click', function () {
      var r = report(); selected = r.required.filter(function (id) { return node(id).available; }); renderChoices();
      update('Selected every reachable file that is available in this scenario. Source-unavailable nodes and locator mismatches still require separate repair.');
    });
    q('reset').addEventListener('click', function () { load(scenarioId); });
    load(scenarioId);
  });
})();
