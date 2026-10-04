const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const baseCss = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/approved-design.css'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const mark = fs.readFileSync(path.join(root, 'assets/arc90-mark.svg'), 'utf8');
const landing = fs.readFileSync(path.join(root, 'landing.html'), 'utf8');
const widget = fs.readFileSync(path.join(root, 'ios/App/Arc90Widget/Arc90Widget.swift'), 'utf8');
const iconGenerator = fs.readFileSync(path.join(root, 'icons/make_icons.py'), 'utf8');
const manifest = fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8');

const section = (from, to) => {
  const start = app.indexOf(from);
  const end = app.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `Missing production section: ${from}`);
  return app.slice(start, end);
};

const progress = section('function viewProgress(', 'function approvedProgressDay(');
assert.match(progress, /approvedProgressData\(progressRange\)/);
assert.match(progress, /approvedConsistencyChart\(data\)/);
assert.match(progress, /approvedCategoryBars\(7\)/);
assert.match(progress, /approvedMoodChart\(mood\)/);
assert.doesNotMatch(progress, /Axis Dashboard|Unlock with Premium|Your 90 Days/);

const field = section('function arcHistoryCells(', '/* ============================================================\n   COACH');
for (const state of ['rest', 'missed', 'future']) assert.match(field, new RegExp(state));
assert.match(field, /aria-label/);

for (const action of ['progress-range', 'progress-point', 'mood-point']) {
  assert.match(app, new RegExp(`case '${action}'`));
}

const sleep = section('function viewSleep()', 'function viewProtocol()');
assert.match(sleep, /<h1>Sleep<\/h1>/);
assert.doesNotMatch(sleep, /slhero|slGlow|moonPhase/);

const profile = section('function viewProfile()', 'function previewAccessPanel()');
assert.match(profile, /\['auto',\s*'Auto'/);
assert.match(profile, /\['dark',\s*'Dark'/);
assert.match(profile, /\['light',\s*'Light'/);
assert.doesNotMatch(profile, /\['(?:mono|gold|green|red)',/);
assert.ok(['Today trackers', 'Reminders', 'Appearance', 'Data & privacy'].every(title => profile.indexOf(title) >= 0 && profile.indexOf(title) < profile.indexOf('${emailCaptureCard()}')),
  'Optional updates must stay below core Profile controls.');

assert.ok(html.indexOf('css/approved-design.css?v=150') > html.indexOf('css/adaptive-day.css'),
  'Approved design stylesheet must load last.');
assert.match(html, /css\/styles\.css\?v=145/);
assert.match(html, /js\/adaptive-day\.js\?v=139/);
assert.match(html, /js\/live-update\.js\?v=139/);
assert.ok(Number(html.match(/js\/app\.js\?v=(\d+)/)?.[1]) >= 154, 'app entry includes the Arc navigation fixes');
assert.doesNotMatch(html, /splash3d|splashGrad|loading-screen/i);
assert.match(app, /if \(!bootNudge\) showLaunchQuote\(\)/);
assert.match(css, /\.launch-quote[\s\S]*background:var\(--bg\)/);
assert.ok(Number(sw.match(/arc90-mark2-v(\d+)/)?.[1]) >= 157, 'service worker invalidates caches predating the journal fixes');
assert.match(sw, /approved-design\.css/);
for (const match of html.matchAll(/(?:href|src)="((?:css|js)\/[^"?]+)/g)) {
  assert.ok(sw.includes(`'./${match[1]}'`), `Offline shell is missing ${match[1]}.`);
}
assert.match(manifest, /icons\/icon-192\.png/);
assert.doesNotMatch(css, /#(?:c9b7ef|705198)|rgba\(\s*(?:201\s*,\s*183\s*,\s*239|112\s*,\s*81\s*,\s*152)/i,
  'Approved light and dark themes must not reintroduce violet accents.');
assert.match(css, /--accent:\s*#b3dfbd/);
assert.match(css, /\[data-theme="light"\][\s\S]*--accent:\s*#28613c/);
assert.match(css, /\.reflection-share[\s\S]*background:var\(--card-2\)/);
assert.match(app, /function logoMarkSvg\(/);
assert.match(app, /arc90-logo-mark/);
assert.match(mark, /stroke="#b3dfbd"/);
assert.doesNotMatch(mark, /gradient|#(?:8f6bff|c14cff)/i);
assert.doesNotMatch(`${html}\n${baseCss}\n${css}\n${app}\n${landing}\n${widget}\n${iconGenerator}`,
  /#(?:c4a8ff|a986ff|5ee4ff|8f6bff|c14cff|a78bff|ecdcff|c9b7ef|705198)|rgba?\([^\)]*(?:143\s*,\s*107\s*,\s*255|193\s*,\s*76\s*,\s*255|199\s*,\s*62\s*,\s*207|201\s*,\s*183\s*,\s*239|112\s*,\s*81\s*,\s*152)/i,
  'Retired violet palette must stay out of every shipped brand surface.');
assert.match(css, /--field-line:\s*#747f86/);
assert.match(css, /\[data-theme="light"\][\s\S]*--field-line:\s*#737d84/);
assert.match(css, /#app input:not\(\[type="range"\]\)[\s\S]*border-color:var\(--field-line\)/);
assert.doesNotMatch(css, /adaptive-check\[data-act="task-sheet"\]\s*\{[^}]*opacity/i);

const luminance = (hex) => {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05)
  / (Math.min(luminance(a), luminance(b)) + .05);
assert.ok(contrast('#747f86', '#25292d') >= 3, 'Dark field boundaries must clear 3:1.');
assert.ok(contrast('#737d84', '#e9edf1') >= 3, 'Light field boundaries must clear 3:1.');

for (const selector of [
  '.approved-hero-metrics',
  '.next-move',
  '.adaptive-habit-item.just-completed',
  '.approved-range',
  '.approved-chart',
  '.approved-categories',
  '.approved-mood-chart',
  '.arc-grid-panel .cell.missed',
  '#app { max-width: 760px; }',
]) assert.ok(css.includes(selector), `Missing approved design rule: ${selector}`);

console.log('Approved design checks passed: cache, hierarchy, semantic charts, controls, and styling hooks.');
