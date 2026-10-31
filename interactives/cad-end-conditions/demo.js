(function () {
  'use strict';
  var M = window.CadEndConditionsModel, R = window.CadEndConditionsRender;
  if (!M || !R) return;
  document.querySelectorAll('[data-interactive="cad-end-conditions"]').forEach(function (root) {
    if (root.dataset.cecReady) return;
    root.dataset.cecReady = 'true'; root.classList.add('cec-live');
    var state = M.initial(), tested = false;
    var lab = document.createElement('div'); lab.className = 'cec-lab';
    lab.innerHTML = '<div class="cec-intro"><p><strong>Goal:</strong> choose how the cut should end, predict the result, then thicken the plate. The same sketch, direction and selected body stay fixed.</p><p>This symbolic section models one rectangular cut normal to the top face of one flat plate. It does not run a CAD kernel or model up-to geometry.</p></div>' +
      '<div class="cec-controls"><label>Design goal<select data-cec="goal"><option value="through-cut">Opening must stay through</option><option value="retained-pocket">Pocket must retain a floor</option></select></label>' +
      '<label>End condition<select data-cec="end-type"><option value="blind">Blind distance</option><option value="through-all">Through all</option></select></label>' +
      '<label>Blind depth (mm)<input data-cec="depth" type="number" min="0.01" max="1000" step="0.01" value="12"></label>' +
      '<label>New plate thickness (mm)<input data-cec="thickness" type="number" min="0.01" max="1000" step="0.01" value="16"></label></div>' +
      '<div class="cec-work"><div data-cec="drawing"></div><div class="cec-results"><output data-cec="condition"></output><output data-cec="removed"></output><output data-cec="floor"></output><output data-cec="goal-status"></output></div></div>' +
      '<div class="cec-test"><label>Your prediction after the thickness edit<select data-cec="prediction"><option value="">Choose before testing…</option><option value="open">The cut stays open</option><option value="floor">A floor remains</option></select></label><div class="cec-actions"><button type="button" data-cec="test">Test thickness edit</button><button type="button" data-cec="reset">Reset experiment</button></div></div>' +
      '<p class="cec-feedback" data-cec="feedback" aria-live="polite"></p>';
    root.prepend(lab);
    function el(key) { return lab.querySelector('[data-cec="' + key + '"]'); }
    function goalText() { return state.parameters.goal === 'through-cut' ? 'opening stays through' : 'pocket retains a floor'; }
    function render(message) {
      var p = state.parameters, r = state.result;
      el('goal').value = p.goal; el('end-type').value = p.endType; el('depth').value = String(p.blindDepth);
      el('drawing').innerHTML = R.svg(state);
      el('condition').innerHTML = '<strong>' + (p.endType === 'blind' ? 'Blind ' + M.formatMm(p.blindDepth) : 'Through all') + '</strong><span>End condition</span>';
      el('removed').innerHTML = '<strong>' + M.formatMm(r.removedDepth) + '</strong><span>Actual removed depth</span>';
      el('floor').innerHTML = '<strong>' + M.formatMm(r.floorThickness) + '</strong><span>Remaining floor</span>';
      el('goal-status').innerHTML = '<strong>' + (r.goalMet ? 'Goal met' : 'Goal missed') + '</strong><span>' + goalText() + '</span>';
      el('depth').disabled = p.endType === 'through-all';
      el('feedback').textContent = message;
    }
    function resetGeometry(message) {
      var endType = el('end-type').value;
      var depth = endType === 'through-all' ? state.parameters.blindDepth : Number(el('depth').value);
      var solved = M.solve({ plateThickness: 10, endType: endType, blindDepth: depth, goal: el('goal').value });
      el('prediction').value = ''; tested = false;
      if (!solved.ok) {
        el('goal').value = state.parameters.goal; el('end-type').value = state.parameters.endType; el('depth').value = String(state.parameters.blindDepth);
        render(message + ' ' + solved.error + ' Controls returned to the last accepted setup.'); return;
      }
      state = solved; render(message);
    }
    function markDraft(label) {
      el('prediction').value = ''; tested = false;
      el('feedback').textContent = label + ' is a draft. The drawing and readings still show the last accepted geometry; choose a prediction and test the edit.';
    }
    el('goal').addEventListener('change', function () { resetGeometry('Goal changed. Start again at the 10 mm plate, then predict the thickness edit.'); });
    el('end-type').addEventListener('change', function () { resetGeometry('End condition changed. Start again at the 10 mm plate, then predict the thickness edit.'); });
    el('depth').addEventListener('input', function () { markDraft('Blind depth'); });
    el('depth').addEventListener('change', function () { resetGeometry('Blind depth changed. Predict what happens when the plate becomes thicker.'); });
    el('thickness').addEventListener('input', function () { markDraft('New plate thickness'); });
    el('test').addEventListener('click', function () {
      var prediction = el('prediction').value;
      if (!prediction) { el('feedback').textContent = 'Choose whether the edited part will stay open or retain a floor before testing.'; el('prediction').focus(); return; }
      var next = M.update(state, { plateThickness: Number(el('thickness').value), endType: el('end-type').value, blindDepth: Number(el('depth').value), goal: el('goal').value });
      if (!next.ok) { el('feedback').textContent = next.error + ' The last accepted geometry remains shown.'; return; }
      state = next; tested = true;
      var actual = state.result.isOpen ? 'open' : 'floor';
      var comparison = prediction === actual ? 'Prediction matches.' : 'Compare your prediction with the section.';
      var explanation = state.parameters.endType === 'blind' ? 'The requested ' + M.formatMm(state.parameters.blindDepth) + ' distance stays fixed while plate thickness changed.' : 'Through all follows the selected plate thickness in this bounded model.';
      render(comparison + ' ' + explanation + ' Actual removal is ' + M.formatMm(state.result.removedDepth) + '; ' + (state.result.isOpen ? 'no floor remains.' : M.formatMm(state.result.floorThickness) + ' of floor remains.') + ' ' + (state.result.goalMet ? 'The design goal is met.' : 'The design goal is not met.'));
    });
    el('reset').addEventListener('click', function () {
      state = M.initial(); tested = false; el('goal').value = 'through-cut'; el('end-type').value = 'blind'; el('depth').value = '12'; el('thickness').value = '16'; el('prediction').value = '';
      render('Reset: the 12 mm blind cut crosses the 10 mm plate. Predict what happens when the plate becomes 16 mm thick.');
    });
    render('The 12 mm blind cut currently crosses the 10 mm plate. Predict what happens when the plate becomes 16 mm thick.');
  });
})();
