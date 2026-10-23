/* ===========================================================================
   the-stranger / src/app.js — THE ACTIVITY.

   The lesson shell (tools/lesson-shell) owns the header, the stage tablist, the
   four dialogs, presentation mode, the A6 check-card wiring and Reset's chrome
   half. This file owns everything inside the activity: the levers, the
   assembled prompt, the target deck, the answer, the typewriter, the jargon
   meter, the class scoring and the predictions.

   It talks to the shell through exactly two events on `document`, and installs
   one veto hook. There is no other coupling.

   WHAT THIS FILE NO LONGER CONTAINS, because the shell does it:
     open()/close()/showModal()/openSettings()/closeSettings(), the .modal
     system, the Escape handler, [data-close], the backdrop-click handler,
     syncOverlayFlag(), the act/tab navigation, setMode(), renderModeBanner(),
     renderSettings(), runGuide()/guideSteps()/showQuiz() (the walkthrough
     became the A6 bank, generated into the template by build.js), and
     resetDemo() (replaced by the `lessonreset` listener at the bottom).
   =========================================================================== */
'use strict';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

const LEVERS = [
  { key: 'context',  n: 1, name: 'CONTEXT',         tag: "tells it who is asking and what they're working with", cls: 'c1' },
  { key: 'success',  n: 2, name: 'SUCCESS SPEC',    tag: 'tells it what a finished answer looks like',            cls: 'c2' },
  { key: 'keywords', n: 3, name: 'EXPERT KEYWORDS', tag: 'tells it which vocabulary to answer in',                cls: 'c3' }
];

/* The initial state, written once and cloned on reset, so "back to first load"
   is a value rather than a list of assignments that can fall out of date. */
const INITIAL = {
  sc: 0,
  bits: [0, 0, 0],
  stage: 0,
  highlight: false,
  forced: '',        // '' = random
  lastCard: null,    // card id drawn for the answer on screen
  lastKey: null,     // response key on screen
  scores: [],        // {sid,key,card,levers,score}
  heard: 0,          // answers streamed this session
  novelSeen: 0,      // expert terms shown that the prompt never contained
  pinned: null,
  asked: false,
  predictions: {},   // stage index -> chosen value
  resetting: false
};
const S = Object.assign({}, INITIAL, { bits: [0, 0, 0], scores: [], predictions: {} });

const scen = () => DATA.scenarios[S.sc];
const bitStr = () => S.bits.join('');
const leverCount = () => S.bits.reduce((a, b) => a + b, 0);

let activeTyper = null;
let cardTimer = 0;

/* ---------------------------------------------------------- markdown ------ */
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function inline(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
}
function mdToHtml(md) {
  const out = [];
  let list = null, para = [];
  const flushP = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const flushL = () => { if (list) { out.push('</' + list + '>'); list = null; } };
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flushP(); flushL(); continue; }
    let m;
    if ((m = line.match(/^###\s+(.*)$/))) { flushP(); flushL(); out.push('<h3>' + inline(m[1]) + '</h3>'); continue; }
    if ((m = line.match(/^\s*-\s+(.*)$/))) { flushP(); if (list !== 'ul') { flushL(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) { flushP(); if (list !== 'ol') { flushL(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
    flushL(); para.push(line.trim());
  }
  flushP(); flushL();
  return out.join('');
}

/* ----------------------------------------------------- jargon tagging -----
   Wrap the FIRST occurrence of each tagged term. First-occurrence-only is what
   makes the meter's final number equal the authored term list exactly.
   Unchanged from the pre-kit version: the mechanism is the activity. */
function markTerms(root, terms, promptLow) {
  const ordered = terms.slice().sort((a, b) => b.length - a.length);
  const missed = [];
  for (const term of ordered) {
    if (!markFirst(root, term, promptLow.indexOf(term.toLowerCase()) === -1)) missed.push(term);
  }
  return missed;
}
function markFirst(root, term, novel) {
  const low = term.toLowerCase();
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) { return n.parentNode.closest('mark') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
  });
  let n;
  while ((n = w.nextNode())) {
    const hay = n.nodeValue.toLowerCase();
    let from = 0, i;
    while ((i = hay.indexOf(low, from)) !== -1) {
      const before = i === 0 ? '' : hay[i - 1];
      const after = hay[i + low.length] || '';
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
        const mid = n.splitText(i);
        mid.splitText(low.length);
        const mk = document.createElement('mark');
        mk.className = 'jg';
        mk.dataset.novel = novel ? '1' : '0';
        mid.parentNode.replaceChild(mk, mid);
        mk.appendChild(mid);
        return true;
      }
      from = i + 1;
    }
  }
  return false;
}

/* ------------------------------------------------------- typewriter -------
   Reveals pre-existing text nodes at a fixed rate. It is DECORATION and the
   Scripted kicker above the answer says so: the rate is a CSS variable, not a
   model's speed. Unchanged mechanism. */
class Typer {
  constructor(host, onTerm, onDone) {
    this.host = host; this.onTerm = onTerm; this.onDone = onDone;
    this.nodes = []; this.i = 0; this.off = 0; this.raf = 0; this.done = false;
    const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) this.nodes.push({ n, full: n.nodeValue });
    for (const it of this.nodes) it.n.nodeValue = '';
    $$('h3,p,li,ul,ol', host).forEach(el => el.classList.add('tw-pending'));
    this.caret = document.createElement('span');
    this.caret.className = 'caret';
  }
  reveal(item) {
    let el = item.n.parentNode;
    while (el && el !== this.host) { el.classList.remove('tw-pending'); el = el.parentNode; }
  }
  start() {
    if (!this.nodes.length) return this.finish();
    let last = performance.now();
    const tick = (t) => {
      if (this.done) return;
      const rate = +getComputedStyle(document.documentElement).getPropertyValue('--stream') || 420;
      let budget = Math.max(1, Math.round((t - last) / 1000 * rate));
      last = t;
      while (budget > 0 && this.i < this.nodes.length) {
        const item = this.nodes[this.i];
        if (this.off === 0) this.reveal(item);
        const take = Math.min(budget, item.full.length - this.off);
        this.off += take; budget -= take;
        item.n.nodeValue = item.full.slice(0, this.off);
        if (this.off >= item.full.length) {
          const mk = item.n.parentNode;
          if (mk && mk.tagName === 'MARK') { mk.classList.add('pop'); this.onTerm(mk); }
          this.i++; this.off = 0;
          const nx = this.nodes[this.i];
          if (nx) nx.n.parentNode.appendChild(this.caret);
        }
      }
      if (this.i >= this.nodes.length) return this.finish();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  skip() {
    if (this.done) return;
    for (let k = this.i; k < this.nodes.length; k++) {
      const item = this.nodes[k];
      this.reveal(item);
      item.n.nodeValue = item.full;
      const mk = item.n.parentNode;
      if (mk && mk.tagName === 'MARK') this.onTerm(mk);
    }
    this.i = this.nodes.length;
    this.finish();
  }
  finish() {
    if (this.done) return;
    this.done = true;
    cancelAnimationFrame(this.raf);
    if (this.caret.parentNode) this.caret.parentNode.removeChild(this.caret);
    $$('.tw-pending', this.host).forEach(el => el.classList.remove('tw-pending'));
    this.onDone();
  }
}

/* ----------------------------------------------------------- prompt ------- */
function assembledText(sc, bits) {
  const p = [sc.base];
  if (bits[0]) p.push(sc.levers.context);
  if (bits[1]) p.push(sc.levers.success);
  if (bits[2]) p.push(sc.levers.keywords);
  return p.join('\n\n');
}
function promptHtml(sc, bits, compact) {
  let h = '';
  if (sc.attachment) h += '<button class="attach" type="button" data-draft>\u{1F4CE} ' + esc(sc.attachment) + '</button>';
  h += '<div class="pblock base">' + esc(sc.base) + '</div>';
  LEVERS.forEach((L, i) => {
    if (!bits[i]) return;
    h += '<div class="pblock ' + L.cls + '">' + (compact ? '' : '<span class="lbl">' + L.name + '</span>') + esc(sc.levers[L.key]) + '</div>';
  });
  return h;
}

/* --------------------------------------------------------------- render --- */
function renderScenarios() {
  $('#scenario-tabs').innerHTML = DATA.scenarios.map((s, i) =>
    '<button class="scenario-tab" type="button" aria-pressed="' + (i === S.sc) + '" data-sc="' + i + '">' + esc(s.tab) + '</button>').join('');
}

/* Each lever states, before you press anything, what leaving it in this
   position will cost you. Lever 2's consequence is a physical object — the deck
   it deals itself — so the deck lives inside lever 2 rather than across the
   room from it.

   SCOPED WORDING (accuracy audit C6/C7): these were unhedged predictions about
   what a model WILL do. They are promises about this demo's fixture set, so
   they now say "usually" and "in this demo" where that is what is true. */
function consequence(i) {
  const on = !!S.bits[i];
  if (i === 0) return on
    ? '<b>It knows who is asking.</b> See step 2.'
    : '<b>It has no idea who is asking.</b> Whatever comes back will usually be aimed at everybody, which is another way of saying nobody.';
  if (i === 2) return on
    ? "<b>It answers in the field's vocabulary.</b> Watch the counter under the answer."
    : '<b>It will answer in the words you used.</b> In this demo the expert-term counter stays at four or below.';
  return on
    ? '<b>You decided what done looks like, so the deck is out of its hands:</b>'
    : "<b>Somebody has to decide what a finished answer looks like, and you haven't.</b> So this demo deals itself one of these three and answers to that card, without saying which.";
}

function renderLevers() {
  const cards = scen().cards;
  $('#levers').innerHTML = LEVERS.map((L, i) => {
    const on = !!S.bits[i];
    const focus = i === S.stage ? ' focus-lever' : '';
    let body = (on && i !== 1) ? '' :
      '<div class="conseq">' + consequence(i) + '</div>';
    if (i === 1) {
      body +=
        '<div class="deckrow' + (on ? ' gone' : '') + '">' +
          '<div class="deck' + (on ? ' gone' : '') + '" aria-hidden="true"><i></i><i></i><i></i></div>' +
          '<div class="decknames">' +
            cards.map(c => '<span>' + DATA.cards[c].icon + ' ' + esc(DATA.cards[c].label) + '</span>').join('') +
          '</div>' +
        '</div>' +
        '<div class="rehearse">' +
          '<label class="control-label" for="force-card">Card it will draw' +
            '<span class="why">Normally random, which is the honest version. Pick one to rehearse a beat.</span></label>' +
          '<select id="force-card"></select>' +
          '<button class="btn ghost small" type="button" id="btn-replay">Show that card again</button>' +
        '</div>';
    }
    return '<div class="lever' + (on ? ' on' : '') + focus + '" data-l="' + i + '">' +
      '<button class="lever-head" type="button" data-toggle="' + i + '" aria-pressed="' + on + '">' +
        '<span class="num" aria-hidden="true">' + L.n + '</span>' +
        '<span class="txt"><span class="nm">' + L.name + '</span><span class="tg">' + esc(L.tag) + '</span></span>' +
        '<span class="sw" aria-hidden="true"></span></button>' + body + '</div>';
  }).join('');
  renderDeck();
}

function renderPrompt() {
  $('#prompt-box').innerHTML = promptHtml(scen(), S.bits, false);
  const n = leverCount();
  $('#ask-hint').textContent = n === 0
    ? 'Nothing but the question. This is how a lot of people ask.'
    : n + (n === 1 ? ' lever pulled.' : ' levers pulled.');
}

function renderDeck() {
  const specOn = !!S.bits[1];
  const sel = $('#force-card');
  if (!sel) return;
  sel.innerHTML = '<option value="">Random (what students see)</option>' +
    scen().cards.map(c => '<option value="' + c + '">' + esc(DATA.cards[c].label) + '</option>').join('');
  sel.value = S.forced;
  sel.disabled = specOn;
  const rp = $('#btn-replay');
  if (rp) rp.disabled = specOn || !S.lastCard;
}

/* A6: only the check card for the current question is shown. All twelve are in
   the built file so the shell could bind them at load; the other nine are
   hidden by ATTRIBUTE, never by a .hidden class — the kit ships
   [hidden]{display:none!important} and no .hidden rule, so a class toggle here
   would silently render every card stacked. */
function renderChecks() {
  const sid = scen().id;
  $$('.check[data-scenario]').forEach(c => { c.hidden = c.dataset.scenario !== sid; });
}

function renderAll() { renderScenarios(); renderLevers(); renderPrompt(); renderChecks(); }

/* ------------------------------------------------------------- the ask ---- */
function pickCard() {
  const cards = scen().cards;
  if (S.forced && cards.includes(S.forced)) return S.forced;
  return cards[Math.floor(Math.random() * cards.length)];
}
function cardHtml(id) {
  const c = DATA.cards[id];
  return '<div class="tcard"><div class="k">you didn’t say what a good answer looks like, so it picked:</div>' +
    '<div class="icon" aria-hidden="true">' + c.icon + '</div>' +
    '<div class="lab">' + esc(c.label) + '</div>' +
    '<div class="sub">' + esc(c.sub) + '</div>' +
    '<div class="foot">The answer you are about to read was written to this rule. Normally this card stays face down and you never learn it existed. ' +
    '<b>Teaching device:</b> a real model does not pick from a deck of three &mdash; see Details.</div></div>';
}
function dismissCard() {
  clearTimeout(cardTimer); cardTimer = 0;
  const d = $('#card-stage');
  if (d.open) { try { d.close(); } catch (e) { /* already closing */ } }
}
function drawCard(id, then) {
  dismissCard();
  $('#card-host').innerHTML = cardHtml(id);
  const d = $('#card-stage');
  const onClose = () => { d.removeEventListener('close', onClose); clearTimeout(cardTimer); if (then) then(); };
  d.addEventListener('close', onClose);
  d.showModal();
  cardTimer = setTimeout(() => { if (d.open) d.close(); }, 2600);
}

function ask() {
  if (activeTyper && !activeTyper.done) activeTyper.skip();
  const sc = scen(), bits = bitStr();
  S.asked = true;
  if (S.bits[1] === 1) {
    S.lastCard = null; S.lastKey = bits;
    renderDeck();
    stream(sc, bits, null);
  } else {
    const card = pickCard();
    S.lastCard = card; S.lastKey = bits + '|' + card;
    renderDeck();
    drawCard(card, () => stream(sc, bits, card));
  }
}

function responseNode(sc, bits, card, opts) {
  opts = opts || {};
  const key = card ? bits + '|' + card : bits;
  const r = sc.responses[key];
  const promptLow = assembledText(sc, bits.split('').map(Number)).toLowerCase();
  const novelTotal = r.terms.filter(t => promptLow.indexOf(t.toLowerCase()) === -1).length;

  const wrap = document.createElement('div');
  wrap.innerHTML =
    '<div class="bubble ai">' +
      '<div class="aihead"><span class="nm">Example answer</span>' +
        (card ? '<span class="chip target">' + DATA.cards[card].icon + ' ' + esc(DATA.cards[card].label) + '</span>' : '') +
        '<span class="chip">' + leverLabel(bits) + '</span>' +
      '</div>' +
      '<div class="md"></div>' +
      /* The meter's two numbers have DIFFERENT provenance and say so: the count
         is a readout of the author's tag list (Scripted), the novelty check is
         computed now against your own prompt (Live). Audit finding M2. */
      '<div class="meter"><span class="mlabel">Expert&nbsp;terms</span><span class="big">0</span>' +
        '<span>specialist words in this answer</span>' +
        '<span class="never"></span>' +
        '<button class="btn ghost small" type="button" data-hl>Show me which ones</button>' +
        '<span class="meter-kickers">' +
          '<span class="panel-kicker"><span class="k-scripted">Scripted</span><span class="k-qual">the count reads the author’s tag list; nothing here detects specialist vocabulary</span></span>' +
          '<span class="panel-kicker"><span class="k-live">Live</span><span class="k-qual">“words you never typed” is checked against your own prompt as you ask</span></span>' +
        '</span>' +
      '</div>' +
    '</div>';
  const md = $('.md', wrap);
  md.innerHTML = mdToHtml(r.md);
  const missed = markTerms(md, r.terms, promptLow);
  if (missed.length) console.warn('unmarked terms', key, missed);

  const meterBig = $('.big', wrap), never = $('.never', wrap);
  let count = 0, novel = 0;
  const bump = (mk) => {
    count++; if (mk.dataset.novel === '1') novel++;
    meterBig.textContent = count;
    never.textContent = novel ? '— ' + novel + ' of them are words you never typed' : '';
    never.classList.toggle('zero', !novel);
  };
  wrap.dataset.total = r.terms.length;
  wrap.dataset.novelTotal = novelTotal;

  if (opts.instant) {
    $$('mark.jg', md).forEach(bump);
    return { wrap, typer: null, novelTotal, termTotal: r.terms.length };
  }
  const typer = new Typer(md, bump, () => {
    if (opts.withScore) {
      S.heard++; S.novelSeen += novelTotal;
      addScoreStrip(wrap, sc, key);
    }
    announce(bits, card, r.terms.length, novelTotal);
  });
  return { wrap, typer, novelTotal, termTotal: r.terms.length };
}

function leverLabel(bits) {
  const on = LEVERS.filter((L, i) => bits[i] === '1').map(L => L.name.toLowerCase());
  return on.length ? on.join(' + ') : 'no levers';
}

function stream(sc, bits, card) {
  const col = $('#col-live');
  col.innerHTML = '<p class="col-head">' + esc(sc.title) + ' &mdash; this answer</p>';
  const user = document.createElement('div');
  user.className = 'bubble user';
  user.innerHTML = promptHtml(sc, bits.split('').map(Number), true);
  col.appendChild(user);

  const { wrap, typer } = responseNode(sc, bits, card, { withScore: true });
  col.appendChild(wrap);
  activeTyper = typer;
  typer.start();
}

function showEmpty() {
  $('#col-live').innerHTML =
    '<p class="col-head">The answer will appear here</p>' +
    '<p class="note">Leave all three levers <b>off</b> for the first run, press <b>Ask</b>, and read what a ' +
    'stranger says to a stranger. Then turn on <b>one</b> lever and ask again.</p>';
}

/* ----------------------------------------------- A4 the observation cue ----
   Names the thing to notice at the moment it becomes true, in the cue that
   belongs to the stage the learner is actually looking at. Also fills the A2
   Predict echo, so the prediction and the observation sit side by side. */
function announce(bits, card, termTotal, novelTotal) {
  const cue = $('#cue-' + (S.stage + 1));
  const st = S.stage;
  let msg = '';
  if (st === 0) {
    msg = bits[0] === '1'
      ? 'Context is on: this answer is aimed at one particular asker. Its length and its vocabulary follow the card dealt, not this lever.'
      : 'Context is off: nothing in this answer knows who asked. Turn on lever 1 and ask again.';
  } else if (st === 1) {
    msg = card
      ? 'No success spec, so a target card was dealt for you: “' + DATA.cards[card].label + '”. You were not asked.'
      : 'Success spec is on: no card was dealt. You said what finished looks like, so nothing had to guess.';
  } else {
    msg = 'This answer carries ' + termTotal + ' tagged expert term' + (termTotal === 1 ? '' : 's') +
      ', ' + novelTotal + ' of which you never typed.' +
      (bits[2] === '1' ? ' Now ask whether it got more useful, or just more impressive.' : '');
  }
  if (cue) { cue.textContent = msg; cue.classList.toggle('cue-warm', st === 1 && !!card); }

  const echo = $('#stage-' + (st + 1) + ' .echo');
  if (!echo) return;
  const chose = S.predictions[st];
  const labels = {
    length: 'how long it is', aim: 'who it is aimed at', words: 'which words it uses',
    none: 'nothing changes', filled: 'something else fills it in', ask: 'it asks you',
    low: 'under five', mid: 'about ten', high: 'fifteen or more'
  };
  /* F1 fix (R-the-stranger): each stage's prediction is about what its OWN
     lever does when pulled, so it can only be judged against an Ask that
     actually pulled that lever this time — never against whichever Ask
     happens to run first. `tested` mirrors the condition the cue above is
     already describing in prose for this same Ask (context ON; success spec
     OFF, i.e. a card was dealt; keywords ON), so cue and echo can never
     contradict each other. */
  const tested = st === 0 ? bits[0] === '1'
    : st === 1 ? !!card
    : bits[2] === '1';
  if (!tested) {
    if (chose) {
      const untested = {
        0: 'Not yet — this Ask had lever 1 off. Turn it on and ask again to see if you were right.',
        1: 'Not yet — this Ask had lever 2 on, so no card was dealt. Turn it off and ask again to see if you were right.',
        2: 'Not yet — this Ask had lever 3 off. Turn it on and ask again to see if you were right.'
      }[st];
      echo.innerHTML = '<b>You predicted:</b> ' + labels[chose] + '. ' + untested;
      echo.hidden = false;
    } else {
      echo.hidden = true;
    }
    return;
  }
  const truth = st === 0 ? 'aim' : st === 1 ? 'filled' : (termTotal >= 15 ? 'high' : termTotal >= 5 ? 'mid' : 'low');
  let txt = '<b>Observed:</b> ' + labels[truth] + '.';
  if (chose) {
    txt = '<b>You predicted:</b> ' + labels[chose] + '. ' + txt +
      (chose === truth ? ' Your prediction held.' : ' Not what you predicted — read the Takeaway.');
  }
  echo.innerHTML = txt;
  echo.hidden = false;
}

/* ------------------------------------------------------------ scoring ----- */
function addScoreStrip(wrap, sc, key) {
  if ($('.scorestrip', wrap)) return;
  const strip = document.createElement('div');
  strip.className = 'scorestrip';
  strip.innerHTML = '<span>Ask the room: how useful was that answer, 1&ndash;10?</span>' +
    Array.from({ length: 10 }, (_, i) => '<button class="sbtn" type="button" aria-pressed="false" data-score="' + (i + 1) + '">' + (i + 1) + '</button>').join('');
  strip.addEventListener('click', e => {
    const b = e.target.closest('[data-score]'); if (!b) return;
    $$('.sbtn', strip).forEach(x => x.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', 'true');
    recordScore(sc.id, key, +b.dataset.score);
  });
  $('.bubble.ai', wrap).appendChild(strip);
}
function recordScore(sid, key, score) {
  const bits = key.split('|')[0];
  const levers = bits.split('').filter(c => c === '1').length;
  const i = S.scores.findIndex(s => s.sid === sid && s.key === key);
  const row = { sid, key, levers, score, card: key.split('|')[1] || null };
  if (i >= 0) S.scores[i] = row; else S.scores.push(row);
  drawChart();
}

function drawChart() {
  const host = $('#chart'), W = 640, H = 300, m = { l: 44, r: 16, t: 16, b: 46 };
  if (!host) return;
  if (!S.scores.length) {
    host.innerHTML = '<p class="note">Nothing scored yet. Ask something, then tap a number under the answer.</p>';
    $('#score-list').innerHTML = '';
    return;
  }
  const x = v => m.l + (v / 3) * (W - m.l - m.r);
  const y = v => H - m.b - ((v - 1) / 9) * (H - m.t - m.b);
  let g = '';
  for (let k = 1; k <= 10; k += 3) {
    g += '<line x1="' + m.l + '" y1="' + y(k) + '" x2="' + (W - m.r) + '" y2="' + y(k) + '" stroke="#C6D1D8"/>' +
      '<text x="' + (m.l - 8) + '" y="' + (y(k) + 4) + '" fill="#65788A" font-size="11" text-anchor="end">' + k + '</text>';
  }
  for (let k = 0; k <= 3; k++) g += '<text x="' + x(k) + '" y="' + (H - m.b + 20) + '" fill="#65788A" font-size="11" text-anchor="middle">' + k + '</text>';
  g += '<text x="' + ((W + m.l) / 2) + '" y="' + (H - 6) + '" fill="#40556A" font-size="11" text-anchor="middle">levers pulled</text>';
  g += '<text x="14" y="' + (H / 2) + '" fill="#40556A" font-size="11" text-anchor="middle" transform="rotate(-90 14 ' + (H / 2) + ')">this room’s score</text>';

  const means = [];
  for (let k = 0; k <= 3; k++) {
    const set = S.scores.filter(s => s.levers === k);
    if (set.length) means.push([k, set.reduce((a, b) => a + b.score, 0) / set.length]);
  }
  if (means.length > 1) {
    g += '<polyline fill="none" stroke="#ECAC00" stroke-width="3" stroke-linejoin="round" points="' +
      means.map(([k, v]) => x(k) + ',' + y(v)).join(' ') + '"/>';
  }
  means.forEach(([k, v]) => { g += '<circle cx="' + x(k) + '" cy="' + y(v) + '" r="5.5" fill="#ECAC00"/>'; });
  const cols = ['#65788A', '#ECAC00', '#00A4E3', '#6C4BC4'];
  S.scores.forEach((s, i) => {
    const jx = x(s.levers) + ((i % 5) - 2) * 7;
    g += '<circle cx="' + jx + '" cy="' + y(s.score) + '" r="3.4" fill="' + cols[s.levers] + '" opacity=".85"/>';
  });
  host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="This room’s scores against levers pulled">' + g + '</svg>' +
    '<p class="note">Gold line: this room’s average at each number of levers.</p>';

  $('#score-list').innerHTML = '<table class="score-table"><thead><tr><th>question</th><th>levers</th><th>target card</th><th>score</th></tr></thead><tbody>' +
    S.scores.map(s => {
      const sc = DATA.scenarios.find(v => v.id === s.sid);
      return '<tr><td>' + esc(sc.tab) + '</td><td>' + leverLabel(s.key.split('|')[0]) + '</td><td>' +
        (s.card ? esc(DATA.cards[s.card].label) : '—') + '</td><td><b>' + s.score + '</b></td></tr>';
    }).join('') + '</tbody></table>';
}

/* ------------------------------------------------------------ compare ----- */
function pin() {
  if (!S.lastKey) return;
  S.pinned = { sid: scen().id, key: S.lastKey };
  renderPin();
}
function renderPin() {
  const col = $('#col-pin'), btn = $('#btn-compare');
  if (!S.pinned) {
    col.hidden = true; col.innerHTML = '';
    $('#answer-cols').classList.remove('compare');
    btn.setAttribute('aria-pressed', 'false'); btn.textContent = 'Pin to compare';
    return;
  }
  const sc = DATA.scenarios.find(v => v.id === S.pinned.sid);
  const [bits, card] = S.pinned.key.split('|');
  col.hidden = false;
  $('#answer-cols').classList.add('compare');
  btn.setAttribute('aria-pressed', 'true'); btn.textContent = 'Unpin this';
  col.innerHTML = '<p class="col-head">' + esc(sc.title) + ' &mdash; pinned</p>';
  const user = document.createElement('div');
  user.className = 'bubble user';
  user.innerHTML = promptHtml(sc, bits.split('').map(Number), true);
  col.appendChild(user);
  const { wrap } = responseNode(sc, bits, card || null, { instant: true });
  col.appendChild(wrap);
}

function setHighlight(v) {
  S.highlight = v;
  document.body.classList.toggle('hl', v);
  $$('[data-hl], #hl-btn').forEach(b => b.setAttribute('aria-pressed', String(v)));
}

/* -------------------------------------------------------------- closing --- */
function showClosing() {
  $('#close-line').textContent = DATA.closing.line;
  $('#close-sub').textContent = DATA.closing.sub;
  const byLever = [0, 1, 2, 3].map(k => {
    const set = S.scores.filter(s => s.levers === k);
    return set.length ? (set.reduce((a, b) => a + b.score, 0) / set.length) : null;
  });
  const stats = [
    ['answers heard', S.heard || '—'],
    ['average, no levers', byLever[0] == null ? '—' : byLever[0].toFixed(1)],
    ['average, all three', byLever[3] == null ? '—' : byLever[3].toFixed(1)],
    /* renamed from "expert words it handed you": nothing handed anything to
       anyone. Accuracy audit, section 1. */
    ['expert words in the answers you read', S.novelSeen || '—']
  ];
  $('#close-stats').innerHTML = stats.map(([k, v]) => '<div><b>' + v + '</b>' + k + '</div>').join('');
  $('#closing-slide').showModal();
}

/* ------------------------------------------------------------- wiring ----- */
function toggle(i) {
  S.bits[i] = S.bits[i] ? 0 : 1;
  renderLevers(); renderPrompt();
}

function wire() {
  $('#scenario-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-sc]'); if (!b) return;
    S.sc = +b.dataset.sc; S.forced = ''; S.lastCard = null; S.lastKey = null;
    showEmpty(); renderAll();
  });
  $('#levers').addEventListener('click', e => {
    const h = e.target.closest('[data-toggle]');
    if (h) { toggle(+h.dataset.toggle); return; }
    if (e.target.closest('#btn-replay') && S.lastCard) drawCard(S.lastCard, null);
  });
  $('#levers').addEventListener('change', e => {
    if (e.target.id === 'force-card') S.forced = e.target.value;
  });
  $('#prompt-box').addEventListener('click', e => { if (e.target.closest('[data-draft]')) $('#draft').showModal(); });
  $('#answer-cols').addEventListener('click', e => {
    if (e.target.closest('[data-draft]')) { $('#draft').showModal(); return; }
    if (e.target.closest('[data-hl]')) { setHighlight(!S.highlight); return; }
    if (e.target.closest('.bubble.ai') && activeTyper && !activeTyper.done) activeTyper.skip();
  });
  $('#btn-ask').addEventListener('click', ask);
  $('#btn-skip').addEventListener('click', () => activeTyper && activeTyper.skip());
  $('#btn-compare').addEventListener('click', () => { S.pinned ? (S.pinned = null, renderPin()) : pin(); });
  $('#btn-scoreboard').addEventListener('click', () => { drawChart(); $('#scoreboard').showModal(); });
  $('#btn-clear-scores').addEventListener('click', () => { S.scores = []; drawChart(); });
  $('#hl-btn').addEventListener('click', () => setHighlight(!S.highlight));
  $('#closing-btn').addEventListener('click', () => { const s = $('#settings'); if (s.open) s.close(); showClosing(); });

  /* A2: the prediction is captured, so the observed result can be echoed
     beside it rather than merely asserted in prose. */
  $$('.predict-opts').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('.predict-opt'); if (!b) return;
    $$('.predict-opt', g).forEach(x => x.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', 'true');
    S.predictions[+g.dataset.predict] = b.dataset.v;
  }));

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;   /* the shell owns Escape */
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const k = e.key;
    if (['1', '2', '3'].includes(k)) { toggle(+k - 1); e.preventDefault(); return; }
    if (k === '0') { S.bits = [0, 0, 0]; renderLevers(); renderPrompt(); return; }
    if (k === '9') { S.bits = [1, 1, 1]; renderLevers(); renderPrompt(); return; }
    if (k === 'Enter') { ask(); e.preventDefault(); return; }
    if (k === ' ') { if (activeTyper) activeTyper.skip(); e.preventDefault(); return; }
    const l = k.toLowerCase();
    if (l === 'h') setHighlight(!S.highlight);
    if (l === 'r' && S.lastCard) drawCard(S.lastCard, null);
    if (l === 'p') S.pinned ? (S.pinned = null, renderPin()) : pin();
  });
}

/* ---- the shell's two events ----------------------------------------------
   `stagechange` is treated as a CHROME event only, per ADOPTING.md section 4
   step 7: the shell's reset calls selectStage(0) — firing stagechange — BEFORE
   it dispatches `lessonreset`, so anything here that rendered activity STATE
   would paint the pre-reset state into freshly reset chrome (missing-time hit
   exactly that). Moving the activity host and re-marking which lever the stage
   is about are both derived from the stage index alone, never from S's
   activity fields, so they are safe either way — and the resetting flag makes
   that explicit rather than relying on the reader to check. */
window.lessonShell.onReset = () => { S.resetting = true; return true; };

document.addEventListener('stagechange', e => {
  S.stage = e.detail.index;
  const host = $('#host-' + (S.stage + 1));
  const act = $('#activity');
  if (host && act && act.parentNode !== host) host.appendChild(act);
  if (!S.resetting) renderLevers();       /* re-marks .focus-lever only */
});

/* ---- Reset: the activity's half of the contract --------------------------
   Enumerated before it was written, per ADOPTING.md. The shell restores what
   the kit named — tabs, check cards, .echo, .obs-cue, the drawer, the dialogs,
   and stage 1 — and dispatches this LAST, so the demo has the final word.

   THE ENUMERATION, in ADOPTING.md's own order:
     1. every property of S           -> replaced wholesale from INITIAL, with
                                         the three mutable containers rebuilt
                                         rather than shared with INITIAL
     2. every hidden/class/dataset    -> #col-pin hidden, .compare removed,
                                         body.hl, aria-pressed on the
                                         highlighter, the predict groups and
                                         the score strips
     3. every innerHTML-filled node   -> #col-live (back to showEmpty),
                                         #col-pin, #levers, #prompt-box,
                                         #scenario-tabs, #chart, #score-list
     4. every form control            -> #force-card back to Random, and it is
                                         re-rendered rather than assigned,
                                         because renderLevers rebuilds it
     5. every <details> generated     -> none; this demo generates none
     6. anything appended or MOVED    -> #activity is moved back into #host-1.
                                         The shell's selectStage(0) already
                                         fired stagechange, which moved it, but
                                         this does not rely on that ordering
   The typewriter's animation frame and the card timer are cancelled first, so
   nothing lands in the DOM after the restore. */
document.addEventListener('lessonreset', () => {
  if (activeTyper && !activeTyper.done) activeTyper.skip();
  activeTyper = null;
  dismissCard();

  Object.assign(S, INITIAL, { bits: [0, 0, 0], scores: [], predictions: {} });

  const host = $('#host-1'), act = $('#activity');
  if (host && act && act.parentNode !== host) host.appendChild(act);

  setHighlight(false);
  $$('.predict-opt').forEach(b => b.setAttribute('aria-pressed', 'false'));
  renderPin();
  showEmpty();
  renderAll();
  drawChart();
  S.resetting = false;
});

/* Presentation mode is the kit's. The activity only needs to know that the
   presenter tools came or went, and CSS does that; this listener exists so a
   score strip appears under an answer that was streamed before the switch. */
document.addEventListener('presentationchange', () => {
  if (S.lastKey && !$('.scorestrip', $('#col-live'))) {
    const wrap = $('#col-live .bubble.ai');
    if (wrap && wrap.parentNode) addScoreStrip(wrap.parentNode, scen(), S.lastKey);
  }
});

/* ------------------------------------------------------------- start ------ */
$('#draft-body').innerHTML = DATA.draft.map(p => '<p>' + esc(p) + '</p>').join('');
$('#draft-title').textContent = DATA.draftTitle;
/* The activity begins in stage 1's host. The shell has already run, so if a
   #stage-N hash selected another stage, stagechange has fired and moved it. */
const bootHost = $('#host-' + (S.stage + 1));
if (bootHost) bootHost.appendChild($('#activity'));
renderAll();
showEmpty();
drawChart();
wire();

/* The playtest harness drives the activity through every state. */
window.__stranger = {
  S, DATA, ask, toggle, showEmpty, recordScore, pin, setHighlight, drawCard,
  renderAll, drawChart, showClosing, renderPin,
  unpin() { S.pinned = null; renderPin(); },
  get typer() { return activeTyper; },
  set(i, bits, card) { S.sc = i; S.bits = bits.split('').map(Number); S.forced = card || ''; renderAll(); }
};
