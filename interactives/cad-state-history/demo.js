(function () {
  'use strict';
  var M = window.CadStateHistoryModel, scenarios = window.CadStateHistoryScenarios, R = window.CadStateHistoryRender;
  if (!M || !scenarios || !R) return;
  var mountCount = 0;

  document.querySelectorAll('[data-interactive="cad-state-history"]').forEach(function (root) {
    if (root.dataset.cshReady) return;
    root.dataset.cshReady = 'true';
    mountCount++;
    var prefix = 'csh-' + mountCount, scenario = scenarios.intro, state = M.initialize(scenario).state;
    var live = document.createElement('div'); live.className = 'csh-lab';
    root.appendChild(live); root.classList.add('csh-live');

    function make(tag, className, text) {
      var element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }
    function labelFor(text, control) {
      var label = make('label', '', text); label.htmlFor = control.id; return label;
    }
    function control(tag, key, idSuffix) {
      var element = make(tag); element.dataset.csh = key; element.id = prefix + '-' + idSuffix; return element;
    }

    var intro = make('div', 'csh-intro');
    intro.appendChild(make('p', '', 'Goal: edit the early Mounting sketch now, capture a fixed Design review snapshot, then make an independent Lightweight branch.'));
    intro.appendChild(make('p', '', 'Feature order answers “what regenerates first?” Chronological history answers “what changed when?” A snapshot is view-only; a workspace is editable.'));
    live.appendChild(intro);

    var controls = make('div', 'csh-controls'), edit = make('fieldset', 'csh-edit');
    edit.appendChild(make('legend', '', '1 · Record an edit in the active workspace'));
    var radios = make('div', 'csh-feature-choice');
    scenario.features.forEach(function (feature, index) {
      var option = control('input', 'feature', 'feature-' + feature.id); option.type = 'radio';
      option.name = prefix + '-feature'; option.value = feature.id; option.checked = index === 0;
      var wrapper = make('label'); wrapper.htmlFor = option.id; wrapper.appendChild(option); wrapper.appendChild(document.createTextNode(feature.name)); radios.appendChild(wrapper);
    });
    edit.appendChild(radios);
    var value = control('input', 'value', 'value'); value.type = 'number'; value.step = 'any';
    edit.appendChild(labelFor('New parameter value', value)); edit.appendChild(value);
    var range = make('span', 'csh-range'); range.dataset.csh = 'range'; edit.appendChild(range);
    var apply = control('button', 'edit', 'edit'); apply.type = 'button'; apply.textContent = 'Record edit now'; edit.appendChild(apply);
    controls.appendChild(edit);

    var milestones = make('fieldset', 'csh-milestones'); milestones.appendChild(make('legend', '', '2 · Preserve and explore a milestone'));
    var snapshotButton = control('button', 'snapshot', 'snapshot'); snapshotButton.type = 'button'; snapshotButton.textContent = 'Create “Design review” snapshot';
    var branchButton = control('button', 'branch', 'branch'); branchButton.type = 'button'; branchButton.textContent = 'Create “Lightweight” branch';
    milestones.appendChild(snapshotButton); milestones.appendChild(branchButton); controls.appendChild(milestones);

    var navigation = make('div', 'csh-navigation');
    var workspace = control('select', 'workspace', 'workspace'); navigation.appendChild(labelFor('Active editable workspace', workspace)); navigation.appendChild(workspace);
    var viewed = control('select', 'view', 'view'); navigation.appendChild(labelFor('State shown below', viewed)); navigation.appendChild(viewed);
    var reset = control('button', 'reset', 'reset'); reset.type = 'button'; reset.textContent = 'Reset lab'; navigation.appendChild(reset);
    controls.appendChild(navigation); live.appendChild(controls);

    var feedback = make('p', 'csh-feedback'); feedback.dataset.csh = 'feedback'; feedback.setAttribute('aria-live', 'polite'); live.appendChild(feedback);
    var panels = make('div', 'csh-panels');
    var orderPanel = make('section', 'csh-panel'); orderPanel.appendChild(make('h3', '', 'Feature order · regeneration sequence')); var order = make('div'); order.dataset.csh = 'order'; orderPanel.appendChild(order);
    var historyPanel = make('section', 'csh-panel'); historyPanel.appendChild(make('h3', '', 'Chronological edit history')); var history = make('div'); history.dataset.csh = 'history'; historyPanel.appendChild(history);
    panels.appendChild(orderPanel); panels.appendChild(historyPanel); live.appendChild(panels);
    var comparePanel = make('section', 'csh-panel csh-compare'); comparePanel.appendChild(make('h3', '', 'Declared state comparison')); var comparison = make('div', 'csh-table-wrap'); comparison.dataset.csh = 'comparison'; comparePanel.appendChild(comparison); live.appendChild(comparePanel);
    live.appendChild(make('p', 'csh-limits', 'Symbolic teaching model only: it changes local in-memory numbers and event cards. It does not open CAD, save files, restore or roll back a workspace, merge branches, or change sharing permissions. Vendor workflows and managed data systems can differ.'));

    function find(key) { return live.querySelector('[data-csh="' + key + '"]'); }
    function chosenFeature() { return live.querySelector('input[data-csh="feature"]:checked').value; }
    function feature(id) { return scenario.features.find(function (item) { return item.id === id; }); }
    function setFeedback(text) { feedback.textContent = text; }
    function refillSelect(select, options, selected) {
      select.replaceChildren();
      options.forEach(function (option) { var element = make('option', '', option.label); element.value = option.value; select.appendChild(element); });
      if (options.some(function (option) { return option.value === selected; })) select.value = selected;
    }
    function updateEditor() {
      var selected = feature(chosenFeature()), active = state.workspaces[state.activeWorkspaceId];
      value.min = selected.min; value.max = selected.max; value.value = active.values[selected.id];
      range.textContent = selected.parameter + ' · ' + selected.min + '–' + selected.max + ' ' + selected.unit;
    }
    function render() {
      var workspaceOptions = Object.keys(state.workspaces).map(function (id) { return { value: id, label: state.workspaces[id].name }; });
      refillSelect(workspace, workspaceOptions, state.activeWorkspaceId);
      var viewOptions = workspaceOptions.map(function (item) { return { value: 'workspace:' + item.value, label: item.label + ' · editable' }; });
      Object.keys(state.snapshots).forEach(function (id) { viewOptions.push({ value: 'snapshot:' + id, label: state.snapshots[id].name + ' · fixed snapshot' }); });
      refillSelect(viewed, viewOptions, state.view.kind + ':' + state.view.id);
      var inspected = M.inspect(state, state.view).view;
      R.renderFeatureOrder(order, scenario, inspected); R.renderHistory(history, scenario, inspected); R.renderComparison(comparison, scenario, state);
      snapshotButton.disabled = Object.prototype.hasOwnProperty.call(state.snapshots, 'design-review');
      branchButton.disabled = !Object.prototype.hasOwnProperty.call(state.snapshots, 'design-review') || Object.prototype.hasOwnProperty.call(state.workspaces, 'lightweight');
      updateEditor();
      live.dataset.activeWorkspace = state.activeWorkspaceId; live.dataset.view = state.view.kind + ':' + state.view.id;
    }
    function accept(result, success) {
      if (!result.ok) { setFeedback(result.error); return false; }
      state = result.state; setFeedback(success); render(); return true;
    }
    live.querySelectorAll('input[data-csh="feature"]').forEach(function (radio) { radio.addEventListener('change', updateEditor); });
    apply.addEventListener('click', function () {
      var selected = feature(chosenFeature()), raw = value.value.trim(), numeric = raw === '' ? NaN : Number(raw);
      accept(M.editFeature(state, { workspaceId: state.activeWorkspaceId, featureId: selected.id, value: numeric,
        summary: 'Edited ' + selected.name }), 'Edit recorded now. The feature stayed in position ' + (scenario.features.indexOf(selected) + 1) + ' of the feature order.');
    });
    snapshotButton.addEventListener('click', function () {
      accept(M.createSnapshot(state, { workspaceId: state.activeWorkspaceId, snapshotId: 'design-review', name: 'Design review' }), 'Snapshot created. Future workspace edits will not change its captured values.');
    });
    branchButton.addEventListener('click', function () {
      var result = M.createBranch(state, { snapshotId: 'design-review', workspaceId: 'lightweight', name: 'Lightweight branch' });
      if (!result.ok) { setFeedback(result.error); return; }
      state = result.state; state = M.activateWorkspace(state, 'lightweight').state;
      setFeedback('Branch created from the fixed snapshot. Edits now affect only Lightweight branch. Try Base extrude = 8 mm.'); render();
    });
    workspace.addEventListener('change', function () { accept(M.activateWorkspace(state, workspace.value), 'Active workspace changed. No design edit was recorded.'); });
    viewed.addEventListener('change', function () {
      var parts = viewed.value.split(':');
      accept(M.viewState(state, { kind: parts[0], id: parts[1] }), parts[0] === 'snapshot' ? 'Viewing a fixed snapshot. This did not restore or edit either workspace.' : 'Viewing an editable workspace.');
    });
    reset.addEventListener('click', function () { accept(M.reset(state), 'Reset to the original teaching state.'); });
    setFeedback('First: keep Mounting sketch selected, enter 72 mm, and record the edit.'); render();
  });
})();
