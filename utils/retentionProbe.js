// utils/retentionProbe.js
// Retention Probe System: Spirals previously mastered skills to measure retention

const Skill = require('../models/skill');

/**
 * Calculate skill importance based on how many skills depend on it
 * @param {Object} skill - Skill document from database
 * @returns {number} Importance score (0-1)
 */
function calculateSkillImportance(skill) {
  // Skills that enable many other skills are more important
  const enablesCount = skill.enables?.length || 0;

  // Normalize: skills enabling 5+ others = max importance
  return Math.min(enablesCount / 5, 1.0);
}

/**
 * Calculate how "stale" a skill is (time-based decay)
 * @param {Date} lastPracticed - Last time skill was practiced
 * @returns {number} Staleness score (0-1, higher = more stale)
 */
function calculateStaleness(lastPracticed) {
  if (!lastPracticed) return 1.0; // Never practiced = maximally stale

  const daysSince = (Date.now() - lastPracticed.getTime()) / (1000 * 60 * 60 * 24);

  // Forgetting curve:
  // 0-7 days: 0.0 (fresh)
  // 30 days: 0.5 (starting to forget)
  // 90+ days: 1.0 (likely forgotten)

  if (daysSince <= 7) return 0.0;
  if (daysSince >= 90) return 1.0;

  // Exponential decay between 7-90 days
  return Math.pow((daysSince - 7) / 83, 0.7);
}

/**
 * Select mastered skills for retention probing
 * @param {Map} userSkillMastery - User's skillMastery Map
 * @param {Object} options - Selection options
 * @returns {Array<Object>} Selected skills with priority scores
 */
async function selectSkillsForRetention(userSkillMastery, options = {}) {
  const {
    count = 3,               // Number of skills to probe
    minDaysSinceLastPractice = 14,  // Don't probe skills practiced recently
    prioritizeFoundational = true    // Prioritize prerequisite skills
  } = options;

  // Get all mastered skills
  const masteredSkills = [];
  for (const [skillId, data] of userSkillMastery) {
    if (data.status === 'mastered') {
      masteredSkills.push({
        skillId,
        lastPracticed: data.lastPracticed,
        masteredDate: data.masteredDate,
        timeSincePractice: data.lastPracticed
          ? (Date.now() - data.lastPracticed.getTime()) / (1000 * 60 * 60 * 24)
          : 999
      });
    }
  }

  // Filter out recently practiced skills
  const eligibleSkills = masteredSkills.filter(s =>
    s.timeSincePractice >= minDaysSinceLastPractice
  );

  if (eligibleSkills.length === 0) {
    return [];
  }

  // Load full skill documents for importance calculation
  const skillIds = eligibleSkills.map(s => s.skillId);
  const skillDocs = await Skill.find({ skillId: { $in: skillIds } });
  const skillMap = new Map(skillDocs.map(s => [s.skillId, s]));

  // Calculate priority scores for each skill
  const scoredSkills = eligibleSkills.map(skill => {
    const skillDoc = skillMap.get(skill.skillId);
    if (!skillDoc) return null;

    const staleness = calculateStaleness(skill.lastPracticed);
    const importance = prioritizeFoundational ? calculateSkillImportance(skillDoc) : 0.5;

    // Priority = weighted combination of staleness and importance
    // 60% staleness (time-based forgetting)
    // 40% importance (prerequisite value)
    const priority = (staleness * 0.6) + (importance * 0.4);

    return {
      skillId: skill.skillId,
      displayName: skillDoc.displayName,
      course: skillDoc.course,
      category: skillDoc.category,
      lastPracticed: skill.lastPracticed,
      masteredDate: skill.masteredDate,
      daysSinceLastPractice: Math.round(skill.timeSincePractice),
      priority,
      staleness,
      importance
    };
  }).filter(s => s !== null);

  // Sort by priority (highest first) and return top N
  scoredSkills.sort((a, b) => b.priority - a.priority);

  return scoredSkills.slice(0, count);
}

/**
 * Process retention probe result
 * @param {string} userId - User ID
 * @param {string} skillId - Skill being probed
 * @param {boolean} correct - Was the probe answer correct?
 * @param {Object} userSkillMastery - User's skillMastery Map
 * @returns {Object} Updated skill status and actions
 */
async function processRetentionResult(userId, skillId, correct, userSkillMastery) {
  const skillData = userSkillMastery.get(skillId);

  if (!skillData || skillData.status !== 'mastered') {
    throw new Error('Can only probe mastered skills');
  }

  const result = {
    skillId,
    previousStatus: skillData.status,
    newStatus: skillData.status,
    action: 'no-change',
    message: ''
  };

  // Update last practiced date
  skillData.lastPracticed = new Date();

  if (correct) {
    // Retention successful - refresh mastery
    result.action = 'reinforced';
    result.message = 'Retention confirmed! Skill remains mastered.';

    // Reset consecutive correct if it was decaying
    if (skillData.consecutiveCorrect < 5) {
      skillData.consecutiveCorrect = Math.min(skillData.consecutiveCorrect + 1, 5);
    }

  } else {
    // Retention failed - flag for review
    skillData.consecutiveCorrect = Math.max(skillData.consecutiveCorrect - 2, 0);

    // If consecutive correct drops below threshold, downgrade to needs-review
    if (skillData.consecutiveCorrect < 2) {
      skillData.status = 'needs-review';
      result.newStatus = 'needs-review';
      result.action = 'flagged-for-review';
      result.message = 'Skill needs review. Practice recommended to refresh mastery.';
    } else {
      result.action = 'retention-slip';
      result.message = 'Minor retention slip. One more incorrect answer will flag for review.';
    }
  }

  return result;
}

/**
 * Check if retention probe should be inserted in current session
 * @param {Object} sessionState - Current practice session state
 * @returns {boolean} Whether to insert a retention probe
 */
function shouldInsertRetentionProbe(sessionState) {
  const {
    problemsSinceLastProbe = 0,
    totalProblems = 0,
    currentMode = 'learning'  // 'learning' | 'mastery' | 'review'
  } = sessionState;

  // Don't probe in mastery mode (focus on earning badges)
  if (currentMode === 'mastery') {
    return false;
  }

  // Insert probe every 5-7 problems (randomized to feel natural)
  const probeInterval = 5 + Math.floor(Math.random() * 3);

  // Must have completed at least 3 problems first
  return totalProblems >= 3 && problemsSinceLastProbe >= probeInterval;
}

/**
 * Generate quarterly retention report for a user
 * @param {Map} userSkillMastery - User's skillMastery Map
 * @param {Array} previousCheckpoint - Previous quarter's checkpoint data
 * @returns {Object} Retention metrics
 */
function calculateRetentionMetrics(userSkillMastery, previousCheckpoint) {
  if (!previousCheckpoint || !previousCheckpoint.skillsMastered) {
    return {
      retainedCount: 0,
      lostCount: 0,
      retentionRate: 100,
      lostSkills: []
    };
  }

  const previousSkillIds = new Set(
    previousCheckpoint.skillsMastered.map(s => s.skillId)
  );

  let retainedCount = 0;
  let lostCount = 0;
  const lostSkills = [];

  for (const skillId of previousSkillIds) {
    const currentStatus = userSkillMastery.get(skillId)?.status;

    if (currentStatus === 'mastered') {
      retainedCount++;
    } else {
      lostCount++;
      lostSkills.push(skillId);
    }
  }

  const totalPreviousSkills = previousSkillIds.size;
  const retentionRate = totalPreviousSkills > 0
    ? Math.round((retainedCount / totalPreviousSkills) * 100)
    : 100;

  return {
    retainedCount,
    lostCount,
    retentionRate,
    lostSkills,
    totalPreviousSkills
  };
}

module.exports = {
  selectSkillsForRetention,
  processRetentionResult,
  shouldInsertRetentionProbe,
  calculateRetentionMetrics,
  calculateStaleness,
  calculateSkillImportance
};
