/**
 * MASTERY MODE ROUTES
 *
 * Handles mastery mode progression:
 * - AI Interview questions
 * - Badge availability and earning
 * - Mastery tracking
 */

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Skill = require('../models/skill');
const { prepareBadgeLaunch } = require('../utils/badgeLaunchService'); // TEACHING ENHANCEMENT
const { generatePhaseProblem, recordPhaseAttempt, getPhaseInstructions } = require('../utils/badgePhaseController'); // TEACHING ENHANCEMENT
const { generateHint, trackHintUsage, analyzeHintUsage, shouldReteach } = require('../utils/hintSystem'); // TEACHING ENHANCEMENT
const { analyzeError, generateReteaching, recordMisconception, markMisconceptionAddressed, analyzeMisconceptionPattern } = require('../utils/misconceptionDetector'); // TEACHING ENHANCEMENT
const { generateInterviewQuestions, generateFollowUp, evaluateResponse, createInterviewSession } = require('../utils/dynamicInterviewGenerator'); // TEACHING ENHANCEMENT

// ============================================================================
// PHASE 2: AI INTERVIEW PROBE
// ============================================================================

/**
 * TEACHING ENHANCEMENT: Dynamic Interview Question Generation
 * POST /api/mastery/interview-question
 */
router.post('/interview-question', async (req, res) => {
  try {
    const { screenerResults } = req.body;

    if (!screenerResults || !screenerResults.theta) {
      return res.status(400).json({ error: 'Missing screener results' });
    }

    // Get frontier skills from screener
    const frontierSkills = screenerResults.frontierSkills || [];

    if (frontierSkills.length === 0) {
      return res.status(400).json({ error: 'No frontier skills identified' });
    }

    // Create full interview session
    const interviewSession = await createInterviewSession(
      frontierSkills,
      screenerResults.theta,
      screenerResults
    );

    res.json({
      success: true,
      interviewSession,
      message: 'Dynamic interview questions generated for all frontier skills'
    });

  } catch (error) {
    console.error('Error generating interview questions:', error);
    res.status(500).json({ error: 'Failed to generate interview questions' });
  }
});

/**
 * TEACHING ENHANCEMENT: Evaluate interview response and generate follow-up
 * POST /api/mastery/interview-response
 */
router.post('/interview-response', async (req, res) => {
  try {
    const { question, studentResponse, skillId } = req.body;

    if (!question || !studentResponse) {
      return res.status(400).json({ error: 'Missing question or response' });
    }

    const skill = await Skill.findOne({ skillId }).lean();

    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Evaluate the response
    const evaluation = await evaluateResponse(question, studentResponse, skill);

    // Generate follow-up if needed
    let followUp = null;
    if (evaluation.rating !== 'excellent' || evaluation.understandingLevel === 'surface') {
      followUp = await generateFollowUp(question, studentResponse, skill);
    }

    res.json({
      success: true,
      evaluation,
      followUp,
      shouldContinue: evaluation.rating !== 'excellent'
    });

  } catch (error) {
    console.error('Error evaluating interview response:', error);
    res.status(500).json({ error: 'Failed to evaluate response' });
  }
});

// ============================================================================
// PHASE 3: MASTERY BADGES
// ============================================================================

/**
 * Get available badges for student
 * GET /api/mastery/available-badges
 */
router.get('/available-badges', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's theta estimate
    const theta = user.learningProfile?.abilityEstimate?.theta || 0;

    // Generate available badges based on theta
    const badges = await generateAvailableBadges(theta, user);

    res.json({
      success: true,
      badges,
      currentTheta: theta
    });

  } catch (error) {
    console.error('Error fetching badges:', error);
    res.status(500).json({ error: 'Failed to load badges' });
  }
});

/**
 * Generate available badges based on student level
 */
async function generateAvailableBadges(theta, user) {
  // Complete badge catalog organized by domain
  const badgeCatalog = [
    // ========== NUMBER SENSE ==========
    {
      badgeId: 'integer-operations-bronze',
      name: 'Integer Explorer',
      domain: 'number-sense',
      skillId: 'integer-all-operations',
      skillName: 'Integer Operations',
      tier: 'bronze',
      requiredTheta: -2.0,
      requiredProblems: 5,
      requiredAccuracy: 0.80,
      description: 'Master basic integer addition and subtraction'
    },
    {
      badgeId: 'integer-operations-silver',
      name: 'Integer Master',
      domain: 'number-sense',
      skillId: 'integer-all-operations',
      skillName: 'Integer Operations',
      tier: 'silver',
      requiredTheta: -1.0,
      requiredProblems: 8,
      requiredAccuracy: 0.85,
      description: 'Master all four operations with integers including negatives'
    },
    {
      badgeId: 'fraction-operations-bronze',
      name: 'Fraction Apprentice',
      domain: 'number-sense',
      skillId: 'fraction-operations',
      skillName: 'Fraction Operations',
      tier: 'bronze',
      requiredTheta: -1.5,
      requiredProblems: 6,
      requiredAccuracy: 0.75,
      description: 'Add and subtract fractions with common denominators'
    },
    {
      badgeId: 'fraction-operations-silver',
      name: 'Fraction Expert',
      domain: 'number-sense',
      skillId: 'fraction-operations',
      skillName: 'Fraction Operations',
      tier: 'silver',
      requiredTheta: -0.5,
      requiredProblems: 8,
      requiredAccuracy: 0.85,
      description: 'Master all fraction operations including multiplication and division'
    },
    {
      badgeId: 'decimal-operations-bronze',
      name: 'Decimal Beginner',
      domain: 'number-sense',
      skillId: 'decimal-operations',
      skillName: 'Decimal Operations',
      tier: 'bronze',
      requiredTheta: -1.5,
      requiredProblems: 5,
      requiredAccuracy: 0.80,
      description: 'Add and subtract decimals accurately'
    },

    // ========== ALGEBRA ==========
    {
      badgeId: 'one-step-equations-bronze',
      name: 'Equation Starter',
      domain: 'algebra',
      skillId: 'one-step-equations-addition',
      skillName: 'One-Step Equations',
      tier: 'bronze',
      requiredTheta: -1.5,
      requiredProblems: 5,
      requiredAccuracy: 0.80,
      description: 'Solve basic one-step equations with addition and subtraction'
    },
    {
      badgeId: 'one-step-equations-silver',
      name: 'One-Step Solver',
      domain: 'algebra',
      skillId: 'one-step-equations-multiplication',
      skillName: 'One-Step Equations',
      tier: 'silver',
      requiredTheta: -0.5,
      requiredProblems: 8,
      requiredAccuracy: 0.85,
      description: 'Solve all types of one-step equations including multiplication and division'
    },
    {
      badgeId: 'two-step-equations-bronze',
      name: 'Two-Step Beginner',
      domain: 'algebra',
      skillId: 'two-step-equations',
      skillName: 'Two-Step Equations',
      tier: 'bronze',
      requiredTheta: 0.0,
      requiredProblems: 6,
      requiredAccuracy: 0.75,
      description: 'Solve basic two-step equations'
    },
    {
      badgeId: 'two-step-equations-silver',
      name: 'Two-Step Champion',
      domain: 'algebra',
      skillId: 'two-step-equations',
      skillName: 'Two-Step Equations',
      tier: 'silver',
      requiredTheta: 0.5,
      requiredProblems: 10,
      requiredAccuracy: 0.85,
      description: 'Master two-step equations with confidence'
    },
    {
      badgeId: 'two-step-equations-gold',
      name: 'Two-Step Expert',
      domain: 'algebra',
      skillId: 'two-step-equations',
      skillName: 'Two-Step Equations',
      tier: 'gold',
      requiredTheta: 1.0,
      requiredProblems: 12,
      requiredAccuracy: 0.90,
      description: 'Demonstrate complete mastery of two-step equations'
    },
    {
      badgeId: 'combining-like-terms-bronze',
      name: 'Term Combiner',
      domain: 'algebra',
      skillId: 'combining-like-terms',
      skillName: 'Combining Like Terms',
      tier: 'bronze',
      requiredTheta: -0.5,
      requiredProblems: 5,
      requiredAccuracy: 0.80,
      description: 'Simplify expressions by combining like terms'
    },
    {
      badgeId: 'combining-like-terms-silver',
      name: 'Expression Simplifier',
      domain: 'algebra',
      skillId: 'combining-like-terms',
      skillName: 'Combining Like Terms',
      tier: 'silver',
      requiredTheta: 0.5,
      requiredProblems: 8,
      requiredAccuracy: 0.85,
      description: 'Master simplification with multiple variable types'
    },
    {
      badgeId: 'distributive-property-silver',
      name: 'Distributive Master',
      domain: 'algebra',
      skillId: 'distributive-property',
      skillName: 'Distributive Property',
      tier: 'silver',
      requiredTheta: 1.0,
      requiredProblems: 8,
      requiredAccuracy: 0.85,
      description: 'Apply the distributive property with confidence'
    },
    {
      badgeId: 'multi-step-equations-silver',
      name: 'Multi-Step Solver',
      domain: 'algebra',
      skillId: 'solving-multi-step-equations',
      skillName: 'Multi-Step Equations',
      tier: 'silver',
      requiredTheta: 1.5,
      requiredProblems: 10,
      requiredAccuracy: 0.85,
      description: 'Solve complex multi-step equations'
    },
    {
      badgeId: 'multi-step-equations-gold',
      name: 'Equation Master',
      domain: 'algebra',
      skillId: 'solving-multi-step-equations',
      skillName: 'Multi-Step Equations',
      tier: 'gold',
      requiredTheta: 2.0,
      requiredProblems: 12,
      requiredAccuracy: 0.90,
      description: 'Demonstrate complete mastery of equation solving'
    },

    // ========== GEOMETRY ==========
    {
      badgeId: 'area-perimeter-bronze',
      name: 'Shape Measurer',
      domain: 'geometry',
      skillId: 'area-and-perimeter',
      skillName: 'Area & Perimeter',
      tier: 'bronze',
      requiredTheta: -1.0,
      requiredProblems: 5,
      requiredAccuracy: 0.80,
      description: 'Calculate area and perimeter of basic shapes'
    },
    {
      badgeId: 'area-perimeter-silver',
      name: 'Geometry Expert',
      domain: 'geometry',
      skillId: 'area-and-perimeter',
      skillName: 'Area & Perimeter',
      tier: 'silver',
      requiredTheta: 0.5,
      requiredProblems: 8,
      requiredAccuracy: 0.85,
      description: 'Master area and perimeter for all shapes'
    },

    // ========== RATIOS & PROPORTIONS ==========
    {
      badgeId: 'ratios-bronze',
      name: 'Ratio Explorer',
      domain: 'ratios',
      skillId: 'understanding-ratios',
      skillName: 'Ratios',
      tier: 'bronze',
      requiredTheta: -0.5,
      requiredProblems: 5,
      requiredAccuracy: 0.80,
      description: 'Understand and write ratios'
    },
    {
      badgeId: 'proportions-silver',
      name: 'Proportion Solver',
      domain: 'ratios',
      skillId: 'solving-proportions',
      skillName: 'Proportions',
      tier: 'silver',
      requiredTheta: 0.5,
      requiredProblems: 8,
      requiredAccuracy: 0.85,
      description: 'Solve proportion problems with confidence'
    },

    // ========== ORDER OF OPERATIONS ==========
    {
      badgeId: 'order-operations-bronze',
      name: 'PEMDAS Beginner',
      domain: 'algebra',
      skillId: 'order-of-operations',
      skillName: 'Order of Operations',
      tier: 'bronze',
      requiredTheta: -1.0,
      requiredProblems: 5,
      requiredAccuracy: 0.80,
      description: 'Apply order of operations to simple expressions'
    },
    {
      badgeId: 'order-operations-silver',
      name: 'Order Expert',
      domain: 'algebra',
      skillId: 'order-of-operations',
      skillName: 'Order of Operations',
      tier: 'silver',
      requiredTheta: 0.0,
      requiredProblems: 8,
      requiredAccuracy: 0.85,
      description: 'Execute order of operations flawlessly'
    },
    {
      badgeId: 'order-operations-gold',
      name: 'PEMDAS Master',
      domain: 'algebra',
      skillId: 'order-of-operations',
      skillName: 'Order of Operations',
      tier: 'gold',
      requiredTheta: 1.0,
      requiredProblems: 10,
      requiredAccuracy: 0.90,
      description: 'Handle complex nested operations with ease'
    },

    // ========== PLATINUM TIER (Endless Journey) ==========
    {
      badgeId: 'equation-platinum',
      name: 'Equation Virtuoso',
      domain: 'algebra',
      skillId: 'solving-multi-step-equations',
      skillName: 'Advanced Equations',
      tier: 'platinum',
      requiredTheta: 2.5,
      requiredProblems: 15,
      requiredAccuracy: 0.92,
      description: 'Solve the most complex multi-step equations with mastery'
    },
    {
      badgeId: 'algebra-master-platinum',
      name: 'Algebra Master',
      domain: 'algebra',
      skillId: 'algebra-comprehensive',
      skillName: 'Comprehensive Algebra',
      tier: 'platinum',
      requiredTheta: 2.0,
      requiredProblems: 20,
      requiredAccuracy: 0.90,
      description: 'Demonstrate comprehensive mastery across all algebra skills'
    },

    // ========== CHALLENGE BADGES (Time & Streak Based) ==========
    {
      badgeId: 'speed-demon-bronze',
      name: 'Quick Thinker',
      domain: 'challenge',
      skillId: 'any',
      skillName: 'Speed Challenge',
      tier: 'bronze',
      requiredTheta: 0.0,
      requiredProblems: 10,
      requiredAccuracy: 0.80,
      challengeType: 'speed',
      timeLimit: 300000, // 5 minutes
      description: 'Complete 10 problems in under 5 minutes at 80% accuracy'
    },
    {
      badgeId: 'perfectionist',
      name: 'Perfectionist',
      domain: 'challenge',
      skillId: 'any',
      skillName: 'Perfect Streak',
      tier: 'gold',
      requiredTheta: 0.0,
      requiredProblems: 10,
      requiredAccuracy: 1.0,
      challengeType: 'perfect',
      description: 'Answer 10 problems in a row with 100% accuracy'
    },
    {
      badgeId: 'marathon-runner',
      name: 'Marathon Runner',
      domain: 'challenge',
      skillId: 'any',
      skillName: 'Endurance Challenge',
      tier: 'silver',
      requiredTheta: 0.0,
      requiredProblems: 50,
      requiredAccuracy: 0.85,
      challengeType: 'endurance',
      description: 'Complete 50 problems in a single session at 85% accuracy'
    },

    // ========== DOMAIN MASTERY (Meta Badges) ==========
    {
      badgeId: 'number-sense-master',
      name: 'Number Sense Master',
      domain: 'meta',
      skillId: 'number-sense-all',
      skillName: 'Complete Number Mastery',
      tier: 'platinum',
      requiredTheta: 0.5,
      requiredProblems: 0, // Awarded when all number-sense badges earned
      requiredAccuracy: 0.0,
      metaBadge: true,
      prerequisiteBadges: ['integer-operations-silver', 'fraction-operations-silver', 'decimal-operations-bronze'],
      description: 'Earn all Number Sense badges to unlock this master badge'
    },
    {
      badgeId: 'algebra-master',
      name: 'Algebra Champion',
      domain: 'meta',
      skillId: 'algebra-all',
      skillName: 'Complete Algebra Mastery',
      tier: 'platinum',
      requiredTheta: 1.5,
      requiredProblems: 0,
      requiredAccuracy: 0.0,
      metaBadge: true,
      prerequisiteBadges: [
        'one-step-equations-silver',
        'two-step-equations-gold',
        'combining-like-terms-silver',
        'distributive-property-silver',
        'multi-step-equations-gold'
      ],
      description: 'Earn all core Algebra badges to unlock this champion badge'
    }
  ];

  // Determine status for each badge
  const earnedBadges = user.badges || [];
  const activeBadge = user.masteryProgress?.activeBadge;

  const badges = badgeCatalog.map(badge => {
    const earned = earnedBadges.find(b => b.badgeId === badge.badgeId);
    const isActive = activeBadge?.badgeId === badge.badgeId;

    let status = 'available';
    let progress = 0;

    if (earned) {
      status = 'completed';
      progress = 100;
    } else if (isActive) {
      status = 'in-progress';
      const completed = activeBadge.problemsCompleted || 0;
      const required = activeBadge.requiredProblems || badge.requiredProblems;
      progress = Math.round((completed / required) * 100);
    } else if (theta < badge.requiredTheta) {
      status = 'locked';
    }

    // Determine if recommended (within 0.5 theta of current level and not locked)
    const recommended = !earned && !isActive &&
                       theta >= badge.requiredTheta &&
                       theta <= (badge.requiredTheta + 1.0);

    return {
      ...badge,
      status,
      progress,
      recommended
    };
  });

  return badges;
}

/**
 * Select a badge to work toward
 * POST /api/mastery/select-badge
 */
router.post('/select-badge', async (req, res) => {
  try {
    const { badgeId } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get badge details
    const theta = user.learningProfile?.abilityEstimate?.theta || 0;
    const availableBadges = await generateAvailableBadges(theta, user);
    const badge = availableBadges.find(b => b.badgeId === badgeId);

    if (!badge) {
      return res.status(404).json({ error: 'Badge not found or not available' });
    }

    // Check if badge is locked
    if (badge.status === 'locked') {
      return res.status(400).json({ error: 'Badge is locked. Improve your ability level to unlock it.' });
    }

    // Check if already completed
    if (badge.status === 'completed') {
      return res.status(400).json({ error: 'Badge already earned' });
    }

    // TEACHING ENHANCEMENT: Prepare comprehensive launch information
    const launchInfo = await prepareBadgeLaunch(badge, user);

    // Initialize badge attempt in user profile with phase tracking
    if (!user.masteryProgress) {
      user.masteryProgress = { activeBadge: null, attempts: [] };
    }

    user.masteryProgress.activeBadge = {
      badgeId: badge.badgeId,
      badgeName: badge.name,
      skillId: badge.skillId,
      tier: badge.tier,
      description: badge.description,
      startedAt: new Date(),
      problemsCompleted: 0,
      problemsCorrect: 0,
      requiredProblems: badge.requiredProblems,
      requiredAccuracy: badge.requiredAccuracy,
      // TEACHING ENHANCEMENT: Add phase tracking
      currentPhase: 'launch',  // launch → i-do → we-do → you-do → mastery-check
      phaseHistory: [],
      hintsUsed: 0,
      misconceptionsAddressed: []
    };

    await user.save();

    res.json({
      success: true,
      badge,
      message: `Started working on ${badge.name}!`,
      // TEACHING ENHANCEMENT: Return comprehensive launch info
      launchInfo,
      nextStep: launchInfo.readyToStart ? 'begin-i-do' : 'review-prerequisites'
    });

  } catch (error) {
    console.error('Error selecting badge:', error);
    res.status(500).json({ error: 'Failed to select badge' });
  }
});

/**
 * Start badge earning attempt
 * POST /api/mastery/start-badge
 */
router.post('/start-badge', async (req, res) => {
  try {
    const { badgeId } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get badge details
    const theta = user.learningProfile?.abilityEstimate?.theta || 0;
    const availableBadges = await generateAvailableBadges(theta, user);
    const badge = availableBadges.find(b => b.id === badgeId);

    if (!badge) {
      return res.status(404).json({ error: 'Badge not found or not available' });
    }

    // Initialize badge attempt in user profile
    if (!user.masteryProgress) {
      user.masteryProgress = { activeBadge: null, attempts: [] };
    }

    user.masteryProgress.activeBadge = {
      badgeId: badge.id,
      badgeName: badge.name,
      skillId: badge.skillId,
      startedAt: new Date(),
      problemsCompleted: 0,
      problemsCorrect: 0,
      requiredProblems: badge.requiredProblems,
      requiredAccuracy: badge.requiredAccuracy
    };

    await user.save();

    res.json({
      success: true,
      badge,
      message: `Started working on ${badge.name}!`,
      nextStep: 'solve-problems'
    });

  } catch (error) {
    console.error('Error starting badge:', error);
    res.status(500).json({ error: 'Failed to start badge earning' });
  }
});

/**
 * Record problem attempt for active badge
 * POST /api/mastery/record-badge-attempt
 */
router.post('/record-badge-attempt', async (req, res) => {
  try {
    const { correct, problemId } = req.body;
    const user = await User.findById(req.user._id);

    if (!user || !user.masteryProgress?.activeBadge) {
      return res.status(400).json({ error: 'No active badge' });
    }

    const activeBadge = user.masteryProgress.activeBadge;

    // Increment counters
    activeBadge.problemsCompleted = (activeBadge.problemsCompleted || 0) + 1;
    if (correct) {
      activeBadge.problemsCorrect = (activeBadge.problemsCorrect || 0) + 1;
    }

    await user.save();

    // Check if badge requirements met
    const accuracy = activeBadge.problemsCorrect / activeBadge.problemsCompleted;
    const meetsRequirements =
      activeBadge.problemsCompleted >= activeBadge.requiredProblems &&
      accuracy >= activeBadge.requiredAccuracy;

    res.json({
      success: true,
      progress: {
        problemsCompleted: activeBadge.problemsCompleted,
        problemsCorrect: activeBadge.problemsCorrect,
        requiredProblems: activeBadge.requiredProblems,
        requiredAccuracy: activeBadge.requiredAccuracy,
        currentAccuracy: accuracy,
        meetsRequirements
      }
    });

  } catch (error) {
    console.error('Error recording badge attempt:', error);
    res.status(500).json({ error: 'Failed to record attempt' });
  }
});

/**
 * Get active badge progress
 * GET /api/mastery/active-badge
 */
router.get('/active-badge', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const activeBadge = user.masteryProgress?.activeBadge;

    if (!activeBadge) {
      return res.json({ success: true, activeBadge: null });
    }

    // Calculate progress
    const accuracy = activeBadge.problemsCompleted > 0
      ? activeBadge.problemsCorrect / activeBadge.problemsCompleted
      : 0;

    const progress = Math.round(
      (activeBadge.problemsCompleted / activeBadge.requiredProblems) * 100
    );

    res.json({
      success: true,
      activeBadge: {
        ...activeBadge.toObject(),
        currentAccuracy: accuracy,
        progress,
        meetsRequirements:
          activeBadge.problemsCompleted >= activeBadge.requiredProblems &&
          accuracy >= activeBadge.requiredAccuracy
      }
    });

  } catch (error) {
    console.error('Error fetching active badge:', error);
    res.status(500).json({ error: 'Failed to load active badge' });
  }
});

/**
 * Complete active badge (award it)
 * POST /api/mastery/complete-badge
 */
router.post('/complete-badge', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || !user.masteryProgress?.activeBadge) {
      return res.status(400).json({ error: 'No active badge' });
    }

    const activeBadge = user.masteryProgress.activeBadge;

    // Verify requirements are met
    const accuracy = activeBadge.problemsCorrect / activeBadge.problemsCompleted;
    const meetsRequirements =
      activeBadge.problemsCompleted >= activeBadge.requiredProblems &&
      accuracy >= activeBadge.requiredAccuracy;

    if (!meetsRequirements) {
      return res.status(400).json({
        error: 'Badge requirements not met',
        current: {
          problems: activeBadge.problemsCompleted,
          accuracy: accuracy
        },
        required: {
          problems: activeBadge.requiredProblems,
          accuracy: activeBadge.requiredAccuracy
        }
      });
    }

    // Award the badge
    if (!user.badges) user.badges = [];

    const alreadyEarned = user.badges.find(b => b.badgeId === activeBadge.badgeId);
    if (!alreadyEarned) {
      user.badges.push({
        badgeId: activeBadge.badgeId,
        earnedDate: new Date(),
        score: Math.round(accuracy * 100)
      });

      // Award XP bonus
      const xpBonus = 500;
      user.xp = (user.xp || 0) + xpBonus;
    }

    // Clear active badge
    const earnedBadgeName = activeBadge.badgeName;
    user.masteryProgress.activeBadge = null;

    await user.save();

    res.json({
      success: true,
      message: `Congratulations! You earned the ${earnedBadgeName} badge!`,
      badge: earnedBadgeName,
      xpBonus: 500,
      totalBadges: user.badges.length
    });

  } catch (error) {
    console.error('Error completing badge:', error);
    res.status(500).json({ error: 'Failed to complete badge' });
  }
});

/**
 * Award badge to student
 * POST /api/mastery/award-badge
 */
router.post('/award-badge', async (req, res) => {
  try {
    const { badgeId, score } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if badge already earned
    if (!user.badges) user.badges = [];

    const alreadyEarned = user.badges.find(b => b.badgeId === badgeId);
    if (alreadyEarned) {
      return res.status(400).json({ error: 'Badge already earned' });
    }

    // Award the badge
    user.badges.push({
      badgeId,
      earnedDate: new Date(),
      score: score || 100
    });

    // Award XP bonus for earning badge
    const xpBonus = 500;
    user.xp += xpBonus;

    await user.save();

    res.json({
      success: true,
      message: 'Badge earned!',
      xpBonus,
      totalBadges: user.badges.length
    });

  } catch (error) {
    console.error('Error awarding badge:', error);
    res.status(500).json({ error: 'Failed to award badge' });
  }
});

// ============================================================================
// TEACHING ENHANCEMENT: PHASE-BASED BADGE EARNING
// ============================================================================

/**
 * Get next problem for current phase
 * GET /api/mastery/next-phase-problem
 */
router.get('/next-phase-problem', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || !user.masteryProgress?.activeBadge) {
      return res.status(400).json({ error: 'No active badge' });
    }

    const activeBadge = user.masteryProgress.activeBadge;
    const problem = await generatePhaseProblem(activeBadge.currentPhase, activeBadge, user);

    res.json({
      success: true,
      problem,
      phase: activeBadge.currentPhase,
      phaseGuidance: problem.phaseGuidance
    });

  } catch (error) {
    console.error('Error generating phase problem:', error);
    res.status(500).json({ error: 'Failed to generate problem' });
  }
});

/**
 * Record problem attempt in current phase
 * POST /api/mastery/record-phase-attempt
 */
router.post('/record-phase-attempt', async (req, res) => {
  try {
    const { problemId, correct, timeSpent, hintsUsed } = req.body;
    const user = await User.findById(req.user._id);

    if (!user || !user.masteryProgress?.activeBadge) {
      return res.status(400).json({ error: 'No active badge' });
    }

    const result = await recordPhaseAttempt(user, problemId, correct, timeSpent, hintsUsed);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error recording phase attempt:', error);
    res.status(500).json({ error: 'Failed to record attempt' });
  }
});

/**
 * Get current phase instructions for AI tutor
 * GET /api/mastery/phase-instructions
 */
router.get('/phase-instructions', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || !user.masteryProgress?.activeBadge) {
      return res.status(400).json({ error: 'No active badge' });
    }

    const activeBadge = user.masteryProgress.activeBadge;
    const instructions = await getPhaseInstructions(activeBadge.currentPhase, activeBadge);

    res.json({
      success: true,
      phase: activeBadge.currentPhase,
      instructions
    });

  } catch (error) {
    console.error('Error getting phase instructions:', error);
    res.status(500).json({ error: 'Failed to get instructions' });
  }
});

/**
 * Request a hint for current problem
 * POST /api/mastery/request-hint
 */
router.post('/request-hint', async (req, res) => {
  try {
    const { problemId, currentLevel, studentWork, problem } = req.body;
    const user = await User.findById(req.user._id);

    if (!user || !user.masteryProgress?.activeBadge) {
      return res.status(400).json({ error: 'No active badge' });
    }

    const activeBadge = user.masteryProgress.activeBadge;

    // Check if student should be reteaching instead
    const needsReteaching = shouldReteach(user, problemId);

    if (needsReteaching && currentLevel >= 3) {
      return res.json({
        success: true,
        needsReteaching: true,
        message: "You've tried several hints. Let's review this concept together before continuing.",
        suggestion: 'reteach'
      });
    }

    // Get skill info
    const skill = await Skill.findOne({ skillId: activeBadge.skillId }).lean();

    // Determine hint level
    const hintLevel = currentLevel ? currentLevel + 1 : 1;

    // Generate hint
    const hint = await generateHint(problem, skill, hintLevel, { studentWork });

    // Track hint usage
    await trackHintUsage(user, problemId, hintLevel);

    // Analyze hint patterns
    const analysis = analyzeHintUsage(user);

    res.json({
      success: true,
      hint,
      analysis,
      needsReteaching: false
    });

  } catch (error) {
    console.error('Error generating hint:', error);
    res.status(500).json({ error: 'Failed to generate hint' });
  }
});

/**
 * Analyze error and get reteaching
 * POST /api/mastery/analyze-error
 */
router.post('/analyze-error', async (req, res) => {
  try {
    const { problem, studentAnswer } = req.body;
    const user = await User.findById(req.user._id);

    if (!user || !user.masteryProgress?.activeBadge) {
      return res.status(400).json({ error: 'No active badge' });
    }

    const activeBadge = user.masteryProgress.activeBadge;
    const skill = await Skill.findOne({ skillId: activeBadge.skillId }).lean();

    // Analyze the error
    const misconception = await analyzeError(problem, studentAnswer, skill);

    // Generate reteaching
    const reteaching = await generateReteaching(misconception, problem, skill);

    // Record misconception
    await recordMisconception(user, skill.skillId, misconception);

    // Analyze patterns
    const pattern = analyzeMisconceptionPattern(user);

    res.json({
      success: true,
      misconception,
      reteaching,
      pattern
    });

  } catch (error) {
    console.error('Error analyzing error:', error);
    res.status(500).json({ error: 'Failed to analyze error' });
  }
});

/**
 * Mark misconception as addressed
 * POST /api/mastery/misconception-addressed
 */
router.post('/misconception-addressed', async (req, res) => {
  try {
    const { misconceptionName } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await markMisconceptionAddressed(user, misconceptionName);

    res.json({
      success: true,
      message: 'Misconception marked as addressed'
    });

  } catch (error) {
    console.error('Error marking misconception:', error);
    res.status(500).json({ error: 'Failed to mark misconception' });
  }
});

module.exports = router;
