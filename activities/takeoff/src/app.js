/* ==========================================================================
   The Pace of AI Progress — the view layer.

   Four stages on the shared lesson shell: the estimate chart (stage 1), the
   benchmark families (stage 2), the acceptance ladder (stage 3), and the
   invented forecast scenario with the boundary (stage 4).

   WHAT THE SHELL OWNS AND THIS FILE DOES NOT. The dialogs (Guide, Settings,
   Details, Presenter Notes), the stage tablist and its keyboard, presentation
   mode, the check cards, and Reset's kit-owned half all live in the shell's
   behaviour script, injected before this one. This file used to carry its own
   overlay stack, act navigation, presentation toggle and resetAll(); all of
   that was deleted in the 2026-09-16 retrofit (ADOPTING.md §2). It talks to
   the shell through exactly two events on document: `stagechange` and
   `lessonreset`.

   THE DRAWING IS THE PREDICTION. The drawn line is stage 1's Predict; its
   endpoint is echoed into the lesson strip at reveal. The reveal reports the
   published value and the ratio as observations, never as praise, and then
   names what would have broken the line — because the lesson is that a gap
   in published history can be estimated and a future cannot, and the old
   scoring loop ("you got that one close", five times) rewarded exactly the
   extrapolation stage 4 argues against.
   ========================================================================== */

(() => {
'use strict';

const E = ENGINE;
const D = DATA;
const $  = s => document.querySelector(s);
const $$ = (s, root) => Array.from((root || document).querySelectorAll(s));

/* ---- state ------------------------------------------------------------------
   Every property is enumerated in resetActivity() below. */
const S = {
  roundIx: 0,
  results: [],
  chart: null,
  family: D.FAMILIES[0].id,
  rung: 'all',
  role: 'all',
  big: false,
  /* True only between the shell consulting onReset() and this file finishing
     resetActivity(). See the stagechange handler for why it exists. */
  resetting: false
};

/* ---- boot ------------------------------------------------------------------- */

function boot() {
  S.chart = Chart.create($('#chart'));
  /* The audit's first-ranked defect: this call existed and was never made, so
     every chart ended at its own last point and the boundary never rendered. */
  S.chart.setAxisEnd(D.AXIS_END);
  S.chart.state().onDraw = () => {
    $('#btn-reveal').disabled = false;
    $('#draw-hint').textContent = 'Happy with it? Reveal.';
  };

  wireRound();
  buildFamilies();
  buildAchievements();
  buildScenario();
  buildBoundary();
  buildSources();
  buildDefinitions();
  $('#btn-selftest').addEventListener('click', runSelfTest);

  window.addEventListener('resize', () => { fitChart(); S.chart.resize(); });
  window.addEventListener('orientationchange', () => setTimeout(() => { fitChart(); S.chart.resize(); }, 120));

  loadRound(0);
}

/* The chart's height is measured, not declared, because everything above it
   varies: the stage intro, the lesson strip and the round's own explanation
   all wrap differently at every width.

   WHAT THIS RULE USED TO CLAIM, and why the claim is gone. Before the kit
   retrofit this function enforced "the chart and the Reveal button are both
   reachable without scrolling". Measured 2026-09-16 against the kit's A2
   block: at 1024x768 the Reveal row lands at y=1217 and at 1440x900 at
   y=1220, so the rule no longer holds at either - the template's stage intro
   plus lesson strip is ~550-880px tall before the activity starts, and the
   only way to satisfy the old rule would be to shrink the chart to a sliver.
   The floor wins instead and the page scrolls, which is the right trade. The
   comment says so rather than asserting an invariant the code cannot keep.

   The floor is presenter-aware: in presentation mode `avail` is almost always
   negative at this scroll depth, so the floor is what actually governs the
   height, and a projector needs the larger chart. (A `body.presenter` CSS
   rule cannot do this job - the inline height this function sets wins.) */
function fitChart() {
  const wrap = $('#chart-wrap');
  const row  = $('#draw-row');
  const leg  = $('.legend-mini');
  if (!wrap || !row) return;
  wrap.style.height = '';
  const top = wrap.getBoundingClientRect().top;
  const note = $('#scale-note');
  const below = row.getBoundingClientRect().height
              + (leg ? leg.getBoundingClientRect().height : 0)
              + (note && !note.hidden ? note.getBoundingClientRect().height + 8 : 0)
              + 26;
  const avail = window.innerHeight - top - below;
  const max = S.big ? 620 : 500;
  const floor = window.innerWidth < 860 ? (S.big ? 360 : 300) : (S.big ? 460 : 340);
  wrap.style.height = Math.round(E.clamp(avail, floor, max)) + 'px';
}

/* ---- stage 1: the rounds ---------------------------------------------------- */

function wireRound() {
  $('#round-select').innerHTML = D.ROUNDS.map((r, i) => `<option value="${i}">${i + 1}. ${esc(r.name)}</option>`).join('');
  $('#round-select').addEventListener('change', ev => loadRound(Number(ev.target.value)));
  $('#btn-reveal').addEventListener('click', doReveal);
  $('#btn-redraw').addEventListener('click', () => {
    S.chart.reset();
    $('#btn-reveal').disabled = true;
    $('#draw-hint').textContent = 'Drag across the shaded region.';
  });
  $('#btn-twist').addEventListener('click', doTwist);
  $('#btn-next').addEventListener('click', () => {
    if (S.roundIx < D.ROUNDS.length - 1) loadRound(S.roundIx + 1);
    else showScorecard();
  });
  /* The ARC example's answer button is rebuilt on every round load, so it is
     delegated. */
  document.addEventListener('click', ev => {
    if (ev.target && ev.target.id === 'arc-reveal') {
      ev.target.hidden = true;
      const a = $('#arc-answer');
      if (a) a.hidden = false;
    }
  });
}

function loadRound(ix) {
  S.roundIx = ix;
  const r = D.ROUNDS[ix];
  $('#round-select').value = String(ix);
  $('#round-num').textContent = `Series ${ix + 1} of ${D.ROUNDS.length}`;
  $('#round-qual').textContent = r.metric;
  $('#round-name').textContent = r.name;
  $('#round-real').textContent = r.real || '';
  $('#round-plain').textContent = r.plain;
  $('#round-q').textContent = r.question;
  $('#chart-heading').textContent = r.metric;
  $('#chart-unit').textContent = r.unit === 'min' ? 'Human task time · minutes, log scale' : r.unit === '$' ? 'USD / million tokens' : 'Test score · %';
  $('#chart-conditions').textContent = 'Conditions: ' + r.conditions;
  const note = $('#scale-note');
  note.hidden = !r.scaleNote;
  note.textContent = r.scaleNote || '';

  const v = $('#verdict'); v.hidden = true; v.innerHTML = '';
  $('#twist-wrap').hidden = true;
  $('#twist-body').hidden = true; $('#twist-body').innerHTML = '';
  $('#btn-twist').hidden = false;
  const sc = $('#scorecard'); sc.hidden = true; sc.innerHTML = '';
  $('#round-body').hidden = false;
  $('#btn-reveal').hidden = false;
  $('#btn-reveal').disabled = true;
  $('#btn-redraw').hidden = false;
  $('#btn-next').hidden = true;
  $('#btn-next').textContent = 'Next series';
  $('#draw-hint').textContent = 'Drag across the shaded region, or use arrow keys on the chart.';
  $('#twist-q').textContent = r.twist ? r.twist.question : '';
  setCue(1, '');
  setEcho(0, '');

  S.chart.setRound(r);
  fitChart();
  S.chart.resize();
  S.chart.reset();
  renderRoundDetails(r, false);
}

/* A concrete sample of the actual task, for the Details drawer. For a room
   that has never seen any of this measured, "97.6% on Tier 4" means nothing
   until they have seen what one item looks like. */
function renderExample(ex) {
  if (ex.kind === 'text') {
    return `<p class="ex-text">${esc(ex.body).replace(/\n\n/g, '</p><p class="ex-text">')}</p>` +
           (ex.note ? `<p class="ex-note">${esc(ex.note)}</p>` : '');
  }
  if (ex.kind === 'ladder') {
    return `<div class="ladder">${ex.items.map(i =>
      `<div class="lrow"><span class="lt">${esc(i.t)}</span><span class="ls">${esc(i.s)}</span></div>`).join('')}</div>` +
      (ex.note ? `<p class="ex-note">${esc(ex.note)}</p>` : '');
  }
  if (ex.kind === 'arc') {
    const pairs = ex.pairs.map((p, i) => `
      <div class="arc-pair">
        <span class="arc-cap">Example ${i + 1}</span>
        <div class="arc-row">${grid(p.in)}<span class="arc-arrow">&rarr;</span>${grid(p.out)}</div>
      </div>`).join('');
    return `<div class="arc-wrap">
        ${pairs}
        <div class="arc-pair test">
          <span class="arc-cap">Now you</span>
          <div class="arc-row">${grid(ex.test)}<span class="arc-arrow">&rarr;</span>
            <button class="arc-reveal" type="button" id="arc-reveal" aria-label="Show the answer">?</button>
            <div class="arc-answer" id="arc-answer" hidden>${grid(ex.answer)}</div>
          </div>
        </div>
      </div>
      ${ex.note ? `<p class="ex-note">${esc(ex.note)}</p>` : ''}`;
  }
  return '';
}

/* ARC colours. Deliberately not the Murray State palette — these are the
   puzzle's own vocabulary and must not read as meaning anything else. */
const ARC_COLORS = ['#0B1B2E', '#3B82F6', '#EF4444', '#22C55E', '#EAB308', '#94A3B8', '#D946EF', '#F97316'];

function grid(g) {
  return `<div class="arc-grid" style="grid-template-columns:repeat(${g[0].length},1fr)">` +
    g.map(row => row.map(c => `<i style="background:${ARC_COLORS[c] || ARC_COLORS[0]}"></i>`).join('')).join('') +
    `</div>`;
}

/* The per-series half of the stage-1 Details drawer: the example task, the
   comparison note, and the measurement table. Before the reveal the table
   shows only the shown points, so Details cannot leak the answer. */
function renderRoundDetails(r, revealed) {
  const pts = revealed ? E.allPoints(r) : r.shown;
  const ex = r.example;
  $('#round-details').innerHTML = `
    <details class="example" open><summary>${esc(ex.label)}</summary>${renderExample(ex)}</details>
    <p><b>For comparison.</b> ${esc(r.human)}</p>
    <h3>Measurements in this series</h3>
    <p class="details-note">${revealed
      ? 'Shown and revealed measurements. Lines connect selected reports; they are not continuous observations.'
      : 'Only the initially shown measurements appear here. Reveal the chart to inspect the rest.'}</p>
    <div class="table-scroll"><table>
      <thead><tr><th scope="col">Date / model</th><th scope="col">Value</th><th scope="col">Conditions / source</th></tr></thead>
      <tbody>${pts.map(p => `<tr>
        <td>${esc(p.date)}<small>${esc(p.label)}</small></td>
        <td>${E.fmtValue(p.value, r.unit)}${p.lo != null ? `<small>95% interval ${p.lo}–${p.hi} ${esc(r.unit)}</small>` : ''}</td>
        <td>${esc(p.note)}<small>${srcLinks([p.src].concat(p.extraSrc || []))}</small></td></tr>`).join('')}
      </tbody></table></div>
    <p class="details-note">${esc(r.endNote)} · snapshot ${esc(D.SNAPSHOT)}.</p>
    ${r.limitations ? `<h3>${esc(r.limitations.title)}</h3><p>${esc(r.limitations.body)}</p><p class="v-src">${srcLinks([r.limitations.src])}</p>` : ''}`;
}

function doReveal() {
  const r = D.ROUNDS[S.roundIx];
  const res = E.score(r, S.chart.guess());
  S.results[S.roundIx] = res;
  $('#btn-reveal').hidden = true;
  $('#btn-redraw').hidden = true;
  $('#draw-hint').textContent = '';
  S.chart.reveal(() => {
    renderVerdict(r, res);
    $('#verdict').hidden = false;
    renderRoundDetails(r, true);
    setEcho(0, `You drew <b>${E.fmtValue(res.predicted, r.unit)}</b>; published: <b>${E.fmtValue(res.truth, r.unit)}</b> (${esc(r.hidden.at(-1).label)}).`);
    setCue(1, cueFor(r, res));
    if (r.twist) { $('#twist-wrap').hidden = false; $('#btn-twist').hidden = false; $('#twist-body').hidden = true; }
    else $('#btn-next').hidden = false;
    $('#verdict').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

/* The observation cue names the thing to notice at the moment it becomes
   true: the size of the move and where the series stops. */
function cueFor(r, res) {
  const first = E.allPoints(r)[0];
  const last = r.hidden.at(-1);
  const mult = first.value > 0 ? E.round(last.value / first.value, 1) : null;
  const move = r.unit === '%' && first.value === 0
    ? `${E.fmtValue(first.value, r.unit)} to ${E.fmtValue(last.value, r.unit)}`
    : mult ? `${E.fmtValue(first.value, r.unit)} to ${E.fmtValue(last.value, r.unit)} — ${mult}×` : `${E.fmtValue(first.value, r.unit)} to ${E.fmtValue(last.value, r.unit)}`;
  return `${move} between ${E.fmtDate(E.t(first.date))} and ${E.fmtDate(E.t(last.date))}. ${r.endNote}; the hatched stretch to ${E.fmtDate(E.t(D.SNAPSHOT))} is unplotted.`;
}

function renderVerdict(r, res) {
  const directRatio = res.predicted > 0 ? res.truth / res.predicted : null;
  let ratioLine;
  if (directRatio == null) ratioLine = 'Your endpoint was zero, so a ratio is not defined.';
  else if (directRatio >= 1.08) ratioLine = `The published result was <strong>${E.round(directRatio, 1)}×</strong> your endpoint.`;
  else if (directRatio <= 0.93) ratioLine = `Your endpoint was <strong>${E.round(1 / directRatio, 1)}×</strong> the published result.`;
  else ratioLine = 'Your endpoint and the published result agree within eight percent.';
  $('#verdict').innerHTML = `
    <div class="v-head">
      <span class="v-tag">${res.predicted < res.truth - 0.05 ? 'Your line was below the published series' : res.predicted > res.truth + 0.05 ? 'Your line was above the published series' : 'Your line met the published series'}</span>
      <h3>${esc(r.reveal.headline)}</h3>
    </div>
    <div class="v-nums">
      <div class="v-num"><span class="panel-kicker"><span class="k-live">Live</span></span><span class="k">You drew</span><span class="val">${E.fmtValue(res.predicted, r.unit)}</span></div>
      <div class="v-num truth"><span class="panel-kicker"><span class="k-sourced">Sourced</span></span><span class="k">Published · ${esc(r.hidden.at(-1).label)}</span><span class="val">${E.fmtValue(res.truth, r.unit)}</span></div>
      ${res.points != null && isFinite(res.points) ? `<div class="v-num"><span class="panel-kicker"><span class="k-live">Live</span></span><span class="k">Gap</span><span class="val">${E.round(Math.abs(res.points), 1)} pts</span></div>` : ''}
    </div>
    <p class="v-ratio">${ratioLine} That is an observation about the published series, not a score: a bold line that landed near the truth was not thereby a good forecast.</p>
    <p class="v-body">${esc(r.reveal.body)}</p>
    <div class="v-breaks">
      <span class="panel-kicker"><span class="k-reasoned">Reasoned</span> what would have broken this line</span>
      <ul>${r.breaks.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    </div>
    <details class="v-caveat" open>
      <summary>What this number does not say</summary>
      <p>${esc(r.reveal.caveat)}</p>
    </details>
    <div class="v-src">${srcLinks(collectSrcs(r))}</div>`;
}

function doTwist() {
  const r = D.ROUNDS[S.roundIx];
  const f = r.twist.finale;
  $('#btn-twist').hidden = true;
  $('#twist-body').hidden = false;
  $('#twist-body').innerHTML = `
    <div class="v-head">
      <span class="v-tag">${esc(r.twist.metric)}</span>
      <h3>${esc(f.headline)}</h3>
    </div>
    <p class="v-body what-is">${esc(f.what)}</p>
    <p class="v-body">${esc(f.body)}</p>
    <div class="bars">
      ${f.bars.map(b => `
        <div class="bar-row">
          <span class="bl">${esc(b.label)}<em>${esc(b.note)}</em></span>
          <div class="bt"><div class="bf ${esc(b.kind)}" style="width:${Math.max(b.value, 0.7)}%"></div></div>
          <span class="bv">${b.value}%</span>
        </div>`).join('')}
    </div>
    <p class="v-body"><strong>${esc(f.punch)}</strong></p>
    <details class="v-caveat" open>
      <summary>What this comparison does and does not establish</summary>
      <p>${esc(f.caveat)}</p>
    </details>
    <p class="v-close">${esc(f.close)}</p>
    <div class="v-src">${srcLinks([f.src].concat(f.extraSrc || []))}</div>`;
  $('#btn-next').hidden = false;
  $('#btn-next').textContent = S.roundIx < D.ROUNDS.length - 1 ? 'Next series' : 'See all five';
}

/* The closing card. No ratio column and no praise: each row says where the
   series stops and why, which is what the room should carry to stage 2. */
function showScorecard() {
  $('#round-body').hidden = true;
  $('#verdict').hidden = true;
  $('#twist-wrap').hidden = true;
  $('#btn-next').hidden = true;
  const sc = $('#scorecard');
  sc.hidden = false;
  sc.innerHTML = `
    <span class="panel-kicker"><span class="k-live">Live</span> your five endpoints beside the five published results</span>
    <h3>Five series, five different tests</h3>
    <p>The tests measure different things, so there is no combined score. Read each row for the size of the move and for where the published record stops.</p>
    <div class="sc-rows">
      ${D.ROUNDS.map((r, i) => {
        const res = S.results[i];
        return `<div class="sc-row">
          <span class="n">${esc(r.name)}</span>
          <span class="g">${res ? E.fmtValue(res.predicted, r.unit) : '—'}</span>
          <span class="arrow" aria-hidden="true">→</span>
          <span class="t">${E.fmtValue(E.finalValue(r), r.unit)}</span>
          <span class="stop">${esc(r.endNote)}</span>
        </div>`;
      }).join('')}
    </div>
    <p class="sc-note">Which result surprised you, and which condition changes your reading most? An estimate can be high or low; neither direction is the lesson. The skill is stating what each measurement supports, and where it stops.</p>
    <div class="sc-actions">
      <button class="btn" type="button" id="btn-to-retire">Why the tests keep changing</button>
      <button class="btn ghost" type="button" id="btn-again">Draw them again</button>
    </div>`;
  $('#btn-to-retire').addEventListener('click', () => window.lessonShell.selectStage(1));
  $('#btn-again').addEventListener('click', () => { S.results = []; loadRound(0); });
}

function collectSrcs(r) {
  const s = new Set();
  E.allPoints(r).forEach(p => { if (p.src) s.add(p.src); (p.extraSrc || []).forEach(k => s.add(k)); });
  return Array.from(s);
}

/* ---- stage 2: benchmark families ------------------------------------------- */

function buildFamilies() {
  $('#family-nav').innerHTML = D.FAMILIES.map(f =>
    `<button type="button" data-family="${esc(f.id)}" aria-pressed="false">${esc(f.name)}</button>`).join('');
  $$('#family-nav button').forEach(b => b.addEventListener('click', () => renderFamily(b.dataset.family, true)));
  $('#corrections').innerHTML = D.CORRECTIONS.map(c => `
    <div class="correction"><b>&ldquo;${esc(c.claim)}&rdquo;</b><p>${esc(c.answer)} <span class="v-src">${srcLinks([c.src])}</span></p></div>`).join('');
  $('#churn').innerHTML = `<b>2.3 a year, then 28 in a year</b><p>${esc(D.CHURN.text)} ${esc(D.CHURN.note)} <span class="v-src">${srcLinks([D.CHURN.src])}</span></p>`;
  renderFamily(S.family, false);
}

function renderFamily(id, byUser) {
  S.family = id;
  const f = D.FAMILIES.find(x => x.id === id);
  $$('#family-nav button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.family === id)));
  $('#family-view').innerHTML = `
    <p class="family-lede">${esc(f.lede)}</p>
    <div class="gens">${f.gens.map(g => `
      <article class="gen gen-${esc(g.status)}">
        <header><span class="gen-name">${esc(g.name)}</span><span class="gen-status">${esc(D.STATUSES[g.status])}</span></header>
        <p class="gen-meta">${esc(g.released)} · ${esc(g.size)}</p>
        <p class="gen-top">Top: <b>${esc(g.top.text)}</b><small>${esc(g.top.note)}</small></p>
        ${g.human ? `<p class="human"><b>Human line:</b> ${esc(g.human)}</p>` : ''}
        ${(g.routes.length || g.kindChange) ? `<div class="chips">${g.routes.map(rt => `<span class="chip chip-route" title="${esc(D.ROUTES[rt].what)}">Route · ${esc(D.ROUTES[rt].name)}</span>`).join('')}${g.kindChange ? '<span class="chip chip-kind">Counts something different from its predecessor</span>' : ''}</div>` : ''}
        ${g.quote ? `<blockquote>&ldquo;${esc(g.quote.text)}&rdquo;<cite>${esc(g.quote.who)} · ${srcLinks([g.quote.src])}</cite></blockquote>` : ''}
        ${g.series ? `<div class="table-scroll"><table><thead><tr><th scope="col">Date / model</th><th scope="col">Score</th><th scope="col">Conditions / source</th></tr></thead><tbody>${g.series.map(p => `<tr><td>${esc(p.date)}<small>${esc(p.label)}</small></td><td>${E.fmtValue(p.value, '%')}</td><td>${esc(p.note)}<small>${srcLinks([p.src].concat(p.extraSrc || []))}</small></td></tr>`).join('')}</tbody></table></div>` : ''}
        <p class="gen-note">${esc(g.note)}</p>
        <div class="v-src">${srcLinks([g.src].concat(g.extraSrc || []))}</div>
      </article>`).join('')}
    </div>
    <ul class="route-key">${Object.entries(D.ROUTES).map(([k, r]) => `<li><b>${esc(r.name)}</b> — ${esc(r.what)}</li>`).join('')}</ul>`;
  if (byUser) {
    const retired = f.gens.filter(g => g.status !== 'open' && g.status !== 'unscored');
    const notBeaten = retired.filter(g => !g.routes.includes('beaten'));
    const open = f.gens.filter(g => g.status === 'open');
    setCue(2, `${esc(f.name)}: ${retired.length} generation${retired.length === 1 ? '' : 's'} retired or saturated${notBeaten.length ? `, ${notBeaten.length} of them without being beaten` : ''}; ${open.length ? `${open.length} still discriminating` : 'none still discriminating'}${f.gens.some(g => g.kindChange) ? '; the newest counts something different.' : '.'}`);
    setEcho(1, `You opened <b>${esc(f.name)}</b>.`);
  }
}

/* ---- stage 3: the acceptance ladder ---------------------------------------- */

function buildAchievements() {
  $('#rung-nav').innerHTML = `<button type="button" data-rung="all" aria-pressed="true">All rungs</button>` +
    D.LADDER.map(l => `<button type="button" data-rung="${esc(l.id)}" aria-pressed="false" title="${esc(l.what)}">${esc(l.name)}</button>`).join('');
  $('#role-nav').innerHTML = `<button type="button" data-role="all" aria-pressed="true">All roles</button>` +
    Object.entries(D.ROLES).map(([k, r]) => `<button type="button" data-role="${esc(k)}" aria-pressed="false" title="${esc(r.what)}">${esc(r.name)}</button>`).join('');
  $$('#rung-nav button').forEach(b => b.addEventListener('click', () => { S.rung = b.dataset.rung; renderAchievements(true); }));
  $$('#role-nav button').forEach(b => b.addEventListener('click', () => { S.role = b.dataset.role; renderAchievements(true); }));
  renderAchievements(false);
}

function renderAchievements(byUser) {
  $$('#rung-nav button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.rung === S.rung)));
  $$('#role-nav button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.role === S.role)));
  const order = D.LADDER.map(l => l.id);
  const items = D.ACHIEVEMENTS
    .filter(a => (S.rung === 'all' || a.acceptance === S.rung) && (S.role === 'all' || a.ai_role === S.role))
    .sort((a, b) => order.indexOf(a.acceptance) - order.indexOf(b.acceptance) || E.t(b.date) - E.t(a.date));
  $('#achievements').innerHTML = items.length ? items.map(a => `
    <article class="ach rung-${esc(a.acceptance)}">
      <span class="panel-kicker"><span class="k-sourced">Sourced</span>${a.status === 'secondary' ? '<span class="k-qual">reported; the original posts are deleted</span>' : ''}</span>
      <header>
        <span class="ach-rung">${esc(D.LADDER.find(l => l.id === a.acceptance).name)}</span>
        <span class="ach-role">${esc(D.ROLES[a.ai_role].name)}</span>
        <span class="ach-date">${esc(a.dateLabel || E.fmtDate(E.t(a.date)))}</span>
      </header>
      <h3>${esc(a.title)}</h3>
      <p class="what">${esc(a.what)}</p>
      <div class="split">
        <div><span class="s-k">The machine</span><p>${esc(a.machine)}</p></div>
        <div><span class="s-k">The people</span><p>${esc(a.human)}</p></div>
      </div>
      <p class="checked"><b>Who checked it:</b> ${esc(a.checked)}</p>
      <p class="caveat">${esc(a.caveat)}</p>
      <div class="v-src">${srcLinks([a.src].concat(a.extraSrc || []))}</div>
    </article>`).join('') : '<p class="ach-empty">No card sits on that rung with that role. That absence is itself information: nothing autonomous has completed the acceptance process yet.</p>';
  if (byUser) {
    const rungName = S.rung === 'all' ? 'every rung' : D.LADDER.find(l => l.id === S.rung).name.toLowerCase();
    const roleName = S.role === 'all' ? 'every role' : D.ROLES[S.role].name.toLowerCase();
    setCue(3, `${items.length} card${items.length === 1 ? '' : 's'} on ${rungName}, ${roleName}. ${S.rung === 'nobel' ? 'One occupant: the process that ends in a prize takes years.' : S.rung === 'contested' ? 'One occupant, and it is the biggest headline on the page.' : 'Read the rung before the headline.'}`);
    setEcho(2, `You filtered to <b>${esc(rungName)}</b>, <b>${esc(roleName)}</b>.`);
  }
}

/* ---- stage 4: the scenario and the boundary -------------------------------- */

function buildScenario() {
  $('#scenario-years').addEventListener('input', () => renderScenario(true));
  renderScenario(false);
}

function renderScenario(byUser) {
  const t = Number($('#scenario-years').value);
  $('#scenario-year').textContent = t;
  const rules = E.scenarios(t);
  $('#scenario-results').innerHTML = rules.map(r => `<article><span>${esc(r.name)}</span><b class="${r.value > 100 ? 'over' : ''}">${r.value.toFixed(1)}</b><p>${r.value > 100 ? 'Above the score ceiling. This rule no longer gives a possible score.' : esc(r.note)}</p></article>`).join('');
  if (byUser) {
    const vals = rules.map(r => r.value);
    const spread = Math.max(...vals) - Math.min(...vals);
    setCue(4, t === 0 ? 'Year 0: all three rules give 30. The two points cannot tell them apart.' : `Year ${t}: the three rules now span ${E.round(spread, 1)} points${vals.some(v => v > 100) ? ', and one has left the scale' : ''}. Same two points, three futures.`);
    setEcho(3, `You moved to <b>year ${t}</b>.`);
  }
}

function buildBoundary() {
  $('#boundaries').innerHTML = D.BOUNDARIES.map(b => `<li>${esc(b.text)} ${srcLinks([b.src])}</li>`).join('');
  $('#headline').innerHTML = `&ldquo;${esc(D.HEADLINE.text)}&rdquo;<cite>${esc(D.HEADLINE.who)} · ${srcLinks([D.HEADLINE.src])}</cite>`;
  $('#cut-list').innerHTML = D.CUT.map(c => `<li><strong>${esc(c.claim)}</strong><span>${esc(c.why)}</span></li>`).join('');
}

/* ---- the Details drawer's generated parts ---------------------------------- */

function buildSources() {
  const list = keys => Array.from(new Set(keys)).filter(k => D.SOURCES[k]).sort((a, b) => D.SOURCES[a].t.localeCompare(D.SOURCES[b].t))
    .map(k => `<li><a href="${esc(D.SOURCES[k].u)}" target="_blank" rel="noopener">${esc(D.SOURCES[k].t)}</a> — checked ${esc(D.SOURCES[k].checked)}; ${esc(D.SOURCES[k].how)}.</li>`).join('');
  const walk = x => { const out = []; (function w(y) { if (!y || typeof y !== 'object') return; if (typeof y.src === 'string') out.push(y.src); (y.extraSrc || []).forEach(s => out.push(s)); Object.values(y).forEach(v => { if (v && typeof v === 'object') w(v); }); })(x); return out; };
  $('#sources-1').innerHTML = list(walk(D.ROUNDS));
  $('#sources-2').innerHTML = list(walk(D.FAMILIES).concat(walk(D.CORRECTIONS), walk(D.CHURN)));
  $('#sources-3').innerHTML = list(walk(D.ACHIEVEMENTS));
  $('#sources-4').innerHTML = list(walk(D.BOUNDARIES).concat(walk(D.HEADLINE)));
}

function buildDefinitions() {
  $('#ladder-defs').innerHTML = D.LADDER.map(l => `<li><b>${esc(l.name)}</b> — ${esc(l.what)}</li>`).join('');
  $('#role-defs').innerHTML = Object.values(D.ROLES).map(r => `<li><b>${esc(r.name)}</b> — ${esc(r.what)}</li>`).join('');
}

function srcLinks(keys) {
  return keys.filter(k => D.SOURCES[k])
    .map(k => `<a href="${esc(D.SOURCES[k].u)}" target="_blank" rel="noopener">${esc(D.SOURCES[k].t)}</a>`)
    .join('<span class="dot">·</span>');
}

/* ---- the observation cue and the Predict echo, per stage --------------------- */

function setCue(n, html) {
  const el = $('#cue-' + n);
  if (el) el.innerHTML = html;
}
function setEcho(stageIx, html) {
  const el = $$('.lesson-strip .echo')[stageIx];
  if (!el) return;
  el.innerHTML = html;
  el.hidden = !html;
}

/* ---- self test ----------------------------------------------------------------
   The same integrity checks the node suite runs, from the UI, so the claim
   "every number here has a source" can be demonstrated in front of the person
   asking rather than asserted. */
function runSelfTest() {
  const out = $('#selftest-out');
  const checks = Validation.check(D, E);
  const pass = checks.filter(c => c.pass).length;
  out.innerHTML = `<div class="st-head ${pass === checks.length ? 'good' : 'bad'}">${pass} / ${checks.length} checks passed</div>` +
    checks.map(c => `<div class="st-row ${c.pass ? 'good' : 'bad'}"><span>${c.pass ? '✓' : '✕'}</span><span>${esc(c.name)}</span>${c.detail ? `<em>${esc(c.detail)}</em>` : ''}</div>`).join('');
  checks.forEach(c => console.log((c.pass ? 'PASS  ' : 'FAIL  ') + c.name + (c.detail ? '  — ' + c.detail : '')));
  return checks;
}

/* ---- the shell's two events ------------------------------------------------ */

/* `stagechange` is treated as a CHROME event only, per ADOPTING.md section 4
   step 7. The shell's reset calls selectStage(0) — firing stagechange — BEFORE
   it dispatches `lessonreset`, so anything here that renders activity state
   would paint the PRE-reset state into freshly reset chrome. This demo renders
   a canvas on stage 1, and Chart.resize() repaints from the chart's own state,
   which at that instant still holds the previous round, the drawn line and the
   revealed series. So the handler bails out while a reset is in flight; the
   render it would have done is done by resetActivity() a moment later, from
   state that has actually been reset.

   The flag is set from `onReset`, which the shell consults as step 1 of its
   reset — the only hook a demo gets before the ordering hazard fires.
   Returning anything but false lets the reset proceed. */
window.lessonShell.onReset = () => { S.resetting = true; return true; };

document.addEventListener('stagechange', e => {
  if (S.resetting) return;
  if (e.detail.index === 0) setTimeout(() => { fitChart(); S.chart.resize(); }, 20);
});

document.addEventListener('presentationchange', e => {
  S.big = !!e.detail.on;
  fitChart();
  S.chart.setBig(S.big);
});

/* ---- reset: the activity's half --------------------------------------------
   The shell restores what the kit owns (dialogs, tabs, check cards, the
   strip echoes and observation cues from its first-load snapshot, the Details
   drawer, stage 1, scroll) and then dispatches `lessonreset`. Everything
   below is what only this file knows about. THE ENUMERATION, written before
   the handler, because in place is only correct if the list is complete:

     S.roundIx, S.results, S.family, S.rung, S.role — plain values. S.big is
            NOT touched: presentation mode is the shell's and stays as set.
     S.chart — KEPT and rewound, not dropped: Chart.create binds pointer and
            keyboard listeners once; recreating it would bind them twice.
            loadRound(0) calls setRound + reset on the existing instance, which
            clears the drawn line, the reveal sweep and the axis extension.
     S.resetting — set by onReset() before the shell's own steps run, cleared
            at the END of this function, so the stagechange the shell fires at
            step 7 cannot repaint the pre-reset chart.
     Stage 1 DOM: everything loadRound(0) rewrites — #round-select, the
            round copy, #verdict (hidden, emptied), #twist-wrap / #twist-body
            / #btn-twist, #scorecard (hidden, emptied), #round-body shown,
            the Reveal / Clear / Next buttons, #draw-hint, #round-details.
            #arc-answer / #arc-reveal live inside #round-details and are
            rebuilt by it.
     Stage 2 DOM: #family-nav aria-pressed and #family-view, via
            renderFamily(first family). #corrections and #churn are static
            once built and are not touched.
     Stage 3 DOM: #rung-nav / #role-nav aria-pressed and #achievements, via
            renderAchievements with both filters at 'all'.
     Stage 4 DOM: #scenario-years back to the template's 3, #scenario-year and
            #scenario-results via renderScenario. #boundaries, #headline and
            #cut-list are static once built. #cut <details> closed.
     Details drawer: every generated <details class="example"> is rebuilt by
            renderRoundDetails inside loadRound(0); the .v-caveat <details>
            live inside #verdict / #twist-body, which are emptied.
     Settings: #selftest-out emptied.
     Echoes and cues: restored by the shell from its snapshot (empty), and
            loadRound(0) clears stage 1's again after that, harmlessly.
   ============================================================================ */
function resetActivity() {
  S.roundIx = 0;
  S.results = [];
  S.family = D.FAMILIES[0].id;
  S.rung = 'all';
  S.role = 'all';
  loadRound(0);
  renderFamily(S.family, false);
  renderAchievements(false);
  $('#scenario-years').value = '3';
  renderScenario(false);
  $('#cut').open = false;
  $('#selftest-out').innerHTML = '';
  /* Last: the stage-1 chart is now rebuilt from reset state, so stagechange
     may render again. */
  S.resetting = false;
  fitChart();
  S.chart.resize();
}
document.addEventListener('lessonreset', resetActivity);

/* ---- util --------------------------------------------------------------------- */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* A handle for the browser pass and the contract suite. Not part of the UI. */
window.__takeoff = { S, runSelfTest, loadRound, renderFamily, renderAchievements, D, E };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
