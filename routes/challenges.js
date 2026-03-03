/**
 * MATH SHOWDOWN ROUTES
 *
 * Head-to-head challenge system where students compete on speed & accuracy.
 * The challenger picks a skill, system generates a 5-question set from the
 * existing problem bank, and both players get the same problems.
 *
 * FLOW:
 * 1. POST /create         → Challenger picks skill, system picks 5 problems
 * 2. POST /:id/accept     → Opponent accepts the challenge
 * 3. GET  /:id/play       → Get next problem for the authenticated player
 * 4. POST /:id/submit     → Submit answer for current problem
 * 5. GET  /:id/results    → Get final results (once both complete)
 * 6. GET  /available       → List open challenges the student can accept
 * 7. GET  /my              → List my challenges (sent & received)
 *
 * @route /api/challenges
 */

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const Challenge = require('../models/challenge');
const Problem = require('../models/problem');
const Skill = require('../models/skill');
const User = require('../models/user');
const logger = require('../utils/catLogger');

// Number of problems per challenge
const PROBLEMS_PER_CHALLENGE = 5;

// XP rewards
const XP_WIN = 100;
const XP_LOSE = 25;
const XP_TIE = 50;
const XP_COMPLETE = 15; // just for finishing

// ===========================================================================
// LIST AVAILABLE CHALLENGES
// ===========================================================================

/**
 * GET /api/challenges/available
 *
 * Get open challenges this student can accept (same teacher/class).
 */
router.get('/available', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('teacherId').lean();

    // Build query: open challenges from classmates (same teacher), not my own
    const query = {
      status: 'open',
      challengerId: { $ne: userId },
      expiresAt: { $gt: new Date() },
      visibility: 'class'
    };

    // Find classmates (students with the same teacher)
    if (user?.teacherId) {
      const classmateIds = await User.find({
        teacherId: user.teacherId,
        role: 'student',
        _id: { $ne: userId }
      }).distinct('_id');
      query.challengerId = { $in: classmateIds };
    }

    const challenges = await Challenge.find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({ success: true, challenges });
  } catch (error) {
    logger.error('Error fetching available challenges:', error);
    res.status(500).json({ success: false, error: 'Failed to load challenges' });
  }
});

// ===========================================================================
// LIST MY CHALLENGES
// ===========================================================================

/**
 * GET /api/challenges/my
 *
 * Get challenges I've created or accepted (active and recent completed).
 */
router.get('/my', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;

    const challenges = await Challenge.find({
      $or: [
        { challengerId: userId },
        { opponentId: userId }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    // Separate into categories
    const active = [];
    const completed = [];
    const sent = [];

    for (const c of challenges) {
      if (c.status === 'completed') {
        completed.push(c);
      } else if (c.status === 'open' && c.challengerId.toString() === userId.toString()) {
        sent.push(c);
      } else {
        active.push(c);
      }
    }

    res.json({ success: true, active, completed, sent });
  } catch (error) {
    logger.error('Error fetching my challenges:', error);
    res.status(500).json({ success: false, error: 'Failed to load challenges' });
  }
});

// ===========================================================================
// GET SKILLS FOR CHALLENGE CREATION
// ===========================================================================

/**
 * GET /api/challenges/skills
 *
 * Get skills the student has practiced (from their skillMastery map)
 * so they can choose what to challenge on.
 */
router.get('/skills', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user?.skillMastery) {
      return res.json({ success: true, skills: [] });
    }

    // Get skill IDs from user's mastery map
    const skillIds = Object.keys(user.skillMastery);

    const skills = await Skill.find({
      skillId: { $in: skillIds },
      isActive: true
    }).select('skillId displayName category gradeBand difficultyLevel').lean();

    res.json({ success: true, skills });
  } catch (error) {
    logger.error('Error fetching challenge skills:', error);
    res.status(500).json({ success: false, error: 'Failed to load skills' });
  }
});

// ===========================================================================
// CREATE CHALLENGE
// ===========================================================================

/**
 * POST /api/challenges/create
 *
 * Create a new challenge. Picks 5 problems from the chosen skill.
 * Body: { skillId, opponentId? (for direct challenges) }
 */
router.post('/create', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const { skillId, opponentId } = req.body;

    if (!skillId) {
      return res.status(400).json({ success: false, error: 'skillId is required' });
    }

    // Verify skill exists
    const skill = await Skill.findOne({ skillId }).lean();
    if (!skill) {
      return res.status(404).json({ success: false, error: 'Skill not found' });
    }

    // Pick 5 random problems for this skill
    const problems = await Problem.aggregate([
      { $match: { skillId, isActive: true } },
      { $sample: { size: PROBLEMS_PER_CHALLENGE } }
    ]);

    if (problems.length < PROBLEMS_PER_CHALLENGE) {
      return res.status(400).json({
        success: false,
        error: `Not enough problems available for "${skill.displayName}". Need ${PROBLEMS_PER_CHALLENGE}, found ${problems.length}.`
      });
    }

    const problemIds = problems.map(p => p.problemId);

    // Get challenger name
    const challenger = await User.findById(userId).select('firstName lastName').lean();
    const challengerName = `${challenger.firstName} ${challenger.lastName?.charAt(0) || ''}.`.trim();

    // Build challenge
    const challengeData = {
      skillId,
      skillName: skill.displayName,
      problemIds,
      challengerId: userId,
      challengerName,
      challengerAttempt: { userId, status: 'not_started', responses: [] },
      opponentAttempt: { status: 'not_started', responses: [] },
      visibility: opponentId ? 'direct' : 'class'
    };

    // If direct challenge, set opponent
    if (opponentId) {
      const opponent = await User.findById(opponentId).select('firstName lastName').lean();
      if (!opponent) {
        return res.status(404).json({ success: false, error: 'Opponent not found' });
      }
      challengeData.opponentId = opponentId;
      challengeData.opponentName = `${opponent.firstName} ${opponent.lastName?.charAt(0) || ''}.`.trim();
      challengeData.opponentAttempt.userId = opponentId;
    }

    const challenge = await Challenge.create(challengeData);

    logger.info(`Challenge created: ${challenge._id} by ${challengerName} on ${skill.displayName}`);

    res.json({
      success: true,
      challenge: {
        _id: challenge._id,
        skillName: challenge.skillName,
        challengerName: challenge.challengerName,
        status: challenge.status,
        visibility: challenge.visibility,
        expiresAt: challenge.expiresAt
      }
    });
  } catch (error) {
    logger.error('Error creating challenge:', error);
    res.status(500).json({ success: false, error: 'Failed to create challenge' });
  }
});

// ===========================================================================
// ACCEPT CHALLENGE
// ===========================================================================

/**
 * POST /api/challenges/:id/accept
 *
 * Accept an open challenge.
 */
router.post('/:id/accept', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const challenge = await Challenge.findById(req.params.id);

    if (!challenge) {
      return res.status(404).json({ success: false, error: 'Challenge not found' });
    }

    if (challenge.status !== 'open') {
      return res.status(400).json({ success: false, error: 'Challenge is no longer open' });
    }

    if (challenge.challengerId.toString() === userId.toString()) {
      return res.status(400).json({ success: false, error: 'You cannot accept your own challenge' });
    }

    if (challenge.expiresAt < new Date()) {
      challenge.status = 'expired';
      await challenge.save();
      return res.status(400).json({ success: false, error: 'Challenge has expired' });
    }

    // If direct challenge, verify this is the intended opponent
    if (challenge.visibility === 'direct' && challenge.opponentId &&
        challenge.opponentId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, error: 'This challenge was sent to another student' });
    }

    // Set opponent
    const opponent = await User.findById(userId).select('firstName lastName').lean();
    challenge.opponentId = userId;
    challenge.opponentName = `${opponent.firstName} ${opponent.lastName?.charAt(0) || ''}.`.trim();
    challenge.opponentAttempt.userId = userId;
    challenge.status = 'accepted';
    await challenge.save();

    logger.info(`Challenge ${challenge._id} accepted by ${challenge.opponentName}`);

    res.json({
      success: true,
      challenge: {
        _id: challenge._id,
        skillName: challenge.skillName,
        challengerName: challenge.challengerName,
        opponentName: challenge.opponentName,
        status: challenge.status
      }
    });
  } catch (error) {
    logger.error('Error accepting challenge:', error);
    res.status(500).json({ success: false, error: 'Failed to accept challenge' });
  }
});

// ===========================================================================
// DECLINE CHALLENGE
// ===========================================================================

/**
 * POST /api/challenges/:id/decline
 *
 * Decline a direct challenge (re-opens it for others if class visibility).
 */
router.post('/:id/decline', isAuthenticated, async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.id);
    if (!challenge) {
      return res.status(404).json({ success: false, error: 'Challenge not found' });
    }

    if (challenge.visibility === 'direct') {
      challenge.status = 'declined';
    }
    // For class challenges, just ignore (don't change status)
    await challenge.save();

    res.json({ success: true });
  } catch (error) {
    logger.error('Error declining challenge:', error);
    res.status(500).json({ success: false, error: 'Failed to decline challenge' });
  }
});

// ===========================================================================
// PLAY - GET NEXT PROBLEM
// ===========================================================================

/**
 * GET /api/challenges/:id/play
 *
 * Get the next problem for the authenticated player.
 * Returns the current problem they need to answer.
 */
router.get('/:id/play', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const challenge = await Challenge.findById(req.params.id);

    if (!challenge) {
      return res.status(404).json({ success: false, error: 'Challenge not found' });
    }

    // Determine which attempt belongs to this user
    const { attempt, role } = getPlayerAttempt(challenge, userId);
    if (!attempt) {
      return res.status(403).json({ success: false, error: 'You are not a participant in this challenge' });
    }

    // Challenge must be accepted or in_progress
    if (!['accepted', 'in_progress'].includes(challenge.status)) {
      return res.status(400).json({ success: false, error: `Challenge is ${challenge.status}` });
    }

    // Mark attempt as in_progress if just starting
    if (attempt.status === 'not_started') {
      attempt.status = 'in_progress';
      attempt.startedAt = new Date();
      challenge.status = 'in_progress';
      await challenge.save();
    }

    // If already completed
    if (attempt.status === 'completed') {
      return res.json({
        success: true,
        complete: true,
        score: attempt.score,
        totalTime: attempt.totalTime,
        waiting: !isOtherPlayerDone(challenge, userId)
      });
    }

    // Get next problem index
    const problemIndex = attempt.responses.length;
    if (problemIndex >= challenge.problemIds.length) {
      // All questions answered but not marked complete yet
      return res.json({ success: true, complete: true, score: attempt.score });
    }

    const problemId = challenge.problemIds[problemIndex];
    const problem = await Problem.findOne({ problemId }).lean();

    if (!problem) {
      return res.status(500).json({ success: false, error: 'Problem data not found' });
    }

    res.json({
      success: true,
      complete: false,
      questionNumber: problemIndex + 1,
      totalQuestions: PROBLEMS_PER_CHALLENGE,
      skillName: challenge.skillName,
      problem: {
        problemId: problem.problemId,
        prompt: problem.prompt,
        answerType: problem.answerType,
        options: problem.options || [],
        svg: problem.svg || null
      },
      score: attempt.score,
      opponentStatus: getOpponentStatus(challenge, userId)
    });
  } catch (error) {
    logger.error('Error getting challenge problem:', error);
    res.status(500).json({ success: false, error: 'Failed to load problem' });
  }
});

// ===========================================================================
// SUBMIT ANSWER
// ===========================================================================

/**
 * POST /api/challenges/:id/submit
 *
 * Submit an answer for the current problem.
 * Body: { answer, responseTime (ms) }
 */
router.post('/:id/submit', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const { answer, responseTime } = req.body;
    const challenge = await Challenge.findById(req.params.id);

    if (!challenge) {
      return res.status(404).json({ success: false, error: 'Challenge not found' });
    }

    const { attempt, role } = getPlayerAttempt(challenge, userId);
    if (!attempt) {
      return res.status(403).json({ success: false, error: 'You are not a participant' });
    }

    if (attempt.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Already completed' });
    }

    // Get current problem
    const problemIndex = attempt.responses.length;
    if (problemIndex >= challenge.problemIds.length) {
      return res.status(400).json({ success: false, error: 'All problems already answered' });
    }

    const problemId = challenge.problemIds[problemIndex];
    const problem = await Problem.findOne({ problemId });

    if (!problem) {
      return res.status(500).json({ success: false, error: 'Problem data not found' });
    }

    // Check answer using the Problem model's checkAnswer method
    const correct = problem.checkAnswer(answer);
    const time = Math.max(0, Math.min(responseTime || 0, 300000)); // cap at 5 min

    // Record response
    attempt.responses.push({
      problemId,
      answer,
      correct,
      responseTime: time,
      answeredAt: new Date()
    });

    if (correct) {
      attempt.score = (attempt.score || 0) + 1;
    }
    attempt.totalTime = (attempt.totalTime || 0) + time;

    // Check if this player is done
    const isLastQuestion = attempt.responses.length >= challenge.problemIds.length;
    if (isLastQuestion) {
      attempt.status = 'completed';
      attempt.completedAt = new Date();
    }

    // Check if both players are done
    const bothDone = challenge.challengerAttempt.status === 'completed' &&
                     challenge.opponentAttempt.status === 'completed';

    if (bothDone) {
      finalizeChallenge(challenge);
    }

    await challenge.save();

    // Award XP if challenge just finalized
    if (bothDone) {
      await awardChallengeXP(challenge);
    }

    const responseData = {
      success: true,
      correct,
      correctAnswer: getDisplayAnswer(problem),
      score: attempt.score,
      questionNumber: attempt.responses.length,
      totalQuestions: PROBLEMS_PER_CHALLENGE,
      complete: isLastQuestion,
      opponentStatus: getOpponentStatus(challenge, userId)
    };

    if (bothDone) {
      responseData.results = buildResults(challenge, userId);
    } else if (isLastQuestion) {
      responseData.waiting = true;
    }

    res.json(responseData);
  } catch (error) {
    logger.error('Error submitting challenge answer:', error);
    res.status(500).json({ success: false, error: 'Failed to submit answer' });
  }
});

// ===========================================================================
// GET RESULTS
// ===========================================================================

/**
 * GET /api/challenges/:id/results
 *
 * Get the final results for a completed challenge.
 */
router.get('/:id/results', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const challenge = await Challenge.findById(req.params.id).lean();

    if (!challenge) {
      return res.status(404).json({ success: false, error: 'Challenge not found' });
    }

    // Allow viewing even if not yet complete (show partial status)
    if (challenge.status !== 'completed') {
      return res.json({
        success: true,
        status: challenge.status,
        challengerDone: challenge.challengerAttempt?.status === 'completed',
        opponentDone: challenge.opponentAttempt?.status === 'completed'
      });
    }

    res.json({
      success: true,
      results: buildResults(challenge, userId)
    });
  } catch (error) {
    logger.error('Error getting challenge results:', error);
    res.status(500).json({ success: false, error: 'Failed to load results' });
  }
});

// ===========================================================================
// GET CLASSMATES (for direct challenges)
// ===========================================================================

/**
 * GET /api/challenges/classmates
 *
 * Get list of classmates for direct challenge targeting.
 */
router.get('/classmates', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('teacherId').lean();

    if (!user?.teacherId) {
      return res.json({ success: true, classmates: [] });
    }

    const classmates = await User.find({
      teacherId: user.teacherId,
      role: 'student',
      _id: { $ne: req.user._id }
    })
      .select('firstName lastName level')
      .lean();

    const formatted = classmates.map(c => ({
      _id: c._id,
      name: `${c.firstName} ${c.lastName?.charAt(0) || ''}.`.trim(),
      level: c.level || 1
    }));

    res.json({ success: true, classmates: formatted });
  } catch (error) {
    logger.error('Error fetching classmates:', error);
    res.status(500).json({ success: false, error: 'Failed to load classmates' });
  }
});

// ===========================================================================
// HELPER FUNCTIONS
// ===========================================================================

/**
 * Get the attempt object for the given user
 */
function getPlayerAttempt(challenge, userId) {
  const uid = userId.toString();
  if (challenge.challengerId.toString() === uid) {
    return { attempt: challenge.challengerAttempt, role: 'challenger' };
  }
  if (challenge.opponentId && challenge.opponentId.toString() === uid) {
    return { attempt: challenge.opponentAttempt, role: 'opponent' };
  }
  return { attempt: null, role: null };
}

/**
 * Check if the other player has finished
 */
function isOtherPlayerDone(challenge, userId) {
  const uid = userId.toString();
  if (challenge.challengerId.toString() === uid) {
    return challenge.opponentAttempt?.status === 'completed';
  }
  return challenge.challengerAttempt?.status === 'completed';
}

/**
 * Get opponent status for display (without leaking answers)
 */
function getOpponentStatus(challenge, userId) {
  const uid = userId.toString();
  const isChallenger = challenge.challengerId.toString() === uid;
  const opponentAttempt = isChallenger ? challenge.opponentAttempt : challenge.challengerAttempt;

  if (!opponentAttempt || opponentAttempt.status === 'not_started') {
    return 'waiting';
  }
  if (opponentAttempt.status === 'in_progress') {
    return 'playing';
  }
  return 'finished';
}

/**
 * Determine winner and finalize challenge
 */
function finalizeChallenge(challenge) {
  const cAttempt = challenge.challengerAttempt;
  const oAttempt = challenge.opponentAttempt;

  challenge.status = 'completed';

  // Compare: accuracy first, then speed as tiebreaker
  if (cAttempt.score > oAttempt.score) {
    challenge.result = 'challenger_win';
    challenge.winnerId = challenge.challengerId;
  } else if (oAttempt.score > cAttempt.score) {
    challenge.result = 'opponent_win';
    challenge.winnerId = challenge.opponentId;
  } else {
    // Same score — faster wins
    if (cAttempt.totalTime < oAttempt.totalTime) {
      challenge.result = 'challenger_win';
      challenge.winnerId = challenge.challengerId;
    } else if (oAttempt.totalTime < cAttempt.totalTime) {
      challenge.result = 'opponent_win';
      challenge.winnerId = challenge.opponentId;
    } else {
      challenge.result = 'tie';
      challenge.winnerId = null;
    }
  }

  // Set XP awards
  if (challenge.result === 'tie') {
    challenge.xpAwarded = { winner: XP_TIE, loser: XP_TIE };
  } else {
    challenge.xpAwarded = { winner: XP_WIN, loser: XP_LOSE };
  }
}

/**
 * Award XP to both players
 */
async function awardChallengeXP(challenge) {
  try {
    const winnerXP = challenge.xpAwarded.winner || 0;
    const loserXP = challenge.xpAwarded.loser || 0;

    if (challenge.result === 'tie') {
      await User.updateOne(
        { _id: challenge.challengerId },
        { $inc: { xp: XP_TIE + XP_COMPLETE } }
      );
      await User.updateOne(
        { _id: challenge.opponentId },
        { $inc: { xp: XP_TIE + XP_COMPLETE } }
      );
    } else {
      const loserId = challenge.winnerId.toString() === challenge.challengerId.toString()
        ? challenge.opponentId
        : challenge.challengerId;

      await User.updateOne(
        { _id: challenge.winnerId },
        { $inc: { xp: winnerXP + XP_COMPLETE } }
      );
      await User.updateOne(
        { _id: loserId },
        { $inc: { xp: loserXP + XP_COMPLETE } }
      );
    }
  } catch (error) {
    logger.error('Error awarding challenge XP:', error);
  }
}

/**
 * Build results object for the frontend
 */
function buildResults(challenge, viewerId) {
  const viewerIsChallenger = challenge.challengerId.toString() === viewerId.toString();

  const myAttempt = viewerIsChallenger ? challenge.challengerAttempt : challenge.opponentAttempt;
  const theirAttempt = viewerIsChallenger ? challenge.opponentAttempt : challenge.challengerAttempt;

  const iWon = challenge.winnerId && challenge.winnerId.toString() === viewerId.toString();
  const isTie = challenge.result === 'tie';

  return {
    skillName: challenge.skillName,
    result: isTie ? 'tie' : (iWon ? 'win' : 'loss'),
    myScore: myAttempt?.score || 0,
    myTime: myAttempt?.totalTime || 0,
    theirScore: theirAttempt?.score || 0,
    theirTime: theirAttempt?.totalTime || 0,
    totalQuestions: PROBLEMS_PER_CHALLENGE,
    challengerName: challenge.challengerName,
    opponentName: challenge.opponentName,
    xpEarned: isTie ? (XP_TIE + XP_COMPLETE) : (iWon ? (XP_WIN + XP_COMPLETE) : (XP_LOSE + XP_COMPLETE))
  };
}

/**
 * Get a display-friendly version of the correct answer
 */
function getDisplayAnswer(problem) {
  if (problem.correctOption && problem.options?.length) {
    const opt = problem.options.find(o => o.label === problem.correctOption);
    return opt ? `${problem.correctOption}: ${opt.text}` : problem.correctOption;
  }
  const val = problem.answer?.value ?? problem.answer;
  return String(val);
}

module.exports = router;
