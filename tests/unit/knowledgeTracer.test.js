/**
 * Tests for Bayesian Knowledge Tracing (BKT) Engine
 */
const {
  initializeBKT,
  updateBKT,
  predictCorrect,
  applyTemporalDecay,
  calculateZPDScore,
  shouldReview,
  prioritizeSkills,
  getKnowledgeSummary,
  MASTERY_THRESHOLD,
} = require('../../utils/knowledgeTracer');

describe('Knowledge Tracer (BKT)', () => {

  describe('initializeBKT', () => {
    it('should initialize with low P(L) for default category', () => {
      const state = initializeBKT('test-skill');
      expect(state.pLearned).toBeLessThan(0.1);
      expect(state.mastered).toBe(false);
      expect(state.totalAttempts).toBe(0);
    });

    it('should use category-specific parameters', () => {
      const arithmetic = initializeBKT('add-basics', 'arithmetic');
      const advanced = initializeBKT('calc-limits', 'advanced');
      expect(arithmetic.pGuess).toBeGreaterThan(advanced.pGuess);
    });
  });

  describe('updateBKT', () => {
    it('should increase P(L) on correct answer', () => {
      const initial = initializeBKT('test-skill');
      const updated = updateBKT(initial, true);
      expect(updated.pLearned).toBeGreaterThan(initial.pLearned);
    });

    it('should decrease P(L) on incorrect answer', () => {
      // Start with medium P(L)
      let state = initializeBKT('test-skill');
      // Get to medium P(L) first
      state = updateBKT(state, true);
      state = updateBKT(state, true);
      state = updateBKT(state, true);
      const beforeWrong = state.pLearned;
      state = updateBKT(state, false);
      expect(state.pLearned).toBeLessThan(beforeWrong);
    });

    it('should reach mastery after consecutive correct answers', () => {
      let state = initializeBKT('test-skill');
      // Simulate many correct answers
      for (let i = 0; i < 15; i++) {
        state = updateBKT(state, true);
      }
      expect(state.pLearned).toBeGreaterThan(0.9);
      expect(state.mastered).toBe(true);
    });

    it('should track consecutive streaks', () => {
      let state = initializeBKT('test-skill');
      state = updateBKT(state, true);
      state = updateBKT(state, true);
      expect(state.consecutiveCorrect).toBe(2);
      expect(state.consecutiveIncorrect).toBe(0);

      state = updateBKT(state, false);
      expect(state.consecutiveCorrect).toBe(0);
      expect(state.consecutiveIncorrect).toBe(1);
    });

    it('should account for hint usage', () => {
      const state = initializeBKT('test-skill');
      const withoutHint = updateBKT({ ...state }, true);
      const withHint = updateBKT({ ...state }, true, { hintUsed: true });
      // Hint-assisted correct should increase P(L) less
      expect(withHint.pLearned).toBeLessThan(withoutHint.pLearned);
    });

    it('should increase confidence with more observations', () => {
      let state = initializeBKT('test-skill');
      const initialConfidence = state.confidence;
      state = updateBKT(state, true);
      state = updateBKT(state, true);
      state = updateBKT(state, false);
      expect(state.confidence).toBeGreaterThan(initialConfidence);
    });
  });

  describe('applyTemporalDecay', () => {
    it('should not decay within 1 day', () => {
      const decayed = applyTemporalDecay(0.8, 0.5);
      expect(decayed).toBe(0.8);
    });

    it('should decay over time', () => {
      const original = 0.8;
      const after7 = applyTemporalDecay(original, 7);
      const after30 = applyTemporalDecay(original, 30);
      const after90 = applyTemporalDecay(original, 90);

      expect(after7).toBeLessThan(original);
      expect(after30).toBeLessThan(after7);
      expect(after90).toBeLessThan(after30);
    });

    it('should decay well-learned skills slower', () => {
      const highPL = applyTemporalDecay(0.95, 30);
      const lowPL = applyTemporalDecay(0.4, 30);

      // High P(L) retains more
      const highRetention = highPL / 0.95;
      const lowRetention = lowPL / 0.4;
      expect(highRetention).toBeGreaterThan(lowRetention);
    });

    it('should never decay below floor', () => {
      const decayed = applyTemporalDecay(0.1, 365);
      expect(decayed).toBeGreaterThan(0);
    });
  });

  describe('predictCorrect', () => {
    it('should predict higher for higher P(L)', () => {
      const highPL = { pLearned: 0.9, pGuess: 0.2, pSlip: 0.1 };
      const lowPL = { pLearned: 0.1, pGuess: 0.2, pSlip: 0.1 };

      expect(predictCorrect(highPL)).toBeGreaterThan(predictCorrect(lowPL));
    });

    it('should never return 0 due to guessing', () => {
      const state = { pLearned: 0, pGuess: 0.25, pSlip: 0.1 };
      expect(predictCorrect(state)).toBeGreaterThan(0);
    });
  });

  describe('calculateZPDScore', () => {
    it('should peak at P(L) around 0.5', () => {
      const at05 = calculateZPDScore({ pLearned: 0.5 });
      const at01 = calculateZPDScore({ pLearned: 0.1 });
      const at09 = calculateZPDScore({ pLearned: 0.9 });

      expect(at05).toBe(1);
      expect(at01).toBeLessThan(at05);
      expect(at09).toBeLessThan(at05);
    });

    it('should return 0 outside learning zone', () => {
      expect(calculateZPDScore({ pLearned: 0.05 })).toBe(0);
      expect(calculateZPDScore({ pLearned: 0.98 })).toBe(0);
    });
  });

  describe('shouldReview', () => {
    it('should flag mastery decay', () => {
      const masteredState = initializeBKT('test-skill');
      masteredState.pLearned = 0.96;
      masteredState.totalAttempts = 10;

      // After 60 days, P(L) should have decayed
      const result = shouldReview(masteredState, 60);
      expect(result.needsReview).toBe(true);
      expect(result.currentPLearned).toBeLessThan(0.96);
    });

    it('should not flag recently mastered skills', () => {
      const state = initializeBKT('test-skill');
      state.pLearned = 0.96;
      const result = shouldReview(state, 1);
      expect(result.needsReview).toBe(false);
    });
  });

  describe('prioritizeSkills', () => {
    it('returns skills sorted by priority (highest first)', () => {
      const states = new Map([
        ['s-mastered', { ...initializeBKT('s-mastered'), pLearned: 0.95, totalAttempts: 10 }],
        ['s-learning', { ...initializeBKT('s-learning'), pLearned: 0.55, totalAttempts: 5 }],
        ['s-cold', initializeBKT('s-cold')]
      ]);
      const r = prioritizeSkills(states);
      expect(Array.isArray(r)).toBe(true);
      expect(r).toHaveLength(3);
      // priorities should be descending
      for (let i = 1; i < r.length; i++) {
        expect(r[i - 1].priority).toBeGreaterThanOrEqual(r[i].priority);
      }
    });

    it('marks mastered skills via the "mastered" flag', () => {
      const states = new Map([
        ['s1', { ...initializeBKT('s1'), pLearned: 0.97 }]
      ]);
      const r = prioritizeSkills(states);
      expect(r[0].mastered).toBe(true);
    });

    it('respects prerequisites — unmet prereqs lower priority', () => {
      const masteredPrereq = new Map([
        ['prereq', { ...initializeBKT('prereq'), pLearned: 0.96 }],
        ['target', { ...initializeBKT('target'), pLearned: 0.5, totalAttempts: 3 }]
      ]);
      const r1 = prioritizeSkills(masteredPrereq, { prerequisites: { target: ['prereq'] } });
      const targetWithPrereq = r1.find(x => x.skillId === 'target');
      expect(targetWithPrereq.prereqsMet).toBe(true);

      const noPrereq = new Map([
        ['prereq', { ...initializeBKT('prereq'), pLearned: 0.2 }],
        ['target', { ...initializeBKT('target'), pLearned: 0.5, totalAttempts: 3 }]
      ]);
      const r2 = prioritizeSkills(noPrereq, { prerequisites: { target: ['prereq'] } });
      const targetWithoutPrereq = r2.find(x => x.skillId === 'target');
      expect(targetWithoutPrereq.prereqsMet).toBe(false);
    });

    it('applies temporal decay when daysSinceLastMap provided', () => {
      const states = new Map([
        ['s1', { ...initializeBKT('s1'), pLearned: 0.95, totalAttempts: 10 }]
      ]);
      const r = prioritizeSkills(states, { daysSinceLastMap: { s1: 60 } });
      expect(r[0].pLearned).toBeLessThan(0.95); // decay applied
    });
  });

  describe('getKnowledgeSummary', () => {
    it('counts mastered/learning/not-started buckets', () => {
      const states = new Map([
        ['m1', { ...initializeBKT('m1'), pLearned: 0.96 }],
        ['m2', { ...initializeBKT('m2'), pLearned: 0.97 }],
        ['l1', { ...initializeBKT('l1'), pLearned: 0.4, totalAttempts: 3 }],
        ['n1', initializeBKT('n1')]
      ]);
      const r = getKnowledgeSummary(states);
      expect(r.totalSkills).toBe(4);
      expect(r.masteredCount).toBe(2);
      expect(r.learningCount).toBe(1);
      expect(r.notStartedCount).toBe(1);
      expect(r.masteryRate).toBe(50);
      expect(r.averagePLearned).toBeGreaterThan(0);
    });

    it('handles empty input cleanly', () => {
      expect(getKnowledgeSummary(new Map())).toEqual({
        totalSkills: 0,
        masteredCount: 0,
        learningCount: 0,
        notStartedCount: 0,
        averagePLearned: 0,
        masteryRate: 0
      });
    });
  });
});
