(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiHoleCallout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const types = ['through', 'blind', 'counterbore', 'countersink', 'spotface'];
  const defaults = Object.freeze({ type: 'counterbore', count: 2, diameter: .300,
    recess: .600, depth: .150, angle: 90, thickness: .800 });
  const inch = n => n.toFixed(3).replace(/^0\./, '.');
  function calculate(input) {
    const p = { ...defaults, ...input };
    const errors = [];
    if (!types.includes(p.type)) return { ok: false, errors: ['Choose a listed hole type.'] };
    const active = ['count', 'diameter', 'thickness'];
    if (['blind', 'counterbore', 'spotface'].includes(p.type)) active.push('depth');
    if (['counterbore', 'countersink', 'spotface'].includes(p.type)) active.push('recess');
    if (p.type === 'countersink') active.push('angle');
    for (const name of active) {
      if (p[name] === '' || p[name] == null || !Number.isFinite(Number(p[name]))) errors.push(`Enter a finite ${name}.`);
      p[name] = Number(p[name]);
    }
    if (!Number.isInteger(p.count) || p.count < 1 || p.count > 12) errors.push('Use a whole feature count from 1 to 12.');
    for (const name of active.filter(n => !['count', 'angle'].includes(n))) {
      if (!(p[name] >= .01 && p[name] <= 4)) errors.push(`${name}: use .010 to 4.000 in for this teaching model.`);
      else if (Math.abs(p[name] * 1000 - Math.round(p[name] * 1000)) > 1e-7) errors.push(`${name}: use at most three decimal places.`);
    }
    if (active.includes('recess') && p.recess <= p.diameter) errors.push('The recess diameter must exceed the main hole diameter.');
    if (active.includes('depth') && p.depth >= p.thickness) errors.push('The stated depth must be less than the part thickness.');
    if (p.type === 'countersink' && (!Number.isInteger(p.angle) || p.angle < 30 || p.angle > 150)) errors.push('Use a whole included angle from 30° to 150°.');
    if (errors.length) return { ok: false, errors };
    // The drill point is illustrative; its angle is not a requirement in the callout.
    const pointDepth = p.type === 'blind' ? p.diameter / (2 * Math.tan(59 * Math.PI / 180)) : 0;
    let recessDepth = ['counterbore', 'spotface'].includes(p.type) ? p.depth : 0;
    if (p.type === 'countersink') recessDepth = (p.recess - p.diameter) / (2 * Math.tan(p.angle * Math.PI / 360));
    if (p.type === 'blind' && p.depth + pointDepth >= p.thickness) errors.push('This illustrated 118° drill point would break through. Increase thickness or reduce the blind depth or diameter.');
    if (p.type === 'countersink' && recessDepth >= p.thickness) errors.push('This countersink would reach through the part. Increase thickness or reduce its diameter.');
    if (errors.length) return { ok: false, errors };
    const prefix = p.count > 1 ? `${p.count}X ` : '';
    const lines = [`${prefix}⌀${inch(p.diameter)} ${p.type === 'blind' ? `↧ ${inch(p.depth)}` : 'THRU'}`];
    if (p.type === 'counterbore') lines.push(`⌴ ⌀${inch(p.recess)} ↧ ${inch(p.depth)}`);
    if (p.type === 'spotface') lines.push(`SPOTFACE ⌀${inch(p.recess)} ↧ ${inch(p.depth)}`);
    if (p.type === 'countersink') lines.push(`⌵ ⌀${inch(p.recess)} × ${p.angle}°`);
    const reading = `${p.count} ${p.count === 1 ? 'hole' : 'holes'}, each ${inch(p.diameter)} in diameter, ` +
      (p.type === 'blind' ? `${inch(p.depth)} in deep to full diameter.` : 'through the part.') +
      (['counterbore', 'spotface'].includes(p.type) ? ` Each ${p.type} is ${inch(p.recess)} in diameter and ${inch(p.depth)} in deep.` : '') +
      (p.type === 'countersink' ? ` Each countersink is ${inch(p.recess)} in major diameter with a ${p.angle}° included angle.` : '');
    return { ok: true, parameters: p, lines, reading, recessDepth, pointDepth };
  }
  function sketch(result) {
    if (!result.ok) return '';
    const p = result.parameters;
    const widest = ['counterbore', 'countersink', 'spotface'].includes(p.type) ? p.recess : p.diameter;
    const blockWidth = Math.max(widest * 1.65, p.thickness * 1.6);
    const scale = Math.min(380 / blockWidth, 190 / p.thickness);
    const cx = 260, top = 50, bottom = top + p.thickness * scale;
    const left = cx - blockWidth * scale / 2, right = cx + blockWidth * scale / 2;
    const r = p.diameter * scale / 2, R = widest * scale / 2;
    const floor = top + result.recessDepth * scale;
    let shape;
    if (p.type === 'blind') {
      const full = top + p.depth * scale, tip = full + result.pointDepth * scale;
      shape = `M${left} ${top}H${cx-r}V${full}L${cx} ${tip}L${cx+r} ${full}V${top}H${right}V${bottom}H${left}Z`;
    } else if (p.type === 'countersink') {
      shape = `M${left} ${top}H${cx-R}L${cx-r} ${floor}V${bottom}H${left}Z M${cx+R} ${top}H${right}V${bottom}H${cx+r}V${floor}Z`;
    } else if (['counterbore', 'spotface'].includes(p.type)) {
      shape = `M${left} ${top}H${cx-R}V${floor}H${cx-r}V${bottom}H${left}Z M${cx+R} ${top}H${right}V${bottom}H${cx+r}V${floor}H${cx+R}Z`;
    } else shape = `M${left} ${top}H${cx-r}V${bottom}H${left}Z M${cx+r} ${top}H${right}V${bottom}H${cx+r}Z`;
    return `<svg viewBox="0 0 520 295" role="img" aria-label="Section of one ${p.type} hole. ${result.reading}"><text x="16" y="24">SECTION THROUGH ONE HOLE · inches</text><path class="hc-material" d="${shape}"/><path class="hc-axis" d="M${cx} 36V${bottom+14}"/><path class="hc-measure" d="M${cx-r} ${bottom+25}H${cx+r}m0 -4v8m${-2*r} -8v8"/><text x="${cx}" y="${bottom+48}" text-anchor="middle">⌀${inch(p.diameter)}</text></svg>`;
  }
  return { defaults, calculate, sketch, inch };
});
