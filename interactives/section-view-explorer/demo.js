(function (root) {
  'use strict';
  const M = root.CourseWikiSectionExplorer, R = root.CourseWikiSectionExplorerRender, S3 = root.CourseWikiSectionExplorer3D;
  if (!M || !R) return;
  let sequence = 0;
  const MODES = { full: 'Full', half: 'Half', offset: 'Offset' };
  const fmt = v => (v < 0 ? '−' : '') + Math.abs(v) + ' mm';
  const where = v => v === 0 ? 'on the center line' : Math.abs(v) + ' mm ' + (v < 0 ? 'in front of' : 'behind') + ' the center line';

  function mountOne(mount) {
    if (mount.dataset.sveReady) return;
    const id = 'sve-' + (++sequence);
    const st = { part: 'bushing', mode: 'full', s: 0, a: -10, b: 3, flip: false, phase: 'predict', selected: new Set(), focus: null, ghost: true };
    const live = document.createElement('div');
    live.className = 'sve-live';
    const radios = (name, list) => list.map(([v, t]) => '<label><input type="radio" name="' + id + '-' + name + '" value="' + v + '"> <span>' + t + '</span></label>').join('');
    const slider = (leg, text) => '<div class="sve-slider" data-leg="' + leg + '"><label for="' + id + '-' + leg + '">' + text + ' <output data-sve-out="' + leg + '"></output></label><input type="range" id="' + id + '-' + leg + '" data-sve-range="' + leg + '" step="1"></div>';
    // The drawing, the plane controls, Check and the grade share one column so the result of
    // every action appears beside the control that caused it; the 3D view sits alongside.
    live.innerHTML = '<p class="sve-challenge"><strong>Your challenge:</strong> select the regions of SECTION A–A that plane A–A cuts, then check. Move the plane or change the part and predict again.</p>' +
      '<div class="sve-controls">' +
      '<fieldset class="sve-choice" data-sve="part"><legend>Part</legend>' + radios('part', M.parts.map(p => [p.id, p.name])) + '</fieldset>' +
      '<fieldset class="sve-choice" data-sve="mode"><legend>Section type</legend>' + radios('mode', Object.entries(MODES)) + '</fieldset>' +
      '<p class="sve-mode-note" data-sve-note></p></div>' +
      '<div class="sve-work"><div class="sve-panel"><div class="sve-sheet" data-sve-sheet></div>' +
      '<p class="sve-status" role="status" aria-live="polite"></p>' +
      slider('s', 'Plane A–A') + slider('a', 'Left leg (through the hole)') + slider('b', 'Right leg (through the slot)') +
      '<div class="sve-actions"><button type="button" data-sve-act="predict"></button><button type="button" data-sve-act="answer">Show the answer</button><button type="button" data-sve-act="flip">Flip the arrows</button><button type="button" data-sve-act="reset">Reset</button></div></div>' +
      '<div class="sve-stage"><div class="sve-canvas" data-sve-scene></div>' +
      '<div class="sve-view-actions"><button type="button" data-sve-view="orbit">3D view</button><button type="button" data-sve-view="arrows">Look along the arrows</button><label><input type="checkbox" data-sve="ghost" checked> Show removed piece</label></div></div></div>' +
      '<ul class="sve-readout" data-sve-readout></ul><ol class="sve-results" data-sve-results hidden></ol>';
    mount.appendChild(live);
    const q = s => live.querySelector(s), qa = s => [...live.querySelectorAll(s)];
    const sheet = q('[data-sve-sheet]'), status = q('.sve-status');
    let scene = null, pending = 0, result = null;
    const wholeCache = {};

    function cut() {
      const c = { mode: st.mode, flip: st.flip };
      if (st.mode === 'full') c.s = st.s;
      if (st.mode === 'offset') { c.a = st.a; c.b = st.b; }
      return c;
    }
    function planes(part, c, ext) {
      const m = 8, x0 = ext.x0 - m, x1 = ext.x1 + m, y0 = ext.y0 - m, y1 = ext.y1 + m, z0 = ext.z0 - m, z1 = ext.z1 + m, f = c.flip ? -1 : 1;
      const qy = (y, xa, xb, leg) => ({ leg, pts: [[xa, y, z0], [xb, y, z0], [xb, y, z1], [xa, y, z1]] });
      const qx = (x, ya, yb) => ({ leg: null, pts: [[x, ya, z0], [x, yb, z0], [x, yb, z1], [x, ya, z1]] });
      const arrow = (x, y) => ({ at: [x, y, z1], dir: [0, f, 0] });
      if (c.mode === 'half') return f > 0 ? { list: [qy(0, 0, x1, null), qx(0, y0, 0)], arrows: [arrow(x1, 0)] } : { list: [qy(0, x0, 0, null), qx(0, 0, y1)], arrows: [arrow(x0, 0)] };
      if (c.mode === 'offset') {
        const j = part.offset.jog, list = [qy(c.a, x0, j, 'a'), qy(c.b, j, x1, 'b')];
        if (c.a !== c.b) list.push(qx(j, Math.min(c.a, c.b), Math.max(c.a, c.b)));
        return { list, arrows: [arrow(x0, c.a), arrow(x1, c.b)] };
      }
      return { list: [qy(c.s, x0, x1, 's')], arrows: [arrow(x0, c.s), arrow(x1, c.s)] };
    }
    function update3D() {
      if (!scene) return;
      const part = result.part, ext = M.extents(part), c = result.cut, P = planes(part, c, ext), f = c.flip ? -1 : 1;
      const D = .5 * (ext.y1 - ext.y0) + 12;
      let kept, removed = null, removedOffset = [0, 0, 0];
      if (st.phase === 'predict') kept = wholeCache[part.id] || (wholeCache[part.id] = M.meshData(M.whole(part.id)));
      else {
        kept = M.meshData(result.kept);
        if (st.ghost) {
          removed = M.meshData(M.removed(result));
          removedOffset = c.mode === 'half' ? [f * D * .7, -f * D * .7, 0] : [0, -f * D, 0];
        }
      }
      scene.set({ ext, viewDir: f, kept, removed, removedOffset, planes: P.list, arrows: P.arrows });
      mount.dataset.sveScene = st.phase === 'predict' ? 'whole' : 'cut';
    }
    function controls() {
      const part = M.byId[st.part];
      qa('[data-sve="part"] input').forEach(i => { i.checked = i.value === st.part; });
      qa('[data-sve="mode"] input').forEach(i => { i.checked = i.value === st.mode; i.disabled = !part.modes.includes(i.value); });
      q('[data-sve-note]').textContent = !part.modes.includes('half') ? 'Half sections suit parts that are symmetric about a center line; this bracket is not, so try an offset section.'
        : !part.modes.includes('offset') ? 'Offset sections reach features that are not in one straight line; every feature of this part shares one axis, so it has no offset option.' : '';
      for (const leg of ['s', 'a', 'b']) {
        const box = q('.sve-slider[data-leg="' + leg + '"]'), input = q('[data-sve-range="' + leg + '"]');
        box.hidden = leg === 's' ? st.mode === 'offset' : st.mode !== 'offset';
        input.min = part.plane.min; input.max = part.plane.max; input.value = st[leg];
        input.disabled = st.mode === 'half';
        q('[data-sve-out="' + leg + '"]').textContent = st.mode === 'half' && leg === 's' ? 'on the center lines' : fmt(st[leg]);
        input.setAttribute('aria-valuetext', st.mode === 'half' ? 'fixed on the center lines' : where(st[leg]));
      }
      const btn = q('[data-sve-act="predict"]');
      btn.textContent = st.phase === 'predict' ? 'Check my prediction' : st.phase === 'revealed' ? 'Predict again' : 'Predict the hatch';
      q('[data-sve-act="answer"]').hidden = st.phase !== 'predict';
      const ghost = q('[data-sve="ghost"]'); ghost.checked = st.ghost; ghost.disabled = !scene || st.phase === 'predict';
    }
    function readout() {
      const v = result.view, c = result.cut, cuts = v.faces.filter(f => f.type === 'cut').length;
      const plane = c.mode === 'half' ? 'two perpendicular planes on the center lines' : c.mode === 'offset' ? 'left leg ' + where(c.a) + ', right leg ' + where(c.b) : where(c.s);
      const removed = c.mode === 'half' ? (c.flip ? 'the back-left quarter' : 'the front-right quarter')
        : c.flip ? 'the back portion; you look toward the front, so SECTION A–A is reversed left to right' : 'the front portion, nearer you; you look toward the back';
      const hidden = st.phase === 'predict';
      q('[data-sve-readout]').innerHTML = '<li><strong>Plane A–A:</strong> ' + plane + '</li><li><strong>Removed:</strong> ' + removed + '</li>' +
        '<li><strong>Hatched area:</strong> ' + (hidden ? 'hidden until you check' : Math.round(v.capArea) + ' mm² in ' + cuts + ' region' + (cuts === 1 ? '' : 's')) + '</li>';
    }
    function results() {
      const list = q('[data-sve-results]');
      if (st.phase !== 'revealed') { list.hidden = true; list.innerHTML = ''; return; }
      const sc = M.score(result.view, st.selected);
      list.innerHTML = sc.results.map(r => '<li class="' + (r.correct ? 'is-right' : 'is-wrong') + '"><strong>Region ' + r.n + ' ' + (r.correct ? '✓ right' : '✗ not right') + '</strong> — you ' + (r.chose ? 'marked it cut' : 'left it blank') + '. ' + r.describe + '</li>').join('') +
        (result.view.faces.some(f => f.tiny) ? '<li>Very thin regions were filled in for you and are not scored.</li>' : '');
      list.hidden = false;
      return sc;
    }
    function draw(keepFocus) {
      const predict = st.phase === 'explore' ? null : { selected: st.selected, revealed: st.phase === 'revealed' };
      sheet.innerHTML = R.sheet(result, { interactive: true, predict, focus: st.focus });
      if (keepFocus) { const el = sheet.querySelector('[data-face="' + keepFocus + '"]'); if (el) el.focus(); }
    }
    function say() {
      const v = result.view, scored = v.faces.filter(f => !f.tiny);
      if (st.phase === 'predict') status.textContent = 'Predict: select each region of SECTION A–A that the plane cuts (' + st.selected.size + ' of ' + scored.length + ' selected), then choose Check my prediction below.';
      else if (st.phase === 'revealed') {
        const sc = M.score(v, st.selected), f = st.focus && v.faces.find(x => x.n === st.focus);
        status.textContent = sc.right + ' of ' + sc.total + ' regions right. ' + (f ? 'Region ' + f.n + '. ' + f.describe : '✓ and ✗ mark each region; the hatching shows the cut. Select a region to hear why.');
      }
      else if (st.focus) { const f = v.faces.find(x => x.n === st.focus); status.textContent = f ? 'Region ' + f.n + '. ' + f.describe : ''; }
      else status.textContent = 'SECTION A–A shows ' + Math.round(v.capArea) + ' mm² of cut material. Select any region of the section to find out what it is.';
    }
    function update(opts = {}) {
      try { result = M.compute(st.part, cut()); }
      catch (error) { status.textContent = error.message; return; }
      mount.dataset.part = st.part; mount.dataset.mode = st.mode; mount.dataset.phase = st.phase;
      mount.dataset.capArea = result.view.capArea.toFixed(3);
      controls(); readout(); results(); draw(opts.focus); say();
      if (!opts.skip3D) update3D();
    }
    function schedule() { if (!pending) pending = requestAnimationFrame(() => { pending = 0; update(); }); }
    function geometryChanged() {
      if (st.phase === 'revealed') st.phase = 'explore';
      st.selected = new Set(); st.focus = null;
    }

    live.addEventListener('change', e => {
      const t = e.target;
      if (t.name === id + '-part') {
        st.part = t.value; const p = M.byId[st.part];
        if (!p.modes.includes(st.mode)) st.mode = 'full';
        st.s = p.plane.start; if (p.offset) { st.a = p.offset.a; st.b = p.offset.b; }
        geometryChanged(); update(); if (scene) scene.view('orbit');
      } else if (t.name === id + '-mode') { st.mode = t.value; geometryChanged(); update(); }
      else if (t.dataset.sve === 'ghost') { st.ghost = t.checked; update3D(); }
    });
    live.addEventListener('input', e => {
      const leg = e.target.dataset && e.target.dataset.sveRange;
      if (!leg) return;
      st[leg] = Number(e.target.value); geometryChanged(); schedule();
    });
    live.addEventListener('click', e => {
      const act = e.target.closest('[data-sve-act]'), cam = e.target.closest('[data-sve-view]');
      if (cam && scene) { scene.view(cam.dataset.sveView); return; }
      if (!act) return;
      const a = act.dataset.sveAct;
      if (a === 'predict') {
        st.phase = st.phase === 'predict' ? 'revealed' : 'predict';
        if (st.phase === 'predict') st.selected = new Set();
        st.focus = null; update();
      } else if (a === 'answer') { st.phase = 'explore'; st.selected = new Set(); st.focus = null; update(); }
      else if (a === 'flip') { st.flip = !st.flip; geometryChanged(); update(); if (scene && scene.preset === 'arrows') scene.view('arrows'); }
      else if (a === 'reset') {
        Object.assign(st, { part: 'bushing', mode: 'full', s: 0, a: -10, b: 3, flip: false, phase: 'predict', selected: new Set(), focus: null, ghost: true });
        update(); if (scene) scene.view('orbit');
      }
    });
    function activateFace(el) {
      const n = Number(el.dataset.face);
      if (st.phase === 'predict') { if (st.selected.has(n)) st.selected.delete(n); else st.selected.add(n); }
      else st.focus = st.focus === n ? null : n;
      update({ focus: n, skip3D: true });
    }
    sheet.addEventListener('click', e => { const el = e.target.closest('[data-face][tabindex]'); if (el) activateFace(el); });
    sheet.addEventListener('keydown', e => {
      const el = e.target.closest && e.target.closest('[data-face][tabindex]');
      if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); activateFace(el); }
    });

    update();
    mount.classList.add('sve-ready');
    mount.dataset.sveReady = 'loading';
    try {
      if (!S3) throw new Error('3D view unavailable');
      const clampLeg = (leg, v) => { const p = M.byId[st.part].plane; return Math.max(p.min, Math.min(p.max, Math.round(v))); };
      scene = S3.create(q('[data-sve-scene]'), {
        onPlaneDrag(leg, v) { const n = clampLeg(leg, v); if (n !== st[leg]) { st[leg] = n; geometryChanged(); schedule(); } },
        onPlaneStep(step) { if (st.mode === 'half') return; const leg = st.mode === 'offset' ? 'a' : 's'; const n = clampLeg(leg, st[leg] + step); if (n !== st[leg]) { st[leg] = n; geometryChanged(); schedule(); } }
      });
      update3D(); scene.view('orbit');
      mount.dataset.sveReady = 'true';
    } catch (error) {
      scene = null;
      mount.dataset.sveReady = 'no-3d';
      q('[data-sve-scene]').innerHTML = '<p class="sve-no3d">The 3D view is unavailable in this browser. The section drawing and prediction still work.</p>';
      qa('[data-sve-view], [data-sve="ghost"]').forEach(n => { n.disabled = true; });
    }
    mount.sveDispose = () => { if (scene) scene.dispose(); if (pending) cancelAnimationFrame(pending); live.remove(); mount.classList.remove('sve-ready'); delete mount.dataset.sveReady; };
  }
  document.querySelectorAll('[data-interactive="section-view-explorer"]').forEach(mountOne);
})(typeof globalThis !== 'undefined' ? globalThis : this);
