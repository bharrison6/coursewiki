/* ============================================================================
   surface-texture / demo.js - the live lab, the four-notation view and the
   read-the-callout challenge. Every number comes from profile.js, every
   drawing fact from notation.js, every picture from render.js; this file
   only wires controls to them.

   Mount points are authored in the page:
     <div data-interactive="surface-texture">                         the lab
     <div data-interactive="surface-texture" data-st-view="notation">  one requirement, four ways
     <div data-interactive="surface-texture" data-st-view="challenge"> read the callout
   Each mount keeps its authored static content (the no-JavaScript and
   printed version) and hides it only once the live version is built.

   Keys: app.js turns Space and the arrow keys into slide and page navigation
   unless focus is in an INPUT, SELECT or TEXTAREA. Focus on one of these
   buttons or summaries is neither, so those keys are stopped at the mount.
   ========================================================================== */
(function () {
  'use strict';

  var S = window.CourseWikiTextureSurface, P = window.CourseWikiTextureProfile, N = window.CourseWikiTextureNotation;
  var R = window.CourseWikiTextureRender, Q = window.CourseWikiTextureQuiz;
  if (!S || !P || !N || !R || !Q || typeof document === 'undefined') { return; }

  var instance = 0;
  var reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function $(root, sel) { return root.querySelector(sel); }
  function $$(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function um(v) { return N.fmtUm(v) + ' µm'; }
  function uin(v) { return N.fmtMicroinch(v) + ' µin'; }
  function mm(v) { return (v < 1 ? v.toFixed(2) : v.toFixed(1)).replace(/\.?0+$/, '') + ' mm'; }

  var NAV_KEYS = { ' ': 1, 'Spacebar': 1, 'ArrowLeft': 1, 'ArrowRight': 1, 'ArrowUp': 1, 'ArrowDown': 1, 'PageUp': 1, 'PageDown': 1, 'Home': 1, 'End': 1 };
  function guardKeys(root) {
    root.addEventListener('keydown', function (e) {
      if (!NAV_KEYS[e.key]) { return; }
      var t = e.target;
      if (t && t !== root && t.matches && t.matches('button, input, select, textarea, summary, [tabindex]')) { e.stopPropagation(); }
    });
  }

  /* A set of radio inputs styled as chips. */
  function chips(name, legend, items, cls) {
    return '<fieldset class="st-field st-chips' + (cls ? ' ' + cls : '') + '"><legend class="st-k">' + legend + '</legend><div class="st-chip-row">' +
      items.map(function (it) {
        return '<label class="st-chip"><input type="radio" name="' + name + '" value="' + esc(it.value) + '"><span>' + it.label + '</span></label>';
      }).join('') + '</div></fieldset>';
  }
  function setRadio(root, name, value) {
    $$(root, 'input[name="' + name + '"]').forEach(function (r) { r.checked = r.value === String(value); });
  }

  /* Logarithmic sliders: position 0..1000 across [lo, hi]. */
  function logPos(v, lo, hi) { return Math.round(1000 * Math.log(v / lo) / Math.log(hi / lo)); }
  function logVal(p, lo, hi) { return lo * Math.pow(hi / lo, p / 1000); }
  function sig2(v) { var d = v >= 10 ? 0 : v >= 1 ? 1 : 2; return Number(v.toFixed(d)); }

  var LAY_LABEL = {
    parallel: 'Parallel marks', crossed: 'Crossed marks', multi: 'Many directions',
    circular: 'Circular marks', radial: 'Radial marks', particulate: 'Pits, no direction'
  };
  var REL_SENTENCE = {
    across: 'This trace crosses the marks.',
    along: 'This trace runs along the marks, between them.',
    shallow: 'This trace runs at a shallow angle to both sets of marks.',
    'radius-across': 'This trace runs along a radius, so it crosses the circular marks.',
    'radius-along': 'This trace runs through the centre along the radial marks. A straight trace cannot cross them everywhere; this lab only traces straight lines.',
    none: 'These marks have no single direction to trace across.'
  };

  /* =========================================================================
     The lab
     =======================================================================*/
  var BASE = { lay: 'parallel', shape: 'rounded', spacing: 0.2, height: 6, wave: 4, waveLength: 2.5, scratch: false };
  function base(over) { var o = {}, k; for (k in BASE) { o[k] = BASE[k]; } for (k in over || {}) { o[k] = over[k]; } return S.make(o); }

  var EXPERIMENTS = [
    { id: 'direction', title: 'Across or along the marks', setup: function () { return { spec: base(), dir: 'x', lc: 0.8, match: false }; } },
    { id: 'equal', title: 'Same Ra, different surface', setup: function () {
      var spec = base(); spec.height = P.heightForRa(spec, 'x', 0.8, 1.6);
      return { spec: spec, dir: 'x', lc: 0.8, match: true };
    } },
    { id: 'filter', title: 'Where waviness ends', setup: function () { return { spec: base({ wave: 12 }), dir: 'x', lc: 0.8, match: false }; } },
    { id: 'scratch', title: 'One deep scratch', setup: function () { return { spec: base(), dir: 'x', lc: 0.8, match: false }; } }
  ];
  function experiment(id) { return EXPERIMENTS.filter(function (e) { return e.id === id; })[0]; }

  function labMarkup(id) {
    var p = id + '-';
    return '' +
      '<div class="st-lab">' +
        '<div class="st-exp">' +
          '<div class="st-exp-head" role="group" aria-label="Experiments">' +
            '<span class="st-k">Experiment</span>' +
            '<div class="st-exp-row">' + EXPERIMENTS.map(function (e, i) {
              return '<button type="button" data-st-exp="' + e.id + '" aria-pressed="false"><span class="st-exp-n">' + (i + 1) + '</span> ' + e.title.replace(/Ra/, '<span class="st-nocase">Ra</span>') + '</button>';
            }).join('') + '</div>' +
          '</div>' +
          '<div class="st-mission" data-st-mission></div>' +
        '</div>' +

        '<div class="st-stage">' +
          '<figure class="st-fig st-a-pic">' +
            '<div class="st-svg" data-st-pic></div>' +
            '<figcaption data-st-pic-cap></figcaption>' +
          '</figure>' +
          '<div class="st-controls st-a-surf" role="group" aria-label="Surface">' +
            '<p class="st-field"><label class="st-k" for="' + p + 'lay">Pattern</label>' +
              '<select id="' + p + 'lay" data-st-lay>' + S.PATTERN_ORDER.map(function (k) { return '<option value="' + k + '">' + LAY_LABEL[k] + '</option>'; }).join('') + '</select></p>' +
            chips(p + 'shape', 'Mark shape', S.SHAPE_ORDER.map(function (k) { return { value: k, label: S.SHAPES[k].label }; }), 'st-shape') +
            rangeMarkup(p, 'height', 'Mark height') +
            rangeMarkup(p, 'wave', 'Waviness') +
            '<details class="st-more"><summary>More surface settings</summary><div class="st-more-body">' +
              rangeMarkup(p, 'spacing', 'Mark spacing') +
              rangeMarkup(p, 'waveLength', 'Waviness wavelength') +
              '<label class="st-check"><input type="checkbox" data-st-scratch> One deep scratch</label>' +
              '<label class="st-check"><input type="checkbox" data-st-match> Keep Ra the same when the shape or pattern changes</label>' +
            '</div></details>' +
            '<p class="st-match-status" data-st-match-status hidden role="status"></p>' +
          '</div>' +
          '<div class="st-results st-a-tiles" data-st-results>' +
            tile('Ra', 'mean distance from the mean line') +
            tile('Rz', 'mean of the five section heights') +
            tile('Rt', 'largest peak to valley, whole length') +
            tile('W', 'waviness, peak to valley of the mean line') +
          '</div>' +
          '<div class="st-controls st-a-meas" role="group" aria-label="Measurement">' +
            chips(p + 'dir', 'Trace', [{ value: 'x', label: 'Left to right' }, { value: 'y', label: 'Front to back' }]) +
            chips(p + 'lc', 'Cutoff <span class="st-nocase">λc</span>', P.CUTOFFS.map(function (c) { return { value: String(c), label: c + ' mm' }; })) +
            '<p class="st-rel" data-st-rel></p>' +
          '</div>' +
          '<figure class="st-fig st-a-prof">' +
            '<div class="st-svg" data-st-prof></div>' +
            '<figcaption data-st-prof-cap></figcaption>' +
          '</figure>' +
        '</div>' +

        '<div class="st-drawing">' +
          '<figure class="st-fig st-fig-sym">' +
            '<div class="st-svg" data-st-sym></div>' +
            '<figcaption data-st-sym-cap></figcaption>' +
          '</figure>' +
          '<div class="st-drawing-body">' +
            '<p class="st-verdict" data-st-verdict></p>' +
            '<ul class="st-reading" data-st-reading></ul>' +
            '<div class="st-controls st-drawing-controls" role="group" aria-label="Drawing requirement">' +
              '<p class="st-field st-limit"><span class="st-k" id="' + p + 'limit-k">Limit</span><span class="st-limit-row">' +
                '<select aria-label="Limit parameter" data-st-param>' + N.PARAMS.map(function (k) { return '<option value="' + k + '">' + k + '</option>'; }).join('') + '</select>' +
                '<select aria-label="Limit value" data-st-value>' + N.SERIES.map(function (v) { return '<option value="' + v + '">' + N.fmtUm(v) + ' µm</option>'; }).join('') + '</select>' +
              '</span></p>' +
              chips(p + 'proc', 'Process', N.PROCESS_ORDER.map(function (k) { return { value: k, label: { any: 'Any process', removal: 'Removal required', prohibited: 'Removal prohibited' }[k] }; })) +
              chips(p + 'conv', 'Symbol', [{ value: 'current', label: 'ISO 21920 (current)' }, { value: 'legacy', label: 'ISO 1302 (older)' }]) +
              chips(p + 'view', 'Drawing view', [{ value: 'front', label: 'Front view' }, { value: 'side', label: 'Right side view' }]) +
            '</div>' +
          '</div>' +
        '</div>' +

        '<details class="st-work"><summary>How these numbers were worked out</summary><div class="st-work-body" data-st-work></div></details>' +
        '<p class="sr-only" aria-live="polite" data-st-live></p>' +
      '</div>';
  }
  function rangeMarkup(p, key, label) {
    return '<p class="st-field st-range"><label class="st-k" for="' + p + key + '">' + label + '</label>' +
      '<span class="st-range-row"><input type="range" id="' + p + key + '" data-st-range="' + key + '"><output for="' + p + key + '" data-st-out="' + key + '"></output></span></p>';
  }
  function tile(k, s) {
    return '<div class="st-tile" data-st-tile="' + k + '"><span class="st-k">' + (k === 'W' ? 'Waviness' : '<span class="st-nocase">' + k + '</span>') + '</span>' +
      '<p class="st-v"><span data-st-v></span></p><p class="st-s"><span data-st-uin></span><span class="st-s-what">' + s + '</span></p></div>';
  }

  /* Slider scales: [lo, hi, log?, step for linear]. */
  var SLIDERS = {
    height: { lo: S.LIMITS.height.min, hi: S.LIMITS.height.max, log: true, unit: 'µm' },
    wave: { lo: 0, hi: 20, step: 0.5, unit: 'µm' },
    spacing: { lo: S.LIMITS.spacing.min, hi: S.LIMITS.spacing.max, log: true, unit: 'mm' },
    waveLength: { lo: S.LIMITS.waveLength.min, hi: S.LIMITS.waveLength.max, step: 0.5, unit: 'mm' }
  };

  function initLab(root) {
    var id = 'st' + (++instance), p = id + '-';
    var host = document.createElement('div');
    host.innerHTML = labMarkup(id);
    var lab = host.firstChild;
    root.insertBefore(lab, root.firstChild);
    root.classList.add('st-live');
    guardKeys(root);

    var st = { spec: base(), dir: 'x', lc: 0.8, match: false, matchResult: null, exp: null, before: null,
      callout: N.makeCallout({ notation: 'current', process: 'removal', param: 'Ra', value: 1.6 }), view: 'front' };
    var picHost = $(lab, '[data-st-pic]'), profHost = $(lab, '[data-st-prof]'), symHost = $(lab, '[data-st-sym]');
    var live = $(lab, '[data-st-live]');
    var last = null;   // the latest analysis

    Object.keys(SLIDERS).forEach(function (k) {
      var r = $(lab, '[data-st-range="' + k + '"]'), sc = SLIDERS[k];
      if (sc.log) { r.min = 0; r.max = 1000; r.step = 1; } else { r.min = sc.lo; r.max = sc.hi; r.step = sc.step; }
    });

    /* ---- state to controls ---------------------------------------------------*/
    function syncControls() {
      $(lab, '[data-st-lay]').value = st.spec.lay;
      setRadio(lab, p + 'shape', st.spec.shape);
      $$(lab, 'input[name="' + p + 'shape"]').forEach(function (r) { r.disabled = !S.PATTERNS[st.spec.lay].shaped; });
      Object.keys(SLIDERS).forEach(function (k) {
        var r = $(lab, '[data-st-range="' + k + '"]'), sc = SLIDERS[k], v = st.spec[k];
        r.value = sc.log ? logPos(v, sc.lo, sc.hi) : Math.min(sc.hi, v);
        var txt = (sc.log ? sig2(v) : v) + ' ' + sc.unit;
        $(lab, '[data-st-out="' + k + '"]').textContent = txt;
        r.setAttribute('aria-valuetext', txt);
      });
      $(lab, '[data-st-scratch]').checked = st.spec.scratch;
      $(lab, '[data-st-match]').checked = st.match;
      setRadio(lab, p + 'dir', st.dir);
      setRadio(lab, p + 'lc', String(st.lc));
      $(lab, '[data-st-param]').value = st.callout.param;
      $(lab, '[data-st-value]').value = String(st.callout.value);
      setRadio(lab, p + 'proc', st.callout.process);
      setRadio(lab, p + 'conv', st.callout.notation);
      setRadio(lab, p + 'view', st.view);
      $$(lab, '[data-st-exp]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-st-exp') === st.exp)); });
    }

    /* ---- drawing -----------------------------------------------------------------*/
    var compact = null;
    function render() {
      var an = P.measure(st.spec, st.dir, st.lc);
      last = an;
      var pic = R.pictorial(st.spec, { lc: st.lc, dir: st.dir, view: st.view, traceData: an.trace, idPrefix: p + 'pic' });
      picHost.innerHTML = pic.svg;
      compact = profHost.clientWidth > 0 && profHost.clientWidth < 500;
      profHost.innerHTML = R.profiles(an, { idPrefix: p + 'prof', compact: compact, roughLimit: st.exp === 'equal' ? 20 : null }).svg;

      var rel = S.relation(st.spec.lay, st.dir);
      $(lab, '[data-st-pic-cap]').innerHTML = '<strong>Heights drawn ' + pic.exaggeration + ' times larger than widths.</strong> ' +
        'Lines are the crests of the marks' + (pic.every > 1 ? ' (every ' + (pic.every === 2 ? 'second' : pic.every === 3 ? 'third' : pic.every + 'th') + ' one, to keep them apart)' : '') + '. ' +
        'Solid blue: the evaluation length, five ' + mm(st.lc) + ' sections. Dashed: the extra trace the filter needs.';
      $(lab, '[data-st-prof-cap]').innerHTML = '<strong>Five-section teaching calculation (older ISO 4287 convention), λc ' + mm(st.lc) + '.</strong> ' +
        'The cutoff decides what counts as waviness. ' +
        'Gold: the Gaussian mean line through the measured profile. Below, the roughness that is left, with each section\'s peak (▼) and valley (△), ' +
        'the section heights as red bars, and ±Ra dashed. Heights are drawn far larger than lengths; the factor is at the right of each plot.';
      $(lab, '[data-st-rel]').textContent = REL_SENTENCE[rel];
      var matchStatus = $(lab, '[data-st-match-status]'), match = st.matchResult;
      matchStatus.hidden = !match;
      if (match) {
        matchStatus.textContent = match.achievable ? 'Ra held at ' + um(match.target) + ' by changing the mark height.' :
          'Cannot hold Ra ' + um(match.target) + ' with these settings. Available Ra: ' + um(match.minRa) + ' to ' + um(match.maxRa) +
          '. The closest setting gives ' + um(match.Ra) + ' at mark height ' + um(match.height) + '.';
      }

      // numbers
      var vals = { Ra: an.Ra, Rz: an.Rz, Rt: an.Rt, W: an.waviness };
      Object.keys(vals).forEach(function (k) {
        var t = $(lab, '[data-st-tile="' + k + '"]');
        $(t, '[data-st-v]').textContent = um(vals[k]);
        $(t, '[data-st-uin]').textContent = uin(vals[k]) + ' · ';
      });

      // the drawing
      st.callout.lay = N.laySymbol(st.spec.lay, st.view);
      var conv = N.CONVENTIONS[st.callout.notation];
      symHost.innerHTML = R.symbol(st.callout, { block: true, viewName: N.VIEWS[st.view].name, idPrefix: p + 'sym' }).svg;
      $(lab, '[data-st-sym-cap]').innerHTML = '<strong>' + esc(conv.name) + '</strong>, a schematic teaching drawing: ' + esc(conv.note) +
        ' The standard sets the exact proportions.';
      var chk = N.check(st.callout, { Ra: an.Ra, Rz: an.Rz });
      var verdict = $(lab, '[data-st-verdict]');
      verdict.setAttribute('data-pass', chk.pass ? 'yes' : 'no');
      verdict.innerHTML = (chk.pass ? '<strong>✓ Under the limit on this trace.</strong> ' : '<strong>✕ Over the limit on this trace.</strong> ') +
        esc(chk.param + ' ' + um(chk.measured) + (chk.pass ? ' against ' : ', ' + um(-chk.margin) + ' over ') + N.requirementText(st.callout) + ' µm.') +
        '<span class="st-aside">One trace is not an acceptance decision: the drawing and its standard say how many traces, where, and how the results are judged. No trace can show whether material was removed.</span>';
      $(lab, '[data-st-reading]').innerHTML = N.reading(st.callout, st.view).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');

      renderWork(an);
      renderMission(an);
      return an;
    }

    function renderWork(an) {
      var tr = an.trace, secs = an.sections.map(function (s) { return N.fmtUm(s.height); });
      var nb = N.nBetween(an.Ra);
      var gradeLine = nb.exact ? 'Ra ' + um(an.Ra) + ' is exactly the value of grade ' + nb.exact.grade + '.'
        : (nb.below && nb.above ? 'Ra ' + um(an.Ra) + ' lies between grade ' + nb.below.grade + ' (' + um(nb.below.ra) + ') and ' + nb.above.grade + ' (' + um(nb.above.ra) + ').'
          : 'Ra ' + um(an.Ra) + ' is outside the N1 to N12 range.');
      var pos = function (i) { return (tr.pos[i] - tr.pos[0]).toFixed(2) + ' mm'; };
      $(lab, '[data-st-work]').innerHTML =
        '<p><span class="st-k">The trace</span> ' + mm(7 * st.lc) + ' long, sampled every ' + (tr.dx * 1000).toFixed(st.lc < 0.5 ? 3 : 2) + ' µm. ' +
          'The middle ' + mm(5 * st.lc) + ' is evaluated: five sections of λc = ' + mm(st.lc) + '. Numerical sampling can miss the exact tips of sharp peaks.</p>' +
        '<p><span class="st-k">Mean line</span> a Gaussian weighted average of the measured profile, weights exp(−π (x ÷ (α λc))²) with α = √(ln 2 ÷ π) ≈ ' + P.ALPHA.toFixed(4) +
          ', so it keeps half of a wave λc long. The roughness profile is the measured profile minus this line.</p>' +
        '<p><span class="st-k st-nocase">Ra</span> the average of |roughness| over the ' + mm(5 * st.lc) + ' = <strong>' + um(an.Ra) + '</strong> = ' + um(an.Ra).replace(' µm', '') + ' ÷ 0.0254 = ' + uin(an.Ra) + '</p>' +
        '<p><span class="st-k st-nocase">Rz</span> (' + secs.join(' + ') + ') ÷ 5 = <strong>' + um(an.Rz) + '</strong></p>' +
        '<p><span class="st-k st-nocase">Rt</span> highest peak ' + N.fmtUm(an.rt.peak.v) + ' µm at ' + pos(an.rt.peak.i) + ' − deepest valley (' + N.fmtUm(an.rt.valley.v) + ' µm) at ' + pos(an.rt.valley.i) +
          ' = <strong>' + um(an.Rt) + '</strong></p>' +
        '<p><span class="st-k">Older grades</span> ' + esc(gradeLine) + ' Grade numbers stand for Ra values only.</p>' +
        '<p class="st-aside">A teaching calculation: no short-wavelength filter, a sharp stylus, a flat part and one trace. Real instruments and standards add settings this lab does not model.</p>';
    }

    /* ---- the guided experiments ------------------------------------------------------*/
    function missionHtml(an) {
      var ex = experiment(st.exp);
      if (!ex) { return '<p>Pick an experiment above, or change anything and watch the numbers.</p>'; }
      var b = st.before;
      var act = function (key, label) { return '<button type="button" class="st-act" data-st-act="' + key + '">' + label + '</button>'; };
      if (ex.id === 'direction') {
        if (st.spec.lay !== 'parallel') { return '<p>This experiment uses parallel marks. ' + act('restart', 'Set it up again') + '</p>'; }
        var across = st.dir === 'x' ? an : P.measure(st.spec, 'x', st.lc), along = st.dir === 'y' ? an : P.measure(st.spec, 'y', st.lc);
        if (st.dir === 'x') {
          return '<p><strong>The stylus is crossing the marks: Ra ' + um(across.Ra) + '.</strong> Now trace front to back, along the marks, and watch Ra.</p>' + act('dir-y', 'Trace front to back');
        }
        return '<p><strong>Same surface, Ra ' + um(across.Ra) + ' across the marks and ' + um(along.Ra) + ' along them.</strong> The stylus runs between the marks and misses them. ' +
          'Tracing across the lay is the usual choice, but a direction the drawing specifies governs, so the direction belongs with the result.</p>' + act('next', 'Next experiment');
      }
      if (ex.id === 'equal') {
        var ref = b && b.Ra ? b : null;
        if (st.spec.shape === 'rounded') {
          return '<p><strong>Ra ' + um(an.Ra) + ', Rz ' + um(an.Rz) + '.</strong> Pick another mark shape. ' + (st.match ? 'The lab changes the mark height so Ra stays the same; ' : '') +
            'compare Rz and Rt, and where the peaks and valleys sit.</p>' + act('shape-plateau', 'Try flat tops, narrow grooves');
        }
        return '<p><strong>Ra ' + um(an.Ra) + (ref ? ' (it was ' + um(ref.Ra) + ')' : '') + ', but Rz ' + um(an.Rz) + (ref ? ' (it was ' + um(ref.Rz) + ')' : '') + '.</strong> ' +
          (st.spec.shape === 'plateau' ? 'Most of this profile sits above the mean line, cut by deep narrow grooves. ' : 'Most of this profile sits below the mean line, with narrow peaks standing up. ') +
          'Flat tops and narrow peaks give nearly the same Rz too; only where the extremes sit tells them apart. One number does not describe a surface.</p>' +
          act(st.spec.shape === 'plateau' ? 'shape-peaked' : 'shape-plateau', st.spec.shape === 'plateau' ? 'Try narrow peaks' : 'Try flat tops') + act('next', 'Next experiment');
      }
      if (ex.id === 'filter') {
        if (!(st.spec.wave > 0)) { return '<p>This experiment needs some waviness. ' + act('restart', 'Set it up again') + '</p>'; }
        var ang = S.WAVE_ANGLE * Math.PI / 180;
        var seen = st.spec.waveLength / (st.dir === 'y' ? Math.sin(ang) : Math.cos(ang));
        var keep = Math.round(100 * P.meanLineShare(st.lc, seen));
        if (st.lc !== 2.5) {
          return '<p><strong>With λc ' + mm(st.lc) + ', the gold mean line keeps about ' + keep + '% of this waviness</strong> (' + mm(seen) + ' long along the trace), so little of it reaches the roughness: Ra ' + um(an.Ra) +
            '. Now use the 2.5 mm cutoff.</p>' + act('lc-2.5', 'Use the 2.5 <span class="st-nocase">mm</span> cutoff');
        }
        return '<p><strong>With λc 2.5 mm the mean line keeps only about ' + keep + '% of the same waviness</strong>; the rest now counts as roughness, and Ra is ' + um(an.Ra) +
          (b ? ' (it was ' + um(b.Ra) + ')' : '') + '. Where roughness ends and waviness begins is set by the filter\'s cutoff, not by how big the undulation is. A drawing or its standard says which cutoff applies.</p>' + act('next', 'Next experiment');
      }
      if (!st.spec.scratch) {
        return '<p><strong>Ra ' + um(an.Ra) + ', Rz ' + um(an.Rz) + ', Rt ' + um(an.Rt) + '.</strong> Add one scratch three times as deep as the marks, and see which number notices.</p>' + act('scratch-on', 'Add the scratch');
      }
      return '<p><strong>Rt ' + (b ? um(b.Rt) + ' → ' : '') + um(an.Rt) + ', Rz ' + (b ? um(b.Rz) + ' → ' : '') + um(an.Rz) + ', Ra ' + (b ? um(b.Ra) + ' → ' : '') + um(an.Ra) + '.</strong> ' +
        'Rt spans the highest peak to the deepest valley over the whole length, so the scratch sets it here. Rz averages five section heights, diluting localized extremes; the filter can spread a scratch across section boundaries. Ra averages every point. ' +
        'Whether an isolated scratch counts against a texture requirement is for the drawing and its standard to say.</p>' + act('next', 'Back to the first experiment');
    }
    function renderMission(an) { $(lab, '[data-st-mission]').innerHTML = missionHtml(an); }

    function startExperiment(eid, speak) {
      var ex = experiment(eid);
      var s = ex.setup();
      st.exp = eid; st.spec = s.spec; st.dir = s.dir; st.lc = s.lc; st.match = s.match;
      st.before = null; st.matchResult = null;
      syncControls();
      var an = render();
      st.before = { Ra: an.Ra, Rz: an.Rz, Rt: an.Rt };
      renderMission(an);
      if (speak) { live.textContent = ex.title + '. ' + $(lab, '[data-st-mission]').textContent; }
    }

    /* ---- controls to state ----------------------------------------------------------*/
    var raf = 0;
    function schedule() {
      if (raf) { return; }
      raf = (window.requestAnimationFrame || setTimeout)(function () { raf = 0; render(); });
    }
    function announce() {
      if (!last) { return; }
      live.textContent = 'Ra ' + um(last.Ra) + ', Rz ' + um(last.Rz) + ', Rt ' + um(last.Rt) + '. ' + REL_SENTENCE[S.relation(st.spec.lay, st.dir)];
    }
    /* Change the surface; with "keep Ra" on, a new shape or pattern keeps the Ra it had. */
    function changeSpec(key, value) {
      var keepRa = st.match && (key === 'shape' || key === 'lay') && last ? last.Ra : null;
      st.spec[key] = value;
      st.spec = S.make(st.spec);
      st.matchResult = null;
      if (keepRa !== null) {
        st.matchResult = P.solveHeightForRa(st.spec, st.dir, st.lc, keepRa);
        st.spec.height = st.matchResult.height;
      }
      syncControls();
      render();
    }

    $(lab, '[data-st-lay]').addEventListener('change', function (e) { changeSpec('lay', e.target.value); announce(); });
    Object.keys(SLIDERS).forEach(function (k) {
      var r = $(lab, '[data-st-range="' + k + '"]'), sc = SLIDERS[k];
      r.addEventListener('input', function () {
        var v = sc.log ? logVal(Number(r.value), sc.lo, sc.hi) : Number(r.value);
        st.spec[k] = v;
        st.spec = S.make(st.spec);
        st.matchResult = null;
        var txt = (sc.log ? sig2(st.spec[k]) : st.spec[k]) + ' ' + sc.unit;
        $(lab, '[data-st-out="' + k + '"]').textContent = txt;
        r.setAttribute('aria-valuetext', txt);
        schedule();
      });
      r.addEventListener('change', announce);
    });
    $(lab, '[data-st-scratch]').addEventListener('change', function (e) { changeSpec('scratch', e.target.checked); announce(); });
    $(lab, '[data-st-match]').addEventListener('change', function (e) { st.match = e.target.checked; });
    $(lab, '[data-st-param]').addEventListener('change', function (e) { st.callout.param = e.target.value; render(); });
    $(lab, '[data-st-value]').addEventListener('change', function (e) { st.callout.value = Number(e.target.value); render(); });

    lab.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || t.type !== 'radio' || !t.checked) { return; }
      if (t.name === p + 'shape') { changeSpec('shape', t.value); announce(); }
      else if (t.name === p + 'dir') { st.dir = t.value; st.matchResult = null; render(); announce(); }
      else if (t.name === p + 'lc') { st.lc = Number(t.value); st.matchResult = null; render(); announce(); }
      else if (t.name === p + 'proc') { st.callout.process = t.value; render(); live.textContent = N.PROCESS[t.value].reading; }
      else if (t.name === p + 'conv') { st.callout.notation = t.value; render(); live.textContent = N.CONVENTIONS[t.value].note; }
      else if (t.name === p + 'view') { st.view = t.value; render(); live.textContent = N.reading(st.callout, st.view).slice(-1)[0] || ''; }
    });

    lab.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b || !lab.contains(b)) { return; }
      var eid = b.getAttribute('data-st-exp');
      if (eid) { startExperiment(eid, true); return; }
      var act = b.getAttribute('data-st-act');
      if (!act) { return; }
      if (act === 'restart') { startExperiment(st.exp, true); return; }
      if (act === 'next') {
        var i = EXPERIMENTS.indexOf(experiment(st.exp));
        startExperiment(EXPERIMENTS[(i + 1) % EXPERIMENTS.length].id, true);
        var nb = $(lab, '[data-st-exp="' + st.exp + '"]');
        if (nb) { nb.focus(); }
        return;
      }
      if (act === 'dir-y') { st.dir = 'y'; }
      else if (act === 'lc-2.5') { st.lc = 2.5; }
      else if (act === 'scratch-on') { st.spec.scratch = true; }
      else if (act.indexOf('shape-') === 0) { changeSpec('shape', act.slice(6)); }
      syncControls();
      render();
      live.textContent = $(lab, '[data-st-mission]').textContent;
      var again = $(lab, '[data-st-mission] button');
      if (again) { again.focus({ preventScroll: true }); }
    });

    // re-draw the profile in its phone layout when the figure crosses the width
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        var c = profHost.clientWidth > 0 && profHost.clientWidth < 500;
        if (c !== compact) { schedule(); }
      }).observe(profHost);
    }

    startExperiment('direction', false);
  }

  /* =========================================================================
     One requirement, four notations
     =======================================================================*/
  function initNotation(root) {
    var id = 'st' + (++instance), p = id + '-';
    var host = document.createElement('div');
    host.innerHTML =
      '<div class="st-notation">' +
        '<div class="st-controls st-n-controls">' +
          '<p class="st-field st-range"><label class="st-k" for="' + p + 'ra"><span class="st-nocase">Ra</span> limit</label>' +
            '<span class="st-range-row"><input type="range" id="' + p + 'ra" min="0" max="' + (N.SERIES.length - 1) + '" step="1" data-st-n-ra><output for="' + p + 'ra" data-st-n-out></output></span></p>' +
          chips(p + 'proc', 'Process', N.PROCESS_ORDER.map(function (k) { return { value: k, label: { any: 'Any process', removal: 'Removal required', prohibited: 'Removal prohibited' }[k] }; })) +
        '</div>' +
        '<div class="st-n-grid">' +
          ['current', 'legacy', 'ngrade', 'triangles'].map(function (k) {
            return '<figure class="st-n-card" data-st-n-card="' + k + '"><div class="st-svg" data-st-n-fig></div><figcaption data-st-n-cap></figcaption></figure>';
          }).join('') +
        '</div>' +
        '<p class="st-n-inch" data-st-n-inch></p>' +
        '<p class="sr-only" aria-live="polite" data-st-n-live></p>' +
      '</div>';
    var view = host.firstChild;
    root.insertBefore(view, root.firstChild);
    root.classList.add('st-live');
    guardKeys(root);

    var st = { index: N.SERIES.indexOf(1.6), process: 'removal' };
    var range = $(view, '[data-st-n-ra]');
    var NAME = { current: N.CONVENTIONS.current.name, legacy: N.CONVENTIONS.legacy.name, ngrade: 'Grade number (older)', triangles: 'Triangle marks (historical comparison)' };

    function render() {
      var v = N.SERIES[st.index];
      range.value = st.index;
      var out = um(v) + ' · ' + uin(v);
      $(view, '[data-st-n-out]').textContent = out;
      range.setAttribute('aria-valuetext', 'Ra ' + out);
      setRadio(view, p + 'proc', st.process);
      ['current', 'legacy', 'ngrade', 'triangles'].forEach(function (k) {
        var card = $(view, '[data-st-n-card="' + k + '"]');
        var c = N.makeCallout({ notation: k, process: st.process, param: 'Ra', value: v });
        var ex = N.expressible(c);
        card.setAttribute('data-ok', ex.ok ? 'yes' : 'no');
        $(card, '[data-st-n-fig]').innerHTML = R.symbol(c, { idPrefix: p + k }).svg;
        var cap = '<strong>' + esc(NAME[k]) + '.</strong> ';
        if (k === 'current' || k === 'legacy') { cap += esc(N.CONVENTIONS[k].note) + ' Schematic proportions.'; }
        else if (k === 'ngrade') { cap += ex.ok ? esc(N.reading(c)[0]) + ' Grade numbers stand for Ra values; they do not convert to Rz.' : esc(ex.why); }
        else {
          cap += ex.ok ? esc(N.reading(c)[0]) : esc(ex.why) + ' ' + esc(N.TRIANGLES.note);
          cap += ' <a href="' + esc(N.TRIANGLES.source.url) + '">Source: ' + esc(N.TRIANGLES.source.title) + '</a>.';
        }
        $(card, '[data-st-n-cap]').innerHTML = cap;
      });
      $(view, '[data-st-n-inch]').innerHTML = '<strong>In inches:</strong> ' + esc(um(v) + ' = ' + N.fmtUm(v) + ' ÷ 0.0254 = ' + uin(v)) +
        '. One microinch is exactly 0.0254 µm, because one inch is exactly 25.4 mm.';
    }
    range.addEventListener('input', function () { st.index = Number(range.value); render(); });
    range.addEventListener('change', function () {
      var v = N.SERIES[st.index], g = N.nGrade(v), row = N.triangleRow(v);
      $(view, '[data-st-n-live]').textContent = 'Ra ' + um(v) + ', ' + uin(v) + '. Grade ' + g.grade + '. ' +
        (row ? row.marks + ' triangles in the catalog comparison.' : 'No triangle mark listed.');
    });
    view.addEventListener('change', function (e) {
      if (e.target.name === p + 'proc' && e.target.checked) { st.process = e.target.value; render(); $(view, '[data-st-n-live]').textContent = N.PROCESS[st.process].reading; }
    });
    render();
  }

  /* =========================================================================
     Read the callout
     =======================================================================*/
  function initChallenge(root) {
    var id = 'st' + (++instance), p = id + '-';
    var items = Q.build();
    var host = document.createElement('div');
    host.innerHTML =
      '<div class="st-challenge">' +
        '<p class="st-ch-head"><span class="st-k" data-st-ch-count></span><span class="st-k" data-st-ch-score></span></p>' +
        '<div class="st-ch-body">' +
          '<div class="st-svg st-ch-fig" data-st-ch-fig></div>' +
          '<div class="st-ch-answers" role="group" aria-labelledby="' + p + 'q">' +
            '<p id="' + p + 'q" class="st-ch-q" data-st-ch-q></p>' +
            '<div class="st-ch-options" data-st-ch-options></div>' +
          '</div>' +
        '</div>' +
        '<div class="st-ch-reveal" data-st-ch-reveal hidden tabindex="-1">' +
          '<p class="st-ch-verdict" data-st-ch-verdict></p>' +
          '<p class="st-ch-actions"><button type="button" data-st-ch-next>Next question</button></p>' +
        '</div>' +
        '<p class="sr-only" aria-live="polite" data-st-ch-live></p>' +
      '</div>';
    var ch = host.firstChild;
    root.insertBefore(ch, root.firstChild);
    root.classList.add('st-live');
    guardKeys(root);
    var st = { i: 0, answered: false, score: 0, done: 0 };

    function show() {
      var q = items[st.i];
      st.answered = false;
      $(ch, '[data-st-ch-count]').textContent = 'Question ' + (st.i + 1) + ' of ' + items.length;
      $(ch, '[data-st-ch-score]').textContent = st.done ? 'Right: ' + st.score + ' of ' + st.done : '';
      var fig = $(ch, '[data-st-ch-fig]');
      if (q.draw.kind === 'symbol') { fig.innerHTML = R.symbol(q.draw.callout, { idPrefix: p + 'fig' }).svg; fig.hidden = false; }
      else if (q.draw.kind === 'pictorial') { fig.innerHTML = R.pictorial(q.draw.spec, { lc: 0.8, dir: 'x', view: q.draw.view, mini: true, trace: !q.draw.view, idPrefix: p + 'fig' }).svg; fig.hidden = false; }
      else { fig.innerHTML = ''; fig.hidden = true; }
      ch.setAttribute('data-kind', q.draw.kind);
      $(ch, '[data-st-ch-q]').textContent = q.question;
      $(ch, '[data-st-ch-options]').innerHTML = q.options.map(function (o) {
        return '<button type="button" data-st-ch-pick="' + esc(o.id) + '">' + esc(o.text) + '</button>';
      }).join('');
      $(ch, '[data-st-ch-reveal]').hidden = true;
    }
    function pick(choice) {
      if (st.answered) { return; }
      st.answered = true;
      var q = items[st.i], right = choice === q.answer;
      st.done += 1; if (right) { st.score += 1; }
      $$(ch, '[data-st-ch-pick]').forEach(function (b) {
        var k = b.getAttribute('data-st-ch-pick');
        b.disabled = true;
        if (k === choice) { b.setAttribute('data-picked', right ? 'right' : 'wrong'); }
        if (k === q.answer) { b.setAttribute('data-answer', 'true'); }
      });
      $(ch, '[data-st-ch-verdict]').innerHTML = (right ? '<strong>✓ Right.</strong> ' : '<strong>✕ Not this time.</strong> ') + esc(q.explain);
      $(ch, '[data-st-ch-next]').textContent = st.i + 1 < items.length ? 'Next question' : 'Start again';
      $(ch, '[data-st-ch-score]').textContent = 'Right: ' + st.score + ' of ' + st.done;
      var reveal = $(ch, '[data-st-ch-reveal]');
      reveal.hidden = false;
      $(ch, '[data-st-ch-live]').textContent = (right ? 'Right. ' : 'Not this time. ') + q.explain;
      reveal.focus({ preventScroll: true });
    }
    ch.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b || !ch.contains(b)) { return; }
      var k = b.getAttribute('data-st-ch-pick');
      if (k !== null) { pick(k); return; }
      if (b.hasAttribute('data-st-ch-next')) {
        if (st.i + 1 >= items.length) { st.i = 0; st.score = 0; st.done = 0; } else { st.i += 1; }
        show();
        var first = $(ch, '[data-st-ch-pick]');
        if (first) { first.focus({ preventScroll: reduceMotion.matches }); }
      }
    });
    show();
  }

  function boot() {
    $$(document, '[data-interactive="surface-texture"]').forEach(function (root) {
      if (root.getAttribute('data-st-ready')) { return; }
      root.setAttribute('data-st-ready', '1');
      var v = root.getAttribute('data-st-view');
      if (v === 'notation') { initNotation(root); } else if (v === 'challenge') { initChallenge(root); } else { initLab(root); }
    });
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); }
  else { boot(); }
})();
