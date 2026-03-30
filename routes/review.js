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
const logger = require('../utils/catLogger');

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

    const { queue, stats, sessionPlan } = buildSmartQueue(user, {
      maxSkills,
      lookaheadDays,
    });

    // Enrich queue with skill display names
    if (queue.length > 0) {
      const skillIds = queue.map(s => s.skillId);
      const skills = await Skill.find({ skillId: { $in: skillIds } }).lean();
      const skillMap = new Map(skills.map(s => [s.skillId, s]));

      for (const item of queue) {
        const doc = skillMap.get(item.skillId);
        item.displayName = doc?.displayName || item.skillId;
        item.category = doc?.category || 'unknown';
      }
    }

    // Find a problem for the first skill in the queue
    let problem = null;
    if (queue.length > 0) {
      const topSkill = queue[0];
      const problemDoc = await Problem.findNearDifficulty(
        topSkill.skillId,
        user.learningProfile?.currentTheta || 0,
        [],
        { preferMultipleChoice: false }
      );

      if (problemDoc) {
        problem = {
          problemId: problemDoc.problemId,
          prompt: problemDoc.prompt,
          svg: problemDoc.svg,
          answerType: problemDoc.answerType,
          options: problemDoc.options,
          difficulty: problemDoc.difficulty,
          skillId: topSkill.skillId,
          skillName: topSkill.displayName,
        };
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
    const skills = await Skill.find({ skillId: { $in: skillIds } }).lean();
    const skillMap = new Map(skills.map(s => [s.skillId, s]));

    // Enrich with display names and categories
    const enrichedSkills = dueSkills.map(s => {
      const skillDoc = skillMap.get(s.skillId);
      return {
        ...s,
        displayName: skillDoc?.displayName || s.skillId,
        category: skillDoc?.category || 'unknown',
        course: skillDoc?.course || 'unknown'
      };
    });

    // Find a problem for the most urgent skill
    const topSkill = enrichedSkills[0];
    const problem = await Problem.findNearDifficulty(
      topSkill.skillId,
      user.learningProfile?.currentTheta || 0,
      [], // no exclusions for reviews
      { preferMultipleChoice: false }
    );

    res.json({
      due: enrichedSkills,
      totalDue: enrichedSkills.length,
      problem: problem ? {
        problemId: problem.problemId,
        prompt: problem.prompt,
        svg: problem.svg,
        answerType: problem.answerType,
        options: problem.options,
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

    const skillData = user.skillMastery.get(skillId);
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

    user.skillMastery.set(skillId, skillData);
    user.markModified('skillMastery');
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

    const skillData = user.skillMastery.get(skillId);
    if (!skillData?.reviewSchedule) {
      return res.status(404).json({ error: 'No review schedule for this skill' });
    }

    // Reschedule for tomorrow (no ease factor penalty)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    skillData.reviewSchedule.nextReviewDate = tomorrow;

    user.skillMastery.set(skillId, skillData);
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
