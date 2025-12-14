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

// ============================================================================
// PHASE 2: AI INTERVIEW PROBE
// ============================================================================

/**
 * Generate interview question based on screener results
 * POST /api/mastery/interview-question
 */
router.post('/interview-question', async (req, res) => {
  try {
    const { screenerResults, phase } = req.body;

    if (!screenerResults || !screenerResults.theta) {
      return res.status(400).json({ error: 'Missing screener results' });
    }

    // Get frontier skills from screener
    const frontierSkills = screenerResults.frontierSkills || [];

    if (frontierSkills.length === 0) {
      return res.status(400).json({ error: 'No frontier skills identified' });
    }

    // Select a frontier skill to probe
    const targetSkill = frontierSkills[0];

    // Generate interview question context
    const interviewContext = {
      skillId: targetSkill,
      theta: screenerResults.theta,
      phase: phase || 'initial',
      interviewType: 'frontier-probe'
    };

    // Build AI prompt for interview question
    const question = await generateInterviewQuestion(interviewContext);

    res.json({
      success: true,
      question,
      skillId: targetSkill,
      context: interviewContext
    });

  } catch (error) {
    console.error('Error generating interview question:', error);
    res.status(500).json({ error: 'Failed to generate interview question' });
  }
});

/**
 * Generate AI interview question
 */
async function generateInterviewQuestion(context) {
  const { skillId, theta, phase } = context;

  // Map skill to question types
  const questionPrompts = {
    'two-step-equations': {
      initial: `I see you're working on two-step equations. Let's go deeper.

Can you solve this problem AND explain each step?

**Problem:** 3x + 7 = 22

Show me your work and explain why you chose each operation.`,

      followUp: `Good! Now let's test your understanding. What if the equation was:

**Problem:** -2x + 5 = 13

How would your approach change? Walk me through your thinking.`
    },

    'order-of-operations': {
      initial: `Let's explore order of operations at a deeper level.

**Problem:** 6 + 3 × (8 - 2)

Solve this AND explain: Why do we multiply before we add? What would happen if we did it the other way?`,

      followUp: `Interesting! Now consider this:

**Problem:** (6 + 3) × 8 - 2

How do the parentheses change everything? Explain the difference.`
    },

    'combining-like-terms': {
      initial: `Let's dive into combining like terms.

**Problem:** Simplify 4x + 7 - 2x + 3

Not just the answer - explain what "like terms" means and WHY we can combine them.`,

      followUp: `Great! Now a harder one:

**Problem:** 3x² + 5x - 2x² + 7x

Why CAN'T we combine x² and x terms? Explain your reasoning.`
    }
  };

  // Get question for this skill
  const skillQuestions = questionPrompts[skillId] || {
    initial: `Let's explore your understanding of ${skillId.replace(/-/g, ' ')}.

Can you solve a problem in this area AND explain your reasoning?`,
    followUp: `Good! Let's probe deeper into your understanding.`
  };

  return skillQuestions[phase] || skillQuestions.initial;
}

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

    // Initialize badge attempt in user profile
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

module.exports = router;
