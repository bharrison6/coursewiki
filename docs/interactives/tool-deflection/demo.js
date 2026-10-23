(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiDeflection,
    node ? require('./render.js') : root.CourseWikiDeflectionDraw);
  if (node) module.exports = api;
  else if (typeof document !== 'undefined') document.querySelectorAll('[data-interactive="tool-deflection"]').forEach(api.init);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, D) {
  'use strict';
  var sequence = 0;
  var EXPERIMENTS = {
    length: { title: 'Halve the stickout', question: '80 → 40 mm: how much bending remains?',
      choices: [['0.5', '½ as much'], ['0.125', '⅛ as much'], ['1', 'The same']],
      change: { length: 40 }, answer: 0.125,
      reason: 'Length is cubed: (40 ÷ 80)³ = ⅛. Half the unsupported length means eight times the stiffness.' },
    diameter: { title: 'Double the diameter', question: '10 → 20 mm: how much bending remains?',
      choices: [['0.5', '½ as much'], ['0.25', '¼ as much'], ['0.0625', '¹⁄₁₆ as much']],
      change: { diameter: 20 }, answer: 0.0625,
      reason: 'Diameter enters to the fourth power: (10 ÷ 20)⁴ = 1/16. The same load bends the larger solid tool one sixteenth as much.' },
    force: { title: 'Double the load', question: '100 → 200 N: how much bending results?',
      choices: [['2', '2× as much'], ['4', '4× as much'], ['8', '8× as much']],
      change: { force: 200 }, answer: 2,
      reason: 'Load is linear in this model: 200 ÷ 100 = 2. Doubling only the force doubles the bending.' }
  };
  function trial(key) {
    var e = EXPERIMENTS[key];
    if (!e) throw new Error('Unknown experiment');
    return { baseline: Object.assign({}, M.DEFAULT), current: Object.assign({}, M.DEFAULT, e.change) };
  }
  function ratioText(cmp) {
    if (cmp.ratio === null) return cmp.current.tip === 0 ? 'Both tools are unloaded' : 'Baseline is unloaded';
    if (cmp.ratio === 0) return 'No bending under zero load';
    return M.format(cmp.ratio, 3) + '× baseline bending';
  }
  function validity(s) {
    var result = M.solve(s), notes = [];
    if (result.largeDeflection) notes.push('Bending exceeds 1% of the unsupported length. The small-deflection assumption is becoming weak; treat the number as a trend only.');
    if (result.shortBeam) notes.push('L/diameter is below 4. This is a short, thick beam; omitted shear deformation matters more.');
    return notes.join(' ');
  }
  function init(root) {
    if (root.dataset.tdReady || !M || !D) return;
    root.dataset.tdReady = 'true';
    var id = 'td-' + (++sequence), current = Object.assign({}, M.DEFAULT), baseline = Object.assign({}, M.DEFAULT);
    var chosen = 'length', guess = null;
    var lab = document.createElement('div'); lab.className = 'td-lab';
    lab.innerHTML = '<div class="td-start"><span class="td-kicker">TRY IT</span><strong>How much does a shorter tool help?</strong><span>Predict below, then test. Or move the stickout slider.</span></div>' +
      '<div class="td-workbench"><div class="td-observe"><div class="td-plot"></div>' +
      '<div class="td-legend"><span><i class="td-key-solid"></i>Loaded tool</span><span><i class="td-key-dash"></i>Unloaded outline</span><span>Clamp → load = stickout L</span></div>' +
      '<div class="td-readout"><div><span>Your tip movement</span><strong data-td-tip></strong></div><div><span>Against baseline</span><strong data-td-ratio></strong></div></div>' +
      '<p class="td-scale" data-td-scale></p></div>' +
      '<div class="td-controls"><div class="td-control-list"></div>' +
      '<details class="td-more"><summary>Load and material stiffness</summary><div class="td-secondary"></div><p>E describes elastic stiffness, not hardness or strength. 600 GPa is a teaching assumption for cemented carbide.</p></details>' +
      '<div class="td-actions"><button type="button" data-td-pin>Keep this as baseline</button><button type="button" data-td-reset>Reset</button></div>' +
      '<p class="td-baseline" data-td-baseline></p>' +
      '<p class="td-validity" data-td-validity hidden></p></div></div>' +
      '<div class="td-predict"><div class="td-predict-head"><label for="' + id + '-experiment">Predict, then test</label>' +
      '<select id="' + id + '-experiment" data-td-experiment><option value="length">Halve the stickout</option><option value="diameter">Double the diameter</option><option value="force">Double the load</option></select></div>' +
      '<fieldset class="td-choices"><legend data-td-question></legend><div data-td-choices></div></fieldset>' +
      '<div class="td-test-row"><button type="button" class="td-test" data-td-test disabled>Test the prediction</button><p data-td-feedback role="status">Choose a prediction first. Each test holds the other inputs constant.</p></div></div>' +
      '<details class="td-consequence"><summary>What could this leave on a wall?</summary><p>Imagine a one-sided wall pass with this steady force pointing <strong>away from the work</strong>. At the tip, the cutting edge moves away by the calculated bend and leaves that much extra material.</p><div data-td-wall></div>' +
      '<p>A real wall also depends on force along the cutting edge, tool shape, holder and workpiece motion. This sketch isolates one displacement; it does not predict the whole wall profile.</p></details>' +
      '<p class="td-boundary">Ideal static bending of a uniform solid round tool. Flutes, necks, holder motion and cutting dynamics are omitted.</p>';
    root.insertBefore(lab, root.firstChild);
    var q = function (s) { return lab.querySelector(s); }, inputs = {};
    q('.td-controls').appendChild(q('.td-predict'));
    function control(key, title, unit, min, max, step, parent) {
      var labelId = id + '-' + key, box = document.createElement('div'); box.className = 'td-control';
      box.innerHTML = '<label for="' + labelId + '">' + title + '<output for="' + labelId + '"></output></label>' +
        '<input id="' + labelId + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + current[key] + '">' +
        '<div class="td-range-ends"><span>' + min + ' ' + unit + '</span><span>' + max + ' ' + unit + '</span></div>';
      parent.appendChild(box);
      var slider = box.querySelector('input'), output = box.querySelector('output');
      inputs[key] = { slider: slider, output: output, unit: unit };
      slider.addEventListener('input', function () { current[key] = Number(slider.value); update(); });
      slider.addEventListener('keydown', function (e) { e.stopPropagation(); });
      slider.addEventListener('change', function () { q('[data-td-feedback]').textContent = 'Your setup changed. ' + ratioText(M.compare(current, baseline)) + '. Use the baseline button to compare another change.'; });
    }
    control('length', 'Unsupported stickout L', 'mm', 20, 120, 1, q('.td-control-list'));
    control('diameter', 'Solid tool diameter d', 'mm', 4, 20, 0.5, q('.td-control-list'));
    control('force', 'Side load at the tip F', 'N', 0, 400, 10, q('.td-secondary'));
    control('modulus', 'Elastic modulus E', 'GPa', 200, 700, 10, q('.td-secondary'));
    function update() {
      var cmp = M.compare(current, baseline), scale = D.commonScale(current, baseline);
      q('.td-plot').innerHTML = D.pair(current, baseline);
      q('[data-td-tip]').textContent = M.format(cmp.current.micrometers) + ' µm';
      q('[data-td-ratio]').textContent = ratioText(cmp);
      q('[data-td-scale]').textContent = (scale < 100 ? 'Bend scale reduced for these settings: ' : '') + 'Bending ×' + M.format(scale, 1) + ' in both tools; length and diameter share one scale. 1 µm = 0.001 mm.';
      q('[data-td-baseline]').textContent = 'Baseline: L ' + baseline.length + ' mm · d ' + baseline.diameter + ' mm · ' + baseline.force + ' N · E ' + baseline.modulus + ' GPa.';
      Object.keys(inputs).forEach(function (k) { inputs[k].slider.value = current[k]; inputs[k].output.textContent = current[k] + ' ' + inputs[k].unit; inputs[k].slider.setAttribute('aria-valuetext', current[k] + ' ' + inputs[k].unit); });
      var warning = [validity(current) ? 'Your setup: ' + validity(current) : '', validity(baseline) ? 'Baseline: ' + validity(baseline) : ''].filter(Boolean).join(' ');
      q('[data-td-validity]').hidden = !warning; q('[data-td-validity]').textContent = warning;
      q('[data-td-wall]').innerHTML = D.wall(current);
    }
    function prediction() {
      var e = EXPERIMENTS[chosen]; guess = null;
      q('[data-td-question]').textContent = e.question;
      q('[data-td-choices]').innerHTML = e.choices.map(function (v, i) {
        return '<label class="td-choice"><input type="radio" name="' + id + '-guess" value="' + v[0] + '"><span>' + v[1] + '</span></label>';
      }).join('');
      q('[data-td-test]').disabled = true;
      q('[data-td-feedback]').textContent = 'Choose a prediction first. The test starts from 80 mm, Ø10 mm, 100 N and E = 600 GPa.';
    }
    q('[data-td-choices]').addEventListener('change', function (e) { guess = Number(e.target.value); q('[data-td-test]').disabled = false; });
    q('[data-td-choices]').addEventListener('keydown', function (e) { e.stopPropagation(); });
    q('[data-td-experiment]').addEventListener('change', function (e) { chosen = e.target.value; prediction(); });
    q('[data-td-experiment]').addEventListener('keydown', function (e) { e.stopPropagation(); });
    q('[data-td-test]').addEventListener('click', function () {
      if (guess === null) return;
      var setup = trial(chosen), e = EXPERIMENTS[chosen]; current = setup.current; baseline = setup.baseline;
      update();
      q('[data-td-feedback]').textContent = (guess === e.answer ? 'Prediction confirmed. ' : 'The result is ' + M.format(e.answer, 4) + '×, rather than ' + M.format(guess, 4) + '×. ') + e.reason;
    });
    q('[data-td-pin]').addEventListener('click', function () {
      baseline = Object.assign({}, current); update();
      q('[data-td-feedback]').textContent = 'Baseline saved. Now change one input and compare its effect.';
    });
    q('[data-td-reset]').addEventListener('click', function () {
      current = Object.assign({}, M.DEFAULT); baseline = Object.assign({}, M.DEFAULT); chosen = 'length';
      q('[data-td-experiment]').value = chosen; prediction(); update();
    });
    prediction(); update(); root.classList.add('td-live');
  }
  return { init: init, trial: trial, EXPERIMENTS: EXPERIMENTS, ratioText: ratioText, validity: validity };
});
