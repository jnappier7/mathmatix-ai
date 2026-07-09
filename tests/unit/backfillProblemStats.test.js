/**
 * backfillProblemStats.planConversationUpdate UNIT TESTS
 *
 * The reconcile computes the corrected counters from message tags. These lock
 * that phantom counters (stored higher than the actual tagged turns) are
 * brought down, and that already-correct conversations are left untouched.
 */

const { planConversationUpdate } = require('../../scripts/backfillProblemStats');

describe('planConversationUpdate', () => {
  test('flags a phantom-inflated conversation and corrects it down', () => {
    // Stored says 2 attempts / 1 correct, but there are NO graded message tags
    // (classic keyword-fabricated phantom).
    const conv = {
      problemsAttempted: 2,
      problemsCorrect: 1,
      messages: [
        { role: 'assistant', content: "Let's take a closer look." },
        { role: 'user', content: 'ok' },
      ],
    };
    const plan = planConversationUpdate(conv);
    expect(plan.changed).toBe(true);
    expect(plan.tagged).toEqual({ attempted: 0, correct: 0 });
  });

  test('leaves an already-accurate conversation unchanged', () => {
    const conv = {
      problemsAttempted: 2,
      problemsCorrect: 1,
      messages: [
        { role: 'assistant', content: 'Right!', problemResult: 'correct' },
        { role: 'assistant', content: 'Not quite.', problemResult: 'incorrect' },
      ],
    };
    const plan = planConversationUpdate(conv);
    expect(plan.changed).toBe(false);
    expect(plan.tagged).toEqual({ attempted: 2, correct: 1 });
  });

  test('corrects a partially-inflated conversation to the tag count', () => {
    const conv = {
      problemsAttempted: 2, // inflated
      problemsCorrect: 0,
      messages: [
        { role: 'assistant', content: 'Not quite.', problemResult: 'incorrect' }, // only 1 real tag
      ],
    };
    const plan = planConversationUpdate(conv);
    expect(plan.changed).toBe(true);
    expect(plan.tagged).toEqual({ attempted: 1, correct: 0 });
  });

  test('treats missing counters as zero', () => {
    const plan = planConversationUpdate({ messages: [] });
    expect(plan.stored).toEqual({ attempted: 0, correct: 0 });
    expect(plan.changed).toBe(false);
  });
});
