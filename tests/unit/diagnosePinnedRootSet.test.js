jest.mock('../../utils/logger', () => ({
  child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { observe } = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');

// Reproduces the live board-regression: student answers "x=-7/3 or 1" correctly
// to 3x^2+4x-7=0, but the newest assistant message is an intermediate (the
// factored form), so the recent-message scan resolves a bogus problem and the
// answer is graded wrong. The pinned board problem is the canonical truth.
describe('diagnose — canonical-problem override for multi-root final answers', () => {
  const PIN = '3x^2 + 4x - 7 = 0';
  const rootSetAnswer = () => observe('x=-7/3 or 1', { recentUserMessages: [], recentAssistantMessages: [] });

  it('grades correct when the newest AI message is the factored form', async () => {
    const d = await diagnose(rootSetAnswer(), {
      recentAssistantMessages: [{ content: 'You got it! (3x+7)(x-1)=0. Now what do we do next?' }],
      recentUserMessages: [],
      pinnedProblemTex: PIN,
    });
    expect(d.isCorrect).toBe(true);
    expect(d.type).toBe('correct');
  });

  it('grades correct even when the newest AI message carries no problem (board digression)', async () => {
    const d = await diagnose(rootSetAnswer(), {
      recentAssistantMessages: [{ content: "I'll set that up for you now!" }],
      recentUserMessages: [],
      pinnedProblemTex: PIN,
    });
    expect(d.isCorrect).toBe(true);
  });

  it('does NOT hijack a single-value sub-step answer (no over-reach)', async () => {
    const sub = observe('-21', { recentUserMessages: [], recentAssistantMessages: [] });
    const d = await diagnose(sub, {
      recentAssistantMessages: [{ content: 'what is 3 times -7?' }],
      recentUserMessages: [],
      pinnedProblemTex: PIN,
    });
    // -21 is not in the root set {1, -7/3}; must not be force-graded against it.
    expect(d.isCorrect).not.toBe(true);
  });

  it('still grades correct with no pin when the original problem is in recent messages', async () => {
    const d = await diagnose(rootSetAnswer(), {
      recentAssistantMessages: [{ content: 'OK, we have 3x^2 + 4x - 7 = 0. Factor or quadratic formula?' }],
      recentUserMessages: [],
    });
    expect(d.isCorrect).toBe(true);
  });
});
