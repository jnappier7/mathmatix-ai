/**
 * INTERLEAVED PRACTICE ENGINE
 *
 * Implements interleaved practice — mixing problems from different skills
 * during practice sessions. This is one of the most consistently validated
 * findings in cognitive science for math learning.
 *
 * KEY RESEARCH:
 *   - Rohrer & Taylor (2007): Interleaving produced 3x better retention
 *     than blocked practice on math problems after 1 week.
 *   - Bjork's "Desirable Difficulties" (1994): Interleaving introduces
 *     beneficial challenge that strengthens memory retrieval paths.
 *   - Pan et al. (2019): Meta-analysis of 53 studies confirmed interleaving
 *     produces significantly better learning, especially in math.
 *   - IXL's productive struggle research (2024): Students whose scores
 *     fluctuated during practice showed stronger academic growth.
 *
 * HOW IT WORKS:
 *   When a student is practicing Skill A, the engine periodically inserts
 *   problems from previously mastered Skills B, C, etc. This:
 *   1. Strengthens retrieval of "completed" skills (prevents forgetting)
 *   2. Forces discrimination between problem types (deepens understanding)
 *   3. Builds transfer ability (recognizing which approach to use)
 *
 * SCHEDULING:
 *   - Every 3-5 problems during focused practice, insert an interleaved problem
 *   - Interleaved problems come from skills that are:
 *     a) Previously mastered but due for review (FSRS-driven)
 *     b) Conceptually related to the current skill
 *     c) Recently mastered (consolidation period)
 *   - The ratio adapts based on student performance:
 *     - Struggling students: fewer interleaved (focus on current skill)
 *     - Thriving students: more interleaved (maximize long-term retention)
 *
 * @module interleavingEngine
 */

// ============================================================================
// INTERLEAVING CONFIGURATION
// ============================================================================

const INTERLEAVE_CONFIG = {
  // Base ratio: 1 interleaved problem per N focused problems
  baseInterval: 4,

  // Minimum problems before first interleave
  minBeforeFirstInterleave: 2,

  // Maximum consecutive interleaved problems
  maxConsecutiveInterleaved: 2,

  // Adjustment factors for student state
  adjustments: {
    // Student is struggling (>2 recent errors): reduce interleaving
    struggling: { intervalMultiplier: 2.0, maxInterleaved: 1 },

    // Student is in flow (4+ consecutive correct): increase interleaving
    inFlow: { intervalMultiplier: 0.6, maxInterleaved: 2 },

    // Student shows fatigue: reduce interleaving
    fatigued: { intervalMultiplier: 1.5, maxInterleaved: 1 },

    // Normal: use base settings
    normal: { intervalMultiplier: 1.0, maxInterleaved: 2 },
  },

  // Priority weights for selecting which skill to interleave
  selectionWeights: {
    dueForReview: 0.35,      // FSRS says it's time to review
    conceptuallyRelated: 0.25, // Related to current skill
    recentlyMastered: 0.20,  // Mastered in last 7 days (consolidation)
    randomDiversity: 0.20,   // Random selection for broader coverage
  },
};

// ============================================================================
// INTERLEAVING STATE
// ============================================================================

/**
 * Initialize interleaving state for a practice session.
 *
 * @param {Object} options
 * @param {string} options.focusSkillId - The skill being actively practiced
 * @param {Array} options.masteredSkills - Array of { skillId, lastPracticed, category }
 * @param {Array} options.relatedSkills - Array of skillIds conceptually related to focus skill
 * @param {Object} options.fsrsDueSkills - Skills due for review from FSRS scheduler
 * @returns {Object} Interleaving session state
 */
function initializeInterleaving(options = {}) {
  const {
    focusSkillId,
    masteredSkills = [],
    relatedSkills = [],
    fsrsDueSkills = [],
  } = options;

  // Build candidate pool for interleaved problems
  const candidates = buildCandidatePool(
    focusSkillId, masteredSkills, relatedSkills, fsrsDueSkills
  );

  return {
    focusSkillId,
    candidates,

    // Counters
    focusedProblemsSinceInterleave: 0,
    totalFocused: 0,
    totalInterleaved: 0,
    consecutiveInterleaved: 0,

    // History of interleaved skills (avoid repetition)
    recentInterleaved: [],

    // Current interleave interval (adapts to student state)
    currentInterval: INTERLEAVE_CONFIG.baseInterval,

    // Performance tracking
    focusedCorrect: 0,
    interleavedCorrect: 0,
  };
}

/**
 * Build the candidate pool for interleaved problems.
 *
 * @returns {Array} Scored candidates sorted by priority
 */
function buildCandidatePool(focusSkillId, masteredSkills, relatedSkills, fsrsDueSkills) {
  const candidates = [];
  const relatedSet = new Set(relatedSkills);
  const dueSet = new Set(fsrsDueSkills.map(s => s.skillId || s));
  const now = Date.now();

  for (const skill of masteredSkills) {
    // Skip the current focus skill
    if (skill.skillId === focusSkillId) continue;

    let priority = 0;
    const reasons = [];

    // Factor 1: Due for review (FSRS-driven)
    if (dueSet.has(skill.skillId)) {
      priority += INTERLEAVE_CONFIG.selectionWeights.dueForReview;
      reasons.push('due-for-review');
    }

    // Factor 2: Conceptually related to current skill
    if (relatedSet.has(skill.skillId)) {
      priority += INTERLEAVE_CONFIG.selectionWeights.conceptuallyRelated;
      reasons.push('conceptually-related');
    }

    // Factor 3: Recently mastered (within 7 days — consolidation window)
    const daysSinceMastery = skill.masteredDate
      ? (now - new Date(skill.masteredDate).getTime()) / (1000 * 60 * 60 * 24)
      : 999;

    if (daysSinceMastery <= 7) {
      priority += INTERLEAVE_CONFIG.selectionWeights.recentlyMastered;
      reasons.push('recently-mastered');
    }

    // Factor 4: Base random diversity score
    priority += INTERLEAVE_CONFIG.selectionWeights.randomDiversity * Math.random();
    reasons.push('diversity');

    if (priority > 0) {
      candidates.push({
        skillId: skill.skillId,
        category: skill.category,
        priority: Math.round(priority * 1000) / 1000,
        reasons,
        daysSinceMastery: Math.round(daysSinceMastery),
      });
    }
  }

  // Sort by priority (highest first)
  candidates.sort((a, b) => b.priority - a.priority);

  return candidates;
}

// ============================================================================
// CORE INTERLEAVING LOGIC
// ============================================================================

/**
 * Determine whether the next problem should be interleaved or focused.
 *
 * @param {Object} state - Current interleaving state
 * @param {Object} studentState - { recentWrongCount, inFlow, fatigueSignal, sessionMood }
 * @returns {Object} { shouldInterleave, selectedSkill, reason }
 */
function shouldInterleave(state, studentState = {}) {
  // No candidates available
  if (state.candidates.length === 0) {
    return { shouldInterleave: false, selectedSkill: null, reason: 'no-candidates' };
  }

  // Too early in session
  if (state.totalFocused < INTERLEAVE_CONFIG.minBeforeFirstInterleave) {
    return { shouldInterleave: false, selectedSkill: null, reason: 'too-early' };
  }

  // Too many consecutive interleaved
  const maxConsecutive = getAdjustment(studentState).maxInterleaved;
  if (state.consecutiveInterleaved >= maxConsecutive) {
    return { shouldInterleave: false, selectedSkill: null, reason: 'max-consecutive' };
  }

  // Check if it's time for an interleaved problem
  const adjustedInterval = Math.round(
    INTERLEAVE_CONFIG.baseInterval * getAdjustment(studentState).intervalMultiplier
  );

  if (state.focusedProblemsSinceInterleave >= adjustedInterval) {
    // Time for an interleaved problem
    const selectedSkill = selectInterleavedSkill(state);

    if (selectedSkill) {
      return {
        shouldInterleave: true,
        selectedSkill,
        reason: `interleave-after-${state.focusedProblemsSinceInterleave}-focused`,
      };
    }
  }

  return { shouldInterleave: false, selectedSkill: null, reason: 'not-yet' };
}

/**
 * Select which skill to interleave from the candidate pool.
 *
 * Uses weighted random selection favoring:
 * 1. Skills not recently interleaved
 * 2. Skills with higher priority scores
 * 3. Skills from different categories (diversity)
 *
 * @param {Object} state - Current interleaving state
 * @returns {Object|null} Selected skill { skillId, category, reason }
 */
function selectInterleavedSkill(state) {
  const { candidates, recentInterleaved } = state;
  const recentSet = new Set(recentInterleaved.slice(-5));

  // Filter out recently interleaved skills
  const eligible = candidates.filter(c => !recentSet.has(c.skillId));

  if (eligible.length === 0) {
    // All candidates recently used — reset and try again
    return candidates.length > 0 ? candidates[0] : null;
  }

  // Weighted random selection
  const totalWeight = eligible.reduce((sum, c) => sum + c.priority, 0);

  if (totalWeight === 0) return eligible[0];

  let random = Math.random() * totalWeight;
  for (const candidate of eligible) {
    random -= candidate.priority;
    if (random <= 0) return candidate;
  }

  return eligible[0];
}

/**
 * Get adjustment settings based on student state.
 */
function getAdjustment(studentState) {
  const { recentWrongCount = 0, inFlow = false, fatigueSignal = false } = studentState;

  if (recentWrongCount >= 3) return INTERLEAVE_CONFIG.adjustments.struggling;
  if (fatigueSignal) return INTERLEAVE_CONFIG.adjustments.fatigued;
  if (inFlow) return INTERLEAVE_CONFIG.adjustments.inFlow;
  return INTERLEAVE_CONFIG.adjustments.normal;
}

// ============================================================================
// STATE UPDATES
// ============================================================================

/**
 * Record a focused problem result.
 */
function recordFocusedProblem(state, correct) {
  state.totalFocused++;
  state.focusedProblemsSinceInterleave++;
  state.consecutiveInterleaved = 0;
  if (correct) state.focusedCorrect++;
  return state;
}

/**
 * Record an interleaved problem result.
 */
function recordInterleavedProblem(state, skillId, correct) {
  state.totalInterleaved++;
  state.focusedProblemsSinceInterleave = 0;
  state.consecutiveInterleaved++;
  state.recentInterleaved.push(skillId);
  if (correct) state.interleavedCorrect++;

  // Keep recent history bounded
  if (state.recentInterleaved.length > 20) {
    state.recentInterleaved = state.recentInterleaved.slice(-10);
  }

  return state;
}

/**
 * Get interleaving statistics for the session.
 */
function getInterleavingStats(state) {
  const totalProblems = state.totalFocused + state.totalInterleaved;
  const interleavingRatio = totalProblems > 0
    ? Math.round((state.totalInterleaved / totalProblems) * 100)
    : 0;

  const focusedAccuracy = state.totalFocused > 0
    ? Math.round((state.focusedCorrect / state.totalFocused) * 100)
    : 0;

  const interleavedAccuracy = state.totalInterleaved > 0
    ? Math.round((state.interleavedCorrect / state.totalInterleaved) * 100)
    : 0;

  return {
    totalProblems,
    totalFocused: state.totalFocused,
    totalInterleaved: state.totalInterleaved,
    interleavingRatio,
    focusedAccuracy,
    interleavedAccuracy,
    uniqueSkillsInterleaved: new Set(state.recentInterleaved).size,
  };
}

// ============================================================================
// SKILL RELATIONSHIP MAPPING
// ============================================================================

/**
 * Get conceptually related skills for interleaving.
 *
 * These are skills that share similar operations or concepts,
 * making them ideal for interleaved discrimination practice.
 *
 * @param {string} skillId - The focus skill
 * @returns {Array} Array of related skillIds
 */
function getRelatedSkills(skillId) {
  // Conceptual clusters — skills that are commonly confused
  // and benefit most from interleaved discrimination
  const SKILL_CLUSTERS = {
    equations: [
      'one-step-equations-addition', 'one-step-equations-multiplication',
      'two-step-equations', 'multi-step-equations',
      'equations-with-variables-both-sides',
    ],
    fractions: [
      'adding-fractions', 'multiplying-fractions',
      'dividing-fractions', 'fraction-operations',
    ],
    integers: [
      'adding-integers', 'multiplying-integers',
      'integer-all-operations',
    ],
    expressions: [
      'combining-like-terms', 'distributive-property',
      'evaluating-expressions', 'factoring-expressions',
    ],
    ratios: [
      'understanding-ratios', 'solving-proportions',
      'percent-problems',
    ],
    geometry: [
      'area-and-perimeter', 'volume-3d-shapes',
      'pythagorean-theorem',
    ],
    operations: [
      'order-of-operations', 'decimal-operations',
      'multiplying-decimals',
    ],
  };

  const related = [];

  for (const cluster of Object.values(SKILL_CLUSTERS)) {
    if (cluster.includes(skillId)) {
      for (const relatedSkill of cluster) {
        if (relatedSkill !== skillId) {
          related.push(relatedSkill);
        }
      }
    }
  }

  return related;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core
  initializeInterleaving,
  shouldInterleave,
  selectInterleavedSkill,

  // State updates
  recordFocusedProblem,
  recordInterleavedProblem,

  // Analysis
  getInterleavingStats,
  getRelatedSkills,

  // Config
  INTERLEAVE_CONFIG,
};
