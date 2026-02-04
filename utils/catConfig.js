/**
 * CAT (COMPUTERIZED ADAPTIVE TESTING) CONFIGURATION
 *
 * Centralized configuration for the adaptive testing system.
 * All CAT parameters, mappings, and constants in one place.
 *
 * @module catConfig
 */

// ===========================================================================
// SESSION PARAMETERS
// ===========================================================================

const SESSION_DEFAULTS = {
  // Question count thresholds
  minQuestions: 8,           // Minimum for basic reliability
  targetQuestions: 15,       // Soft target for typical students
  maxQuestions: 30,          // Hard cap to prevent fatigue

  // Standard Error thresholds (lower = higher confidence)
  seThresholdStringent: 0.25,  // High confidence early stop
  seThresholdAcceptable: 0.30, // Normal stop threshold
  seThresholdFallback: 0.40,   // Minimum at max questions

  // Information gain thresholds
  minInformationGain: 0.08,    // Stop if gains < this for 3 questions

  // Bayesian prior settings
  priorSD: 1.25,               // Wide prior allows data to dominate quickly

  // Problem exclusion window (LRU)
  lruExclusionWindow: 150,     // Exclude last N problems from selection

  // Skill clustering
  difficultyBinSize: 1.4,      // Skills within this range are "similar level"
  minSkillsPerBin: 2,          // Test at least N skills before jumping bins

  // Content balancing
  scoreThreshold: 2.0,         // Skills within this score are "similar enough"
  maxSkillTests: 3,            // Max times to test same skill
};

// ===========================================================================
// GRADE TO THETA MAPPING
// ===========================================================================

/**
 * Map math course names to starting theta
 * Higher-level courses get higher starting theta
 */
const COURSE_THETA_MAP = {
  // Calculus courses
  'calculus': 2.5,
  'calc': 2.5,
  'calc 1': 2.3,
  'calc 2': 2.5,
  'calc 3': 2.7,
  'calculus 1': 2.3,
  'calculus 2': 2.5,
  'calculus 3': 2.7,

  // Pre-Calculus
  'pre-calc': 2.0,
  'precalc': 2.0,
  'pre calc': 2.0,
  'precalculus': 2.0,

  // Trigonometry
  'trigonometry': 1.8,
  'trig': 1.8,

  // Algebra 2
  'algebra 2': 1.5,
  'algebra ii': 1.5,
  'algebra-2': 1.5,

  // Geometry
  'geometry': 1.0,

  // Algebra 1
  'algebra 1': 0.5,
  'algebra i': 0.5,
  'algebra': 0.5,
  'algebra-1': 0.5,

  // Pre-Algebra
  'pre-algebra': 0.0,
  'prealgebra': 0.0,
  'pre algebra': 0.0,

  // College
  'college': 2.0,
};

/**
 * Map grade band strings to starting theta
 */
const GRADE_BAND_THETA_MAP = {
  'prek': -2.0,
  'pre-k': -2.0,
  'prekindergarten': -2.0,
  'k': -1.5,
  'kindergarten': -1.5,
  'k-5': -0.5,
  '5-8': 0.5,
  '8-12': 1.2,
};

/**
 * Map numeric grade to starting theta
 * Conservative: Start one level below to build confidence
 * Scale: -3 (very basic) to +3 (very advanced), 0 = middle school average
 */
const GRADE_NUMBER_THETA = [
  { max: 0, theta: -2.5 },   // Kindergarten
  { max: 2, theta: -2.0 },   // 1st-2nd: early elementary
  { max: 4, theta: -1.0 },   // 3rd-4th: multi-digit, fractions intro
  { max: 5, theta: -0.5 },   // 5th: fractions, decimals
  { max: 6, theta: 0.0 },    // 6th: ratios, intro algebra
  { max: 7, theta: 0.3 },    // 7th: proportions, equations
  { max: 8, theta: 0.6 },    // 8th: linear equations, geometry
  { max: 9, theta: 0.9 },    // 9th: Algebra 1
  { max: 10, theta: 1.2 },   // 10th: Geometry/Algebra 2
  { max: 11, theta: 1.5 },   // 11th: Algebra 2/Precalc
  { max: 12, theta: 1.8 },   // 12th: Precalc/Calculus
  { max: 13, theta: 2.0 },   // College freshman
  { max: Infinity, theta: 2.5 }, // Graduate+
];

/**
 * Convert grade level and optional math course to starting theta
 *
 * @param {String|Number} grade - Student's grade level (K-12+)
 * @param {String} mathCourse - Optional specific math course
 * @returns {Number} Starting theta estimate
 */
function gradeToTheta(grade, mathCourse = null) {
  // Priority 1: Check math course for more precise starting point
  if (mathCourse) {
    const courseLower = mathCourse.toLowerCase().trim();

    // Check for exact match
    if (COURSE_THETA_MAP[courseLower] !== undefined) {
      return COURSE_THETA_MAP[courseLower];
    }

    // Check for partial match (e.g., "AP Calculus BC" contains "calculus")
    for (const [key, theta] of Object.entries(COURSE_THETA_MAP)) {
      if (courseLower.includes(key)) {
        return theta;
      }
    }
  }

  // Priority 2: Check grade
  if (!grade) return 0;

  const gradeStr = String(grade).toLowerCase().trim();

  // Check grade band string
  if (GRADE_BAND_THETA_MAP[gradeStr] !== undefined) {
    return GRADE_BAND_THETA_MAP[gradeStr];
  }

  // Check for partial grade band match
  for (const [key, theta] of Object.entries(GRADE_BAND_THETA_MAP)) {
    if (gradeStr.includes(key) || key.includes(gradeStr)) {
      return theta;
    }
  }

  // Parse numeric grade
  let gradeNum;
  if (gradeStr === 'k' || gradeStr.includes('kinder')) {
    gradeNum = 0;
  } else if (gradeStr.includes('college') || gradeStr.includes('university') ||
             gradeStr.includes('undergrad')) {
    gradeNum = 13;
  } else if (gradeStr.includes('graduate') || gradeStr.includes('masters') ||
             gradeStr.includes('phd')) {
    gradeNum = 17;
  } else {
    gradeNum = parseInt(gradeStr, 10);
  }

  if (isNaN(gradeNum)) return 0;

  // Find theta for grade number
  for (const { max, theta } of GRADE_NUMBER_THETA) {
    if (gradeNum <= max) {
      return theta;
    }
  }

  return 0;
}

// ===========================================================================
// SKILL CATEGORY MAPPING
// ===========================================================================

/**
 * Broad skill categories for content balancing
 */
const BROAD_CATEGORIES = {
  NUMBER_OPERATIONS: 'number-operations',
  ALGEBRA: 'algebra',
  GEOMETRY: 'geometry',
  ADVANCED: 'advanced',
};

/**
 * Map specific skill categories to broad categories
 */
const CATEGORY_TO_BROAD = {
  // Number operations (Elementary K-5)
  'counting-cardinality': BROAD_CATEGORIES.NUMBER_OPERATIONS,
  'number-recognition': BROAD_CATEGORIES.NUMBER_OPERATIONS,
  'addition-subtraction': BROAD_CATEGORIES.NUMBER_OPERATIONS,
  'multiplication-division': BROAD_CATEGORIES.NUMBER_OPERATIONS,
  'place-value': BROAD_CATEGORIES.NUMBER_OPERATIONS,
  'arrays': BROAD_CATEGORIES.NUMBER_OPERATIONS,
  'decimals': BROAD_CATEGORIES.NUMBER_OPERATIONS,
  'fractions': BROAD_CATEGORIES.NUMBER_OPERATIONS,
  'number-system': BROAD_CATEGORIES.NUMBER_OPERATIONS,
  'operations': BROAD_CATEGORIES.NUMBER_OPERATIONS,
  'estimation': BROAD_CATEGORIES.NUMBER_OPERATIONS,
  'number-sense': BROAD_CATEGORIES.NUMBER_OPERATIONS,
  'mental-math': BROAD_CATEGORIES.NUMBER_OPERATIONS,
  'time': BROAD_CATEGORIES.NUMBER_OPERATIONS,
  'money': BROAD_CATEGORIES.NUMBER_OPERATIONS,
  'data': BROAD_CATEGORIES.NUMBER_OPERATIONS,

  // Algebra (Middle School through High School)
  'integers-rationals': BROAD_CATEGORIES.ALGEBRA,
  'scientific-notation': BROAD_CATEGORIES.ALGEBRA,
  'ratios-proportions': BROAD_CATEGORIES.ALGEBRA,
  'percent': BROAD_CATEGORIES.ALGEBRA,
  'expressions': BROAD_CATEGORIES.ALGEBRA,
  'equations': BROAD_CATEGORIES.ALGEBRA,
  'linear-equations': BROAD_CATEGORIES.ALGEBRA,
  'linear-functions': BROAD_CATEGORIES.ALGEBRA,
  'systems': BROAD_CATEGORIES.ALGEBRA,
  'inequalities': BROAD_CATEGORIES.ALGEBRA,
  'polynomials': BROAD_CATEGORIES.ALGEBRA,
  'factoring': BROAD_CATEGORIES.ALGEBRA,
  'quadratics': BROAD_CATEGORIES.ALGEBRA,
  'radicals': BROAD_CATEGORIES.ALGEBRA,
  'rational-expressions': BROAD_CATEGORIES.ALGEBRA,
  'complex-numbers': BROAD_CATEGORIES.ALGEBRA,
  'exponentials-logarithms': BROAD_CATEGORIES.ALGEBRA,
  'exponential': BROAD_CATEGORIES.ALGEBRA,
  'sequences-series': BROAD_CATEGORIES.ALGEBRA,
  'sequences': BROAD_CATEGORIES.ALGEBRA,
  'conics': BROAD_CATEGORIES.ALGEBRA,
  'functions': BROAD_CATEGORIES.ALGEBRA,
  'graphing': BROAD_CATEGORIES.ALGEBRA,
  'coordinate-plane': BROAD_CATEGORIES.ALGEBRA,
  'expressions-equations': BROAD_CATEGORIES.ALGEBRA,
  'rational': BROAD_CATEGORIES.ALGEBRA,
  'rates': BROAD_CATEGORIES.ALGEBRA,
  'conversions': BROAD_CATEGORIES.ALGEBRA,
  'word-problems': BROAD_CATEGORIES.ALGEBRA,
  'number-theory': BROAD_CATEGORIES.ALGEBRA,
  'counting': BROAD_CATEGORIES.ALGEBRA,

  // Geometry
  'shapes-geometry': BROAD_CATEGORIES.GEOMETRY,
  'measurement': BROAD_CATEGORIES.GEOMETRY,
  'area-perimeter': BROAD_CATEGORIES.GEOMETRY,
  'volume': BROAD_CATEGORIES.GEOMETRY,
  'surface-area': BROAD_CATEGORIES.GEOMETRY,
  'angles': BROAD_CATEGORIES.GEOMETRY,
  'pythagorean-theorem': BROAD_CATEGORIES.GEOMETRY,
  'transformations': BROAD_CATEGORIES.GEOMETRY,
  'geometry': BROAD_CATEGORIES.GEOMETRY,
  'congruence': BROAD_CATEGORIES.GEOMETRY,
  'similarity': BROAD_CATEGORIES.GEOMETRY,
  'proofs': BROAD_CATEGORIES.GEOMETRY,
  'circles': BROAD_CATEGORIES.GEOMETRY,
  'triangles': BROAD_CATEGORIES.GEOMETRY,
  'parallel-perpendicular': BROAD_CATEGORIES.GEOMETRY,
  'right-triangles': BROAD_CATEGORIES.GEOMETRY,
  'coordinate-geometry': BROAD_CATEGORIES.GEOMETRY,
  'scatter-plots': BROAD_CATEGORIES.GEOMETRY,

  // Advanced (Calculus, Trigonometry, Statistics)
  'trigonometry': BROAD_CATEGORIES.ADVANCED,
  'identities': BROAD_CATEGORIES.ADVANCED,
  'polar-coordinates': BROAD_CATEGORIES.ADVANCED,
  'vectors': BROAD_CATEGORIES.ADVANCED,
  'matrices': BROAD_CATEGORIES.ADVANCED,
  'limits': BROAD_CATEGORIES.ADVANCED,
  'derivatives': BROAD_CATEGORIES.ADVANCED,
  'integration': BROAD_CATEGORIES.ADVANCED,
  'integrals': BROAD_CATEGORIES.ADVANCED,
  'series-tests': BROAD_CATEGORIES.ADVANCED,
  'taylor-series': BROAD_CATEGORIES.ADVANCED,
  'parametric-polar': BROAD_CATEGORIES.ADVANCED,
  'differential-equations': BROAD_CATEGORIES.ADVANCED,
  'multivariable': BROAD_CATEGORIES.ADVANCED,
  'vector-calculus': BROAD_CATEGORIES.ADVANCED,
  'statistics': BROAD_CATEGORIES.ADVANCED,
  'probability': BROAD_CATEGORIES.ADVANCED,
  'advanced': BROAD_CATEGORIES.ADVANCED,
};

/**
 * Get broad category for a specific skill category
 *
 * @param {String} category - Specific skill category
 * @returns {String} Broad category name
 */
function getBroadCategory(category) {
  return CATEGORY_TO_BROAD[category] || BROAD_CATEGORIES.NUMBER_OPERATIONS;
}

// ===========================================================================
// SKILL DIFFICULTY ESTIMATES
// ===========================================================================

/**
 * Estimated IRT difficulty for each skill category
 * Used when skills don't have calibrated difficulty values
 */
const CATEGORY_DIFFICULTY_MAP = {
  // Elementary (K-5)
  'counting-cardinality': -2.5,
  'number-recognition': -2.3,
  'number-sense': -2.0,
  'mental-math': -1.8,
  'addition-subtraction': -2.0,
  'place-value': -1.8,
  'estimation': -1.5,
  'multiplication-division': -1.5,
  'arrays': -1.5,
  'time': -1.5,
  'money': -1.2,
  'shapes-geometry': -1.0,
  'measurement': -0.8,
  'decimals': -0.8,
  'data': -0.5,
  'fractions': -0.5,
  'number-system': -0.5,

  // Middle School (6-8)
  'operations': -0.3,
  'integers-rationals': -0.3,
  'conversions': 0.3,
  'area-perimeter': 0.0,
  'percent': 0.0,
  'ratios-proportions': 0.2,
  'angles': 0.2,
  'volume': 0.3,
  'rates': 0.5,
  'expressions': 0.5,
  'scientific-notation': 0.5,
  'scatter-plots': 0.6,
  'pythagorean-theorem': 0.7,
  'word-problems': 0.8,
  'equations': 0.8,
  'coordinate-plane': 0.8,
  'transformations': 0.8,
  'expressions-equations': 0.8,
  'surface-area': 0.8,

  // High School (9-12)
  'graphing': 1.0,
  'linear-equations': 1.0,
  'linear-functions': 1.0,
  'triangles': 1.0,
  'parallel-perpendicular': 1.0,
  'geometry': 1.2,
  'inequalities': 1.2,
  'right-triangles': 1.2,
  'coordinate-geometry': 1.2,
  'probability': 1.3,
  'congruence': 1.3,
  'similarity': 1.3,
  'functions': 1.4,
  'factoring': 1.4,
  'circles': 1.4,
  'radicals': 1.5,
  'number-theory': 1.5,
  'statistics': 1.5,
  'systems': 1.5,
  'polynomials': 1.6,
  'counting': 1.8,
  'proofs': 1.8,
  'quadratics': 1.8,

  // Advanced (Pre-Calculus+)
  'trigonometry': 2.0,
  'exponentials-logarithms': 2.0,
  'exponential': 2.0,
  'rational': 2.0,
  'rational-expressions': 2.0,
  'sequences': 2.0,
  'complex-numbers': 2.2,
  'matrices': 2.3,
  'identities': 2.3,
  'sequences-series': 2.3,
  'advanced': 2.5,
  'conics': 2.5,
  'polar-coordinates': 2.5,
  'vectors': 2.5,
  'limits': 2.8,
  'derivatives': 3.0,
  'integrals': 3.0,
  'parametric-polar': 3.0,
  'integration': 3.2,
  'series-tests': 3.3,
  'taylor-series': 3.5,
  'differential-equations': 3.5,
  'multivariable': 3.5,
  'vector-calculus': 3.5,
};

/**
 * Get estimated difficulty for a skill category
 *
 * @param {String} category - Skill category
 * @returns {Number} Estimated IRT difficulty
 */
function getCategoryDifficulty(category) {
  return CATEGORY_DIFFICULTY_MAP[category] || 0;
}

// ===========================================================================
// JUMP SIZE PARAMETERS
// ===========================================================================

const JUMP_PARAMS = {
  // Correct answer jumps
  correctBaseJump: 1.5,      // Maximum upward jump
  correctMinJump: 0.3,       // Minimum upward jump

  // Incorrect answer steps
  incorrectBaseStep: -0.7,   // Maximum downward step
  incorrectMinStep: -0.2,    // Minimum downward step

  // Dampening factors
  timeDampenBase: 0.9,       // Decay rate per question
  minConfidenceDampen: 0.3,  // Minimum confidence dampening

  // Bounds
  maxJumpFromTheta: 1.5,     // Max distance from current theta
};

/**
 * Calculate adaptive jump size based on correctness and confidence
 *
 * @param {Boolean} isCorrect - Was the answer correct?
 * @param {Number} questionNumber - Question count (1-indexed)
 * @param {Number} standardError - Current standard error
 * @returns {Number} Difficulty adjustment
 */
function calculateJumpSize(isCorrect, questionNumber, standardError) {
  const { correctBaseJump, correctMinJump, incorrectBaseStep, incorrectMinStep,
          timeDampenBase, minConfidenceDampen } = JUMP_PARAMS;

  // Confidence dampening: Higher confidence (lower SE) = smaller adjustments
  const confidenceDampen = Math.max(standardError, minConfidenceDampen);

  // Time dampening: Later questions = smaller adjustments
  const timeDampen = Math.pow(timeDampenBase, questionNumber - 1);

  if (isCorrect) {
    const jumpSize = correctBaseJump * confidenceDampen * timeDampen;
    return Math.max(correctMinJump, Math.min(jumpSize, correctBaseJump));
  } else {
    const stepSize = incorrectBaseStep * confidenceDampen * timeDampen;
    return Math.max(incorrectBaseStep, Math.min(stepSize, incorrectMinStep));
  }
}

// ===========================================================================
// FALLBACK SKILLS
// ===========================================================================

/**
 * Fallback skills by category when no candidates found
 */
const FALLBACK_SKILLS = {
  'number-operations': ['addition-subtraction', 'multiplication-division', 'fractions'],
  'algebra': ['one-step-equations-addition', 'linear-equations', 'expressions'],
  'geometry': ['shapes-geometry', 'area-perimeter', 'pythagorean-theorem'],
  'advanced': ['quadratics', 'functions', 'limits'],
};

/**
 * Get fallback skills for a category
 *
 * @param {String} category - Broad category
 * @returns {Array} Array of fallback skill IDs
 */
function getFallbackSkills(category) {
  return FALLBACK_SKILLS[category] || FALLBACK_SKILLS['algebra'];
}

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = {
  // Session defaults
  SESSION_DEFAULTS,

  // Grade mapping
  gradeToTheta,
  COURSE_THETA_MAP,
  GRADE_BAND_THETA_MAP,
  GRADE_NUMBER_THETA,

  // Category mapping
  BROAD_CATEGORIES,
  CATEGORY_TO_BROAD,
  getBroadCategory,

  // Difficulty estimates
  CATEGORY_DIFFICULTY_MAP,
  getCategoryDifficulty,

  // Jump calculations
  JUMP_PARAMS,
  calculateJumpSize,

  // Fallbacks
  FALLBACK_SKILLS,
  getFallbackSkills,
};
