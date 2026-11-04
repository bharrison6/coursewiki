(function (root) {
  'use strict';
  var M = root.CourseWikiPrintOrientation, D = root.CourseWikiPrintOrientationDraw, S = root.CourseWikiPrintOrientation3D;
  if (!M || !D) return;
  var sequence = 0;
  function init(mount) {
    if (mount.dataset.poReady) return;
    var id = 'po-' + (++sequence), s = M.state(), inspect = 0, saved = [], revealedKey = null, score = { checked: 0, matched: 0 }, scene = null;
    var live = document.createElement('div'); live.className = 'po-live';
    var presets = M.PRESETS.map(function (p) { return '<button type="button" data-po-preset="' + p.id + '">' + p.label + '</button>'; }).join('');
    function radio(name, value, label, checked) { return '<label class="po-radio"><input type="radio" name="' + id + '-' + name + '" value="' + value + '"' + (checked ? ' checked' : '') + '><span>' + label + '</span></label>'; }
    live.innerHTML =
      '<p class="po-intro"><strong>Challenge:</strong> this bracket will be screwed to a wall with a weight hanging from its arm. Turn it on the build plate and find an orientation that needs little support <em>and</em> keeps the stretched material parallel to the layers. Red-orange faces need support; the pillars show the support proxy.</p>' +
      D.legend() +
      '<div class="po-work"><div class="po-stage"><div class="po-canvas" data-po-scene></div>' +
        '<div class="po-viewbar" role="group" aria-label="Camera"><button type="button" data-po-view="iso">3D view</button><button type="button" data-po-view="front">Front</button><button type="button" data-po-view="top">Top</button><button type="button" data-po-view="under">From below</button></div>' +
        '<p class="po-status" role="status" aria-live="polite" data-po-status>Loading the 3D view…</p></div>' +
      '<div class="po-controls">' +
        '<fieldset><legend>Orientation</legend><div class="po-presets">' + presets + '</div><div data-po-near="orientation" aria-live="polite"></div>' +
          '<label for="' + id + '-spin">Turn about the width axis <output data-po-out="spin">0°</output></label>' +
          '<input class="po-range" id="' + id + '-spin" type="range" min="-180" max="180" step="5" value="0" data-po="spin">' +
          '<p class="po-hint" data-po-spin-hint>Upright: the bend profile stands vertical.</p>' +
          radio('lay', 'upright', 'Profile upright', true) + radio('lay', 'side', 'Lying on its side', false) + '</fieldset>' +
        '<fieldset><legend>Load in use</legend>' + radio('load', 'hang', M.LOADS.hang.title, true) + radio('load', 'pull', M.LOADS.pull.title, false) + radio('load', 'none', M.LOADS.none.title, false) + '</fieldset>' +
        '<fieldset><legend>Print settings</legend>' +
          '<label for="' + id + '-threshold">Overhang threshold <output data-po-out="threshold">45°</output></label>' +
          '<input class="po-range" id="' + id + '-threshold" type="range" min="20" max="70" step="1" value="45" data-po="threshold">' +
          '<p class="po-hint">Faces flatter than this, measured from the plate, are flagged. 45° is a common starting guideline; printers and settings differ.</p>' +
          '<div data-po-near="settings" aria-live="polite"></div>' +
          '<label for="' + id + '-layer">Layer height <output data-po-out="layer">0.20 mm</output></label>' +
          '<input class="po-range" id="' + id + '-layer" type="range" min="0.05" max="0.30" step="0.05" value="0.20" data-po="layer">' +
          '<label for="' + id + '-inspect">Inspect layer <output data-po-out="inspect">125</output></label>' +
          '<input class="po-range" id="' + id + '-inspect" type="range" min="1" max="250" step="1" value="125" data-po="inspect">' +
          '<p class="po-hint">The grey sheet is that layer\'s plane, parallel to the plate; the dark outline is its cross-section. <span data-po-stride></span></p></fieldset>' +
        '<div class="po-actions"><div class="po-row"><button type="button" data-po-action="save">Save to table</button><button type="button" data-po-action="reset">Reset orientation and settings</button></div>' +
          '<p class="po-saved-note" data-po-saved-note aria-live="polite">Saved orientations: none yet. The table below keeps them; Reset leaves it alone.</p><ol class="po-saved-mini" data-po-saved-mini></ol></div>' +
      '</div></div>' +
      '<div class="po-predict" data-po-predict><p><strong>Predict, then check:</strong> <span data-po-question></span></p>' +
        '<div role="radiogroup" aria-label="Your prediction">' + radio('predict', 'parallel', 'Mostly <strong>parallel</strong> to the layer planes (under 45°)', false) + radio('predict', 'normal', 'Mostly <strong>normal</strong> to the layer planes somewhere (over 45°)', false) + '</div>' +
        '<div class="po-row"><button type="button" data-po-action="check" disabled>Check my prediction</button><button type="button" data-po-action="reveal">Show without predicting</button></div>' +
        '<p class="po-feedback" data-po-feedback aria-live="polite"></p><p class="po-score" data-po-score></p></div>' +
      '<div data-po-readout></div>' +
      '<h3>Layer steps on the curved faces</h3><div data-po-stairs></div>' +
      '<h3>Compare orientations</h3><p class="po-hint">Save the current orientation to compare support, height and load direction side by side.</p><div class="po-compare-wrap" tabindex="0" role="region" aria-label="Saved orientations table" data-po-table><p>No saved orientations yet.</p></div>' +
      '<div class="po-row"><button type="button" data-po-action="clear" disabled>Clear table and score</button></div>' +
      '<p class="po-limit"><strong>Model limits:</strong> geometry only, not a slicer. The support figure is the plate-projected area of flagged faces: not support volume, print time or a promise a face will print. Bridging, support landing on the part, cooling and removal are not modelled. The load angle is a direction, not a strength value.</p>';
    mount.insertBefore(live, mount.firstChild);
    function q(sel) { return live.querySelector(sel); }
    function qa(sel) { return Array.prototype.slice.call(live.querySelectorAll(sel)); }
    var analysis = null;
    function configKey() { return s.spin + '|' + s.lay + '|' + s.load; }
    function revealed() { return s.load !== 'none' && revealedKey === configKey(); }
    function set(patch) { s = M.state(Object.assign({}, s, patch)); refresh(); }
    function label() { return 'Bracket ' + D.describeState(s) + '.'; }
    function refresh(announce) {
      analysis = M.analyze(s);
      var n = analysis.layers, inp = q('[data-po="inspect"]');
      inp.max = String(n); if (!inspect || inspect > n) inspect = Math.ceil(n / 2); inp.value = String(inspect);
      q('[data-po-out="inspect"]').textContent = inspect + ' of ' + n;
      var stride = Math.max(1, Math.ceil(n / 100)); // same display decimation as the 3D view
      q('[data-po-stride]').textContent = stride === 1 ? 'Thin lines on the part are the layer boundaries.' : 'Thin lines on the part mark every ' + stride + (stride === 2 ? 'nd' : stride === 3 ? 'rd' : 'th') + ' layer boundary, so they stay readable.';
      q('[data-po="spin"]').value = String(s.spin); q('[data-po-out="spin"]').textContent = s.spin + '°';
      q('[data-po="threshold"]').value = String(s.threshold); q('[data-po-out="threshold"]').textContent = s.threshold + '°';
      q('[data-po="layer"]').value = s.layer.toFixed(2); q('[data-po-out="layer"]').textContent = s.layer.toFixed(2) + ' mm';
      qa('input[name="' + id + '-lay"]').forEach(function (r) { r.checked = r.value === s.lay; });
      qa('input[name="' + id + '-load"]').forEach(function (r) { r.checked = r.value === s.load; });
      qa('[data-po-preset]').forEach(function (b) { var p = M.PRESETS.filter(function (x) { return x.id === b.dataset.poPreset; })[0]; b.setAttribute('aria-pressed', String(p.lay === s.lay && (p.lay === 'side' || p.spin === s.spin))); });
      q('[data-po-spin-hint]').textContent = s.lay === 'side' ? 'On its side, turning only spins the part on the plate: overhangs, height and layer direction do not change.' : 'Upright: the bend profile stands vertical. 0° puts the arm flat on the plate.';
      var html = D.readouts(analysis, s.lay === 'upright' ? M.section(s) : null);
      var holder = q('[data-po-readout]'); holder.innerHTML = html;
      var loadBox = holder.querySelector('[data-po-load-readout]');
      if (s.load === 'none') { loadBox.querySelector('dd').innerHTML = '<strong>—</strong><span>Choose a load to see its direction relative to the layers.</span>'; loadBox.classList.remove('is-warn'); }
      else if (!revealed()) { loadBox.querySelector('dd').innerHTML = '<strong>Predict first</strong><span>Answer the prediction above, or choose Show without predicting.</span>'; loadBox.classList.remove('is-warn'); }
      q('[data-po-stairs]').innerHTML = s.lay === 'upright' ? D.stairFigure(M.section(s)) : D.planFigure(analysis);
      // Prediction panel
      var predict = q('[data-po-predict]');
      predict.hidden = s.load === 'none';
      q('[data-po-question]').textContent = s.load === 'hang' ? 'With the bracket ' + D.describeState(s) + ', does the stretched material around the bend run mostly parallel to the layer planes, or is some of it mostly normal to them?' : 'With the bracket ' + D.describeState(s) + ', is the arm\'s pull mostly parallel to the layer planes or mostly normal to them?';
      if (!revealed()) { q('[data-po-feedback]').textContent = ''; }
      q('[data-po-score]').textContent = score.checked ? 'Predictions checked: ' + score.checked + '. Matched: ' + score.matched + '.' : '';
      updateCheck();
      var near = q('[data-po-near="orientation"]'), wide = live.clientWidth >= 992;
      near.innerHTML = D.consequence(analysis, { thumb: !wide, revealLoad: revealed() });
      q('[data-po-near="settings"]').innerHTML = D.consequence(analysis, { thumb: !wide, revealLoad: revealed() });
      if (scene) { scene.update(analysis, { inspect: inspect, revealLoad: revealed() }); scene.label(label()); }
      else if (mount.dataset.poReady === 'fallback') q('[data-po-scene]').innerHTML = D.partView(analysis, { aria: label(), pillars: true, revealLoad: revealed() }).replace('class="po-view"', 'class="po-view" data-po-fallback');
      if (announce) q('[data-po-status]').textContent = statusText();
      mount.dataset.poState = s.lay + ':' + s.spin + ':' + s.load;
    }
    function statusText() {
      var a = analysis, t = 'Bracket ' + D.describeState(s) + '. ';
      t += a.supportSum >= 0.5 ? 'Unsupported overhang about ' + D.format.area(a.supportSum) + '. ' : 'No unsupported overhang. ';
      return t + D.format.n1(a.height) + ' mm tall, ' + a.layers + ' layers.';
    }
    function updateCheck() { var any = qa('input[name="' + id + '-predict"]').some(function (r) { return r.checked; }); q('[data-po-action="check"]').disabled = !any || revealed(); }
    function revealNow(prediction) {
      var L = analysis.load; if (!L) return;
      revealedKey = configKey();
      var fb = q('[data-po-feedback]'), words = D.format.deg(L.max);
      if (prediction) {
        var g = M.gradePrediction(prediction, L.max); score.checked++; if (g.correct) score.matched++;
        fb.textContent = (g.result === 'either' ? 'Either answer is defensible here: the largest angle is ' + words + ', close to the 45° boundary. ' : g.correct ? 'Matches. ' : 'Not this time. ') + 'Largest load-to-layer angle: ' + words + '. ' + (L.mostlyNormal ? 'Where the stretched direction is normal to the layers, the load must cross the bonds between them.' : 'The stretched direction stays close to the layer planes, within the layers. (Road direction inside a layer is not modelled.)');
      } else fb.textContent = 'Largest load-to-layer angle: ' + words + '.';
      refresh(true);
    }
    // Controls
    qa('[data-po-preset]').forEach(function (b) { b.addEventListener('click', function () { var p = M.PRESETS.filter(function (x) { return x.id === b.dataset.poPreset; })[0]; set({ spin: p.spin, lay: p.lay }); q('[data-po-status]').textContent = statusText(); }); });
    ['spin', 'threshold', 'layer'].forEach(function (k) {
      var el = q('[data-po="' + k + '"]');
      el.addEventListener('input', function () { var v = Number(el.value); if (k === 'layer') v = Math.round(v * 100) / 100; var patch = {}; patch[k] = v; set(patch); });
      el.addEventListener('change', function () { q('[data-po-status]').textContent = statusText(); });
    });
    q('[data-po="inspect"]').addEventListener('input', function () { inspect = Number(this.value); q('[data-po-out="inspect"]').textContent = inspect + ' of ' + analysis.layers; if (scene) scene.update(analysis, { inspect: inspect, revealLoad: revealed() }); });
    qa('input[name="' + id + '-lay"]').forEach(function (r) { r.addEventListener('change', function () { set({ lay: r.value }); q('[data-po-status]').textContent = statusText(); }); });
    qa('input[name="' + id + '-load"]').forEach(function (r) { r.addEventListener('change', function () { set({ load: r.value }); }); });
    qa('input[name="' + id + '-predict"]').forEach(function (r) { r.addEventListener('change', updateCheck); });
    q('[data-po-action="check"]').addEventListener('click', function () { var p = qa('input[name="' + id + '-predict"]').filter(function (r) { return r.checked; })[0]; if (p) revealNow(p.value); });
    q('[data-po-action="reveal"]').addEventListener('click', function () { revealNow(null); });
    q('[data-po-action="save"]').addEventListener('click', function () {
      var key = JSON.stringify(s);
      saved = saved.filter(function (r) { return r.key !== key; }); saved.push({ key: key, state: s }); if (saved.length > 6) saved.shift();
      renderTable(); q('[data-po-status]').textContent = 'Saved: ' + D.describeState(s) + '. ' + saved.length + ' in the table.';
      q('[data-po-saved-note]').textContent = 'Saved: ' + D.describeState(s) + '. ' + saved.length + ' saved; full table below.';
    });
    q('[data-po-action="clear"]').addEventListener('click', function () { saved = []; score = { checked: 0, matched: 0 }; renderTable(); refresh(); q('[data-po-status]').textContent = 'Table and prediction score cleared.'; });
    q('[data-po-action="reset"]').addEventListener('click', function () {
      s = M.state(); inspect = 0; revealedKey = null; qa('input[name="' + id + '-predict"]').forEach(function (r) { r.checked = false; });
      refresh(); if (scene) scene.view('iso'); q('[data-po-status]').textContent = 'Orientation and settings reset; saved table and score kept. ' + statusText();
    });
    qa('[data-po-view]').forEach(function (b) { b.addEventListener('click', function () { if (scene) scene.view(b.dataset.poView); }); });
    function renderTable() {
      var holder = q('[data-po-table]');
      var mini = q('[data-po-saved-mini]');
      mini.innerHTML = saved.map(function (r) { var a = M.analyze(r.state); return '<li>' + D.describeState(r.state).replace(/^./, function (c) { return c.toUpperCase(); }) + ': ' + (a.supportSum >= 0.5 ? D.format.area(a.supportSum) : 'no') + ' support, ' + a.layers + ' layers' + (a.load ? ', load ≤ ' + D.format.deg(a.load.max) : '') + '</li>'; }).join('');
      if (!saved.length) { holder.innerHTML = '<p>No saved orientations yet.</p>'; q('[data-po-saved-note]').textContent = 'Saved orientations: none yet. The table below keeps them; Reset leaves it alone.'; q('[data-po-action="clear"]').disabled = true; return; }
      holder.innerHTML = D.compareTable(saved.map(function (r, i) { var st = r.state; return { label: (i + 1) + '. ' + D.describeState(st).replace(/^./, function (c) { return c.toUpperCase(); }) + ' · ' + st.layer.toFixed(2) + ' mm, ' + st.threshold + '°', analysis: M.analyze(st) }; }), { caption: 'Saved orientations (each row keeps its own settings)' });
      q('[data-po-action="clear"]').disabled = false;
    }
    mount.dataset.poReady = 'loading';
    refresh();
    var host = q('[data-po-scene]');
    function fallback() {
      mount.dataset.poReady = 'fallback'; mount.classList.add('po-live-ready');
      qa('[data-po-view]').forEach(function (b) { b.disabled = true; });
      refresh(); q('[data-po-status]').textContent = '3D view unavailable here; showing the same model as a fixed drawing. ' + statusText();
    }
    try {
      if (!S) throw new Error('no 3D');
      scene = S.create(host);
      mount.dataset.poReady = 'true'; mount.classList.add('po-live-ready');
      refresh(); scene.view('iso'); q('[data-po-status]').textContent = statusText();
    } catch (e) { scene = null; fallback(); }
    mount.poDispose = function () { if (scene) scene.dispose(); live.remove(); mount.classList.remove('po-live-ready'); delete mount.dataset.poReady; };
  }
  function start() { document.querySelectorAll('[data-interactive="print-orientation"]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof globalThis !== 'undefined' ? globalThis : this);
