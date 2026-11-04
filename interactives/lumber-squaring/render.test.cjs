'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), { execFileSync } = require('node:child_process');
const M = require('./model.js'), R = require('./render.js');

function balanced(html, tag) { return (html.match(new RegExp('<' + tag + '[\\s>]', 'g')) || []).length === (html.match(new RegExp('</' + tag + '>', 'g')) || []).length; }

test('check figures and readouts are finite, labelled and balanced for every board and stage', () => {
  for (const kind of Object.keys(M.BOARDS)) for (const st of M.run(kind, M.PLANER_FIRST)) {
    const html = R.checks(st.board, st.metrics) + R.readouts(st.metrics, 3.4e6);
    assert.doesNotMatch(html, /NaN|undefined|Infinity/, kind + ' ' + st.op);
    assert.ok(balanced(html, 'svg') && balanced(html, 'figure') && balanced(html, 'table'));
    assert.equal((html.match(/role="img" aria-label="[^"]+"/g) || []).length, 5, 'five labelled check figures');
  }
});

test('check verdicts follow the measurement, not the operation name', () => {
  const rough = M.create('cup'), done = M.run('cup', M.REFERENCE_ORDER).pop().board;
  assert.equal((R.checks(rough).match(/class="ls-check is-off"/g) || []).length, 5);
  assert.equal((R.checks(done).match(/class="ls-check is-ok"/g) || []).length, 5);
  const crook = M.create('crook');
  assert.match(R.checks(crook), /no gap, but still rough-sawn/, 'flat but unmachined is not called finished');
});

test('explanations state the flexible-board assumption and the rigid alternative', () => {
  const b = M.create('bow'), mb = M.measure(b);
  const flex = M.apply(b, 'plane', { planer: 'flexible' }), rigid = M.apply(b, 'plane', { planer: 'rigid' });
  assert.match(R.explain('plane', mb, M.measure(flex.board), flex.info), /flexible-board example.*springs back/);
  assert.match(R.explain('plane', mb, M.measure(rigid.board), rigid.info), /rigid example.*sled/);
  const tw = M.run('twist', ['joint-face', 'joint-edge']);
  assert.match(R.explain('joint-edge', tw[1].metrics, tw[2].metrics, tw[2].info), /square to it all along/);
});

test('static fallback carries the sequence, worked example, limits and no live-only controls', () => {
  const html = R.staticLesson();
  for (const s of ['reference order', 'Planer first', 'Worked example', 'What the model assumes', 'flexible-board', 'sled', 'not a depth-of-cut recommendation']) assert.ok(html.includes(s), s);
  assert.equal((html.match(/<svg class="ls-strip"/g) || []).length, 5, 'four reference strips and one planer-first strip');
  assert.doesNotMatch(html, /<button|<input|<select|<section|NaN|\[\[/);
  assert.equal(R.esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});

test('the page fallback matches the shared renderer', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, 'static.cjs')], { encoding: 'utf8' });
  assert.match(out, /matches the shared renderer/);
});
