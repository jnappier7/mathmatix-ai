// utils/masteryInference.js
// Mastery Inference Engine: Infer lower-tier mastery from higher-tier success

/**
 * INFERENCE RULES
 *
 * Core Principle: Never remediate below the abstraction level where failure occurs.
 *
 * If a student successfully demonstrates a higher-tier pattern skill,
 * infer mastery of prerequisite lower-tier skills UNLESS:
 * - They explicitly failed when directly tested, OR
 * - The skill is actively fragile
 *
 * Mastered (Verified) = Directly tested and passed
 * Mastered (Inferred) = Success at higher tier implies this skill
 *
 * Inference is generous. Repair is dignified.
 */

const { PATTERN_BADGES } = require('./patternBadges');

/**
 * Infer lower-tier mastery from higher-tier success
 */
function inferMasteryFromHigherTier(skillId, userSkillMastery, allSkills) {
  const skill = allSkills.find(s => s.skillId === skillId);
  if (!skill || !skill.patternId || !skill.tier) return [];

  const pattern = PATTERN_BADGES[skill.patternId];
  if (!pattern) return [];

  // Get all lower tiers in this pattern
  const lowerTiers = pattern.tiers.filter(t => t.tier < skill.tier);

  const inferred = [];

  lowerTiers.forEach(tier => {
    tier.milestones.forEach(milestone => {
      milestone.skillIds.forEach(prereqSkillId => {
        const prereqMastery = userSkillMastery.get(prereqSkillId);

        // Only infer if:
        // 1. Not already mastered (verified), AND
        // 2. Not explicitly failed, AND
        // 3. Not currently fragile from direct testing
        const shouldInfer =
          (!prereqMastery || prereqMastery.status !== 'mastered') &&
          (!prereqMastery || prereqMastery.status !== 're-fragile') &&
          (!prereqMastery || !prereqMastery.explicitlyFailed);

        if (shouldInfer) {
          inferred.push({
            skillId: prereqSkillId,
            inferredFrom: skillId,
            inferredTier: skill.tier,
            prerequisiteTier: tier.tier
          });
        }
      });
    });
  });

  return inferred;
}

/**
 * Apply inferred mastery to user's skill mastery map
 */
function applyInferredMastery(userSkillMastery, inferences) {
  const updates = [];

  inferences.forEach(({ skillId, inferredFrom, inferredTier, prerequisiteTier }) => {
    let mastery = userSkillMastery.get(skillId);

    if (!mastery) {
      // Initialize skill mastery as inferred
      const { initializeSkillMastery } = require('./masteryEngine');
      mastery = initializeSkillMastery(skillId);
    }

    // Mark as inferred mastery
    mastery.status = 'mastered';
    mastery.masteryType = 'inferred';
    mastery.masteryScore = 85;  // Inferred gets 85% score (solid but not perfect)
    mastery.inferredFrom = inferredFrom;
    mastery.inferredDate = new Date();
    mastery.inferredTier = inferredTier;

    // Set pillars to passing but not perfect
    if (!mastery.pillars) {
      mastery.pillars = {
        accuracy: { correct: 0, total: 0, percentage: 0.9, threshold: 0.90 },
        independence: { hintsUsed: 0, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: ['inferred'], contextsRequired: 3 },
        retention: { retentionChecks: [], failed: false }
      };
    }

    userSkillMastery.set(skillId, mastery);
    updates.push({ skillId, status: 'inferred' });
  });

  return updates;
}

/**
 * Check if a skill should trigger inference
 *
 * Conditions:
 * - Skill must be Tier 2 or higher
 * - Skill must be mastered (verified)
 * - Accuracy must be ≥85%
 * - Independence must be decent (≤5 hints)
 */
function shouldTriggerInference(skill) {
  if (!skill.tier || skill.tier < 2) return false;
  if (skill.status !== 'mastered') return false;
  if (skill.masteryType === 'inferred') return false;  // Don't cascade inferences

  const accuracy = skill.pillars?.accuracy?.percentage || 0;
  const hints = skill.pillars?.independence?.hintsUsed || 0;

  return accuracy >= 0.85 && hints <= 5;
}

/**
 * Repair strategy for inferred skills that fail
 *
 * If an inferred skill is later tested and fails:
 * 1. Mark as fragile (not locked/locked)
 * 2. Repair inside current abstraction context
 * 3. Never show "Grade 3" content to 9th grader
 */
function repairInferredSkill(skillId, currentContext, userSkillMastery) {
  const mastery = userSkillMastery.get(skillId);
  if (!mastery) return null;

  // Mark as fragile, NOT re-locked
  mastery.status = 're-fragile';
  mastery.masteryType = 'fragile-inferred';
  mastery.explicitlyFailed = true;
  mastery.failureDate = new Date();
  mastery.failureContext = currentContext;

  // Lower mastery score but keep it visible
  mastery.masteryScore = Math.max(60, mastery.masteryScore - 20);

  userSkillMastery.set(skillId, mastery);

  return {
    skillId,
    repairStrategy: 'micro-repair-in-context',
    repairContext: currentContext.tier || 2,  // Repair at current tier or Tier 2 minimum
    message: 'Quick tune-up needed. We\'ll strengthen this inside your current work.'
  };
}

/**
 * Get repair problems for fragile inferred skill
 *
 * Problems should be:
 * - At current abstraction tier (not regressive)
 * - Embedded in meaningful context
 * - Short (3-5 problems, not 20)
 */
function getRepairProblems(skillId, repairContext) {
  // This would query Problem collection with filters:
  // - skillId matches OR skillId is parent of micro-skill
  // - tier >= repairContext.tier
  // - dokLevel >= 2 (no drill-and-kill)
  // - limit to 5 problems

  return {
    skillId,
    repairTier: repairContext.tier,
    problemCount: 5,
    strategy: 'embedded-repair',
    message: 'Let\'s do 5 quick problems to lock this in.'
  };
}

/**
 * Check for inference cascade (prevent over-inference)
 *
 * Rule: Don't infer more than 2 tiers below current skill
 *
 * Example:
 * - Tier 4 skill mastered → infer Tier 2-3 (yes)
 * - Tier 4 skill mastered → infer Tier 1 (no, too far)
 */
function preventInferenceCascade(inferences, maxTierGap = 2) {
  return inferences.filter(({ inferredTier, prerequisiteTier }) => {
    return (inferredTier - prerequisiteTier) <= maxTierGap;
  });
}

/**
 * Get inference summary for a student
 */
function getInferenceSummary(userSkillMastery) {
  const summary = {
    totalInferred: 0,
    byPattern: {},
    recentInferences: []
  };

  for (const [skillId, mastery] of userSkillMastery.entries()) {
    if (mastery.masteryType === 'inferred') {
      summary.totalInferred++;

      // Group by pattern if available
      const patternId = mastery.patternId || 'unknown';
      if (!summary.byPattern[patternId]) {
        summary.byPattern[patternId] = 0;
      }
      summary.byPattern[patternId]++;

      // Track recent inferences (last 7 days)
      if (mastery.inferredDate) {
        const daysSince = Math.floor((new Date() - new Date(mastery.inferredDate)) / (1000 * 60 * 60 * 24));
        if (daysSince <= 7) {
          summary.recentInferences.push({
            skillId,
            inferredFrom: mastery.inferredFrom,
            daysAgo: daysSince
          });
        }
      }
    }
  }

  return summary;
}

/**
 * Validate inference (double-check before applying)
 *
 * Safety check: Don't infer if student has recent failures in that skill family
 */
function validateInference(skillId, userSkillMastery, recentAttempts) {
  // Check recent attempt history for this skill
  const recentFailures = recentAttempts.filter(
    attempt => attempt.skillId === skillId && !attempt.correct
  );

  // If failed in last 10 attempts, don't infer
  if (recentFailures.length > 0) {
    return {
      valid: false,
      reason: 'recent-failure',
      message: 'Student recently struggled with this skill explicitly'
    };
  }

  return { valid: true };
}

module.exports = {
  inferMasteryFromHigherTier,
  applyInferredMastery,
  shouldTriggerInference,
  repairInferredSkill,
  getRepairProblems,
  preventInferenceCascade,
  getInferenceSummary,
  validateInference
};
