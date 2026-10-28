(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiCapability,
    node ? require('./render.js') : root.CourseWikiCapabilityDraw);
  if (node) module.exports = api;
  else if (typeof document !== 'undefined') document.querySelectorAll('[data-interactive="capability-explorer"]').forEach(api.init);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, D) {
  'use strict';
  var sequence = 0;
  function trial() { return { before: Object.assign({}, M.DEFAULT), after: Object.assign({}, M.DEFAULT, { mean: 20.01 }) }; }
  function init(root) {
    if (root.dataset.ceReady || !M || !D) return;
    var id, state = Object.assign({}, M.DEFAULT);
    do { id = 'ce-' + (++sequence); } while (document.getElementById(id + '-mean'));
    var lab = document.createElement('div'); lab.className = 'ce-lab';
    lab.innerHTML = '<p><strong>Move the centre; change the spread.</strong> The limits stay at 19.95–20.05 mm (20.00 ± 0.05 mm).</p>' +
      '<div class="ce-workbench"><div><div class="ce-plot"></div><p class="ce-legend">Band = permitted sizes. Filled tails = outside the limits. Both axes keep the same scale; tails continue beyond the drawing.</p><div class="ce-readout" aria-live="polite" aria-atomic="true"></div></div>' +
      '<div class="ce-controls"><div class="ce-sliders"></div><div class="ce-actions"><button type="button" data-ce-preset="precise">Precise but off-centre</button><button type="button" data-ce-preset="wide">Centred but wide</button><button type="button" data-ce-reset>Reset</button></div>' +
      '<fieldset class="ce-predict"><legend>Predict first</legend><p>Start centred at μ = 20.000 mm and σ = 0.010 mm. Shift the mean right by one σ, holding spread fixed. What happens?</p>' +
      '<label><input type="radio" name="' + id + '-guess" value="same"> Both indices stay the same</label>' +
      '<label><input type="radio" name="' + id + '-guess" value="cpk"> Cp stays; Cpk falls by ⅓</label>' +
      '<label><input type="radio" name="' + id + '-guess" value="both"> Both indices fall by ⅓</label>' +
      '<button type="button" data-ce-test disabled>Test the prediction</button><p data-ce-feedback role="status">Choose a prediction, then test the stated starting setup.</p></fieldset></div></div>';
    root.insertBefore(lab, root.firstChild);
    var q = function (selector) { return lab.querySelector(selector); }, controls = {};
    function control(key, label, min, max, step) {
      var box = document.createElement('div'); box.className = 'ce-control';
      box.innerHTML = '<label for="' + id + '-' + key + '">' + label + ' <output for="' + id + '-' + key + '"></output></label><input id="' + id + '-' + key + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '"><p>' + min + '–' + max + ' mm</p>';
      q('.ce-sliders').appendChild(box);
      var slider = box.querySelector('input');
      controls[key] = { slider: slider, output: box.querySelector('output') };
      slider.addEventListener('input', function () { state[key] = Number(slider.value); update(); q('[data-ce-feedback]').textContent = 'Setup changed. Test the prediction to reload its stated conditions.'; });
    }
    control('mean', 'Mean μ', 19.93, 20.07, .001);
    control('sigma', 'Standard deviation σ', .004, .04, .001);
    function update() {
      q('.ce-plot').innerHTML = D.curve(state); q('.ce-readout').innerHTML = D.readout(state);
      Object.keys(controls).forEach(function (key) {
        var c = controls[key]; c.slider.value = state[key]; c.output.textContent = M.format(state[key], 3) + ' mm';
        c.slider.setAttribute('aria-valuetext', M.format(state[key], 3) + ' millimetres');
      });
    }
    // Native arrow-key control must not turn presentation pages.
    lab.addEventListener('keydown', function (e) { if (e.target.matches('input, button')) e.stopPropagation(); });
    lab.querySelectorAll('[data-ce-preset]').forEach(function (button) {
      button.addEventListener('click', function () {
        state = Object.assign({}, M.PRESETS[button.dataset.cePreset]); update();
        q('[data-ce-feedback]').textContent = 'Loaded ' + button.textContent.toLowerCase() + '. Change one slider and compare.';
      });
    });
    q('[data-ce-reset]').addEventListener('click', function () {
      state = Object.assign({}, M.DEFAULT); update();
      lab.querySelectorAll('input[type="radio"]').forEach(function (r) { r.checked = false; });
      q('[data-ce-test]').disabled = true; q('[data-ce-feedback]').textContent = 'Reset to the centred starting setup. Choose a prediction first.';
    });
    q('.ce-predict').addEventListener('change', function () { q('[data-ce-test]').disabled = !q('input[type="radio"]:checked'); });
    q('[data-ce-test]').addEventListener('click', function () {
      var guess = q('input[type="radio"]:checked'); if (!guess) return;
      var pair = trial(); state = pair.after; update();
      q('[data-ce-feedback]').textContent = (guess.value === 'cpk' ? 'Prediction confirmed. ' : 'Compare the result. ') +
        'Cp stays at ' + M.format(M.solve(pair.before).cp) + '; Cpk falls from ' + M.format(M.solve(pair.before).cpk) + ' to ' + M.format(M.solve(pair.after).cpk) + '. Cp measures width only. Cpk uses the distance to the nearer limit.';
    });
    update(); root.dataset.ceReady = 'true'; root.classList.add('ce-live');
  }
  return { init: init, trial: trial };
});
