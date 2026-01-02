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
            skillIds: ['one-step-equations', 'one-step-addition', 'one-step-subtraction', 'one-step-multiplication', 'one-step-division', 'one-step-equations-addition', 'one-step-equations-multiplication'],
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
            skillIds: ['addition', 'subtraction', 'addition-subtraction-word-problems', 'integer-addition', 'integer-subtraction'],
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
          },
          {
            milestoneId: 'change-word-problems',
            name: 'Change Story Problems',
            description: 'Solve word problems involving change scenarios',
            skillIds: ['addition-subtraction-word-problems', 'result-unknown', 'change-unknown'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
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
  },

  // ============================================================================
  // PATTERN 4: STRUCTURE
  // Understanding how things are organized, decomposed, and composed
  // ============================================================================
  structure: {
    patternId: 'structure',
    name: 'Structure',
    description: 'Understanding how things are organized, decomposed, and composed',
    icon: 'fa-cubes',
    color: '#9c27b0',  // Purple

    tiers: [
      {
        tier: 1,
        name: 'Part-Whole Relationships',
        description: 'Breaking numbers apart and putting them together',
        gradeRange: [1, 3],
        milestones: [
          {
            milestoneId: 'number-decomposition',
            name: 'Number Decomposition',
            description: 'Break numbers into parts (tens and ones)',
            skillIds: ['place-value', 'decompose-numbers', 'expanded-form'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          },
          {
            milestoneId: 'number-composition',
            name: 'Number Composition',
            description: 'Combine parts to make wholes',
            skillIds: ['compose-numbers', 'regrouping'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          },
          {
            milestoneId: 'part-part-whole',
            name: 'Part-Part-Whole',
            description: 'Understand relationship between parts and whole',
            skillIds: ['part-part-whole', 'addition-as-joining'],
            requiredAccuracy: 0.80,
            requiredProblems: 12
          },
          {
            milestoneId: 'number-bonds',
            name: 'Number Bonds',
            description: 'Build fluency with number relationships and bonds',
            skillIds: ['number-bonds', 'make-ten', 'doubles-near-doubles'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          }
        ]
      },
      {
        tier: 2,
        name: 'Algebraic Structure',
        description: 'Expressions, factoring, and symbolic organization',
        gradeRange: [6, 9],
        milestones: [
          {
            milestoneId: 'combining-like-terms',
            name: 'Combining Like Terms',
            description: 'Simplify expressions by grouping',
            skillIds: ['combining-like-terms', 'simplify-expressions'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'distributive-property',
            name: 'Distributive Property',
            description: 'Expand and factor expressions',
            skillIds: ['distributive-property', 'expanding-expressions'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'factoring',
            name: 'Factoring',
            description: 'Factor quadratics and polynomials',
            skillIds: ['factoring-quadratics', 'factoring-gcf', 'factoring-difference-squares'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'order-of-operations',
            name: 'Order of Operations',
            description: 'Apply PEMDAS/GEMDAS to evaluate expressions',
            skillIds: ['order-of-operations', 'evaluate-expressions', 'nested-operations', 'numerical-expressions-exponents'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          }
        ]
      },
      {
        tier: 3,
        name: 'Function Families',
        description: 'Understanding function transformations and families',
        gradeRange: [9, 11],
        milestones: [
          {
            milestoneId: 'parent-functions',
            name: 'Parent Functions',
            description: 'Identify and graph parent functions',
            skillIds: ['parent-functions', 'function-families'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'transformations',
            name: 'Function Transformations',
            description: 'Transform functions: shifts, stretches, reflections',
            skillIds: ['function-transformations', 'vertical-shift', 'horizontal-shift'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'composition',
            name: 'Function Composition',
            description: 'Compose and decompose functions',
            skillIds: ['function-composition', 'inverse-functions'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          }
        ]
      },
      {
        tier: 4,
        name: 'Mathematical Structures',
        description: 'Abstract algebra, groups, vector spaces',
        gradeRange: [12, 13],
        milestones: [
          {
            milestoneId: 'vector-spaces',
            name: 'Vector Spaces',
            description: 'Understand linear independence and span',
            skillIds: ['vector-spaces', 'linear-independence'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'abstract-structures',
            name: 'Abstract Structures',
            description: 'Groups, rings, and fields',
            skillIds: ['abstract-algebra', 'group-theory'],
            requiredAccuracy: 0.85,
            requiredProblems: 10
          }
        ]
      }
    ]
  },

  // ============================================================================
  // PATTERN 5: SPACE
  // Spatial reasoning, geometry, and coordinate systems
  // ============================================================================
  space: {
    patternId: 'space',
    name: 'Space',
    description: 'Spatial reasoning, geometry, and coordinate systems',
    icon: 'fa-cube',
    color: '#00bcd4',  // Cyan

    tiers: [
      {
        tier: 1,
        name: 'Concrete Shapes',
        description: '2D and 3D shapes, position, and measurement',
        gradeRange: [1, 4],
        milestones: [
          {
            milestoneId: 'shape-recognition',
            name: 'Shape Recognition',
            description: 'Identify and classify 2D and 3D shapes',
            skillIds: ['identify-shapes', 'classify-shapes', '2d-shapes', '3d-shapes'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          },
          {
            milestoneId: 'spatial-relationships',
            name: 'Spatial Relationships',
            description: 'Describe position (above, below, next to)',
            skillIds: ['spatial-relationships', 'position-words'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          },
          {
            milestoneId: 'area-perimeter',
            name: 'Area & Perimeter',
            description: 'Calculate area and perimeter of rectangles',
            skillIds: ['area-rectangles', 'perimeter', 'area-perimeter-word-problems'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'symmetry-basics',
            name: 'Symmetry',
            description: 'Identify and create symmetric shapes',
            skillIds: ['line-symmetry', 'symmetry-shapes', 'create-symmetry'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          }
        ]
      },
      {
        tier: 2,
        name: 'Coordinate Geometry',
        description: 'Graphing, distance, and the coordinate plane',
        gradeRange: [6, 8],
        milestones: [
          {
            milestoneId: 'coordinate-plane',
            name: 'Coordinate Plane',
            description: 'Plot points and identify quadrants',
            skillIds: ['coordinate-plane', 'plotting-points', 'quadrants'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'distance-midpoint',
            name: 'Distance & Midpoint',
            description: 'Calculate distance and midpoint formulas',
            skillIds: ['distance-formula', 'midpoint-formula'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'graphing-lines',
            name: 'Graphing Lines',
            description: 'Graph linear equations and find slope',
            skillIds: ['graphing-linear-equations', 'slope', 'slope-intercept-form'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          }
        ]
      },
      {
        tier: 3,
        name: 'Transformations',
        description: 'Rotations, reflections, dilations, and symmetry',
        gradeRange: [8, 10],
        milestones: [
          {
            milestoneId: 'rigid-transformations',
            name: 'Rigid Transformations',
            description: 'Translations, rotations, reflections',
            skillIds: ['translations', 'rotations', 'reflections'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'dilations',
            name: 'Dilations',
            description: 'Scale figures using dilations',
            skillIds: ['dilations', 'scale-factor'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'congruence-similarity',
            name: 'Congruence & Similarity',
            description: 'Prove congruence and similarity',
            skillIds: ['congruence', 'similarity', 'geometric-proofs'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          }
        ]
      },
      {
        tier: 4,
        name: 'Vector Spaces',
        description: 'Linear transformations, matrices, and vector geometry',
        gradeRange: [11, 13],
        milestones: [
          {
            milestoneId: 'vectors',
            name: 'Vectors',
            description: 'Vector operations and representations',
            skillIds: ['vectors', 'vector-addition', 'scalar-multiplication'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'matrices',
            name: 'Matrix Transformations',
            description: 'Represent transformations with matrices',
            skillIds: ['matrices', 'matrix-transformations'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          }
        ]
      }
    ]
  },

  // ============================================================================
  // PATTERN 6: COMPARISON
  // Ordering, inequality, and relative size
  // ============================================================================
  comparison: {
    patternId: 'comparison',
    name: 'Comparison',
    description: 'Ordering, inequality, and relative size',
    icon: 'fa-sort-amount-up',
    color: '#ff9800',  // Orange

    tiers: [
      {
        tier: 1,
        name: 'Concrete Comparison',
        description: 'Greater than, less than, ordering numbers',
        gradeRange: [1, 3],
        milestones: [
          {
            milestoneId: 'greater-less',
            name: 'Greater/Less Than',
            description: 'Compare numbers using >, <, =',
            skillIds: ['comparing-numbers', 'greater-less-than', 'equal-to'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          },
          {
            milestoneId: 'ordering-numbers',
            name: 'Ordering Numbers',
            description: 'Put numbers in order from least to greatest',
            skillIds: ['ordering-numbers', 'number-order'],
            requiredAccuracy: 0.80,
            requiredProblems: 12
          },
          {
            milestoneId: 'rounding',
            name: 'Rounding',
            description: 'Round to nearest ten, hundred',
            skillIds: ['rounding', 'rounding-to-nearest-ten'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          },
          {
            milestoneId: 'estimation',
            name: 'Estimation',
            description: 'Estimate sums, differences, and reasonableness',
            skillIds: ['estimation', 'estimate-sums', 'check-reasonableness'],
            requiredAccuracy: 0.80,
            requiredProblems: 12
          }
        ]
      },
      {
        tier: 2,
        name: 'Symbolic Inequalities',
        description: 'Solving and graphing inequalities',
        gradeRange: [6, 8],
        milestones: [
          {
            milestoneId: 'one-step-inequalities',
            name: 'One-Step Inequalities',
            description: 'Solve x + 5 > 12',
            skillIds: ['one-step-inequalities', 'solving-inequalities'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'two-step-inequalities',
            name: 'Two-Step Inequalities',
            description: 'Solve 2x + 3 < 11',
            skillIds: ['two-step-inequalities', 'multi-step-inequalities'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'graphing-inequalities',
            name: 'Graphing Inequalities',
            description: 'Graph inequalities on number line',
            skillIds: ['graphing-inequalities', 'inequality-notation'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          }
        ]
      },
      {
        tier: 3,
        name: 'Systems of Inequalities',
        description: 'Linear programming and optimization',
        gradeRange: [9, 11],
        milestones: [
          {
            milestoneId: 'systems-inequalities',
            name: 'Systems of Inequalities',
            description: 'Graph systems of linear inequalities',
            skillIds: ['systems-of-inequalities', 'graphing-systems-inequalities'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'linear-programming',
            name: 'Linear Programming',
            description: 'Find maximum/minimum with constraints',
            skillIds: ['linear-programming', 'optimization'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'absolute-value-inequalities',
            name: 'Absolute Value Inequalities',
            description: 'Solve |x - 3| < 5',
            skillIds: ['absolute-value-inequalities'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          }
        ]
      },
      {
        tier: 4,
        name: 'Calculus Optimization',
        description: 'Finding extrema using derivatives',
        gradeRange: [12, 13],
        milestones: [
          {
            milestoneId: 'critical-points',
            name: 'Critical Points',
            description: 'Find and classify critical points',
            skillIds: ['critical-points', 'first-derivative-test'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'optimization-calculus',
            name: 'Optimization Problems',
            description: 'Applied max/min problems with calculus',
            skillIds: ['optimization-calculus', 'applied-max-min'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          }
        ]
      }
    ]
  },

  // ============================================================================
  // PATTERN 7: UNCERTAINTY
  // Probability, statistics, and dealing with randomness
  // ============================================================================
  uncertainty: {
    patternId: 'uncertainty',
    name: 'Uncertainty',
    description: 'Probability, statistics, and dealing with randomness',
    icon: 'fa-dice',
    color: '#e91e63',  // Pink

    tiers: [
      {
        tier: 1,
        name: 'Concrete Chance',
        description: 'Likely, unlikely, and simple probability',
        gradeRange: [2, 4],
        milestones: [
          {
            milestoneId: 'likely-unlikely',
            name: 'Likely vs Unlikely',
            description: 'Describe events as likely or unlikely',
            skillIds: ['likely-unlikely', 'probability-language'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          },
          {
            milestoneId: 'simple-probability',
            name: 'Simple Probability',
            description: 'Find probability of simple events',
            skillIds: ['simple-probability', 'probability-fractions', 'probability-basics', 'statistics-probability'],
            requiredAccuracy: 0.80,
            requiredProblems: 12
          },
          {
            milestoneId: 'data-collection',
            name: 'Data Collection',
            description: 'Collect and organize data in tables',
            skillIds: ['data-collection', 'tally-charts', 'frequency-tables'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          }
        ]
      },
      {
        tier: 2,
        name: 'Statistical Reasoning',
        description: 'Mean, median, mode, and distributions',
        gradeRange: [6, 8],
        milestones: [
          {
            milestoneId: 'measures-of-center',
            name: 'Measures of Center',
            description: 'Calculate mean, median, mode',
            skillIds: ['mean', 'median', 'mode', 'measures-of-center'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'measures-of-spread',
            name: 'Measures of Spread',
            description: 'Range, interquartile range, standard deviation',
            skillIds: ['range', 'iqr', 'standard-deviation'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'data-displays',
            name: 'Data Displays',
            description: 'Create and interpret histograms, box plots',
            skillIds: ['histograms', 'box-plots', 'data-displays'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          }
        ]
      },
      {
        tier: 3,
        name: 'Probabilistic Models',
        description: 'Combinations, permutations, probability rules',
        gradeRange: [9, 11],
        milestones: [
          {
            milestoneId: 'counting-principles',
            name: 'Counting Principles',
            description: 'Fundamental counting principle',
            skillIds: ['fundamental-counting-principle', 'counting-methods'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'permutations-combinations',
            name: 'Permutations & Combinations',
            description: 'Calculate nPr and nCr',
            skillIds: ['permutations', 'combinations'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'probability-rules',
            name: 'Probability Rules',
            description: 'AND/OR rules, conditional probability',
            skillIds: ['compound-probability', 'conditional-probability'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          }
        ]
      },
      {
        tier: 4,
        name: 'Inferential Statistics',
        description: 'Hypothesis testing, confidence intervals',
        gradeRange: [11, 13],
        milestones: [
          {
            milestoneId: 'sampling-distributions',
            name: 'Sampling Distributions',
            description: 'Central limit theorem, sampling variability',
            skillIds: ['sampling-distributions', 'central-limit-theorem'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'confidence-intervals',
            name: 'Confidence Intervals',
            description: 'Calculate and interpret confidence intervals',
            skillIds: ['confidence-intervals', 'margin-of-error'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'hypothesis-testing',
            name: 'Hypothesis Testing',
            description: 'Null/alternative hypotheses, p-values',
            skillIds: ['hypothesis-testing', 'p-values', 'significance-testing'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          }
        ]
      }
    ]
  },

  // ============================================================================
  // PATTERN 8: ACCUMULATION
  // Adding up, totals, area under curve, integration
  // ============================================================================
  accumulation: {
    patternId: 'accumulation',
    name: 'Accumulation',
    description: 'Adding up, totals, area under curve, integration',
    icon: 'fa-layer-group',
    color: '#795548',  // Brown

    tiers: [
      {
        tier: 1,
        name: 'Concrete Accumulation',
        description: 'Counting collections, finding totals',
        gradeRange: [1, 3],
        milestones: [
          {
            milestoneId: 'counting-collections',
            name: 'Counting Collections',
            description: 'Count groups of objects to find total',
            skillIds: ['counting', 'counting-by-groups', 'skip-counting'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          },
          {
            milestoneId: 'addition-as-accumulation',
            name: 'Addition as Accumulation',
            description: 'Add to find total of parts',
            skillIds: ['addition', 'multi-digit-addition', 'adding-groups'],
            requiredAccuracy: 0.80,
            requiredProblems: 12
          },
          {
            milestoneId: 'repeated-addition',
            name: 'Repeated Addition',
            description: 'Add equal groups (introduction to multiplication)',
            skillIds: ['repeated-addition', 'multiplication-basics'],
            requiredAccuracy: 0.80,
            requiredProblems: 10
          }
        ]
      },
      {
        tier: 2,
        name: 'Discrete Sums',
        description: 'Sequences, series, and summation',
        gradeRange: [6, 9],
        milestones: [
          {
            milestoneId: 'arithmetic-sequences',
            name: 'Arithmetic Sequences',
            description: 'Find patterns and nth terms',
            skillIds: ['arithmetic-sequences', 'sequence-patterns'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'geometric-sequences',
            name: 'Geometric Sequences',
            description: 'Exponential growth patterns',
            skillIds: ['geometric-sequences', 'exponential-patterns'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'series-basics',
            name: 'Series Basics',
            description: 'Sum of arithmetic and geometric series',
            skillIds: ['arithmetic-series', 'geometric-series'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          }
        ]
      },
      {
        tier: 3,
        name: 'Summation Notation',
        description: 'Sigma notation and finite series',
        gradeRange: [10, 11],
        milestones: [
          {
            milestoneId: 'sigma-notation',
            name: 'Sigma Notation',
            description: 'Understand and use Σ notation',
            skillIds: ['sigma-notation', 'summation-notation'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'finite-series',
            name: 'Finite Series',
            description: 'Calculate sums using formulas',
            skillIds: ['finite-series', 'series-formulas'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'area-under-curve',
            name: 'Area Approximation',
            description: 'Riemann sums and area estimation',
            skillIds: ['riemann-sums', 'area-approximation'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          }
        ]
      },
      {
        tier: 4,
        name: 'Integration',
        description: 'Definite integrals and accumulation functions',
        gradeRange: [12, 13],
        milestones: [
          {
            milestoneId: 'antiderivatives',
            name: 'Antiderivatives',
            description: 'Find antiderivatives of functions',
            skillIds: ['antiderivatives', 'indefinite-integrals'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
          },
          {
            milestoneId: 'definite-integrals',
            name: 'Definite Integrals',
            description: 'Calculate area under curve using FTC',
            skillIds: ['definite-integrals', 'fundamental-theorem-calculus'],
            requiredAccuracy: 0.85,
            requiredProblems: 15
          },
          {
            milestoneId: 'accumulation-functions',
            name: 'Accumulation Functions',
            description: 'Understand integrals as accumulation',
            skillIds: ['accumulation-functions', 'net-change'],
            requiredAccuracy: 0.85,
            requiredProblems: 12
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
