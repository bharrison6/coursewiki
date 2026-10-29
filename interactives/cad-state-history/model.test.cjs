'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('./model.js');
const scenarios = require('./scenarios.js');

const fresh = () => M.initialize(scenarios.intro).state;
const snapshot = state => structuredClone(state);
const command = (workspaceId = 'main', featureId = 'mount-sketch', value = 72, summary = 'Widen mounting sketch') => ({ workspaceId, featureId, value, summary });

test('initialization clones caller data and establishes a canonical feature order', () => {
  const input = snapshot(scenarios.intro), before = snapshot(input);
  const result = M.initialize(input);
  assert.equal(result.ok, true);
  assert.deepEqual(input, before);
  assert.deepEqual(result.state.workspaces.main.featureOrder, ['mount-sketch', 'base-extrude', 'edge-fillet']);
  input.features[0].value = 99;
  assert.equal(result.state.workspaces.main.values['mount-sketch'], 60);
});

test('editing an early feature appends an edit now without changing feature order', () => {
  const state = fresh(), before = snapshot(state), result = M.editFeature(state, command());
  assert.equal(result.ok, true);
  assert.deepEqual(state, before);
  assert.deepEqual(result.state.workspaces.main.featureOrder, before.workspaces.main.featureOrder);
  assert.equal(result.state.workspaces.main.values['mount-sketch'], 72);
  const last = result.state.workspaces.main.history.at(-1);
  assert.deepEqual(last, { sequence: 2, type: 'feature-edited', featureId: 'mount-sketch', value: 72, label: 'Widen mounting sketch' });
  assert.equal(result.state.workspaces.main.featureOrder.indexOf('mount-sketch'), 0);
});

test('a named snapshot is fixed across later edits and owns all captured teaching-state data', () => {
  let state = M.editFeature(fresh(), command()).state;
  state = M.createSnapshot(state, { workspaceId: 'main', snapshotId: 'design-review', name: 'Design review' }).state;
  const captured = snapshot(state.snapshots['design-review']);
  assert.equal(Object.isFrozen(state.snapshots['design-review']), true);
  state = M.editFeature(state, command('main', 'mount-sketch', 84, 'Increase clearance')).state;
  assert.deepEqual(state.snapshots['design-review'], captured);
  assert.equal(state.snapshots['design-review'].values['mount-sketch'], 72);
  assert.equal(state.workspaces.main.values['mount-sketch'], 84);
  assert.deepEqual(Object.keys(captured.values).sort(), ['base-extrude', 'edge-fillet', 'mount-sketch']);
});

test('a branch starts from a snapshot and edits independently without aliases', () => {
  let state = M.createSnapshot(fresh(), { workspaceId: 'main', snapshotId: 'baseline', name: 'Baseline' }).state;
  state = M.createBranch(state, { snapshotId: 'baseline', workspaceId: 'lightweight', name: 'Lightweight branch' }).state;
  assert.deepEqual(state.workspaces.lightweight.values, state.snapshots.baseline.values);
  state = M.editFeature(state, command('lightweight', 'base-extrude', 8, 'Reduce branch thickness')).state;
  assert.equal(state.workspaces.lightweight.values['base-extrude'], 8);
  assert.equal(state.workspaces.main.values['base-extrude'], 12);
  assert.equal(state.snapshots.baseline.values['base-extrude'], 12);
  assert.notEqual(state.workspaces.lightweight.values, state.snapshots.baseline.values);
  assert.notEqual(state.workspaces.lightweight.history, state.snapshots.baseline.history);
});

test('viewing a fixed state does not edit it, append history, or change the active workspace', () => {
  let state = M.createSnapshot(fresh(), { workspaceId: 'main', snapshotId: 'baseline', name: 'Baseline' }).state;
  state = M.createBranch(state, { snapshotId: 'baseline', workspaceId: 'option-b', name: 'Option B' }).state;
  state = M.activateWorkspace(state, 'option-b').state;
  const before = snapshot(state), result = M.viewState(state, { kind: 'snapshot', id: 'baseline' });
  assert.equal(result.ok, true);
  assert.equal(result.state.activeWorkspaceId, 'option-b');
  assert.deepEqual(result.state.workspaces, before.workspaces);
  assert.deepEqual(result.state.snapshots, before.snapshots);
  assert.deepEqual(result.state.view, { kind: 'snapshot', id: 'baseline' });
});

test('inspection returns a detached view and reports editability honestly', () => {
  const state = fresh(), result = M.inspect(state, { kind: 'workspace', id: 'main' });
  assert.equal(result.ok, true); assert.equal(result.view.editable, true);
  result.view.values['mount-sketch'] = 100;
  result.view.featureOrder.reverse();
  assert.equal(state.workspaces.main.values['mount-sketch'], 60);
  assert.deepEqual(state.workspaces.main.featureOrder, ['mount-sketch', 'base-extrude', 'edge-fillet']);
  assert.equal(M.inspect(state, { kind: 'snapshot', id: 'missing' }).ok, false);
});

test('invalid IDs, values, and names fail without events or false success, then valid work can continue', () => {
  let state = fresh();
  const attempts = [
    () => M.editFeature(state, command('missing', 'mount-sketch', 70, 'Edit')),
    () => M.editFeature(state, command('main', 'missing', 70, 'Edit')),
    () => M.editFeature(state, command('main', 'mount-sketch', NaN, 'Edit')),
    () => M.editFeature(state, command('main', 'mount-sketch', 101, 'Edit')),
    () => M.editFeature(state, command('main', 'mount-sketch', 70, '  ')),
    () => M.createSnapshot(state, { workspaceId: 'main', snapshotId: '../bad', name: 'Bad' }),
    () => M.createSnapshot(state, { workspaceId: 'missing', snapshotId: 'bad-source', name: 'Bad' }),
    () => M.createBranch(state, { snapshotId: 'missing', workspaceId: 'branch', name: 'Branch' }),
    () => M.activateWorkspace(state, 'missing'),
    () => M.viewState(state, { kind: 'snapshot', id: 'missing' })
  ];
  const baseline = snapshot(state);
  for (const attempt of attempts) {
    const result = attempt();
    assert.equal(result.ok, false); assert.equal(result.state, state); assert.deepEqual(state, baseline);
  }
  const success = M.editFeature(state, command('main', 'mount-sketch', 70, 'Valid edit'));
  assert.equal(success.ok, true); assert.equal(success.state.workspaces.main.history.length, 2);
});

test('duplicate snapshot and workspace IDs fail; reset and repeated reset return the original state', () => {
  let state = M.createSnapshot(fresh(), { workspaceId: 'main', snapshotId: 'baseline', name: 'Baseline' }).state;
  const duplicateSnapshot = M.createSnapshot(state, { workspaceId: 'main', snapshotId: 'baseline', name: 'Again' });
  assert.equal(duplicateSnapshot.ok, false); assert.equal(duplicateSnapshot.state, state);
  state = M.createBranch(state, { snapshotId: 'baseline', workspaceId: 'option-b', name: 'Option B' }).state;
  const duplicateBranch = M.createBranch(state, { snapshotId: 'baseline', workspaceId: 'option-b', name: 'Again' });
  assert.equal(duplicateBranch.ok, false); assert.equal(duplicateBranch.state, state);
  const reset1 = M.reset(state), reset2 = M.reset(reset1.state);
  assert.equal(reset1.ok, true); assert.equal(reset2.ok, true);
  assert.deepEqual(reset1.state, fresh()); assert.deepEqual(reset2.state, fresh());
});

test('every public operation accepts its declared command shape without mutating that command', () => {
  let state = fresh();
  const edit = command(), editBefore = snapshot(edit);
  state = M.editFeature(state, edit).state; assert.deepEqual(edit, editBefore);
  const snap = { workspaceId: 'main', snapshotId: 'review', name: 'Review' }, snapBefore = snapshot(snap);
  state = M.createSnapshot(state, snap).state; assert.deepEqual(snap, snapBefore);
  const branch = { snapshotId: 'review', workspaceId: 'option-c', name: 'Option C' }, branchBefore = snapshot(branch);
  state = M.createBranch(state, branch).state; assert.deepEqual(branch, branchBefore);
  state = M.activateWorkspace(state, 'option-c').state;
  const view = { kind: 'snapshot', id: 'review' }, viewBefore = snapshot(view);
  state = M.viewState(state, view).state; assert.deepEqual(view, viewBefore);
  assert.equal(M.inspect(state, view).ok, true);
  assert.equal(M.reset(state).ok, true);
});

test('malformed scenarios are rejected without throwing or mutating the caller', () => {
  const cases = [null, {}, { ...scenarios.intro, id: 'Bad ID' },
    { ...scenarios.intro, workspace: { id: 'main', name: '' } },
    { ...scenarios.intro, features: [scenarios.intro.features[0]] },
    { ...scenarios.intro, features: [scenarios.intro.features[0], { ...scenarios.intro.features[0] }] },
    { ...scenarios.intro, features: scenarios.intro.features.map((feature, index) => index ? feature : { ...feature, value: Infinity }) }];
  for (const input of cases) {
    const before = input === null ? null : snapshot(input);
    const result = M.initialize(input);
    assert.equal(result.ok, false); assert.equal(result.state, null);
    if (input !== null) assert.deepEqual(input, before);
  }
});

test('every public state consumer rejects the same malformed nested states without mutation or throws', () => {
  let valid = M.createSnapshot(fresh(), { workspaceId: 'main', snapshotId: 'baseline', name: 'Baseline' }).state;
  valid = M.createBranch(valid, { snapshotId: 'baseline', workspaceId: 'option-b', name: 'Option B' }).state;
  const corruptions = [
    state => { state.workspaces.main = { id: 'main', name: 'Main' }; },
    state => { state.workspaces.main.featureOrder = ['base-extrude', 'mount-sketch', 'edge-fillet']; },
    state => { state.workspaces.main.featureOrder[0] = 'missing'; },
    state => { delete state.workspaces.main.values['mount-sketch']; },
    state => { state.workspaces.main.values.extra = 4; },
    state => { state.workspaces.main.values['mount-sketch'] = Infinity; },
    state => { state.workspaces.main.history[0].type = 'mystery'; },
    state => { state.workspaces.main.history[0].sequence = 0; },
    state => { state.workspaces.main.history.push({ sequence: 3, type: 'feature-edited', featureId: 'missing', value: 50, label: 'Bad ref' }); },
    state => { state.snapshots.baseline.featureOrder = ['mount-sketch']; },
    state => { state.snapshots.baseline.values['mount-sketch'] = 1000; },
    state => { state.snapshots.baseline.history.at(-1).snapshotId = 'missing'; },
    state => { state.snapshots.baseline.createdSequence = 99; },
    state => { state.workspaces['option-b'].originSnapshotId = 'missing'; },
    state => { state.activeWorkspaceId = 'missing'; },
    state => { state.view = { kind: 'snapshot', id: 'missing' }; },
    state => { state.nextSequence = 2; }
  ];
  const consumers = state => [
    () => M.editFeature(state, command()),
    () => M.createSnapshot(state, { workspaceId: 'main', snapshotId: 'next', name: 'Next' }),
    () => M.createBranch(state, { snapshotId: 'baseline', workspaceId: 'option-c', name: 'Option C' }),
    () => M.activateWorkspace(state, 'main'),
    () => M.viewState(state, { kind: 'workspace', id: 'main' }),
    () => M.inspect(state, { kind: 'workspace', id: 'main' }),
    () => M.reset(state)
  ];
  for (const corrupt of corruptions) {
    const state = structuredClone(valid); corrupt(state); const before = structuredClone(state);
    for (const consume of consumers(state)) {
      let result;
      assert.doesNotThrow(() => { result = consume(); });
      assert.equal(result.ok, false); assert.deepEqual(state, before);
    }
  }
});

test('deep validation retains positive controls for every public state consumer', () => {
  let state = M.createSnapshot(fresh(), { workspaceId: 'main', snapshotId: 'baseline', name: 'Baseline' }).state;
  assert.equal(M.editFeature(state, command()).ok, true);
  assert.equal(M.createSnapshot(state, { workspaceId: 'main', snapshotId: 'next', name: 'Next' }).ok, true);
  assert.equal(M.createBranch(state, { snapshotId: 'baseline', workspaceId: 'option-b', name: 'Option B' }).ok, true);
  assert.equal(M.activateWorkspace(state, 'main').ok, true);
  assert.equal(M.viewState(state, { kind: 'snapshot', id: 'baseline' }).ok, true);
  assert.equal(M.inspect(state, { kind: 'workspace', id: 'main' }).ok, true);
  assert.equal(M.reset(state).ok, true);
});

test('the static worked timeline is derived from the canonical scenario and matches modeled actions', () => {
  const host = fs.readFileSync(path.join(__dirname, '../../collections/engineering-graphics/pages/cad-history-and-sharing.html'), 'utf8');
  for (const feature of scenarios.intro.features) {
    assert.match(host, new RegExp('data-csh-static-feature="' + feature.id + '" data-csh-static-value="' + feature.value + '"'));
  }
  let state = fresh();
  state = M.editFeature(state, command('main', 'mount-sketch', 72, 'Edited Mounting sketch')).state;
  state = M.createSnapshot(state, { workspaceId: 'main', snapshotId: 'design-review', name: 'Design review' }).state;
  state = M.editFeature(state, command('main', 'mount-sketch', 84, 'Edited Mounting sketch')).state;
  state = M.createBranch(state, { snapshotId: 'design-review', workspaceId: 'lightweight', name: 'Lightweight branch' }).state;
  state = M.editFeature(state, command('lightweight', 'base-extrude', 8, 'Edited Base extrude')).state;
  const row = id => host.match(new RegExp('<tr data-csh-static-state="' + id + '">([\\s\\S]*?)</tr>'))[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  assert.match(row('main'), new RegExp(Object.values(state.workspaces.main.values).join(' mm.*')));
  assert.match(row('design-review'), new RegExp(Object.values(state.snapshots['design-review'].values).join(' mm.*')));
  assert.match(row('lightweight'), new RegExp(Object.values(state.workspaces.lightweight.values).join(' mm.*')));
});

test('host preservation and browser event plumbing stay inside the authorized boundary', () => {
  const host = fs.readFileSync(path.join(__dirname, '../../collections/engineering-graphics/pages/cad-history-and-sharing.html'), 'utf8');
  const demo = fs.readFileSync(path.join(__dirname, 'demo.js'), 'utf8');
  assert.deepEqual([...host.matchAll(/<h2>([^<]+)<\/h2>/g)].map(match => match[1]), [
    'The feature list describes how geometry is built',
    'Onshape history records edits; versions preserve milestones',
    'A SOLIDWORKS save or file copy needs its own revision plan',
    'Share the intended state and check the recipient\'s access'
  ]);
  for (const id of ['cad-version-branch', 'cad-rollback-history', 'cad-sharing-access']) assert.match(host, new RegExp('data-practice-add="' + id + '"'));
  assert.doesNotMatch(demo, /stopPropagation|addEventListener\(\s*['"]keydown/);
  assert.match(demo, /\.textContent\s*=/);
});
