(function (root) {
  'use strict';
  const defaults = Object.freeze({n: 10, batch: 1, a: 4, b: 6});
  // Minutes from the common order release at 0. Jobs retain their order at B.
  function schedule({n, batch, a, b}) {
    if (!Number.isInteger(n) || n < 1 || n > 20) throw new RangeError('Order size must be 1–20 whole jobs.');
    if (!Number.isInteger(batch) || batch < 1 || batch > n) throw new RangeError('Transfer size must be 1–order size whole jobs.');
    if (![a, b].every(t => Number.isInteger(t) && t >= 1 && t <= 20)) throw new RangeError('Station times must be 1–20 whole minutes per job.');
    const jobs = [], gates = [];
    let finish = 0;
    for (let first = 1; first <= n; first += batch) {
      const last = Math.min(first + batch - 1, n);
      gates.push({first, last, time: last * a});
      for (let id = first; id <= last; id++) {
        const aStart = (id - 1) * a, aEnd = id * a, release = last * a;
        const bStart = Math.max(release, finish), bEnd = bStart + b;
        const beforeA = aStart, held = release - aEnd, atB = bStart - release;
        jobs.push({id, aStart, aEnd, release, bStart, bEnd, beforeA, held, atB, waiting: beforeA + held + atB});
        finish = bEnd;
      }
    }
    return {n, batch, a, b, jobs, gates, processing: a + b, first: jobs[0].bEnd, last: finish};
  }
  const api = Object.freeze({defaults, schedule});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiTransferBatch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
