(function () {
  'use strict';
  const M = globalThis.CourseWikiTransferBatch, R = globalThis.CourseWikiTransferBatchRender;
  if (!M || !R) return;
  document.querySelectorAll('[data-interactive="transfer-batch-flow"]').forEach(root => {
    if (root.dataset.tbMounted) return;
    const fallback = root.innerHTML;
    root.dataset.tbMounted = 'true';
    root.innerHTML = `<div class="tb-live"><h3>When can the next station start?</h3>
      <p>Try this example: ten jobs, A takes 4 min/job, B takes 6. Instead of holding all ten at A, transfer each completed job. Predict what changes.</p>
      <div class="tb-controls"><div class="tb-predict"><label>Your prediction<select data-tb="prediction"><option value="">Choose before testing</option><option value="both">First item and full order finish earlier; processing/job stays 10 min</option><option value="first">Only the first item finishes earlier</option><option value="processing">Each job needs less processing</option></select></label><button type="button" class="button" data-tb="test">Test 10-job example</button></div></div>
      <p class="tb-status" role="status" aria-live="polite" data-tb="status">Compare the transfer-all schedule below with your prediction.</p>
      <div data-tb="plots"></div>
      <p>A is the upper blue row; B is the lower gold row. Each bar is one job; dashed lines mark when completed batches leave A. Both plots use the same minutes-from-order-release scale. Outline = inspected job.</p>
      <details class="tb-settings tb-controls"><summary>Change the order or station times</summary><div class="tb-fields">
        <label>Order size (jobs)<input data-tb="n" type="number" min="1" max="20" step="1" value="10"></label>
        <label>Transfer size (jobs)<input data-tb="batch" type="number" min="1" max="10" step="1" value="10"></label>
        <label>A (min/job)<input data-tb="a" type="number" min="1" max="20" step="1" value="4"></label>
        <label>B (min/job)<input data-tb="b" type="number" min="1" max="20" step="1" value="6"></label>
      </div><button type="button" class="button" data-tb="reset">Reset 10 jobs at 4 / 6 min</button></details>
      <div data-tb="evidence"><div class="tb-controls"><label>Inspect a job in the changed schedule<select data-tb="job"></select></label></div><div data-tb="detail"></div><details><summary>Exact schedule and waiting for every job</summary><div data-tb="table"></div></details></div>
      <details><summary>Ideal system, equations and limits</summary><p>All equal jobs are available at order time 0. A and B each process one job at a time, in order (first come, first served). A never blocks; waiting space is unlimited. A completed transfer batch moves immediately. The last batch may be smaller. Setup, transport, failures, rework and variation are zero.</p><p>For job i, A starts at (i − 1)tA and ends at i × tA. Its batch transfers at min(ceil(i / batch) × batch, N) × tA. B starts at the later of transfer time and the previous job’s B finish, then takes tB. Waiting before A + time at A + held for batch + waiting at B + time at B = that job’s finish time, measured from 0.</p><p>These are ideal schedules, not a factory diagnosis or a universal best batch size. Setup, transport, capacity limits and variability can change a real decision. No demand, quality or capacity forecast is made.</p></details></div>${fallback}`;
    const el = name => root.querySelector(`[data-tb="${name}"]`);
    let compared = false, selected = 1;
    function values() {
      return Object.fromEntries(['n', 'batch', 'a', 'b'].map(k => [k, el(k).value === '' ? NaN : Number(el(k).value)]));
    }
    function draw(message) {
      try {
        const v = values(), current = M.schedule(v), baseline = M.schedule({...v, batch: v.n});
        selected = Math.min(selected, v.n);
        el('n').removeAttribute('aria-invalid'); el('batch').max = String(v.n);
        el('plots').innerHTML = compared ? R.comparison(baseline, current, selected) : R.card(baseline, baseline.last, selected, `Transfer all ${baseline.n} jobs`);
        // Before the experiment, the single baseline keeps the prediction useful.
        el('job').innerHTML = current.jobs.map(j => `<option value="${j.id}"${j.id === selected ? ' selected' : ''}>Job ${j.id}</option>`).join('');
        el('evidence').hidden = !compared;
        el('detail').innerHTML = R.detail(current, selected);
        el('table').innerHTML = R.table(current);
        if (message) el('status').textContent = message;
        else el('status').textContent = compared ? `Transfer ${v.batch}: first ${current.first} min, full order ${current.last} min. Processing remains ${current.processing} min/job.` : 'Compare the transfer-all schedule below with your prediction.';
      } catch (error) {
        el('plots').innerHTML = ''; el('detail').innerHTML = ''; el('table').innerHTML = ''; el('evidence').hidden = true;
        el('status').textContent = error.message + ' No schedule is shown until the entries are valid.';
      }
    }
    ['n', 'batch', 'a', 'b'].forEach(k => el(k).addEventListener('input', () => { compared = true; draw(); }));
    el('job').addEventListener('change', () => { selected = Number(el('job').value); draw(); });
    el('test').addEventListener('click', () => {
      if (!el('prediction').value) { el('status').textContent = 'Choose a prediction, then test it.'; el('prediction').focus(); return; }
      ['n', 'batch', 'a', 'b'].forEach(k => { el(k).value = String(M.defaults[k]); });
      compared = true; selected = 1;
      draw((el('prediction').value === 'both' ? 'Your prediction matches. ' : 'Compare the result with your prediction: ') + 'First item: 46 → 10 min; full order: 100 → 64 min. Every job still needs 4 + 6 = 10 min of processing.');
    });
    el('reset').addEventListener('click', () => {
      ['n', 'batch', 'a', 'b'].forEach(k => { el(k).value = String(k === 'batch' ? 10 : M.defaults[k]); });
      compared = false; selected = 1; el('prediction').value = ''; draw();
    });
    draw();
  });
})();
