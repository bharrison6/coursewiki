'use strict';
// Build-time projections. Page fallback and original practice keys come from
// the same schedule used by the browser. Run --check after source changes.
const fs=require('node:fs'),path=require('node:path');
const M=require('./model.js'),R=require('./render.js');
const site=path.resolve(__dirname,'../..');
const pagePath=path.join(site,'collections/lean/pages/value-stream-mapping.html');
const bankPath=path.join(site,'practice/transfer-batch-flow.html');
const one=M.schedule(M.defaults),all=M.schedule({...M.defaults,batch:10});
function staticMarkup() {
  const job = one.jobs[9];
  return `<div data-interactive="transfer-batch-flow"><div class="tb-static"><h3>Transfer size changes when jobs finish</h3>
<p>10 jobs; A = 4 min/job, B = 6 min/job. Compare transfer-all with transfer-one.</p>
${R.comparison(all,one,1)}
<p>A is upper blue, B lower gold; bars are jobs, dashed lines completed-batch transfers. Minutes from order release 0; both plots share a scale.</p>
<p><strong>Job 10 with transfer-one:</strong> ${job.beforeA} min waiting before A + ${job.held} held for batch + ${job.atB} waiting at B = <strong>${job.waiting} min waiting</strong>. Add ${one.processing} min processing: <strong>${job.bEnd} min elapsed</strong> from order release 0.</p>
<p><strong>Ideal schedule:</strong> all equal jobs arrive at 0; serial single-job A then B, first come first served. A never blocks; waiting space is unlimited. Completed batches transfer immediately; the last may be smaller. Constant times; no setup, transport, failure, rework or variation. Finite-order illustration, not a factory forecast or a universal best batch.</p></div></div>
<div class="tb-static-support">
<details class="deeper"><summary>Default ${one.n}-job example: exact transfer-one schedule</summary><div class="tb-support-table"><p><strong>Fixed default example:</strong> ${one.n} jobs; A = ${one.a} min/job, B = ${one.b} min/job; transfer one job at a time. This table does not update with live settings.</p>${R.table(one)}</div></details>
<details class="deeper"><summary>Bounded model reference: scheduling equations and limits</summary><p>These equations describe the bounded ideal model; they do not report the current live settings.</p><p>For job i: A start = (i − 1)tA; A end = i × tA; transfer = min(ceil(i / batch) × batch, N) × tA. B start is the later of transfer and previous B finish; B end = B start + tB. Waiting before A = A start; held for batch = transfer − A end; waiting at B = B start − transfer. The three waits plus tA + tB equal that job’s completion time from order release 0.</p><p>Bounds: N 1–20 jobs, transfer 1–N, station times 1–20 whole min/job. This original scheduling example is separate from the map’s fixed 120-minute queue. It does not diagnose a factory or identify a universal optimal batch. Real setup, transport, limited space and variation can change the decision; no demand, quality or capacity forecast is made.</p></details></div>`;
}
const cases=[
  {id:'first',title:'First completion with transfer-all',input:{n:10,batch:10,a:4,b:6},question:'An order has 10 jobs. A takes 4 min/job, B takes 6. All ten must finish A before the batch transfers. When does the first job finish B?',answer:s=>s.first,solution:s=>`A finishes ten jobs at 10 × 4 = 40 min. B then needs 6 min for the first job: <strong>${s.first} min</strong>.`,wrong:10},
  {id:'order',title:'Full order with transfer-one',input:{n:10,batch:1,a:4,b:6},question:'Ten jobs take 4 min each at A and 6 min each at B. Each completed job transfers immediately. When does the whole order finish B?',answer:s=>s.last,solution:s=>`The first job reaches B at 4 min. A supplies the later jobs faster than B uses them, so B runs without a gap for 10 × 6 min: 4 + 60 = <strong>${s.last} min</strong>.`,wrong:100},
  {id:'partial',title:'A final partial transfer batch',input:{n:5,batch:2,a:3,b:2},question:'Five jobs take 3 min each at A and 2 min each at B. Transfer in batches of two; the final single job transfers as soon as it finishes A. When does the whole order finish B?',answer:s=>s.last,solution:s=>`B finishes jobs 1–5 at 8, 10, 14, 16 and <strong>${s.last} min</strong>. The last job transfers at 15 min but B is occupied until 16 min.`,wrong:17},
  {id:'waiting',title:'Separate processing from waiting',input:{n:10,batch:1,a:4,b:6},question:'Ten jobs take 4 min at A and 6 min at B; transfer one at a time. For job 10, how much total waiting accumulates from order release 0 until completion?',answer:s=>s.jobs[9].waiting,solution:s=>`Job 10 waits 36 min before A, 0 held for its batch and 18 at B: <strong>${s.jobs[9].waiting} min</strong>. Adding 10 min of processing gives its 64 min completion time.`,wrong:64},
  {id:'processing',title:'Processing time stays separate',input:{n:5,batch:2,a:3,b:2},question:'Five jobs take 3 min/job at A and 2 min/job at B. Transfer in batches of two. How much active processing does each job need across A and B?',answer:s=>s.processing,solution:s=>`Processing is 3 + 2 = <strong>${s.processing} min per job</strong>. Batch holding and station queues affect elapsed time, not these stipulated processing durations.`,wrong:18}
];
function practiceMarkup() {
  return '@@ID: transfer-batch-flow\n@@TITLE: Transfer Batches and Completion Time\n@@END\n\n'+cases.map(c=>{const s=M.schedule(c.input);return `<div class="panel" id="transfer-batch-${c.id}" data-practice data-practice-id="transfer-batch-${c.id}" data-practice-title="${c.title}" data-practice-source="value-stream-mapping" data-answer="${c.answer(s)}" data-tolerance="0" data-unit="minutes">
<p><strong>${c.title}.</strong> ${c.question}</p><p>Assume all equal jobs arrive at time 0, A and B each handle one job at a time in order, A never blocks and waiting space is unlimited. Transfer is immediate when a batch completes; setup, transport, failure, rework and variation are zero.</p>
<label for="transfer-batch-${c.id}-answer">Answer in whole minutes</label><input id="transfer-batch-${c.id}-answer" data-practice-input type="number" step="1" inputmode="numeric">
<button type="button" data-practice-check>Check answer</button><output data-practice-feedback aria-live="polite">Enter an answer, then check it.</output>
<details class="solution"><summary>Show worked solution</summary><p>${c.solution(s)}</p></details></div>`;}).join('\n')+'\n';
}
function run(check) {
  const page=fs.readFileSync(pagePath,'utf8');
  const re=/<!-- TRANSFER-BATCH-STATIC:START -->[\s\S]*?<!-- TRANSFER-BATCH-STATIC:END -->/;
  if(!re.test(page)) throw Error('Static region missing.');
  const updated=page.replace(re,`<!-- TRANSFER-BATCH-STATIC:START -->\n${staticMarkup()}\n<!-- TRANSFER-BATCH-STATIC:END -->`);
  const bank=practiceMarkup();
  if(check) {
    if(page!==updated||!fs.existsSync(bankPath)||fs.readFileSync(bankPath,'utf8')!==bank) throw Error('Static/practice projections are stale. Run node interactives/transfer-batch-flow/static.cjs');
  } else {fs.writeFileSync(pagePath,updated);fs.writeFileSync(bankPath,bank);}
}
if(require.main===module)run(process.argv.includes('--check'));
module.exports={staticMarkup,practiceMarkup,cases,run};
