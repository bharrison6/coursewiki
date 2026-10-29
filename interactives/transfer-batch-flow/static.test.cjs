'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('./model.js'),S=require('./static.cjs');
test('static figures, keys and worked solutions are current projections',()=>{
  S.run(true);
  const expected=[46,64,18,54,5];
  S.cases.forEach((c,i)=>{
    const actual=c.answer(M.schedule(c.input));
    assert.equal(actual,expected[i]); assert.notEqual(actual,c.wrong);
    assert.ok(c.solution(M.schedule(c.input)).includes(`<strong>${expected[i]} min`));
  });
  assert.equal((S.staticMarkup().match(/data-station=/g)||[]).length,40);
});
test('four existing headings, fixed-queue example, media and old practice route survive',()=>{
  const page=fs.readFileSync(path.resolve(__dirname,'../../collections/lean/pages/value-stream-mapping.html'),'utf8');
  assert.deepEqual([...page.matchAll(/<h2>(.*?)<\/h2>/g)].map(m=>m[1]),[
    'Map one product family from request to delivery','Read process boxes, inventory triangles and flow arrows','Measure elapsed lead time separately from process time','Draw a future state and test a specific change']);
  assert.match(page,/lean-flow\/value-stream.svg/); assert.match(page,/cutting = 4 min, queue = 120 min, assembly = 6 min/);
  assert.match(page,/lead time is <strong>130 min/); assert.match(page,/href="\.\.\/practice.html#lean-lead-time"/);
});
test('essential assumptions and waiting stay with plots; optional table and derivation use native deeper support',()=>{
  const [core,support]=S.staticMarkup().split('<div class="tb-static-support">');
  assert.match(core,/data-interactive="transfer-batch-flow"/);
  assert.match(core,/54 min waiting/);assert.match(core,/64 min elapsed/);
  for(const phrase of ['all equal jobs arrive at 0','first come first served','A never blocks','waiting space is unlimited','no setup, transport, failure, rework or variation'])assert.ok(core.includes(phrase));
  assert.doesNotMatch(core,/<table/);assert.match(support,/<details class="deeper"><summary>Default 10-job example: exact transfer-one schedule/);
  assert.match(support,/10 jobs; A = 4 min\/job, B = 6 min\/job; transfer one job at a time/);
  assert.match(support,/This table does not update with live settings/);
  assert.match(support,/they do not report the current live settings/);
  assert.match(support,/<table/);assert.match(support,/ceil\(i \/ batch\)/);
});
