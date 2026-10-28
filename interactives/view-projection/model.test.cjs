const test = require('node:test');
const assert = require('node:assert/strict');
const { parts, project, layout } = require('./model.js');
test('front contour is the stepped profile, not its rectangular bounding box', () => {
  assert.deepEqual(project(parts[0], 'front').outline, [[0,0],[3,0],[3,1],[2,1],[1,1],[1,3],[0,3]]);
  assert.notDeepEqual(project(parts[0], 'front').outline, project(parts[1], 'front').outline);
});
test('top locates discontinuities, with no seams between equal heights', () => {
  assert.deepEqual(parts.map(p => project(p,'top').edges.map(e => e.a[0])), [[1],[2],[1,2]]);
});
test('right view preserves visible shelf but hides the far shelf behind a tall right strip', () => {
  assert.deepEqual(parts.map(p => project(p,'right').edges), [
    [{a:[0,1],b:[2,1],hidden:false}],
    [{a:[0,1],b:[2,1],hidden:true}],
    [{a:[0,1],b:[2,1],hidden:false}]
  ]);
});
test('projection shares width, height, depth across every part', () => {
  for (const p of parts) {
    const f=project(p,'front'), t=project(p,'top'), r=project(p,'right');
    assert.equal(f.width,t.width); assert.equal(f.height,r.height); assert.equal(t.height,r.width);
  }
});
test('angle convention changes placement and preserves shared alignment', () => {
  const a=layout('third'), b=layout('first');
  for(const l of [a,b]) { assert.equal(l.top[0],l.front[0]); assert.equal(l.right[1],l.front[1]); }
  assert.ok(a.top[1]<a.front[1] && a.right[0]>a.front[0]);
  assert.ok(b.top[1]>b.front[1] && b.right[0]<b.front[0]);
  assert.throws(()=>layout('fourth')); assert.throws(()=>project(parts[0],'diagonal'));
});
