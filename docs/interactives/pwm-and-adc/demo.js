(function () {
  'use strict';
  const model = globalThis.CourseWikiPwmAdc;
  let sequence = 0;
  function nextPredictionName() {
    let name;
    do { name = `pa-${++sequence}-prediction`; } while (document.querySelector(`input[name="${name}"]`));
    return name;
  }
  function init(root) {
    if (root.dataset.paReady || !model) return;
    const predictionName = nextPredictionName();
    root.dataset.paReady = 'true';
    const live = root.querySelector('.pa-live');
    live.innerHTML = `<fieldset class="pa-first-use"><legend>Compare point samples with the whole-cycle mean</legend>
      <p class="pa-settings" data-settings aria-live="polite"></p>
      <div class="pa-quick"><button type="button" data-phase-preset="10">Try phase 10%</button><button type="button" data-phase-preset="60">Try phase 60%</button></div>
      <div class="pa-plot-scroll" tabindex="0" role="region" aria-label="PWM waveform, sample instants and held readings; scroll horizontally">
      <svg viewBox="0 0 660 250" role="img" aria-label="Four PWM cycles with optional settled RC trace, point samples and sample-and-hold steps">
      <path class="pa-axis" d="M50 25V195H640"/><text x="4" y="35">5 V</text><text x="4" y="195">0 V</text>
      <path data-square class="pa-square"/><path data-filter class="pa-filter"/><path data-hold class="pa-hold"/><g data-samples class="pa-samples"></g>
      <text x="50" y="230">0</text><text data-end x="620" y="230" text-anchor="end"></text></svg></div>
      <p class="pa-plot-key">Solid: raw PWM · dashed: settled RC · gold dots: samples · gold step: held value. Only dots inside four shown cycles are drawn; an extended final step adds no sample.</p>
      <fieldset class="pa-predict"><legend>Predict the selected-sample mean versus the full-cycle time mean</legend>
      <div class="pa-choice-row"><label><input type="radio" name="${predictionName}" value="higher"> Higher</label>
      <label><input type="radio" name="${predictionName}" value="same"> Same</label>
      <label><input type="radio" name="${predictionName}" value="lower"> Lower</label></div>
      <button type="button" data-reveal disabled>Reveal sample results</button></fieldset>
      <p data-sample-output role="status" aria-live="polite">Choose a prediction, then reveal the finite sample-set results.</p>
      <p class="pa-limit">Each marker is one ideal point sample. A held value is not an average. The finite sample-set mean can differ from the full-cycle time mean.</p></fieldset>
      <details class="pa-advanced"><summary>Adjust PWM and sampling settings</summary>
      <fieldset><legend>PWM · ideal 0–5 V output</legend>
      <div class="pa-controls"><label>Duty cycle (%) <input data-duty type="range" min="0" max="100" step="1" value="25"></label>
      <label>Frequency (Hz) <input data-frequency type="number" min="10" max="2000" step="1" value="500"></label>
      <label><input data-smooth type="checkbox" checked> Show settled RC trace (τ = 10 ms)</label></div>
      <p data-pwm-output aria-live="polite"></p></fieldset>
      <fieldset><legend>Sampling · point readings, not window averages</legend><div class="pa-controls">
      <label>Input to sample <select data-signal><option value="raw">Raw PWM</option><option value="filtered">Settled RC output</option></select></label>
      <label>Sample rate (samples/s) <input data-sample-frequency type="number" min="1" max="100000" step="1" value="500"></label>
      <label>Starting phase (% of PWM cycle) <input data-phase type="number" min="0" max="99.9" step="0.1" value="10"></label>
      <label>Finite sample count <input data-count type="number" min="1" max="1000" step="1" value="12"></label></div>
      <p data-sample-window></p>
      <p class="pa-limit">Each marker is one ideal point sample. The held value is not an average. Sampling starts at the stated normalized phase and uses half-open PWM cycles; controls recompute a settled periodic RC response rather than startup.</p></fieldset>
      </details>
      <details class="pa-adc"><summary>Explore the independent 10-bit ADC model</summary>
      <fieldset><legend>ADC · 10 bits, 5.000 V reference</legend><div class="pa-controls">
      <label>Input voltage (V) <input data-voltage type="number" min="0" max="5" step="any" value="3"></label>
      <label>ADC code (integer) <input data-code type="number" min="0" max="1023" step="1" value="614"></label></div>
      <p data-adc-output aria-live="polite"></p><p>Editing voltage finds its bin. Editing code sets voltage to that bin's lower edge. These are model values, not exact hardware thresholds.</p></fieldset></details>`;
    const get = selector => live.querySelector(selector);
    const duty=get('[data-duty]'),frequency=get('[data-frequency]'),smooth=get('[data-smooth]');
    const signal=get('[data-signal]'),sampleFrequency=get('[data-sample-frequency]');
    const phase=get('[data-phase]'),count=get('[data-count]'),reveal=get('[data-reveal]');
    const prediction=()=>live.querySelector(`input[name="${predictionName}"]:checked`);
    let current=null;
    const y=value=>195-32*value;
    const valid=input=>input.value!==''&&input.checkValidity();
    function resetPrediction(message){live.querySelectorAll(`input[name="${predictionName}"]`).forEach(input=>{input.checked=false;});reveal.disabled=true;get('[data-sample-output]').textContent=message||'Inputs changed. Choose a new prediction, then reveal.';}
    function clearPlot(){get('[data-square]').setAttribute('d','');get('[data-filter]').setAttribute('d','');get('[data-hold]').setAttribute('d','');get('[data-samples]').replaceChildren();get('[data-end]').textContent='';}
    function settingsSummary(message){
      if(message){get('[data-settings]').textContent=`Settings need attention: ${message} Open “Adjust PWM and sampling settings” to review the current values.`;return;}
      get('[data-settings]').textContent=`${duty.value}% duty at ${frequency.value} Hz · ${signal.options[signal.selectedIndex].text} · ${count.value} point samples at ${sampleFrequency.value} samples/s · starts at phase ${phase.value}% · settled RC trace ${smooth.checked?'shown':'hidden'}.`;
    }
    function draw(){
      if(![frequency,sampleFrequency,phase,count].every(valid)){get('[data-pwm-output]').textContent='Enter values inside every stated range.';get('[data-sample-window]').textContent='Sample results unavailable until the inputs are valid.';settingsSummary('one or more values are empty or outside the stated range.');current=null;reveal.disabled=true;clearPlot();return;}
      try{
        const d=Number(duty.value),f=Number(frequency.value),p=model.pwm(d,f);
        current=model.sampleSet({percent:d,pwmFrequency:f,sampleFrequency:Number(sampleFrequency.value),startPhase:Number(phase.value)/100,count:Number(count.value),signal:signal.value});
        get('[data-pwm-output]').textContent=`${d}% duty · period ${(p.period*1000).toFixed(4)} ms · HIGH time ${(p.onTime*1e6).toFixed(2)} µs · full-cycle time mean ${p.average.toFixed(3)} V · nominal analogWrite ${p.writeValue}`;
        let square=`M50 ${y(d===0?0:5)}`;
        for(let cycle=0;cycle<4;cycle++){const start=50+cycle*145,end=start+145;if(d===0||d===100)square+=` H${end}`;else square+=` H${start+145*p.duty} V195 H${end}${cycle<3?' V35':''}`;}
        get('[data-square]').setAttribute('d',square);
        get('[data-filter]').setAttribute('d',smooth.checked?Array.from({length:801},(_,i)=>{const pointPhase=(i/200)%1;return`${i?'L':'M'}${50+i*580/800} ${y(model.filtered(d,f,pointPhase))}`;}).join(' '):'');
        const visible=current.samples.filter(sample=>sample.cycles<4);
        get('[data-samples]').innerHTML=visible.map(sample=>`<circle cx="${50+sample.cycles*145}" cy="${y(sample.input)}" r="5"><title>Sample ${sample.index+1}: ${sample.input.toFixed(4)} V at phase ${(sample.phase*100).toFixed(2)}%</title></circle>`).join('');
        let hold='';visible.forEach((sample,index)=>{const x=50+sample.cycles*145,next=index+1<visible.length?50+visible[index+1].cycles*145:630;hold+=`${index?'L':'M'}${x} ${y(sample.input)} H${Math.min(next,630)}`;});get('[data-hold]').setAttribute('d',hold);
        get('[data-end]').textContent=`${(4*p.period*1000).toFixed(3)} ms`;
        const first=current.samples[0],last=current.samples.at(-1);
        get('[data-sample-window]').textContent=`Exactly ${current.count} point samples, from ${(first.time*1000).toFixed(4)} ms through ${(last.time*1000).toFixed(4)} ms; sample period ${(current.samplePeriod*1000).toFixed(4)} ms. The plot shows only samples within its four displayed PWM cycles.`;
        settingsSummary();
      }catch(error){current=null;get('[data-sample-window]').textContent=error.message;settingsSummary(error.message);reveal.disabled=true;clearPlot();}
    }
    function update(){resetPrediction();draw();}
    [duty,frequency,sampleFrequency,phase,count].forEach(input=>input.addEventListener('input',update));
    smooth.addEventListener('change',update);
    signal.addEventListener('change',()=>{if(signal.value==='filtered'){smooth.checked=true;smooth.disabled=true;}else smooth.disabled=false;update();});
    live.querySelectorAll('[data-phase-preset]').forEach(button=>button.addEventListener('click',()=>{phase.value=button.dataset.phasePreset;update();phase.focus();}));
    live.querySelector('.pa-predict').addEventListener('change',()=>{reveal.disabled=!prediction()||!current;});
    reveal.addEventListener('click',()=>{if(!current||!prediction())return;const delta=current.sampleMean-current.timeMean,relation=Math.abs(delta)<1e-9?'same':delta>0?'higher':'lower',comparison=relation==='same'?'equal to':`${relation} than`,last=current.samples.at(-1);get('[data-sample-output]').textContent=`${prediction().value===relation?'Prediction confirmed.':'Compare the timing markers with the HIGH interval.'} Selected-sample mean ${current.sampleMean.toFixed(4)} V is ${comparison} full-cycle time mean ${current.timeMean.toFixed(4)} V. Mean of ADC lower-edge reconstructions: ${current.reconstructedMean.toFixed(4)} V. Last held point: ${last.input.toFixed(4)} V, code ${last.code}, lower edge ${last.reconstructed.toFixed(4)} V. Faster or more samples alone do not guarantee an unbiased finite mean.`;});
    const volts=get('[data-voltage]'),code=get('[data-code]');
    function convert(fromCode){const input=fromCode?code:volts;if(!valid(input)){get('[data-adc-output]').textContent='Use 0–5 V or an integer code from 0 to 1023.';return;}if(fromCode)volts.value=model.voltage(Number(code.value));else code.value=model.adc(Number(volts.value));const n=Number(code.value),low=model.voltage(n),high=(n+1)*5/1024;get('[data-adc-output]').textContent=`Code ${n} · lower edge ${low.toFixed(7)} V · bin ${low.toFixed(7)} to ${high.toFixed(7)} V (${n===1023?'includes 5 V at the model limit':'upper edge excluded'}) · step 4.8828125 mV`;}
    volts.addEventListener('input',()=>convert(false));code.addEventListener('input',()=>convert(true));
    draw();convert(false);live.hidden=false;root.classList.add('pa-ready');
  }
  function initAll(){document.querySelectorAll('[data-interactive="pwm-and-adc"]').forEach(init);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initAll,{once:true});else initAll();
})();
