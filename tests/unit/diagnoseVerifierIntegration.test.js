jest.mock('../../utils/logger', () => ({
  child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { observe } = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');

// End-to-end validation that the symbolic verifier is actually WIRED into the
// live diagnose() path (not just unit-correct): replays the exact cases that
// made the tutor false-flag correct work, through the real pipeline. No LLM in
// the loop (no llmVerificationPromise) — these must resolve deterministically.
const ans = (text) => observe(text, { recentUserMessages: [], recentAssistantMessages: [] });

describe('diagnose — symbolic verifier integration (the live regressions)', () => {
  it('grades a correct multi-term integral answer as CORRECT (was isCorrect=null)', async () => {
    const d = await diagnose(ans('x^4 + x^2 + C'), {
      recentAssistantMessages: [{ content: 'Try this one: $\\int (4x^3 + 2x)\\,dx$' }],
      recentUserMessages: [],
      pinnedProblemTex: '\\int (4x^3 + 2x)\\,dx',
    });
    expect(d.isCorrect).toBe(true);
    expect(d.verificationSource).toMatch(/symbolic/);
  });

  it('grades a WRONG integral answer (dropped term) as not-correct', async () => {
    const d = await diagnose(ans('x^4 + C'), {
      recentAssistantMessages: [{ content: '$\\int (4x^3 + 2x)\\,dx$' }],
      recentUserMessages: [],
      pinnedProblemTex: '\\int (4x^3 + 2x)\\,dx',
    });
    expect(d.isCorrect).not.toBe(true);
  });

  it('confirms a bare answer to the tutor\'s posed arithmetic — the 50x3 fumble', async () => {
    const d = await diagnose(ans('150'), {
      recentAssistantMessages: [{ content: "Then 50 × 3 = ? What do you get when you multiply 50 × 3?" }],
      recentUserMessages: [],
    });
    // The student's "150" IS graded correct — the point. It's the existing
    // solver's re-parse that catches this one (source 'solver'); the symbolic
    // arithmetic tier is the backup for phrasings the re-parse misses. Either
    // way the verdict is right, so the tutor is told the truth.
    expect(d.isCorrect).toBe(true);
    expect(['solver', 'symbolic:arithmetic']).toContain(d.verificationSource);
  });

  it('flags a wrong bare answer to posed arithmetic', async () => {
    const d = await diagnose(ans('140'), {
      recentAssistantMessages: [{ content: 'What is 50 × 3?' }],
      recentUserMessages: [],
    });
    expect(d.isCorrect).toBe(false);
  });

  it('grades a correct equation solution against the pinned problem', async () => {
    const d = await diagnose(ans('x = 2 or x = 3'), {
      recentAssistantMessages: [{ content: 'Solve it: $x^2 - 5x + 6 = 0$' }],
      recentUserMessages: [],
      pinnedProblemTex: 'x^2 - 5x + 6 = 0',
    });
    expect(d.isCorrect).toBe(true);
  });

  it('does NOT false-flag an intermediate step on an equation problem', async () => {
    // Pinned problem 2x+4=20; tutor asked for 2x; student's "16" is a correct
    // step, not a claimed solution — must never be graded wrong vs the equation.
    const d = await diagnose(ans('16'), {
      recentAssistantMessages: [{ content: 'Good — so what is 2x?' }],
      recentUserMessages: [],
      pinnedProblemTex: '2x + 4 = 20',
    });
    expect(d.isCorrect).not.toBe(false);
  });

  it('does NOT fire on a bare number when the tutor posed no arithmetic (no over-reach)', async () => {
    const d = await diagnose(ans('150'), {
      recentAssistantMessages: [{ content: 'Nice work — ready for the next problem?' }],
      recentUserMessages: [],
    });
    expect(d.verificationSource).not.toBe('symbolic:arithmetic');
  });
});
