(function () {
  'use strict';
  var M = window.FiberOrientationModel;
  if (!M) return;
  var instance = 0;

  function init(root) {
    if (root.dataset.foReady) return;
    instance += 1;
    var id = 'fo-' + instance;
    var angle = 0;
    var revealed = false;
    var live = document.createElement('div');
    live.className = 'fo-lab';
    live.innerHTML =
      '<p class="fo-intro"><strong>Predict before revealing:</strong> three identical unidirectional material patches carry the same 10 MPa axial stress. Which fiber direction gives the smallest axial stretch?</p>' +
      '<fieldset class="fo-predict"><legend>Your prediction</legend>' +
        radio(id, '0', '0° — fibers along the load') + radio(id, '45', '45° — fibers diagonal to the load') + radio(id, '90', '90° — fibers across the load') +
        '<button type="button" data-fo="reveal" disabled>Reveal the equal-stress comparison</button>' +
      '</fieldset>' +
      '<p class="fo-feedback" data-fo="feedback" role="status" aria-live="polite">Choose a direction first.</p>' +
      '<div class="fo-experiment" data-fo="experiment" hidden>' +
        '<div class="fo-controls"><label for="' + id + '-angle">Starting fiber angle to the load <output data-fo="angle-output">0°</output>' +
          '<input id="' + id + '-angle" data-fo="angle" type="range" min="-90" max="90" step="1" value="0"></label>' +
          '<div class="fo-presets" aria-label="Fiber-angle presets"><button type="button" data-angle="-45">−45°</button><button type="button" data-angle="0">0°</button><button type="button" data-angle="45">+45°</button><button type="button" data-angle="90">90°</button></div>' +
        '</div>' +
        '<div class="fo-visual"><svg viewBox="0 0 640 350" role="img" data-fo="svg" aria-labelledby="' + id + '-title ' + id + '-desc">' +
          '<title id="' + id + '-title">Free material patch under uniform axial stress</title><desc id="' + id + '-desc" data-fo="svg-desc"></desc>' +
          '<defs><clipPath id="' + id + '-clip"><polygon data-fo="clip"></polygon></clipPath><marker id="' + id + '-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z"></path></marker></defs>' +
          '<rect class="fo-baseline" x="190" y="110" width="260" height="130"></rect><polygon class="fo-patch" data-fo="patch"></polygon>' +
          '<g class="fo-fibers" data-fo="fibers" clip-path="url(#' + id + '-clip)"></g>' +
          '<g class="fo-load"><line x1="175" y1="135" x2="100" y2="135" marker-end="url(#' + id + '-arrow)"></line><line x1="175" y1="175" x2="100" y2="175" marker-end="url(#' + id + '-arrow)"></line><line x1="175" y1="215" x2="100" y2="215" marker-end="url(#' + id + '-arrow)"></line><line x1="465" y1="135" x2="540" y2="135" marker-end="url(#' + id + '-arrow)"></line><line x1="465" y1="175" x2="540" y2="175" marker-end="url(#' + id + '-arrow)"></line><line x1="465" y1="215" x2="540" y2="215" marker-end="url(#' + id + '-arrow)"></line></g>' +
          '<text class="fo-load-label" x="320" y="35" text-anchor="middle">uniform σx = 10 MPa</text><text class="fo-free-label" x="320" y="326" text-anchor="middle">free edges — no grips</text>' +
        '</svg><p>Dashed outline: unloaded patch. Solid outline: deformed shape, exaggerated <strong>120×</strong> at every angle. The repeated arrows represent uniform edge traction, not rigid jaws.</p></div>' +
        '<div class="fo-readings" data-fo="readings"></div>' +
        '<div class="fo-compare" data-fo="compare"></div>' +
        '<p class="fo-coupling" data-fo="coupling"></p>' +
      '</div>';
    root.insertBefore(live, root.querySelector('.fo-static'));
    root.dataset.foReady = 'true';

    function radio(name, value, label) {
      return '<label><input type="radio" name="' + name + '-prediction" value="' + value + '"> ' + label + '</label>';
    }
    function one(selector) { return live.querySelector(selector); }
    function fmt(value, digits) {
      var text = Number(value).toFixed(digits);
      return Number(text) === 0 ? Number(0).toFixed(digits) : text;
    }
    function percent(value) { return fmt(value * 100, 4) + '%'; }
    function micro(value) { return fmt(value * 1e6, 1) + ' µε'; }
    function points(result) {
      var scale = 120, ex = result.globalStrain.epsilonX, ey = result.globalStrain.epsilonY;
      var halfShear = result.globalStrain.gammaXY / 2;
      return [[-130, 65], [130, 65], [130, -65], [-130, -65]].map(function (point) {
        var x = point[0] * (1 + scale * ex) + point[1] * scale * halfShear;
        var y = point[0] * scale * halfShear + point[1] * (1 + scale * ey);
        return [320 + x, 175 - y];
      });
    }
    function pointText(list) { return list.map(function (p) { return fmt(p[0], 2) + ',' + fmt(p[1], 2); }).join(' '); }
    function drawFibers(result) {
      var group = one('[data-fo="fibers"]');
      group.replaceChildren();
      var theta = angle * Math.PI / 180, dx = Math.cos(theta), dy = Math.sin(theta);
      var nx = -dy, ny = dx, strain = result.globalStrain, scale = 120;
      function deform(x, y) {
        var xd = x * (1 + scale * strain.epsilonX) + y * scale * strain.gammaXY / 2;
        var yd = x * scale * strain.gammaXY / 2 + y * (1 + scale * strain.epsilonY);
        return [320 + xd, 175 - yd];
      }
      for (var offset = -180; offset <= 180; offset += 26) {
        var p1 = deform(nx * offset - dx * 260, ny * offset - dy * 260);
        var p2 = deform(nx * offset + dx * 260, ny * offset + dy * 260);
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', p1[0]); line.setAttribute('y1', p1[1]); line.setAttribute('x2', p2[0]); line.setAttribute('y2', p2[1]);
        group.appendChild(line);
      }
    }
    function compareMarkup() {
      return [0, 45, 90].map(function (a) {
        var r = M.illustrative(a);
        return '<article' + (a === angle ? ' data-current="true"' : '') + '><h3>' + a + '° fibers</h3><strong>' + fmt(r.effectiveModulusGPa, 2) + ' GPa</strong><span>axial stiffness</span><strong>' + percent(r.globalStrain.epsilonX) + '</strong><span>axial strain</span></article>';
      }).join('');
    }
    function render() {
      var result = M.illustrative(angle), polygon = points(result), signed = angle > 0 ? '+' + angle : String(angle);
      one('[data-fo="angle-output"]').textContent = signed + '°';
      one('[data-fo="angle"]').value = angle;
      one('[data-fo="patch"]').setAttribute('points', pointText(polygon));
      one('[data-fo="clip"]').setAttribute('points', pointText(polygon));
      drawFibers(result);
      one('[data-fo="readings"]').innerHTML =
        '<div><strong>Effective axial stiffness E<sub>x</sub></strong><span>' + fmt(result.effectiveModulusGPa, 2) + ' GPa</span></div>' +
        '<div><strong>Axial strain ε<sub>x</sub></strong><span>' + percent(result.globalStrain.epsilonX) + '</span></div>' +
        '<div><strong>Transverse strain ε<sub>y</sub></strong><span>' + percent(result.globalStrain.epsilonY) + '</span></div>' +
        '<div><strong>Engineering shear γ<sub>xy</sub></strong><span>' + micro(result.globalStrain.gammaXY) + '</span></div>';
      one('[data-fo="compare"]').innerHTML = compareMarkup();
      var shear = result.globalStrain.gammaXY;
      one('[data-fo="coupling"]').innerHTML = Math.abs(shear) < 1e-10 ? '<strong>No extension–shear coupling at this principal direction.</strong> The patch stretches and narrows without skewing.' :
        '<strong>Off-axis extension also skews the free patch.</strong> At the opposite angle, axial stiffness and axial strain stay the same while the shear sign reverses.';
      one('[data-fo="svg-desc"]').textContent = 'Fibers at ' + signed + ' degrees in the unloaded patch, measured from the horizontal load axis. The free material patch carries 10 megapascals axial stress. Axial strain is ' + percent(result.globalStrain.epsilonX) + ', transverse strain is ' + percent(result.globalStrain.epsilonY) + ', and engineering shear strain is ' + micro(shear) + '. Deformation is exaggerated 120 times; the drawn fibers follow that deformation.';
      one('[data-fo="svg"]').setAttribute('aria-label', one('[data-fo="svg-desc"]').textContent);
    }

    live.addEventListener('change', function (event) {
      if (event.target.matches('input[type="radio"]')) {
        one('[data-fo="reveal"]').disabled = false;
        one('[data-fo="feedback"]').textContent = 'Prediction recorded. Reveal when ready.';
      }
    });
    one('[data-fo="reveal"]').addEventListener('click', function () {
      var choice = live.querySelector('input[type="radio"]:checked');
      if (!choice) return;
      revealed = true;
      one('[data-fo="experiment"]').hidden = false;
      one('[data-fo="feedback"]').textContent = choice.value === '0' ? 'Prediction confirmed: 0° has the greatest axial stiffness and the smallest axial stretch for these illustrative constants.' : 'Compare the results: 0° stretches least because the stiff fiber direction is aligned with the applied stress.';
      angle = Number(choice.value);
      render();
    });
    one('[data-fo="angle"]').addEventListener('input', function (event) { angle = Number(event.target.value); render(); });
    live.querySelector('.fo-presets').addEventListener('click', function (event) {
      var button = event.target.closest('[data-angle]');
      if (!button || !revealed) return;
      angle = Number(button.dataset.angle); render();
    });
    live.addEventListener('keydown', function (event) { if (event.target.matches('input,button')) event.stopPropagation(); });
  }
  function initAll() { document.querySelectorAll('[data-interactive="fiber-orientation"]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll, { once: true });
  else initAll();
})();
