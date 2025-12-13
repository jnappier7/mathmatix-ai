/**
 * ANTI-GAMING PROBE SYSTEM
 *
 * PHILOSOPHY: Validate understanding, not mimicry.
 *
 * THE CLEVER HANS PROBLEM:
 * - Students learn to say "magic words" (balance, inverse, common denominator)
 * - AI rewards buzzwords without testing actual understanding
 * - "Articulate guesser" beats "quiet master"
 *
 * SOLUTION: Counter-Example Probes
 * - If student says the right word, ask "What if we did the OPPOSITE?"
 * - Test consequence prediction, not vocabulary
 * - Validate application, not recitation
 *
 * @module antiGaming
 */

/**
 * Buzzword Detection
 *
 * Common phrases students learn to parrot without understanding
 */
const COMMON_BUZZWORDS = {
  'equation-solving': [
    'balance',
    'inverse operation',
    'same thing to both sides',
    'undo',
    'isolate the variable'
  ],

  'fractions': [
    'common denominator',
    'flip and multiply',
    'reciprocal',
    'cross multiply'
  ],

  'algebra': [
    'combine like terms',
    'distributive property',
    'order of operations',
    'PEMDAS',
    'GEMS'
  ],

  'functions': [
    'input and output',
    'slope',
    'y-intercept',
    'rate of change'
  ]
};

/**
 * Detect if a response contains buzzwords without elaboration
 *
 * @param {String} response - Student's text response
 * @param {String} concept - Mathematical concept being assessed
 * @returns {Object} { containsBuzzwords, suspectMimicry, detectedWords }
 */
function detectBuzzwords(response, concept) {
  const buzzwords = COMMON_BUZZWORDS[concept] || [];
  const detectedWords = [];

  // Convert response to lowercase for matching
  const responseLower = response.toLowerCase();

  // Check for buzzword presence
  for (const word of buzzwords) {
    if (responseLower.includes(word.toLowerCase())) {
      detectedWords.push(word);
    }
  }

  // Suspect mimicry if:
  // 1. Contains buzzwords
  // 2. Response is very short (< 20 chars)
  // 3. No elaboration beyond the buzzword
  const containsBuzzwords = detectedWords.length > 0;
  const isShort = response.trim().length < 20;
  const suspectMimicry = containsBuzzwords && isShort;

  return {
    containsBuzzwords,
    suspectMimicry,
    detectedWords
  };
}

/**
 * Generate counter-example probe
 *
 * THE CRITICAL TEST:
 * Instead of accepting "to balance the equation", ask:
 * "What would happen if I subtracted 5 from the LEFT but NOT the right?"
 *
 * If they can't predict the consequence, they're mimicking.
 *
 * @param {String} concept - Mathematical concept
 * @param {String} originalProblem - The problem being solved
 * @param {String} studentResponse - What they said
 * @returns {Object} Counter-example probe question
 */
function generateCounterExample(concept, originalProblem, studentResponse) {
  const probes = {
    'equation-solving': {
      trigger: ['balance', 'same thing to both sides'],
      probe: {
        question: "Good! Now, what would happen if I subtracted 5 from the LEFT side but did NOT subtract 5 from the right side?",
        expectedUnderstanding: [
          'would not balance',
          'would not be equal',
          'sides would be different',
          'equation would be wrong',
          'not the same anymore'
        ],
        mimicryResponse: [
          "I don't know",
          "it would balance",
          "same as before"
        ]
      }
    },

    'fractions-division': {
      trigger: ['flip', 'reciprocal'],
      probe: {
        question: "Right! So if we're dividing by 1/2, why do we flip it to become 2/1?",
        expectedUnderstanding: [
          'division is same as multiply by reciprocal',
          'dividing by half is same as multiplying by 2',
          'how many halves fit in',
          'fraction rule'
        ],
        mimicryResponse: [
          "because that's the rule",
          "teacher said so",
          "I don't know why"
        ]
      }
    },

    'combining-like-terms': {
      trigger: ['like terms', 'same variable'],
      probe: {
        question: "Exactly! So can we combine 3x and 5y? Why or why not?",
        expectedUnderstanding: [
          'no',
          'different variables',
          'x and y are not the same',
          'not like terms'
        ],
        mimicryResponse: [
          'yes',
          'maybe',
          "I don't know"
        ]
      }
    },

    'order-of-operations': {
      trigger: ['PEMDAS', 'GEMS', 'parentheses first'],
      probe: {
        question: "Perfect! So in the expression 2 + 3 × 4, which operation do we do first?",
        expectedUnderstanding: [
          'multiply',
          'multiplication',
          '3 times 4',
          'multiply first'
        ],
        mimicryResponse: [
          'add',
          'addition',
          '2 plus 3'
        ]
      }
    },

    'distributive-property': {
      trigger: ['distribute', 'multiply through'],
      probe: {
        question: "Nice! So if we DON'T distribute in 2(x + 3), what do we have?",
        expectedUnderstanding: [
          'still 2(x + 3)',
          'cannot simplify',
          'leave it as is',
          'parentheses stay'
        ],
        mimicryResponse: [
          '2x + 3',
          "I don't know",
          'same thing'
        ]
      }
    }
  };

  // Find matching probe based on buzzword triggers
  for (const [key, probeData] of Object.entries(probes)) {
    if (concept.includes(key)) {
      const studentLower = studentResponse.toLowerCase();
      const hasMatchingBuzzword = probeData.trigger.some(trigger =>
        studentLower.includes(trigger.toLowerCase())
      );

      if (hasMatchingBuzzword) {
        return {
          shouldProbe: true,
          probe: probeData.probe,
          concept: key
        };
      }
    }
  }

  return {
    shouldProbe: false,
    probe: null,
    concept: null
  };
}

/**
 * Evaluate counter-example response
 *
 * Determines if student demonstrated understanding or was mimicking
 *
 * @param {Object} probe - The counter-example probe
 * @param {String} response - Student's answer to the probe
 * @returns {Object} Evaluation result
 */
function evaluateCounterExample(probe, response) {
  const responseLower = response.toLowerCase().trim();

  // Check for understanding indicators
  const showsUnderstanding = probe.expectedUnderstanding.some(indicator =>
    responseLower.includes(indicator.toLowerCase())
  );

  // Check for mimicry indicators
  const showsMimicry = probe.mimicryResponse.some(indicator =>
    responseLower.includes(indicator.toLowerCase())
  );

  // Very short responses are suspect
  const isTooShort = response.trim().length < 10;

  if (showsUnderstanding) {
    return {
      demonstratedUnderstanding: true,
      confidence: 'high',
      feedback: "Perfect! You really understand the concept, not just the vocabulary.",
      shouldAwardMastery: true
    };
  } else if (showsMimicry || isTooShort) {
    return {
      demonstratedUnderstanding: false,
      confidence: 'high',
      feedback: "I think we need to practice this concept a bit more before moving on.",
      shouldAwardMastery: false,
      suggestScaffolding: true
    };
  } else {
    return {
      demonstratedUnderstanding: 'unclear',
      confidence: 'low',
      feedback: "Let me ask a different way to make sure you've got this.",
      shouldAwardMastery: false,
      suggestAlternativeProbe: true
    };
  }
}

/**
 * Generate AI prompt for anti-gaming probes
 *
 * @returns {String} Prompt addition for AI
 */
function generateAntiGamingPrompt() {
  return `
--- ANTI-GAMING PROTOCOL (CRITICAL) ---

Students are smart. They learn to say "magic words" without understanding.

WHEN A STUDENT USES BUZZWORDS:
If a student says phrases like:
- "To balance the equation"
- "Use the inverse operation"
- "Common denominator"
- "Flip and multiply"
- "Combine like terms"

DO NOT immediately praise and move on.

INSTEAD, USE A COUNTER-EXAMPLE PROBE:

Example 1:
Student: "You subtract 5 to balance the equation."
YOU: "Good! Now, what would happen if I subtracted 5 from the LEFT side but NOT the right side?"
→ If they can predict the consequence (unbalanced, not equal), they understand.
→ If they say "idk" or "it would still balance", they're mimicking.

Example 2:
Student: "You flip the fraction."
YOU: "Right! So if we're dividing by 1/2, why do we flip it to 2/1?"
→ If they explain (division = multiply by reciprocal), they understand.
→ If they say "because that's the rule", they're mimicking.

Example 3:
Student: "Combine like terms."
YOU: "Exactly! So can we combine 3x and 5y?"
→ If they say "no, different variables", they understand.
→ If they say "yes" or "maybe", they're guessing.

VALIDATION RULES:
1. Buzzword alone = NOT enough for mastery credit
2. Buzzword + correct consequence prediction = full credit
3. Buzzword + "idk" / wrong consequence = needs more practice

This prevents "social engineering" the AI and ensures real understanding.
`;
}

/**
 * Track student's pattern of buzzword usage
 *
 * If a student consistently uses buzzwords but fails probes,
 * they may be trying to game the system
 *
 * @param {Object} userProfile - User profile
 * @param {Array} recentResponses - Recent assessment responses
 * @returns {Object} Gaming pattern analysis
 */
function analyzeGamingPattern(userProfile, recentResponses) {
  let buzzwordCount = 0;
  let probeFailureCount = 0;

  for (const response of recentResponses) {
    if (response.containedBuzzwords) {
      buzzwordCount++;
    }
    if (response.failedCounterProbe) {
      probeFailureCount++;
    }
  }

  const buzzwordRate = buzzwordCount / recentResponses.length;
  const failureRate = probeFailureCount / buzzwordCount;

  // High buzzword usage + high probe failure = gaming pattern
  const isLikelyGaming = buzzwordRate > 0.6 && failureRate > 0.5;

  return {
    isLikelyGaming,
    buzzwordRate,
    failureRate,
    recommendation: isLikelyGaming
      ? "Switch to visual/demonstration assessment - student may be gaming text responses"
      : "Continue with current assessment strategy"
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  detectBuzzwords,
  generateCounterExample,
  evaluateCounterExample,
  generateAntiGamingPrompt,
  analyzeGamingPattern,
  COMMON_BUZZWORDS
};
