(function () {
  'use strict';
  const model = window.CourseWikiDCMotor;
  if (!model) return;
  function init(root) {
    if (root.dataset.dmcReady) return;
    const live = root.querySelector('.dmc-live');
    const result = root.querySelector('[data-result]');
    const plot = root.querySelector('[data-plot]');
    const stallInput = root.querySelector('[data-stall]');
    const speedInput = root.querySelector('[data-speed]');
    const loadInput = root.querySelector('[data-load]');
    if (!live || !result || !plot || !stallInput || !speedInput || !loadInput) return;
    root.dataset.dmcReady = 'true';
    function fmt(value) { return Number(value.toPrecision(5)).toLocaleString('en-US', { maximumFractionDigits: 6 }); }
    function update() {
      const inputs = [stallInput, speedInput, loadInput];
      if (inputs.some(input => input.value.trim() === '' || !input.checkValidity())) {
        result.textContent = 'Enter stall torque from 0.001 to 1,000 N·m, speed from 1 to 100,000 rpm, and load from 0 to 1,000 N·m.';
        plot.replaceChildren();
        return;
      }
      const [stall, noLoad, load] = inputs.map(input => Number(input.value));
      let p;
      try { p = model.operatingPoint(stall, noLoad, load); }
      catch (error) { result.textContent = error.message; plot.replaceChildren(); return; }
      const peak = ' Peak power: ' + fmt(p.peakPower) + ' W at ' + fmt(p.peakSpeed) + ' rpm and ' + fmt(p.peakTorque) + ' N·m.';
      if (p.state === 'overload') {
        result.textContent = 'Load exceeds stall torque: no forward steady operating point exists in this model. Back-driving and transients are not modeled.' + peak;
      } else {
        result.textContent = (p.state === 'stall' ? 'Stall: zero speed and zero shaft power. This is not a continuous operating rating. ' : '') +
          'Operating speed: ' + fmt(p.speed) + ' rpm (' + fmt(p.omega) + ' rad/s). Output power: ' + fmt(p.power) + ' W.' + peak;
      }
      const curve = Array.from({ length: 81 }, (_, i) => {
        const x = i / 80;
        return (i ? 'L' : 'M') + (70 + 480 * x).toFixed(2) + ' ' + (260 - 200 * 4 * x * (1 - x)).toFixed(2);
      }).join(' ');
      let marks = '';
      if (p.state !== 'overload') {
        const x = 70 + 480 * p.speed / noLoad;
        const y = 260 - 200 * load / stall;
        const py = 260 - 200 * p.power / p.peakPower;
        marks = '<path class="dmc-guide" d="M' + x + ' 260V' + Math.min(y, py) + '"/>' +
          '<circle class="dmc-point" cx="' + x + '" cy="' + y + '" r="7"/>' +
          '<path class="dmc-point" d="M' + x + ' ' + (py - 8) + 'l8 8 -8 8 -8 -8Z"/>';
      }
      // Only bounded model numbers enter SVG markup; user strings are never interpolated.
      plot.innerHTML = '<svg viewBox="0 0 620 330" role="img" aria-label="Normalized torque and output power versus speed. ' +
        (p.state === 'overload' ? 'No valid operating point.' : 'Operating speed ' + fmt(p.speed) + ' rpm.') + '">' +
        '<path class="dmc-axis" d="M70 45V260H565"/><text x="10" y="32">Fraction</text>' +
        '<text x="45" y="65">1</text><text x="45" y="265">0</text>' +
        '<path class="dmc-torque" d="M70 60L550 260"/><path class="dmc-power" d="' + curve + '"/>' +
        '<rect class="dmc-peak" x="304" y="54" width="12" height="12"/>' + marks +
        '<text x="70" y="285" text-anchor="middle">0</text><text x="310" y="285" text-anchor="middle">0.5</text>' +
        '<text x="550" y="285" text-anchor="middle">1</text><text x="310" y="315" text-anchor="middle">Speed / no-load speed</text>' +
        '<text x="390" y="45">Dashed: power</text><text x="95" y="150">Solid: torque</text></svg>';
    }
    live.hidden = false;
    inputsListen();
    update();
    function inputsListen() { [stallInput, speedInput, loadInput].forEach(input => input.addEventListener('input', update)); }
  }
  function initAll() { document.querySelectorAll('[data-interactive="dc-motor-curve"]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll, { once: true });
  else initAll();
})();
