/* Read-only view of the neural model used by the lesson. The renderer reads
   current weights and forward-pass activations; it never changes the model. */
(function (root) {
'use strict';

const NAVY = [10, 49, 97], GOLD = [236, 172, 0], NEGATIVE = [184, 129, 183];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function weightColor(value, scale) {
  const t = clamp(value / Math.max(Math.abs(scale) || 1, 1e-9), -1, 1);
  const c = t < 0 ? mix(NAVY, NEGATIVE, -t) : mix(NAVY, GOLD, t);
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function signed(value) {
  if (!Number.isFinite(value)) return '—';
  return (value >= 0 ? '+' : '−') + Math.abs(value).toFixed(5);
}

function snapshot(net) {
  return {
    W1: Array.from(net.W1), b1: Array.from(net.b1),
    W2: Array.from(net.W2), b2: Array.from(net.b2),
    W3: Array.from(net.W3), b3: net.b3
  };
}

function architecture(net) {
  const inputs = net.W1.length / net.H1;
  const weights = net.W1.length + net.W2.length + net.W3.length;
  const biases = net.b1.length + net.b2.length + 1;
  return { inputs, h1: net.H1, h2: net.H2, outputs: 1, weights, biases, params: weights + biases };
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function sampleIndices(size, include) {
  const s = new Set([0, Math.floor(size / 4), Math.floor(size / 2), Math.floor(3 * size / 4), size - 1]);
  if (include != null && include >= 0 && include < size) s.add(include);
  return Array.from(s).sort((a, b) => a - b);
}

function nodeY(index, size) { return 26 + (index + 1) * 174 / (size + 1); }

function diagram(net, layer, neuron, inputs) {
  const inputCount = net.W1.length / net.H1;
  const sizes = [inputCount, net.H1, net.H2, 1], xs = [34, 166, 298, 430];
  const selectedLayer = layer === 'W1' ? 1 : layer === 'W2' ? 2 : 3;
  const shown = sizes.map((n, i) => sampleIndices(n, i === selectedLayer ? neuron : null));
  let edges = '';
  const sourceLayer = selectedLayer - 1;
  const ty = nodeY(neuron, sizes[selectedLayer]);
  shown[sourceLayer].forEach(source => {
    let w;
    if (layer === 'W1') w = net.W1[source * net.H1 + neuron];
    else if (layer === 'W2') w = net.W2[source * net.H2 + neuron];
    else w = net.W3[source];
    edges += `<line x1="${xs[sourceLayer] + 7}" y1="${nodeY(source, sizes[sourceLayer])}" ` +
      `x2="${xs[selectedLayer] - 7}" y2="${ty}" style="--edge:${weightColor(w, 0.8)}"/>`;
  });
  let nodes = '';
  shown.forEach((indices, li) => indices.forEach(i => {
    const selected = li === selectedLayer && i === neuron;
    const active = li === 0 && inputs[i] && inputs[i].active;
    const activation = li === 1 ? net.a1[i] : li === 2 ? net.a2[i] : null;
    const live = activation != null && activation > 0;
    nodes += `<circle cx="${xs[li]}" cy="${nodeY(i, sizes[li])}" r="${selected ? 7 : 5}" ` +
      `class="${selected ? 'selected ' : ''}${active ? 'input-on ' : ''}${live ? 'active ' : ''}"/>`;
  }));
  return `<div class="network-diagram-note">Simplified connected overview: sampled nodes are shown; colored lines are actual incoming weights for the selected neuron. The inspector below exposes every omitted weight.</div>` +
    `<svg class="network-diagram" viewBox="0 0 464 226" role="img" aria-label="Feedforward neural network with ${inputCount} inputs, ${net.H1} and ${net.H2} hidden units, and one output; neuron ${neuron + 1} in the selected layer is highlighted">` +
    `<g class="network-edges">${edges}</g><g class="network-nodes">${nodes}</g>` +
    `<g class="network-labels"><text x="34" y="218">${inputCount} inputs</text><text x="166" y="218">${net.H1} ReLU</text>` +
    `<text x="298" y="218">${net.H2} ReLU</text><text x="430" y="218">1 output</text></g></svg>`;
}

function layerDefinition(net, layer, neuron, inputs) {
  if (layer === 'W1') {
    const inputCount = net.W1.length / net.H1;
    return {
      title: `Input → hidden 1 · neuron ${neuron + 1}`,
      count: net.H1,
      activation: net.a1[neuron],
      bias: net.b1[neuron], initialBiasKey: 'b1', initialBiasIndex: neuron,
      rows: Array.from({ length: inputCount }, (_, i) => ({
        label: inputs[i] ? inputs[i].label : `input ${i + 1}`,
        active: !!(inputs[i] && inputs[i].active),
        value: net.W1[i * net.H1 + neuron], key: 'W1', index: i * net.H1 + neuron
      }))
    };
  }
  if (layer === 'W2') {
    return {
      title: `Hidden 1 → hidden 2 · neuron ${neuron + 1}`,
      count: net.H2,
      activation: net.a2[neuron],
      bias: net.b2[neuron], initialBiasKey: 'b2', initialBiasIndex: neuron,
      rows: Array.from({ length: net.H1 }, (_, i) => ({
        label: `hidden 1 · neuron ${i + 1}`,
        active: net.a1[i] > 0,
        value: net.W2[i * net.H2 + neuron], key: 'W2', index: i * net.H2 + neuron
      }))
    };
  }
  return {
    title: 'Hidden 2 → linear output', count: 1, activation: null,
    bias: net.b3, initialBiasKey: 'b3', initialBiasIndex: null,
    rows: Array.from({ length: net.H2 }, (_, i) => ({
      label: `hidden 2 · neuron ${i + 1}`, active: net.a2[i] > 0,
      value: net.W3[i], key: 'W3', index: i
    }))
  };
}

function initialValue(initial, key, index) {
  if (!initial) return NaN;
  return index == null ? initial[key] : initial[key][index];
}

function render(container, options) {
  const net = options && options.net;
  if (!net) {
    container.innerHTML = `<div class="network-empty"><span class="panel-kicker"><span class="k-live">Live</span> the current model, read without changing it</span><h3>Current neural network</h3><p>No network yet. Choose <b>Create learning examples</b> to prepare the frozen table values and initialize real weights.</p></div>`;
    return;
  }
  const initial = options.initial || null;
  const inputs = options.inputs || [];
  const arch = architecture(net);
  const allowed = ['W1', 'W2', 'W3'];
  const layer = allowed.includes(container.dataset.layer) ? container.dataset.layer : 'W1';
  const maxNeuron = layer === 'W1' ? net.H1 : layer === 'W2' ? net.H2 : 1;
  const neuron = clamp(parseInt(container.dataset.neuron || '0', 10) || 0, 0, maxNeuron - 1);
  container.dataset.layer = layer; container.dataset.neuron = String(neuron);
  const def = layerDefinition(net, layer, neuron, inputs);
  const all = def.rows.map(r => Math.abs(r.value)).concat(Math.abs(def.bias));
  const scale = Math.max.apply(null, all.concat(1e-9));
  const raw = net.b3 + Array.from(net.a2).reduce((sum, a, i) => sum + a * net.W3[i], 0);
  const shown = clamp(raw, -1, 1);
  const h1On = Array.from(net.a1).filter(v => v > 0).length;
  const h2On = Array.from(net.a2).filter(v => v > 0).length;
  const layerOptions = [
    ['W1', `Input → hidden 1 (${arch.inputs * net.H1} weights)`],
    ['W2', `Hidden 1 → hidden 2 (${net.H1 * net.H2} weights)`],
    ['W3', `Hidden 2 → output (${net.H2} weights)`]
  ].map(([v, label]) => `<option value="${v}"${v === layer ? ' selected' : ''}>${label}</option>`).join('');
  const neuronOptions = Array.from({ length: maxNeuron }, (_, i) =>
    `<option value="${i}"${i === neuron ? ' selected' : ''}>${layer === 'W3' ? 'Output' : `Neuron ${i + 1}`}</option>`).join('');
  const rows = def.rows.map(r => {
    const before = initialValue(initial, r.key, r.index);
    const delta = Number.isFinite(before) ? r.value - before : NaN;
    return `<tr><th scope="row">${esc(r.label)}${r.active ? '<span class="active-input">active now</span>' : ''}</th>` +
      `<td><span class="weight-swatch" style="--weight:${weightColor(r.value, scale)}"></span>${signed(r.value)}</td>` +
      `<td>${signed(before)}</td><td>${signed(delta)}</td></tr>`;
  }).join('');
  const beforeBias = initialValue(initial, def.initialBiasKey, def.initialBiasIndex);
  const biasDelta = Number.isFinite(beforeBias) ? def.bias - beforeBias : NaN;

  container.innerHTML = `<div class="network-view-head"><div><span class="panel-kicker"><span class="k-live">Live</span> the actual model, read without changing it</span>` +
    `<h3>Current neural network</h3></div><span class="parameter-count">${arch.params.toLocaleString('en-US')} parameters</span></div>` +
    `<p class="network-context">These activations describe <b>${esc(options.boardLabel || 'the current board')}</b>. ` +
    `They are an internal calculation for that board, not the score of a candidate move. Use Show move scores to compare candidate afterstates.</p>` +
    `<div class="network-layers"><div><b>${arch.inputs}</b><span>inputs</span><small>27 cell states + 2 turn</small></div>` +
    `<i>${arch.inputs * net.H1} weights →</i><div><b>${net.H1}</b><span>hidden 1</span><small>${h1On} ReLU units active</small></div>` +
    `<i>${net.H1 * net.H2} weights →</i><div><b>${net.H2}</b><span>hidden 2</span><small>${h2On} ReLU units active</small></div>` +
    `<i>${net.H2} weights →</i><div><b>1</b><span>linear output</span><small>raw ${signed(raw)} · shown ${signed(shown)}</small></div></div>` +
    diagram(net, layer, neuron, inputs) +
    `<div class="weight-legend"><span>negative weight</span><i></i><span>near zero</span><i></i><span>positive weight</span></div>` +
    `<p class="weight-caution">Weights are connection strengths; activations are the signals produced for this board. A positive weight is not automatically a good move.</p>` +
    `<div class="network-inspector-controls"><label>Connection layer<select id="network-layer">${layerOptions}</select></label>` +
    `<label>Destination neuron<select id="network-neuron">${neuronOptions}</select></label></div>` +
    `<div class="selected-neuron"><b>${esc(def.title)}</b>` +
    (def.activation == null ? '' : `<span>current activation ${signed(def.activation)}</span>`) + `</div>` +
    `<div class="weight-table-wrap" tabindex="0" role="region" aria-label="All incoming weights for ${esc(def.title)}">` +
    `<table class="weight-table"><thead><tr><th>Source</th><th>Current weight</th><th>Initialized</th><th>Change</th></tr></thead>` +
    `<tbody>${rows}<tr class="bias-row"><th scope="row">bias</th><td>${signed(def.bias)}</td><td>${signed(beforeBias)}</td><td>${signed(biasDelta)}</td></tr></tbody></table></div>`;

  container.querySelector('#network-layer').addEventListener('change', e => {
    container.dataset.layer = e.target.value; container.dataset.neuron = '0';
    render(container, options); container.querySelector('#network-layer').focus();
  });
  container.querySelector('#network-neuron').addEventListener('change', e => {
    container.dataset.neuron = e.target.value;
    render(container, options); container.querySelector('#network-neuron').focus();
  });
}

const api = { weightColor, signed, snapshot, architecture, inspectLayer: layerDefinition, render };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.NETWORK_VIEW = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
