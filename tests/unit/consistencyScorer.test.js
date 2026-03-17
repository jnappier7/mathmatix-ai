/**
 * Tests for Consistency-Weighted Scoring Engine (SmartScore)
 */
const {
  initializeScore,
  recordAttempt,
  calculateWeightedAccuracy,
  calculateConsistencyScore,
  analyzePattern,
  SCORING_CONFIG,
} = require('../../utils/consistencyScorer');

describe('Consistency Scorer', () => {

  describe('initializeScore', () => {
    it('should initialize with zero score', () => {
      const state = initializeScore('test-skill');
      expect(state.smartScore).toBe(0);
      expect(state.responses.length).toBe(0);
      expect(state.productiveStruggleDetected).toBe(false);
    });
  });

  describe('recordAttempt', () => {
    it('should increase score on correct answers', () => {
      let state = initializeScore('test-skill');
      state = recordAttempt(state, { correct: true });
      state = recordAttempt(state, { correct: true });
      state = recordAttempt(state, { correct: true });
      expect(state.smartScore).toBeGreaterThan(0);
    });

    it('should decrease score on incorrect answers', () => {
      let state = initializeScore('test-skill');
      // Build up score first
      for (let i = 0; i < 5; i++) {
        state = recordAttempt(state, { correct: true });
      }
      const scoreBefore = state.smartScore;
      state = recordAttempt(state, { correct: false });
      state = recordAttempt(state, { correct: false });
      expect(state.smartScore).toBeLessThan(scoreBefore);
    });

    it('should track streaks correctly', () => {
      let state = initializeScore('test-skill');
      state = recordAttempt(state, { correct: true });
      state = recordAttempt(state, { correct: true });
      state = recordAttempt(state, { correct: true });
      expect(state.longestCorrectStreak).toBe(3);

      state = recordAttempt(state, { correct: false });
      state = recordAttempt(state, { correct: false });
      expect(state.longestIncorrectStreak).toBe(2);
    });

    it('should detect productive struggle', () => {
      let state = initializeScore('test-skill');
      // Correct, wrong, wrong, correct pattern
      state = recordAttempt(state, { correct: true });
      state = recordAttempt(state, { correct: false }); // Error 1
      state = recordAttempt(state, { correct: false }); // Error 2
      state = recordAttempt(state, { correct: true });   // Recovery 1
      state = recordAttempt(state, { correct: true });
      expect(state.errorCount).toBe(2);
      expect(state.recoveryCount).toBeGreaterThanOrEqual(1);
      expect(state.productiveStruggleDetected).toBe(true);
    });
  });

  describe('calculateWeightedAccuracy', () => {
    it('should weight recent responses more heavily', () => {
      // Old wrong, recent correct — should score higher
      const recentCorrect = [
        { correct: false }, { correct: false },
        { correct: true }, { correct: true }, { correct: true },
      ];

      // Old correct, recent wrong — should score lower
      const recentWrong = [
        { correct: true }, { correct: true },
        { correct: false }, { correct: false }, { correct: false },
      ];

      const score1 = calculateWeightedAccuracy(recentCorrect);
      const score2 = calculateWeightedAccuracy(recentWrong);

      expect(score1).toBeGreaterThan(score2);
    });
  });

  describe('calculateConsistencyScore', () => {
    it('should score perfect consistency as 1.0', () => {
      const perfect = Array(10).fill({ correct: true });
      expect(calculateConsistencyScore(perfect)).toBe(1.0);
    });

    it('should score spread errors higher than clustered errors', () => {
      // Spread errors (e.g., every 3rd wrong)
      const spread = [
        { correct: true }, { correct: true }, { correct: false },
        { correct: true }, { correct: true }, { correct: false },
        { correct: true }, { correct: true },
      ];

      // Clustered errors (all at end)
      const clustered = [
        { correct: true }, { correct: true }, { correct: true },
        { correct: true }, { correct: true }, { correct: true },
        { correct: false }, { correct: false },
      ];

      const spreadScore = calculateConsistencyScore(spread);
      const clusteredScore = calculateConsistencyScore(clustered);

      expect(spreadScore).toBeGreaterThan(clusteredScore);
    });
  });

  describe('analyzePattern', () => {
    it('should detect improvement trajectory', () => {
      let state = initializeScore('test-skill');
      // Start wrong, end right
      state = recordAttempt(state, { correct: false });
      state = recordAttempt(state, { correct: false });
      state = recordAttempt(state, { correct: false });
      state = recordAttempt(state, { correct: true });
      state = recordAttempt(state, { correct: true });
      state = recordAttempt(state, { correct: true });
      state = recordAttempt(state, { correct: true });
      state = recordAttempt(state, { correct: true });

      const pattern = analyzePattern(state);
      expect(['rapid-improvement', 'productive-struggle']).toContain(pattern.pattern);
    });

    it('should detect stuck pattern', () => {
      let state = initializeScore('test-skill');
      // Consistently wrong
      for (let i = 0; i < 8; i++) {
        state = recordAttempt(state, { correct: i % 3 === 0 }); // Mostly wrong
      }

      const pattern = analyzePattern(state);
      expect(['stuck', 'mixed', 'declining']).toContain(pattern.pattern);
    });
  });
});
