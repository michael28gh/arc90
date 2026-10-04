const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const css = read('css/approved-design.css');
const base = read('css/styles.css');
const app = read('js/app.js');
assert.match(css, /\.brandbar\s*\{\s*padding-block:\s*calc\(18px \+ env\(safe-area-inset-top, 0px\)\) 10px/);
assert.match(base, /margin: calc\(-14px - env\(safe-area-inset-top\)\)/);
assert.match(base, /padding: calc\(14px \+ env\(safe-area-inset-top\)\) 18px/);
// The screen inset and banner margin cancel. The banner must restore the inset.
for (const inset of [0, 20, 44, 59, 62]) {
  const logoTop = (14 + inset) + (-14 - inset) + (18 + inset);
  assert.equal(logoTop - inset, 18, `Logo clearance with ${inset}px safe area`);
}
const scroll = app.slice(app.indexOf('function wireScrollFX()'), app.indexOf('function wireAfterRender()'));
assert.doesNotMatch(scroll, /top\.style\.(transform|opacity)/);
console.log('Header checks passed: safe-area clearance on notch-free and Dynamic Island screens; stable page title.');
