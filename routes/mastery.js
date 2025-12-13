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
  const badges = [];

  // Badge difficulty tiers
  const badgeTiers = [
    // Foundation badges (θ < 0)
    {
      minTheta: -2,
      maxTheta: 0,
      badges: [
        {
          id: 'integer-master',
          name: 'Integer Master',
          description: 'Master all four operations with integers',
          difficulty: 'Foundation',
          skillId: 'integer-all-operations',
          requiredAccuracy: 0.9,
          requiredProblems: 10
        },
        {
          id: 'one-step-solver',
          name: 'One-Step Solver',
          description: 'Solve one-step equations consistently',
          difficulty: 'Foundation',
          skillId: 'one-step-equations-addition',
          requiredAccuracy: 0.85,
          requiredProblems: 8
        }
      ]
    },

    // Intermediate badges (θ 0 to 1)
    {
      minTheta: -0.5,
      maxTheta: 1.5,
      badges: [
        {
          id: 'two-step-champion',
          name: 'Two-Step Champion',
          description: 'Demonstrate mastery of two-step equations',
          difficulty: 'Intermediate',
          skillId: 'two-step-equations',
          requiredAccuracy: 0.9,
          requiredProblems: 12
        },
        {
          id: 'order-expert',
          name: 'Order of Operations Expert',
          description: 'Execute order of operations flawlessly',
          difficulty: 'Intermediate',
          skillId: 'order-of-operations',
          requiredAccuracy: 0.85,
          requiredProblems: 10
        }
      ]
    },

    // Advanced badges (θ > 1)
    {
      minTheta: 0.5,
      maxTheta: 3,
      badges: [
        {
          id: 'distributive-master',
          name: 'Distributive Property Master',
          description: 'Apply distributive property with confidence',
          difficulty: 'Advanced',
          skillId: 'distributive-property',
          requiredAccuracy: 0.9,
          requiredProblems: 10
        },
        {
          id: 'multi-step-solver',
          name: 'Multi-Step Equation Solver',
          description: 'Tackle complex multi-step equations',
          difficulty: 'Advanced',
          skillId: 'solving-multi-step-equations',
          requiredAccuracy: 0.85,
          requiredProblems: 12
        }
      ]
    }
  ];

  // Filter badges appropriate for student's level
  for (const tier of badgeTiers) {
    if (theta >= tier.minTheta && theta <= tier.maxTheta) {
      badges.push(...tier.badges);
    }
  }

  // Add progress if user already started working on badges
  const earnedBadges = user.badges || [];

  badges.forEach(badge => {
    const earned = earnedBadges.find(b => b.badgeId === badge.id);
    if (earned) {
      badge.earned = true;
      badge.earnedDate = earned.earnedDate;
      badge.score = earned.score;
    } else {
      badge.earned = false;
    }
  });

  return badges;
}

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
