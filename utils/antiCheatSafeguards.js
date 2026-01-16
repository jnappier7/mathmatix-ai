// ============================================
// ANTI-CHEAT SAFEGUARDS FOR VISUAL TEACHING
// Ensures Mathmatix teaches methods, not solves homework
// ============================================

/**
 * Detect if student is trying to get homework answers
 * @param {string} studentMessage - Student's question
 * @param {string} conversationHistory - Recent conversation context
 * @returns {Object} { isCheatAttempt: boolean, reason: string }
 */
function detectCheatAttempt(studentMessage, conversationHistory = '') {
    const lower = studentMessage.toLowerCase();
    const context = (conversationHistory + ' ' + studentMessage).toLowerCase();

    // RED FLAGS: Homework/assignment language
    const homeworkPatterns = [
        /homework/i,
        /assignment/i,
        /due\s+(today|tomorrow|monday|tuesday)/i,
        /my\s+teacher\s+(gave|assigned)/i,
        /i\s+need\s+(the\s+)?answer\s+(to|for)/i,
        /what\s+is\s+the\s+answer\s+to/i,
        /solve\s+this\s+for\s+me/i,
        /just\s+(give|tell)\s+me\s+the\s+answer/i,
        /problem\s+#?\d+\s+from/i,
        /worksheet/i,
        /test\s+(tomorrow|coming\s+up)/i,
        /\d+\s+problems?\s+to\s+solve/i
    ];

    for (const pattern of homeworkPatterns) {
        if (pattern.test(context)) {
            return {
                isCheatAttempt: true,
                reason: 'homework_language',
                guidance: "I'm here to help you LEARN, not do your homework for you! Let's break this down step by step so YOU understand it."
            };
        }
    }

    // MULTIPLE RAPID PROBLEMS: Student asking for many solutions quickly
    const problemCount = (context.match(/solve|answer|what is|calculate/gi) || []).length;
    if (problemCount >= 5) {
        return {
            isCheatAttempt: true,
            reason: 'rapid_fire_problems',
            guidance: "Whoa! Let's slow down and make sure you UNDERSTAND each problem, not just get answers."
        };
    }

    // SPECIFIC ANSWER REQUESTS: "What is [exact problem]?"
    const directAnswerPatterns = [
        /what\s+(is|are)\s+\d+\s*[+\-×÷*/]\s*\d+/i,
        /what\s+(is|are)\s+\d+\/\d+\s*[+\-×÷*/]\s*\d+\/\d+/i,
        /what\s+(is|are)\s+\d+\s*÷\s*\d+/i
    ];

    for (const pattern of directAnswerPatterns) {
        if (pattern.test(lower) && !/(how|why|explain|show me|teach)/i.test(lower)) {
            return {
                isCheatAttempt: true,
                reason: 'direct_answer_request',
                guidance: "Instead of just giving you the answer, let me show you HOW to solve it! That way you'll be able to do it yourself."
            };
        }
    }

    // No cheat detected
    return {
        isCheatAttempt: false,
        reason: null,
        guidance: null
    };
}

/**
 * Determine if visual command should show FULL solution or PARTIAL demonstration
 * PARTIAL = Teaching (show method, not answer)
 * FULL = Example for learning (when appropriate)
 *
 * @param {string} studentMessage - Student's question
 * @param {Object} cheatCheck - Result from detectCheatAttempt
 * @returns {string} 'partial' or 'full' or 'example'
 */
function determineVisualMode(studentMessage, cheatCheck) {
    const lower = studentMessage.toLowerCase();

    // If cheat attempt detected → ALWAYS partial (never show answer)
    if (cheatCheck.isCheatAttempt) {
        return 'partial';
    }

    // "How do I..." → Show method partially, let them finish
    if (/how\s+(do|can)\s+i/i.test(lower)) {
        return 'partial';
    }

    // "Show me how..." → Demonstrate with EXAMPLE numbers (not their homework)
    if (/show\s+me\s+how/i.test(lower)) {
        return 'example';
    }

    // "Explain..." → Teaching mode (partial)
    if (/explain|understand|learn/i.test(lower)) {
        return 'partial';
    }

    // Direct calculation request → Partial (teach, don't solve)
    if (/what\s+(is|are)|calculate|solve|answer/i.test(lower)) {
        return 'partial';
    }

    // Default: Partial (better safe than sorry)
    return 'partial';
}

/**
 * Modify visual command parameters to enforce teaching mode
 * Adds flags like { mode: 'partial', maxSteps: 2, pauseAfter: true }
 *
 * @param {string} commandType - Type of visual command
 * @param {Object} commandParams - Original parameters
 * @param {string} visualMode - 'partial', 'full', or 'example'
 * @returns {Object} Modified command parameters with teaching flags
 */
function enforceTeachingMode(commandType, commandParams, visualMode) {
    const enforcedParams = { ...commandParams };

    // Add teaching mode flags
    enforcedParams.mode = visualMode;

    switch (commandType) {
        case 'long_division':
        case 'multiply_vertical':
            // Show only FIRST 1-2 STEPS, then pause
            if (visualMode === 'partial') {
                enforcedParams.maxSteps = 2;
                enforcedParams.showFinalAnswer = false;
                enforcedParams.pauseMessage = "Now you try the next step!";
            } else if (visualMode === 'example') {
                // Use DIFFERENT numbers (example, not their homework)
                enforcedParams.isExample = true;
                enforcedParams.exampleNote = "Here's an example with different numbers:";
            }
            break;

        case 'fraction_add':
        case 'fraction_multiply':
            // Show setup + first step, student finishes
            if (visualMode === 'partial') {
                enforcedParams.showSetup = true;
                enforcedParams.showFirstStep = true;
                enforcedParams.showFinalAnswer = false;
                enforcedParams.pauseMessage = "Can you finish it?";
            }
            break;

        case 'equation_solve':
            // Show ONLY first algebraic move, not full solution
            if (visualMode === 'partial') {
                enforcedParams.maxSteps = 1;
                enforcedParams.showFinalAnswer = false;
                enforcedParams.pauseMessage = "What should we do next?";
            }
            break;

        case 'graph':
            // Graphing is OK (shows function shape, not "solving")
            // But avoid graphing if it's "find the intersection" type problem
            enforcedParams.showPoints = false; // Don't mark specific coordinates
            break;

        case 'triangle_problem':
            // Don't show missing angle calculation, let them figure it out
            if (visualMode === 'partial') {
                enforcedParams.showMissingAngle = false;
                enforcedParams.pauseMessage = "What's the missing angle?";
            }
            break;
    }

    return enforcedParams;
}

/**
 * Check if a specific problem should NEVER be solved on whiteboard
 * (e.g., word problems, proof-based problems, multi-step story problems)
 *
 * @param {string} studentMessage - Student's question
 * @returns {boolean} True if this problem type should not be visualized
 */
function shouldNotVisualize(studentMessage) {
    const lower = studentMessage.toLowerCase();

    // Word problems → Solve with GUIDANCE, not visuals
    const wordProblemPatterns = [
        /sarah|john|mary|person|people|friend/i,
        /train|car|bicycle|speed|distance|rate/i,
        /pizza|cake|apples|oranges|fruit/i,
        /money|dollars|cost|price|buy|sell/i,
        /age.*older|younger.*years/i,
        /if.*then.*how many/i
    ];

    if (wordProblemPatterns.some(p => p.test(lower))) {
        return true; // Don't auto-visualize word problems
    }

    // Proof problems → Can't be "shown" on whiteboard
    if (/prove|proof|show that.*true|demonstrate that/i.test(lower)) {
        return true;
    }

    // Multi-step story problems
    if (lower.length > 200 && /\?/.test(lower)) {
        return true; // Long question with ? = likely story problem
    }

    return false;
}

/**
 * Generate anti-cheat chat response when cheat attempt detected
 * @param {Object} cheatCheck - Result from detectCheatAttempt
 * @returns {string} Friendly but firm redirection message
 */
function generateAntiCheatResponse(cheatCheck) {
    const responses = {
        homework_language: [
            "I'm here to help you LEARN, not do your homework for you! Let's figure this out together so you actually understand it. What have you tried so far?",
            "I can't just give you answers for homework - that wouldn't help you learn! But I can guide you step by step. What's the first thing we should try?",
            "My job is to help you become a math wizard, not to be a homework answer machine! Let's break this down so YOU can solve it."
        ],
        rapid_fire_problems: [
            "Whoa, let's slow down! I want to make sure you UNDERSTAND each problem, not just get answers. Let's focus on one and really nail it.",
            "Hold up! If you're rushing through problems, you're not learning. Let's take one problem at a time and make sure you get it."
        ],
        direct_answer_request: [
            "Instead of just telling you the answer, let me show you HOW to figure it out! That way you'll be able to solve problems like this on your own.",
            "I could tell you the answer, but then you wouldn't learn anything! Let me guide you through it step by step."
        ]
    };

    const responseList = responses[cheatCheck.reason] || responses.direct_answer_request;
    return responseList[Math.floor(Math.random() * responseList.length)];
}

module.exports = {
    detectCheatAttempt,
    determineVisualMode,
    enforceTeachingMode,
    shouldNotVisualize,
    generateAntiCheatResponse
};
