jest.mock('../../utils/logger', () => ({
  child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { observe } = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');

// End-to-end: a student who SHOWS their multi-step work is graded on the whole
// chain (not just the final line), and a valid chain flags demonstratedReasoning
// so decide affirms + advances instead of asking "how did you do it?".
const ans = (text) => observe(text, { recentUserMessages: [], recentAssistantMessages: [] });

describe('diagnose — multi-step derivation, live path', () => {
  it('grades a correct shown-work solution as CORRECT with demonstrated reasoning', async () => {
    const d = await diagnose(ans('3x - 5 = 16\n3x = 21\nx = 7'), {
      recentAssistantMessages: [{ content: 'Solve: 3x - 5 = 16' }],
      recentUserMessages: [],
      pinnedProblemTex: '3x - 5 = 16',
    });
    expect(d.isCorrect).toBe(true);
    expect(d.verificationSource).toBe('derivation');
    expect(d.demonstratedReasoning).toBe(true);
  });

  it('pinpoints the first broken step in a wrong shown-work solution', async () => {
    const d = await diagnose(ans('3x - 5 = 16\n3x = 11\nx = 11/3'), {
      recentAssistantMessages: [{ content: 'Solve: 3x - 5 = 16' }],
      recentUserMessages: [],
      pinnedProblemTex: '3x - 5 = 16',
    });
    expect(d.isCorrect).toBe(false);
    expect(d.derivation && d.derivation.firstBadStep).toBe('3x = 11');
  });
});
