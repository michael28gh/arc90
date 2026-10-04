(function (root, factory) {
  var create = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = create;
  if (root) root.Arc90PreviewAccess = create();
}(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  var BUILD_ENABLED = true;
  var ENDS_AT = '2026-10-31T00:00:00-07:00';
  var KEY = 'arc90.preview-access.v1';

  return function create(options) {
    options = options || {};
    var enabled = options.enabled === undefined ? BUILD_ENABLED : options.enabled;
    var endsAt = options.endsAt === undefined ? ENDS_AT : options.endsAt;
    var cutoff = typeof endsAt === 'string' ? Date.parse(endsAt) : NaN;
    var now = options.now === undefined ? Date.now : options.now;
    var storage = null;
    try {
      storage = Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage : root && root.localStorage;
    } catch (_) { /* Storage may be blocked by the browser. */ }

    function preference() {
      try {
        var value = storage.getItem(KEY);
        return value === 'true' ? true : value === 'false' ? false : null;
      } catch (_) { return null; }
    }

    function available() {
      try {
        var time = now();
        return enabled === true && Number.isFinite(time) && Number.isFinite(cutoff) && time < cutoff;
      } catch (_) { return false; }
    }

    function setEnabled(value) {
      if (typeof value !== 'boolean' || (value && !available())) return false;
      try {
        storage.setItem(KEY, String(value));
        return preference() === value;
      } catch (_) { return false; }
    }

    var api = {
      available: available,
      enrolled: function () { return preference() !== null; },
      active: function () { return available() && preference() === true; },
      setEnabled: setEnabled
    };
    Object.defineProperty(api, 'endsAt', {
      value: typeof endsAt === 'string' ? endsAt : '',
      enumerable: true
    });
    return api;
  };
}));
