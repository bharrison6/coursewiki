'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const M = require('./model.js');
const D = require('./render.js');
const s = M.DEFAULT;
test('ball reference, hours conversion, duty and inverse rating', () => {
  const r = M.solve(s);
  assert.equal(r.ratio, 7); assert.equal(r.life, 343);
  assert.ok(Math.abs(r.lifeHours - 3811.111111111111) < 1e-9);
  assert.equal(r.years, r.lifeHours / 2000);
  assert.ok(Math.abs(M.requiredRating(2, 500, 'ball') - 15.874010519682) < 1e-10);
  assert.equal(M.solve({...s, hours:4}).years, r.years * 2);
});
test('roller exponent and doubling law; wrong methods are rejected', () => {
  const ball = M.solve(s), roller = M.solve({...s, type:'roller'});
  assert.ok(Math.abs(roller.life - 656.1353956909296) < 1e-9);
  assert.equal(M.solve({...s, P:4}).life, ball.life / 8);
  for (const wrong of [(2/14)**3, 343/2]) assert.notEqual(wrong, ball.life);
  assert.notEqual(roller.life, 7**3);
  assert.notEqual(ball.lifeHours, 343e6/1500);
  assert.notEqual(ball.lifeHours, 343e6/(60*1500*60));
  assert.equal(M.solve({...s,speed:3000}).lifeHours, ball.lifeHours/2);
});
test('invalid, zero, infinite and impossible duty inputs fail', () => {
  for (const key of ['C','P','speed','hours','days']) for (const value of [0,-1,NaN,Infinity]) assert.throws(()=>M.solve({...s,[key]:value}),RangeError);
  assert.throws(()=>M.solve({...s,type:'plain'}));
  assert.throws(()=>M.solve({...s,hours:25}));
  assert.throws(()=>M.solve({...s,days:367}));
  assert.throws(()=>M.solve({...s,C:1e300}));
});
test('actual practice keys admit rounded intermediates and reject wrong methods', () => {
  const bank = fs.readFileSync(path.join(__dirname,'../../practice/bearings-and-shaft-support.html'),'utf8');
  const cases = [
    ['ball',343,[343],[(2/14)**3]],
    ['hours',343e6/90000,[3811],[343e6/1500,343e6/(90000*60)]],
    ['double',343/8,[42.88],[343/2,343*2,343*8]],
    ['roller',7**(10/3),[656.1],[7**3]],
    ['rating',2*500**(1/3),[15.87,2*7.937],[2*500,2*(500e6)**(1/3)]]
  ];
  for (const [id,exact,valid,wrong] of cases) {
    const tag = bank.match(new RegExp('<div[^>]+id="bearing-life-'+id+'"[^>]*>'))[0];
    const answer = Number(tag.match(/data-answer="([^"]+)"/)[1]);
    const tolerance = Number(tag.match(/data-tolerance="([^"]+)"/)[1]);
    assert.ok(Math.abs(answer-exact)<1e-9);
    for (const n of valid) assert.ok(Math.abs(n-answer)<=tolerance, id+' rounded answer');
    for (const n of wrong) assert.ok(Math.abs(n-answer)>tolerance, id+' wrong method control');
    assert.ok(Math.abs(answer+2*tolerance-answer)>tolerance, 'checker rejects planted outside-window value');
  }
});
test('static fallback is generated from the same renderer', () => {
  assert.match(D.staticLesson(),/3811/); assert.match(D.staticLesson(),/1\/8/);
  execFileSync(process.execPath,[path.join(__dirname,'static.cjs')]);
});
