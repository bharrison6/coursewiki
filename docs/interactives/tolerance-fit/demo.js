/* ============================================================================
   tolerance-fit / demo.js - the shaft-and-hole fit lab and the call-the-fit
   challenge. Every number on screen comes from model.js; this file draws.

   Mount points are authored in the page:
     <div data-interactive="tolerance-fit">                       - the lab
     <div data-interactive="tolerance-fit" data-tf-view="challenge"> - the quiz
   Each mount keeps its authored static content (the no-JavaScript and paper
   version) and hides it only once the live version has been built.

   The two views talk through two document events, so either works alone:
     tolerance-fit:unit  - the lab changed unit system
     tolerance-fit:load  - the challenge asks the lab to open a drawing

   Keys: app.js turns Space and the arrow keys into slide and page navigation
   unless focus is in an INPUT, SELECT or TEXTAREA. Focus on one of this lab's
   buttons is neither, so keydown is stopped at the mount - a presenter
   pressing Space on "Run 100 assemblies" must not leave the slide.
   ========================================================================== */
(function () {
  'use strict';

  var M = (typeof window !== 'undefined') && window.ToleranceFitModel;
  if (!M || typeof document === 'undefined') { return; }

  var SVGNS = 'http://www.w3.org/2000/svg';
  var MINUS = '−';
  var instance = 0;

  var reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* ---- small helpers ----------------------------------------------------*/
  function $(root, sel) { return root.querySelector(sel); }
  function $$(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function setAttrs(el, attrs) {
    for (var k in attrs) { if (Object.prototype.hasOwnProperty.call(attrs, k)) { el.setAttribute(k, attrs[k]); } }
    return el;
  }
  function svgEl(tag, attrs) { return setAttrs(document.createElementNS(SVGNS, tag), attrs || {}); }
  function r1(n) { return Math.round(n * 10) / 10; }

  function fmt(c, unit, signed) { return M.format(c, unit, signed ? { signed: true } : null); }
  function fmtU(c, unit, signed) { return M.withUnit(fmt(c, unit, signed), unit); }
  function halfU(c, unit) { return M.withUnit(M.formatHalf(c, unit), unit); }
  function absCount(c) { return c < 0 ? -c : c; }

  function callout(spec, part) {
    var p = spec[part];
    return '⌀' + fmt(spec.nominal, spec.unit) + ' ' + fmt(p.upper, spec.unit, true) + ' / ' + fmt(p.lower, spec.unit, true);
  }
  /* "nominal + deviation" written as arithmetic: 0.7500 − 0.0011, 0.7500 + 0.0000. */
  function plus(nominal, dev, unit) {
    return fmt(nominal, unit) + (dev < 0 ? ' − ' + fmt(-dev, unit) : ' + ' + fmt(dev, unit));
  }
  function limitText(spec, part) {
    var l = M.limits(spec, part);
    return fmt(l.min, spec.unit) + ' to ' + fmtU(l.max, spec.unit);
  }

  var KIND_WORD = { clearance: 'Clearance fit', transition: 'Transition fit', interference: 'Interference fit' };

  function envelopeSentence(env, unit) {
    if (env.kind === 'clearance') {
      return env.boundary
        ? 'Clearance fit, with zero at the worst case: the tightest legal pair meets exactly, size to size.'
        : 'Clearance fit: every legal pair has a gap, at least ' + fmtU(env.min, unit) + '.';
    }
    if (env.kind === 'interference') {
      return env.boundary
        ? 'Interference fit, with zero at the best case: the loosest legal pair meets exactly, size to size.'
        : 'Interference fit: every legal pair overlaps, by at least ' + fmtU(absCount(env.max), unit) + '.';
    }
    return 'Transition fit: some legal pairs have a gap, some overlap.';
  }

  /* Stop app.js's window-level navigation keys from firing while focus is on
     one of our controls. Escape is left alone: it is the way out of
     presentation mode, and nothing here uses it. */
  var NAV_KEYS = { ' ': 1, 'Spacebar': 1, 'ArrowLeft': 1, 'ArrowRight': 1, 'ArrowUp': 1, 'ArrowDown': 1, 'PageUp': 1, 'PageDown': 1, 'Home': 1, 'End': 1 };
  function guardKeys(root) {
    root.addEventListener('keydown', function (e) {
      if (!NAV_KEYS[e.key]) { return; }
      var t = e.target;
      if (t && t !== root && t.matches && t.matches('button, input, select, textarea, summary, [tabindex]')) { e.stopPropagation(); }
    });
  }

  /* =========================================================================
     The lab
     =======================================================================*/
  /* Section-view geometry, in SVG user units. The nominal diameter is drawn
     at 2 x R0; departures from nominal are magnified so the widest size in
     the view window reaches BAND units from the nominal wall. */
  var SEC = { W: 640, H: 320, CY: 165, R0: 80, BAND: 50, BX0: 170, BX1: 470, BY0: 18, BY1: 312, SX0: 92, SX1: 548,
              SZ0: 182, SZ1: 312, HZ0: 328, HZ1: 458 };
  /* Pair-map geometry: a square plot, same scale on both axes. */
  var MAP = { W: 360, H: 360, X0: 60, X1: 344, Y0: 14, Y1: 298 };

  function labMarkup(id) {
    var p = id + '-';
    return '' +
      '<div class="tf-lab">' +
        '<div class="tf-bar">' +
          '<div class="tf-presets" role="group" aria-label="Example drawings">' +
            '<span class="tf-k" aria-hidden="true">Try a drawing</span>' +
            '<div class="tf-preset-row" data-tf-presets></div>' +
          '</div>' +
          '<fieldset class="tf-units">' +
            '<legend class="tf-k">Units</legend>' +
            '<label><input type="radio" name="' + p + 'unit" value="in" checked> inch</label>' +
            '<label><input type="radio" name="' + p + 'unit" value="mm"> mm</label>' +
          '</fieldset>' +
        '</div>' +

        '<dl class="tf-drawing" aria-label="The drawing">' +
          '<div class="tf-callout tf-callout-hole"><dt>Hole</dt><dd><span data-tf-callout="hole"></span><span class="tf-lim" data-tf-limits="hole"></span></dd></div>' +
          '<div class="tf-callout tf-callout-shaft"><dt>Shaft</dt><dd><span data-tf-callout="shaft"></span><span class="tf-lim" data-tf-limits="shaft"></span></dd></div>' +
          '<div class="tf-callout tf-callout-fit"><dt>Fit</dt><dd><span class="tf-badge" data-tf-fitbadge></span></dd></div>' +
        '</dl>' +

        '<div class="tf-stage">' +
          '<figure class="tf-fig tf-fig-section">' +
            '<svg class="tf-section" viewBox="0 0 ' + SEC.W + ' ' + SEC.H + '" role="img" aria-labelledby="' + p + 'sec-t" aria-describedby="' + p + 'sec-d" data-tf-section>' +
              '<title id="' + p + 'sec-t">A shaft passing through a bored block, cut in half along its axis</title>' +
              '<desc id="' + p + 'sec-d" data-tf-sec-desc></desc>' +
            '</svg>' +
            '<figcaption><strong data-tf-mag></strong> Only the departures from nominal size are enlarged; the part itself is not drawn to any scale. Hatching is the cut face of the block.</figcaption>' +
          '</figure>' +
          '<figure class="tf-fig tf-fig-map">' +
            '<svg class="tf-map" viewBox="0 0 ' + MAP.W + ' ' + MAP.H + '" role="img" aria-labelledby="' + p + 'map-t" aria-describedby="' + p + 'map-d" data-tf-map>' +
              '<title id="' + p + 'map-t">Every pair the drawing allows</title>' +
              '<desc id="' + p + 'map-d" data-tf-map-desc></desc>' +
            '</svg>' +
            '<figcaption><strong>Every legal pair.</strong> Across: hole size. Up: shaft size. The box holds every pair that passes inspection; the diagonal is where the two are the same size. Click or tap to pick a pair.</figcaption>' +
          '</figure>' +
        '</div>' +

        '<div class="tf-parts">' +
          partMarkup(p, 'hole', 'Hole as made') +
          partMarkup(p, 'shaft', 'Shaft as made') +
        '</div>' +

        '<div class="tf-jumps" role="group" aria-label="Jump to a pair">' +
          '<button type="button" data-tf-jump="tightest">Tightest legal pair</button>' +
          '<button type="button" data-tf-jump="loosest">Loosest legal pair</button>' +
          '<button type="button" data-tf-jump="random">Pull two parts from the bins</button>' +
          '<button type="button" data-tf-jump="run">Run 100 assemblies</button>' +
        '</div>' +

        '<div class="tf-results">' +
          '<div class="tf-result" data-tf-pair-box>' +
            '<span class="tf-k">This pair</span>' +
            '<p class="tf-v" data-tf-pair-v></p>' +
            '<p class="tf-s" data-tf-pair-s></p>' +
          '</div>' +
          '<div class="tf-result" data-tf-env-box>' +
            '<span class="tf-k">Every legal pair</span>' +
            '<p class="tf-v" data-tf-env-v></p>' +
            '<p class="tf-s" data-tf-env-s></p>' +
          '</div>' +
        '</div>' +

        '<p class="tf-mission" data-tf-mission></p>' +
        '<p class="tf-run" data-tf-run hidden></p>' +

        '<div class="tf-work" data-tf-work></div>' +

        '<details class="tf-edit">' +
          '<summary>Write your own drawing</summary>' +
          '<form class="tf-edit-form" data-tf-form novalidate>' +
            '<p class="tf-edit-note">Deviations are added to the nominal size; use a minus sign for below nominal. Sizes resolve to <span data-tf-step></span>.</p>' +
            '<div class="tf-edit-grid">' +
              fieldMarkup(p, 'nominal', 'Nominal size') +
              fieldMarkup(p, 'hu', 'Hole upper deviation') +
              fieldMarkup(p, 'hl', 'Hole lower deviation') +
              fieldMarkup(p, 'su', 'Shaft upper deviation') +
              fieldMarkup(p, 'sl', 'Shaft lower deviation') +
            '</div>' +
            '<div class="tf-edit-actions"><button type="submit">Use this drawing</button></div>' +
            '<ul class="tf-errors" data-tf-errors role="alert"></ul>' +
          '</form>' +
        '</details>' +

        '<p class="sr-only" aria-live="polite" data-tf-live></p>' +
      '</div>';
  }

  function partMarkup(p, part, label) {
    return '' +
      '<div class="tf-part tf-part-' + part + '" data-tf-part="' + part + '">' +
        '<label class="tf-k" for="' + p + part + '">' + label + '</label>' +
        '<div class="tf-part-row">' +
          '<input type="range" id="' + p + part + '" data-tf-range="' + part + '" step="1">' +
          '<output for="' + p + part + '" class="tf-size" data-tf-size="' + part + '"></output>' +
        '</div>' +
        '<p class="tf-inspect" data-tf-inspect="' + part + '"></p>' +
      '</div>';
  }

  function fieldMarkup(p, key, label) {
    return '<p><label for="' + p + 'f-' + key + '">' + label + '</label>' +
      '<input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" id="' + p + 'f-' + key + '" data-tf-field="' + key + '"></p>';
  }

  /* ---- the static skeleton of both figures, built once -------------------*/
  function buildSection(svg, id) {
    var defs = svgEl('defs');
    defs.innerHTML =
      '<pattern id="' + id + '-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
        '<line x1="0" y1="0" x2="0" y2="9" class="tf-hatch-line"/></pattern>' +
      '<pattern id="' + id + '-xhatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
        '<rect width="7" height="7" class="tf-xhatch-bg"/><line x1="0" y1="0" x2="0" y2="7" class="tf-xhatch-line"/><line x1="0" y1="0" x2="7" y2="0" class="tf-xhatch-line"/></pattern>' +
      '<marker id="' + id + '-arr" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">' +
        '<path d="M0 0 L8 4 L0 8 z" class="tf-arrowhead"/></marker>';
    svg.appendChild(defs);

    var g = {};
    g.blockTop = svgEl('rect', { 'class': 'tf-block', x: SEC.BX0, y: SEC.BY0, width: SEC.BX1 - SEC.BX0 });
    g.blockBot = svgEl('rect', { 'class': 'tf-block', x: SEC.BX0, width: SEC.BX1 - SEC.BX0 });
    g.hatchTop = svgEl('rect', { 'class': 'tf-hatch', x: SEC.BX0, y: SEC.BY0, width: SEC.BX1 - SEC.BX0, fill: 'url(#' + id + '-hatch)' });
    g.hatchBot = svgEl('rect', { 'class': 'tf-hatch', x: SEC.BX0, width: SEC.BX1 - SEC.BX0, fill: 'url(#' + id + '-hatch)' });
    g.shaft = svgEl('path', { 'class': 'tf-shaft' });
    g.center = svgEl('line', { 'class': 'tf-center', x1: 70, x2: 570, y1: SEC.CY, y2: SEC.CY });
    g.nominal = svgEl('line', { 'class': 'tf-nominal', x1: SEC.BX0 + 4, x2: 556, y1: SEC.CY - SEC.R0, y2: SEC.CY - SEC.R0 });
    g.nominalText = svgEl('text', { 'class': 'tf-svg-small', 'data-tf-nominal-label': '', x: 560, y: SEC.CY - SEC.R0 + 4 });
    g.nominalText.textContent = 'nominal';
    g.shaftZone = svgEl('rect', { 'class': 'tf-zone tf-zone-shaft', x: SEC.SZ0, width: SEC.SZ1 - SEC.SZ0 });
    g.holeZone = svgEl('rect', { 'class': 'tf-zone tf-zone-hole', x: SEC.HZ0, width: SEC.HZ1 - SEC.HZ0 });
    g.overTop = svgEl('rect', { 'class': 'tf-overlap', x: SEC.BX0, width: SEC.BX1 - SEC.BX0, fill: 'url(#' + id + '-xhatch)' });
    g.overBot = svgEl('rect', { 'class': 'tf-overlap', x: SEC.BX0, width: SEC.BX1 - SEC.BX0, fill: 'url(#' + id + '-xhatch)' });
    g.wallTop = svgEl('line', { 'class': 'tf-wall', x1: SEC.BX0, x2: SEC.BX1 });
    g.wallBot = svgEl('line', { 'class': 'tf-wall', x1: SEC.BX0, x2: SEC.BX1 });
    g.zoneLeadS = svgEl('polyline', { 'class': 'tf-leader' });
    g.zoneLeadH = svgEl('polyline', { 'class': 'tf-leader' });
    g.zoneTextS = svgEl('text', { 'class': 'tf-svg-label', x: 14, y: 24 });
    g.zoneTextS.textContent = 'SHAFT LIMITS';
    g.zoneTextH = svgEl('text', { 'class': 'tf-svg-label', x: 626, y: 24, 'text-anchor': 'end' });
    g.zoneTextH.textContent = 'HOLE LIMITS';
    g.dim = svgEl('line', { 'class': 'tf-dim', x1: 440, x2: 440, 'marker-start': 'url(#' + id + '-arr)', 'marker-end': 'url(#' + id + '-arr)' });
    g.dimLead = svgEl('polyline', { 'class': 'tf-leader' });
    g.dimText1 = svgEl('text', { 'class': 'tf-svg-label', x: 482, y: 294 });
    g.dimText2 = svgEl('text', { 'class': 'tf-svg-small', x: 482, y: 310 });
    g.magText1 = svgEl('text', { 'class': 'tf-svg-label tf-svg-mag', x: 14, y: 288 });
    g.magText2 = svgEl('text', { 'class': 'tf-svg-small', x: 14, y: 306 });
    g.partShaft = svgEl('text', { 'class': 'tf-svg-tag', x: SEC.SX0 + 10, y: SEC.CY - 14 });
    g.partShaft.textContent = 'SHAFT';
    g.partBlock = svgEl('text', { 'class': 'tf-svg-tag tf-on-hatch', x: (SEC.BX0 + SEC.BX1) / 2, 'text-anchor': 'middle' });
    g.partBlock.textContent = 'BLOCK WITH A BORED HOLE';

    [g.blockTop, g.blockBot, g.hatchTop, g.hatchBot, g.shaft, g.center, g.overTop, g.overBot,
     g.wallTop, g.wallBot, g.shaftZone, g.holeZone, g.nominal, g.nominalText, g.zoneLeadS, g.zoneLeadH,
     g.zoneTextS, g.zoneTextH, g.dim, g.dimLead, g.dimText1, g.dimText2, g.magText1, g.magText2,
     g.partShaft, g.partBlock].forEach(function (el) { svg.appendChild(el); });
    return g;
  }

  function buildMap(svg, id) {
    var defs = svgEl('defs');
    defs.innerHTML =
      '<pattern id="' + id + '-mhatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
        '<line x1="0" y1="0" x2="0" y2="8" class="tf-xhatch-line"/></pattern>' +
      '<clipPath id="' + id + '-clip"><rect x="' + MAP.X0 + '" y="' + MAP.Y0 + '" width="' + (MAP.X1 - MAP.X0) + '" height="' + (MAP.Y1 - MAP.Y0) + '"/></clipPath>';
    svg.appendChild(defs);
    var X0 = MAP.X0, X1 = MAP.X1, Y0 = MAP.Y0, Y1 = MAP.Y1;
    var g = {};
    g.zoneClear = svgEl('polygon', { 'class': 'tf-mz-clear', points: X0 + ',' + Y1 + ' ' + X1 + ',' + Y1 + ' ' + X1 + ',' + Y0 });
    g.zoneOver = svgEl('polygon', { 'class': 'tf-mz-over', points: X0 + ',' + Y1 + ' ' + X1 + ',' + Y0 + ' ' + X0 + ',' + Y0 });
    g.zoneOverHatch = svgEl('polygon', { 'class': 'tf-mz-over-hatch', points: X0 + ',' + Y1 + ' ' + X1 + ',' + Y0 + ' ' + X0 + ',' + Y0, fill: 'url(#' + id + '-mhatch)' });
    g.frame = svgEl('rect', { 'class': 'tf-mframe', x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0 });
    g.diag = svgEl('line', { 'class': 'tf-mdiag', x1: X0, y1: Y1, x2: X1, y2: Y0 });
    g.diagText = svgEl('text', { 'class': 'tf-svg-small', 'text-anchor': 'middle',
      transform: 'translate(' + r1(X0 + (X1 - X0) * 0.78) + ' ' + r1(Y1 - (Y1 - Y0) * 0.78 - 6) + ') rotate(-45)' });
    g.diagText.textContent = 'same size';
    g.overText = svgEl('text', { 'class': 'tf-svg-label', x: X0 + 8, y: Y0 + 18 });
    g.overText.textContent = 'SHAFT BIGGER: OVERLAP';
    g.clearText = svgEl('text', { 'class': 'tf-svg-label', x: X1 - 8, y: Y1 - 10, 'text-anchor': 'end' });
    g.clearText.textContent = 'HOLE BIGGER: GAP';
    g.box = svgEl('rect', { 'class': 'tf-mbox' });
    g.boxText = svgEl('text', { 'class': 'tf-svg-small tf-mbox-text' });
    g.boxText.textContent = 'passes inspection';
    g.tight = svgEl('rect', { 'class': 'tf-mcorner', width: 9, height: 9 });
    g.tightText = svgEl('text', { 'class': 'tf-svg-small', 'text-anchor': 'end' });
    g.tightText.textContent = 'tightest';
    g.loose = svgEl('rect', { 'class': 'tf-mcorner', width: 9, height: 9 });
    g.looseText = svgEl('text', { 'class': 'tf-svg-small' });
    g.looseText.textContent = 'loosest';
    g.samples = svgEl('g', { 'class': 'tf-samples', 'clip-path': 'url(#' + id + '-clip)' });
    g.crossH = svgEl('line', { 'class': 'tf-mcross' });
    g.crossV = svgEl('line', { 'class': 'tf-mcross' });
    g.dot = svgEl('g', { 'class': 'tf-mdot' });
    g.dotRing = svgEl('circle', { r: 8, 'class': 'tf-mdot-ring' });
    g.dotX = svgEl('path', { d: 'M-4.5 -4.5 L4.5 4.5 M4.5 -4.5 L-4.5 4.5', 'class': 'tf-mdot-x' });
    g.dot.appendChild(g.dotRing);
    g.dot.appendChild(g.dotX);
    g.ticks = svgEl('g', { 'class': 'tf-mticks' });
    g.axisX = svgEl('text', { 'class': 'tf-svg-label', x: (X0 + X1) / 2, y: MAP.H - 6, 'text-anchor': 'middle' });
    g.axisX.textContent = 'HOLE SIZE →';
    g.axisY = svgEl('text', { 'class': 'tf-svg-label', 'text-anchor': 'middle', transform: 'translate(14 ' + ((Y0 + Y1) / 2) + ') rotate(-90)' });
    g.axisY.textContent = 'SHAFT SIZE →';
    [g.zoneClear, g.zoneOver, g.zoneOverHatch, g.frame, g.diag, g.diagText, g.overText, g.clearText, g.box, g.boxText,
     g.samples, g.crossH, g.crossV, g.tight, g.tightText, g.loose, g.looseText, g.dot, g.ticks, g.axisX, g.axisY]
      .forEach(function (el) { svg.appendChild(el); });
    return g;
  }

  function initLab(root) {
    var id = 'tf' + (++instance);
    var host = document.createElement('div');
    host.innerHTML = labMarkup(id);
    var lab = host.firstChild;
    root.insertBefore(lab, root.firstChild);
    root.classList.add('tf-live');
    guardKeys(root);

    var secSvg = $(lab, '[data-tf-section]');
    var mapSvg = $(lab, '[data-tf-map]');
    var sec = buildSection(secSvg, id);
    var map = buildMap(mapSvg, id);

    var state = { unit: 'in', presetId: null, spec: null, hole: 0, shaft: 0, win: null, mag: null, runs: 0 };

    /* preset buttons */
    var presetRow = $(lab, '[data-tf-presets]');
    function renderPresetButtons() {
      presetRow.innerHTML = M.PRESETS[state.unit].map(function (p) {
        return '<button type="button" data-tf-preset="' + esc(p.id) + '" aria-pressed="false">' + esc(p.title) + '</button>';
      }).join('');
    }

    var ranges = { hole: $(lab, '[data-tf-range="hole"]'), shaft: $(lab, '[data-tf-range="shaft"]') };
    var sizes = { hole: $(lab, '[data-tf-size="hole"]'), shaft: $(lab, '[data-tf-size="shaft"]') };
    var inspects = { hole: $(lab, '[data-tf-inspect="hole"]'), shaft: $(lab, '[data-tf-inspect="shaft"]') };
    var live = $(lab, '[data-tf-live]');
    var runOut = $(lab, '[data-tf-run]');

    /* ---- load a drawing ---------------------------------------------------*/
    function loadSpec(spec, hole, shaft, presetId) {
      state.spec = M.cloneSpec(spec);
      state.unit = spec.unit;
      state.presetId = presetId || null;
      state.win = M.viewWindow(state.spec);
      state.mag = M.magnification(state.spec, 2 * SEC.R0, SEC.BAND);
      state.hole = M.clamp(hole, state.win.min, state.win.max);
      state.shaft = M.clamp(shaft, state.win.min, state.win.max);
      ['hole', 'shaft'].forEach(function (part) {
        ranges[part].min = state.win.min;
        ranges[part].max = state.win.max;
        ranges[part].value = state[part];
      });
      $$(lab, 'input[name="' + id + '-unit"]').forEach(function (r) { r.checked = r.value === state.unit; });
      $$(presetRow, '[data-tf-preset]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-tf-preset') === state.presetId));
      });
      clearRun();
      fillForm();
      drawStatic();
      update();
    }

    function loadPreset(pid) {
      var list = M.PRESETS[state.unit];
      var p = list.filter(function (x) { return x.id === pid; })[0] || list[0];
      loadSpec(p.spec, p.actual.hole, p.actual.shaft, p.id);
    }

    function midOf(spec, part) { var l = M.limits(spec, part); return l.min + Math.floor((l.max - l.min) / 2); }

    /* ---- coordinates --------------------------------------------------------*/
    function secY(size) { return SEC.CY - (SEC.R0 + ((size - state.spec.nominal) / 2) * state.mag.pxPerCount); }
    function mapK() { return (MAP.X1 - MAP.X0) / (state.win.max - state.win.min); }
    function mapX(h) { return MAP.X0 + (h - state.win.min) * mapK(); }
    function mapY(s) { return MAP.Y1 - (s - state.win.min) * mapK(); }

    /* ---- parts of the figures that change only with the drawing -------------*/
    function drawStatic() {
      var s = state.spec, u = s.unit;
      var hl = M.limits(s, 'hole'), sl = M.limits(s, 'shaft');
      var env = M.envelope(s);

      // drawing callout
      $(lab, '[data-tf-callout="hole"]').textContent = callout(s, 'hole');
      $(lab, '[data-tf-callout="shaft"]').textContent = callout(s, 'shaft');
      $(lab, '[data-tf-limits="hole"]').textContent = limitText(s, 'hole');
      $(lab, '[data-tf-limits="shaft"]').textContent = limitText(s, 'shaft');
      var badge = $(lab, '[data-tf-fitbadge]');
      badge.textContent = KIND_WORD[env.kind] + (env.boundary ? ' (zero at the limit)' : '');
      badge.setAttribute('data-kind', env.kind);

      // section: tolerance zones (the band each wall may lie in)
      var hzTop = secY(hl.max), hzBot = secY(hl.min);
      var szTop = secY(sl.max), szBot = secY(sl.min);
      setAttrs(sec.holeZone, { y: r1(hzTop), height: r1(Math.max(1, hzBot - hzTop)) });
      setAttrs(sec.shaftZone, { y: r1(szTop), height: r1(Math.max(1, szBot - szTop)) });
      setAttrs(sec.zoneLeadS, { points: '60,30 ' + (SEC.SZ0 + 10) + ',30 ' + (SEC.SZ0 + 10) + ',' + r1(szTop) });
      setAttrs(sec.zoneLeadH, { points: '580,30 ' + (SEC.HZ1 - 10) + ',30 ' + (SEC.HZ1 - 10) + ',' + r1(hzTop) });

      sec.magText1.textContent = '×' + state.mag.factor;
      sec.magText2.textContent = state.mag.magnified ? 'size differences' : 'not enlarged';
      $(lab, '[data-tf-mag]').textContent = state.mag.magnified
        ? 'Size differences drawn ' + state.mag.factor + ' times larger.'
        : 'Size differences shown without magnification.';

      // map: legal box, corners, ticks
      var bx0 = mapX(hl.min), bx1 = mapX(hl.max), by0 = mapY(sl.max), by1 = mapY(sl.min);
      setAttrs(map.box, { x: r1(bx0), y: r1(by0), width: r1(Math.max(1, bx1 - bx0)), height: r1(Math.max(1, by1 - by0)) });
      setAttrs(map.boxText, { x: r1(bx0), y: r1(by1 + 14) });
      setAttrs(map.tight, { x: r1(mapX(env.tightest.hole) - 4.5), y: r1(mapY(env.tightest.shaft) - 4.5) });
      setAttrs(map.tightText, { x: r1(mapX(env.tightest.hole) - 8), y: r1(mapY(env.tightest.shaft) - 7) });
      setAttrs(map.loose, { x: r1(mapX(env.loosest.hole) - 4.5), y: r1(mapY(env.loosest.shaft) - 4.5) });
      setAttrs(map.looseText, { x: r1(mapX(env.loosest.hole) + 8), y: r1(mapY(env.loosest.shaft) + 15) });

      map.ticks.textContent = '';
      [[hl.min, 'x'], [hl.max, 'x'], [sl.min, 'y'], [sl.max, 'y']].forEach(function (t) {
        var v = t[0], label = svgEl('text', { 'class': 'tf-svg-tick' }), mark = svgEl('line', { 'class': 'tf-mtick' });
        label.textContent = fmt(v, u);
        if (t[1] === 'x') {
          var x = r1(mapX(v));
          setAttrs(mark, { x1: x, x2: x, y1: MAP.Y1, y2: MAP.Y1 + 5 });
          setAttrs(label, { x: x, y: MAP.Y1 + 17, 'text-anchor': 'middle' });
        } else {
          var y = r1(mapY(v));
          setAttrs(mark, { x1: MAP.X0 - 5, x2: MAP.X0, y1: y, y2: y });
          setAttrs(label, { x: MAP.X0 - 7, y: y + 3.5, 'text-anchor': 'end' });
        }
        map.ticks.appendChild(mark);
        map.ticks.appendChild(label);
      });

      $(lab, '[data-tf-map-desc]').textContent =
        'Legal holes run from ' + limitText(s, 'hole') + '; legal shafts from ' + limitText(s, 'shaft') + '. ' + envelopeSentence(env, u);
      $(lab, '[data-tf-step]').textContent = M.UNITS[u].step;
    }

    /* ---- everything that moves with the selected pair -----------------------*/
    function update() {
      var s = state.spec, u = s.unit;
      var r = M.evaluate(s, state.hole, state.shaft);
      var env = r.envelope;

      // section geometry: wall and shaft surface, both sides
      var wallTop = secY(state.hole), shaftTop = secY(state.shaft);
      var wallBot = 2 * SEC.CY - wallTop, shaftBot = 2 * SEC.CY - shaftTop;
      setAttrs(sec.blockTop, { height: r1(wallTop - SEC.BY0) });
      setAttrs(sec.hatchTop, { height: r1(wallTop - SEC.BY0) });
      setAttrs(sec.blockBot, { y: r1(wallBot), height: r1(SEC.BY1 - wallBot) });
      setAttrs(sec.hatchBot, { y: r1(wallBot), height: r1(SEC.BY1 - wallBot) });
      setAttrs(sec.wallTop, { y1: r1(wallTop), y2: r1(wallTop) });
      setAttrs(sec.wallBot, { y1: r1(wallBot), y2: r1(wallBot) });
      setAttrs(sec.partBlock, { y: r1(SEC.BY0 + (wallTop - SEC.BY0) / 2 + 4) });
      var ch = 7;
      sec.shaft.setAttribute('d',
        'M' + (SEC.SX0 + ch) + ' ' + r1(shaftTop) + ' L' + (SEC.SX1 - ch) + ' ' + r1(shaftTop) +
        ' L' + SEC.SX1 + ' ' + r1(shaftTop + ch) + ' L' + SEC.SX1 + ' ' + r1(shaftBot - ch) +
        ' L' + (SEC.SX1 - ch) + ' ' + r1(shaftBot) + ' L' + (SEC.SX0 + ch) + ' ' + r1(shaftBot) +
        ' L' + SEC.SX0 + ' ' + r1(shaftBot - ch) + ' L' + SEC.SX0 + ' ' + r1(shaftTop + ch) + ' Z');

      var over = r.clearance < 0;
      var overH = r1(Math.abs(wallTop - shaftTop));
      setAttrs(sec.overTop, { y: r1(Math.min(wallTop, shaftTop)), height: over ? overH : 0 });
      setAttrs(sec.overBot, { y: r1(Math.min(wallBot, shaftBot)), height: over ? overH : 0 });
      sec.overTop.style.display = over ? '' : 'none';
      sec.overBot.style.display = over ? '' : 'none';

      // the dimension on the bottom side: gap or overlap, per side
      var y1 = Math.min(wallBot, shaftBot), y2 = Math.max(wallBot, shaftBot);
      var tiny = (y2 - y1) < 10;
      if (r.clearance === 0) {
        sec.dim.style.display = 'none';
      } else {
        sec.dim.style.display = '';
        if (tiny) {   // arrows outside, pointing in
          setAttrs(sec.dim, { y1: r1(y1 - 14), y2: r1(y2 + 14) });
        } else {
          setAttrs(sec.dim, { y1: r1(y1), y2: r1(y2) });
        }
      }
      setAttrs(sec.dimLead, { points: '440,' + r1((y1 + y2) / 2) + ' 480,' + r1((y1 + y2) / 2) + ' 480,280' });
      if (r.clearance > 0) {
        sec.dimText1.textContent = halfU(r.clearance, u);
        sec.dimText2.textContent = 'gap, each side';
      } else if (r.clearance < 0) {
        sec.dimText1.textContent = halfU(-r.clearance, u);
        sec.dimText2.textContent = 'overlap, each side';
      } else {
        sec.dimText1.textContent = 'Same size';
        sec.dimText2.textContent = 'no gap, no overlap';
      }
      $(lab, '[data-tf-sec-desc]').textContent =
        'Hole ' + fmtU(state.hole, u) + ', shaft ' + fmtU(state.shaft, u) + '. ' + pairSentence(r.clearance, u);

      // map: crosshair and dot
      var dx = r1(mapX(state.hole)), dy = r1(mapY(state.shaft));
      setAttrs(map.crossH, { x1: MAP.X0, x2: dx, y1: dy, y2: dy });
      setAttrs(map.crossV, { x1: dx, x2: dx, y1: dy, y2: MAP.Y1 });
      map.dot.setAttribute('transform', 'translate(' + dx + ' ' + dy + ')');
      map.dot.setAttribute('data-pass', r.bothInSpec ? 'yes' : 'no');

      // part controls
      ['hole', 'shaft'].forEach(function (part) {
        var ins = r[part], lim = r[part + 'Limits'];
        sizes[part].textContent = fmtU(state[part], u);
        ranges[part].value = state[part];
        var txt = inspectText(ins, lim, u);
        inspects[part].textContent = txt;
        inspects[part].setAttribute('data-pass', ins.inSpec ? 'yes' : 'no');
        ranges[part].setAttribute('aria-valuetext', fmtU(state[part], u) + ', ' + txt);
        $(lab, '[data-tf-part="' + part + '"]').setAttribute('data-pass', ins.inSpec ? 'yes' : 'no');
      });

      // results
      var pairBox = $(lab, '[data-tf-pair-box]');
      pairBox.setAttribute('data-kind', r.kind);
      var pv = $(lab, '[data-tf-pair-v]'), ps = $(lab, '[data-tf-pair-s]');
      if (r.kind === 'clearance') {
        pv.textContent = fmtU(r.clearance, u, true) + ' clearance';
        ps.textContent = 'A gap: ' + halfU(r.clearance, u) + ' on each side when the shaft is centred. Actual assembly also depends on shape and surface condition.';
      } else if (r.kind === 'interference') {
        pv.textContent = fmtU(r.clearance, u, true) + ' interference';
        ps.textContent = 'An overlap: the shaft is bigger than the hole by ' + fmtU(-r.clearance, u) + ' (' + halfU(-r.clearance, u) + ' each side). Assembly method and force are not calculated.';
      } else {
        pv.textContent = fmtU(0, u) + ' — line-to-line';
        ps.textContent = 'Exactly the same size: no gap and no overlap. Whether that assembles depends on things this model leaves out.';
      }
      var envBox = $(lab, '[data-tf-env-box]');
      envBox.setAttribute('data-kind', env.kind);
      $(lab, '[data-tf-env-v]').textContent = fmt(env.min, u, true) + ' to ' + fmtU(env.max, u, true);
      $(lab, '[data-tf-env-s]').textContent = envelopeSentence(env, u);

      // mission
      var mission = $(lab, '[data-tf-mission]');
      mission.setAttribute('data-state', r.inSpecButInterferes ? 'found' : (r.bothInSpec ? 'open' : 'reject'));
      mission.innerHTML = missionHtml(r, env, u);

      // worked arithmetic
      $(lab, '[data-tf-work]').innerHTML =
        '<p><span class="tf-k">This pair</span> clearance = hole − shaft = ' + fmt(state.hole, u) + ' − ' + fmt(state.shaft, u) +
          ' = <strong>' + fmtU(r.clearance, u, true) + '</strong>' +
          (r.clearance !== 0 ? '; per side = ' + fmt(absCount(r.clearance), u) + ' ÷ 2 = ' + halfU(absCount(r.clearance), u) : '') + '</p>' +
        '<p><span class="tf-k">Tightest legal pair</span> smallest hole − largest shaft = ' + fmt(env.tightest.hole, u) + ' − ' +
          fmt(env.tightest.shaft, u) + ' = <strong>' + fmtU(env.min, u, true) + '</strong></p>' +
        '<p><span class="tf-k">Loosest legal pair</span> largest hole − smallest shaft = ' + fmt(env.loosest.hole, u) + ' − ' +
          fmt(env.loosest.shaft, u) + ' = <strong>' + fmtU(env.max, u, true) + '</strong></p>';
      return r;
    }

    function inspectText(ins, lim, u) {
      if (ins.state === 'under') { return '✕ Rejected: ' + fmtU(ins.by, u) + ' under the smallest size allowed'; }
      if (ins.state === 'over') { return '✕ Rejected: ' + fmtU(ins.by, u) + ' over the largest size allowed'; }
      if (ins.state === 'at-min') { return '✓ Passes: exactly on the lower limit, which counts'; }
      if (ins.state === 'at-max') { return '✓ Passes: exactly on the upper limit, which counts'; }
      return '✓ Passes: inside ' + fmt(lim.min, u) + ' to ' + fmtU(lim.max, u);
    }

    function pairSentence(c, u) {
      if (c > 0) { return 'Gap of ' + fmtU(c, u) + ' on the diameter, ' + halfU(c, u) + ' on each side.'; }
      if (c < 0) { return 'Overlap of ' + fmtU(-c, u) + ' on the diameter, ' + halfU(-c, u) + ' on each side.'; }
      return 'Same size: no gap, no overlap.';
    }

    function missionHtml(r, env, u) {
      if (!r.bothInSpec) {
        return '<strong>A diameter is outside its limits.</strong> Bring both diameters inside this drawing\'s limits to compare permitted pairs.';
      }
      if (r.inSpecButInterferes && env.kind === 'transition') {
        return '<strong>Found it.</strong> Both parts pass inspection on their own, and together they overlap by ' + fmtU(-r.clearance, u) +
          '. Inspection checks one part at a time; whether two parts go together is decided by the drawing.';
      }
      if (env.kind === 'transition') {
        return '<strong>Challenge:</strong> choose two in-tolerance diameters that overlap. The tightest permitted pair overlaps by ' + fmtU(-env.min, u) + '.';
      }
      if (env.kind === 'clearance') {
        return env.boundary
          ? '<strong>No overlap is permitted.</strong> The tightest pair is line-to-line: no gap and no overlap. Diameter alone does not decide whether that pair assembles.'
          : '<strong>Every permitted pair has a gap.</strong> Even the tightest pair keeps ' + fmtU(env.min, u) + ' of diametral clearance. An overlap would require a diameter outside its limits.';
      }
      return env.boundary
        ? '<strong>Overlap or line-to-line contact.</strong> The loosest pair meets exactly; other permitted pairs overlap. No permitted pair has a positive gap.'
        : '<strong>Every permitted pair overlaps.</strong> Even the loosest pair has ' + fmtU(-env.max, u) + ' of diametral interference. Assembly method and force are outside this model.';
    }

    function announce() {
      var r = M.evaluate(state.spec, state.hole, state.shaft), u = state.unit;
      live.textContent = 'Hole ' + fmtU(state.hole, u) + (r.hole.inSpec ? ', passes. ' : ', rejected. ') +
        'Shaft ' + fmtU(state.shaft, u) + (r.shaft.inSpec ? ', passes. ' : ', rejected. ') + pairSentence(r.clearance, u) +
        (r.inSpecButInterferes ? ' Both pass inspection and still overlap.' : '');
    }

    function setPair(hole, shaft, speak) {
      state.hole = M.clamp(hole, state.win.min, state.win.max);
      state.shaft = M.clamp(shaft, state.win.min, state.win.max);
      update();
      if (speak) { announce(); }
    }

    /* ---- "run 100 assemblies" -------------------------------------------------*/
    var runTimer = null;
    function clearRun() {
      if (runTimer) { clearInterval(runTimer); runTimer = null; }
      map.samples.textContent = '';
      runOut.hidden = true;
      runOut.textContent = '';
    }
    function sampleMark(p) {
      var x = r1(mapX(p.hole)), y = r1(mapY(p.shaft));
      if (p.kind === 'interference') {
        return svgEl('path', { 'class': 'tf-sample tf-sample-over', d: 'M' + (x - 3) + ' ' + (y - 3) + ' L' + (x + 3) + ' ' + (y + 3) + ' M' + (x + 3) + ' ' + (y - 3) + ' L' + (x - 3) + ' ' + (y + 3) });
      }
      if (p.kind === 'line-to-line') {
        return svgEl('rect', { 'class': 'tf-sample tf-sample-touch', x: x - 2.75, y: y - 2.75, width: 5.5, height: 5.5 });
      }
      return svgEl('circle', { 'class': 'tf-sample tf-sample-clear', cx: x, cy: y, r: 2.75 });
    }
    function runAssemblies() {
      clearRun();
      state.runs += 1;
      var res = M.samplePairs(state.spec, 100, M.mulberry32(state.runs * 7919));
      var share = M.pairShare(state.spec);
      var pct = function (n) {
        var v = Math.round(1000 * n / share.total) / 10;
        return v === 0 && n > 0 ? 'under 0.1%' : v + '%';
      };
      var finish = function () {
        runOut.hidden = false;
        runOut.innerHTML =
          '<strong>100 random legal pairs:</strong> ' + res.counts.clearance + ' slid together (○), ' +
          res.counts['line-to-line'] + ' met exactly (□), ' + res.counts.interference + ' overlapped (✕). ' +
          'Counting every possible legal pair instead: ' + pct(share.interfere) + ' overlap. ' +
          '<span class="tf-aside">Sizes here are drawn evenly from anywhere between the limits. Real machining clusters sizes, so read this as an illustration of the drawing, not a forecast for a shop.</span>';
        live.textContent = '100 random legal pairs: ' + res.counts.clearance + ' slid, ' + res.counts['line-to-line'] + ' met exactly, ' +
          res.counts.interference + ' overlapped.';
      };
      if (reduceMotion.matches) {
        res.pairs.forEach(function (p) { map.samples.appendChild(sampleMark(p)); });
        finish();
        return;
      }
      var i = 0;
      runTimer = setInterval(function () {
        for (var k = 0; k < 5 && i < res.pairs.length; k++, i++) { map.samples.appendChild(sampleMark(res.pairs[i])); }
        if (i >= res.pairs.length) { clearInterval(runTimer); runTimer = null; finish(); }
      }, 30);
    }

    /* ---- the drawing form -------------------------------------------------*/
    var form = $(lab, '[data-tf-form]');
    var errors = $(lab, '[data-tf-errors]');
    function field(k) { return $(form, '[data-tf-field="' + k + '"]'); }
    function fillForm() {
      var s = state.spec, u = s.unit;
      field('nominal').value = fmt(s.nominal, u);
      field('hu').value = fmt(s.hole.upper, u, true).replace(MINUS, '-');
      field('hl').value = fmt(s.hole.lower, u, true).replace(MINUS, '-');
      field('su').value = fmt(s.shaft.upper, u, true).replace(MINUS, '-');
      field('sl').value = fmt(s.shaft.lower, u, true).replace(MINUS, '-');
      errors.textContent = '';
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var u = state.unit, out = {}, msgs = [], rounded = false;
      var names = { nominal: 'Nominal size', hu: 'Hole upper deviation', hl: 'Hole lower deviation', su: 'Shaft upper deviation', sl: 'Shaft lower deviation' };
      Object.keys(names).forEach(function (k) {
        var p = M.parseToCounts(field(k).value, u);
        if (!p.ok) { msgs.push(names[k] + ': ' + p.error); field(k).setAttribute('aria-invalid', 'true'); }
        else { out[k] = p.counts; rounded = rounded || p.rounded; field(k).removeAttribute('aria-invalid'); }
      });
      var spec = null;
      if (!msgs.length) {
        spec = { unit: u, nominal: out.nominal, hole: { upper: out.hu, lower: out.hl }, shaft: { upper: out.su, lower: out.sl } };
        var v = M.validateSpec(spec);
        if (!v.ok) { msgs = msgs.concat(v.errors); }
      }
      if (msgs.length) {
        errors.innerHTML = msgs.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('');
        return;
      }
      loadSpec(spec, midOf(spec, 'hole'), midOf(spec, 'shaft'), null);
      if (rounded) { errors.innerHTML = '<li class="tf-note">Rounded to the nearest ' + esc(M.UNITS[u].step) + '.</li>'; }
      live.textContent = 'Your drawing is loaded. ' + envelopeSentence(M.envelope(spec), u);
    });

    /* ---- wiring --------------------------------------------------------------*/
    lab.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b || !lab.contains(b)) { return; }
      var pid = b.getAttribute('data-tf-preset');
      if (pid) {
        loadPreset(pid);
        live.textContent = b.textContent + '. ' + envelopeSentence(M.envelope(state.spec), state.unit);
        return;
      }
      var jump = b.getAttribute('data-tf-jump');
      if (!jump) { return; }
      var env = M.envelope(state.spec);
      if (jump === 'tightest') { setPair(env.tightest.hole, env.tightest.shaft, true); }
      else if (jump === 'loosest') { setPair(env.loosest.hole, env.loosest.shaft, true); }
      else if (jump === 'random') {
        state.runs += 1;
        var rng = M.mulberry32(state.runs * 104729);
        var hl = M.limits(state.spec, 'hole'), sl = M.limits(state.spec, 'shaft');
        setPair(hl.min + Math.floor(rng() * (hl.max - hl.min + 1)), sl.min + Math.floor(rng() * (sl.max - sl.min + 1)), true);
      }
      else if (jump === 'run') { runAssemblies(); }
    });

    ['hole', 'shaft'].forEach(function (part) {
      ranges[part].addEventListener('input', function () {
        state[part] = parseInt(ranges[part].value, 10);
        update();
      });
      ranges[part].addEventListener('change', announce);
    });

    $$(lab, 'input[name="' + id + '-unit"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (!radio.checked || radio.value === state.unit) { return; }
        var keep = state.presetId || 'slides';
        state.unit = radio.value;
        renderPresetButtons();
        loadPreset(keep);
        live.textContent = 'Switched to ' + M.UNITS[state.unit].name + ' drawings. ' + envelopeSentence(M.envelope(state.spec), state.unit);
        document.dispatchEvent(new CustomEvent('tolerance-fit:unit', { detail: { unit: state.unit } }));
      });
    });

    /* Pointer on the pair map. A mouse or pen can drag; a finger only taps,
       so a phone user swiping past the figure still scrolls the page. */
    function pointToPair(e) {
      var ctm = mapSvg.getScreenCTM();
      if (!ctm) { return null; }
      var pt = mapSvg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      var p = pt.matrixTransform(ctm.inverse());
      var k = mapK();
      return { hole: Math.round(state.win.min + (p.x - MAP.X0) / k), shaft: Math.round(state.win.min + (MAP.Y1 - p.y) / k) };
    }
    var dragging = false;
    mapSvg.addEventListener('pointerdown', function (e) {
      var q = pointToPair(e);
      if (!q) { return; }
      setPair(q.hole, q.shaft, e.pointerType === 'touch');
      if (e.pointerType !== 'touch') {
        dragging = true;
        try { mapSvg.setPointerCapture(e.pointerId); } catch (err) { /* older engines */ }
        e.preventDefault();
      }
    });
    mapSvg.addEventListener('pointermove', function (e) {
      if (!dragging) { return; }
      var q = pointToPair(e);
      if (q) { setPair(q.hole, q.shaft, false); }
    });
    function endDrag() { if (dragging) { dragging = false; announce(); } }
    mapSvg.addEventListener('pointerup', endDrag);
    mapSvg.addEventListener('pointercancel', endDrag);

    /* The challenge can hand a drawing to the lab. */
    document.addEventListener('tolerance-fit:load', function (e) {
      var spec = e.detail && e.detail.spec;
      if (!spec || !M.validateSpec(spec).ok) { return; }
      if (spec.unit !== state.unit) { state.unit = spec.unit; renderPresetButtons(); }
      loadSpec(spec, midOf(spec, 'hole'), midOf(spec, 'shaft'), null);
      var card = root.closest && root.closest('details');
      if (card && !card.open) { card.open = true; }
      lab.scrollIntoView({ block: 'start', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      live.textContent = 'The challenge drawing is loaded in the lab. ' + envelopeSentence(M.envelope(spec), spec.unit);
    });

    renderPresetButtons();
    loadPreset('either');
  }

  /* =========================================================================
     The challenge: call the fit from the drawing alone
     =======================================================================*/
  function initChallenge(root) {
    var id = 'tf' + (++instance);
    var host = document.createElement('div');
    host.innerHTML =
      '<div class="tf-challenge">' +
        '<p class="tf-ch-head"><span class="tf-k" data-tf-ch-count></span><span class="tf-k" data-tf-ch-score></span></p>' +
        '<dl class="tf-drawing">' +
          '<div class="tf-callout tf-callout-hole"><dt>Hole</dt><dd data-tf-ch-hole></dd></div>' +
          '<div class="tf-callout tf-callout-shaft"><dt>Shaft</dt><dd data-tf-ch-shaft></dd></div>' +
        '</dl>' +
        '<div class="tf-ch-answers" role="group" aria-labelledby="' + id + '-q">' +
          '<p id="' + id + '-q" class="tf-ch-q">What kind of fit is this?</p>' +
          '<button type="button" data-tf-call="clearance">Clearance</button>' +
          '<button type="button" data-tf-call="transition">Transition</button>' +
          '<button type="button" data-tf-call="interference">Interference</button>' +
        '</div>' +
        '<div class="tf-ch-reveal" data-tf-ch-reveal hidden tabindex="-1">' +
          '<p class="tf-ch-verdict" data-tf-ch-verdict></p>' +
          '<div class="tf-work" data-tf-ch-work></div>' +
          '<p class="tf-ch-actions">' +
            '<button type="button" data-tf-ch-open>Open this drawing in the lab</button>' +
            '<button type="button" data-tf-ch-next>Next drawing</button>' +
          '</p>' +
        '</div>' +
        '<p class="sr-only" aria-live="polite" data-tf-ch-live></p>' +
      '</div>';
    var ch = host.firstChild;
    root.insertBefore(ch, root.firstChild);
    root.classList.add('tf-live');
    guardKeys(root);

    var st = { unit: 'in', i: 0, answered: false, score: 0, done: 0 };
    var hasLab = !!document.querySelector('[data-interactive="tolerance-fit"]:not([data-tf-view="challenge"])');
    if (!hasLab) { $(ch, '[data-tf-ch-open]').hidden = true; }

    function item() { return M.CHALLENGES[st.unit][st.i]; }

    function show() {
      var c = item(), s = c.spec, n = M.CHALLENGES[st.unit].length;
      st.answered = false;
      $(ch, '[data-tf-ch-count]').textContent = 'Drawing ' + (st.i + 1) + ' of ' + n;
      $(ch, '[data-tf-ch-score]').textContent = st.done ? 'Called right: ' + st.score + ' of ' + st.done : '';
      $(ch, '[data-tf-ch-hole]').textContent = callout(s, 'hole');
      $(ch, '[data-tf-ch-shaft]').textContent = callout(s, 'shaft');
      $$(ch, '[data-tf-call]').forEach(function (b) { b.disabled = false; b.removeAttribute('data-picked'); b.removeAttribute('data-answer'); });
      $(ch, '[data-tf-ch-reveal]').hidden = true;
    }

    function call(kind) {
      if (st.answered) { return; }
      st.answered = true;
      var c = item(), s = c.spec, u = s.unit, env = M.envelope(s);
      var right = kind === env.kind;
      st.done += 1;
      if (right) { st.score += 1; }
      $$(ch, '[data-tf-call]').forEach(function (b) {
        var k = b.getAttribute('data-tf-call');
        b.disabled = true;
        if (k === kind) { b.setAttribute('data-picked', right ? 'right' : 'wrong'); }
        if (k === env.kind) { b.setAttribute('data-answer', 'true'); }
      });
      var hl = M.limits(s, 'hole'), sl = M.limits(s, 'shaft');
      $(ch, '[data-tf-ch-verdict]').innerHTML = (right ? '<strong>✓ Right.</strong> ' : '<strong>✕ Not this time.</strong> ') +
        esc(envelopeSentence(env, u));
      $(ch, '[data-tf-ch-work]').innerHTML =
        '<p><span class="tf-k">Hole limits</span> ' + esc(plus(s.nominal, s.hole.lower, u) + ' = ' + fmt(hl.min, u) + ';  ' + plus(s.nominal, s.hole.upper, u) + ' = ' + fmtU(hl.max, u)) + '</p>' +
        '<p><span class="tf-k">Shaft limits</span> ' + esc(plus(s.nominal, s.shaft.lower, u) + ' = ' + fmt(sl.min, u) + ';  ' + plus(s.nominal, s.shaft.upper, u) + ' = ' + fmtU(sl.max, u)) + '</p>' +
        '<p><span class="tf-k">Tightest legal pair</span> ' + esc(fmt(hl.min, u) + ' − ' + fmt(sl.max, u)) + ' = <strong>' + esc(fmtU(env.min, u, true)) + '</strong></p>' +
        '<p><span class="tf-k">Loosest legal pair</span> ' + esc(fmt(hl.max, u) + ' − ' + fmt(sl.min, u)) + ' = <strong>' + esc(fmtU(env.max, u, true)) + '</strong></p>';
      $(ch, '[data-tf-ch-next]').textContent = st.i + 1 < M.CHALLENGES[st.unit].length ? 'Next drawing' : 'Start again';
      var reveal = $(ch, '[data-tf-ch-reveal]');
      reveal.hidden = false;
      $(ch, '[data-tf-ch-score]').textContent = 'Called right: ' + st.score + ' of ' + st.done;
      $(ch, '[data-tf-ch-live]').textContent = (right ? 'Right. ' : 'Not this time. ') + envelopeSentence(env, u);
      reveal.focus({ preventScroll: true });
    }

    ch.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b || !ch.contains(b)) { return; }
      var kind = b.getAttribute('data-tf-call');
      if (kind) { call(kind); return; }
      if (b.hasAttribute('data-tf-ch-next')) {
        if (st.i + 1 >= M.CHALLENGES[st.unit].length) { st.i = 0; st.score = 0; st.done = 0; } else { st.i += 1; }
        show();
        var first = $(ch, '[data-tf-call]');
        if (first) { first.focus(); }
        return;
      }
      if (b.hasAttribute('data-tf-ch-open')) {
        document.dispatchEvent(new CustomEvent('tolerance-fit:load', { detail: { spec: M.cloneSpec(item().spec) } }));
      }
    });

    document.addEventListener('tolerance-fit:unit', function (e) {
      var u = e.detail && e.detail.unit;
      if (!u || u === st.unit || !M.CHALLENGES[u]) { return; }
      st.unit = u; st.i = 0; st.score = 0; st.done = 0;
      show();
    });

    show();
  }

  function boot() {
    $$(document, '[data-interactive="tolerance-fit"]').forEach(function (root) {
      if (root.getAttribute('data-tf-ready')) { return; }
      root.setAttribute('data-tf-ready', '1');
      if (root.getAttribute('data-tf-view') === 'challenge') { initChallenge(root); } else { initLab(root); }
    });
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); }
  else { boot(); }
})();
