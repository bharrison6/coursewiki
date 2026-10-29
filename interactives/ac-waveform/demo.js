(function () {
  'use strict';
  const model = globalThis.CourseWikiAcWaveform, drawing = globalThis.CourseWikiAcWaveformDrawing;
  if (!model || !drawing) return;
  let sequence = 0;
  function nextName() { let name; do { name = `acw-${++sequence}-prediction`; } while (document.querySelector(`input[name="${name}"]`)); return name; }
  function fmt(value, digits = 6) { return Number(value.toPrecision(digits)).toString(); }
  function init(root) {
    if (root.dataset.acwReady) return;
    root.dataset.acwReady = 'true';
    const predictionName = nextName(), live = document.createElement('div'); live.className = 'acw-live';
    live.innerHTML = `<fieldset class="acw-first-use"><legend>Compare signed mean, RMS, and the waveform</legend>
      <p class="acw-settings" data-settings aria-live="polite"></p>
      <div class="acw-presets"><button type="button" data-preset="centered">Zero-mean sine</button>
      <button type="button" data-preset="offset">Add 1 V offset</button><button type="button" data-preset="positive">Keep it positive</button><button type="button" data-preset="dc">Pure DC</button></div>
      <div class="acw-plot-scroll" tabindex="0" role="region" aria-label="Ideal voltage waveform diagram; scroll horizontally"><div data-diagram></div></div>
      <p class="acw-plot-note" data-plot-note></p>
      <fieldset class="acw-predict"><legend>Predict before revealing</legend><p>How does total RMS compare with the magnitude of the signed cycle mean?</p>
      <div class="acw-choice-row"><label><input type="radio" name="${predictionName}" value="higher"> RMS is higher</label>
      <label><input type="radio" name="${predictionName}" value="same"> They are equal</label><label><input type="radio" name="${predictionName}" value="lower"> RMS is lower</label></div>
      <button type="button" data-reveal disabled>Reveal whole-cycle statistics</button></fieldset>
      <p class="acw-status" data-status role="status" aria-live="polite">Choose a prediction, then reveal the statistics.</p><div class="acw-results" data-results hidden></div>
      <p class="acw-limit"><strong>Model boundary:</strong> an analytic sine plus DC offset over a whole cycle and one ideal fixed resistor. The plotted points illustrate that equation; they do not define the statistics. This is not a meter simulation, wiring procedure, mains-safety model, motor load, or prediction of impedance, power factor, or temperature.</p></fieldset>
      <details class="acw-advanced"><summary>Adjust waveform and resistor settings</summary>
      <fieldset><legend>Ideal waveform and resistor</legend><div class="acw-controls">
      <label>DC offset (V) <input data-offset type="number" min="-10" max="10" step="0.1" value="0"></label>
      <label>Sine amplitude (V) <input data-amplitude type="number" min="0" max="10" step="0.1" value="2"></label>
      <label>Frequency (Hz) <input data-frequency type="number" min="0.1" max="1000" step="0.1" value="50"></label>
      <label>Ideal resistance (Ω) <input data-resistance type="number" min="0.1" max="10000" step="0.1" value="100"></label></div>
      <p class="acw-context">For a sine, the model <code>v(t) = offset + amplitude × sin(2πft)</code> is evaluated over one complete cycle. With zero amplitude it is constant DC, with no physical cycle. Resistance is fixed and purely resistive.</p></fieldset></details>`;
    root.insertBefore(live, root.firstChild);
    const field = key => live.querySelector(`[data-${key}]`), diagram = field('diagram'), status = field('status'), results = field('results'), reveal = field('reveal');
    const inputs = ['offset','amplitude','frequency','resistance'].map(field), prediction = () => live.querySelector(`input[name="${predictionName}"]:checked`);
    function values() { return { offset:field('offset').valueAsNumber, amplitude:field('amplitude').valueAsNumber, frequency:field('frequency').valueAsNumber, resistance:field('resistance').valueAsNumber }; }
    function clear(message) { diagram.replaceChildren(); results.hidden=true; results.replaceChildren(); live.querySelectorAll(`input[name="${predictionName}"]`).forEach(input=>{input.checked=false;}); reveal.disabled=true; status.textContent=message||'Inputs changed. Choose a new prediction.'; }
    function settingsSummary(result) { field('settings').textContent=result.amplitude===0?`${fmt(result.offset)} V offset · constant DC (0 V sine amplitude; no oscillation) · ${fmt(result.resistance)} Ω ideal resistor.`:`${fmt(result.offset)} V offset · ${fmt(result.amplitude)} V sine amplitude at ${fmt(result.frequency)} Hz · ${fmt(result.resistance)} Ω ideal resistor.`; }
    function invalidSummary(message) { field('settings').textContent=`Settings need attention: ${message} Open “Adjust waveform and resistor settings” to review the current values.`;field('plot-note').textContent='No waveform is drawn until every setting is valid.'; }
    function update() { try { let input=values(); if(input.amplitude>0&&input.frequency===0){field('frequency').value='50';input=values();}const result=model.analyze(input); diagram.innerHTML=drawing.diagram(input); field('frequency').disabled=result.amplitude===0;settingsSummary(result);field('plot-note').textContent=result.amplitude===0?'Constant DC is shown across a display span; it has no physical cycle or oscillation period.':'One complete sine cycle is shown. The zero axis, signed mean, minimum, and maximum use the current values.';live.querySelector('.acw-plot-scroll').setAttribute('aria-label',result.amplitude===0?'Constant DC voltage diagram; scroll horizontally':'One complete sine-cycle voltage diagram; scroll horizontally');status.textContent=result.amplitude===0?'Pure DC has no oscillation period. Choose a prediction for the remaining statistics.':'Choose a prediction, then reveal the whole-cycle statistics.'; } catch(error) { field('frequency').disabled=false; clear(error.message);invalidSummary(error.message); } }
    inputs.forEach(input=>input.addEventListener('input',()=>{clear();update();}));
    live.querySelector('.acw-predict').addEventListener('change',()=>{reveal.disabled=!prediction()||!diagram.firstElementChild;});
    const presets={centered:[0,2,50,100],offset:[1,2,50,100],positive:[3,2,50,100],dc:[2,0,0,100]};
    live.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{[field('offset').value,field('amplitude').value,field('frequency').value,field('resistance').value]=presets[button.dataset.preset];clear(`${button.textContent} selected. Choose a new prediction.`);update();button.focus();}));
    reveal.addEventListener('click',()=>{ if(!prediction())return; try { const result=model.analyze(values()),meanMagnitude=Math.abs(result.mean);const relation=result.amplitude===0?'same':'higher',relationText=relation==='same'?'equal to':'higher than',roundedSame=relation==='higher'&&fmt(result.totalRms)===fmt(meanMagnitude);status.textContent=`${prediction().value===relation?'Prediction confirmed.':'Compare mean and RMS.'} Total RMS ${fmt(result.totalRms)} V is ${relationText} |mean| ${fmt(meanMagnitude)} V.${roundedSame?' The analytic values differ, although they round to the same displayed value.':''}`;const period=result.period===null?'not applicable (pure DC)':`${fmt(result.period*1000)} ms`;const polarity=result.amplitude===0?'constant DC':result.crossesZero?'crosses zero':result.touchesZero?'touches zero':'stays one polarity';results.innerHTML=`<dl><div><dt>Signed cycle mean</dt><dd>${fmt(result.mean)} V</dd></div><div><dt>AC-component RMS</dt><dd>${fmt(result.acRms)} V</dd></div><div><dt>Total RMS / equivalent DC magnitude</dt><dd>${fmt(result.totalRms)} V</dd></div><div><dt>Minimum / maximum</dt><dd>${fmt(result.minimum)} / ${fmt(result.maximum)} V</dd></div><div><dt>Peak-to-peak</dt><dd>${fmt(result.peakToPeak)} V</dd></div><div><dt>Period</dt><dd>${period}</dd></div><div><dt>Average power in ${fmt(result.resistance)} Ω</dt><dd>${fmt(result.averagePower*1000)} mW</dd></div><div><dt>Total waveform</dt><dd>${polarity}</dd></div></dl><p><strong>Heating connection:</strong> in this ideal fixed resistor, average power is <code>V<sub>RMS</sub><sup>2</sup>/R</code>. The signed mean can be zero while RMS and average power remain nonzero.</p>`;results.hidden=false;} catch(error){clear(error.message);} });
    update();
  }
  function initAll(){document.querySelectorAll('[data-interactive="ac-waveform"]').forEach(init);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initAll,{once:true});else initAll();
})();
