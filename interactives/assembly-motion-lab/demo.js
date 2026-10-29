(function () {
  'use strict';
  var M = window.AssemblyMotionModel;
  if (!M) return;
  document.querySelectorAll('[data-interactive="assembly-motion-lab"]').forEach(function (root) {
    if (root.dataset.assemblyReady) return;
    root.dataset.assemblyReady = 'true';
    var s = M.defaults(), goal = 'hinge';
    var live = document.createElement('div'); live.className = 'am-lab';
    // Labels wrap their controls. SVG uses no document IDs; each mount is independent.
    live.innerHTML = '<p><strong>Original teaching joint:</strong> grounded housing + shaft/lever. Their axes are already aligned. Only axial position <b>z</b> and spin angle <b>θ</b> remain.</p>' +
      '<div class="am-setup"><label>Joint goal<select data-am="goal"><option value="hinge">Hinge: spin, no slide</option><option value="slider">Slider: slide, no spin</option><option value="fixed">Fixed: no relative motion</option></select></label><label>Predict the current freedom count<select data-am="prediction"><option value="">Choose before testing</option><option value="0">0 DOF</option><option value="1">1 DOF</option><option value="2">2 DOF</option></select></label></div>' +
      '<fieldset><legend>Locating conditions (axis alignment stays built in)</legend><label><input type="checkbox" data-am="seat">Seat shoulder plane on housing datum: z = 0 mm</label><label><input type="checkbox" data-am="lock">Align lever to angular datum: θ = 0°</label></fieldset>' +
      '<div class="am-views"><figure><svg viewBox="0 0 480 230" role="img" aria-label="Side view along the shaft, showing grounded housing, shoulder plane and common Z axis"><path class="am-housing" d="M160 65H260V165H160Z M170 95H250V135H170Z" fill-rule="evenodd"/><path class="am-ground" d="M160 175H260 m-95 0 -10 10 m30 -10 -10 10 m30 -10 -10 10 m30 -10 -10 10 m30 -10 -10 10"/><g data-am="shaft"><rect class="am-shaft" x="90" y="102" width="280" height="26"/><rect class="am-shaft" x="140" y="83" width="20" height="64"/><line class="am-selected" x1="160" y1="78" x2="160" y2="152"/></g><line class="am-datum" x1="160" y1="55" x2="160" y2="165"/><path class="am-axis" d="M35 115H445 m-10 -5 10 5 -10 5"/><text x="30" y="35">SIDE · +z →</text><text x="165" y="205">Grounded housing</text><text x="30" y="225">Selected: shoulder plane + housing datum</text></svg><figcaption>Dashed datum: z = 0. Highlighted shoulder moves with the shaft. Housing stays fixed.</figcaption></figure>' +
      '<figure><svg viewBox="0 0 260 230" role="img" aria-label="End view looking toward negative Z: lever spin is positive counterclockwise"><circle class="am-housing" cx="130" cy="115" r="55"/><circle class="am-shaft" cx="130" cy="115" r="18"/><path class="am-datum" d="M130 115H235"/><g data-am="lever"><path class="am-lever" d="M130 115H195"/><circle class="am-knob" cx="195" cy="115" r="8"/></g><path class="am-axis" d="M119 115H141 M130 104V126"/><text x="12" y="28">END · looking toward −Z</text><text x="18" y="215">+θ counterclockwise ↶</text></svg><figcaption>Rightward dashed ray: θ = 0°. The same Z axis points toward you (out of the end view). The lever is attached to the shaft.</figcaption></figure></div>' +
      '<output class="am-status" data-am="status" aria-live="polite"></output><div class="am-readings" data-am="readings"></div>' +
      '<div class="am-coordinates"><label>Request axial position z (mm)<input data-am="z" type="range" min="-30" max="30" step="1" value="12"></label><label>Request spin θ (degrees)<input data-am="angle" type="range" min="0" max="359" step="1" value="35"></label></div>' +
      '<p class="am-help">Drag a slider, or focus it and use arrow keys. A blocked request keeps the actual coordinate unchanged.</p>' +
      '<div class="am-actions"><button type="button" data-am="test">Test both motions</button><button type="button" data-am="recover">Restore goal motion</button><button type="button" data-am="reset">Reset experiment</button></div>' +
      '<p class="am-feedback" data-am="feedback" aria-live="polite"></p><p class="am-goal" data-am="assessment" aria-live="polite"></p>' +
      '<details class="am-edit"><summary>Enter an exact coordinate</summary><label>Coordinate<select data-am="coordinate"><option value="z">z (mm)</option><option value="angle">θ (degrees, wraps every 360°)</option></select></label><label>Requested value<input data-am="value" type="number" step="any" value="12"></label><button type="button" data-am="apply">Apply coordinate</button></details>' +
      '<p class="am-limits">Lab travel: −30 to +30 mm, a display range, not physical stops. Spin wraps into 0–359…°. Shoulder seating means ideal plane coincidence: it holds z = 0 in both directions. A physical shoulder contact alone would not retain a shaft against separation. This model does not calculate contact, collision/interference, friction or load capacity. Schematic overlap is not a fit or clearance check.</p>';
    root.appendChild(live); root.classList.add('am-live');
    function el(k) { return live.querySelector('[data-am="' + k + '"]'); }
    function number(n) { return String(n); }
    function render(message) {
      var f = M.freedoms(s), a = M.assess(s, goal);
      el('seat').checked = s.seat; el('lock').checked = s.lock;
      el('z').value = s.z; el('angle').value = s.angle;
      el('z').setAttribute('aria-valuetext', number(s.z) + ' mm, slide ' + (f.slide ? 'allowed' : 'blocked'));
      el('angle').setAttribute('aria-valuetext', number(s.angle) + ' degrees, spin ' + (f.spin ? 'allowed' : 'blocked'));
      el('shaft').setAttribute('transform', 'translate(' + (s.z * 2) + ' 0)');
      el('lever').setAttribute('transform', 'rotate(' + (-s.angle) + ' 130 115)');
      el('status').textContent = f.dof + ' DOF · Slide ' + (f.slide ? 'allowed' : 'blocked') + ' · Spin ' + (f.spin ? 'allowed' : 'blocked');
      el('readings').textContent = 'Actual z = ' + number(s.z) + ' mm · Actual θ = ' + number(s.angle) + '°';
      el('assessment').textContent = a.message;
      el('feedback').textContent = message || 'Conditions updated. Test the surviving motions and compare with the goal.';
      live.dataset.dof = f.dof; live.dataset.goalMet = a.matches;
    }
    function request(coordinate, value) {
      var r = M.move(s, coordinate, value);
      if (!r.ok) { render(r.reason); return; }
      s = r.state;
      render(r.blocked ? (coordinate === 'z' ? 'Slide blocked by z = 0. Spin may still be allowed.' : 'Spin blocked by θ = 0°. Slide may still be allowed.') : (r.moved ? 'Requested motion is allowed. The other coordinate stayed unchanged.' : 'Already at that coordinate. Try a different value.'));
    }
    ['z', 'angle'].forEach(function (coordinate) { el(coordinate).addEventListener('input', function () { request(coordinate, Number(el(coordinate).value)); }); });
    ['seat', 'lock'].forEach(function (condition) { el(condition).addEventListener('change', function () {
      s = M.conditions(s, el('seat').checked, el('lock').checked).state;
      el('prediction').value = '';
      render('Locating conditions applied: selected shoulder sets z = 0; selected angular alignment sets θ = 0°. Removing a condition restores its motion.');
    }); });
    el('goal').addEventListener('change', function () { goal = el('goal').value; render('Goal changed; the current conditions and placement are retained. Compare allowed motions with this goal.'); });
    el('test').addEventListener('click', function () {
      var f = M.freedoms(s), prediction = el('prediction').value;
      var slide = M.move(s, 'z', s.z <= 20 ? s.z + 10 : s.z - 10); s = slide.state;
      var spin = M.move(s, 'angle', s.angle + 30); s = spin.state;
      render((prediction ? (Number(prediction) === f.dof ? 'Prediction matches. ' : 'Compare your prediction with the surviving motions. ') : 'Choose a prediction before the next test. ') + 'Requested +/−10 mm slide: ' + (slide.blocked ? 'blocked' : 'moved') + '; +30° spin: ' + (spin.blocked ? 'blocked' : 'moved') + '. ' + f.dof + ' independent motion(s) remain.');
    });
    el('recover').addEventListener('click', function () { var t = M.goals[goal]; s = M.conditions(s, t.seat, t.lock).state; el('prediction').value = ''; render('Restored the conditions for this goal. Test both motions to verify what was preserved.'); });
    el('reset').addEventListener('click', function () { s = M.defaults(); goal = 'hinge'; el('goal').value = goal; el('prediction').value = ''; el('value').value = '12'; render('Reset: predict the two motions left after axis alignment, then test.'); });
    el('apply').addEventListener('click', function () { var raw = el('value').value; request(el('coordinate').value, raw.trim() === '' ? NaN : Number(raw)); });
    render('Predict how many independent motions remain after axis alignment, then test both motions.');
  });
})();
