/* Side-effect-free UI selectors for evidence and report routing. */
(function (root) {
'use strict';

function selectedEra(state) {
  return state.eras[state.era];
}

function selectedEraComparison(state) {
  const era = selectedEra(state);
  return {
    era: era || null,
    before: era && era.n > 0 ? (state.eras[era.n - 1] || null) : null
  };
}

function canOpenUltimateLearnedReport(state) {
  if (state.mode !== 'ult') return false;
  if (state.lastLearned === null || state.lastLearned !== state.era) return false;
  const era = selectedEra(state);
  return !!era && era.kind === 'ult';
}

function canShowMoveScores(state) {
  if (!state.brain || state.mode === 'rules' || (state.game && state.game.over)) return false;
  return state.mode !== 'net' || !!(state.neural && state.neural.model);
}

const api = { selectedEra, selectedEraComparison, canOpenUltimateLearnedReport, canShowMoveScores };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.UI_STATE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
