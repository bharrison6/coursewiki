(function (root) {
  'use strict';
  function calculate(input) {
    const { voltage, capacity, series, parallel, rate, load } = input;
    if (![voltage, capacity, series, parallel, rate, load].every(Number.isFinite)) {
      throw new RangeError('Enter a finite number in every field.');
    }
    if (voltage <= 0 || capacity <= 0 || rate <= 0 || load < 0) {
      throw new RangeError('Voltage, capacity and C-rate must be positive; load must be zero or positive.');
    }
    if (![series, parallel].every(n => Number.isSafeInteger(n) && n >= 1)) {
      throw new RangeError('Series and parallel counts must be positive whole numbers.');
    }
    const packVoltage = voltage * series;
    const packCapacity = capacity * parallel;
    const energy = packVoltage * packCapacity;
    const maxCurrent = rate * packCapacity;
    const runtime = load === 0 ? null : packCapacity / load;
    if (![packVoltage, packCapacity, energy, maxCurrent].every(n => Number.isFinite(n) && n > 0) ||
        (runtime !== null && (!Number.isFinite(runtime) || runtime <= 0))) {
      throw new RangeError('These inputs exceed the numeric range of this model.');
    }
    return { packVoltage, packCapacity, energy, maxCurrent, runtime, overloaded: load > maxCurrent };
  }
  const api = Object.freeze({ calculate });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseWikiBatteryPack = api;
})(typeof globalThis === 'object' ? globalThis : this);
