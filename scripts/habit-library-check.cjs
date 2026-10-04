const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(`${source}\nthis.HABIT_LIBRARY = HABIT_LIBRARY; this.CATEGORIES = CATEGORIES;`, context);
const { HABIT_LIBRARY: library, CATEGORIES: categories } = context;
const norm = text => text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

assert.equal(library.length, 400, 'the library offers 400 habits');
assert.equal(new Set(library.map(h => h.id)).size, library.length, 'ids are unique');
assert.equal(new Set(library.map(h => norm(h.name))).size, library.length, 'names are unique');
const ids = categories.filter(c => c.id !== 'custom').map(c => c.id);
for (const id of ids) assert.equal(library.filter(h => h.cat === id).length, 40, `${id} has 40 habits`);
for (const habit of library) {
  assert.ok(ids.includes(habit.cat), `${habit.name}: known category`);
  assert.ok(habit.emoji && habit.name && habit.min, `${habit.id}: emoji, name and minimum version`);
  assert.ok(habit.name.length <= 40 && habit.min.length <= 40, `${habit.name}: fits a phone row`);
}
// The library UI is organized by category: previews under All, full lists per category, grouped search.
const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const listSource = app.slice(app.indexOf('function libList()'), app.indexOf('\n}\n', app.indexOf('function libList()')) + 3);
const ui = { HABIT_LIBRARY: library, CATEGORIES: categories, S: { habits: [{ id: library[0].id }] }, libQuery: '', libCat: 'all', esc: String, catOf: id => categories.find(c => c.id === id) };
vm.createContext(ui);
vm.runInContext(listSource, ui);
let html = ui.libList();
assert.equal((html.match(/class="lib-group"/g) || []).length, 10, 'All shows one section per category');
assert.equal((html.match(/class="lrow(?: added)?"/g) || []).length, 40, 'All previews 4 habits per category');
assert.equal((html.match(/data-act="cat"/g) || []).length, 10, 'each preview links to its full category');
assert.match(html, /class="lrow added"/, 'added habits are marked');
vm.runInContext("libCat = 'sleep';", ui);
assert.equal((ui.libList().match(/class="lrow(?: added)?"/g) || []).length, 40, 'a category shows all 40 habits');
vm.runInContext("libCat = 'all'; libQuery = 'walk';", ui);
html = ui.libList();
assert.ok((html.match(/class="lib-group"/g) || []).length >= 2 && !/data-act="cat"/.test(html), 'search results stay grouped and complete');
console.log('Habit library passed: 400 unique habits, 40 per category, complete fields, organized by category.');
