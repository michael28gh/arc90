const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.TZ = 'America/Los_Angeles';
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const match = source.match(/function operationalDate\(date = new Date\(\), dayStartHour = S\.preferences\?\.dayStartHour \|\| 0\) \{[\s\S]*?\n\}/);
assert.ok(match, 'operational date helper is present');
const preferences = { dayStartHour: 4 };
const operationalDate = new Function('S', `return (${match[0]});`)({ preferences });
const day = value => {
  const date = operationalDate(new Date(value));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

assert.equal(day('2026-09-30T02:30:00'), '2026-09-29', '2:30 AM stays on the prior day');
assert.equal(day('2026-09-30T03:59:59'), '2026-09-29', 'boundary is exclusive');
assert.equal(day('2026-09-30T04:00:00'), '2026-09-30', '4 AM starts the new day');
preferences.dayStartHour = 0;
assert.equal(day('2026-09-30T02:30:00'), '2026-09-30', 'midnight option uses calendar day');
preferences.dayStartHour = 23;
assert.equal(day('2026-09-30T22:59:59'), '2026-09-29', 'late day-start remains consistent');
assert.equal(day('2026-09-30T23:00:00'), '2026-09-30');
assert.equal(operationalDate(new Date('2026-09-30T02:30:00'), 4).getDate(), 29,
  'initialization can resolve a date without reading global state');
console.log('Day boundary checks passed: night shift, boundary, midnight and late start.');
