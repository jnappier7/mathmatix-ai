// Every chart label in js/analyticsCharts.js goes through T('chart.…'), and
// every such key exists in the translation table in all nine languages — a
// typo'd key would silently fall back to English on a parent's Spanish page.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../../public/js/analyticsCharts.js'), 'utf8');
global.window = {};
require('../../public/js/i18n-translations.js');
const TABLE = global.window.I18N_TRANSLATIONS;
const LANGS = ['English', 'Spanish', 'Russian', 'Chinese', 'Vietnamese', 'Arabic', 'Somali', 'French', 'German'];

const used = [...new Set([...src.matchAll(/T\('(chart\.[\w.]+)'/g)].map((m) => m[1]))];

test('the chart code uses translation keys', () => {
  expect(used.length).toBeGreaterThan(25);
});

test.each(used)('%s exists in all nine languages', (key) => {
  expect(TABLE[key]).toBeDefined();
  for (const lang of LANGS) expect(typeof TABLE[key][lang]).toBe('string');
});

test('no bare English label is left in a chart legend or dataset', () => {
  const bare = src.match(/\blabel: '[A-Z][^']*'/g) || [];
  expect(bare).toEqual([]);
});
