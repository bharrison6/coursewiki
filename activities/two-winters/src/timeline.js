/* ==========================================================================
   Two Winters — the timeline canvas.

   Seventy-six years across the x axis. Six rows down the y axis: one for
   landmark results, then five lenses for comparing claims, institutions,
   constraints, reassessment, and withdrawal.

   The lane layout supports comparison without asserting that history repeats
   in order. Scrubbing makes each historical pathway inspectable, while the
   present stays evidence to evaluate rather than a third run to complete.

   Hand-rolled on a 2d context, like the rest of this repository. Everything
   is laid out in CSS pixels and scaled by devicePixelRatio at draw time so
   the same code is crisp on a phone and on a projector.
   ========================================================================== */

const Timeline = (() => {

const E = ENGINE;

/* Murray State palette. Red-orange is reserved for genuine failure states —
   here, and only here, the withdrawal lane and the winter labels, because a
   funding collapse is exactly what that colour is for. */
const C = {
  ink:    '#E8EDF5',
  dim:    '#8FA3C0',
  navy:   '#002144',
  gold:   '#ECAC00',
  sky:    '#00A4E3',
  red:    '#FF4500',
  frost:  'rgba(148,190,225,0.13)',
  grid:   'rgba(143,163,192,0.11)'
};

/* One colour per comparison lens; red remains reserved for withdrawal. */
const LANE_COLOR = {
  result:     C.ink,
  promise:    C.gold,
  money:      '#7ED957',
  limit:      C.sky,
  naming:     '#B98CFF',
  withdrawal: C.red
};

const Y0 = 1950, Y1 = 2027;

function create(canvas, data) {
  const st = {
    canvas, ctx: canvas.getContext('2d'),
    lanes: ['result'].concat(data.STAGES.map(s => s.id)),
    laneLabel: Object.assign({ result: 'What actually worked' },
      data.STAGES.reduce((o, s) => (o[s.id] = s.label, o), {})),
    events: data.EVENTS.map(e => ({ ...e, at: E.t(e.d), year: E.yearOf(E.t(e.d)) }))
                       .sort((a, b) => a.at - b.at),
    winters: data.WINTERS.map(w => ({ ...w, a: E.t(w.from), b: E.t(w.to) })),
    cursor: 1,
    hover: null,
    big: false,
    w: 0, h: 0, dpr: 1,
    pad: { l: 10, r: 12, t: 30, b: 30 }
  };
  st.t0 = Date.UTC(Y0, 0, 1);
  st.t1 = Date.UTC(Y1, 0, 1);
  bind(st);
  return {
    resize: () => resize(st),
    render: () => render(st),
    setCursor: v => { st.cursor = E.clamp(v, 0, 1); clearHidden(st); render(st); },
    setBig: b => { st.big = b; resize(st); },
    cursorAt: () => at(st),
    cursorYear: () => displayedYear(st),
    visible: () => visible(st),
    stats: () => stats(st),
    winterNow: () => winterAt(st, at(st)),
    onHover: cb => { st.onHover = cb; },
    select: ev => setHover(st, ev && visible(st).includes(ev) ? ev : null),
    selected: () => st.hover,
    step: dir => stepTo(st, dir)
  };
}

const at = st => st.t0 + st.cursor * (st.t1 - st.t0);
/* Y1 is the exclusive axis boundary; its last included year is Y1 - 1. */
const displayedYear = st => Math.min(Y1 - 1, E.yearOf(at(st)));
const pw = st => Math.max(1, st.w - st.pad.l - st.pad.r);
const ph = st => Math.max(1, st.h - st.pad.t - st.pad.b);
const px = (st, ms) => st.pad.l + (ms - st.t0) / (st.t1 - st.t0) * pw(st);
const rowH = st => ph(st) / st.lanes.length;
const py = (st, lane) => st.pad.t + rowH(st) * (st.lanes.indexOf(lane) + 0.62);

/* The cursor is stored as a 0..1 fraction of a 77-year span, so a round trip
   through `at()` loses up to a few hours. Without a tolerance, stepping onto an
   event could land the cursor a hair BEFORE it, which dropped it out of
   `visible` and left the detail panel blank — reproduced on the 1980 event,
   which reported year 1979. ENGINE owns the tolerance and the step arithmetic,
   where the test suite can reach them. */
const EPS = E.STEP_EPS;
function visible(st) { const a = at(st); return st.events.filter(e => e.at <= a + EPS); }
function clearHidden(st) { if (st.hover && !visible(st).includes(st.hover)) setHover(st, null); }

function setHover(st, ev) {
  if (st.hover === ev) return;
  st.hover = ev; render(st);
  if (st.onHover) st.onHover(ev);
}

/** Counters that describe what is actually on screen. A stat that disagrees
 *  with the dots above it is worse than no stat. */
function stats(st) {
  const shown = visible(st);
  const by = {};
  for (const e of shown) by[e.stage] = (by[e.stage] || 0) + 1;
  return { total: shown.length, by, withdrawals: by.withdrawal || 0 };
}

function winterAt(st, ms) {
  for (const w of st.winters) if (ms >= w.a && ms <= w.b) return w;
  return null;
}

/** Keyboard/next-button stepping: move the cursor to the next event date. */
function stepTo(st, dir) {
  const target = E.stepTarget(st.events, at(st), dir);
  if (!target) return null;
  /* Park just past the event, never a hair before it: the rounding is absorbed,
     the year readout agrees with the event that was stepped to, and stepTarget
     excludes the parked-on event in both directions so back actually goes back. */
  st.cursor = E.clamp((E.parkAt(target) - st.t0) / (st.t1 - st.t0), 0, 1);
  clearHidden(st);
  render(st);
  return target;
}

function resize(st) {
  const r = st.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  st.w = Math.max(1, r.width); st.h = Math.max(1, r.height); st.dpr = dpr;
  st.canvas.width = Math.round(st.w * dpr);
  st.canvas.height = Math.round(st.h * dpr);
  st.fs = st.big ? 13 : (st.w < 380 ? 9.5 : 11);
  /* The right pad has to clear the glow around a 2026 dot AND the cursor
     label sitting at the end of the axis; 12px put both half off the canvas. */
  st.pad = { l: st.big ? 14 : 10, r: st.big ? 34 : 26,
             t: st.big ? 36 : 30, b: st.big ? 36 : 30 };
  render(st);
}

function bind(st) {
  const pick = (ev, slack) => {
    const r = st.canvas.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    let best = null, bd = Infinity;
    for (const e of visible(st)) {
      const d = Math.hypot(px(st, e.at) - x, py(st, e.stage) - y);
      if (d < bd) { bd = d; best = e; }
    }
    return bd < slack ? best : null;
  };
  st.canvas.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'touch') return;
    const event = pick(ev, st.big ? 26 : 20);
    if (event && event !== st.hover) setHover(st, event);
  });
  /* Keep the inspected event while the pointer travels to its Details button.
     Blank canvas and pointer leave are not a request to discard the selection. */
  /* Touch gets a generous radius: a fingertip is about 44px and the lanes
     are the only thing it can land on. */
  st.canvas.addEventListener('pointerdown', ev => setHover(st, pick(ev, st.big ? 34 : 28)));
}

/* ------------------------------ drawing -------------------------------- */

function winterBands(st) {
  const { ctx } = st;
  const top = st.pad.t - 12, bot = st.pad.t + ph(st) + 6;
  const now = at(st);
  for (const w of st.winters) {
    if (w.a > now) continue;                       /* not reached yet */
    const xa = px(st, w.a);
    const xb = px(st, Math.min(w.b, now));
    const soft = Math.max(6, (px(st, w.b) - xa) * (w.soft / 20));
    const g = ctx.createLinearGradient(xa, 0, Math.max(xb, xa + 1), 0);
    g.addColorStop(0, 'rgba(148,190,225,0.03)');
    g.addColorStop(Math.min(0.35, soft / Math.max(1, xb - xa)), C.frost);
    g.addColorStop(0.72, C.frost);
    g.addColorStop(1, 'rgba(148,190,225,0.03)');
    ctx.fillStyle = g;
    ctx.fillRect(xa, top, Math.max(1, xb - xa), bot - top);

    /* Hard-ish left edge, feathered right edge: the start dates are much
       better attested than the end dates and the drawing should say so. */
    ctx.strokeStyle = 'rgba(148,190,225,0.34)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xa, top); ctx.lineTo(xa, bot); ctx.stroke();

    if (xb - xa > 34) {
      ctx.font = `700 ${st.fs - 0.5}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = 'rgba(232,237,245,0.72)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(w.label, xa + 5, top + 2);
    }
  }
}

function laneRows(st) {
  const { ctx } = st;
  const h = rowH(st);
  st.lanes.forEach((lane, i) => {
    const y = st.pad.t + h * (i + 0.62);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(st.pad.l, y); ctx.lineTo(st.w - st.pad.r, y); ctx.stroke();

    ctx.font = `700 ${st.fs - 0.5}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = lane === 'result' ? 'rgba(232,237,245,0.55)'
                                      : hexA(LANE_COLOR[lane], 0.78);
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(st.laneLabel[lane], st.pad.l + 2, y - (st.big ? 8 : 6));
  });
}

function decades(st) {
  const { ctx } = st;
  const yb = st.pad.t + ph(st);
  ctx.font = `500 ${st.fs}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const step = st.w < 420 ? 20 : 10;
  for (let y = 1950; y <= 2020; y += step) {
    const x = px(st, Date.UTC(y, 0, 1));
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, st.pad.t - 12); ctx.lineTo(x, yb); ctx.stroke();
    ctx.fillStyle = 'rgba(143,163,192,0.75)';
    ctx.fillText(String(y), x, yb + 6);
  }
}

function dots(st) {
  const { ctx } = st;
  const now = at(st);
  for (const e of st.events) {
    if (e.at > now + EPS) continue;   /* same one-day tolerance as `visible` */
    const x = px(st, e.at), y = py(st, e.stage);
    const col = LANE_COLOR[e.stage] || C.ink;
    /* Fresh events glow, then settle. The glow is what makes the sequence
       readable while scrubbing. */
    const fresh = 1 - E.clamp((now - e.at) / (7 * 365 * E.DAY), 0, 1);
    const r = (st.big ? 6 : 4.6) * (1 + 0.45 * fresh);

    if (fresh > 0.04) {
      ctx.beginPath();
      ctx.fillStyle = hexA(col, 0.20 * fresh);
      ctx.arc(x, y, r * 3.4, 0, 7); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
    if (e.stage === 'result') {
      ctx.strokeStyle = hexA(col, 0.55 + 0.4 * fresh);
      ctx.lineWidth = st.big ? 2.6 : 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = hexA(col, 0.62 + 0.38 * fresh);
      ctx.fill();
    }
    if (st.hover === e) {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.75;
      ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 7); ctx.stroke();
    }
  }
}

function cursorLine(st) {
  const { ctx } = st;
  const x = px(st, at(st));
  ctx.strokeStyle = 'rgba(0,164,227,0.8)'; ctx.lineWidth = st.big ? 2.5 : 2;
  ctx.beginPath(); ctx.moveTo(x, st.pad.t - 16); ctx.lineTo(x, st.pad.t + ph(st) + 3); ctx.stroke();
  ctx.fillStyle = 'rgba(0,164,227,0.98)';
  ctx.font = `800 ${st.fs + 2}px system-ui, sans-serif`;
  const right = x > st.w - 56;
  ctx.textAlign = right ? 'right' : 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(String(displayedYear(st)), x + (right ? -6 : 6), st.pad.t - 14);
}

function render(st) {
  const { ctx } = st;
  ctx.save();
  ctx.scale(st.dpr, st.dpr);
  ctx.clearRect(0, 0, st.w, st.h);
  winterBands(st);
  decades(st);
  laneRows(st);
  dots(st);
  cursorLine(st);
  ctx.restore();
}

/** '#RRGGBB' + alpha -> rgba(). Kept here rather than in a palette module
 *  because it is three lines and one caller. */
function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

return { create, C, LANE_COLOR, Y0, Y1, hexA };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Timeline;
