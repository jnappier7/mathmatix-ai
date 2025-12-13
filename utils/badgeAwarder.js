/**
 * BADGE AWARDER UTILITY
 *
 * Auto-awards badges based on demonstrated mastery during screener
 * Similar to ALEKS: fills in the "pie" with what students already know
 */

/**
 * Badge catalog matching routes/mastery.js
 * Maps skillIds to their badge configurations
 */
const BADGE_CATALOG = {
  'integer-all-operations': [
    { badgeId: 'integer-operations-bronze', name: 'Integer Explorer', tier: 'bronze', requiredAccuracy: 0.80, requiredTheta: -2.0 },
    { badgeId: 'integer-operations-silver', name: 'Integer Master', tier: 'silver', requiredAccuracy: 0.85, requiredTheta: -1.0 }
  ],
  'fraction-operations': [
    { badgeId: 'fraction-operations-bronze', name: 'Fraction Apprentice', tier: 'bronze', requiredAccuracy: 0.75, requiredTheta: -1.5 },
    { badgeId: 'fraction-operations-silver', name: 'Fraction Expert', tier: 'silver', requiredAccuracy: 0.85, requiredTheta: -0.5 }
  ],
  'decimal-operations': [
    { badgeId: 'decimal-operations-bronze', name: 'Decimal Beginner', tier: 'bronze', requiredAccuracy: 0.80, requiredTheta: -1.5 }
  ],
  'one-step-equations-addition': [
    { badgeId: 'one-step-equations-bronze', name: 'Equation Starter', tier: 'bronze', requiredAccuracy: 0.80, requiredTheta: -1.5 }
  ],
  'one-step-equations-multiplication': [
    { badgeId: 'one-step-equations-silver', name: 'One-Step Solver', tier: 'silver', requiredAccuracy: 0.85, requiredTheta: -0.5 }
  ],
  'two-step-equations': [
    { badgeId: 'two-step-equations-bronze', name: 'Two-Step Beginner', tier: 'bronze', requiredAccuracy: 0.75, requiredTheta: 0.0 },
    { badgeId: 'two-step-equations-silver', name: 'Two-Step Champion', tier: 'silver', requiredAccuracy: 0.85, requiredTheta: 0.5 },
    { badgeId: 'two-step-equations-gold', name: 'Two-Step Expert', tier: 'gold', requiredAccuracy: 0.90, requiredTheta: 1.0 }
  ],
  'combining-like-terms': [
    { badgeId: 'combining-like-terms-bronze', name: 'Term Combiner', tier: 'bronze', requiredAccuracy: 0.80, requiredTheta: -0.5 },
    { badgeId: 'combining-like-terms-silver', name: 'Expression Simplifier', tier: 'silver', requiredAccuracy: 0.85, requiredTheta: 0.5 }
  ],
  'distributive-property': [
    { badgeId: 'distributive-property-silver', name: 'Distributive Master', tier: 'silver', requiredAccuracy: 0.85, requiredTheta: 1.0 }
  ],
  'solving-multi-step-equations': [
    { badgeId: 'multi-step-equations-silver', name: 'Multi-Step Solver', tier: 'silver', requiredAccuracy: 0.85, requiredTheta: 1.5 },
    { badgeId: 'multi-step-equations-gold', name: 'Equation Master', tier: 'gold', requiredAccuracy: 0.90, requiredTheta: 2.0 }
  ],
  'area-and-perimeter': [
    { badgeId: 'area-perimeter-bronze', name: 'Shape Measurer', tier: 'bronze', requiredAccuracy: 0.80, requiredTheta: -1.0 },
    { badgeId: 'area-perimeter-silver', name: 'Geometry Expert', tier: 'silver', requiredAccuracy: 0.85, requiredTheta: 0.5 }
  ],
  'understanding-ratios': [
    { badgeId: 'ratios-bronze', name: 'Ratio Explorer', tier: 'bronze', requiredAccuracy: 0.80, requiredTheta: -0.5 }
  ],
  'solving-proportions': [
    { badgeId: 'proportions-silver', name: 'Proportion Solver', tier: 'silver', requiredAccuracy: 0.85, requiredTheta: 0.5 }
  ],
  'order-of-operations': [
    { badgeId: 'order-operations-bronze', name: 'PEMDAS Beginner', tier: 'bronze', requiredAccuracy: 0.80, requiredTheta: -1.0 },
    { badgeId: 'order-operations-silver', name: 'Order Expert', tier: 'silver', requiredAccuracy: 0.85, requiredTheta: 0.0 },
    { badgeId: 'order-operations-gold', name: 'PEMDAS Master', tier: 'gold', requiredAccuracy: 0.90, requiredTheta: 1.0 }
  ]
};

/**
 * Award badges for skills mastered during screener
 * Like ALEKS: fill in what they already know
 *
 * @param {Object} user - User document
 * @param {Object} screenerSession - Active screener session with response history
 * @param {Array} masteredSkills - Skills identified as mastered
 * @param {Number} theta - Student's ability estimate
 * @returns {Array} Badges that were awarded
 */
async function awardBadgesForSkills(user, screenerSession, masteredSkills, theta) {
  const earnedBadges = [];

  // Initialize badges array if needed
  if (!user.badges) {
    user.badges = [];
  }

  // Check each mastered skill for badge eligibility
  for (const skillId of masteredSkills) {
    const badgeConfigs = BADGE_CATALOG[skillId];

    if (!badgeConfigs) {
      console.log(`No badges configured for skill: ${skillId}`);
      continue;
    }

    // Calculate performance metrics for this skill during screener
    const skillPerformance = calculateSkillPerformance(screenerSession, skillId);

    // Award appropriate tier badge based on performance
    for (const badge of badgeConfigs) {
      // Check if badge already earned
      const alreadyEarned = user.badges.find(b => b.badgeId === badge.badgeId);
      if (alreadyEarned) {
        continue;
      }

      // Award if:
      // 1. Student's theta is high enough
      // 2. Performance during screener meets requirements
      // 3. Sufficient questions were answered for this skill
      const meetsTheta = theta >= badge.requiredTheta;
      const meetsAccuracy = skillPerformance.accuracy >= badge.requiredAccuracy;
      const sufficientData = skillPerformance.questionsAnswered >= 3;

      if (meetsTheta && meetsAccuracy && sufficientData) {
        // Award the badge!
        user.badges.push({
          badgeId: badge.badgeId,
          earnedDate: new Date(),
          score: Math.round(skillPerformance.accuracy * 100),
          earnedVia: 'screener-testout'
        });

        earnedBadges.push({
          ...badge,
          earnedDate: new Date(),
          score: Math.round(skillPerformance.accuracy * 100),
          skillId: skillId
        });

        console.log(`✅ Awarded ${badge.name} for ${skillId} (${skillPerformance.accuracy * 100}% accuracy)`);

        // Award higher tier only if this tier earned
        // (Progressive unlock: must earn bronze before silver, etc.)
        break;
      }
    }
  }

  return earnedBadges;
}

/**
 * Calculate student's performance on a specific skill during screener
 *
 * @param {Object} session - Screener session
 * @param {String} skillId - Skill to analyze
 * @returns {Object} Performance metrics
 */
function calculateSkillPerformance(session, skillId) {
  const skillResponses = session.responses.filter(r =>
    r.problem && (r.problem.skillId === skillId || r.problem.metadata?.skillTag === skillId)
  );

  if (skillResponses.length === 0) {
    return { accuracy: 0, questionsAnswered: 0, correct: 0, incorrect: 0 };
  }

  const correct = skillResponses.filter(r => r.correct).length;
  const incorrect = skillResponses.length - correct;
  const accuracy = correct / skillResponses.length;

  return {
    accuracy,
    questionsAnswered: skillResponses.length,
    correct,
    incorrect
  };
}

/**
 * Generate a summary of badges earned during screener
 * For display in completion screen
 *
 * @param {Array} earnedBadges - Badges that were earned
 * @returns {String} Summary message
 */
function generateBadgeSummary(earnedBadges) {
  if (earnedBadges.length === 0) {
    return "You're ready to start earning badges! Choose from the badge map to begin.";
  }

  const tierCounts = {
    bronze: earnedBadges.filter(b => b.tier === 'bronze').length,
    silver: earnedBadges.filter(b => b.tier === 'silver').length,
    gold: earnedBadges.filter(b => b.tier === 'gold').length
  };

  const parts = [];
  if (tierCounts.bronze > 0) parts.push(`${tierCounts.bronze} Bronze 🥉`);
  if (tierCounts.silver > 0) parts.push(`${tierCounts.silver} Silver 🥈`);
  if (tierCounts.gold > 0) parts.push(`${tierCounts.gold} Gold 🥇`);

  return `🎉 You tested out and earned ${earnedBadges.length} badge${earnedBadges.length > 1 ? 's' : ''}: ${parts.join(', ')}!

${earnedBadges.map(b => `✅ ${b.name} (${b.score}%)`).join('\n')}

Great start! Many more badges await in the Badge Map.`;
}

module.exports = {
  awardBadgesForSkills,
  generateBadgeSummary,
  BADGE_CATALOG
};
