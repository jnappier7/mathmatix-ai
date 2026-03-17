// utils/spacedRepetition.js
// Spaced Repetition Engine — SM-2 algorithm adapted for math skill retention
//
// Based on the SuperMemo SM-2 algorithm by Piotr Wozniak, with adjustments:
// - Quality scale mapped to math performance signals (not just self-report)
// - Minimum interval of 1 day (students need sleep for consolidation)
// - Lapse handling: skills that are forgotten get shorter intervals
// - Prerequisite-aware priority: foundational skills get reviewed first

/**
 * SM-2 quality scale mapped to math tutoring signals:
 *
 *   5 — Perfect: Correct answer, fast, no hesitation
 *   4 — Good: Correct answer, reasonable time, minor hesitation
 *   3 — Acceptable: Correct but slow, or needed a small nudge
 *   2 — Difficult: Correct after a hint, or barely correct
 *   1 — Poor: Incorrect, but showed partial understanding
 *   0 — Blackout: Incorrect, no understanding shown
 */

const QUALITY_THRESHOLDS = {
  PERFECT: 5,
  GOOD: 4,
  ACCEPTABLE: 3,
  PASS_MINIMUM: 3,  // Quality >= 3 counts as "recalled"
  DIFFICULT: 2,
  POOR: 1,
  BLACKOUT: 0
};

const DEFAULTS = {
  INITIAL_EASE_FACTOR: 2.5,
  MIN_EASE_FACTOR: 1.3,
  INITIAL_INTERVAL: 1,       // 1 day after first successful review
  SECOND_INTERVAL: 3,        // 3 days after second successful review
  MAX_INTERVAL: 180,         // Cap at 6 months (school year)
  LAPSE_INTERVAL: 1,         // Reset to 1 day after a lapse
  LAPSE_EASE_PENALTY: 0.20   // Reduce ease factor by 0.20 on lapse
};

/**
 * Calculate the next review schedule using SM-2 algorithm
 *
 * @param {Object} currentSchedule - Current review schedule from user.skillMastery
 * @param {number} quality - Review quality (0-5)
 * @returns {Object} Updated schedule fields
 */
function calculateNextReview(currentSchedule = {}, quality) {
  const {
    easeFactor = DEFAULTS.INITIAL_EASE_FACTOR,
    interval = 0,
    repetitionCount = 0,
    lapseCount = 0
  } = currentSchedule;

  const now = new Date();
  let newEaseFactor = easeFactor;
  let newInterval;
  let newRepetitionCount;
  let newLapseCount = lapseCount;

  if (quality >= QUALITY_THRESHOLDS.PASS_MINIMUM) {
    // ── Successful recall ──
    if (repetitionCount === 0) {
      newInterval = DEFAULTS.INITIAL_INTERVAL;
    } else if (repetitionCount === 1) {
      newInterval = DEFAULTS.SECOND_INTERVAL;
    } else {
      newInterval = Math.round(interval * easeFactor);
    }

    newRepetitionCount = repetitionCount + 1;

    // Update ease factor using SM-2 formula:
    // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  } else {
    // ── Failed recall (lapse) ──
    newRepetitionCount = 0;
    newInterval = DEFAULTS.LAPSE_INTERVAL;
    newLapseCount = lapseCount + 1;

    // Penalize ease factor on lapse (makes future intervals shorter)
    newEaseFactor = easeFactor - DEFAULTS.LAPSE_EASE_PENALTY;
  }

  // Clamp ease factor
  newEaseFactor = Math.max(DEFAULTS.MIN_EASE_FACTOR, newEaseFactor);

  // Clamp interval
  newInterval = Math.min(newInterval, DEFAULTS.MAX_INTERVAL);
  newInterval = Math.max(1, newInterval);

  // Calculate next review date
  const nextReviewDate = new Date(now);
  nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

  return {
    easeFactor: Math.round(newEaseFactor * 100) / 100,
    interval: newInterval,
    repetitionCount: newRepetitionCount,
    nextReviewDate,
    lastReviewDate: now,
    lastReviewQuality: quality,
    lapseCount: newLapseCount
  };
}

/**
 * Determine review quality (0-5) from math problem attempt data
 *
 * Maps observable signals to SM-2 quality scale without LLM involvement:
 * - Correctness (primary signal)
 * - Response time vs expected time
 * - Whether hints were used
 * - Whether it was a retry after error
 *
 * @param {Object} attemptData
 * @param {boolean} attemptData.correct - Was the answer correct?
 * @param {number} [attemptData.responseTimeMs] - Time to answer in ms
 * @param {number} [attemptData.expectedTimeMs] - Expected time for this difficulty
 * @param {boolean} [attemptData.hintUsed] - Was a hint requested?
 * @param {boolean} [attemptData.isRetry] - Was this a second attempt?
 * @param {boolean} [attemptData.partialCredit] - Showed partial understanding?
 * @returns {number} Quality rating 0-5
 */
function assessQuality(attemptData) {
  const {
    correct,
    responseTimeMs,
    expectedTimeMs,
    hintUsed = false,
    isRetry = false,
    partialCredit = false
  } = attemptData;

  if (!correct) {
    // Incorrect answers: 0-2
    if (partialCredit) return QUALITY_THRESHOLDS.POOR;       // 1: showed some understanding
    return QUALITY_THRESHOLDS.BLACKOUT;                       // 0: no understanding
  }

  // Correct answers: 2-5
  if (hintUsed || isRetry) {
    return QUALITY_THRESHOLDS.DIFFICULT;  // 2: needed help
  }

  // Check response time if available
  if (responseTimeMs && expectedTimeMs) {
    const timeRatio = responseTimeMs / expectedTimeMs;

    if (timeRatio <= 0.7) {
      return QUALITY_THRESHOLDS.PERFECT;     // 5: fast and correct
    } else if (timeRatio <= 1.2) {
      return QUALITY_THRESHOLDS.GOOD;        // 4: reasonable time
    } else {
      return QUALITY_THRESHOLDS.ACCEPTABLE;  // 3: slow but correct
    }
  }

  // No timing data — default to GOOD for correct without hints
  return QUALITY_THRESHOLDS.GOOD;
}

/**
 * Initialize review schedule for a newly mastered skill
 *
 * Called when a skill transitions to 'mastered' status.
 * Sets the first review for 1 day later.
 *
 * @param {Date} [masteredDate] - When the skill was mastered
 * @returns {Object} Initial review schedule
 */
function initializeReviewSchedule(masteredDate) {
  const now = masteredDate || new Date();
  const firstReview = new Date(now);
  firstReview.setDate(firstReview.getDate() + DEFAULTS.INITIAL_INTERVAL);

  return {
    easeFactor: DEFAULTS.INITIAL_EASE_FACTOR,
    interval: DEFAULTS.INITIAL_INTERVAL,
    repetitionCount: 0,
    nextReviewDate: firstReview,
    lastReviewDate: now,
    lastReviewQuality: null,
    lapseCount: 0,
    reviewHistory: []
  };
}

/**
 * Get all skills due for review from a user's skillMastery map
 *
 * @param {Map} skillMastery - User's skillMastery map
 * @param {Object} [options]
 * @param {number} [options.maxCount=5] - Maximum skills to return
 * @param {boolean} [options.includeOverdue=true] - Include skills past due date
 * @param {number} [options.lookaheadDays=0] - Include skills due within N days
 * @returns {Array<Object>} Skills due for review, sorted by urgency
 */
function getSkillsDueForReview(skillMastery, options = {}) {
  const {
    maxCount = 5,
    includeOverdue = true,
    lookaheadDays = 0
  } = options;

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + lookaheadDays);

  const dueSkills = [];

  for (const [skillId, data] of skillMastery.entries()) {
    // Only review mastered or needs-review skills that have a schedule
    if (!data.reviewSchedule?.nextReviewDate) continue;
    if (data.status !== 'mastered' && data.status !== 'needs-review' && data.status !== 're-fragile') continue;

    const nextReview = new Date(data.reviewSchedule.nextReviewDate);

    if (nextReview <= cutoff) {
      const daysOverdue = Math.max(0, Math.floor((now - nextReview) / (1000 * 60 * 60 * 24)));

      dueSkills.push({
        skillId,
        status: data.status,
        nextReviewDate: nextReview,
        daysOverdue,
        interval: data.reviewSchedule.interval,
        easeFactor: data.reviewSchedule.easeFactor,
        repetitionCount: data.reviewSchedule.repetitionCount,
        lapseCount: data.reviewSchedule.lapseCount || 0,
        lastReviewQuality: data.reviewSchedule.lastReviewQuality,
        // Priority: overdue skills first, then by interval (shorter = more fragile)
        urgency: daysOverdue * 10 + (1 / (data.reviewSchedule.interval || 1))
      });
    }
  }

  // Sort by urgency (highest first)
  dueSkills.sort((a, b) => b.urgency - a.urgency);

  return dueSkills.slice(0, maxCount);
}

/**
 * Process a review attempt and update the skill's review schedule
 *
 * @param {Object} skillData - The skill's mastery data (from skillMastery map)
 * @param {Object} attemptData - Problem attempt data
 * @returns {Object} { updatedSchedule, quality, isLapse }
 */
function processReviewAttempt(skillData, attemptData) {
  const quality = assessQuality(attemptData);
  const currentSchedule = skillData.reviewSchedule || {};
  const updatedSchedule = calculateNextReview(currentSchedule, quality);
  const isLapse = quality < QUALITY_THRESHOLDS.PASS_MINIMUM;

  // Append to review history (keep last 20)
  const historyEntry = {
    date: new Date(),
    quality,
    interval: currentSchedule.interval || 0,
    correct: attemptData.correct
  };

  updatedSchedule.reviewHistory = [
    ...(currentSchedule.reviewHistory || []).slice(-19),
    historyEntry
  ];

  return {
    updatedSchedule,
    quality,
    isLapse
  };
}

/**
 * Get review statistics for a user
 *
 * @param {Map} skillMastery - User's skillMastery map
 * @returns {Object} Review stats summary
 */
function getReviewStats(skillMastery) {
  let totalScheduled = 0;
  let dueNow = 0;
  let dueToday = 0;
  let dueThisWeek = 0;
  let totalLapses = 0;
  let averageEase = 0;

  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  for (const [, data] of skillMastery.entries()) {
    if (!data.reviewSchedule?.nextReviewDate) continue;
    if (data.status !== 'mastered' && data.status !== 'needs-review' && data.status !== 're-fragile') continue;

    totalScheduled++;
    const nextReview = new Date(data.reviewSchedule.nextReviewDate);
    averageEase += data.reviewSchedule.easeFactor || DEFAULTS.INITIAL_EASE_FACTOR;
    totalLapses += data.reviewSchedule.lapseCount || 0;

    if (nextReview <= now) dueNow++;
    if (nextReview <= endOfDay) dueToday++;
    if (nextReview <= endOfWeek) dueThisWeek++;
  }

  return {
    totalScheduled,
    dueNow,
    dueToday,
    dueThisWeek,
    totalLapses,
    averageEase: totalScheduled > 0
      ? Math.round((averageEase / totalScheduled) * 100) / 100
      : DEFAULTS.INITIAL_EASE_FACTOR
  };
}

module.exports = {
  calculateNextReview,
  assessQuality,
  initializeReviewSchedule,
  getSkillsDueForReview,
  processReviewAttempt,
  getReviewStats,
  QUALITY_THRESHOLDS,
  DEFAULTS
};
