(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiChainChordal,
    node ? require('./render.js') : root.CourseWikiChainChordalDraw);
  if (node) module.exports = api;
  else if (typeof document !== 'undefined') document.querySelectorAll('[data-interactive="chain-chordal-action"]').forEach(api.init);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, D) {
  'use strict';
  var sequence = 0;
  var DISPLAY_RPM = 5;            // animation speed: one sprocket turn every 12 s
  var TRACE_TEETH = 3;            // trace window, in teeth of rotation
  var BANDS = [['under2', 'under 2 %'], ['2to10', '2 to 10 %'], ['over10', 'over 10 %']];
  // Band containing a ripple fraction. Bands are wide on purpose: both common normalizations
  // (÷ v_max and ÷ average speed) land in the same band for 9 and 21 teeth.
  function band(r) { return r < 0.02 ? 'under2' : r <= 0.10 ? '2to10' : 'over10'; }
  function scorePrediction(answers) {
    var expected = { 9: band(M.ripple(9)), 21: band(M.ripple(21)) };
    return { expected: expected, correct: (answers[9] === expected[9] ? 1 : 0) + (answers[21] === expected[21] ? 1 : 0) };
  }

  function init(root) {
    if (root.dataset.ccReady || !M || !D) return;
    root.dataset.ccReady = 'true';
    var id = 'cc-' + (++sequence);
    while (document.getElementById(id + '-teeth')) id = 'cc-' + (++sequence);
    var state = Object.assign({}, M.DEFAULT), phase = 0, ghost = false, compare = [];
    var running = false, frame = 0, previous = null, visible = true, width = 640;
    var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener: function () {} };
    var answers = { 9: null, 21: null };

    function choices(N) {
      return BANDS.map(function (b) {
        return '<label><input type="radio" name="' + id + '-p' + N + '" value="' + b[0] + '" data-cc-guess="' + N + '"><span>' + b[1] + '</span></label>';
      }).join('');
    }
    var lab = document.createElement('div'); lab.className = 'cc-lab';
    lab.innerHTML =
      '<div class="cc-challenge"><p>Challenge: the same chain runs on a 9-tooth and a 21-tooth sprocket at the same speed. How much does the chain speed ripple on each?</p>' +
      '<div class="cc-questions" data-cc-questions><fieldset><legend>9-tooth sprocket: speed ripple is…</legend><div class="cc-choices">' + choices(9) + '</div></fieldset>' +
      '<fieldset><legend>21-tooth sprocket: speed ripple is…</legend><div class="cc-choices">' + choices(21) + '</div></fieldset></div>' +
      // The result takes the questions' place, so it appears where the learner was just looking.
      '<div class="cc-result" data-cc-result hidden><p class="cc-score" data-cc-score></p><div class="cc-preview" data-cc-preview></div>' +
      '<div class="cc-result-text"><ul class="cc-lines" data-cc-lines></ul><p><span data-cc-detail></span> <a class="cc-jump" href="#' + id + '-observe">Watch it on the sprocket</a>.</p></div></div>' +
      '<div class="cc-check-row"><button type="button" class="cc-primary" data-cc-check disabled>Test my prediction</button>' +
      '<button type="button" data-cc-again hidden>Change my answers</button>' +
      '<p class="cc-feedback" data-cc-feedback role="status">Predict first: pick one answer for each sprocket. Ripple = (fastest − slowest) ÷ fastest chain speed.</p></div></div>' +
      '<div class="cc-workbench"><div class="cc-observe" id="' + id + '-observe"><div data-cc-figure></div>' +
      // Tooth count and hand position sit directly under the drawing they change.
      '<div class="cc-pair">' +
      '<div class="cc-control"><label for="' + id + '-teeth"><span>Sprocket teeth N</span><output for="' + id + '-teeth" data-cc-out="teeth"></output></label>' +
      '<p class="cc-quick" data-cc-quick></p><div class="cc-stepper"><button type="button" data-cc-dec aria-label="One tooth fewer">−</button>' +
      '<input type="range" id="' + id + '-teeth" min="' + M.LIMITS.teethMin + '" max="' + M.LIMITS.teethMax + '" step="1" data-cc-teeth>' +
      '<button type="button" data-cc-inc aria-label="One tooth more">+</button></div></div>' +
      '<div class="cc-control"><label for="' + id + '-hand"><span>Turn by hand</span><output for="' + id + '-hand" data-cc-out="hand"></output></label>' +
      '<input type="range" id="' + id + '-hand" min="-50" max="50" step="1" value="0" data-cc-hand></div></div>' +
      '<div class="cc-motion"><button type="button" class="cc-primary cc-run" data-cc-run aria-pressed="false">Run</button>' +
      '<button type="button" data-cc-step>Step ⅛ tooth</button></div>' +
      '<p class="cc-anim-note" data-cc-anim></p><div class="cc-trace-wrap" data-cc-trace></div></div>' +
      '<div class="cc-controls">' +
      '<div class="cc-control"><label for="' + id + '-chain"><span>Chain size</span></label><select id="' + id + '-chain" data-cc-pitch>' +
      M.PITCHES.map(function (c) { return '<option value="' + c.id + '">' + c.label + ' · p = ' + M.format(c.p, 4) + ' mm</option>'; }).join('') + '</select></div>' +
      '<div class="cc-control"><label for="' + id + '-rpm"><span>Sprocket speed</span><output for="' + id + '-rpm" data-cc-out="rpm"></output></label>' +
      '<input type="range" id="' + id + '-rpm" min="' + M.LIMITS.rpmMin + '" max="' + M.LIMITS.rpmMax + '" step="' + M.LIMITS.rpmStep + '" data-cc-rpm></div>' +
      '<label class="cc-toggle"><input type="checkbox" data-cc-ghost>Show smooth pitch circle (belt-like)</label>' +
      '<div class="cc-results">' +
      '<div><span>Speed ripple</span><strong data-cc-r="ripple"></strong><small data-cc-r="rippleNote"></small></div>' +
      '<div><span>Span rise and fall</span><strong data-cc-r="rise"></strong><small data-cc-r="riseNote"></small></div>' +
      '<div><span>Chain speed now</span><strong data-cc-r="speed"></strong><small data-cc-r="range"></small></div>' +
      '<div><span>Pulses</span><strong data-cc-r="pulse"></strong><small data-cc-r="mean"></small></div></div>' +
      '<p class="cc-equation" data-cc-equation></p>' +
      '<div class="cc-check-row cc-reset-row"><button type="button" data-cc-clear hidden>Clear comparison</button><button type="button" data-cc-reset>Reset lab</button></div>' +
      '</div></div>' +
      '<p class="cc-insight" data-cc-insight></p>' +
      '<p class="cc-limit">Model: rigid links of exactly one pitch, pins seated on the pitch polygon, a taut straight span kept level, and a constant sprocket speed. One sprocket only; no stretch, wear, clearance or vibration response.</p>' +
      '<span class="cc-sr" data-cc-status role="status"></span>';
    root.insertBefore(lab, root.firstChild);
    var q = function (s) { return lab.querySelector(s); };
    var figure = q('[data-cc-figure]'), traceBox = q('[data-cc-trace]');
    var parts = {};

    function pitch() { return M.pitchOf(state.chain); }
    function pickWidth() { return (figure.clientWidth || root.clientWidth || 640) < 520 ? 420 : 640; }
    function drawScene() {
      width = pickWidth();
      figure.innerHTML = D.scene(state, phase, { width: width, ghost: ghost, uid: id });
      parts = { svg: figure.querySelector('svg'), sprocket: figure.querySelector('[data-cc-sprocket]'),
        chain: figure.querySelector('[data-cc-chain]'), overlay: figure.querySelector('[data-cc-overlay]') };
    }
    function drawTrace() {
      traceBox.innerHTML = D.traceChart({ width: width, teeth: state.teeth, from: phase - TRACE_TEETH, to: phase,
        cursor: true, ghost: ghost, compare: compare });
    }
    function paintMotion() {
      parts.sprocket.setAttribute('transform', D.sprocketTransform(state, phase, width));
      parts.chain.innerHTML = D.chainLayer(state, phase, width);
      parts.overlay.innerHTML = D.overlayLayer(state, phase, width, ghost);
      drawTrace();
      var I = M.instant(state.teeth, pitch(), state.rpm, phase);
      var hand = Math.round(I.angle / (2 * M.halfAngle(state.teeth)) * 100);
      q('[data-cc-hand]').value = String(hand);
      var a = I.angleDeg, text = Math.abs(a) < 0.05 ? 'at top' : M.format(Math.abs(a), 3) + '° ' + (a > 0 ? 'past top' : 'before top');
      q('[data-cc-out="hand"]').textContent = 'pin ' + text;
      q('[data-cc-hand]').setAttribute('aria-valuetext', 'Leaving pin ' + text + ', span ' + M.format(I.drop, 3) + ' millimetres below R');
      q('[data-cc-r="speed"]').textContent = M.format(I.speed, 4) + ' m/s';
      root.dataset.ccPhase = phase.toFixed(6);
      root.dataset.ccSpeedRatio = I.speedRatio.toFixed(8);
    }
    function describe() {
      var I = M.instant(state.teeth, pitch(), state.rpm, phase);
      parts.svg.setAttribute('aria-label', D.sceneLabel(state, phase));
      return state.teeth + ' teeth: ripple ' + M.percent(M.ripple(state.teeth), 2) + ', span rises and falls ' + M.format(M.rise(state.teeth, pitch()), 3) +
        ' millimetres. Chain speed now ' + M.format(I.speedRatio * 100, 4) + ' percent of the maximum.';
    }
    function announce(extra) { q('[data-cc-status]').textContent = (extra ? extra + ' ' : '') + describe(); }

    function update() {
      var s = M.summary(state.teeth, pitch(), state.rpm), half = M.format(180 / state.teeth, 4) + '°';
      q('[data-cc-teeth]').value = String(state.teeth);
      q('[data-cc-teeth]').setAttribute('aria-valuetext', state.teeth + ' teeth');
      q('[data-cc-out="teeth"]').textContent = state.teeth + ' teeth';
      q('[data-cc-dec]').disabled = state.teeth <= M.LIMITS.teethMin;
      q('[data-cc-inc]').disabled = state.teeth >= M.LIMITS.teethMax;
      q('[data-cc-pitch]').value = state.chain;
      q('[data-cc-rpm]').value = String(state.rpm);
      q('[data-cc-out="rpm"]').textContent = state.rpm + ' r/min';
      q('[data-cc-rpm]').setAttribute('aria-valuetext', state.rpm + ' revolutions per minute');
      q('[data-cc-ghost]').checked = ghost;
      q('[data-cc-quick]').textContent = 'Ripple ' + M.percent(s.ripple, 2) + ' · span rises ' + M.format(s.rise, 3) + ' mm';
      q('[data-cc-r="ripple"]').textContent = M.percent(s.ripple, 2);
      q('[data-cc-r="rippleNote"]').textContent = '1 − cos(' + half + ')';
      q('[data-cc-r="rise"]').textContent = M.format(s.rise, 3) + ' mm';
      q('[data-cc-r="riseNote"]').textContent = 'R (1 − cos ' + half + ')';
      q('[data-cc-r="range"]').textContent = M.format(s.vmin, 4) + ' to ' + M.format(s.vmax, 4) + ' m/s';
      q('[data-cc-r="pulse"]').textContent = M.format(s.pulseHz, 3) + ' per second';
      q('[data-cc-r="mean"]').textContent = 'one per tooth · average ' + M.format(s.vmean, 4) + ' m/s';
      q('[data-cc-equation]').innerHTML = 'R = p / (2 sin(180°/N)) = ' + M.format(s.pitch, 4) + ' / (2 sin ' + half + ') = <b>' + M.format(s.R, 4) + ' mm</b>. ' +
        'v<sub>max</sub> = ωR; v<sub>min</sub> = ωR cos ' + half + '.';
      q('[data-cc-insight]').textContent = insight(s);
      q('[data-cc-clear]').hidden = compare.length === 0;
      motionNote();
      drawScene(); paintMotion(); drawPreview();
      root.dataset.ccN = String(state.teeth);
    }
    function insight(s) {
      var twice = Math.min(state.teeth * 2, 60);
      return 'The chain can bend only at its pins, so on ' + s.teeth + ' teeth it wraps a ' + s.teeth + '-sided polygon, not a circle. ' +
        'Each time a pin passes the top the leaving span rides up to R and speeds up to ωR; between pins it drops ' + M.format(s.rise, 3) +
        ' mm and slows by ' + M.percent(s.ripple, 2) + '. That pulse repeats once per tooth. Doubling to ' + twice + ' teeth would cut the ripple to ' +
        M.percent(M.ripple(twice), 2) + ', about a quarter, because it shrinks roughly with 1/N².';
    }
    function motionNote() {
      var run = q('[data-cc-run]');
      if (reduced.matches) {
        pause(); run.hidden = true;
        q('[data-cc-anim]').textContent = 'Reduced motion is on: use Step ⅛ tooth or Turn by hand. Readouts use ' + state.rpm + ' r/min.';
      } else {
        run.hidden = false;
        q('[data-cc-anim]').textContent = 'Animation slowed to ' + DISPLAY_RPM + ' r/min (1/' + M.format(state.rpm / DISPLAY_RPM, 3) +
          ' of ' + state.rpm + ' r/min). Readouts and the trace use the real ' + state.rpm + ' r/min.';
      }
    }

    function tick(now) {
      frame = 0;
      if (!running || !visible || document.hidden || !root.isConnected) { previous = null; return; }
      var dt = previous === null ? 0 : Math.min((now - previous) / 1000, 0.1);
      previous = now; phase += dt * DISPLAY_RPM / 60 * state.teeth;
      paintMotion();
      frame = requestAnimationFrame(tick);
    }
    function schedule() { if (running && visible && !document.hidden && !frame) frame = requestAnimationFrame(tick); }
    function pause() {
      running = false; previous = null;
      if (frame) cancelAnimationFrame(frame); frame = 0;
      var run = q('[data-cc-run]'); run.textContent = 'Run'; run.setAttribute('aria-pressed', 'false');
    }
    function play() {
      if (reduced.matches) return;
      running = true; previous = null;
      var run = q('[data-cc-run]'); run.textContent = 'Pause'; run.setAttribute('aria-pressed', 'true');
      schedule();
    }
    function setTeeth(N) {
      N = Math.max(M.LIMITS.teethMin, Math.min(M.LIMITS.teethMax, Math.round(N)));
      if (N === state.teeth) return;
      // Keep the leaving pin's position within its tooth while the tooth count changes.
      var frac = phase - Math.floor(phase + 0.5);
      state.teeth = N; phase = frac; update();
    }

    lab.addEventListener('keydown', function (e) { if (e.target.closest('input, select, button, summary')) e.stopPropagation(); });
    q('[data-cc-teeth]').addEventListener('input', function (e) { setTeeth(Number(e.target.value)); });
    q('[data-cc-teeth]').addEventListener('change', function () { announce(); });
    q('[data-cc-dec]').addEventListener('click', function () { setTeeth(state.teeth - 1); announce(); });
    q('[data-cc-inc]').addEventListener('click', function () { setTeeth(state.teeth + 1); announce(); });
    q('[data-cc-hand]').addEventListener('input', function (e) {
      pause(); phase = Math.floor(phase + 0.5) + Number(e.target.value) / 100; paintMotion();
    });
    q('[data-cc-hand]').addEventListener('change', function () { announce(); });
    q('[data-cc-pitch]').addEventListener('change', function (e) { state.chain = e.target.value; update(); announce(); });
    q('[data-cc-rpm]').addEventListener('input', function (e) { state.rpm = Number(e.target.value); update(); });
    q('[data-cc-rpm]').addEventListener('change', function () { announce('Ripple percentage does not depend on speed; pulses per second do.'); });
    q('[data-cc-ghost]').addEventListener('change', function (e) {
      ghost = e.target.checked; drawScene(); paintMotion();
      announce(ghost ? 'Smooth pitch circle shown: a belt on it would leave steadily at height R and speed ωR.' : 'Smooth pitch circle hidden.');
    });
    q('[data-cc-run]').addEventListener('click', function () { if (running) pause(); else play(); });
    q('[data-cc-step]').addEventListener('click', function () { pause(); phase += 0.125; paintMotion(); announce(); });
    q('[data-cc-reset]').addEventListener('click', function () {
      pause(); state = Object.assign({}, M.DEFAULT); phase = 0; ghost = false; compare = [];
      answers = { 9: null, 21: null };
      lab.querySelectorAll('[data-cc-guess]').forEach(function (r) { r.checked = false; });
      q('[data-cc-check]').disabled = true; showQuestions(false);
      q('[data-cc-feedback]').textContent = 'Predict first: pick one answer for each sprocket. Ripple = (fastest − slowest) ÷ fastest chain speed.';
      update(); announce('Lab reset.');
    });
    q('[data-cc-clear]').addEventListener('click', function () { compare = []; update(); announce('Comparison cleared.'); });
    lab.querySelectorAll('[data-cc-guess]').forEach(function (r) {
      r.addEventListener('change', function () {
        answers[r.dataset.ccGuess] = r.value;
        q('[data-cc-check]').disabled = !(answers[9] && answers[21]);
      });
    });
    function showQuestions(focus) {
      q('[data-cc-questions]').hidden = false; q('[data-cc-result]').hidden = true; q('[data-cc-feedback]').hidden = false;
      q('[data-cc-check]').hidden = false; q('[data-cc-again]').hidden = true;
      if (focus) q('[data-cc-check]').focus({ preventScroll: true });
    }
    var previewWidth = 0;
    function drawPreview() {
      if (q('[data-cc-result]').hidden) return;
      // Size the comparison chart from its own column so its labels stay readable.
      previewWidth = (q('[data-cc-preview]').clientWidth || 640) < 520 ? 420 : 640;
      q('[data-cc-preview]').innerHTML = D.traceChart({ width: previewWidth, from: 0, to: 3, compare: [9, 21], mini: true });
    }
    q('[data-cc-again]').addEventListener('click', function () {
      showQuestions(true);
      q('[data-cc-feedback]').textContent = 'Change either answer, then test again.';
    });
    q('[data-cc-check]').addEventListener('click', function () {
      if (!(answers[9] && answers[21])) return;
      var result = scorePrediction(answers), label = function (k) { return BANDS.find(function (b) { return b[0] === k; })[1]; };
      var r9 = M.ripple(9), r21 = M.ripple(21);
      var line = function (N, r) {
        var ok = answers[N] === result.expected[N];
        return '<li><strong>' + N + ' teeth: ' + M.percent(r, 2) + '</strong> · ' +
          (ok ? 'you: ' + label(answers[N]) + ' ✓' : 'you: ' + label(answers[N]) + ', not ' + label(result.expected[N])) + '</li>';
      };
      q('[data-cc-score]').textContent = result.correct + ' of 2 in the right band.';
      q('[data-cc-lines]').innerHTML = line(9, r9) + line(21, r21);
      q('[data-cc-feedback]').hidden = true;
      q('[data-cc-detail]').textContent = 'Ripple = 1 − cos(180°/N), so 2.3 times the teeth leaves about 1/' + M.format(r9 / r21, 2) + ' of it (roughly 1/N²).';
      // Swap the questions for the result in the same place, at least as tall, so the button row does
      // not move up under the learner; focus moves to the new button without scrolling.
      var questions = q('[data-cc-questions]'), panel = q('[data-cc-result]');
      if (!questions.hidden) panel.style.minHeight = questions.offsetHeight + 'px';
      questions.hidden = true; panel.hidden = false;
      q('[data-cc-check]').hidden = true; q('[data-cc-again]').hidden = false;
      q('[data-cc-again]').focus({ preventScroll: true });
      compare = [9, 21]; pause(); phase = 0; state.teeth = 9; update(); play();
      announce('Prediction checked: ' + result.correct + ' of 2.');
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (!visible) { if (frame) cancelAnimationFrame(frame); frame = 0; previous = null; } else schedule();
      }).observe(figure);
    }
    if ('ResizeObserver' in window) new ResizeObserver(function () { if (pickWidth() !== width) { drawScene(); paintMotion(); drawPreview(); } }).observe(figure);
    if ('ResizeObserver' in window) new ResizeObserver(function () {
      var box = q('[data-cc-preview]'); if (previewWidth && (box.clientWidth < 520 ? 420 : 640) !== previewWidth) drawPreview();
    }).observe(q('[data-cc-preview]'));
    document.addEventListener('visibilitychange', function () { previous = null; schedule(); });
    if (reduced.addEventListener) reduced.addEventListener('change', function () { motionNote(); if (reduced.matches) announce('Motion paused for your reduced-motion preference.'); });
    root.classList.add('cc-live');
    update();
  }
  return { init: init, band: band, scorePrediction: scorePrediction, BANDS: BANDS };
});
