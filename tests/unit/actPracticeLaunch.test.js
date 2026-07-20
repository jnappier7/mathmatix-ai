// tests/unit/actPracticeLaunch.test.js
// Guards that the ACT course tutor is instructed to launch the REAL practice-ACT
// runner (via the <LAUNCH_PRACTICE_ACT> control tag) instead of improvising its
// own quiz — and that this guidance is scoped to the ACT course only.

const { buildCourseSystemPrompt } = require('../../utils/coursePrompt');

const prompt = (courseId) => buildCourseSystemPrompt({
  userProfile: { firstName: 'Kandy' },
  tutorProfile: { name: 'Mr. Nappier' },
  pathway: { track: courseId, modules: [] },
  scaffoldData: { scaffold: [] },
  currentModule: { title: 'Number & Quantity' },
  courseSession: { courseId, courseName: courseId, modules: [] },
});

describe('practice-ACT launch guidance', () => {
  test('the ACT course prompt tells the tutor to launch the real test, not improvise', () => {
    const p = prompt('act-prep');
    expect(p).toContain('<LAUNCH_PRACTICE_ACT>');
    expect(p).toMatch(/NEVER IMPROVISE|DO NOT write your own quiz/i);
    // must require an explicit confirmation before firing the tag
    expect(p).toMatch(/confirm/i);
  });

  test('non-ACT courses do NOT get the launch guidance', () => {
    for (const id of ['algebra-1', 'ap-calculus-ab', 'geometry']) {
      expect(prompt(id)).not.toContain('<LAUNCH_PRACTICE_ACT>');
    }
  });
});
