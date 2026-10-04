(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Arc90ReviewStorage = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function open(storage, key, validate, initial) {
    let baseline = storage.getItem(key);
    let state = baseline === null ? validate(initial) : validate(JSON.parse(baseline));
    return {
      read: () => validate(state),
      save(next) {
        const checked = validate(next);
        // Do not overwrite a second tab's newer records or report a failed write as saved.
        if (storage.getItem(key) !== baseline) throw new Error('This workspace changed in another window. Reload before saving.');
        const serialized = JSON.stringify(checked);
        storage.setItem(key, serialized);
        baseline = serialized;
        state = checked;
        return validate(state);
      },
    };
  }
  return { open };
}));
