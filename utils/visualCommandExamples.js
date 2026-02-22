// ============================================
// VISUAL COMMAND FEW-SHOT EXAMPLES
// Teaches the AI how to use visual commands correctly
// via a system-level instruction (not fake conversation messages)
// ============================================

/**
 * Build a system-level instruction string that teaches the AI
 * how to use visual commands, with inline examples.
 *
 * Previously these were injected as fake user/assistant message pairs,
 * which caused the LLM to sometimes continue those "conversations"
 * (e.g., the triangle problem ghost bug). Moving them into a system
 * instruction avoids polluting the conversation history.
 *
 * @returns {string} Instruction text to append to the system prompt
 */
function getVisualCommandInstruction() {
    return `
--- VISUAL COMMAND USAGE ---
When a student asks a question that can be illustrated visually, include the appropriate command tag in your response. Here are the available commands and how to use them:

• Long division:  [LONG_DIVISION:342,6]
  e.g. "How do I do 342 ÷ 6?" → "[LONG_DIVISION:342,6] Watch each step! See how we divide, multiply, subtract, and bring down?"

• Fraction addition:  [FRACTION_ADD:numerator1,denominator1,numerator2,denominator2]
  e.g. "Add 3/4 + 1/6" → "[FRACTION_ADD:3,4,1,6] First, we need a common denominator. What could it be?"

• Vertical multiplication:  [MULTIPLY_VERTICAL:factor1,factor2]
  e.g. "Multiply 23 × 47" → "[MULTIPLY_VERTICAL:23,47] Watch how we multiply each digit and add the partial products!"

• Graphing:  [GRID][GRAPH:equation]
  e.g. "Graph y = x^2" → "[GRID][GRAPH:y=x^2] Here's the parabola! Notice how it curves upward?"

• Equation solving:  [EQUATION_SOLVE:equation]
  e.g. "Solve 2x + 3 = 11" → "[EQUATION_SOLVE:2x+3=11] Let's isolate x step by step. What operation undoes the +3?"

• Triangle problems:  [TRIANGLE_PROBLEM:A=val,B=val,C=val]
  e.g. "Angle A is 30° and angle B is 70°, find C" → "[TRIANGLE_PROBLEM:A=30,B=70,C=?] Remember: all angles in a triangle add up to 180°. What's missing?"

IMPORTANT: Place the command tag at the START of your response text, followed by your teaching explanation. Only use a command when it directly matches the student's question.
`;
}

/**
 * Inject visual command teaching into the conversation.
 *
 * NEW BEHAVIOR: Returns a system message with the visual command
 * instruction appended BEFORE the conversation, instead of injecting
 * fake user/assistant message pairs that polluted conversation history.
 *
 * @param {Array} conversationMessages - Existing conversation messages
 * @returns {Array} Conversation with system instruction prepended
 */
function injectFewShotExamples(conversationMessages) {
    // Only inject if conversation is short (< 6 messages)
    // Long conversations already have learned patterns
    if (conversationMessages.length >= 6) {
        return conversationMessages;
    }

    const instruction = getVisualCommandInstruction();

    // Inject as a system message instead of fake user/assistant pairs
    return [
        { role: 'system', content: instruction },
        ...conversationMessages
    ];
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
    getVisualCommandInstruction,
    injectFewShotExamples,
    shouldInjectExamples
};
