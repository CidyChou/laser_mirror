// ES5 syntax: loaded before the engine, including on older Android runtimes.
// Build targets lower syntax only; they do not provide newer built-in APIs.
(function () {
  'use strict';
  function define(target, name, implementation) {
    if (!target[name]) Object.defineProperty(target, name, {
      configurable: true, writable: true, value: implementation
    });
  }
  define(Object, 'entries', function (value) {
    return Object.keys(value).map(function (key) { return [key, value[key]]; });
  });
  define(Object, 'values', function (value) {
    return Object.keys(value).map(function (key) { return value[key]; });
  });
  define(Array.prototype, 'flatMap', function (callback, thisArg) {
    if (this == null) throw new TypeError('flatMap called on null or undefined');
    if (typeof callback !== 'function') throw new TypeError('flatMap requires a callback');
    var source = Object(this), result = [];
    var length = Math.min(Math.max(Math.floor(Number(source.length) || 0), 0), 9007199254740991);
    for (var i = 0; i < length; i++) {
      if (!(i in source)) continue;
      var mapped = callback.call(thisArg, source[i], i, source);
      if (Array.isArray(mapped)) {
        for (var j = 0; j < mapped.length; j++) if (j in mapped) result.push(mapped[j]);
      } else result.push(mapped);
    }
    return result;
  });
})();
