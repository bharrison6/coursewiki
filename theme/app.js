/* ============================================================================
   app.js - behaviour for the site shell.

   Everything here is an ENHANCEMENT. With JavaScript off you still get: the
   full sidebar (nested <details>), every card (also <details>, open by
   default), working links, and a correct print. What JS adds is memory, bulk
   controls, search, and the mobile drawer.

   The search index is loaded as a classic <script> that assigns
   window.SEARCH_INDEX - deliberately not fetch(), which a browser blocks for
   local JSON when the site is opened over file://. A script tag works there.
   ==========================================================================*/
(function () {
  'use strict';

  var LS = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var PAGE = document.body.getAttribute('data-page') || 'site';
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---- theme ------------------------------------------------------------
     Three states: light, dark, and system (no attribute). The inline head
     script has already applied the stored choice to avoid a flash; this only
     wires the control.                                                      */
  (function () {
    var btn = $('[data-act="theme"]');
    if (!btn) return;
    var order = ['system', 'light', 'dark'];
    var label = { system: 'Theme: follow system', light: 'Theme: light', dark: 'Theme: dark' };

    // persist only on an actual choice: writing 'system' on every first load
    // would record a preference the reader never expressed.
    function apply(mode, persist) {
      if (mode === 'system') { document.documentElement.removeAttribute('data-theme'); }
      else { document.documentElement.setAttribute('data-theme', mode); }
      btn.setAttribute('title', label[mode]);
      btn.setAttribute('aria-label', label[mode]);
      if (persist) { LS.set('det:theme', mode); }
    }
    btn.addEventListener('click', function () {
      var cur = LS.get('det:theme', 'system');
      apply(order[(order.indexOf(cur) + 1) % order.length], true);
    });
    var stored = LS.get('det:theme', null);
    // With no stored choice, leave the document alone — an authored
    // data-theme on <html> stays in force, and otherwise the OS decides.
    if (stored) { apply(stored, false); }
    else { btn.setAttribute('title', label.system); btn.setAttribute('aria-label', label.system); }
  })();

  /* ---- mobile drawer ----------------------------------------------------*/
  (function () {
    var btn = $('.nav-toggle'), sb = $('.sidebar'), bd = $('.backdrop');
    if (!btn || !sb) return;

    function set(open) {
      if (open) { sb.setAttribute('data-open', ''); if (bd) bd.setAttribute('data-open', ''); }
      else { sb.removeAttribute('data-open'); if (bd) bd.removeAttribute('data-open'); }
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function () { set(!sb.hasAttribute('data-open')); });
    if (bd) bd.addEventListener('click', function () { set(false); });
    addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
    // A tap on a link navigates; leaving the drawer open would cover the page.
    $$('.sidebar a').forEach(function (a) { a.addEventListener('click', function () { set(false); }); });
  })();

  /* ---- sidebar group memory --------------------------------------------
     Keyed by group id so the tree looks the same on the next page.          */
  $$('.sidebar .navgroup').forEach(function (d) {
    var id = d.getAttribute('data-nav');
    if (!id) return;
    var stored = LS.get('det:nav:' + id, null);
    if (stored !== null) { d.open = stored; }
    d.addEventListener('toggle', function () { LS.set('det:nav:' + id, d.open); });
  });

  /* ---- disclosure cards -------------------------------------------------
     Open by default. Safety copy should be readable at a glance; collapsing
     is the reader's choice, and the choice is remembered per page.          */
  var cards = $$('.xcard');
  if (cards.length) {
    var key = 'det:cards:' + PAGE;
    var stored = LS.get(key, null);
    if (stored) {
      cards.forEach(function (c) {
        var id = c.getAttribute('data-card');
        if (id && Object.prototype.hasOwnProperty.call(stored, id)) { c.open = !!stored[id]; }
      });
    }
    function save() {
      var s = {};
      cards.forEach(function (c) {
        var id = c.getAttribute('data-card');
        if (id) s[id] = c.open;
      });
      LS.set(key, s);
    }
    cards.forEach(function (c) { c.addEventListener('toggle', save); });

    var ex = $('[data-act="expand"]'), co = $('[data-act="collapse"]');
    if (ex) ex.addEventListener('click', function () { cards.forEach(function (c) { c.open = true; }); save(); });
    if (co) co.addEventListener('click', function () { cards.forEach(function (c) { c.open = false; }); save(); });
  }

  /* A link to a collapsed card would scroll to nothing. Open the target - and
     any ancestor <details> - before the browser tries to reach it. */
  function revealHash() {
    var h = location.hash && location.hash.slice(1);
    if (!h) return;
    var el = document.getElementById(h);
    if (!el) return;
    var n = el;
    while (n && n !== document.body) {
      if (n.tagName === 'DETAILS') { n.open = true; }
      n = n.parentNode;
    }
    setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 0);
  }
  addEventListener('hashchange', revealHash);
  revealHash();

  /* ---- checklists -------------------------------------------------------
     Marked-up lists become real checkboxes, remembered per page. A pre-use
     inspection you cannot tick is decoration.                               */
  $$('ul.boxes').forEach(function (ul, li) {
    ul.classList.add('live');
    var key = 'det:ck:' + PAGE + ':' + li;
    var state = LS.get(key, {});
    var items = $$('li', ul);

    items.forEach(function (item, i) {
      var label = document.createElement('label');
      var box   = document.createElement('input');
      var span  = document.createElement('span');
      box.type = 'checkbox';
      box.checked = !!state[i];
      while (item.firstChild) { span.appendChild(item.firstChild); }
      label.appendChild(box); label.appendChild(span);
      item.appendChild(label);
      box.addEventListener('change', function () {
        state[i] = box.checked; LS.set(key, state);
      });
    });

    if (!items.length) return;
    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'ck-reset';
    reset.textContent = 'Reset checklist';
    reset.addEventListener('click', function () {
      $$('input', ul).forEach(function (b) { b.checked = false; });
      state = {}; LS.set(key, state);
    });
    ul.parentNode.insertBefore(reset, ul.nextSibling);
  });

  /* ---- on this page: scrollspy -----------------------------------------*/
  (function () {
    var links = $$('.toc a');
    if (!links.length || !('IntersectionObserver' in window)) return;
    var map = {};
    var targets = links.map(function (a) {
      var el = document.getElementById(a.getAttribute('href').slice(1));
      if (el) map[el.id] = a;
      return el;
    }).filter(Boolean);

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.removeAttribute('data-active'); });
        var a = map[en.target.id];
        if (a) a.setAttribute('data-active', '');
      });
    }, { rootMargin: '-15% 0px -70% 0px' });
    targets.forEach(function (t) { io.observe(t); });
  })();

  /* ---- search -----------------------------------------------------------
     Small corpus, so a scored substring match beats pulling in a library.   */
  (function () {
    var input = $('.search input'), box = $('.results');
    if (!input || !box) return;
    var idx = window.SEARCH_INDEX || [];
    var base = document.body.getAttribute('data-base') || '';
    var cur = -1, shown = [];

    function esc(s) { return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    function snippet(text, q) {
      var i = text.toLowerCase().indexOf(q);
      if (i < 0) return esc(text.slice(0, 110)) + '...';
      var s = Math.max(0, i - 40);
      return (s ? '...' : '') + esc(text.slice(s, i)) +
             '<mark>' + esc(text.substr(i, q.length)) + '</mark>' +
             esc(text.slice(i + q.length, i + q.length + 70)) + '...';
    }

    function search(q) {
      q = q.trim().toLowerCase();
      if (q.length < 2) return [];
      return idx.map(function (p) {
        var score = 0;
        if (p.title.toLowerCase().indexOf(q) >= 0) score += 100;
        if (p.summary.toLowerCase().indexOf(q) >= 0) score += 40;
        if ((p.headings || '').toLowerCase().indexOf(q) >= 0) score += 25;
        var bi = p.text.toLowerCase().indexOf(q);
        if (bi >= 0) score += 10;
        return score ? { p: p, score: score, q: q } : null;
      }).filter(Boolean).sort(function (a, b) { return b.score - a.score; }).slice(0, 8);
    }

    function render(hits, q) {
      shown = hits; cur = -1;
      if (!q || q.trim().length < 2) { box.removeAttribute('data-open'); box.innerHTML = ''; return; }
      if (!hits.length) {
        box.innerHTML = '<div class="empty">No page matches &ldquo;' + esc(q) + '&rdquo;.</div>';
        box.setAttribute('data-open', ''); return;
      }
      box.innerHTML = hits.map(function (h) {
        return '<a href="' + base + h.p.url + '">' +
               '<span class="rc">' + esc(h.p.collection) + '</span>' +
               '<span class="rt">' + esc(h.p.title) + '</span>' +
               '<span class="rs">' + snippet(h.p.summary + ' ' + h.p.text, h.q) + '</span></a>';
      }).join('');
      box.setAttribute('data-open', '');
    }

    function move(d) {
      var as = $$('a', box);
      if (!as.length) return;
      if (cur >= 0) as[cur].removeAttribute('data-cur');
      cur = (cur + d + as.length) % as.length;
      as[cur].setAttribute('data-cur', '');
      as[cur].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', function () { render(search(input.value), input.value); });
    input.addEventListener('focus', function () { if (input.value) render(search(input.value), input.value); });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') {
        var as = $$('a', box);
        if (cur >= 0 && as[cur]) { e.preventDefault(); location.href = as[cur].getAttribute('href'); }
      } else if (e.key === 'Escape') { input.value = ''; render([], ''); input.blur(); }
    });

    document.addEventListener('click', function (e) {
      if (!box.contains(e.target) && e.target !== input) { box.removeAttribute('data-open'); }
    });

    // "/" focuses search, the way every docs site does it.
    addEventListener('keydown', function (e) {
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        e.preventDefault(); input.focus();
      }
    });
  })();
})();
