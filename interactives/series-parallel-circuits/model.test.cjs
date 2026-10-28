const {test} = require('node:test');
const assert = require('node:assert/strict');
const {solve} = require('./model.js');
const {schematic} = require('./render.js');
const near = (a,b) => assert.ok(Math.abs(a-b) < 1e-9, `${a} != ${b}`);
test('unequal resistors have the same series current and different drops', () => {
  const s = solve({voltage:15,mode:'series',resistances:[30,60],closed:[true,true]});
  near(s.resistance,90); near(s.current,1/6);
  near(s.elements[0].voltage,5); near(s.elements[1].voltage,10);
  near(s.elements[0].power,5/6); near(s.elements[1].power,5/3);
});
test('parallel branch currents add and lower resistance dissipates more', () => {
  const s = solve({voltage:15,mode:'parallel',resistances:[30,60],closed:[true,true]});
  near(s.resistance,20); near(s.current,.75);
  near(s.elements[0].current,.5); near(s.elements[1].current,.25);
  near(s.elements[0].power,7.5); near(s.elements[1].power,3.75);
});
test('all switch combinations: KCL, KVL, power conservation and open resistor readings', () => {
  for (const mode of ['series','parallel']) for (const n of [2,3]) for (let mask=0;mask<2**n;mask++) {
    const closed = Array.from({length:n},(_,i) => !!(mask & 2**i));
    const s = solve({voltage:17,mode,resistances:[47,83,121].slice(0,n),closed});
    near(s.elements.reduce((a,e) => a+e.power,0),s.power);
    if (mode === 'series') {
      s.elements.forEach(e => near(e.current,s.current));
      near(s.elements.reduce((a,e) => a+e.voltage,0),closed.every(Boolean) ? 17 : 0);
    } else {
      near(s.elements.reduce((a,e) => a+e.current,0),s.current);
      s.elements.forEach(e => near(e.voltage,e.closed ? 17 : 0));
    }
    if (s.current === 0) assert.equal(s.resistance,Infinity);
    const svg = schematic(s);
    assert.ok(svg.includes(`${n} switched resistors`));
    assert.equal((svg.match(/<rect /g)||[]).length,n);
    assert.equal((svg.match(/>open<\/text>/g)||[]).length,closed.filter(c=>!c).length);
  }
});
test('zero source and invalid input handling', () => {
  const args = {voltage:0,mode:'parallel',resistances:[30,60],closed:[true,true]};
  near(solve(args).resistance,20); near(solve(args).power,0);
  for (const voltage of [NaN,Infinity,-1,49]) assert.throws(()=>solve({...args,voltage}),RangeError);
  for (const resistances of [[0,30],[-1,20],[30],[1,2,3,4],[NaN,20]]) assert.throws(()=>solve({...args,resistances}),RangeError);
  assert.throws(()=>solve({...args,mode:'other'}),RangeError);
  assert.throws(()=>solve({...args,closed:[1,true]}),RangeError);
});
