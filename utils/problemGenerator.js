/**
 * PROBLEM GENERATOR (Template-Based)
 *
 * Generates infinite variety of problems with known IRT parameters.
 *
 * PHILOSOPHY:
 * - Templates provide structure and predictable difficulty
 * - Randomization provides variety
 * - IRT parameters are pre-calibrated based on template complexity
 *
 * @module problemGenerator
 */

// ===========================================================================
// UTILITY FUNCTIONS
// ===========================================================================

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

// ===========================================================================
// PROBLEM TEMPLATES
// ===========================================================================

const TEMPLATES = {
  // =========================================================================
  // INTEGER OPERATIONS
  // =========================================================================

  'integer-addition': {
    skillId: 'integer-addition',
    baseDifficulty: -0.5,
    baseDiscrimination: 1.2,

    generate: (targetDifficulty = -0.5) => {
      // Scale complexity with target difficulty
      const useNegatives = targetDifficulty > -0.3;
      const useLargeNumbers = targetDifficulty > 0.2;

      // Scale number ranges based on difficulty
      const maxNum = Math.max(5, Math.min(20, Math.floor(10 + targetDifficulty * 10)));

      const a = useNegatives ? random(-maxNum, maxNum) : random(1, maxNum);
      const b = useNegatives ? random(-maxNum, maxNum) : random(1, maxNum);
      const answer = a + b;

      // Calculate difficulty based on features, centered on target
      let difficulty = targetDifficulty;
      if (useNegatives) difficulty += 0.15;
      if (Math.abs(a) > 15 || Math.abs(b) > 15) difficulty += 0.1;

      // Clamp to reasonable range around target
      difficulty = Math.max(targetDifficulty - 0.3, Math.min(targetDifficulty + 0.3, difficulty));

      return {
        content: `${a} + ${b}`,
        answer,
        difficulty,
        discrimination: 1.2,
        estimatedTime: 8
      };
    }
  },

  'integer-subtraction': {
    skillId: 'integer-subtraction',
    baseDifficulty: -0.3,
    baseDiscrimination: 1.3,

    generate: (targetDifficulty = -0.3) => {
      // Scale complexity with target difficulty
      const useNegatives = targetDifficulty > 0;
      const maxNum = Math.max(5, Math.min(30, Math.floor(12 + targetDifficulty * 10)));

      const a = useNegatives ? random(-maxNum, maxNum) : random(1, maxNum);
      const b = useNegatives ? random(-maxNum, maxNum) : random(1, Math.min(maxNum, 20));
      const answer = a - b;

      // Calculate difficulty based on features, centered on target
      let difficulty = targetDifficulty;
      if (useNegatives) difficulty += 0.2;
      if (a < b) difficulty += 0.15;  // Negative result harder

      // Clamp to reasonable range around target
      difficulty = Math.max(targetDifficulty - 0.3, Math.min(targetDifficulty + 0.3, difficulty));

      return {
        content: `${a} - ${b}`,
        answer,
        difficulty,
        discrimination: 1.3,
        estimatedTime: 10
      };
    }
  },

  'integer-multiplication': {
    skillId: 'integer-all-operations',
    baseDifficulty: 0.0,
    baseDiscrimination: 1.4,

    generate: (targetDifficulty = 0.0) => {
      // Scale complexity with target difficulty
      const useNegatives = targetDifficulty > 0.3;
      const useLargeNumbers = targetDifficulty > 0.8;

      // Scale factor ranges based on difficulty
      const maxFactor = useLargeNumbers ? 15 : Math.max(6, Math.min(12, Math.floor(8 + targetDifficulty * 4)));
      let a = random(2, maxFactor);
      let b = random(2, maxFactor);

      if (useNegatives) {
        if (Math.random() < 0.5) a = -a;
        if (Math.random() < 0.5) b = -b;
      }

      const answer = a * b;

      // Calculate difficulty based on features, centered on target
      let difficulty = targetDifficulty;
      if (useNegatives) difficulty += 0.2;
      if (useLargeNumbers) difficulty += 0.15;

      // Clamp to reasonable range around target
      difficulty = Math.max(targetDifficulty - 0.3, Math.min(targetDifficulty + 0.3, difficulty));

      return {
        content: `${a} × ${b}`,
        answer,
        difficulty,
        discrimination: 1.4,
        estimatedTime: 10
      };
    }
  },

  // =========================================================================
  // ONE-STEP EQUATIONS
  // =========================================================================

  'one-step-addition': {
    skillId: 'one-step-equations-addition',
    baseDifficulty: 0.2,
    baseDiscrimination: 1.3,

    generate: (targetDifficulty = 0.2) => {
      // Scale complexity with target difficulty
      const useNegatives = targetDifficulty > 0.5;
      const variable = randomChoice(['x', 'y', 'n', 'm', 't']);

      // Scale number ranges based on difficulty (-1.0 to 2.0 range)
      const maxNum = Math.max(5, Math.min(20, Math.floor(10 + targetDifficulty * 5)));

      const constant = useNegatives ? random(-maxNum, maxNum) : random(1, maxNum);
      const answer = useNegatives ? random(-maxNum, maxNum) : random(1, maxNum);
      const sum = answer + constant;

      // Calculate difficulty based on features, centered on target
      let difficulty = targetDifficulty;
      if (constant < 0) difficulty += 0.15;
      if (sum < 0) difficulty += 0.1;

      // Clamp to reasonable range around target
      difficulty = Math.max(targetDifficulty - 0.3, Math.min(targetDifficulty + 0.3, difficulty));

      return {
        content: `${variable} + ${constant} = ${sum}`,
        answer,
        difficulty,
        discrimination: 1.3,
        estimatedTime: 15
      };
    }
  },

  'one-step-subtraction': {
    skillId: 'one-step-equations-addition',
    baseDifficulty: 0.3,
    baseDiscrimination: 1.3,

    generate: (targetDifficulty = 0.3) => {
      // Scale complexity with target difficulty
      const useNegatives = targetDifficulty > 0.6;
      const variable = randomChoice(['x', 'y', 'n', 'm']);

      // Scale number ranges based on difficulty
      const maxNum = Math.max(5, Math.min(20, Math.floor(10 + targetDifficulty * 5)));

      const constant = useNegatives ? random(-maxNum, maxNum) : random(1, maxNum);
      const answer = useNegatives ? random(-maxNum, maxNum) : random(1, maxNum);
      const result = answer - constant;

      // Calculate difficulty based on features, centered on target
      let difficulty = targetDifficulty;
      if (constant < 0) difficulty += 0.15;
      if (result < 0) difficulty += 0.1;

      // Clamp to reasonable range around target
      difficulty = Math.max(targetDifficulty - 0.3, Math.min(targetDifficulty + 0.3, difficulty));

      return {
        content: `${variable} - ${constant} = ${result}`,
        answer,
        difficulty,
        discrimination: 1.3,
        estimatedTime: 15
      };
    }
  },

  'one-step-multiplication': {
    skillId: 'one-step-equations-multiplication',
    baseDifficulty: 0.5,
    baseDiscrimination: 1.4,

    generate: (targetDifficulty = 0.5) => {
      // Scale complexity with target difficulty
      const useNegatives = targetDifficulty > 0.8;
      const variable = randomChoice(['x', 'y', 'n']);

      // Scale coefficient ranges based on difficulty
      const maxCoeff = Math.max(3, Math.min(10, Math.floor(5 + targetDifficulty * 3)));
      let coeff = random(2, maxCoeff);
      let answer = random(1, Math.max(6, Math.min(12, Math.floor(8 + targetDifficulty * 2))));

      if (useNegatives && Math.random() < 0.5) {
        coeff = -coeff;
      }

      const result = coeff * answer;

      // Calculate difficulty based on features, centered on target
      let difficulty = targetDifficulty;
      if (coeff < 0) difficulty += 0.15;
      if (Math.abs(coeff) > 6) difficulty += 0.1;

      // Clamp to reasonable range around target
      difficulty = Math.max(targetDifficulty - 0.3, Math.min(targetDifficulty + 0.3, difficulty));

      return {
        content: `${coeff}${variable} = ${result}`,
        answer,
        difficulty,
        discrimination: 1.4,
        estimatedTime: 20
      };
    }
  },

  'one-step-division': {
    skillId: 'one-step-equations-multiplication',
    baseDifficulty: 0.6,
    baseDiscrimination: 1.4,

    generate: (targetDifficulty = 0.6) => {
      const variable = randomChoice(['x', 'y', 'n']);

      // Scale divisor ranges based on difficulty
      const maxDivisor = Math.max(3, Math.min(10, Math.floor(5 + targetDifficulty * 3)));
      const divisor = random(2, maxDivisor);
      const quotient = random(1, Math.max(8, Math.min(15, Math.floor(10 + targetDifficulty * 3))));

      const answer = divisor * quotient;  // Ensure clean division

      // Calculate difficulty based on features, centered on target
      let difficulty = targetDifficulty;
      if (divisor > 6) difficulty += 0.1;

      // Clamp to reasonable range around target
      difficulty = Math.max(targetDifficulty - 0.3, Math.min(targetDifficulty + 0.3, difficulty));

      return {
        content: `${variable}/${divisor} = ${quotient}`,
        answer,
        difficulty,
        discrimination: 1.4,
        estimatedTime: 20
      };
    }
  },

  // =========================================================================
  // TWO-STEP EQUATIONS
  // =========================================================================

  'two-step-equation': {
    skillId: 'two-step-equations',
    baseDifficulty: 1.0,
    baseDiscrimination: 1.5,

    generate: (targetDifficulty = 1.0) => {
      // Scale complexity with target difficulty
      const useNegatives = targetDifficulty > 1.3;
      const variable = randomChoice(['x', 'y', 'n']);

      // Scale coefficient ranges based on difficulty
      const maxCoeff = Math.max(2, Math.min(8, Math.floor(4 + targetDifficulty * 2)));
      let coeff = random(2, maxCoeff);
      let constant = useNegatives ? random(-12, 12) : random(-10, 10);
      let answer = random(1, Math.max(6, Math.min(10, Math.floor(8 + targetDifficulty))));

      if (useNegatives && Math.random() < 0.3) {
        coeff = -coeff;
      }

      const result = coeff * answer + constant;

      // Calculate difficulty based on features, centered on target
      let difficulty = targetDifficulty;
      if (coeff < 0) difficulty += 0.15;
      if (constant < 0) difficulty += 0.1;
      if (Math.abs(coeff) > 5) difficulty += 0.1;

      // Clamp to reasonable range around target
      difficulty = Math.max(targetDifficulty - 0.3, Math.min(targetDifficulty + 0.3, difficulty));

      // Format: 3x + 5 = 14 or 3x - 5 = 4
      const sign = constant >= 0 ? '+' : '';
      const content = `${coeff}${variable} ${sign} ${constant} = ${result}`;

      return {
        content,
        answer,
        difficulty,
        discrimination: 1.5,
        estimatedTime: 30
      };
    }
  },

  // =========================================================================
  // COMBINING LIKE TERMS
  // =========================================================================

  'combining-like-terms': {
    skillId: 'combining-like-terms',
    baseDifficulty: 0.7,
    baseDiscrimination: 1.3,

    generate: (targetDifficulty = 0.7) => {
      const variable = randomChoice(['x', 'y', 'n']);
      const useThreeTerms = targetDifficulty > 1.0;

      // Scale coefficient ranges based on difficulty
      const maxCoeff = Math.max(3, Math.min(8, Math.floor(5 + targetDifficulty * 2)));
      const coeff1 = random(1, maxCoeff);
      const coeff2 = random(1, maxCoeff);
      const coeff3 = useThreeTerms ? random(-5, 5) : 0;

      const answer = coeff1 + coeff2 + coeff3;

      // Calculate difficulty based on features, centered on target
      let difficulty = targetDifficulty;
      if (useThreeTerms) difficulty += 0.15;
      if (coeff3 < 0) difficulty += 0.1;

      // Clamp to reasonable range around target
      difficulty = Math.max(targetDifficulty - 0.3, Math.min(targetDifficulty + 0.3, difficulty));

      let content;
      if (useThreeTerms) {
        const sign2 = coeff2 >= 0 ? '+' : '';
        const sign3 = coeff3 >= 0 ? '+' : '';
        content = `Simplify: ${coeff1}${variable} ${sign2} ${coeff2}${variable} ${sign3} ${coeff3}${variable}`;
      } else {
        const sign = coeff2 >= 0 ? '+' : '';
        content = `Simplify: ${coeff1}${variable} ${sign} ${coeff2}${variable}`;
      }

      return {
        content,
        answer: `${answer}${variable}`,
        answerType: 'expression',
        difficulty,
        discrimination: 1.3,
        estimatedTime: 20
      };
    }
  },

  // =========================================================================
  // ORDER OF OPERATIONS
  // =========================================================================

  'order-of-operations': {
    skillId: 'order-of-operations',
    baseDifficulty: 0.8,
    baseDiscrimination: 1.4,

    generate: (targetDifficulty = 0.8) => {
      const useParentheses = targetDifficulty > 1.0;

      // Scale number ranges based on difficulty
      const maxNum = Math.max(5, Math.min(15, Math.floor(8 + targetDifficulty * 4)));

      if (useParentheses) {
        // (a + b) × c
        const a = random(2, maxNum);
        const b = random(2, maxNum);
        const c = random(2, Math.min(6, Math.floor(4 + targetDifficulty)));
        const answer = (a + b) * c;

        // Calculate difficulty, centered on target
        let difficulty = targetDifficulty + 0.15;
        difficulty = Math.max(targetDifficulty - 0.3, Math.min(targetDifficulty + 0.3, difficulty));

        return {
          content: `(${a} + ${b}) × ${c}`,
          answer,
          difficulty,
          discrimination: 1.4,
          estimatedTime: 25
        };
      } else {
        // a + b × c
        const a = random(2, maxNum);
        const b = random(2, Math.min(8, Math.floor(6 + targetDifficulty)));
        const c = random(2, Math.min(8, Math.floor(6 + targetDifficulty)));
        const answer = a + (b * c);

        return {
          content: `${a} + ${b} × ${c}`,
          answer,
          difficulty: targetDifficulty,
          discrimination: 1.4,
          estimatedTime: 20
        };
      }
    }
  },

  // =========================================================================
  // DISTRIBUTIVE PROPERTY
  // =========================================================================

  'distributive-property': {
    skillId: 'distributive-property',
    baseDifficulty: 1.2,
    baseDiscrimination: 1.5,

    generate: (targetDifficulty = 1.2) => {
      const variable = randomChoice(['x', 'y', 'n']);

      // Scale coefficient ranges based on difficulty
      const maxCoeff = Math.max(2, Math.min(6, Math.floor(3 + targetDifficulty)));
      const coeff = random(2, maxCoeff);
      const term1 = random(1, Math.max(5, Math.min(10, Math.floor(6 + targetDifficulty * 2))));
      const term2 = random(1, Math.max(5, Math.min(10, Math.floor(6 + targetDifficulty * 2))));

      const result1 = coeff * term1;
      const result2 = coeff * term2;

      const sign = Math.random() < 0.5 ? '+' : '-';
      const term2Display = sign === '+' ? term2 : -term2;

      // Calculate difficulty based on features, centered on target
      let difficulty = targetDifficulty;
      if (sign === '-') difficulty += 0.1;

      // Clamp to reasonable range around target
      difficulty = Math.max(targetDifficulty - 0.3, Math.min(targetDifficulty + 0.3, difficulty));

      return {
        content: `Expand: ${coeff}(${term1}${variable} ${sign} ${term2})`,
        answer: `${result1}${variable} ${sign} ${result2}`,
        answerType: 'expression',
        difficulty,
        discrimination: 1.5,
        estimatedTime: 30
      };
    }
  },

  // =========================================================================
  // MULTI-STEP EQUATIONS
  // =========================================================================

  'multi-step-equation': {
    skillId: 'solving-multi-step-equations',
    baseDifficulty: 1.5,
    baseDiscrimination: 1.6,

    generate: (targetDifficulty = 1.5) => {
      const variable = randomChoice(['x', 'y']);

      // Scale coefficient ranges based on difficulty
      // 2(x + 3) = 14  →  x = 4
      const maxCoeff = Math.max(2, Math.min(5, Math.floor(3 + targetDifficulty * 0.5)));
      const coeff = random(2, maxCoeff);
      const inner = random(2, Math.max(5, Math.min(8, Math.floor(4 + targetDifficulty))));
      const answer = random(1, Math.max(6, Math.min(10, Math.floor(8 + targetDifficulty * 0.5))));
      const result = coeff * (answer + inner);

      // Calculate difficulty based on features, centered on target
      let difficulty = targetDifficulty;
      if (coeff > 3) difficulty += 0.1;

      // Clamp to reasonable range around target
      difficulty = Math.max(targetDifficulty - 0.3, Math.min(targetDifficulty + 0.3, difficulty));

      return {
        content: `${coeff}(${variable} + ${inner}) = ${result}`,
        answer,
        difficulty,
        discrimination: 1.6,
        estimatedTime: 45
      };
    }
  },

  // =========================================================================
  // ELEMENTARY SKILLS
  // =========================================================================

  'addition-within-10': {
    skillId: 'addition-within-10',
    baseDifficulty: -1.5,  // Very easy (elementary)
    baseDiscrimination: 1.0,

    generate: (targetDifficulty = -1.5) => {
      // For young students, keep numbers small (0-10)
      const a = random(0, 10);
      const b = random(0, 10 - a);  // Ensure sum stays within 10
      const answer = a + b;

      // Difficulty barely varies for this skill
      const difficulty = targetDifficulty;

      return {
        content: `${a} + ${b}`,
        answer,
        difficulty,
        discrimination: 1.0,
        estimatedTime: 5
      };
    }
  },

  'probability-basics': {
    skillId: 'probability-basics',
    baseDifficulty: 0.5,  // Medium difficulty
    baseDiscrimination: 1.3,

    generate: (targetDifficulty = 0.5) => {
      const scenarios = [
        {
          question: 'A bag contains 3 red marbles and 2 blue marbles. What is the probability of picking a red marble?',
          numerator: 3,
          denominator: 5
        },
        {
          question: 'A fair coin is flipped. What is the probability of getting heads?',
          numerator: 1,
          denominator: 2
        },
        {
          question: 'A standard die is rolled. What is the probability of rolling an even number?',
          numerator: 3,
          denominator: 6
        },
        {
          question: 'A bag contains 4 green balls and 6 yellow balls. What is the probability of picking a green ball?',
          numerator: 4,
          denominator: 10
        }
      ];

      const scenario = randomChoice(scenarios);
      const answer = (scenario.numerator / scenario.denominator).toFixed(2);

      return {
        content: scenario.question,
        answer: parseFloat(answer),
        difficulty: targetDifficulty,
        discrimination: 1.3,
        estimatedTime: 15
      };
    }
  }
};

// ===========================================================================
// ADAPTIVE DIFFICULTY ADJUSTMENT
// ===========================================================================

/**
 * Adjust problem difficulty based on student's fluency performance
 *
 * DIRECTIVE 2: Connect fluency to difficulty
 * - If fluencyZScore < -1.0 (Fast/Bored): Increase difficulty
 * - If fluencyZScore > 1.0 (Slow/Struggling): Decrease difficulty
 *
 * @param {Number} baseDifficulty - Base difficulty level
 * @param {Number} fluencyZScore - Student's fluency z-score
 * @returns {Number} Adjusted difficulty
 */
function adjustDifficultyForFluency(baseDifficulty, fluencyZScore) {
  if (!fluencyZScore || isNaN(fluencyZScore)) {
    return baseDifficulty;
  }

  let adjustment = 0;

  if (fluencyZScore < -1.0) {
    // Student is FAST (bored) - increase difficulty
    adjustment = 0.5;
    console.log(`🔥 [Adaptive] Student is fast (z=${fluencyZScore.toFixed(2)}), increasing difficulty by +${adjustment}`);

  } else if (fluencyZScore > 1.0) {
    // Student is SLOW (struggling) - decrease difficulty
    adjustment = -0.5;
    console.log(`🐢 [Adaptive] Student is struggling (z=${fluencyZScore.toFixed(2)}), decreasing difficulty by ${adjustment}`);
  }

  const adjustedDifficulty = baseDifficulty + adjustment;

  // Clamp to reasonable bounds (-2.0 to 3.0)
  return Math.max(-2.0, Math.min(3.0, adjustedDifficulty));
}

/**
 * Determine DOK level based on fluency performance
 *
 * @param {Number} fluencyZScore - Student's fluency z-score
 * @returns {Number} DOK level (1-3)
 */
function determineDOKLevel(fluencyZScore) {
  if (!fluencyZScore || isNaN(fluencyZScore)) {
    return 1; // Default to DOK 1 (Recall)
  }

  if (fluencyZScore < -1.0) {
    // Fast/Bored: Force DOK 3 (Reasoning/Word Problems)
    console.log(`📊 [Adaptive] Forcing DOK 3 (Reasoning) for fast student (z=${fluencyZScore.toFixed(2)})`);
    return 3;

  } else if (fluencyZScore > 1.0) {
    // Slow/Struggling: Force DOK 1 (Recall/Definitions)
    console.log(`📊 [Adaptive] Forcing DOK 1 (Recall) for struggling student (z=${fluencyZScore.toFixed(2)})`);
    return 1;

  } else {
    // Normal range: DOK 2 (Skills/Concepts)
    return 2;
  }
}

// ===========================================================================
// GENERATOR FUNCTIONS
// ===========================================================================

/**
 * Generate a problem at target difficulty for a skill
 *
 * @param {String} skillId - Skill identifier
 * @param {Object} options - { difficulty, templateHint, fluencyModifier }
 * @returns {Object} Generated problem
 */
function generateProblem(skillId, options = {}) {
  const { difficulty = 0, templateHint, fluencyModifier } = options;

  // DIRECTIVE 2: Adjust difficulty based on fluency
  let adjustedDifficulty = difficulty;
  let dokLevel = 1;

  if (fluencyModifier && fluencyModifier.fluencyZScore !== undefined) {
    adjustedDifficulty = adjustDifficultyForFluency(difficulty, fluencyModifier.fluencyZScore);
    dokLevel = determineDOKLevel(fluencyModifier.fluencyZScore);
  }

  // Find templates for this skill
  const matchingTemplates = Object.entries(TEMPLATES)
    .filter(([key, template]) => template.skillId === skillId);

  if (matchingTemplates.length === 0) {
    throw new Error(`No templates found for skill: ${skillId}`);
  }

  // Select template (use hint if provided, otherwise random)
  let template;
  if (templateHint && TEMPLATES[templateHint]) {
    template = TEMPLATES[templateHint];
  } else {
    template = randomChoice(matchingTemplates.map(([k, v]) => v));
  }

  // Generate problem with adjusted difficulty
  const problem = template.generate(adjustedDifficulty);

  // Add metadata
  return {
    problemId: generateProblemId(),
    skillId,
    content: problem.content,
    answer: problem.answer,
    answerType: problem.answerType || 'integer',
    irtParameters: {
      difficulty: problem.difficulty,
      discrimination: problem.discrimination,
      calibrationConfidence: 'expert'
    },
    dokLevel: dokLevel, // DIRECTIVE 2: Use adaptive DOK level
    metadata: {
      estimatedTime: problem.estimatedTime,
      source: 'template',
      templateId: templateHint,
      generationParams: {
        difficulty,
        adjustedDifficulty, // Track adjustment
        templateHint,
        fluencyModifier: fluencyModifier || null
      }
    },
    isActive: true
  };
}

/**
 * Generate a batch of problems for a skill
 *
 * @param {String} skillId - Skill identifier
 * @param {Number} count - Number of problems to generate
 * @returns {Array} Array of generated problems
 */
function generateBatch(skillId, count = 10) {
  const problems = [];
  const difficultyRange = [-1, -0.5, 0, 0.5, 1.0, 1.5, 2.0];

  for (let i = 0; i < count; i++) {
    const difficulty = randomChoice(difficultyRange);
    problems.push(generateProblem(skillId, { difficulty }));
  }

  return problems;
}

/**
 * Generate problem ID
 */
function generateProblemId() {
  return `prob_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = {
  generateProblem,
  generateBatch,
  TEMPLATES,
  adjustDifficultyForFluency,
  determineDOKLevel
};
