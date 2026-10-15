// tests/unit/chatAccessibleNames.test.js
//
// QA handoff 2026-10-14 §3.7. An accessible-name audit of the real chat page
// (browser harness, 29 visible controls) found: the composer had no name, the
// Tutor / My Progress tabs had role=tab but aria-selected=null until clicked
// and no tablist, the birthday prompt's date input had no name, and every ACT
// review chip carried the same title. After: 0 unnamed controls, 7/7 distinct
// chip names. jest can't lay out the page, so these pin the seams.

const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');

test('the composer has a name', () => {
  expect(read('public/chat.html')).toMatch(/<div id="user-input"[^>]*aria-label="Message your tutor"/);
});

test('Tutor / My Progress are a tablist with selection state from the first render', () => {
  const src = read('public/js/modules/playerStatsCard.js');
  const build = src.slice(src.indexOf("segBoard.type = 'button'"), src.indexOf('host._segBoard = segBoard'));
  expect(build).toMatch(/segBoard\.setAttribute\('aria-selected', 'true'\)/);
  expect(build).toMatch(/segMe\.setAttribute\('aria-selected', 'false'\)/);
  expect(build).toMatch(/host\.setAttribute\('role', 'tablist'\)/);
});

test('each review chip names its question, skill and state', () => {
  const src = read('public/js/lessonTracker.js');
  expect(src).toMatch(/const label = `Question \$\{it\.short \|\| it\.position\}/);
  expect(src).toMatch(/aria-label="\$\{esc\(label\)\}"/);
  expect(src).toMatch(/g\.items\.map\(\(it\) => chip\(it, g\.label\)\)/);
});

test('the birthday prompt input has a name', () => {
  expect(read('public/js/script.js')).toMatch(/class="dob-prompt-input" aria-label="Your birthday"/);
});
