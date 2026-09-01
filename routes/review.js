/**
 * SPACED REPETITION REVIEW ROUTES
 *
 * Endpoints for the spaced repetition system:
 * - GET  /api/review/due       — Get skills due for review
 * - GET  /api/review/stats     — Get review statistics
 * - POST /api/review/submit    — Submit a review answer and update schedule
 * - POST /api/review/skip      — Skip a review (reschedule for tomorrow)
 *
 * @module routes/review
 */

const express = require('express');
const { canonicalSkillId, skillLookupCandidates, expandSkillIds, matchSkillDoc } = require('../utils/skillCanonicalizer');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const Problem = require('../models/problem');
const Skill = require('../models/skill');
const {
  getSkillsDueForReview,
  processReviewAttempt,
  getReviewStats,
  assessQuality
} = require('../utils/spacedRepetition');
const { buildSmartQueue, getReviewSummary } = require('../utils/smartReviewQueue');
const { initializeCard, updateCard, rateAttempt } = require('../utils/fsrsScheduler');
const { resolveMasteryKey, getSkillMasteryEntry, setSkillMasteryEntry } = require('../utils/masteryGuard');
const logger = require('../utils/catLogger');
const { normalizeOptions } = require('../utils/mcOptions');

// ===========================================================================
// SMART REVIEW QUEUE (FSRS-driven)
// ===========================================================================

/**
 * GET /api/review/smart-queue
 *
 * Returns a cognitive-load-aware, FSRS-driven review queue.
 * Adapts session size based on student's recent cognitive load,
 * interleaves difficulty, and provides time estimates.
 *
 * Query params:
 *   max (number)       — max skills to return (default 10)
 *   lookahead (number) — include skills due within N days (default 1)
 */
router.get('/smart-queue', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const maxSkills = Math.min(parseInt(req.query.max) || 10, 20);
    const lookaheadDays = Math.min(parseInt(req.query.lookahead) || 1, 7);
    const includeProblems = req.query.includeProblems === 'true';

    const { queue, stats, sessionPlan } = buildSmartQueue(user, {
      maxSkills,
      lookaheadDays,
    });

    // Enrich queue with skill display names
    if (queue.length > 0) {
      const skillIds = queue.map(s => s.skillId);
      // Queue keys are mastery-side; the catalog is bank-keyed (id seam).
      const skills = await Skill.find({ skillId: { $in: expandSkillIds(skillIds) } }).lean();

      for (const item of queue) {
        const doc = matchSkillDoc(skills, item.skillId);
        item.displayName = doc?.displayName || item.skillId;
        item.category = doc?.category || 'unknown';
      }
    }

    // Attach problems: one for the top skill (legacy `problem` field), or one
    // per queue skill when includeProblems=true (lets the warm-up UI fetch the
    // whole session in a single round-trip). Skills with no bank problems keep
    // item.problem null — the client should skip them rather than dead-end.
    let problem = null;
    if (queue.length > 0) {
      const wanted = includeProblems ? queue.length : 1;
      const usedProblemIds = [];

      for (const item of queue.slice(0, wanted)) {
        const problemDoc = await findProblemForSkill(item.skillId, user, usedProblemIds);
        if (!problemDoc) continue;

        usedProblemIds.push(problemDoc.problemId);
        const payload = {
          problemId: problemDoc.problemId,
          prompt: problemDoc.prompt,
          svg: problemDoc.svg,
          answerType: problemDoc.answerType,
          // Same projection as /due below — never the stored array.
          options: normalizeOptions(problemDoc.options),
          difficulty: problemDoc.difficulty,
          skillId: item.skillId,
          skillName: item.displayName,
        };
        if (includeProblems) item.problem = payload;
        if (!problem) problem = payload;
      }
    }

    res.json({ queue, stats, sessionPlan, problem });
  } catch (err) {
    logger.error('Error building smart review queue:', err);
    res.status(500).json({ error: 'Failed to build review queue' });
  }
});

/**
 * GET /api/review/summary
 *
 * Quick review status — how many due, any urgent, when next is due.
 * Lightweight check for dashboard widgets.
 */
router.get('/summary', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const summary = getReviewSummary(user);
    res.json(summary);
  } catch (err) {
    logger.error('Error getting review summary:', err);
    res.status(500).json({ error: 'Failed to get review summary' });
  }
});

// ===========================================================================
// GET SKILLS DUE FOR REVIEW
// ===========================================================================

/**
 * GET /api/review/due
 *
 * Returns skills that are due for spaced repetition review,
 * along with a problem for the most urgent skill.
 *
 * Query params:
 *   count (number)  — max skills to return (default 5)
 *   lookahead (number) — include skills due within N days (default 0)
 */
router.get('/due', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const count = Math.min(parseInt(req.query.count) || 5, 20);
    const lookaheadDays = Math.min(parseInt(req.query.lookahead) || 0, 7);

    const dueSkills = getSkillsDueForReview(user.skillMastery, {
      maxCount: count,
      lookaheadDays
    });

    if (dueSkills.length === 0) {
      return res.json({
        due: [],
        nextReviewIn: getNextReviewDays(user.skillMastery),
        problem: null
      });
    }

    // Load skill display names
    const skillIds = dueSkills.map(s => s.skillId);
    // Same id seam as above: expand, then match per original id.
    const skills = await Skill.find({ skillId: { $in: expandSkillIds(skillIds) } }).lean();

    // Enrich with display names and categories
    const enrichedSkills = dueSkills.map(s => {
      const skillDoc = matchSkillDoc(skills, s.skillId);
      return {
        ...s,
        displayName: skillDoc?.displayName || s.skillId,
        category: skillDoc?.category || 'unknown',
        course: skillDoc?.course || 'unknown'
      };
    });

    // Find a problem for the most urgent skill
    const topSkill = enrichedSkills[0];
    const problem = await findProblemForSkill(topSkill.skillId, user, []);

    res.json({
      due: enrichedSkills,
      totalDue: enrichedSkills.length,
      problem: problem ? {
        problemId: problem.problemId,
        prompt: problem.prompt,
        svg: problem.svg,
        answerType: problem.answerType,
        // { label, text } only — the legacy banks carry `isCorrect` on every
        // option, and positional labels are what checkAnswer resolves against.
        options: normalizeOptions(problem.options),
        difficulty: problem.difficulty,
        skillId: topSkill.skillId,
        skillName: topSkill.displayName
      } : null
    });

  } catch (err) {
    logger.error('Error getting due reviews:', err);
    res.status(500).json({ error: 'Failed to get due reviews' });
  }
});

// ===========================================================================
// GET REVIEW STATISTICS
// ===========================================================================

/**
 * GET /api/review/stats
 *
 * Returns summary stats about the user's review schedule.
 */
router.get('/stats', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stats = getReviewStats(user.skillMastery);
    res.json(stats);

  } catch (err) {
    logger.error('Error getting review stats:', err);
    res.status(500).json({ error: 'Failed to get review stats' });
  }
});

// ===========================================================================
// SUBMIT REVIEW ANSWER
// ===========================================================================

/**
 * POST /api/review/submit
 *
 * Submit an answer to a review problem. Updates the spaced repetition
 * schedule based on performance.
 *
 * Body:
 *   skillId (string)         — The skill being reviewed
 *   problemId (string)       — The problem that was attempted
 *   userAnswer (string)      — The student's answer
 *   responseTimeMs (number)  — Time to answer in milliseconds
 *   hintUsed (boolean)       — Whether a hint was used
 */
router.post('/submit', isAuthenticated, async (req, res) => {
  try {
    const { skillId, problemId, userAnswer, responseTimeMs, hintUsed } = req.body;

    if (!skillId || !problemId || userAnswer === undefined) {
      return res.status(400).json({ error: 'skillId, problemId, and userAnswer are required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // resolve to the stored key (canonical unified id, or a legacy key if that's
    // where this user's historical entry lives) for a duplicate-free read/write
    const masteryKey = resolveMasteryKey(user, skillId);
    const skillData = getSkillMasteryEntry(user, masteryKey);
    if (!skillData) {
      return res.status(404).json({ error: 'Skill not found in mastery data' });
    }

    // Check the answer
    const problem = await Problem.findOne({ problemId, isActive: true });
    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    const correct = problem.checkAnswer(userAnswer);

    // Determine expected time based on difficulty
    const expectedTimeMs = getExpectedTime(problem.difficulty);

    // Process the review attempt
    const { updatedSchedule, quality, isLapse } = processReviewAttempt(
      skillData,
      {
        correct,
        responseTimeMs,
        expectedTimeMs,
        hintUsed: hintUsed || false
      }
    );

    // Update the skill's review schedule
    skillData.reviewSchedule = updatedSchedule;
    skillData.lastPracticed = new Date();

    // Handle lapses: downgrade to needs-review if this is a repeated failure
    if (isLapse && updatedSchedule.lapseCount >= 2) {
      skillData.status = 'needs-review';
    }

    // If answering correctly during needs-review, restore to mastered
    if (correct && skillData.status === 'needs-review' && quality >= 4) {
      skillData.status = 'mastered';
    }

    setSkillMasteryEntry(user, masteryKey, skillData);
    user.markModified('skillMastery');

    // Mirror the outcome into the FSRS card. The smart queue reads
    // learningEngines.fsrs — without this write a finished review never
    // leaves the queue, so the same skills get re-offered every session.
    syncFsrsCard(user, skillId, {
      correct,
      hintUsed: hintUsed || false,
      responseTime: responseTimeMs,
      expectedTime: expectedTimeMs,
    });

    await user.save();

    res.json({
      correct,
      quality,
      isLapse,
      nextReviewDate: updatedSchedule.nextReviewDate,
      interval: updatedSchedule.interval,
      easeFactor: updatedSchedule.easeFactor,
      repetitionCount: updatedSchedule.repetitionCount,
      correctAnswer: correct ? null : (problem.answer?.value ?? problem.correctOption)
    });

  } catch (err) {
    logger.error('Error submitting review:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// ===========================================================================
// SKIP REVIEW
// ===========================================================================

/**
 * POST /api/review/skip
 *
 * Skip a review. Reschedules it for tomorrow without penalty.
 * Limited to prevent indefinite avoidance.
 *
 * Body:
 *   skillId (string) — The skill to skip
 */
router.post('/skip', isAuthenticated, async (req, res) => {
  try {
    const { skillId } = req.body;

    if (!skillId) {
      return res.status(400).json({ error: 'skillId is required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const masteryKey = resolveMasteryKey(user, skillId);
    const skillData = getSkillMasteryEntry(user, masteryKey);
    if (!skillData?.reviewSchedule) {
      return res.status(404).json({ error: 'No review schedule for this skill' });
    }

    // Reschedule for tomorrow (no ease factor penalty)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    skillData.reviewSchedule.nextReviewDate = tomorrow;

    setSkillMasteryEntry(user, masteryKey, skillData);
    user.markModified('skillMastery');
    await user.save();

    res.json({
      skillId,
      nextReviewDate: tomorrow,
      message: 'Review rescheduled for tomorrow'
    });

  } catch (err) {
    logger.error('Error skipping review:', err);
    res.status(500).json({ error: 'Failed to skip review' });
  }
});

// ===========================================================================
// HELPERS
// ===========================================================================

/**
 * Find a practice problem for a mastery-side skill key.
 *
 * Queue/mastery keys may be canonical unified ids while the problem bank is
 * bank-keyed, so a direct findNearDifficulty(skillId) can miss real content.
 * Walk the candidate ids (canonical, raw, legacy, bank) until one hits.
 *
 * @param {string} skillId - Mastery-side skill id
 * @param {Object} user - User doc (for theta)
 * @param {string[]} excludeIds - problemIds already used this session
 * @returns {Promise<Object|null>} Problem doc or null
 */
async function findProblemForSkill(skillId, user, excludeIds) {
  const theta = user.learningProfile?.currentTheta || 0;
  // findNearDifficulty takes the 1-5 problem scale, not theta — convert here
  // rather than letting it guess (it used to, and read easy targets as hard).
  const difficulty = Problem.thetaToDifficulty(theta);
  for (const candidate of skillLookupCandidates(skillId)) {
    const doc = await Problem.findNearDifficulty(candidate, difficulty, excludeIds, { preferMultipleChoice: false });
    if (doc) return doc;
  }
  return null;
}

/**
 * Update the FSRS card for a reviewed skill.
 *
 * Cards are keyed canonical-first with a legacy-key fallback (matching the
 * pipeline's readEngine) — write back to the key the card lives under so
 * memory state never splits across two keys.
 *
 * @param {Object} user - Hydrated user doc
 * @param {string} skillId - Skill id as submitted by the client
 * @param {Object} attempt - { correct, hintUsed, responseTime, expectedTime }
 */
function syncFsrsCard(user, skillId, attempt) {
  if (!user.learningEngines) {
    user.learningEngines = { bkt: new Map(), fsrs: new Map(), consistency: new Map() };
  }
  const store = user.learningEngines.fsrs;
  const get = (k) => (typeof store?.get === 'function' ? store.get(k) : store?.[k]);

  const canon = canonicalSkillId(skillId) || skillId;
  const key = get(canon) != null ? canon
    : get(skillId) != null ? skillId
    : canon;

  const existing = get(key);
  const rating = rateAttempt(attempt);
  const card = existing ? updateCard(existing, rating) : initializeCard(rating);

  if (typeof store?.set === 'function') {
    store.set(key, card);
  } else {
    user.learningEngines.fsrs = { ...(store || {}), [key]: card };
  }
  user.markModified('learningEngines');
}

/**
 * Get expected response time based on problem difficulty
 * @param {number} difficulty - Problem difficulty (1-5)
 * @returns {number} Expected time in milliseconds
 */
function getExpectedTime(difficulty) {
  // Base times per difficulty level (in ms)
  const baseTimes = {
    1: 15000,   // 15s for easy
    2: 30000,   // 30s for medium-easy
    3: 60000,   // 60s for medium
    4: 90000,   // 90s for medium-hard
    5: 120000   // 120s for hard
  };
  return baseTimes[Math.round(difficulty)] || 60000;
}

/**
 * Find when the next review is scheduled across all skills
 * @param {Map} skillMastery
 * @returns {number|null} Days until next review, or null if none scheduled
 */
function getNextReviewDays(skillMastery) {
  const now = new Date();
  let earliest = null;

  for (const [, data] of skillMastery.entries()) {
    if (!data.reviewSchedule?.nextReviewDate) continue;
    const nextReview = new Date(data.reviewSchedule.nextReviewDate);
    if (!earliest || nextReview < earliest) {
      earliest = nextReview;
    }
  }

  if (!earliest) return null;
  return Math.max(0, Math.ceil((earliest - now) / (1000 * 60 * 60 * 24)));
}

module.exports = router;
