(function () {
  'use strict';
  const M = globalThis.CourseWikiCommutation, D = globalThis.CourseWikiCommutationDraw;
  if (!M || !D || typeof document === 'undefined') return;
  let sequence = 0;
  const BASE = Object.freeze({ mode: 'commutator', coils: 1, supply: 1, field: 1 });
  // Each prediction is checked against a result figure drawn, by the same
  // renderer, directly above the Check button. Checking changes nothing else on
  // the page; "Try this in the lab" sets the lab to that case on request.
  const QUESTIONS = Object.freeze([
    { id: 'zero', preview: { view: 'end', options: BASE, theta: 30, caption: 'Before: one coil, split ring, at θ = 30°.' }, after: { options: BASE, theta: 0, reveal: true },
      result: { view: 'end', options: BASE, theta: 10, caption: 'θ = 10°, split ring: each side feels the full force BIL, but the lever arm is only 0.17 r, so τ = 0.17 NBIA.' },
      q: 'As the coil turns, at which angles is the torque zero?',
      choices: [['across', 'When the coil face is across the field: θ = 0° and 180°'], ['along', 'When the coil face lies along the field: θ = 90° and 270°'], ['never', 'Never: a coil carrying current is always pushed round']],
      answer: 'across', why: 'At θ = 0° and 180° the coil face lies across the field, in the neutral plane, and the torque is zero. In the figure, at θ = 10°, each side still carries current and feels the full force BIL, but its line of force passes close to the shaft. As θ goes to 0°, that lever arm, r·sin θ, shrinks to zero, and so does the torque. Exactly at 0° an ideal split ring has its brushes on the gaps, so at that instant the coil carries no current and feels no force at all. With slip rings the current would still flow there, and both forces would point straight through the shaft.' },
    { id: 'peak', preview: { view: 'end', options: BASE, theta: 30, caption: 'Before: one coil, split ring, at θ = 30°.' }, after: { options: BASE, theta: 90, reveal: true },
      result: { view: 'end', options: BASE, theta: 90, caption: 'θ = 90°: the lever arm is the full half-width r, so τ = NBIA, the peak.' },
      q: 'At which angles is the torque largest?',
      choices: [['along', 'When the coil face lies along the field: θ = 90° and 270°'], ['across', 'When the coil face is across the field: θ = 0° and 180°'], ['same', 'At every angle: the force on each side never changes size']],
      answer: 'along', why: 'Whenever current flows, the force on each side is BIL, the same size at every angle. What changes is its lever arm, r·sin θ. That is largest at 90° and 270°, where the coil face lies along the field, as in the figure, so the torque is largest there too.' },
    { id: 'slip', preview: { view: 'end', options: { mode: 'slip' }, theta: 150, caption: 'Before: slip rings at θ = 150°, with the torque turning the coil counter-clockwise toward 180°.' }, after: { options: { mode: 'slip' }, theta: 150 },
      result: { view: 'trace', options: { mode: 'slip' }, theta: 210, caption: 'Slip rings, N on the left, top brush positive: the torque is positive up to 180° and negative after it. The marker at θ = 210° shows −0.50 NBIA, clockwise.' },
      q: 'Swap the split ring for slip rings, so the current in the coil never reverses. What happens to the torque once the coil passes θ = 180°?',
      choices: [['reverses', 'It reverses and pushes the coil back'], ['same', 'It keeps pushing the same way'], ['zero', 'It drops to zero and stays zero']],
      answer: 'reverses', why: 'With a fixed current, τ = NBIA·sin θ changes sign at 180°, as the curve shows. With this polarity, past 180° the torque pushes the coil back toward θ = 180°, and over a whole turn it averages zero. The split ring reverses the current exactly at the neutral plane, so the torque keeps one direction.' },
    { id: 'two', preview: { view: 'end', options: { coils: 2 }, theta: 30, caption: 'Before: two coils, 90° apart, each with its own split ring, at θ = 30°.' }, after: { options: { coils: 2 }, theta: 30, reveal: true },
      result: { view: 'trace', options: { coils: 2 }, theta: 0, caption: 'Two commutated coils 90° apart: the total runs from 1 to 1.41 NBIA. The marker at θ = 0° shows the smallest total, 1.00.' },
      q: 'Add a second coil 90° ahead of the first, each with its own split ring. What is the smallest total torque over a turn?',
      choices: [['zero', 'Zero, at the same angles as one coil'], ['ripple', 'About 0.71 of the largest total, and never zero'], ['flat', 'Exactly constant: no ripple at all']],
      answer: 'ripple', why: 'When one coil is in the neutral plane, the other is at its peak. The sum |sin θ| + |cos θ| runs from 1 to √2, so the smallest total is 1/√2 ≈ 0.71 of the largest. The ripple is smaller and the zero-torque dead spot is gone.' },
    { id: 'current', preview: { view: 'end', options: BASE, theta: 30, caption: 'Before: N on the left, top brush positive. The torque arrow turns counter-clockwise.' }, after: { options: { supply: -1 }, theta: 30 },
      result: { view: 'end', options: { supply: -1 }, theta: 30, caption: 'Current reversed: every current mark and force arrow has flipped, and the torque arrow now turns clockwise.' },
      q: 'With the N pole on the left and the top brush positive, this motor turns counter-clockwise, as seen from the commutator end. Reverse only the supply current. Which way does it turn now?',
      choices: [['ccw', 'Counter-clockwise, as before'], ['cw', 'Clockwise'], ['stop', 'It stops']],
      answer: 'cw', why: 'Reversing I reverses the force on every side (F = I L × B), so the torque reverses and the motor turns clockwise.' },
    { id: 'both', preview: { view: 'end', options: { supply: -1 }, theta: 30, caption: 'Before: current reversed, N still on the left. The torque arrow turns clockwise.' }, after: { options: { supply: -1, field: -1 }, alpha: 30 },
      result: { view: 'end', options: { supply: -1, field: -1 }, alpha: 30, caption: 'Current reversed and magnets swapped (N now on the right): the torque arrow turns counter-clockwise again.' },
      q: 'Start from the reversed current of the last question, which turns clockwise. Now swap the magnets too, so B also reverses. Which way does it turn?',
      choices: [['ccw', 'Counter-clockwise, as at the start'], ['cw', 'Clockwise'], ['stop', 'It stops']],
      answer: 'ccw', why: 'Reversing B reverses the force again. Two reversals cancel, so the motor turns counter-clockwise, as it did at the start.' }
  ]);

  function fmtSigned(v) { const x = Math.abs(v) < 0.005 ? 0 : v; return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(2); }
  function deg(v) { return Math.round(v) % 360; }
  function uniqueId() { let id; do { id = 'dmcc-' + (++sequence); } while (document.getElementById(id + '-angle')); return id; }

  function init(root) {
    if (root.dataset.dmccReady) return;
    root.dataset.dmccReady = 'true';
    const id = uniqueId();
    const reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const S = { alpha: 30, omega: 0, options: Object.assign({}, BASE), visited: [], revealed: false, running: false, flow: 0, frame: 0, last: null, visible: true, q: 0, first: {}, picked: {} };

    const live = document.createElement('div');
    live.className = 'dmcc-live';
    live.innerHTML =
      '<p class="dmcc-challenge"><strong>Challenge:</strong> a current-carrying coil between magnets gets a push, but not at every angle. Turn the coil, find where the push vanishes, then see how the split ring keeps the motor turning one way.</p>' +
      '<div class="dmcc-setup">' +
        '<fieldset class="dmcc-seg"><legend>Contacts</legend><div>' +
          '<label><input type="radio" name="' + id + '-mode" value="commutator" checked> Split ring (commutator)</label>' +
          '<label><input type="radio" name="' + id + '-mode" value="slip"> Slip rings</label></div></fieldset>' +
        '<fieldset class="dmcc-seg"><legend>Coils</legend><div>' +
          '<label><input type="radio" name="' + id + '-coils" value="1" checked> One</label>' +
          '<label><input type="radio" name="' + id + '-coils" value="2"> Two, 90° apart</label></div></fieldset>' +
        '<div class="dmcc-row dmcc-polarity"><button type="button" data-act="supply" aria-pressed="false">Reverse the current</button>' +
          '<button type="button" data-act="field" aria-pressed="false">Swap the magnets</button></div>' +
      '</div>' +
      '<fieldset class="dmcc-seg dmcc-viewpick"><legend>Show</legend><div>' +
        '<label><input type="radio" name="' + id + '-view" value="end" checked> End view</label>' +
        '<label><input type="radio" name="' + id + '-view" value="cut"> Cutaway</label></div></fieldset>' +
      '<div class="dmcc-stage" data-show="end">' +
        '<figure class="dmcc-view dmcc-view-cut"><div data-dmcc-cut></div><figcaption data-cut-caption></figcaption></figure>' +
        '<figure class="dmcc-view dmcc-view-end"><div data-dmcc-end></div><figcaption>End view from the commutator end: ⊙ current toward you, ⊗ away.</figcaption></figure>' +
      '</div>' +
      '<div class="dmcc-controls">' +
        '<div class="dmcc-row"><button type="button" class="dmcc-primary" data-act="run" aria-pressed="false">Run</button>' +
          '<button type="button" data-act="step">Step with the torque</button>' +
          '<button type="button" data-act="back" aria-label="Turn the coil back 15 degrees">−15°</button>' +
          '<button type="button" data-act="fwd" aria-label="Turn the coil on 15 degrees">+15°</button>' +
          '<button type="button" data-act="reset">Reset</button></div>' +
        '<div class="dmcc-angle-control"><label for="' + id + '-angle">Coil angle θ</label><input id="' + id + '-angle" type="range" min="0" max="359" step="1" value="30"></div>' +
      '</div>' +
      '<p class="dmcc-status" role="status" aria-live="polite" data-status></p>' +
      '<dl class="dmcc-readout">' +
        '<div><dt>Coil angle θ</dt><dd data-out="theta"></dd></div>' +
        '<div><dt>Torque τ</dt><dd data-out="torque"></dd></div>' +
        '<div><dt>Turning effect</dt><dd data-out="sense"></dd></div>' +
        '<div><dt>Current in side 1</dt><dd data-out="current"></dd></div>' +
        '<div><dt>Force on each side</dt><dd data-out="force"></dd></div>' +
        '<div><dt>Lever arm of each force</dt><dd data-out="lever"></dd></div>' +
      '</dl>' +
      '<p class="dmcc-note"><strong>Key:</strong> the glowing path is conventional current; dark arrows are the forces F = BIL; the dashed line is the lever arm of side 1; n is the coil’s marked normal, and θ is measured from B to n. <span data-motion-note></span></p>' +
      '<figure class="dmcc-trace-figure"><div data-dmcc-trace></div>' +
        '<figcaption data-trace-caption></figcaption>' +
        '<div class="dmcc-row"><button type="button" data-act="reveal" aria-pressed="false">Reveal the full curve</button><button type="button" data-act="clear">Clear the trace</button></div>' +
        '<p class="dmcc-averages" data-averages hidden></p></figure>' +
      '<section class="dmcc-predict" aria-labelledby="' + id + '-ph">' +
        '<div class="dmcc-predict-head"><h3 id="' + id + '-ph">Predict, then check</h3><span class="dmcc-score" data-score></span></div>' +
        '<p class="dmcc-note" data-qnum></p>' +
        '<div class="dmcc-predict-grid">' +
          '<fieldset class="dmcc-choices"><legend class="dmcc-question" data-question></legend><div class="dmcc-choices" data-choices></div></fieldset>' +
          // The result appears in this reserved figure, directly above the Check button.
          '<figure class="dmcc-result-figure" data-result-state="before"><div data-result-figure></div>' +
            '<figcaption><strong class="dmcc-verdict" data-verdict></strong> <span data-result-caption></span></figcaption></figure>' +
        '</div>' +
        '<div class="dmcc-row"><button type="button" class="dmcc-primary" data-act="check" disabled>Check my prediction</button>' +
          '<button type="button" data-act="trylab" hidden>Try this in the lab</button>' +
          '<button type="button" data-act="prevq">Previous question</button><button type="button" data-act="nextq">Next question</button></div>' +
        '<div class="dmcc-result" data-result-box hidden><p data-feedback></p><p class="dmcc-note" data-lab-note></p></div>' +
        '<p class="dmcc-sr" role="status" aria-live="polite" data-announce></p>' +
      '</section>' +
      '<p class="dmcc-limit"><strong>Model limits:</strong> an ideal rectangular coil in a uniform field, τ = N·B·I·A·sin θ, with torque shown as a fraction of one coil’s peak NBIA. ' +
        'The ideal split ring reverses the current exactly at the neutral plane. The motion is illustrative: its inertia and friction are assumed values chosen to make the torque visible, not a calibrated speed. ' +
        'Back EMF, speed–torque behaviour, saturation and brush sparking are not modelled; see the DC motor torque–speed lesson for load and speed.</p>';
    root.insertBefore(live, root.firstChild);

    const q = sel => live.querySelector(sel);
    const act = name => q('[data-act="' + name + '"]');
    const out = name => q('[data-out="' + name + '"]');
    const slider = q('#' + id + '-angle'), status = q('[data-status]');
    const views = { cut: q('[data-dmcc-cut]'), end: q('[data-dmcc-end]'), trace: q('[data-dmcc-trace]') };

    function opts() { return M.options(S.options); }
    function theta() { return M.thetaFromAlpha(S.alpha, S.options.field); }
    function say(text) { status.textContent = text; }
    function record(fromTheta, toTheta, dir) {
      // Mark every whole degree passed, along the direction of travel.
      const o = opts();
      let a = Math.round(fromTheta), b = Math.round(toTheta);
      if (dir === 0) { const d = ((b - a) % 360 + 540) % 360 - 180; dir = d >= 0 ? 1 : -1; }
      let guard = 0;
      while (guard++ < 361) {
        const k = ((a % 360) + 360) % 360;
        S.visited[k] = M.torqueAtTheta(k, o);
        if (k === ((b % 360) + 360) % 360) break;
        a += dir;
      }
    }

    function render() {
      const o = opts(), r = M.analyze(S.alpha, o), th = r.theta, c1 = r.coils[0];
      const st = { alpha: S.alpha, options: o, flowPhase: S.flow, visited: S.visited, revealed: S.revealed };
      views.cut.innerHTML = D.cutaway(st);
      views.end.innerHTML = D.endView(st);
      views.trace.innerHTML = D.trace(st);
      const nearPole = o.field === 1 ? 'N' : 'S', farPole = o.field === 1 ? 'S' : 'N';
      q('[data-cut-caption]').textContent = 'Cutaway side view: the ' + nearPole + ' pole in front is cut away and the ' + farPole + ' pole is behind the coil, so B points ' +
        (o.field === 1 ? 'away from you' : 'toward you') + '. The glowing path shows conventional current; dark arrows are the forces F = BIL.';
      out('theta').textContent = deg(th) + '°';
      out('current').textContent = c1.current > 0 ? 'toward you (⊙)' : c1.current < 0 ? 'away from you (⊗)' : 'none: brushes on the gaps';
      out('force').textContent = c1.current ? 'BIL, same size at every angle' : '0: no current at this instant';
      out('lever').textContent = (c1.lever < 0.005 ? '0' : c1.lever.toFixed(2)) + ' × r';
      out('torque').textContent = fmtSigned(r.total) + ' NBIA' + (o.coils === 2 ? ' (' + fmtSigned(r.coils[0].torque) + ' ' + fmtSigned(r.coils[1].torque) + ')' : '');
      out('sense').textContent = r.sense === 'none' ? 'none' : r.sense;
      if (document.activeElement !== slider) slider.value = String(deg(th));
      slider.setAttribute('aria-valuetext', deg(th) + ' degrees, torque ' + fmtSigned(r.total) + ' of one coil’s peak');
      act('supply').setAttribute('aria-pressed', String(o.supply === -1));
      act('field').setAttribute('aria-pressed', String(o.field === -1));
      live.querySelectorAll('input[name="' + id + '-mode"]').forEach(i => { i.checked = i.value === o.mode; });
      live.querySelectorAll('input[name="' + id + '-coils"]').forEach(i => { i.checked = Number(i.value) === o.coils; });
      act('reveal').setAttribute('aria-pressed', String(S.revealed));
      act('reveal').disabled = S.revealed;
      q('[data-trace-caption]').textContent = S.revealed
        ? 'Full curve for the current setup. Open circles mark the smallest torque, filled dots the largest; the orange marker is the coil now.'
        : 'Torque against θ. Orange dots trace the angles the coil has visited; predict below, then reveal the full curve.';
      const avg = q('[data-averages]');
      if (S.revealed) {
        const rp = M.ripple(o), mean = M.turnAverage(o, 3600);
        avg.hidden = false;
        avg.textContent = 'Average over one turn: ' + fmtSigned(mean) + ' NBIA. ' +
          (!rp.oneDirection ? 'The torque reverses during every turn.'
            : rp.ratio === 0 ? 'It never reverses, but it falls to zero twice a turn.'
            : 'It never reverses and never reaches zero: smallest ÷ largest = ' + rp.ratio.toFixed(2) + '.');
      } else avg.hidden = true;
    }
    function updateMotionNote() {
      const note = q('[data-motion-note]');
      act('run').hidden = !!reduced.matches;
      note.textContent = reduced.matches
        ? 'Reduced motion is on: “Step with the torque” moves the coil 15° the way the torque pushes; the slider sets the angle directly.'
        : 'Run releases the coil with illustrative, assumed inertia and friction; Step and the slider work without animation.';
    }

    function stop(message) {
      S.running = false;
      if (S.frame) cancelAnimationFrame(S.frame);
      S.frame = 0; S.last = null;
      act('run').setAttribute('aria-pressed', 'false');
      act('run').textContent = 'Run';
      if (message) say(message);
      render();
    }
    function schedule() { if (S.running && S.visible && !document.hidden && !S.frame) S.frame = requestAnimationFrame(tick); }
    function tick(ts) {
      S.frame = 0;
      if (!S.running) return;
      const dt = S.last === null ? 0 : Math.min(0.05, (ts - S.last) / 1000);
      S.last = ts;
      const before = theta();
      const next = M.illustrativeStep({ alpha: S.alpha, omega: S.omega }, dt, opts());
      S.alpha = next.alpha; S.omega = next.omega;
      record(before, theta(), S.omega >= 0 ? 1 : -1);
      S.flow += dt * 2.2;
      const r = M.analyze(S.alpha, opts());
      if (Math.abs(S.omega) < 0.02 && Math.abs(r.total) < 0.02 && dt > 0) {
        S.alpha = M.alphaFromTheta(deg(theta()), S.options.field);
        const nb = M.neighbourhood(S.alpha, opts());
        stop(nb.kind === 'stable'
          ? 'Illustrative motion: with the assumed friction the coil comes to rest at θ = ' + deg(theta()) + '°. ' + restMessage()
          : 'The coil has stopped at θ = ' + deg(theta()) + '°. ' + restMessage());
        return;
      }
      render();
      schedule();
    }
    function run() {
      if (reduced.matches) return;
      const r = M.analyze(S.alpha, opts());
      if (r.total === 0 && Math.abs(S.omega) < 0.02) { say(restMessage() + ' Released from rest here, it does not move.'); return; }
      S.running = true;
      act('run').setAttribute('aria-pressed', 'true');
      act('run').textContent = 'Pause';
      say(S.options.mode === 'slip'
        ? 'Released with slip rings: watch the torque arrow reverse each time the coil swings through the neutral plane.'
        : 'Released with the split ring: the current reverses at the neutral plane, so the torque keeps one direction.');
      schedule();
    }
    function setTheta(th, message) {
      const before = theta();
      S.alpha = M.alphaFromTheta(M.wrap(th), S.options.field);
      S.omega = 0;
      record(before, theta(), 0);
      if (message) say(message);
      render();
    }
    // Explain a zero-torque angle from the torque just either side of it,
    // for the current setup (contacts, coils, supply and magnet polarity).
    function restMessage() {
      const o = opts(), nb = M.neighbourhood(S.alpha, o), r = M.analyze(S.alpha, o), th = deg(theta());
      const c1 = r.coils[0];
      const cur = c1.current > 0 ? 'toward you' : c1.current < 0 ? 'away from you' : 'nowhere: the brushes are on the gaps';
      const turn = dir => dir === 'counterclockwise' ? 'counter-clockwise' : 'clockwise';
      if (nb.kind === 'stable') {
        return 'No torque at θ = ' + th + '°. ' + (o.mode === 'slip' ? 'With slip rings and this polarity, current in side 1 flows ' + cur + ' throughout. ' : '') +
          'Just either side, the torque points back toward this angle, so this is a stable rest position: stepping stops here.';
      }
      if (nb.kind === 'unstable') {
        const away = deg(th + 180);
        return 'No torque at θ = ' + th + '°, but this balance is unstable. ' + (o.mode === 'slip' ? 'With slip rings and this polarity, current in side 1 flows ' + cur + ' throughout. ' : '') +
          'Just either side, the torque points away from this angle, so a nudge (±15°) sends the coil swinging toward the stable angle, θ = ' + away + '°.';
      }
      if (nb.kind === 'through') {
        return 'Dead spot at θ = ' + th + '°: the torque is zero exactly here' + (c1.current === 0 ? ' (current flows ' + cur + ')' : '') +
          ', but just either side it points the same way, ' + turn(nb.direction) + '. A coil at rest here cannot start itself; a nudge, or a running motor\u2019s momentum, carries it through. A second coil removes the dead spot.';
      }
      return 'No torque at θ = ' + th + '° or just either side of it.';
    }
    function step() {
      if (S.running) stop();
      const r = M.analyze(S.alpha, opts()), th = theta();
      if (r.total === 0) { say(restMessage()); return; }
      const dir = r.total > 0 ? 1 : -1;
      const target = dir > 0 ? Math.floor(th / 15 + 1e-9) * 15 + 15 : Math.ceil(th / 15 - 1e-9) * 15 - 15;
      const before = th;
      S.alpha = M.alphaFromTheta(M.wrap(target), S.options.field);
      S.omega = 0;
      record(before, theta(), dir);
      const now = M.analyze(S.alpha, opts());
      say('Torque ' + fmtSigned(r.total) + ' NBIA turned the coil ' + (dir > 0 ? 'counter-clockwise' : 'clockwise') + ' to θ = ' + deg(theta()) + '°. Torque here: ' + fmtSigned(now.total) + '.');
      render();
    }
    function setOptions(change, message) {
      S.options = Object.assign({}, S.options, change);
      S.visited = [];
      record(theta(), theta(), 1);
      if (message) say(message);
      render();
    }

    // ---- Predictions -------------------------------------------------------
    function applySetup(setup) {
      if (!setup) return;
      if (S.running) stop();
      // Every setup is absolute, so an explanation always matches what is shown.
      S.options = Object.assign({}, BASE, setup.options || {});
      if (typeof setup.alpha === 'number') { S.alpha = setup.alpha; S.omega = 0; }
      if (typeof setup.theta === 'number') { S.alpha = M.alphaFromTheta(setup.theta, S.options.field); S.omega = 0; }
      if (setup.reveal) S.revealed = true;
      S.visited = [];
      record(theta(), theta(), 1);
      render();
    }
    function resultFigure(spec) {
      const o = M.options(Object.assign({}, BASE, spec.options || {}));
      const alpha = typeof spec.alpha === 'number' ? spec.alpha : M.alphaFromTheta(spec.theta, o.field);
      return spec.view === 'trace' ? D.trace({ alpha, options: o, revealed: true }) : D.endView({ alpha, options: o });
    }
    function showQuestion(index) {
      S.q = Math.max(0, Math.min(QUESTIONS.length - 1, index));
      const item = QUESTIONS[S.q];
      q('[data-qnum]').textContent = 'Question ' + (S.q + 1) + ' of ' + QUESTIONS.length + '.';
      q('[data-question]').textContent = item.q;
      const box = q('[data-choices]');
      box.innerHTML = item.choices.map(ch => '<label><input type="radio" name="' + id + '-q' + item.id + '" value="' + ch[0] + '"> <span>' + ch[1] + '</span></label>').join('');
      if (S.picked[item.id]) { const p = box.querySelector('input[value="' + S.picked[item.id] + '"]'); if (p) p.checked = true; }
      act('check').disabled = !S.picked[item.id];
      act('prevq').disabled = S.q === 0;
      act('nextq').disabled = S.q === QUESTIONS.length - 1;
      q('[data-result-box]').hidden = true;
      q('[data-feedback]').textContent = '';
      act('trylab').hidden = true;
      const fig = q('.dmcc-result-figure');
      fig.dataset.resultState = 'before';
      q('[data-result-figure]').innerHTML = resultFigure(item.preview);
      q('[data-verdict]').textContent = '';
      q('[data-result-caption]').textContent = item.preview.caption + ' Check your prediction to see the result here.';
      score();
    }
    function score() {
      const done = QUESTIONS.filter(x => x.id in S.first).length, right = QUESTIONS.filter(x => S.first[x.id]).length;
      q('[data-score]').textContent = 'First-try score: ' + right + ' of ' + done + (done < QUESTIONS.length ? ' (' + (QUESTIONS.length - done) + ' to go)' : '');
    }
    function check() {
      const item = QUESTIONS[S.q], pick = S.picked[item.id];
      if (!pick) return;
      const right = pick === item.answer;
      if (!(item.id in S.first)) S.first[item.id] = right;
      score();
      const box = q('[data-result-box]'), fig = q('.dmcc-result-figure');
      box.dataset.result = right ? 'right' : 'wrong';
      fig.dataset.resultState = right ? 'right' : 'wrong';
      const answerText = item.choices.find(ch => ch[0] === item.answer)[1];
      q('[data-verdict]').textContent = (right ? '✓ Yes: ' : '✗ Not quite. The answer is: ') + answerText.charAt(0).toLowerCase() + answerText.slice(1) + '.';
      q('[data-result-figure]').innerHTML = resultFigure(item.result);
      q('[data-result-caption]').textContent = 'Result: ' + item.result.caption;
      q('[data-choices]').querySelectorAll('label').forEach(label => {
        const v = label.querySelector('input').value;
        label.dataset.mark = v === item.answer ? 'answer' : v === pick ? 'wrong' : '';
      });
      q('[data-feedback]').textContent = item.why;
      q('[data-lab-note]').textContent = '“Try this in the lab” sets the lab to this case and takes you to its controls.';
      act('trylab').hidden = false;
      box.hidden = false;
      q('[data-announce]').textContent = q('[data-verdict]').textContent + ' ' + item.why;
    }

    // ---- Wiring ------------------------------------------------------------
    act('run').addEventListener('click', () => { if (S.running) stop('Paused at θ = ' + deg(theta()) + '°.'); else run(); });
    act('step').addEventListener('click', step);
    act('back').addEventListener('click', () => { if (S.running) stop(); setTheta(theta() - 15, 'Turned back to θ = ' + deg(M.wrap(theta() - 15)) + '°.'); });
    act('fwd').addEventListener('click', () => { if (S.running) stop(); setTheta(theta() + 15, 'Turned on to θ = ' + deg(M.wrap(theta() + 15)) + '°.'); });
    act('reset').addEventListener('click', () => {
      if (S.running) stop();
      S.options = Object.assign({}, BASE); S.alpha = 30; S.omega = 0; S.revealed = false; S.visited = [];
      record(30, 30, 1);
      say('Reset: one coil, split ring, N pole on the left, θ = 30°.');
      render();
    });
    slider.addEventListener('input', () => { if (S.running) stop(); setTheta(Number(slider.value)); });
    slider.addEventListener('change', () => {
      const r = M.analyze(S.alpha, opts());
      say(r.total === 0 ? restMessage() : 'θ = ' + deg(theta()) + '°: torque ' + fmtSigned(r.total) + ' NBIA, ' + r.sense + '.');
    });
    live.querySelectorAll('input[name="' + id + '-mode"]').forEach(input => input.addEventListener('change', () => {
      setOptions({ mode: input.value }, input.value === 'slip'
        ? 'Slip rings: each coil end always meets the same brush, so the current in the coil never reverses.'
        : 'Split ring: the brushes change segments as the coil crosses the neutral plane, reversing the coil current.');
    }));
    live.querySelectorAll('input[name="' + id + '-coils"]').forEach(input => input.addEventListener('change', () => {
      setOptions({ coils: Number(input.value) }, Number(input.value) === 2
        ? 'Second coil added, 90° ahead of the first (sides 3 and 4), with its own contacts.'
        : 'Back to one coil.');
    }));
    act('supply').addEventListener('click', () => setOptions({ supply: -S.options.supply }, 'Supply reversed: every coil current reverses, so every force reverses.'));
    act('field').addEventListener('click', () => {
      setOptions({ field: -S.options.field });
      say('Magnets swapped: B now points ' + (S.options.field === 1 ? 'right' : 'left') + '. The coil has not moved, but θ, measured from B, is now ' + deg(theta()) + '°.');
    });
    live.querySelectorAll('input[name="' + id + '-view"]').forEach(input => input.addEventListener('change', () => {
      q('.dmcc-stage').dataset.show = input.value;
    }));
    act('reveal').addEventListener('click', () => { S.revealed = true; say('Full curve revealed for the current setup.'); render(); });
    act('clear').addEventListener('click', () => { S.visited = []; record(theta(), theta(), 1); render(); say('Trace cleared.'); });
    q('[data-choices]').addEventListener('change', event => {
      const t = event.target;
      if (t && t.type === 'radio') { S.picked[QUESTIONS[S.q].id] = t.value; act('check').disabled = false; }
    });
    act('check').addEventListener('click', check);
    act('trylab').addEventListener('click', () => {
      const item = QUESTIONS[S.q];
      applySetup(item.after);
      say('Set up from question ' + (S.q + 1) + ': θ = ' + deg(theta()) + '°, ' + (S.options.mode === 'slip' ? 'slip rings' : 'split ring') +
        (S.options.coils === 2 ? ', two coils' : '') + (S.options.supply === -1 ? ', current reversed' : '') + (S.options.field === -1 ? ', magnets swapped' : '') +
        '. ' + (reduced.matches ? 'Use Step to move it.' : 'Press Run or Step to watch it.'));
      // An intentional, requested move: bring the motor and its controls into
      // view together, then focus the first motion control.
      const pick = q('.dmcc-viewpick'), target = pick.offsetParent !== null ? pick : q('.dmcc-stage');
      target.scrollIntoView({ block: 'start', behavior: reduced.matches ? 'auto' : 'smooth' });
      (reduced.matches ? act('step') : act('run')).focus({ preventScroll: true });
    });
    act('prevq').addEventListener('click', () => showQuestion(S.q - 1));
    act('nextq').addEventListener('click', () => showQuestion(S.q + 1));
    if (reduced.addEventListener) reduced.addEventListener('change', () => { if (reduced.matches && S.running) stop('Motion stopped for your reduced-motion setting. Step mode still works.'); updateMotionNote(); });
    document.addEventListener('visibilitychange', schedule);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => { S.visible = entries.some(e => e.isIntersecting); if (S.visible) { S.last = null; schedule(); } }).observe(live);
    }

    record(30, 30, 1);
    updateMotionNote();
    showQuestion(0);
    say('Predict first, then turn the coil with Run, Step or the slider and watch the torque.');
    render();
  }

  function initAll() { document.querySelectorAll('[data-interactive="dc-motor-commutation"]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll, { once: true });
  else initAll();
})();
