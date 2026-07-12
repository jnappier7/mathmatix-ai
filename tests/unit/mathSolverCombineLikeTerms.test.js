/**
 * MATH SOLVER — Combine-like-terms detection & grading
 *
 * Regression coverage for the bug where a "simplify 7y - 10y" style prompt
 * matched NO deterministic pattern (hasMath:false), so grading fell through to
 * the LLM verifier — which rejected the student's CORRECT answer "-3y" as "a
 * different problem," forced a needless re-derivation, and then mis-awarded a
 * "self-corrected" bonus for a correction that never happened.
 */

const {
  detectMathProblem,
  processMathMessage,
  parseCleanProblem,
  verifyAnswer,
  solveCombineLikeTerms,
  hasLikeTermsToCombine,
} = require('../../utils/mathSolver');

describe('detectMathProblem — combine like terms', () => {
  test('bare "7y - 10y" is detected as combine_like_terms', () => {
    const result = detectMathProblem('7y - 10y');
    expect(result).not.toBeNull();
    expect(result.type).toBe('combine_like_terms');
  });

  test('"simplify 5x+3x-2x" is detected', () => {
    const result = detectMathProblem('simplify 5x+3x-2x');
    expect(result).not.toBeNull();
    expect(result.type).toBe('combine_like_terms');
  });

  test('unicode minus "7y−10y" is detected', () => {
    const result = detectMathProblem('Simplify: 7y−10y');
    expect(result).not.toBeNull();
    expect(result.type).toBe('combine_like_terms');
  });

  // ── Guardrails: must NOT hijack other problem types ──

  test('binomial product stays with expand_polynomial', () => {
    expect(detectMathProblem('simplify (x+1)(x+6)').type).toBe('expand_polynomial');
  });

  test('an equation is never a combine_like_terms problem', () => {
    expect(detectMathProblem('solve 4x + 3 = 27').type).not.toBe('combine_like_terms');
  });

  test('a single term (nothing to combine) is not detected', () => {
    expect(detectMathProblem('5x')).toBeNull();
  });

  test('an already-simplified expression (no like terms) is not detected', () => {
    // 2x + 3y has no pair of like terms → nothing to combine → fall through
    expect(detectMathProblem('2x + 3y')).toBeNull();
  });

  test('plain prose mentioning "simplify" is not detected', () => {
    expect(detectMathProblem('Can you simplify this for me?')).toBeNull();
  });
});

describe('solveCombineLikeTerms', () => {
  test('7y - 10y → -3y', () => {
    expect(processMathMessage('7y - 10y').solution.answer).toBe('-3y');
  });

  test('5x + 3x - 2x → 6x', () => {
    expect(processMathMessage('simplify 5x+3x-2x').solution.answer).toBe('6x');
  });

  test('3y - 9y → -6y', () => {
    expect(processMathMessage('3y - 9y').solution.answer).toBe('-6y');
  });

  test('combines higher-degree like terms: x^2 + 3x^2 - x → 4x^2 - x', () => {
    expect(processMathMessage('simplify x^2 + 3x^2 - x').solution.answer).toBe('4x^2 - x');
  });

  test('preserves distinct variables: 2x + 3y + x → 3x + 3y', () => {
    expect(processMathMessage('2x + 3y + x').solution.answer).toBe('3x + 3y');
  });

  test('fully-cancelling terms → 0', () => {
    // solveCombineLikeTerms formats an empty canonical set as "0"
    const result = solveCombineLikeTerms({ expression: '4y - 4y', poly: { terms: [
      { coeff: 4, variable: 'y', exp: 1 },
      { coeff: -4, variable: 'y', exp: 1 },
    ] } });
    expect(result.answer).toBe('0');
  });
});

describe('hasLikeTermsToCombine', () => {
  test('true when two terms share variable + exponent', () => {
    expect(hasLikeTermsToCombine([
      { coeff: 7, variable: 'y', exp: 1 },
      { coeff: -10, variable: 'y', exp: 1 },
    ])).toBe(true);
  });

  test('false when every term is distinct', () => {
    expect(hasLikeTermsToCombine([
      { coeff: 2, variable: 'x', exp: 1 },
      { coeff: 3, variable: 'y', exp: 1 },
    ])).toBe(false);
  });
});

describe('end-to-end — the transcript scenario grades correctly', () => {
  // Tutor poses "Simplify: 7y - 10y" inside conversational prose; persist stores
  // the extracted correctAnswer; the student's correct "-3y" must grade CORRECT.
  test('correct answer "-3y" to "7y - 10y" is graded correct', () => {
    const posed = "Let's kick it up a notch with a negative in the mix. Simplify: 7y−10y.";
    const parsed = parseCleanProblem(posed);
    expect(parsed.hasMath).toBe(true);
    expect(parsed.solution.success).toBe(true);
    expect(verifyAnswer('-3y', parsed.solution.answer).isCorrect).toBe(true);
  });

  test('equivalent forms of the answer also grade correct', () => {
    const answer = processMathMessage('7y - 10y').solution.answer; // "-3y"
    for (const form of ['-3y', '−3y', '- 3y', '-3 y']) {
      expect(verifyAnswer(form, answer).isCorrect).toBe(true);
    }
  });

  test('a genuinely wrong answer to "7y - 10y" is still marked wrong', () => {
    const answer = processMathMessage('7y - 10y').solution.answer;
    expect(verifyAnswer('3y', answer).isCorrect).toBe(false);
    expect(verifyAnswer('-3', answer).isCorrect).toBe(false);
  });
});
