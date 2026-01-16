// ============================================
// VISUAL COMMAND FEW-SHOT EXAMPLES
// Inject into conversation history to teach GPT-4o-mini
// how to use visual commands correctly
// ============================================

/**
 * Get few-shot examples for visual command usage
 * These are injected into the conversation history to show the AI
 * the CORRECT pattern for using visual commands
 *
 * @returns {Array} Array of example messages showing correct visual command usage
 */
function getVisualCommandExamples() {
    return [
        // Example 1: Long Division
        {
            role: 'user',
            content: 'How do I do 342 divided by 6?'
        },
        {
            role: 'assistant',
            content: '[LONG_DIVISION:342,6] Watch each step! See how we divide, multiply, subtract, and bring down?'
        },

        // Example 2: Fraction Addition
        {
            role: 'user',
            content: 'How do I add 3/4 + 1/6?'
        },
        {
            role: 'assistant',
            content: '[FRACTION_ADD:3,4,1,6] First, we need a common denominator. What could it be?'
        },

        // Example 3: Multiplication
        {
            role: 'user',
            content: 'Can you show me how to multiply 23 × 47?'
        },
        {
            role: 'assistant',
            content: '[MULTIPLY_VERTICAL:23,47] Watch how we multiply each digit and add the partial products!'
        },

        // Example 4: Graphing
        {
            role: 'user',
            content: 'Can you graph y = x^2?'
        },
        {
            role: 'assistant',
            content: '[GRID][GRAPH:y=x^2] Here\'s the parabola! Notice how it curves upward?'
        },

        // Example 5: Equation Solving
        {
            role: 'user',
            content: 'How do I solve 2x + 3 = 11?'
        },
        {
            role: 'assistant',
            content: '[EQUATION_SOLVE:2x+3=11] Let\'s isolate x step by step. What operation undoes the +3?'
        },

        // Example 6: Triangle Problem
        {
            role: 'user',
            content: 'If angle A is 30° and angle B is 70°, what is angle C?'
        },
        {
            role: 'assistant',
            content: '[TRIANGLE_PROBLEM:A=30,B=70,C=?] Remember: all angles in a triangle add up to 180°. What\'s missing?'
        }
    ];
}

/**
 * Inject few-shot examples into conversation history
 * Only inject if conversation is short (to avoid bloating long conversations)
 *
 * @param {Array} conversationMessages - Existing conversation messages
 * @returns {Array} Conversation with examples injected
 */
function injectFewShotExamples(conversationMessages) {
    // Only inject if conversation is short (< 6 messages)
    // Long conversations already have learned patterns
    if (conversationMessages.length >= 6) {
        return conversationMessages;
    }

    const examples = getVisualCommandExamples();

    // Inject examples BEFORE the actual conversation
    // This teaches the AI the pattern at the start
    return [...examples, ...conversationMessages];
}

/**
 * Check if we should inject examples for this conversation
 * @param {Array} conversationMessages - Conversation messages
 * @returns {boolean} True if examples should be injected
 */
function shouldInjectExamples(conversationMessages) {
    // Inject for new conversations (< 6 messages)
    return conversationMessages.length < 6;
}

module.exports = {
    getVisualCommandExamples,
    injectFewShotExamples,
    shouldInjectExamples
};
