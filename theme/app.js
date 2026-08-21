/* ============================================================================
   app.js - behavior for the site shell.

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
    // DELEGATED, not one listener per link: in track mode the sidebar is
    // partly rebuilt after this runs, and per-link listeners bound here would
    // not exist on any of the new links. That was already true of the
    // playlist - on a phone, every track link left the drawer covering the
    // page it had just opened.
    sb.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('a')) { set(false); }
    });
  })();

  /* ---- sidebar wiring ---------------------------------------------------
     Run over the whole sidebar at load, and again over anything the playlist
     code inserts. Idempotent: an element already wired is skipped, so the
     second pass cannot double-bind.                                         */
  function wireSidebar(root) {
    /* Group memory, keyed by group id so the tree looks the same on the next
       page. The keys are stable across the track tree too - t-<track> - so a
       branch the reader closed stays closed.                                */
    $$('.navgroup', root).forEach(function (d) {
      if (d.hasAttribute('data-wired')) return;
      d.setAttribute('data-wired', '');
      var id = d.getAttribute('data-nav');
      if (!id) return;
      var stored = LS.get('det:nav:' + id, null);
      if (stored !== null) { d.open = stored; }
      d.addEventListener('toggle', function () { LS.set('det:nav:' + id, d.open); });
    });

    /* A header is a link AND a toggle. The <summary> owns the toggle; the <a>
       inside owns the navigation. Browsers do not agree about whether the
       summary's toggle ALSO runs when the click lands on the link, and a
       toggle nobody asked for would be written straight into the memory above
       on the way out of the page. Put it back if it moved.                  */
    $$('summary a', root).forEach(function (a) {
      if (a.hasAttribute('data-wired')) return;
      a.setAttribute('data-wired', '');
      a.addEventListener('click', function () {
        var d = a.parentNode;
        while (d && d.tagName !== 'DETAILS') { d = d.parentNode; }
        if (!d) return;
        var was = d.open;
        setTimeout(function () { if (d.open !== was) { d.open = was; } }, 0);
      });
    });
  }
  wireSidebar($('.sidebar'));

  /* ---- disclosure cards -------------------------------------------------
     CLOSED by default - the generator no longer emits `open`. The summaries
     are the page's table of contents; the reader opens what they want, and
     the choice is remembered per page.

     THE STORAGE KEY IS VERSIONED, and that is the whole migration. Under the
     old default every card was open, and `save` writes the state of EVERY
     card on any toggle - so a reader who had ever collapsed one card carries a
     stored map of mostly `true`. Reusing the key would have restored those
     cards open and the new default would never have reached anyone who had
     used the site before. A stored preference from a different default is not
     a preference, it is a fossil: the v1 key is dropped rather than migrated,
     because there is nothing in it the new default wants.                   */
  var cards = $$('.xcard');
  if (cards.length) {
    var key = 'det:cards:v2:' + PAGE;
    try { localStorage.removeItem('det:cards:' + PAGE); } catch (e) {}
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

    /* Every pair, not the first pair. A printable aggregate stacks eleven
       pages in one document and each carries its own set of these buttons;
       binding $('[data-act=...]') left ten of them dead. Harmless while cards
       shipped open, visible now that they do not.                           */
    function setAll(open) {
      return function () { cards.forEach(function (c) { c.open = open; }); save(); };
    }
    $$('[data-act="expand"]').forEach(function (b) { b.addEventListener('click', setAll(true)); });
    $$('[data-act="collapse"]').forEach(function (b) { b.addEventListener('click', setAll(false)); });
  }

  /* ---- printing must never lose a collapsed card ------------------------
     A <details> that is closed prints its summary and nothing else. On the
     PDF fallback that is silent content loss - a reader who collapsed
     "Respiratory protection" would print a heading where a PROHIBITED rule
     should be. Force every card open for the print, then restore exactly what
     the reader had. CSS cannot do this: it cannot set the open attribute. */
  (function () {
    var reclose = [];
    addEventListener('beforeprint', function () {
      reclose = $$('details').filter(function (d) { return !d.open; });
      reclose.forEach(function (d) { d.open = true; });
    });
    addEventListener('afterprint', function () {
      reclose.forEach(function (d) { d.open = false; });
      reclose = [];
    });
  })();

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

  /* ---- category ladder --------------------------------------------------
     A visual index of who must be present, on the Safety intro. The wording is
     kept identical to the summary table on the Equipment Categories page,
     which stays the authority - this is a way in, not a second copy of the
     rules. Without JS the first category is shown and the tabs are inert
     links to that page's content, so nothing is lost.                      */
  (function () {
    var root = $('[data-ladder]');
    if (!root) return;
    var text = $('[data-ladder-text]', root);
    var tabs = $$('[data-cat]', root);
    var figs = { you: $('.fig-you', root), peer: $('.fig-peer', root), instr: $('.fig-instr', root) };

    var CAT = {
      '1': { who: ['you'],
             t: 'Permission may be given in advance. Work alone once you have it.' },
      '2': { who: ['you', 'peer'],
             t: 'Permission at the time of use. A peer must be present throughout.' },
      '3': { who: ['you', 'peer', 'instr'],
             t: 'Permission at the time of use. A peer and an instructor must be present throughout.' }
    };

    function show(k) {
      var c = CAT[k];
      if (!c) return;
      tabs.forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-cat') === k ? 'true' : 'false'); });
      Object.keys(figs).forEach(function (name) {
        if (!figs[name]) return;
        figs[name].classList.toggle('is-on', c.who.indexOf(name) >= 0);
      });
      text.textContent = c.t;
    }
    tabs.forEach(function (b) {
      b.addEventListener('click', function () { show(b.getAttribute('data-cat')); });
      b.addEventListener('keydown', function (e) {
        var i = tabs.indexOf(b);
        if (e.key === 'ArrowRight') { e.preventDefault(); tabs[(i + 1) % tabs.length].focus(); tabs[(i + 1) % tabs.length].click(); }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); tabs[(i - 1 + tabs.length) % tabs.length].focus(); tabs[(i - 1 + tabs.length) % tabs.length].click(); }
      });
    });
    show('1');
  })();

  /* ---- PASS stepper -----------------------------------------------------
     One drawing; the emphasis moves. Without JS the first step is shown and
     all four descriptions are already on the page as text.                 */
  (function () {
    var root = $('[data-pass]');
    if (!root) return;
    var btns = $$('button[data-step]', root);
    function show(i) {
      root.setAttribute('data-active', String(i));
      btns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-step') === String(i) ? 'true' : 'false'); });
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { show(+b.getAttribute('data-step')); }); });
    show(0);
  })();

  /* ---- fire class / agent matrix ---------------------------------------
     The whole reason this is not a picture: the same agent is correct for one
     class and DANGEROUS on another, and a static chart makes that a lookup
     rather than a consequence. Sources: OSHA 1910.155(c) class definitions
     (1910.157 is the extinguisher rule, not the classes) / NFPA 10; dry
     powder (Class D) is not dry chemical (ABC).                            */
  (function () {
    var root = $('[data-firetable]');
    if (!root) return;
    var what = $('[data-fc-what]', root), list = $('[data-fc-agents]', root);
    var tabs = $$('button[data-fc]', root);

    var FC = {
      A: { what: '<strong>Ordinary combustibles</strong> — wood, paper, cloth, rubber and many plastics. The everyday one.',
           agents: [['Water', 'ok', 'Works. Cools the fuel below ignition.'],
                    ['ABC dry chemical', 'ok', 'Works. The usual wall unit.'],
                    ['CO<sub>2</sub>', 'no', 'Poor. Knocks flame down but does not soak into the fuel, so heat left deep inside reflashes it.'],
                    ['Class D dry powder', 'no', 'Wrong tool. For metals only.']] },
      B: { what: '<strong>Flammable liquids and gases</strong> — solvents, oils, paints, grease, fuel.',
           agents: [['Water', 'bad', 'DANGEROUS. Spreads burning liquid and can flash it.'],
                    ['ABC dry chemical', 'ok', 'Works. Smothers the surface.'],
                    ['CO<sub>2</sub>', 'ok', 'Works, and leaves no residue.'],
                    ['Class D dry powder', 'no', 'Wrong tool. For metals only.']] },
      C: { what: '<strong>Energised electrical equipment</strong> — a live panel, motor or cord. Kill the power and it becomes a Class A or B fire.',
           agents: [['Water', 'bad', 'DANGEROUS. Conductive — it puts you in the circuit.'],
                    ['ABC dry chemical', 'ok', 'Works. Non-conductive agent.'],
                    ['CO<sub>2</sub>', 'ok', 'Works, and does not foul the equipment.'],
                    ['Class D dry powder', 'no', 'Wrong tool. For metals only.']] },
      D: { what: '<strong>Combustible metals</strong> — magnesium, titanium, sodium, lithium, and aluminum in fine form: dust from grinding, sanding, buffing and polishing. Chips and solid stock are not this.',
           agents: [['Water', 'bad', 'DANGEROUS. Can react violently and throw burning metal.'],
                    ['ABC dry chemical', 'bad', 'DANGEROUS. Dry chemical is not dry powder — it can be useless or make it worse.'],
                    ['CO<sub>2</sub>', 'bad', 'DANGEROUS. Will not stop a metal fire.'],
                    ['Class D dry powder', 'ok', 'The only correct agent. Do not assume one is on hand.']] },
      K: { what: '<strong>Cooking oils and fats</strong> — kitchen equipment, not lab equipment. Listed so the letter is not a mystery.',
           agents: [['Wet chemical', 'ok', 'The correct agent. Forms a soapy crust on the oil.'],
                    ['Water', 'bad', 'DANGEROUS. Erupts burning oil.'],
                    ['ABC dry chemical', 'no', 'Not rated. May knock flame down but the oil re-ignites.'],
                    ['Class D dry powder', 'no', 'Wrong tool. For metals only.']] }
    };

    function show(k) {
      var c = FC[k]; if (!c) return;
      tabs.forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-fc') === k ? 'true' : 'false'); });
      what.innerHTML = c.what;
      list.innerHTML = c.agents.map(function (a) {
        return '<li class="' + a[1] + '"><span class="n">' + a[0] + '</span><span class="r">' + a[2] + '</span></li>';
      }).join('');
    }
    tabs.forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-fc')); }); });
    show('A');
  })();

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

  /* ==========================================================================
     Playlists
     ------------------------------------------------------------------------
     A track is an ordered set of REAL PAGES, applied as a URL parameter:
     <page>.html?p=<track>. Nothing is re-rendered. That is the whole point -
     the earlier design rendered a second copy of the content as slides, and
     that copy did not load this file, so its checklists were dead text.

     ?present=1 additionally turns the page into panels. It is a class on
     <body> plus CSS, so every interactive feature keeps working: same DOM,
     same listeners, same localStorage. Adding a feature or a page needs no
     presentation code, because there is none.
     ========================================================================*/
  (function () {
    var params = new URLSearchParams(location.search);
    var pName  = params.get('p');
    if (!pName) return;

    var lists = window.TRACKS || [];
    var pl = null;
    for (var i = 0; i < lists.length; i++) { if (lists[i].name === pName) { pl = lists[i]; break; } }
    if (!pl) return;

    var base = document.body.getAttribute('data-base') || '';
    var here = PAGE;
    var idx  = -1;
    for (var j = 0; j < pl.items.length; j++) { if (pl.items[j].id === here) { idx = j; break; } }
    if (idx < 0) return;

    var presenting = params.get('present') === '1';
    function urlFor(item, present) {
      return base + item.url + '?p=' + encodeURIComponent(pl.name) + (present ? '&present=1' : '');
    }
    var prev = idx > 0 ? pl.items[idx - 1] : null;
    var next = idx < pl.items.length - 1 ? pl.items[idx + 1] : null;

    /* The label beside the Murray State lockup names the scope you are in.
       The institution is carried by the mark; the word next to it is the
       current selection, not a fixed programme - so the same content serves
       any class or major without a rebuild. */
    var brand = $('[data-brandlabel]');
    if (brand) { brand.textContent = pl.title; }

    /* ---- the sidebar becomes the track ------------------------------
       A presentation posted to Canvas should show the pages it contains, not
       the whole site. The way back is explicit rather than implied.        */
    var sb = document.querySelector('.sidebar');
    if (sb) {
      var h = '<div class="pl-nav-head"><span class="k">Track</span>' +
              '<span class="t">' + escHtml(pl.title) + '</span>' +
              '<span class="n">' + (idx + 1) + ' of ' + pl.items.length + '</span></div>';
      h += '<ol class="pl-nav">';
      var lastGroup = null;
      pl.items.forEach(function (it, k) {
        if (it.group && it.group !== lastGroup) {
          h += '<li class="pl-nav-group">' + escHtml(it.group) + '</li>';
          lastGroup = it.group;
        }
        h += '<li><a' + (k === idx ? ' aria-current="page"' : '') + ' href="' + urlFor(it, presenting) + '">' +
             '<span class="num">' + (k + 1) + '</span>' + escHtml(it.title) + '</a></li>';
      });
      h += '</ol>';
      h += '<div class="navsplit"></div>';
      h += '<ul class="navlist escape">' +
           '<li><a href="' + base + 'index.html">Browse all topics</a></li>' +
           '<li><a href="' + base + 'presentations.html">All tracks</a></li>' +
           '<li><a href="' + base + 'print/track-' + pl.name + '.html">Print this track</a></li>' +
           '</ul>';

      /* Replace the TOPIC tree only. The TRACK tree below the split stays,
         and it is the up-chain: inside a playlist the sidebar deliberately
         becomes the playlist, which answers "what comes next" and leaves
         "what is this part of" unanswered. The track tree is that answer, it
         is already rendered by the generator, and re-rendering it here in
         JavaScript would be the parallel-renderer mistake the deck already
         taught this project.

         The current track is MARKED, not force-opened: forcing a branch open
         writes through the toggle listener into the open/closed memory, so
         every visit would reopen a branch the reader had deliberately closed.
         The generator already leaves the top of the tree open, so the marked
         header is on screen without any help.                               */
      var topics = sb.querySelector('.nav-topics');
      if (topics) { topics.innerHTML = h; } else { sb.innerHTML = h; }
      wireSidebar(sb);
      $$('.nav-tracks [data-track]').forEach(function (a) {
        if (a.getAttribute('data-track') === pl.name) { a.setAttribute('aria-current', 'true'); }
        else { a.removeAttribute('aria-current'); }
      });
    }

    /* ---- next / previous ----------------------------------------------*/
    var bar = document.createElement('nav');
    bar.className = 'seqbar';
    bar.setAttribute('aria-label', 'Track navigation');
    bar.innerHTML =
      (prev ? '<a class="seq prev" href="' + urlFor(prev, presenting) + '"><span class="d">Previous</span>' +
              '<span class="t">' + escHtml(prev.title) + '</span></a>'
            : '<span class="seq prev disabled"><span class="d">Start of track</span></span>') +
      '<div class="seqmid"><span class="pos">' + (idx + 1) + ' / ' + pl.items.length + '</span>' +
      '<span class="pl">' + escHtml(pl.title) + '</span></div>' +
      (next ? '<a class="seq next" href="' + urlFor(next, presenting) + '"><span class="d">Next</span>' +
              '<span class="t">' + escHtml(next.title) + '</span></a>'
            : '<span class="seq next disabled"><span class="d">End of track</span></span>');
    document.body.appendChild(bar);
    document.body.classList.add('has-seqbar');

    /* ---- presentation mode: a view of this page, not a copy of it ------*/
    if (presenting) {
      document.body.classList.add('presenting');
      var panels = $$('.xcard');
      panels.forEach(function (c) { c.open = true; });   // a collapsed panel is a blank slide

      var toggle = document.createElement('a');
      toggle.className = 'present-exit';
      toggle.href = urlFor(pl.items[idx], false);
      toggle.textContent = 'Exit presentation';
      document.body.appendChild(toggle);

      var at = function () {
        var best = 0, bestD = Infinity;
        panels.forEach(function (p, k) {
          var d = Math.abs(p.getBoundingClientRect().top);
          if (d < bestD) { bestD = d; best = k; }
        });
        return best;
      };
      var go = function (k) {
        if (k < 0) { if (prev) location.href = urlFor(prev, true); return; }
        if (k >= panels.length) { if (next) location.href = urlFor(next, true); return; }
        panels[k].scrollIntoView({ block: 'start' });
      };
      addEventListener('keydown', function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
        switch (e.key) {
          case 'ArrowRight': case 'PageDown': case ' ': e.preventDefault(); go(at() + 1); break;
          case 'ArrowLeft':  case 'PageUp':            e.preventDefault(); go(at() - 1); break;
          case 'Escape': location.href = urlFor(pl.items[idx], false); break;
        }
      });
    } else {
      // In reading mode the arrows move between PAGES, not panels.
      addEventListener('keydown', function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
        if (e.key === 'ArrowRight' && next) { location.href = urlFor(next, false); }
        if (e.key === 'ArrowLeft'  && prev) { location.href = urlFor(prev, false); }
      });
    }
  })();

  /* ==========================================================================
     Arriving in another class's material
     ------------------------------------------------------------------------
     The content here is deliberately class- and programme-neutral, which means
     another course's page looks EXACTLY like your own. A student who lands in
     one and studies it has done real work on the wrong thing and nothing on
     the page would have told them. This is the only thing that tells them.

     A BANNER ON ARRIVAL, not a confirm before the click. A confirm only fires
     for a click made on this site, so it does nothing at all for the case that
     actually happens - a link handed out in Canvas, or passed between students
     - and it stands between the reader and the thing they just asked for,
     which is how you train someone to dismiss it without reading. A banner
     catches both routes in, says where you are, and carries the way back.

     WHEN IT FIRES. "This view is DET 330 material" means the applied track is
     a COURSE. A page with no ?p= makes no class claim - it is the neutral
     topic, and there is nothing to warn about. Neither does the programme
     track, nor a topic track a course carries: going from DET 130 into General
     Safety is not leaving your class, it is opening a thing your class
     contains, and that is why the test is on kind rather than on names.

     So all three of these are silent, by construction:
       * no ?p=, or ?p= naming a topic or the programme  -> no class claim
       * no course seen yet                              -> no prior context,
                                                            and this view is
                                                            what sets it
       * the same course                                 -> you are home

     TWO WAYS OUT, and they are different on purpose. The x is one browsing
     session, per course pair, because a banner that never comes back is a
     banner nobody reads the second time. "is my class" is a deliberate
     statement and it sticks - a student really can be in two of these, and
     without that the only escape would be a dismissal they learn to fire on
     reflex, which is the failure a confirm dialog has.
     ========================================================================*/
  (function () {
    var lists = window.TRACKS || [];
    function byName(n) {
      for (var i = 0; i < lists.length; i++) { if (lists[i].name === n) return lists[i]; }
      return null;
    }
    function isCourse(t) { return !!t && t.kind === 'course'; }

    var KEY  = 'det:course';
    var base = document.body.getAttribute('data-base') || '';
    var here = byName(new URLSearchParams(location.search).get('p'));
    var home = byName(LS.get(KEY, null));

    /* Mark every link that leads into another CLASS, wherever it appears: the
       track tree, the "Appears in" chips on a topic page, the track index.
       Relative to the READER's own course, which is why it happens here and
       not in the generator - the build has no idea whose class this is. The
       generator's job was to put data-track on all of them so there is one
       mechanism rather than one per surface.

       TWO SOURCES OF TRUTH, and the reader's wins where it exists. The build
       already stamps is-xcourse on a sibling course inside another course's
       block on the track index, and there it is true for anybody - so it is
       the right answer for a reader with no class yet. Once we know the
       reader's class it is the WORSE answer: it would flag a chip pointing at
       their own course. Which links the build marked is captured once, before
       the first pass, because the pass has to be able to clear its own marks
       when the reader switches class and the first version of this cleared
       the build's on the way - measured as the sibling chips on
       presentations.html losing their dashes for a reader with no class. */
    var buildMarked = $$('a[data-track]').filter(function (a) {
      return a.classList.contains('is-xcourse');
    });
    function mark() {
      $$('a[data-track]').forEach(function (a) {
        var t = byName(a.getAttribute('data-track'));
        var x = isCourse(home) ? (isCourse(t) && t.name !== home.name)
                               : buildMarked.indexOf(a) >= 0;
        if (x) { a.classList.add('is-xcourse'); } else { a.classList.remove('is-xcourse'); }
        // The title is reader-relative only: on a build-marked chip it would
        // claim "another class" about a course that might be the reader's own.
        if (x && isCourse(home)) { a.setAttribute('title', 'Another class: ' + t.title); }
        else { a.removeAttribute('title'); }
      });
    }

    if (!isCourse(here)) { mark(); return; }
    if (!isCourse(home)) { LS.set(KEY, here.name); home = here; mark(); return; }
    if (home.name === here.name) { mark(); return; }
    mark();

    var pair = 'det:xc:' + home.name + '>' + here.name;
    try { if (sessionStorage.getItem(pair)) return; } catch (e) {}

    /* The way back is the SAME TOPIC in the reader's own class where that
       exists - they wanted this page, they were just in the wrong copy of the
       course - and the track itself where it does not. */
    var mine = null;
    for (var i = 0; i < home.items.length; i++) {
      if (home.items[i].id === PAGE) { mine = home.items[i]; break; }
    }
    var backHref = mine ? base + mine.url + '?p=' + encodeURIComponent(home.name)
                        : base + 'presentations.html#pl-' + home.name;
    var backText = mine ? 'Open this page in ' + home.title : 'Go to ' + home.title;

    var el = document.createElement('aside');
    el.className = 'xcourse';
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<div class="xc-body"><span class="xc-t">This is ' + escHtml(here.title) + ' material.</span> ' +
      'You came from ' + escHtml(home.title) + ', and the pages look the same in every class. ' +
      '<a href="' + backHref + '">' + escHtml(backText) + '</a>.</div>' +
      '<button type="button" class="xc-sw">' + escHtml(here.title) + ' is my class</button>' +
      '<button type="button" class="xc-x" aria-label="Dismiss this notice">&#215;</button>';

    var main = $('main') || document.body;
    main.insertBefore(el, main.firstChild);

    $('.xc-x', el).addEventListener('click', function () {
      try { sessionStorage.setItem(pair, '1'); } catch (e) {}
      el.parentNode.removeChild(el);
    });
    $('.xc-sw', el).addEventListener('click', function () {
      LS.set(KEY, here.name);
      home = here;
      mark();
      el.parentNode.removeChild(el);
    });
  })();

  function escHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

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
      var hits = idx.map(function (p) {
        var score = 0;
        if (p.title.toLowerCase().indexOf(q) >= 0) score += 100;
        if (p.page.toLowerCase().indexOf(q) >= 0) score += 60;
        if (p.summary.toLowerCase().indexOf(q) >= 0) score += 25;
        if (p.text.toLowerCase().indexOf(q) >= 0) score += 15;
        return score ? { p: p, score: score, q: q } : null;
      }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });

      // Sections are indexed individually, so one page can otherwise fill the
      // whole result list. Keep its two best and let other pages be seen.
      var perPage = {}, out = [];
      hits.forEach(function (h) {
        var n = perPage[h.p.page] || 0;
        if (n < 2) { perPage[h.p.page] = n + 1; out.push(h); }
      });
      return out.slice(0, 8);
    }

    function render(hits, q) {
      shown = hits; cur = -1;
      if (!q || q.trim().length < 2) { box.removeAttribute('data-open'); box.innerHTML = ''; return; }
      if (!hits.length) {
        box.innerHTML = '<div class="empty">Nothing matches &ldquo;' + esc(q) + '&rdquo;.</div>';
        box.setAttribute('data-open', ''); return;
      }
      box.innerHTML = hits.map(function (h) {
        var crumb = h.p.collection + ' · ' + h.p.page;
        var label = (h.p.title === h.p.page) ? h.p.page : h.p.title;
        return '<a href="' + base + h.p.url + '">' +
               '<span class="rc">' + esc(crumb) + '</span>' +
               '<span class="rt">' + esc(label) + '</span>' +
               '<span class="rs">' + snippet(h.p.text || h.p.summary, h.q) + '</span></a>';
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

  /* ---- Unit 1: metric-prefix explorer ----------------------------------
     These lesson tools deliberately live beside the site behavior instead of
     in the authored pages. A page is still a complete reading experience
     without JavaScript; the controls only make the worked relationship
     immediate when a student has a browser available.                          */
  (function () {
    function readNumber(control) {
      if (!control) return null;
      var raw = String(control.value === undefined ? '' : control.value).trim();
      if (!raw) return null;
      var value = Number(raw);
      return isFinite(value) ? value : null;
    }

    function format(value) {
      if (!isFinite(value)) return '\u2014';
      if (Math.abs(value) < 1e-12) value = 0;
      if (value === 0) return '0';
      var absolute = Math.abs(value);
      var text = (absolute >= 1e-6 && absolute < 1e9) ? value.toPrecision(6) : value.toExponential(5);
      return text.replace(/(\.\d*?[1-9])0+(?=($|e))/i, '$1')
        .replace(/\.0+(?=($|e))/i, '')
        .replace('e+', 'e');
    }

    function symbol(select, root) {
      if (!select || !select.options || select.selectedIndex < 0) return '';
      var option = select.options[select.selectedIndex];
      var prefix = option.hasAttribute('data-symbol') ? option.getAttribute('data-symbol') : option.textContent.trim();
      /* Prefix menus in Unit 1 describe meters. A future menu can name a
         different base through data-prefix-base without changing the math. */
      var base = root.getAttribute('data-prefix-base') || root.getAttribute('data-prefix-unit') || 'm';
      return prefix + base;
    }

    document.querySelectorAll('[data-prefix-explorer]').forEach(function (root) {
      if (root.hasAttribute('data-prefix-wired')) return;
      root.setAttribute('data-prefix-wired', '');

      var value = root.querySelector('[data-prefix-value]');
      var from = root.querySelector('[data-prefix-from]');
      var to = root.querySelector('[data-prefix-to]');
      var result = root.querySelector('[data-prefix-result]');
      var work = root.querySelector('[data-prefix-work]');

      function setError(message) {
        root.setAttribute('data-state', 'error');
        if (result) result.textContent = message;
        if (work) work.textContent = 'Use a finite number and choose both prefixes.';
      }

      function update() {
        var amount = readNumber(value);
        var fromExponent = readNumber(from);
        var toExponent = readNumber(to);
        if (amount === null || fromExponent === null || toExponent === null) {
          setError('Enter a finite value to convert.');
          return;
        }

        var exponentDifference = fromExponent - toExponent;
        var factor = Math.pow(10, exponentDifference);
        var converted = amount * factor;
        if (!isFinite(factor) || !isFinite(converted)) {
          setError('That conversion is outside the usable numeric range.');
          return;
        }

        root.removeAttribute('data-state');
        if (result) result.textContent = format(converted) + ' ' + symbol(to, root);
        if (work) {
          work.textContent = format(amount) + ' ' + symbol(from, root) + ' \u00d7 10^(' +
            format(fromExponent) + ' \u2212 ' + format(toExponent) + ') = ' + format(converted) +
            ' ' + symbol(to, root) + '. Moving from ' + symbol(from, root) + ' to ' + symbol(to, root) +
            ' changes the number by a factor of ' + format(factor) + '.';
        }
      }

      [value, from, to].forEach(function (control) {
        if (!control) return;
        control.addEventListener('input', update);
        control.addEventListener('change', update);
      });
      update();
    });
  })();

  /* ---- Unit 1: dimension-aware converter ------------------------------
     The exact values below reproduce the official NIST Special Publication
     811, Appendix B relationships cited in the DET 403 Unit 1 materials.
     Factors translate each listed unit to its canonical SI unit; the page
     never fetches a conversion service or silently mixes dimensions.          */
  (function () {
    var units = {
      s:     { factor: 1,                dimension: 'time',         symbol: 's',      factorLabel: '1 s = 1 s' },
      min:   { factor: 60,               dimension: 'time',         symbol: 'min',    factorLabel: '1 min = 60 s' },
      h:     { factor: 3600,             dimension: 'time',         symbol: 'h',      factorLabel: '1 h = 3,600 s' },
      d:     { factor: 86400,            dimension: 'time',         symbol: 'd',      factorLabel: '1 d = 86,400 s' },
      mm:    { factor: 0.001,            dimension: 'length',       symbol: 'mm',     factorLabel: '1 mm = 0.001 m' },
      cm:    { factor: 0.01,             dimension: 'length',       symbol: 'cm',     factorLabel: '1 cm = 0.01 m' },
      m:     { factor: 1,                dimension: 'length',       symbol: 'm',      factorLabel: '1 m = 1 m' },
      km:    { factor: 1000,             dimension: 'length',       symbol: 'km',     factorLabel: '1 km = 1,000 m' },
      in:    { factor: 0.0254,           dimension: 'length',       symbol: 'in',     factorLabel: '1 in = 0.0254 m' },
      ft:    { factor: 0.3048,           dimension: 'length',       symbol: 'ft',     factorLabel: '1 ft = 0.3048 m' },
      yd:    { factor: 0.9144,           dimension: 'length',       symbol: 'yd',     factorLabel: '1 yd = 0.9144 m' },
      mi:    { factor: 1609.344,         dimension: 'length',       symbol: 'mi',     factorLabel: '1 mi = 1,609.344 m' },
      m2:    { factor: 1,                dimension: 'area',         symbol: 'm\u00b2',     factorLabel: '1 m\u00b2 = 1 m\u00b2' },
      ft2:   { factor: 0.09290304,       dimension: 'area',         symbol: 'ft\u00b2',    factorLabel: '1 ft\u00b2 = 0.09290304 m\u00b2' },
      in2:   { factor: 0.00064516,       dimension: 'area',         symbol: 'in\u00b2',    factorLabel: '1 in\u00b2 = 0.00064516 m\u00b2' },
      m3:    { factor: 1,                dimension: 'volume',       symbol: 'm\u00b3',     factorLabel: '1 m\u00b3 = 1 m\u00b3' },
      L:     { factor: 0.001,            dimension: 'volume',       symbol: 'L',      factorLabel: '1 L = 0.001 m\u00b3' },
      ft3:   { factor: 0.028316846592,   dimension: 'volume',       symbol: 'ft\u00b3',    factorLabel: '1 ft\u00b3 = 0.028316846592 m\u00b3' },
      in3:   { factor: 0.000016387064,   dimension: 'volume',       symbol: 'in\u00b3',    factorLabel: '1 in\u00b3 = 0.000016387064 m\u00b3' },
      usgal: { factor: 0.003785411784,   dimension: 'volume',       symbol: 'US gal', factorLabel: '1 US gal = 0.003785411784 m\u00b3' },
      kg:    { factor: 1,                dimension: 'mass',         symbol: 'kg',     factorLabel: '1 kg = 1 kg' },
      lbm:   { factor: 0.45359237,       dimension: 'mass',         symbol: 'lbm',    factorLabel: '1 lbm = 0.45359237 kg' },
      slug:  { factor: 14.5939029372,    dimension: 'mass',         symbol: 'slug',   factorLabel: '1 slug = 14.5939029372 kg' },
      mps:   { factor: 1,                dimension: 'speed',        symbol: 'm/s',    factorLabel: '1 m/s = 1 m/s' },
      ftps:  { factor: 0.3048,           dimension: 'speed',        symbol: 'ft/s',   factorLabel: '1 ft/s = 0.3048 m/s' },
      mph:   { factor: 0.44704,          dimension: 'speed',        symbol: 'mph',    factorLabel: '1 mph = 0.44704 m/s' },
      kmph:  { factor: 0.2777777777777778, dimension: 'speed',      symbol: 'km/h',   factorLabel: '1 km/h = 0.2777777777777778 m/s' },
      mps2:  { factor: 1,                dimension: 'acceleration', symbol: 'm/s\u00b2',   factorLabel: '1 m/s\u00b2 = 1 m/s\u00b2' },
      ftps2: { factor: 0.3048,           dimension: 'acceleration', symbol: 'ft/s\u00b2',  factorLabel: '1 ft/s\u00b2 = 0.3048 m/s\u00b2' },
      N:     { factor: 1,                dimension: 'force',        symbol: 'N',      factorLabel: '1 N = 1 N' },
      lbf:   { factor: 4.4482216152605,  dimension: 'force',        symbol: 'lbf',    factorLabel: '1 lbf = 4.4482216152605 N' }
    };

    function readNumber(control) {
      if (!control) return null;
      var raw = String(control.value === undefined ? '' : control.value).trim();
      if (!raw) return null;
      var value = Number(raw);
      return isFinite(value) ? value : null;
    }

    function format(value) {
      if (!isFinite(value)) return '\u2014';
      if (Math.abs(value) < 1e-12) value = 0;
      if (value === 0) return '0';
      var absolute = Math.abs(value);
      var text = (absolute >= 1e-6 && absolute < 1e9) ? value.toPrecision(6) : value.toExponential(5);
      return text.replace(/(\.\d*?[1-9])0+(?=($|e))/i, '$1')
        .replace(/\.0+(?=($|e))/i, '')
        .replace('e+', 'e');
    }

    document.querySelectorAll('[data-unit-converter]').forEach(function (root) {
      if (root.hasAttribute('data-unit-converter-wired')) return;
      root.setAttribute('data-unit-converter-wired', '');

      /* data-convert-* is the concise authored spelling in the first three
         Unit 1 pages; data-unit-* remains the public hook contract for later
         activities. Supporting both keeps one converter implementation. */
      var value = root.querySelector('[data-unit-value], [data-convert-value]');
      var from = root.querySelector('[data-unit-from], [data-convert-from]');
      var to = root.querySelector('[data-unit-to], [data-convert-to]');
      var result = root.querySelector('[data-unit-result], [data-convert-result]');
      var work = root.querySelector('[data-unit-work], [data-convert-work]');

      function showError(resultText, workText) {
        root.setAttribute('data-state', 'error');
        if (result) result.textContent = resultText;
        if (work) work.textContent = workText;
      }

      function update() {
        var amount = readNumber(value);
        var fromUnit = from && units[from.value];
        var toUnit = to && units[to.value];
        if (amount === null || !fromUnit || !toUnit) {
          showError('Enter a finite value and choose two supported units.', 'The converter needs a value, a starting unit, and a destination unit.');
          return;
        }
        if (fromUnit.dimension !== toUnit.dimension) {
          showError('Cannot convert ' + fromUnit.dimension + ' to ' + toUnit.dimension + '.', 'Choose two units from the same physical dimension.');
          return;
        }

        var converted = amount * fromUnit.factor / toUnit.factor;
        if (!isFinite(converted)) {
          showError('That conversion is outside the usable numeric range.', 'Choose a smaller finite value and try again.');
          return;
        }

        root.removeAttribute('data-state');
        if (result) result.textContent = format(converted) + ' ' + toUnit.symbol;
        if (work) {
          work.textContent = fromUnit.factorLabel + '; ' + toUnit.factorLabel + '. ' +
            format(amount) + ' ' + fromUnit.symbol + ' \u00d7 ' + format(fromUnit.factor) +
            ' \u00f7 ' + format(toUnit.factor) + ' = ' + format(converted) + ' ' + toUnit.symbol + '.';
        }
      }

      [value, from, to].forEach(function (control) {
        if (!control) return;
        control.addEventListener('input', update);
        control.addEventListener('change', update);
      });
      update();
    });
  })();

  /* ---- Unit 1: position, distance, and velocity lab -------------------*/
  (function () {
    function readNumber(control) {
      if (!control) return null;
      var raw = String(control.value === undefined ? '' : control.value).trim();
      if (!raw) return null;
      var value = Number(raw);
      return isFinite(value) ? value : null;
    }

    function format(value) {
      if (!isFinite(value)) return '\u2014';
      if (Math.abs(value) < 1e-12) value = 0;
      if (value === 0) return '0';
      var absolute = Math.abs(value);
      var text = (absolute >= 1e-6 && absolute < 1e9) ? value.toPrecision(6) : value.toExponential(5);
      return text.replace(/(\.\d*?[1-9])0+(?=($|e))/i, '$1')
        .replace(/\.0+(?=($|e))/i, '')
        .replace('e+', 'e');
    }

    function write(root, names, text) {
      names.forEach(function (name) {
        root.querySelectorAll('[data-path-' + name + '], [data-path-output="' + name + '"]').forEach(function (output) {
          output.textContent = text;
          if (!output.hasAttribute('aria-live')) output.setAttribute('aria-live', 'polite');
        });
      });
    }

    function markerName(marker) {
      var named = marker.getAttribute('data-path-marker');
      if (named) return named;
      if (marker.hasAttribute('data-path-start-marker')) return 'start';
      if (marker.hasAttribute('data-path-turn-marker')) return 'turn';
      if (marker.hasAttribute('data-path-end-marker')) return 'end';
      return '';
    }

    document.querySelectorAll('[data-path-lab]').forEach(function (root) {
      if (root.hasAttribute('data-path-lab-wired')) return;
      root.setAttribute('data-path-lab-wired', '');

      var start = root.querySelector('[data-path-start]');
      var turn = root.querySelector('[data-path-turn]');
      var end = root.querySelector('[data-path-end]');
      var outTime = root.querySelector('[data-path-out-time]');
      var returnTime = root.querySelector('[data-path-return-time]');

      function clearResults(message) {
        root.setAttribute('data-state', 'error');
        write(root, ['distance'], message);
        write(root, ['displacement'], '\u2014');
        write(root, ['time', 'total-time'], '\u2014');
        write(root, ['speed', 'avg-speed', 'average-speed'], '\u2014');
        write(root, ['velocity', 'avg-velocity', 'average-velocity'], '\u2014');
      }

      function update() {
        var startValue = readNumber(start);
        var turnValue = readNumber(turn);
        /* An out-and-back path ends where it starts. Older authored markup may
           still contain an end control, so mirror it rather than trusting a
           separate value. */
        var endValue = startValue;
        if (end && startValue !== null) end.value = String(startValue);
        var outTimeValue = readNumber(outTime);
        var returnTimeValue = readNumber(returnTime);
        if (startValue === null || turnValue === null ||
            outTimeValue === null || returnTimeValue === null || outTimeValue <= 0 || returnTimeValue <= 0) {
          clearResults('Enter positions and positive travel times.');
          return;
        }

        var distance = Math.abs(turnValue - startValue) + Math.abs(endValue - turnValue);
        var displacement = endValue - startValue;
        var totalTime = outTimeValue + returnTimeValue;
        var averageSpeed = distance / totalTime;
        var averageVelocity = displacement / totalTime;
        root.removeAttribute('data-state');
        write(root, ['distance'], format(distance) + ' m');
        write(root, ['displacement'], format(displacement) + ' m');
        write(root, ['time', 'total-time'], format(totalTime) + ' s');
        write(root, ['speed', 'avg-speed', 'average-speed'], format(averageSpeed) + ' m/s');
        write(root, ['velocity', 'avg-velocity', 'average-velocity'], format(averageVelocity) + ' m/s');

        var positions = { start: startValue, turn: turnValue, end: endValue };
        var positionValues = [startValue, turnValue, endValue];
        var lowestPosition = Math.min.apply(Math, positionValues);
        var highestPosition = Math.max.apply(Math, positionValues);
        var pathRange = highestPosition - lowestPosition;
        /* Leave a truthful margin around the actual extrema so the labels do
           not fall off the track. A zero-length path still gets a real scale. */
        var scalePadding = Math.max(pathRange * 0.25, 1);
        var scaleMinimum = lowestPosition - scalePadding;
        var scaleMaximum = highestPosition + scalePadding;
        var scaleRange = scaleMaximum - scaleMinimum;
        var markerRows = {};

        ['start', 'turn', 'end'].forEach(function (name) {
          var samePosition = ['start', 'turn', 'end'].filter(function (other) {
            return other !== name && positions[other] === positions[name];
          });
          markerRows[name] = samePosition.length ? ['start', 'turn', 'end'].slice(0, ['start', 'turn', 'end'].indexOf(name)).filter(function (earlier) {
            return positions[earlier] === positions[name];
          }).length : 0;
        });
        var requiredRows = Math.max(markerRows.start, markerRows.turn, markerRows.end) + 1;
        root.setAttribute('data-path-label-rows', String(requiredRows));

        root.querySelectorAll('[data-path-axis-min]').forEach(function (label) {
          label.textContent = format(scaleMinimum) + ' m';
        });
        root.querySelectorAll('[data-path-axis-max]').forEach(function (label) {
          label.textContent = format(scaleMaximum) + ' m';
        });

        root.querySelectorAll('[data-path-marker], [data-path-start-marker], [data-path-turn-marker], [data-path-end-marker]').forEach(function (marker) {
          var name = markerName(marker);
          var position = positions[name];
          if (position === undefined) return;
          var percentage = ((position - scaleMinimum) / scaleRange) * 100;
          var isLowest = position === lowestPosition && lowestPosition !== highestPosition;
          var isHighest = position === highestPosition && lowestPosition !== highestPosition;
          marker.style.setProperty('--path-position', percentage + '%');
          marker.style.setProperty('--path-label-row', String(markerRows[name] || 0));
          marker.style.left = percentage + '%';
          if (isLowest) marker.setAttribute('data-path-edge', 'low');
          else if (isHighest) marker.setAttribute('data-path-edge', 'high');
          else marker.removeAttribute('data-path-edge');
          if (name) marker.textContent = name.charAt(0).toUpperCase() + name.slice(1) + ': ' + format(position) + ' m';
        });

        var track = root.querySelector('.path-track, .path-lab-track, [data-path-track]');
        if (track && track.hasAttribute('aria-label')) {
          track.setAttribute('aria-label', 'The path starts at ' + format(startValue) + ' meters, reaches ' +
            format(turnValue) + ' meters, and returns to ' + format(endValue) + ' meters. The displayed scale runs from ' +
            format(scaleMinimum) + ' meters to ' + format(scaleMaximum) + ' meters.');
        }
      }

      [start, turn, end, outTime, returnTime].forEach(function (control) {
        if (!control) return;
        control.addEventListener('input', update);
        control.addEventListener('change', update);
      });
      update();
    });
  })();

  /* ---- Unit 1: average-acceleration lab -------------------------------*/
  (function () {
    function readNumber(control) {
      if (!control) return null;
      var raw = String(control.value === undefined ? '' : control.value).trim();
      if (!raw) return null;
      var value = Number(raw);
      return isFinite(value) ? value : null;
    }

    function format(value) {
      if (!isFinite(value)) return '\u2014';
      if (Math.abs(value) < 1e-12) value = 0;
      if (value === 0) return '0';
      var absolute = Math.abs(value);
      var text = (absolute >= 1e-6 && absolute < 1e9) ? value.toPrecision(6) : value.toExponential(5);
      return text.replace(/(\.\d*?[1-9])0+(?=($|e))/i, '$1')
        .replace(/\.0+(?=($|e))/i, '')
        .replace('e+', 'e');
    }

    function signed(value) {
      if (value > 0) return format(value);
      if (value < 0) return '\u2212' + format(Math.abs(value));
      return '0';
    }

    function write(root, names, text) {
      names.forEach(function (name) {
        var shortName = {
          initial: 'initial', vi: 'initial', final: 'final', vf: 'final',
          delta: 'change', change: 'change', average: 'average', avg: 'average',
          si: 'si', metric: 'si'
        }[name] || name;
        root.querySelectorAll('[data-acceleration-' + name + '], [data-acceleration-output="' + name + '"]' +
          ', [data-accel-' + shortName + ']').forEach(function (output) {
          output.textContent = text;
          if (!output.hasAttribute('aria-live')) output.setAttribute('aria-live', 'polite');
        });
      });
    }

    function setBar(root, names, width) {
      names.forEach(function (name) {
        root.querySelectorAll('[data-acceleration-' + name + '-bar], [data-acceleration-bar="' + name + '"]').forEach(function (bar) {
          bar.style.setProperty('--velocity-width', width + '%');
          bar.style.width = width + '%';
        });
      });
    }

    document.querySelectorAll('[data-acceleration-lab]').forEach(function (root) {
      if (root.hasAttribute('data-acceleration-lab-wired')) return;
      root.setAttribute('data-acceleration-lab-wired', '');

      /* data-accel-* is the compact spelling used by the first authored
         acceleration page; keep the data-acceleration-* contract available
         for subsequent labs. */
      var initial = root.querySelector('[data-acceleration-vi], [data-accel-initial]');
      var final = root.querySelector('[data-acceleration-vf], [data-accel-final]');
      var time = root.querySelector('[data-acceleration-time], [data-accel-time]');

      function error(message) {
        root.setAttribute('data-state', 'error');
        write(root, ['delta', 'average', 'avg', 'si'], message);
        setBar(root, ['initial', 'vi'], 0);
        setBar(root, ['final', 'vf'], 0);
      }

      function update() {
        var vi = readNumber(initial);
        var vf = readNumber(final);
        var seconds = readNumber(time);
        if (vi === null || vf === null || seconds === null || seconds <= 0) {
          error('Enter two velocities and a positive time.');
          return;
        }

        var change = vf - vi;
        var average = change / seconds;
        var siAverage = average * 0.3048;
        var scale = Math.max(Math.abs(vi), Math.abs(vf), 1);
        root.removeAttribute('data-state');
        write(root, ['initial', 'vi'], signed(vi) + ' ft/s');
        write(root, ['final', 'vf'], signed(vf) + ' ft/s');
        write(root, ['delta', 'change'], signed(change) + ' ft/s');
        write(root, ['average', 'avg'], signed(average) + ' ft/s\u00b2');
        write(root, ['si', 'metric'], signed(siAverage) + ' m/s\u00b2');
        setBar(root, ['initial', 'vi'], Math.abs(vi) / scale * 100);
        setBar(root, ['final', 'vf'], Math.abs(vf) / scale * 100);
      }

      [initial, final, time].forEach(function (control) {
        if (!control) return;
        control.addEventListener('input', update);
        control.addEventListener('change', update);
      });
      update();
    });
  })();

  /* ---- Unit 1: CAD scale and material estimator -----------------------*/
  (function () {
    function readNumber(control) {
      if (!control) return null;
      var raw = String(control.value === undefined ? '' : control.value).trim();
      if (!raw) return null;
      var value = Number(raw);
      return isFinite(value) ? value : null;
    }

    function format(value) {
      if (!isFinite(value)) return '\u2014';
      if (Math.abs(value) < 1e-12) value = 0;
      if (value === 0) return '0';
      var absolute = Math.abs(value);
      var text = (absolute >= 1e-6 && absolute < 1e9) ? value.toPrecision(6) : value.toExponential(5);
      return text.replace(/(\.\d*?[1-9])0+(?=($|e))/i, '$1')
        .replace(/\.0+(?=($|e))/i, '')
        .replace('e+', 'e');
    }

    function formatForce(value) {
      if (!isFinite(value)) return '\u2014';
      if (Math.abs(value) < 0.05) value = 0;
      return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '');
    }

    function write(root, names, text) {
      var directOutput = { 'area-factor': true, 'volume-factor': true, mass: true, weight: true, lbf: true, 'pounds-force': true };
      names.forEach(function (name) {
        var selector = '[data-cad-' + name + '-result], [data-cad-output="' + name + '"]';
        if (directOutput[name]) selector += ', [data-cad-' + name + ']';
        root.querySelectorAll(selector).forEach(function (output) {
          output.textContent = text;
          if (!output.hasAttribute('aria-live')) output.setAttribute('aria-live', 'polite');
        });
      });
    }

    document.querySelectorAll('[data-cad-lab]').forEach(function (root) {
      if (root.hasAttribute('data-cad-lab-wired')) return;
      root.setAttribute('data-cad-lab-wired', '');

      var scale = root.querySelector('[data-cad-scale]');
      var baseArea = root.querySelector('[data-cad-area]');
      var baseVolume = root.querySelector('[data-cad-volume]');
      var density = root.querySelector('[data-cad-density]');
      var gravity = root.querySelector('[data-cad-gravity]');

      function error(message) {
        root.setAttribute('data-state', 'error');
        write(root, ['area-factor', 'volume-factor', 'area', 'volume', 'mass', 'weight', 'lbf'], message);
      }

      function update() {
        var k = readNumber(scale);
        var area = readNumber(baseArea);
        var volume = readNumber(baseVolume);
        var materialDensity = readNumber(density);
        var g = readNumber(gravity);
        if (k === null || area === null || volume === null || materialDensity === null || g === null ||
            k <= 0 || area < 0 || volume < 0 || materialDensity < 0 || g < 0) {
          error('Use a positive scale and nonnegative dimensions, density, and gravity.');
          return;
        }

        var scaledArea = area * k * k;
        var scaledVolume = volume * k * k * k;
        var mass = scaledVolume * materialDensity;
        var weight = mass * g;
        var poundsForce = weight / 4.4482216152605;
        if (!isFinite(scaledArea) || !isFinite(scaledVolume) || !isFinite(mass) || !isFinite(weight) || !isFinite(poundsForce)) {
          error('That scale is outside the usable numeric range.');
          return;
        }

        root.removeAttribute('data-state');
        write(root, ['area-factor'], format(k * k));
        write(root, ['volume-factor'], format(k * k * k));
        write(root, ['area', 'scaled-area'], format(scaledArea) + ' m\u00b2');
        write(root, ['volume', 'scaled-volume'], format(scaledVolume) + ' m\u00b3');
        write(root, ['mass'], format(mass) + ' kg');
        write(root, ['weight'], formatForce(weight) + ' N');
        write(root, ['lbf', 'pounds-force'], formatForce(poundsForce) + ' lbf');
      }

      [scale, baseArea, baseVolume, density, gravity].forEach(function (control) {
        if (!control) return;
        control.addEventListener('input', update);
        control.addEventListener('change', update);
      });
      update();
    });
  })();

  /* ---- Unit 1: small numerical practice checks ------------------------*/
  (function () {
    function readNumber(control) {
      if (!control) return null;
      var raw = String(control.value === undefined ? '' : control.value).trim();
      if (!raw) return null;
      var value = Number(raw);
      return isFinite(value) ? value : null;
    }

    document.querySelectorAll('[data-practice]').forEach(function (root) {
      if (root.hasAttribute('data-practice-wired')) return;
      root.setAttribute('data-practice-wired', '');

      var input = root.querySelector('[data-practice-input], input[type="number"], input[type="text"]');
      var button = root.querySelector('[data-practice-check], .practice-check, button');
      var feedback = root.querySelector('[data-practice-feedback], [data-practice-result], [aria-live]');
      var answer = Number(root.getAttribute('data-answer'));
      var tolerance = Number(root.getAttribute('data-tolerance'));
      var unit = root.getAttribute('data-unit') || '';
      if (feedback && !feedback.hasAttribute('aria-live')) feedback.setAttribute('aria-live', 'polite');

      function say(message, state) {
        root.setAttribute('data-state', state);
        if (feedback) feedback.textContent = message;
      }

      function check() {
        var attempt = readNumber(input);
        if (attempt === null) {
          say('Enter a number before checking your work.', 'error');
          return;
        }
        if (!isFinite(answer) || !isFinite(tolerance) || tolerance < 0) {
          say('This check is not configured yet. Keep your work and ask your instructor.', 'error');
          return;
        }
        if (Math.abs(attempt - answer) <= tolerance) {
          say('Correct \u2014 your ' + (unit ? unit + ' ' : '') + 'answer is within the accepted tolerance.', 'correct');
        } else {
          say('Not yet \u2014 check the units, conversion factor, and arithmetic, then try again.', 'incorrect');
        }
      }

      if (button) button.addEventListener('click', function (event) { event.preventDefault(); check(); });
      if (input) input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); check(); }
      });
    });
  })();
})();
