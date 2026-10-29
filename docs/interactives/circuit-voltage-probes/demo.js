(function () {
  'use strict';
  const circuits = globalThis.CourseWikiCircuits, drawing = globalThis.CourseWikiCircuitDrawing;
  if (!circuits || !drawing) return;
  const labels = Object.freeze({
    'supply-positive': 'Supply +', 'switch-1-out': 'After S1', 'resistor-1-out': 'After R1',
    'switch-2-out': 'After S2', 'supply-negative': 'Supply −'
  });
  let sequence = 0;
  function nextId() {
    do { sequence += 1; } while (document.getElementById(`cvp-${sequence}-prediction`));
    return `cvp-${sequence}`;
  }
  function fmt(value) { return value === null ? 'undetermined' : `${Number(value.toPrecision(4))} V`; }
  function init(root) {
    if (root.dataset.cvpReady) return;
    const id = nextId();
    let activeLead = 'red', red = null, black = null, stateKey = 's1-open';
    const live = document.createElement('div'); live.className = 'cvp-live';
    live.innerHTML = `<fieldset class="cvp-config"><legend>Circuit state</legend><div class="cvp-choice-row">
      <label><input type="radio" name="${id}-state" value="s1-open" checked> S1 open</label>
      <label><input type="radio" name="${id}-state" value="closed"> Both closed</label>
      <label><input type="radio" name="${id}-state" value="s2-open"> S2 open</label>
      </div></fieldset>
      <fieldset class="cvp-leads"><legend>Place the probes on named points</legend><div class="cvp-lead-row">
      <button type="button" data-lead="red" aria-pressed="true">Place red probe</button>
      <button type="button" data-lead="black" aria-pressed="false">Place black probe</button>
      <button type="button" data-swap disabled>Swap red and black</button></div></fieldset>
      <p class="cvp-selection" data-selection role="status" aria-live="polite" aria-atomic="true"></p>
      <div class="cvp-diagram-scroll" tabindex="0" role="region" aria-label="Circuit diagram with horizontally scrollable probe points"><div data-diagram></div></div>
      <fieldset class="cvp-predict"><legend>Predict before revealing</legend>
      <label for="${id}-prediction">Signed meter reading, V(red) − V(black), in volts
      <input id="${id}-prediction" data-prediction type="number" step="any" inputmode="decimal"></label>
      <div class="cvp-predict-actions"><button type="button" data-reveal disabled>Reveal reading</button></div></fieldset>
      <p class="cvp-result" data-result data-state="waiting" role="status">Place both probes, enter a signed prediction, then reveal.</p>
      <p class="cvp-limit"><strong>Model boundary:</strong> ideal 12 V DC source, ideal wires and switches, 30 Ω and 60 Ω resistors, and an infinite-impedance voltmeter that does not load the circuit. This is not a mains-wiring procedure or a meter-safety qualification.</p>`;
    root.insertBefore(live, root.firstChild); root.dataset.cvpReady = 'true';
    const diagram = live.querySelector('[data-diagram]'), prediction = live.querySelector('[data-prediction]');
    const reveal = live.querySelector('[data-reveal]'), result = live.querySelector('[data-result]');
    const configuration = () => stateKey === 'closed' ? [true,true] : stateKey === 's1-open' ? [false,true] : [true,false];
    function modelState() { return circuits.seriesNodePotentials({voltage:12,resistances:[30,60],closed:configuration()}); }
    function updateReveal() { reveal.disabled = !red || !black || prediction.value.trim() === '' || !prediction.checkValidity(); }
    function reset(message) {
      prediction.value = ''; result.dataset.state = 'waiting';
      result.textContent = message || 'Enter a signed prediction, then reveal.';
      updateReveal();
    }
    function render(focusId, announcement) {
      const state = modelState();
      diagram.innerHTML = drawing.schematic(state.solution,{probePoints:true,red,black});
      const current = `Red: ${red ? labels[red] : 'not placed'}. Black: ${black ? labels[black] : 'not placed'}. Active lead: ${activeLead}.`;
      live.querySelector('[data-selection]').textContent = `${announcement || `${activeLead === 'red' ? 'Red' : 'Black'} probe active. Choose a diagram point.`} ${current} Diagram points: A = after S1, B = after R1, C = after S2.`;
      live.querySelectorAll('[data-lead]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lead === activeLead)));
      live.querySelector('[data-swap]').disabled = !red || !black;
      if (focusId) diagram.querySelector(`[data-probe-point="${focusId}"]`)?.focus();
    }
    function place(point, focusAfter) {
      const placed = activeLead;
      if (placed === 'red') red = point; else black = point;
      activeLead = activeLead === 'red' ? 'black' : 'red'; reset('Probe moved. Enter a new signed prediction.');
      render(focusAfter ? point : null, `${placed === 'red' ? 'Red' : 'Black'} probe placed at ${labels[point]}. Place ${activeLead} probe next.`);
    }
    live.addEventListener('click', event => {
      const point = event.target.closest('[data-probe-point]');
      if (point) { place(point.dataset.probePoint, true); return; }
      const lead = event.target.closest('[data-lead]');
      if (lead) { activeLead = lead.dataset.lead; render(null,`${activeLead === 'red' ? 'Red' : 'Black'} probe active. Choose a diagram point.`); return; }
      if (event.target.closest('[data-swap]')) { [red,black] = [black,red]; reset('Probes swapped. Predict the reversed signed reading.'); render(null,'Red and black probes swapped. Enter a new signed prediction.'); }
    });
    live.addEventListener('keydown', event => {
      const point = event.target.closest('[data-probe-point]');
      if (point && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); place(point.dataset.probePoint, true); }
      if (event.target.matches('input,button,[data-probe-point]')) event.stopPropagation();
    });
    live.querySelector('.cvp-config').addEventListener('change', event => {
      if (!event.target.matches('input[type="radio"]')) return;
      stateKey = event.target.value; reset('Circuit state changed. Enter a new signed prediction.'); render(null,'Circuit state changed. Probe positions are unchanged; enter a new signed prediction.');
    });
    prediction.addEventListener('input', updateReveal);
    reveal.addEventListener('click', () => {
      const state = modelState(), actual = circuits.probeVoltage(state,red,black), guess = Number(prediction.value);
      if (actual === null) { result.dataset.state = 'waiting'; result.textContent = state.reason || 'This ideal reading is undetermined.'; return; }
      const correct = Math.abs(guess - actual) <= .05;
      result.dataset.state = correct ? 'correct' : 'incorrect';
      const current = Number(state.solution.current.toPrecision(4));
      result.textContent = `${correct ? 'Prediction confirmed.' : 'Compare the sign and probe order.'} Meter: ${fmt(actual)} because V(red) − V(black) = ${fmt(state.points[red])} − ${fmt(state.points[black])}. Circuit current is ${current} A; R1 and R2 drops are ${Number(state.solution.elements[0].voltage.toPrecision(4))} V and ${Number(state.solution.elements[1].voltage.toPrecision(4))} V.`;
    });
    render();
  }
  function initAll() { document.querySelectorAll('[data-interactive="circuit-voltage-probes"]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initAll,{once:true}); else initAll();
})();
