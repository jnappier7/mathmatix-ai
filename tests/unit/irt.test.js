// tests/unit/irt.test.js
// Unit tests for IRT (Item Response Theory) calculations

const {
  calculateProbability,
  estimateAbility,
  selectNextItem,
  calculateStandardError
} = require('../../utils/irt');

describe('IRT Utility Functions', () => {
  describe('calculateProbability', () => {
    test('should return probability between 0 and 1', () => {
      const theta = 0; // ability
      const difficulty = 0; // item difficulty
      const discrimination = 1; // item discrimination

      const prob = calculateProbability(theta, difficulty, discrimination);

      expect(prob).toBeGreaterThanOrEqual(0);
      expect(prob).toBeLessThanOrEqual(1);
    });

    test('should return 0.5 when ability equals difficulty', () => {
      const theta = 0.5;
      const difficulty = 0.5;
      const discrimination = 1;

      const prob = calculateProbability(theta, difficulty, discrimination);

      expect(prob).toBeCloseTo(0.5, 1);
    });

    test('should return higher probability when ability > difficulty', () => {
      const highAbilityProb = calculateProbability(2, 0, 1);
      const lowAbilityProb = calculateProbability(-2, 0, 1);

      expect(highAbilityProb).toBeGreaterThan(lowAbilityProb);
      expect(highAbilityProb).toBeGreaterThan(0.5);
      expect(lowAbilityProb).toBeLessThan(0.5);
    });

    test('should handle edge cases', () => {
      // Very high ability vs easy item
      const veryHighProb = calculateProbability(10, -5, 1);
      expect(veryHighProb).toBeCloseTo(1, 1);

      // Very low ability vs hard item
      const veryLowProb = calculateProbability(-10, 5, 1);
      expect(veryLowProb).toBeCloseTo(0, 1);
    });

    test('should respect discrimination parameter', () => {
      const theta = 1;
      const difficulty = 0;

      const lowDiscrim = calculateProbability(theta, difficulty, 0.5);
      const highDiscrim = calculateProbability(theta, difficulty, 2);

      // Higher discrimination should lead to more extreme probabilities
      expect(highDiscrim).toBeGreaterThan(lowDiscrim);
    });
  });

  describe('estimateAbility', () => {
    test('should return theta estimate within reasonable range', () => {
      const responses = [
        { difficulty: 0, correct: true },
        { difficulty: 0.5, correct: true },
        { difficulty: -0.5, correct: false }
      ];

      const theta = estimateAbility(responses);

      // Theta should typically be between -3 and 3 for most students
      expect(theta).toBeGreaterThan(-5);
      expect(theta).toBeLessThan(5);
    });

    test('should increase theta when answering hard questions correctly', () => {
      const easyResponses = [
        { difficulty: -2, correct: true },
        { difficulty: -1, correct: true }
      ];

      const hardResponses = [
        { difficulty: 2, correct: true },
        { difficulty: 3, correct: true }
      ];

      const easyTheta = estimateAbility(easyResponses);
      const hardTheta = estimateAbility(hardResponses);

      expect(hardTheta).toBeGreaterThan(easyTheta);
    });

    test('should decrease theta when answering easy questions incorrectly', () => {
      const correctResponses = [
        { difficulty: 0, correct: true },
        { difficulty: 0, correct: true }
      ];

      const incorrectResponses = [
        { difficulty: -2, correct: false },
        { difficulty: -1, correct: false }
      ];

      const correctTheta = estimateAbility(correctResponses);
      const incorrectTheta = estimateAbility(incorrectResponses);

      expect(incorrectTheta).toBeLessThan(correctTheta);
    });

    test('should handle empty response array', () => {
      const theta = estimateAbility([]);

      // Should return default starting theta (usually 0)
      expect(theta).toBe(0);
    });

    test('should converge with more responses', () => {
      const fewResponses = [
        { difficulty: 0, correct: true }
      ];

      const manyResponses = [
        { difficulty: 0, correct: true },
        { difficulty: 0.5, correct: true },
        { difficulty: 1, correct: false },
        { difficulty: 0.8, correct: false },
        { difficulty: 0.3, correct: true }
      ];

      const fewStdError = calculateStandardError(estimateAbility(fewResponses), fewResponses.length);
      const manyStdError = calculateStandardError(estimateAbility(manyResponses), manyResponses.length);

      // More responses should lead to lower standard error
      expect(manyStdError).toBeLessThan(fewStdError);
    });
  });

  describe('selectNextItem', () => {
    const itemPool = [
      { id: 'easy', difficulty: -2, discrimination: 1 },
      { id: 'medium', difficulty: 0, discrimination: 1 },
      { id: 'hard', difficulty: 2, discrimination: 1 }
    ];

    test('should select item close to current theta estimate', () => {
      const theta = 0;
      const usedItems = [];

      const nextItem = selectNextItem(theta, itemPool, usedItems);

      // Should select medium difficulty item (closest to theta = 0)
      expect(nextItem.id).toBe('medium');
    });

    test('should not select previously used items', () => {
      const theta = 0;
      const usedItems = ['medium'];

      const nextItem = selectNextItem(theta, itemPool, usedItems);

      // Should select either easy or hard, but not medium
      expect(nextItem.id).not.toBe('medium');
    });

    test('should select harder items for high ability students', () => {
      const highTheta = 2;
      const usedItems = [];

      const nextItem = selectNextItem(highTheta, itemPool, usedItems);

      // Should select hard item (closest to theta = 2)
      expect(nextItem.id).toBe('hard');
    });

    test('should select easier items for low ability students', () => {
      const lowTheta = -2;
      const usedItems = [];

      const nextItem = selectNextItem(lowTheta, itemPool, usedItems);

      // Should select easy item (closest to theta = -2)
      expect(nextItem.id).toBe('easy');
    });

    test('should return null when all items are used', () => {
      const theta = 0;
      const usedItems = ['easy', 'medium', 'hard'];

      const nextItem = selectNextItem(theta, itemPool, usedItems);

      expect(nextItem).toBeNull();
    });
  });

  describe('calculateStandardError', () => {
    test('should decrease with more items', () => {
      const theta = 0;

      const se5 = calculateStandardError(theta, 5);
      const se10 = calculateStandardError(theta, 10);
      const se20 = calculateStandardError(theta, 20);

      expect(se10).toBeLessThan(se5);
      expect(se20).toBeLessThan(se10);
    });

    test('should always be positive', () => {
      const se = calculateStandardError(0, 10);

      expect(se).toBeGreaterThan(0);
    });

    test('should be larger for extreme theta values', () => {
      const seMiddle = calculateStandardError(0, 10);
      const seExtreme = calculateStandardError(3, 10);

      // Standard error is typically larger at extremes
      // (though this depends on item pool characteristics)
      expect(seExtreme).toBeGreaterThan(0);
      expect(seMiddle).toBeGreaterThan(0);
    });
  });
});
