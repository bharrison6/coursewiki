'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const UI_STATE = require('./ui-state.js');

function state(mode, era, lastLearned) {
  return {
    mode, era, lastLearned,
    eras: [{ n: 0, kind: 'one' }, { n: 1, kind: 'one' }, { n: 2, kind: 'ult' }]
  };
}

test('selected-era evidence follows the era currently being played', () => {
  const s = state('one', 0, 1);
  assert.equal(UI_STATE.selectedEra(s).n, 0);
  s.era = 1;
  assert.equal(UI_STATE.selectedEra(s).n, 1);
});

test('selected-era comparison follows selection and uses the recorded predecessor', () => {
  const s = state('one', 0, null);
  assert.deepEqual(UI_STATE.selectedEraComparison(s), { era: s.eras[0], before: null });
  s.era = 1;
  assert.deepEqual(UI_STATE.selectedEraComparison(s), { era: s.eras[1], before: s.eras[0] });
});

test('mixed one-board and Ultimate histories keep the immediate recorded predecessor', () => {
  const s = {
    mode: 'one', era: 1, lastLearned: 1,
    eras: [
      { n: 0, kind: 'one', games: 0 },
      { n: 1, kind: 'ult', games: 0, changed: null },
      { n: 2, kind: 'one', games: 5000 }
    ]
  };
  assert.deepEqual(UI_STATE.selectedEraComparison(s), { era: s.eras[1], before: s.eras[0] });
  s.era = 2;
  assert.deepEqual(UI_STATE.selectedEraComparison(s), { era: s.eras[2], before: s.eras[1] });
});

test('the legacy learned-report modal remains isolated to the selected Ultimate era', () => {
  assert.equal(UI_STATE.canOpenUltimateLearnedReport(state('one', 1, 1)), false);
  assert.equal(UI_STATE.canOpenUltimateLearnedReport(state('ult', 1, 1)), false);
  assert.equal(UI_STATE.canOpenUltimateLearnedReport(state('ult', 2, 2)), true);
  assert.equal(UI_STATE.canOpenUltimateLearnedReport(state('net', 2, 2)), false);
});

test('neural move scores stay empty until a network exists', () => {
  const s = { mode: 'net', brain: true, game: { over: false }, neural: null };
  assert.equal(UI_STATE.canShowMoveScores(s), false);
  s.neural = { model: { weights: [] } };
  assert.equal(UI_STATE.canShowMoveScores(s), true);
  s.mode = 'one'; s.neural = null;
  assert.equal(UI_STATE.canShowMoveScores(s), true);
});
