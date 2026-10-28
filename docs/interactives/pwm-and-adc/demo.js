(function () {
  'use strict';
  const model = globalThis.CourseWikiPwmAdc;
  document.querySelectorAll('[data-interactive="pwm-and-adc"]').forEach(root => {
    if (root.dataset.paReady) return;
    root.dataset.paReady = 'true';
    const live = root.querySelector('.pa-live');
    live.innerHTML = `<fieldset><legend>PWM · ideal 0–5 V output</legend>
      <div class="pa-controls"><label>Duty cycle (%) <input data-duty type="range" min="0" max="100" step="1" value="25"></label>
      <label>Frequency (Hz) <input data-frequency type="number" min="10" max="2000" step="1" value="500"></label>
      <label><input data-smooth type="checkbox" checked> Show RC-smoothed trace (τ = 10 ms)</label></div>
      <p data-pwm-output aria-live="polite"></p>
      <svg viewBox="0 0 660 240" role="img" aria-label="PWM square wave and optional settled RC trace over four cycles">
      <path class="pa-axis" d="M50 25V195H640"/><text x="4" y="35">5 V</text><text x="4" y="195">0 V</text>
      <path data-square class="pa-square"/><path data-filter class="pa-filter"/>
      <text x="50" y="225">0</text><text data-end x="620" y="225" text-anchor="end"></text></svg>
      <p>Solid line: PWM. Dashed line: settled RC output. The horizontal axis always shows four periods; read its changing time label.</p></fieldset>
      <fieldset><legend>ADC · 10 bits, 5.000 V reference</legend><div class="pa-controls">
      <label>Input voltage (V) <input data-voltage type="number" min="0" max="5" step="any" value="3"></label>
      <label>ADC code (integer) <input data-code type="number" min="0" max="1023" step="1" value="614"></label></div>
      <p data-adc-output aria-live="polite"></p><p>Editing voltage finds its bin. Editing code sets voltage to that bin's lower edge. These are model values, not exact hardware thresholds.</p></fieldset>`;
    const get = selector => live.querySelector(selector);
    const duty = get('[data-duty]'), frequency = get('[data-frequency]'), smooth = get('[data-smooth]');
    function draw() {
      if (!frequency.checkValidity() || frequency.value === '') {
        get('[data-pwm-output]').textContent = 'Enter a whole-number frequency from 10 to 2000 Hz.'; return;
      }
      const d = Number(duty.value), f = Number(frequency.value), p = model.pwm(d, f);
      get('[data-pwm-output]').textContent = `${d}% duty · period ${(p.period * 1000).toFixed(4)} ms · on-time ${(p.onTime * 1e6).toFixed(2)} µs · average ${p.average.toFixed(3)} V · nominal analogWrite ${p.writeValue}`;
      const y = v => 195 - 32 * v;
      let square = `M50 ${y(d === 0 ? 0 : 5)}`;
      for (let cycle = 0; cycle < 4; cycle++) {
        const start = 50 + cycle * 145, end = start + 145;
        if (d === 0 || d === 100) square += ` H${end}`;
        else square += ` H${start + 145 * p.duty} V195 H${end}${cycle < 3 ? ' V35' : ''}`;
      }
      get('[data-square]').setAttribute('d', square);
      const trace = Array.from({ length: 801 }, (_, i) => {
        const phase = (i / 200) % 1;
        return `${i ? 'L' : 'M'}${50 + i * 580 / 800} ${y(model.filtered(d, f, phase))}`;
      }).join(' ');
      get('[data-filter]').setAttribute('d', smooth.checked ? trace : '');
      get('[data-end]').textContent = `${(4 * p.period * 1000).toFixed(3)} ms`;
    }
    const volts = get('[data-voltage]'), code = get('[data-code]');
    function convert(fromCode) {
      const input = fromCode ? code : volts;
      if (input.value === '' || !input.checkValidity()) {
        get('[data-adc-output]').textContent = 'Use 0–5 V or an integer code from 0 to 1023.'; return;
      }
      if (fromCode) volts.value = model.voltage(Number(code.value));
      else code.value = model.adc(Number(volts.value));
      const n = Number(code.value), low = model.voltage(n), high = (n + 1) * 5 / 1024;
      get('[data-adc-output]').textContent = `Code ${n} · lower edge ${low.toFixed(7)} V · bin ${low.toFixed(7)} to ${high.toFixed(7)} V (${n === 1023 ? 'includes 5 V at the model limit' : 'upper edge excluded'}) · step 4.8828125 mV`;
    }
    duty.addEventListener('input', draw); frequency.addEventListener('input', draw); smooth.addEventListener('change', draw);
    volts.addEventListener('input', () => convert(false)); code.addEventListener('input', () => convert(true));
    draw(); convert(false); live.hidden = false; root.classList.add('pa-ready');
  });
})();
