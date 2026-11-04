'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const K=require('./model.js'),old=require('../backlash-lost-motion/model.js');
test('shared play keeps the old dial recurrence bit-for-bit over bounded fractional walks',()=>{
  for(const lead of old.LEADS)for(const clearance of old.CLEARANCES){
    let state=old.create({lead,clearance}),turn=0,c=0,seed=17;
    for(let i=0;i<1500;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=(seed%201-100)/4;
      turn=Math.max(old.TRAVEL.min*100/lead,Math.min(old.TRAVEL.max*100/lead,turn+n));
      const d=turn*lead/100;c=Math.min(Math.max(c,d),d+clearance);
      state=old.turnBy(state,n);assert.equal(state.carriage,c);assert.equal(state.turn,turn);
    }
  }
});
test('zero clearance is exact and invalid intervals are refused',()=>{
  assert.equal(K.clampToBand(123,-4,0),-4);
  for(const args of [[0,2,1],[NaN,0,1],[0,0,Infinity]])assert.throws(()=>K.clampBetween(...args));
});
