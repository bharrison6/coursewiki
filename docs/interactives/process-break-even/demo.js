(function () {
  'use strict';
  const M = globalThis.CourseWikiProcessBreakEven;
  if (!M) return;
  const money = cents => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const average = cents => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const count = q => q.toLocaleString('en-US');
  const winner = value => value === 'tie' ? 'equal total costs' : 'Process ' + value + ' costs less';
  document.querySelectorAll('[data-interactive="process-break-even"]').forEach(function (root) {
    if (root.dataset.initialized) return;
    root.dataset.initialized = 'true';
    const ui = document.createElement('div');
    ui.className = 'pb-live';
    ui.innerHTML = `
      <p class="pb-goal"><strong>Which process costs less for the parts you need?</strong> Change a cost or quantity, predict, then compare. Assume equivalent acceptable output, the same included costs, and constant rates.</p>
      <form novalidate>
        <label class="pb-scenario">Try a case <select data-pb="scenario"><option value="">Custom costs</option></select></label>
        <div class="pb-costs">
          <fieldset><legend>Process A — solid line</legend>
            <label>Fixed batch cost ($)<input data-pb="fixedA" type="number" min="0" max="100000" step="0.01" inputmode="decimal" value="120"></label>
            <label>Variable cost ($/part)<input data-pb="variableA" type="number" min="0" max="1000" step="0.01" inputmode="decimal" value="8"></label>
          </fieldset>
          <fieldset><legend>Process B — dashed line</legend>
            <label>Fixed batch cost ($)<input data-pb="fixedB" type="number" min="0" max="100000" step="0.01" inputmode="decimal" value="720"></label>
            <label>Variable cost ($/part)<input data-pb="variableB" type="number" min="0" max="1000" step="0.01" inputmode="decimal" value="3"></label>
          </fieldset>
        </div>
        <div class="pb-demand">
          <label>Demanded acceptable parts<input data-pb="quantity" data-volume type="number" min="1" max="10000" step="1" inputmode="numeric" value="120"></label>
          <label>Move quantity (1–300 on this slider)<input data-pb="slider" type="range" min="1" max="300" step="1" value="120"></label>
        </div>
        <p class="pb-note">Illustrative bounds: fixed $0–$100,000; variable $0–$1,000/part; whole demand 1–10,000. Enter dollars to at most two decimal places.</p>
        <div class="pb-predict">
          <label>Your prediction at this quantity<select data-pb="prediction"><option value="">Choose a prediction</option><option value="A">A costs less</option><option value="B">B costs less</option><option value="tie">Equal total costs</option></select></label>
          <button type="submit" data-pb-compare>Compare costs</button>
        </div>
      </form>
      <p class="pb-feedback" data-pb-feedback role="status" aria-live="polite">Choose a prediction, then compare. Changing an input clears the previous comparison.</p>
      <div data-pb-results hidden>
        <p class="pb-verdict" data-result></p><div class="pb-totals" data-pb-totals></div>
        <p class="pb-note">Total costs are exact cents. Average unit costs are approximate, rounded to four decimal places; rounded averages do not decide a tie.</p>
        <figure class="pb-figure"><div data-pb-chart tabindex="0" role="region" aria-label="Total-cost graph, scroll horizontally if needed"></div><figcaption data-pb-caption></figcaption></figure>
        <p data-pb-crossing></p><div data-pb-neighbors></div>
      </div>
      <details class="pb-assumptions"><summary>What this comparison assumes</summary>
        <p>Both routes supply equivalent acceptable parts at the same demanded quantity in one batch. Enter costs covering the same items and period, counting each charge once. Fixed cost and variable rate stay constant within the assumed range.</p>
        <p>This compares the entered process costs. It does not establish equivalent quality, capacity or demand, recommend a purchase, or predict sales profit. Do not produce unwanted parts just to lower an average.</p>
      </details>`;
    root.prepend(ui);
    root.classList.add('pb-ready');
    const field = key => ui.querySelector('[data-pb="' + key + '"]');
    const feedback = ui.querySelector('[data-pb-feedback]'), results = ui.querySelector('[data-pb-results]');
    const keys = ['fixedA', 'variableA', 'fixedB', 'variableB', 'quantity'];
    M.scenarios.forEach(s => { const option = document.createElement('option'); option.value = s.id; option.textContent = s.title; field('scenario').append(option); });
    field('scenario').value = 'original';
    function read() { return Object.fromEntries(keys.map(key => [key, field(key).value])); }
    function clear(message) {
      results.hidden = true;
      ui.querySelector('[data-result]').textContent = '';
      ['totals', 'chart', 'caption', 'crossing', 'neighbors'].forEach(key => { ui.querySelector('[data-pb-' + key + ']').replaceChildren(); });
      feedback.textContent = message;
    }
    function check() {
      const evaluation = M.evaluate(read());
      keys.forEach(key => { if (evaluation.errors && evaluation.errors[key]) field(key).setAttribute('aria-invalid', 'true'); else field(key).removeAttribute('aria-invalid'); });
      return evaluation;
    }
    function invalidate() {
      field('prediction').value = '';
      const checked = check();
      clear(checked.valid ? 'Inputs changed. Predict at the new quantity, then compare.' : 'No comparison. ' + Object.values(checked.errors).join(' '));
    }
    keys.forEach(key => field(key).addEventListener('input', function () {
      field('scenario').value = '';
      if (key === 'quantity') {
        const q = Number(field(key).value);
        field('slider').disabled = !Number.isInteger(q) || q < 1 || q > M.limits.chartQuantity;
        if (!field('slider').disabled) field('slider').value = String(q);
      }
      invalidate();
    }));
    field('slider').addEventListener('input', function () { field('quantity').value = this.value; field('scenario').value = ''; invalidate(); });
    field('scenario').addEventListener('change', function () {
      const scenario = M.scenarios.find(s => s.id === this.value);
      if (!scenario) return;
      keys.forEach(key => { field(key).value = scenario[key]; });
      field('slider').disabled = false;
      field('slider').value = scenario.quantity;
      invalidate();
    });
    field('prediction').addEventListener('change', function () {
      if (!results.hidden) clear('Prediction changed. Compare again to check it.');
    });
    function draw(evaluation) {
      const left = 76, top = 26, width = 488, height = 220, end = M.limits.chartQuantity;
      const endpoints = evaluation.chart, r = evaluation.result, cross = evaluation.crossing;
      const maximum = Math.max(1, endpoints[1].aCents, endpoints[1].bCents);
      const x = q => left + q / end * width, y = cents => top + height - cents / maximum * height;
      const line = key => 'M' + x(0) + ',' + y(endpoints[0][key]) + ' L' + x(end) + ',' + y(endpoints[1][key]);
      const demand = r.quantity <= end ? '<line class="pb-demand-line" x1="'+x(r.quantity)+'" y1="'+top+'" x2="'+x(r.quantity)+'" y2="'+(top+height)+'"/><circle class="pb-a-point" cx="'+x(r.quantity)+'" cy="'+y(r.aCents)+'" r="5"/><circle class="pb-b-point" cx="'+x(r.quantity)+'" cy="'+y(r.bCents)+'" r="5"/>' : '';
      // Endpoints are canonical model values. Interpolation here only maps a straight line to the screen.
      const crossY = cross.kind === 'positive' && cross.inChart ? y(endpoints[0].aCents + (endpoints[1].aCents-endpoints[0].aCents)*cross.quantity/end) : 0;
      const marker = cross.kind === 'positive' && cross.inChart ? '<path class="pb-cross-mark" d="M'+(x(cross.quantity)-5)+','+(crossY-5)+' l10,10 m-10,0 l10,-10"/>' : '';
      ui.querySelector('[data-pb-chart]').innerHTML = '<svg viewBox="0 0 600 306" role="img" aria-label="Total process costs from zero to 300 parts. A is solid; B is dashed. Exact totals and crossing are given in the text.">'+
        '<path class="pb-axis" d="M'+left+','+top+' V'+(top+height)+' H'+(left+width)+'"/>'+
        '<text x="8" y="17">Total cost ($)</text><text x="8" y="'+(top+8)+'">'+count(maximum/100)+'</text><text x="48" y="'+(top+height+5)+'">0</text>'+
        '<text x="'+left+'" y="270">0</text><text x="'+x(150)+'" y="270" text-anchor="middle">150</text><text x="'+x(300)+'" y="270" text-anchor="end">300 parts</text>'+
        '<path class="pb-line-a" d="'+line('aCents')+'"/><path class="pb-line-b" d="'+line('bCents')+'"/>'+demand+marker+
        '<text x="'+left+'" y="296">A — solid</text><text x="'+(left+185)+'" y="296">B — dashed</text></svg>';
      ui.querySelector('[data-pb-caption]').textContent = 'Total-cost graph, Q = 0–300; zero shows the fixed-cost intercept, not a unit cost. ' + (r.quantity <= end ? 'Dots mark demanded Q = ' + count(r.quantity) + '.' : 'Demanded Q = ' + count(r.quantity) + ' is outside this chart; the comparison above still uses it.') + (cross.kind === 'positive' && cross.inChart ? ' The × marks the crossing.' : '') + ' Scroll the graph horizontally if it does not fit.';
    }
    function showCrossing(evaluation) {
      const cross = evaluation.crossing, r = evaluation.result;
      let text;
      if (cross.kind === 'all') text = 'All-Q tie: fixed costs and variable rates match. The routes have equal costs at every positive quantity; the lines overlap.';
      else if (cross.kind === 'parallel') text = 'Equal variable rates: the lines are parallel. ' + winner(r.cheaper) + ' at every positive quantity because its fixed batch cost is lower. There is no crossing.';
      else if (cross.kind === 'nonpositive') text = 'No positive crossing. Equality would be at Q* = ' + cross.quantity.toLocaleString('en-US', { maximumSignificantDigits: 6 }) + ', outside positive demand. ' + winner(r.cheaper) + ' for every positive Q under these rates.';
      else {
        const rational = Math.abs(cross.numerator) + '/' + Math.abs(cross.denominator);
        text = 'Positive crossing: Q* = ' + rational + (cross.whole ? ' = ' + count(cross.quantity) : ' ≈ ' + cross.quantity.toLocaleString('en-US', { maximumSignificantDigits: 6 })) + ' parts. ';
        text += cross.whole ? 'A whole demanded quantity can tie here. ' : 'There is no whole-part tie; compare the neighboring whole quantities below. ';
        text += cross.inChart ? 'This crossing is inside the displayed 0–300 interval.' : 'This crossing is beyond the displayed 0–300 interval; an absent crossing on the graph does not mean none exists.';
        if (cross.quantity > M.limits.quantity) text += ' It is also beyond this explorer’s editable demand bound; this is a mathematical extension of the entered rates.';
      }
      ui.querySelector('[data-pb-crossing]').textContent = text;
      if (cross.neighbors.length) {
        const table = document.createElement('table');
        table.innerHTML = '<caption>Whole quantities around the crossing' + (cross.neighbors.some(n=>n.quantity>M.limits.quantity) ? ' (mathematical extension beyond the editable range)' : '') + '</caption><thead><tr><th scope="col">Parts</th><th scope="col">A total</th><th scope="col">B total</th><th scope="col">Lower cost</th></tr></thead><tbody>' + cross.neighbors.map(n=>'<tr><th scope="row">'+count(n.quantity)+'</th><td>'+money(n.aCents)+'</td><td>'+money(n.bCents)+'</td><td>'+(n.cheaper==='tie'?'Equal':n.cheaper)+'</td></tr>').join('') + '</tbody>';
        const scroll = document.createElement('div'); scroll.className = 'pb-table-scroll'; scroll.tabIndex = 0; scroll.setAttribute('role','region'); scroll.setAttribute('aria-label','Whole-quantity cost comparison, scroll horizontally if needed'); scroll.append(table);
        ui.querySelector('[data-pb-neighbors]').append(scroll);
      }
    }
    ui.querySelector('form').addEventListener('submit', function (event) {
      event.preventDefault();
      const evaluation = check();
      if (!evaluation.valid) { clear('No comparison. ' + Object.values(evaluation.errors).join(' ')); field(Object.keys(evaluation.errors)[0]).focus(); return; }
      const prediction = field('prediction').value;
      if (!prediction) { clear('Choose a prediction before comparing.'); field('prediction').focus(); return; }
      clear('');
      const r = evaluation.result, v = evaluation.values;
      feedback.textContent = (prediction === r.cheaper ? 'Prediction matches. ' : 'Prediction differs. ') + (r.cheaper === 'tie' ? 'The exact total costs are equal.' : 'Process ' + r.cheaper + ' has the lower total by ' + money(Math.abs(r.differenceCents)) + '.');
      ui.querySelector('[data-result]').textContent = 'At ' + count(r.quantity) + ' demanded parts: ' + winner(r.cheaper) + '.';
      ui.querySelector('[data-pb-totals]').innerHTML = ['A','B'].map(letter => {
        const total = r[letter.toLowerCase()+'Cents'], fixed = v['fixed'+letter], variable = v['variable'+letter];
        return '<div class="pb-total"><strong>Process '+letter+'</strong><p>'+money(fixed)+' fixed + '+money(variable)+'/part × '+count(r.quantity)+' parts = <b>'+money(total)+' total</b></p><p>Average per part ≈ <b>'+average(r['unit'+letter+'Cents'])+'</b><br>('+money(fixed)+' ÷ '+count(r.quantity)+') + '+money(variable)+'/part</p></div>';
      }).join('');
      draw(evaluation); showCrossing(evaluation); results.hidden = false;
    });
  });
})();
