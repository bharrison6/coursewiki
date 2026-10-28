(function () {
  'use strict';
  document.querySelectorAll('[data-interactive="series-parallel-circuits"]').forEach(root => {
    if (root.dataset.circuitsReady) return;
    root.dataset.circuitsReady = 'true';
    const controls = root.querySelector('.circuit-controls');
    const live = root.querySelector('.circuit-live');
    controls.innerHTML = '<label>Connection <select name="mode"><option value="series">Series</option><option value="parallel">Parallel</option></select></label>' +
      '<label>Resistor count <select name="count"><option>2</option><option>3</option></select></label>' +
      '<label>Supply (V DC) <input name="voltage" type="number" min="0" max="48" step="any" value="15"></label>' +
      [30,60,90].map((r,i) => `<fieldset data-element="${i}"><legend>Resistor ${i+1}</legend><label>Resistance (Ω) <input name="r${i}" type="number" min="1" max="1000" step="any" value="${r}"></label><label><input name="s${i}" type="checkbox" checked> Switch closed</label></fieldset>`).join('') +
      '<p class="circuit-error" role="status"></p>';
    controls.hidden = false;
    live.hidden = false;
    const field = name => controls.querySelector(`[name="${name}"]`);
    const fmt = n => Number.isFinite(n) ? Number(n.toPrecision(4)).toString() : '∞ (open circuit)';
    function update() {
      const count = Number(field('count').value);
      controls.querySelector('[data-element="2"]').hidden = count !== 3;
      try {
        const s = window.CourseWikiCircuits.solve({ voltage: field('voltage').valueAsNumber, mode: field('mode').value,
          resistances: Array.from({length:count},(_,i) => field('r'+i).valueAsNumber), closed: Array.from({length:count},(_,i) => field('s'+i).checked) });
        controls.querySelector('.circuit-error').textContent = '';
        live.innerHTML = window.CourseWikiCircuitDrawing.schematic(s) +
          `<p aria-live="polite"><strong>${s.mode === 'series' ? 'Series' : 'Parallel'}, ${s.voltage} V DC.</strong> Equivalent resistance: ${fmt(s.resistance)} Ω; supply current: ${fmt(s.current)} A; total resistor power: ${fmt(s.power)} W.</p>` +
          '<div class="circuit-table"><table><caption>Each resistor (switch excluded); values shown to four significant figures</caption><thead><tr><th>Element</th><th>Switch</th><th>Current (A)</th><th>Voltage (V)</th><th>Power (W)</th></tr></thead><tbody>' +
          s.elements.map((e,i) => `<tr><th>R${i+1} (${e.resistance} Ω)</th><td>${e.closed ? 'Closed' : 'Open'}</td><td>${fmt(e.current)}</td><td>${fmt(e.voltage)}</td><td>${fmt(e.power)}</td></tr>`).join('') + '</tbody></table></div>';
      } catch (error) {
        controls.querySelector('.circuit-error').textContent = error.message;
        live.innerHTML = '<p>Results unavailable until the inputs are valid.</p>';
      }
    }
    controls.addEventListener('input', update);
    update();
  });
})();
