(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiGears,
    node ? require('./render.js') : root.CourseWikiGearsDraw);
  if (node) module.exports = api;
  else if (typeof document !== 'undefined') document.querySelectorAll('[data-interactive="gear-ratios"]').forEach(api.init);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, D) {
  'use strict';
  var sequence = 0;
  var TRIALS = Object.freeze({
    bigger: { title: 'Make B larger', question: 'A has 20 teeth and B has 20. Change B to 40 teeth. What happens to output speed?',
      choices: [['half', 'Half as fast'], ['same', 'Same speed'], ['double', 'Twice as fast']], answer: 'half',
      before: { b: 20 }, after: { b: 40 },
      reason: 'B needs twice as many passing teeth to complete a turn. Speed halves; ideal output torque doubles.' },
    idler: { title: 'Add an idler', question: 'Keep A = 20 and B = 40 teeth. Insert one idler. What changes at B?',
      choices: [['slower', 'Slower'], ['direction', 'Direction only'], ['faster', 'Faster']], answer: 'direction',
      before: {}, after: { mode: 'idler' },
      reason: 'Two external meshes reverse direction twice. B turns the same way as A at the same 60 rpm magnitude; the idler count cancels.' },
    compound: { title: 'Add a second stage', question: 'A 20-tooth gear drives 40 teeth. Fix a 20-tooth C to B’s shaft; C drives a 40-tooth D. What is the overall reduction?',
      choices: [['two', '2:1'], ['four', '4:1'], ['eight', '8:1']], answer: 'four',
      before: {}, after: { mode: 'compound' },
      reason: 'Each stage halves speed. Half of half is one quarter: 120 → 60 → 30 rpm. B and C share 60 rpm because they are fixed to one shaft.' }
  });
  function trial(key) {
    if (!TRIALS[key]) throw new RangeError('Unknown prediction');
    return { before: Object.assign({}, M.DEFAULT, TRIALS[key].before), after: Object.assign({}, M.DEFAULT, TRIALS[key].after) };
  }
  function init(root) {
    if (root.dataset.grReady || !M || !D) return;
    root.dataset.grReady = 'true';
    var id = 'gr-' + (++sequence), state = Object.assign({}, M.DEFAULT), solution = M.solve(state);
    while (document.getElementById(id + '-a')) id = 'gr-' + (++sequence);
    var inputTurns = 0, running = false, frame = 0, previous = null, visible = false;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)'), selected = 'bigger', guess = null;
    var lab = document.createElement('div'); lab.className = 'gr-lab';
    lab.innerHTML = '<p class="gr-start"><strong>Make the driven gear larger.</strong> Move B’s tooth slider, then turn A once. Follow the dots.</p>' +
      '<fieldset class="gr-modes"><legend>Choose a gear train</legend><div>' +
      [['pair', 'Pair'], ['idler', '+ Idler'], ['compound', 'Compound']].map(function (v) {
        return '<label><input type="radio" name="' + id + '-mode" value="' + v[0] + '"' + (v[0] === 'pair' ? ' checked' : '') + '><span>' + v[1] + '</span></label>';
      }).join('') + '</div></fieldset>' +
      '<div class="gr-workbench"><div class="gr-observe"><div class="gr-view-head"><span data-gr-view>FRONT VIEW</span><strong data-gr-ratio></strong></div><div class="gr-plot"></div>' +
      '<div class="gr-motion"><button type="button" data-gr-run aria-pressed="false">Run</button><button type="button" data-gr-step>Turn A once</button><button type="button" data-gr-zero>Zero turns</button></div>' +
      '<div class="gr-turns" data-gr-turns></div><p class="gr-animation" data-gr-animation></p></div>' +
      '<div class="gr-controls"><div class="gr-counts"></div>' +
      '<div class="gr-results"><div><span data-gr-output-title>Output B</span><strong data-gr-speed></strong><small data-gr-direction></small></div>' +
      '<div><span>Ideal output torque</span><strong data-gr-torque></strong><small data-gr-factor></small></div></div>' +
      '<p class="gr-equation" data-gr-equation></p>' +
      '<details class="gr-settings"><summary>Input speed, torque and direction</summary><div class="gr-inputs"></div>' +
      '<label class="gr-reverse"><input type="checkbox" data-gr-reverse>Reverse A (counterclockwise)</label></details>' +
      '<div class="gr-bottom"><span data-gr-input></span><button type="button" data-gr-reset>Reset lab</button></div></div></div>' +
      '<p class="gr-insight" data-gr-insight></p><p class="gr-convention">Ratio i = input speed ÷ output speed, using magnitudes. CW / CCW are viewed from the front of every shaft.</p>' +
      '<details class="gr-predict"><summary>Predict, then test a change</summary><div class="gr-predict-body"><label for="' + id + '-trial">Experiment</label>' +
      '<select id="' + id + '-trial" data-gr-trial><option value="bigger">Make B larger</option><option value="idler">Add an idler</option><option value="compound">Add a second stage</option></select>' +
      '<fieldset class="gr-choices"><legend data-gr-question></legend><div data-gr-choices></div></fieldset>' +
      '<button type="button" data-gr-test disabled>Test prediction</button><p data-gr-feedback role="status">Choose a prediction.</p><div data-gr-comparison hidden></div></div></details>' +
      '<p class="gr-limit">Ideal, lossless gears at steady load. Torque is a calculated tradeoff, not a strength rating. Real gears lose power and have load limits.</p>' +
      '<span class="gr-sr" data-gr-status role="status"></span>';
    root.insertBefore(lab, root.firstChild);
    var q = function (selector) { return lab.querySelector(selector); }, controls = {};
    function control(key, label, unit, min, max, step, parent) {
      var box = document.createElement('div'); box.className = 'gr-control'; box.dataset.grControl = key;
      box.innerHTML = '<label for="' + id + '-' + key + '"><span>' + label + '</span><output for="' + id + '-' + key + '"></output></label>' +
        '<input type="range" id="' + id + '-' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + state[key] + '">';
      parent.appendChild(box); controls[key] = { box: box, input: box.querySelector('input'), output: box.querySelector('output'), label: box.querySelector('label span'), unit: unit };
      controls[key].input.addEventListener('input', function () { state[key] = Number(controls[key].input.value); changed(); });
      controls[key].input.addEventListener('change', announce);
    }
    control('a', 'A · driver', 'teeth', 20, 60, 1, q('.gr-counts'));
    control('b', 'B · driven', 'teeth', 20, 60, 1, q('.gr-counts'));
    control('idler', 'I · idler', 'teeth', 20, 60, 1, q('.gr-counts'));
    control('c', 'C · second driver', 'teeth', 20, 60, 1, q('.gr-counts'));
    control('d', 'D · final driven', 'teeth', 20, 60, 1, q('.gr-counts'));
    control('rpm', 'Input speed', 'rpm', 0, 240, 10, q('.gr-inputs'));
    control('torque', 'Input torque', 'N·m', 0, 10, .5, q('.gr-inputs'));
    // Keep the wiki's presentation arrow keys from navigating while a learner uses a control.
    lab.addEventListener('keydown', function (e) { if (e.target.closest('input, select, button, summary')) e.stopPropagation(); });
    function announce() {
      q('[data-gr-status]').textContent = 'Output ' + solution.output.id + ': ' + M.format(Math.abs(solution.output.rpm)) + ' rpm, ' +
        M.direction(solution.output.rpm) + ', ' + M.format(solution.outputTorque) + ' newton meters ideally. Ratio ' + M.format(solution.ratio) + ' to one.';
    }
    function clearPrediction() {
      q('[data-gr-comparison]').hidden = true;
      q('[data-gr-feedback]').textContent = 'Your setup changed. Each prediction test loads the stated starting setup.';
    }
    function changed() { inputTurns = 0; previous = null; clearPrediction(); update(); }
    function tick(now) {
      frame = 0;
      if (!running || !visible || document.hidden || !root.isConnected || state.rpm === 0) { previous = null; return; }
      var elapsed = previous === null ? 0 : Math.min((now - previous) / 1000, .1);
      previous = now; inputTurns = M.advance(solution, inputTurns, elapsed); paintMotion();
      frame = requestAnimationFrame(tick);
    }
    function schedule() {
      if (running && visible && !document.hidden && state.rpm > 0 && !frame) frame = requestAnimationFrame(tick);
    }
    function pause() {
      running = false; previous = null;
      if (frame) cancelAnimationFrame(frame); frame = 0;
      q('[data-gr-run]').textContent = 'Run'; q('[data-gr-run]').setAttribute('aria-pressed', 'false');
    }
    function paintMotion() {
      solution.gears.forEach(function (g) { q('[data-gear="' + g.id + '"]').setAttribute('transform', D.transform(g, inputTurns)); });
      var outTurns = inputTurns * solution.output.ratio;
      function turns(value) { return Math.abs(value).toFixed(2) + ' turns' + (value === 0 ? '' : value > 0 ? ' CW' : ' CCW'); }
      q('[data-gr-turns]').textContent = 'A: ' + turns(inputTurns) + '  ·  ' + solution.output.id + ': ' + turns(outTurns);
      root.dataset.grTurns = inputTurns.toFixed(6);
    }
    function update() {
      solution = M.solve(state);
      controls.idler.box.hidden = state.mode !== 'idler';
      controls.c.box.hidden = controls.d.box.hidden = state.mode !== 'compound';
      controls.b.label.textContent = state.mode === 'compound' ? 'B · first driven' : 'B · driven';
      Object.keys(controls).forEach(function (key) {
        var c = controls[key]; c.input.value = state[key]; c.output.textContent = M.format(state[key]) + ' ' + c.unit;
        c.input.setAttribute('aria-valuetext', M.format(state[key]) + ' ' + c.unit);
      });
      q('[data-gr-reverse]').checked = state.direction === -1;
      lab.querySelectorAll('.gr-modes input').forEach(function (radio) { radio.checked = radio.value === state.mode; });
      q('.gr-plot').innerHTML = D.train(state, inputTurns);
      root.dataset.grMode = state.mode; root.dataset.grOutputRpm = solution.output.rpm;
      q('[data-gr-view]').textContent = state.mode === 'compound' ? 'TWO FRONT-VIEW MESHES' : 'FRONT VIEW';
      q('[data-gr-ratio]').textContent = M.format(solution.ratio) + ':1 ' + (solution.ratio > 1 ? 'reduction' : solution.ratio < 1 ? 'speed increase' : 'equal speed');
      q('[data-gr-output-title]').textContent = 'Output ' + solution.output.id;
      q('[data-gr-speed]').textContent = M.format(Math.abs(solution.output.rpm)) + ' rpm';
      q('[data-gr-direction]').textContent = state.rpm === 0 ? 'Stopped · ratio stays ' + M.format(solution.ratio) + ':1' : M.direction(solution.output.rpm) + ' · ' + solution.relation + ' direction as A';
      q('[data-gr-torque]').textContent = M.format(solution.outputTorque) + ' N·m';
      q('[data-gr-factor]').textContent = M.format(solution.torqueFactor, 3) + '× input torque';
      q('[data-gr-equation]').textContent = state.rpm === 0 ? '0 rpm → 0 W. Torque shown is the ideal static balance, if loaded.' :
        M.format(solution.inputPower) + ' W in = ' + M.format(solution.outputPower) + ' W out (ideal)';
      q('[data-gr-input]').textContent = 'Input: ' + state.rpm + ' rpm ' + M.direction(state.rpm * state.direction) + ' · ' + state.torque + ' N·m';
      q('[data-gr-insight]').textContent = D.explanation(state);
      var scale = M.animationScale(solution);
      q('[data-gr-animation]').textContent = state.rpm === 0 ? 'Input is stopped. Raise input speed to run; Turn A once checks the geometry by hand.' :
        'Motion at ' + (scale === 1 ? 'real speed' : '1/' + M.format(1 / scale) + ' real speed') + '. Readouts show actual rpm. Dots count turns.';
      q('[data-gr-run]').disabled = state.rpm === 0;
      if (state.rpm === 0) pause();
      paintMotion(); schedule();
    }
    function prediction() {
      var t = TRIALS[selected]; guess = null;
      q('[data-gr-question]').textContent = t.question;
      q('[data-gr-choices]').innerHTML = t.choices.map(function (v) { return '<label><input type="radio" name="' + id + '-guess" value="' + v[0] + '"><span>' + v[1] + '</span></label>'; }).join('');
      q('[data-gr-test]').disabled = true; q('[data-gr-comparison]').hidden = true;
      q('[data-gr-feedback]').textContent = 'Predict first. The test loads its stated gears at 120 rpm clockwise and 2 N·m input.';
    }
    q('.gr-modes').addEventListener('change', function (e) { state.mode = e.target.value; changed(); announce(); });
    q('[data-gr-reverse]').addEventListener('change', function (e) { state.direction = e.target.checked ? -1 : 1; changed(); announce(); });
    q('[data-gr-run]').addEventListener('click', function () {
      if (running) pause(); else { running = true; previous = null; this.textContent = 'Pause'; this.setAttribute('aria-pressed', 'true'); schedule(); }
    });
    q('[data-gr-step]').addEventListener('click', function () {
      pause(); inputTurns += state.direction; paintMotion(); q('[data-gr-status]').textContent = q('[data-gr-turns]').textContent;
    });
    q('[data-gr-zero]').addEventListener('click', function () { pause(); inputTurns = 0; paintMotion(); q('[data-gr-status]').textContent = 'Turn counters reset to zero.'; });
    q('[data-gr-reset]').addEventListener('click', function () {
      pause(); state = Object.assign({}, M.DEFAULT); inputTurns = 0; selected = 'bigger'; q('[data-gr-trial]').value = selected;
      prediction(); update(); announce();
    });
    q('[data-gr-trial]').addEventListener('change', function (e) { selected = e.target.value; prediction(); });
    q('[data-gr-choices]').addEventListener('change', function (e) { guess = e.target.value; q('[data-gr-test]').disabled = false; });
    q('[data-gr-test]').addEventListener('click', function () {
      if (guess === null) return;
      var t = TRIALS[selected], pair = trial(selected), before = M.solve(pair.before), after = M.solve(pair.after);
      pause(); state = pair.after; inputTurns = 0; update();
      q('[data-gr-feedback]').textContent = (guess === t.answer ? 'Prediction confirmed. ' : 'Here is what changes: ') + t.reason;
      q('[data-gr-comparison]').hidden = false;
      q('[data-gr-comparison]').textContent = 'Before: ' + M.format(Math.abs(before.output.rpm)) + ' rpm ' + M.direction(before.output.rpm) + ', ' + M.format(before.outputTorque) + ' N·m. After: ' + M.format(Math.abs(after.output.rpm)) + ' rpm ' + M.direction(after.output.rpm) + ', ' + M.format(after.outputTorque) + ' N·m (ideal).';
    });
    var observer = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (!visible) { if (frame) cancelAnimationFrame(frame); frame = 0; previous = null; } else schedule();
    });
    observer.observe(q('.gr-plot'));
    document.addEventListener('visibilitychange', function () { previous = null; schedule(); });
    reduced.addEventListener('change', function () { if (reduced.matches) { pause(); q('[data-gr-status]').textContent = 'Motion paused for your reduced-motion preference. Turn A once works without animation.'; } });
    prediction(); update(); root.classList.add('gr-live');
  }
  return { init: init, TRIALS: TRIALS, trial: trial };
});
