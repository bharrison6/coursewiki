(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = { create: factory };
  else root.CourseWikiMotorLoad = factory(root.CourseWikiDCMotor, root.CourseWikiGears);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (motor, gears) {
  'use strict';
  if (!motor || typeof motor.operatingPoint !== 'function') throw new Error('The DC motor model is required.');
  if (!gears || typeof gears.solve !== 'function') throw new Error('The gear-ratio model is required.');

  function validate(s) {
    if (!s || ![s.stallTorque, s.noLoadSpeed, s.outputLoadTorque, s.efficiency].every(Number.isFinite)) {
      throw new RangeError('Enter a finite number in every field.');
    }
    if (s.stallTorque <= 0 || s.stallTorque > 10) throw new RangeError('Use stall torque greater than 0 and at most 10 N·m.');
    if (s.noLoadSpeed <= 0 || s.noLoadSpeed > 240) throw new RangeError('Use no-load speed greater than 0 and at most 240 rpm.');
    if (s.outputLoadTorque < 0 || s.outputLoadTorque > 10) throw new RangeError('Use output load torque from 0 to 10 N·m.');
    if (!Number.isInteger(s.driverTeeth) || !Number.isInteger(s.drivenTeeth) ||
        s.driverTeeth < 20 || s.driverTeeth > 59 || s.drivenTeeth < 21 || s.drivenTeeth > 60) {
      throw new RangeError('Use 20–59 whole driver teeth and 21–60 whole driven teeth.');
    }
    if (s.drivenTeeth <= s.driverTeeth) throw new RangeError('For this reduction experiment, driven gear teeth must exceed driver gear teeth.');
    if (s.efficiency <= 0 || s.efficiency > 100) throw new RangeError('Use mesh efficiency greater than 0 and at most 100%.');
    return s;
  }

  function path(point, requiredTorque, outputLoadTorque, ratio, efficiency, kind) {
    if (point.state === 'overload') {
      return { state: 'overload', requiredMotorTorque: requiredTorque,
        motorSpeed: null, motorShaftPower: null, outputSpeed: null, outputTorque: null, outputPower: null };
    }
    if (point.state === 'stall') {
      return { state: 'stall', requiredMotorTorque: requiredTorque,
        motorSpeed: 0, motorShaftPower: 0, outputSpeed: 0, outputTorque: outputLoadTorque, outputPower: 0 };
    }
    if (kind === 'direct') {
      return { state: 'running', requiredMotorTorque: requiredTorque,
        motorSpeed: point.speed, motorShaftPower: point.power, outputSpeed: point.speed,
        outputTorque: outputLoadTorque, outputPower: point.power };
    }
    const transfer = gears.solve({ mode: 'pair', a: ratio.driver, b: ratio.driven, idler: 30, c: 20, d: 40,
      rpm: point.speed, torque: requiredTorque, direction: 1, efficiency: efficiency * 100 });
    return { state: 'running', requiredMotorTorque: requiredTorque,
      motorSpeed: point.speed, motorShaftPower: point.power, outputSpeed: Math.abs(transfer.output.rpm),
      outputTorque: transfer.deliveredTorque, outputPower: transfer.deliveredPower };
  }

  function compare(input) {
    const s = validate(Object.assign({}, input));
    const unitTransfer = gears.solve({ mode: 'pair', a: s.driverTeeth, b: s.drivenTeeth,
      idler: 30, c: 20, d: 40, rpm: s.noLoadSpeed, torque: 1, direction: 1, efficiency: s.efficiency });
    const reduction = unitTransfer.ratio;
    const meshEfficiency = unitTransfer.totalEfficiency;
    const directPoint = motor.operatingPoint(s.stallTorque, s.noLoadSpeed, s.outputLoadTorque);
    const gearedMotorTorque = s.outputLoadTorque / (reduction * meshEfficiency);
    const gearedPoint = motor.operatingPoint(s.stallTorque, s.noLoadSpeed, gearedMotorTorque);
    const direct = path(directPoint, s.outputLoadTorque, s.outputLoadTorque, 1, 1, 'direct');
    const geared = path(gearedPoint, gearedMotorTorque, s.outputLoadTorque,
      { driver: s.driverTeeth, driven: s.drivenTeeth, value: reduction }, meshEfficiency, 'geared');
    const directSpeed = direct.outputSpeed || 0, gearedSpeed = geared.outputSpeed || 0;
    let faster = 'same';
    if (directSpeed === 0 && gearedSpeed === 0) faster = 'neither';
    else if (Math.abs(directSpeed - gearedSpeed) > 1e-10) faster = gearedSpeed > directSpeed ? 'geared' : 'direct';
    return { input: s, reduction, meshEfficiency, direct, geared, faster };
  }

  return Object.freeze({ compare });
});
