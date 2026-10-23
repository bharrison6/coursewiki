/* ============================================================================
   gcode-playground / demo.js - the live playground in every mounted root.

   Build a program from blocks (or type it), and run it on the milling
   simulator's block. The pieces this file joins:
     blocks.js   the blocks, one per line of G-code, and the examples
     gcode.js    what each line means: the interpreter
     machine.js  running those lines on the block
     render.js   the top view and front section, as SVG

   ONE PROGRAM AT A TIME. The blocks are the program; the G-code text is
   written from them, read by the interpreter, previewed by one machine and
   run by another. Any edit re-reads the whole program and puts the running
   machine back to its start, so what is on screen is always this program.
   The preview runs the program at once to find its path, its time and its
   first stop; Play then executes it again, step by step - nothing is
   replayed from a recording.
   ==========================================================================*/
(function (root, factory) {
  var api = factory(root.CourseWikiMillingSim, root.CourseWikiGcode, root.CourseWikiGcodeMachine,
    root.CourseWikiGcodeBlocks, root.CourseWikiGcodeRender);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.CourseWikiGcodeDemo = api; api.boot(); }
})(typeof self !== 'undefined' ? self : this, function (M, G, X, B, R) {
  'use strict';

  var instances = 0;
  var SPEEDS = [1, 4, 10, 25, 100];
  var CHIPS = [
    ['setup', 'Units and coordinates', 'G21 G90'], ['tool', 'Tool change', 'T M6'], ['spindle', 'Spindle on', 'S M3'],
    ['rapid', 'Rapid move', 'G0'], ['feed', 'Feed move', 'G1'], ['arc', 'Arc', 'G2 G3'], ['more', 'Next point', 'X Y Z'],
    ['drill', 'Drilling cycle', 'G81'], ['cancel', 'End cycle', 'G80'], ['stop', 'Spindle off', 'M5'],
    ['mode', 'Distance mode', 'G90 G91'], ['end', 'Program end', 'M30'], ['comment', 'Comment', '( )'], ['code', 'Code line', 'any']
  ];
  var KIND = { syntax: 'Not G-code', unsupported: 'Not supported here', program: 'Program error', machine: 'Machine stop' };

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === false || attrs[k] == null) return;
      e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    if (text != null) e.textContent = text;
    return e;
  }
  function button(label, attrs) { return el('button', Object.assign({ type: 'button' }, attrs || {}), label); }
  function clock(s) {
    if (!isFinite(s)) return '–';
    var m = Math.floor(s / 60), r = s - 60 * m;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
  }
  function vol(v) { return v >= 10000 ? Math.round(v).toLocaleString('en-US') : v >= 10 ? Math.round(v) + '' : M.fmt(v, 1); }

  /* Keys the playground uses itself must not also turn a presentation's page. */
  function isolateKeys(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Escape') return;
    if ([' ', 'Spacebar', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].indexOf(e.key) >= 0) e.stopPropagation();
  }

  function wire(rootEl) {
    if (rootEl.hasAttribute('data-gp-wired')) return;
    rootEl.setAttribute('data-gp-wired', '');
    var host = rootEl.querySelector('[data-gp-live]') || rootEl.appendChild(el('div', { 'data-gp-live': '' }));
    var uid = 'gp' + (++instances) + '-' + Math.random().toString(36).slice(2, 6);
    var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    var machine = X.create(), previewSim = M.create();
    var S = {
      blocks: [], example: null, selected: null, program: null, preview: null,
      playing: false, stepOnce: false, raf: 0, last: null, speed: 10, tab: 'blocks',
      undo: [], editKey: null, changedAt: 0, nowKey: '', statusKey: '', textDirty: false, blocksDirty: false, timer: 0
    };
    var L = {};                      // the live SVG's layers

    /* ---- the page ----------------------------------------------------------------*/
    var app = el('div', { class: 'gp-app' });
    rootEl.addEventListener('keydown', isolateKeys);

    // goal
    var head = el('div', { class: 'gp-head' });
    var goal = el('div', { class: 'gp-goal' });
    var pick = el('div', { class: 'gp-pick' });
    var exSel = el('select', { id: uid + '-ex' });
    B.EXAMPLES.forEach(function (ex) { exSel.appendChild(el('option', { value: ex.id }, ex.title)); });
    pick.appendChild(el('label', { for: uid + '-ex' }, 'Program'));
    pick.appendChild(exSel);
    var brief = el('p', { class: 'gp-brief' });
    goal.appendChild(pick); goal.appendChild(brief);
    var tries = el('div', { class: 'gp-tries' });
    tries.appendChild(el('p', { class: 'gp-tries-title' }, 'Things to try'));
    var triesList = el('ol');
    tries.appendChild(triesList);
    head.appendChild(goal); head.appendChild(tries);

    // palette
    var palette = el('div', { class: 'gp-palette', role: 'toolbar', 'aria-label': 'Add a block to the program' });
    palette.appendChild(el('span', { class: 'gp-palette-label' }, 'Add a block'));
    CHIPS.forEach(function (c) {
      var b = button('', { class: 'gp-chip gp-cat-' + B.TYPES[c[0]].cat, 'data-type': c[0],
        'aria-label': 'Add ' + c[1] + ' (' + c[2] + ') after the selected block' });
      b.appendChild(document.createTextNode(c[1]));
      b.appendChild(el('code', {}, c[2]));
      palette.appendChild(b);
    });
    palette.appendChild(el('p', { class: 'gp-palette-hint' },
      'Press a block to add it after the selected one, or drag it into place in the program. Drag a block’s handle to move it; with the keyboard, focus the handle and press Alt with ↑ or ↓.'));

    // program
    var progPane = el('div', { class: 'gp-program', role: 'region', 'aria-label': 'Program' });
    var bar = el('div', { class: 'gp-program-bar' });
    var tabs = el('div', { class: 'gp-tabs', role: 'tablist', 'aria-label': 'Show the program as' });
    var tabBlocks = button('Blocks', { role: 'tab', 'aria-selected': 'true', 'aria-controls': uid + '-blocks', id: uid + '-tab-b' });
    var tabText = button('G-code text', { role: 'tab', 'aria-selected': 'false', 'aria-controls': uid + '-text', id: uid + '-tab-t' });
    tabs.appendChild(tabBlocks); tabs.appendChild(tabText);
    var bUndo = button('Undo', { disabled: true, title: 'Undo the last change to the program' });
    var bSee = button('See machine', { class: 'gp-phone-jump' });
    var count = el('span', { class: 'gp-count' });
    bar.appendChild(tabs); bar.appendChild(bUndo); bar.appendChild(bSee); bar.appendChild(count);
    var list = el('ol', { class: 'gp-blocks', id: uid + '-blocks', role: 'tabpanel', 'aria-labelledby': uid + '-tab-b' });
    var textPane = el('div', { class: 'gp-textpane', id: uid + '-text', role: 'tabpanel', 'aria-labelledby': uid + '-tab-t', hidden: true });
    var textArea = el('textarea', { id: uid + '-code', spellcheck: 'false', autocomplete: 'off', 'aria-describedby': uid + '-textnote' });
    var textNote = el('p', { class: 'gp-textnote', id: uid + '-textnote' },
      'The program as a control reads it, one line per block. Type here and the same interpreter reads it as you go; back in Blocks, each line is a block again.');
    var problems = el('ul', { class: 'gp-problems', 'aria-label': 'Problems in the program' });
    var bCopy = button('Copy the program');
    textPane.appendChild(el('label', { for: uid + '-code', class: 'gp-vh' }, 'G-code program'));
    textPane.appendChild(textArea); textPane.appendChild(textNote); textPane.appendChild(problems); textPane.appendChild(bCopy);
    progPane.appendChild(bar); progPane.appendChild(list); progPane.appendChild(textPane);

    // work
    var work = el('div', { class: 'gp-work' });
    var view = el('div', { class: 'gp-view', id: uid + '-view', tabindex: '-1', role: 'region', 'aria-label': 'Toolpath and workpiece drawing' });
    var viewTools = el('div', { class: 'gp-view-tools' });
    var bZoom = button('Enlarge drawing', { 'aria-pressed': 'false', 'aria-controls': uid + '-view' });
    var zoomHint = el('span', {}, 'Enlarge, then scroll the drawing sideways to read its labels.');
    viewTools.appendChild(bZoom); viewTools.appendChild(zoomHint);
    var transport = el('div', { class: 'gp-transport', role: 'group', 'aria-label': 'Run the program' });
    var bReset = button('Restart', { title: 'Back to the start: a fresh block and the tool at its start point' });
    var bBack = button('Back', { title: 'Back one block' });
    var bPlay = button('Play', { class: 'gp-primary' });
    var bStep = button('Step', { title: 'Run one block, then stop' });
    var bEnd = button('To the end', { title: 'Run the rest of the program at once' });
    var bEdit = button('Edit selected block', { class: 'gp-phone-jump' });
    var timeline = el('div', { class: 'gp-timeline' });
    var timeText = el('span', { class: 'gp-time' });
    var speedSel = el('select', { id: uid + '-speed', title: 'How fast the simulation runs, against real machine time' });
    SPEEDS.forEach(function (v) { var o = el('option', { value: String(v) }, '×' + v + (v === 1 ? ' real time' : '')); if (v === S.speed) o.selected = true; speedSel.appendChild(o); });
    var speed = el('span', { class: 'gp-speed' });
    speed.appendChild(el('label', { for: uid + '-speed', class: 'gp-vh' }, 'Simulation speed')); speed.appendChild(speedSel);
    [bReset, bBack, bPlay, bStep, bEnd, bEdit].forEach(function (b) { transport.appendChild(b); });
    timeline.appendChild(timeText); timeline.appendChild(speed);
    var now = el('div', { class: 'gp-now' });
    var dro = el('div', { class: 'gp-state', role: 'group', 'aria-label': 'Where the tool is' });
    var droVal = {};
    ['X', 'Y', 'Z'].forEach(function (a) {
      var box = el('div', { class: 'gp-dro' });
      box.appendChild(el('span', {}, a));
      droVal[a] = el('span', {});
      box.appendChild(droVal[a]);
      dro.appendChild(box);
    });
    var modes = el('div', { class: 'gp-modes', role: 'group', 'aria-label': 'Machine state' });
    var subset = el('p', { class: 'gp-subset' });
    subset.innerHTML = 'Reads <code>G0 G1 G2 G3 G17 G20 G21 G40 G49 G54 G80 G81 G90 G91 G90.1 G91.1 G94 G98 G99</code>, ' +
      '<code>M2 M3 M5 M6 M8 M9 M30</code> and <code>F S T N X Y Z I J R</code>. Anything else stops the program at its line. ' +
      'Feeds and rapids run at a constant speed, with no acceleration.';
    work.appendChild(viewTools); work.appendChild(view);
    var status = el('div', { class: 'gp-status' });
    [transport, timeline, now, dro, modes, subset].forEach(function (n) { status.appendChild(n); });
    status.appendChild(el('p', { class: 'gp-subset' }, 'Z is the tool tip’s position from work zero. The raw top starts at Z+1; cut depth depends on the surface already there. A drill’s full-diameter depth is shorter than its tip depth.'));
    var live = el('p', { class: 'gp-vh', 'aria-live': 'polite' });
    // Program and work sit side by side; on a narrow screen the work comes
    // first and the palette moves down next to the program it adds to.
    var layout = el('div', { class: 'gp-layout' });
    [head, palette, progPane, work, status].forEach(function (n) { layout.appendChild(n); });
    app.appendChild(layout); app.appendChild(live);
    host.appendChild(app);
    function reveal(node) {
      node.scrollIntoView({ block: 'center', behavior: reduce.matches ? 'auto' : 'smooth' });
      node.focus({ preventScroll: true });
    }
    bSee.addEventListener('click', function () { reveal(view); });
    bEdit.addEventListener('click', function () {
      if (S.tab !== 'blocks') showTab('blocks');
      var at = selIndex();
      if (at < 0) at = Math.min(machine.line, S.blocks.length - 1);
      if (at >= 0) {
        select(S.blocks[at].id);
        var li = list.children[at]; keepVisible(li); reveal(li._grip);
      }
    });
    bZoom.addEventListener('click', function () {
      var enlarged = view.classList.toggle('is-enlarged');
      bZoom.setAttribute('aria-pressed', enlarged ? 'true' : 'false');
      bZoom.textContent = enlarged ? 'Fit drawing' : 'Enlarge drawing';
      if (!enlarged) view.scrollLeft = 0;
    });
    var record = rootEl.querySelector('.gp-record') || rootEl.appendChild(el('div', { class: 'gp-record' }));
    rootEl.classList.add('is-live');

    function announce(msg) { live.textContent = ''; setTimeout(function () { live.textContent = msg; }, 30); }

    /* ---- the program -------------------------------------------------------------*/
    function text() { return B.toText(S.blocks); }
    function indexOf(id) { for (var k = 0; k < S.blocks.length; k++) if (S.blocks[k].id === id) return k; return -1; }
    function selIndex() { return S.selected ? indexOf(S.selected) : -1; }

    /* Read the program again, preview it, and put the machine back to its start. */
    function replan(reason) {
      var progressed = machine.inLine || machine.line > 0 || machine.status === 'alarm' || machine.status === 'done';
      pause();
      // One block is one line, so the program is read line for line from the blocks.
      S.program = G.interpret(S.blocks.map(B.toLine));
      S.preview = X.preview(S.program, { sim: previewSim });
      machine.load(S.program);
      S.statusKey = '';
      var edited = reason === 'edit' || reason === 'text';
      if (edited && progressed) { S.changedAt = Date.now(); announce('You changed the program, so the simulation went back to the start.'); }
      else if (!edited) S.changedAt = 0;
      if (S.tab === 'text' && reason !== 'text') textArea.value = text();
      fullView();
      refresh(true);
    }
    function scheduleReplan() {
      clearTimeout(S.timer);
      S.timer = setTimeout(function () { replan('edit'); }, 140);
    }

    function cloneBlocks() { return S.blocks.map(function (b) { return { type: b.type, f: Object.assign({}, b.f), note: b.note }; }); }
    function pushUndo() {
      S.undo.push({ blocks: cloneBlocks(), sel: selIndex(), example: S.example });
      if (S.undo.length > 80) S.undo.shift();
      bUndo.disabled = false;
    }
    function undo() {
      var s = S.undo.pop();
      bUndo.disabled = !S.undo.length;
      if (!s) return;
      var a = document.activeElement, onBlock = a && a.closest && a.closest('.gp-block');
      var focusAt = onBlock && list.contains(onBlock) ? Array.prototype.indexOf.call(list.children, onBlock) : -1;
      S.blocks = s.blocks.map(function (b) { return B.make(b.type, b.f, b.note); });
      S.selected = s.sel >= 0 && S.blocks[s.sel] ? S.blocks[s.sel].id : null;
      if (s.example !== S.example) setExampleText(s.example);
      renderBlocks();
      replan('edit');
      // The blocks are new, so keep the keyboard where it was rather than losing it to the page.
      if (focusAt >= 0) { var li = list.children[Math.min(focusAt, list.children.length - 1)]; if (li && li._grip) li._grip.focus(); }
      else if (a === bUndo || !app.contains(document.activeElement)) bUndo.focus();
      announce('Undone.');
    }

    function setExampleText(id) {
      var ex = B.example(id);
      S.example = ex.id;
      exSel.value = ex.id;
      brief.innerHTML = '';
      brief.appendChild(el('strong', {}, 'Goal. '));
      brief.appendChild(document.createTextNode(ex.brief));
      triesList.innerHTML = '';
      ex.tries.forEach(function (t) { triesList.appendChild(el('li', {}, t)); });
    }
    function loadExample(id) {
      setExampleText(id);
      S.blocks = B.fromText(B.example(id).text.join('\n'));
      S.selected = null;
      renderBlocks();
      replan('load');
    }

    /* ---- blocks ---------------------------------------------------------------------*/
    function fieldEl(b, def) {
      var wrap = el('label', { class: 'gp-field' + (def.kind === 'text' || def.kind === 'code' ? ' gp-field-wide' : '') });
      var input;
      if (def.kind === 'select') {
        wrap.appendChild(el('span', { class: 'gp-vh' }, def.label));
        input = el('select', {});
        def.options.forEach(function (o) { input.appendChild(el('option', { value: o[0] }, o[1])); });
        input.value = b.f[def.k];
        input.addEventListener('change', function () {
          beginEdit(b, def.k, true);
          b.f[def.k] = input.value;
          if (B.TYPES[b.type].fields.some(function (f) { return f.when && f.when[def.k] != null; })) rebuildBlock(b, def.k);
          else afterFieldEdit(b);
        });
      } else {
        if (def.kind === 'num') wrap.appendChild(el('span', {}, def.label));
        else wrap.appendChild(el('span', { class: 'gp-vh' }, def.label));
        input = el('input', {
          type: 'text', value: b.f[def.k] == null ? '' : b.f[def.k], autocomplete: 'off', spellcheck: 'false',
          inputmode: def.kind === 'num' ? 'decimal' : null, size: def.kind === 'num' ? '6' : null,
          placeholder: def.kind === 'num' ? '–' : def.kind === 'code' ? 'a line of G-code' : '',
          'aria-label': def.kind === 'num' ? def.label + (def.word && 'XYZ'.indexOf(def.word) >= 0 ? ' (leave empty to leave ' + def.word + ' out)' : '') : def.label
        });
        input.addEventListener('input', function () {
          beginEdit(b, def.k, false);
          b.f[def.k] = input.value;
          afterFieldEdit(b);
        });
        input.addEventListener('blur', function () { S.editKey = null; });
        if (def.unit) {
          wrap.appendChild(input);
          wrap.appendChild(el('span', { class: 'gp-unit' }, def.unit === 'feed' ? 'per min' : def.unit));
          return wrap;
        }
      }
      input.setAttribute('data-k', def.k);
      wrap.appendChild(input);
      return wrap;
    }
    function beginEdit(b, k, each) {
      var key = b.id + ':' + k;
      if (each || S.editKey !== key) pushUndo();
      S.editKey = each ? null : key;
    }
    function afterFieldEdit(b) {
      var li = list.querySelector('[data-id="' + b.id + '"]');
      if (li) li._code.textContent = B.toLine(b);
      scheduleReplan();
    }
    function rebuildBlock(b, focusKey) {
      var li = list.querySelector('[data-id="' + b.id + '"]');
      var fresh = blockEl(b, indexOf(b.id));
      if (li) list.replaceChild(fresh, li);
      var f = fresh.querySelector('[data-k="' + focusKey + '"]');
      if (f) f.focus();
      replan('edit');
    }

    function blockEl(b, i) {
      var T = B.TYPES[b.type];
      var li = el('li', { class: 'gp-block gp-cat-' + T.cat, 'data-id': b.id });
      var ln = el('span', { class: 'gp-ln', 'aria-hidden': 'true' }, String(i + 1));
      var grip = button('', { class: 'gp-grip', 'aria-describedby': uid + '-griphelp' });
      var row = el('div', { class: 'gp-row' });
      var code = el('code', { class: 'gp-bcode' }, B.toLine(b));
      var tag = el('span', { class: 'gp-tag' });
      row.appendChild(el('span', { class: 'gp-btitle' }, T.title));
      row.appendChild(code);
      row.appendChild(tag);
      var fields = el('div', { class: 'gp-fields' });
      if (T.swap) {
        var sw = el('label', { class: 'gp-field' });
        sw.appendChild(el('span', { class: 'gp-vh' }, T.swap.label));
        var ss = el('select', { 'data-k': '__type' });
        T.swap.options.forEach(function (o) { ss.appendChild(el('option', { value: o[0] }, o[1])); });
        ss.value = b.type;
        ss.addEventListener('change', function () { beginEdit(b, '__type', true); b.type = ss.value; rebuildBlock(b, '__type'); });
        sw.appendChild(ss);
        fields.appendChild(sw);
      }
      T.fields.forEach(function (def) {
        if (def.when && Object.keys(def.when).some(function (k) { return b.f[k] !== def.when[k]; })) return;
        fields.appendChild(fieldEl(b, def));
      });
      if (!T.fields.length && !T.swap) fields.appendChild(el('span', { class: 'gp-unit' }, 'Nothing to set: this block is always ' + B.toLine(b) + '.'));
      var acts = el('div', { class: 'gp-acts' });
      var act = function (label, fn, extra) { var x = button(label, extra); x.addEventListener('click', fn); acts.appendChild(x); return x; };
      act('↑', function () { moveBy(b.id, -1, true); }, { disabled: i === 0, 'aria-label': 'Move block up', title: 'Move up (Alt+↑ on the handle)' });
      act('↓', function () { moveBy(b.id, 1, true); }, { disabled: i === S.blocks.length - 1, 'aria-label': 'Move block down', title: 'Move down (Alt+↓ on the handle)' });
      act('Copy', function () { duplicate(b.id); }, { 'aria-label': 'Duplicate this block', title: 'Put a copy of this block after it' });
      act('Run to here', function () { runTo(indexOf(b.id)); }, { title: 'Run the program from the start up to and including this block' });
      act('Delete', function () { remove(b.id, true); }, { title: 'Delete this block (Undo puts it back)' });
      var msg = el('p', { class: 'gp-bmsg' });
      li.appendChild(ln); li.appendChild(grip); li.appendChild(row);
      if (b.note) li.appendChild(el('p', { class: 'gp-note' }, 'Comment kept with this line: (' + b.note + ')'));
      li.appendChild(fields); li.appendChild(acts); li.appendChild(msg);
      li._ln = ln; li._code = code; li._msg = msg; li._grip = grip; li._tag = tag;
      row.addEventListener('click', function () { select(b.id === S.selected ? null : b.id); });
      grip.addEventListener('click', function () { if (li._dragged) { li._dragged = false; return; } select(b.id === S.selected ? null : b.id); });
      grip.addEventListener('keydown', function (e) { gripKeys(e, b.id); });
      grip.addEventListener('pointerdown', function (e) { dragStart(e, { kind: 'move', id: b.id, el: li }); });
      return li;
    }
    var gripHelp = el('p', { class: 'gp-vh', id: uid + '-griphelp' },
      'Press Enter to open or close this block. Alt with the up or down arrow moves it; the arrows alone go to the next block; Delete removes it.');
    app.appendChild(gripHelp);

    function gripLabel(b, i) {
      return 'Block ' + (i + 1) + ', ' + B.TYPES[b.type].title + ': ' + (B.toLine(b) || 'blank line') + (b.id === S.selected ? ', open' : '');
    }
    function renderBlocks(snapId) {
      var focusId = document.activeElement && document.activeElement.closest && document.activeElement.closest('.gp-block');
      focusId = focusId && list.contains(focusId) ? focusId.getAttribute('data-id') : null;
      list.innerHTML = '';
      S.blocks.forEach(function (b, i) { list.appendChild(blockEl(b, i)); });
      if (!S.blocks.length) list.appendChild(el('li', { class: 'gp-empty' }, 'No blocks yet. Add one from the row above, or pick an example program.'));
      S.statusKey = '';
      S.blocksDirty = false;
      if (snapId) {
        var sn = list.querySelector('[data-id="' + snapId + '"]');
        if (sn) { sn.classList.add('is-snapped'); setTimeout(function () { sn.classList.remove('is-snapped'); }, 400); keepVisible(sn); }
      }
      if (focusId) { var f = list.querySelector('[data-id="' + focusId + '"]'); if (f) f._grip.focus(); }
    }
    function keepVisible(li) {
      if (!li || S.tab !== 'blocks') return;
      var top = li.offsetTop - list.offsetTop, bottom = top + li.offsetHeight;
      if (top < list.scrollTop + 4) list.scrollTop = Math.max(0, top - 8);
      else if (bottom > list.scrollTop + list.clientHeight - 4) list.scrollTop = bottom - list.clientHeight + 12;
    }

    function select(id) {
      S.selected = id;
      list.querySelectorAll('.gp-block').forEach(function (li) { li.classList.toggle('is-selected', li.getAttribute('data-id') === id); });
      S.statusKey = '';
      refresh(false);
      if (id) keepVisible(list.querySelector('[data-id="' + id + '"]'));
    }
    function insert(type, at) {
      pushUndo();
      var nb = B.make(type);
      if (at == null) { var s = selIndex(); at = s >= 0 ? s + 1 : S.blocks.length; }
      S.blocks.splice(at, 0, nb);
      S.selected = nb.id;
      renderBlocks(nb.id);
      replan('edit');
      var li = list.querySelector('[data-id="' + nb.id + '"]');
      if (li) { var first = li.querySelector('.gp-fields input, .gp-fields select'); (first || li._grip).focus(); }
      announce(B.TYPES[type].title + ' added as block ' + (at + 1) + '.');
    }
    function moveTo(id, to) {
      var from = indexOf(id);
      if (from < 0 || to < 0 || to > S.blocks.length - 1 || to === from) return false;
      pushUndo();
      var b = S.blocks.splice(from, 1)[0];
      S.blocks.splice(to, 0, b);
      renderBlocks(id);
      replan('edit');
      return true;
    }
    function moveBy(id, d, focus) {
      var from = indexOf(id);
      if (moveTo(id, from + d)) {
        var li = list.querySelector('[data-id="' + id + '"]');
        if (focus && li) li._grip.focus();
        announce('Moved to block ' + (from + d + 1) + '.');
      }
    }
    function duplicate(id) {
      var at = indexOf(id);
      if (at < 0) return;
      pushUndo();
      var c = B.clone(S.blocks[at]);
      S.blocks.splice(at + 1, 0, c);
      S.selected = c.id;
      renderBlocks(c.id);
      replan('edit');
      var li = list.querySelector('[data-id="' + c.id + '"]');
      if (li) li._grip.focus();
    }
    function remove(id, focus) {
      var at = indexOf(id);
      if (at < 0) return;
      pushUndo();
      var gone = S.blocks.splice(at, 1)[0];
      if (S.selected === id) S.selected = null;
      renderBlocks();
      replan('edit');
      announce(B.TYPES[gone.type].title + ' removed. Undo puts it back.');
      if (focus) {
        var next = S.blocks[Math.min(at, S.blocks.length - 1)];
        var li = next && list.querySelector('[data-id="' + next.id + '"]');
        (li ? li._grip : bUndo).focus();
      }
    }
    function gripKeys(e, id) {
      var at = indexOf(id), go = function (k) {
        var b = S.blocks[k], li = b && list.querySelector('[data-id="' + b.id + '"]');
        if (li) { li._grip.focus(); keepVisible(li); }
      };
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); e.stopPropagation(); moveBy(id, e.key === 'ArrowUp' ? -1 : 1, true); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); go(at - 1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); go(at + 1); }
      else if (e.key === 'Home') { e.preventDefault(); go(0); }
      else if (e.key === 'End') { e.preventDefault(); go(S.blocks.length - 1); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(id, true); }
      else if (e.key === 'Escape' && S.selected) { select(null); }
    }

    /* ---- dragging: from the palette, or a block by its handle --------------------------
       The program opens a gap where the block would go; let go and it snaps in. */
    function dragStart(e, src) {
      if (e.button !== 0 || S.tab !== 'blocks') return;
      var handle = e.currentTarget, x0 = e.clientX, y0 = e.clientY, on = false, ghost = null, drop = null, at = null, scrollTimer = 0, lastY = y0;
      var rect = src.el.getBoundingClientRect(), dx = x0 - rect.left, dy = y0 - rect.top;
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety */ }
      function begin() {
        on = true;
        pause();
        ghost = src.el.cloneNode(true);
        ghost.classList.add('gp-ghost');
        ghost.classList.remove('is-selected');
        ghost.style.width = rect.width + 'px';
        app.appendChild(ghost);
        if (src.kind === 'move') src.el.classList.add('is-dragging');
        drop = el('li', { class: 'gp-drop', 'aria-hidden': 'true' }, 'Drop here');
        scrollTimer = setInterval(function () { autoScroll(lastY); }, 30);
      }
      function others() { return Array.prototype.filter.call(list.children, function (n) { return n.classList.contains('gp-block') && n !== (src.kind === 'move' ? src.el : null); }); }
      function where(x, y) {
        var r = list.getBoundingClientRect();
        if (x < r.left - 40 || x > r.right + 40 || y < r.top - 30 || y > r.bottom + 30) return null;
        var items = others();
        for (var k = 0; k < items.length; k++) {
          var q = items[k].getBoundingClientRect();
          if (y < q.top + q.height / 2) return k;
        }
        return items.length;
      }
      function place(k) {
        if (drop.parentNode) drop.parentNode.removeChild(drop);
        if (k == null) return;
        var items = others();
        var empty = list.querySelector('.gp-empty');
        if (empty) empty.remove();
        if (k < items.length) list.insertBefore(drop, items[k]); else list.appendChild(drop);
      }
      function autoScroll(y) {
        if (!on) return;
        var r = list.getBoundingClientRect();
        if (y < r.top + 32 && y > r.top - 30) list.scrollTop -= 12;
        else if (y > r.bottom - 32 && y < r.bottom + 30) list.scrollTop += 12;
      }
      function move(ev) {
        lastY = ev.clientY;
        if (!on) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; begin(); }
        ev.preventDefault();
        ghost.style.left = (ev.clientX - dx) + 'px';
        ghost.style.top = (ev.clientY - dy) + 'px';
        at = where(ev.clientX, ev.clientY);
        place(at);
      }
      function end(ev, cancel) {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', cancelled);
        document.removeEventListener('keydown', esc, true);
        clearInterval(scrollTimer);
        if (!on) return;
        handle._dragged = true; src.el._dragged = true;
        setTimeout(function () { handle._dragged = false; src.el._dragged = false; }, 0);
        if (ghost) ghost.remove();
        if (drop && drop.parentNode) drop.parentNode.removeChild(drop);
        if (src.kind === 'move') src.el.classList.remove('is-dragging');
        if (cancel || at == null) { if (!S.blocks.length) renderBlocks(); return; }
        if (src.kind === 'new') insert(src.type, at);
        else if (!moveTo(src.id, at)) renderBlocks(src.id);
        else announce('Moved to block ' + (at + 1) + '.');
        void ev;
      }
      function up(ev) { end(ev, false); }
      function cancelled(ev) { end(ev, true); }
      function esc(ev) { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(ev, true); } }
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', cancelled);
      document.addEventListener('keydown', esc, true);
    }
    palette.querySelectorAll('.gp-chip').forEach(function (chip) {
      var type = chip.getAttribute('data-type');
      chip.addEventListener('pointerdown', function (e) { dragStart(e, { kind: 'new', type: type, el: chip }); });
      chip.addEventListener('click', function () {
        if (chip._dragged) { chip._dragged = false; return; }
        if (S.tab !== 'blocks') showTab('blocks');
        insert(type);
      });
    });

    /* ---- status of every block ------------------------------------------------------- */
    function stopLine() {
      var P = S.program, pv = S.preview;
      if (pv && pv.alarm) return pv.alarm.line;
      return P && P.error ? P.error.line : -1;
    }
    function blockStatuses() {
      var P = S.program, pv = S.preview, m = machine;
      var key = [S.selected, m.line, m.inLine, m.status, m.lastDone, S.blocks.length, P.lines.length, S.tab].join('|');
      if (key === S.statusKey) return;
      S.statusKey = key;
      var stop = stopLine(), items = list.querySelectorAll('.gp-block');
      Array.prototype.forEach.call(items, function (li, i) {
        var b = S.blocks[i], ln = P.lines[i];
        if (!b || !ln) return;
        var err = P.error && P.error.line === i ? P.error : null;
        var alarm = !err && pv.alarm && pv.alarm.line === i ? pv.alarm : null;
        var also = !err && !alarm && ln.c.errors.length ? ln.c.errors[0] : null;
        var notRun = !err && !alarm && (ln.after || (stop >= 0 && i > stop));
        var msg = '';
        if (err) msg = KIND[err.kind] + ': ' + err.message;
        else if (alarm) msg = 'When it runs, the machine stops here. ' + alarm.message;
        else if (also) msg = KIND[also.kind] + ' (this line also needs fixing): ' + also.message;
        var quiet = '';
        if (notRun && !msg) quiet = ln.after === 'end' ? 'Not run: the program ends at block ' + (P.ended + 1) + '.' : 'Not run: the program stops at block ' + (stop + 1) + '.';
        li._ln.textContent = String(i + 1);
        li._msg.textContent = msg;
        li._tag.textContent = notRun && !also ? 'not run' : '';
        li._tag.title = quiet;
        li._grip.setAttribute('aria-label', gripLabel(b, i) + (msg || quiet ? '. ' + (msg || quiet) : ''));
        li.classList.toggle('is-error', !!(err || alarm));
        li.classList.toggle('is-also', !!also);
        li.classList.toggle('is-after', !!notRun && !also);
        li.classList.toggle('is-selected', b.id === S.selected);
        li.classList.toggle('is-active', m.inLine && m.line === i || m.status === 'alarm' && m.alarm && m.alarm.line === i);
        li.classList.toggle('is-next', !m.inLine && m.status === 'ready' && m.line === i);
        li.classList.toggle('is-done', !!(m.info[i] && m.info[i].done));
      });
      var active = list.querySelector('.is-active') || (S.playing && list.querySelector('.is-next'));
      if (active && S.playing) keepVisible(active);
      var n = S.blocks.length;
      count.textContent = n + (n === 1 ? ' block' : ' blocks') + (stop >= 0 ? ' · stops at block ' + (stop + 1) : '');
    }

    /* ---- what is happening now ------------------------------------------------------- */
    function lineState(k) {
      var P = S.program;
      if (k >= 0 && P.lines[k] && P.lines[k].state) return P.lines[k].state;
      return null;
    }
    function currentState() {
      var m = machine, k = m.inLine ? m.line : m.line - 1;
      // A machine stop happened partway through its block, so that block's modes are in force;
      // a program error stopped before its block began.
      if (m.status === 'alarm' && m.alarm) k = m.alarm.kind === 'machine' ? m.alarm.line : m.alarm.line - 1;
      return lineState(k);
    }
    function units() { var st = currentState() || (S.program && S.program.endState); return st && st.units ? st.units : 'mm'; }
    function nowHead(title, i) {
      var h = el('p', { class: 'gp-now-head' });
      h.appendChild(document.createTextNode(title));
      if (i != null && S.program.lines[i]) h.appendChild(el('code', {}, S.program.lines[i].text || '(blank line)'));
      return h;
    }
    function renderNow(force) {
      var m = machine, P = S.program, pv = S.preview, sel = selIndex();
      var changed = S.changedAt && Date.now() - S.changedAt < 8000 && !m.inLine && m.line === 0 && m.status === 'ready';
      // An open block is what the learner is reading, unless the program is running.
      var focus = !S.playing && sel >= 0 ? sel : m.inLine ? m.line : (m.line > 0 && m.status !== 'done') ? m.lastDone : -1;
      var key = [m.status, m.line, m.inLine, sel, changed, P.lines.length, pv.time, m.lastDone, focus].join('|');
      if (!force && key === S.nowKey) return;
      S.nowKey = key;
      now.innerHTML = '';
      now.className = 'gp-now';
      if (m.status === 'alarm' && m.alarm) {
        var a = m.alarm;
        now.classList.add('is-alarm');
        now.appendChild(nowHead('Stopped at block ' + (a.line + 1) + ' · ' + KIND[a.kind], a.line));
        now.appendChild(el('p', {}, a.message));
        var show = button('Show block ' + (a.line + 1));
        show.addEventListener('click', function () { if (S.tab !== 'blocks') showTab('blocks'); select(S.blocks[a.line] && S.blocks[a.line].id); var li = list.querySelector('.is-selected'); if (li) li._grip.focus(); });
        now.appendChild(show);
        return;
      }
      if (m.status === 'done' && focus < 0) {
        now.classList.add('is-done');
        now.appendChild(nowHead('Program finished'));
        now.appendChild(el('p', {}, 'It ran ' + (m.lastDone + 1) + ' blocks in ' + clock(m.time) + ' of machine time and removed about ' + vol(m.sim.removed) + ' mm³ of metal.' +
          (P.hasEnd ? '' : ' It has no M2 or M30 at its end: a program normally finishes with one.')));
        return;
      }
      if (changed) {
        now.classList.add('is-changed');
        now.appendChild(nowHead('Program changed'));
        now.appendChild(el('p', {}, 'You changed the program, so the simulation went back to the start. What you see is the new program; press Play or Step to run it.'));
        return;
      }
      if (focus != null && focus >= 0 && P.lines[focus]) {
        var verb = m.inLine && focus === m.line ? (S.playing ? 'Running block ' : 'Paused in block ') :
          m.info[focus] && m.info[focus].done ? 'Ran block ' : 'Block ';
        now.appendChild(nowHead(verb + (focus + 1) + ' of ' + P.lines.length, focus));
        var ln = P.lines[focus], msg = ln.error ? KIND[ln.error.kind] + ': ' + ln.error.message : ln.after ? 'This block is not run.' : ln.explain;
        now.appendChild(el('p', {}, msg));
        var rec = m.info[focus];
        if (rec && rec.done && rec.volume > 0.5) now.appendChild(el('p', { class: 'gp-unit' }, 'Removed about ' + vol(rec.volume) + ' mm³ (grid estimate).'));
        return;
      }
      now.appendChild(nowHead(P.lines.length ? 'Ready to run' : 'No program yet'));
      if (!P.lines.length) { now.appendChild(el('p', {}, 'Add blocks from the row above, or pick an example program.')); return; }
      var stop = stopLine();
      now.appendChild(el('p', {}, P.lines.length + ' blocks, about ' + clock(pv.time) + ' of machine time to ' + (stop >= 0 ? 'where it stops' : 'the end') +
        '. Press Play to run it, or Step to go one block at a time. Open a block to see what it does and change it.'));
      if (stop >= 0) {
        var why = pv.alarm || P.error;
        now.classList.add('is-alarm');
        now.appendChild(el('p', {}, 'This program will stop at block ' + (stop + 1) + ': ' + why.message));
      }
    }
    function renderState() {
      var m = machine, u = units(), dp = G.unitDp(u), pos = m.sim.pos;
      ['x', 'y', 'z'].forEach(function (a) {
        droVal[a.toUpperCase()].innerHTML = M.fmt(pos[a] / G.scale(u), dp) + '<span class="gp-dro-u"> ' + G.unitName(u) + '</span>';
      });
      var st = currentState() || {};
      var tool = m.sim.tool, chips = [];
      var add = function (k, v) { chips.push('<span class="gp-mode">' + k + ' <b>' + v + '</b></span>'); };
      add('Motion', st.motion || '–');
      add('Units', st.units ? (st.units === 'in' ? 'G20 in' : 'G21 mm') : 'not set');
      add('Distance', st.dist ? (st.dist === 'abs' ? 'G90 absolute' : 'G91 incremental') : 'not set');
      add('Feed', st.feed != null ? 'F' + G.short(st.feed, 3) + ' ' + G.feedName(st.units || 'mm') : '–');
      add('Spindle', m.spindle.on ? 'M3 ' + G.short(m.spindle.rpm, 0) + ' rpm' : 'stopped');
      add('Tool', tool ? 'T' + (st.tool || '') + ' ' + M.toolLabel(tool) : 'none');
      if (m.coolant) add('Coolant', 'M8 on');
      modes.innerHTML = chips.join('');
      timeText.innerHTML = 'Time <b>' + clock(m.time) + '</b> / ' + clock(S.preview.time) + ' · removed <b>' + vol(m.sim.removed) + ' mm³</b>';
      bPlay.textContent = S.playing ? 'Pause' : m.finished() && m.status !== 'empty' ? 'Run again' : (m.line > 0 || m.inLine) ? 'Continue' : 'Play';
      bBack.disabled = !(m.line > 0 || m.inLine);
      bReset.disabled = !(m.line > 0 || m.inLine || m.status === 'alarm' || m.status === 'done') && !S.playing;
      bStep.disabled = m.finished() && !S.playing;
      bEnd.disabled = m.finished();
    }

    /* ---- the view ----------------------------------------------------------------------- */
    function planned() {
      var stop = stopLine(), moves = S.program.moves;
      return stop >= 0 ? moves.filter(function (mv) { return mv.line <= stop; }) : moves;
    }
    function hlLine() {
      var m = machine;
      if (m.inLine) return m.line;
      if (m.status === 'alarm' && m.alarm) return m.alarm.line;
      return selIndex();
    }
    function hlMoves() { var k = hlLine(); return k < 0 ? [] : planned().filter(function (mv) { return mv.line === k; }); }
    function contactPoint() { return machine.status === 'alarm' ? machine.contact : S.preview.contact; }
    function spinning() { return machine.spindle.on && machine.spindle.rpm > 0; }
    function fullView() {
      var m = machine;
      view.innerHTML = R.scene({ sim: m.sim, moves: planned(), trail: m.trail, hl: hlMoves(), contact: contactPoint(), spinning: spinning() },
        { idPrefix: uid, hits: true, label: 'The block in a vise: a top view above a front section through the tool. The programmed path is drawn on it, and the tool shows where the program has got to.' });
      L = {};
      view.querySelectorAll('[data-layer]').forEach(function (g) { L[g.getAttribute('data-layer')] = g; });
      S.cutKey = cutKey(); S.secY = R.sectionY(m.sim); S.hlKey = hlKeyOf(); S.cKey = cKeyOf(); S.toolKey = ''; S.trailKey = '';
    }
    function cutKey() { var s = machine.sim; return s.prims.length + ':' + s.removed; }
    function hlKeyOf() { return hlLine() + '|' + S.program.moves.length; }
    function cKeyOf() { var c = contactPoint(); return c ? c.x + ',' + c.y + ',' + c.z : ''; }
    function draw() {
      var m = machine, sim = m.sim, secDirty = false;
      if (!L.cuts) return;
      var ck = cutKey();
      if (ck !== S.cutKey) { L.cuts.innerHTML = R.cuts(sim); S.cutKey = ck; secDirty = true; }
      var tk = m.trail.length + ':' + sim.pos.x + ',' + sim.pos.y + ',' + sim.pos.z;
      if (tk !== S.trailKey) { L.trail.innerHTML = R.trail(m.trail, 'top'); L.ftrail.innerHTML = R.trail(m.trail, 'front'); S.trailKey = tk; }
      var ok = tk + (sim.tool ? sim.tool.id : '') + spinning();
      if (ok !== S.toolKey) { L.tool.innerHTML = R.toolTop(sim.tool, sim.pos, spinning()); L.ftool.innerHTML = R.toolSide(sim.tool, sim.pos); S.toolKey = ok; }
      var y = R.sectionY(sim);
      if (secDirty || y !== S.secY) { L.section.innerHTML = R.section(sim, y, uid); L.secy.textContent = M.fmt(y, 1); S.secY = y; }
      var hk = hlKeyOf();
      if (hk !== S.hlKey) { var hm = hlMoves(); L.hl.innerHTML = R.highlight(hm, 'top'); L.fhl.innerHTML = R.highlight(hm, 'front'); S.hlKey = hk; }
      var cc = cKeyOf();
      if (cc !== S.cKey) { var c = contactPoint(); L.contact.innerHTML = R.contactMark(c, 'top'); L.fcontact.innerHTML = R.contactMark(c, 'front'); S.cKey = cc; }
    }
    function refresh(force) {
      draw();
      blockStatuses();
      renderNow(force);
      renderState();
      if (S.tab === 'text') renderProblems();
    }
    view.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-line]');
      if (!t) return;
      var k = Number(t.getAttribute('data-line')), b = S.blocks[k];
      if (!b) return;
      if (S.tab !== 'blocks') showTab('blocks');
      select(b.id);
    });

    /* ---- running ------------------------------------------------------------------------- */
    function frame(ts) {
      if (!S.playing) return;
      var dt = S.last == null ? 0 : Math.min(0.1, (ts - S.last) / 1000);
      S.last = ts;
      var res = machine.tick(dt * S.speed, { lineEnd: S.stepOnce });
      var stopNow = res.alarm || res.done || machine.finished() || (S.stepOnce && res.lineDone);
      if (stopNow) S.playing = false;
      refresh(false);
      if (stopNow) { finishNotes(res); return; }
      S.raf = requestAnimationFrame(frame);
    }
    function finishNotes(res) {
      if (res.alarm) announce('Stopped at block ' + (res.alarm.line + 1) + '. ' + res.alarm.message);
      else if (machine.status === 'done') announce('Program finished.');
    }
    function play(stepOnce) {
      if (machine.status === 'empty' || !S.program.lines.length) return;
      if (machine.finished()) machine.reset();
      S.changedAt = 0;
      if (S.selected) select(null);
      if (reduce.matches) {
        // No animation: run the block (or everything) at once.
        var res = stepOnce ? machine.runLine() : machine.runToEnd();
        refresh(false); finishNotes(res);
        return;
      }
      S.playing = true; S.stepOnce = !!stepOnce; S.last = null;
      renderState();
      S.raf = requestAnimationFrame(frame);
    }
    function pause() {
      if (S.raf) cancelAnimationFrame(S.raf);
      S.raf = 0;
      if (S.playing) { S.playing = false; if (L.cuts) refresh(false); }
    }
    function runTo(k) {
      pause();
      S.changedAt = 0;
      S.selected = null;
      machine.seek(k + 1);
      refresh(true);
      announce(machine.status === 'alarm' ? 'Stopped at block ' + (machine.alarm.line + 1) + '.' : 'Ran up to block ' + (k + 1) + '.');
    }
    bPlay.addEventListener('click', function () { if (S.playing) pause(); else play(false); });
    bStep.addEventListener('click', function () {
      if (S.playing) { pause(); return; }
      play(true);
    });
    bBack.addEventListener('click', function () {
      pause();
      var m = machine, target;
      if (m.status === 'alarm' && m.alarm) target = m.alarm.line;       // to just before the block that stopped
      else if (m.inLine) target = m.line;                                // to the start of this block
      else target = m.line - 1;                                          // take back the last block
      machine.seek(Math.max(0, target));
      S.changedAt = 0;
      if (S.selected) select(null);
      refresh(true);
    });
    bReset.addEventListener('click', function () { pause(); machine.reset(); S.changedAt = 0; refresh(true); });
    bEnd.addEventListener('click', function () { pause(); S.changedAt = 0; S.selected = null; var res = machine.runToEnd(); refresh(true); finishNotes(res); });
    speedSel.addEventListener('change', function () { S.speed = Number(speedSel.value) || 10; });

    /* ---- the text view ------------------------------------------------------------------- */
    function showTab(t) {
      S.tab = t;
      tabBlocks.setAttribute('aria-selected', t === 'blocks' ? 'true' : 'false');
      tabText.setAttribute('aria-selected', t === 'text' ? 'true' : 'false');
      list.hidden = t !== 'blocks';
      textPane.hidden = t !== 'text';
      palette.classList.toggle('is-text', t === 'text');
      if (t === 'text') { textArea.value = text(); renderProblems(); }
      else if (S.blocksDirty) renderBlocks();
      S.statusKey = '';
      refresh(false);
    }
    function renderProblems() {
      var P = S.program, pv = S.preview, out = [];
      if (P.error) out.push('Line ' + (P.error.line + 1) + ' · ' + KIND[P.error.kind] + ': ' + P.error.message);
      else if (pv.alarm) out.push('Line ' + (pv.alarm.line + 1) + ' · when it runs, the machine stops: ' + pv.alarm.message);
      P.staticErrors.forEach(function (e) { if (!P.error || e.line !== P.error.line) out.push('Line ' + (e.line + 1) + ' · ' + KIND[e.kind] + ': ' + e.message); });
      problems.innerHTML = '';
      out.forEach(function (s) { problems.appendChild(el('li', {}, s)); });
    }
    tabBlocks.addEventListener('click', function () { showTab('blocks'); });
    tabText.addEventListener('click', function () { showTab('text'); });
    [tabBlocks, tabText].forEach(function (t, k, all) {
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); var o = all[1 - k]; o.focus(); o.click(); }
      });
    });
    var textTimer = 0;
    textArea.addEventListener('input', function () {
      clearTimeout(textTimer);
      if (!S.textDirty) { pushUndo(); S.textDirty = true; }
      textTimer = setTimeout(function () {
        S.blocks = B.fromText(textArea.value);
        S.selected = null;
        S.blocksDirty = true;
        replan('text');
      }, 260);
    });
    textArea.addEventListener('blur', function () { S.textDirty = false; });
    bCopy.addEventListener('click', function () {
      var t = text();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(function () { announce('Program copied.'); bCopy.textContent = 'Copied'; setTimeout(function () { bCopy.textContent = 'Copy the program'; }, 1500); },
          function () { textArea.select(); });
      } else textArea.select();
    });

    /* ---- the rest ---------------------------------------------------------------------- */
    bUndo.addEventListener('click', undo);
    app.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        var t = e.target.tagName;
        if (t === 'INPUT' || t === 'TEXTAREA') return;
        e.preventDefault();
        undo();
      }
    });
    exSel.addEventListener('change', function () { pushUndo(); loadExample(exSel.value); });

    /* The program column is as tall as the work column beside it, so the
       two read together without the page scrolling between them. */
    function fitHeights() {
      var cols = getComputedStyle(layout).gridTemplateColumns.split(' ').length;
      if (cols > 1) {
        var a = work.getBoundingClientRect(), b = status.getBoundingClientRect();
        var h = Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top);
        list.style.setProperty('--gp-list-h', Math.max(300, h - bar.offsetHeight - 2) + 'px');
      } else list.style.setProperty('--gp-list-h', '28rem');
    }
    if (window.ResizeObserver) { var ro = new ResizeObserver(fitHeights); ro.observe(work); ro.observe(status); }
    else addEventListener('resize', fitHeights);

    addEventListener('beforeprint', function () {
      pause();
      record.innerHTML = '';
      var ex = B.example(S.example);
      if (text() === ex.text.join('\n')) return;
      record.appendChild(el('p', { class: 'gp-figure-title' }, 'The program in the simulator when this page was printed'));
      var fig = el('div', { class: 'gp-figure' });
      var left = el('div', {});
      left.innerHTML = R.listing(text().split('\n'));
      var right = el('div', {});
      right.innerHTML = R.scene({ sim: machine.sim, moves: planned(), trail: machine.trail, contact: contactPoint() }, { idPrefix: uid + '-print' });
      fig.appendChild(left); fig.appendChild(right);
      record.appendChild(fig);
    });

    loadExample(B.EXAMPLES[0].id);
    fitHeights();
  }

  function boot() {
    if (typeof document === 'undefined') return;
    var go = function () { document.querySelectorAll('[data-interactive="gcode-playground"]').forEach(wire); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  }

  return { boot: boot, clock: clock };
});
