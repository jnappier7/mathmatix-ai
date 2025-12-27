// utils/masteryEngine.js
// Master Mode: Mastery State Machine & 4-Pillar Calculation Engine

/**
 * MASTERY STATE MACHINE
 *
 * States:
 * - locked: Prerequisites not met
 * - ready: Prerequisites met, can start learning
 * - learning: Bronze tier progress (0-70% mastery score)
 * - practicing: Silver/Gold tier progress (70-90% mastery score)
 * - mastered: Gold/Diamond tier (90-100% mastery score)
 * - re-fragile: Retention check failed, needs refresh
 */

/**
 * Calculate mastery score (0-100) based on 4 pillars
 *
 * Weights:
 * - Accuracy: 40%
 * - Independence: 20%
 * - Transfer: 20%
 * - Retention: 20%
 */
function calculateMasteryScore(pillars) {
  const weights = {
    accuracy: 0.40,
    independence: 0.20,
    transfer: 0.20,
    retention: 0.20
  };

  // Pillar 1: Accuracy Score (0-1 scale)
  const accuracyScore = pillars.accuracy?.percentage || 0;

  // Pillar 2: Independence Score
  // Perfect independence = 0 hints, worst = 15 hints
  // Score decreases linearly as hints increase
  const hintsUsed = pillars.independence?.hintsUsed || 0;
  const independenceScore = Math.max(0, 1 - (hintsUsed / 15));

  // Pillar 3: Transfer Score
  // Perfect transfer = 3+ contexts attempted
  const contextsAttempted = pillars.transfer?.contextsAttempted?.length || 0;
  const contextsRequired = pillars.transfer?.contextsRequired || 3;
  const transferScore = Math.min(1, contextsAttempted / contextsRequired);

  // Pillar 4: Retention Score
  // Based on retention check pass rate
  const retentionChecks = pillars.retention?.retentionChecks || [];
  let retentionScore = 0;

  if (retentionChecks.length > 0) {
    const passedChecks = retentionChecks.filter(c => c.passed).length;
    retentionScore = passedChecks / retentionChecks.length;
  }

  // Weighted sum (0-100 scale)
  const masteryScore = (
    accuracyScore * weights.accuracy +
    independenceScore * weights.independence +
    transferScore * weights.transfer +
    retentionScore * weights.retention
  ) * 100;

  return Math.round(masteryScore);
}

/**
 * Determine mastery state based on pillars and prerequisites
 */
function calculateMasteryState(skill, userSkillMastery) {
  // Check prerequisites
  const prerequisites = skill.prerequisites || [];
  const allPrerequisitesMastered = prerequisites.every(prereqId => {
    const prereqSkill = userSkillMastery.get(prereqId);
    return prereqSkill && prereqSkill.status === 'mastered';
  });

  if (!allPrerequisitesMastered) {
    return 'locked';
  }

  // Never attempted
  if (!skill.totalAttempts || skill.totalAttempts === 0) {
    return 'ready';
  }

  // Check retention (can fall out of mastery)
  if (skill.status === 'mastered' && skill.pillars?.retention?.failed) {
    return 're-fragile';
  }

  // Calculate mastery score
  const masteryScore = calculateMasteryScore(skill.pillars || {});

  // Check if all pillars meet mastery thresholds
  const meetsAccuracy = (skill.pillars?.accuracy?.percentage || 0) >= 0.90;
  const meetsIndependence = (skill.pillars?.independence?.hintsUsed || 0) <= 3;
  const meetsTransfer = (skill.pillars?.transfer?.contextsAttempted?.length || 0) >= 3;
  const meetsRetention = skill.pillars?.retention?.retentionChecks?.length > 0 &&
    skill.pillars.retention.retentionChecks.every(c => c.passed);

  if (meetsAccuracy && meetsIndependence && meetsTransfer && meetsRetention) {
    return 'mastered';
  }

  // Partial progress
  if (masteryScore >= 70) {
    return 'practicing';
  }

  return 'learning';
}

/**
 * Check badge tier eligibility based on mastery score and pillars
 *
 * Tiers:
 * - Bronze: 70% accuracy, 6-8 problems, hints allowed
 * - Silver: 80% accuracy, 10-12 problems, limited hints
 * - Gold: 90% accuracy, 12-15 problems, minimal hints, 3+ contexts
 * - Diamond: 95% accuracy, 15+ problems, zero hints, retention verified
 */
function checkTierEligibility(skill) {
  const pillars = skill.pillars || {};
  const accuracy = pillars.accuracy?.percentage || 0;
  const hintsUsed = pillars.independence?.hintsUsed || 0;
  const contextsCount = pillars.transfer?.contextsAttempted?.length || 0;
  const problemsAttempted = pillars.accuracy?.total || 0;
  const retentionPassed = pillars.retention?.retentionChecks?.some(c => c.passed) || false;

  // Diamond Tier
  if (
    accuracy >= 0.95 &&
    problemsAttempted >= 15 &&
    hintsUsed === 0 &&
    contextsCount >= 4 &&
    retentionPassed
  ) {
    return 'diamond';
  }

  // Gold Tier
  if (
    accuracy >= 0.90 &&
    problemsAttempted >= 12 &&
    hintsUsed <= 3 &&
    contextsCount >= 3
  ) {
    return 'gold';
  }

  // Silver Tier
  if (
    accuracy >= 0.80 &&
    problemsAttempted >= 10 &&
    hintsUsed <= 6
  ) {
    return 'silver';
  }

  // Bronze Tier
  if (
    accuracy >= 0.70 &&
    problemsAttempted >= 6
  ) {
    return 'bronze';
  }

  return 'none';
}

/**
 * Calculate when next retention check should occur
 *
 * Schedule:
 * - Bronze/Silver: 7 days after last practice
 * - Gold: 14 days after last practice
 * - Diamond: 30 days after last practice
 */
function scheduleRetentionCheck(tier, lastPracticed) {
  if (!lastPracticed) return null;

  const lastPracticedDate = new Date(lastPracticed);
  const now = new Date();

  let daysUntilCheck;
  switch (tier) {
    case 'bronze':
    case 'silver':
      daysUntilCheck = 7;
      break;
    case 'gold':
      daysUntilCheck = 14;
      break;
    case 'diamond':
      daysUntilCheck = 30;
      break;
    default:
      daysUntilCheck = 7;
  }

  const nextCheck = new Date(lastPracticedDate);
  nextCheck.setDate(nextCheck.getDate() + daysUntilCheck);

  return nextCheck;
}

/**
 * Update skill mastery after problem attempt
 */
function updateSkillMastery(skill, attemptData) {
  const { correct, hintUsed, problemContext, responseTime } = attemptData;

  // Initialize pillars if not exists
  if (!skill.pillars) {
    skill.pillars = {
      accuracy: { correct: 0, total: 0, percentage: 0, threshold: 0.90 },
      independence: { hintsUsed: 0, hintsAvailable: 15, hintThreshold: 3, autoStepUsed: false },
      transfer: { contextsAttempted: [], contextsRequired: 3, formatVariety: false },
      retention: { retentionChecks: [], failed: false }
    };
  }

  // Update Pillar 1: Accuracy
  skill.pillars.accuracy.total = (skill.pillars.accuracy.total || 0) + 1;
  if (correct) {
    skill.pillars.accuracy.correct = (skill.pillars.accuracy.correct || 0) + 1;
  }
  skill.pillars.accuracy.percentage = skill.pillars.accuracy.correct / skill.pillars.accuracy.total;

  // Update Pillar 2: Independence
  if (hintUsed) {
    skill.pillars.independence.hintsUsed = (skill.pillars.independence.hintsUsed || 0) + 1;
  }

  // Update Pillar 3: Transfer
  if (problemContext && !skill.pillars.transfer.contextsAttempted.includes(problemContext)) {
    skill.pillars.transfer.contextsAttempted.push(problemContext);
  }
  skill.pillars.transfer.formatVariety = skill.pillars.transfer.contextsAttempted.length >= 2;

  // Update last practiced
  skill.lastPracticed = new Date();
  skill.pillars.retention.lastPracticed = new Date();

  // Update total attempts and consecutive correct
  skill.totalAttempts = (skill.totalAttempts || 0) + 1;
  if (correct) {
    skill.consecutiveCorrect = (skill.consecutiveCorrect || 0) + 1;
  } else {
    skill.consecutiveCorrect = 0;
  }

  // Recalculate mastery score
  skill.masteryScore = calculateMasteryScore(skill.pillars);

  // Update tier
  skill.currentTier = checkTierEligibility(skill);

  // Schedule next retention check
  skill.pillars.retention.nextRetentionCheck = scheduleRetentionCheck(
    skill.currentTier,
    skill.lastPracticed
  );

  return skill;
}

/**
 * Perform retention check for a skill
 */
function performRetentionCheck(skill, checkResults) {
  const { correct, total, accuracy } = checkResults;

  const retentionCheck = {
    checkDate: new Date(),
    daysSinceLastPractice: Math.floor(
      (new Date() - new Date(skill.lastPracticed)) / (1000 * 60 * 60 * 24)
    ),
    accuracy: accuracy,
    passed: accuracy >= 0.80  // 80% required to pass
  };

  skill.pillars.retention.retentionChecks.push(retentionCheck);

  // If failed, mark skill as re-fragile
  if (!retentionCheck.passed) {
    skill.pillars.retention.failed = true;
    skill.status = 're-fragile';
    skill.masteryScore = Math.max(70, skill.masteryScore - 15);  // Drop score
  }

  return skill;
}

/**
 * Get mastery status message for student-facing UI
 */
function getMasteryMessage(status, tier) {
  const messages = {
    locked: "Complete prerequisite skills first to unlock this badge.",
    ready: "Ready to start! This builds on what you already know.",
    learning: tier === 'bronze' ? "Getting started" : "Take your time. Mistakes help you learn.",
    practicing: tier === 'silver' ? "Solid progress" : "Getting reliable",
    mastered: tier === 'gold' ?
      "This skill is reliable. You'll see it mixed with others soon." :
      "You own this. You could teach someone else.",
    're-fragile': "Time for a quick refresh! You've got this—just needs a tune-up."
  };

  return messages[status] || "Keep practicing!";
}

/**
 * Get tier upgrade message for badge ceremony
 */
function getTierUpgradeMessage(fromTier, toTier) {
  const messages = {
    'none-to-bronze': "You're getting the hang of this! Keep practicing with support.",
    'bronze-to-silver': "You can do this independently now. Let's add some variety.",
    'silver-to-gold': "This skill is now reliable.\nYou'll see it again. Don't panic.",
    'gold-to-diamond': "You can teach this now.\nIt's yours."
  };

  const key = `${fromTier}-to-${toTier}`;
  return messages[key] || "Skill upgraded!";
}

/**
 * Calculate pillar progress percentages for UI display
 */
function calculatePillarProgress(pillars) {
  // Accuracy: based on percentage
  const accuracyProgress = Math.round((pillars.accuracy?.percentage || 0) * 100);

  // Independence: based on hints remaining
  const hintsUsed = pillars.independence?.hintsUsed || 0;
  const hintsAvailable = pillars.independence?.hintsAvailable || 15;
  const independenceProgress = Math.round(Math.max(0, (1 - (hintsUsed / hintsAvailable))) * 100);

  // Transfer: based on contexts attempted
  const contextsAttempted = pillars.transfer?.contextsAttempted?.length || 0;
  const contextsRequired = pillars.transfer?.contextsRequired || 3;
  const transferProgress = Math.round(Math.min(100, (contextsAttempted / contextsRequired) * 100));

  // Retention: based on checks passed
  const retentionChecks = pillars.retention?.retentionChecks || [];
  let retentionProgress = 0;
  if (retentionChecks.length > 0) {
    const passedChecks = retentionChecks.filter(c => c.passed).length;
    retentionProgress = Math.round((passedChecks / retentionChecks.length) * 100);
  }

  return {
    accuracy: accuracyProgress,
    independence: independenceProgress,
    transfer: transferProgress,
    retention: retentionProgress
  };
}

/**
 * Check if tier upgrade occurred
 */
function checkTierUpgrade(oldTier, newTier) {
  const tierOrder = ['none', 'bronze', 'silver', 'gold', 'diamond'];
  const oldIndex = tierOrder.indexOf(oldTier);
  const newIndex = tierOrder.indexOf(newTier);

  return newIndex > oldIndex ? {
    upgraded: true,
    fromTier: oldTier,
    toTier: newTier,
    message: getTierUpgradeMessage(oldTier, newTier)
  } : { upgraded: false };
}

/**
 * Get skills due for retention check
 */
function getSkillsDueForRetention(userSkillMastery) {
  const now = new Date();
  const skillsDue = [];

  for (const [skillId, skill] of userSkillMastery.entries()) {
    if (skill.status === 'mastered' && skill.pillars?.retention?.nextRetentionCheck) {
      const nextCheck = new Date(skill.pillars.retention.nextRetentionCheck);
      if (nextCheck <= now) {
        skillsDue.push({ skillId, skill });
      }
    }
  }

  return skillsDue;
}

/**
 * Initialize skill mastery for new skill
 */
function initializeSkillMastery(skillId) {
  return {
    status: 'locked',
    masteryScore: 0,
    totalAttempts: 0,
    consecutiveCorrect: 0,
    currentTier: 'none',
    pillars: {
      accuracy: {
        correct: 0,
        total: 0,
        percentage: 0,
        threshold: 0.90
      },
      independence: {
        hintsUsed: 0,
        hintsAvailable: 15,
        hintThreshold: 3,
        autoStepUsed: false
      },
      transfer: {
        contextsAttempted: [],
        contextsRequired: 3,
        formatVariety: false
      },
      retention: {
        retentionChecks: [],
        nextRetentionCheck: null,
        failed: false
      }
    },
    fluencyTracking: {
      recentTimes: [],
      speedTrend: 'unknown'
    }
  };
}

module.exports = {
  calculateMasteryScore,
  calculateMasteryState,
  checkTierEligibility,
  scheduleRetentionCheck,
  updateSkillMastery,
  performRetentionCheck,
  getMasteryMessage,
  getTierUpgradeMessage,
  calculatePillarProgress,
  checkTierUpgrade,
  getSkillsDueForRetention,
  initializeSkillMastery
};
