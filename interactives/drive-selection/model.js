/* Qualitative classroom screening, not a rating or life calculation. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiDriveSelection = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const options = Object.freeze({
    distance: ['close', 'separated'],
    timing: ['flexible', 'exact'],
    speed: ['low', 'moderate', 'high'],
    environment: ['sheltered', 'clean', 'abrasive', 'washdown', 'hot']
  });
  const defaults = Object.freeze({ distance: 'separated', timing: 'exact', speed: 'moderate', environment: 'clean' });
  function evaluate(input) {
    const state = Object.assign({}, defaults, input);
    Object.keys(options).forEach(key => {
      if (!options[key].includes(state[key])) throw new RangeError('Unknown ' + key);
    });
    const drives = [
      { id: 'friction', name: 'Flat / V-belt', positive: false, reasons: ['Dry belt contact; often economical and quiet.'], cautions: [], blockers: [] },
      { id: 'timing', name: 'Timing belt', positive: true, reasons: ['Matching teeth maintain timing; belt contact needs no lubricant.'], cautions: [], blockers: [] },
      { id: 'chain', name: 'Roller chain', positive: true, reasons: ['Sprockets maintain the average ratio across separated shafts.'], cautions: [], blockers: [] },
      { id: 'gear', name: 'Gear pair', positive: true, reasons: ['Direct tooth engagement provides a compact positive drive.'], cautions: [], blockers: [] }
    ];
    drives.forEach(d => {
      if (state.distance === 'separated') {
        if (d.id === 'gear') d.blockers.push('A single compact gear pair cannot bridge the specified gap; change the layout or add transmission stages.');
        else d.reasons.push('A flexible loop can bridge this shaft spacing; verify available length and engagement.');
      } else if (d.id === 'gear') d.reasons.push('Close shaft centers suit a direct gear mesh.');
      else d.cautions.push('Close centers can limit wrap or tooth engagement; check the small wheel and adjustment space.');
      if (state.timing === 'exact') {
        if (!d.positive) d.blockers.push('Frictional slip can change timing; this family cannot guarantee synchronization.');
        if (d.id === 'chain') d.cautions.push('No ordinary slip, but chordal speed ripple, joint clearance and wear limit positioning precision.');
        if (d.id === 'gear') d.cautions.push('Allow for backlash on reversal and elastic deflection when specifying positioning accuracy.');
        if (d.id === 'timing') d.cautions.push('Verify allowable positioning error, belt stiffness, tooth profile and engagement.');
      } else if (d.id === 'friction') d.reasons.push('Small speed variation is acceptable, so frictional grip can suit the job.');
      if (state.speed === 'high') {
        if (d.id === 'chain') d.cautions.push('High speed increases engagement noise and dynamic effects; check sprocket size and lubrication method.');
        else if (d.id === 'gear') d.cautions.push('Consider helical teeth for smooth engagement; size thrust bearings and verify the speed rating.');
        else d.cautions.push('Check the belt speed rating, minimum pulley size and heat generation; no universal speed limit applies.');
      } else if (state.speed === 'low') d.reasons.push('Low speed does not imply low torque; size the drive for the actual load.');
      if (state.environment === 'clean') {
        if (d.id === 'chain') d.cautions.push('Ordinary chain lubrication conflicts with a lubricant-sensitive area; use containment or a specifically rated special chain.');
        else if (d.id === 'gear') d.cautions.push('A sealed lubricated housing may keep oil away from the product; verify seals and maintenance access.');
        else d.reasons.push('Dry belt contact is useful near a lubricant-sensitive process.');
      }
      if (state.environment === 'abrasive') d.cautions.push(d.id === 'gear'
        ? 'An enclosed gearbox with suitable seals can exclude grit; inspect lubricant contamination.'
        : 'Exclude grit from the exposed loop and contact surfaces; abrasion can shorten service life.');
      if (state.environment === 'washdown') d.cautions.push(d.id === 'chain' || d.id === 'gear'
        ? 'Check corrosion resistance, seals and lubricant washout; ordinary parts are not automatically washdown-rated.'
        : 'Check belt and pulley compatibility with water, cleaning chemicals and temperature.');
      if (state.environment === 'hot') d.cautions.push(d.id === 'chain' || d.id === 'gear'
        ? 'Check material, lubricant, seal and bearing temperature ratings.'
        : 'Check the specific belt material and cord temperature ratings; do not apply one range to all belts.');
      d.status = d.blockers.length ? 'Does not meet this layout / timing' : d.cautions.length ? 'Candidate — review conditions' : 'Candidate to size';
      d.fit = d.blockers.length ? 'excluded' : d.cautions.length ? 'review' : 'candidate';
    });
    return { state, drives };
  }
  return { evaluate, defaults, options };
}));
