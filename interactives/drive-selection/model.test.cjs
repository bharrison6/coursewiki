const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { evaluate, defaults, options } = require('./model.js');
const drive = (input, id) => evaluate(input).drives.find(d => d.id === id);

test('layout and synchronization exclusions hold in every one of 60 scenarios', () => {
  let count = 0;
  for (const distance of options.distance) for (const timing of options.timing)
    for (const speed of options.speed) for (const environment of options.environment) {
      const input = { distance, timing, speed, environment };
      const result = evaluate(input);
      assert.equal(result.drives.length, 4);
      assert.equal(drive(input, 'friction').fit === 'excluded', timing === 'exact');
      assert.equal(drive(input, 'gear').fit === 'excluded', distance === 'separated');
      for (const d of result.drives) {
        assert.ok(d.reasons.length);
        assert.ok(d.status);
        if (environment !== 'sheltered' && (d.id === 'chain' || d.id === 'gear')) assert.ok(d.cautions.length);
      }
      count++;
    }
  assert.equal(count, 60);
});

test('printed example and single-constraint changes tell the same story', () => {
  assert.equal(drive(defaults, 'friction').fit, 'excluded');
  assert.equal(drive(defaults, 'gear').fit, 'excluded');
  assert.notEqual(drive(defaults, 'timing').fit, 'excluded');
  assert.match(drive(defaults, 'chain').cautions.join(' '), /lubrication conflicts/);
  assert.notEqual(drive({ ...defaults, timing: 'flexible' }, 'friction').fit, 'excluded');
  assert.notEqual(drive({ ...defaults, distance: 'close' }, 'gear').fit, 'excluded');
  assert.match(drive({ speed: 'high', distance: 'close' }, 'gear').cautions.join(' '), /thrust bearings/);
  assert.match(drive({ timing: 'exact' }, 'chain').cautions.join(' '), /speed ripple/);
});

test('invalid inputs fail explicitly; evaluation does not retain another instance state', () => {
  for (const key of Object.keys(options)) assert.throws(() => evaluate({ [key]: 'unknown' }), RangeError);
  const input = { ...defaults };
  const expected = evaluate(input);
  evaluate({ distance: 'close', timing: 'flexible', speed: 'high', environment: 'hot' });
  assert.deepEqual(evaluate(input), expected);
  assert.deepEqual(input, defaults);
});

test('all 12 practice keys recompute; printed rounding is accepted and wrong methods rejected', () => {
  const bank = fs.readFileSync(path.join(__dirname, '../../practice/belt-chain-and-gear-drives.html'), 'utf8');
  // Independent calculations and intentional wrong-method controls, not copied answer keys.
  const checks = [
    ['drive-select-timing', 2, 2, [1, 3, 4]],
    ['drive-select-friction', 1, 1, [2, 3, 4]],
    ['drive-select-chain', 3, 3, [1, 2, 4]],
    ['drive-select-helical', 4, 4, [1, 2, 3]],
    ['drive-chain25-pitch', 2 / 8, .250, [25 / 8, .25 * 25.4]],
    ['drive-chain35-pitch', 3 / 8, .375, [35 / 8, .35]],
    ['drive-chain40-pitch', 4 / 8, .500, [40 / 8, 2 * 4 / 8]],
    ['drive-chain08b-pitch', 8 / 16 * 25.4, 12.70, [8, .5]],
    ['drive-chain-reduction', 55 / 22, 2.50, [22 / 55]],
    ['drive-chain-speed', 980 * 21 / 49, 420, [980 * 49 / 21]],
    ['drive-timing-speed', 1440 * 28 / 60, 672, [1440 * 60 / 28]],
    ['drive-friction-speed', 1680 * 90 / 210, 720, [1680 * 210 / 90]]
  ];
  const blocks = [...bank.matchAll(/<div\b[^>]*data-practice-id="([^"]+)"[^>]*>/g)];
  assert.equal(blocks.length, checks.length, 'positive control: all authored problems parsed');
  for (const [id, expected, rounded, wrong] of checks) {
    const block = blocks.find(m => m[1] === id);
    assert.ok(block, id);
    const answer = Number(/data-answer="([^"]+)"/.exec(block[0])[1]);
    const tolerance = Number(/data-tolerance="([^"]+)"/.exec(block[0])[1]);
    assert.ok(Math.abs(answer - expected) < 1e-10, id + ': independently calculated key');
    assert.ok(Math.abs(rounded - answer) <= tolerance, id + ': printed answer');
    assert.ok(tolerance >= 0 && tolerance <= .5);
    for (const bad of wrong) assert.ok(Math.abs(bad - answer) > tolerance, id + ': wrong-method control');
  }
});
