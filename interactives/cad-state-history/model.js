/* Symbolic state-history model. It distinguishes feature/regeneration order from
   chronological edit order. A snapshot is a fixed, deeply copied teaching state;
   a branch is an independent editable workspace created from one snapshot.
   Restore, rollback, merge, permissions, files, and vendor CAD APIs are not modeled. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CadStateHistoryModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ID_RX = /^[a-z][a-z0-9-]{0,39}$/;
  var own = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
  function plain(value) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (plain(value)) {
      var copy = {};
      Object.keys(value).forEach(function (key) { copy[key] = clone(value[key]); });
      return copy;
    }
    return value;
  }
  function freeze(value) {
    if (Array.isArray(value) || plain(value)) {
      Object.keys(value).forEach(function (key) { freeze(value[key]); });
      Object.freeze(value);
    }
    return value;
  }
  function validId(value) { return typeof value === 'string' && ID_RX.test(value); }
  function validName(value) {
    return typeof value === 'string' && value === value.trim() && value.length >= 1 && value.length <= 60 && !/[\x00-\x1f\x7f]/.test(value);
  }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function failure(state, error) { return { ok: false, state: state || null, error: error }; }
  function freezeFixedState(state) {
    freeze(state.scenario);
    Object.keys(state.snapshots).forEach(function (id) { freeze(state.snapshots[id]); });
    return state;
  }
  function validateScenario(scenario) {
    if (!plain(scenario) || !validId(scenario.id) || !validName(scenario.name)) return 'The scenario needs a valid ID and name.';
    if (!plain(scenario.workspace) || !validId(scenario.workspace.id) || !validName(scenario.workspace.name)) return 'The starting workspace needs a valid ID and name.';
    if (!Array.isArray(scenario.features) || scenario.features.length < 2) return 'The scenario needs at least two ordered features.';
    var ids = Object.create(null);
    for (var i = 0; i < scenario.features.length; i++) {
      var feature = scenario.features[i];
      if (!plain(feature) || !validId(feature.id) || !validName(feature.name) || !validName(feature.parameter) || !validName(feature.unit)) return 'Every feature needs valid labels and an ID.';
      if (ids[feature.id]) return 'Feature IDs must be unique.';
      ids[feature.id] = true;
      if (![feature.value, feature.min, feature.max].every(finite) || feature.min > feature.max || feature.value < feature.min || feature.value > feature.max) return 'Feature values and ranges must be finite and internally consistent.';
    }
    return '';
  }
  function exactKeys(object, expected) {
    if (!plain(object)) return false;
    var actual = Object.keys(object).sort(), wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function (key, index) { return key === wanted[index]; });
  }
  function validFeatureState(item, orderedIds, features) {
    if (!Array.isArray(item.featureOrder) || item.featureOrder.length !== orderedIds.length ||
      !item.featureOrder.every(function (id, index) { return id === orderedIds[index]; }) ||
      !exactKeys(item.values, orderedIds)) return false;
    return orderedIds.every(function (id) {
      var value = item.values[id], feature = features[id];
      return finite(value) && value >= feature.min && value <= feature.max;
    });
  }
  function validHistory(history, features, snapshots, nextSequence) {
    if (!Array.isArray(history) || history.length < 1) return false;
    var previous = 0;
    return history.every(function (entry) {
      if (!plain(entry) || !Number.isSafeInteger(entry.sequence) || entry.sequence <= previous || entry.sequence >= nextSequence ||
        !['workspace-created', 'feature-edited', 'snapshot-created', 'branch-created'].includes(entry.type) || !validName(entry.label)) return false;
      previous = entry.sequence;
      if (entry.type === 'feature-edited') {
        return validId(entry.featureId) && own(features, entry.featureId) && finite(entry.value) &&
          entry.value >= features[entry.featureId].min && entry.value <= features[entry.featureId].max;
      }
      if (entry.type === 'snapshot-created' || entry.type === 'branch-created') {
        return validId(entry.snapshotId) && own(snapshots, entry.snapshotId);
      }
      return true;
    });
  }
  function validState(state) {
    if (!plain(state) || state.schema !== 'cad-state-history/1' || validateScenario(state.scenario) ||
      !plain(state.workspaces) || !plain(state.snapshots) || !Number.isSafeInteger(state.nextSequence) || state.nextSequence < 2) return false;
    var orderedIds = state.scenario.features.map(function (feature) { return feature.id; }), features = {};
    state.scenario.features.forEach(function (feature) { features[feature.id] = feature; });
    var snapshotIds = Object.keys(state.snapshots);
    if (!snapshotIds.every(function (key) {
      var item = state.snapshots[key];
      return validId(key) && plain(item) && item.id === key && validName(item.name) && validId(item.sourceWorkspaceId) &&
        Number.isSafeInteger(item.createdSequence) && item.createdSequence > 0 && validFeatureState(item, orderedIds, features) &&
        validHistory(item.history, features, state.snapshots, state.nextSequence) &&
        item.history[item.history.length - 1].sequence === item.createdSequence &&
        item.history[item.history.length - 1].type === 'snapshot-created' && item.history[item.history.length - 1].snapshotId === key;
    })) return false;
    var workspaceIds = Object.keys(state.workspaces);
    if (workspaceIds.length < 1 || !workspaceIds.every(function (key) {
      var item = state.workspaces[key], originValid = item && (item.originSnapshotId === null ||
        (validId(item.originSnapshotId) && own(state.snapshots, item.originSnapshotId)));
      return validId(key) && plain(item) && item.id === key && validName(item.name) && originValid &&
        validFeatureState(item, orderedIds, features) && validHistory(item.history, features, state.snapshots, state.nextSequence) &&
        (item.originSnapshotId === null || item.history.some(function (entry) { return entry.type === 'branch-created' && entry.snapshotId === item.originSnapshotId; }));
    })) return false;
    if (!snapshotIds.every(function (id) { return own(state.workspaces, state.snapshots[id].sourceWorkspaceId); })) return false;
    if (!validId(state.activeWorkspaceId) || !own(state.workspaces, state.activeWorkspaceId) || !plain(state.view) ||
      !['workspace', 'snapshot'].includes(state.view.kind) || !validId(state.view.id)) return false;
    var viewed = state.view.kind === 'workspace' ? state.workspaces : state.snapshots;
    return own(viewed, state.view.id);
  }
  function initialWorkspace(scenario) {
    var order = scenario.features.map(function (feature) { return feature.id; });
    var values = {};
    scenario.features.forEach(function (feature) { values[feature.id] = feature.value; });
    return {
      id: scenario.workspace.id,
      name: scenario.workspace.name,
      originSnapshotId: null,
      featureOrder: order,
      values: values,
      history: [{ sequence: 1, type: 'workspace-created', label: 'Starting teaching state' }]
    };
  }
  function initialize(input) {
    var error = validateScenario(input);
    if (error) return failure(null, error);
    var scenario = freeze(clone(input));
    var workspace = initialWorkspace(scenario), workspaces = {};
    workspaces[workspace.id] = workspace;
    return { ok: true, state: {
      schema: 'cad-state-history/1', scenario: scenario, workspaces: workspaces, snapshots: {},
      activeWorkspaceId: workspace.id, view: { kind: 'workspace', id: workspace.id }, nextSequence: 2
    } };
  }
  function featureById(state, id) {
    return state.scenario.features.find(function (feature) { return feature.id === id; });
  }
  function event(sequence, type, data) { return Object.assign({ sequence: sequence, type: type }, data); }
  function editFeature(state, command) {
    if (!validState(state) || !plain(command)) return failure(state, 'A valid state and edit command are required.');
    if (!validId(command.workspaceId) || !own(state.workspaces, command.workspaceId)) return failure(state, 'Choose an existing workspace.');
    if (!validId(command.featureId)) return failure(state, 'Choose a valid feature ID.');
    var feature = featureById(state, command.featureId);
    if (!feature || !own(state.workspaces[command.workspaceId].values, command.featureId)) return failure(state, 'Choose a feature in this teaching state.');
    if (!finite(command.value) || command.value < feature.min || command.value > feature.max) return failure(state, 'Enter a finite value inside the declared feature range.');
    if (!validName(command.summary)) return failure(state, 'Describe the edit with a short name.');
    var next = clone(state), workspace = next.workspaces[command.workspaceId];
    workspace.values[command.featureId] = command.value;
    workspace.history.push(event(next.nextSequence, 'feature-edited', {
      featureId: feature.id, value: command.value, label: command.summary
    }));
    next.nextSequence++;
    return { ok: true, state: freezeFixedState(next), event: clone(workspace.history[workspace.history.length - 1]) };
  }
  function createSnapshot(state, command) {
    if (!validState(state) || !plain(command)) return failure(state, 'A valid state and snapshot command are required.');
    if (!validId(command.workspaceId) || !own(state.workspaces, command.workspaceId)) return failure(state, 'Choose an existing workspace.');
    if (!validId(command.snapshotId) || own(state.snapshots, command.snapshotId)) return failure(state, 'Use a new valid snapshot ID.');
    if (!validName(command.name)) return failure(state, 'Use a snapshot name from 1 to 60 characters.');
    var next = clone(state), workspace = next.workspaces[command.workspaceId];
    workspace.history.push(event(next.nextSequence, 'snapshot-created', { snapshotId: command.snapshotId, label: command.name }));
    var snapshot = freeze({
      id: command.snapshotId, name: command.name, sourceWorkspaceId: workspace.id,
      createdSequence: next.nextSequence, featureOrder: clone(workspace.featureOrder),
      values: clone(workspace.values), history: clone(workspace.history)
    });
    next.snapshots[command.snapshotId] = snapshot;
    next.nextSequence++;
    return { ok: true, state: freezeFixedState(next), snapshotId: snapshot.id };
  }
  function createBranch(state, command) {
    if (!validState(state) || !plain(command)) return failure(state, 'A valid state and branch command are required.');
    if (!validId(command.snapshotId) || !own(state.snapshots, command.snapshotId)) return failure(state, 'Choose an existing snapshot.');
    if (!validId(command.workspaceId) || own(state.workspaces, command.workspaceId)) return failure(state, 'Use a new valid workspace ID.');
    if (!validName(command.name)) return failure(state, 'Use a workspace name from 1 to 60 characters.');
    var snapshot = state.snapshots[command.snapshotId], next = clone(state);
    next.workspaces[command.workspaceId] = {
      id: command.workspaceId, name: command.name, originSnapshotId: snapshot.id,
      featureOrder: clone(snapshot.featureOrder), values: clone(snapshot.values), history: clone(snapshot.history).concat([
        event(next.nextSequence, 'branch-created', { snapshotId: snapshot.id, label: command.name })
      ])
    };
    next.nextSequence++;
    return { ok: true, state: freezeFixedState(next), workspaceId: command.workspaceId };
  }
  function activateWorkspace(state, workspaceId) {
    if (!validState(state) || !validId(workspaceId) || !own(state.workspaces, workspaceId)) return failure(state, 'Choose an existing workspace.');
    var next = clone(state);
    next.activeWorkspaceId = workspaceId;
    next.view = { kind: 'workspace', id: workspaceId };
    return { ok: true, state: freezeFixedState(next) };
  }
  function viewState(state, reference) {
    if (!validState(state) || !plain(reference) || !['workspace', 'snapshot'].includes(reference.kind) || !validId(reference.id)) return failure(state, 'Choose a valid workspace or snapshot to view.');
    var collection = reference.kind === 'workspace' ? state.workspaces : state.snapshots;
    if (!own(collection, reference.id)) return failure(state, 'That state does not exist.');
    var next = clone(state);
    next.view = { kind: reference.kind, id: reference.id };
    return { ok: true, state: freezeFixedState(next) };
  }
  function inspect(state, reference) {
    if (!validState(state) || !plain(reference) || !['workspace', 'snapshot'].includes(reference.kind) || !validId(reference.id)) return { ok: false, view: null, error: 'Choose a valid workspace or snapshot to inspect.' };
    var collection = reference.kind === 'workspace' ? state.workspaces : state.snapshots;
    if (!own(collection, reference.id)) return { ok: false, view: null, error: 'That state does not exist.' };
    var item = collection[reference.id];
    return { ok: true, view: {
      kind: reference.kind, id: item.id, name: item.name, editable: reference.kind === 'workspace',
      featureOrder: clone(item.featureOrder), values: clone(item.values), history: clone(item.history)
    } };
  }
  function reset(state) {
    if (!validState(state)) return failure(state, 'A valid lab state is required.');
    return initialize(state.scenario);
  }

  return {
    validateScenario: validateScenario, initialize: initialize, editFeature: editFeature,
    createSnapshot: createSnapshot, createBranch: createBranch, activateWorkspace: activateWorkspace,
    viewState: viewState, inspect: inspect, reset: reset
  };
});
