/**
 * PROGRESSIVE HINT SYSTEM
 *
 * Provides 3 levels of scaffolding when students are stuck:
 * Level 1: Conceptual Nudge - "What should you think about?"
 * Level 2: Strategic Hint - "Try this approach..."
 * Level 3: Procedural Step - "Do this specific action..."
 *
 * Philosophy: Minimum necessary support for maximum learning
 *
 * @module hintSystem
 */

const { reason } = require('./llmGateway');
const Skill = require('../models/skill');

// ============================================================================
// HINT GENERATION
// ============================================================================

/**
 * Generate progressive hints for a problem
 * @param {Object} problem - The problem object
 * @param {Object} skill - The skill being practiced
 * @param {Number} level - Hint level (1, 2, or 3)
 * @param {Object} context - Additional context (student's work, previous hints)
 * @returns {Promise<Object>} Hint object
 */
async function generateHint(problem, skill, level = 1, context = {}) {
    try {
        const hintPrompt = buildHintPrompt(problem, skill, level, context);
        const hintText = await reason(hintPrompt, { maxTokens: 150, temperature: 0.7 });

        return {
            level,
            hint: hintText,
            type: getHintType(level),
            encouragement: getEncouragement(level),
            nextLevel: level < 3 ? level + 1 : null
        };

    } catch (error) {
        console.error('[HintSystem] Error generating hint:', error);
        // Return fallback hint
        return getFallbackHint(level, skill);
    }
}

/**
 * Build hint prompt based on level
 */
function buildHintPrompt(problem, skill, level, context) {
    const basePrompt = `You are helping a student who is stuck on this problem:

**Problem:** ${problem.content}
**Skill:** ${skill.displayName}
**Correct Answer:** ${problem.answer}

${skill.teachingGuidance?.coreConcepts ? `**Key Concepts:** ${skill.teachingGuidance.coreConcepts.join(', ')}` : ''}
${skill.teachingGuidance?.commonMistakes ? `**Common Mistakes:** ${skill.teachingGuidance.commonMistakes[0]}` : ''}

${context.studentWork ? `**Student's Work So Far:** ${context.studentWork}` : ''}
${context.previousHints ? `**Previous Hints Given:** ${context.previousHints.join('; ')}` : ''}
`;

    let levelInstructions = '';

    switch (level) {
        case 1:
            levelInstructions = `**LEVEL 1 HINT - Conceptual Nudge:**
Provide a gentle question or observation that points the student toward the right thinking WITHOUT revealing the answer or procedure.

Examples:
- "What's the first thing you notice about this problem?"
- "What operation would help isolate the variable?"
- "Remember what we learned about..."

Your hint (1 sentence, question format preferred):`;
            break;

        case 2:
            levelInstructions = `**LEVEL 2 HINT - Strategic Guidance:**
Suggest the approach or strategy to use WITHOUT giving specific steps.

Examples:
- "Try working backwards from the answer"
- "Start by simplifying the left side first"
- "Use the distributive property here"

Your hint (1-2 sentences, directive format):`;
            break;

        case 3:
            levelInstructions = `**LEVEL 3 HINT - Procedural Step:**
Tell them exactly what to do next, but still require them to execute it.

Examples:
- "Subtract 7 from both sides of the equation"
- "Multiply the numbers in the parentheses first"
- "The first step is to find a common denominator"

Your hint (1-2 sentences, specific action):`;
            break;

        default:
            levelInstructions = 'Provide a helpful hint.';
    }

    return basePrompt + '\n' + levelInstructions;
}

/**
 * Get hint type label
 */
function getHintType(level) {
    const types = {
        1: 'conceptual-nudge',
        2: 'strategic-guidance',
        3: 'procedural-step'
    };
    return types[level] || 'general';
}

/**
 * Get encouragement message
 */
function getEncouragement(level) {
    const encouragements = {
        1: "You're on the right track! Think about this...",
        2: "Let me give you a bit more direction...",
        3: "Here's exactly what to do next..."
    };
    return encouragements[level] || "You've got this!";
}

/**
 * Get fallback hint if AI generation fails
 */
function getFallbackHint(level, skill) {
    const fallbacks = {
        1: {
            hint: "What's the first step you should take with this problem?",
            type: 'conceptual-nudge',
            encouragement: "Think about what you know..."
        },
        2: {
            hint: `Try applying the ${skill.displayName} procedure step by step.`,
            type: 'strategic-guidance',
            encouragement: "Break it down into smaller steps..."
        },
        3: {
            hint: "Start by identifying what you're solving for, then work backwards.",
            type: 'procedural-step',
            encouragement: "Here's what to do..."
        }
    };

    return {
        ...fallbacks[level],
        level,
        nextLevel: level < 3 ? level + 1 : null
    };
}

// ============================================================================
// HINT TRACKING & MANAGEMENT
// ============================================================================

/**
 * Track hint usage for a problem
 * @param {Object} user - User object
 * @param {String} problemId - Problem identifier
 * @param {Number} hintLevel - Hint level requested
 */
async function trackHintUsage(user, problemId, hintLevel) {
    const activeBadge = user.masteryProgress?.activeBadge;

    if (!activeBadge) {
        return;
    }

    // Initialize hint tracking
    if (!activeBadge.hintHistory) {
        activeBadge.hintHistory = [];
    }

    activeBadge.hintHistory.push({
        problemId,
        hintLevel,
        timestamp: new Date(),
        phase: activeBadge.currentPhase
    });

    // Keep only last 50 hints
    if (activeBadge.hintHistory.length > 50) {
        activeBadge.hintHistory = activeBadge.hintHistory.slice(-50);
    }

    // Update total hints used
    activeBadge.hintsUsed = (activeBadge.hintsUsed || 0) + 1;

    user.markModified('masteryProgress.activeBadge');
    await user.save();
}

/**
 * Analyze hint usage patterns
 * @param {Object} user - User object
 * @returns {Object} Hint usage analysis
 */
function analyzeHintUsage(user) {
    const activeBadge = user.masteryProgress?.activeBadge;

    if (!activeBadge || !activeBadge.hintHistory || activeBadge.hintHistory.length === 0) {
        return {
            totalHints: 0,
            avgHintLevel: 0,
            recentPattern: 'no-hints',
            suggestion: null
        };
    }

    const recent = activeBadge.hintHistory.slice(-10);
    const totalHints = activeBadge.hintsUsed || 0;
    const avgHintLevel = recent.reduce((sum, h) => sum + h.hintLevel, 0) / recent.length;

    // Detect patterns
    let pattern = 'normal';
    let suggestion = null;

    // Too many high-level hints = struggling
    const highLevelCount = recent.filter(h => h.hintLevel === 3).length;
    if (highLevelCount > 5) {
        pattern = 'struggling';
        suggestion = 'Consider returning to I Do phase for more modeling';
    }

    // Decreasing hint levels = improving
    const firstHalf = recent.slice(0, 5);
    const secondHalf = recent.slice(5);
    if (firstHalf.length > 0 && secondHalf.length > 0) {
        const firstAvg = firstHalf.reduce((sum, h) => sum + h.hintLevel, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, h) => sum + h.hintLevel, 0) / secondHalf.length;

        if (secondAvg < firstAvg - 0.5) {
            pattern = 'improving';
            suggestion = 'Student is becoming more independent!';
        }
    }

    // Very few hints = ready for independence
    if (totalHints < 3 && activeBadge.problemsCompleted > 5) {
        pattern = 'independent';
        suggestion = 'Student is working independently - minimal support needed';
    }

    return {
        totalHints,
        avgHintLevel: Math.round(avgHintLevel * 10) / 10,
        recentPattern: pattern,
        suggestion
    };
}

/**
 * Determine if student needs reteaching based on hint usage
 * @param {Object} user - User object
 * @param {String} problemId - Current problem
 * @returns {Boolean} True if reteaching recommended
 */
function shouldReteach(user, problemId) {
    const activeBadge = user.masteryProgress?.activeBadge;

    if (!activeBadge || !activeBadge.hintHistory) {
        return false;
    }

    // Check hints for current problem
    const currentProblemHints = activeBadge.hintHistory.filter(h => h.problemId === problemId);

    // If student requested all 3 hint levels and still stuck, reteach
    if (currentProblemHints.length >= 3) {
        const levels = currentProblemHints.map(h => h.hintLevel);
        if (levels.includes(1) && levels.includes(2) && levels.includes(3)) {
            return true;
        }
    }

    // Check recent pattern
    const analysis = analyzeHintUsage(user);
    if (analysis.recentPattern === 'struggling') {
        return true;
    }

    return false;
}

// ============================================================================
// HINT SYSTEM FOR SPECIFIC SKILLS
// ============================================================================

/**
 * Generate skill-specific hint templates
 * These can be used as fallbacks or for faster hint generation
 */
const SKILL_HINT_TEMPLATES = {
    'two-step-equations': {
        level1: [
            "What operation is being done to the variable?",
            "What's your goal with this equation?",
            "Which operation should you undo first?"
        ],
        level2: [
            "Work backwards - undo addition/subtraction before multiplication/division",
            "Isolate the variable term first, then isolate the variable itself",
            "Use inverse operations to simplify"
        ],
        level3: [
            "Subtract {constant} from both sides",
            "Add {constant} to both sides",
            "Divide both sides by {coefficient}"
        ]
    },

    'order-of-operations': {
        level1: [
            "What's the order of operations acronym we use?",
            "What operation should you do first?",
            "Do parentheses change the order?"
        ],
        level2: [
            "Remember: PEMDAS - Parentheses, Exponents, Multiplication/Division, Addition/Subtraction",
            "Work from left to right for operations at the same level",
            "Evaluate inside parentheses first"
        ],
        level3: [
            "First, solve what's inside the parentheses",
            "Next, multiply before you add",
            "Now add/subtract from left to right"
        ]
    },

    'combining-like-terms': {
        level1: [
            "What makes terms 'like' terms?",
            "Which terms have the same variable?",
            "Can you combine x and x²?"
        ],
        level2: [
            "Group terms with the same variable and exponent",
            "Add or subtract the coefficients of like terms",
            "Keep unlike terms separate"
        ],
        level3: [
            "Combine the x terms: {terms}",
            "Combine the constant terms: {terms}",
            "Write your final simplified expression"
        ]
    }
};

/**
 * Get template hint for skill
 */
function getTemplateHint(skillId, level, problemContext = {}) {
    const templates = SKILL_HINT_TEMPLATES[skillId];

    if (!templates || !templates[`level${level}`]) {
        return null;
    }

    const hints = templates[`level${level}`];
    let hint = hints[Math.floor(Math.random() * hints.length)];

    // Replace placeholders if provided
    if (problemContext.constant) {
        hint = hint.replace('{constant}', problemContext.constant);
    }
    if (problemContext.coefficient) {
        hint = hint.replace('{coefficient}', problemContext.coefficient);
    }
    if (problemContext.terms) {
        hint = hint.replace('{terms}', problemContext.terms);
    }

    return hint;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    generateHint,
    trackHintUsage,
    analyzeHintUsage,
    shouldReteach,
    getTemplateHint,
    SKILL_HINT_TEMPLATES
};
