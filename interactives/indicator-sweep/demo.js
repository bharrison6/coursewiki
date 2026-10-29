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
    var state = Object.assign({}, M.DEFAULT), increment = -0.0006;
    var lab = document.createElement('div'); lab.className = 'is-lab';
    function field(key, label, markup) { return '<label for="' + id + '-' + key + '">' + label + '</label>' + markup.replace('CONTROL', 'id="' + id + '-' + key + '" data-is="' + key + '"'); }
    lab.innerHTML = '<p><strong>Sweep, choose a pivot, then apply a small illustrative rotation.</strong> This first-order model uses a fixed 100 mm measuring span inset within a finite vise face and does not simulate mallet force. Rotation inputs use 0.0001 mm/mm control steps; that is model resolution, not real-vise quantization. The vise pose is exaggerated; the digital indicator and numeric summary carry the actual model values. Zero only when it is useful.</p>' +
      '<div class="is-workbench"><div class="is-stage"><div data-is-drawing></div><div data-is-readout></div><p><strong>Stated response:</strong> <span data-is-response></span> The arrow in the drawing points toward the indicator body.</p></div>' +
      '<div class="is-controls">' + field('kind', 'Jaw case', '<select CONTROL><option value="slope">+0.060 mm smooth rise over 100 mm</option><option value="aligned">Aligned ideal jaw</option><option value="bump">Equal endpoints, +0.080 mm center bump</option></select>') +
      field('response', 'Verified contact response', '<select CONTROL><option value="1">Toward body increases reading</option><option value="-1">Toward body decreases reading</option></select>') +
      field('position', 'Contact position (mm)', '<input CONTROL type="range" min="0" max="100" step="1" value="100"><output data-is-position>100 mm</output>') +
      field('pivot', 'World pivot for next rotation (y = 0 mm)', '<select CONTROL><option value="0">Left measurement point · x = 0 mm</option><option value="25" selected>Quarter span · x = 25 mm</option><option value="50">Midspan · x = 50 mm</option><option value="100">Right measurement point · x = 100 mm</option></select>') +
      field('increment', 'Small rotation increment (mm per mm)', '<input CONTROL type="number" min="-0.001" max="0.001" step="0.0001" value="-0.0006">') +
      '<div class="is-actions"><button type="button" data-is-apply>Apply rotation about pivot</button><button type="button" data-is-zero>Optional: zero at contact</button><button type="button" data-is-reset>Reset case</button></div></div></div>' +
      '<p class="is-feedback" data-is-feedback role="status" aria-live="polite">Choose the next pivot and rotation increment. Selecting a pivot alone does not move the vise.</p>' +
      '<details class="is-optional"><summary>Optional practice: what does re-zeroing change?</summary><fieldset class="is-predict"><legend>If the same tilted jaw is zeroed at 50 mm, what happens to right minus left?</legend><label><input type="radio" name="' + id + '-prediction" value="changes">It changes</label><label><input type="radio" name="' + id + '-prediction" value="same">It stays the same</label><button type="button" data-is-test disabled>Check the isolated example</button><p data-is-predict-feedback role="status" aria-live="polite">This optional example does not change the main vise.</p></fieldset></details>';
    root.append(lab);
    function q(s) { return lab.querySelector(s); }
    function control(key) { return q('[data-is="' + key + '"]'); }
    function update() {
      q('[data-is-drawing]').innerHTML = D.draw(state); q('[data-is-readout]').innerHTML = D.readout(state);
      q('[data-is-position]').textContent = M.format(state.position) + ' mm';
      q('[data-is-response]').textContent = state.response === 1 ? 'Moving the jaw toward the body increases the reading.' : 'Moving the jaw toward the body decreases the reading.';
      control('kind').value = state.kind; control('response').value = String(state.response);
      control('position').max = String(state.length); control('position').value = String(state.position);
      control('pivot').value = String(state.pivot); control('increment').value = String(increment);
    }
    function preset(kind) {
      var response = state.response, position = state.position;
      state = Object.assign({}, M.PRESETS[kind], { response: response, position: Math.min(position, M.PRESETS[kind].length) });
      increment = -0.0006;
      update();
    }
    control('kind').addEventListener('change', function () { preset(this.value); q('[data-is-feedback]').textContent = 'Case changed. Read the entire sweep before interpreting it.'; });
    control('response').addEventListener('change', function () { state = M.withResponse(state, Number(this.value)); update(); q('[data-is-feedback]').textContent = 'A different demonstrated contact-response scenario was selected. That scenario stores a new zero at ' + M.format(state.zeroX) + ' mm. Vise geometry and alignment did not change; readings were recomputed from the new response and reference.'; });
    control('position').addEventListener('input', function () { state = Object.assign({}, state, { position: Number(this.value) }); update(); });
    control('pivot').addEventListener('change', function () { state = M.withPivot(state, Number(this.value)); update(); q('[data-is-feedback]').textContent = 'Next world pivot selected at P=(' + M.format(state.pivot) + ', 0) mm. The current vise pose and stored zero did not change.'; });
    control('increment').addEventListener('change', function () { increment = Number(this.value); q('[data-is-feedback]').textContent = 'Rotation increment staged. Apply it when ready; changing this field alone does not move the vise.'; });
    q('[data-is-apply]').addEventListener('click', function () {
      try {
        var before = state, next = M.rotate(state, increment, state.pivot);
        var leftMove = M.surface(next, 0) - M.surface(before, 0), rightMove = M.surface(next, next.length) - M.surface(before, before.length);
        state = next; update();
        q('[data-is-feedback]').textContent = 'Rotation applied about ' + M.format(state.pivot) + ' mm. Left moved ' + signed(leftMove) + ' mm; right moved ' + signed(rightMove) + ' mm. The stored zero was not changed.';
      } catch (error) { q('[data-is-feedback]').textContent = error.message + '.'; }
    });
    q('[data-is-zero]').addEventListener('click', function () { state = M.withZero(state, state.position); update(); q('[data-is-feedback]').textContent = 'Stored zero moved to ' + M.format(state.position) + ' mm. The reading there is now 0.000 mm; the shape and sweep differences did not change.'; });
    q('[data-is-reset]').addEventListener('click', function () { state = Object.assign({}, M.PRESETS[control('kind').value]); increment = -0.0006; update(); q('[data-is-feedback]').textContent = 'Case reset.'; });
    q('.is-predict').addEventListener('change', function () { q('[data-is-test]').disabled = !q('input[type="radio"]:checked'); });
    q('[data-is-test]').addEventListener('click', function () {
      var guess = q('input[type="radio"]:checked'), before = Object.assign({}, M.PRESETS.slope), after = M.withZero(before, 50), test = prediction(before, after);
      q('[data-is-predict-feedback]').textContent = (guess && guess.value === 'same' ? 'Prediction confirmed. ' : 'Compare the isolated example. ') + 'Right minus left was ' + signed(test.before) + ' mm and remains ' + signed(test.after) + ' mm. The main vise was not changed.';
    });
    lab.addEventListener('keydown', function (event) { if (event.target.matches('input, select, button')) event.stopPropagation(); });
    update(); root.dataset.isReady = 'true'; root.classList.add('is-live');
  }
  return Object.freeze({ init: init, prediction: prediction });
});

