(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./model.js') : root.CourseWikiStraightPull, node ? require('./render.js') : root.CourseWikiStraightPullDraw);
  if (node) module.exports = api;
  else { root.CourseWikiStraightPullDemo = api; if (typeof document !== 'undefined') document.querySelectorAll('[data-interactive="straight-pull"]').forEach(api.init); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M,D) {
  'use strict';
  var sequence = 0;
  function init(root) {
    if (root.dataset.spReady || !M || !D) return;
    var id; do { id = 'sp-' + (++sequence); } while (document.getElementById(id + '-pull'));
    var lab = document.createElement('div'); lab.className = 'sp-lab';
    lab.innerHTML = '<p><strong>Can every intermediate section fit?</strong> This is an exact-fit, centered, symmetric <strong>rigid 2D</strong> pattern and cavity. The only allowed motion is straight upward at fixed orientation into unobstructed space. Diagram units are illustrative.</p>' +
      '<figure data-sp="context">'+D.diagram('hook',0)+'<figcaption>Starting geometry, before any pull. Local-shoulder stations (depth, half-width): <strong>(0,30), (20,22), (25,26), (40,15)</strong>. Compare the widths at depths 20 and 25 before choosing.</figcaption></figure>' +
      '<fieldset class="sp-predict"><legend>Locate the obstruction before revealing</legend><p>The local-shoulder profile has its widest opening at depth 0. At an attempted outward pull of 5, where can it overlap the rigid cavity?</p>' +
      ['mouth|Nowhere: the mouth is widest','shoulder|Inside, near depth 20','bottom|Only at the bottom, depth 40'].map(function (o) { var p=o.split('|'); return '<label><input type="radio" name="' + id + '-guess" value="' + p[0] + '"> ' + p[1] + '</label>'; }).join('') +
      '<button type="button" data-sp="reveal" disabled aria-controls="' + id + '-experiment">Reveal and test trial poses</button><p data-sp="feedback" role="status">Choose a prediction first.</p></fieldset>' +
      '<div id="' + id + '-experiment" data-sp="experiment" hidden><div class="sp-controls"><label for="' + id + '-profile">Illustrative section<select id="' + id + '-profile" data-sp="profile">' + M.profiles.map(function (p) { return '<option value="' + p.id + '"' + (p.id==='hook'?' selected':'') + '>' + p.name + '</option>'; }).join('') + '</select></label>' +
      '<label for="' + id + '-pull">Attempted outward displacement: <output data-sp="pull-label">5</output><input id="' + id + '-pull" data-sp="pull" type="range" min="0" max="40" step="1" value="5"></label>' +
      '<div class="sp-presets"><button type="button" data-sp-pull="0">Initial contact · 0</button><button type="button" data-sp-pull="5">Trial pose · 5</button><button type="button" data-sp-pull="40">Outside endpoint · 40</button></div></div>' +
      '<p class="sp-path" data-sp="path" role="status"></p><figure><div data-sp="drawing"></div><figcaption>Solid cavity outline stays fixed; dashed pattern is a hypothetical translated pose. Outlined bands and × marks locate overlap. This is not an animation of rigid material passing through a mold.</figcaption></figure>' +
      '<div class="sp-readings" data-sp="readings" aria-live="polite"></div><details class="deeper"><summary>Why checking the whole path differs from checking one pose</summary><p>With opening depth 0, half-width w(d), and outward displacement t, the trial pattern at cavity depth d has half-width w(d+t). It fits only where Δ(d) = w(d+t) − w(d) ≤ 0. A complete exact-fit straight-pull path requires w to be nonincreasing with depth. Each deeper station is checked against the preceding minimum width, so cumulative small increases cannot disappear from the verdict.</p><p>For each pose, Δ is linear between original and translated profile knots. Endpoints and those combined knots give the maximum; zero crossings give each positive-overlap interval. Slider frames are illustrations, not proof. t = 0 is initial contact; t = 40 has no remaining interior overlap but cannot make a blocked path pass.</p><p data-sp="tolerance"></p></details></div>' +
      '<p>This predicts only geometric interference. It omits friction, adhesion, shrinkage, forces, damage, cure, rotation, lateral motion, deformation and unshown 3D features. No-interference is not practical release; rigid interference does not establish failure of flexible silicone.</p>';
    root.insertBefore(lab,root.firstChild);
    var q = function (key) { return lab.querySelector('[data-sp="'+key+'"]'); };
    function f(v) { return String(Number(v.toFixed(4))); }
    function update() {
      var profile=M.profiles.find(function(p){return p.id===q('profile').value;}), pull=Number(q('pull').value), r=M.inspect(profile.stations,pull);
      q('pull-label').textContent=f(pull); q('drawing').innerHTML=D.diagram(profile.id,pull);
      q('path').textContent = r.pathBlocked ? 'Whole path: BLOCKED in this rigid 2D model. A deeper half-width exceeds an earlier width: depth '+f(r.rises[0].shallow)+' → '+f(r.rises[0].deep)+'. This verdict stays blocked at the outside endpoint.' : 'Whole path: no positive geometric interference. Half-width does not increase with depth. Contact can still occur; this is not a practical-release prediction.';
      var text;
      if (r.status==='clear-endpoint') text='<h3>Current trial: no interior overlap</h3><p>The pattern is outside at t = 40. This endpoint says nothing about whether it could get there along the permitted rigid path.</p>';
      else if (r.status==='interference') {
        var cw=M.widthAt(profile.stations,r.maxDepth), pw=M.widthAt(profile.stations,r.maxDepth+pull);
        text='<h3>Current trial: geometric interference</h3><p>At cavity depth <strong>'+f(r.maxDepth)+'</strong>, translated pattern half-width <strong>'+f(pw)+'</strong> exceeds cavity half-width <strong>'+f(cw)+'</strong>: <strong>'+f(r.maxDelta)+' per side</strong>.</p><p>Positive overlap at depths '+r.positiveIntervals.map(function(i){return (i.startClosed?'[':'(')+f(i.start)+', '+f(i.end)+(i.endClosed?']':')');}).join(' and ')+'. Parentheses exclude zero-contact boundaries; brackets include overlapping domain endpoints.</p>';
      } else if (r.status==='contact') text='<h3>Current trial: side contact</h3><p>'+(pull===0?'Initial exact fit: every section starts in contact. This pose alone does not prove a continuous path.':'No positive interference at this pose, but some side contact persists. Parallel sides remain in contact throughout their overlap.')+'</p>';
      else text='<h3>Current trial: side separation</h3><p>Minimum side clearance within the remaining overlap: <strong>'+f(-r.maxDelta)+'</strong> diagram units. This is geometric separation in the ideal model.</p>';
      q('readings').innerHTML=text;
      q('tolerance').textContent='Numerical comparisons use 64 × machine epsilon × maximum half-width ('+r.tolerance.toExponential(3)+' width units here). Values within this scale-relative floating-point threshold are treated as contact. This is numerical bookkeeping, not physical clearance or a manufacturing tolerance. Readouts round to four decimals; calculations use unrounded values.';
    }
    lab.querySelector('.sp-predict').addEventListener('change',function(){q('reveal').disabled=!lab.querySelector('input[type="radio"]:checked');});
    q('reveal').addEventListener('click',function(){var guess=lab.querySelector('input[type="radio"]:checked');if(!guess)return;q('feedback').textContent=(guess.value==='shoulder'?'Prediction confirmed. ':'Check the interior shoulder. ')+'At pull 5, the section originally at depth 25 moves to cavity depth 20: half-width 26 meets 22, giving 4 interference per side. The wide mouth alone is insufficient.';q('context').hidden=true;q('experiment').hidden=false;update();});
    q('profile').addEventListener('change',update);q('pull').addEventListener('input',update);
    lab.querySelectorAll('[data-sp-pull]').forEach(function(b){b.addEventListener('click',function(){q('pull').value=b.dataset.spPull;update();});});
    root.dataset.spReady='true';
  }
  return {init:init};
});
