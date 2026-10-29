(function () {
  'use strict';
  const M = window.CourseWikiMotorLoad;
  if (!M) return;
  let sequence = 0;
  function fmt(value, digits) {
    if (value === null) return '—';
    return Number(value.toPrecision(digits || 4)).toLocaleString('en-US', { maximumFractionDigits: 5 });
  }
  function init(root) {
    if (root.dataset.mlmReady) return;
    sequence += 1;
    while (document.getElementById('mlm-' + sequence + '-stall')) sequence += 1;
    const id = 'mlm-' + sequence;
    const live = document.createElement('div');
    live.className = 'mlm-live';
    live.innerHTML =
      '<div class="mlm-flow" aria-label="Two ways to connect the same motor and output load">' +
        '<div><strong>Direct</strong><span>motor → output load</span></div>' +
        '<div><strong>Reduction</strong><span>motor → small gear → large gear → same load</span></div>' +
      '</div>' +
      '<div class="mlm-controls">' +
        field('stall', 'Motor stall torque (N·m)', 0.8, '0.01', '10', '0.01') +
        field('speed', 'Motor no-load speed (rpm)', 120, '1', '240', '1') +
        field('load', 'Output load torque (N·m)', 0.6, '0', '10', '0.01') +
        field('driver', 'Driver gear teeth (20–59)', 20, '20', '59', '1') +
        field('driven', 'Driven gear teeth (> driver)', 40, '21', '60', '1') +
        field('efficiency', 'Mesh efficiency (%)', 90, '1', '100', '1') +
      '</div>' +
      '<fieldset class="mlm-predict"><legend>Predict before revealing</legend>' +
        '<p>Under this same output load, which connection has the greater forward output speed?</p>' +
        choice(id, 'direct', 'Direct drive') + choice(id, 'geared', 'Gear reduction') +
        choice(id, 'same', 'Same speed') + choice(id, 'neither', 'Neither has a running point') +
        '<button type="button" data-reveal disabled>Reveal both operating points</button>' +
      '</fieldset>' +
      '<p class="mlm-prompt" data-prompt role="status">Choose a prediction first.</p>' +
      '<div class="mlm-results" data-results hidden></div>' +
      '<p class="mlm-limit"><strong>Model boundary:</strong> fixed supply voltage, a constant resisting output torque, an ideal linear motor curve, and one gear mesh with constant running efficiency. It does not predict starting, acceleration, heating, back-driving, electrical input, continuous rating, gear strength, or a safe selection.</p>';
    root.insertBefore(live, root.firstChild);
    root.dataset.mlmReady = 'true';
    const reveal = live.querySelector('[data-reveal]');
    const prompt = live.querySelector('[data-prompt]');
    const results = live.querySelector('[data-results]');
    const radios = Array.from(live.querySelectorAll('input[type="radio"]'));
    function field(key, label, value, min, max, step) {
      return '<label for="' + id + '-' + key + '">' + label + '<input id="' + id + '-' + key + '" data-key="' + key + '" type="number" value="' + value + '" min="' + min + '" max="' + max + '" step="' + step + '" inputmode="decimal"></label>';
    }
    function choice(name, value, label) {
      return '<label><input type="radio" name="' + name + '-prediction" value="' + value + '"> ' + label + '</label>';
    }
    function input() {
      const value = key => {
        const element = live.querySelector('[data-key="' + key + '"]');
        return element.value.trim() === '' ? NaN : Number(element.value);
      };
      return { stallTorque: value('stall'), noLoadSpeed: value('speed'), outputLoadTorque: value('load'),
        driverTeeth: value('driver'), drivenTeeth: value('driven'), efficiency: value('efficiency') };
    }
    function resetPrediction() {
      radios.forEach(radio => { radio.checked = false; });
      reveal.disabled = true;
      results.hidden = true;
      results.replaceChildren();
      prompt.textContent = 'Inputs changed. Choose a new prediction.';
    }
    function outcome(label, path, reduction) {
      const article = document.createElement('article');
      article.className = 'mlm-result';
      article.dataset.state = path.state;
      const title = document.createElement('h3');
      title.textContent = label;
      article.append(title);
      const status = document.createElement('p');
      status.className = 'mlm-state';
      if (path.state === 'overload') {
        status.textContent = 'No forward steady operating point: the reflected motor torque (' +
          fmt(path.requiredMotorTorque) + ' N·m) exceeds stall torque.';
      } else if (path.state === 'stall') {
        status.textContent = 'Stall boundary: zero speed and zero shaft output power. This is not a running or continuous rating.';
      } else {
        status.textContent = 'Running point: ' + fmt(path.outputSpeed) + ' rpm at the output.';
      }
      article.append(status);
      const list = document.createElement('dl');
      const rows = [
        ['Speed ratio (motor:output)', reduction],
        ['Torque required at motor', fmt(path.requiredMotorTorque) + ' N·m'],
        ['Motor speed', fmt(path.motorSpeed) + (path.motorSpeed === null ? '' : ' rpm')],
        ['Motor shaft power', fmt(path.motorShaftPower) + (path.motorShaftPower === null ? '' : ' W')],
        ['Output speed', fmt(path.outputSpeed) + (path.outputSpeed === null ? '' : ' rpm')],
        ['Modeled output power', fmt(path.outputPower) + (path.outputPower === null ? '' : ' W')]
      ];
      rows.forEach(([term, value]) => {
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = term; dd.textContent = value; list.append(dt, dd);
      });
      article.append(list);
      return article;
    }
    live.addEventListener('input', event => {
      if (event.target.matches('[data-key]')) resetPrediction();
    });
    live.querySelector('.mlm-predict').addEventListener('change', () => {
      reveal.disabled = !radios.some(radio => radio.checked);
      prompt.textContent = reveal.disabled ? 'Choose a prediction first.' : 'Prediction recorded. Reveal when ready.';
    });
    reveal.addEventListener('click', () => {
      const guess = radios.find(radio => radio.checked);
      if (!guess) return;
      try {
        const r = M.compare(input());
        const answer = r.faster;
        const answerText = { direct: 'direct drive', geared: 'gear reduction', same: 'the same speed', neither: 'neither connection' }[answer];
        prompt.textContent = guess.value === answer ? 'Prediction confirmed: ' + answerText + '.' : 'Compare the operating points: ' + answerText + ' is the result.';
        results.replaceChildren(
          outcome('Direct drive', r.direct, '1:1'),
          outcome('Gear reduction', r.geared, fmt(r.reduction) + ':1')
        );
        const note = document.createElement('p');
        note.className = 'mlm-power-note';
        if (r.direct.state === 'running' && r.geared.state === 'running') {
          note.textContent = 'The gearbox did not create power. The reflected load moved the motor to a different torque and speed, so motor shaft power changed from ' +
            fmt(r.direct.motorShaftPower) + ' W to ' + fmt(r.geared.motorShaftPower) + ' W before the modeled mesh loss. Output power is therefore not being compared at equal motor shaft power.';
        } else {
          note.textContent = 'A missing operating point is not assigned a speed or power. This steady-running comparison does not establish that either connection can start, run continuously, or stay within temperature and gear ratings.';
        }
        results.append(note);
        results.hidden = false;
      } catch (error) {
        prompt.textContent = error.message;
        results.hidden = true;
        results.replaceChildren();
      }
    });
    live.addEventListener('keydown', event => {
      if (event.target.matches('input, button')) event.stopPropagation();
    });
  }
  function initAll() { document.querySelectorAll('[data-interactive="motor-load-matching"]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll, { once: true });
  else initAll();
})();
