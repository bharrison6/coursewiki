'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname,'../../practice/circuit-voltage-probes.html'),'utf8');
function item(id) {
  const match = source.match(new RegExp(`<div class="panel" id="${id}"[\\s\\S]*?data-answer="([^"]+)"[\\s\\S]*?data-tolerance="([^"]+)"[\\s\\S]*?<details class="solution">[\\s\\S]*?<\\/details><\\/div>`));
  assert.ok(match, `practice item ${id} exists`);
  return { answer:Number(match[1]), tolerance:Number(match[2]), body:match[0] };
}
function accepted(entry,value) { return Math.abs(Number(value)-entry.answer) <= entry.tolerance; }

test('five original probe problems have discriminating keys and self-contained solutions', () => {
  const cases = [
    ['probe-place-r1-positive',1,2], ['probe-reverse-r1-sign',-4,4],
    ['probe-open-s1-reading',12,0], ['probe-same-node-zero',0,12], ['probe-two-opens-floating',3,1]
  ];
  assert.equal((source.match(/data-practice-id=/g)||[]).length,cases.length);
  for (const [id,correct,wrong] of cases) {
    const entry=item(id); assert.equal(accepted(entry,correct),true,`${id} accepts key`);
    assert.equal(accepted(entry,wrong),false,`${id} rejects wrong method/choice`);
    assert.match(entry.body,/Show worked solution/); assert.match(entry.body,/data-practice-source="measuring-electric-circuits"/);
  }
});

test('placement and floating-node questions are categorical', () => {
  for (const id of ['probe-place-r1-positive','probe-two-opens-floating']) assert.match(item(id).body,/data-unit="choice"/);
  assert.match(item('probe-reverse-r1-sign').body,/−4 V/);
  assert.match(item('probe-two-opens-floating').body,/undetermined without another connection/);
});
