// utils/patternBadges.js
// Master Mode: Pattern-Based Badge System
// Patterns persist K-12, tiers represent abstraction height

/**
 * PATTERN BADGE ARCHITECTURE
 *
 * Pattern Badges = Who you're becoming (permanent, upgrade across years)
 * Tiers = Abstraction level (not difficulty: Concrete → Symbolic → Structural → Formal)
 * Milestones = What you did today (daily progress, can expire)
 *
 * North Star:
 * Patterns are the map.
 * Tiers show growth.
 * Milestones make progress visible.
 * Remediation never breaks dignity.
 */

const PATTERN_BADGES = {
  // ============================================================================
  // PATTERN 1: EQUIVALENCE
  // Balance, sameness, maintaining relationships
  // ============================================================================
  equivalence: {
    patternId: 'equivalence',
    name: 'Equivalence',
    description: 'Balance, sameness, and maintaining relationships',
    icon: 'fa-balance-scale',
    color: '#2196f3',  // Blue

    tiers: [
      {
        tier: 1,
        name: 'Concrete Balance',
        description: 'Balance scales, missing addends, fact families',
        gradeRange: [1, 3],
        milestones: [
          {
            milestoneId: 'fact-families',
            name: 'Fact Families',
            description: 'Understand related addition/subtraction facts',
            skillIds: ['fact-families', 'related-facts'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          },
          {
            milestoneId: 'missing-addend',
            name: 'Missing Addend',
            description: 'Find unknown in addition: 5 + __ = 12',
            skillIds: ['missing-addend', 'unknown-addend'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'balance-scales',
            name: 'Balance Scales',
            description: 'Maintain equality on both sides',
            skillIds: ['balance-scales', 'equality-concept'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          },
          {
            milestoneId: 'early-algebra',
            name: 'Proto-Variables',
            description: 'Use boxes/blanks as placeholders (early algebra)',
            skillIds: ['missing-number-problems', 'blank-as-variable'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          }
        ]
      },
      {
        tier: 2,
        name: 'Symbolic Equations',
        description: 'Variables, inverse operations, maintaining balance',
        gradeRange: [6, 8],
        milestones: [
          {
            milestoneId: 'one-step-equations',
            name: 'One-Step Equations',
            description: 'Solve x + 5 = 12 using inverse operations',
            skillIds: ['one-step-equations', 'one-step-addition', 'one-step-subtraction', 'one-step-multiplication', 'one-step-division'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'two-step-equations',
            name: 'Two-Step Equations',
            description: 'Solve 2x + 3 = 11 systematically',
            skillIds: ['two-step-equations'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'multi-step-equations',
            name: 'Multi-Step Equations',
            description: 'Handle distribution, combining like terms',
            skillIds: ['multi-step-equations', 'equations-with-distribution'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'variables-both-sides',
            name: 'Variables on Both Sides',
            description: 'Solve 3x + 2 = x + 10',
            skillIds: ['equations-with-variables-both-sides'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          }
        ]
      },
      {
        tier: 3,
        name: 'Systems & Constraints',
        description: 'Multiple equations, solution spaces, constraints',
        gradeRange: [9, 10],
        milestones: [
          {
            milestoneId: 'systems-substitution',
            name: 'Systems (Substitution)',
            description: 'Solve systems by substituting one equation into another',
            skillIds: ['systems-substitution'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'systems-elimination',
            name: 'Systems (Elimination)',
            description: 'Solve systems by adding/subtracting equations',
            skillIds: ['systems-elimination'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'systems-graphing',
            name: 'Systems (Graphing)',
            description: 'Find intersection points visually',
            skillIds: ['systems-graphing'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          },
          {
            milestoneId: 'solution-spaces',
            name: 'Solution Spaces',
            description: 'Understand infinite solutions, no solution cases',
            skillIds: ['systems-special-cases'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          }
        ]
      },
      {
        tier: 4,
        name: 'Formal Systems',
        description: 'Matrix equations, linear transformations, equivalence classes',
        gradeRange: [11, 12],
        milestones: [
          {
            milestoneId: 'matrix-equations',
            name: 'Matrix Equations',
            description: 'Solve Ax = b using matrices',
            skillIds: ['matrix-equations', 'gaussian-elimination'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'linear-transformations',
            name: 'Linear Transformations',
            description: 'Understand functions as structure-preserving maps',
            skillIds: ['linear-transformations'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          }
        ]
      }
    ]
  },

  // ============================================================================
  // PATTERN 2: SCALING
  // Proportional reasoning, relative size, multiplicative relationships
  // ============================================================================
  scaling: {
    patternId: 'scaling',
    name: 'Scaling',
    description: 'Proportional reasoning and relative size',
    icon: 'fa-arrows-left-right-to-line',
    color: '#9c27b0',  // Purple

    tiers: [
      {
        tier: 1,
        name: 'Groups & Parts',
        description: 'Skip counting, groups of, fractions as parts',
        gradeRange: [2, 4],
        milestones: [
          {
            milestoneId: 'skip-counting',
            name: 'Skip Counting',
            description: 'Count by 2s, 5s, 10s',
            skillIds: ['skip-counting'],
            requiredAccuracy: 0.85,
            requiredProblems: 10
          },
          {
            milestoneId: 'multiplication-concepts',
            name: 'Groups Of',
            description: 'Understand 3 × 4 as 3 groups of 4',
            skillIds: ['multiplication-concepts', 'multiplication-as-groups'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'fraction-concepts',
            name: 'Fractions as Parts',
            description: 'Understand 1/4 as one part of four equal pieces',
            skillIds: ['fraction-concepts', 'fractions-as-parts'],
            requiredAccuracy: 0.80,
            requiredProblems: 12
          },
          {
            milestoneId: 'fraction-operations',
            name: 'Fraction Operations',
            description: 'Add, subtract, multiply, divide fractions',
            skillIds: ['add-fractions', 'subtract-fractions', 'multiply-fractions', 'divide-fractions'],
            requiredAccuracy: 0.85,
            requiredProblems: 20
          }
        ]
      },
      {
        tier: 2,
        name: 'Ratios & Rates',
        description: 'Proportions, percentages, unit rates',
        gradeRange: [6, 8],
        milestones: [
          {
            milestoneId: 'ratios',
            name: 'Ratios',
            description: 'Express and compare ratios',
            skillIds: ['ratios', 'ratio-concepts'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'proportions',
            name: 'Proportions',
            description: 'Solve proportion problems (cross-multiply)',
            skillIds: ['proportions', 'solve-proportions'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'percentages',
            name: 'Percentages',
            description: 'Calculate percentages, percent change',
            skillIds: ['percent-problems', 'percent-change', 'percent-of-a-number'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'unit-rates',
            name: 'Unit Rates',
            description: 'Find and compare unit rates',
            skillIds: ['unit-rates', 'rate-problems'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          }
        ]
      },
      {
        tier: 3,
        name: 'Rational Expressions',
        description: 'Algebraic fractions, similarity, proportional reasoning',
        gradeRange: [9, 10],
        milestones: [
          {
            milestoneId: 'simplify-rational-expressions',
            name: 'Simplify Rational Expressions',
            description: 'Factor and reduce algebraic fractions',
            skillIds: ['simplify-rational-expressions'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'multiply-divide-rational',
            name: 'Multiply/Divide Rational Expressions',
            description: 'Perform operations on algebraic fractions',
            skillIds: ['multiply-rational-expressions', 'divide-rational-expressions'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'add-subtract-rational',
            name: 'Add/Subtract Rational Expressions',
            description: 'Find common denominators, combine terms',
            skillIds: ['add-subtract-rational-expressions'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'similarity',
            name: 'Similarity & Scale',
            description: 'Use proportions in geometry (similar figures)',
            skillIds: ['similar-figures', 'scale-factor'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          }
        ]
      },
      {
        tier: 4,
        name: 'Rational Functions',
        description: 'Function behavior, asymptotes, parametric scaling',
        gradeRange: [11, 12],
        milestones: [
          {
            milestoneId: 'rational-functions',
            name: 'Rational Functions',
            description: 'Graph and analyze f(x) = p(x)/q(x)',
            skillIds: ['rational-functions', 'graph-rational-functions'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'asymptotes',
            name: 'Asymptotes',
            description: 'Find vertical, horizontal, oblique asymptotes',
            skillIds: ['asymptotes', 'vertical-asymptotes', 'horizontal-asymptotes'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          }
        ]
      }
    ]
  },

  // ============================================================================
  // PATTERN 3: CHANGE
  // Rate, accumulation, continuous vs discrete change
  // ============================================================================
  change: {
    patternId: 'change',
    name: 'Change',
    description: 'Rate, growth, and how things change over time',
    icon: 'fa-chart-line',
    color: '#ff9800',  // Orange

    tiers: [
      {
        tier: 1,
        name: 'Discrete Change',
        description: 'Counting up/down, more/less, difference',
        gradeRange: [1, 3],
        milestones: [
          {
            milestoneId: 'counting-change',
            name: 'Counting Change',
            description: 'Count forward and backward',
            skillIds: ['counting-up', 'counting-down'],
            requiredAccuracy: 0.85,
            requiredProblems: 10
          },
          {
            milestoneId: 'addition-subtraction',
            name: 'Addition/Subtraction as Change',
            description: 'Understand adding as increasing, subtracting as decreasing',
            skillIds: ['addition', 'subtraction', 'addition-subtraction-word-problems'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'difference',
            name: 'Finding Difference',
            description: 'How much more/less?',
            skillIds: ['compare-numbers', 'difference-word-problems'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          }
        ]
      },
      {
        tier: 2,
        name: 'Linear Change',
        description: 'Constant rate, slope, linear relationships',
        gradeRange: [7, 9],
        milestones: [
          {
            milestoneId: 'slope-concept',
            name: 'Slope as Rate',
            description: 'Understand slope as rate of change',
            skillIds: ['slope-concepts'],
            requiredAccuracy: 0.85,
            requiredProblems: 10
          },
          {
            milestoneId: 'slope-two-points',
            name: 'Slope from Two Points',
            description: 'Calculate m = (y₂-y₁)/(x₂-x₁)',
            skillIds: ['slope-from-two-points'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'slope-intercept',
            name: 'Slope-Intercept Form',
            description: 'Graph and write y = mx + b',
            skillIds: ['slope-intercept-form', 'graph-linear-equations'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'linear-word-problems',
            name: 'Linear Growth Problems',
            description: 'Model constant rate situations',
            skillIds: ['linear-word-problems', 'rate-of-change-problems'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          }
        ]
      },
      {
        tier: 3,
        name: 'Nonlinear Change',
        description: 'Quadratic, exponential, varying rates',
        gradeRange: [9, 11],
        milestones: [
          {
            milestoneId: 'quadratic-functions',
            name: 'Quadratic Change',
            description: 'Understand accelerating/decelerating change',
            skillIds: ['quadratic-functions', 'graph-quadratic-functions'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'exponential-growth',
            name: 'Exponential Growth/Decay',
            description: 'Model multiplicative change',
            skillIds: ['exponential-functions', 'exponential-growth', 'exponential-decay'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'average-rate-of-change',
            name: 'Average Rate of Change',
            description: 'Find average rate over an interval',
            skillIds: ['average-rate-of-change'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          }
        ]
      },
      {
        tier: 4,
        name: 'Instantaneous Change',
        description: 'Derivatives, limits, instantaneous rate',
        gradeRange: [12, 13],
        milestones: [
          {
            milestoneId: 'limits',
            name: 'Limits',
            description: 'Understand limiting behavior',
            skillIds: ['limits'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'derivatives',
            name: 'Derivatives',
            description: 'Find instantaneous rate of change',
            skillIds: ['derivatives', 'derivative-rules'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          }
        ]
      }
    ]
  }
};

/**
 * Get pattern badge by ID
 */
function getPatternBadge(patternId) {
  return PATTERN_BADGES[patternId] || null;
}

/**
 * Get all pattern badges
 */
function getAllPatternBadges() {
  return Object.values(PATTERN_BADGES);
}

/**
 * Get visible tiers for a student based on grade level
 */
function getVisibleTiers(patternId, gradeLevel) {
  const pattern = PATTERN_BADGES[patternId];
  if (!pattern) return [];

  return pattern.tiers.filter(tier => {
    const [minGrade, maxGrade] = tier.gradeRange;
    // Show ±1 grade level from current
    return gradeLevel >= minGrade - 1 && gradeLevel <= maxGrade + 1;
  });
}

/**
 * Get student's current tier in a pattern based on mastery data
 */
function getCurrentTier(patternId, userSkillMastery) {
  const pattern = PATTERN_BADGES[patternId];
  if (!pattern) return 0;

  // Find highest tier where at least 50% of milestones are mastered
  let currentTier = 0;

  for (const tier of pattern.tiers) {
    const milestones = tier.milestones;
    const masteredCount = milestones.filter(milestone => {
      // Check if any skillId in this milestone is mastered
      return milestone.skillIds.some(skillId => {
        const mastery = userSkillMastery.get(skillId);
        return mastery && (mastery.status === 'mastered' || mastery.masteryType === 'inferred');
      });
    }).length;

    const masteryPercentage = masteredCount / milestones.length;

    if (masteryPercentage >= 0.5) {
      currentTier = tier.tier;
    } else {
      break;  // Stop at first tier that's not 50%+ mastered
    }
  }

  return currentTier;
}

/**
 * Get next milestone for a pattern
 */
function getNextMilestone(patternId, currentTier, userSkillMastery) {
  const pattern = PATTERN_BADGES[patternId];
  if (!pattern) return null;

  const tier = pattern.tiers.find(t => t.tier === currentTier);
  if (!tier) return null;

  // Find first incomplete milestone
  for (const milestone of tier.milestones) {
    const completed = milestone.skillIds.every(skillId => {
      const mastery = userSkillMastery.get(skillId);
      return mastery && (mastery.status === 'mastered' || mastery.masteryType === 'inferred');
    });

    if (!completed) {
      return milestone;
    }
  }

  // All milestones in this tier complete, return null (ready for next tier)
  return null;
}

/**
 * Calculate pattern progress (0-100)
 */
function calculatePatternProgress(patternId, currentTier, userSkillMastery) {
  const pattern = PATTERN_BADGES[patternId];
  if (!pattern) return 0;

  const tier = pattern.tiers.find(t => t.tier === currentTier);
  if (!tier) return 0;

  const milestones = tier.milestones;
  const completedCount = milestones.filter(milestone => {
    return milestone.skillIds.every(skillId => {
      const mastery = userSkillMastery.get(skillId);
      return mastery && (mastery.status === 'mastered' || mastery.masteryType === 'inferred');
    });
  }).length;

  return Math.round((completedCount / milestones.length) * 100);
}

/**
 * Get pattern status
 */
function getPatternStatus(patternId, currentTier, userSkillMastery) {
  const progress = calculatePatternProgress(patternId, currentTier, userSkillMastery);

  if (currentTier === 0) return 'locked';
  if (progress === 100) {
    // Check if ready for next tier
    const pattern = PATTERN_BADGES[patternId];
    const nextTier = pattern.tiers.find(t => t.tier === currentTier + 1);
    return nextTier ? 'ready-for-upgrade' : 'mastered';
  }
  if (progress > 0) return 'in-progress';
  return 'locked';
}

module.exports = {
  PATTERN_BADGES,
  getPatternBadge,
  getAllPatternBadges,
  getVisibleTiers,
  getCurrentTier,
  getNextMilestone,
  calculatePatternProgress,
  getPatternStatus
};
