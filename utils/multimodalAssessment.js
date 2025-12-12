/**
 * MULTIMODAL ASSESSMENT ENGINE
 *
 * PHILOSOPHY: Actions speak louder than words for math mastery.
 *
 * THE LINGUISTIC PENALTY PROBLEM:
 * - ELL students understand math but can't articulate it in English
 * - Students with dyslexia can solve but struggle to explain
 * - Quiet mathematicians exist and are valid
 *
 * SOLUTION: Offer multiple ways to demonstrate understanding
 * - Visual/drag-and-drop problem solving
 * - Clickable equation builders
 * - Multiple choice with concept checking
 * - Drawing/annotation on problems
 * - Step-by-step selection (no words required)
 *
 * @module multimodalAssessment
 */

/**
 * Assessment Modality Types
 */
const MODALITY_TYPES = {
  TEXT: 'text',                    // Traditional typed explanation
  VISUAL: 'visual',                // Drag-and-drop, drawing, annotation
  CLICKABLE: 'clickable',          // Click parts of equation, select steps
  MULTIPLE_CHOICE: 'multiple_choice', // With distractors based on common errors
  STEP_SEQUENCE: 'step_sequence',  // Order the steps (no explanation needed)
  DEMONSTRATION: 'demonstration'   // Work the problem on whiteboard
};

/**
 * Determine appropriate assessment modality for a student
 *
 * Takes into account:
 * - Learning profile (ELL, dyslexia, verbal fluency)
 * - Past performance (struggling with text explanations)
 * - User preference
 *
 * @param {Object} userProfile - User's learningProfile
 * @param {String} skillType - Type of skill being assessed
 * @returns {Array} Recommended modalities in priority order
 */
function recommendAssessmentModality(userProfile, skillType) {
  const modalities = [];

  // Check for linguistic barriers
  const isELL = userProfile.isELL || false;
  const hasDyslexia = userProfile.iepPlan?.hasLearningDisability || false;
  const lowVerbalFluency = userProfile.fluencyBaseline?.readSpeedModifier > 1.5;
  const prefersVisual = userProfile.learningStyle?.prefersDiagrams;

  // PRIORITY 1: If linguistic barriers exist, prioritize visual/clickable
  if (isELL || hasDyslexia || lowVerbalFluency) {
    modalities.push(MODALITY_TYPES.VISUAL);
    modalities.push(MODALITY_TYPES.CLICKABLE);
    modalities.push(MODALITY_TYPES.STEP_SEQUENCE);
    modalities.push(MODALITY_TYPES.MULTIPLE_CHOICE);
    modalities.push(MODALITY_TYPES.TEXT); // Last resort
  }
  // PRIORITY 2: Visual learners
  else if (prefersVisual) {
    modalities.push(MODALITY_TYPES.VISUAL);
    modalities.push(MODALITY_TYPES.DEMONSTRATION);
    modalities.push(MODALITY_TYPES.TEXT);
  }
  // PRIORITY 3: Default (but still offer options)
  else {
    modalities.push(MODALITY_TYPES.TEXT);
    modalities.push(MODALITY_TYPES.VISUAL);
    modalities.push(MODALITY_TYPES.CLICKABLE);
  }

  return modalities;
}

/**
 * Generate a visual/clickable assessment question
 *
 * Instead of "Explain why you flipped the fraction",
 * generate "Click the step where the fraction gets flipped"
 *
 * @param {String} concept - Mathematical concept to assess
 * @param {String} problem - The problem being solved
 * @param {Array} steps - Solution steps
 * @returns {Object} Visual assessment question
 */
function generateVisualAssessment(concept, problem, steps) {
  const assessments = {
    'fraction-division': {
      type: MODALITY_TYPES.CLICKABLE,
      prompt: "Click the step where the division becomes multiplication:",
      interactionType: 'select-step',
      steps: steps,
      correctStep: steps.findIndex(s => s.includes('×') && s.includes('reciprocal'))
    },

    'equation-balancing': {
      type: MODALITY_TYPES.VISUAL,
      prompt: "Drag the same operation to BOTH sides to keep the equation balanced:",
      interactionType: 'drag-operation',
      options: ['-5', '+5', '×5', '÷5'],
      correctAnswer: '-5'
    },

    'like-terms': {
      type: MODALITY_TYPES.CLICKABLE,
      prompt: "Click all the terms that can be combined:",
      interactionType: 'multi-select',
      terms: ['3x', '5', '2x', '7', '-x'],
      correctSelections: ['3x', '2x', '-x']
    },

    'order-of-operations': {
      type: MODALITY_TYPES.STEP_SEQUENCE,
      prompt: "Put these steps in the correct order:",
      interactionType: 'sequence',
      steps: [
        'Evaluate inside parentheses',
        'Calculate exponents',
        'Multiply/divide left to right',
        'Add/subtract left to right'
      ],
      correctOrder: [0, 1, 2, 3]
    }
  };

  return assessments[concept] || {
    type: MODALITY_TYPES.TEXT,
    prompt: "Explain your thinking:",
    interactionType: 'text-input'
  };
}

/**
 * Evaluate a visual/clickable response
 *
 * @param {Object} assessment - The visual assessment object
 * @param {*} userResponse - User's response (click, drag, selection)
 * @returns {Object} Evaluation result
 */
function evaluateVisualResponse(assessment, userResponse) {
  switch (assessment.interactionType) {
    case 'select-step':
      return {
        correct: userResponse === assessment.correctStep,
        feedback: userResponse === assessment.correctStep
          ? "Perfect! You identified the key step."
          : "Not quite. Look for where the operation changes."
      };

    case 'multi-select':
      const correct = JSON.stringify(userResponse.sort()) ===
                      JSON.stringify(assessment.correctSelections.sort());
      return {
        correct,
        feedback: correct
          ? "Great! You found all the like terms."
          : "You missed some. Look for terms with the same variable."
      };

    case 'sequence':
      const correctSequence = JSON.stringify(userResponse) ===
                              JSON.stringify(assessment.correctOrder);
      return {
        correct: correctSequence,
        feedback: correctSequence
          ? "Excellent! You know the order."
          : "Not quite. Remember: Parentheses, Exponents, Multiply/Divide, Add/Subtract."
      };

    case 'drag-operation':
      return {
        correct: userResponse === assessment.correctAnswer,
        feedback: userResponse === assessment.correctAnswer
          ? "Yes! That keeps the equation balanced."
          : "Try again. What's attached to x? Use the opposite operation."
      };

    default:
      return {
        correct: false,
        feedback: "Unknown interaction type."
      };
  }
}

/**
 * Generate AI prompt for multimodal assessment
 *
 * @param {Array} modalities - Recommended modalities for this student
 * @returns {String} Prompt addition for AI
 */
function generateMultimodalPrompt(modalities) {
  const primaryModality = modalities[0];

  const prompts = {
    [MODALITY_TYPES.VISUAL]: `
ASSESSMENT ACCOMMODATION: This student learns best through VISUAL demonstration.
- Instead of asking "Explain why...", ask "Show me by clicking/dragging..."
- Use clickable steps, drag-and-drop operations, or visual selection
- Frame as: "Click the step where...", "Drag the operation that...", "Circle the terms that..."
- Accept non-verbal demonstration as FULL credit for DOK 2-3
`,

    [MODALITY_TYPES.CLICKABLE]: `
ASSESSMENT ACCOMMODATION: This student demonstrates understanding through ACTION, not words.
- Offer clickable/interactive alternatives to text explanations
- Frame as: "Select the...", "Click all that...", "Choose the step that..."
- Example: Instead of "Why did you flip the fraction?", ask "Click where the fraction flips."
`,

    [MODALITY_TYPES.STEP_SEQUENCE]: `
ASSESSMENT ACCOMMODATION: This student can ORDER steps without needing to explain them verbally.
- Ask them to sequence steps in correct order
- Frame as: "Put these steps in order:", "What happens first, second, third?"
- No essay required - correct sequencing = understanding
`,

    [MODALITY_TYPES.TEXT]: `
TEXT-BASED ASSESSMENT: Student is comfortable with verbal explanation.
- You can ask "Explain why..." and "How would you..."
- Still keep it conversational, not essay-like
`
  };

  return prompts[primaryModality] || prompts[MODALITY_TYPES.TEXT];
}

/**
 * Check if a student is struggling with text-based assessment
 *
 * Indicators:
 * - Repeatedly types "idk", "I don't know", "..."
 * - Correct answers but can't explain
 * - High math performance but low verbal fluency scores
 *
 * @param {Array} recentMessages - Last 10 messages
 * @returns {Boolean} True if student is struggling with text
 */
function isStrugglingWithTextAssessment(recentMessages) {
  const userMessages = recentMessages.filter(m => m.role === 'user');

  // Check for low-effort text responses
  const lowEffortPatterns = [
    /^idk$/i,
    /^i don'?t know$/i,
    /^\.+$/,
    /^um+$/i,
    /^uh+$/i,
    /^I guess$/i,
    /^maybe$/i
  ];

  const lowEffortCount = userMessages.filter(msg =>
    lowEffortPatterns.some(pattern => pattern.test(msg.content.trim()))
  ).length;

  // If 3+ low-effort responses in last 10, they're struggling
  return lowEffortCount >= 3;
}

/**
 * Suggest switching to visual mode if student is struggling
 *
 * @param {Object} conversation - Current conversation
 * @returns {Object|null} Suggestion object or null
 */
function suggestVisualMode(conversation) {
  const recentMessages = conversation.messages.slice(-10);

  if (isStrugglingWithTextAssessment(recentMessages)) {
    return {
      shouldSwitch: true,
      message: "I notice you're having trouble putting it into words. That's totally okay! Would you like to SHOW me instead of telling me? I can give you clickable options or you can draw it out.",
      newModality: MODALITY_TYPES.VISUAL
    };
  }

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  MODALITY_TYPES,
  recommendAssessmentModality,
  generateVisualAssessment,
  evaluateVisualResponse,
  generateMultimodalPrompt,
  isStrugglingWithTextAssessment,
  suggestVisualMode
};
