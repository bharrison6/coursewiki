(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiEdgeFinderZero,
    node ? require('./render.js') : root.CourseWikiEdgeFinderZeroDraw);
  if (node) module.exports = api;
  else if (typeof document !== 'undefined') document.querySelectorAll('[data-interactive="edge-finder-zero"]').forEach(api.init);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, D) {
  'use strict';
  var sequence = 0;
  function reducedMotion() { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function frame(fn) { return typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(function () { fn(Date.now()); }, 16); }
  // Returns a handle; a cancelled tween never calls step or done again.
  function tween(ms, step, done) {
    var handle = { cancelled: false, cancel: function () { handle.cancelled = true; } };
    if (reducedMotion() || ms <= 0) { step(1); done(); return handle; }
    var start = null;
    frame(function tick(now) {
      if (handle.cancelled) return;
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / ms), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      step(e);
      if (t < 1) frame(tick); else done();
    });
    return handle;
  }
  function nextId() { var id; do { id = 'efz-' + (++sequence); } while (document.getElementById(id + '-set')); return id; }

  function init(root) {
    if (root.dataset.efzReady || !M || !D) return;
    if (root.getAttribute('data-efz-stage') === 'length') initLength(root); else initEdge(root);
    root.dataset.efzReady = 'true'; root.classList.add('efz-live');
  }

  // ---------------------------------------------------------------- edge stage
  function initEdge(root) {
    var id = nextId();
    var st = M.create('left', 'd10'), extras = [], spindleAt = null, theta = 0, paused = false, visible = true, busy = false, yours = 0, lastStep = null;
    var generation = 0, anim = null;   // any setup change invalidates in-flight animations
    function cancelAnimation() { generation += 1; if (anim) anim.cancel(); anim = null; busy = false; }
    var lab = document.createElement('div'); lab.className = 'efz-lab';
    var sideRadios = ['left', 'right', 'front', 'back'].map(function (s) { return '<label class="efz-seg"><input type="radio" name="' + id + '-side" value="' + s + '"' + (s === 'left' ? ' checked' : '') + '><span>' + M.SIDES[s].label + '</span></label>'; }).join('');
    var stepRadios = M.STEPS.map(function (s, i) { return '<label class="efz-seg"><input type="radio" name="' + id + '-step" value="' + s + '"' + (i === 0 ? ' checked' : '') + '><span>' + (s / 1000) + ' mm</span></label>'; }).join('');
    var tipOptions = Object.keys(M.TIPS).map(function (k) { return '<option value="' + k + '">' + M.TIPS[k].label + '</option>'; }).join('');
    lab.innerHTML =
      '<p class="efz-challenge"><strong>Challenge:</strong> find the <span data-efz-word>left edge</span> with a mechanical edge finder, set the readout so that edge reads <span data-efz-axis>X</span> 0, then drill a check hole that the drawing puts 20.000 mm inside it.</p>' +
      '<div class="efz-setup"><fieldset class="efz-group"><legend>Edge to find</legend><div class="efz-segs">' + sideRadios + '</div></fieldset>' +
      '<div class="efz-group"><label for="' + id + '-tip">Contact diameter</label><select id="' + id + '-tip" data-efz-tip>' + tipOptions + '</select></div></div>' +
      '<p class="efz-convention" data-efz-convention></p>' +
      '<div class="efz-bench"><div class="efz-pair">' +
      '<div class="efz-view"><div class="efz-close-wrap" data-efz-close tabindex="0" role="group" aria-label="Edge finder close-up. Arrow keys jog along the approach axis." aria-describedby="' + id + '-keys"></div>' +
      '<div class="efz-actions efz-view-actions"><button type="button" data-efz-pause aria-pressed="false">Pause spin</button><button type="button" data-efz-reset>Start this edge again</button></div></div>' +
      '<div class="efz-controls">' +
      '<div class="efz-row"><div data-efz-dro></div>' +
      '<div class="efz-jogbox"><fieldset class="efz-group"><legend>Jog step</legend><div class="efz-segs">' + stepRadios + '</div></fieldset>' +
      '<div class="efz-jog" role="group" aria-label="Jog the spindle"><button type="button" data-efz-move="-1"></button><button type="button" data-efz-move="1"></button></div></div></div>' +
      '<p class="efz-hint" id="' + id + '-keys">Keyboard: focus the close-up or a jog button, then use the arrow keys along the axis.</p>' +
      '<p class="efz-feedback" data-efz-feedback role="status" aria-live="polite"></p>' +
      '<div class="efz-set"><label for="' + id + '-set">Set the <span data-efz-axis>X</span> readout at this position to (mm)</label>' +
      '<div class="efz-set-row"><input id="' + id + '-set" data-efz-input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="reach the kick first">' +
      '<button type="button" data-efz-setbtn>Set readout</button><button type="button" data-efz-drill>Drill check hole</button></div></div>' +
      '</div></div>' +
      '<div class="efz-drawing"><div data-efz-top></div><p class="efz-ruler-cap">Distance from the datum edge, magnified (mm); the dashed line is the drawing’s 20.000</p><div data-efz-ruler></div></div>' +
      '</div>' +
      '<div data-efz-holes></div>' +
      '<fieldset class="efz-mistakes"><legend>Mistake mode: same kick, different setting</legend>' +
      '<p>Predict first: compared with the drawing, how far does a <strong>wrong-sign</strong> hole move?</p>' +
      '<div class="efz-segs">' + ['0', 'r', '2r'].map(function (v) { return '<label class="efz-seg"><input type="radio" name="' + id + '-predict" value="' + v + '"><span>' + v + '</span></label>'; }).join('') + '</div>' +
      '<div class="efz-actions"><button type="button" data-efz-what="forgot">Forget the radius (set 0)</button><button type="button" data-efz-what="sign">Use the wrong sign</button></div>' +
      '<p data-efz-what-feedback role="status" aria-live="polite">Reach the kick first; these stamp extra holes without changing your setting.</p></fieldset>' +
      '<p class="efz-rule" data-efz-rule hidden></p>';
    root.append(lab);
    function q(s) { return lab.querySelector(s); }
    function qa(s) { return Array.prototype.slice.call(lab.querySelectorAll(s)); }
    var closeWrap = q('[data-efz-close]'), input = q('[data-efz-input]');
    function say(text) { q('[data-efz-feedback]').textContent = text; }
    function step() { var c = q('input[name="' + id + '-step"]:checked'); return Number(c ? c.value : 1000); }

    function renderClose() {
      closeWrap.innerHTML = D.closeup(st, theta, { uid: id });
      closeWrap.classList.toggle('is-kicked', M.contact(st).phase === 'kick');
    }
    function renderTop() { q('[data-efz-top]').innerHTML = D.topView(st, { extra: extras, spindle: spindleAt || undefined }); q('[data-efz-ruler]').innerHTML = D.holeRuler(st, st.holes.concat(extras)); }
    function update() {
      var s = M.SIDES[st.side], c = M.contact(st), axis = s.axis.toUpperCase();
      renderClose(); renderTop();
      q('[data-efz-dro]').innerHTML = D.dro(st);
      q('[data-efz-holes]').innerHTML = D.holeTable(st, st.holes.concat(extras));
      qa('[data-efz-axis]').forEach(function (n) { n.textContent = axis; });
      q('[data-efz-word]').textContent = s.label.toLowerCase();
      q('[data-efz-convention]').textContent = 'Convention: +X points right, +Y points toward the back (away from you). Readings are the spindle centre relative to the part. Contact radius r = ' + M.mm(st.r) + ' mm (half the contact diameter).';
      var neg = q('[data-efz-move="-1"]'), pos = q('[data-efz-move="1"]');
      var negToward = s.n > 0; // moving in −axis approaches right/back edges
      var arrows = s.axis === 'x' ? ['←', '→'] : ['↓', '↑'];
      neg.textContent = arrows[0] + ' ' + (negToward ? 'Toward edge' : 'Away') + ' (−' + axis + ')';
      pos.textContent = arrows[1] + ' ' + (negToward ? 'Away' : 'Toward edge') + ' (+' + axis + ')';
      var kicked = c.phase === 'kick';
      q('[data-efz-setbtn]').disabled = busy || !kicked;
      input.disabled = busy || !kicked;
      input.placeholder = kicked ? 'value in mm' : 'reach the kick first';
      q('[data-efz-drill]').disabled = busy || !st.setting;
      qa('[data-efz-what]').forEach(function (b) { b.disabled = busy || !kicked; });
      qa('[data-efz-move]').forEach(function (b) { b.disabled = busy; });
    }
    function reset(message) {
      cancelAnimation();
      var sideId = q('input[name="' + id + '-side"]:checked').value, tipId = q('[data-efz-tip]').value;
      st = M.create(sideId, tipId); extras = []; spindleAt = null; yours = 0; lastStep = null; input.value = '';
      q('[data-efz-rule]').hidden = true; q('[data-efz-what-feedback]').textContent = 'Reach the kick first; these stamp extra holes without changing your setting.';
      update(); say(message || 'Jog toward the edge. Watch the tip: it wobbles, centres, then kicks.');
    }
    function jog(direction) {
      if (busy) return;
      var before = M.contact(st).phase, s = step();
      try { st = M.jog(st, direction, s); } catch (e) { say(e.message + '.'); return; }
      spindleAt = null; lastStep = s;
      var c = M.contact(st);
      update();
      if (c.phase === 'kick' && before !== 'kick') {
        say('Kick! It appeared during a ' + (s / 1000) + ' mm step, so the trigger lies within that last step. ' + (s > 10 ? 'For a precise reading, back away and re-approach with a finer step. ' : '') + 'Now decide what the ' + M.SIDES[st.side].axis.toUpperCase() + ' readout should read here.');
        input.focus({ preventScroll: true });
      } else if (c.phase === 'centring' && before === 'free') say('Contact: the tip is being pushed toward concentric. Slow down: switch to a finer step.');
      else if (c.phase === 'kick') say('Backed away ' + (s / 1000) + ' mm, still kicked.');
      else say((direction > 0 ? 'Toward' : 'Away') + ' ' + (s / 1000) + ' mm. ' + D.PHASE_TEXT[c.phase] + '.');
    }
    function setReadout() {
      if (busy) return;
      var v;
      try { v = M.parseMillimetres(input.value); st = M.setReadout(st, v); }
      catch (e) { say(e.message + '. Nothing was changed.'); return; }
      update(); say('Readout set: this position now reads ' + M.signedMm(v) + ' mm. Drill the check hole to see where your zero really is.');
    }
    function drill() {
      if (busy || !st.setting) return;
      var next; try { next = M.drill(st, yours ? 'Your hole ' + (yours + 1) : 'Your hole'); } catch (e) { say(e.message + '.'); return; }
      var hole = next.holes[next.holes.length - 1], s = M.SIDES[st.side];
      var target = { x: st.pos.x, y: st.pos.y }; target[s.axis] = hole.at;
      var from = { x: (spindleAt || st.pos).x, y: (spindleAt || st.pos).y };
      var token = generation;
      busy = true; update();
      anim = tween(700, function (e) {
        if (token !== generation) return;
        spindleAt = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e };
        q('[data-efz-top]').innerHTML = D.topView(st, { extra: extras, spindle: spindleAt });
      }, function () {
        if (token !== generation) return;   // the edge, tip or run changed mid-travel
        anim = null; busy = false; st = next; yours += 1; spindleAt = target;
        update(); say(D.explain(st, hole));
        var rule = q('[data-efz-rule]'); rule.hidden = false; rule.textContent = D.rule(st);
      });
    }
    function whatIf(kind) {
      var h; try { h = M.whatIf(st, kind); } catch (e) { q('[data-efz-what-feedback]').textContent = e.message + '.'; return; }
      extras = extras.filter(function (x) { return x.kind !== kind; }).concat([h]);
      update();
      var predicted = q('input[name="' + id + '-predict"]:checked'), text = D.explain(st, h);
      if (kind === 'sign' && predicted) {
        text = (predicted.value === '2r' ? 'Your prediction, 2r, matches the wrong-sign contribution. ' : 'You predicted ' + predicted.value + '; the wrong sign contributes 2r. ') +
          (h.overshoot ? 'This kick also carries a ' + M.mm(h.overshoot) + ' mm overshoot, so the net shift is ' + M.mm(Math.abs(h.inwardError)) + ' mm, not exactly 2r. ' : '') + text;
      }
      q('[data-efz-what-feedback]').textContent = text;
      var rule = q('[data-efz-rule]'); rule.hidden = false; rule.textContent = D.rule(st);
    }
    // Arrow keys along the approach axis. Owned here so page navigation does not fire.
    function onKey(event) {
      var k = event.key; if (!/^Arrow(Left|Right|Up|Down)$/.test(k)) return;
      if (!(event.target === closeWrap || event.target.hasAttribute('data-efz-move'))) return;
      event.preventDefault(); event.stopPropagation();
      var s = M.SIDES[st.side], horizontal = k === 'ArrowLeft' || k === 'ArrowRight';
      if ((s.axis === 'x') !== horizontal) { say('This approach moves along ' + s.axis.toUpperCase() + ' only; use ' + (s.axis === 'x' ? '← and →' : '↑ and ↓') + '.'); return; }
      var sign = (k === 'ArrowRight' || k === 'ArrowUp') ? 1 : -1;
      jog(sign === -s.n ? 1 : -1);
    }
    lab.addEventListener('keydown', onKey);
    lab.addEventListener('keydown', function (event) { if (event.target.matches('input, select')) event.stopPropagation(); });
    qa('input[name="' + id + '-side"]').forEach(function (r) { r.addEventListener('change', function () { reset('Edge changed. ' + M.SIDES[r.value].label + ': the spindle approaches moving ' + M.SIDES[r.value].move + '.'); }); });
    q('[data-efz-tip]').addEventListener('change', function () { reset('Contact changed: r = ' + M.mm(M.TIPS[this.value].diameter / 2) + ' mm. Start the approach again.'); });
    qa('[data-efz-move]').forEach(function (b) {
      b.addEventListener('click', function () { var sign = Number(b.getAttribute('data-efz-move')); jog(sign === -M.SIDES[st.side].n ? 1 : -1); });
    });
    q('[data-efz-setbtn]').addEventListener('click', setReadout);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); setReadout(); } });
    q('[data-efz-drill]').addEventListener('click', drill);
    qa('[data-efz-what]').forEach(function (b) { b.addEventListener('click', function () { whatIf(b.getAttribute('data-efz-what')); }); });
    q('[data-efz-reset]').addEventListener('click', function () { reset(); });
    var pauseBtn = q('[data-efz-pause]');
    pauseBtn.addEventListener('click', function () { paused = !paused; pauseBtn.setAttribute('aria-pressed', String(paused)); pauseBtn.textContent = paused ? 'Resume spin' : 'Pause spin'; if (!paused) loop(); });

    // Spin animation: only the tip transforms change per frame.
    var running = false, last = null;
    function loop() {
      if (running) return;
      running = true; last = null;
      frame(function tick(now) {
        if (paused || !visible || reducedMotion() || document.hidden || !root.isConnected) { running = false; return; }
        if (last !== null) theta = (theta + (now - last) / 1000 * 2 * Math.PI * 0.9) % (2 * Math.PI);
        last = now;
        var t = D.tipTransforms(st, theta), top = closeWrap.querySelector('.efz-tip-top'), side = closeWrap.querySelector('.efz-tip-side');
        if (top) top.setAttribute('transform', t.top);
        if (side) side.setAttribute('transform', t.side);
        frame(tick);
      });
    }
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; if (visible) loop(); }).observe(closeWrap);
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) loop(); });
    if (typeof matchMedia === 'function') { var mq = matchMedia('(prefers-reduced-motion: reduce)'); if (mq.addEventListener) mq.addEventListener('change', function () { if (!mq.matches) loop(); }); }
    reset('Jog toward the edge. Watch the tip: it wobbles, centres, then kicks.');
    loop();
  }

  // ---------------------------------------------------------- tool length stage
  function initLength(root) {
    var id = nextId(), g = 0, shown = { t1: false, t2: false }, busy = false, generation = 0, anim = null;
    function cancelAnimation() { generation += 1; if (anim) anim.cancel(); anim = null; busy = false; }
    var lab = document.createElement('div'); lab.className = 'efz-lab efz-lab-length';
    lab.innerHTML =
      '<p class="efz-challenge"><strong>Challenge:</strong> the readout follows the spindle and reads T1’s tip height, with the part top at Z 0. Predict what it reads when each tool touches the part top, then touch off and compare.</p>' +
      '<fieldset class="efz-group"><legend>Touch-off contact</legend><div class="efz-segs">' +
      '<label class="efz-seg"><input type="radio" name="' + id + '-gauge" value="0" checked><span>Ideal contact (0 mm)</span></label>' +
      '<label class="efz-seg"><input type="radio" name="' + id + '-gauge" value="10000"><span>10.000 mm block</span></label></div></fieldset>' +
      '<div class="efz-bench efz-bench-length"><div class="efz-length-wrap" data-efz-view></div><div class="efz-controls">' +
      ['t1', 't2'].map(function (t) {
        var T = M.TOOLS[t];
        return '<div class="efz-tool-row"><p><strong>' + T.label + '</strong><br>Length, gauge line to tip: ' + M.mm(T.length) + ' mm</p>' +
          '<label for="' + id + '-' + t + '">Predict ' + T.short + '’s Z reading at touch-off (mm)</label><input id="' + id + '-' + t + '" data-efz-predict="' + t + '" type="text" inputmode="decimal" autocomplete="off" spellcheck="false">' +
          '<button type="button" data-efz-touch="' + t + '">Touch off ' + T.short + '</button><p class="efz-tool-result" data-efz-result="' + t + '" role="status" aria-live="polite"></p></div>';
      }).join('') +
      '<div class="efz-actions"><button type="button" data-efz-missing>Run T2 at Z +2.000 with T1’s value</button><button type="button" data-efz-lreset>Raise both tools</button></div>' +
      '</div></div><p class="efz-feedback" data-efz-lfeedback role="status" aria-live="polite">Model: reading at touch-off = surface Z + contact thickness + (L<sub>tool</sub> − L<sub>T1</sub>).</p>' +
      '<div data-efz-ltable></div>';
    root.append(lab);
    function q(s) { return lab.querySelector(s); }
    function view(raise) { q('[data-efz-view]').innerHTML = D.lengthView(g, shown, { raise: raise }); }
    function update() {
      view();
      q('[data-efz-ltable]').innerHTML = shown.t1 && shown.t2 ? D.lengthTable(g) : '';
      // While a tool is lowering, only 'Raise both tools' and the contact choice stay live; both cancel it.
      Array.prototype.forEach.call(lab.querySelectorAll('button:not([data-efz-lreset])'), function (b) { b.disabled = busy; });
    }
    function feedback(text) { q('[data-efz-lfeedback]').textContent = text; }
    function touch(t) {
      if (busy) return;
      var reading = M.touchReading(t, g), field = q('[data-efz-predict="' + t + '"]'), guess = null, note;
      if (field.value.trim()) { try { guess = M.parseMillimetres(field.value); } catch (e) { q('[data-efz-result="' + t + '"]').textContent = e.message + '.'; return; } }
      if (guess === null) note = 'Reading ' + M.signedMm(reading) + ' mm.';
      else if (guess === reading) note = 'Reading ' + M.signedMm(reading) + ' mm: matches your prediction.';
      else {
        var diff = reading - guess, why = Math.abs(diff) === g && g ? ' That difference is the block thickness.' : Math.abs(diff) === Math.abs(M.lengthValue(t)) && M.lengthValue(t) ? ' That difference is the length difference from T1.' : Math.abs(diff) === 2 * Math.abs(M.lengthValue(t)) && M.lengthValue(t) ? ' Check the sign: a longer tool touches with the spindle higher.' : '';
        note = 'Reading ' + M.signedMm(reading) + ' mm; your prediction differs by ' + M.mm(Math.abs(diff)) + ' mm.' + why;
      }
      var token = generation;
      busy = true; update();
      var raise = {}; raise[t] = D.RAISE;
      anim = tween(600, function (e) { if (token !== generation) return; raise[t] = Math.round(D.RAISE * (1 - e)); view(raise); }, function () {
        if (token !== generation) return;   // the contact or tools changed mid-touch
        anim = null; busy = false; shown[t] = true; update();
        q('[data-efz-result="' + t + '"]').textContent = note + ' Length value vs T1: ' + M.signedMm(M.lengthValue(t)) + ' mm.';
        feedback(t === 't1' ? 'T1 is the reference: its tip sits on the ' + (g ? 'block top' : 'part top') + ', so the readout shows the contact thickness, ' + M.signedMm(g) + ' mm.' :
          'T2 is ' + M.mm(M.lengthValue('t2')) + ' mm longer, so it touches with the spindle that much higher: ' + M.signedMm(g) + ' + ' + M.mm(M.lengthValue('t2')) + ' = ' + M.signedMm(reading) + ' mm. Its own length value is the reading minus the contact thickness: ' + M.signedMm(M.lengthValue('t2')) + ' mm.');
      });
    }
    Array.prototype.forEach.call(lab.querySelectorAll('input[name="' + id + '-gauge"]'), function (r) {
      r.addEventListener('change', function () { cancelAnimation(); g = Number(r.value); shown = { t1: false, t2: false }; lab.querySelectorAll('[data-efz-result]').forEach(function (p) { p.textContent = ''; }); update(); feedback('Contact changed to ' + (g ? 'a 10.000 mm block' : 'ideal zero-thickness contact') + '. Both tools raised; predict again.'); });
    });
    Array.prototype.forEach.call(lab.querySelectorAll('[data-efz-touch]'), function (b) { b.addEventListener('click', function () { touch(b.getAttribute('data-efz-touch')); }); });
    q('[data-efz-missing]').addEventListener('click', function () {
      var tip = M.tipZ(2000, 0) - M.lengthValue('t2');
      feedback('With T1’s value (0) the control treats T2 like T1. Commanded Z +2.000 puts T2’s tip at 2.000 − ' + M.mm(M.lengthValue('t2')) + ' = ' + M.signedMm(tip) + ' mm: ' + M.mm(-tip) + ' mm below the part top instead of 2 mm above it. Each tool needs its own length value.');
    });
    q('[data-efz-lreset]').addEventListener('click', function () { cancelAnimation(); shown = { t1: false, t2: false }; lab.querySelectorAll('[data-efz-result]').forEach(function (p) { p.textContent = ''; }); update(); feedback('Both tools raised.'); });
    lab.addEventListener('keydown', function (event) { if (event.target.matches('input')) event.stopPropagation(); });
    update();
  }
  return Object.freeze({ init: init });
});
