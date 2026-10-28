(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiSawTeeth,
    node ? require('./render.js') : root.CourseWikiSawTeethDraw);
  if (node) module.exports = api;
  else if (typeof document !== 'undefined') document.querySelectorAll('[data-interactive="saw-teeth-in-cut"]').forEach(api.init);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, D) {
  'use strict';
  var sequence = 0;
  function trial() {
    var before = Object.assign({}, M.PRESETS.tube);
    return { before: before, after: Object.assign({}, before, { pitch: before.pitch * 2 }) };
  }
  function init(root) {
    if (root.dataset.stReady || !M || !D) return;
    var id;
    do { id = 'st-' + (++sequence); } while (document.getElementById(id + '-pitch'));
    var state = Object.assign({}, M.DEFAULT), fraction = .5, frame = null, last = null;
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var lab = document.createElement('div'); lab.className = 'st-lab';
    function field(key, label, input) { return '<label for="' + id + '-' + key + '">' + label + '</label>' + input.replace('CONTROL', 'id="' + id + '-' + key + '" data-st="' + key + '"'); }
    lab.innerHTML = '<p><strong>Follow the teeth through the section.</strong> Change one input, then compare the whole curve.</p><div class="st-workbench"><div><div data-st-view></div><div data-st-plot></div><div data-st-readout></div><p>Shading = below three. Dashed line = about three. Plot scales adjust with the inputs.</p><p data-st-many hidden>Gullets may fill with chips; check the blade maker\'s guidance.</p></div><div class="st-controls">' +
      field('type', 'Section', '<select CONTROL><option value="tube">Round tube</option><option value="round">Solid round</option><option value="flat">Solid flat bar</option></select>') +
      field('unit', 'Pitch units', '<select CONTROL><option value="tpi">Teeth per inch (TPI)</option><option value="mm">Tooth spacing (mm)</option></select>') +
      field('pitch', 'Pitch value', '<input CONTROL type="number" min="0.01" step="any">') +
      '<div data-st-circular>' + field('diameter', 'Outside diameter (mm)', '<input CONTROL type="number" min="0.01" step="any">') + '</div>' +
      '<div data-st-wall>' + field('wall', 'Tube wall (mm)', '<input CONTROL type="number" min="0.01" step="any">') + '</div>' +
      '<div data-st-flat>' + field('thickness', 'Thickness along tooth line (mm)', '<input CONTROL type="number" min="0.01" step="any">') + field('height', 'Height in feed direction (mm)', '<input CONTROL type="number" min="0.01" step="any">') + '<button type="button" data-st-rotate>Rotate bar 90°</button></div>' +
      '<p data-st-error role="alert"></p>' + field('depth', 'Depth through the cut', '<input CONTROL type="range" min="0" max="1000" step="1">') + '<output data-st-depth-text></output>' +
      '<div class="st-actions"><button type="button" data-st-play>Play</button><button type="button" data-st-preset="tube">Thin-wall tube · coarse blade</button><button type="button" data-st-preset="fine">Thick solid bar · fine blade</button></div><p data-st-motion></p>' +
      '<fieldset class="st-predict"><legend>Predict, then test</legend><p>At mid-depth in the 50.8 mm tube with a 1 mm wall, change only 6 TPI to 12 TPI. What happens to the estimated teeth engaged?</p>' +
      ['Half', 'Double', 'Same'].map(function (v) { return '<label><input type="radio" name="' + id + '-guess" value="' + v + '"> ' + v + '</label>'; }).join('') + '<button type="button" data-st-test disabled>Test the prediction</button><p data-st-feedback role="status">Choose a prediction first.</p></fieldset></div></div>';
    root.insertBefore(lab, root.firstChild);
    var q = function (s) { return lab.querySelector(s); };
    function input(k) { return q('[data-st="' + k + '"]'); }
    function stop() { if (frame !== null) cancelAnimationFrame(frame); frame = null; last = null; q('[data-st-play]').textContent = 'Play'; }
    function update(sync) {
      if (sync) ['type', 'unit', 'pitch', 'diameter', 'wall', 'thickness', 'height'].forEach(function (k) { input(k).value = state[k]; });
      q('[data-st-flat]').hidden = state.type !== 'flat'; q('[data-st-circular]').hidden = state.type === 'flat'; q('[data-st-wall]').hidden = state.type !== 'tube';
      var d = M.depth(state) * fraction;
      var fine = state.type === 'flat' && state.thickness === M.PRESETS.fine.thickness && Math.abs(M.pitchMM(state) - M.pitchMM(M.PRESETS.fine)) < 1e-10;
      q('[data-st-view]').innerHTML = D.section(state, d); q('[data-st-plot]').innerHTML = D.plot(state, d, fine);
      q('[data-st-readout]').innerHTML = D.readout(state, d); q('[data-st-many]').hidden = !fine;
      input('depth').value = Math.round(fraction * 1000); input('depth').setAttribute('aria-valuetext', M.format(d) + ' millimetres');
      q('[data-st-depth-text]').textContent = M.format(d) + ' mm (' + M.format(fraction * 100) + '%)';
    }
    function clearError() { q('[data-st-error]').textContent = ''; input('depth').disabled = false; q('[data-st-play]').disabled = motion.matches; }
    lab.addEventListener('input', function (e) {
      var key = e.target.dataset.st; if (!key || key === 'unit') return;
      stop();
      if (key === 'depth') { fraction = Number(e.target.value) / 1000; update(false); return; }
      var next = Object.assign({}, state);
      ['type', 'pitch', 'diameter', 'wall', 'thickness', 'height'].forEach(function (k) { next[k] = k === 'type' ? input(k).value : Number(input(k).value); });
      try { M.validate(next); M.solve(next); state = next; clearError(); update(false); }
      catch (err) { q('[data-st-error]').textContent = err.message + '. Drawing retains the last valid setup.'; input('depth').disabled = true; q('[data-st-play]').disabled = true; }
      q('[data-st-feedback]').textContent = 'Setup changed. Testing the prediction reloads its stated conditions.';
    });
    input('unit').addEventListener('change', function () {
      stop(); var unit = input('unit').value;
      if (unit !== state.unit) state = Object.assign({}, state, { unit: unit, pitch: unit === 'mm' ? M.tpiToMM(state.pitch) : M.mmToTPI(state.pitch) });
      clearError(); update(true);
    });
    q('[data-st-rotate]').addEventListener('click', function () { stop(); state = M.rotateFlat(state); clearError(); update(true); });
    lab.querySelectorAll('[data-st-preset]').forEach(function (b) { b.addEventListener('click', function () { stop(); state = Object.assign({}, M.PRESETS[b.dataset.stPreset]); fraction = .5; clearError(); update(true); }); });
    function tick(now) {
      if (motion.matches || !root.isConnected || document.hidden) { stop(); return; }
      if (last !== null) fraction = Math.min(1, fraction + (now - last) / 8000);
      last = now; update(false);
      if (fraction >= 1) stop(); else frame = requestAnimationFrame(tick);
    }
    q('[data-st-play]').addEventListener('click', function () {
      if (frame !== null) { stop(); return; }
      if (motion.matches) return;
      if (fraction >= 1) fraction = 0;
      q('[data-st-play]').textContent = 'Pause'; frame = requestAnimationFrame(tick);
    });
    function reduced() { stop(); q('[data-st-play]').disabled = motion.matches || !!q('[data-st-error]').textContent; q('[data-st-motion]').textContent = motion.matches ? 'Reduced motion: use the depth slider to step through the cut.' : 'Play moves through one cut in about eight seconds.'; }
    motion.addEventListener('change', reduced);
    q('.st-predict').addEventListener('change', function () { q('[data-st-test]').disabled = !q('input[type="radio"]:checked'); });
    q('[data-st-test]').addEventListener('click', function () {
      var guess = q('input[type="radio"]:checked'); if (!guess) return;
      stop(); var t = trial(); state = t.after; fraction = .5; clearError(); update(true);
      q('[data-st-feedback]').textContent = (guess.value === 'Double' ? 'Prediction confirmed. ' : 'Compare the result. ') + 'The two walls still give 2.00 mm of contact. Doubling TPI halves tooth spacing, so engagement doubles from ' + M.format(M.at(t.before, 25.4).teeth) + ' to ' + M.format(M.at(t.after, 25.4).teeth) + ' teeth. Both remain below about three.';
    });
    lab.addEventListener('keydown', function (e) { if (e.target.matches('input, select, button')) e.stopPropagation(); });
    update(true); reduced(); root.dataset.stReady = 'true'; root.classList.add('st-live');
  }
  return { init: init, trial: trial };
});
