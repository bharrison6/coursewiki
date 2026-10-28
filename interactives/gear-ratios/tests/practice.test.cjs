'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const html = fs.readFileSync(path.join(__dirname, '../../../practice/rotation-and-torque.html'), 'utf8');
const cases = [
  ['gear-single-ratio', 54 / 18, 0.005, [18/54]],
  ['gear-single-speed', 1350 * 18 / 54, 0.05, [1350*3]],
  ['gear-single-torque', 6.4 * 54 / 18, 0.005, [6.4/3]],
  ['gear-step-up-torque', 15 * (16 / 48) * .94, 0.005, [15*3*.94,15/3]],
  ['gear-compound-ratio', (50 / 20) * (60 / 24), 0.005, [2.5+2.5,1/6.25,60/20]],
  ['gear-shaft-speed', 1500 * 20 / 50, 0.05, [600*.97,1500/(6.25),600*50/24]],
  ['gear-shaft-torque', 8 * (50 / 20) * .97, 0.005, [8*2.5,8/2.5*.97,8*2.5*.97**2]],
  ['gear-compound-speed', 1500 / ((50 / 20) * (60 / 24)), 0.05, [240*.97**2,1500*6.25,240*.97]],
  ['gear-compound-torque', 8 * (50 / 20) * (60 / 24) * .97**2, 0.0005, [50*(.97+.97),50*.97,50*(1-.03-.03),8/6.25*.97**2,50]],
  ['gear-idler-direction', 1100 * 22 / 55, 0.5, [-440,1100/((33/22)*(55/22)),1100*2.5]],
  ['gear-two-idlers-direction', -900 * 18 / 54, 0.5, [300,-2700,-900/((30/18)*(42/18)*(54/18))]],
  ['gear-idler-efficiency', 100 * .95**3, 0.005, [100*.95**2,95,285,85,100*.95**4]],
  ['gear-idler-torque', 7 * (60 / 20) * (48 / 24) * .95**3, 0.005, [42*.95**2,42*.95**4,42*.95,42*(.95+.95+.95),7/6*.95**3,42*.95**3*(30/20)]],
  ['gear-three-stage-efficiency', 100 * .96**3, 0.005, [96,288,88]],
  ['gear-three-stage-loss', 100 * (1 - .98**3), 0.005, [6,2,94.1192,294]],
  ['gear-mixed-efficiency', 100 * .94 * .97 * .99, 0.005, [94+97+99,(94+97+99)/3,90]],
  ['gear-three-stage-torque', 5 * 2 * 3 * 2 * .96**3, 0.005, [60,60*.96,60*(.96+.96+.96),60*.88,5/12*.96**3]],
  ['gear-three-stage-speed', 1800 / (2 * 3 * 2), 0.05, [150*.96**3,1800*12,150*.96]],
  ['gear-three-stage-power', 1600 * .96**3, 0.057600000001, [1600*.96,1600*(.96+.96+.96),1600*.88,1600*.96**6]],
  ['gear-required-input-torque', 80 / (10 * .95**2), 0.0005, [80/10*.95**2,80*10/.95**2,80/(10*.95),80/(10*(.95+.95))]],
  ['gear-winch-stage-count', 3, 0, [1,2,4]],
  ['gear-winch-teeth', 50 / ((48 / 12) * (60 / 15)) * 16, 0, [16/3.125,50/.97**3,50*.97**3,60]],
  ['gear-winch-speed', 1920 / ((48 / 12) * (60 / 15) * (50 / 16)), 0.005, [38.4*.97**3,1920*50,38.4/.97**3]],
  ['gear-winch-torque', 18 * (48 / 12) * (60 / 15) * (50 / 16) * .97**3, 0.024300000001, [900,900*.97,900*(.97+.97+.97),900*.91,18/50*.97**3]],
  ['gear-winch-torque-bound', 800 / (18 * .97**3), 0.001008068, [800/18,800/18*.97**3,800/(18*.97),800/(18*(.97+.97+.97))]],
  ['gear-winch-design-choice', 50, 0.005, [48,54,1/50]]
];
const passes = (attempt, answer, tolerance) => Math.abs(attempt - answer) <= tolerance;
test('practice-check instrument admits rounded answers and rejects a planted wrong value', () => {
  assert.equal(passes(1.23, 1.234, .005), true);
  assert.equal(passes(2.34, 1.234, .005), false);
});
test('the eleven original items and their surrounding body remain intact', () => {
  const original = html.split('@@END')[1].split('<!-- GEAR-TRAIN-PRACTICE -->')[0].replace(/\r\n/g, '\n').trim();
  assert.equal(crypto.createHash('sha256').update(original).digest('hex'), '3ff06cb4083e9381b92b9a4db2187888db1d682f9a7704ac400900f6a2b8fa8b');
  assert.equal((original.match(/data-practice-id=/g) || []).length, 11);
  assert.equal((html.match(/data-practice-id=/g) || []).length, 37);
});
for (const [id, expected, tolerance, wrong] of cases) {
  test(id + ': independent arithmetic, displayed rounding, and wrong methods', () => {
    const start = html.indexOf('id="' + id + '"');
    assert.ok(start >= 0, id);
    const panel = html.slice(start, html.indexOf('</div>', start));
    const answer = Number(panel.match(/data-answer="([^"]+)"/)[1]);
    const actualTolerance = Number(panel.match(/data-tolerance="([^"]+)"/)[1]);
    const printed = Number(panel.match(/Enter <strong>([-\d.]+)/)[1]);
    assert.ok(Math.abs(answer - expected) < 1e-9, id + ': recomputed value');
    assert.equal(actualTolerance, tolerance);
    assert.equal(passes(printed, answer, tolerance), true, 'printed answer is accepted');
    for (const value of wrong) assert.equal(passes(value, answer, tolerance), false, 'reject ' + value);
  });
}
// Round total efficiency first, then round the requested final answer.
const efficiencyRoundingCases = [
  ['gear-compound-torque', .97**2, eta => 50*eta, 3, 47.045],
  ['gear-idler-efficiency', .95**3, eta => 100*eta, 2, 85.74],
  ['gear-idler-torque', .95**3, eta => 42*eta, 2, 36.01],
  ['gear-three-stage-efficiency', .96**3, eta => 100*eta, 2, 88.47],
  ['gear-three-stage-loss', .98**3, eta => 100*(1-eta), 2, 5.88],
  ['gear-mixed-efficiency', .94*.97*.99, eta => 100*eta, 2, 90.27],
  ['gear-three-stage-torque', .96**3, eta => 60*eta, 2, 53.08],
  ['gear-three-stage-power', .96**3, eta => 1600*eta, 2, 1415.52],
  ['gear-required-input-torque', .95**2, eta => 80/(10*eta), 3, 8.864],
  ['gear-winch-torque', .97**3, eta => 900*eta, 2, 821.43],
  ['gear-winch-torque-bound', .97**3, eta => 800/(18*eta), 3, 48.696]
];
const additionalWrongMethods = {
  'gear-three-stage-power': {
    'summed efficiency': 1600*(.96+.96+.96),
    'averaged efficiency': 1600*(.96+.96+.96)/3,
    'efficiency applied to speed as well as torque': 1600*.96**6,
    'ideal power': 1600,
    'missing mesh factor': 1600*.96**2,
    'extra mesh factor': 1600*.96**4,
    'inverted efficiency': 1600/.96**3
  },
  'gear-winch-torque': {
    'summed efficiency': 900*(.97+.97+.97),
    'averaged efficiency': 900*(.97+.97+.97)/3,
    'losses assigned to speed only, leaving ideal torque': 900,
    'efficiency applied to speed as well as power': 900*.97**3/.97**3,
    'missing mesh factor': 900*.97**2,
    'extra mesh factor': 900*.97**4,
    'inverted ratio': 18/50*.97**3
  },
  'gear-winch-torque-bound': {
    'summed efficiency': 800/(18*(.97+.97+.97)),
    'averaged efficiency': 800/(18*((.97+.97+.97)/3)),
    'losses assigned to speed only, leaving ideal torque': 800/18,
    'missing mesh factor': 800/(18*.97**2),
    'extra mesh factor': 800/(18*.97**4),
    'inverted ratio': 18*.97**3/800
  }
};
for (const [id, efficiency, calculate, decimals, submission] of efficiencyRoundingCases) {
  test(id + ': four-significant-figure efficiency passes; wrong methods fail', () => {
    const start = html.indexOf('id="' + id + '"');
    const panel = html.slice(start, html.indexOf('</div>', start));
    const answer = Number(panel.match(/data-answer="([^"]+)"/)[1]);
    const tolerance = Number(panel.match(/data-tolerance="([^"]+)"/)[1]);
    const rounded = Number(calculate(Number(efficiency.toPrecision(4))).toFixed(decimals));
    assert.equal(rounded, submission, 'independently calculated 4-sf submission');
    assert.equal(passes(submission, answer, tolerance), true, 'accept ' + submission);
    const wrong = cases.find(c => c[0] === id)[3];
    const labeledWrong = Object.entries(additionalWrongMethods[id] || {});
    for (const [method, value] of [...wrong.map(v => ['existing wrong method', v]), ...labeledWrong]) {
      assert.equal(passes(value, answer, tolerance), false, method + ': ' + value);
      assert.equal(passes(Number(value.toFixed(decimals)), answer, tolerance), false,
        method + ': rounded submission');
    }
  });
}

test('design checks use exact stage counts, integer teeth and unrounded limits', () => {
  const candidates = [
    [[12,48],[15,60],[16,48]],
    [[12,48],[15,60],[16,50]],
    [[12,36],[10,60],[20,60]]
  ].map(pairs => {
    for (const [driver, driven] of pairs) {
      assert.ok([driver, driven].every(n => Number.isInteger(n) && n >= 10 && n <= 60));
      assert.ok(driven/driver > 1 && driven/driver <= 6);
    }
    const ratio = pairs.reduce((r, [a,b]) => r*b/a, 1);
    return {ratio, speed:1920/ratio, torque:18*ratio*.97**3};
  });
  assert.ok(6**2 < 1920/40);
  const feasible = candidates.filter(c => c.speed <= 40 && c.torque >= 800);
  assert.equal(feasible.length, 2);
  assert.equal(feasible.sort((a,b) => b.speed-a.speed)[0].ratio, 50);
  assert.ok(candidates[0].speed <= 40 && candidates[0].torque < 800);
});
