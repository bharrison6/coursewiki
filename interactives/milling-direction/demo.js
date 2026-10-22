/* ============================================================================
   milling-direction / demo.js - draws model.js and runs the controls.

   The two render functions are pure (frame in, SVG markup out) and are
   exported for Node, which is how the printed figure in the page source is
   produced: the paper copy and the live demo are the same drawing.

   The live demo is built here rather than authored in the page, so the page
   source, the search index and the printed aggregate carry only teaching
   text and the static figure - never a row of dead buttons.
   ==========================================================================*/
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiMillingDirection,
    node ? require('../cutter-geometry/cutter.js') : root.CourseWikiCutter);
  if (node) module.exports = api;
  else api.boot();
})(typeof self !== 'undefined' ? self : this, function (M, Cutter) {
  'use strict';

  var VIEW = { minX: -238, minY: -162, w: 476, h: 338 };
  var BLOCK_DEPTH = 62;
  var LABEL = { climb: 'Climb milling', conventional: 'Conventional milling' };
  var TREND = { climb: 'thick to thin', conventional: 'thin to thick' };

  function n(v) { return (Math.round(v * 10) / 10).toString(); }
  function pt(p) { return n(p.x) + ' ' + n(-p.y); }               // math y-up to screen
  function path(points, close) {
    if (!points || !points.length) return '';
    var d = 'M' + pt(points[0]);
    for (var i = 1; i < points.length; i++) d += 'L' + pt(points[i]);
    return d + (close ? 'Z' : '');
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pct(r) { return Math.round(r * 100) + '%'; }

  function arrowHead(tip, dir, size) {
    var len = Math.hypot(dir.x, dir.y) || 1, ux = dir.x / len, uy = dir.y / len;
    var bx = tip.x - ux * size, by = tip.y - uy * size;
    return path([tip, { x: bx - uy * size * 0.55, y: by + ux * size * 0.55 },
      { x: bx + uy * size * 0.55, y: by - ux * size * 0.55 }], true);
  }

  function label(x, y, text, cls, anchor) {
    return '<text class="' + cls + '" x="' + n(x) + '" y="' + n(-y) + '" text-anchor="' +
      (anchor || 'middle') + '">' + esc(text) + '</text>';
  }

  /* A small side view of the cutter with a drafting section line across
     its flutes: the arrows say the big drawing is that slice, seen from
     the spindle end. Screen coordinates. */
  function orientationCue(x, y) {
    var out = ['<g class="mill-cue" transform="translate(' + x + ' ' + y + ')">'];
    out.push('<rect class="mill-cue-tool" x="-8" y="0" width="16" height="22" rx="1"/>');
    out.push('<path class="mill-cue-tool" d="M-10 22H10V60L7 63H-7L-10 60Z"/>');
    out.push('<path class="mill-cue-helix" d="M-10 30L10 22M-10 41L10 33M-10 52L10 44M-10 62L10 55"/>');
    out.push('<path class="mill-cue-cut" d="M-22 42H22"/>');
    out.push('<path class="mill-cue-arrow" d="M-22 42V30M22 42V30"/>');
    out.push('<path class="mill-cue-head" d="M-22 46L-26 38H-18ZM22 46L18 38H26Z"/>');
    out.push('<text class="mill-t mill-t-cue" x="0" y="80" text-anchor="middle">slice seen</text>');
    out.push('<text class="mill-t mill-t-cue" x="0" y="96" text-anchor="middle">from spindle</text>');
    out.push('</g>');
    return out.join('');
  }

  /* The work as drawn: block, uncut layer, finished surface. */
  function ground(f, W) {
    var s = f.side, b = f.boundary, bottom = b[0], crest = b[b.length - 1];
    var layer = [{ x: s * W, y: f.stockTop }, crest].concat(b.slice().reverse()).concat([{ x: s * W, y: f.finished }]);
    return '<path class="mill-work" d="' + path(M.workOutline(f, W, BLOCK_DEPTH), true) + '"/>' +
      '<path class="mill-stock" d="' + path(layer, true) + '"/>' +
      '<path class="mill-surface" d="' + path([bottom, { x: s * W, y: f.finished }]) + '"/>';
  }

  /* The slice swept so far, the cutter, and the model's chips for the
     frame's own time - the part every view of a moment shares. `only`
     narrows the chips to one story: 'forming' (the chip on the edge) or
     'leaving' (the one most recently let go). */
  function scene(f, idPrefix, only) {
    var out = [];
    if (f.engaged && f.chip && only !== 'leaving') out.push('<path class="mill-slice" d="' + path(f.chip, true) + '"/>');
    out.push(Cutter.render({ radius: f.R, teeth: f.teeth, idPrefix: idPrefix }));
    var ch = M.chips(f.mode, f.params, f.T);
    if (only === 'forming') ch.released = [];
    if (only === 'leaving') { ch.attached = null; ch.released = ch.released.slice(0, 1); }
    ch.released.forEach(function (c) {
      out.push('<path class="mill-chip is-free" style="opacity:' + n(Math.max(0, 1 - c.age * c.age)) +
        '" d="' + path(c.points, true) + '"/>');
    });
    if (ch.attached) out.push('<path class="mill-chip" d="' + path(ch.attached.points, true) + '"/>');
    return out.join('');
  }

  /* One cutter and its work. `f` is a model frame. The chips drawn are
     the model's for the frame's own time, so the paper figure, a paused
     frame and playback can never disagree. */
  function renderPanel(f, opts) {
    var o = opts || {};
    var R = f.R, s = f.side, W = VIEW.w / 2;
    var out = [];
    var top = f.stockTop, fin = f.finished;

    out.push('<svg class="mill-svg" viewBox="' + VIEW.minX + ' ' + VIEW.minY + ' ' + VIEW.w + ' ' + VIEW.h +
      '" role="img" aria-label="' + esc(o.ariaLabel || LABEL[f.mode]) + '" focusable="false">');

    // ---- the work: one block, the uncut layer on the side it comes from
    out.push(ground(f, W));

    // ---- texture marks that ride with the work, so the feed is visible
    var L = 36, shift = ((f.workAdvance * f.feed.x) % L + L) % L, marks = '';
    for (var x = -W - L + shift; x < W + L; x += L) {
      if (x < -W + 4 || x > W - 4) continue;
      marks += 'M' + n(x) + ' ' + n(-(fin - 10)) + 'L' + n(x - 7) + ' ' + n(-(fin - 22));
    }
    out.push('<path class="mill-marks" d="' + marks + '"/>');

    // ---- feed arrow, on the block, pointing the way the work moves
    var ay = fin - 44, ax0 = -f.feed.x * 40, ax1 = f.feed.x * 40;
    out.push('<path class="mill-feed" d="M' + n(ax0) + ' ' + n(-ay) + 'L' + n(ax1) + ' ' + n(-ay) + '"/>');
    out.push('<path class="mill-feed-head" d="' + arrowHead({ x: ax1 + f.feed.x * 12, y: ay }, f.feed, 16) + '"/>');
    out.push(label(ax0 - f.feed.x * 12, ay - 5, 'Work feed', 'mill-t mill-t-feed', f.feed.x > 0 ? 'end' : 'start'));

    // ---- the slice swept so far, the shared cutter turning clockwise, and
    //      the chips: the one forming on the edge and those already let go
    out.push(scene(f, o.idPrefix || ('mill-' + f.mode)));

    // ---- rotation arrow over the cutter, the same in both modes
    var r = R + 22, a0 = 1.45, a1 = 0.62, arc = [];
    for (var k = 0; k <= 16; k++) { var aa = a0 + (a1 - a0) * k / 16; arc.push({ x: r * Math.cos(aa), y: r * Math.sin(aa) }); }
    out.push('<path class="mill-spin" d="' + path(arc) + '"/>');
    out.push('<path class="mill-spin-head" d="' + arrowHead({ x: r * Math.cos(a1 - 0.08), y: r * Math.sin(a1 - 0.08) },
      { x: Math.sin(a1), y: -Math.cos(a1) }, 14) + '"/>');
    out.push(label(30, r + 22, 'turns clockwise', 'mill-t mill-t-soft', 'start'));
    out.push(orientationCue(194, -152));

    // ---- where the cutting edge still has to go
    if (f.engaged) {
      var psiT = f.teeth[0].psi;
      var exitPsi = f.exitPsi, rest = [];
      for (var e = 0; e <= 20; e++) { var pe = psiT + (exitPsi - psiT) * e / 20; rest.push({ x: R * Math.cos(pe), y: R * Math.sin(pe) }); }
      out.push('<path class="mill-edgepath" d="' + path(rest) + '"/>');
      var c = f.contact, v = f.velocity, tip = { x: c.x + v.x * 58, y: c.y + v.y * 58 };
      out.push('<path class="mill-force" d="M' + pt(c) + 'L' + pt({ x: c.x + v.x * 44, y: c.y + v.y * 44 }) + '"/>');
      out.push('<path class="mill-force-head" d="' + arrowHead(tip, v, 15) + '"/>');
      out.push('<circle class="mill-contact" cx="' + n(c.x) + '" cy="' + n(-c.y) + '" r="5"/>');
      if (f.mode === 'conventional' && f.ratio < 0.15) {
        out.push('<circle class="mill-rub" cx="' + n(c.x) + '" cy="' + n(-c.y) + '" r="13"/>');
      }
      if (f.mode === 'climb' && f.progress < 0.1) {
        out.push('<circle class="mill-bite" cx="' + n(c.x) + '" cy="' + n(-c.y) + '" r="13"/>');
      }
    }

    // ---- entry and exit tags - the whole lesson, written on the drawing
    var enter = f.mode === 'climb' ? 'Enters thick' : 'Enters thin';
    var leave = f.mode === 'climb' ? 'Leaves thin' : 'Leaves thick';
    out.push('<circle class="mill-mark" cx="' + n(f.entry.x) + '" cy="' + n(-f.entry.y) + '" r="4"/>');
    out.push('<circle class="mill-mark" cx="' + n(f.exit.x) + '" cy="' + n(-f.exit.y) + '" r="4"/>');
    // The tag at the top surface sits out on the incoming side; the one at
    // the finished surface sits under the cutter, on the outgoing side.
    var topTag = f.mode === 'climb' ? enter : leave, lowTag = f.mode === 'climb' ? leave : enter;
    out.push(label(s * (R + 70), top + 14, topTag, 'mill-t mill-t-tag'));
    out.push(label(-s * 128, fin - 20, lowTag, 'mill-t mill-t-tag'));

    // ---- title
    out.push(label(VIEW.minX + 14, -VIEW.minY - 26, LABEL[f.mode], 'mill-t mill-t-title', 'start'));
    out.push(label(VIEW.minX + 14, -VIEW.minY - 50, 'Chip runs ' + TREND[f.mode], 'mill-t mill-t-soft', 'start'));
    out.push('</svg>');
    return out.join('');
  }

  /* The life of one chip, four moments per mode, for paper: the same
     model frames and the same scene() the live panels draw, cropped to
     the corner of the cut where the chip forms and leaves. */
  var STORY = { x: -215, y: -130, w: 340, h: 260, gap: 18, caption: 46, head: 40 };
  function storyMoments(params) {
    var q = M.normalise(params);
    var span = M.engagementAngle(q.aeOverD) / (2 * Math.PI / q.teeth);
    return [
      { T: M.timeAtProgress(q, 0, 0.5), only: 'forming', text: '1  Forms on the edge' },
      { T: span * (1 - 1e-6), only: 'forming', text: '2  Finished as it leaves' },
      { T: span + 0.3, only: 'leaving', text: '3  Carried out' },
      { T: span + 0.75, only: 'leaving', text: '4  Thrown clear' }
    ];
  }
  function renderChipStory(params, opts) {
    var o = opts || {}, S = STORY, moments = storyMoments(params);
    var rowH = S.head + S.h + S.caption, W = 4 * S.w + 3 * S.gap, H = 2 * rowH;
    var out = ['<svg class="mill-svg mill-story-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      esc('The life of one chip in four moments, for each direction. 1, the chip forms on the cutting edge and ' +
        'curls into the flute while the slice it comes from is cut. 2, the chip is complete as the tooth leaves the work: ' +
        'in climb milling at the finished surface, with the thick end curled furthest; in conventional milling at the ' +
        'top of the cut, with the thick end at the edge. 3, the flute carries the chip round as it slides out. 4, ' +
        'it is thrown clear: behind the cutter in climb milling, up and away in conventional milling.') +
      '" focusable="false">'];
    M.MODES.forEach(function (mode, row) {
      var y0 = row * rowH;
      out.push('<text class="mill-t mill-t-title" x="0" y="' + (y0 + 30) + '">' + esc(LABEL[mode]) + '</text>');
      moments.forEach(function (m, i) {
        var x0 = i * (S.w + S.gap), f = M.frame(mode, params, m.T);
        out.push('<svg x="' + x0 + '" y="' + (y0 + S.head) + '" width="' + S.w + '" height="' + S.h +
          '" viewBox="' + S.x + ' ' + S.y + ' ' + S.w + ' ' + S.h + '">');
        out.push('<rect class="mill-story-cell" x="' + S.x + '" y="' + S.y + '" width="' + S.w + '" height="' + S.h + '"/>');
        out.push(ground(f, S.w * 2));
        out.push(scene(f, (o.idPrefix || 'mill-story') + '-' + mode + '-' + (i + 1), m.only));
        out.push('</svg>');
        out.push('<text class="mill-t mill-t-tag" x="' + (x0 + 6) + '" y="' + (y0 + S.head + S.h + 32) + '">' + esc(m.text) + '</text>');
      });
    });
    out.push('</svg>');
    return out.join('');
  }

  /* Chip thickness across one tooth's cut, both modes on one axis. */
  function renderGraph(aeOverD, marks, opts) {
    var o = opts || {}, x0 = 64, x1 = 540, y0 = 172, y1 = 26, out = [];
    var X = function (p) { return x0 + (x1 - x0) * p; };
    var Y = function (r) { return y0 - (y0 - y1) * r; };
    var peak = M.peakChipRatio(aeOverD);
    out.push('<svg class="mill-graph-svg" viewBox="0 0 560 222" role="img" aria-label="' +
      esc('Uncut slice thickness through the cut. Climb starts at its peak, ' + pct(peak) +
        ' of the feed per tooth, and falls to zero. Conventional rises from zero to the same peak.') + '" focusable="false">');
    out.push('<path class="mill-axis" d="M' + x0 + ' ' + y1 + 'L' + x0 + ' ' + y0 + 'L' + x1 + ' ' + y0 + '"/>');
    out.push('<path class="mill-peak" d="M' + x0 + ' ' + n(Y(peak)) + 'L' + x1 + ' ' + n(Y(peak)) + '"/>');
    out.push('<text class="mill-t mill-t-soft" x="' + (x1 - 4) + '" y="' + n(Y(peak) - 7) + '" text-anchor="end">' +
      esc('peak ' + pct(peak) + ' of feed per tooth') + '</text>');
    M.MODES.forEach(function (mode) {
      var pts = M.thicknessProfile(mode, aeOverD, 61).map(function (s) { return { x: X(s.progress), y: -Y(s.ratio) }; });
      var dim = o.only && o.only !== mode ? ' is-dim' : '';
      out.push('<path class="mill-curve mill-curve-' + mode + dim + '" d="' + path(pts) + '"/>');
    });
    (marks || []).forEach(function (m) {
      if (m.progress === null || m.progress === undefined) return;
      var r = M.chipThicknessRatio(M.contactAngle(m.mode, M.engagementAngle(aeOverD), m.progress));
      out.push('<circle class="mill-dot mill-dot-' + m.mode + '" cx="' + n(X(m.progress)) + '" cy="' + n(Y(r)) + '" r="7"/>');
    });
    out.push('<text class="mill-t mill-t-soft" x="' + x0 + '" y="198" text-anchor="start">tooth enters</text>');
    out.push('<text class="mill-t mill-t-soft" x="' + x1 + '" y="198" text-anchor="end">tooth leaves</text>');
    out.push('<text class="mill-t mill-t-soft" x="' + ((x0 + x1) / 2) + '" y="214" text-anchor="middle">position through the cut</text>');
    out.push('<text class="mill-t mill-t-soft" x="' + (x0 - 10) + '" y="' + (y1 + 4) + '" text-anchor="end">slice</text>');
    out.push('<text class="mill-t mill-t-soft" x="' + (x0 - 10) + '" y="' + (y0 + 4) + '" text-anchor="end">0</text>');
    out.push('<path class="mill-curve mill-curve-climb" d="M' + (x0 + 14) + ' 12L' + (x0 + 44) + ' 12"/>');
    out.push('<text class="mill-t" x="' + (x0 + 52) + '" y="17">Climb</text>');
    out.push('<path class="mill-curve mill-curve-conventional" d="M' + (x0 + 128) + ' 12L' + (x0 + 158) + ' 12"/>');
    out.push('<text class="mill-t" x="' + (x0 + 166) + '" y="17">Conventional</text>');
    out.push('</svg>');
    return out.join('');
  }

  /* Feed screw and nut, one row per mode. Conceptual: one thread groove and
     an exaggerated gap. The only thing it claims is which flank the pull of
     the cut holds the nut against - and that sense is read from the model,
     not written in by hand. */
  function renderBacklash() {
    var out = ['<svg class="mill-svg mill-backlash-svg" viewBox="0 0 580 330" role="img" aria-label="' +
      esc('A feed screw and nut with clearance. In conventional milling the pull of the cut points against ' +
        'the table feed and holds the nut on the flank the screw drives with. In climb milling it points ' +
        'with the feed and can draw the nut across the gap, ahead of the screw.') + '" focusable="false">'];
    function rect(cls, x, y, w, h) {
      return '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>';
    }
    function txt(cls, x, y, s, anchor) {
      return '<text class="' + cls + '" x="' + x + '" y="' + y + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(s) + '</text>';
    }
    [['conventional', 14], ['climb', 180]].forEach(function (row) {
      var mode = row[0], y = row[1];
      // Table feed is drawn to the right. The pull of the cut is with or
      // against it exactly as the model says for this mode.
      var sense = M.forceSense(mode, -Math.PI / 2 + M.incomingSide(mode) * M.engagementAngle(0.25) * 0.5).along;
      var withFeed = sense === 'with-feed';
      var nut = withFeed ? 290 : 262, gA = withFeed ? 262 : 302, gB = withFeed ? 290 : 330, gm = (gA + gB) / 2;
      out.push(txt('mill-t mill-t-tag', 8, y + 40, LABEL[mode].replace(' milling', '')));
      out.push(txt('mill-t mill-t-soft', 8, y + 146, withFeed
        ? 'The cut pulls with the feed: the nut can jump the gap.'
        : 'The cut pulls against the feed: the nut stays on the driving flank.'));
      out.push('<path class="mill-feed" d="M200 ' + (y + 8) + 'L284 ' + (y + 8) + '"/>');
      out.push('<path class="mill-feed-head" d="M298 ' + (y + 8) + 'L282 ' + y + 'L282 ' + (y + 16) + 'Z"/>');
      out.push(txt('mill-t mill-t-feed', 308, y + 13, 'Table feed'));
      out.push(rect('mill-work', 180, y + 20, 260, 32));
      out.push(txt('mill-t', 196, y + 41, 'Table'));
      out.push(rect('mill-work', nut, y + 50, 40, 36));
      out.push(rect('mill-body', 150, y + 86, 370, 18));
      out.push(rect('mill-body', 230, y + 58, 32, 30));
      out.push(rect('mill-body', 330, y + 58, 32, 30));
      out.push(txt('mill-t mill-t-soft', 470, y + 124, 'feed screw', 'middle'));
      out.push('<path class="mill-surface" d="M' + gA + ' ' + (y + 72) + 'L' + gB + ' ' + (y + 72) + 'M' + gm + ' ' + (y + 76) + 'L' + gm + ' ' + (y + 108) + '"/>');
      out.push(txt('mill-t mill-t-soft', gm, y + 124, 'gap', 'middle'));
      var fx0 = withFeed ? 372 : 432, fx1 = withFeed ? 424 : 380, tipX = withFeed ? 436 : 368, back = withFeed ? -14 : 14;
      out.push('<path class="mill-force" d="M' + fx0 + ' ' + (y + 36) + 'L' + fx1 + ' ' + (y + 36) + '"/>');
      out.push('<path class="mill-force-head" d="M' + tipX + ' ' + (y + 36) + 'L' + (tipX + back) + ' ' + (y + 28) + 'L' + (tipX + back) + ' ' + (y + 44) + 'Z"/>');
      out.push(txt('mill-t', 448, y + 41, 'pull of the cut'));
    });
    out.push('</svg>');
    return out.join('');
  }

  /* Plain-language account of one frame, for the readout and screen readers. */
  function describe(f) {
    if (!f.engaged) return { now: 'Between teeth - not cutting', trend: 'the last chip is leaving the flute', pull: '' };
    var trend = f.mode === 'climb'
      ? (f.progress < 0.1 ? 'biting in at full thickness' : (f.ratio < 0.15 ? 'thinning out to nothing' : 'thinning'))
      : (f.progress < 0.1 || f.ratio < 0.15 ? 'too thin to cut cleanly - the edge rubs' : 'thickening');
    var along = f.force.along === 'with-feed' ? 'with the feed' : 'against the feed';
    var vert = { down: 'pressing it down', up: 'lifting it', level: 'level' }[f.force.vertical];
    return {
      now: 'Uncut thickness ' + pct(f.ratio) + ' of feed per tooth',
      trend: trend,
      pull: 'Pull on the work: ' + along + ', ' + vert
    };
  }

  /* ----------------------------------------------------------------------
     Live demo
     ---------------------------------------------------------------------- */
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text) e.textContent = text;
    return e;
  }

  function wire(rootEl) {
    if (rootEl.hasAttribute('data-milling-wired')) return;
    rootEl.setAttribute('data-milling-wired', '');
    var host = rootEl.querySelector('[data-mill-live]') || rootEl;
    var uid = 'mill' + Math.random().toString(36).slice(2, 8);
    var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

    var state = { view: 'compare', aeOverD: 0.25, fz: 18, T: 0, manualExit: false, playing: false, speed: 1 };
    var REST_PROGRESS = 0.35;
    state.T = M.timeAtProgress(state, 0, REST_PROGRESS);

    // ---- toolbar
    var bar = el('div', { class: 'mill-toolbar' });
    var seg = el('div', { class: 'mill-seg', role: 'group', 'aria-label': 'Show' });
    var viewButtons = {};
    [['climb', 'Climb'], ['conventional', 'Conventional'], ['compare', 'Compare both']].forEach(function (v) {
      var b = el('button', { type: 'button', 'data-view': v[0], 'aria-pressed': 'false' }, v[1]);
      b.addEventListener('click', function () { setView(v[0]); });
      viewButtons[v[0]] = b; seg.appendChild(b);
    });
    var transport = el('div', { class: 'mill-transport', role: 'group', 'aria-label': 'Playback' });
    var bReset = el('button', { type: 'button', 'aria-label': 'Reset' }, 'Reset');
    var bBack = el('button', { type: 'button', 'aria-label': 'Step back' }, '◀ Step');
    var bPlay = el('button', { type: 'button', class: 'mill-play', 'aria-pressed': 'false' }, 'Play');
    var bFwd = el('button', { type: 'button', 'aria-label': 'Step forward' }, 'Step ▶');
    [bReset, bBack, bPlay, bFwd].forEach(function (b) { transport.appendChild(b); });
    bar.appendChild(seg); bar.appendChild(transport);

    // ---- stage
    var stage = el('div', { class: 'mill-stage', tabindex: '0', role: 'group',
      'aria-label': 'Milling drawing. Space plays or pauses, arrow keys step, Home resets.',
      'aria-describedby': uid + '-status' });
    var panels = {};
    M.MODES.forEach(function (mode) {
      var p = el('div', { class: 'mill-panel', 'data-mode': mode });
      panels[mode] = p; stage.appendChild(p);
    });

    // ---- readouts
    var reads = el('div', { class: 'mill-readouts' });
    var readEls = {};
    M.MODES.forEach(function (mode) {
      var r = el('div', { class: 'mill-read', 'data-mode': mode });
      var k = el('span', { class: 'k' }, LABEL[mode]);
      var v = el('span', { class: 'v' });
      var t = el('span', { class: 't' });
      var p = el('span', { class: 'p' });
      r.appendChild(k); r.appendChild(v); r.appendChild(t); r.appendChild(p);
      readEls[mode] = { box: r, v: v, t: t, p: p };
      reads.appendChild(r);
    });

    // ---- controls
    var controls = el('fieldset', { class: 'mill-controls' });
    controls.appendChild(el('legend', { class: 'sr-only' }, 'Cut settings'));
    function slider(id, text, min, max, step, value, fmt) {
      var p = el('p');
      var lab = el('label', { for: uid + id });
      var name = el('span', {}, text);
      var val = el('output', { for: uid + id, class: 'mill-out' });
      lab.appendChild(name); lab.appendChild(val);
      var input = el('input', { id: uid + id, type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
      p.appendChild(lab); p.appendChild(input);
      controls.appendChild(p);
      return { input: input, out: val, fmt: fmt };
    }
    var cPos = slider('-pos', 'Tooth position in the cut', 0, 100, 1, REST_PROGRESS * 100, function (v) { return v + '%'; });
    var cAe = slider('-ae', 'Width of cut, % of cutter diameter', 5, 50, 5, state.aeOverD * 100, function (v) { return v + '%'; });
    var cFz = slider('-fz', 'Feed per tooth (drawn exaggerated)', 6, 30, 1, state.fz, function (v) { return v < 12 ? 'light' : (v < 22 ? 'medium' : 'heavy'); });
    var speedP = el('p');
    var speedL = el('label', { for: uid + '-speed' });
    speedL.appendChild(el('span', {}, 'Speed'));
    var speed = el('select', { id: uid + '-speed' });
    [['0.3', 'Slow motion'], ['1', 'Normal']].forEach(function (o) {
      var op = el('option', { value: o[0] }, o[1]); if (o[0] === '1') op.selected = true; speed.appendChild(op);
    });
    speedP.appendChild(speedL); speedP.appendChild(speed); controls.appendChild(speedP);

    var graph = el('div', { class: 'mill-graph' });
    var status = el('p', { class: 'sr-only', id: uid + '-status', 'aria-live': 'polite' });
    var keys = el('p', { class: 'mill-keys' }, 'With the drawing selected: Space plays or pauses, ← → step, Home resets.');

    [bar, stage, reads, controls, graph, keys, status].forEach(function (x) { host.appendChild(x); });
    rootEl.classList.add('is-live');

    // ---- behaviour
    function span() { return M.engagementAngle(state.aeOverD) / (2 * Math.PI / M.normalise(state).teeth); }
    function visible() { return state.view === 'compare' ? M.MODES : [state.view]; }

    function draw(announce) {
      var frames = {};
      visible().forEach(function (mode) {
        var f = M.frame(mode, state, state.T);
        frames[mode] = f;
        panels[mode].innerHTML = renderPanel(f, { idPrefix: uid + '-' + mode, ariaLabel: LABEL[mode] + ', ' + describe(f).now });
        var d = describe(f);
        readEls[mode].v.textContent = d.now;
        readEls[mode].t.textContent = d.trend;
        readEls[mode].p.textContent = d.pull;
      });
      M.MODES.forEach(function (mode) {
        var on = visible().indexOf(mode) >= 0;
        panels[mode].hidden = !on; readEls[mode].box.hidden = !on;
      });
      var any = frames[visible()[0]];
      graph.innerHTML = renderGraph(state.aeOverD, visible().map(function (m) {
        return { mode: m, progress: frames[m].engaged ? frames[m].progress : null };
      }), { only: state.view === 'compare' ? null : state.view });
      if (!state.playing) {
        cPos.input.value = String(any.engaged ? Math.round(any.progress * 100) : 100);
      }
      cPos.out.textContent = any.engaged ? cPos.fmt(Math.round(any.progress * 100)) : 'between teeth';
      cAe.out.textContent = cAe.fmt(Math.round(state.aeOverD * 100)) + ' · contact ' +
        Math.round(any.kappa * 180 / Math.PI) + '°';
      cFz.out.textContent = cFz.fmt(state.fz);
      if (announce) {
        status.textContent = visible().map(function (m) {
          var d = describe(frames[m]);
          return LABEL[m] + ': ' + d.now + (d.trend ? ', ' + d.trend : '') + '.';
        }).join(' ');
      }
    }

    function setView(v) {
      state.view = v;
      Object.keys(viewButtons).forEach(function (k) { viewButtons[k].setAttribute('aria-pressed', String(k === v)); });
      stage.setAttribute('data-view', v);
      reads.setAttribute('data-view', v);
      draw(true);
    }

    // Chips are part of the model's frame, so playback only moves time on;
    // a paused, stepped or dragged frame shows exactly what playback would.
    var last = null, raf = 0, stepTimer = 0;
    function tick(ts) {
      if (!state.playing) return;
      var dt = last === null ? 0 : Math.min(0.1, (ts - last) / 1000);
      last = ts;
      state.T += dt * state.speed / 1.8;
      draw(false);
      raf = requestAnimationFrame(tick);
    }
    function stepReduced() {
      // Reduced motion: the same sequence, as discrete still frames.
      if (!state.playing) return;
      state.T += span() / 6;
      if (state.T - Math.floor(state.T) > span()) state.T = Math.ceil(state.T);
      draw(false);
      stepTimer = setTimeout(stepReduced, 900 / state.speed);
    }
    function play(on) {
      state.playing = on;
      bPlay.textContent = on ? 'Pause' : 'Play';
      bPlay.setAttribute('aria-pressed', String(on));
      cancelAnimationFrame(raf); clearTimeout(stepTimer); last = null;
      if (on) {
        state.manualExit = false;
        if (reduce.matches) stepTimer = setTimeout(stepReduced, 300);
        else raf = requestAnimationFrame(tick);
      } else {
        draw(true);
      }
    }
    function step(dir) {
      play(false);
      var sp = span(), c = M.frame('climb', state, state.T).cycle;
      var base = Math.floor(state.T) - (state.manualExit ? 1 : 0);
      if (c > sp) c = dir > 0 ? 1 : sp;           // between teeth: jump to the next cut
      var p = Math.round((c / sp) * 12 + dir) / 12;
      state.manualExit = false;
      if (p > 1) { state.T = base + 1; }
      else if (p < 0) { state.T = base - 1 + sp; state.manualExit = sp === 1; }
      else { state.T = base + p * sp; state.manualExit = p === 1 && sp === 1; }
      draw(true);
    }
    function reset() {
      play(false);
      state.aeOverD = 0.25; state.fz = 18;
      state.manualExit = false;
      cAe.input.value = '25'; cFz.input.value = '18';
      state.T = M.timeAtProgress(state, 0, REST_PROGRESS);
      draw(true);
    }

    bPlay.addEventListener('click', function () { play(!state.playing); });
    bBack.addEventListener('click', function () { step(-1); });
    bFwd.addEventListener('click', function () { step(1); });
    bReset.addEventListener('click', reset);
    cPos.input.addEventListener('input', function () {
      var requested = Number(cPos.input.value) / 100;
      play(false);
      state.T = M.timeAtProgress(state, state.T, requested);
      state.manualExit = requested === 1 && span() === 1;
      draw(false);
    });
    cPos.input.addEventListener('change', function () { draw(true); });
    cAe.input.addEventListener('input', function () {
      var c = M.frame('climb', state, state.T).cycle, sp = span(), p = c <= sp ? c / sp : 1;
      state.aeOverD = Number(cAe.input.value) / 100;
      state.T = M.timeAtProgress(state, state.T, p);
      state.manualExit = p === 1 && span() === 1;
      draw(!state.playing);
    });
    cFz.input.addEventListener('input', function () { state.fz = Number(cFz.input.value); draw(!state.playing); });
    speed.addEventListener('change', function () { state.speed = Number(speed.value); });

    rootEl.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Escape') return;
      if (e.target.closest('button,input,select,textarea,summary') &&
          [' ', 'Spacebar', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].indexOf(e.key) >= 0) e.stopPropagation();
    });

    // Keys are taken only while the drawing has focus, and stopped here so
    // the page's own arrow-key and Space navigation never fires as well.
    stage.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var used = true;
      switch (e.key) {
        case ' ': case 'Spacebar': play(!state.playing); break;
        case 'ArrowRight': step(1); break;
        case 'ArrowLeft': step(-1); break;
        case 'Home': reset(); break;
        default: used = false;
      }
      if (used) { e.preventDefault(); e.stopPropagation(); }
    });
    if (reduce.addEventListener) reduce.addEventListener('change', function () { if (state.playing) { play(false); play(true); } });
    addEventListener('beforeprint', function () { if (state.playing) play(false); });

    setView('compare');
  }

  function boot() {
    if (typeof document === 'undefined') return;
    var go = function () {
      document.querySelectorAll('[data-interactive="milling-direction"]').forEach(wire);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  }

  return { renderPanel: renderPanel, renderGraph: renderGraph, renderBacklash: renderBacklash,
    renderChipStory: renderChipStory, storyMoments: storyMoments,
    describe: describe, boot: boot, VIEW: VIEW };
});
