const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const js = read('theme/app.js');
test('all four helper formatters preserve tiny magnitudes and ordinary precision', () => {
 const formats = [...js.matchAll(/function format\(value\) \{[\s\S]*?\n    \}/g)].slice(1).map(m => vm.runInNewContext('('+m[0]+')'));
 assert.equal(formats.length,4);
 for (const format of formats) {
  console.log('1e-13 ft to m:', format(1e-13 * .3048));
  assert.equal(format(1e-13 * .3048),'3.048e-14');
  assert.equal(format(-1e-13),'-1e-13');
  assert.equal(format(0),'0'); assert.equal(format(-0),'0');
  assert.equal(format(1.23456789),'1.23457'); assert.equal(format(123456789),'1.23457e8');
 }
});
function check(tagName, unit, value) {
 const feedback = {hasAttribute:()=>true}; let click;
 const input = {tagName,value,addEventListener(){}};
 const button = {addEventListener(_,fn){click=fn;}};
 const attrs = {'data-answer':'2','data-tolerance':'0','data-unit':unit};
 const item = {hasAttribute:()=>false,setAttribute(k,v){attrs[k]=v;},getAttribute:k=>attrs[k],querySelector:s=>s.includes('data-practice-input')?input:s.includes('data-practice-check')?button:feedback};
 const source = js.slice(js.indexOf('    function readNumber(control)',js.indexOf("var PRACTICE_KEY")),js.indexOf('    function text(value, limit)'));
 vm.runInNewContext(source+';wirePracticeChecks({});',{$$:()=>[item]}); click({preventDefault(){}}); return feedback.textContent;
}
test('categorical feedback uses existing select/choice declarations; numeric wording stays exact',()=>{
 for (const [tag,unit] of [['SELECT',''],['INPUT','choice']]) {
  assert.equal(check(tag,unit,'2'),'Correct — your choice is correct.');
  assert.equal(check(tag,unit,'1'),'Not yet — review the choices and try again.');
  assert.equal(check(tag,unit,''),'Choose an answer before checking your work.');
 }
 assert.equal(check('INPUT','m','2'),'Correct — your answer is within the accepted tolerance in m.');
 assert.equal(check('INPUT','m','1'),'Not yet — check the units, conversion factor, and arithmetic, then try again.');
});
test('Two Winters browser test targets the current native Guide dialog',()=>{
 const source=read('activities/two-winters/tools/ui.test.cjs');
 assert.ok(!source.includes('#howto')); assert.ok(source.includes("'#guide'"));
 assert.match(read('activities/two-winters/src/template.html'),/<dialog[^>]*id="guide"/);
 assert.ok(!source.includes('e.inert'));
});
for(const name of ['hole-callout','lead-screw','dc-motor-curve','wire-voltage-drop']) test(name+' browser test skips without opt-in',()=>{
 const file='interactives/'+name+'/browser.test.cjs';
 const env={...process.env,COURSEWIKI_BROWSER_URL:''}; delete env.NODE_TEST_CONTEXT;
 const result=spawnSync(process.execPath,['--test','--test-reporter=tap',file],{cwd:root,env,encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr); assert.match(result.stdout,/# SKIP/);
 const missing=spawnSync(process.execPath,['--test','--test-reporter=tap',file],{cwd:root,env:{...env,COURSEWIKI_BROWSER_URL:'http://127.0.0.1:1',PLAYWRIGHT_MODULE:'coursewiki-intentionally-absent-playwright'},encoding:'utf8'});
 assert.equal(missing.status,0,missing.stderr); assert.match(missing.stdout,/# SKIP/);
 assert.doesNotMatch(read(file),/path.join\((?:repo|__dirname), ['"]\.(?:lane-scratch|verification)/);
});

