/* ============================================================================
   feeds-and-speeds / demo.js - draws model.js and runs the calculator.

   The render functions are pure (numbers in, SVG markup out) and exported
   for Node. The printed figures in the page source are their output, so the
   paper copy and the live demo are the same drawing.

   The cutter itself is never drawn here. It comes from the shared
   cutter-geometry module (CourseWikiCutter.render), the same primitive the
   milling-direction demo paints, so the two pages cannot drift apart.

   The live calculator is built here rather than authored in the page, so
   the page source, search index and printed aggregate carry the teaching
   text and static figures - never a form that does nothing.
   ==========================================================================*/
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var model = node ? require('./model.js') : root.CourseWikiFeedsSpeeds;
  var cutter = null;
  if (node) {
    try { cutter = require('../cutter-geometry/cutter.js'); } catch (e) { cutter = null; }
  }
  var api = factory(model, function () { return cutter || root.CourseWikiCutter || null; });
  if (node) module.exports = api;
  else api.boot();
})(typeof self !== 'undefined' ? self : this, function (M, findCutter) {
  'use strict';

  function n(v) { return (Math.round(v * 10) / 10).toString(); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function txt(cls, x, y, s, anchor) {
    return '<text class="' + cls + '" x="' + n(x) + '" y="' + n(y) + '"' +
      (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(s) + '</text>';
  }
  function arrowHead(tx, ty, dx, dy, size) {
    var len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    var bx = tx - ux * size, by = ty - uy * size, w = size * 0.55;
    return 'M' + n(tx) + ' ' + n(ty) + 'L' + n(bx - uy * w) + ' ' + n(by + ux * w) +
      'L' + n(bx + uy * w) + ' ' + n(by - ux * w) + 'Z';
  }

  /* ------------------------------------------------------------------------
     The live panel: the cutter seen down its axis, cutting a slot, and a
     schematic distance record of successive tooth passes. One panel per run.

     run    - { rpm, feed (mm/min), chip (mm/tooth), teeth, diameter (mm) }
     tReal  - real seconds since the clock started
     o      - { unit, title, sub, insetPxPerMm, slowdown, idPrefix,
                cutter (optional API override), ariaLabel }
     ----------------------------------------------------------------------*/
  var PANEL = { w: 560, h: 336, cx: 172, cy: 176, R: 80 };
  var INSET = { x: 372, y: 100, w: 178, h: 168 };

  function renderPanel(run, tReal, o) {
    var opt = o || {}, P = PANEL, I = INSET, unit = opt.unit || 'in';
    var compact = !!opt.compact;
    if (compact) I = { x: 20, y: 390, w: 320, h: 168 };
    opt = Object.assign({}, opt, { insetPosition: I });
    var cx = P.cx, cy = P.cy, R = P.R;
    var mot = M.motion(run, tReal);
    var out = [];
    out.push('<svg class="fs-svg' + (compact ? ' fs-svg-compact' : '') + '" viewBox="0 0 ' + (compact ? 360 : P.w) + ' ' + (compact ? 580 : P.h) + '" role="img" aria-label="' +
      esc(opt.ariaLabel || opt.title || 'Cutter and work') + '" focusable="false">');

    // ---- the work: a plate with the slot the cutter has already cut. Seen
    // down the axis, the work feeds left, so the slot trails to the left.
    var left = 8, right = 344, top = 70, bottom = 282;
    out.push('<path class="fs-stock" fill-rule="evenodd" d="M' + left + ' ' + top + 'L' + right + ' ' + top +
      'L' + right + ' ' + bottom + 'L' + left + ' ' + bottom + 'Z' +
      'M' + left + ' ' + (cy - R) + 'L' + cx + ' ' + (cy - R) +
      'A' + R + ' ' + R + ' 0 0 1 ' + cx + ' ' + (cy + R) + 'L' + left + ' ' + (cy + R) + 'Z"/>');
    out.push('<path class="fs-slot" d="M' + left + ' ' + (cy - R) + 'L' + cx + ' ' + (cy - R) +
      'A' + R + ' ' + R + ' 0 0 1 ' + cx + ' ' + (cy + R) + 'L' + left + ' ' + (cy + R) + 'Z"/>');

    // Texture fixed to the work, at the drawing's true scale. At real feeds
    // it barely moves while the cutter spins - which is the lesson.
    var pxPerMm = R / (run.diameter / 2), L = 30;
    var shift = ((-(mot.workTravel * pxPerMm)) % L + L) % L, marks = '';
    for (var x = left - L + shift; x < right; x += L) {
      if (x < left + 3 || x > right - 9) continue;
      marks += 'M' + n(x) + ' ' + (top + 8) + 'L' + n(x + 6) + ' ' + (top + 18);
      marks += 'M' + n(x) + ' ' + (bottom - 18) + 'L' + n(x + 6) + ' ' + (bottom - 8);
    }
    out.push('<path class="fs-marks" d="' + marks + '"/>');

    // ---- feed arrow, under the work, pointing the way the work moves
    var ay = 312;
    out.push('<path class="fs-feed" d="M' + (cx + 40) + ' ' + ay + 'L' + (cx - 30) + ' ' + ay + '"/>');
    out.push('<path class="fs-feed-head" d="' + arrowHead(cx - 44, ay, -1, 0, 15) + '"/>');
    out.push(txt('fs-t fs-t-feed', compact ? cx : cx + 52, compact ? ay + 28 : ay + 5, 'Work feed ' + M.show(run.feed, 'feed', unit), compact ? 'middle' : 'start'));

    // ---- the cutter, from the shared primitive
    var C = opt.cutter || findCutter();
    if (C && typeof C.render === 'function') {
      out.push('<g class="fs-cutter" transform="translate(' + cx + ' ' + cy + ')">' +
        C.render({ radius: R, teeth: mot.teeth, idPrefix: (opt.idPrefix || 'fs') + '-cut' }) + '</g>');
    } else {
      out.push('<circle class="fs-cutter-missing" cx="' + cx + '" cy="' + cy + '" r="' + R + '"/>');
      out.push(txt('fs-t fs-t-soft', cx, cy + 5, 'cutter drawing not loaded', 'middle'));
    }

    // ---- rotation arrow, clockwise, over the cutter
    var r = R + 16, a0 = 2.35, a1 = 1.55, arc = '';
    for (var k = 0; k <= 14; k++) {
      var aa = a0 + (a1 - a0) * k / 14;
      arc += (k ? 'L' : 'M') + n(cx + r * Math.cos(aa)) + ' ' + n(cy - r * Math.sin(aa));
    }
    out.push('<path class="fs-spin" d="' + arc + '"/>');
    var ae = a1 - 0.1;
    out.push('<path class="fs-spin-head" d="' + arrowHead(cx + r * Math.cos(ae), cy - r * Math.sin(ae),
      Math.sin(a1), Math.cos(a1), 13) + '"/>');

    out.push(renderInset(run, tReal, opt, pxPerMm));

    // ---- title and the two numbers the machine is set to
    out.push(txt('fs-t fs-t-title', 10, 26, opt.title || '', 'start'));
    out.push(txt('fs-t fs-t-soft', 10, 52, opt.sub || (M.show(run.rpm, 'rpm', unit) + ' · ' + run.teeth + ' flutes'), 'start'));
    out.push('</svg>');
    return out.join('');
  }

  /* A schematic distance record, not a machined surface. Ticks record
     successive tooth passes; gold is travel since the most recent pass. */
  function renderInset(run, tReal, opt, mainPxPerMm) {
    var I = opt.insetPosition || INSET, unit = opt.unit || 'in', s = opt.insetPxPerMm || 28 / run.chip;
    var id = (opt.idPrefix || 'fs') + '-inset';
    var tipX = I.x + I.w * 0.62, yU = I.y + 46, yC = I.y + 92, yB = I.y + I.h - 30;
    var out = [];
    out.push('<clipPath id="' + id + '"><rect x="' + I.x + '" y="' + I.y + '" width="' + I.w + '" height="' + I.h + '"/></clipPath>');
    out.push('<rect class="fs-inset" x="' + I.x + '" y="' + I.y + '" width="' + I.w + '" height="' + I.h + '"/>');
    out.push('<g clip-path="url(#' + id + ')">');

    // A distance strip carried left at the same feed; no surface geometry.
    var sliver = M.uncutSliver(run, tReal), faceX = tipX - sliver * s;
    out.push('<rect class="fs-travel" x="' + I.x + '" y="' + yC + '" width="' + I.w + '" height="' + (yB - yC) + '"/>');
    if (faceX < tipX - 0.05) {
      out.push('<rect class="fs-chip" x="' + n(faceX) + '" y="' + yU + '" width="' + n(tipX - faceX) + '" height="' + (yC - yU) + '"/>');
    }
    // one mark per tooth pass, carried left with the work
    var ms = M.marks(run, tReal, undefined, 40), d = '';
    ms.forEach(function (m) {
      var x = tipX - m.offset * s;
      if (x < I.x - 4) return;
      d += 'M' + n(x) + ' ' + (yC - 1) + 'L' + n(x) + ' ' + (yC + 12);
    });
    out.push('<path class="fs-pass" d="' + d + '"/>');
    // the path of the tooth tips, and a flash as a tooth sweeps through
    out.push('<path class="fs-tipline" d="M' + n(tipX) + ' ' + (I.y + 4) + 'L' + n(tipX) + ' ' + (I.y + I.h - 4) + '"/>');
    if (ms.length && ms[0].age * (opt.slowdown || 200) < 0.18) {
      out.push('<path class="fs-flash" d="M' + n(tipX) + ' ' + (I.y + 18) + 'L' + n(tipX) + ' ' + (yC + 14) + '"/>');
    }
    out.push('</g>');

    // scale bar, so the magnification is stated rather than implied
    var bar = M.niceLength(M.fromCanon(unit, 'chip', 40 / s));
    var barPx = M.toCanon(unit, 'chip', bar) * s, bx = I.x + 10, by = I.y + I.h - 12;
    out.push('<path class="fs-scale" d="M' + bx + ' ' + (by - 5) + 'L' + bx + ' ' + by + 'L' + n(bx + barPx) + ' ' + by +
      'L' + n(bx + barPx) + ' ' + (by - 5) + '"/>');
    out.push(txt('fs-t fs-t-small', bx + barPx + 6, by + 1, M.format(bar, 'chip', unit).replace(/0+$/, '').replace(/\.$/, '') + ' ' + M.UNITS[unit].diameter, 'start'));
    var mag = s / mainPxPerMm;
    out.push(txt('fs-t fs-t-small', I.x + 2, I.y - 22, 'Tooth-pass record', 'start'));
    out.push(txt('fs-t fs-t-small fs-t-soft', I.x + 2, I.y - 6, 'distance ×' + roundSig(mag, 2) + ' · schematic', 'start'));
    out.push(txt('fs-t fs-t-small fs-t-soft', tipX - 4, I.y + 22, 'pass here', 'end'));
    out.push(txt('fs-t fs-t-small', I.x + 5, yC + 30, 'table travel', 'start'));
    return out.join('');
  }

  function roundSig(v, sig) {
    if (!(v > 0)) return '0';
    var p = Math.pow(10, Math.floor(Math.log10(v)) - sig + 1);
    return M.format(Math.round(v / p) * p, 'rpm', 'in');
  }

  /* ------------------------------------------------------------------------
     The paper figure: one setup and two ways of doubling its spindle speed,
     all over the SAME stretch of time - two turns of the setup's cutter.
     A mark is one tooth pass; mark spacing is the feed per tooth; the bar is
     how far the table moved. Exported for the page's static figure.
     ----------------------------------------------------------------------*/
  function renderComparison(canon, unit, opts) {
    var o = opts || {}, factor = o.factor || 2;
    var base = M.solve(canon);
    var rows = [
      { title: 'Setup', run: base },
      { title: 'Spindle ×' + factor + ', table feed held', run: M.trial(canon, factor, 'feed') },
      { title: 'Spindle ×' + factor + ', chip load held', run: M.trial(canon, factor, 'chip') }
    ];
    var span = 2 * 60 / base.rpm;                         // real seconds: two setup turns
    var maxTravel = Math.max.apply(null, rows.map(function (r) { return r.run.feed / 60 * span; }));
    var tipX = 520, x0 = 24, s = (tipX - x0) / maxTravel;   // px per mm, shared by every row
    var H = 96, top = 24, out = [];
    out.push('<svg class="fs-compare-svg" viewBox="0 0 560 ' + (top + H * rows.length + 30) + '" role="img" aria-label="' +
      esc('Three rows over the same two turns of the setup cutter. Setup: ' + 2 * base.teeth + ' tooth passes. Doubling the spindle speed and holding the table feed: ' +
        'twice the passes over the same table travel, so each tooth takes half the chip. Doubling the spindle speed and holding the chip load: ' +
        'twice the passes, each the same size, so the table travels twice as far.') + '" focusable="false">');
    out.push('<path class="fs-tipline" d="M' + tipX + ' ' + (top - 8) + 'L' + tipX + ' ' + (top + H * rows.length - 10) + '"/>');
    out.push(txt('fs-t fs-t-small fs-t-soft', tipX - 4, top - 10 + 2, 'front of the cut', 'end'));
    rows.forEach(function (row, i) {
      var y = top + i * H, r = row.run;
      var travel = r.feed / 60 * span;
      var passes = Math.round(span * r.rpm * r.teeth / 60);
      out.push(txt('fs-t fs-t-tag', x0, y + 22, row.title, 'start'));
      out.push(txt('fs-t fs-t-soft', x0, y + 42, M.show(r.rpm, 'rpm', unit) + ' · ' + M.show(r.feed, 'feed', unit) +
        ' · ' + M.show(r.chip, 'chip', unit), 'start'));
      var by = y + 56;
      out.push('<rect class="fs-travel" x="' + n(tipX - travel * s) + '" y="' + by + '" width="' + n(travel * s) + '" height="14"/>');
      var d = '';
      for (var k = 0; k < passes; k++) {
        var x = tipX - k * r.chip * s;
        d += 'M' + n(x) + ' ' + (by - 4) + 'L' + n(x) + ' ' + (by + 18);
      }
      out.push('<path class="fs-pass" d="' + d + '"/>');
      out.push(txt('fs-t fs-t-small', tipX - travel * s + 6, by + 32, passes + ' passes', 'start'));
    });
    var ly = top + H * rows.length + 12;
    out.push('<path class="fs-pass" d="M' + x0 + ' ' + (ly - 9) + 'L' + x0 + ' ' + (ly + 5) + '"/>');
    out.push(txt('fs-t fs-t-small', x0 + 8, ly + 2, 'one tooth pass', 'start'));
    out.push('<rect class="fs-travel" x="' + (x0 + 150) + '" y="' + (ly - 7) + '" width="26" height="10"/>');
    out.push(txt('fs-t fs-t-small', x0 + 184, ly + 2, 'table travel in the same time', 'start'));
    out.push('</svg>');
    return out.join('');
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

  /* The arithmetic, written out with the numbers in it. Returns plain-text
     lines; the demo and the tests share them. */
  function workedLines(canon, unit) {
    var s = M.solve(canon), u = M.UNITS[unit], lines = [];
    var D = M.format(M.fromCanon(unit, 'diameter', canon.diameter), 'diameter', unit);
    var V = M.format(M.fromCanon(unit, 'speed', canon.speed), 'speed', unit);
    var fz = M.format(M.fromCanon(unit, 'chip', canon.chip), 'chip', unit);
    var rpmReq = M.format(s.requestedRpm, 'rpm', unit), rpm = M.format(s.rpm, 'rpm', unit);
    if (unit === 'in') {
      lines.push('Spindle speed = 12 × cutting speed ÷ (π × diameter) = 12 × ' + V + ' ÷ (π × ' + D + ') ≈ ' + rpmReq + ' rev/min');
    } else {
      lines.push('Spindle speed = 1000 × cutting speed ÷ (π × diameter) = 1000 × ' + V + ' ÷ (π × ' + D + ') ≈ ' + rpmReq + ' rev/min');
    }
    if (s.capped) {
      lines.push('The machine tops out at ' + rpm + ' rev/min, so that is the speed it runs. Everything below uses ' + rpm + '.');
    }
    lines.push('Table feed = spindle speed × flutes × feed per tooth = ' + rpm + ' × ' + canon.teeth + ' × ' + fz +
      ' ≈ ' + M.show(s.feed, 'feed', unit));
    if (s.capped) {
      var back = unit === 'in'
        ? 'π × ' + D + ' × ' + rpm + ' ÷ 12'
        : 'π × ' + D + ' × ' + rpm + ' ÷ 1000';
      lines.push('Cutting speed actually reached = ' + back + ' ≈ ' + M.show(s.speed, 'speed', unit) +
        ', not the ' + V + ' ' + u.speedShort + ' asked for.');
    }
    return lines;
  }

  /* Screen-reader and readout text for a trial against its setup. */
  function describeTrial(canon, t, unit) {
    var held = t.hold === 'chip' ? 'chip load held' : 'table feed held';
    var parts = ['Spindle ' + M.show(t.rpm, 'rpm', unit) + (t.capped ? ' (machine top speed)' : ''), held,
      'table feed ' + M.show(t.feed, 'feed', unit) + ' (' + M.ratioText(t.change.feed) + ')',
      'chip load ' + M.show(t.chip, 'chip', unit) + ' (' + M.ratioText(t.change.chip) + ')',
      'cutting speed ' + M.show(t.speed, 'speed', unit) + ' (' + M.ratioText(t.change.speed) + ')'];
    return parts.join(', ') + '.';
  }

  /* Inset scale: about 28 px per feed per tooth of the setup. Fixed while
     the experiment runs, so a thinner chip LOOKS thinner. */
  function insetScale(canon) { return 28 / canon.chip; }

  /* ========================================================================
     Live demo
     ======================================================================*/
  var NAV_KEYS = { ' ': 1, 'Spacebar': 1, 'ArrowLeft': 1, 'ArrowRight': 1, 'ArrowUp': 1, 'ArrowDown': 1,
    'PageUp': 1, 'PageDown': 1, 'Home': 1, 'End': 1 };

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function wire(rootEl) {
    if (rootEl.hasAttribute('data-fs-wired')) return;
    rootEl.setAttribute('data-fs-wired', '');
    var host = rootEl.querySelector('[data-fs-live]') || rootEl;
    var uid = 'fs' + Math.random().toString(36).slice(2, 8);
    var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

    var first = M.EXAMPLES.in[0];
    var state = {
      unit: 'in', canon: M.setupToCanon('in', first), exampleId: first.id,
      factor: 1, hold: 'feed', slowdown: 200, tScreen: 0, playing: false, scale: 0
    };
    state.scale = insetScale(state.canon);

    // Keep the page's own arrow-key and Space navigation off our controls.
    rootEl.addEventListener('keydown', function (e) {
      if (!NAV_KEYS[e.key]) return;
      var t = e.target;
      if (t && t !== rootEl && t.matches && t.matches('button, input, select, textarea, summary, [tabindex]')) e.stopPropagation();
    });

    // ---- top bar: units and illustrative examples
    var bar = el('div', { class: 'fs-bar' });
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
    var exWrap = el('div', { class: 'fs-examples', role: 'group', 'aria-label': 'Illustrative examples' });
    exWrap.appendChild(el('span', { class: 'fs-k' }, 'Illustrative numbers - not cutting data'));
    var exRow = el('div', { class: 'fs-example-row' });
    exWrap.appendChild(exRow);
    bar.appendChild(exWrap); bar.appendChild(units);

    // ---- the form
    var form = el('div', { class: 'fs-form' });
    var FIELDS = [
      { key: 'diameter', label: 'Cutter diameter' },
      { key: 'speed', label: 'Cutting speed' },
      { key: 'teeth', label: 'Flutes' },
      { key: 'chip', label: 'Feed per tooth (chip load)' },
      { key: 'maxRpm', label: 'Machine top speed (optional)' }
    ];
    var inputs = {}, unitTags = {};
    FIELDS.forEach(function (f) {
      var p = el('p');
      var lab = el('label', { for: uid + '-' + f.key });
      lab.appendChild(el('span', {}, f.label));
      var tag = el('span', { class: 'fs-unit' });
      lab.appendChild(tag);
      var input = el('input', { id: uid + '-' + f.key, type: 'text', inputmode: f.key === 'teeth' || f.key === 'maxRpm' ? 'numeric' : 'decimal',
        autocomplete: 'off', spellcheck: 'false', 'data-fs-field': f.key });
      if (f.key === 'maxRpm') input.setAttribute('placeholder', 'no limit');
      p.appendChild(lab); p.appendChild(input);
      form.appendChild(p);
      inputs[f.key] = input; unitTags[f.key] = tag;
    });
    var errors = el('ul', { class: 'fs-errors', 'aria-live': 'polite' });

    // ---- results
    var results = el('div', { class: 'fs-results' });
    var tiles = {};
    [['rpm', 'Spindle speed', 'set this on the machine'], ['feed', 'Table feed', 'set this on the machine'],
      ['speed', 'Cutting speed reached', 'how fast the edge moves through the work'],
      ['chip', 'Chip load', 'how far the work moves per tooth']].forEach(function (t) {
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
    exp.appendChild(el('p', { class: 'fs-exp-title' }, 'Now change only the spindle speed'));
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
    exp.appendChild(expControls);
    var table = el('table', { class: 'fs-table' });
    var thead = el('thead'), hr = el('tr');
    ['', 'Setup', 'Changed', 'Change'].forEach(function (h, i) { hr.appendChild(el('th', i ? { scope: 'col' } : {}, h)); });
    thead.appendChild(hr); table.appendChild(thead);
    var tbody = el('tbody'), rows = {};
    [['rpm', 'Spindle speed'], ['feed', 'Table feed'], ['chip', 'Chip load'], ['speed', 'Cutting speed']].forEach(function (r) {
      var tr = el('tr', { 'data-row': r[0] });
      tr.appendChild(el('th', { scope: 'row' }, r[1]));
      var a = el('td'), b = el('td'), c = el('td');
      tr.appendChild(a); tr.appendChild(b); tr.appendChild(c);
      tbody.appendChild(tr); rows[r[0]] = { tr: tr, a: a, b: b, c: c };
    });
    table.appendChild(tbody);
    exp.appendChild(table);

    // ---- the drawing
    var transport = el('div', { class: 'fs-transport', role: 'group', 'aria-label': 'Playback' });
    var bPlay = el('button', { type: 'button', class: 'fs-play', 'aria-pressed': 'false' }, 'Play');
    var bReset = el('button', { type: 'button' }, 'Reset');
    var slowP = el('label', { class: 'fs-slow', for: uid + '-slow' });
    slowP.appendChild(el('span', {}, 'Slow motion'));
    var slow = el('select', { id: uid + '-slow' });
    M.SLOWDOWNS.forEach(function (k) {
      var op = el('option', { value: String(k) }, '1/' + M.format(k, 'rpm', 'in') + ' speed');
      if (k === state.slowdown) op.selected = true;
      slow.appendChild(op);
    });
    slowP.appendChild(slow);
    transport.appendChild(bPlay); transport.appendChild(bReset); transport.appendChild(slowP);

    var stage = el('div', { class: 'fs-stage', tabindex: '0', role: 'group',
      'aria-label': 'Cutter drawings. Space plays or pauses, left and right arrows change the spindle speed, Home resets the experiment.',
      'aria-describedby': uid + '-status' });
    var panelA = el('div', { class: 'fs-panel', 'data-run': 'setup' });
    var panelB = el('div', { class: 'fs-panel', 'data-run': 'changed' });
    stage.appendChild(panelA); stage.appendChild(panelB);
    var clock = el('p', { class: 'fs-clock' });
    var fast = el('p', { class: 'fs-fast', hidden: '' });
    var keys = el('p', { class: 'fs-keys' }, 'With the drawing selected: Space plays or pauses, ← → change the spindle speed, Home resets the experiment.');
    var status = el('p', { class: 'sr-only', id: uid + '-status', 'aria-live': 'polite' });

    var calc = el('div', { class: 'fs-calc' });
    [bar, form, errors, results, capNote, work].forEach(function (x) { calc.appendChild(x); });
    var demo = el('div', { class: 'fs-demo' });
    [exp, transport, stage, clock, fast, keys, status].forEach(function (x) { demo.appendChild(x); });
    host.appendChild(calc); host.appendChild(demo);
    rootEl.classList.add('is-live');

    /* ---- behaviour ------------------------------------------------------*/
    function shown(kind, canonValue) {
      if (canonValue === null || canonValue === undefined) return '';
      var v = (kind === 'teeth' || kind === 'maxRpm') ? canonValue : M.fromCanon(state.unit, kind, canonValue);
      return M.format(v, kind, state.unit);
    }
    function fillInputs() {
      FIELDS.forEach(function (f) {
        inputs[f.key].value = shown(f.key, state.canon[f.key]);
        inputs[f.key].removeAttribute('aria-invalid');
        unitTags[f.key].textContent = M.unitLabel(f.key, state.unit);
      });
      errors.textContent = '';
    }
    function renderExamples() {
      exRow.textContent = '';
      M.EXAMPLES[state.unit].forEach(function (ex) {
        var b = el('button', { type: 'button', 'data-fs-example': ex.id, 'aria-pressed': String(ex.id === state.exampleId) }, ex.title);
        b.addEventListener('click', function () {
          state.canon = M.setupToCanon(ex.unit, ex);
          state.exampleId = ex.id;
          state.scale = insetScale(state.canon);
          rootEl.removeAttribute('data-stale');
          fillInputs(); renderExamples(); update(true);
          status.textContent = ex.title + ' loaded. ' + summary();
        });
        exRow.appendChild(b);
      });
    }
    function summary() {
      var s = M.solve(state.canon);
      return 'Spindle ' + M.show(s.rpm, 'rpm', state.unit) + (s.capped ? ', capped by the machine' : '') +
        ', table feed ' + M.show(s.feed, 'feed', state.unit) + '.';
    }
    function trialRun() { return M.trial(state.canon, state.factor, state.hold); }

    function update(announce) {
      var c = state.canon, s = M.solve(c), t = trialRun(), u = state.unit;
      tiles.rpm.v.textContent = M.show(s.rpm, 'rpm', u);
      tiles.rpm.s.textContent = s.capped ? 'machine top speed; ' + M.show(s.requestedRpm, 'rpm', u) + ' was asked for' : tiles.rpm.note;
      tiles.feed.v.textContent = M.show(s.feed, 'feed', u);
      tiles.speed.v.textContent = M.show(s.speed, 'speed', u);
      tiles.speed.s.textContent = s.capped ? 'below the ' + M.show(c.speed, 'speed', u) + ' asked for' : tiles.speed.note;
      tiles.chip.v.textContent = M.show(s.chip, 'chip', u);
      tiles.rpm.box.setAttribute('data-capped', String(s.capped));
      tiles.speed.box.setAttribute('data-capped', String(s.capped));
      capNote.hidden = !s.capped;
      capNote.textContent = s.capped
        ? 'The cutting speed asks for ' + M.show(s.requestedRpm, 'rpm', u) + ', but this machine stops at ' + M.show(s.rpm, 'rpm', u) +
          '. The feed is worked out from the speed the spindle really turns, so each tooth still takes the chip you asked for; the edge simply moves more slowly than the cutting speed you entered.'
        : '';
      work.textContent = '';
      workedLines(c, u).forEach(function (line) { work.appendChild(el('span', { class: 'fs-line' }, line)); });

      spOut.textContent = 'requested ' + M.ratioText(state.factor).replace('unchanged', 'as set') + ' · ' + M.show(t.rpm, 'rpm', u) + (t.capped ? ' (top speed)' : '');
      var keysOrder = ['rpm', 'feed', 'chip', 'speed'];
      keysOrder.forEach(function (k) {
        var r = rows[k];
        r.a.textContent = M.show(s[k], k, u);
        r.b.textContent = M.show(t[k], k, u);
        var held = (k === 'feed' && t.hold === 'feed') || (k === 'chip' && t.hold === 'chip');
        r.c.textContent = held ? 'held' : M.ratioText(t.change[k]);
        r.tr.setAttribute('data-held', String(held));
        r.tr.setAttribute('data-moved', String(!held && Math.abs(t.change[k] - 1) > 5e-4));
      });
      draw();
      if (announce) status.textContent = describeTrial(c, t, u);
    }

    function draw() {
      var c = state.canon, s = M.solve(c), t = trialRun(), u = state.unit;
      var tReal = M.realTime(state.tScreen, state.slowdown);
      var cut = findCutter();
      var compact = panelA.clientWidth < 480;
      panelA.innerHTML = renderPanel(s, tReal, { unit: u, title: 'Setup', insetPxPerMm: state.scale,
        compact: compact, slowdown: state.slowdown, idPrefix: uid + 'a', cutter: cut, ariaLabel: 'Setup: ' + summary() });
      var achieved = t.rpm / s.rpm;
      var title = Math.abs(achieved - 1) < 1e-9 ? (t.capped ? 'Changed · capped at setup RPM' : 'Changed (same as setup)')
        : 'Spindle ' + M.ratioText(achieved) + (t.capped ? ' · capped' : '');
      panelB.innerHTML = renderPanel(t, tReal, { unit: u, title: title, insetPxPerMm: state.scale,
        compact: compact, slowdown: state.slowdown, idPrefix: uid + 'b', cutter: cut, ariaLabel: title + ': ' + describeTrial(c, t, u) });
      var rs = M.screenRates(s, state.slowdown), rt = M.screenRates(t, state.slowdown);
      clock.textContent = 'Shown at 1/' + M.format(state.slowdown, 'rpm', 'in') + ' of real speed, the same for the turning and the feed. ' +
        'In one real second the setup cutter turns ' + M.format(rs.realTurnsPerSecond, 'feed', 'in') + ' times while the work moves ' +
        M.show(rs.realTravelPerSecond, 'travel', u) + '. Time shown: ' + M.format(tReal, 'travel', 'in') + ' s of real cutting.';
      var quick = Math.max(rs.passesPerSecond, rt.passesPerSecond) > 9;
      fast.hidden = !quick;
      fast.textContent = quick ? 'The teeth now pass faster than the eye can follow at this setting. Choose a slower motion to count them.' : '';
    }

    var raf = 0, last = null, stepTimer = 0;
    function tick(ts) {
      if (!state.playing) return;
      var dt = last === null ? 0 : Math.min(0.1, (ts - last) / 1000);
      last = ts;
      state.tScreen += dt;
      draw();
      raf = requestAnimationFrame(tick);
    }
    function stepReduced() {
      // Reduced motion: the same clock, in still frames a quarter-second apart.
      if (!state.playing) return;
      state.tScreen += 0.25;
      draw();
      stepTimer = setTimeout(stepReduced, 800);
    }
    function play(on) {
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
      state.factor = 1; spIn.value = '100';
      state.tScreen = 0;
      update(true);
    }
    function setFactor(pct) {
      var v = Math.max(25, Math.min(200, Math.round(pct / 5) * 5));
      spIn.value = String(v);
      state.factor = v / 100;
      update(true);
    }

    // form edits: each valid field updates the canonical setup in place;
    // an invalid one is marked and the last good setup stays drawn
    function readForm() {
      var raw = {};
      FIELDS.forEach(function (f) { raw[f.key] = inputs[f.key].value; });
      var res = M.validate(state.unit, raw);
      FIELDS.forEach(function (f) { inputs[f.key].removeAttribute('aria-invalid'); });
      errors.textContent = '';
      if (!res.ok) {
        res.errors.forEach(function (e) {
          inputs[e.field].setAttribute('aria-invalid', 'true');
          errors.appendChild(el('li', {}, e.message));
        });
        rootEl.setAttribute('data-stale', 'true');
        return;
      }
      rootEl.removeAttribute('data-stale');
      var changedChip = Math.abs(res.canon.chip - state.canon.chip) > 1e-12;
      // keep the exact canonical value for any field whose text still reads
      // as the displayed rounding of it, so unit round-trips stay exact
      FIELDS.forEach(function (f) {
        if (inputs[f.key].value.trim() === shown(f.key, state.canon[f.key])) res.canon[f.key] = state.canon[f.key];
      });
      state.canon = res.canon;
      state.exampleId = null;
      if (changedChip) state.scale = insetScale(state.canon);
      renderExamples();
      update(false);
    }
    FIELDS.forEach(function (f) {
      inputs[f.key].addEventListener('input', readForm);
      inputs[f.key].addEventListener('change', function () { if (!rootEl.hasAttribute('data-stale')) status.textContent = summary(); });
    });
    Object.keys(unitRadios).forEach(function (u) {
      unitRadios[u].addEventListener('change', function () {
        if (!unitRadios[u].checked || u === state.unit) return;
        state.unit = u;
        rootEl.removeAttribute('data-stale');
        fillInputs(); renderExamples(); update(false);
        status.textContent = 'Switched to ' + M.UNITS[u].name + ' units. Same cutter, same cut: ' + summary();
      });
    });
    Object.keys(holdRadios).forEach(function (h) {
      holdRadios[h].addEventListener('change', function () { if (holdRadios[h].checked) { state.hold = h; update(true); } });
    });
    spIn.addEventListener('input', function () { state.factor = Number(spIn.value) / 100; update(false); });
    spIn.addEventListener('change', function () { update(true); });
    slow.addEventListener('change', function () {
      // keep the same real moment on screen when the time scale changes
      var tReal = M.realTime(state.tScreen, state.slowdown);
      state.slowdown = Number(slow.value);
      state.tScreen = tReal * state.slowdown;
      draw();
    });
    bPlay.addEventListener('click', function () { play(!state.playing); });
    bReset.addEventListener('click', function () { play(false); resetExperiment(); });
    stage.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var used = true;
      switch (e.key) {
        case ' ': case 'Spacebar': play(!state.playing); break;
        case 'ArrowRight': setFactor(state.factor * 100 + 5); break;
        case 'ArrowLeft': setFactor(state.factor * 100 - 5); break;
        case 'Home': play(false); resetExperiment(); break;
        default: used = false;
      }
      if (used) { e.preventDefault(); e.stopPropagation(); }
    });
    if (reduce.addEventListener) reduce.addEventListener('change', function () { if (state.playing) { play(false); play(true); } });
    addEventListener('beforeprint', function () { if (state.playing) play(false); });

    fillInputs(); renderExamples(); update(false);
    if (typeof ResizeObserver === 'function') {
      var lastWidth = panelA.clientWidth;
      new ResizeObserver(function () {
        if (panelA.clientWidth !== lastWidth) { lastWidth = panelA.clientWidth; draw(); }
      }).observe(panelA);
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
    renderPanel: renderPanel, renderComparison: renderComparison, renderCircumference: renderCircumference,
    workedLines: workedLines, describeTrial: describeTrial, insetScale: insetScale,
    PANEL: PANEL, INSET: INSET, boot: boot
  };
});
