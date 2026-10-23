/* ==========================================================================
   AI Tool Guide (folder: front-doors) — the application.

   Retrofitted onto lesson-shell v2. Three stages, mapped from the original
   three acts:
     1  The four doors — four surfaces against four axes, sixteen cells.
     2  Pick a job — seven realistic faculty tasks against the same four
        doors, with the smallest sufficient door computed rather than typed,
        and a captured before-the-reveal prediction.
     3  The receipts — what already changed, what was rechecked and held,
        what will rot, the uneven row, the cut list and every source.

   The shell owns the header, stage tablist, dialogs (Guide/Settings/Details/
   Presenter Notes), presentation mode, the A6 check cards and Reset's chrome
   restoration. This file owns the activity: it listens for `stagechange`
   (chrome only — never render activity state from it, see ADOPTING.md §4
   step 7) and `lessonreset` (required; restores every piece of this demo's
   own state) and drives its own per-cell/per-door drill-down dialog,
   `#item-details`, which is distinct from the shell's per-stage `#details`
   drawer (ADOPTING.md §5).

   No framework and no network. Every derived number comes from engine.js, so
   the screen, the shipped test suite and the self-test button cannot disagree
   about what the data says.
   ========================================================================== */

(() => {

const D = DATA, E = ENGINE;
const $  = s => document.querySelector(s);
const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));

const S = {
  job: null,           /* Act II: which job is selected */
  predictAxis: null,   /* stage 1 predicted "not a staircase" axis */
  predictDoor: null,   /* stage 2 predicted door for the CURRENT job; reset per job */
  predictChanged: null /* stage 3 predicted change count */
};

/* ---------------------------------------------------------------- helpers */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** A source chip. Every claim on screen gets at least one; the self-test
 *  proves the id resolves, and a broken id is loud rather than silent. */
function srcChip(id, label) {
  const s = D.SOURCES[id];
  const a = el('a', 'src');
  if (!s) { a.textContent = 'source missing: ' + id; a.classList.add('bad'); return a; }
  a.href = s.u; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.textContent = label || 'source';
  a.title = s.t;
  return a;
}

/* --------------------------------------------------------------------------
   The honesty machinery. This demo's own three words — verified / reasoned /
   unconfirmed — predate the fleet's six-word provenance vocabulary and map
   onto it directly (orchestrator ruling, 2026-09-15: Reasoned was added to
   the six specifically because of this demo's own-judgement verdicts):

     verified    -> Sourced, qualified "verified <check date>"
     reasoned    -> Reasoned (the words already coincide)
     unconfirmed -> Sourced, qualified "unconfirmed" — an unconfirmed cell
                    still rests on a real page (Google's own admin docs, for
                    the uneven row); it is not invented, so it is not
                    Illustrative, and "unconfirmed" is a qualifier riding on
                    Sourced, never a label of its own.

   Both words are kept on screen: sixLabel() names the kicker, confWord()
   names the demo's own original word as the qualifier, so nothing already
   written is lost and every claim also carries the fleet's vocabulary. */
function sixLabel(conf) {
  if (conf === 'reasoned') return { cls: 'k-reasoned', text: 'Reasoned', qual: null };
  if (conf === 'unconfirmed') return { cls: 'k-sourced', text: 'Sourced', qual: 'unconfirmed' };
  return { cls: 'k-sourced', text: 'Sourced', qual: 'verified ' + D.CHECKED_ON };
}

/** A fleet-vocabulary kicker: <span class="panel-kicker"><span class="k-...">
 *  Word</span><span class="k-qual">...</span></span>. Use wherever a claim
 *  needs its provenance on the face of the page (A3). */
function kicker(conf) {
  const s = sixLabel(conf);
  const wrap = el('span', 'panel-kicker');
  wrap.appendChild(el('span', s.cls, s.text));
  if (s.qual) wrap.appendChild(el('span', 'k-qual', s.qual));
  return wrap;
}

/** The demo's own word, standalone — used where a compact badge (a grid
 *  cell footer) needs the original vocabulary without the full kicker. */
function confWord(conf) {
  return el('span', 'conf-word', conf);
}

/** A four-segment meter. Decorative — the words are in the cell and in the
 *  button's accessible name, so this is aria-hidden. */
function meter(bar) {
  const w = el('span', 'bar');
  w.setAttribute('aria-hidden', 'true');
  for (let i = 1; i <= 4; i++) w.appendChild(el('i', i <= bar ? 'on' : null));
  return w;
}

function sourceRow(ids, extraText) {
  const row = el('div', 'src-row');
  if (extraText) row.appendChild(el('span', 'src-title', extraText));
  (ids || []).forEach(id => {
    const s = D.SOURCES[id];
    row.appendChild(srcChip(id, s ? shortHost(s.u) : undefined));
  });
  return row;
}

/** The host, trimmed, so a chip says where it goes without a wall of URL. */
function shortHost(u) {
  const h = (String(u).split('://')[1] || '').split('/')[0];
  return h.replace(/^www\./, '');
}

function paras(parent, list) {
  (list || []).forEach(p => parent.appendChild(el('p', null, p)));
}

/* ============================= STAGE 1 ===================================
   The four doors. One piece of markup, two layouts. app.js stamps --col and
   --row on every grid child; the stylesheet uses them only above 940px,
   where the two wrapper divs collapse with `display: contents` and the
   children become items of a real five-column grid. Below that the wrappers
   are cards and the custom properties are simply ignored.
   ---------------------------------------------------------------------- */

function place(node, col, row) {
  node.style.setProperty('--col', String(col));
  node.style.setProperty('--row', String(row));
  return node;
}

function renderGrid() {
  const g = $('#grid');
  g.innerHTML = '';

  const rail = el('div', 'g-rail');
  rail.appendChild(place(el('div', 'g-corner', 'The four doors'), 1, 1));
  D.AXES.forEach((axis, i) => {
    const a = place(el('div', 'g-axis'), 1, i + 2);
    a.dataset.axis = axis.id;
    a.appendChild(el('span', 'a-n', 'Axis ' + axis.n));
    a.appendChild(el('span', 'a-q', axis.q));
    a.appendChild(el('span', 'a-lead', axis.lead));
    rail.appendChild(a);
  });
  g.appendChild(rail);

  D.DOORS.forEach((door, j) => {
    const group = el('div', 'g-group');
    group.dataset.door = door.id;

    const h = place(el('button', 'g-door'), j + 2, 1);
    h.type = 'button';
    h.dataset.door = door.id;
    h.appendChild(el('span', 'd-n', 'Door ' + door.n));
    h.appendChild(el('span', 'd-name', door.name));
    h.appendChild(el('span', 'd-prod', door.products));
    h.appendChild(el('span', 'd-more', 'What it is →'));
    h.setAttribute('aria-label',
      'Door ' + door.n + ', ' + door.name + '. ' + door.products + '. Open the details.');
    h.addEventListener('click', () => openDoor(door));
    group.appendChild(h);

    D.AXES.forEach((axis, i) => {
      const c = E.cell(D, door.id, axis.id);
      const b = place(el('button', 'g-cell'), j + 2, i + 2);
      b.type = 'button';
      b.dataset.door = door.id;
      b.dataset.axis = axis.id;
      b.appendChild(el('span', 'c-axis', axis.short));
      b.appendChild(el('span', 'c-head', c ? c.head : 'no cell'));
      const foot = el('div', 'c-foot');
      foot.appendChild(meter(c ? c.bar : 0));
      if (c) { foot.appendChild(kicker(c.conf)); }
      b.appendChild(foot);
      b.setAttribute('aria-label',
        axis.q + ' Door ' + door.n + ', ' + door.name + ': ' + (c ? c.head : '') +
        '. Level ' + (c ? c.bar : 0) + ' of 4. Open the explanation.');
      b.addEventListener('click', () => { openCell(door, axis); noteCheckObserved(door, axis, c); });
      group.appendChild(b);
    });

    g.appendChild(group);
  });
}

/** A4 observation cue for stage 1: fires when the learner opens a "you
 *  check" (row 4) cell — the moment the non-staircase row is actually in
 *  front of them. */
function noteCheckObserved(door, axis, c) {
  if (axis.id !== 'check' || !c) return;
  const cue = $('#cue-1');
  if (!cue) return;
  cue.textContent = 'Row 4 for door ' + door.n + ' (' + door.name.toLowerCase() + '): ' + c.head +
    '. Compare that to how far this door reaches on rows 1–3.';
}

/** The exception panel. Its content is COMPUTED from the bars, so it cannot
 *  describe an ordering the data no longer has. */
function renderCheckNote() {
  const box = $('#check-note');
  box.innerHTML = '';
  box.appendChild(el('h3', null, D.CHECK_NOTE.head));
  paras(box, D.CHECK_NOTE.body);

  const ex = E.checkExceptions(D);
  const line = el('p', 'help');
  if (!ex.length) {
    line.textContent = 'As the data currently stands there is no exception: every door’s review burden matches its reach. If you are reading this, the dataset changed and the paragraphs above are stale.';
  } else {
    line.textContent = 'Computed from the bars above, not typed here: ' +
      ex.map(r => {
        const door = D.DOORS.find(d => d.id === r.id);
        return 'door ' + r.n + ' (' + door.name.toLowerCase() + ') reaches at level ' +
               r.reach + ' but is checked at level ' + r.check;
      }).join('; ') + '.';
  }
  box.appendChild(line);
  const kr = el('div', 'src-row');
  kr.appendChild(kicker('reasoned'));
  box.appendChild(kr);
  box.appendChild(sourceRow(D.CHECK_NOTE.src, 'The verified facts this ordering rests on:'));
}

function renderAxisNote() {
  const box = $('#axis-note');
  box.innerHTML = '';
  box.appendChild(el('h3', null, 'How to read the bars'));
  box.appendChild(el('p', null, D.AXIS_NOTE));
  const ul = el('ul', 'ht-acts');
  D.AXES.forEach(axis => {
    const li = el('li');
    li.appendChild(el('b', null, axis.short + ' — '));
    li.appendChild(document.createTextNode(axis.bars.map((b, i) => (i + 1) + ': ' + b).join(' · ')));
    ul.appendChild(li);
  });
  box.appendChild(ul);
}

/* ------------------------------------------------- stage 1 predict card */

function wirePredictAxis() {
  const group = $('#predict-axis');
  if (!group) return;
  $$('.predict-opt', group).forEach(btn => btn.addEventListener('click', () => {
    S.predictAxis = btn.dataset.axis;
    $$('.predict-opt', group).forEach(b => { b.classList.toggle('chosen', b === btn); b.disabled = true; });
    const echo = $('#echo-1');
    const correct = 'check';
    const axisName = { see: 'Sees', do: 'Does', keep: 'Keeps going', check: 'You check' }[btn.dataset.axis];
    echo.hidden = false;
    if (btn.dataset.axis === correct) {
      echo.classList.add('match'); echo.classList.remove('miss');
      echo.textContent = 'You guessed ' + axisName + ' — right. Rows 1–3 were chosen to rise; row 4 was not, and it does not.';
    } else {
      echo.classList.add('miss'); echo.classList.remove('match');
      echo.textContent = 'You guessed ' + axisName + '. It is actually “You check” (row 4) that breaks the staircase — open the row-4 note below to see why.';
    }
  }));
}

/* ---------------------------------------------------- the detail sheets */

function openItemDetails(title, sub, build) {
  $('#item-details-title-text').textContent = title;
  $('#item-details-sub').textContent = sub;
  const body = $('#item-details-body');
  body.innerHTML = '';
  build(body);
  const dlg = $('#item-details');
  dlg.showModal();
  const head = $('.lesson-dialog-head button', dlg);
  if (head) head.focus();
}

function openCell(door, axis) {
  const c = E.cell(D, door.id, axis.id);
  openItemDetails(door.name, 'Door ' + door.n + ' · ' + axis.q, body => {
    body.appendChild(el('div', 'd-axis', 'Axis ' + axis.n + ' — ' + axis.short));
    const h = el('h3', null, c ? c.head : 'No cell');
    body.appendChild(h);

    if (c) {
      const bar = el('div', 'd-bar');
      bar.appendChild(meter(c.bar));
      bar.appendChild(el('span', 'd-bar-text',
        'Level ' + c.bar + ' of 4 — ' + (E.barText(D, axis.id, c.bar) || '')));
      body.appendChild(bar);

      body.appendChild(el('p', null, c.why));

      if (c.quote) {
        const q = el('blockquote', 'quote', '“' + c.quote + '”');
        body.appendChild(q);
        const attrib = D.SOURCES[c.quoteSrc];
        if (attrib) body.appendChild(el('p', 'help', '— ' + attrib.t));
      }

      const cr = el('div', 'src-row');
      cr.appendChild(kicker(c.conf));
      cr.appendChild(confWord(c.conf));
      cr.appendChild(el('span', 'src-title', D.CONF_LABEL[c.conf] || ''));
      body.appendChild(cr);
      body.appendChild(sourceRow(c.src, 'Checked against:'));
    }
  });
}

/** Door-level prose (blurb/where/costText/confusable). The pre-build audit's
 *  structural finding: the sixteen grid cells each carry a kicker but this
 *  sheet, where the uncertain Codex claim actually lives, carried none at
 *  all. Every claim-bearing block below now opens with one. */
function openDoor(door) {
  openItemDetails(door.name, 'Door ' + door.n + ' · ' + door.tag, body => {
    body.appendChild(el('p', 'lead', door.blurb));

    body.appendChild(el('div', 'd-axis', 'Where it lives'));
    const whereClaim = el('div', 'claim');
    whereClaim.appendChild(kicker('verified'));
    whereClaim.appendChild(el('p', null, door.where));
    body.appendChild(whereClaim);
    if (door.whereSrc) body.appendChild(sourceRow(door.whereSrc));

    body.appendChild(el('div', 'd-axis', 'Products, on the check date'));
    body.appendChild(el('p', null, door.products));

    body.appendChild(el('div', 'd-axis', 'What it costs you to get in'));
    const costClaim = el('div', 'claim');
    costClaim.appendChild(kicker('verified'));
    costClaim.appendChild(el('p', null, door.costText));
    body.appendChild(costClaim);
    body.appendChild(el('p', 'help', 'No figures on this page on purpose — prices on all four doors moved more than once in the last year. Ask your own IT department what your institution already has; that answer beats any vendor page.'));
    if (door.costSrc) body.appendChild(sourceRow(door.costSrc));

    if (door.confusable) {
      body.appendChild(el('hr', 'hr'));
      body.appendChild(el('div', 'd-axis', 'Easy to mix up'));
      const confusableClaim = el('div', 'claim');
      /* Door 4's confusable text is where the demo's top misleading risk
         lives (the Codex web/mobile claim, re-verified in a real browser on
         RECHECKED_ON) — a Reasoned kicker would understate it as inference;
         it is a verified vendor statement, checked twice now. */
      confusableClaim.appendChild(kicker('verified'));
      confusableClaim.appendChild(el('p', null, door.confusable));
      body.appendChild(confusableClaim);
      if (door.confusableSrc) body.appendChild(sourceRow(door.confusableSrc));
    }

    body.appendChild(el('hr', 'hr'));
    body.appendChild(el('div', 'd-axis', 'This door on the four axes'));
    D.AXES.forEach(axis => {
      const c = E.cell(D, door.id, axis.id);
      if (!c) return;
      const item = el('div', 'source-item');
      const t = el('span', 'src-title');
      t.textContent = axis.short + ': ' + c.head;
      item.appendChild(meter(c.bar));
      item.appendChild(t);
      body.appendChild(item);
    });
  });
}

/* ============================= STAGE 2 ===================================
   Pick a job.
   ---------------------------------------------------------------------- */

function renderJobPicker() {
  const box = $('#job-picker');
  box.innerHTML = '';
  D.JOBS.forEach((job, i) => {
    const b = el('button', 'job-btn');
    b.type = 'button';
    b.dataset.job = job.id;
    b.appendChild(el('span', 'j-n', 'Job ' + (i + 1)));
    b.appendChild(el('span', 'j-name', job.name));
    b.addEventListener('click', () => pickJob(job.id));
    box.appendChild(b);
  });
}

function pickJob(id) {
  S.job = id;
  S.predictDoor = null; /* a fresh job is a fresh prediction, made before the reveal */
  $$('#job-picker .job-btn').forEach(b => b.classList.toggle('on', b.dataset.job === id));
  renderPredictDoor();
  renderJob();
}

/** The Predict card for stage 2: a door guess captured BEFORE the computed
 *  reveal (A2 — "which door finishes this job?" before the computed answer,
 *  Act II's natural predict-observe-explain). Rendered fresh per job so a
 *  previous job's guess never leaks into a new one; a guess already made for
 *  THIS job (after Reset put it back, or on revisiting) is not restored —
 *  every job selection is a fresh prediction opportunity. */
function renderPredictDoor() {
  const group = $('#predict-door');
  if (!group || !S.job) { if (group) group.hidden = true; return; }
  group.hidden = false;
  $$('.predict-opt', group).forEach(b => { b.classList.remove('chosen'); b.disabled = false; });
  const echo = $('#echo-2');
  echo.hidden = true; echo.textContent = '';
  $$('.predict-opt', group).forEach(btn => {
    btn.onclick = () => {
      S.predictDoor = btn.dataset.door;
      $$('.predict-opt', group).forEach(b => { b.classList.toggle('chosen', b === btn); b.disabled = true; });
      renderJob(); /* reveal, now that a guess is locked in */
    };
  });
}

function renderJob() {
  const out = $('#job-out');
  out.innerHTML = '';
  const job = E.jobById(D, S.job);
  if (!job) { out.classList.add('empty'); return; }

  /* Hold the reveal until a prediction is captured, unless one already was
     for this job this session (e.g. after opening a different job and back). */
  if (!S.predictDoor) { out.classList.add('empty'); return; }
  out.classList.remove('empty');

  const head = el('div', 'j-head');
  head.appendChild(el('h2', null, job.name));
  head.appendChild(el('p', 'j-detail', job.detail));
  out.appendChild(head);

  if (job.caution) {
    const c = el('div', 'j-caution');
    c.appendChild(el('b', null, 'Before you pick a door: '));
    c.appendChild(document.createTextNode(job.caution));
    out.appendChild(c);
  }

  const best = E.bestDoor(D, job);
  const t = E.tally(D, job);

  /* The predict echo: your guess vs the computed answer, side by side. */
  const guessedDoor = D.DOORS.find(d => d.id === S.predictDoor);
  const echo = $('#echo-2');
  if (echo && guessedDoor) {
    echo.hidden = false;
    const matched = best && best.id === guessedDoor.id;
    echo.classList.toggle('match', !!matched);
    echo.classList.toggle('miss', !matched);
    echo.textContent = 'You guessed Door ' + guessedDoor.n + '. ' +
      (best
        ? 'The smallest door that does the whole job is Door ' + best.n + ' — ' + best.name + '.' +
          (matched ? ' Matched your guess.' : ' Different from your guess — read why below.')
        : 'No door on this page does the whole job on its own.');
    const cue = $('#cue-2');
    if (cue) cue.textContent = echo.textContent;
  }

  const bb = el('div', 'j-best');
  bb.appendChild(el('span', 'b-lbl', 'Smallest door that does the whole job'));
  if (best) {
    bb.appendChild(el('span', 'b-door', 'Door ' + best.n + ' — ' + best.name));
    const hand = job.doors[best.id].hand;
    bb.appendChild(el('span', 'b-note',
      (hand ? 'And what it costs you: ' + hand + '.' : 'And it costs you nothing beyond the text itself.') +
      ' ' + t.yes + ' of ' + D.DOORS.length + ' doors can do the whole job; ' +
      t.partly + ' can do part of it; ' + t.no + ' cannot.'));
  } else {
    bb.appendChild(el('span', 'b-door', 'None of the four'));
    bb.appendChild(el('span', 'b-note', 'No door on this page does the whole job on its own.'));
  }
  out.appendChild(bb);

  const doors = el('div');
  doors.id = 'job-doors';
  D.DOORS.forEach(door => {
    const v = E.verdict(D, job, door.id);
    if (!v) return;
    const card = el('div', 'jd v-' + v.v + (best && best.id === door.id ? ' is-best' : ''));
    const top = el('div', 'jd-top');
    top.appendChild(el('span', 'jd-n', 'Door ' + door.n));
    top.appendChild(el('span', 'jd-v', D.VERDICT_LABEL[v.v]));
    top.appendChild(el('span', 'jd-name', door.name));
    card.appendChild(top);
    card.appendChild(el('p', 'jd-why', v.why));
    const axis = D.AXES.find(a => a.id === v.axis);
    card.appendChild(el('span', 'jd-axis', 'Decided by axis ' + (axis ? axis.n + ' — ' + axis.short : v.axis)));
    const hand = el('p', 'jd-hand');
    if (v.v === 'no') {
      hand.appendChild(el('b', null, 'Nothing to hand over — '));
      hand.appendChild(document.createTextNode('there is no amount of access that makes this door do this job.'));
    } else {
      hand.appendChild(el('b', null, 'You hand over: '));
      hand.appendChild(document.createTextNode(v.hand || 'nothing beyond the text itself.'));
    }
    card.appendChild(hand);
    doors.appendChild(card);
  });
  out.appendChild(doors);

  /* The "reasoned, not quoted" disclosure sits BESIDE the verdicts it
     describes, not below the whole card stack — the pre-build audit's
     finding that Act II's cards visually resemble Act I's sourced grid
     while the disclosure sat well below them (split-attention risk). */
  const note = el('div', 'panel warn');
  note.appendChild(el('h3', null, 'These verdicts are reasoned, not quoted'));
  const kr = el('div', 'src-row');
  kr.appendChild(kicker('reasoned'));
  note.appendChild(kr);
  note.appendChild(el('p', null, 'No vendor page says anything about eighty student reflections. Every verdict above is an inference from the sourced capabilities in Stage 1 — which is why each one names the axis that decided it, so you can check the reasoning rather than trust the answer.'));
  out.insertBefore(note, doors);
}

function renderJobsNote() {
  const box = $('#jobs-note');
  box.innerHTML = '';
  const spread = E.bestDoorSpread(D);
  const low = E.jobsSolvedLow(D);
  box.appendChild(el('h3', null, 'What this list is not'));
  box.appendChild(el('p', null, D.JOBS_NOTE));
  box.appendChild(el('p', 'help',
    'Counted from the verdicts, not asserted: of ' + D.JOBS.length + ' jobs, the smallest sufficient door is ' +
    D.DOORS.map(d => 'door ' + d.n + ' for ' + spread[d.n]).join(', ') + '. ' +
    low.length + ' of the ' + D.JOBS.length + ' are done completely by a chat window or by the agent already inside your word processor.'));
}

/* ============================= STAGE 3 ===================================
   The receipts.
   ---------------------------------------------------------------------- */

/** Both "What already changed" and "What was rechecked and held" render as
 *  an accordion of buttons: pressing one opens its quote+source and fires
 *  the A4 observation cue (Try = "press any entry"). */
function renderChangeCard(entry, kind) {
  const c = el('div', 'chg');
  const toggle = el('button', 'chg-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');

  if (kind === 'changed') {
    const move = el('div', 'c-move');
    move.appendChild(el('span', 'c-was', entry.was));
    move.appendChild(el('span', 'c-arrow', '→'));
    move.appendChild(el('span', 'c-now', entry.now));
    toggle.appendChild(move);
    toggle.appendChild(el('div', 'c-what', entry.what));
  } else {
    toggle.appendChild(el('p', 'c-claim', entry.claim));
  }
  toggle.appendChild(kicker(entry.conf));

  const body = el('div', 'chg-body');
  body.hidden = true;
  body.appendChild(el('p', 'c-body', entry.body));
  if (entry.quote) body.appendChild(el('blockquote', 'quote', '“' + entry.quote + '”'));
  const row = sourceRow(entry.src);
  body.appendChild(row);

  toggle.addEventListener('click', () => {
    const open = body.hidden;
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      const cue = $('#cue-3');
      const label = kind === 'changed' ? (entry.was + ' → ' + entry.now) : entry.claim;
      if (cue) cue.textContent = (kind === 'changed' ? 'Changed: ' : 'Rechecked and held: ') + label +
        ' — checked ' + (kind === 'changed' ? D.CHECKED_ON : D.RECHECKED_ON) + '.';
    }
  });

  c.appendChild(toggle);
  c.appendChild(body);
  return c;
}

function renderChanged() {
  const box = $('#changed');
  box.innerHTML = '';
  box.appendChild(el('h3', null, 'What already changed'));
  D.CHANGED.forEach(ch => box.appendChild(renderChangeCard(ch, 'changed')));
  box.appendChild(el('p', 'help', D.CHANGED_NOTE));
}

/** Symmetric evidence's other half: a claim that could have gone stale and
 *  did not, given the same visible treatment as a claim that did. */
function renderRechecked() {
  const box = $('#rechecked');
  if (!box) return;
  box.innerHTML = '';
  box.appendChild(el('h3', null, 'What was rechecked and held'));
  (D.RECHECKED || []).forEach(r => box.appendChild(renderChangeCard(r, 'rechecked')));
  box.appendChild(el('p', 'help', D.RECHECKED_NOTE));
}

function wirePredictChanged() {
  const group = $('#predict-changed');
  if (!group) return;
  $$('.predict-opt', group).forEach(btn => btn.addEventListener('click', () => {
    S.predictChanged = Number(btn.dataset.n);
    $$('.predict-opt', group).forEach(b => { b.classList.toggle('chosen', b === btn); b.disabled = true; });
    const actual = D.CHANGED.filter(c => /Agent Mode|ChatGPT agent/i.test(c.was)).length;
    const echo = $('#echo-3');
    echo.hidden = false;
    const matched = S.predictChanged === actual;
    echo.classList.toggle('match', matched);
    echo.classList.toggle('miss', !matched);
    echo.textContent = 'You guessed ' + S.predictChanged + '. ' + actual + ' of the four doors had a product renamed or retired by a vendor in that window (Word’s “Agent Mode” and OpenAI’s “ChatGPT agent”) — the third entry below is this module’s own drafting mistake about itself, not a vendor change.';
  }));
}

function renderStale() {
  const box = $('#stale');
  box.innerHTML = '';
  box.appendChild(el('h3', null, D.STALE.head));
  const cols = el('div', 'cols2');

  const rot = el('div');
  rot.appendChild(el('div', 'lbl', 'Expect these to be wrong'));
  const ul1 = el('ul', 'slist rot');
  D.STALE.rot.forEach(s => ul1.appendChild(el('li', null, s)));
  rot.appendChild(ul1);

  const keep = el('div');
  keep.appendChild(el('div', 'lbl', 'Expect these to hold'));
  const ul2 = el('ul', 'slist keep');
  D.STALE.keep.forEach(s => ul2.appendChild(el('li', null, s)));
  keep.appendChild(ul2);

  cols.appendChild(rot);
  cols.appendChild(keep);
  box.appendChild(cols);
}

function renderUneven() {
  const box = $('#uneven');
  box.innerHTML = '';
  box.appendChild(el('h3', null, D.UNEVEN.head));
  box.appendChild(el('p', null, D.UNEVEN.body));
  if (D.UNEVEN.quote) box.appendChild(el('blockquote', 'quote', '“' + D.UNEVEN.quote + '”'));
  box.appendChild(el('p', 'help', D.UNEVEN.note));
  const row = sourceRow(D.UNEVEN.src);
  row.insertBefore(kicker(D.UNEVEN.conf), row.firstChild);
  box.appendChild(row);
}

function renderCut() {
  const box = $('#cut');
  box.innerHTML = '';
  box.appendChild(el('h3', null, 'Researched, and deliberately not on the page (' + D.CUT.length + ')'));
  box.appendChild(el('p', 'help', 'What a page refuses to say is part of what it is claiming. Each of these was looked into during the build and left off, with the reason.'));
  D.CUT.forEach(c => {
    const item = el('div', 'cut-item');
    item.appendChild(el('b', null, c.claim));
    item.appendChild(el('span', null, c.why));
    box.appendChild(item);
  });
}

function renderSources() {
  const box = $('#sources');
  box.innerHTML = '';
  const ids = Object.keys(D.SOURCES);
  box.appendChild(el('h3', null, 'Every source (' + ids.length + ')'));
  box.appendChild(el('p', 'help', D.SOURCE_NOTE));
  ids.forEach(id => {
    const s = D.SOURCES[id];
    const item = el('div', 'source-item');
    item.appendChild(srcChip(id, shortHost(s.u)));
    item.appendChild(el('span', 'src-title', s.t));
    /* The date THIS page was last opened, per source (2026-09-16 review: one
       shared constant had re-dated pages nobody re-opened). */
    if (s.checked) item.appendChild(el('span', 'k-qual', 'opened ' + s.checked));
    box.appendChild(item);
  });
}

function renderCounts() {
  const c = E.counts(D);
  const box = $('#counts');
  box.innerHTML = '';
  box.appendChild(el('h3', null, 'This page, in numbers'));
  box.appendChild(el('p', null,
    c.doors + ' doors against ' + c.axes + ' axes is ' + c.gridCells + ' cells, of which ' +
    c.verifiedCells + ' are verified against a first-party page and ' + c.reasonedCells +
    ' are labelled as reasoning. ' + c.jobs + ' jobs against the same ' + c.doors +
    ' doors is another ' + c.jobCells + ' judgements, all of them reasoned from those cells. ' +
    c.sources + ' sources, ' + c.changed + ' product names that already moved, and ' +
    c.cut + ' things researched and left off.'));
  box.appendChild(el('p', 'help', 'Every number in that paragraph is read out of the dataset at page load, and the shipped test suite fails the build if any of them disagrees with README.md, the presenter guide or the manifest.'));
}

/* ============================ stagechange ================================
   Chrome only, per ADOPTING.md §4 step 7: the shell fires `stagechange`
   during Reset BEFORE `lessonreset`, so a handler that renders activity
   state here would resurrect the pre-reset state into freshly reset chrome.
   This demo needs no per-stage build step — every stage's content is
   already rendered once at boot — so the handler does nothing but exists to
   document that fact rather than leave the question open.
   ---------------------------------------------------------------------- */
document.addEventListener('stagechange', () => { /* chrome-only; nothing to (re)build per stage */ });

/* ================================ reset ==================================
   Required (ADOPTING.md §4). Enumerated rather than asserted:
     - S.job, S.predictAxis, S.predictDoor, S.predictChanged -> initial values
     - the job picker's .on class, the predict button groups' .chosen/disabled
     - the three .echo spans -> hidden, cleared
     - #job-out -> empty (re-render with no job)
     - #cue-1 / #cue-2 / #cue-3 -> cleared
     - every .chg-body accordion -> closed
     - the self-test output -> the shell clears #selftest-out only if we
       clear it; it is ours, so we do
   The shell has already, by the time this fires: closed every dialog
   (including #item-details), returned the stage tabs and A6 check cards to
   first load, and moved to stage 1. Presentation mode is untouched, as
   contracted.
   ---------------------------------------------------------------------- */
function resetActivity() {
  S.job = null;
  S.predictAxis = null;
  S.predictDoor = null;
  S.predictChanged = null;

  $$('#job-picker .job-btn').forEach(b => b.classList.remove('on'));
  const pd = $('#predict-door');
  if (pd) pd.hidden = true;
  renderJob();

  $$('.predict-opt').forEach(b => { b.classList.remove('chosen'); b.disabled = false; });
  $$('.lesson-strip .echo').forEach(e => { e.hidden = true; e.textContent = ''; e.classList.remove('match', 'miss'); });
  $$('.obs-cue').forEach(c => { c.textContent = ''; });
  $$('.chg-body').forEach(b => { b.hidden = true; });
  $$('.chg-toggle').forEach(t => t.setAttribute('aria-expanded', 'false'));

  const st = $('#selftest-out');
  if (st) st.innerHTML = '';
}
document.addEventListener('lessonreset', resetActivity);

/* ============================== self-test ===============================
   The proof button. It re-derives, in front of whoever is asking, the
   properties the shipped test file asserts at build time — including the
   two rules this module holds itself to: no prices, no ranking.
   ---------------------------------------------------------------------- */

function runSelfTest() {
  const out = [];
  const ok = (name, cond, detail) => out.push([!!cond, name, detail || '']);

  const dangling = E.danglingSources(D);
  ok('Every claim resolves to a declared source', dangling.length === 0, dangling.join(', '));
  const unused = E.unusedSources(D);
  ok('No source is declared and never used', unused.length === 0, unused.join(', '));
  const vague = E.vagueSourceUrls(D);
  ok('Every source URL names a page, not just a host', vague.length === 0, vague.join(', '));
  ok('Every source is first-party',
     Object.keys(D.SOURCES).every(id => D.SOURCES[id].kind === 'primary'));

  ok('All sixteen cells exist', E.cells(D).every(x => !!x.c),
     E.cells(D).filter(x => !x.c).map(x => x.key).join(', '));
  const noSrc = E.verifiedWithoutSource(D);
  ok('No cell claims "verified" without citing a source', noSrc.length === 0, noSrc.join(', '));
  const badQuote = E.quotesWithoutSource(D);
  ok('Every quotation names the source it came from', badQuote.length === 0, badQuote.join(', '));
  ok('Every bar is a level the axis actually defines',
     E.cells(D).every(({ c, axis }) => c && E.barText(D, axis.id, c.bar) !== null));

  const money = E.priceLeaks(D);
  ok('No price reaches the screen', money.length === 0, money.join(' | '));
  const rank = E.rankingLeaks(D);
  ok('No vendor is recommended or ranked', rank.length === 0, rank.join(', '));

  ok('The three reach rows rise across the four doors', E.reachRowsAreStaircases(D));
  ok('The review row does NOT simply rise — that is the point',
     !E.checkIsStaircase(D),
     'check bars: ' + D.DOORS.map(d => E.checkOf(D, d.id)).join(' '));
  const ex = E.checkExceptions(D);
  ok('The page names every door whose review burden departs from its reach',
     ex.length > 0, ex.map(r => 'door ' + r.n + ' reach ' + r.reach + ' check ' + r.check).join('; '));

  ok('Every job has a verdict for every door',
     D.JOBS.every(j => D.DOORS.every(d => !!E.verdict(D, j, d.id))));
  ok('Every verdict names one of the four axes',
     D.JOBS.every(j => D.DOORS.every(d => D.AXES.some(a => a.id === E.verdict(D, j, d.id).axis))));
  ok('Every verdict explains itself in a sentence',
     D.JOBS.every(j => D.DOORS.every(d => E.verdict(D, j, d.id).why.length > 40)));
  ok('A door that does the whole job says what it costs you, unless it costs nothing',
     D.JOBS.every(j => D.DOORS.every(d => {
       const v = E.verdict(D, j, d.id);
       return v.v !== 'yes' || typeof v.hand === 'string';
     })));
  ok('At least one job is best served by door 1 or door 2',
     E.jobsSolvedLow(D).length > 0, E.jobsSolvedLow(D).map(j => j.id).join(', '));
  ok('No job is impossible at every door',
     D.JOBS.every(j => !!E.bestDoor(D, j)),
     D.JOBS.filter(j => !E.bestDoor(D, j)).map(j => j.id).join(', '));

  ok('The cut list is not empty and every entry says why',
     D.CUT.length > 0 && D.CUT.every(c => c.claim && c.why && c.why.length > 40));
  ok('At least two product names are shown as already changed',
     D.CHANGED.length >= 2, String(D.CHANGED.length));
  ok('The formerly uneven row cites the product that filled it, and records the miss',
     D.UNEVEN.conf === 'verified' && D.UNEVEN.src.indexOf('gemini-spark') > -1 && /wrong/i.test(D.UNEVEN.note),
     D.UNEVEN.conf);
  ok('Every source carries the ISO date it was last opened, and the page date is the oldest',
     Object.keys(D.SOURCES).every(id => /^\d{4}-\d{2}-\d{2}$/.test(D.SOURCES[id].checked || '')) &&
     Object.keys(D.SOURCES).every(id => D.SOURCES[id].checked >= D.CHECKED_ISO),
     D.CHECKED_ISO);
  ok('The page carries the date it was checked',
     /\d{4}/.test(D.CHECKED_ON) && D.CHECKED_ISO.length === 10, D.CHECKED_ON);
  ok('At least one claim was rechecked and confirmed held, with its own date',
     Array.isArray(D.RECHECKED) && D.RECHECKED.length > 0 && /\d{4}/.test(D.RECHECKED_ON || ''),
     String((D.RECHECKED || []).length));

  const box = $('#selftest-out');
  box.innerHTML = '';
  const fails = out.filter(r => !r[0]).length;
  const head = el('div', 'st-head ' + (fails ? 'bad' : 'good'));
  head.textContent = fails ? fails + ' of ' + out.length + ' checks FAILED'
                           : 'all ' + out.length + ' checks pass';
  box.appendChild(head);
  const ul = el('ul', 'st-list');
  out.forEach(([pass, name, detail]) => {
    const li = el('li', pass ? 'ok' : 'no');
    li.appendChild(el('b', null, pass ? 'PASS' : 'FAIL'));
    li.appendChild(el('span', null, name + (detail ? ' — ' + detail : '')));
    ul.appendChild(li);
  });
  box.appendChild(ul);
  /* eslint-disable no-console */
  console.log('AI Tool Guide self-test:', fails ? fails + ' FAILED' : 'all pass');
  out.forEach(r => console.log(r[0] ? 'PASS' : 'FAIL', r[1], r[2]));
}

/* ================================ boot ================================== */

function boot() {
  $$('.js-date').forEach(n => { n.textContent = D.CHECKED_ON; });
  $$('.js-recheck-date').forEach(n => { n.textContent = D.RECHECKED_ON; });

  renderGrid();
  renderAxisNote();
  renderCheckNote();
  wirePredictAxis();

  renderJobPicker();
  renderJobsNote();
  renderJob();

  renderChanged();
  renderRechecked();
  wirePredictChanged();
  renderStale();
  renderUneven();
  renderCounts();
  renderCut();
  renderSources();

  /* #item-details is the demo's own dialog, not one of the shell's four, so
     it needs its own backdrop-click-to-close; Escape already works, being a
     native <dialog>, and the shell's Reset already closes every open
     <dialog> including this one. */
  const itemDetails = $('#item-details');
  if (itemDetails) {
    itemDetails.addEventListener('click', e => { if (e.target === itemDetails) itemDetails.close(); });
  }

  const selftestBtn = $('#btn-selftest');
  if (selftestBtn) selftestBtn.addEventListener('click', runSelfTest);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
