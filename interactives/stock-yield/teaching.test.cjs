const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { calculate, defaults } = require('./model.js');
const { diagram } = require('./render.js');
const source = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
test('render every actual blank and cut, including 60-blank and zero-fit layouts', () => {
  for (const [values, expected] of [[{},10], [{length:'1200',blank:'20',kerf:'0'},60], [{length:'50',blank:'100'},0]]) {
    const r = calculate({...defaults,...values}), svg = diagram(r);
    assert.equal((svg.match(/data-sy-blank=/g)||[]).length, expected);
    assert.equal((svg.match(/data-sy-cut=/g)||[]).length, expected);
    assert.equal((svg.match(/data-sy-excluded-interval=/g)||[]).length, 2);
    assert.equal((svg.match(/data-sy-offcut-interval/g)||[]).length, 1);
    assert.match(svg, new RegExp(`aria-label="${expected} blanks and ${expected} full separating kerfs`));
    assert.ok(!svg.includes('id='), 'no SVG IDs to collide across independent roots');
    for (const match of svg.matchAll(/<rect[^>]* x="([\d.]+)"[^>]* width="([\d.]+)"/g)) {
      assert.ok(Number(match[1]) >= 20 && Number(match[1])+Number(match[2]) <= 980.000001);
    }
  }
});
test('static fallback retains the canonical default drawing and original teaching examples', () => {
  const page = source('collections/materials-and-processes/pages/material-utilization-and-cost.html');
  assert.ok(page.includes(diagram(calculate(defaults))), 'static diagram generated from the same renderer/model');
  for (const text of ['1,000 mm bar supplies 98 mm blanks', 'including the last blank', '$48 sheet yielding eight', '$13.00', 'economics-kerf','economics-utilization','economics-stock-share']) assert.ok(page.includes(text), text);
  for (const text of ['not a claim of globally maximum yield', 'excluded trim lengths already include their own cut losses', '$48 / 9', 'cost per blank is undefined', '999.99']) assert.ok(page.includes(text), text);
  assert.match(page, /<div data-interactive="stock-yield">[\s\S]*<div class="sy-fallback">[\s\S]*Blank count n = floor/);
});
test('six original practice keys admit printed rounding and reject wrong methods', () => {
  const html = source('practice/stock-yield.html');
  const panels = [...html.matchAll(/<div class="panel"([^>]+)>([\s\S]*?)<\/div>/g)];
  const expected = {
    'stock-yield-trim-count': [Math.floor((1000-10-20)/(100+2)),9,[10]],
    'stock-yield-offcut': [1000-30-9*100-9*2,52,[54,70]],
    'stock-yield-threshold': [10*(98+3),1010,[1007,1000]],
    'stock-yield-cost': [48/9,5.33,[4.8,48]],
    'stock-yield-utilization': [9*100/1000*100,90,[900/970*100]],
    'stock-yield-no-fit': [2,2,[1,3]]
  };
  assert.equal(panels.length, 6);
  for (const [,attrs,body] of panels) {
    const attr = name => new RegExp(`\\b${name}="([^"]+)"`).exec(attrs)?.[1];
    const id = attr('data-practice-id'), answer = Number(attr('data-answer')), tolerance = Number(attr('data-tolerance'));
    assert.ok(Object.hasOwn(expected,id), id);
    const [recomputed,printed,wrong] = expected[id];
    assert.ok(Math.abs(answer-recomputed)<=1e-12,id+' independently recomputed');
    assert.ok(Math.abs(answer-printed)<=tolerance,id+' printed answer accepted');
    for (const value of wrong) assert.ok(Math.abs(answer-value)>tolerance,id+' wrong-method control rejected');
    assert.equal(attr('data-practice-source'),'material-utilization-and-cost');
    if (id==='stock-yield-no-fit') assert.equal(attr('data-unit'),'choice');
    assert.ok(body.includes('data-practice-feedback') && body.includes('Show worked solution'));
  }
});
