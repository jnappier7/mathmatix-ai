/**
 * THE PRE-ASSESSMENT MODAL MUST NEVER DEAD-END.
 *
 * beginTeachingUnlessBaselinePending() parks the course greeting behind
 * `_baselinePending`, and only onBaselineComplete() releases it. So every way out
 * of the quick-check modal has to call that — submitted, skipped, dismissed, or
 * "not available for this course yet" (a 409 from a course whose item bank is too
 * thin to build a blueprint).
 *
 * Before this, only the post-submit "Start the course" button did. A student who
 * closed the modal any other way was left inside a course that had never said a
 * word — the silence the free-chat opener then filled.
 *
 * Source-level, deliberately: the module is a DOM IIFE with no seam to call into,
 * and what matters here is that no exit is wired to the bare `close`.
 */

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(
  path.join(__dirname, '../../public/js/coursePreAssessment.js'), 'utf8');

describe('every exit hands control back to the course', () => {
  test('closeAndResume exists and calls onBaselineComplete', () => {
    expect(src).toMatch(/function closeAndResume\(\)/);
    const body = src.slice(src.indexOf('function closeAndResume()'),
      src.indexOf('function closeAndResume()') + 400);
    expect(body).toMatch(/onBaselineComplete\(\)/);
  });

  test('"Continue to the course" (the unavailable branch) resumes', () => {
    expect(src).toMatch(/#cpa-close'\)\.addEventListener\('click', closeAndResume\)/);
  });

  test('"Skip for now" resumes', () => {
    expect(src).toMatch(/skip\.addEventListener\('click', closeAndResume\)/);
  });

  test('clicking the backdrop resumes', () => {
    expect(src).toMatch(/if \(e\.target === wrap\) closeAndResume\(\);/);
  });

  test('no exit is still wired to the bare close()', () => {
    expect(src).not.toMatch(/addEventListener\('click', close\)/);
    expect(src).not.toMatch(/=== wrap\) close\(\)/);
  });
});
