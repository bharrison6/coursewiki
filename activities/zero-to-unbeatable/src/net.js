/* =====================================================================
   Zero to Unbeatable — Step 3's other memory: a neural network

   This file exists to change ONE thing about step 3 and nothing else.

   Step 3 already learns. Its rule is Act I's rule with the turn carried
   explicitly: a board picture is worth the best thing the player to move
   can reach from it, discounted, and a finished board is worth its
   result. That rule lives in nine.js and this file does not touch it.

   What this file replaces is WHERE the answer is kept.

     the table    39,366 numbers, one per (board picture, whose turn).
                  Reading is an array index. It can only give back a
                  value for a picture somebody has already written to;
                  everything else reads 0.00, which is indistinguishable
                  from "even".

     the network  a few thousand weights. Reading is a forward pass, so
                  it has an answer for EVERY picture, including ones it
                  has never been shown. Whether that answer is any good
                  is the thing the demo measures rather than asserts.

   Both are plugged into nine.js through the same three calls — at(),
   hits(), nudge() — so the training loop, the exploration, the move
   choice, the discount and the alpha schedule are shared code. If the
   two behaved differently for any other reason, the comparison this
   step makes would be worthless.

   The architecture
   ----------------
   29 inputs -> 32 rectified units -> 24 rectified units -> 1 number.
   1,777 weights against the table's 39,366 entries.

   The output is plain linear, and the read is clamped to [-1,1] because
   nothing can be worth more than a win. A squashing tanh was tried first
   and had to go: it interacts badly with the update below, which divides
   by the size of the gradient, and a saturating tanh drives that size to
   zero. Everything pinned to +1.00 within two hundred matches. The
   clamp does the same job without the singularity.

   The input is the board picture and nothing else:

     27  nine cells x three states (empty / X / O), one-hot
      2  whose turn it is, one-hot

   Exactly ten of those twenty-nine are 1 and the rest are 0, always. So
   the first layer is not a matrix multiply at all -- it is ten rows of
   W1 added together, which is why this runs at demo speed in plain JS
   on a phone. No tic-tac-toe knowledge is encoded: the network is not
   told what a line is, which cells share one, or that the centre is
   special. It gets nine independent squares and a turn bit.

   The update
   ----------
   The table's update is
                    U += alpha * (target - U)
   -- move this one number a fixed fraction of the way to the target.

   The network's update is written to do exactly that to its ANSWER:

        theta += alpha * (target - y) * grad(y) / (|grad(y)|^2 + eps)

   which is normalised least-mean-squares. To first order the new output
   for this position is y + alpha*(target - y): the same fraction of the
   way to the same target, from the same alpha schedule. The difference
   is not the size of the step, it is that a table's step moves one
   entry and a network's step moves every position that shares structure
   with this one. That is the entire lesson of the step, so it is worth
   the twenty lines it takes to make the two steps genuinely comparable
   instead of approximately comparable.

   Determinism
   -----------
   Same seed, same numbers, on every device, and this file gets there by
   never using a transcendental at all. IEEE +, -, *, / and sqrt are
   correctly rounded on every engine; Math.exp, Math.log and Math.tanh
   are not, and one differing last bit changes which story a run tells.
   So: weights initialised uniform from the mulberry32 stream (a normal
   sampler would need a logarithm), rectifiers for the hidden units (a
   comparison and a multiply), and a linear output. Where a transcendental
   IS unavoidable, glass-box/src/engine.js builds its own from
   polynomials over IEEE ops; that is the house solution and the reason
   this file was written to avoid needing it.
   ===================================================================== */

const NET = (function (OG) {
'use strict';

const { POW3, NCODE, CELLS, WINNER, NEMPTY } = OG;

/* ------------------------------------------------------------------ *
 * 1. The input: ten ones among twenty-nine
 * ------------------------------------------------------------------ */

const NIN = 29;                 /* 27 cell one-hots + 2 turn one-hots */
const ACTIVE = 10;              /* nine cells plus the turn, always */

/* Every board picture's ten active input indices, precomputed once.
   19,683 x 9 bytes for the cells; the turn index is appended at use.
   Building this costs about a millisecond and removes the encode from
   the inner loop entirely. */
const FEAT = new Uint8Array(NCODE * 9);
(function buildFeatures() {
  for (let code = 0; code < NCODE; code++) {
    const off = code * 9;
    for (let i = 0; i < 9; i++) FEAT[off + i] = i * 3 + CELLS[off + i];
  }
})();

/* The same encoding, spelled out, for anything that wants to show a
   student what actually goes in. */
function encode(code, turn) {
  const x = new Float32Array(NIN);
  const off = code * 9;
  for (let i = 0; i < 9; i++) x[FEAT[off + i]] = 1;
  x[26 + turn] = 1;             /* 27 = X to move, 28 = O to move */
  return x;
}

/* ------------------------------------------------------------------ *
 * 2. Hyperparameters
 *
 * alphaFloor is smaller than the table's 0.60 and that is a real
 * difference, stated rather than hidden: a table entry is private, so
 * slamming it 60% of the way to a target costs nothing anybody else is
 * using. A network weight is shared by every position that touches it,
 * so a step that large makes the last position it saw the only one it
 * believes. The rule is identical; the size of the step it can afford
 * is not.
 * ------------------------------------------------------------------ */

const HPN = {
  hidden: 32,         /* first hidden layer */
  hidden2: 24,        /* second; see newNet for why there are two */
  alphaFloor: 0.20,   /* fraction of the way to the target, per update */
  initScale: 0.35,    /* uniform init half-width */
  outScale: 0.02,     /* the last layer starts near zero, so a newborn
                         network answers about 0.00 everywhere and plays
                         very nearly at random, as a newborn table does.
                         Not exactly: a table's zeros are identical and a
                         network's near-zeros are not, so it is born with
                         faint preferences it did nothing to earn. That is
                         what random initialisation is, and the demo says
                         so rather than hiding it. */
  eps: 1e-4,          /* floor under the NLMS denominator */
  seedPasses: 3,      /* passes over Act I's handover when it is fitted */
  burst: 250,         /* matches per burst. A forward pass costs about a
                         thousand times an array index, so the same
                         wall clock buys far fewer matches. Giving the
                         network the table's full 1,000 -- or 5,000 --
                         changes none of the conclusions; that was
                         measured and is written up in README.md. */
  bursts: [100, 250, 500]
};

/* ------------------------------------------------------------------ *
 * 3. The weights
 * ------------------------------------------------------------------ */

/* TWO hidden layers, and the second one is not decoration -- it was
   measured. Fitted to the answer key with everything else held the same,
   one hidden layer stalls at a root-mean-square error of about 0.35 no
   matter how wide it is -- 24 units and 384 units land in the same
   place -- and a net that far out cannot play. Two layers reach 0.15 at
   a quarter of the width. The reason is that "three in a row" is a
   CONJUNCTION -- this cell AND that cell AND that one -- and one layer
   of rectifiers over one-hot cells has to spend a unit on each one it
   needs, while a second layer can assemble them from parts it already
   has. Those numbers are in README.md; they were measured, not assumed. */
function newNet(opts) {
  opts = opts || {};
  const H1 = opts.hidden || HPN.hidden;
  const H2 = opts.hidden2 || HPN.hidden2;
  const rnd = OG.makeRng(opts.seed == null ? 'net' : opts.seed);
  const s = HPN.initScale;
  /* Uniform, not Gaussian: a normal sampler needs a logarithm, and this
     file is trying to stay inside the four arithmetic operations. */
  const fill = (n, scale) => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = (2 * rnd() - 1) * scale;
    return a;
  };
  return {
    H1, H2,
    W1: fill(NIN * H1, s),                  b1: fill(H1, s * 0.5),
    W2: fill(H1 * H2, s * 2 / Math.sqrt(H1)), b2: new Float32Array(H2),
    W3: fill(H2, HPN.outScale),             b3: 0,
    z1: new Float32Array(H1), a1: new Float32Array(H1),
    z2: new Float32Array(H2), a2: new Float32Array(H2),
    d1: new Float32Array(H1), d2: new Float32Array(H2)
  };
}

function cloneNet(n) {
  return {
    H1: n.H1, H2: n.H2,
    W1: new Float32Array(n.W1), b1: new Float32Array(n.b1),
    W2: new Float32Array(n.W2), b2: new Float32Array(n.b2),
    W3: new Float32Array(n.W3), b3: n.b3,
    z1: new Float32Array(n.H1), a1: new Float32Array(n.H1),
    z2: new Float32Array(n.H2), a2: new Float32Array(n.H2),
    d1: new Float32Array(n.H1), d2: new Float32Array(n.H2)
  };
}

function paramCount(n) {
  return n.W1.length + n.b1.length + n.W2.length + n.b2.length + n.W3.length + 1;
}

/* Forward pass. Pre-activations and activations are left on the net,
   because the update needs both and re-running the forward pass to get
   them would double the cost of learning. */
function forward(net, code, turn) {
  const H1 = net.H1, H2 = net.H2;
  const W1 = net.W1, b1 = net.b1, W2 = net.W2, b2 = net.b2, W3 = net.W3;
  const z1 = net.z1, a1 = net.a1, z2 = net.z2, a2 = net.a2;
  const off = code * 9;
  /* ten rows of W1, added. No multiply anywhere: every active input is 1. */
  for (let j = 0; j < H1; j++) z1[j] = b1[j];
  for (let i = 0; i < 9; i++) {
    const wo = FEAT[off + i] * H1;
    for (let j = 0; j < H1; j++) z1[j] += W1[wo + j];
  }
  const wt = (26 + turn) * H1;
  for (let j = 0; j < H1; j++) z1[j] += W1[wt + j];
  for (let j = 0; j < H1; j++) a1[j] = z1[j] > 0 ? z1[j] : 0;

  for (let k = 0; k < H2; k++) z2[k] = b2[k];
  for (let j = 0; j < H1; j++) {
    const av = a1[j];
    if (av === 0) continue;                  /* rectifiers are off half the time */
    const wo = j * H2;
    for (let k = 0; k < H2; k++) z2[k] += av * W2[wo + k];
  }
  let o = net.b3;
  for (let k = 0; k < H2; k++) {
    const z = z2[k];
    if (z > 0) { a2[k] = z; o += z * W3[k]; } else a2[k] = 0;
  }
  return o;
}

/* Normalised LMS: move the OUTPUT for this position `alpha` of the way
   to `target`, by the smallest change to the weights that achieves it.
   Same alpha, same target, same arithmetic shape as the table's
   `U += alpha * (target - U)`. What differs is what else moves with it,
   and that difference is the whole point of the step.
 *
 * The derivatives are hand-written, as they are in glass-box: there is
 * no autograd here and the chain rule is on the page to be checked. */
function update(net, code, turn, target, alpha) {
  const y = forward(net, code, turn);
  const err = target - y;
  if (err === 0) return y;
  const H1 = net.H1, H2 = net.H2;
  const W1 = net.W1, b1 = net.b1, W2 = net.W2, b2 = net.b2, W3 = net.W3;
  const z1 = net.z1, a1 = net.a1, z2 = net.z2, a2 = net.a2;
  const d1 = net.d1, d2 = net.d2;

  /* d(output) / d(pre-activation), back to front */
  let sumA2 = 0, sumD2 = 0;
  for (let k = 0; k < H2; k++) {
    sumA2 += a2[k] * a2[k];
    const d = z2[k] > 0 ? W3[k] : 0;
    d2[k] = d;
    sumD2 += d * d;
  }
  let sumA1 = 0, sumD1 = 0;
  for (let j = 0; j < H1; j++) {
    sumA1 += a1[j] * a1[j];
    let acc = 0;
    if (z1[j] > 0) {
      const wo = j * H2;
      for (let k = 0; k < H2; k++) acc += d2[k] * W2[wo + k];
    }
    d1[j] = acc;
    sumD1 += acc * acc;
  }

  /* |grad y|^2, one term per block of parameters. The ten active inputs
     share a single derivative per first-layer unit, so that block
     contributes its square eleven times over: ten weights and a bias. */
  const g = 1 + sumA2                        /* b3 and W3 */
          + sumD2 * (1 + sumA1)              /* b2 and W2 */
          + sumD1 * (1 + ACTIVE);            /* b1 and W1 */
  const k = alpha * err / (g + HPN.eps);

  /* Apply. Every derivative above was taken with the weights as they
     stand, so all of them are read before any of them is written. */
  net.b3 += k;
  for (let i = 0; i < H2; i++) W3[i] += k * a2[i];
  for (let i = 0; i < H2; i++) b2[i] += k * d2[i];
  for (let j = 0; j < H1; j++) {
    const av = a1[j];
    if (av === 0) continue;
    const wo = j * H2, ka = k * av;
    for (let i = 0; i < H2; i++) W2[wo + i] += ka * d2[i];
  }
  for (let j = 0; j < H1; j++) d1[j] *= k;
  for (let j = 0; j < H1; j++) b1[j] += d1[j];
  const off = code * 9;
  for (let i = 0; i < 9; i++) {
    const wo = FEAT[off + i] * H1;
    for (let j = 0; j < H1; j++) W1[wo + j] += d1[j];
  }
  const wt = (26 + turn) * H1;
  for (let j = 0; j < H1; j++) W1[wt + j] += d1[j];
  return y;
}

/* ------------------------------------------------------------------ *
 * 4. The store nine.js talks to
 *
 * nine.js reads and writes its memory through three calls and knows
 * nothing else about it. This is the network's implementation of them;
 * NINE.newBrain() is the table's. Everything else in step 3 -- the
 * discount, the exploration, the tie-break, the move arithmetic, the
 * match loop -- is one piece of code serving both.
 *
 * The visit counts stay a plain array in BOTH stores. They are not the
 * memory being compared: they are the experience log, and the
 * count-based exploration and the "never seen this" measure both read
 * them. Sharing them means the two runs explore identically, so the
 * only thing left that can differ is where the values are kept.
 * ------------------------------------------------------------------ */

const USIZE = NCODE * 2;
const ui = (code, t) => code * 2 + t - 1;

function newBrain(opts) {
  opts = opts || {};
  const net = newNet(opts);
  return {
    kind: 'net',
    net,
    N: new Uint32Array(USIZE),
    matches: 0,
    seen: 0,
    seeded: 0,
    blindLookups: 0,
    lookups: 0,
    updates: 0,
    hold: null,                 /* (code,turn) => true means never train on it */
    heldSkipped: 0,
    params: paramCount(net),
    /* Act I's handover cannot be assigned into a network, so it is shown
       the same triples and fitted to them with the same update it uses
       for everything else. It will not land on them exactly; in exchange
       it has an answer for the 33,890 entries it was never shown. */
    absorbPasses: HPN.seedPasses,
    absorb(code, t, value, n) {
      const k = ui(code, t);
      if (this.N[k] === 0) this.seen++;
      this.N[k] = n;
      if (this.hold && this.hold(code, t)) { this.heldSkipped++; return; }
      this.updates++;
      update(this.net, code, t, value, HPN.alphaFloor);
    },
    /* Clamped, because a board cannot be worth more than a win. The
       table is inside [-1,1] by construction; the network has to be
       held there, and without it the max in nine.js's backup feeds its
       own overshoot back to itself until everything reads +1. */
    at(code, t) {
      const v = forward(this.net, code, t);
      return v > 1 ? 1 : v < -1 ? -1 : v;
    },
    hits(code, t) { return this.N[ui(code, t)]; },
    nudge(code, t, target) {
      const k = ui(code, t);
      if (this.N[k] === 0) this.seen++;
      /* One constant rate, where the table ramps down from 1.0 with its
         visit count. The table's ramp is right FOR A TABLE: the first
         sight of a private entry should take the target outright,
         because nothing else is using that number. Doing the same to a
         network means slamming every weight the position touches to fit
         one example. Measured: with the ramp it loses 200 of 200 to the
         hand-written opponent, without it 52. */
      const a = HPN.alphaFloor;
      this.N[k]++;
      if (this.hold && this.hold(code, t)) { this.heldSkipped++; return; }
      this.updates++;
      update(this.net, code, t, target, a);
    }
  };
}

function cloneBrain(b) {
  const c = newBrain();
  c.net = cloneNet(b.net);
  c.N = Uint32Array.from(b.N);
  c.matches = b.matches; c.seen = b.seen; c.seeded = b.seeded;
  c.blindLookups = b.blindLookups; c.lookups = b.lookups;
  c.updates = b.updates; c.hold = b.hold; c.heldSkipped = b.heldSkipped;
  c.params = b.params;
  return c;
}

/* ------------------------------------------------------------------ *
 * 5. Ground truth for one board picture, so generalisation can be
 *    measured instead of admired
 *
 * U[picture, turn] is defined by the backup in nine.js: a picture is
 * worth the best its mover can reach, and a finished board is worth its
 * result. The fixed point of that backup on an isolated board is
 * gamma^d times the minimax value of the picture with that turn to
 * move -- so the SIGN of the fixed point is exactly the minimax winner.
 *
 * That gives an answer key neither memory has ever seen, computed here
 * and used only for measurement. Nothing that plays or trains reads it.
 * It covers every picture, including the unbalanced ones that ordinary
 * tic-tac-toe cannot produce, because the turn is supplied rather than
 * inferred.
 * ------------------------------------------------------------------ */

const _truth = new Int8Array(NCODE * 2).fill(127);
function truth(code, t) {
  const k = ui(code, t);
  const cached = _truth[k];
  if (cached !== 127) return cached;
  let v;
  const w = WINNER[code];
  if (w === 1) v = 1;
  else if (w === 2) v = -1;
  else if (w === 3) v = 0;                 /* cannot occur; nothing to say */
  else if (NEMPTY[code] === 0) v = 0;
  else {
    const off = code * 9, opp = t === 1 ? 2 : 1;
    let best = t === 1 ? -2 : 2;
    for (let c = 0; c < 9; c++) {
      if (CELLS[off + c] !== 0) continue;
      const v2 = truth(code + t * POW3[c], opp);
      if (t === 1) { if (v2 > best) best = v2; } else { if (v2 < best) best = v2; }
    }
    v = best;
  }
  _truth[k] = v;
  return v;
}

/* Board pictures the demo actually cares about being right on: the
   mover has a line waiting, so a memory that reads 0.00 walks past a
   free win. */
function hasImmediateWin(code, t) {
  const off = code * 9;
  for (let c = 0; c < 9; c++) {
    if (CELLS[off + c] !== 0) continue;
    if (WINNER[code + t * POW3[c]] === t) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * 6. The held-out set
 *
 * A deterministic pseudo-random slice of (picture, turn) pairs that
 * BOTH memories are forbidden to train on. It is chosen before training
 * starts, from the seed alone, so nothing about how a run went can
 * influence what it is tested on. Both stores consult it on every write
 * and refuse, counting the refusal; `heldSkipped` rising while the
 * held-out values stay exactly as they were born is the receipt.
 *
 * The refusal is on the WRITE only. A held-out picture is still counted,
 * still steers the count-based exploration, still plays. Hiding it from
 * the run entirely would be a different experiment -- and a worse one,
 * because exploration that seeks out the least-visited picture would
 * then chase the held-out set forever, since nothing could raise its
 * count.
 * ------------------------------------------------------------------ */

/* One picture in eight. Big enough that the held-out set is thousands of
   pictures rather than hundreds, and the honest reason it is not the
   default: a table with one picture in eight blanked stops working
   almost completely -- it loses 389 matches in 400 to the hand-written
   opponent where a whole one loses none. Even ONE IN A HUNDRED costs it
   114 of 400. So the held-out run is a separate experiment beside the
   real one, not a tax on it, and the demo says which is which. */
const HOLD_FRACTION = 0.125;

function makeHoldout(seed, fraction) {
  const h0 = OG.hashSeed('holdout:' + seed);
  const cut = Math.round((fraction == null ? HOLD_FRACTION : fraction) * 4294967296);
  return function (code, t) {
    let h = (h0 ^ Math.imul(code, 0x9E3779B1)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B) >>> 0;
    h = (h + Math.imul(t, 0xC2B2AE35)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0x27D4EB2F) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h < cut;
  };
}

/* The measurement the whole step is for. Over every held-out picture,
   how often does each memory get the sign of the answer right?
 *
 * The table's answer is 0.00 for all of them, so it scores exactly the
 * fraction of them that really are drawn and nothing more. That is not
 * a rigged comparison; it is what a lookup table does off the end of
 * what it has stored. */
function generalisation(netBrain, tableBrain, opts) {
  opts = opts || {};
  const hold = netBrain.hold;
  const winsOnly = !!opts.winsOnly;
  let n = 0, netRight = 0, tableRight = 0, netSum = 0, decisive = 0;
  const examples = [];
  for (let code = 0; code < NCODE; code++) {
    if (WINNER[code] === 3) continue;
    for (let t = 1; t <= 2; t++) {
      if (!hold(code, t)) continue;
      if (WINNER[code] !== 0 || NEMPTY[code] === 0) continue;  /* nothing to work out */
      if (winsOnly && !hasImmediateWin(code, t)) continue;
      const z = truth(code, t);
      const nv = netBrain.at(code, t);
      const tv = tableBrain ? tableBrain.at(code, t) : 0;
      const sg = v => (v > 0.15 ? 1 : v < -0.15 ? -1 : 0);
      n++;
      if (z !== 0) decisive++;
      if (sg(nv) === z) netRight++;
      if (sg(tv) === z) tableRight++;
      netSum += z === 0 ? -Math.abs(nv) : (z > 0 ? nv : -nv);
      if (examples.length < 12 && z !== 0 && hasImmediateWin(code, t)) {
        examples.push({ code, turn: t, truth: z, net: nv, table: tv });
      }
    }
  }
  return {
    n, decisive,
    netRight, tableRight,
    netRate: n ? netRight / n : 0,
    tableRate: n ? tableRight / n : 0,
    margin: n ? netSum / n : 0,
    examples
  };
}

/* ------------------------------------------------------------------ *
 * 7. The experiment, run the same way by the app and by the tests
 *
 * Two fresh memories, the same handover, the same seeded stream, the
 * same number of matches, and the same one-in-eight of the board
 * pictures forbidden to both. Then ask both of them about the pictures
 * neither was allowed to learn.
 *
 * `nine` is passed in rather than required, because nine.js owns the
 * training loop and must not depend on this file -- the network is a
 * memory it can be handed, not a thing it knows about.
 * ------------------------------------------------------------------ */

function experiment(nine, agent, opts) {
  opts = opts || {};
  const seed = opts.seed == null ? 'demo' : opts.seed;
  const matches = opts.matches == null ? HPN.burst : opts.matches;
  const hold = makeHoldout(seed, opts.fraction);

  const table = nine.newBrain();
  const net = newBrain({ seed: 'net:' + seed });
  table.hold = hold; net.hold = hold;
  nine.seedFromAgent(table, agent);
  nine.seedFromAgent(net, agent);

  /* Separate streams with the same seed: each memory plays its own
     matches, because each one's choices are its own. Same budget, same
     rehearsal, different memory. */
  const t0 = now();
  nine.trainMatches(table, matches, OG.makeRng('exp:' + seed));
  const tableMs = now() - t0;
  const t1 = now();
  nine.trainMatches(net, matches, OG.makeRng('exp:' + seed));
  const netMs = now() - t1;

  const all = generalisation(net, table);
  const wins = generalisation(net, table, { winsOnly: true });
  return {
    seed, matches, fraction: opts.fraction == null ? HOLD_FRACTION : opts.fraction,
    table, net, all, wins,
    tableMs, netMs,
    params: net.params,
    slots: USIZE,
    refusals: { table: table.heldSkipped, net: net.heldSkipped }
  };
}

function now() {
  return (typeof performance !== 'undefined' && performance.now)
    ? performance.now() : Date.now();
}

/* ------------------------------------------------------------------ */

/*
 * The public neural-network lesson
 * ---------------------------------
 *
 * The old experiment above is retained as low-level machinery, but it was
 * written for the retired nine-board value convention.  This small adapter
 * uses the same MLP primitives for the current one-board afterstate table.
 * It is deliberately supervised: first a tabular learner plays seeded games;
 * its frozen values become labels; then shared weights fit those labels.
 * During play `policyMoves` reads only `model.net`.  It never reaches back
 * into `teacher`, `examples`, or a minimax answer key.
 */

const SYM = [
  [0,1,2,3,4,5,6,7,8], [6,3,0,7,4,1,8,5,2],
  [8,7,6,5,4,3,2,1,0], [2,5,8,1,4,7,0,3,6],
  [2,1,0,5,4,3,8,7,6], [6,7,8,3,4,5,0,1,2],
  [0,3,6,1,4,7,2,5,8], [8,5,2,7,4,1,6,3,0]
];

function transform(code, map) {
  let out = 0, off = code * 9;
  for (let i = 0; i < 9; i++) out += CELLS[off + i] * OG.POW3[map[i]];
  return out;
}
function symmetryKey(code) {
  let best = code;
  for (let i = 1; i < SYM.length; i++) best = Math.min(best, transform(code, SYM[i]));
  return best;
}

function startTeacher(seed, games) {
  return { agent: OG.newAgent(), rng: OG.makeRng('neural-teacher:' + (seed || 'demo')),
    games: 0, total: games == null ? 20000 : games };
}
function trainTeacherBatch(session, count) {
  const n = Math.min(count, session.total - session.games);
  if (n > 0) OG.trainGames(session.agent, n, session.rng);
  session.games += n;
  session.complete = session.games === session.total;
  return { games: session.games, total: session.total, complete: session.complete };
}
function freezeTeacher(session) { return OG.cloneAgent(session.agent); }
function makeTeacher(seed, games) {
  const session = startTeacher(seed, games);
  while (session.games < session.total) trainTeacherBatch(session, Math.min(500, session.total - session.games));
  return freezeTeacher(session);              /* labels cannot keep changing */
}

function makeDataset(teacher, seed) {
  const examples = [], group = new Map(), seen = new Uint8Array(NCODE);
  for (const before of OG.OPEN_POSITIONS) {
    const mover = OG.TOMOVE[before];
    for (const cell of OG.legalList(before)) {
      const code = OG.child(before, cell, mover);
      /* A reachable afterstate can be reached from several legal parents
         when we enumerate exploring starts. It is one position and gets
         one label, not a silently overweighted transition example. */
      if (seen[code]) continue;
      seen[code] = 1;
      const key = symmetryKey(code);
      let g = group.get(key);
      if (!g) { g = { key, held: (OG.hashSeed('neural-split:' + (seed || 'demo') + ':' + key) % 5) === 0 }; group.set(key, g); }
      examples.push({ code, turn: OG.TOMOVE[code], target: teacher.V[code], group: key, held: g.held });
    }
  }
  const train = examples.filter(x => !x.held), held = examples.filter(x => x.held);
  return { examples, train, held, groups: group.size };
}

function newSupervised(teacher, seed) {
  const data = makeDataset(teacher, seed);
  const model = {
    net: newNet({ seed: 'neural-weights:' + (seed || 'demo'), hidden: 28, hidden2: 18 }),
    data, seed: seed || 'demo', updates: 0, epoch: 0, at: 0,
    params: 0
  };
  model.params = paramCount(model.net);
  return model;
}

/* One bounded batch. The caller schedules the next batch, so tab changes,
   reset, and cancel can interrupt training between batches. */
function trainBatch(model, count, measure) {
  const train = model.data.train;
  for (let i = 0; i < count; i++) {
    const ex = train[model.at++ % train.length];
    update(model.net, ex.code, ex.turn, ex.target, 0.14);
    model.updates++;
    if (model.at % train.length === 0) model.epoch++;
  }
  return measure === false ? { updates: model.updates, epoch: model.epoch } : metrics(model);
}

function predict(model, code) { return Math.max(-1, Math.min(1, forward(model.net, code, OG.TOMOVE[code]))); }
function mse(model, set) {
  let total = 0;
  for (const ex of set) { const d = predict(model, ex.code) - ex.target; total += d * d; }
  return set.length ? total / set.length : 0;
}
function metrics(model) {
  return { trainMse: mse(model, model.data.train), heldMse: mse(model, model.data.held),
    updates: model.updates, epoch: model.epoch, train: model.data.train.length,
    held: model.data.held.length, groups: model.data.groups, params: model.params };
}

function policyMoves(model, code) {
  const mover = OG.TOMOVE[code], legal = OG.legalList(code);
  let best = -Infinity, moves = [];
  for (const cell of legal) {
    const v = predict(model, OG.child(code, cell, mover));
    if (v > best + 1e-7) { best = v; moves = [cell]; }
    else if (Math.abs(v - best) <= 1e-7) moves.push(cell);
  }
  return moves;
}
function greedyMove(model, code, rnd) {
  const moves = policyMoves(model, code); return moves[(rnd() * moves.length) | 0];
}
function scoreVs(model, opponent, games, rnd, mark) {
  let wins = 0, losses = 0, draws = 0;
  for (let i = 0; i < games; i++) {
    const ai = mark || (i % 2 ? 1 : 2); let code = 0;
    while (!OG.isTerminal(code)) {
      const mover = OG.TOMOVE[code];
      const cell = mover === ai ? greedyMove(model, code, rnd) : opponent(code, rnd);
      code = OG.child(code, cell, mover);
    }
    const w = OG.WINNER[code];
    if (!w) draws++; else if (w === ai) wins++; else losses++;
  }
  return { wins, losses, draws, games };
}

/* Independent finite difference for d(output)/d(one weight).  The chosen
   test point is checked away from ReLU kinks before its derivative is used. */
function finiteDifferenceCheck(model) {
  const net = model.net, code = OG.child(0, 0, 1), turn = OG.TOMOVE[code];
  forward(net, code, turn);
  if (net.z1.some(z => Math.abs(z) < 1e-3) || net.z2.some(z => Math.abs(z) < 1e-3)) return { skipped: true };
  let unit = -1, analytic = 0;
  for (let j = 0; j < net.H1; j++) {
    if (net.z1[j] <= 0) continue;
    let d = 0;
    for (let k = 0; k < net.H2; k++) if (net.z2[k] > 0) d += net.W2[j * net.H2 + k] * net.W3[k];
    if (Math.abs(d) > 1e-5) { unit = j; analytic = d; break; }
  }
  if (unit < 0) return { skipped: true };
  const idx = FEAT[code * 9] * net.H1 + unit, old = net.W1[idx], h = 1e-3;
  net.W1[idx] = old + h; const plus = forward(net, code, turn);
  net.W1[idx] = old - h; const minus = forward(net, code, turn);
  net.W1[idx] = old; forward(net, code, turn);
  const numeric = (plus - minus) / (2 * h);
  return { numeric, analytic, error: Math.abs(numeric - analytic), skipped: false };
}

return {
  NIN, ACTIVE, HPN, USIZE, ui, HOLD_FRACTION, experiment,
  encode, FEAT,
  newNet, cloneNet, forward, update, paramCount,
  newBrain, cloneBrain,
  truth, hasImmediateWin, makeHoldout, generalisation,
  startTeacher, trainTeacherBatch, freezeTeacher, makeTeacher, makeDataset, newSupervised, trainBatch, predict, metrics,
  policyMoves, greedyMove, scoreVs, finiteDifferenceCheck, symmetryKey
};
})(typeof OG !== 'undefined' ? OG : require('./engine.js'));

if (typeof module !== 'undefined' && module.exports) module.exports = NET;
