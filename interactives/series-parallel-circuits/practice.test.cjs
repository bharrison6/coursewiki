const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../../practice/series-and-parallel-circuits.html'),'utf8');
const four = n => Number(n.toPrecision(4));
// Each case independently supplies exact, four-significant-figure intermediate,
// advertised rounded, and deliberately wrong-method answers.
const cases = [
  ['rms-to-peak',72*Math.sqrt(2),72*four(Math.sqrt(2)),101.8,72],
  ['peak-to-rms',210/Math.sqrt(2),210/four(Math.sqrt(2)),148.5,210],
  ['loss-low-voltage',(6000/300)**2*.8,four(6000/300)**2*.8,320,16,300**2*.8,300**2/.8],
  ['loss-high-voltage',(6000/3000)**2*.8,four(6000/3000)**2*.8,3.2,32,3000**2*.8,3000**2/.8],
  ['series-current',18/120,four(18/120),.150,.075],
  ['series-drop-small',18/120*40,four(18/120)*40,6,9],
  ['series-drop-large',18/120*80,four(18/120)*80,12,9],
  ['parallel-branch',18/75,four(18/75),.240,.150],
  ['parallel-total',18/45+18/75,four(18/45)+four(18/75),.640,.150],
  ['parallel-equivalent',1/(1/45+1/75),1/four(four(1/45)+four(1/75)),28.13,120],
  ['series-power',(18/120)**2*80,four(18/120)**2*80,1.8,.9],
  ['parallel-power',18**2/45,four(18/45)*18,7.2,4.32],
  ['meter-voltage',18/(56+91)*56,four(18/(56+91))*56,6.86,18,9,18/(56+91)*91,6],
  ['meter-current',18/75,four(18/75),.240,.640],
  ['meter-resistance',1/(1/68+1/120),1/four(four(1/68)+four(1/120)),43.40,68+120,68,120,28.13],
  ['meter-shunt',.018/.060,four(.018/.060),.300,300]
];
test('every published key accepts computed/rounded answers and rejects wrong methods',()=>{
  assert.equal((source.match(/data-practice-id=/g)||[]).length,cases.length);
  for (const [id,exact,rounded,printed,...wrongAnswers] of cases) {
    const tag = source.match(new RegExp(`<div[^>]*data-practice-id="circuits-${id}"[^>]*>`));
    assert.ok(tag,id);
    const answer=Number(tag[0].match(/data-answer="([^"]+)"/)[1]);
    const tolerance=Number(tag[0].match(/data-tolerance="([^"]+)"/)[1]);
    assert.ok(Math.abs(answer-exact)<1e-8,`${id}: exact key`);
    for (const value of [rounded,printed]) assert.ok(Math.abs(answer-value)<=tolerance,`${id}: admits ${value}`);
    for (const wrong of wrongAnswers) {
      assert.ok(Math.abs(answer-wrong)>tolerance,`${id}: rejects wrong method ${wrong}`);
      // A corrupted key must fail the same check, proving this check is sensitive.
      assert.equal(Math.abs(wrong-exact)<1e-8,false,`${id}: corrupt-key control`);
    }
  }
});
