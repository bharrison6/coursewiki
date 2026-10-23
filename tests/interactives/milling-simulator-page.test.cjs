'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../..'),mod=path.join(root,'interactives/milling-simulator');
const D=require(path.join(mod,'draw.js')),J=require(path.join(mod,'jobs.js'));
const page=fs.readFileSync(path.join(root,'collections/machining/pages/milling-operations.html'),'utf8');
test('printed milling job drawings and descriptions are the live renderer output',()=>{
  assert.ok(page.includes(D.renderJobFigures(J.JOBS)),'all four dimensioned jobs and captions share their live source');
  assert.ok(page.includes(D.renderSetup()),'same setup drawing');
  assert.ok(page.includes(D.renderRack()),'same tool shapes and rack');
});
test('milling page uses the topic loader and has a real no-JavaScript lesson',()=>{
  assert.match(page,/^@@ID: milling-operations$/m);assert.match(page,/^@@SECTION: Milling$/m);
  assert.equal((page.match(/data-interactive="milling-simulator"/g)||[]).length,1);
  assert.doesNotMatch(page,/<script\b/);assert.match(page,/<noscript>/);
  const conf=fs.readFileSync(path.join(mod,'interactive.conf'),'utf8');
  const assets=[...conf.matchAll(/^@@(?:JS|CSS):\s*(.*)$/gm)].flatMap(m=>m[1].split(',').map(s=>s.trim()));
  assert.deepEqual(assets,['demo.css','model.js','inspect.js','jobs.js','draw.js','demo.js']);
  for(const file of assets)assert.ok(fs.readdirSync(mod).includes(file),'case-sensitive asset '+file);
});
test('a deep link to the simulator lands on the machine, with the driving notes after it',()=>{
  const sec=page.slice(page.indexOf('<h2>Simulator: make the part on the drawing, then inspect it</h2>'));
  const body=sec.slice(0,sec.indexOf('</section>'));
  assert.match(body,/^<h2>[^<]*<\/h2>\s*<div data-interactive="milling-simulator">/,'the simulator is the first thing in its card');
  assert.ok(body.indexOf('How to drive it')>body.indexOf('data-interactive="milling-simulator"'),'driving notes follow the machine');
  for(const words of ['finished part is drawn over','gold is metal still to remove','striped red-orange'])assert.ok(body.includes(words),words);
  assert.doesNotMatch(page,/Show where it differs|Show the drawing on the work/,'no controls the simulator no longer has');
});
