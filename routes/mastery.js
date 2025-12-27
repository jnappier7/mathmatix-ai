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
const { isAuthenticated } = require('../middleware/auth');
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
router.post('/interview-question', isAuthenticated, async (req, res) => {
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
router.post('/interview-response', isAuthenticated, async (req, res) => {
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
router.get('/available-badges', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Initialize learningProfile if it doesn't exist
    if (!user.learningProfile) {
      user.learningProfile = {
        assessmentCompleted: false,
        abilityEstimate: {},
        skillMastery: new Map()
      };
      await user.save();
    }

    // Get user's theta estimate
    let theta = user.learningProfile?.abilityEstimate?.theta;

    // MIGRATION: Handle old format where theta was stored as string in initialPlacement
    if (theta === undefined && user.learningProfile?.initialPlacement) {
      // Parse "Theta: 1.5 (75th percentile)" format
      const match = user.learningProfile.initialPlacement.match(/Theta:\s*([-\d.]+)/);
      if (match) {
        theta = parseFloat(match[1]);
        // Update to new format
        user.learningProfile.abilityEstimate = { theta };
        await user.save();
      }
    }

    // Default to 0 if still undefined
    if (theta === undefined || isNaN(theta)) {
      theta = 0;
    }

    // Generate available badges based on theta
    const badges = await generateAvailableBadges(theta, user);

    res.json({
      success: true,
      badges,
      currentTheta: theta
    });

  } catch (error) {
    console.error('[Available Badges] Error fetching badges:', error);
    console.error('[Available Badges] Error stack:', error.stack);
    console.error('[Available Badges] User ID:', req.user?._id);
    res.status(500).json({
      error: 'Failed to load badges',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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
router.post('/select-badge', isAuthenticated, async (req, res) => {
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
router.post('/start-badge', isAuthenticated, async (req, res) => {
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
router.post('/record-badge-attempt', isAuthenticated, async (req, res) => {
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
router.get('/active-badge', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Initialize learningProfile if it doesn't exist
    if (!user.learningProfile) {
      user.learningProfile = {
        assessmentCompleted: false,
        abilityEstimate: {},
        skillMastery: new Map()
      };
      await user.save();
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
router.post('/complete-badge', isAuthenticated, async (req, res) => {
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
router.post('/award-badge', isAuthenticated, async (req, res) => {
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
router.get('/next-phase-problem', isAuthenticated, async (req, res) => {
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
router.post('/record-phase-attempt', isAuthenticated, async (req, res) => {
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
router.get('/phase-instructions', isAuthenticated, async (req, res) => {
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
router.post('/request-hint', isAuthenticated, async (req, res) => {
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
router.post('/analyze-error', isAuthenticated, async (req, res) => {
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
router.post('/misconception-addressed', isAuthenticated, async (req, res) => {
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

/**
 * Get badge map data for visualization
 * GET /api/mastery/badge-map
 */
router.get('/badge-map', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get all available badges
    const availableBadges = await Skill.find({ isBadge: true }).lean();

    // Build badge map with user progress
    const badgeMap = availableBadges.map(badge => {
      const userProgress = user.skillMastery?.get(badge.skillId) || {};

      return {
        badgeId: badge.skillId,
        name: badge.name,
        description: badge.description,
        gradeLevel: badge.gradeLevel,
        prerequisites: badge.prerequisites || [],
        status: userProgress.status || 'locked',
        progress: userProgress.masteryScore || 0,
        earned: userProgress.status === 'mastered',
        earnedDate: userProgress.masteredDate
      };
    });

    res.json({
      badges: badgeMap,
      userLevel: user.level || 1,
      userXP: user.xp || 0
    });

  } catch (error) {
    console.error('Error fetching badge map:', error);
    res.status(500).json({ error: 'Failed to load badge map' });
  }
});

// ============================================================================
// MASTER MODE: 4-PILLAR MASTERY TRACKING
// ============================================================================

const {
  updateSkillMastery,
  calculateMasteryScore,
  calculateMasteryState,
  checkTierUpgrade,
  performRetentionCheck,
  getSkillsDueForRetention,
  calculatePillarProgress,
  getMasteryMessage
} = require('../utils/masteryEngine');

const { detectStrategyBadge, getAllStrategyBadges } = require('../utils/strategyBadges');
const { checkAllHabitBadges, getAllHabitBadges, updateStreakTracking } = require('../utils/habitBadges');

/**
 * Record problem attempt and update 4-pillar mastery tracking
 * POST /api/mastery/record-mastery-attempt
 */
router.post('/record-mastery-attempt', isAuthenticated, async (req, res) => {
  try {
    const { skillId, correct, hintUsed, problemContext, responseTime, problemId } = req.body;

    if (!skillId) {
      return res.status(400).json({ error: 'Missing skillId' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get skill data
    let skillMastery = user.skillMastery.get(skillId);
    if (!skillMastery) {
      // Initialize skill mastery if not exists
      const { initializeSkillMastery } = require('../utils/masteryEngine');
      skillMastery = initializeSkillMastery(skillId);
      skillMastery.status = 'ready';
    }

    // Store old tier for upgrade detection
    const oldTier = skillMastery.currentTier || 'none';

    // Update skill mastery with attempt data
    const updatedSkill = updateSkillMastery(skillMastery, {
      correct,
      hintUsed,
      problemContext,
      responseTime
    });

    // Recalculate state
    updatedSkill.status = calculateMasteryState(updatedSkill, user.skillMastery);

    // Update user's skill mastery
    user.skillMastery.set(skillId, updatedSkill);

    // Update streak tracking
    updateStreakTracking(user);

    // Check for tier upgrade
    const tierUpgrade = checkTierUpgrade(oldTier, updatedSkill.currentTier);

    // Save user
    await user.save();

    // Calculate pillar progress for UI
    const pillarProgress = calculatePillarProgress(updatedSkill.pillars || {});

    res.json({
      success: true,
      skillMastery: {
        skillId,
        status: updatedSkill.status,
        masteryScore: updatedSkill.masteryScore,
        currentTier: updatedSkill.currentTier,
        pillars: pillarProgress,
        message: getMasteryMessage(updatedSkill.status, updatedSkill.currentTier)
      },
      tierUpgrade: tierUpgrade.upgraded ? tierUpgrade : null
    });

  } catch (error) {
    console.error('Error recording mastery attempt:', error);
    res.status(500).json({ error: 'Failed to record mastery attempt' });
  }
});

/**
 * Get detailed mastery status for a skill
 * GET /api/mastery/skill-mastery/:skillId
 */
router.get('/skill-mastery/:skillId', isAuthenticated, async (req, res) => {
  try {
    const { skillId } = req.params;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const skillMastery = user.skillMastery.get(skillId);
    if (!skillMastery) {
      return res.status(404).json({ error: 'Skill mastery not found' });
    }

    // Calculate pillar progress
    const pillarProgress = calculatePillarProgress(skillMastery.pillars || {});

    res.json({
      success: true,
      skillMastery: {
        skillId,
        status: skillMastery.status,
        masteryScore: skillMastery.masteryScore,
        currentTier: skillMastery.currentTier,
        totalAttempts: skillMastery.totalAttempts,
        consecutiveCorrect: skillMastery.consecutiveCorrect,
        lastPracticed: skillMastery.lastPracticed,
        pillars: {
          accuracy: {
            correct: skillMastery.pillars?.accuracy?.correct || 0,
            total: skillMastery.pillars?.accuracy?.total || 0,
            percentage: Math.round((skillMastery.pillars?.accuracy?.percentage || 0) * 100),
            progress: pillarProgress.accuracy
          },
          independence: {
            hintsUsed: skillMastery.pillars?.independence?.hintsUsed || 0,
            hintsAvailable: skillMastery.pillars?.independence?.hintsAvailable || 15,
            progress: pillarProgress.independence
          },
          transfer: {
            contextsAttempted: skillMastery.pillars?.transfer?.contextsAttempted || [],
            contextsRequired: skillMastery.pillars?.transfer?.contextsRequired || 3,
            progress: pillarProgress.transfer
          },
          retention: {
            checks: skillMastery.pillars?.retention?.retentionChecks || [],
            nextCheck: skillMastery.pillars?.retention?.nextRetentionCheck,
            progress: pillarProgress.retention
          }
        },
        message: getMasteryMessage(skillMastery.status, skillMastery.currentTier)
      }
    });

  } catch (error) {
    console.error('Error fetching skill mastery:', error);
    res.status(500).json({ error: 'Failed to fetch skill mastery' });
  }
});

/**
 * Check for strategy and habit badge detection
 * POST /api/mastery/check-badge-detection
 */
router.post('/check-badge-detection', isAuthenticated, async (req, res) => {
  try {
    const { attemptHistory } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Detect strategy badges
    const newStrategyBadges = detectStrategyBadge(
      user._id,
      attemptHistory || [],
      user.strategyBadges || []
    );

    // Detect habit badges
    const newHabitBadges = checkAllHabitBadges(user, attemptHistory || []);

    // Award new badges
    if (newStrategyBadges.length > 0) {
      user.strategyBadges.push(...newStrategyBadges);
    }

    if (newHabitBadges.length > 0) {
      user.habitBadges.push(...newHabitBadges);
    }

    // Save if badges were awarded
    if (newStrategyBadges.length > 0 || newHabitBadges.length > 0) {
      await user.save();
    }

    res.json({
      success: true,
      newBadges: {
        strategy: newStrategyBadges,
        habit: newHabitBadges
      },
      totalNewBadges: newStrategyBadges.length + newHabitBadges.length
    });

  } catch (error) {
    console.error('Error checking badge detection:', error);
    res.status(500).json({ error: 'Failed to check badge detection' });
  }
});

/**
 * Get all strategy badges (earned and available)
 * GET /api/mastery/badges/strategy
 */
router.get('/badges/strategy', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const allStrategyBadges = getAllStrategyBadges();
    const earnedBadgeIds = (user.strategyBadges || []).map(b => b.badgeId);

    const badges = allStrategyBadges.map(badge => ({
      ...badge,
      earned: earnedBadgeIds.includes(badge.badgeId),
      earnedDate: user.strategyBadges?.find(b => b.badgeId === badge.badgeId)?.earnedDate
    }));

    res.json({
      success: true,
      badges,
      earnedCount: earnedBadgeIds.length,
      totalCount: allStrategyBadges.length
    });

  } catch (error) {
    console.error('Error fetching strategy badges:', error);
    res.status(500).json({ error: 'Failed to fetch strategy badges' });
  }
});

/**
 * Get all habit badges (earned and available)
 * GET /api/mastery/badges/habit
 */
router.get('/badges/habit', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const allHabitBadges = getAllHabitBadges();
    const earnedBadgeIds = (user.habitBadges || []).map(b => b.badgeId);

    const badges = allHabitBadges.map(badge => {
      const earnedBadge = user.habitBadges?.find(b => b.badgeId === badge.badgeId);
      return {
        ...badge,
        earned: earnedBadgeIds.includes(badge.badgeId),
        earnedDate: earnedBadge?.earnedDate,
        count: earnedBadge?.count || 0,
        currentStreak: earnedBadge?.currentStreak || 0,
        bestStreak: earnedBadge?.bestStreak || 0
      };
    });

    res.json({
      success: true,
      badges,
      earnedCount: earnedBadgeIds.length,
      totalCount: allHabitBadges.length,
      currentStreak: user.dailyQuests?.currentStreak || 0,
      longestStreak: user.dailyQuests?.longestStreak || 0
    });

  } catch (error) {
    console.error('Error fetching habit badges:', error);
    res.status(500).json({ error: 'Failed to fetch habit badges' });
  }
});

/**
 * Get skills due for retention check
 * GET /api/mastery/retention-checks-due
 */
router.get('/retention-checks-due', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const skillsDue = getSkillsDueForRetention(user.skillMastery);

    // Get skill details
    const skillIds = skillsDue.map(s => s.skillId);
    const skills = await Skill.find({ skillId: { $in: skillIds } }).lean();

    const enrichedSkillsDue = skillsDue.map(({ skillId, skill }) => {
      const skillData = skills.find(s => s.skillId === skillId);
      return {
        skillId,
        skillName: skillData?.displayName || skillId,
        currentTier: skill.currentTier,
        daysSinceLastPractice: Math.floor(
          (new Date() - new Date(skill.lastPracticed)) / (1000 * 60 * 60 * 24)
        ),
        lastAccuracy: skill.pillars?.accuracy?.percentage || 0,
        nextRetentionCheck: skill.pillars?.retention?.nextRetentionCheck
      };
    });

    res.json({
      success: true,
      skillsDue: enrichedSkillsDue,
      count: skillsDue.length
    });

  } catch (error) {
    console.error('Error fetching retention checks:', error);
    res.status(500).json({ error: 'Failed to fetch retention checks' });
  }
});

/**
 * Perform retention check for a skill
 * POST /api/mastery/retention-check
 */
router.post('/retention-check', isAuthenticated, async (req, res) => {
  try {
    const { skillId, correct, total } = req.body;

    if (!skillId || typeof correct !== 'number' || typeof total !== 'number') {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const skillMastery = user.skillMastery.get(skillId);
    if (!skillMastery) {
      return res.status(404).json({ error: 'Skill mastery not found' });
    }

    const accuracy = correct / total;

    // Perform retention check
    const updatedSkill = performRetentionCheck(skillMastery, {
      correct,
      total,
      accuracy
    });

    // Update user
    user.skillMastery.set(skillId, updatedSkill);
    await user.save();

    res.json({
      success: true,
      passed: accuracy >= 0.80,
      accuracy: Math.round(accuracy * 100),
      newStatus: updatedSkill.status,
      message: updatedSkill.status === 're-fragile' ?
        "Time for a quick refresh! You've got this—just needs a tune-up." :
        "Retention check passed! Skill is still solid."
    });

  } catch (error) {
    console.error('Error performing retention check:', error);
    res.status(500).json({ error: 'Failed to perform retention check' });
  }
});

/**
 * Get complete Master Mode dashboard data
 * GET /api/mastery/dashboard
 */
router.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Count badges by tier
    const skillBadgeTiers = {
      bronze: 0,
      silver: 0,
      gold: 0,
      diamond: 0
    };

    for (const [skillId, skill] of user.skillMastery.entries()) {
      if (skill.currentTier && skill.currentTier !== 'none') {
        skillBadgeTiers[skill.currentTier]++;
      }
    }

    // Get retention checks due
    const skillsDue = getSkillsDueForRetention(user.skillMastery);

    // Calculate overall mastery percentage
    const masteredSkills = Array.from(user.skillMastery.values()).filter(
      s => s.status === 'mastered'
    ).length;
    const totalSkills = user.skillMastery.size;

    res.json({
      success: true,
      dashboard: {
        skillBadges: {
          tiers: skillBadgeTiers,
          total: Object.values(skillBadgeTiers).reduce((a, b) => a + b, 0)
        },
        strategyBadges: {
          earned: (user.strategyBadges || []).length,
          total: getAllStrategyBadges().length
        },
        habitBadges: {
          earned: (user.habitBadges || []).length,
          total: getAllHabitBadges().length
        },
        mastery: {
          masteredSkills,
          totalSkills,
          percentage: totalSkills > 0 ? Math.round((masteredSkills / totalSkills) * 100) : 0
        },
        streaks: {
          current: user.dailyQuests?.currentStreak || 0,
          longest: user.dailyQuests?.longestStreak || 0
        },
        retentionChecks: {
          due: skillsDue.length
        }
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// ============================================================================
// MASTER MODE: PATTERN BADGES (Abstraction-Based Progression)
// ============================================================================

const {
  getAllPatternBadges,
  getPatternBadge,
  getVisibleTiers,
  getCurrentTier,
  getNextMilestone,
  calculatePatternProgress,
  getPatternStatus
} = require('../utils/patternBadges');

const {
  inferMasteryFromHigherTier,
  applyInferredMastery,
  shouldTriggerInference,
  preventInferenceCascade,
  getInferenceSummary
} = require('../utils/masteryInference');

/**
 * Get pattern badge map (dynamic, based on grade level)
 * GET /api/mastery/pattern-badges
 */
router.get('/pattern-badges', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Parse grade level to number (e.g., "9th Grade" → 9)
    const gradeMatch = user.gradeLevel?.match(/(\d+)/);
    const gradeLevel = gradeMatch ? parseInt(gradeMatch[1]) : 9;  // Default to 9th

    const allPatterns = getAllPatternBadges();

    // Build pattern badge map
    const patternBadges = allPatterns.map(pattern => {
      const currentTier = getCurrentTier(pattern.patternId, user.skillMastery);
      const visibleTiers = getVisibleTiers(pattern.patternId, gradeLevel);
      const nextMilestone = getNextMilestone(pattern.patternId, currentTier, user.skillMastery);
      const progress = calculatePatternProgress(pattern.patternId, currentTier, user.skillMastery);
      const status = getPatternStatus(pattern.patternId, currentTier, user.skillMastery);

      // Get user's pattern progress
      const userProgress = user.patternProgress?.get(pattern.patternId) || {
        currentTier: 0,
        status: 'locked'
      };

      return {
        patternId: pattern.patternId,
        name: pattern.name,
        description: pattern.description,
        icon: pattern.icon,
        color: pattern.color,
        currentTier,
        highestTierReached: userProgress.highestTierReached || currentTier,
        visibleTiers: visibleTiers.map(tier => ({
          tier: tier.tier,
          name: tier.name,
          description: tier.description,
          gradeRange: tier.gradeRange,
          milestoneCount: tier.milestones.length
        })),
        nextMilestone: nextMilestone ? {
          milestoneId: nextMilestone.milestoneId,
          name: nextMilestone.name,
          description: nextMilestone.description,
          requiredAccuracy: nextMilestone.requiredAccuracy,
          requiredProblems: nextMilestone.requiredProblems
        } : null,
        progress,
        status,
        lastPracticed: userProgress.lastPracticed
      };
    });

    // Get inference summary
    const inferenceSummary = getInferenceSummary(user.skillMastery);

    res.json({
      success: true,
      patternBadges,
      gradeLevel,
      inferenceSummary
    });

  } catch (error) {
    console.error('Error fetching pattern badges:', error);
    res.status(500).json({ error: 'Failed to fetch pattern badges' });
  }
});

/**
 * Get detailed pattern status
 * GET /api/mastery/pattern/:patternId
 */
router.get('/pattern/:patternId', isAuthenticated, async (req, res) => {
  try {
    const { patternId } = req.params;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const pattern = getPatternBadge(patternId);
    if (!pattern) {
      return res.status(404).json({ error: 'Pattern not found' });
    }

    const currentTier = getCurrentTier(patternId, user.skillMastery);
    const userProgress = user.patternProgress?.get(patternId);

    // Get all milestones across all tiers with completion status
    const allMilestones = [];
    for (const tier of pattern.tiers) {
      for (const milestone of tier.milestones) {
        const completed = milestone.skillIds.every(skillId => {
          const mastery = user.skillMastery.get(skillId);
          return mastery && (mastery.status === 'mastered' || mastery.masteryType === 'inferred');
        });

        const masteryType = milestone.skillIds.some(skillId => {
          const mastery = user.skillMastery.get(skillId);
          return mastery && mastery.masteryType === 'inferred';
        }) ? 'inferred' : 'verified';

        allMilestones.push({
          tier: tier.tier,
          tierName: tier.name,
          milestoneId: milestone.milestoneId,
          name: milestone.name,
          description: milestone.description,
          completed,
          masteryType: completed ? masteryType : null,
          completedDate: userProgress?.milestonesCompleted?.find(m => m.milestoneId === milestone.milestoneId)?.completedDate
        });
      }
    }

    res.json({
      success: true,
      pattern: {
        patternId: pattern.patternId,
        name: pattern.name,
        description: pattern.description,
        icon: pattern.icon,
        color: pattern.color,
        currentTier,
        highestTierReached: userProgress?.highestTierReached || 0,
        status: userProgress?.status || 'locked',
        tiers: pattern.tiers.length,
        milestones: allMilestones,
        tierUpgradeHistory: userProgress?.tierUpgradeHistory || []
      }
    });

  } catch (error) {
    console.error('Error fetching pattern details:', error);
    res.status(500).json({ error: 'Failed to fetch pattern details' });
  }
});

/**
 * Update pattern progress after skill mastery
 * POST /api/mastery/update-pattern-progress
 */
router.post('/update-pattern-progress', isAuthenticated, async (req, res) => {
  try {
    const { skillId } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get skill to determine pattern
    const skill = await Skill.findOne({ skillId }).lean();
    if (!skill || !skill.patternId || !skill.tier) {
      return res.json({ success: true, message: 'Skill not part of pattern system' });
    }

    const patternId = skill.patternId;
    const skillMastery = user.skillMastery.get(skillId);

    // Check if should trigger inference
    if (shouldTriggerInference(skillMastery)) {
      const allSkills = await Skill.find().lean();
      let inferences = inferMasteryFromHigherTier(skillId, user.skillMastery, allSkills);

      // Prevent inference cascade (max 2 tier gap)
      inferences = preventInferenceCascade(inferences, 2);

      // Apply inferences
      const updates = applyInferredMastery(user.skillMastery, inferences);

      console.log(`Inferred ${updates.length} skills from mastery of ${skillId}`);
    }

    // Update pattern progress
    let patternProgress = user.patternProgress.get(patternId);
    if (!patternProgress) {
      patternProgress = {
        patternId,
        currentTier: 0,
        highestTierReached: 0,
        tierUpgradeHistory: [],
        milestonesCompleted: [],
        status: 'locked'
      };
    }

    // Recalculate current tier
    const newTier = getCurrentTier(patternId, user.skillMastery);
    const oldTier = patternProgress.currentTier;

    if (newTier > oldTier) {
      // Tier upgrade!
      patternProgress.currentTier = newTier;
      patternProgress.highestTierReached = Math.max(newTier, patternProgress.highestTierReached || 0);
      patternProgress.tierUpgradeHistory.push({
        fromTier: oldTier,
        toTier: newTier,
        upgradeDate: new Date()
      });
    }

    patternProgress.lastPracticed = new Date();
    patternProgress.status = getPatternStatus(patternId, newTier, user.skillMastery);

    user.patternProgress.set(patternId, patternProgress);
    await user.save();

    res.json({
      success: true,
      patternId,
      oldTier,
      newTier,
      tierUpgraded: newTier > oldTier,
      status: patternProgress.status,
      message: newTier > oldTier ? `Pattern tier upgraded: ${oldTier} → ${newTier}` : 'Pattern progress updated'
    });

  } catch (error) {
    console.error('Error updating pattern progress:', error);
    res.status(500).json({ error: 'Failed to update pattern progress' });
  }
});

module.exports = router;
