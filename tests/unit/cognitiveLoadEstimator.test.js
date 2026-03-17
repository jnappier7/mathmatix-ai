/**
 * Tests for Cognitive Load Estimator
 */
const {
  estimateCognitiveLoad,
  calculateResponseTimeSignal,
  calculateErrorBurstSignal,
  calculateComplexityMismatchSignal,
  calculateFatigueSignal,
} = require('../../utils/cognitiveLoadEstimator');

describe('Cognitive Load Estimator', () => {

  describe('estimateCognitiveLoad', () => {
    it('should return low load for good performance', () => {
      const result = estimateCognitiveLoad({
        responseTimes: [5, 4, 5, 4, 5],
        results: [
          { correct: true, hintUsed: false },
          { correct: true, hintUsed: false },
          { correct: true, hintUsed: false },
          { correct: true, hintUsed: false },
          { correct: true, hintUsed: false },
        ],
        messageLengths: [8, 7, 9, 8, 10],
        sessionDurationMinutes: 10,
        studentTheta: 0.5,
        currentDifficulty: 0.5,
      });

      expect(result.cognitiveLoad).toBeLessThan(0.5);
      expect(result.isOverloaded).toBe(false);
    });

    it('should detect overload from multiple signals', () => {
      const result = estimateCognitiveLoad({
        // Slowing down dramatically
        responseTimes: [5, 6, 5, 6, 12, 15, 18, 20],
        // Errors clustering at end
        results: [
          { correct: true, hintUsed: false },
          { correct: true, hintUsed: false },
          { correct: true, hintUsed: false },
          { correct: false, hintUsed: true },
          { correct: false, hintUsed: true },
          { correct: false, hintUsed: true },
          { correct: false, hintUsed: true },
        ],
        messageLengths: [8, 7, 9, 3, 2, 1, 1],
        sessionDurationMinutes: 35,
        studentTheta: -0.5,
        currentDifficulty: 1.5,
      });

      expect(result.cognitiveLoad).toBeGreaterThan(0.5);
    });

    it('should return insufficient data result gracefully', () => {
      const result = estimateCognitiveLoad({
        responseTimes: [5],
        results: [{ correct: true }],
        messageLengths: [8],
      });

      expect(result.cognitiveLoad).toBeDefined();
      expect(result.isOverloaded).toBe(false);
    });
  });

  describe('calculateResponseTimeSignal', () => {
    it('should return 0 when getting faster', () => {
      const signal = calculateResponseTimeSignal([10, 9, 8, 7, 6, 5]);
      expect(signal).toBe(0);
    });

    it('should return high signal when slowing down', () => {
      const signal = calculateResponseTimeSignal([5, 5, 5, 10, 15, 20]);
      expect(signal).toBeGreaterThan(0.3);
    });

    it('should handle insufficient data', () => {
      expect(calculateResponseTimeSignal([5])).toBe(0);
      expect(calculateResponseTimeSignal([])).toBe(0);
    });
  });

  describe('calculateErrorBurstSignal', () => {
    it('should return 0 for no errors', () => {
      const results = Array(6).fill({ correct: true });
      expect(calculateErrorBurstSignal(results)).toBe(0);
    });

    it('should detect error burst in recent window', () => {
      const results = [
        { correct: true }, { correct: true }, { correct: true },
        { correct: false }, { correct: false }, { correct: false },
      ];
      expect(calculateErrorBurstSignal(results)).toBeGreaterThan(0);
    });
  });

  describe('calculateComplexityMismatchSignal', () => {
    it('should return 0 when difficulty matches ability', () => {
      expect(calculateComplexityMismatchSignal(1.0, 1.0)).toBe(0);
      expect(calculateComplexityMismatchSignal(1.0, 1.3)).toBe(0);
    });

    it('should return 0 when problem is easier than ability', () => {
      expect(calculateComplexityMismatchSignal(2.0, 0.5)).toBe(0);
    });

    it('should increase with difficulty gap', () => {
      const small = calculateComplexityMismatchSignal(0, 1.0);
      const large = calculateComplexityMismatchSignal(0, 2.5);
      expect(large).toBeGreaterThan(small);
    });
  });

  describe('calculateFatigueSignal', () => {
    it('should return 0 early in session', () => {
      expect(calculateFatigueSignal(10)).toBe(0);
      expect(calculateFatigueSignal(20)).toBe(0);
    });

    it('should ramp up after onset', () => {
      const at30 = calculateFatigueSignal(30);
      const at40 = calculateFatigueSignal(40);
      expect(at30).toBeGreaterThan(0);
      expect(at40).toBeGreaterThan(at30);
    });

    it('should max out after peak', () => {
      expect(calculateFatigueSignal(50)).toBe(1);
      expect(calculateFatigueSignal(60)).toBe(1);
    });
  });
});
