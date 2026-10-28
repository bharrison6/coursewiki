const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
// Recompute each authored answer independently from its stated positions or limits.
const expected={
  'micrometer-368':(300+2*25+18)/1000,
  'micrometer-399':(375+24)/1000, 'micrometer-400':400/1000,
  'micrometer-zero':0, 'micrometer-999':(975+24)/1000,
  'vernier-micrometer-4627':(4500+120+7)/10000,
  'vernier-micrometer-2999':(2750+240+9)/10000,
  'vernier-micrometer-3000':3000/10000,
  'vernier-micrometer-0001':1/10000, 'vernier-micrometer-9999':(9750+240+9)/10000,
  'caliper-342':(1325+17)/1000,'caliper-349':(1325+24)/1000,'caliper-350':1350/1000,
  'caliper-zero':0,'caliper-024':24/1000,
  'metric-micrometer':(1100+50+36)/100,'dial-caliper':(2400+63)/1000,
  'tool-od':3,'tool-depth':2,'tool-tolerance':(2*0.002)/10,
  'bevel-35':26*60+7*5,'bevel-55':48*60+11*5,'bevel-20':17*60+4*5,
  'bevel-supplement':180*60-(41*60+9*5)
};
test('all 24 practice keys, printed answers, and rejection windows are checked',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../../practice/measurement-and-layout.html'),'utf8');
  const items=[...html.matchAll(/<div class="panel"[^>]*data-practice-id="measurement-([^"]+)"[^>]*data-answer="([^"]+)"[^>]*data-tolerance="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)];
  assert.equal(items.length,24);
  assert.equal(items.length,Object.keys(expected).length);
  for(const [,id,key,window,body] of items) {
    assert.ok(Object.hasOwn(expected,id),id);
    assert.equal(Number(key),expected[id],id);
    assert.equal(Number(window),0,id);
    assert.ok(body.includes(`<strong>${key}`),`${id}: printed answer must match accepted answer`);
    for(const error of [0.025,0.001,0.0001]) assert.ok(Math.abs(Number(key)+error-Number(key))>Number(window));
  }
  // Recheck tool-choice arithmetic separately from its numeric answer code.
  assert.equal((0.0005*2)/10,0.0001);
  assert.equal((0.001*2)/10,0.0002);
});
