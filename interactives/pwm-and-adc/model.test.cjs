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
