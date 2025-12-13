/**
 * ALTERNATIVE REASONING DATABASE
 *
 * PHILOSOPHY: Accept non-standard strategies. Don't gaslight creative thinkers.
 *
 * THE AI RIGIDITY PROBLEM:
 * - LLMs expect "standard algorithm" and reject valid alternatives
 * - Student uses partial quotients (valid) but AI wants long division (standard)
 * - AI gaslights student into thinking their valid strategy is wrong
 * - Kills mathematical creativity and problem-solving flexibility
 *
 * SOLUTION: Seed AI with alternative valid strategies
 * - Lattice multiplication, area models, number lines
 * - Partial quotients, chunking, repeated subtraction
 * - Mental math tricks, shortcuts, non-standard approaches
 * - Validate the LOGIC, not the PROCEDURE
 *
 * @module alternativeReasoning
 */

/**
 * Alternative Valid Strategies by Concept
 *
 * Each concept has multiple valid approaches. AI must accept ANY of them.
 */
const ALTERNATIVE_STRATEGIES = {
  'multiplication': {
    standard: 'Standard algorithm (multiply digits, carry)',
    alternatives: [
      {
        name: 'Lattice Method',
        description: 'Grid/box method with diagonal addition',
        example: '23 × 45 using diagonal lattice grid',
        valid: true,
        commonIn: ['Singapore Math', 'Some US curricula']
      },
      {
        name: 'Area Model',
        description: 'Break into (20 + 3) × (40 + 5) rectangles',
        example: '(20×40) + (20×5) + (3×40) + (3×5) = 1035',
        valid: true,
        commonIn: ['Common Core', 'Conceptual teaching']
      },
      {
        name: 'Partial Products',
        description: 'Multiply each place value separately then add',
        example: '23 × 45 = (20×40) + (20×5) + (3×40) + (3×5)',
        valid: true,
        commonIn: ['Everyday Mathematics', 'Mental math']
      },
      {
        name: 'Doubling/Halving',
        description: 'For specific numbers, double one and halve the other',
        example: '25 × 16 = 50 × 8 = 100 × 4 = 400',
        valid: true,
        commonIn: ['Mental math tricks']
      }
    ]
  },

  'division': {
    standard: 'Long division algorithm',
    alternatives: [
      {
        name: 'Partial Quotients',
        description: 'Subtract multiples of divisor repeatedly',
        example: '100 ÷ 4: "4 goes into 100 twenty times (80), with 20 left. 4 goes into 20 five more times. Total: 25"',
        valid: true,
        commonIn: ['Reform mathematics', 'Alternative curricula']
      },
      {
        name: 'Chunking',
        description: 'Break division into friendly chunks',
        example: '100 ÷ 4: "I know 4×25=100, so answer is 25"',
        valid: true,
        commonIn: ['Mental math', 'Number sense approach']
      },
      {
        name: 'Area Model',
        description: 'Represent division as rectangle with unknown dimension',
        example: '100 ÷ 4 as "rectangle with area 100 and width 4, find length"',
        valid: true,
        commonIn: ['Visual learners', 'Conceptual approach']
      }
    ]
  },

  'fraction-addition': {
    standard: 'Find common denominator, add numerators',
    alternatives: [
      {
        name: 'Visual Model',
        description: 'Draw fraction bars/circles and combine',
        example: '1/2 + 1/4 drawn as shaded circles',
        valid: true,
        commonIn: ['Elementary introduction', 'Visual learners']
      },
      {
        name: 'Benchmark Strategy',
        description: 'Use 0, 1/2, 1 as reference points',
        example: '3/8 + 5/8 = "both close to 1/2, so about 1"',
        valid: true,
        commonIn: ['Estimation', 'Number sense']
      }
    ]
  },

  'equation-solving': {
    standard: 'Inverse operations, isolate variable',
    alternatives: [
      {
        name: 'Guess and Check',
        description: 'Try values systematically until equation balances',
        example: '2x + 5 = 13: "Try x=3: 2(3)+5=11, too small. Try x=4: 2(4)+5=13 ✓"',
        valid: true,
        validityCondition: 'When used systematically with reasoning',
        commonIn: ['Younger students', 'Building intuition']
      },
      {
        name: 'Backtracking',
        description: 'Work backwards from the answer',
        example: '2x + 5 = 13: "13 - 5 = 8, then 8 ÷ 2 = 4"',
        valid: true,
        commonIn: ['Mental math', 'Simple equations']
      },
      {
        name: 'Cover-Up Method',
        description: 'Cover the variable term and solve',
        example: 'x + 7 = 12: "Cover x+7, what equals 12? Then work backwards"',
        valid: true,
        commonIn: ['Elementary algebra introduction']
      }
    ]
  },

  'fraction-division': {
    standard: 'Multiply by reciprocal (flip and multiply)',
    alternatives: [
      {
        name: 'Common Denominator Method',
        description: 'Convert to same denominator, then divide numerators',
        example: '1/2 ÷ 1/4 = 2/4 ÷ 1/4 = 2',
        valid: true,
        commonIn: ['Some international curricula']
      },
      {
        name: 'Measurement Interpretation',
        description: '"How many [divisor] fit in [dividend]?"',
        example: '1/2 ÷ 1/4 = "How many 1/4s fit in 1/2? Two."',
        valid: true,
        commonIn: ['Conceptual teaching', 'Word problems']
      }
    ]
  },

  'quadratic-solving': {
    standard: 'Quadratic formula',
    alternatives: [
      {
        name: 'Factoring',
        description: 'Find two binomials that multiply to the quadratic',
        example: 'x² + 5x + 6 = (x+2)(x+3) = 0',
        valid: true,
        validityCondition: 'When equation is factorable',
        commonIn: ['Most algebra courses']
      },
      {
        name: 'Completing the Square',
        description: 'Manipulate into perfect square form',
        example: 'x² + 6x = 7 → (x+3)² = 16',
        valid: true,
        commonIn: ['Conceptual teaching', 'Derivation of quadratic formula']
      },
      {
        name: 'Graphing',
        description: 'Find x-intercepts of parabola',
        example: 'Graph y = x² + 5x + 6 and find where y = 0',
        valid: true,
        commonIn: ['Visual learners', 'Technology-based approaches']
      }
    ]
  }
};

/**
 * Validate if a student's strategy is mathematically sound
 *
 * @param {String} concept - Mathematical concept
 * @param {String} studentApproach - Student's described approach
 * @returns {Object} Validation result
 */
function validateAlternativeStrategy(concept, studentApproach) {
  const strategies = ALTERNATIVE_STRATEGIES[concept];

  if (!strategies) {
    return {
      valid: 'unknown',
      message: 'Concept not in database - defer to mathematical logic',
      shouldAccept: true  // Err on side of acceptance
    };
  }

  const approachLower = studentApproach.toLowerCase();

  // Check if approach matches any known alternative
  for (const alt of strategies.alternatives) {
    const nameLower = alt.name.toLowerCase();
    const descLower = alt.description.toLowerCase();

    // Match on name or key phrases from description
    if (approachLower.includes(nameLower) ||
        approachLower.includes(descLower.split(' ')[0])) {
      return {
        valid: true,
        strategyName: alt.name,
        message: `Valid alternative strategy: ${alt.name}. ${alt.description}`,
        shouldAccept: true,
        validityCondition: alt.validityCondition || null
      };
    }
  }

  // Didn't match known alternatives - check for red flags
  const redFlags = [
    'just guessed',
    'random',
    "don't know",
    'made it up'
  ];

  const hasRedFlag = redFlags.some(flag => approachLower.includes(flag));

  if (hasRedFlag) {
    return {
      valid: false,
      message: 'Approach lacks mathematical reasoning',
      shouldAccept: false
    };
  }

  // Unknown but no red flags - give benefit of doubt
  return {
    valid: 'unknown-but-reasonable',
    message: 'Non-standard approach. Validate the mathematical logic.',
    shouldAccept: true,  // Benefit of doubt
    requiresValidation: true
  };
}

/**
 * Generate AI prompt for alternative reasoning acceptance
 *
 * @returns {String} Prompt addition for AI
 */
function generateAlternativeReasoningPrompt() {
  return `
--- ALTERNATIVE REASONING PROTOCOL (CRITICAL) ---

DO NOT force students to use the "standard algorithm."
Mathematics has MANY valid paths to the same answer.

ACCEPT THESE ALTERNATIVE STRATEGIES:

MULTIPLICATION:
✅ Lattice method (diagonal grid)
✅ Area model (rectangle partitioning)
✅ Partial products
✅ Doubling/halving tricks
❌ REJECT: None of these. ALL are valid.

DIVISION:
✅ Partial quotients ("chunking")
✅ Area model
✅ Mental math ("I know 4×25=100")
❌ ONLY reject: Pure guessing with no reasoning

FRACTIONS:
✅ Visual models (circles, bars)
✅ Common denominator method for division
✅ "How many fit?" measurement interpretation
✅ Benchmark estimation (near 0, 1/2, or 1)

EQUATIONS:
✅ Guess and check (if systematic)
✅ Backtracking/working backwards
✅ Cover-up method
❌ ONLY reject: Random guessing

QUADRATICS:
✅ Factoring
✅ Completing the square
✅ Quadratic formula
✅ Graphing to find x-intercepts
❌ REJECT: None. All are valid for appropriate problems.

VALIDATION RULE:
1. Student explains their approach
2. Check: Is there mathematical LOGIC behind it?
3. If YES → Accept it, even if non-standard
4. If NO → Ask them to explain the logic, don't assume it's wrong

EXAMPLES OF GOOD ACCEPTANCE:

Student: "I saw 4 goes into 100 twenty-five times."
YOU: "Perfect! That's the chunking method - totally valid. Nice mental math!"
❌ WRONG: "That's not the standard long division algorithm."

Student: "I drew fraction circles and shaded them."
YOU: "Excellent visual approach! What did you notice?"
❌ WRONG: "You need to find a common denominator algebraically."

Student: "I used the box method for multiplication."
YOU: "Great! The area model is a really strong conceptual approach."
❌ WRONG: "You should use the standard algorithm with carrying."

GASLIGHTING WARNING:
If a student uses a valid alternative and you reject it, you are:
- Telling them their correct thinking is wrong
- Killing mathematical creativity
- Preferring procedure over understanding

Accept alternative reasoning. Validate the LOGIC, not the PROCEDURE.
`;
}

/**
 * Detect if AI is being rigid about methodology
 *
 * Warning signs:
 * - AI says "that's not the standard way"
 * - AI insists on specific algorithm when alternative works
 * - AI rejects correct answer because method differs
 *
 * @param {String} aiResponse - AI's response to student
 * @returns {Object} Rigidity detection result
 */
function detectAIRigidity(aiResponse) {
  const rigidityPhrases = [
    'not the standard',
    'should use the algorithm',
    'correct way is',
    'must use',
    "that's not how",
    'supposed to',
    'the proper method'
  ];

  const responseLower = aiResponse.toLowerCase();

  const rigidityDetected = rigidityPhrases.some(phrase =>
    responseLower.includes(phrase)
  );

  if (rigidityDetected) {
    return {
      isRigid: true,
      warning: 'AI may be rejecting valid alternative reasoning',
      recommendation: 'Review student approach for mathematical validity before rejecting'
    };
  }

  return {
    isRigid: false
  };
}

/**
 * Generate list of acceptable methods for a concept (for AI context)
 *
 * @param {String} concept - Mathematical concept
 * @returns {String} Formatted list of acceptable methods
 */
function listAcceptableMethods(concept) {
  const strategies = ALTERNATIVE_STRATEGIES[concept];

  if (!strategies) {
    return `Concept: ${concept}\nAccept any mathematically valid approach.`;
  }

  let output = `Acceptable methods for ${concept}:\n\n`;
  output += `1. ${strategies.standard} (standard)\n`;

  strategies.alternatives.forEach((alt, index) => {
    output += `${index + 2}. ${alt.name}: ${alt.description}\n`;
    if (alt.validityCondition) {
      output += `   Note: ${alt.validityCondition}\n`;
    }
  });

  output += `\nAll of these are VALID. Accept any of them.`;

  return output;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  ALTERNATIVE_STRATEGIES,
  validateAlternativeStrategy,
  generateAlternativeReasoningPrompt,
  detectAIRigidity,
  listAcceptableMethods
};
