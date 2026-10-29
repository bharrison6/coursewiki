(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiIndicatorSweep,
    node ? require('./render.js') : root.CourseWikiIndicatorSweepDraw);
  if (node) module.exports = api;
  else if (typeof document !== 'undefined') document.querySelectorAll('[data-interactive="indicator-sweep"]').forEach(api.init);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, D) {
  'use strict';
  var sequence = 0;
  function signed(value) { return value > 0.0005 ? '+' + M.format(value) : value < -0.0005 ? '−' + M.format(Math.abs(value)) : M.format(value); }
  function prediction(before, after) {
    return { before: M.result(before).endpointDifference, after: M.result(after).endpointDifference };
  }
  function init(root) {
    if (root.dataset.isReady || !M || !D) return;
    var id;
    do { id = 'is-' + (++sequence); } while (document.getElementById(id + '-kind'));
    var state = Object.assign({}, M.DEFAULT);
    var lab = document.createElement('div'); lab.className = 'is-lab';
    function field(key, label, markup) { return '<label for="' + id + '-' + key + '">' + label + '</label>' + markup.replace('CONTROL', 'id="' + id + '-' + key + '" data-is="' + key + '"'); }
    lab.innerHTML = '<p><strong>Predict, sweep, then zero.</strong> The jaw shape is exaggerated so a few hundredths of a millimetre can be seen.</p>' +
      '<div class="is-workbench"><div class="is-stage"><div data-is-drawing></div><div data-is-readout></div><p><strong>Stated response:</strong> <span data-is-response></span> The arrow in the drawing points toward the indicator body.</p></div>' +
      '<div class="is-controls">' + field('kind', 'Jaw case', '<select CONTROL><option value="slope">+0.060 mm smooth rise over 100 mm</option><option value="aligned">Aligned ideal jaw</option><option value="bump">Equal endpoints, +0.080 mm center bump</option></select>') +
      field('response', 'Verified contact response', '<select CONTROL><option value="1">Toward body increases reading</option><option value="-1">Toward body decreases reading</option></select>') +
      field('position', 'Contact position (mm)', '<input CONTROL type="range" min="0" max="100" step="1" value="100"><output data-is-position>100 mm</output>') +
      field('adjustment', 'Right-end adjustment (mm; toward body is +)', '<input CONTROL type="number" min="-1" max="1" step="0.005" value="0">') +
      '<div class="is-actions"><button type="button" data-is-zero>Zero at contact</button><button type="button" data-is-cancel>Cancel endpoint trend</button><button type="button" data-is-reset>Reset case</button></div></div></div>' +
      '<fieldset class="is-predict"><legend>Prediction: if you zero this same jaw at 50 mm, what happens to right minus left?</legend><label><input type="radio" name="' + id + '-prediction" value="changes">It changes</label><label><input type="radio" name="' + id + '-prediction" value="same">It stays the same</label><button type="button" data-is-test disabled>Test by zeroing at 50 mm</button></fieldset>' +
      '<p class="is-feedback" data-is-feedback role="status" aria-live="polite">Choose a prediction, or explore the controls.</p>';
    root.append(lab);
    function q(s) { return lab.querySelector(s); }
    function control(key) { return q('[data-is="' + key + '"]'); }
    function update() {
      q('[data-is-drawing]').innerHTML = D.draw(state); q('[data-is-readout]').innerHTML = D.readout(state);
      q('[data-is-position]').textContent = M.format(state.position) + ' mm';
      q('[data-is-response]').textContent = state.response === 1 ? 'Moving the jaw toward the body increases the reading.' : 'Moving the jaw toward the body decreases the reading.';
      control('kind').value = state.kind; control('response').value = String(state.response);
      control('position').max = String(state.length); control('position').value = String(state.position);
      control('adjustment').value = String(state.adjustment);
      q('[data-is-cancel]').disabled = state.kind !== 'slope';
    }
    function preset(kind) {
      var response = state.response, position = state.position;
      state = Object.assign({}, M.PRESETS[kind], { response: response, position: Math.min(position, M.PRESETS[kind].length) });
      update();
    }
    control('kind').addEventListener('change', function () { preset(this.value); q('[data-is-feedback]').textContent = 'Case changed. Read the entire sweep before interpreting it.'; });
    control('response').addEventListener('change', function () { state = M.withResponse(state, Number(this.value)); update(); q('[data-is-feedback]').textContent = 'A different demonstrated contact response was selected and re-zeroed at the stored zero position. The physical jaw did not move; displayed signs reversed.'; });
    control('position').addEventListener('input', function () { state = Object.assign({}, state, { position: Number(this.value) }); update(); });
    control('adjustment').addEventListener('change', function () {
      var next = Number(this.value);
      try { M.validate(Object.assign({}, state, { adjustment: next })); state = Object.assign({}, state, { adjustment: next }); update(); q('[data-is-feedback]').textContent = 'Right end adjusted. Resweep the full jaw; the model does not set an acceptance tolerance.'; }
      catch (error) { q('[data-is-feedback]').textContent = error.message + '.'; }
    });
    q('[data-is-zero]').addEventListener('click', function () { state = M.withZero(state, state.position); update(); q('[data-is-feedback]').textContent = 'Stored zero moved to ' + M.format(state.position) + ' mm. The reading there is now 0.000 mm; the shape and sweep differences did not change.'; });
    q('[data-is-cancel]').addEventListener('click', function () { if (state.kind !== 'slope') return; state = M.cancelEndpointTrend(state); update(); q('[data-is-feedback]').textContent = 'Ideal linear endpoint trend canceled. Verify the entire physical sweep and the job requirement.'; });
    q('[data-is-reset]').addEventListener('click', function () { state = Object.assign({}, M.PRESETS[control('kind').value]); update(); q('[data-is-feedback]').textContent = 'Case reset.'; });
    q('.is-predict').addEventListener('change', function () { q('[data-is-test]').disabled = !q('input[type="radio"]:checked'); });
    q('[data-is-test]').addEventListener('click', function () {
      var guess = q('input[type="radio"]:checked'), before = state, after = M.withZero(state, 50), test = prediction(before, after);
      state = after; update(); q('[data-is-feedback]').textContent = (guess && guess.value === 'same' ? 'Prediction confirmed. ' : 'Compare the result. ') + 'Right minus left was ' + signed(test.before) + ' mm and remains ' + signed(test.after) + ' mm. Zeroing subtracts one constant from every reading.';
    });
    lab.addEventListener('keydown', function (event) { if (event.target.matches('input, select, button')) event.stopPropagation(); });
    update(); root.dataset.isReady = 'true'; root.classList.add('is-live');
  }
  return Object.freeze({ init: init, prediction: prediction });
});

