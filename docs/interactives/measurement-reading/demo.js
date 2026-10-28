(function () {
  'use strict';
  const M=globalThis.CourseWikiMeasurement, R=globalThis.CourseWikiMeasurementSVG;
  if (!M || !R) return;
  document.querySelectorAll('[data-interactive="measurement-reading"]').forEach(root=>{
    if (root.dataset.mrReady) return;
    root.dataset.mrReady='true';
    const live=document.createElement('div');
    live.className='mr-live';
    live.innerHTML=`<label class="mr-mode">Instrument <select><option value="micrometer">Inch micrometer · 0.001 in</option><option value="vernier-micrometer">Vernier micrometer · 0.0001 in</option><option value="vernier-caliper">Vernier caliper · 0.001 in</option></select></label>
      <p>Read the scales, then enter inches. Scroll sideways if the scale does not fit.</p>
      <div class="mr-drawing" tabindex="0" aria-label="Scrollable scale drawing"></div>
      <details class="mr-description"><summary>Text version of the scale positions</summary><p></p></details>
      <form><label>Reading in inches <input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" required></label><button type="submit">Check reading</button><button type="button" class="mr-next">New reading</button></form>
      <p class="mr-feedback" role="status" aria-live="polite">Enter a reading to check.</p>`;
    root.append(live);
    const select=live.querySelector('select'), input=live.querySelector('input'), feedback=live.querySelector('.mr-feedback');
    let current;
    function next() {
      current=M.random(select.value);
      live.querySelector('.mr-drawing').innerHTML=R.draw(current);
      live.querySelector('.mr-description p').textContent=M.describe(current);
      live.querySelector('.mr-description').open=false;
      input.value=''; input.placeholder=current.digits===4?'0.0000':'0.000';
      input.removeAttribute('aria-invalid');
      feedback.textContent='New scale ready. Enter inches to check the reading.';
    }
    live.querySelector('form').addEventListener('submit',event=>{
      event.preventDefault();
      if (!input.value.trim()) { feedback.textContent='Enter a reading in inches first.'; return; }
      const ok=M.check(current,input.value);
      input.setAttribute('aria-invalid',String(!ok));
      feedback.textContent=(ok?'Correct. ':'Not yet. ')+M.explain(current);
    });
    live.querySelector('.mr-next').addEventListener('click',()=>{next();input.focus();});
    select.addEventListener('change',next);
    next();
    root.classList.add('mr-enhanced');
  });
})();
