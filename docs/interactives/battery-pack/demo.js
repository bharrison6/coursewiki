(function () {
  'use strict';
  function init(root) {
    if (root.dataset.batteryReady) return;
    const host = root.querySelector('[data-battery-live]');
    if (!host || !window.CourseWikiBatteryPack) return;
    const fields = [
      ['voltage', 'Cell nominal voltage (V)', 3.6, 'any', 0],
      ['capacity', 'Cell capacity (Ah)', 2.4, 'any', 0],
      ['series', 'Cells in each series string', 3, '1', 1],
      ['parallel', 'Strings in parallel', 2, '1', 1],
      ['rate', 'Maximum continuous discharge rate (C)', 3, 'any', 0],
      ['load', 'Pack load current (A)', 1.2, 'any', 0]
    ];
    const controls = document.createElement('div');
    controls.className = 'battery-controls';
    const inputs = {};
    fields.forEach(([key, title, value, step, min]) => {
      const label = document.createElement('label');
      label.textContent = title;
      const input = document.createElement('input');
      input.type = 'number'; input.step = step; input.min = min;
      input.value = value; input.name = key; input.inputMode = 'decimal';
      label.append(input); controls.append(label); inputs[key] = input;
    });
    const reset = document.createElement('button');
    reset.type = 'button'; reset.textContent = 'Reset example';
    const output = document.createElement('output');
    output.className = 'battery-results'; output.setAttribute('aria-live', 'polite');
    const format = value => Number(value.toPrecision(4)).toString();
    function update() {
      output.replaceChildren();
      try {
        const values = {};
        fields.forEach(([key]) => { values[key] = inputs[key].valueAsNumber; });
        const result = window.CourseWikiBatteryPack.calculate(values);
        const rows = [
          ['Pack voltage', format(result.packVoltage) + ' V'],
          ['Pack capacity', format(result.packCapacity) + ' Ah'],
          ['Nominal energy', format(result.energy) + ' Wh'],
          ['Rated maximum current (ideal)', format(result.maxCurrent) + ' A'],
          ['Ideal runtime', result.runtime === null ? 'No load: no finite runtime (self-discharge excluded)' : format(result.runtime) + ' h (' + format(result.runtime * 60) + ' min)']
        ];
        const list = document.createElement('dl');
        rows.forEach(([title, value]) => {
          const dt = document.createElement('dt'); dt.textContent = title;
          const dd = document.createElement('dd'); dd.textContent = value;
          list.append(dt, dd);
        });
        const note = document.createElement('p');
        note.textContent = result.overloaded ? 'Load exceeds the entered continuous rating. The arithmetic runtime is not a supported operating estimate.' : 'Ideal matched-cell model. Actual hardware and cell limits still apply.';
        output.append(list, note);
      } catch (error) {
        output.textContent = error.message;
      }
    }
    controls.addEventListener('input', update);
    reset.addEventListener('click', () => {
      fields.forEach(([key, , value]) => { inputs[key].value = value; }); update();
    });
    host.append(controls, reset, output);
    root.dataset.batteryReady = 'true';
    update();
  }
  function start() { document.querySelectorAll('[data-interactive="battery-pack"]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
