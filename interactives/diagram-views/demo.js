(function () {
  'use strict';
  const model = window.CourseWikiDiagramViews;
  document.querySelectorAll('[data-interactive="diagram-views"]').forEach(root => {
    if (root.dataset.diagramReady) return;
    root.dataset.diagramReady = 'true';
    let state = model.initial();
    const controls = root.querySelector('.dv-controls');
    const status = root.querySelector('.dv-status');
    function render() {
      root.querySelectorAll('[data-view]').forEach(figure => {
        figure.hidden = state.view === 'comparison' ? figure.dataset.view === 'block' : figure.dataset.view !== state.view;
      });
      root.querySelectorAll('[data-component]').forEach(part => {
        part.querySelector('.dv-highlight').setAttribute('visibility', part.dataset.component === state.component ? 'visible' : 'hidden');
      });
      controls.querySelectorAll('button').forEach(button => {
        button.setAttribute('aria-pressed', String(state[button.dataset.field] === button.dataset.value));
      });
      status.textContent = model.descriptions[state.component];
    }
    function choose(field, value) { state = model.select(state, field, value); render(); }
    for (const [field, values, host] of [['view', model.views, '.dv-views'], ['component', model.components, '.dv-parts']]) {
      values.forEach(value => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.field = field;
        button.dataset.value = value;
        button.textContent = value === 'led' ? 'LED' : value[0].toUpperCase() + value.slice(1);
        button.addEventListener('click', () => choose(field, value));
        root.querySelector(host).appendChild(button);
      });
    }
    root.querySelectorAll('[data-component]').forEach(part => {
      part.addEventListener('click', () => choose('component', part.dataset.component));
    });
    controls.hidden = false;
    render();
  });
})();
