/**
 * Teacher dashboard: classes are easy to find, join codes included (owner, 2026-10-22).
 *  - Classes is a primary tab (it had been folded under More);
 *  - Today opens with a "My classes" strip: each class, its join code and link copyable,
 *    Host a game / Assign / Manage;
 *  - the dashboard announces the class list so the strip can draw it (mm:classes-loaded);
 *  - the Live Drill host preselects the class it was opened for (?class=…).
 * Source-level pins; teacherToday.test.js covers the Today logic itself.
 */
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');

test('Classes is a primary tab, ahead of Test Prep', () => {
  expect(read('public/js/teacher-home.js')).toMatch(/PRIMARY = \['today', 'students', 'classes', 'testprep'/);
});

test('Today mounts a My classes strip with copyable join codes and links', () => {
  const src = read('public/js/teacher-home.js');
  expect(src).toMatch(/id="td-classes"/);
  expect(src).toMatch(/data-td-copy="' \+ esc\(code\)/); // the code copies, escaped
  expect(src).toMatch(/'\/join\/' \+ encodeURIComponent\(code\)/); // the link is the real join route
  expect(src).toMatch(/href="\/live-drill\?class=' \+ encodeURIComponent\(c\._id\)/);
  expect(src).toMatch(/esc\(c\.className\)/); // class names are teacher text
  expect(src).toMatch(/addEventListener\('mm:classes-loaded', renderClasses\)/);
  expect(read('public/js/teacher-dashboard.js')).toMatch(/new CustomEvent\('mm:classes-loaded'/);
  expect(read('public/css/teacher-home.css')).toMatch(/\.td-code-value \{/);
});

test('the Live Drill host preselects the class from ?class=', () => {
  expect(read('public/js/live-drill/host.js')).toMatch(/URLSearchParams\(location\.search\)\.get\('class'\)/);
});

test('the strip is bundled with the dashboard (edits need npm run build:bundles)', () => {
  const m = JSON.parse(read('public/dist/page-bundles.manifest.json'))['teacher-dashboard.html'];
  expect(m.js.flatMap((b) => b.files).some((f) => f.startsWith('/js/teacher-home.js'))).toBe(true);
  expect(m.css.flatMap((b) => b.files)).toContain('/css/teacher-home.css');
});
