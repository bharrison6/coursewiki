(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiBearingLife = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DEFAULT = Object.freeze({ type: 'ball', C: 14, P: 2, speed: 1500, hours: 8, days: 250 });
  function exponent(type) {
    if (type !== 'ball' && type !== 'roller') throw new RangeError('Choose ball or roller.');
    return type === 'ball' ? 3 : 10 / 3;
  }
  function positive(value) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError('All numeric inputs must be finite and greater than zero.');
  }
  function solve(s) {
    const p = exponent(s.type);
    ['C', 'P', 'speed', 'hours', 'days'].forEach(k => positive(s[k]));
    if (s.hours > 24 || s.days > 366) throw new RangeError('Duty must be at most 24 h/day and 366 days/year.');
    const ratio = s.C / s.P, life = ratio ** p, lifeHours = life * 1e6 / (60 * s.speed);
    const years = lifeHours / (s.hours * s.days);
    [ratio, life, lifeHours, years].forEach(positive);
    return { p, ratio, life, lifeHours, years };
  }
  function requiredRating(P, life, type) {
    positive(P); positive(life);
    const rating = P * life ** (1 / exponent(type)); positive(rating); return rating;
  }
  const format = value => Number(value.toPrecision(4)).toString();
  return { DEFAULT, exponent, solve, requiredRating, format };
});
