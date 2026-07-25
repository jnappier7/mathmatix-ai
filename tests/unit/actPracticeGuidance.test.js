/**
 * The ACT-prep "use the real practice test" directive is present for act-prep
 * and absent otherwise — and is exported so routes/chat.js can guarantee it on
 * EVERY act-prep turn.
 *
 * Root cause it guards: the directive used to live only inside
 * buildCourseSystemPrompt, but production traffic runs through /api/chat, which
 * for course turns often builds the prompt via generateSystemPrompt (fallback)
 * or the mastery path — bypassing that builder. With the directive missing the
 * tutor denied the built-in test existed ("your teacher or the ACT platform
 * would set that up") and never emitted <LAUNCH_PRACTICE_ACT>. chat.js now
 * appends this at the single point all paths converge, guarded against dupes.
 */

const { buildActPracticeGuidance } = require('../../utils/coursePrompt');

describe('buildActPracticeGuidance', () => {
  test('returns the launch directive for an act-prep course', () => {
    const g = buildActPracticeGuidance({ courseId: 'act-prep' });
    expect(g).toMatch(/LAUNCH_PRACTICE_ACT/);
    expect(g).toMatch(/full-length, auto-scored practice ACT/i);
    // Explicitly forbids the exact deflection seen in the production transcript.
    expect(g).toMatch(/NEVER say the test must be set up by a teacher/i);
  });

  test('returns empty string for any other course', () => {
    expect(buildActPracticeGuidance({ courseId: 'algebra-1' })).toBe('');
    expect(buildActPracticeGuidance({ courseId: undefined })).toBe('');
    expect(buildActPracticeGuidance(null)).toBe('');
  });

  test('the chat finalizer guard appends exactly once', () => {
    // Mirrors the routes/chat.js guard: only append when act-prep AND not
    // already present (buildCourseSystemPrompt may have added it already).
    const append = (prompt, courseId) =>
      courseId === 'act-prep' && prompt && !/LAUNCH_PRACTICE_ACT/.test(prompt)
        ? prompt + buildActPracticeGuidance({ courseId })
        : prompt;

    const bare = 'You are Mr. Nappier, an AI math instructor.';
    const once = append(bare, 'act-prep');
    expect((once.match(/LAUNCH_PRACTICE_ACT/g) || []).length).toBe(1);
    // Idempotent: a prompt that already has it (from buildCourseSystemPrompt)
    // is left untouched.
    const twice = append(once, 'act-prep');
    expect((twice.match(/LAUNCH_PRACTICE_ACT/g) || []).length).toBe(1);
  });
});
