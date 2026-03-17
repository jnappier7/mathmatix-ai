/**
 * Spaced Repetition (SM-2) Unit Tests
 *
 * Tests the core SM-2 algorithm functions that power skill review scheduling.
 * These are critical — incorrect intervals lead to under/over-reviewing.
 */

const {
  calculateNextReview,
  assessQuality,
  initializeReviewSchedule,
  getSkillsDueForReview,
  processReviewAttempt,
  getReviewStats,
  QUALITY_THRESHOLDS,
  DEFAULTS
} = require('../../utils/spacedRepetition');

// ===========================================================================
// SM-2 CORE: calculateNextReview
// ===========================================================================

describe('calculateNextReview', () => {

  test('first successful review sets interval to 1 day', () => {
    const result = calculateNextReview({}, 4);
    expect(result.interval).toBe(DEFAULTS.INITIAL_INTERVAL);
    expect(result.repetitionCount).toBe(1);
  });

  test('second successful review sets interval to 3 days', () => {
    const result = calculateNextReview({ repetitionCount: 1, interval: 1, easeFactor: 2.5 }, 4);
    expect(result.interval).toBe(DEFAULTS.SECOND_INTERVAL);
    expect(result.repetitionCount).toBe(2);
  });

  test('third+ review multiplies interval by ease factor', () => {
    const result = calculateNextReview({ repetitionCount: 2, interval: 3, easeFactor: 2.5 }, 4);
    // 3 * 2.5 = 7.5, rounded to 8
    expect(result.interval).toBe(8);
    expect(result.repetitionCount).toBe(3);
  });

  test('perfect quality (5) increases ease factor', () => {
    const result = calculateNextReview({ easeFactor: 2.5 }, 5);
    expect(result.easeFactor).toBeGreaterThan(2.5);
  });

  test('quality 3 (acceptable) decreases ease factor', () => {
    const result = calculateNextReview({ easeFactor: 2.5 }, 3);
    expect(result.easeFactor).toBeLessThan(2.5);
  });

  test('failed review (quality < 3) resets repetition count', () => {
    const result = calculateNextReview({ repetitionCount: 5, interval: 30, easeFactor: 2.5 }, 2);
    expect(result.repetitionCount).toBe(0);
    expect(result.interval).toBe(DEFAULTS.LAPSE_INTERVAL);
  });

  test('failed review increments lapse count', () => {
    const result = calculateNextReview({ lapseCount: 1, easeFactor: 2.5 }, 1);
    expect(result.lapseCount).toBe(2);
  });

  test('ease factor never drops below minimum', () => {
    // Repeated failures
    let schedule = { easeFactor: 1.4, repetitionCount: 0 };
    const result = calculateNextReview(schedule, 0);
    expect(result.easeFactor).toBe(DEFAULTS.MIN_EASE_FACTOR);
  });

  test('interval capped at MAX_INTERVAL', () => {
    const result = calculateNextReview({ repetitionCount: 10, interval: 100, easeFactor: 2.5 }, 5);
    expect(result.interval).toBeLessThanOrEqual(DEFAULTS.MAX_INTERVAL);
  });

  test('sets nextReviewDate in the future', () => {
    const now = Date.now();
    const result = calculateNextReview({}, 4);
    expect(result.nextReviewDate.getTime()).toBeGreaterThan(now);
  });

  test('sets lastReviewDate to now', () => {
    const before = Date.now();
    const result = calculateNextReview({}, 4);
    expect(result.lastReviewDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.lastReviewDate.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

// ===========================================================================
// QUALITY ASSESSMENT
// ===========================================================================

describe('assessQuality', () => {

  test('incorrect with no understanding = 0 (blackout)', () => {
    expect(assessQuality({ correct: false })).toBe(0);
  });

  test('incorrect with partial credit = 1 (poor)', () => {
    expect(assessQuality({ correct: false, partialCredit: true })).toBe(1);
  });

  test('correct with hint = 2 (difficult)', () => {
    expect(assessQuality({ correct: true, hintUsed: true })).toBe(2);
  });

  test('correct with retry = 2 (difficult)', () => {
    expect(assessQuality({ correct: true, isRetry: true })).toBe(2);
  });

  test('correct, fast response = 5 (perfect)', () => {
    expect(assessQuality({
      correct: true,
      responseTimeMs: 5000,
      expectedTimeMs: 10000
    })).toBe(5);
  });

  test('correct, normal response = 4 (good)', () => {
    expect(assessQuality({
      correct: true,
      responseTimeMs: 10000,
      expectedTimeMs: 10000
    })).toBe(4);
  });

  test('correct, slow response = 3 (acceptable)', () => {
    expect(assessQuality({
      correct: true,
      responseTimeMs: 20000,
      expectedTimeMs: 10000
    })).toBe(3);
  });

  test('correct with no timing data = 4 (good)', () => {
    expect(assessQuality({ correct: true })).toBe(4);
  });
});

// ===========================================================================
// INITIALIZATION
// ===========================================================================

describe('initializeReviewSchedule', () => {

  test('creates schedule with default ease factor', () => {
    const schedule = initializeReviewSchedule();
    expect(schedule.easeFactor).toBe(DEFAULTS.INITIAL_EASE_FACTOR);
  });

  test('sets first review for 1 day later', () => {
    const now = new Date();
    const schedule = initializeReviewSchedule(now);
    const diffDays = (schedule.nextReviewDate - now) / (1000 * 60 * 60 * 24);
    expect(Math.round(diffDays)).toBe(DEFAULTS.INITIAL_INTERVAL);
  });

  test('starts with 0 repetitions and lapses', () => {
    const schedule = initializeReviewSchedule();
    expect(schedule.repetitionCount).toBe(0);
    expect(schedule.lapseCount).toBe(0);
  });

  test('starts with empty review history', () => {
    const schedule = initializeReviewSchedule();
    expect(schedule.reviewHistory).toEqual([]);
  });
});

// ===========================================================================
// DUE SKILL SELECTION
// ===========================================================================

describe('getSkillsDueForReview', () => {

  function makeMasteryMap(entries) {
    const map = new Map();
    for (const [skillId, data] of entries) {
      map.set(skillId, data);
    }
    return map;
  }

  test('returns empty array when no skills have review schedules', () => {
    const mastery = makeMasteryMap([
      ['add-fractions', { status: 'mastered' }]
    ]);
    const result = getSkillsDueForReview(mastery);
    expect(result).toEqual([]);
  });

  test('returns skills past their review date', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const mastery = makeMasteryMap([
      ['add-fractions', {
        status: 'mastered',
        reviewSchedule: { nextReviewDate: yesterday, interval: 3, easeFactor: 2.5, repetitionCount: 2, lapseCount: 0 }
      }]
    ]);

    const result = getSkillsDueForReview(mastery);
    expect(result).toHaveLength(1);
    expect(result[0].skillId).toBe('add-fractions');
    expect(result[0].daysOverdue).toBeGreaterThanOrEqual(1);
  });

  test('excludes skills not yet due', () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const mastery = makeMasteryMap([
      ['add-fractions', {
        status: 'mastered',
        reviewSchedule: { nextReviewDate: nextWeek, interval: 7, easeFactor: 2.5, repetitionCount: 3 }
      }]
    ]);

    const result = getSkillsDueForReview(mastery);
    expect(result).toHaveLength(0);
  });

  test('includes upcoming skills with lookahead', () => {
    const in3days = new Date();
    in3days.setDate(in3days.getDate() + 3);

    const mastery = makeMasteryMap([
      ['add-fractions', {
        status: 'mastered',
        reviewSchedule: { nextReviewDate: in3days, interval: 7, easeFactor: 2.5, repetitionCount: 3 }
      }]
    ]);

    const result = getSkillsDueForReview(mastery, { lookaheadDays: 5 });
    expect(result).toHaveLength(1);
  });

  test('excludes non-mastered skills', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const mastery = makeMasteryMap([
      ['add-fractions', {
        status: 'learning',
        reviewSchedule: { nextReviewDate: yesterday, interval: 3, easeFactor: 2.5 }
      }]
    ]);

    const result = getSkillsDueForReview(mastery);
    expect(result).toHaveLength(0);
  });

  test('includes needs-review skills', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const mastery = makeMasteryMap([
      ['add-fractions', {
        status: 'needs-review',
        reviewSchedule: { nextReviewDate: yesterday, interval: 1, easeFactor: 1.5, lapseCount: 2, repetitionCount: 0 }
      }]
    ]);

    const result = getSkillsDueForReview(mastery);
    expect(result).toHaveLength(1);
  });

  test('sorts by urgency (most overdue first)', () => {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const mastery = makeMasteryMap([
      ['skill-a', {
        status: 'mastered',
        reviewSchedule: { nextReviewDate: yesterday, interval: 7, easeFactor: 2.5, repetitionCount: 3 }
      }],
      ['skill-b', {
        status: 'mastered',
        reviewSchedule: { nextReviewDate: twoDaysAgo, interval: 3, easeFactor: 2.0, repetitionCount: 1 }
      }]
    ]);

    const result = getSkillsDueForReview(mastery);
    expect(result[0].skillId).toBe('skill-b');  // More overdue
  });

  test('respects maxCount', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const entries = [];
    for (let i = 0; i < 10; i++) {
      entries.push([`skill-${i}`, {
        status: 'mastered',
        reviewSchedule: { nextReviewDate: yesterday, interval: 3, easeFactor: 2.5, repetitionCount: 2 }
      }]);
    }

    const mastery = makeMasteryMap(entries);
    const result = getSkillsDueForReview(mastery, { maxCount: 3 });
    expect(result).toHaveLength(3);
  });
});

// ===========================================================================
// PROCESS REVIEW ATTEMPT
// ===========================================================================

describe('processReviewAttempt', () => {

  test('successful review advances schedule', () => {
    const skillData = {
      reviewSchedule: {
        easeFactor: 2.5,
        interval: 3,
        repetitionCount: 2,
        lapseCount: 0,
        reviewHistory: []
      }
    };

    const { updatedSchedule, quality, isLapse } = processReviewAttempt(skillData, {
      correct: true,
      responseTimeMs: 8000,
      expectedTimeMs: 10000
    });

    expect(isLapse).toBe(false);
    expect(quality).toBeGreaterThanOrEqual(3);
    expect(updatedSchedule.interval).toBeGreaterThan(3);
    expect(updatedSchedule.repetitionCount).toBe(3);
  });

  test('failed review marks as lapse', () => {
    const skillData = {
      reviewSchedule: {
        easeFactor: 2.5,
        interval: 14,
        repetitionCount: 5,
        lapseCount: 0,
        reviewHistory: []
      }
    };

    const { updatedSchedule, quality, isLapse } = processReviewAttempt(skillData, {
      correct: false
    });

    expect(isLapse).toBe(true);
    expect(quality).toBeLessThan(3);
    expect(updatedSchedule.interval).toBe(1);
    expect(updatedSchedule.repetitionCount).toBe(0);
    expect(updatedSchedule.lapseCount).toBe(1);
  });

  test('appends to review history (max 20)', () => {
    const history = Array.from({ length: 25 }, (_, i) => ({
      date: new Date(),
      quality: 4,
      interval: i + 1,
      correct: true
    }));

    const skillData = {
      reviewSchedule: {
        easeFactor: 2.5,
        interval: 7,
        repetitionCount: 3,
        reviewHistory: history
      }
    };

    const { updatedSchedule } = processReviewAttempt(skillData, { correct: true });
    expect(updatedSchedule.reviewHistory).toHaveLength(20);
  });
});

// ===========================================================================
// REVIEW STATS
// ===========================================================================

describe('getReviewStats', () => {

  function makeMasteryMap(entries) {
    const map = new Map();
    for (const [skillId, data] of entries) {
      map.set(skillId, data);
    }
    return map;
  }

  test('returns zero stats for empty mastery', () => {
    const stats = getReviewStats(new Map());
    expect(stats.totalScheduled).toBe(0);
    expect(stats.dueNow).toBe(0);
    expect(stats.dueToday).toBe(0);
    expect(stats.dueThisWeek).toBe(0);
  });

  test('counts due skills correctly', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const in3days = new Date();
    in3days.setDate(in3days.getDate() + 3);
    const in10days = new Date();
    in10days.setDate(in10days.getDate() + 10);

    const mastery = makeMasteryMap([
      ['skill-a', {
        status: 'mastered',
        reviewSchedule: { nextReviewDate: yesterday, easeFactor: 2.5, lapseCount: 0 }
      }],
      ['skill-b', {
        status: 'mastered',
        reviewSchedule: { nextReviewDate: in3days, easeFactor: 2.5, lapseCount: 0 }
      }],
      ['skill-c', {
        status: 'mastered',
        reviewSchedule: { nextReviewDate: in10days, easeFactor: 2.5, lapseCount: 0 }
      }]
    ]);

    const stats = getReviewStats(mastery);
    expect(stats.totalScheduled).toBe(3);
    expect(stats.dueNow).toBe(1);
    expect(stats.dueThisWeek).toBe(2);
  });
});

// ===========================================================================
// SM-2 INTERVAL PROGRESSION (Integration)
// ===========================================================================

describe('SM-2 interval progression', () => {

  test('perfect recall sequence: 1 → 3 → 8 → 20 → 50+ days', () => {
    let schedule = {};

    // Review 1: Perfect
    schedule = calculateNextReview(schedule, 5);
    expect(schedule.interval).toBe(1);

    // Review 2: Perfect
    schedule = calculateNextReview(schedule, 5);
    expect(schedule.interval).toBe(3);

    // Review 3: Perfect
    schedule = calculateNextReview(schedule, 5);
    expect(schedule.interval).toBeGreaterThanOrEqual(7);

    // Review 4: Perfect
    schedule = calculateNextReview(schedule, 5);
    expect(schedule.interval).toBeGreaterThanOrEqual(18);

    // Review 5: Perfect
    schedule = calculateNextReview(schedule, 5);
    expect(schedule.interval).toBeGreaterThanOrEqual(45);
  });

  test('mediocre recall keeps intervals shorter', () => {
    let schedule = {};

    // All quality 3 (acceptable)
    for (let i = 0; i < 5; i++) {
      schedule = calculateNextReview(schedule, 3);
    }

    // Should have shorter intervals than perfect recall
    expect(schedule.interval).toBeLessThan(30);
    expect(schedule.easeFactor).toBeLessThan(DEFAULTS.INITIAL_EASE_FACTOR);
  });

  test('lapse resets and gradually rebuilds', () => {
    let schedule = { repetitionCount: 5, interval: 30, easeFactor: 2.5, lapseCount: 0 };

    // Lapse (forgot)
    schedule = calculateNextReview(schedule, 1);
    expect(schedule.interval).toBe(1);
    expect(schedule.repetitionCount).toBe(0);
    expect(schedule.lapseCount).toBe(1);

    // Rebuild
    schedule = calculateNextReview(schedule, 4);
    expect(schedule.interval).toBe(1);  // First review after reset

    schedule = calculateNextReview(schedule, 4);
    expect(schedule.interval).toBe(3);  // Second review
  });
});
