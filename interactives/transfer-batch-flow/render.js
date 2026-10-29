(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  function diagram(s, extent, selected) {
    const left = 42, width = 510, x = t => left + t / extent * width;
    const bars = s.jobs.map(j => [
      ['A', j.aStart, j.aEnd, 30], ['B', j.bStart, j.bEnd, 88]
    ].map(([station, start, end, y]) => `<g data-job="${j.id}" data-station="${station}" data-start="${start}" data-end="${end}" class="tb-job${j.id === selected ? ' tb-selected' : ''}"><title>Job ${j.id}, station ${station}: ${start}–${end} min</title><rect x="${x(start)}" y="${y}" width="${x(end)-x(start)}" height="25" class="tb-${station.toLowerCase()}"/>${x(end)-x(start) >= 14 ? `<text x="${(x(start)+x(end))/2}" y="${y+17}" text-anchor="middle">${j.id}</text>` : ''}</g>`).join('')).join('');
    const gates = s.gates.map(g => `<path class="tb-gate" data-release="${g.time}" d="M${x(g.time)} 57V84"><title>Jobs ${g.first}–${g.last} transfer at ${g.time} min</title></path>`).join('');
    const ticks = [...new Set([0, Math.round(extent/4), Math.round(extent/2), Math.round(3*extent/4), extent])];
    return `<svg class="tb-diagram" viewBox="0 0 570 150" role="img" aria-label="${esc(`Transfer ${s.batch} at a time: A on top, B below. First job finishes ${s.first} min; full order ${s.last} min.`)}" focusable="false"><text x="10" y="47">A</text><text x="10" y="105">B</text><path class="tb-axis" d="M42 118H552"/>${ticks.map(t => `<path class="tb-axis" d="M${x(t)} 118v4"/><text x="${x(t)}" y="140" text-anchor="middle">${t}</text>`).join('')}${gates}${bars}</svg>`;
  }
  function card(s, extent, selected, title) {
    return `<div class="tb-case"><h4>${esc(title)}</h4><p class="tb-metrics"><span>First item <strong>${s.first} min</strong></span><span>Full order <strong>${s.last} min</strong></span><span>Processing / job <strong>${s.processing} min</strong></span></p><div class="tb-scroll" tabindex="0" role="region" aria-label="${esc(title)} station timeline, minutes from order release">${diagram(s, extent, selected)}</div></div>`;
  }
  function comparison(baseline, current, selected) {
    const extent = Math.max(baseline.last, current.last);
    return card(baseline, extent, selected, `Transfer all ${baseline.n} jobs`) + card(current, extent, selected, `Transfer ${current.batch} at a time`);
  }
  function detail(s, selected) {
    const j = s.jobs[selected - 1];
    return `<p class="tb-equation"><strong>Job ${j.id}: ${j.bEnd} min elapsed</strong> = ${j.beforeA} waiting before A + ${s.a} at A + ${j.held} held for batch + ${j.atB} waiting at B + ${s.b} at B.</p><p>It leaves A at ${j.aEnd}, transfers at ${j.release}, starts B at ${j.bStart} and finishes at ${j.bEnd} min. Total waiting: <strong>${j.waiting} min</strong>; processing: <strong>${s.processing} min</strong>.</p>`;
  }
  function table(s) {
    return `<div class="tb-scroll" tabindex="0" role="region" aria-label="Exact job schedule, all times in minutes"><table class="unit-table"><caption>Transfer ${s.batch} at a time · minutes from order release at 0</caption><thead><tr><th scope="col">Job</th><th scope="col">A start–end</th><th scope="col">Transfer</th><th scope="col">B start–end</th><th scope="col">Wait before A</th><th scope="col">Held for batch</th><th scope="col">Wait at B</th><th scope="col">Total wait</th></tr></thead><tbody>${s.jobs.map(j => `<tr><th scope="row">${j.id}</th><td>${j.aStart}–${j.aEnd}</td><td>${j.release}</td><td>${j.bStart}–${j.bEnd}</td><td>${j.beforeA}</td><td>${j.held}</td><td>${j.atB}</td><td>${j.waiting}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const api = Object.freeze({diagram, card, comparison, detail, table});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiTransferBatchRender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
