(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiCSS,
    node ? require('./render.js') : root.CourseWikiCSSDraw);
  if (node) module.exports = api;
  else if (typeof document !== 'undefined') document.querySelectorAll('[data-interactive="css-explorer"]').forEach(api.init);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, D) {
  'use strict';
  var sequence = 0;
  function init(root) {
    if (root.dataset.csReady || !M || !D) return;
    var id = 'cs-' + (++sequence), state = Object.assign({}, M.DEFAULT);
    while (document.getElementById(id + '-units')) id = 'cs-' + (++sequence);
    var running = false, frame = 0, previous = null;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    var lab = document.createElement('div'); lab.className = 'cs-lab';
    lab.innerHTML = '<p><strong>Face toward centre.</strong> Predict where RPM will stop rising, then move the diameter slider.</p>' +
      '<div class="cs-controls"><label for="' + id + '-units">Units<select id="' + id + '-units" data-cs-units><option value="inch">Inch · SFM, in</option><option value="metric">Metric · m/min, mm</option></select></label>' +
      '<div data-cs-speed></div><div data-cs-od></div><div data-cs-clamp></div></div>' +
      '<div data-cs-diameter></div><div class="cs-actions"><button type="button" data-cs-play aria-pressed="false">Face to centre</button>' +
      '<button type="button" data-cs-reset>Return to OD</button><label><input type="checkbox" data-cs-compare> Show no-clamp comparison</label></div>' +
      '<p class="cs-note" data-cs-motion></p><div class="cs-readouts"><div>Commanded RPM<strong data-cs-rpm></strong></div>' +
      '<div>Actual surface speed (ideal)<strong data-cs-actual></strong></div><div>Crossover D*<strong data-cs-cross></strong></div></div>' +
      '<p data-cs-insight></p><div class="cs-plots"><div data-cs-rpm-plot></div><div data-cs-speed-plot></div></div>' +
      '<p class="cs-note">Solid curve: clamped result. Horizontal dashed line: clamp or setpoint. Vertical dotted line: crossover D*. Dot: current diameter. Centre is at the left of both plots.</p>' +
      '<p data-cs-comparison hidden></p><div class="cs-part" data-cs-part></div><span class="cs-sr" role="status" data-cs-status></span>';
    root.insertBefore(lab, root.firstChild);
    var q = function (selector) { return lab.querySelector(selector); }, controls = {};
    function control(key, label, min, max, step) {
      var box = q('[data-cs-' + key + ']'); box.className = 'cs-control';
      box.innerHTML = '<label for="' + id + '-' + key + '"><span>' + label + '</span><output for="' + id + '-' + key + '"></output></label>' +
        '<input type="range" id="' + id + '-' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + state[key] + '">';
      controls[key] = { input: box.querySelector('input'), output: box.querySelector('output') };
      controls[key].input.addEventListener('input', function () {
        pause(); state[key] = Number(this.value);
        if (key === 'od') state.diameter = Math.min(state.diameter, state.od);
        update();
      });
      controls[key].input.addEventListener('change', announce);
    }
    control('speed', 'Surface speed setpoint', 20, 600, 1);
    control('od', 'Stock outside diameter (OD)', .25, 6, .01);
    control('clamp', 'maximum-RPM clamp (G50 on Fanuc-style controls; varies by control)', 100, 6000, 50);
    control('diameter', 'Current cutting diameter D · 0 = centre', 0, state.od, .001);
    function announce() {
      q('[data-cs-status]').textContent = 'Diameter ' + M.format(state.diameter, 3) + ' ' + M.units(state).length + '. ' +
        q('[data-cs-rpm]').textContent + ', surface speed ' + q('[data-cs-actual]').textContent + '. ' + q('[data-cs-insight]').textContent;
    }
    function pause() {
      running = false; previous = null;
      if (frame) cancelAnimationFrame(frame); frame = 0;
      q('[data-cs-play]').textContent = 'Face to centre'; q('[data-cs-play]').setAttribute('aria-pressed', 'false');
    }
    function update() {
      var r = M.solve(state), u = M.units(state), compare = q('[data-cs-compare]').checked;
      controls.diameter.input.max = state.od;
      Object.keys(controls).forEach(function (key) {
        var c = controls[key], unit = key === 'speed' ? u.speed : key === 'clamp' ? 'RPM' : u.length;
        c.input.value = state[key]; c.output.textContent = M.format(state[key], 3) + ' ' + unit;
        c.input.setAttribute('aria-valuetext', M.format(state[key], 3) + ' ' + unit);
      });
      q('[data-cs-rpm]').textContent = M.format(r.rpm) + ' RPM';
      q('[data-cs-actual]').textContent = M.format(r.surfaceSpeed) + ' ' + u.speed;
      q('[data-cs-cross]').textContent = M.format(r.crossover, 3) + ' ' + u.length;
      q('[data-cs-insight]').textContent = state.diameter === 0 ? 'At centre: clamp active, surface speed zero.' :
        r.clampActive ? 'Clamp active: RPM holds at the ceiling. Moving farther inward reduces surface speed.' :
          'Below the RPM ceiling: RPM rises as diameter shrinks, holding the surface speed setpoint.';
      if (r.crossover > state.od) q('[data-cs-insight]').textContent += ' D* is beyond the stock OD; the entire plotted cut is clamped.';
      q('[data-cs-rpm-plot]').innerHTML = D.plot(state, 'rpm', compare);
      q('[data-cs-speed-plot]').innerHTML = D.plot(state, 'speed', false);
      q('[data-cs-part]').innerHTML = D.endView(state);
      q('[data-cs-comparison]').hidden = !compare;
      q('[data-cs-comparison]').textContent = 'Dotted comparison with an arrow: without a clamp, the ideal CSS request rises beyond the chart as D approaches zero. At zero there is no finite RPM that maintains a nonzero surface speed. The solid curves and readouts still include the clamp.';
      q('[data-cs-motion]').textContent = reduced.matches ? 'Reduced motion: Face to centre jumps to the endpoint. Use the slider to inspect intermediate diameters.' :
        'The sweep takes 8 seconds from OD to centre. This is a teaching animation, not a feed-rate or spindle-acceleration simulation.';
    }
    function tick(now) {
      frame = 0;
      if (!running) return;
      if (!root.isConnected || document.hidden || !lab.getClientRects().length) { pause(); return; }
      var elapsed = previous === null ? 0 : Math.min((now - previous) / 1000, .1); previous = now;
      state.diameter = Math.max(0, state.diameter - state.od * elapsed / 8); update();
      if (state.diameter === 0) { pause(); announce(); } else frame = requestAnimationFrame(tick);
    }
    q('[data-cs-play]').addEventListener('click', function () {
      if (running) { pause(); announce(); return; }
      state.diameter = reduced.matches ? 0 : state.od; update();
      if (reduced.matches) { announce(); return; }
      running = true; previous = null; this.textContent = 'Pause'; this.setAttribute('aria-pressed', 'true');
      frame = requestAnimationFrame(tick);
    });
    q('[data-cs-reset]').addEventListener('click', function () { pause(); state.diameter = state.od; update(); announce(); });
    q('[data-cs-compare]').addEventListener('change', update);
    q('[data-cs-units]').addEventListener('change', function () {
      pause();
      // Unit choices load explicit teaching presets; they do not silently reinterpret old values.
      state = this.value === 'metric' ? { units: 'metric', speed: 120, od: 40, diameter: 40, clamp: 1000 } : Object.assign({}, M.DEFAULT);
      var metric = state.units === 'metric';
      [['speed', metric ? 10 : 20, metric ? 200 : 600, 1], ['od', metric ? 5 : .25, metric ? 150 : 6, metric ? .1 : .01]].forEach(function (v) {
        var input = controls[v[0]].input; input.min = v[1]; input.max = v[2]; input.step = v[3];
      });
      controls.diameter.input.step = metric ? .01 : .001; update();
      q('[data-cs-status]').textContent = 'Loaded ' + (metric ? '120 m/min, 40 mm' : '240 SFM, 2 in') + ' teaching preset with a 1000 RPM clamp.';
    });
    lab.addEventListener('keydown', function (e) { if (e.target.closest('input, select, button')) e.stopPropagation(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
    window.addEventListener('beforeprint', pause);
    reduced.addEventListener('change', function () { pause(); update(); });
    update(); root.dataset.csReady = 'true'; root.classList.add('cs-live');
  }
  return { init: init };
});
