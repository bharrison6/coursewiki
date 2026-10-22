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
