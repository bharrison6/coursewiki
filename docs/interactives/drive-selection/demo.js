(function () {
  'use strict';
  const model = window.CourseWikiDriveSelection;
  if (!model) return;
  const labels = {
    distance: { title: 'Shaft center distance', close: 'Close shafts', separated: 'Separated shafts' },
    timing: { title: 'Timing requirement', flexible: 'Small speed variation is acceptable', exact: 'Shafts must stay synchronized' },
    speed: { title: 'Operating speed', low: 'Low', moderate: 'Moderate', high: 'High' },
    environment: { title: 'Environment', sheltered: 'Sheltered, with lubrication available', clean: 'Clean / lubricant-sensitive', abrasive: 'Abrasive dust', washdown: 'Wet / washdown', hot: 'Elevated temperature' }
  };
  function make(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function init(root) {
    if (root.dataset.dsReady) return;
    const live = root.querySelector('.ds-live');
    if (!live) return;
    const controls = make('div', '', 'ds-controls');
    const selects = {};
    Object.keys(labels).forEach(key => {
      const label = make('label', labels[key].title);
      const select = make('select');
      select.dataset.dsField = key;
      model.options[key].forEach(value => {
        const option = make('option', labels[key][value]);
        option.value = value;
        select.append(option);
      });
      select.value = model.defaults[key];
      label.append(select);
      controls.append(label);
      selects[key] = select;
    });
    const reset = make('button', 'Reset example');
    reset.type = 'button';
    const summary = make('p', '', 'ds-selection');
    const announce = make('p', '', 'ds-announcement');
    announce.setAttribute('role', 'status');
    announce.setAttribute('aria-live', 'polite');
    const results = make('div', '', 'ds-results');
    const prompt = make('p', 'Predict first: what changes if synchronization is no longer required?', 'ds-prompt');
    live.append(prompt, controls, reset, summary, announce, results);
    function update() {
      const input = {};
      Object.keys(selects).forEach(key => { input[key] = selects[key].value; });
      const result = model.evaluate(input);
      summary.textContent = 'Your case: ' + Object.keys(input).map(key => labels[key][input[key]]).join(' · ') + '.';
      results.replaceChildren();
      result.drives.forEach(d => {
        const card = make('div', '', 'ds-result');
        card.dataset.fit = d.fit;
        card.append(make('h3', d.name), make('p', d.status, 'ds-status'));
        const list = make('ul');
        d.blockers.concat(d.reasons, d.cautions).forEach(reason => list.append(make('li', reason)));
        card.append(list);
        results.append(card);
      });
      const count = result.drives.filter(d => d.fit !== 'excluded').length;
      announce.textContent = count + ' families remain for sizing and review. Read each reason below.';
    }
    controls.addEventListener('change', update);
    reset.addEventListener('click', () => {
      Object.keys(selects).forEach(key => { selects[key].value = model.defaults[key]; });
      update();
    });
    update();
    root.dataset.dsReady = 'true';
    live.hidden = false;
  }
  function start() { document.querySelectorAll('[data-interactive="drive-selection"]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}());
