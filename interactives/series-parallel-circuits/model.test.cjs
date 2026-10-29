const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {solve, seriesPointIds, seriesNodePotentials, probeVoltage} = require('./model.js');
const {schematic, seriesProbeAnchors} = require('./render.js');
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
test('existing solve shape and default schematic stay unchanged', () => {
  const input = {voltage:12,mode:'series',resistances:[30,60],closed:[true,true]};
  assert.deepEqual(solve(input), {mode:'series',voltage:12,resistance:90,current:2/15,power:1.6,elements:[
    {resistance:30,closed:true,current:2/15,voltage:4,power:8/15},
    {resistance:60,closed:true,current:2/15,voltage:8,power:16/15}
  ]});
  const hash = crypto.createHash('sha256').update(schematic(solve(input))).digest('hex');
  assert.equal(hash, '90eb90e8d3e119f65d06f51d246cd9be18f1b6db57ad90d77821a7bb6977be01');
});
test('closed series circuit exposes signed ideal probe readings', () => {
  const state = seriesNodePotentials({voltage:12,resistances:[30,60],closed:[true,true]});
  assert.equal(state.supported,true); assert.equal(state.reason,null);
  assert.deepEqual(state.points, {'supply-positive':12,'switch-1-out':12,'resistor-1-out':8,'switch-2-out':8,'supply-negative':0});
  near(probeVoltage(state,'switch-1-out','resistor-1-out'),4);
  near(probeVoltage(state,'resistor-1-out','switch-1-out'),-4);
  near(probeVoltage(state,'switch-1-out','switch-1-out'),0);
  near(probeVoltage(state,'supply-positive','supply-negative'),12);
});
test('one open switch takes the source while resistor drops remain zero', () => {
  const first = seriesNodePotentials({voltage:12,resistances:[30,60],closed:[false,true]});
  assert.deepEqual(first.points, {'supply-positive':12,'switch-1-out':0,'resistor-1-out':0,'switch-2-out':0,'supply-negative':0});
  near(probeVoltage(first,'supply-positive','switch-1-out'),12);
  near(probeVoltage(first,'switch-1-out','resistor-1-out'),0);
  const second = seriesNodePotentials({voltage:12,resistances:[30,60],closed:[true,false]});
  assert.deepEqual(second.points, {'supply-positive':12,'switch-1-out':12,'resistor-1-out':12,'switch-2-out':0,'supply-negative':0});
  near(probeVoltage(second,'resistor-1-out','switch-2-out'),12);
  near(probeVoltage(second,'switch-2-out','supply-negative'),0);
});
test('multiple opens mark the floating island instead of inventing a voltage', () => {
  const state = seriesNodePotentials({voltage:12,resistances:[30,60],closed:[false,false]});
  assert.equal(state.supported,false); assert.match(state.reason,/floating node/);
  assert.deepEqual(state.points, {'supply-positive':12,'switch-1-out':null,'resistor-1-out':null,'switch-2-out':0,'supply-negative':0});
  assert.equal(probeVoltage(state,'switch-1-out','supply-negative'),null);
  near(probeVoltage(state,'switch-1-out','switch-1-out'),0);
});
test('probe anchors use every canonical point once while default SVG remains untouched', () => {
  assert.deepEqual(seriesPointIds(2), seriesProbeAnchors(2).map(anchor=>anchor.id));
  const s = solve({voltage:12,mode:'series',resistances:[30,60],closed:[true,true]});
  const svg = schematic(s,{probePoints:true,red:'switch-1-out',black:'resistor-1-out'});
  assert.equal((svg.match(/data-probe-point=/g)||[]).length,5);
  assert.equal((svg.match(/tabindex="0"/g)||[]).length,5);
  assert.equal((svg.match(/aria-pressed="true"/g)||[]).length,2);
  assert.match(svg,/role="group"/); assert.doesNotMatch(svg,/role="img"/);
  assert.equal((svg.match(/r="22"/g)||[]).length,5);
  assert.match(svg,/circuit-probe-point is-red/); assert.match(svg,/circuit-probe-point is-black/);
  const same = schematic(s,{probePoints:true,red:'switch-1-out',black:'switch-1-out'});
  assert.match(same,/circuit-probe-point is-red is-black/);
  assert.match(same,/After switch S1; red and black probes placed here/);
});
test('probe helper rejects unnamed points and unsupported shapes', () => {
  const state = seriesNodePotentials({voltage:12,resistances:[30,60],closed:[true,true]});
  assert.throws(()=>probeVoltage(state,'missing','supply-negative'),RangeError);
  assert.throws(()=>seriesNodePotentials({voltage:12,resistances:[30,60],closed:[true]}),RangeError);
  assert.throws(()=>seriesPointIds(4),RangeError);
});
