/**
 * The ACT bootcamp greeting counted the queue POINTER as the number of
 * questions reviewed (owner transcript review, 2026-09-21).
 *
 * coursePrompt's review-phase greeting told the model
 *   `(${done} of ${total} done so far)`
 * with `done = Math.min(bc.index || 0, total)`. But bc.index is a cursor, and
 * POST /bootcamp/jump moves it without reviewing anything, so a student who
 * jumped to slot 17 of 22 having actually finished one was greeted as though
 * they had finished seventeen. Every other reader of this state counts by
 * status — actReview.reviewGroups, lessonTracker — so this was the lone
 * disagreement, and it fed the tutor a false picture of the session.
 */
const { buildCourseGreetingInstruction } = require('../../utils/coursePrompt');

const miss = (status) => ({ position: 1, prompt: 'q', status });

function greeting(queue, index) {
  return buildCourseGreetingInstruction({
    userProfile: { firstName: 'Jason' },
    courseSession: {
      courseId: 'act-prep',
      bootcamp: { phase: 'review', round: 2, index, queue },
    },
    pathway: { track: 'ACT Prep' },
    scaffoldData: null,
    currentModule: null,
  });
}

describe('the greeting counts reviewed items, not the cursor', () => {
  test('a jump to slot 3 with one item reviewed reports 1 of 4, not 3 of 4', () => {
    const q = [miss('reviewed'), miss('pending'), miss('pending'), miss('pending')];
    const text = greeting(q, 3);
    expect(text).toContain('(1 of 4 done so far)');
    expect(text).not.toContain('3 of 4');
  });

  test('a fresh review reports 0, matching the header and the queue', () => {
    const q = [miss('pending'), miss('pending')];
    expect(greeting(q, 0)).toContain('(0 of 2 done so far)');
  });

  test('every item reviewed reports the full count', () => {
    const q = [miss('reviewed'), miss('reviewed')];
    expect(greeting(q, 2)).toContain('(2 of 2 done so far)');
  });

  test('a cursor parked past the end cannot overstate the total', () => {
    const q = [miss('reviewed'), miss('pending')];
    const text = greeting(q, 99);
    expect(text).toContain('(1 of 2 done so far)');
  });

  test('a missing queue degrades to 0 of 0 rather than throwing', () => {
    expect(() => greeting(undefined, 0)).not.toThrow();
  });
});
