'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('./model.js'), R = require('./render.js');
test('independently worked default, reversed, equal and single-job cases', () => {
  assert.deepEqual([M.schedule({...M.defaults,batch:10}).first,M.schedule({...M.defaults,batch:10}).last],[46,100]);
  assert.deepEqual([M.schedule(M.defaults).first,M.schedule(M.defaults).last],[10,64]);
  assert.deepEqual([M.schedule({n:10,batch:10,a:6,b:4}).first,M.schedule({n:10,batch:1,a:6,b:4}).last],[64,64]);
  assert.deepEqual(M.schedule({n:5,batch:2,a:3,b:3}).jobs.map(j=>j.bEnd),[9,12,15,18,21]);
  assert.deepEqual(M.schedule({n:1,batch:1,a:20,b:1}).jobs,[{id:1,aStart:0,aEnd:20,release:20,bStart:20,bEnd:21,beforeA:0,held:0,atB:0,waiting:0}]);
});
test('last partial batch and three independently hand-calculated waits', () => {
  const s=M.schedule({n:5,batch:2,a:3,b:2});
  assert.deepEqual(s.gates,[{first:1,last:2,time:6},{first:3,last:4,time:12},{first:5,last:5,time:15}]);
  assert.deepEqual(s.jobs.map(j=>[j.bStart,j.bEnd,j.beforeA,j.held,j.atB]),[[6,8,0,3,0],[8,10,3,0,2],[12,14,6,3,0],[14,16,9,0,2],[16,18,12,0,1]]);
});
// Independent integer-clock oracle: enqueue completed batches, let B take a
// queued job when idle, and advance a minute. No ceil/release recurrence.
function clockOracle({n,batch,a,b}) {
  let produced=0, pocket=[], queue=[], busyUntil=0, nextJob=null;
  const finishes=[];
  for(let t=0;finishes.length<n;t++) {
    if(nextJob!==null && t===busyUntil) { finishes.push([nextJob,t]);nextJob=null; }
    if(t>0 && t%a===0 && produced<n) {
      pocket.push(++produced);
      if(pocket.length===batch || produced===n) {queue.push(...pocket);pocket=[];}
    }
    if(nextJob===null && queue.length) {nextJob=queue.shift();busyUntil=t+b;}
  }
  return finishes;
}
test('all 84,000 bounded schedules agree with independent clock and conservation', () => {
  let cases=0;
  for(let n=1;n<=20;n++) for(let batch=1;batch<=n;batch++) for(let a=1;a<=20;a++) for(let b=1;b<=20;b++) {
    const input={n,batch,a,b},s=M.schedule(input), oracle=clockOracle(input);
    for(let i=0;i<n;i++) {
      const j=s.jobs[i];
      if(oracle[i][0]!==j.id||oracle[i][1]!==j.bEnd||j.waiting+s.processing!==j.bEnd||Math.min(j.beforeA,j.held,j.atB)<0) assert.fail(JSON.stringify({input,j,oracle:oracle[i]}));
    }
    cases++;
  }
  assert.equal(cases,84000);
});
test('invalid bounds and representations are rejected rather than coerced', () => {
  for(const input of [{n:0},{n:21},{n:1.5},{n:'10'},{n:NaN},{batch:0},{batch:11},{batch:1.2},{a:0},{b:21},{a:Infinity},{b:NaN}]) assert.throws(()=>M.schedule({...M.defaults,...input}),RangeError);
});
test('renderer preserves every job/station interval and gate on a common scale', () => {
  const s=M.schedule({n:5,batch:2,a:3,b:2}),svg=R.diagram(s,30,3);
  assert.equal((svg.match(/data-station=/g)||[]).length,10);
  for(const j of s.jobs) for(const [st,start,end] of [['A',j.aStart,j.aEnd],['B',j.bStart,j.bEnd]]) assert.ok(svg.includes(`data-job="${j.id}" data-station="${st}" data-start="${start}" data-end="${end}"`));
  assert.equal((svg.match(/data-release=/g)||[]).length,3);
  assert.match(svg,/data-release="15"/);
  assert.match(R.detail(s,3),/14 min elapsed/);
  assert.match(R.detail(s,3),/6 waiting before A \+ 3 at A \+ 3 held for batch \+ 0 waiting at B \+ 2 at B/);
  assert.equal((R.table(s).match(/<tr>/g)||[]).length,6);
});
