(function (root) {
  'use strict';
  const limits = Object.freeze({ fixed: 100000, variable: 1000, quantity: 10000, chartQuantity: 300 });
  // The operation is shared by the legacy dollar API and the bounded cent model.
  function totalCost(fixed, variable, quantity) { return fixed + variable * quantity; }
  function compare(q) {
    if (!Number.isInteger(q) || q < 1) throw new RangeError('Quantity must be a positive whole number.');
    const a = totalCost(120, 8, q), b = totalCost(720, 3, q);
    return { quantity: q, a, b, unitA: a / q, unitB: b / q, cheaper: a === b ? 'tie' : a < b ? 'A' : 'B' };
  }
  function moneyCents(value, maximum) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const text = String(value).trim();
    if (!/^(?:\d+|\d*\.\d{1,2})$/.test(text)) return null;
    const parts = text.split('.');
    const cents = Number(parts[0] || 0) * 100 + Number((parts[1] || '').padEnd(2, '0'));
    return Number.isSafeInteger(cents) && cents <= maximum * 100 ? cents : null;
  }
  function validate(input) {
    input = input || {};
    const fields = { fixedA: limits.fixed, variableA: limits.variable, fixedB: limits.fixed, variableB: limits.variable };
    const values = {}, errors = {};
    Object.keys(fields).forEach(key => {
      values[key] = moneyCents(input[key], fields[key]);
      if (values[key] === null) errors[key] = 'Enter $0 to $' + fields[key].toLocaleString('en-US') + ' with at most two decimal places.';
    });
    const raw = input.quantity;
    const q = (typeof raw === 'number' || typeof raw === 'string') && /^\d+$/.test(String(raw).trim()) ? Number(raw) : NaN;
    if (!Number.isInteger(q) || q < 1 || q > limits.quantity) errors.quantity = 'Enter a whole demanded quantity from 1 to 10,000 parts.';
    values.quantity = q;
    return { valid: Object.keys(errors).length === 0, values, errors };
  }
  function atQuantity(values, q) {
    const aCents = totalCost(values.fixedA, values.variableA, q);
    const bCents = totalCost(values.fixedB, values.variableB, q);
    return { quantity: q, aCents, bCents, unitACents: q === 0 ? null : aCents / q, unitBCents: q === 0 ? null : bCents / q,
      differenceCents: aCents - bCents, cheaper: aCents === bCents ? 'tie' : aCents < bCents ? 'A' : 'B' };
  }
  function crossing(values) {
    const numerator = values.fixedB - values.fixedA;
    const denominator = values.variableA - values.variableB;
    if (denominator === 0) return { kind: numerator === 0 ? 'all' : 'parallel', quantity: null, neighbors: [] };
    const q = numerator / denominator;
    if (q <= 0) return { kind: 'nonpositive', quantity: q, neighbors: [] };
    const whole = numerator % denominator === 0;
    const qs = whole ? [q - 1, q, q + 1] : [Math.floor(q), Math.ceil(q)];
    return { kind: 'positive', quantity: q, whole, numerator, denominator,
      inChart: q <= limits.chartQuantity,
      neighbors: qs.filter(n => n >= 1).map(n => atQuantity(values, n)) };
  }
  // Invalid UI input is data, not an exception; callers clear any previous result.
  function evaluate(input) {
    const checked = validate(input);
    if (!checked.valid) return { valid: false, errors: checked.errors };
    const values = checked.values;
    return { valid: true, values, result: atQuantity(values, values.quantity), crossing: crossing(values),
      chart: [atQuantity(values, 0), atQuantity(values, limits.chartQuantity)] };
  }
  const scenarios = Object.freeze([
    { id: 'original', title: 'Original comparison', fixedA: '120', variableA: '8', fixedB: '720', variableB: '3', quantity: '120' },
    { id: 'fractional', title: 'Between whole parts', fixedA: '90', variableA: '6', fixedB: '245', variableB: '2', quantity: '39' },
    { id: 'parallel', title: 'Same variable cost', fixedA: '60', variableA: '4', fixedB: '210', variableB: '4', quantity: '60' },
    { id: 'dominated', title: 'Lower setup and variable cost', fixedA: '80', variableA: '2', fixedB: '200', variableB: '5', quantity: '60' },
    { id: 'tie', title: 'Same costs throughout', fixedA: '150', variableA: '3.50', fixedB: '150', variableB: '3.50', quantity: '60' },
    { id: 'beyond', title: 'Crossing beyond the chart', fixedA: '100', variableA: '2.50', fixedB: '900', variableB: '2', quantity: '300' }
  ].map(row => Object.freeze(row)));
  const api = Object.freeze({ compare, evaluate, validate, limits, scenarios });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CourseWikiProcessBreakEven = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
