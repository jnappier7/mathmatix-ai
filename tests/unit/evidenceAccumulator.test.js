/**
 * Tests for Evidence Accumulator
 */
const {
  assembleEvidence,
  generateCompositeSignals,
} = require('../../utils/pipeline/evidenceAccumulator');

describe('Evidence Accumulator', () => {

  describe('assembleEvidence', () => {
    it('should assemble evidence with all sources available', () => {
      const evidence = assembleEvidence({
        observation: {
          messageType: 'answer_attempt',
          contextSignals: [{ type: 'confidence', strength: 0.7 }],
        },
        diagnosis: {
          type: 'correct',
          isCorrect: true,
          misconception: null,
        },
        sessionMood: {
          trajectory: 'rising',
          energy: 'high',
          momentum: 0.5,
          inFlow: false,
          fatigueSignal: false,
        },
        bktState: {
          pLearned: 0.75,
          pGuess: 0.2,
          pSlip: 0.1,
          mastered: false,
          confidence: 0.8,
          totalAttempts: 10,
          consecutiveCorrect: 3,
          consecutiveIncorrect: 0,
        },
        conversationData: {
          responseTimes: [5, 4, 5, 6],
          results: [
            { correct: true, hintUsed: false },
            { correct: true, hintUsed: false },
            { correct: true, hintUsed: false },
          ],
          messageLengths: [8, 7, 9],
          sessionDurationMinutes: 15,
        },
        studentProfile: { theta: 0.5 },
        activeSkill: { skillId: 'test', difficulty: 0.5 },
      });

      expect(evidence.knowledge.available).toBe(true);
      expect(evidence.knowledge.pLearned).toBe(0.75);
      expect(evidence.engagement.available).toBe(true);
      expect(evidence.engagement.trajectory).toBe('rising');
      expect(evidence.composite).toBeDefined();
    });

    it('should handle missing data sources gracefully', () => {
      const evidence = assembleEvidence({
        observation: { messageType: 'greeting', contextSignals: [] },
        diagnosis: { type: 'no_answer' },
      });

      expect(evidence.knowledge.available).toBe(false);
      expect(evidence.memory.available).toBe(false);
      expect(evidence.cognitiveLoad.available).toBe(false);
      expect(evidence.performance.available).toBe(false);
      expect(evidence.engagement.available).toBe(false);
      expect(evidence.composite).toBeDefined();
    });
  });

  describe('generateCompositeSignals', () => {
    it('should flag difficulty reduction when overloaded', () => {
      const evidence = {
        knowledge: { available: true, pLearned: 0.3, zpdScore: 0.1 },
        memory: { available: false },
        cognitiveLoad: { available: true, isOverloaded: true, level: 'overload', signals: {} },
        performance: { available: false },
        misconceptions: { isRecurring: false },
        engagement: { available: false },
      };

      const signals = generateCompositeSignals(evidence);
      expect(signals.shouldReduceDifficulty).toBe(true);
      expect(signals.reasoning.length).toBeGreaterThan(0);
    });

    it('should flag difficulty increase when mastered and low load', () => {
      const evidence = {
        knowledge: { available: true, pLearned: 0.95, zpdScore: 0 },
        memory: { available: false },
        cognitiveLoad: { available: true, isOverloaded: false, level: 'low', isOptimal: false, signals: {} },
        performance: { available: false },
        misconceptions: { isRecurring: false },
        engagement: { available: true, inFlow: true, fatigueSignal: false, trajectory: 'rising' },
      };

      const signals = generateCompositeSignals(evidence);
      expect(signals.shouldIncreaseDifficulty).toBe(true);
    });

    it('should flag approach switch for recurring misconceptions', () => {
      const evidence = {
        knowledge: { available: false },
        memory: { available: false },
        cognitiveLoad: { available: false },
        performance: { available: false },
        misconceptions: {
          isRecurring: true,
          recurringCount: 3,
          needsIntervention: true,
          currentMisconception: { name: 'Sign Error' },
        },
        engagement: { available: false },
      };

      const signals = generateCompositeSignals(evidence);
      expect(signals.shouldSwitchApproach).toBe(true);
    });

    it('should detect teachable moments from metacognition', () => {
      const evidence = {
        knowledge: { available: false },
        memory: { available: false },
        cognitiveLoad: { available: false },
        performance: { available: true, productiveStruggle: true },
        misconceptions: { isRecurring: false },
        engagement: {
          available: true,
          confidenceLevel: 'metacognitive',
          inFlow: false,
          fatigueSignal: false,
        },
      };

      const signals = generateCompositeSignals(evidence);
      expect(signals.teachableMoment).toBe(true);
    });
  });
});
