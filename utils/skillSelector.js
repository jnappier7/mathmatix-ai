/**
 * SKILL SELECTOR MODULE
 *
 * Intelligent skill selection for adaptive testing.
 * Uses multi-factor scoring with Maximum Information criterion.
 *
 * ALGORITHM:
 * 1. Filter skills by availability (have problems or templates)
 * 2. Score each skill based on:
 *    - Information gain (primary criterion)
 *    - Difficulty match to target
 *    - Recency penalty (avoid repetition)
 *    - Category balance (ensure coverage)
 * 3. Apply skill clustering to prevent wild difficulty jumps
 * 4. Select optimal skill
 *
 * @module skillSelector
 */

const { getBroadCategory, getCategoryDifficulty, getFallbackSkills,
        SESSION_DEFAULTS, BROAD_CATEGORIES } = require('./catConfig');
const { expectedInformation } = require('./irt');

// ===========================================================================
// SKILL SCORING
// ===========================================================================

/**
 * Score weights for multi-factor selection
 */
const SCORE_WEIGHTS = {
  information: 15,       // Maximum Information is primary criterion
  difficulty: 10,        // Difficulty distance penalty
  recency: 1,            // Recency penalty multiplier
  category: 5,           // Category balance penalty per test
  repetition: 1,         // Base for exponential repetition penalty
};

/**
 * Calculate recency penalty for a skill based on when it was last tested
 *
 * Uses exponential decay: most recent test gets highest penalty
 * Just tested (1 question ago) = 50 penalty
 * 2 questions ago = 25
 * 3 questions ago = 12.5
 *
 * @param {String} skillId - Skill to check
 * @param {Array} testedSkills - Array of tested skill IDs in order
 * @returns {Number} Recency penalty (0 if never tested)
 */
function calculateRecencyPenalty(skillId, testedSkills) {
  const indices = testedSkills
    .map((s, idx) => s === skillId ? idx : -1)
    .filter(idx => idx >= 0);

  if (indices.length === 0) return 0;

  const mostRecentIndex = Math.max(...indices);
  const questionsSinceLast = testedSkills.length - mostRecentIndex;

  // Exponential decay from 50
  return 50 * Math.pow(0.5, questionsSinceLast - 1);
}

/**
 * Calculate information-based score for a skill
 *
 * Uses IRT Maximum Information criterion: select items where
 * P(correct) is closest to 0.5 for current theta estimate.
 *
 * @param {Number} theta - Current ability estimate
 * @param {Number} skillDifficulty - Skill's estimated difficulty
 * @param {Number} discrimination - Item discrimination (default 1.0)
 * @returns {Number} Expected information (higher = better)
 */
function calculateInformationScore(theta, skillDifficulty, discrimination = 1.0) {
  return expectedInformation(theta, skillDifficulty, discrimination);
}

/**
 * Score a single skill candidate
 *
 * Lower score = better candidate
 *
 * @param {Object} skill - Skill object with skillId, difficulty, category
 * @param {Object} context - { targetDifficulty, theta, testedSkills, testedCategories }
 * @returns {Object} Skill with scoring details
 */
function scoreSkill(skill, context) {
  const { targetDifficulty, theta, testedSkills, testedCategories } = context;

  // Get skill properties
  const skillDifficulty = skill.irtDifficulty || skill.difficulty || getCategoryDifficulty(skill.category) || 0;
  const broadCategory = getBroadCategory(skill.category);

  // Count previous tests of this skill
  const testCount = testedSkills.filter(s => s === skill.skillId).length;

  // Calculate scoring factors
  const difficultyDistance = Math.abs(skillDifficulty - targetDifficulty);
  const recencyPenalty = calculateRecencyPenalty(skill.skillId, testedSkills);
  const categoryPenalty = (testedCategories[broadCategory] || 0) * SCORE_WEIGHTS.category;
  const repetitionPenalty = Math.pow(2, testCount) - 1; // 0, 1, 3, 7, 15...

  // Information score (higher = better, so we invert it for the penalty)
  const informationGain = calculateInformationScore(theta, skillDifficulty);
  const informationPenalty = (1 - informationGain) * SCORE_WEIGHTS.information;

  // Combined score (lower = better)
  const score = (difficultyDistance * SCORE_WEIGHTS.difficulty) +
                informationPenalty +
                recencyPenalty +
                categoryPenalty +
                repetitionPenalty;

  return {
    skillId: skill.skillId,
    difficulty: skillDifficulty,
    category: skill.category,
    broadCategory,
    testCount,
    scoring: {
      difficultyDistance,
      informationGain,
      informationPenalty,
      recencyPenalty,
      categoryPenalty,
      repetitionPenalty,
    },
    score,
  };
}

// ===========================================================================
// SKILL CLUSTERING
// ===========================================================================

/**
 * Apply skill clustering to prevent wild difficulty jumps
 *
 * Groups skills into difficulty bins and ensures we test multiple
 * skills at similar difficulty before jumping to next level.
 *
 * @param {Array} candidates - Scored skill candidates
 * @param {Object} session - Current session state
 * @returns {Array} Filtered candidates (may be same or subset)
 */
function applySkillClustering(candidates, session) {
  const { responses } = session;
  const { difficultyBinSize, minSkillsPerBin } = SESSION_DEFAULTS;

  if (responses.length < 3) {
    return candidates; // Not enough data for clustering
  }

  // Determine current difficulty bin from recent responses
  const recentDifficulties = responses.slice(-3).map(r => r.difficulty);
  const avgRecentDifficulty = recentDifficulties.reduce((a, b) => a + b, 0) / recentDifficulties.length;

  const currentBin = {
    center: avgRecentDifficulty,
    min: avgRecentDifficulty - difficultyBinSize / 2,
    max: avgRecentDifficulty + difficultyBinSize / 2,
  };

  // Count skills tested in current bin
  const skillsInBin = responses.filter(r =>
    r.difficulty >= currentBin.min && r.difficulty <= currentBin.max
  ).length;

  // If we've tested fewer than minimum, prefer staying in bin
  if (skillsInBin < minSkillsPerBin) {
    const binCandidates = candidates.filter(s =>
      s.difficulty >= currentBin.min &&
      s.difficulty <= currentBin.max &&
      s.testCount < 2
    );

    if (binCandidates.length > 0) {
      return binCandidates;
    }
  }

  return candidates;
}

// ===========================================================================
// CONTENT BALANCING
// ===========================================================================

/**
 * Apply content balancing to prefer underrepresented categories
 *
 * When multiple skills have similar scores, prefer skills from
 * categories that have been tested fewer times.
 *
 * @param {Array} candidates - Scored skill candidates
 * @param {Object} testedCategories - Map of category -> test count
 * @returns {Array} Balanced candidates
 */
function applyContentBalancing(candidates, testedCategories) {
  if (candidates.length <= 1) return candidates;

  const { scoreThreshold } = SESSION_DEFAULTS;
  const bestScore = candidates[0].score;

  // Find candidates with similar scores
  const similarCandidates = candidates.filter(s => s.score <= bestScore + scoreThreshold);

  if (similarCandidates.length <= 1) return candidates;

  // Find least-covered category among similar candidates
  const categoryCounts = {};
  for (const candidate of similarCandidates) {
    const count = testedCategories[candidate.broadCategory] || 0;
    if (!categoryCounts[candidate.broadCategory]) {
      categoryCounts[candidate.broadCategory] = { count, candidates: [] };
    }
    categoryCounts[candidate.broadCategory].candidates.push(candidate);
  }

  // Get category with lowest count
  let minCount = Infinity;
  let leastCoveredCandidates = [];

  for (const { count, candidates: catCandidates } of Object.values(categoryCounts)) {
    if (count < minCount) {
      minCount = count;
      leastCoveredCandidates = catCandidates;
    }
  }

  return leastCoveredCandidates.length > 0 ? leastCoveredCandidates : candidates;
}

// ===========================================================================
// MAIN SELECTION FUNCTION
// ===========================================================================

/**
 * Select the optimal skill for next question
 *
 * @param {Array} availableSkills - Array of skill objects from database
 * @param {Object} session - Current session state
 * @param {Number} targetDifficulty - Target difficulty from jump calculation
 * @param {Object} options - Additional options
 * @returns {Object} { selectedSkill, scoredCandidates, reason }
 */
function selectSkill(availableSkills, session, targetDifficulty, options = {}) {
  const { theta, testedSkills, testedSkillCategories } = session;
  const { templateDifficultyMap = {} } = options;

  // Build context for scoring
  const context = {
    targetDifficulty,
    theta,
    testedSkills: testedSkills || [],
    testedCategories: testedSkillCategories || {},
  };

  // Score all available skills
  let candidates = availableSkills.map(skill => {
    // Use best available difficulty estimate
    const enhancedSkill = {
      ...skill,
      irtDifficulty: skill.irtDifficulty ||
                     templateDifficultyMap[skill.skillId] ||
                     getCategoryDifficulty(skill.category) ||
                     0,
    };
    return scoreSkill(enhancedSkill, context);
  });

  // Filter out over-tested skills
  const { maxSkillTests } = SESSION_DEFAULTS;
  const freshCandidates = candidates.filter(s => s.testCount < maxSkillTests);

  if (freshCandidates.length > 0) {
    candidates = freshCandidates;
  }

  // Sort by score (lower = better)
  candidates.sort((a, b) => a.score - b.score);

  // Apply skill clustering
  candidates = applySkillClustering(candidates, session);

  // Re-sort after clustering
  candidates.sort((a, b) => a.score - b.score);

  // Apply content balancing
  candidates = applyContentBalancing(candidates, context.testedCategories);

  // Re-sort after balancing
  candidates.sort((a, b) => a.score - b.score);

  // Handle empty candidates
  if (candidates.length === 0) {
    return selectFallbackSkill(session);
  }

  const selected = candidates[0];

  return {
    selectedSkill: {
      skillId: selected.skillId,
      difficulty: selected.difficulty,
      category: selected.category,
      broadCategory: selected.broadCategory,
    },
    scoredCandidates: candidates.slice(0, 5), // Top 5 for debugging
    reason: 'optimal-selection',
  };
}

/**
 * Select a fallback skill when no candidates are available
 *
 * @param {Object} session - Current session state
 * @returns {Object} Fallback selection result
 */
function selectFallbackSkill(session) {
  const { testedSkillCategories, questionCount } = session;

  // Find least-tested category
  let leastTestedCategory = BROAD_CATEGORIES.ALGEBRA;
  let minCount = Infinity;

  for (const [category, count] of Object.entries(testedSkillCategories || {})) {
    if (count < minCount) {
      minCount = count;
      leastTestedCategory = category;
    }
  }

  // Get fallback skills for that category
  const fallbackOptions = getFallbackSkills(leastTestedCategory);
  const selectedSkillId = fallbackOptions[questionCount % fallbackOptions.length];

  return {
    selectedSkill: {
      skillId: selectedSkillId,
      difficulty: 0,
      category: leastTestedCategory,
      broadCategory: leastTestedCategory,
    },
    scoredCandidates: [],
    reason: 'fallback',
  };
}

// ===========================================================================
// UTILITY FUNCTIONS
// ===========================================================================

/**
 * Get scoring summary for logging
 *
 * @param {Object} scoredSkill - Skill with scoring details
 * @returns {String} Human-readable scoring summary
 */
function formatScoringLog(scoredSkill) {
  const { skillId, difficulty, score, scoring } = scoredSkill;
  const { difficultyDistance, informationGain, recencyPenalty, categoryPenalty, repetitionPenalty } = scoring;

  return `${skillId} (d=${difficulty.toFixed(2)}, score=${score.toFixed(1)}) ` +
         `[diff=${(difficultyDistance * SCORE_WEIGHTS.difficulty).toFixed(1)} + ` +
         `info=${((1-informationGain) * SCORE_WEIGHTS.information).toFixed(1)} + ` +
         `recency=${recencyPenalty.toFixed(1)} + ` +
         `cat=${categoryPenalty.toFixed(1)} + ` +
         `rep=${repetitionPenalty.toFixed(1)}]`;
}

/**
 * Initialize category tracking object
 *
 * @returns {Object} Empty category tracking
 */
function initializeCategoryTracking() {
  return {
    [BROAD_CATEGORIES.NUMBER_OPERATIONS]: 0,
    [BROAD_CATEGORIES.ALGEBRA]: 0,
    [BROAD_CATEGORIES.GEOMETRY]: 0,
    [BROAD_CATEGORIES.ADVANCED]: 0,
  };
}

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = {
  // Main selection
  selectSkill,
  selectFallbackSkill,

  // Scoring
  scoreSkill,
  calculateRecencyPenalty,
  calculateInformationScore,

  // Filtering
  applySkillClustering,
  applyContentBalancing,

  // Utilities
  formatScoringLog,
  initializeCategoryTracking,

  // Constants
  SCORE_WEIGHTS,
};
