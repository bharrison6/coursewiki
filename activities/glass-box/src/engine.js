// GlassBox tiny transformer engine — plain JS, no dependencies.
// A GPT-style decoder-only transformer with hand-written forward and backward
// passes over Float32Arrays, small enough to train live in a phone browser.
// Used both by the Node tuning harness and inlined into the demo page.
'use strict';

// ---------- utilities ----------
function f32(n) { return new Float32Array(n); }

// ---------- deterministic transcendentals ----------
// IEEE-754 +, -, *, / and sqrt are correctly rounded and therefore identical
// on every engine; Math.exp/log/tanh are NOT (implementation-defined last
// bits). Training is chaotic enough that one differing bit can change which
// local story a run tells, so the engine builds its transcendentals from
// polynomials over IEEE ops only. Result: the same seed produces the same
// model, bit for bit, on every device and browser.
const LN2 = 0.6931471805599453;
const INV_LN2 = 1.4426950408889634;
function EXP(x) {
  if (x !== x) return NaN;
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  // x = k*ln2 + r, |r| <= 0.5*ln2
  let k = x * INV_LN2;
  k = k >= 0 ? (k + 0.5) | 0 : -((-k + 0.5) | 0);
  const r = x - k * LN2;
  // degree-12 Taylor on |r| <= 0.347 — error < 1e-16 relative
  let p = 1 / 479001600;
  p = p * r + 1 / 39916800;
  p = p * r + 1 / 3628800;
  p = p * r + 1 / 362880;
  p = p * r + 1 / 40320;
  p = p * r + 1 / 5040;
  p = p * r + 1 / 720;
  p = p * r + 1 / 120;
  p = p * r + 1 / 24;
  p = p * r + 1 / 6;
  p = p * r + 0.5;
  p = p * r + 1;
  p = p * r + 1;
  // scale by 2^k with exact power-of-two products
  let s = 1, b = 2, n = k < 0 ? -k : k;
  if (k < 0) b = 0.5;
  while (n > 0) { if (n & 1) s *= b; b *= b; n >>= 1; }
  return p * s;
}
const _logBuf = new DataView(new ArrayBuffer(8));
function LOG(x) {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  // exponent/mantissa split via the bit pattern (deterministic by definition)
  _logBuf.setFloat64(0, x);
  let e = (_logBuf.getUint32(0) >>> 20) & 0x7ff;
  let m;
  if (e === 0) { // subnormal: renormalize
    _logBuf.setFloat64(0, x * 9007199254740992); // 2^53
    e = ((_logBuf.getUint32(0) >>> 20) & 0x7ff) - 53;
  }
  e -= 1023;
  _logBuf.setUint32(0, (_logBuf.getUint32(0) & 0x000fffff) | 0x3ff00000);
  m = _logBuf.getFloat64(0); // in [1,2)
  if (m > 1.4142135623730951) { m *= 0.5; e += 1; }
  // log(m) via atanh series: t = (m-1)/(m+1), log(m) = 2*(t + t^3/3 + ...)
  const t = (m - 1) / (m + 1);
  const t2 = t * t;
  let p = 1 / 15;
  p = p * t2 + 1 / 13;
  p = p * t2 + 1 / 11;
  p = p * t2 + 1 / 9;
  p = p * t2 + 1 / 7;
  p = p * t2 + 1 / 5;
  p = p * t2 + 1 / 3;
  p = p * t2 + 1;
  return 2 * t * p + e * LN2;
}
function TANH(x) {
  if (x !== x) return NaN;
  if (x > 20) return 1;
  if (x < -20) return -1;
  const e = EXP(2 * x);
  return (e - 1) / (e + 1);
}

// Deterministic RNG (mulberry32) so demo runs are reproducible per-seed.
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Normal sampler: Marsaglia polar method — sqrt and LOG only, so it is
// deterministic too (Box-Muller would need a trig function).
function randn(rng) {
  for (;;) {
    const u = 2 * rng() - 1, v = 2 * rng() - 1;
    const s = u * u + v * v;
    if (s > 0 && s < 1) return u * Math.sqrt(-2 * LOG(s) / s);
  }
}

const GELU_C = Math.sqrt(2 / Math.PI);
function gelu(x) {
  const u = GELU_C * (x + 0.044715 * x * x * x);
  return 0.5 * x * (1 + TANH(u));
}
function geluGrad(x) {
  const u = GELU_C * (x + 0.044715 * x * x * x);
  const t = TANH(u);
  const du = GELU_C * (1 + 3 * 0.044715 * x * x);
  return 0.5 * (1 + t) + 0.5 * x * (1 - t * t) * du;
}

// ---------- model ----------
// cfg: { vocab, ctx, dim, heads, layers, mlpMult (default 2), seed }
function createModel(cfg) {
  const { vocab, ctx, dim, layers } = cfg;
  const mlp = (cfg.mlpMult || 2) * dim;
  const rng = makeRng(cfg.seed == null ? 1337 : cfg.seed);
  const std = 0.08;
  function mat(rows, cols, scale) {
    const a = f32(rows * cols);
    for (let i = 0; i < a.length; i++) a[i] = randn(rng) * scale;
    return a;
  }
  const p = {
    tokEmb: mat(vocab, dim, std),
    posEmb: mat(ctx, dim, std),
    blocks: [],
    lnfG: f32(dim).fill(1), lnfB: f32(dim),
    head: mat(dim, vocab, std), headB: f32(vocab),
  };
  const projScale = std / Math.sqrt(2 * layers);
  for (let l = 0; l < layers; l++) {
    p.blocks.push({
      ln1G: f32(dim).fill(1), ln1B: f32(dim),
      wqkv: mat(dim, 3 * dim, std), bqkv: f32(3 * dim),
      wproj: mat(dim, dim, projScale), bproj: f32(dim),
      ln2G: f32(dim).fill(1), ln2B: f32(dim),
      w1: mat(dim, mlp, std), b1: f32(mlp),
      w2: mat(mlp, dim, projScale), b2: f32(dim),
    });
  }
  return { cfg: { ...cfg, mlpMult: cfg.mlpMult || 2, mlp }, p, _ws: {} };
}

function paramList(model) {
  const out = [];
  const p = model.p;
  out.push(['tokEmb', p.tokEmb], ['posEmb', p.posEmb]);
  p.blocks.forEach((b, i) => {
    out.push([`b${i}.ln1G`, b.ln1G], [`b${i}.ln1B`, b.ln1B],
      [`b${i}.wqkv`, b.wqkv], [`b${i}.bqkv`, b.bqkv],
      [`b${i}.wproj`, b.wproj], [`b${i}.bproj`, b.bproj],
      [`b${i}.ln2G`, b.ln2G], [`b${i}.ln2B`, b.ln2B],
      [`b${i}.w1`, b.w1], [`b${i}.b1`, b.b1],
      [`b${i}.w2`, b.w2], [`b${i}.b2`, b.b2]);
  });
  out.push(['lnfG', p.lnfG], ['lnfB', p.lnfB], ['head', p.head], ['headB', p.headB]);
  return out;
}
function paramCount(model) {
  return paramList(model).reduce((s, [, a]) => s + a.length, 0);
}

// ---------- workspace (allocated once per (T), reused every step) ----------
function getWorkspace(model, T) {
  if (model._ws[T]) return model._ws[T];
  const { vocab, dim, heads, layers, mlp } = model.cfg;
  const mk = () => f32(T * dim);
  const ws = {
    T,
    X: [], // residual stream entering each block + final; layers+1 buffers
    blocks: [],
    lnfOut: mk(), lnfM: f32(T), lnfR: f32(T),
    logits: f32(T * vocab), dLogits: f32(T * vocab),
    dLnfOut: mk(), dX: mk(), dX1: mk(), dP: f32(T),
    grads: null, // lazily created reusable grad buffers
  };
  for (let l = 0; l <= layers; l++) ws.X.push(mk());
  for (let l = 0; l < layers; l++) {
    ws.blocks.push({
      ln1Out: mk(), ln1M: f32(T), ln1R: f32(T),
      qkv: f32(T * 3 * dim), att: f32(heads * T * T),
      attnOut: mk(), proj: mk(), x1: mk(),
      ln2Out: mk(), ln2M: f32(T), ln2R: f32(T),
      h1: f32(T * mlp), h1g: f32(T * mlp), mlpOut: mk(),
      dH1g: f32(T * mlp), dH1: f32(T * mlp),
      dLn2Out: mk(), dAttnOut: mk(), dQkv: f32(T * 3 * dim), dLn1Out: mk(),
    });
  }
  model._ws[T] = ws;
  return ws;
}
function getGradBuffers(model, ws) {
  if (ws.grads) return ws.grads;
  const g = {};
  for (const [name, a] of paramList(model)) g[name] = f32(a.length);
  ws.grads = g;
  return g;
}

// ---------- layer helpers ----------
function layerNormF(x, T, D, gamma, beta, out, cacheMean, cacheRstd) {
  for (let t = 0; t < T; t++) {
    const o = t * D;
    let m = 0;
    for (let d = 0; d < D; d++) m += x[o + d];
    m /= D;
    let v = 0;
    for (let d = 0; d < D; d++) { const z = x[o + d] - m; v += z * z; }
    v /= D;
    const rstd = 1 / Math.sqrt(v + 1e-5);
    cacheMean[t] = m; cacheRstd[t] = rstd;
    for (let d = 0; d < D; d++) {
      out[o + d] = (x[o + d] - m) * rstd * gamma[d] + beta[d];
    }
  }
}
function layerNormB(x, T, D, gamma, cacheMean, cacheRstd, dOut, dX, dGamma, dBeta) {
  for (let t = 0; t < T; t++) {
    const o = t * D;
    const m = cacheMean[t], rstd = cacheRstd[t];
    let sum1 = 0, sum2 = 0;
    for (let d = 0; d < D; d++) {
      const xhat = (x[o + d] - m) * rstd;
      const dy = dOut[o + d];
      dGamma[d] += dy * xhat;
      dBeta[d] += dy;
      const dxh = dy * gamma[d];
      sum1 += dxh;
      sum2 += dxh * xhat;
    }
    sum1 /= D; sum2 /= D;
    for (let d = 0; d < D; d++) {
      const xhat = (x[o + d] - m) * rstd;
      const dxh = dOut[o + d] * gamma[d];
      dX[o + d] += (dxh - sum1 - xhat * sum2) * rstd;
    }
  }
}
function matmulF(x, T, M, w, N, b, out) {
  for (let t = 0; t < T; t++) {
    const xo = t * M, oo = t * N;
    if (b) for (let n = 0; n < N; n++) out[oo + n] = b[n];
    else for (let n = 0; n < N; n++) out[oo + n] = 0;
    for (let m = 0; m < M; m++) {
      const xv = x[xo + m];
      const wo = m * N;
      for (let n = 0; n < N; n++) out[oo + n] += xv * w[wo + n];
    }
  }
}
function matmulB(x, T, M, w, N, dOut, dX, dW, dB) {
  for (let t = 0; t < T; t++) {
    const xo = t * M, oo = t * N;
    for (let m = 0; m < M; m++) {
      const wo = m * N;
      let acc = 0;
      const xv = x[xo + m];
      for (let n = 0; n < N; n++) {
        const dv = dOut[oo + n];
        acc += dv * w[wo + n];
        dW[wo + n] += xv * dv;
      }
      if (dX) dX[xo + m] += acc;
    }
    if (dB) for (let n = 0; n < N; n++) dB[n] += dOut[oo + n];
  }
}

// ---------- forward/backward for a batch of sequences ----------
// All sequences must have the same length T+1 when training (workspace reuse).
function batchForwardBackward(model, seqs, opts) {
  const { vocab, ctx, dim, heads, layers, mlp } = model.cfg;
  const p = model.p;
  const backward = !opts || opts.backward !== false;
  const maskStarts = opts && opts.maskStarts;
  const hd = dim / heads;
  const scale = 1 / Math.sqrt(hd);
  const T = seqs[0].length - 1;
  if (T > ctx) throw new Error('sequence longer than ctx');
  const ws = getWorkspace(model, T);
  const grads = backward ? getGradBuffers(model, ws) : null;
  if (backward) for (const k in grads) grads[k].fill(0);
  let totalLoss = 0, totalCount = 0;

  for (let si = 0; si < seqs.length; si++) {
    const seq = seqs[si];
    if (seq.length - 1 !== T) throw new Error('mixed sequence lengths in batch');
    const mStart = maskStarts ? maskStarts[si] : 0;

    // ---- forward ----
    let x = ws.X[0];
    for (let t = 0; t < T; t++) {
      const eo = seq[t] * dim, po = t * dim, xo = t * dim;
      for (let d = 0; d < dim; d++) x[xo + d] = p.tokEmb[eo + d] + p.posEmb[po + d];
    }

    for (let l = 0; l < layers; l++) {
      const b = p.blocks[l];
      const c = ws.blocks[l];
      layerNormF(x, T, dim, b.ln1G, b.ln1B, c.ln1Out, c.ln1M, c.ln1R);
      matmulF(c.ln1Out, T, dim, b.wqkv, 3 * dim, b.bqkv, c.qkv);
      const qkv = c.qkv, att = c.att, attnOut = c.attnOut;
      const D3 = 3 * dim;
      for (let h = 0; h < heads; h++) {
        const qOff = h * hd, kOff = dim + h * hd, vOff = 2 * dim + h * hd;
        for (let t = 0; t < T; t++) {
          const ao = (h * T + t) * T;
          const qo = t * D3 + qOff;
          let maxv = -Infinity;
          for (let s = 0; s <= t; s++) {
            let dot = 0;
            const ko = s * D3 + kOff;
            for (let d = 0; d < hd; d++) dot += qkv[qo + d] * qkv[ko + d];
            dot *= scale;
            att[ao + s] = dot;
            if (dot > maxv) maxv = dot;
          }
          let sum = 0;
          for (let s = 0; s <= t; s++) {
            const e = EXP(att[ao + s] - maxv);
            att[ao + s] = e; sum += e;
          }
          const inv = 1 / sum;
          for (let s = 0; s <= t; s++) att[ao + s] *= inv;
          const oo = t * dim + h * hd;
          for (let d = 0; d < hd; d++) attnOut[oo + d] = 0;
          for (let s = 0; s <= t; s++) {
            const w = att[ao + s], vo = s * D3 + vOff;
            for (let d = 0; d < hd; d++) attnOut[oo + d] += w * qkv[vo + d];
          }
        }
      }
      matmulF(attnOut, T, dim, b.wproj, dim, b.bproj, c.proj);
      const x1 = c.x1;
      for (let i = 0; i < T * dim; i++) x1[i] = x[i] + c.proj[i];
      layerNormF(x1, T, dim, b.ln2G, b.ln2B, c.ln2Out, c.ln2M, c.ln2R);
      matmulF(c.ln2Out, T, dim, b.w1, mlp, b.b1, c.h1);
      for (let i = 0; i < T * mlp; i++) c.h1g[i] = gelu(c.h1[i]);
      matmulF(c.h1g, T, mlp, b.w2, dim, b.b2, c.mlpOut);
      const x2 = ws.X[l + 1];
      for (let i = 0; i < T * dim; i++) x2[i] = x1[i] + c.mlpOut[i];
      x = x2;
    }

    layerNormF(x, T, dim, p.lnfG, p.lnfB, ws.lnfOut, ws.lnfM, ws.lnfR);
    matmulF(ws.lnfOut, T, dim, p.head, vocab, p.headB, ws.logits);

    const logits = ws.logits, dLogits = ws.dLogits;
    if (backward) dLogits.fill(0);
    for (let t = 0; t < T; t++) {
      if (t < mStart) continue;
      const lo = t * vocab;
      let maxv = -Infinity;
      for (let v = 0; v < vocab; v++) if (logits[lo + v] > maxv) maxv = logits[lo + v];
      let sum = 0;
      for (let v = 0; v < vocab; v++) sum += EXP(logits[lo + v] - maxv);
      const logZ = maxv + LOG(sum);
      const target = seq[t + 1];
      totalLoss += logZ - logits[lo + target];
      totalCount++;
      if (backward) {
        for (let v = 0; v < vocab; v++) dLogits[lo + v] = EXP(logits[lo + v] - logZ);
        dLogits[lo + target] -= 1;
      }
    }

    if (!backward) continue;

    // ---- backward ----
    const dLnfOut = ws.dLnfOut; dLnfOut.fill(0);
    matmulB(ws.lnfOut, T, dim, p.head, vocab, dLogits, dLnfOut, grads.head, grads.headB);
    let dX = ws.dX; dX.fill(0);
    layerNormB(x, T, dim, p.lnfG, ws.lnfM, ws.lnfR, dLnfOut, dX, grads.lnfG, grads.lnfB);

    for (let l = layers - 1; l >= 0; l--) {
      const b = p.blocks[l];
      const c = ws.blocks[l];
      const gW2 = grads[`b${l}.w2`], gB2 = grads[`b${l}.b2`];
      const gW1 = grads[`b${l}.w1`], gB1 = grads[`b${l}.b1`];
      const gWproj = grads[`b${l}.wproj`], gBproj = grads[`b${l}.bproj`];
      const gWqkv = grads[`b${l}.wqkv`], gBqkv = grads[`b${l}.bqkv`];
      c.dH1g.fill(0);
      matmulB(c.h1g, T, mlp, b.w2, dim, dX, c.dH1g, gW2, gB2);
      for (let i = 0; i < T * mlp; i++) c.dH1[i] = c.dH1g[i] * geluGrad(c.h1[i]);
      c.dLn2Out.fill(0);
      matmulB(c.ln2Out, T, dim, b.w1, mlp, c.dH1, c.dLn2Out, gW1, gB1);
      const dX1 = ws.dX1;
      for (let i = 0; i < T * dim; i++) dX1[i] = dX[i];
      layerNormB(c.x1, T, dim, b.ln2G, c.ln2M, c.ln2R, c.dLn2Out, dX1, grads[`b${l}.ln2G`], grads[`b${l}.ln2B`]);
      c.dAttnOut.fill(0);
      matmulB(c.attnOut, T, dim, b.wproj, dim, dX1, c.dAttnOut, gWproj, gBproj);
      const dQkv = c.dQkv; dQkv.fill(0);
      const qkv = c.qkv, att = c.att, dAttnOut = c.dAttnOut, dP = ws.dP;
      const D3 = 3 * dim;
      for (let h = 0; h < heads; h++) {
        const qOff = h * hd, kOff = dim + h * hd, vOff = 2 * dim + h * hd;
        for (let t = 0; t < T; t++) {
          const ao = (h * T + t) * T;
          const oo = t * dim + h * hd;
          let dpDotP = 0;
          for (let s = 0; s <= t; s++) {
            let acc = 0;
            const vo = s * D3 + vOff;
            const w = att[ao + s];
            for (let d = 0; d < hd; d++) {
              const dv = dAttnOut[oo + d];
              acc += dv * qkv[vo + d];
              dQkv[vo + d] += w * dv;
            }
            dP[s] = acc;
            dpDotP += acc * w;
          }
          const qo = t * D3 + qOff;
          for (let s = 0; s <= t; s++) {
            const dScore = att[ao + s] * (dP[s] - dpDotP) * scale;
            const ko = s * D3 + kOff;
            for (let d = 0; d < hd; d++) {
              dQkv[qo + d] += dScore * qkv[ko + d];
              dQkv[ko + d] += dScore * qkv[qo + d];
            }
          }
        }
      }
      c.dLn1Out.fill(0);
      matmulB(c.ln1Out, T, dim, b.wqkv, 3 * dim, dQkv, c.dLn1Out, gWqkv, gBqkv);
      const dX0 = ws.dX;
      for (let i = 0; i < T * dim; i++) dX0[i] = dX1[i];
      layerNormB(l === 0 ? ws.X[0] : ws.X[l], T, dim, b.ln1G, c.ln1M, c.ln1R, c.dLn1Out, dX0, grads[`b${l}.ln1G`], grads[`b${l}.ln1B`]);
      dX = dX0;
    }
    for (let t = 0; t < T; t++) {
      const eo = seq[t] * dim, po = t * dim, xo = t * dim;
      for (let d = 0; d < dim; d++) {
        grads.tokEmb[eo + d] += dX[xo + d];
        grads.posEmb[po + d] += dX[xo + d];
      }
    }
  }

  const meanLoss = totalCount > 0 ? totalLoss / totalCount : 0;
  if (backward && totalCount > 0) {
    const inv = 1 / totalCount;
    for (const k in grads) {
      const g = grads[k];
      for (let i = 0; i < g.length; i++) g[i] *= inv;
    }
  }
  return { loss: meanLoss, grads, count: totalCount };
}

// NOTE: forward for sequence si overwrites workspace of sequence si-1, so the
// backward pass runs inside the same per-sequence loop iteration (it does — see
// structure above: forward then backward per sequence before the next begins).

// ---------- Adam optimizer ----------
function createAdam(model, lr) {
  // b1t/b2t track beta^t incrementally — Math.pow is not guaranteed correctly
  // rounded, plain multiplication is, and determinism is a feature here.
  const state = { t: 0, lr, m: {}, v: {}, b1t: 1, b2t: 1 };
  for (const [name, a] of paramList(model)) {
    state.m[name] = f32(a.length);
    state.v[name] = f32(a.length);
  }
  return state;
}
function adamStep(model, grads, adam, clip) {
  adam.t++;
  adam.b1t *= 0.9; adam.b2t *= 0.99;
  const eps = 1e-8;
  const bc1 = 1 - adam.b1t, bc2 = 1 - adam.b2t;
  let scale = 1;
  if (clip) {
    let sq = 0;
    for (const k in grads) { const g = grads[k]; for (let i = 0; i < g.length; i++) sq += g[i] * g[i]; }
    const norm = Math.sqrt(sq);
    if (norm > clip) scale = clip / norm;
  }
  const lr = adam.lr;
  for (const [name, a] of paramList(model)) {
    const g = grads[name], m = adam.m[name], v = adam.v[name];
    for (let i = 0; i < a.length; i++) {
      const gi = g[i] * scale;
      const mi = 0.9 * m[i] + 0.1 * gi;
      const vi = 0.99 * v[i] + 0.01 * gi * gi;
      m[i] = mi; v[i] = vi;
      a[i] -= lr * (mi / bc1) / (Math.sqrt(vi / bc2) + eps);
    }
  }
}

// ---------- inference ----------
function forwardLast(model, ids, wantAtt) {
  const { vocab, ctx, dim, heads, layers, mlp } = model.cfg;
  const p = model.p;
  const T = Math.min(ids.length, ctx);
  const start = ids.length - T;
  const hd = dim / heads, scale = 1 / Math.sqrt(hd);
  let x = f32(T * dim);
  for (let t = 0; t < T; t++) {
    const eo = ids[start + t] * dim, po = t * dim, xo = t * dim;
    for (let d = 0; d < dim; d++) x[xo + d] = p.tokEmb[eo + d] + p.posEmb[po + d];
  }
  const attMaps = wantAtt ? [] : null;
  const scratchLn = f32(T * dim), m = f32(T), r = f32(T);
  const D3 = 3 * dim;
  for (let l = 0; l < layers; l++) {
    const b = p.blocks[l];
    layerNormF(x, T, dim, b.ln1G, b.ln1B, scratchLn, m, r);
    const qkv = f32(T * D3);
    matmulF(scratchLn, T, dim, b.wqkv, D3, b.bqkv, qkv);
    const attnOut = f32(T * dim);
    const layerAtt = wantAtt ? [] : null;
    for (let h = 0; h < heads; h++) {
      const qOff = h * hd, kOff = dim + h * hd, vOff = 2 * dim + h * hd;
      const headAtt = wantAtt ? f32(T * T) : null;
      const row = f32(T);
      for (let t = 0; t < T; t++) {
        const qo = t * D3 + qOff;
        let maxv = -Infinity;
        for (let s = 0; s <= t; s++) {
          let dot = 0;
          const ko = s * D3 + kOff;
          for (let d = 0; d < hd; d++) dot += qkv[qo + d] * qkv[ko + d];
          dot *= scale;
          row[s] = dot;
          if (dot > maxv) maxv = dot;
        }
        let sum = 0;
        for (let s = 0; s <= t; s++) { row[s] = EXP(row[s] - maxv); sum += row[s]; }
        const inv = 1 / sum;
        for (let s = 0; s <= t; s++) row[s] *= inv;
        if (wantAtt) for (let s = 0; s <= t; s++) headAtt[t * T + s] = row[s];
        const oo = t * dim + h * hd;
        for (let d = 0; d < hd; d++) attnOut[oo + d] = 0;
        for (let s = 0; s <= t; s++) {
          const w = row[s], vo = s * D3 + vOff;
          for (let d = 0; d < hd; d++) attnOut[oo + d] += w * qkv[vo + d];
        }
      }
      if (wantAtt) layerAtt.push(headAtt);
    }
    if (wantAtt) attMaps.push(layerAtt);
    const proj = f32(T * dim);
    matmulF(attnOut, T, dim, b.wproj, dim, b.bproj, proj);
    for (let i = 0; i < T * dim; i++) x[i] += proj[i];
    layerNormF(x, T, dim, b.ln2G, b.ln2B, scratchLn, m, r);
    const h1 = f32(T * mlp);
    matmulF(scratchLn, T, dim, b.w1, mlp, b.b1, h1);
    for (let i = 0; i < T * mlp; i++) h1[i] = gelu(h1[i]);
    const mlpOut = f32(T * dim);
    matmulF(h1, T, mlp, b.w2, dim, b.b2, mlpOut);
    for (let i = 0; i < T * dim; i++) x[i] += mlpOut[i];
  }
  layerNormF(x, T, dim, p.lnfG, p.lnfB, scratchLn, m, r);
  const logits = f32(vocab);
  const xo = (T - 1) * dim;
  for (let v = 0; v < vocab; v++) {
    let acc = p.headB[v];
    for (let d = 0; d < dim; d++) acc += scratchLn[xo + d] * p.head[d * vocab + v];
    logits[v] = acc;
  }
  return { logits, attMaps, T, start };
}

function softmaxTemp(logits, temp) {
  const n = logits.length;
  const out = new Float64Array(n);
  const t = Math.max(temp, 1e-4);
  let maxv = -Infinity;
  for (let i = 0; i < n; i++) if (logits[i] > maxv) maxv = logits[i];
  let sum = 0;
  for (let i = 0; i < n; i++) { out[i] = EXP((logits[i] - maxv) / t); sum += out[i]; }
  for (let i = 0; i < n; i++) out[i] /= sum;
  return out;
}
function sampleFrom(probs, rng) {
  let r = rng();
  for (let i = 0; i < probs.length; i++) { r -= probs[i]; if (r <= 0) return i; }
  return probs.length - 1;
}
function argmax(a) {
  let bi = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[bi]) bi = i;
  return bi;
}
function generate(model, ids, n, temp, rng, stopId) {
  const out = ids.slice();
  const gen = [];
  for (let i = 0; i < n; i++) {
    const { logits } = forwardLast(model, out, false);
    let id;
    if (temp === 0) id = argmax(logits);
    else id = sampleFrom(softmaxTemp(logits, temp), rng);
    out.push(id); gen.push(id);
    if (stopId != null && id === stopId) break;
  }
  return gen;
}

// ---------- serialization ----------
function serialize(model) {
  const parts = [];
  for (const [, a] of paramList(model)) parts.push(a);
  const total = parts.reduce((s, a) => s + a.length, 0);
  const buf = new Float32Array(total);
  let o = 0;
  for (const a of parts) { buf.set(a, o); o += a.length; }
  return { cfg: model.cfg, data: buf };
}
function deserialize(cfg, buf) {
  const model = createModel(cfg);
  let o = 0;
  for (const [, a] of paramList(model)) { a.set(buf.subarray(o, o + a.length)); o += a.length; }
  return model;
}
function cloneModel(model) {
  const s = serialize(model);
  return deserialize({ ...model.cfg }, s.data.slice());
}

const api = {
  makeRng, randn, createModel, paramList, paramCount,
  batchForwardBackward, createAdam, adamStep, forwardLast, softmaxTemp,
  sampleFrom, argmax, generate, serialize, deserialize, cloneModel,
};
if (typeof module !== 'undefined') module.exports = api;
if (typeof self !== 'undefined') self.GB = api;
