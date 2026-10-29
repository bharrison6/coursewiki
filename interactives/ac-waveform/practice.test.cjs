'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const model=require('./model.js');
test('five original waveform problems have accurate discriminating keys',()=>{
  const bank=fs.readFileSync(path.join(__dirname,'../../practice/ac-waveforms.html'),'utf8');
  const roots=[...bank.matchAll(/<div[^>]*data-practice-id="([^"]+)"[^>]*data-answer="([^"]+)"[^>]*data-tolerance="([^"]+)"/g)].map(match=>({id:match[1],answer:Number(match[2]),tolerance:Number(match[3])}));
  assert.equal(roots.length,5); const accepts=(id,value)=>{const root=roots.find(item=>item.id===id);assert.ok(root);return Math.abs(value-root.answer)<=root.tolerance;};
  const centered=model.analyze({offset:0,amplitude:2,frequency:50,resistance:100});
  const shifted=model.analyze({offset:1,amplitude:2,frequency:50,resistance:100});
  for(const value of [centered.totalRms,1.414,Math.sqrt(2)])assert.ok(accepts('ac-wave-zero-mean-rms',value));
  for(const value of [shifted.totalRms,1.732,Math.sqrt(3)])assert.ok(accepts('ac-wave-offset-rms',value));
  assert.ok(accepts('ac-wave-vpp',6));assert.ok(accepts('ac-wave-period',20));assert.ok(accepts('ac-wave-resistor-power',shifted.averagePower));
  for(const [id,bad] of [['ac-wave-zero-mean-rms',0],['ac-wave-offset-rms',3],['ac-wave-vpp',2],['ac-wave-period',50],['ac-wave-resistor-power',Math.sqrt(3)/100]])assert.equal(accepts(id,bad),false,`${id} rejects ${bad}`);
});
