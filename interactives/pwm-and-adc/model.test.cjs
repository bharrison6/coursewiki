const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const m = require('./model.js');
const close = (a,b,t=1e-10) => assert.ok(Math.abs(a-b) <= t, `${a} differs from ${b}`);
test('ADC endpoints, bin boundaries and every reverse conversion', () => {
  assert.equal(m.adc(0),0); assert.equal(m.adc(5),1023); assert.equal(m.adc(3),614);
  for(let n=0;n<=1023;n++) {
    assert.equal(m.adc(m.voltage(n)),n);
    if(n) assert.equal(m.adc(m.voltage(n)-1e-8),n-1);
  }
  close(m.voltage(800),3.90625);
  for(const value of [-1,5.01,NaN,Infinity]) assert.throws(()=>m.adc(value),RangeError);
  for(const value of [-1,1024,1.5,NaN]) assert.throws(()=>m.voltage(value),RangeError);
});
test('PWM period, units, percent and end states', () => {
  const p=m.pwm(25,500);
  close(p.period,.002); close(p.onTime,.0005); close(p.average,1.25); assert.equal(p.writeValue,64);
  assert.equal(m.pwm(0,490).writeValue,0); assert.equal(m.pwm(100,490).writeValue,255);
  close(m.pwm(35,490).average,1.75); assert.equal(m.pwm(35,490).writeValue,89);
  assert.throws(()=>m.pwm(25,0),RangeError); assert.throws(()=>m.pwm(101,490),RangeError);
});
test('RC continuity, endpoints, average and frequency-dependent ripple', () => {
  for(const f of [10,490,500,980,2000]) for(const d of [0,25,50,75,100]) {
    close(m.filtered(d,f,0),m.filtered(d,f,1));
    const samples=20000;
    let sum=0;
    for(let i=0;i<samples;i++) { const v=m.filtered(d,f,(i+.5)/samples); assert.ok(v>=-1e-9 && v<=5+1e-9); sum+=v; }
    close(sum/samples,d/20,1e-6);
    if(d>0 && d<100) close(m.filtered(d,f,d/100-1e-9),m.filtered(d,f,d/100+1e-9),1e-6);
  }
  const ripple=f=>m.filtered(25,f,.25)-m.filtered(25,f,0);
  assert.ok(ripple(10)>ripple(500)); assert.ok(ripple(500)>ripple(2000));
  close(m.filtered(0,500,.5),0); close(m.filtered(100,500,.5),5);
});
test('sample timing can bias a finite raw PWM sample mean', () => {
  const onePhaseHigh=m.sampleSet({percent:25,pwmFrequency:500,sampleFrequency:500,startPhase:.1,count:12});
  assert.equal(onePhaseHigh.timeMean,1.25); assert.equal(onePhaseHigh.sampleMean,5);
  assert.ok(onePhaseHigh.samples.every(s=>Math.abs(s.phase-.1)<1e-12 && s.input===5 && s.code===1023));
  const onePhaseLow=m.sampleSet({percent:25,pwmFrequency:500,sampleFrequency:500,startPhase:.6,count:12});
  assert.equal(onePhaseLow.sampleMean,0); assert.ok(onePhaseLow.samples.every(s=>s.input===0 && s.code===0));
  const fourPhase=m.sampleSet({percent:25,pwmFrequency:500,sampleFrequency:2000,startPhase:.01,count:40});
  close(fourPhase.sampleMean,1.25); assert.deepEqual(fourPhase.samples.slice(0,4).map(s=>Number(s.phase.toFixed(2))),[.01,.26,.51,.76]);
  close(fourPhase.samplePeriod,.0005); close(fourPhase.samples[4].time,.00202); close(fourPhase.samples[4].cycles,1.01);
  const tenPhaseHigh=m.sampleSet({percent:25,pwmFrequency:500,sampleFrequency:5000,startPhase:.01,count:1000});
  const tenPhaseLow=m.sampleSet({percent:25,pwmFrequency:500,sampleFrequency:5000,startPhase:.08,count:1000});
  close(tenPhaseHigh.sampleMean,1.5); close(tenPhaseLow.sampleMean,1);
  assert.notEqual(tenPhaseHigh.sampleMean,tenPhaseHigh.timeMean);
});
test('filtered sampling reuses the settled RC and ADC bin models', () => {
  const samples=m.sampleSet({percent:25,pwmFrequency:500,sampleFrequency:500,startPhase:0,count:4,signal:'filtered'});
  close(samples.samples[0].input,1.1578694141410129); close(samples.sampleMean,samples.samples[0].input);
  close(m.filtered(25,500,.25),1.3452523339567644);
  assert.equal(samples.samples[0].code,m.adc(samples.samples[0].input));
  close(samples.samples[0].reconstructed,m.voltage(samples.samples[0].code));
  assert.notEqual(samples.samples[0].input,samples.samples[0].reconstructed);
  assert.notEqual((m.filtered(25,500,0)+m.filtered(25,500,.25))/2,1.25);
});
test('sampling conventions and bounds are explicit', () => {
  const atHigh=m.sampleSet({percent:25,pwmFrequency:500,sampleFrequency:1000,startPhase:.25-Number.EPSILON,count:1});
  const atLow=m.sampleSet({percent:25,pwmFrequency:500,sampleFrequency:1000,startPhase:.25,count:1});
  assert.equal(atHigh.samples[0].input,5); assert.equal(atLow.samples[0].input,0);
  const args={percent:25,pwmFrequency:500,sampleFrequency:1000,startPhase:.1,count:4};
  const nearOne=m.sampleSet({...args,sampleFrequency:500,startPhase:.9999999999999999,count:4});
  assert.deepEqual(nearOne.samples.map(sample=>sample.phase),Array(4).fill(.9999999999999999));
  assert.deepEqual(nearOne.samples.map(sample=>sample.input),[0,0,0,0]); assert.equal(nearOne.sampleMean,0);
  const twoCycles=m.sampleSet({...args,sampleFrequency:250,startPhase:.9999999999999999,count:4});
  assert.deepEqual(twoCycles.samples.map(sample=>sample.phase),Array(4).fill(.9999999999999999));
  assert.deepEqual(twoCycles.samples.map(sample=>sample.input),[0,0,0,0]);
  const twicePerCycle=m.sampleSet({...args,sampleFrequency:1000,startPhase:.9999999999999999,count:4});
  assert.deepEqual(twicePerCycle.samples.map(sample=>sample.input),[0,0,0,0]);
  const fourPerCycle=m.sampleSet({...args,sampleFrequency:2000,startPhase:.9999999999999999,count:4});
  assert.deepEqual(fourPerCycle.samples.map(sample=>sample.input),[0,5,0,0]);
  assert.deepEqual(m.sampleSet({...args,sampleFrequency:1000,startPhase:.9,count:4}).samples.map(sample=>Number(sample.phase.toFixed(1))),[.9,.4,.9,.4]);
  for(const update of [{sampleFrequency:0},{startPhase:-.1},{startPhase:1},{count:0},{count:1001},{count:1.5},{signal:'other'}])
    assert.throws(()=>m.sampleSet({...args,...update}),RangeError);
});
test('authored practice accepts rounded methods and rejects specified mistakes', () => {
  const bank=fs.readFileSync(path.join(__dirname,'../../practice/microcontroller-basics.html'),'utf8');
  const roots=[...bank.matchAll(/<div[^>]*data-practice-id="([^"]+)"[^>]*data-answer="([^"]+)"[^>]*data-tolerance="([^"]+)"/g)];
  assert.equal(roots.length,13); // Positive control: parser must find the complete known bank.
  const accepts=(id,x)=>{ const r=roots.find(r=>r[1]===`micro-${id}`); assert.ok(r); return Math.abs(x-Number(r[2]))<=Number(r[3]); };
  const cases=[
    ['adc-code', [614], [613,Math.floor(3*1023/5)]],
    ['adc-volts',[3.906,800*.004883],[800*5/1023,3.910]],
    ['adc-step',[4.883],[5000/1023,.004883]],
    ['pwm-period',[2.041],[490,1/490,490*1000]],
    ['pwm-on-time',[510.2,2.041*.25*1000],[.5102,510200,25/490*1e6]],
    ['pwm-average',[1.75],[175,.0175]],
    ['pwm-write',[89],[8925,.8925]],
    ['button-mode',[3],[1,2]], ['button-open',[1],[0]], ['button-closed',[0],[1]],
    ['ultrasonic-signal',[1],[2]], ['phototransistor-signal',[2],[1]], ['potentiometer-signal',[2],[1]]
  ];
  for(const [id,good,bad] of cases) {good.forEach(x=>assert.ok(accepts(id,x),`${id} should accept ${x}`));bad.forEach(x=>assert.ok(!accepts(id,x),`${id} should reject ${x}`));}
  // Negative control: a deliberately bad key is rejected by the same numeric check.
  assert.equal(accepts('adc-step',999),false);
});
test('new sampling practice keys match the canonical model and reject common confusions', () => {
  const bank=fs.readFileSync(path.join(__dirname,'../../practice/pwm-sampling.html'),'utf8');
  const roots=[...bank.matchAll(/<div[^>]*data-practice-id="([^"]+)"[^>]*data-answer="([^"]+)"[^>]*data-tolerance="([^"]+)"/g)];
  assert.equal(roots.length,5);
  const accepts=(id,value)=>{const root=roots.find(match=>match[1]===id);assert.ok(root);return Math.abs(value-Number(root[2]))<=Number(root[3]);};
  const four=m.sampleSet({percent:25,pwmFrequency:500,sampleFrequency:2000,startPhase:.01,count:4});
  const rc=m.sampleSet({percent:25,pwmFrequency:500,sampleFrequency:500,startPhase:0,count:1,signal:'filtered'});
  assert.ok(accepts('pwm-sample-phase-high',1)); assert.ok(!accepts('pwm-sample-phase-high',2));
  assert.ok(accepts('pwm-sample-phase-low',0)); assert.ok(!accepts('pwm-sample-phase-low',1.25));
  assert.ok(accepts('pwm-four-phase-mean',four.sampleMean)); assert.ok(!accepts('pwm-four-phase-mean',5));
  assert.ok(accepts('pwm-reconstructed-mean',four.reconstructedMean)); assert.ok(!accepts('pwm-reconstructed-mean',four.sampleMean));
  assert.ok(accepts('pwm-rc-bottom-sample',rc.timeMean-rc.sampleMean)); assert.ok(!accepts('pwm-rc-bottom-sample',rc.sampleMean)); assert.ok(!accepts('pwm-rc-bottom-sample',rc.timeMean));
});
