/**
 * IRT (Item Response Theory) Unit Tests
 *
 * Tests the core mathematical functions that power adaptive testing.
 * These are critical - incorrect IRT calculations lead to wrong placements.
 */

const {
  probabilityCorrect,
  logLikelihood,
  estimateAbility,
  estimateAbilityMAP,
  calculateInformation,
  selectNextProblem,
  expectedInformation,
  hasConverged,
  hasPlateaued,
  thetaToPercentile,
  thetaToGradeLevel
} = require('../../utils/irt');

describe('IRT Core Functions', () => {

  // ===========================================================================
  // PROBABILITY CORRECT (2PL Model)
  // ===========================================================================

  describe('probabilityCorrect', () => {
    test('returns 0.5 when theta equals difficulty', () => {
      expect(probabilityCorrect(0, 0)).toBeCloseTo(0.5, 5);
      expect(probabilityCorrect(1.5, 1.5)).toBeCloseTo(0.5, 5);
      expect(probabilityCorrect(-2, -2)).toBeCloseTo(0.5, 5);
    });

    test('returns higher probability when theta > difficulty', () => {
      expect(probabilityCorrect(1, 0)).toBeGreaterThan(0.5);
      expect(probabilityCorrect(2, 0)).toBeGreaterThan(probabilityCorrect(1, 0));
      expect(probabilityCorrect(3, 0)).toBeGreaterThan(0.95);
    });

    test('returns lower probability when theta < difficulty', () => {
      expect(probabilityCorrect(-1, 0)).toBeLessThan(0.5);
      expect(probabilityCorrect(-2, 0)).toBeLessThan(probabilityCorrect(-1, 0));
      expect(probabilityCorrect(-3, 0)).toBeLessThan(0.05);
    });

    test('discrimination affects steepness of curve', () => {
      // Higher discrimination = more extreme probabilities
      const lowDisc = probabilityCorrect(1, 0, 0.5);
      const highDisc = probabilityCorrect(1, 0, 2.0);

      expect(highDisc).toBeGreaterThan(lowDisc);
    });

    test('always returns value between 0 and 1', () => {
      const extremeCases = [
        [10, 0], [-10, 0], [0, 10], [0, -10],
        [5, 5], [-5, -5], [100, -100]
      ];

      for (const [theta, diff] of extremeCases) {
        const p = probabilityCorrect(theta, diff);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    });

    test('is symmetric around theta = difficulty', () => {
      const pAbove = probabilityCorrect(1, 0);
      const pBelow = probabilityCorrect(-1, 0);

      expect(pAbove + pBelow).toBeCloseTo(1, 5);
    });
  });

  // ===========================================================================
  // LOG LIKELIHOOD
  // ===========================================================================

  describe('logLikelihood', () => {
    test('returns negative value (log of probability < 1)', () => {
      const responses = [
        { difficulty: 0, discrimination: 1, correct: true }
      ];
      expect(logLikelihood(0, responses)).toBeLessThan(0);
    });

    test('higher for theta matching response pattern', () => {
      const correctHard = [
        { difficulty: 2, discrimination: 1, correct: true },
        { difficulty: 1, discrimination: 1, correct: true }
      ];

      // High theta should have higher likelihood for correct hard items
      const llHigh = logLikelihood(2, correctHard);
      const llLow = logLikelihood(-2, correctHard);

      expect(llHigh).toBeGreaterThan(llLow);
    });

    test('handles mixed response patterns', () => {
      const mixed = [
        { difficulty: 0, discrimination: 1, correct: true },
        { difficulty: 1, discrimination: 1, correct: false },
        { difficulty: -1, discrimination: 1, correct: true }
      ];

      // Should not throw, should return finite value
      const ll = logLikelihood(0, mixed);
      expect(isFinite(ll)).toBe(true);
    });
  });

  // ===========================================================================
  // ABILITY ESTIMATION (MLE)
  // ===========================================================================

  describe('estimateAbility (MLE)', () => {
    test('returns theta=0 for empty responses', () => {
      const result = estimateAbility([]);
      expect(result.theta).toBe(0);
      expect(result.standardError).toBe(Infinity);
      expect(result.converged).toBe(false);
    });

    test('estimates higher theta for correct hard items', () => {
      const hardCorrect = [
        { difficulty: 2, discrimination: 1, correct: true },
        { difficulty: 1.5, discrimination: 1, correct: true },
        { difficulty: 1, discrimination: 1, correct: true }
      ];

      const easyCorrect = [
        { difficulty: -2, discrimination: 1, correct: true },
        { difficulty: -1.5, discrimination: 1, correct: true },
        { difficulty: -1, discrimination: 1, correct: true }
      ];

      const hardResult = estimateAbility(hardCorrect);
      const easyResult = estimateAbility(easyCorrect);

      expect(hardResult.theta).toBeGreaterThan(easyResult.theta);
    });

    test('estimates lower theta for incorrect easy items', () => {
      const easyIncorrect = [
        { difficulty: -2, discrimination: 1, correct: false },
        { difficulty: -1, discrimination: 1, correct: false }
      ];

      const result = estimateAbility(easyIncorrect);
      expect(result.theta).toBeLessThan(-2);
    });

    test('converges to reasonable estimate for typical pattern', () => {
      // Student who can do medium but fails hard
      const typical = [
        { difficulty: 0, discrimination: 1, correct: true },
        { difficulty: 0.5, discrimination: 1, correct: true },
        { difficulty: 1, discrimination: 1, correct: false },
        { difficulty: 0.8, discrimination: 1, correct: true },
        { difficulty: 1.2, discrimination: 1, correct: false }
      ];

      const result = estimateAbility(typical);

      expect(result.converged).toBe(true);
      expect(result.theta).toBeGreaterThan(0);
      expect(result.theta).toBeLessThan(1.5);
      expect(result.standardError).toBeLessThan(1);
    });

    test('stays within bounds [-4, 4]', () => {
      // All correct at hard difficulty
      const allCorrect = Array(10).fill(null).map(() => ({
        difficulty: 3, discrimination: 1, correct: true
      }));

      const result = estimateAbility(allCorrect);
      expect(result.theta).toBeLessThanOrEqual(4);

      // All incorrect at easy difficulty
      const allIncorrect = Array(10).fill(null).map(() => ({
        difficulty: -3, discrimination: 1, correct: false
      }));

      const result2 = estimateAbility(allIncorrect);
      expect(result2.theta).toBeGreaterThanOrEqual(-4);
    });

    test('standard error decreases with more responses', () => {
      const base = { difficulty: 0, discrimination: 1, correct: true };

      const few = estimateAbility([base, base]);
      const many = estimateAbility(Array(10).fill(base));

      expect(many.standardError).toBeLessThan(few.standardError);
    });
  });

  // ===========================================================================
  // ABILITY ESTIMATION (MAP - Bayesian)
  // ===========================================================================

  describe('estimateAbilityMAP', () => {
    test('returns prior for empty responses', () => {
      const result = estimateAbilityMAP([], { priorMean: 1.5 });
      expect(result.theta).toBe(1.5);
    });

    test('pulls estimate toward prior with few responses', () => {
      const responses = [
        { difficulty: 2, discrimination: 1, correct: true }
      ];

      // Without prior (MLE)
      const mle = estimateAbility(responses);

      // With strong prior at 0
      const map = estimateAbilityMAP(responses, { priorMean: 0, priorSD: 0.5 });

      // MAP should be closer to 0 than MLE
      expect(Math.abs(map.theta)).toBeLessThan(Math.abs(mle.theta));
    });

    test('approaches MLE with many responses', () => {
      const responses = Array(20).fill(null).map((_, i) => ({
        difficulty: 1 + (i % 3) * 0.5,
        discrimination: 1,
        correct: i < 15 // 75% correct
      }));

      const mle = estimateAbility(responses);
      const map = estimateAbilityMAP(responses, { priorMean: -2, priorSD: 1.25 });

      // With many responses, prior influence should be minimal
      expect(Math.abs(map.theta - mle.theta)).toBeLessThan(0.5);
    });
  });

  // ===========================================================================
  // FISHER INFORMATION
  // ===========================================================================

  describe('calculateInformation', () => {
    test('maximum at theta = difficulty', () => {
      const responses = [{ difficulty: 0, discrimination: 1, correct: true }];

      const infoAtMatch = calculateInformation(0, responses);
      const infoAway = calculateInformation(2, responses);

      expect(infoAtMatch).toBeGreaterThan(infoAway);
    });

    test('higher discrimination gives more information', () => {
      const lowDisc = [{ difficulty: 0, discrimination: 0.5, correct: true }];
      const highDisc = [{ difficulty: 0, discrimination: 2, correct: true }];

      const infoLow = calculateInformation(0, lowDisc);
      const infoHigh = calculateInformation(0, highDisc);

      expect(infoHigh).toBeGreaterThan(infoLow);
    });

    test('information is additive across items', () => {
      const one = [{ difficulty: 0, discrimination: 1, correct: true }];
      const two = [
        { difficulty: 0, discrimination: 1, correct: true },
        { difficulty: 0, discrimination: 1, correct: false }
      ];

      const infoOne = calculateInformation(0, one);
      const infoTwo = calculateInformation(0, two);

      expect(infoTwo).toBeCloseTo(infoOne * 2, 5);
    });
  });

  // ===========================================================================
  // PROBLEM SELECTION
  // ===========================================================================

  describe('selectNextProblem', () => {
    const problems = [
      { id: 'easy', difficulty: -2, discrimination: 1 },
      { id: 'medium', difficulty: 0, discrimination: 1 },
      { id: 'hard', difficulty: 2, discrimination: 1 }
    ];

    test('returns null for empty pool', () => {
      expect(selectNextProblem(0, [])).toBeNull();
    });

    test('selects item closest to theta', () => {
      const selected = selectNextProblem(0, problems);
      expect(selected.id).toBe('medium');

      const selectedHigh = selectNextProblem(1.8, problems);
      expect(selectedHigh.id).toBe('hard');

      const selectedLow = selectNextProblem(-1.8, problems);
      expect(selectedLow.id).toBe('easy');
    });
  });

  describe('expectedInformation', () => {
    test('maximum when theta equals difficulty', () => {
      const atMatch = expectedInformation(0, 0);
      const away = expectedInformation(0, 2);

      expect(atMatch).toBeGreaterThan(away);
    });

    test('equals 0.25 * a^2 at match point', () => {
      // At theta = difficulty, P = 0.5, so info = a^2 * 0.5 * 0.5 = 0.25 * a^2
      const info = expectedInformation(0, 0, 1);
      expect(info).toBeCloseTo(0.25, 5);

      const infoHighA = expectedInformation(0, 0, 2);
      expect(infoHighA).toBeCloseTo(1, 5); // 0.25 * 4
    });
  });

  // ===========================================================================
  // CONVERGENCE DETECTION
  // ===========================================================================

  describe('hasConverged', () => {
    test('returns true when SE below threshold', () => {
      expect(hasConverged(0.25)).toBe(true);
      expect(hasConverged(0.29)).toBe(true);
    });

    test('returns false when SE above threshold', () => {
      expect(hasConverged(0.35)).toBe(false);
      expect(hasConverged(1.0)).toBe(false);
    });

    test('respects custom threshold', () => {
      expect(hasConverged(0.35, { seThreshold: 0.4 })).toBe(true);
      expect(hasConverged(0.25, { seThreshold: 0.2 })).toBe(false);
    });
  });

  describe('hasPlateaued', () => {
    test('returns false with fewer than 5 responses', () => {
      const responses = [
        { correct: true, thetaAfter: 0.5 },
        { correct: false, thetaAfter: 0.4 }
      ];
      expect(hasPlateaued(responses)).toBe(false);
    });

    test('detects alternating pattern with stable theta', () => {
      const alternating = [
        { correct: true, thetaAfter: 0.5 },
        { correct: false, thetaAfter: 0.45 },
        { correct: true, thetaAfter: 0.5 },
        { correct: false, thetaAfter: 0.48 },
        { correct: true, thetaAfter: 0.5 }
      ];
      expect(hasPlateaued(alternating)).toBe(true);
    });

    test('returns false for consistent pattern', () => {
      const consistent = [
        { correct: true, thetaAfter: 0.5 },
        { correct: true, thetaAfter: 0.6 },
        { correct: true, thetaAfter: 0.7 },
        { correct: true, thetaAfter: 0.8 },
        { correct: false, thetaAfter: 0.75 }
      ];
      expect(hasPlateaued(consistent)).toBe(false);
    });

    test('returns false if theta is unstable', () => {
      const unstable = [
        { correct: true, thetaAfter: 0 },
        { correct: false, thetaAfter: 1 },
        { correct: true, thetaAfter: 0.2 },
        { correct: false, thetaAfter: 0.8 },
        { correct: true, thetaAfter: 0.1 }
      ];
      expect(hasPlateaued(unstable)).toBe(false);
    });
  });

  // ===========================================================================
  // CONVERSION UTILITIES
  // ===========================================================================

  describe('thetaToPercentile', () => {
    test('theta=0 is 50th percentile', () => {
      expect(thetaToPercentile(0)).toBe(50);
    });

    test('positive theta is above 50th', () => {
      expect(thetaToPercentile(1)).toBeGreaterThan(50);
      expect(thetaToPercentile(2)).toBeGreaterThan(thetaToPercentile(1));
    });

    test('negative theta is below 50th', () => {
      expect(thetaToPercentile(-1)).toBeLessThan(50);
      expect(thetaToPercentile(-2)).toBeLessThan(thetaToPercentile(-1));
    });

    test('extreme values approach 0 and 100', () => {
      expect(thetaToPercentile(3)).toBeGreaterThan(99);
      expect(thetaToPercentile(-3)).toBeLessThan(1);
    });
  });

  describe('thetaToGradeLevel', () => {
    test('maps theta to reasonable grade levels', () => {
      expect(thetaToGradeLevel(-3)).toBe(5);
      expect(thetaToGradeLevel(-1.5)).toBe(6);
      expect(thetaToGradeLevel(0)).toBe(7);
      expect(thetaToGradeLevel(0.5)).toBe(9);
      expect(thetaToGradeLevel(1.5)).toBe(11);
      expect(thetaToGradeLevel(3)).toBe(12);
    });
  });
});

// ===========================================================================
// INTEGRATION TESTS
// ===========================================================================

describe('IRT Integration', () => {
  test('full adaptive test simulation', () => {
    // Simulate a student with true ability = 1.0
    const trueTheta = 1.0;
    const responses = [];
    let currentTheta = 0;

    // Simulate 15 questions
    for (let i = 0; i < 15; i++) {
      // Select problem at current estimate
      const problemDifficulty = currentTheta;

      // Simulate response based on true ability
      const pCorrect = probabilityCorrect(trueTheta, problemDifficulty);
      const correct = Math.random() < pCorrect;

      responses.push({
        difficulty: problemDifficulty,
        discrimination: 1,
        correct
      });

      // Update estimate
      const result = estimateAbility(responses);
      currentTheta = result.theta;
    }

    // Final estimate should be close to true ability
    const finalResult = estimateAbility(responses);
    expect(Math.abs(finalResult.theta - trueTheta)).toBeLessThan(0.5);
    expect(finalResult.standardError).toBeLessThan(0.5);
  });

  test('MAP to MLE transition', () => {
    const responses = [];
    const priorMean = 0;

    // First 5 questions: MAP should pull toward prior
    for (let i = 0; i < 5; i++) {
      responses.push({
        difficulty: 2,
        discrimination: 1,
        correct: true
      });
    }

    const mapEarly = estimateAbilityMAP(responses, { priorMean, priorSD: 1.25 });
    const mleEarly = estimateAbility(responses);

    expect(mapEarly.theta).toBeLessThan(mleEarly.theta); // MAP pulls toward prior

    // Add 15 more questions
    for (let i = 0; i < 15; i++) {
      responses.push({
        difficulty: 2,
        discrimination: 1,
        correct: true
      });
    }

    const mapLate = estimateAbilityMAP(responses, { priorMean, priorSD: 1.25 });
    const mleLate = estimateAbility(responses);

    // With more data, MAP and MLE should converge
    expect(Math.abs(mapLate.theta - mleLate.theta)).toBeLessThan(0.2);
  });
});
