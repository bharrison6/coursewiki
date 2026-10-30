(function () {
  'use strict';
  function init(root) {
    if (root.dataset.syReady) return;
    const model = globalThis.CourseWikiStockYield, render = globalThis.CourseWikiStockYieldRender;
    if (!model || !render) return;
    const example = model.calculate(model.defaults).ticks;
    const baseline = `Test resets to page example: ${render.mm(example.length)} mm stock; ${render.mm(example.blank)} mm blanks; ${render.mm(example.kerf)} mm starting kerf.`;
    const live = document.createElement('div');
    live.className = 'sy-live';
    const fields = [
      ['length', 'Stock length (mm)', '50–1,200 mm'], ['blank', 'Blank length (mm)', '20–400 mm'],
      ['kerf', 'Separating kerf (mm)', '0–6 mm; zero is an ideal comparison'],
      ['left', 'Left excluded trim (mm)', '0–150 mm, including its cut loss'],
      ['right', 'Right excluded trim (mm)', '0–150 mm, including its cut loss'],
      ['price', 'Whole stock price ($)', '$0–500; no remnant credit']
    ];
    live.innerHTML = `<p><strong>10 blanks at 3 mm kerf?</strong></p>
      <div class="sy-exercise"><div class="sy-actions"><label>Predicted blank count<select data-sy-predict><option value="">Choose before testing</option><option value="10">10 blanks</option><option value="9">9 blanks</option><option value="8">8 blanks</option></select></label><button type="button" data-sy-test>Test 3 mm kerf</button></div><p data-sy-prediction role="status">${baseline}</p></div>
      <p><strong>Cut policy:</strong> one full separating kerf per blank, including last; excluded trims include their own cut losses.</p>
      <div class="sy-result" data-sy-result hidden>
        <p class="sy-headline" data-sy-headline role="status" aria-live="polite"></p>
        <div class="sy-scroll" data-sy-diagram tabindex="0" role="region" aria-label="Actual stock layout; scroll horizontally to inspect the full bar"></div>
        <p class="sy-scroll-hint">Scroll sideways, or focus the bar and use arrow keys. Exact positions are below.</p>
        <div class="sy-legend"><span><i class="sy-swatch sy-blank"></i>Acceptable blanks</span><span><i class="sy-swatch sy-kerf"></i>Separating kerfs</span><span><i class="sy-swatch sy-trim"></i>Excluded trims</span><span><i class="sy-swatch sy-offcut"></i>Remaining offcut</span></div>
      </div>
      <details class="sy-settings"><summary>Change stock, blank, kerf, trim and price</summary>
        <div class="sy-controls">${fields.map(([key, label, hint]) => `<label>${label}<small>${hint}</small><input data-sy-input="${key}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" maxlength="12" value="${model.defaults[key]}"></label>`).join('')}</div>
        <p>Use up to two decimal places. These bounds keep every blank drawable; they are illustrative values, not machine settings.</p>
        <div class="sy-actions"><button type="button" data-sy-reset>Reset page example</button><button type="button" data-sy-short>Try 999.99 mm stock</button></div>
      </details>
      <p class="sy-error" data-sy-error role="status" hidden></p>
      <div class="sy-account" data-sy-account hidden>
        <dl class="sy-balance"><div><dt>Acceptable blanks</dt><dd data-sy-parts></dd></div><div><dt>Separating kerf loss</dt><dd data-sy-kerf></dd></div><div><dt>Excluded trims</dt><dd data-sy-trim></dd></div><div><dt>Offcut</dt><dd data-sy-offcut></dd></div></dl>
        <p class="sy-equation" data-sy-equation></p><p data-sy-threshold></p><p data-sy-cost></p>
        <details class="sy-explanation"><summary>Read the assumptions and current dimensions</summary><p data-sy-settings></p><p>This layout does not use the far stock edge as a finished blank edge. One-dimensional placement under this cut policy is not a global maximum or a two-dimensional nest. All blanks have equal cross-section and are assumed acceptable. Utilization compares lengths at that cross-section. The whole stock price is allocated equally to the acceptable blanks with no remnant credit; processing and other costs are excluded.</p></details>
        <details class="sy-position-details"><summary>Read each blank and cut position</summary><p>Positions are measured from the purchased stock's left end. Adjacent endpoints share a boundary; each interval's length is end minus start.</p><ol class="sy-position-list" data-sy-positions></ol><p data-sy-end-positions></p></details>
      </div>`;
    root.append(live);
    root.dataset.syReady = 'true';
    const query = selector => live.querySelector(selector);
    const put = (selector, value) => { query(selector).textContent = value; };
    const field = key => query(`[data-sy-input="${key}"]`);
    const mm = render.mm, money = render.money;
    function update() {
      const error = query('[data-sy-error]'), result = query('[data-sy-result]'), account = query('[data-sy-account]');
      try {
        const input = Object.fromEntries(fields.map(([key]) => [key, field(key).value]));
        const r = model.calculate(input);
        error.hidden = true; error.textContent = '';
        result.hidden = false; account.hidden = false;
        put('[data-sy-headline]', `${r.count} acceptable blank${r.count === 1 ? '' : 's'} · ${r.cuts} separating cut${r.cuts === 1 ? '' : 's'} · ${r.utilization.toFixed(1)}% utilization`);
        put('[data-sy-settings]', `${mm(r.ticks.length)} mm stock; ${mm(r.ticks.blank)} mm blanks; ${mm(r.ticks.kerf)} mm per separating kerf; ${mm(r.ticks.left)} mm left and ${mm(r.ticks.right)} mm right excluded trim; ${money(r.ticks.price)} stock price. Cuts for trim preparation are already included in the excluded lengths, not in the separating-cut count.`);
        query('[data-sy-diagram]').innerHTML = render.diagram(r);
        put('[data-sy-parts]', `${mm(r.parts)} mm`); put('[data-sy-kerf]', `${mm(r.kerfLoss)} mm (${r.cuts} kerfs)`);
        put('[data-sy-trim]', `${mm(r.trim)} mm`); put('[data-sy-offcut]', `${mm(r.offcut)} mm`);
        put('[data-sy-equation]', `${mm(r.ticks.length)} = ${mm(r.trim)} excluded trim + ${mm(r.parts)} acceptable blanks + ${mm(r.kerfLoss)} separating kerfs + ${mm(r.offcut)} offcut (all mm).`);
        put('[data-sy-threshold]', `${r.count ? 'One more blank' : 'The first blank'} needs ${mm(r.pitch)} mm of usable interval: ${mm(r.ticks.blank)} + ${mm(r.ticks.kerf)}. The ${mm(r.offcut)} mm offcut is ${mm(r.additionalForNext)} mm short. At unchanged blank, kerf and trim sizes, ${r.count + 1} blanks need stock length of at least ${mm(r.nextStockLength)} mm${r.nextStockLength > model.limits.length[1] * 100 ? ' (beyond this lab\'s input range)' : ''}.`);
        put('[data-sy-cost]', r.count ? `Stock-only cost per acceptable blank = ${money(r.ticks.price)} ÷ ${r.count} = ${money(r.costRoundedCents)} (rounded to the nearest cent). The offcut receives no credit.` : 'No blanks fit under this cut policy. Stock cost per acceptable blank is undefined; there is no per-blank quotient. The purchased stock still has its entered price.');
        query('[data-sy-positions]').innerHTML = r.blanks.map(b => `<li>Blank ${b.number}: ${mm(b.start)}–${mm(b.end)} mm; full separating kerf ${mm(b.cutStart)}–${mm(b.cutEnd)} mm${r.ticks.kerf === 0 ? ' (zero-width ideal)' : ''}.</li>`).join('');
        put('[data-sy-end-positions]', `Left excluded trim: 0–${mm(r.ticks.left)} mm. Offcut: ${mm(r.offcutStart)}–${mm(r.ticks.length - r.ticks.right)} mm. Right excluded trim: ${mm(r.ticks.length - r.ticks.right)}–${mm(r.ticks.length)} mm.`);
      } catch (e) {
        error.textContent = e.message; error.hidden = false; result.hidden = true; account.hidden = true;
        // Clear stale data as well as hiding it, including every previously drawn blank.
        query('[data-sy-diagram]').replaceChildren(); query('[data-sy-positions]').replaceChildren();
        live.querySelectorAll('[data-sy-result] p,[data-sy-account] p,[data-sy-account] dd').forEach(node => {
          if (node.hasAttribute('data-sy-headline') || [...node.attributes].some(a => a.name.startsWith('data-sy-'))) node.textContent = '';
        });
      }
    }
    function set(values) {
      for (const [key, value] of Object.entries(values)) field(key).value = value;
      update();
    }
    live.addEventListener('input', event => {
      if (!event.target.matches('[data-sy-input]')) return;
      put('[data-sy-prediction]', `Current inputs changed. ${baseline}`);
      update();
    });
    query('[data-sy-test]').addEventListener('click', () => {
      const prediction = query('[data-sy-predict]').value;
      set({ ...model.defaults, kerf: '3' });
      put('[data-sy-prediction]', `Page example reset. ${prediction === '' ? 'Observed: 9 blanks.' : prediction === '9' ? 'Your prediction matches.' : `You predicted ${prediction}; the layout fits 9.`} Ten would need 1,010 mm, so the $48 stock charge is now shared by nine blanks.`);
    });
    query('[data-sy-reset]').addEventListener('click', () => {
      set(model.defaults); query('[data-sy-predict]').value = '';
      put('[data-sy-prediction]', `Page example restored. ${baseline}`);
    });
    query('[data-sy-short]').addEventListener('click', () => {
      set({ ...model.defaults, length: '999.99' });
      put('[data-sy-prediction]', 'The stock is just 0.01 mm shorter than the page example. Explain why the whole blank count changes.');
    });
    update();
  }
  function boot() { document.querySelectorAll('[data-interactive="stock-yield"]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
