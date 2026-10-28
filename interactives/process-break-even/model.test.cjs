const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { compare } = require('./model.js');
test('cost equality and alternatives around the crossing', () => {
  assert.deepEqual(compare(120), {quantity:120,a:1080,b:1080,unitA:9,unitB:9,cheaper:'tie'});
  assert.equal(compare(119).cheaper, 'A');
  assert.equal(compare(121).cheaper, 'B');
  assert.equal(compare(60).unitB, 15);
  assert.equal(compare(240).unitA, 8.5);
  assert.equal(compare(240).unitB, 6);
  for (const q of [0,-1,1.5,NaN,Infinity,'120']) assert.throws(() => compare(q), RangeError);
});
test('all matching roots initialize independently and do not bind twice', () => {
  function root() {
    const input = {value:'120',events:[],addEventListener(type,fn){this.events.push(fn);}};
    const output = {textContent:''};
    return {dataset:{},input,output,querySelector(s){return s === '[data-volume]' ? input : output;}};
  }
  const roots = [root(), root()];
  const context = vm.createContext({document:{querySelectorAll(s){assert.equal(s,'[data-interactive="process-break-even"]');return roots;}},CourseWikiProcessBreakEven:{compare}});
  const code = fs.readFileSync(__dirname+'/demo.js','utf8');
  vm.runInContext(code,context); vm.runInContext(code,context);
  assert.equal(roots[0].input.events.length,1);
  roots[0].input.value='60';roots[0].input.events[0]();
  assert.match(roots[0].output.textContent,/Process A costs less/);
  assert.match(roots[1].output.textContent,/Costs are equal/);
});
