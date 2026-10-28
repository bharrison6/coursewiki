const test = require('node:test');
const assert = require('node:assert/strict');
const {species, calculate} = require('./model.js');
const base = {speciesIndex:13, orientation:'flat-width', dimension:9.15, unit:'in', initialMC:8, finalMC:11};
const near = (a,b,t=1e-12) => assert.ok(Math.abs(a-b)<t, `${a} != ${b}`);
test('Handbook white-fir example in inches and millimeters', () => {
  const r = calculate(base);
  near(r.change, .0672525);
  near(r.change, .0672, .0001);
  assert.equal(r.change.toFixed(3), '0.067');
  assert.equal(r.finalDimension.toFixed(3), '9.217');
  const mm = calculate({...base, dimension:232, unit:'mm'});
  near(mm.change, 1.7052);
  assert.equal(mm.change.toFixed(3), '1.705');
  near(mm.finalDimension, 233.7052);
  for (const wrong of [9.15 * .07, r.change / 100, r.change / 10000]) {
    assert.ok(Math.abs(r.change-wrong) > .005, 'wrong method must fail even at displayed rounding');
  }
});
test('all 17 coefficients match the assigned Table 13-5 rows', () => {
  assert.deepEqual(species.map(s=>[s.radial,s.tangential]), [
    [.00169,.00219],[.00230,.00234],[.00190,.00330],[.00256,.00327],
    [.00126,.00223],[.00259,.00315],[.00102,.00252],[.00151,.00400],
    [.00148,.00338],[.00183,.00462],[.00137,.00216],[.00112,.00308],
    [.00165,.00267],[.00112,.00245],[.00165,.00234],[.00133,.00252],[.00111,.00234]
  ]);
});
test('orientation, sign, boundaries, units and zero movement', () => {
  for (let i=0; i<species.length; i++) {
    for (const [orientation,c] of [['flat-width',species[i].tangential],['quarter-width',species[i].radial],['flat-thickness',species[i].radial],['unknown',species[i].tangential]]) {
      const r = calculate({...base,speciesIndex:i,orientation,initialMC:14,finalMC:6});
      near(r.change, -9.15*c*8);
      assert.ok(r.finalDimension < base.dimension);
    }
  }
  assert.equal(calculate({...base,finalMC:8}).change,0);
  near(calculate({...base,dimension:9.15*25.4,unit:'mm'}).change, calculate(base).change*25.4);
});
test('reject invalid data and either MC outside inclusive 6–14%', () => {
  for (const key of ['initialMC','finalMC']) for (const value of [5,15,5.999,14.001,NaN,Infinity,'8',null]) {
    assert.throws(()=>calculate({...base,[key]:value}), /Both moisture contents/);
  }
  for (const dimension of [0,-1,NaN,Infinity,'9.15']) assert.throws(()=>calculate({...base,dimension}),RangeError);
  for (const speciesIndex of [-1,17,1.5,'13']) assert.throws(()=>calculate({...base,speciesIndex}),RangeError);
  for (const orientation of ['width','toString']) assert.throws(()=>calculate({...base,orientation}),RangeError);
  assert.throws(()=>calculate({...base,unit:'cm'}),RangeError);
  assert.throws(()=>calculate({...base,dimension:Number.MAX_VALUE,initialMC:6,finalMC:14}),RangeError);
});
test('independent roots, no duplicate binding, and invalid input clears previous result', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  function makeRoot() {
    const fields = Object.entries(base).map(([name,value])=>({dataset:{wm:name},value:String(value),selectedOptions:[{textContent:'Flat-sawn width'}],events:[],addEventListener(type,fn){this.events.push(fn);}}));
    const result = {textContent:''}, context = {textContent:''};
    return {dataset:{},fields,result,context,querySelectorAll(){return fields;},querySelector(s){return s==='[data-wm-result]'?result:context;}};
  }
  const roots = [makeRoot(),makeRoot()];
  const context = vm.createContext({CourseWikiWoodMovement:{species,calculate},document:{querySelectorAll(s){assert.equal(s,'[data-interactive="wood-movement"]');return roots;}}});
  const code = fs.readFileSync(__dirname+'/demo.js','utf8');
  vm.runInContext(code,context); vm.runInContext(code,context);
  assert.match(roots[0].result.textContent,/\+0.07 in; final dimension: 9.22 in/);
  const field = roots[0].fields.find(f=>f.dataset.wm==='finalMC');
  assert.equal(field.events.length,1);
  field.value='5';field.events[0]();
  assert.match(roots[0].result.textContent,/no estimate is given/);
  assert.equal(roots[0].context.textContent,'');
  assert.match(roots[1].result.textContent,/\+0.07/);
  field.value='';field.events[0]();
  assert.match(roots[0].result.textContent,/no estimate is given/);
  field.value='8.001';field.events[0]();
  assert.match(roots[0].result.textContent,/swelling less than 0.01/);
});
