/**
 * Tests for FSRS Spaced Repetition Scheduler
 */
const {
  calculateRetrievability,
  calculateOptimalInterval,
  initializeCard,
  updateCard,
  rateAttempt,
  getSkillsDueForReview,
  calculateRetentionStats,
  RATINGS,
  DEFAULT_PARAMS,
} = require('../../utils/fsrsScheduler');

describe('FSRS Scheduler', () => {

  describe('calculateRetrievability', () => {
    it('should return 1 when elapsed time is 0', () => {
      expect(calculateRetrievability(0, 5)).toBe(1);
    });

    it('should return ~0.9 at the stability point', () => {
      // At t = 9*S*(0.9^(-1) - 1) ≈ S days, R ≈ 0.9
      const stability = 10;
      const interval = calculateOptimalInterval(stability, 0.9);
      const r = calculateRetrievability(interval, stability);
      expect(r).toBeCloseTo(0.9, 1);
    });

    it('should decrease over time', () => {
      const stability = 5;
      const r1 = calculateRetrievability(1, stability);
      const r5 = calculateRetrievability(5, stability);
      const r30 = calculateRetrievability(30, stability);
      expect(r1).toBeGreaterThan(r5);
      expect(r5).toBeGreaterThan(r30);
    });

    it('should return 0 for invalid inputs', () => {
      expect(calculateRetrievability(5, 0)).toBe(0);
      expect(calculateRetrievability(5, -1)).toBe(0);
      expect(calculateRetrievability(-1, 5)).toBe(0);
    });
  });

  describe('calculateOptimalInterval', () => {
    it('should return a positive interval for positive stability', () => {
      const interval = calculateOptimalInterval(5);
      expect(interval).toBeGreaterThan(0);
    });

    it('should return longer intervals for higher stability', () => {
      const i1 = calculateOptimalInterval(1);
      const i10 = calculateOptimalInterval(10);
      const i50 = calculateOptimalInterval(50);
      expect(i1).toBeLessThan(i10);
      expect(i10).toBeLessThan(i50);
    });

    it('should clamp to valid range', () => {
      expect(calculateOptimalInterval(0)).toBe(0);
      expect(calculateOptimalInterval(1000)).toBeLessThanOrEqual(365);
      expect(calculateOptimalInterval(0.01)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('initializeCard', () => {
    it('should initialize with correct stability for each rating', () => {
      const again = initializeCard(RATINGS.AGAIN);
      const good = initializeCard(RATINGS.GOOD);
      const easy = initializeCard(RATINGS.EASY);

      expect(again.stability).toBeLessThan(good.stability);
      expect(good.stability).toBeLessThan(easy.stability);
    });

    it('should set initial difficulty', () => {
      const card = initializeCard(RATINGS.GOOD);
      expect(card.difficulty).toBeGreaterThan(0);
      expect(card.difficulty).toBeLessThanOrEqual(10);
    });

    it('should track lapses for AGAIN rating', () => {
      const again = initializeCard(RATINGS.AGAIN);
      const good = initializeCard(RATINGS.GOOD);
      expect(again.lapses).toBe(1);
      expect(good.lapses).toBe(0);
    });
  });

  describe('updateCard', () => {
    it('should increase stability on successful recall', () => {
      const card = initializeCard(RATINGS.GOOD);
      const updated = updateCard(card, RATINGS.GOOD, 3);
      expect(updated.stability).toBeGreaterThan(card.stability);
    });

    it('should decrease stability on failed recall', () => {
      const card = initializeCard(RATINGS.GOOD);
      // Simulate some time passing
      const updated = updateCard(card, RATINGS.AGAIN, 5);
      expect(updated.stability).toBeLessThan(card.stability);
    });

    it('should track reps correctly', () => {
      let card = initializeCard(RATINGS.GOOD);
      expect(card.reps).toBe(1);
      card = updateCard(card, RATINGS.GOOD, 2);
      expect(card.reps).toBe(2);
      card = updateCard(card, RATINGS.GOOD, 5);
      expect(card.reps).toBe(3);
    });

    it('should transition states correctly', () => {
      let card = initializeCard(RATINGS.GOOD);
      card = updateCard(card, RATINGS.GOOD, 2);
      expect(card.state).toBe('review');

      // Fail — goes to relearning
      card = updateCard(card, RATINGS.AGAIN, 5);
      expect(card.state).toBe('relearning');
    });
  });

  describe('rateAttempt', () => {
    it('should rate incorrect as AGAIN', () => {
      expect(rateAttempt({ correct: false })).toBe(RATINGS.AGAIN);
    });

    it('should rate hint-assisted as HARD', () => {
      expect(rateAttempt({ correct: true, hintUsed: true })).toBe(RATINGS.HARD);
    });

    it('should rate normal correct as GOOD', () => {
      expect(rateAttempt({ correct: true })).toBe(RATINGS.GOOD);
    });

    it('should rate fast + consistent as EASY', () => {
      expect(rateAttempt({
        correct: true,
        responseTime: 2,
        expectedTime: 5,
        consecutiveCorrect: 3,
      })).toBe(RATINGS.EASY);
    });
  });

  describe('getSkillsDueForReview', () => {
    it('should return due skills sorted by urgency', () => {
      const skillMemory = new Map();

      // Overdue skill
      skillMemory.set('skill-1', {
        stability: 2,
        scheduledDays: 3,
        lastReview: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      });

      // Not yet due
      skillMemory.set('skill-2', {
        stability: 30,
        scheduledDays: 30,
        lastReview: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      });

      const due = getSkillsDueForReview(skillMemory);
      expect(due.length).toBe(1);
      expect(due[0].skillId).toBe('skill-1');
      expect(due[0].urgency).toBeGreaterThan(0);
    });
  });

  describe('calculateRetentionStats', () => {
    it('should calculate correct statistics', () => {
      const skillMemory = new Map();

      skillMemory.set('skill-1', {
        stability: 10,
        difficulty: 3,
        scheduledDays: 10,
        lastReview: new Date(),
        state: 'review',
      });

      skillMemory.set('skill-2', {
        stability: 5,
        difficulty: 7,
        scheduledDays: 5,
        lastReview: new Date(),
        state: 'learning',
      });

      const stats = calculateRetentionStats(skillMemory);
      expect(stats.totalSkills).toBe(2);
      expect(stats.averageStability).toBeGreaterThan(0);
      expect(stats.stateDistribution.review).toBe(1);
      expect(stats.stateDistribution.learning).toBe(1);
    });
  });
});
