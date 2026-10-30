/**
 * The chat shell must fit between the header and the fixed footer
 * (QA handoff 2026-10-14, §3.1).
 *
 * The footer is position:fixed, so it takes no space in body's flex column and
 * #app-layout-wrapper got viewport − header, running 48px under it. .cr-stage's
 * min-height (100vh − 60px) could never shrink, and style.css's generic
 * --section-gap added another 48px: 985px of content in an 863px overflow:hidden
 * box. The quick actions sat under the footer (unclickable), a scrollIntoView in
 * the send path slid the whole app up behind the header, and in ACT review the
 * bootcamp panel pushed the composer off the screen.
 *
 * jest can't lay out a page here, so this pins the rules; the geometry was
 * measured in a browser harness at 1363×936, 1280×720, 1024×768 and 375×812.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const css = read('public', 'css', 'chat-redesign.css');
const html = read('public', 'chat.html');
const tracker = read('public', 'js', 'lessonTracker.js');

// Body of the first `@media (<query>) { … }` block whose query matches exactly.
function mediaBlock(query) {
  const start = css.indexOf(`@media ${query} {`);
  if (start < 0) return null;
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  return null;
}

describe('desktop chat shell fits between header and footer', () => {
  const block = mediaBlock('(min-width: 769px)');

  test('the layout block exists', () => {
    expect(block).not.toBeNull();
  });

  test('main stops at the fixed footer and drops the generic section gap', () => {
    const rule = block.match(/body\.cr-mode #app-layout-wrapper \{[^}]*\}/)[0];
    expect(rule).toMatch(/margin-bottom:\s*var\(--footer-height/);
    expect(rule).toMatch(/gap:\s*0/);
    expect(rule).toMatch(/min-height:\s*0/);
  });

  test('the stage may shrink (its 100vh min-height is what overflowed)', () => {
    expect(block).toMatch(/body\.cr-mode \.cr-stage \{[^}]*min-height:\s*0/);
    expect(block).toMatch(/body\.cr-mode \.cr-stage > \* \{[^}]*min-height:\s*0/);
  });

  test('the review panel is capped and scrolls itself, so the composer shows', () => {
    const rule = block.match(/body\.cr-mode #lesson-tracker-wrapper \{[^}]*\}/)[0];
    expect(rule).toMatch(/max-height:\s*\d+%/);
    expect(rule).toMatch(/overflow-y:\s*auto/);
  });

  test('on full desktop the shell is not a scroll container at all', () => {
    const wide = mediaBlock('(min-width: 1201px)');
    expect(wide).toMatch(/#app-layout-wrapper,\s*body\.cr-mode #chat-container \{\s*overflow:\s*clip/);
  });

  test('chat.html busts the cache for the new rules', () => {
    expect(html).not.toMatch(/chat-redesign\.css\?v=20260904a/);
  });
});

describe('ACT review hands the screen to the conversation', () => {
  test('"Work it with" and jumping to a question both fold the panel', () => {
    const cont = tracker.slice(tracker.indexOf("getElementById('lt-bc-continue')"));
    expect(cont.slice(0, 300)).toMatch(/this\._collapseForWork\(\)/);
    const jumpStart = tracker.search(/\n {4}(async )?_jumpTo\(/);
    expect(jumpStart).toBeGreaterThan(-1);
    const jump = tracker.slice(jumpStart, tracker.indexOf('\n    }\n', jumpStart));
    expect(jump).toMatch(/this\._collapseForWork\(\)/);
  });

  test("the auto-fold doesn't overwrite the student's stored preference", () => {
    const fn = tracker.slice(tracker.indexOf('_collapseForWork() {'),
      tracker.indexOf('_wireBootcamp() {'));
    expect(fn).not.toMatch(/localStorage/);
  });

  test('Exit Lesson has an accessible name', () => {
    expect(html).toMatch(/id="course-exit-lesson-btn"[^>]*aria-label="[^"]+"/);
  });
});
