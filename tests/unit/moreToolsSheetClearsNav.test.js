// tests/unit/moreToolsSheetClearsNav.test.js
//
// QA handoff 2026-10-14 §4, witnessed at 375×812 in a browser harness: the
// More Tools bottom sheet (z 2100) sat under the bottom nav (z 9000) with no
// room reserved — Log Out spanned 708–796 under a nav starting at 753. After:
// every tile clears the nav (Log Out 649–737) and passes elementFromPoint.

const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');

test('the nav reserves its own height inside the More Tools sheet', () => {
  const src = read('public/js/bottom-nav.js');
  expect(src).toMatch(/body\.mbn-space #more-tools-menu\.active\{/);
  expect(src).toMatch(/padding-bottom:calc\(var\(--mm-nav-h,64px\) \+ 16px\) !important;/);
});

test('bottom-nav.js cache-buster moved', () => {
  expect(read('public/chat.html')).toMatch(/\/js\/bottom-nav\.js\?v=4"/);
});
