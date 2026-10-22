/* ============================================================================
   turning-simulator / demo.js - the lathe simulator's controls. Every cut,
   refusal and measurement comes from model.js; every picture from render.js.
   This file wires the learner's hands to them.

   Mount point, authored in the page:
     <div data-interactive="turning-simulator"> ...static content... </div>
   The authored static content (the paper and no-JavaScript version) stays in
   place and is hidden only once the live simulator has been built.

   Hands on the machine, four ways, all through the same model.move():
     - drag the tool in the view; a drag follows one slide at a time, the way
       one handwheel turns at a time
     - the jog buttons, which repeat while held
     - the arrow keys while the view has focus
     - "feed to" a typed position, animated at a feed rate
   A threading pass is its own action, because the leadscrew drives it.

   Keys: app.js turns Space and the arrow keys into slide and page navigation
   unless focus is in an INPUT, SELECT or TEXTAREA. Focus on the view or one
   of the simulator's buttons is neither, so handled keys are stopped here.
   ========================================================================== */
(function () {
  'use strict';

  var M = (typeof window !== 'undefined') && window.CourseWikiTurning;
  var R = (typeof window !== 'undefined') && window.CourseWikiTurningRender;
  if (!M || !R || typeof document === 'undefined') { return; }

  var instance = 0;
  var STEPS = [0.100, 0.010, 0.001];
  var SPEED = { feed: 0.7, rapid: 2.6, thread: 1.1 };   // in per second, for the picture only
  var reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var SHORT = { turn: 'Turn', chamfer: 'Chamfer', groove: 'Groove / part', thread: 'Thread', knurl: 'Knurl', bore: 'Bore',
    ithread: 'Thread inside', center: 'Center drill', drill: 'Drill', csink: 'Countersink' };

  function $(root, sel) { return root.querySelector(sel); }
  function $$(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  var esc = R.esc;
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function parseNum(s) {
    var t = String(s || '').trim().replace(/[−–]/g, '-').replace(/,/g, '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) { return null; }
    return parseFloat(t);
  }

  var NAV_KEYS = { ' ': 1, 'Spacebar': 1, 'ArrowLeft': 1, 'ArrowRight': 1, 'ArrowUp': 1, 'ArrowDown': 1, 'PageUp': 1, 'PageDown': 1, 'Home': 1, 'End': 1 };
  function guardKeys(root) {
    root.addEventListener('keydown', function (e) {
      if (!NAV_KEYS[e.key]) { return; }
      var t = e.target;
      if (t && t !== root && t.matches && t.matches('button, input, select, textarea, summary, [tabindex]')) { e.stopPropagation(); }
    });
  }

  /* ---- markup ----------------------------------------------------------------*/
  function markup(id) {
    var tools = function (mount) {
      return M.TOOL_ORDER.filter(function (t) { return M.TOOLS[t].mount === mount; }).map(function (t) {
        return '<button type="button" class="ts-toolbtn" data-ts-tool="' + t + '" aria-pressed="false">' + R.toolIcon(t) +
          '<span>' + esc(SHORT[t]) + '</span></button>';
      }).join('');
    };
    return '' +
      '<div class="ts-lab">' +
        '<div class="ts-bar">' +
          '<div class="ts-parts" role="group" aria-labelledby="' + id + '-parts">' +
            '<span class="ts-k" id="' + id + '-parts">Part to make</span>' +
            '<div class="ts-row">' + M.TARGETS.map(function (T) {
              return '<button type="button" data-ts-part="' + T.id + '" aria-pressed="false">' + esc(T.title) + '</button>';
            }).join('') + '</div>' +
          '</div>' +
          '<button type="button" class="ts-new" data-ts-act="new">New bar</button>' +
        '</div>' +

        '<figure class="ts-drawing" data-ts-drawing></figure>' +

        '<div class="ts-workbench"><div class="ts-machine">' +
          '<div class="ts-dro" aria-hidden="true">' +
            '<span class="ts-dro-v"><span class="ts-k">X&nbsp;Ø</span><b data-ts-x></b></span>' +
            '<span class="ts-dro-v"><span class="ts-k">Z</span><b data-ts-z></b></span>' +
            '<span class="ts-dro-tool" data-ts-dro-tool></span>' +
            '<span class="ts-dro-spin" data-ts-dro-spin></span>' +
          '</div>' +
          '<div class="ts-view-wrap" data-ts-viewwrap tabindex="0" aria-describedby="' + id + '-keys"></div>' +
          '<div class="ts-msg" data-ts-msg role="status" aria-live="polite"></div>' +
        '</div>' +
        '<div class="ts-controls">' +
          '<p class="ts-controls-hint aside">Scroll this panel for tools and movement controls.</p>' +
          '<details class="ts-view-help"><summary>View and keyboard help</summary>' +
          '<div class="ts-view-opts">' +
            '<label><input type="checkbox" data-ts-opt="ghost" checked> Drawing outline and metal to remove</label>' +
            '<label><input type="checkbox" data-ts-opt="zoom"> Close up on the tool</label>' +
          '</div>' +
          '<p class="ts-legend" data-ts-legend>' +
            '<span class="ts-key ts-key-ghost" aria-hidden="true"></span> the drawing, placed at Z0 ' +
            '<span class="ts-key ts-key-excess" aria-hidden="true"></span> metal still to come off ' +
            '<span class="ts-key ts-key-under" aria-hidden="true"></span> already smaller than the drawing allows ' +
            '<span class="ts-key ts-key-edge" aria-hidden="true"></span> the tool\'s cutting edge ' +
            '<span class="ts-key ts-key-ref" aria-hidden="true"></span> the point the readout follows' +
          '</p>' +
          '<p class="ts-keys aside" id="' + id + '-keys">Drag the tool, one slide at a time. Or select the view and use the arrow keys: left and right move along Z, up and down move X. Keys 1, 2 and 3 set the step; S starts or stops the spindle; U undoes; M measures.</p>' +
          '</details>' +
          '<div class="ts-run">' +
            '<button type="button" class="ts-spindle" data-ts-act="spindle" aria-pressed="false">Start spindle</button>' +
            '<button type="button" data-ts-act="measure">Measure the part</button>' +
            '<button type="button" data-ts-act="undo">Undo</button>' +
          '</div>' +
          '<div class="ts-jog">' +
            '<div class="ts-steps" role="radiogroup" aria-label="Step for each move">' +
              '<span class="ts-k" aria-hidden="true">Step</span>' +
              STEPS.map(function (s, k) { return '<label><input type="radio" name="' + id + '-step" value="' + s + '"' + (k === 1 ? ' checked' : '') + '> ' + M.fmt(s) + '</label>'; }).join('') +
            '</div>' +
            '<div class="ts-pad" role="group" aria-label="Move the tool one step">' +
              '<button type="button" class="ts-jogbtn ts-up" data-ts-jog="x+"><span aria-hidden="true">▲</span> X+ <span class="ts-jog-sub">away from center</span></button>' +
              '<button type="button" class="ts-jogbtn ts-left" data-ts-jog="z-"><span aria-hidden="true">◀</span> Z− <span class="ts-jog-sub">toward chuck</span></button>' +
              '<button type="button" class="ts-jogbtn ts-right" data-ts-jog="z+">Z+ <span aria-hidden="true">▶</span> <span class="ts-jog-sub">toward tailstock</span></button>' +
              '<button type="button" class="ts-jogbtn ts-down" data-ts-jog="x-"><span aria-hidden="true">▼</span> X− <span class="ts-jog-sub">toward center</span></button>' +
            '</div>' +
          '</div>' +
          '<form class="ts-feed" data-ts-feed novalidate>' +
            '<div class="ts-feed-row"><label for="' + id + '-fz">Z</label><input id="' + id + '-fz" type="text" inputmode="decimal" autocomplete="off" data-ts-in="z"><button type="button" data-ts-act="feed-z">Feed to Z</button></div>' +
            '<div class="ts-feed-row" data-ts-xrow><label for="' + id + '-fx">X&nbsp;Ø</label><input id="' + id + '-fx" type="text" inputmode="decimal" autocomplete="off" data-ts-in="x"><button type="button" data-ts-act="feed-x">Feed to X</button></div>' +
            '<div class="ts-feed-row" data-ts-threadrow><label for="' + id + '-fs">Stop at Z</label><input id="' + id + '-fs" type="text" inputmode="decimal" autocomplete="off" placeholder="such as -0.690" data-ts-in="stop"><button type="button" data-ts-act="thread">Threading pass</button></div>' +
            '<button type="button" class="ts-hold" data-ts-act="hold" hidden>Stop the feed</button>' +
          '</form>' +
          '<fieldset class="ts-tools">' +
            '<legend class="ts-k">Tool</legend>' +
            '<div class="ts-tool-group"><span class="ts-k2">Tool post (cross slide)</span><div class="ts-tool-row">' + tools('post') + '</div></div>' +
            '<div class="ts-tool-group"><span class="ts-k2">Tailstock (on the centerline)</span><div class="ts-tool-row">' + tools('tailstock') + '</div></div>' +
          '</fieldset>' +
          '<div class="ts-toolinfo" data-ts-toolinfo>' +
            '<p class="ts-tool-name" data-ts-toolname></p>' +
            '<p data-ts-does></p>' +
            '<p class="ts-cannot" data-ts-cannot></p>' +
            '<div class="ts-opts">' +
              '<label data-ts-drill-wrap>Drill size <select data-ts-drill>' + M.DRILLS.map(function (d) { return '<option value="' + d.id + '">' + esc(d.label) + '</option>'; }).join('') + '</select></label>' +
              '<label data-ts-tpi-wrap>Threads per inch <select data-ts-tpi>' + M.PITCHES.map(function (p) { return '<option value="' + p + '">' + p + '</option>'; }).join('') + '</select></label>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '</div><div class="ts-inspect">' +
          '<div class="ts-inspect-head">' +
            '<span class="ts-k">The drawing and your part</span>' +
            '<p class="ts-verdict" data-ts-verdict></p>' +
          '</div>' +
          '<div class="ts-inspect-body">' +
            '<div class="ts-partfig" data-ts-partfig hidden></div>' +
            '<ol class="ts-items" data-ts-items></ol>' +
          '</div>' +
          '<ul class="ts-notes" data-ts-notes></ul>' +
        '</div>' +

        '<details class="ts-log"><summary>What you have done (<span data-ts-logn>0</span>)</summary><ol data-ts-log></ol></details>' +
      '</div>';
  }

  /* ---- one simulator -------------------------------------------------------------*/
  function init(root) {
    var id = 'ts' + (++instance);
    root.insertAdjacentHTML('beforeend', markup(id));
    root.classList.add('ts-live');
    var lab = $(root, '.ts-lab');
    guardKeys(lab);

    var el = {
      drawing: $(lab, '[data-ts-drawing]'), wrap: $(lab, '[data-ts-viewwrap]'),
      x: $(lab, '[data-ts-x]'), z: $(lab, '[data-ts-z]'), droTool: $(lab, '[data-ts-dro-tool]'), droSpin: $(lab, '[data-ts-dro-spin]'),
      toolName: $(lab, '[data-ts-toolname]'), does: $(lab, '[data-ts-does]'), cannot: $(lab, '[data-ts-cannot]'),
      drill: $(lab, '[data-ts-drill]'), drillWrap: $(lab, '[data-ts-drill-wrap]'), tpi: $(lab, '[data-ts-tpi]'), tpiWrap: $(lab, '[data-ts-tpi-wrap]'),
      spindle: $(lab, '[data-ts-act="spindle"]'), msg: $(lab, '[data-ts-msg]'),
      inZ: $(lab, '[data-ts-in="z"]'), inX: $(lab, '[data-ts-in="x"]'), inStop: $(lab, '[data-ts-in="stop"]'),
      xRow: $(lab, '[data-ts-xrow]'), threadRow: $(lab, '[data-ts-threadrow]'), hold: $(lab, '[data-ts-act="hold"]'),
      verdict: $(lab, '[data-ts-verdict]'), items: $(lab, '[data-ts-items]'), notes: $(lab, '[data-ts-notes]'), partfig: $(lab, '[data-ts-partfig]'),
      log: $(lab, '[data-ts-log]'), logn: $(lab, '[data-ts-logn]')
    };
    var parts = {};          // part id -> { st, undo, log, measured, stale }
    var cur = null, st = null, T = null, f = null, view = null, P = {};
    var opt = { ghost: true, zoom: false, step: 0.010 };
    var busy = null;         // a running feed: { stop: fn }
    var jogGroup = null, drag = null, dirty = false, specCache = {}, returnFocus = null;

    /* ---- the part on the machine ---------------------------------------------*/
    function partState(pid) {
      if (!parts[pid]) { parts[pid] = { st: M.create(pid), undo: [], log: [], measured: null, stale: false }; }
      return parts[pid];
    }
    function choosePart(pid) {
      if (busy) { return; }
      cur = partState(pid); st = cur.st; T = M.target(pid); f = R.frame(T);
      $$(lab, '[data-ts-part]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-ts-part') === pid)); });
      el.drawing.innerHTML = '<div class="ts-drawing-scroll" tabindex="0" role="region" aria-label="Dimensioned part drawing; scroll horizontally if needed">' + R.drawing(T, { idPrefix: id + '-d-' + pid }) + '</div>' +
        '<figcaption><strong>' + esc(T.title) + '.</strong> ' + esc(T.summary) + ' Starts from ' + M.fmt(T.stock.dia) + ' in round bar. ' +
        '<span class="ts-teaches">' + esc(T.teaches) + '</span><span class="ts-drawing-hint">Dimensions in inches. Scroll the drawing sideways on a narrow screen.</span></figcaption>';
      buildView();
      toolUI();
      renderLog();
      renderInspection();
      if (!cur.log.length) {
        say('info', 'Ready.', 'A fresh ' + M.fmt(T.stock.dia) + ' in bar is in the chuck, its sawn end a little past Z0. Start the spindle, pick a tool and bring it to the work.');
      } else {
        say('info', 'Back to the ' + T.title.toLowerCase() + '.', 'The work is where you left it.');
      }
    }
    function buildView() {
      el.wrap.innerHTML = R.scene(st, { idPrefix: id + '-v', ghost: opt.ghost, tint: opt.ghost });
      win = null;
      view = $(el.wrap, 'svg');
      P = {};
      $$(view, '[data-ts]').forEach(function (n) { P[n.getAttribute('data-ts')] = n; });
      P.tool.insertAdjacentHTML('beforeend', '<rect class="ts-handle" x="-46" y="-46" width="92" height="92"/>');
      wireDrag();
      draw();
    }
    function toolShape() {
      P.tool.innerHTML = R.toolShape(st.tool, { drill: M.drillSize(st) }) + '<rect class="ts-handle" x="-46" y="-46" width="92" height="92"/>';
    }

    /* ---- drawing --------------------------------------------------------------*/
    function draw(piece) {
      var work = piece || st.work;
      var w = R.workPaths(work, f);
      P.sec.setAttribute('d', w.sec); P.ext.setAttribute('d', w.ext); P.bore.setAttribute('d', w.bore);
      P.edges.setAttribute('d', w.edges); P.threads.setAttribute('d', w.threads); P.knurl.setAttribute('d', w.knurl);
      if (opt.ghost) {
        var c = R.comparePaths({ targetId: st.targetId, work: work }, f);
        P.excess.setAttribute('d', c.excess); P['excess-bottom'].setAttribute('d', c.excessBottom); P.under.setAttribute('d', c.under);
      }
      P.tool.setAttribute('transform', 'translate(' + f.x(st.tz) + ' ' + f.y(st.tr) + ')');
      var pos = M.position(st), t = M.TOOLS[st.tool];
      el.x.textContent = t.side === 'axial' ? 'center' : M.fmt(pos.x);
      el.z.textContent = M.fmt(pos.z);
      el.droTool.textContent = t.name + (st.tool === 'drill' ? ' ' + M.fmt(M.drillSize(st)) : '') + (t.action === 'thread' ? ', ' + st.tpi + ' per inch' : '');
      el.droSpin.textContent = st.spindle ? 'Spindle running' : 'Spindle stopped';
      lab.classList.toggle('is-running', st.spindle);
      view.setAttribute('aria-label', 'The work in the lathe, upper half cut away. ' + t.name + ' at ' + (t.side === 'axial' ? 'the centerline' : 'X ' + M.fmt(pos.x)) + ', Z ' + M.fmt(pos.z) + '. Spindle ' + (st.spindle ? 'running' : 'stopped') + '.' + (st.part ? ' A part has been cut off.' : ''));
      applyZoom();
    }
    function later() { if (dirty) { return; } dirty = true; requestAnimationFrame(function () { dirty = false; draw(); }); }
    var win = null;          // the close-up window, [x0, y0, w, h]
    function applyZoom(recenter) {
      if (!opt.zoom) { win = null; view.setAttribute('viewBox', '0 0 ' + f.W + ' ' + f.H); return; }
      var w = f.W / 2.4, h = f.H / 2.4;
      var cx = f.x(st.tz), cy = f.y(M.TOOLS[st.tool].side === 'out' ? st.tr : Math.max(0, st.tr));
      // A drag measures the pointer against the picture, so the picture holds still under it.
      if (drag && win) { return; }
      var inside = win && cx > win[0] + 0.2 * w && cx < win[0] + 0.8 * w && cy > win[1] + 0.2 * h && cy < win[1] + 0.8 * h;
      if (!recenter && inside) { return; }
      var x0 = Math.max(0, Math.min(f.W - w, cx - w / 2)), y0 = Math.max(0, Math.min(f.H - h, cy - h / 2));
      win = [x0, y0, w, h];
      view.setAttribute('viewBox', win.map(function (v) { return Math.round(v * 10) / 10; }).join(' '));
    }

    /* ---- chips: only where the model removed metal -------------------------------*/
    var chipBudget = 0;
    function chips(res) {
      if (reduceMotion.matches || !res || !(res.cut > 0)) { return; }
      var t = now();
      if (t < chipBudget) { return; }
      chipBudget = t + 70;
      var tool = M.TOOLS[st.tool], x = f.x(st.tz), y = f.y(st.tr);
      if (tool.side === 'axial') { x = f.x(Math.min(0.02, M.frontZ(st.work))); y = f.y(M.drillSize(st) / 2 + 0.02); }
      var dir = tool.side === 'in' ? -1 : 1;
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      var k = Math.random();
      c.setAttribute('class', 'ts-chip');
      c.setAttribute('d', 'M0 0c4 -6 10 -6 11 0s-6 7 -10 3');
      c.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
      c.style.setProperty('--dx', Math.round((10 + k * 26) * (tool.side === 'axial' ? 1.6 : 1)) + 'px');
      c.style.setProperty('--dy', Math.round(-dir * (18 + k * 22)) + 'px');
      c.style.setProperty('--x', x + 'px'); c.style.setProperty('--y', y + 'px');
      P.chips.appendChild(c);
      setTimeout(function () { if (c.parentNode) { c.parentNode.removeChild(c); } }, 700);
    }

    /* ---- messages and the log ---------------------------------------------------------*/
    function say(kind, title, text) {
      el.msg.className = 'ts-msg is-' + kind;
      el.msg.innerHTML = '<strong>' + esc(title) + '</strong> ' + esc(text || '');
    }
    function log(text) {
      cur.log.push(text);
      if (cur.log.length > 300) { cur.log.shift(); }
      var li = document.createElement('li');
      li.textContent = text;
      el.log.appendChild(li);
      while (el.log.children.length > 300) { el.log.removeChild(el.log.firstChild); }
      el.logn.textContent = String(cur.log.length);
    }
    function renderLog() {
      el.log.innerHTML = cur.log.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
      el.logn.textContent = String(cur.log.length);
    }
    function where() { var t = M.TOOLS[st.tool], p = M.position(st); return (t.side === 'axial' ? '' : 'X ' + M.fmt(p.x) + ', ') + 'Z ' + M.fmt(p.z); }
    function pushUndo(snap, label) {
      cur.undo.push({ snap: snap, label: label });
      if (cur.undo.length > 120) { cur.undo.shift(); }
      if (cur.measured) { cur.stale = true; renderInspection(); }
    }

    /* After any move: tell the learner what happened, in the model's words. */
    function report(res, label) {
      if (res.parted) {
        log(label + ': parted off at ' + where());
        say('done', 'Parted off.', 'The part has dropped clear of the lathe. Its inspection is below.');
        measure(true);
        return;
      }
      if (res.stop) {
        var code = res.stop.code;
        if (code === 'limit' || code === 'axis') { say('info', code === 'axis' ? 'On the centerline.' : 'End of travel.', res.stop.text); return; }
        if (code === 'air') { say('info', 'Nothing cut.', res.stop.text); log(label + ': cut nothing'); return; }
        say('stop', 'Stopped.', res.stop.text);
        log(label + ': stopped at ' + where() + ' (' + res.stop.text.split('. ')[0] + ')');
        return;
      }
      if (res.formed) { say('form', 'Forming.', 'The knurl is pressing a pattern into the surface. No chips: the metal is pushed aside, and the diameter over the points grows.'); return; }
      if (res.cut > 0) {
        var t = M.TOOLS[st.tool];
        say('cut', 'Cutting.', (t.side === 'axial' ? 'Drilling on the centerline' : 'The ' + t.name.toLowerCase() + ' is taking a chip') + ', now at ' + where() + '.');
      }
    }

    /* ---- tools and spindle --------------------------------------------------------------*/
    function toolUI() {
      var t = M.TOOLS[st.tool];
      $$(lab, '[data-ts-tool]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-ts-tool') === st.tool)); });
      el.toolName.innerHTML = '<strong>' + esc(t.name) + '</strong>' + (t.action === 'form' ? ' <span class="ts-tag">forms, does not cut</span>' : (t.action === 'thread' ? ' <span class="ts-tag">driven by the leadscrew</span>' : ''));
      el.does.textContent = t.does;
      el.cannot.textContent = t.cannot;
      el.drillWrap.hidden = st.tool !== 'drill';
      el.tpiWrap.hidden = t.action !== 'thread';
      el.threadRow.hidden = t.action !== 'thread';
      el.xRow.hidden = t.side === 'axial';
      el.drill.value = st.drill; el.tpi.value = String(st.tpi);
      $$(lab, '[data-ts-jog^="x"]').forEach(function (b) { b.disabled = t.side === 'axial'; });
      syncInputs();
      el.spindle.setAttribute('aria-pressed', String(st.spindle));
      el.spindle.textContent = st.spindle ? 'Stop spindle' : 'Start spindle';
    }
    function syncInputs() {
      var p = M.position(st);
      if (document.activeElement !== el.inZ) { el.inZ.value = M.fmt(p.z).replace('−', '-'); }
      if (document.activeElement !== el.inX) { el.inX.value = M.fmt(p.x).replace('−', '-'); }
    }
    function changeTool(tid) {
      if (busy) { return; }
      if (tid === st.tool) { return; }
      var snap = M.snapshot(st);
      var r = M.selectTool(st, tid);
      if (!r.ok) { say('stop', 'Spindle running.', r.text); return; }
      cur.undo.push({ snap: snap, label: 'the change to the ' + M.TOOLS[tid].name.toLowerCase() });
      log('Changed to the ' + M.TOOLS[tid].name.toLowerCase());
      toolShape(); toolUI(); draw();
      say('info', M.TOOLS[tid].name + '.', 'Parked clear of the work at ' + where() + '. ' + M.TOOLS[tid].does);
    }
    function toggleSpindle() {
      M.setSpindle(st, !st.spindle);
      log(st.spindle ? 'Started the spindle' : 'Stopped the spindle');
      toolUI(); draw();
      say('info', st.spindle ? 'Spindle running.' : 'Spindle stopped.', st.spindle ? 'The work is turning. Tools now cut where they touch it.' : 'You can change tools and measure the part.');
      if (!st.spindle && busy) { /* the running feed meets the work next and stops */ }
    }

    /* ---- moving the tool -------------------------------------------------------------------*/
    function jog(axis, sign) {
      if (busy) { return; }
      var t = M.TOOLS[st.tool], d = opt.step * sign;
      if (axis === 'x' && t.side === 'axial') { say('info', 'On the centerline.', M.explain(st, 'axis')); return; }
      var tnow = now();
      if (!jogGroup || tnow > jogGroup.until || jogGroup.tool !== st.tool) { jogGroup = { snap: M.snapshot(st), pushed: false, tool: st.tool }; }
      jogGroup.until = tnow + 1500;
      var res = axis === 'z' ? M.move(st, r3(st.tz + d), r3(st.tr * 2)) : M.move(st, st.tz, r3(st.tr * 2 + d));
      if ((res.contact || res.parted) && !jogGroup.pushed) { pushUndo(jogGroup.snap, 'the moves by hand'); jogGroup.pushed = true; log('Moved by hand into the work at ' + where()); }
      chips(res);
      later(); syncInputs();
      report(res, 'Moved by hand');
    }
    function feedTo(axis) {
      if (busy) { return; }
      var input = axis === 'z' ? el.inZ : el.inX;
      var v = parseNum(input.value);
      if (v === null) { say('stop', 'Not a number.', 'Type a position in inches, such as ' + (axis === 'z' ? '-1.250' : '0.750') + '.'); input.focus(); return; }
      var target = axis === 'z' ? { z: v, x: st.tr * 2 } : { z: st.tz, x: v };
      run(target, 'Fed ' + axis.toUpperCase() + ' to ' + M.fmt(v), 'the feed to ' + axis.toUpperCase() + ' ' + M.fmt(v));
    }
    function run(target, label, undoLabel) {
      var snap = M.snapshot(st), contact = false, last = now(), speed = SPEED.rapid;
      var cutAny = 0, formed = false;
      function done(res) {
        busy = null; setBusy(false);
        if (contact || (res && res.parted)) { pushUndo(snap, undoLabel); }
        log(label + (contact ? ' (cutting), ' : ', ') + 'now at ' + where());
        if (res) { report(res, label); }
        else if (contact) { report({ cut: cutAny, formed: formed }, label); }
        else { say('info', 'Moved.', 'The tool is at ' + where() + '.'); }
        syncInputs(); draw();
      }
      if (reduceMotion.matches) {
        var r0 = M.move(st, target.z, target.x);
        contact = r0.contact || r0.parted; cutAny = r0.cut; formed = r0.formed;
        done(r0.stop ? r0 : null);
        return;
      }
      var stopped = false;
      busy = { stop: function () { stopped = true; } };
      setBusy(true);
      (function tick() {
        requestAnimationFrame(function () {
          if (stopped) { done({ stop: { code: 'hold', text: 'You stopped the feed.' } }); return; }
          var t = now(), dt = Math.min(0.05, (t - last) / 1000); last = t;
          var cz = st.tz, cr = st.tr, dz = target.z - cz, dr = target.x / 2 - cr, dist = Math.sqrt(dz * dz + dr * dr);
          if (dist < 1e-7) { done(null); return; }
          var len = Math.min(dist, speed * dt);
          var nz = len >= dist ? target.z : cz + dz / dist * len, nx = len >= dist ? target.x : 2 * (cr + dr / dist * len);
          var res = M.move(st, nz, nx);
          if (res.contact) {
            contact = true; cutAny += res.cut; formed = formed || res.formed; speed = SPEED.feed; chips(res);
            if (cur.measured && !cur.stale) { cur.stale = true; renderInspection(); }
          }
          else { speed = SPEED.rapid; }
          draw();
          if (res.stop) { done(res); return; }
          if (!res.moved) { done(null); return; }
          tick();
        });
      })();
    }
    function threadPass() {
      if (busy) { return; }
      var v = parseNum(el.inStop.value);
      if (v === null) { say('stop', 'Not a number.', 'Type the Z the pass should stop at, such as -0.690.'); el.inStop.focus(); return; }
      var snap = M.snapshot(st), z0 = st.tz, before = snap.work;
      var res = M.threadPass(st, v);
      if (!res.moved) { say('stop', 'No pass.', res.stop.text); log('Threading pass refused (' + res.stop.text.split('. ')[0] + ')'); return; }
      pushUndo(snap, 'the threading pass');
      var label = 'Threading pass at ' + st.tpi + ' per inch, X ' + M.fmt(st.tr * 2) + ' to Z ' + M.fmt(res.to);
      var after = st.work, zEnd = st.tz;
      function finish(interrupted) {
        busy = null; setBusy(false);
        if (interrupted) {
          // The completed pass was only an animation plan. Rebuild the real
          // work up to the last displayed position, preserving a spindle stop.
          var running = st.spindle;
          M.restore(st, snap);
          res = M.threadPass(st, zt);
          st.tz = zt;
          M.setSpindle(st, running);
        } else { st.tz = zEnd; }
        draw(); syncInputs();
        log(label + (interrupted ? ', interrupted at Z ' + M.fmt(st.tz) : (res.crashed ? ', stopped early' : '')));
        if (interrupted) { say('stop', 'Feed stopped.', 'The tool is at Z ' + M.fmt(st.tz) + '. Only the portion reached before the stop has been applied. Retract before returning.'); return; }
        if (res.stop) { say(res.crashed ? 'stop' : 'info', res.crashed ? 'Stopped.' : 'Nothing cut.', res.stop.text); }
        else { say('cut', 'Threading pass done.', 'The tool followed one helix from Z ' + M.fmt(z0) + ' to Z ' + M.fmt(zEnd) + ', ' + res.notches + ' turns. Back it out past the crests before you bring the carriage back.'); }
      }
      if (reduceMotion.matches) { finish(); return; }
      var stopped = false, last = now(), zt = z0;
      busy = { stop: function () { stopped = true; } };
      setBusy(true);
      (function tick() {
        requestAnimationFrame(function () {
          if (stopped || !st.spindle) { finish(true); return; }
          var t = now(), dt = Math.min(0.05, (t - last) / 1000); last = t;
          zt = Math.max(zEnd, zt - SPEED.thread * dt);
          st.tz = zt;
          draw(mix(before, after, zt));
          chips({ cut: 1 });
          if (zt <= zEnd + 1e-9) { finish(); return; }
          tick();
        });
      })();
    }
    /* The work as the pass leaves it: cut behind the tool, untouched ahead. */
    function mix(a, b, zt) {
      var m = { zL: a.zL, n: a.n, ro: new Float64Array(a.n), ri: new Float64Array(a.n), kB: new Float64Array(a.n), kP: new Float64Array(a.n), thO: new Float64Array(a.n), thI: new Float64Array(a.n) };
      for (var i = 0; i < a.n; i++) {
        var src = M.zc(a, i) >= zt ? b : a;
        m.ro[i] = src.ro[i]; m.ri[i] = src.ri[i]; m.kB[i] = src.kB[i]; m.kP[i] = src.kP[i]; m.thO[i] = src.thO[i]; m.thI[i] = src.thI[i];
      }
      return m;
    }
    function setBusy(on) {
      lab.classList.toggle('is-busy', on);
      el.hold.hidden = !on;
      $$(lab, '.ts-controls button, .ts-bar button').forEach(function (b) { if (b !== el.hold && b !== el.spindle) { b.disabled = on || (b.hasAttribute('data-ts-jog') && /^x/.test(b.getAttribute('data-ts-jog')) && M.TOOLS[st.tool].side === 'axial'); } });
      if (on) {
        returnFocus = document.activeElement;
        if (returnFocus && returnFocus.tagName === 'BUTTON') { el.hold.focus({ preventScroll: true }); }
      } else {
        if (returnFocus && returnFocus.focus && (document.activeElement === el.hold || document.activeElement === document.body)) { returnFocus.focus({ preventScroll: true }); }
        returnFocus = null;
      }
    }

    /* ---- dragging, one slide at a time -------------------------------------------------------*/
    function toUser(e) {
      var pt = view.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      var m = view.getScreenCTM();
      return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
    }
    function wireDrag() {
      P.tool.addEventListener('pointerdown', function (e) {
        if (busy || (e.button !== undefined && e.button !== 0)) { return; }
        e.preventDefault();
        try { P.tool.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
        drag = { pid: e.pointerId, p0: toUser(e), z0: st.tz, x0: st.tr * 2, axis: M.TOOLS[st.tool].side === 'axial' ? 'z' : null, snap: M.snapshot(st), contact: false, moved: false };
        lab.classList.add('is-dragging');
      });
      P.tool.addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.pid) { return; }
        var p = toUser(e), dzu = (p.x - drag.p0.x) / R.S, dru = -(p.y - drag.p0.y) / R.S;
        if (!drag.axis) {
          if (Math.sqrt(dzu * dzu + dru * dru) * R.S < 5) { return; }
          drag.axis = Math.abs(dzu) >= Math.abs(dru) ? 'z' : 'x';
        }
        var tz = drag.axis === 'z' ? r3(drag.z0 + dzu) : st.tz;
        var tx = drag.axis === 'x' ? r3(drag.x0 + 2 * dru) : st.tr * 2;
        var res = M.move(st, tz, tx);
        if (res.moved) { drag.moved = true; }
        if (res.contact || res.parted) { drag.contact = true; }
        chips(res);
        later(); syncInputs();
        if (res.stop || res.cut > 0 || res.formed) { report(res, 'Moved by hand'); }
        if (res.parted) { endDrag(); }
      });
      function endDrag() {
        if (!drag) { return; }
        if (drag.contact) { pushUndo(drag.snap, 'the move by hand'); }
        if (drag.moved) { log('Moved by hand' + (drag.contact ? ' (cutting)' : '') + ' to ' + where()); }
        drag = null;
        lab.classList.remove('is-dragging');
      }
      P.tool.addEventListener('pointerup', endDrag);
      P.tool.addEventListener('pointercancel', endDrag);
      P.tool.addEventListener('lostpointercapture', endDrag);
    }

    /* ---- inspection -----------------------------------------------------------------------*/
    var STATUS = { ok: 'Meets the drawing', over: 'More to do', under: 'Too far: scrap', missing: 'Not made yet', pending: 'After parting' };
    function measure(auto) {
      if (!auto && st.spindle && !st.part) {
        say('stop', 'Spindle running.', 'Stop the spindle before you measure. A caliper or micrometer never goes on turning work.');
        return;
      }
      cur.measured = M.evaluate(st); cur.stale = false;
      if (!auto) { log('Measured the part'); say('info', 'Measured.', cur.measured.okCount + ' of ' + cur.measured.total + ' features meet the drawing. The list below says what each one needs.'); }
      renderInspection();
    }
    function renderInspection() {
      var spec = specCache[T.id] || (specCache[T.id] = M.evaluate(M.create(T.id)).items);
      var ev = cur.measured;
      lab.classList.toggle('ts-measured', !!ev && !cur.stale);
      var by = {};
      if (ev) { ev.items.forEach(function (it) { by[it.id] = it; }); }
      el.items.innerHTML = spec.map(function (s) {
        var it = by[s.id];
        var stt = it ? it.status : 'none';
        var made = it ? it.made : (ev ? 'Not measured' : 'Not measured yet');
        return '<li class="ts-item is-' + stt + '">' +
          '<div class="ts-item-head"><span class="ts-item-label">' + esc(s.label) + '</span>' + (it ? '<span class="ts-badge">' + esc(STATUS[stt] || '') + '</span>' : '') + '</div>' +
          '<div class="ts-item-row"><span class="ts-k">Drawing</span><span>' + esc(s.spec) + '</span></div>' +
          '<div class="ts-item-row"><span class="ts-k">Your part</span><span>' + esc(made) + '</span></div>' +
          (it && it.hint ? '<p class="ts-item-hint">' + esc(it.hint) + '</p>' : '') +
          '</li>';
      }).join('');
      if (!ev) {
        el.verdict.textContent = 'Not measured yet. Stop the spindle and press Measure the part.';
      } else if (cur.stale) {
        el.verdict.innerHTML = '<strong>Measurement out of date.</strong> The work changed after these readings. Stop the spindle and measure again before judging the current part.';
      } else if (ev.accepted) {
        el.verdict.innerHTML = '<strong>The part meets the drawing.</strong> All ' + ev.total + ' features are within their limits.';
      } else {
        el.verdict.innerHTML = '<strong>' + ev.okCount + ' of ' + ev.total + '</strong> features meet the drawing' + (ev.parted ? '.' : ' so far.') + (cur.stale ? ' <em>You have cut since this measurement.</em>' : '');
      }
      el.notes.innerHTML = ev && ev.notes.length ? ev.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') : '';
      el.partfig.hidden = !st.part;
      el.partfig.innerHTML = st.part ? R.partFigure(st.part, { idPrefix: id + '-part' }) + '<p class="aside">The part as it came off, upper half cut away.</p>' : '';
    }

    /* ---- undo and new bar ------------------------------------------------------------------*/
    function undo() {
      if (busy) { return; }
      var u = cur.undo.pop();
      if (!u) { say('info', 'Nothing to undo.', ''); return; }
      M.restore(st, u.snap);
      log('Undid ' + u.label);
      toolShape(); toolUI(); draw();
      if (cur.measured) { cur.stale = true; }
      renderInspection();
      say('info', 'Undone: ' + u.label + '.', 'The tool is back at ' + where() + '.');
    }
    function newBar() {
      if (busy) { return; }
      cur.undo.push({ snap: M.snapshot(st), label: 'the new bar' });
      var fresh = M.create(T.id);
      M.restore(st, M.snapshot(fresh));
      st.peck = null;
      cur.measured = null;
      log('Put a new bar in the chuck');
      toolShape(); toolUI(); draw(); renderInspection();
      say('info', 'New bar.', 'A fresh bar is in the chuck. Undo brings back the old one.');
    }

    /* ---- wiring ------------------------------------------------------------------------------*/
    lab.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !lab.contains(b) || b.disabled) { return; }
      if (b.hasAttribute('data-ts-part')) { choosePart(b.getAttribute('data-ts-part')); return; }
      if (b.hasAttribute('data-ts-tool')) { changeTool(b.getAttribute('data-ts-tool')); return; }
      if (b.hasAttribute('data-ts-jog')) {
        if (e.detail === 0) { var j = b.getAttribute('data-ts-jog'); jog(j[0], j[1] === '+' ? 1 : -1); }
        return;
      }
      switch (b.getAttribute('data-ts-act')) {
        case 'spindle': toggleSpindle(); break;
        case 'measure': measure(false); break;
        case 'undo': undo(); break;
        case 'new': newBar(); break;
        case 'feed-z': feedTo('z'); break;
        case 'feed-x': feedTo('x'); break;
        case 'thread': threadPass(); break;
        case 'hold': if (busy) { busy.stop(); } break;
      }
    });
    // Jog buttons repeat while held, like a handwheel kept turning.
    $$(lab, '[data-ts-jog]').forEach(function (b) {
      var t1 = null, t2 = null;
      function stop() { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; }
      b.addEventListener('pointerdown', function (e) {
        if (b.disabled || (e.button !== undefined && e.button !== 0)) { return; }
        var j = b.getAttribute('data-ts-jog'), ax = j[0], sg = j[1] === '+' ? 1 : -1;
        jog(ax, sg);
        t1 = setTimeout(function () { t2 = setInterval(function () { if (b.disabled) { stop(); return; } jog(ax, sg); }, 75); }, 400);
      });
      ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(function (ev) { b.addEventListener(ev, stop); });
    });
    $$(lab, '[data-ts-opt]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        opt[cb.getAttribute('data-ts-opt')] = cb.checked;
        if (cb.getAttribute('data-ts-opt') === 'ghost') { buildView(); } else { applyZoom(true); }
      });
    });
    $$(lab, 'input[name="' + id + '-step"]').forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) { opt.step = parseFloat(r.value); } });
    });
    el.drill.addEventListener('change', function () {
      var r = M.setDrill(st, el.drill.value);
      if (!r.ok) { el.drill.value = st.drill; say('stop', 'Spindle running.', r.text); return; }
      log('Put the ' + M.fmt(M.drillSize(st)) + ' in drill in the tailstock');
      toolShape(); toolUI(); draw();
    });
    el.tpi.addEventListener('change', function () {
      var r = M.setPitch(st, parseInt(el.tpi.value, 10));
      if (!r.ok) { el.tpi.value = String(st.tpi); say('stop', 'Spindle running.', r.text); return; }
      log('Set the leadscrew gearing to ' + st.tpi + ' threads per inch');
      draw();
      say('info', st.tpi + ' threads per inch.', 'Each pass now advances the tool ' + M.fmt(1 / st.tpi, 4) + ' in per turn of the work.');
    });
    el.inZ.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); feedTo('z'); } });
    el.inX.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); feedTo('x'); } });
    el.inStop.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); threadPass(); } });
    $(lab, '[data-ts-feed]').addEventListener('submit', function (e) { e.preventDefault(); });

    // Keys while the view has focus.
    el.wrap.addEventListener('keydown', function (e) {
      if (e.altKey || e.metaKey) { return; }
      var k = e.key, handled = true;
      if ((e.ctrlKey && (k === 'z' || k === 'Z'))) { undo(); }
      else if (e.ctrlKey) { return; }
      else if (k === 'ArrowLeft') { jog('z', -1); }
      else if (k === 'ArrowRight') { jog('z', 1); }
      else if (k === 'ArrowUp') { jog('x', 1); }
      else if (k === 'ArrowDown') { jog('x', -1); }
      else if (k === '1' || k === '2' || k === '3') {
        opt.step = STEPS[+k - 1];
        $$(lab, 'input[name="' + id + '-step"]').forEach(function (r) { r.checked = parseFloat(r.value) === opt.step; });
        say('info', 'Step ' + M.fmt(opt.step) + ' in.', '');
      }
      else if (k === 's' || k === 'S') { toggleSpindle(); }
      else if (k === 'u' || k === 'U') { undo(); }
      else if (k === 'm' || k === 'M') { measure(false); }
      else { handled = false; }
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    });

    // On a narrow surface, start close up on the tool; the box turns it off.
    if (lab.getBoundingClientRect().width < 480) { opt.zoom = true; $(lab, '[data-ts-opt="zoom"]').checked = true; }
    choosePart(M.TARGETS[0].id);
  }

  function boot() {
    $$(document, '[data-interactive="turning-simulator"]').forEach(function (root) {
      if (root.getAttribute('data-ts-ready')) { return; }
      root.setAttribute('data-ts-ready', '1');
      init(root);
    });
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); }
  else { boot(); }
})();
