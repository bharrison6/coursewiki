/* ============================================================================
   feeds-and-speeds / demo.js - runs the calculator and draws what it removes.

   The render functions are pure (numbers in, markup out) and exported for
   Node. The printed figures in the page source are their output, so the
   paper copy and the live demo are the same drawing.

   Three sources, kept apart on screen:
     - what the student entered (the form),
     - generic guidance for the chosen material (cutting-data.js, read-only),
     - what follows from the entries (results, arithmetic, drawings).
   Nothing is filled in until the student types it or asks for the guide's
   middle values. The removed-solid drawing and the power band come from the
   shared material-removal module (CourseWikiRemoval).

   The live calculator is built here rather than authored in the page, so
   the page source, search index and printed aggregate carry the teaching
   text and static figures - never a form that does nothing.
   ==========================================================================*/
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var model = node ? require('./model.js') : root.CourseWikiFeedsSpeeds;
  var data = null, removal = null;
  if (node) {
    try { data = require('./cutting-data.js'); } catch (e) { data = null; }
    try { removal = require('../material-removal/removal.js'); } catch (e) { removal = null; }
  }
  var api = factory(model,
    function () { return data || root.CourseWikiCuttingData || null; },
    function () { return removal || root.CourseWikiRemoval || null; });
  if (node) module.exports = api;
  else api.boot();
})(typeof self !== 'undefined' ? self : this, function (M, findData, findRemoval) {
  'use strict';

  var DEFAULT_MATERIAL = 'al-6061-t6';

  function n(v) { return (Math.round(v * 10) / 10).toString(); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function txt(cls, x, y, s, anchor) {
    return '<text class="' + cls + '" x="' + n(x) + '" y="' + n(y) + '"' +
      (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(s) + '</text>';
  }

  /* One turn of the cutter, unrolled: the cutting edge travels pi x D. */
  function renderCircumference(diameterText, circumferenceText) {
    var out = [], cx = 92, cy = 92, R = 58, x1 = cx + Math.PI * 2 * R;
    out.push('<svg class="fs-circ-svg" viewBox="0 0 560 196" role="img" aria-label="' +
      esc('A cutter of diameter ' + diameterText + '. In one turn a point on its cutting edge travels the circumference, pi times the diameter: ' +
        circumferenceText + '.') + '" focusable="false">');
    out.push('<circle class="fs-circ" cx="' + cx + '" cy="' + cy + '" r="' + R + '"/>');
    out.push('<path class="fs-dim" d="M' + (cx - R) + ' ' + cy + 'L' + (cx + R) + ' ' + cy + '"/>');
    out.push(txt('fs-t fs-t-small', cx, cy - 8, 'D = ' + diameterText, 'middle'));
    out.push('<circle class="fs-dot" cx="' + cx + '" cy="' + (cy + R) + '" r="6"/>');
    out.push('<path class="fs-unroll" d="M' + cx + ' ' + (cy + R) + 'L' + n(x1) + ' ' + (cy + R) + '"/>');
    out.push('<path class="fs-dim" d="M' + cx + ' ' + (cy + R + 14) + 'L' + n(x1) + ' ' + (cy + R + 14) +
      'M' + cx + ' ' + (cy + R + 7) + 'L' + cx + ' ' + (cy + R + 21) + 'M' + n(x1) + ' ' + (cy + R + 7) + 'L' + n(x1) + ' ' + (cy + R + 21) + '"/>');
    out.push('<circle class="fs-dot" cx="' + n(x1) + '" cy="' + (cy + R) + '" r="6"/>');
    out.push(txt('fs-t fs-t-small', (cx + x1) / 2, cy + R + 34, 'one turn = π × D = ' + circumferenceText, 'middle'));
    out.push(txt('fs-t fs-t-small fs-t-soft', cx + R + 24, cy - 22, 'In one rotation about its center, a point', 'start'));
    out.push(txt('fs-t fs-t-small fs-t-soft', cx + R + 24, cy - 2, 'on its edge travels its circumference.', 'start'));
    out.push('</svg>');
    return out.join('');
  }

  /* ---- guidance -------------------------------------------------------------
     The guide's middle values, for a material and an optional diameter.
     Feed per tooth is null outside the guide's diameter table.            */
  function guideMiddle(materialId, diameterMm) {
    var D = findData(), g = D && D.guidance(materialId, diameterMm);
    if (!g) return null;
    return {
      speed: (g.vcMMin[0] + g.vcMMin[1]) / 2,
      chip: g.fzMm ? (g.fzMm[0] + g.fzMm[1]) / 2 : null
    };
  }

  /* ---- the arithmetic, written out with the numbers in it ------------------
     `values` are canonical and may be partial; each line appears once its
     inputs are valid. `energy` is a J/mm3 band or null; `eta` a percent.
     Returns plain-text lines; the demo and the tests share them.          */
  function workedLines(values, unit, energy) {
    var R = findRemoval(), p = M.partial(values), u = M.UNITS[unit], lines = [];
    if (p.rpm === undefined) return lines;
    var D = M.format(M.fromCanon(unit, 'diameter', values.diameter), 'diameter', unit);
    var V = M.format(M.fromCanon(unit, 'speed', values.speed), 'speed', unit);
    var rpmReq = M.format(p.requestedRpm, 'rpm', unit), rpm = M.format(p.rpm, 'rpm', unit);
    lines.push(unit === 'in'
      ? 'Spindle speed = 12 × cutting speed ÷ (π × diameter) = 12 × ' + V + ' ÷ (π × ' + D + ') ≈ ' + rpmReq + ' rev/min'
      : 'Spindle speed = 1000 × cutting speed ÷ (π × diameter) = 1000 × ' + V + ' ÷ (π × ' + D + ') ≈ ' + rpmReq + ' rev/min');
    if (p.capped) lines.push('The machine tops out at ' + rpm + ' rev/min, so that is the speed it runs. Everything below uses ' + rpm + '.');
    if (p.feed !== undefined) {
      var fz = M.format(M.fromCanon(unit, 'chip', values.chip), 'chip', unit);
      lines.push('Table feed = spindle speed × flutes × feed per tooth = ' + rpm + ' × ' + values.teeth + ' × ' + fz +
        ' ≈ ' + M.show(p.feed, 'feed', unit));
    }
    if (p.capped) {
      var back = unit === 'in' ? 'π × ' + D + ' × ' + rpm + ' ÷ 12' : 'π × ' + D + ' × ' + rpm + ' ÷ 1000';
      lines.push('Cutting speed actually reached = ' + back + ' ≈ ' + M.show(p.speed, 'speed', unit) +
        ', not the ' + V + ' ' + u.speedShort + ' asked for.');
    }
    if (p.feed === undefined || !R || !(values.width > 0) || !(values.depth > 0)) return lines;
    var q = R.removalRate(values.width, values.depth, p.feed);
    lines.push('Removal rate = width × depth × table feed = ' + M.show(values.width, 'width', unit) + ' × ' +
      M.show(values.depth, 'depth', unit) + ' × ' + M.show(p.feed, 'feed', unit) + ' ≈ ' + R.showRate(q, unit));
    if (!energy) return lines;
    var b = R.powerBand(q, energy);
    lines.push('Cutting power ≈ removal rate × cutting energy = ' + R.showRate(q, unit) + ' × ' +
      R.showEnergy(energy, unit).replace(/ \(.*\)$/, '') + ' ≈ ' + (unit === 'in'
        ? R.showHp(b[0], b[1]) + ' (' + R.showPower(b[0], b[1]) + ')'
        : R.showPowerBoth(b[0], b[1])));
    if (values.eta > 0) {
      var e = values.eta / 100;
      lines.push('Motor shaft power ≈ cutting power ÷ drivetrain efficiency = ' + R.showPower(b[0], b[1]) + ' ÷ ' +
        String(Math.round(e * 1000) / 1000) + ' ≈ ' + R.showPowerBoth(b[0] / e, b[1] / e));
    }
    return lines;
  }

  /* Screen-reader and readout text for a trial against its setup. */
  function describeTrial(t, unit) {
    var held = t.hold === 'chip' ? 'chip load held' : 'table feed held';
    var parts = ['Spindle ' + M.show(t.rpm, 'rpm', unit) + (t.capped ? ' (machine top speed)' : ''), held,
      'table feed ' + M.show(t.feed, 'feed', unit) + ' (' + M.ratioText(t.change.feed) + ')',
      'chip load ' + M.show(t.chip, 'chip', unit) + ' (' + M.ratioText(t.change.chip) + ')',
      'cutting speed ' + M.show(t.speed, 'speed', unit) + ' (' + M.ratioText(t.change.speed) + ')'];
    return parts.join(', ') + '.';
  }

  /* ---- the removed-solid comparison ------------------------------------------
     `rows` - [{ title, sub, run: {feed, width, depth, diameter} }]
     One frame for every row, built from `frameRuns` (all the feeds this
     comparison can reach), so a row's prism keeps its scale while the
     experiment moves.                                                     */
  function renderSweeps(rows, elapsed, f, unit, energy) {
    var R = findRemoval();
    return rows.map(function (row) {
      var r = row.run, L = R.travel(r.feed, elapsed), q = R.removalRate(r.width, r.depth, r.feed);
      var out = '<div class="fs-sweep" data-run="' + esc(row.id || '') + '">';
      out += '<p class="fs-sweep-head"><span class="fs-sweep-title">' + esc(row.title) + '</span>' +
        (row.sub ? '<span class="fs-sweep-sub">' + esc(row.sub) + '</span>' : '') + '</p>';
      out += R.renderSweep(r, elapsed, f, { unit: unit });
      out += '<p class="fs-sweep-read"><span>In ' + esc(R.showSeconds(elapsed)) + ': travel <strong>' + esc(R.showLength(L, unit)) +
        '</strong>, removed <strong>' + esc(R.showVolume(R.volume(r.width, r.depth, L), unit)) + '</strong></span>' +
        '<span>Removal rate <strong>' + esc(R.showRate(q, unit)) + '</strong>' +
        (energy ? ' · power ≈ <strong>' + esc(unit === 'in' ? R.showHp.apply(null, R.powerBand(q, energy)) : R.showPower.apply(null, R.powerBand(q, energy))) + '</strong>' : '') +
        '</span></p></div>';
      return out;
    }).join('');
  }

  /* The paper figure: one setup and two ways of doubling its spindle speed,
     over the same stretch of time and at one scale, then the setup's
     removal rate priced in every material. Exported for the page.        */
  function renderStaticFigure(values, unit, materialId) {
    var R = findRemoval(), DATA = findData();
    var base = M.solve(values), held = M.trial(values, 2, 'feed'), chip = M.trial(values, 2, 'chip');
    var run = function (feed) { return { feed: feed, width: values.width, depth: values.depth, diameter: values.diameter }; };
    var rows = [
      { id: 'setup', title: 'Setup', sub: M.show(base.rpm, 'rpm', unit) + ' · ' + M.show(base.feed, 'feed', unit), run: run(base.feed) },
      { id: 'feed', title: 'Spindle ×2, table feed held', sub: M.show(held.rpm, 'rpm', unit) + ' · ' + M.show(held.feed, 'feed', unit), run: run(held.feed) },
      { id: 'chip', title: 'Spindle ×2, chip load held', sub: M.show(chip.rpm, 'rpm', unit) + ' · ' + M.show(chip.feed, 'feed', unit), run: run(chip.feed) }
    ];
    var win = R.autoWindow(base.feed, values.diameter);
    var f = R.frame(rows.map(function (r) { return r.run; }), win, false);
    var g = DATA.get(materialId);
    var q = R.removalRate(values.width, values.depth, base.feed);
    return '<div class="fs-sweeps">' + renderSweeps(rows, win, f, unit, g.energyJMm3) + '</div>' +
      R.renderPowerChart(q, DATA.materials, { unit: unit, current: materialId });
  }

  /* ========================================================================
     Live demo
     ======================================================================*/
  var NAV_KEYS = { ' ': 1, 'Spacebar': 1, 'ArrowLeft': 1, 'ArrowRight': 1, 'ArrowUp': 1, 'ArrowDown': 1,
    'PageUp': 1, 'PageDown': 1, 'Home': 1, 'End': 1 };
  var PLAY_SECONDS = 4;
  var FIELD_GROUPS = [
    { title: 'Cutter and machine', fields: [
      { key: 'diameter', label: 'Cutter diameter' },
      { key: 'teeth', label: 'Flutes' },
      { key: 'maxRpm', label: 'Machine top speed', optional: 'no limit' }] },
    { title: 'Cutting data', fields: [
      { key: 'speed', label: 'Cutting speed' },
      { key: 'chip', label: 'Feed per tooth (chip load)' }] },
    { title: 'The cut', fields: [
      { key: 'width', label: 'Width of cut' },
      { key: 'depth', label: 'Depth of cut' },
      { key: 'eta', label: 'Drivetrain efficiency', optional: 'not applied' }] }
  ];

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function listWords(keys) {
    var w = keys.map(function (k) { return M.FIELD_NAMES[k].toLowerCase(); });
    return w.length < 2 ? w.join('') : w.slice(0, -1).join(', ') + ' and ' + w[w.length - 1];
  }

  function wire(rootEl) {
    if (rootEl.hasAttribute('data-fs-wired')) return;
    var DATA = findData(), R = findRemoval();
    if (!DATA || !R) return;                       // the page's static figure stays
    rootEl.setAttribute('data-fs-wired', '');
    var host = rootEl.querySelector('[data-fs-live]') || rootEl;
    var uid = 'fs' + Math.random().toString(36).slice(2, 8);
    var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

    var state = {
      unit: 'in', material: DATA.get(DEFAULT_MATERIAL) ? DEFAULT_MATERIAL : DATA.materials[0].id,
      exact: {}, factor: 1, hold: 'feed', frac: 1, windowChoice: 'auto', playing: false, read: null
    };

    // Keep the page's own arrow-key and Space navigation off our controls.
    rootEl.addEventListener('keydown', function (e) {
      if (!NAV_KEYS[e.key]) return;
      var t = e.target;
      if (t && t !== rootEl && t.matches && t.matches('button, input, select, textarea, summary, [tabindex]')) e.stopPropagation();
    });

    // ---- top bar: material and units
    var bar = el('div', { class: 'fs-bar' });
    var matP = el('p', { class: 'fs-material' });
    var matLab = el('label', { for: uid + '-material' }, 'Material');
    var matSel = el('select', { id: uid + '-material' });
    DATA.materials.forEach(function (m) {
      var op = el('option', { value: m.id }, m.label);
      if (m.id === state.material) op.selected = true;
      matSel.appendChild(op);
    });
    matP.appendChild(matLab); matP.appendChild(matSel);
    var units = el('fieldset', { class: 'fs-units' });
    units.appendChild(el('legend', {}, 'Units'));
    var unitRadios = {};
    [['in', 'inch'], ['mm', 'metric']].forEach(function (u) {
      var lab = el('label');
      var r = el('input', { type: 'radio', name: uid + '-unit', value: u[0] });
      if (u[0] === state.unit) r.checked = true;
      lab.appendChild(r); lab.appendChild(document.createTextNode(' ' + u[1]));
      units.appendChild(lab); unitRadios[u[0]] = r;
    });
    bar.appendChild(matP); bar.appendChild(units);

    // ---- the guide card: read-only ranges for the chosen material
    var guide = el('section', { class: 'fs-guide', 'aria-labelledby': uid + '-guide-title' });
    var gTitle = el('p', { class: 'fs-guide-title', id: uid + '-guide-title' });
    var gCond = el('p', { class: 'fs-guide-cond' });
    var gList = el('dl', { class: 'fs-guide-list' });
    var gRows = {};
    [['speed', 'Cutting speed'], ['chip', 'Feed per tooth'], ['energy', 'Cutting energy']].forEach(function (r) {
      var d = el('div', { 'data-guide': r[0] });
      d.appendChild(el('dt', {}, r[1]));
      var dd = el('dd');
      var band = el('span', { class: 'fs-guide-band' }), pos = el('span', { class: 'fs-guide-pos' });
      dd.appendChild(band); dd.appendChild(pos);
      d.appendChild(dd); gList.appendChild(d);
      gRows[r[0]] = { band: band, pos: pos };
    });
    var gApplyP = el('p', { class: 'fs-guide-apply' });
    var gApply = el('button', { type: 'button' }, 'Use the middle of these ranges');
    var gApplyNote = el('span', { class: 'fs-guide-note' }, 'Fills cutting speed and feed per tooth only. Your cutter, flutes and cut stay as entered.');
    gApplyP.appendChild(gApply); gApplyP.appendChild(gApplyNote);
    var gMore = el('details', { class: 'fs-guide-more' });
    gMore.appendChild(el('summary', {}, 'What these ranges assume, and where they come from'));
    var gNotes = el('ul'), gSources = el('p', { class: 'fs-guide-sources' });
    gMore.appendChild(gNotes); gMore.appendChild(gSources);
    [gTitle, gCond, gList, gApplyP, gMore].forEach(function (x) { guide.appendChild(x); });

    // ---- the form, in three groups, every field empty
    var form = el('div', { class: 'fs-form' });
    var inputs = {}, unitTags = {};
    FIELD_GROUPS.forEach(function (g) {
      var set = el('fieldset', { class: 'fs-group' });
      set.appendChild(el('legend', {}, g.title));
      g.fields.forEach(function (f) {
        var p = el('p');
        var lab = el('label', { for: uid + '-' + f.key });
        lab.appendChild(el('span', {}, f.label + (f.optional ? ' (optional)' : '')));
        var tag = el('span', { class: 'fs-unit' });
        lab.appendChild(tag);
        var input = el('input', { id: uid + '-' + f.key, type: 'text',
          inputmode: f.key === 'teeth' || f.key === 'maxRpm' ? 'numeric' : 'decimal',
          autocomplete: 'off', spellcheck: 'false', 'data-fs-field': f.key });
        if (f.optional) input.setAttribute('placeholder', f.optional);
        p.appendChild(lab); p.appendChild(input);
        set.appendChild(p);
        inputs[f.key] = input; unitTags[f.key] = tag;
      });
      form.appendChild(set);
    });
    var errors = el('ul', { class: 'fs-errors', 'aria-live': 'polite' });

    // ---- results: each tile says what it is waiting for until it can answer
    var results = el('div', { class: 'fs-results' });
    var tiles = {};
    [['rpm', 'Spindle speed', 'set this on the machine'], ['feed', 'Table feed', 'set this on the machine'],
      ['speed', 'Cutting speed reached', 'how fast the edge moves through the work'],
      ['rate', 'Removal rate', 'solid metal removed each minute'],
      ['power', 'Estimated cutting power', 'at the cutting edge, from the material’s energy band'],
      ['shaft', 'Motor shaft power', 'cutting power ÷ drivetrain efficiency']].forEach(function (t) {
      var box = el('div', { class: 'fs-result', 'data-kind': t[0] });
      box.appendChild(el('span', { class: 'fs-k' }, t[1]));
      var v = el('span', { class: 'fs-v' });
      var s = el('span', { class: 'fs-s' }, t[2]);
      box.appendChild(v); box.appendChild(s);
      results.appendChild(box);
      tiles[t[0]] = { box: box, v: v, s: s, note: t[2] };
    });
    var capNote = el('p', { class: 'fs-cap', hidden: '' });
    var work = el('div', { class: 'fs-work', 'aria-label': 'The arithmetic' });

    // ---- the experiment
    var exp = el('div', { class: 'fs-exp' });
    exp.appendChild(el('p', { class: 'fs-exp-title' }, 'What the cut removes, and what changes when only the spindle speed does'));
    var waiting = el('p', { class: 'fs-waiting' });
    var expBody = el('div', { class: 'fs-exp-body' });
    var expControls = el('div', { class: 'fs-exp-controls' });
    var sp = el('p', { class: 'fs-slider' });
    var spLab = el('label', { for: uid + '-factor' });
    spLab.appendChild(el('span', {}, 'Spindle speed'));
    var spOut = el('output', { for: uid + '-factor', class: 'fs-out' });
    spLab.appendChild(spOut);
    var spIn = el('input', { id: uid + '-factor', type: 'range', min: '25', max: '200', step: '5', value: '100' });
    sp.appendChild(spLab); sp.appendChild(spIn);
    var holdSet = el('fieldset', { class: 'fs-hold' });
    holdSet.appendChild(el('legend', {}, 'While it changes, hold'));
    var holdRadios = {};
    [['feed', 'the table feed'], ['chip', 'the chip load']].forEach(function (h) {
      var lab = el('label');
      var r = el('input', { type: 'radio', name: uid + '-hold', value: h[0] });
      if (h[0] === state.hold) r.checked = true;
      lab.appendChild(r); lab.appendChild(document.createTextNode(' ' + h[1]));
      holdSet.appendChild(lab); holdRadios[h[0]] = r;
    });
    expControls.appendChild(sp); expControls.appendChild(holdSet);
    var table = el('table', { class: 'fs-table' });
    var thead = el('thead'), hr = el('tr');
    ['', 'Setup', 'Changed', 'Change'].forEach(function (h, i) { hr.appendChild(el('th', i ? { scope: 'col' } : {}, h)); });
    thead.appendChild(hr); table.appendChild(thead);
    var tbody = el('tbody'), rows = {};
    [['rpm', 'Spindle speed'], ['feed', 'Table feed'], ['chip', 'Chip load'], ['speed', 'Cutting speed'],
      ['rate', 'Removal rate'], ['power', 'Estimated power']].forEach(function (r) {
      var tr = el('tr', { 'data-row': r[0] });
      tr.appendChild(el('th', { scope: 'row' }, r[1]));
      var a = el('td'), b = el('td'), c = el('td');
      tr.appendChild(a); tr.appendChild(b); tr.appendChild(c);
      tbody.appendChild(tr); rows[r[0]] = { tr: tr, a: a, b: b, c: c };
    });
    table.appendChild(tbody);

    var transport = el('div', { class: 'fs-transport', role: 'group', 'aria-label': 'Time shown' });
    var bPlay = el('button', { type: 'button', class: 'fs-play', 'aria-pressed': 'false' }, 'Play');
    var bReset = el('button', { type: 'button' }, 'Reset');
    var tP = el('p', { class: 'fs-slider fs-time' });
    var tLab = el('label', { for: uid + '-time' });
    tLab.appendChild(el('span', {}, 'Time shown'));
    var tOut = el('output', { for: uid + '-time', class: 'fs-out' });
    tLab.appendChild(tOut);
    var tIn = el('input', { id: uid + '-time', type: 'range', min: '0', max: '100', step: '1', value: '100' });
    tP.appendChild(tLab); tP.appendChild(tIn);
    var winLab = el('label', { class: 'fs-window', for: uid + '-window' });
    winLab.appendChild(el('span', {}, 'Time span'));
    var winSel = el('select', { id: uid + '-window' });
    winLab.appendChild(winSel);
    transport.appendChild(bPlay); transport.appendChild(bReset); transport.appendChild(tP); transport.appendChild(winLab);

    var stage = el('div', { class: 'fs-stage', tabindex: '0', role: 'group',
      'aria-label': 'Removed-solid drawings. Space plays or pauses, left and right arrows change the spindle speed, Home resets the experiment.',
      'aria-describedby': uid + '-status' });
    var scaleNote = el('p', { class: 'fs-scale-note' });
    var keys = el('p', { class: 'fs-keys' }, 'With the drawings selected: Space plays or pauses, ← → change the spindle speed, Home resets the experiment.');
    var chartWrap = el('div', { class: 'fs-chart' });
    var chartTitle = el('p', { class: 'fs-exp-title' }, 'The same cut in every material');
    var chartBody = el('div');
    var chartNote = el('p', { class: 'fs-chart-note' });
    chartWrap.appendChild(chartTitle); chartWrap.appendChild(chartBody); chartWrap.appendChild(chartNote);
    var status = el('p', { class: 'sr-only', id: uid + '-status', 'aria-live': 'polite' });

    [expControls, table, transport, stage, scaleNote, keys, chartWrap].forEach(function (x) { expBody.appendChild(x); });
    exp.appendChild(waiting); exp.appendChild(expBody);

    var calc = el('div', { class: 'fs-calc' });
    [bar, guide, form, errors, results, capNote, work].forEach(function (x) { calc.appendChild(x); });
    var demo = el('div', { class: 'fs-demo' });
    [exp, status].forEach(function (x) { demo.appendChild(x); });
    host.appendChild(calc); host.appendChild(demo);
    rootEl.classList.add('is-live');

    /* ---- reading the form ----------------------------------------------*/
    function shown(kind, canonValue) {
      if (canonValue === null || canonValue === undefined) return '';
      return M.format(M.fromCanon(state.unit, kind, canonValue), kind, state.unit);
    }
    // Put a canonical value in a field, remembering it exactly so that a
    // unit switch, or applying the guide, never re-rounds what the field holds.
    function setField(k, canonValue) {
      var t = shown(k, canonValue);
      inputs[k].value = t;
      state.exact[k] = { text: t, canon: canonValue };
    }
    function readForm() {
      var raw = {};
      M.FIELDS.forEach(function (k) { raw[k] = inputs[k].value; });
      var r = M.readFields(state.unit, raw);
      M.FIELDS.forEach(function (k) {
        var x = state.exact[k];
        if (x && r.values[k] !== undefined && r.values[k] !== null && inputs[k].value.trim() === x.text) r.values[k] = x.canon;
      });
      return r;
    }
    function material() { return DATA.guidance(state.material, state.read && state.read.values.diameter); }

    /* ---- the guide card --------------------------------------------------*/
    var WHERE = { inside: 'inside the range', below: 'below the range', above: 'above the range' };
    function renderGuide() {
      var g = material(), u = state.unit, v = state.read.values, p = M.partial(v);
      gTitle.textContent = 'Generic solid-carbide starting ranges: ' + g.label;
      gCond.textContent = g.condition;
      gRows.speed.band.textContent = M.show(g.vcMMin[0], 'speed', u).replace(/ .*$/, '') + '–' + M.show(g.vcMMin[1], 'speed', u);
      var sp = '', spPos = '';
      if (v.speed !== undefined) {
        spPos = M.bandPosition(v.speed, g.vcMMin);
        sp = 'Yours, ' + M.show(v.speed, 'speed', u) + ': ' + WHERE[spPos];
        if (p.capped) {
          spPos = M.bandPosition(p.speed, g.vcMMin);
          sp += '. The machine reaches only ' + M.show(p.speed, 'speed', u) + ': ' + WHERE[spPos];
        }
      }
      gRows.speed.pos.textContent = sp; gRows.speed.pos.setAttribute('data-pos', spPos);
      if (v.diameter === undefined) {
        gRows.chip.band.textContent = 'depends on the cutter diameter';
        gRows.chip.pos.textContent = 'Enter a diameter to see the range for that cutter.';
        gRows.chip.pos.setAttribute('data-pos', '');
      } else if (!g.fzMm) {
        gRows.chip.band.textContent = 'no range for this diameter';
        gRows.chip.pos.textContent = 'The guide’s table covers ' + M.show(g.diameterMinMm, 'diameter', u) + ' to ' +
          M.show(g.diameterMaxMm, 'diameter', u) + ' cutters and is not stretched beyond them.';
        gRows.chip.pos.setAttribute('data-pos', '');
      } else {
        gRows.chip.band.textContent = M.show(g.fzMm[0], 'chip', u).replace(/ .*$/, '') + '–' + M.show(g.fzMm[1], 'chip', u) +
          ' for a ' + M.show(v.diameter, 'diameter', u) + ' cutter';
        var c = v.chip !== undefined ? M.bandPosition(v.chip, g.fzMm) : null;
        gRows.chip.pos.textContent = c ? 'Yours, ' + M.show(v.chip, 'chip', u) + ': ' + WHERE[c] : '';
        gRows.chip.pos.setAttribute('data-pos', c || '');
      }
      gRows.energy.band.textContent = R.showEnergy(g.energyJMm3, u);
      gRows.energy.pos.textContent = 'Used for the power estimate. Changing the material changes nothing else.';
      gRows.energy.pos.setAttribute('data-pos', '');
      gNotes.textContent = '';
      g.notes.forEach(function (t) { gNotes.appendChild(el('li', {}, t)); });
      gSources.textContent = 'Sources: ';
      g.sources.forEach(function (s, i) {
        if (i) gSources.appendChild(document.createTextNode('; '));
        gSources.appendChild(el('a', { href: s.url }, s.title));
      });
      gSources.appendChild(document.createTextNode('.'));
    }

    /* ---- results ---------------------------------------------------------*/
    function waitText(keys) { return keys.length ? 'Needs ' + listWords(keys) + '.' : ''; }
    function setTile(k, value, sub) {
      tiles[k].v.textContent = value === null ? '—' : value;
      tiles[k].s.textContent = value === null ? sub : (sub || tiles[k].note);
      tiles[k].box.setAttribute('data-empty', String(value === null));
    }
    function update(announce) {
      var r = state.read = readForm(), v = r.values, u = state.unit, g = material();
      M.FIELDS.forEach(function (k) { inputs[k].removeAttribute('aria-invalid'); unitTags[k].textContent = M.unitLabel(k, u); });
      errors.textContent = '';
      r.errors.forEach(function (e) {
        inputs[e.field].setAttribute('aria-invalid', 'true');
        errors.appendChild(el('li', {}, e.message));
      });
      renderGuide();
      var p = M.partial(v);
      setTile('rpm', p.rpm === undefined ? null : M.show(p.rpm, 'rpm', u),
        p.rpm === undefined ? waitText(p.needs.rpm) : (p.capped ? 'machine top speed; ' + M.show(p.requestedRpm, 'rpm', u) + ' was asked for' : null));
      setTile('feed', p.feed === undefined ? null : M.show(p.feed, 'feed', u), p.feed === undefined ? waitText(p.needs.feed) : null);
      setTile('speed', p.speed === undefined ? null : M.show(p.speed, 'speed', u),
        p.speed === undefined ? waitText(p.needs.rpm) : (p.capped ? 'below the ' + M.show(v.speed, 'speed', u) + ' asked for' : null));
      tiles.rpm.box.setAttribute('data-capped', String(!!p.capped));
      tiles.speed.box.setAttribute('data-capped', String(!!p.capped));
      var q = p.needs.rate.length ? null : R.removalRate(v.width, v.depth, p.feed);
      setTile('rate', q === null ? null : R.showRate(q, u), q === null ? waitText(p.needs.rate) : null);
      var band = q === null ? null : R.powerBand(q, g.energyJMm3);
      setTile('power', band ? (u === 'in' ? R.showHp(band[0], band[1]) : R.showPower(band[0], band[1])) : null,
        band ? (u === 'in' ? R.showPower(band[0], band[1]) : R.showHp(band[0], band[1])) + ' for ' + g.label : waitText(p.needs.rate));
      var eta = v.eta;
      tiles.shaft.box.hidden = !(eta > 0);
      if (eta > 0) {
        setTile('shaft', band ? (u === 'in' ? R.showHp(band[0] / (eta / 100), band[1] / (eta / 100)) : R.showPower(band[0] / (eta / 100), band[1] / (eta / 100))) : null,
          band ? 'at ' + M.show(eta, 'eta', u) + ' efficiency; not wall power, not a check of the motor' : waitText(p.needs.rate));
      }
      capNote.hidden = !p.capped;
      capNote.textContent = p.capped
        ? 'The cutting speed asks for ' + M.show(p.requestedRpm, 'rpm', u) + ', but this machine stops at ' + M.show(p.rpm, 'rpm', u) +
          '. The feed is worked out from the speed the spindle really turns, so each tooth still takes the chip you asked for; the edge simply moves more slowly than the cutting speed you entered.'
        : '';
      work.textContent = '';
      var lines = workedLines(v, u, g.energyJMm3);
      lines.forEach(function (line) { work.appendChild(el('span', { class: 'fs-line' }, line)); });
      work.hidden = !lines.length;
      rootEl.setAttribute('data-ready', String(q !== null));
      updateExperiment(announce);
    }

    /* ---- the experiment ----------------------------------------------------*/
    function setupRun() {
      var v = state.read.values, s = M.solve(v);
      return { s: s, run: { feed: s.feed, width: v.width, depth: v.depth, diameter: v.diameter } };
    }
    function windowSeconds(feed, d) { return state.windowChoice === 'auto' ? R.autoWindow(feed, d) : Number(state.windowChoice); }
    function fillWindows(feed, d) {
      var auto = R.autoWindow(feed, d), want = state.windowChoice;
      winSel.textContent = '';
      var op = el('option', { value: 'auto' }, 'auto (' + R.showSeconds(auto) + ')');
      winSel.appendChild(op);
      R.WINDOWS.forEach(function (w) { winSel.appendChild(el('option', { value: String(w) }, R.showSeconds(w))); });
      winSel.value = want;
    }
    function updateExperiment(announce) {
      var v = state.read.values, p = M.partial(v);
      var ready = !p.needs.rate.length;
      waiting.hidden = ready; expBody.hidden = !ready;
      if (!ready) {
        play(false);
        waiting.textContent = 'The removed-solid drawing and power comparison appear once the setup is complete. Still needed: ' + listWords(p.needs.rate) + '.';
        return;
      }
      var u = state.unit, g = material(), S = setupRun(), t = M.trial(v, state.factor, state.hold);
      fillWindows(S.s.feed, v.diameter);
      spOut.textContent = 'requested ' + M.ratioText(state.factor).replace('unchanged', 'as set') + ' · ' + M.show(t.rpm, 'rpm', u) + (t.capped ? ' (top speed)' : '');
      var qa = R.removalRate(v.width, v.depth, S.s.feed), qb = R.removalRate(v.width, v.depth, t.feed);
      var pa = R.powerBand(qa, g.energyJMm3), pb = R.powerBand(qb, g.energyJMm3);
      var pw = function (b) { return u === 'in' ? R.showHp(b[0], b[1]) : R.showPower(b[0], b[1]); };
      var cells = {
        rpm: [M.show(S.s.rpm, 'rpm', u), M.show(t.rpm, 'rpm', u), t.change.rpm],
        feed: [M.show(S.s.feed, 'feed', u), M.show(t.feed, 'feed', u), t.change.feed],
        chip: [M.show(S.s.chip, 'chip', u), M.show(t.chip, 'chip', u), t.change.chip],
        speed: [M.show(S.s.speed, 'speed', u), M.show(t.speed, 'speed', u), t.change.speed],
        rate: [R.showRate(qa, u), R.showRate(qb, u), qb / qa],
        power: [pw(pa), pw(pb), qb / qa]
      };
      Object.keys(cells).forEach(function (k) {
        var r = rows[k], c = cells[k];
        r.a.textContent = c[0]; r.b.textContent = c[1];
        var held = (k === 'feed' && t.hold === 'feed') || (k === 'chip' && t.hold === 'chip');
        r.c.textContent = held ? 'held' : M.ratioText(c[2]);
        r.tr.setAttribute('data-held', String(held));
        r.tr.setAttribute('data-moved', String(!held && Math.abs(c[2] - 1) > 5e-4));
      });
      chartBody.innerHTML = R.renderPowerChart(qa, DATA.materials, { unit: u, current: state.material });
      chartNote.textContent = 'Every row is the setup’s cut, ' + R.showRate(qa, u) + '. Choosing another material moves only the power; ' +
        'the drawings and the removal rate stay as they are. A wide bar is a broad published band; a dot is a single published factor, not a measured certainty.';
      draw();
      if (announce) status.textContent = describeTrial(t, u) + ' Removal rate ' + R.showRate(qb, u) + '.';
    }

    function draw() {
      if (expBody.hidden) return;
      var v = state.read.values, u = state.unit, g = material(), S = setupRun(), t = M.trial(v, state.factor, state.hold);
      var win = windowSeconds(S.s.feed, v.diameter), elapsed = state.frac * win;
      var reach = M.trial(v, 2, 'chip').feed;            // the most this experiment can feed
      var compact = stage.clientWidth > 0 && stage.clientWidth < 520;
      var f = R.frame([S.run, { feed: Math.max(reach, S.s.feed), width: v.width, depth: v.depth, diameter: v.diameter }], win, compact);
      var achieved = t.rpm / S.s.rpm;
      var title = Math.abs(achieved - 1) < 1e-9 ? (t.capped ? 'Changed · capped at setup speed' : 'Changed (same as setup)')
        : 'Spindle ' + M.ratioText(achieved) + ', ' + (t.hold === 'chip' ? 'chip load held' : 'table feed held') + (t.capped ? ' · capped' : '');
      stage.innerHTML = renderSweeps([
        { id: 'setup', title: 'Setup', sub: M.show(S.s.rpm, 'rpm', u) + ' · ' + M.show(S.s.feed, 'feed', u), run: S.run },
        { id: 'changed', title: title, sub: M.show(t.rpm, 'rpm', u) + ' · ' + M.show(t.feed, 'feed', u),
          run: { feed: t.feed, width: v.width, depth: v.depth, diameter: v.diameter } }
      ], elapsed, f, u, g.energyJMm3);
      tIn.value = String(Math.round(state.frac * 100));
      tOut.textContent = R.showSeconds(elapsed) + ' of ' + R.showSeconds(win);
      scaleNote.textContent = 'Both drawings share one scale, the same in every direction, and show the same ' + R.showSeconds(win) +
        ' of cutting. Gold is the solid removed in the time shown, drawn where it was; its volume is width × depth × travel. ' +
        'The stock around it is only there to hold the cut. Play runs ' + R.showSeconds(win) + ' of cutting in ' + PLAY_SECONDS + ' s.';
    }

    /* ---- time ------------------------------------------------------------*/
    var raf = 0, last = null, stepTimer = 0;
    function tick(ts) {
      if (!state.playing) return;
      var dt = last === null ? 0 : Math.min(0.1, (ts - last) / 1000);
      last = ts;
      state.frac = Math.min(1, state.frac + dt / PLAY_SECONDS);
      draw();
      if (state.frac >= 1) { play(false); return; }
      raf = requestAnimationFrame(tick);
    }
    function stepReduced() {
      // Reduced motion: the same clock, in still frames a quarter of the span apart.
      if (!state.playing) return;
      state.frac = Math.min(1, state.frac + 0.25);
      draw();
      if (state.frac >= 1) { play(false); return; }
      stepTimer = setTimeout(stepReduced, 900);
    }
    function play(on) {
      if (on && expBody.hidden) on = false;
      if (on && state.frac >= 1) state.frac = 0;
      state.playing = on;
      bPlay.textContent = on ? 'Pause' : 'Play';
      bPlay.setAttribute('aria-pressed', String(on));
      cancelAnimationFrame(raf); clearTimeout(stepTimer); last = null;
      if (on) {
        if (reduce.matches) stepTimer = setTimeout(stepReduced, 200);
        else raf = requestAnimationFrame(tick);
      }
    }
    function resetExperiment() {
      play(false);
      state.factor = 1; spIn.value = '100';
      state.frac = 0;
      updateExperiment(true);
    }
    function setFactor(pct) {
      var v = Math.max(25, Math.min(200, Math.round(pct / 5) * 5));
      spIn.value = String(v);
      state.factor = v / 100;
      updateExperiment(true);
    }

    /* ---- events ------------------------------------------------------------*/
    M.FIELDS.forEach(function (k) {
      inputs[k].addEventListener('input', function () { update(false); });
      inputs[k].addEventListener('change', function () {
        var p = M.partial(state.read.values);
        if (p.feed !== undefined) status.textContent = 'Spindle ' + M.show(p.rpm, 'rpm', state.unit) + ', table feed ' + M.show(p.feed, 'feed', state.unit) + '.';
      });
    });
    matSel.addEventListener('change', function () {
      state.material = matSel.value;
      update(false);
      var g = material();
      status.textContent = g.label + ' selected. Cutting energy ' + R.showEnergy(g.energyJMm3, state.unit) + '. Your entries are unchanged.';
    });
    gApply.addEventListener('click', function () {
      var mid = guideMiddle(state.material, state.read.values.diameter);
      setField('speed', mid.speed);
      if (mid.chip !== null) setField('chip', mid.chip);
      update(true);
      status.textContent = 'Cutting speed set to ' + M.show(mid.speed, 'speed', state.unit) +
        (mid.chip !== null ? ' and feed per tooth to ' + M.show(mid.chip, 'chip', state.unit) + '.' :
          '. Feed per tooth needs a cutter diameter inside the guide’s table, so it was left as it was.');
    });
    Object.keys(unitRadios).forEach(function (u) {
      unitRadios[u].addEventListener('change', function () {
        if (!unitRadios[u].checked || u === state.unit) return;
        var before = readForm();
        state.unit = u;
        M.FIELDS.forEach(function (k) {
          var c = before.values[k];
          if (c !== undefined && c !== null) setField(k, c);
        });
        update(false);
        status.textContent = 'Switched to ' + M.UNITS[u].name + ' units. Same cutter, same cut; empty fields stay empty.';
      });
    });
    Object.keys(holdRadios).forEach(function (h) {
      holdRadios[h].addEventListener('change', function () { if (holdRadios[h].checked) { state.hold = h; updateExperiment(true); } });
    });
    spIn.addEventListener('input', function () { state.factor = Number(spIn.value) / 100; updateExperiment(false); });
    spIn.addEventListener('change', function () { updateExperiment(true); });
    tIn.addEventListener('input', function () { play(false); state.frac = Number(tIn.value) / 100; draw(); });
    winSel.addEventListener('change', function () { state.windowChoice = winSel.value; draw(); });
    bPlay.addEventListener('click', function () { play(!state.playing); });
    bReset.addEventListener('click', resetExperiment);
    stage.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var used = true;
      switch (e.key) {
        case ' ': case 'Spacebar': play(!state.playing); break;
        case 'ArrowRight': setFactor(state.factor * 100 + 5); break;
        case 'ArrowLeft': setFactor(state.factor * 100 - 5); break;
        case 'Home': resetExperiment(); break;
        default: used = false;
      }
      if (used) { e.preventDefault(); e.stopPropagation(); }
    });
    if (reduce.addEventListener) reduce.addEventListener('change', function () { if (state.playing) { play(false); play(true); } });
    addEventListener('beforeprint', function () { if (state.playing) play(false); });

    update(false);
    if (typeof ResizeObserver === 'function') {
      var lastWidth = stage.clientWidth;
      new ResizeObserver(function () {
        if (stage.clientWidth !== lastWidth) { lastWidth = stage.clientWidth; draw(); }
      }).observe(stage);
    }
  }

  function boot() {
    if (typeof document === 'undefined') return;
    var go = function () {
      document.querySelectorAll('[data-interactive="feeds-and-speeds"]').forEach(wire);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  }

  return {
    renderCircumference: renderCircumference, renderSweeps: renderSweeps, renderStaticFigure: renderStaticFigure,
    workedLines: workedLines, describeTrial: describeTrial, guideMiddle: guideMiddle,
    DEFAULT_MATERIAL: DEFAULT_MATERIAL, boot: boot
  };
});
