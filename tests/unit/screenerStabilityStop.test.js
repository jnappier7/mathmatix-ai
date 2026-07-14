/**
 * QA P1-4 — theta-stabilized early stop.
 *
 * At typical item discrimination the SE≤0.30 threshold is unreachable within
 * maxQuestions, so a consistent student ran to ~27 questions. checkConvergence
 * now stops once the ability estimate has settled (small spread over the
 * recent window) after enough questions — while erratic responders keep going.
 */

const { checkConvergence } = require('../../utils/catConvergence');

// Minimal session shaped like the real one. High SE on purpose, so ONLY the
// stability tier (not the SE tiers) can trigger a stop.
function session(thetaAfters, { standardError = 0.55 } = {}) {
  return {
    questionCount: thetaAfters.length,
    standardError,
    theta: thetaAfters[thetaAfters.length - 1],
    minQuestions: 8,
    targetQuestions: 15,
    maxQuestions: 30,
    responses: thetaAfters.map((t, i) => ({
      difficulty: t, discrimination: 1, correct: i % 2 === 0, thetaAfter: t,
    })),
  };
}

describe('theta-stabilized early stop', () => {
  test('stops when theta has settled after enough questions (SE still high)', () => {
    // 13 questions, last 6 thetas within a 0.1 band → stable.
    const thetas = [0.9, 0.6, 0.4, 0.35, 0.3, 0.28, 0.30, 0.31, 0.29, 0.30, 0.28, 0.31, 0.30];
    const r = checkConvergence(session(thetas));
    expect(r.canStop).toBe(true);
    expect(r.reason).toBe('theta-stabilized');
  });

  test('does NOT stop early when the estimate is still swinging', () => {
    // 13 questions but the last 6 span > 0.35 → not stable.
    const thetas = [0.9, 0.6, 0.4, 0.35, 0.3, 0.28, 0.9, 0.1, 0.8, 0.2, 0.7, 0.15, 0.75];
    const r = checkConvergence(session(thetas));
    // No SE tier can fire (SE 0.55), and stability fails → keep going.
    expect(r.canStop).toBe(false);
    expect(r.reason).toBe('continue');
  });

  test('does NOT stop before the minimum question count even if stable', () => {
    // Only 10 questions (< STABILITY_MIN_QUESTIONS = 12), all stable.
    const thetas = [0.30, 0.30, 0.29, 0.31, 0.30, 0.30, 0.29, 0.31, 0.30, 0.30];
    const r = checkConvergence(session(thetas));
    expect(r.reason).not.toBe('theta-stabilized');
  });

  test('a low SE still stops via the high-confidence tier (stability is additive)', () => {
    const thetas = [0.3, 0.31, 0.29, 0.30, 0.30, 0.31, 0.30, 0.29, 0.30];
    const r = checkConvergence(session(thetas, { standardError: 0.20 }));
    expect(r.canStop).toBe(true);
    expect(r.reason).toBe('high-confidence');
  });
});
