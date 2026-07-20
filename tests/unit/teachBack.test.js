/**
 * Teach-back scoring. The LLM is injected, so these run without a live model and
 * pin the behaviour that matters: what earns the top rung, and — more important —
 * what happens when the scorer cannot reach a verdict.
 */

const {
  PASS,
  MIN_WORDS,
  confusedStudentOpener,
  parseVerdict,
  scoreTeachBack
} = require('../../utils/teachBack');

const skill = {
  skillId: 'ALG1.EQV.9',
  studentLabel: 'Adding and subtracting polynomials',
  teachingGuidance: { commonMistakes: ['adds exponents when combining like terms', 'forgets to distribute the minus sign'] }
};

const longExplanation =
  'When you add polynomials you combine like terms, which means terms with the same variable ' +
  'raised to the same power. The exponents stay the same because you are counting how many of ' +
  'that term you have, like three x-squareds plus two x-squareds is five x-squareds — the ' +
  'exponent does not change, only the coefficient does.';

const llmReturning = (obj) => async () => obj;

describe('confusedStudentOpener', () => {
  test('poses a real misconception from the catalog when one exists', () => {
    const opener = confusedStudentOpener(skill);
    expect(skill.teachingGuidance.commonMistakes).toContain(opener.misconception);
    expect(opener.prompt).toContain(opener.misconception);
  });

  test('is stable for a given skill rather than random', () => {
    expect(confusedStudentOpener(skill).misconception).toBe(confusedStudentOpener(skill).misconception);
  });

  test('falls back to a generic why-focused prompt with no catalog mistakes', () => {
    const opener = confusedStudentOpener({ skillId: 'X', studentLabel: 'something' });
    expect(opener.misconception).toBeNull();
    expect(opener.prompt).toMatch(/why/i);
  });
});

describe('parseVerdict', () => {
  test('reads a clean JSON object', () => {
    const v = parseVerdict({ correct: 1, complete: 1, why: 1, addresses: 0, overall: 3, feedback: 'good' });
    expect(v.overall).toBe(3);
  });

  test('extracts JSON embedded in prose', () => {
    const v = parseVerdict('Here is my grade: {"correct":1,"complete":1,"why":1,"addresses":1,"overall":4,"feedback":"x"} done');
    expect(v.overall).toBe(4);
  });

  test('sums the dimensions when overall is missing', () => {
    const v = parseVerdict({ correct: 1, complete: 1, why: 1, addresses: 0 });
    expect(v.overall).toBe(3);
  });

  test('clamps an out-of-range overall', () => {
    expect(parseVerdict({ correct: 1, complete: 1, why: 1, addresses: 1, overall: 9 }).overall).toBe(4);
  });

  test('returns null for unusable output', () => {
    expect(parseVerdict('no json here')).toBeNull();
    expect(parseVerdict({ feedback: 'nothing numeric' })).toBeNull();
  });
});

describe('scoreTeachBack — earning the rung', () => {
  test('a strong, correct explanation passes', async () => {
    const r = await scoreTeachBack(
      { skill, explanation: longExplanation, misconception: skill.teachingGuidance.commonMistakes[0] },
      { llm: llmReturning({ correct: 1, complete: 1, why: 1, addresses: 1, overall: 4, feedback: 'clear' }) }
    );
    expect(r.scored).toBe(true);
    expect(r.passed).toBe(true);
    expect(r.score).toBe(4);
  });

  test('a score below the bar does not pass', async () => {
    const r = await scoreTeachBack(
      { skill, explanation: longExplanation },
      { llm: llmReturning({ correct: 1, complete: 0, why: 0, addresses: 1, overall: 2, feedback: 'thin' }) }
    );
    expect(r.passed).toBe(false);
  });

  test('a mathematically wrong explanation cannot pass even if the sum reaches the bar', async () => {
    // Teaching something wrong is worse than not teaching it.
    const r = await scoreTeachBack(
      { skill, explanation: longExplanation },
      { llm: llmReturning({ correct: 0, complete: 1, why: 1, addresses: 1, overall: 3, feedback: 'confident but wrong' }) }
    );
    expect(r.scored).toBe(true);
    expect(r.passed).toBe(false);
  });
});

describe('scoreTeachBack — fail-safe', () => {
  test('an LLM outage does not resolve the rung either way', async () => {
    const r = await scoreTeachBack(
      { skill, explanation: longExplanation },
      { llm: async () => { throw new Error('503'); } }
    );
    expect(r.scored).toBe(false);
    expect(r.passed).toBeUndefined();
    expect(r.reason).toMatch(/unavailable/);
  });

  test('an unusable verdict is treated as not-scored, not as a pass or a fail', async () => {
    const r = await scoreTeachBack(
      { skill, explanation: longExplanation },
      { llm: llmReturning('the model rambled and returned no json') }
    );
    expect(r.scored).toBe(false);
  });

  test('a near-empty explanation is rejected without spending an LLM call', async () => {
    const llm = jest.fn();
    const r = await scoreTeachBack({ skill, explanation: 'idk it just works' }, { llm });
    expect(r.scored).toBe(true);
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(llm).not.toHaveBeenCalled();
  });

  test('the word-count guard is set low enough not to punish a terse answer', () => {
    expect(MIN_WORDS).toBeLessThanOrEqual(15);
    expect(PASS).toBe(3);
  });
});
