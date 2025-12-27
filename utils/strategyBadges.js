// utils/strategyBadges.js
// Master Mode: Strategy Badge Definitions & Detection Logic

/**
 * STRATEGY BADGES
 *
 * Reward METHODS, not just answers.
 * These badges "discover" the student based on problem-solving patterns.
 * Automatic detection, not manually selectable.
 */

const STRATEGY_BADGES = {
  // ========================================
  // ALGEBRA STRATEGY BADGES
  // ========================================

  'double-distribution-disciple': {
    badgeId: 'double-distribution-disciple',
    badgeName: 'Double Distribution Disciple',
    category: 'algebra',
    description: 'Uses distribution correctly across multiple parentheses (not FOIL autopilot)',
    icon: 'fa-calculator-alt',
    triggerCriteria: {
      skillIds: ['expand-binomials', 'multiply-binomials', 'simplify-expressions'],
      requiredInstances: 3,
      detectionPattern: 'correct_double_distribution'
    },
    detectionReason: 'Correctly expanded expressions like 3(x+2)(x-5) using distribution'
  },

  'box-in-the-variable': {
    badgeId: 'box-in-the-variable',
    badgeName: 'Box-in-the-Variable',
    category: 'algebra',
    description: 'Isolates variables cleanly in multi-step equations',
    icon: 'fa-box',
    triggerCriteria: {
      skillIds: ['two-step-equations', 'multi-step-equations', 'equations-with-variables-both-sides'],
      requiredInstances: 5,
      detectionPattern: 'perfect_isolation_steps'
    },
    detectionReason: 'Solved 5 multi-step equations with perfect variable isolation'
  },

  'side-by-side-simplifier': {
    badgeId: 'side-by-side-simplifier',
    badgeName: 'Side-by-Side Simplifier',
    category: 'algebra',
    description: 'Simplifies rational expressions methodically without skipping steps',
    icon: 'fa-divide',
    triggerCriteria: {
      skillIds: ['simplify-rational-expressions', 'multiply-rational-expressions'],
      requiredInstances: 4,
      detectionPattern: 'methodical_simplification'
    },
    detectionReason: 'Reduced 4 rational expressions methodically'
  },

  'factoring-ninja': {
    badgeId: 'factoring-ninja',
    badgeName: 'Factoring Ninja',
    category: 'algebra',
    description: 'Recognizes factoring patterns instantly (difference of squares, perfect square trinomial)',
    icon: 'fa-puzzle-piece',
    triggerCriteria: {
      skillIds: ['factor-difference-of-squares', 'factor-perfect-square-trinomial', 'factor-trinomials'],
      requiredInstances: 3,
      detectionPattern: 'fast_pattern_recognition',
      speedThreshold: 30  // seconds
    },
    detectionReason: 'Factored 3 challenging polynomials in under 30 seconds each'
  },

  'like-terms-master': {
    badgeId: 'like-terms-master',
    badgeName: 'Like Terms Master',
    category: 'algebra',
    description: 'Combines like terms perfectly in complex expressions',
    icon: 'fa-layer-group',
    triggerCriteria: {
      skillIds: ['combine-like-terms', 'simplify-expressions'],
      requiredInstances: 5,
      detectionPattern: 'perfect_like_terms'
    },
    detectionReason: 'Combined like terms correctly in 5 complex expressions'
  },

  // ========================================
  // GEOMETRY STRATEGY BADGES
  // ========================================

  'angle-architect': {
    badgeId: 'angle-architect',
    badgeName: 'Angle Architect',
    category: 'geometry',
    description: 'Uses angle relationships expertly (complementary, supplementary, vertical)',
    icon: 'fa-drafting-compass',
    triggerCriteria: {
      skillIds: ['angle-relationships', 'complementary-supplementary-angles'],
      requiredInstances: 8,
      detectionPattern: 'correct_angle_relationships'
    },
    detectionReason: 'Applied angle relationships correctly in 8 different contexts'
  },

  'triangle-hunter': {
    badgeId: 'triangle-hunter',
    badgeName: 'Triangle Hunter',
    category: 'geometry',
    description: 'Identifies triangle types and properties instantly',
    icon: 'fa-triangle',
    triggerCriteria: {
      skillIds: ['triangle-classification', 'triangle-properties'],
      requiredInstances: 6,
      detectionPattern: 'correct_triangle_classification'
    },
    detectionReason: 'Correctly classified and used properties of 6 triangles'
  },

  'pythagorean-pro': {
    badgeId: 'pythagorean-pro',
    badgeName: 'Pythagorean Pro',
    category: 'geometry',
    description: 'Applies Pythagorean theorem in non-obvious contexts',
    icon: 'fa-ruler-triangle',
    triggerCriteria: {
      skillIds: ['pythagorean-theorem', 'distance-formula'],
      requiredInstances: 5,
      detectionPattern: 'creative_pythagorean_application'
    },
    detectionReason: 'Applied Pythagorean theorem in 5 real-world contexts'
  },

  // ========================================
  // META-STRATEGY BADGES
  // ========================================

  'error-hunter': {
    badgeId: 'error-hunter',
    badgeName: 'Error Hunter',
    category: 'meta',
    description: 'Finds mistakes in worked examples like a pro',
    icon: 'fa-magnifying-glass-minus',
    triggerCriteria: {
      skillIds: ['all'],  // Can trigger on any skill
      requiredInstances: 5,
      detectionPattern: 'correct_error_identification'
    },
    detectionReason: 'Correctly identified errors in 5 flawed solutions'
  },

  'multiple-paths-master': {
    badgeId: 'multiple-paths-master',
    badgeName: 'Multiple Paths Master',
    category: 'meta',
    description: 'Solves same problem using multiple methods',
    icon: 'fa-route',
    triggerCriteria: {
      skillIds: ['all'],
      requiredInstances: 3,
      detectionPattern: 'alternative_solutions'
    },
    detectionReason: 'Demonstrated alternative solutions 3 times'
  },

  'proof-checker': {
    badgeId: 'proof-checker',
    badgeName: 'Proof Checker',
    category: 'meta',
    description: 'Validates algebraic steps by substitution',
    icon: 'fa-check-double',
    triggerCriteria: {
      skillIds: ['all'],
      requiredInstances: 5,
      detectionPattern: 'solution_verification'
    },
    detectionReason: 'Verified 5 multi-step solutions by substitution'
  },

  'pattern-spotter': {
    badgeId: 'pattern-spotter',
    badgeName: 'Pattern Spotter',
    category: 'meta',
    description: 'Recognizes mathematical patterns before being told',
    icon: 'fa-eye',
    triggerCriteria: {
      skillIds: ['patterns', 'sequences'],
      requiredInstances: 4,
      detectionPattern: 'early_pattern_recognition'
    },
    detectionReason: 'Identified patterns in 4 problems before hints'
  },

  // ========================================
  // FRACTION/RATIO STRATEGY BADGES
  // ========================================

  'fraction-fluent': {
    badgeId: 'fraction-fluent',
    badgeName: 'Fraction Fluent',
    category: 'fractions',
    description: 'Handles fraction operations smoothly across contexts',
    icon: 'fa-slash',
    triggerCriteria: {
      skillIds: ['add-fractions', 'multiply-fractions', 'divide-fractions'],
      requiredInstances: 10,
      detectionPattern: 'consistent_fraction_mastery'
    },
    detectionReason: 'Completed 10 fraction problems across different operations with 90%+ accuracy'
  },

  'ratio-reasoning': {
    badgeId: 'ratio-reasoning',
    badgeName: 'Ratio Reasoning',
    category: 'ratios',
    description: 'Sets up proportions correctly in word problems',
    icon: 'fa-balance-scale',
    triggerCriteria: {
      skillIds: ['ratios', 'proportions', 'percent-problems'],
      requiredInstances: 6,
      detectionPattern: 'correct_proportion_setup'
    },
    detectionReason: 'Set up and solved 6 proportion word problems correctly'
  },

  // ========================================
  // GRAPHING STRATEGY BADGES
  // ========================================

  'graph-reader': {
    badgeId: 'graph-reader',
    badgeName: 'Graph Reader',
    category: 'graphing',
    description: 'Extracts information from graphs accurately',
    icon: 'fa-chart-line',
    triggerCriteria: {
      skillIds: ['read-graphs', 'interpret-graphs', 'slope-from-graph'],
      requiredInstances: 7,
      detectionPattern: 'correct_graph_interpretation'
    },
    detectionReason: 'Extracted correct information from 7 different graphs'
  },

  'slope-specialist': {
    badgeId: 'slope-specialist',
    badgeName: 'Slope Specialist',
    category: 'graphing',
    description: 'Finds slope using multiple methods (formula, graph, table)',
    icon: 'fa-chart-line-up',
    triggerCriteria: {
      skillIds: ['slope-from-two-points', 'slope-from-graph', 'slope-from-table'],
      requiredInstances: 5,
      detectionPattern: 'multi_method_slope'
    },
    detectionReason: 'Found slope using 3+ different methods across 5 problems'
  },

  // ========================================
  // ESTIMATION & MENTAL MATH BADGES
  // ========================================

  'estimation-expert': {
    badgeId: 'estimation-expert',
    badgeName: 'Estimation Expert',
    category: 'mental-math',
    description: 'Makes smart estimates before calculating',
    icon: 'fa-bullseye',
    triggerCriteria: {
      skillIds: ['all'],
      requiredInstances: 5,
      detectionPattern: 'accurate_estimation'
    },
    detectionReason: 'Made accurate estimates within 10% on 5 problems'
  }
};

/**
 * Detect if a strategy badge should be awarded based on problem attempt history
 */
function detectStrategyBadge(userId, attemptHistory, userStrategyBadges) {
  const earnedBadges = [];

  for (const [badgeId, badge] of Object.entries(STRATEGY_BADGES)) {
    // Skip if already earned
    if (userStrategyBadges.some(b => b.badgeId === badgeId)) {
      continue;
    }

    // Check if criteria met
    const { skillIds, requiredInstances, detectionPattern, speedThreshold } = badge.triggerCriteria;

    // Filter attempts that match this badge's skill IDs
    const relevantAttempts = attemptHistory.filter(attempt =>
      skillIds.includes('all') || skillIds.includes(attempt.skillId)
    );

    // Check pattern-specific logic
    let matches = 0;

    switch (detectionPattern) {
      case 'correct_double_distribution':
        matches = relevantAttempts.filter(a =>
          a.correct && a.problemType === 'expand-binomials' && a.usedDistribution
        ).length;
        break;

      case 'perfect_isolation_steps':
        matches = relevantAttempts.filter(a =>
          a.correct && a.isolationSteps && a.isolationSteps.every(s => s.correct)
        ).length;
        break;

      case 'methodical_simplification':
        matches = relevantAttempts.filter(a =>
          a.correct && a.stepsShown && a.stepsShown.length >= 3
        ).length;
        break;

      case 'fast_pattern_recognition':
        matches = relevantAttempts.filter(a =>
          a.correct && a.responseTime && a.responseTime <= speedThreshold
        ).length;
        break;

      case 'correct_error_identification':
        matches = relevantAttempts.filter(a =>
          a.taskType === 'error-detection' && a.correct
        ).length;
        break;

      case 'alternative_solutions':
        matches = relevantAttempts.filter(a =>
          a.usedAlternativeMethod
        ).length;
        break;

      case 'solution_verification':
        matches = relevantAttempts.filter(a =>
          a.verifiedSolution && a.verificationCorrect
        ).length;
        break;

      case 'consistent_fraction_mastery':
        matches = relevantAttempts.filter(a => a.correct).length;
        const accuracy = matches / relevantAttempts.length;
        if (matches >= requiredInstances && accuracy >= 0.90) {
          matches = requiredInstances;  // Trigger badge
        } else {
          matches = 0;
        }
        break;

      default:
        // Generic correct answers
        matches = relevantAttempts.filter(a => a.correct).length;
    }

    // Award badge if criteria met
    if (matches >= requiredInstances) {
      earnedBadges.push({
        badgeId: badge.badgeId,
        badgeName: badge.badgeName,
        category: badge.category,
        earnedDate: new Date(),
        triggerContext: {
          problemIds: relevantAttempts.slice(0, requiredInstances).map(a => a.problemId),
          detectionReason: badge.detectionReason
        }
      });
    }
  }

  return earnedBadges;
}

/**
 * Get strategy badge by ID
 */
function getStrategyBadge(badgeId) {
  return STRATEGY_BADGES[badgeId] || null;
}

/**
 * Get all strategy badges
 */
function getAllStrategyBadges() {
  return Object.values(STRATEGY_BADGES);
}

/**
 * Get strategy badges by category
 */
function getStrategyBadgesByCategory(category) {
  return Object.values(STRATEGY_BADGES).filter(b => b.category === category);
}

module.exports = {
  STRATEGY_BADGES,
  detectStrategyBadge,
  getStrategyBadge,
  getAllStrategyBadges,
  getStrategyBadgesByCategory
};
