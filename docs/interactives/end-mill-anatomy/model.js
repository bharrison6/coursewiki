(function (root, factory) {
  'use strict';
  var api = factory(typeof module === 'object' && module.exports ? require('../cutter-geometry/axial.js') : root.CourseWikiCutterAxial);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiEndMillAnatomy = api;
})(typeof self !== 'undefined' ? self : this, function (A) {
  'use strict';
  if(!A)throw new Error('Axial cutter geometry unavailable');
  var SPECS = Object.freeze({
    reduced: A.catalog({ id:'reduced', title:'Reduced-neck tool', oal:100, loc:20, lbs:70, cutterDiameter:12, neckDiameter:10, shankDiameter:12, helixDeg:40, flutes:4 }),
    longFlute: A.catalog({ id:'long-flute', title:'Long-flute tool', oal:100, loc:70, lbs:70, cutterDiameter:12, neckDiameter:12, shankDiameter:12, helixDeg:40, flutes:4 })
  });
  function state(input) {
    var s=Object.assign({ tool:'reduced', projection:75, dimension:'lbs' },input||{});
    if(!SPECS[s.tool]) throw new RangeError('Choose a defined tool');
    if(![75,85].includes(Number(s.projection))) throw new RangeError('Choose an illustrative projection');
    if(!['oal','loc','lbs','projection','diameters','helix','pitch'].includes(s.dimension)) throw new RangeError('Choose a defined anatomy dimension');
    s.projection=Number(s.projection);
    return Object.freeze(s);
  }
  function selection(input) {
    var s=state(input), spec=SPECS[s.tool];
    var mounted=A.mounting(spec,s.projection);
    return Object.freeze({ state:s, spec:spec, insertion:mounted.insertion,
      note:'Illustrative geometry; catalog dimensions do not change when mounting projection changes.' });
  }
  function compareMounting() {
    var spec=SPECS.reduced;
    return Object.freeze([75,85].map(function(p){var m=A.mounting(spec,p);return {projection:p,insertion:m.insertion,spec:spec};}));
  }
  return Object.freeze({ SPECS:SPECS, DEFAULT:state(), state:state, selection:selection, compareMounting:compareMounting });
});
