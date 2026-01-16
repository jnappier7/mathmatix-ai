// ============================================
// VISUAL COMMAND ENFORCER
// Automatically inject visual commands when AI gives text explanations
// for procedural questions that REQUIRE visual demonstrations
// INCLUDES ANTI-CHEAT SAFEGUARDS
// ============================================

const { hasVisualCommands } = require('./visualTeachingParser');
const {
    detectCheatAttempt,
    determineVisualMode,
    shouldNotVisualize,
    generateAntiCheatResponse
} = require('./antiCheatSafeguards');

/**
 * Enforce visual teaching for procedural questions
 * If student asks "how do I..." and AI doesn't use visual commands,
 * auto-inject the appropriate command
 *
 * ANTI-CHEAT: Prevents solving homework, shows partial work only
 *
 * @param {string} studentMessage - The student's question
 * @param {string} aiResponse - The AI's response text
 * @param {string} conversationHistory - Optional conversation context
 * @returns {string} Enhanced AI response with visual commands injected
 */
function enforceVisualTeaching(studentMessage, aiResponse, conversationHistory = '') {
    // Skip if AI already used visual commands
    if (hasVisualCommands(aiResponse)) {
        console.log('[VisualEnforcer] AI already used visual commands ✓');
        return aiResponse;
    }

    // ANTI-CHEAT CHECK: Detect homework/cheat attempts
    const cheatCheck = detectCheatAttempt(studentMessage, conversationHistory);
    if (cheatCheck.isCheatAttempt) {
        console.warn(`[VisualEnforcer] 🚫 Cheat attempt detected: ${cheatCheck.reason}`);
        // Don't inject visual commands for direct homework requests
        // Instead, redirect to teaching mode
        return generateAntiCheatResponse(cheatCheck);
    }

    // Check if this problem type should NOT be visualized (word problems, proofs)
    if (shouldNotVisualize(studentMessage)) {
        console.log('[VisualEnforcer] Problem type should not be auto-visualized');
        return aiResponse;
    }

    // Determine visual mode: 'partial' (teaching), 'example', or 'full'
    const visualMode = determineVisualMode(studentMessage, cheatCheck);
    console.log(`[VisualEnforcer] Visual mode: ${visualMode}`);

    const lowerMessage = studentMessage.toLowerCase();
    const lowerResponse = aiResponse.toLowerCase();

    // ===== LONG DIVISION =====
    if (isLongDivisionQuestion(lowerMessage)) {
        const numbers = extractDivisionNumbers(studentMessage, aiResponse);
        if (numbers) {
            const modeFlag = visualMode === 'partial' ? ':PARTIAL' : '';
            console.log(`[VisualEnforcer] 🎯 Auto-injecting LONG_DIVISION (${visualMode}): ${numbers.dividend} ÷ ${numbers.divisor}`);
            return `[LONG_DIVISION:${numbers.dividend},${numbers.divisor}${modeFlag}] ${getTeachingPrompt('division', visualMode)}`;
        }
    }

    // ===== VERTICAL MULTIPLICATION =====
    if (isMultiplicationQuestion(lowerMessage)) {
        const numbers = extractMultiplicationNumbers(studentMessage, aiResponse);
        if (numbers) {
            const modeFlag = visualMode === 'partial' ? ':PARTIAL' : '';
            console.log(`[VisualEnforcer] 🎯 Auto-injecting MULTIPLY_VERTICAL (${visualMode}): ${numbers.num1} × ${numbers.num2}`);
            return `[MULTIPLY_VERTICAL:${numbers.num1},${numbers.num2}${modeFlag}] ${getTeachingPrompt('multiply', visualMode)}`;
        }
    }

    // ===== FRACTION ADDITION =====
    if (isFractionAdditionQuestion(lowerMessage)) {
        const fractions = extractFractionAddition(studentMessage, aiResponse);
        if (fractions) {
            const modeFlag = visualMode === 'partial' ? ':PARTIAL' : '';
            console.log(`[VisualEnforcer] 🎯 Auto-injecting FRACTION_ADD (${visualMode}): ${fractions.n1}/${fractions.d1} + ${fractions.n2}/${fractions.d2}`);
            return `[FRACTION_ADD:${fractions.n1},${fractions.d1},${fractions.n2},${fractions.d2}${modeFlag}] ${getTeachingPrompt('fraction_add', visualMode)}`;
        }
    }

    // ===== FRACTION MULTIPLICATION =====
    if (isFractionMultiplicationQuestion(lowerMessage)) {
        const fractions = extractFractionMultiplication(studentMessage, aiResponse);
        if (fractions) {
            const modeFlag = visualMode === 'partial' ? ':PARTIAL' : '';
            console.log(`[VisualEnforcer] 🎯 Auto-injecting FRACTION_MULTIPLY (${visualMode}): ${fractions.n1}/${fractions.d1} × ${fractions.n2}/${fractions.d2}`);
            return `[FRACTION_MULTIPLY:${fractions.n1},${fractions.d1},${fractions.n2},${fractions.d2}${modeFlag}] ${getTeachingPrompt('fraction_multiply', visualMode)}`;
        }
    }

    // ===== EQUATION SOLVING =====
    if (isEquationSolvingQuestion(lowerMessage)) {
        const equation = extractEquation(studentMessage, aiResponse);
        if (equation) {
            const modeFlag = visualMode === 'partial' ? ':PARTIAL' : '';
            console.log(`[VisualEnforcer] 🎯 Auto-injecting EQUATION_SOLVE (${visualMode}): ${equation}`);
            return `[EQUATION_SOLVE:${equation}${modeFlag}] ${getTeachingPrompt('equation', visualMode)}`;
        }
    }

    // ===== GRAPHING =====
    if (isGraphingQuestion(lowerMessage)) {
        const func = extractFunction(studentMessage, aiResponse);
        if (func) {
            console.log(`[VisualEnforcer] 🎯 Auto-injecting GRAPH: ${func}`);
            return `[GRID][GRAPH:${func}] ${shortenResponse(aiResponse)}`;
        }
    }

    // ===== TRIANGLE PROBLEMS =====
    if (isTriangleProblem(lowerMessage)) {
        const angles = extractTriangleAngles(studentMessage, aiResponse);
        if (angles) {
            console.log(`[VisualEnforcer] 🎯 Auto-injecting TRIANGLE_PROBLEM`);
            return `[TRIANGLE_PROBLEM:A=${angles.A},B=${angles.B},C=${angles.C}] ${shortenResponse(aiResponse)}`;
        }
    }

    // No pattern matched - return original response
    return aiResponse;
}

// ============================================
// PATTERN DETECTION FUNCTIONS
// ============================================

function isLongDivisionQuestion(message) {
    const patterns = [
        /how\s+(do|can)\s+i\s+(do|solve)?\s*(long\s*)?divid/i,
        /show\s+me\s+(long\s*)?division/i,
        /explain\s+(long\s*)?division/i,
        /divid.*step\s+by\s+step/i
    ];
    return patterns.some(p => p.test(message));
}

function isMultiplicationQuestion(message) {
    const patterns = [
        /how\s+(do|can)\s+i\s+multiply/i,
        /show\s+me\s+multiplication/i,
        /multiply.*step\s+by\s+step/i,
        /how\s+to\s+multiply/i
    ];
    return patterns.some(p => p.test(message));
}

function isFractionAdditionQuestion(message) {
    const patterns = [
        /how\s+(do|can)\s+i\s+add\s+fractions/i,
        /adding\s+fractions/i,
        /fraction\s+addition/i,
        /add.*\/.*\+/i  // Matches "add 1/2 + 1/3"
    ];
    return patterns.some(p => p.test(message));
}

function isFractionMultiplicationQuestion(message) {
    const patterns = [
        /how\s+(do|can)\s+i\s+multiply\s+fractions/i,
        /multiplying\s+fractions/i,
        /fraction\s+multiplication/i,
        /multiply.*\/.*×/i
    ];
    return patterns.some(p => p.test(message));
}

function isEquationSolvingQuestion(message) {
    const patterns = [
        /how\s+(do|can)\s+i\s+solve/i,
        /solve.*equation/i,
        /solve.*for\s+x/i,
        /find\s+x/i
    ];
    return patterns.some(p => p.test(message));
}

function isGraphingQuestion(message) {
    const patterns = [
        /graph/i,
        /plot\s+(the\s+)?(function|equation)/i,
        /draw.*y\s*=/i,
        /show.*coordinate/i
    ];
    return patterns.some(p => p.test(message));
}

function isTriangleProblem(message) {
    const patterns = [
        /triangle/i,
        /angle.*degree/i,
        /find.*angle/i
    ];
    return patterns.some(p => p.test(message));
}

// ============================================
// NUMBER EXTRACTION FUNCTIONS
// ============================================

function extractDivisionNumbers(studentMsg, aiResponse) {
    // Try to extract from student message first: "342 ÷ 6", "342 divided by 6", "342/6"
    const divPatterns = [
        /(\d+)\s*÷\s*(\d+)/,
        /(\d+)\s+divided\s+by\s+(\d+)/i,
        /(\d+)\s*\/\s*(\d+)/,
        /divide\s+(\d+)\s+by\s+(\d+)/i
    ];

    for (const pattern of divPatterns) {
        const match = studentMsg.match(pattern);
        if (match) {
            return { dividend: parseInt(match[1]), divisor: parseInt(match[2]) };
        }
    }

    // Try AI response
    for (const pattern of divPatterns) {
        const match = aiResponse.match(pattern);
        if (match) {
            return { dividend: parseInt(match[1]), divisor: parseInt(match[2]) };
        }
    }

    return null;
}

function extractMultiplicationNumbers(studentMsg, aiResponse) {
    // Try patterns: "23 × 47", "23 times 47", "23 * 47"
    const multPatterns = [
        /(\d+)\s*[×x*]\s*(\d+)/i,
        /(\d+)\s+times\s+(\d+)/i,
        /multiply\s+(\d+)\s+(by\s+)?(\d+)/i
    ];

    for (const pattern of multPatterns) {
        const match = studentMsg.match(pattern);
        if (match) {
            const num1 = parseInt(match[1]);
            const num2 = parseInt(match[match.length - 1]); // Last captured group
            return { num1, num2 };
        }
    }

    // Try AI response
    for (const pattern of multPatterns) {
        const match = aiResponse.match(pattern);
        if (match) {
            const num1 = parseInt(match[1]);
            const num2 = parseInt(match[match.length - 1]);
            return { num1, num2 };
        }
    }

    return null;
}

function extractFractionAddition(studentMsg, aiResponse) {
    // Pattern: "3/4 + 1/6" or "add 3/4 and 1/6"
    const pattern = /(\d+)\s*\/\s*(\d+)\s*[+]\s*(\d+)\s*\/\s*(\d+)/;

    let match = studentMsg.match(pattern);
    if (match) {
        return {
            n1: parseInt(match[1]),
            d1: parseInt(match[2]),
            n2: parseInt(match[3]),
            d2: parseInt(match[4])
        };
    }

    match = aiResponse.match(pattern);
    if (match) {
        return {
            n1: parseInt(match[1]),
            d1: parseInt(match[2]),
            n2: parseInt(match[3]),
            d2: parseInt(match[4])
        };
    }

    return null;
}

function extractFractionMultiplication(studentMsg, aiResponse) {
    // Pattern: "2/3 × 3/4" or "multiply 2/3 and 3/4"
    const pattern = /(\d+)\s*\/\s*(\d+)\s*[×x*]\s*(\d+)\s*\/\s*(\d+)/;

    let match = studentMsg.match(pattern);
    if (match) {
        return {
            n1: parseInt(match[1]),
            d1: parseInt(match[2]),
            n2: parseInt(match[3]),
            d2: parseInt(match[4])
        };
    }

    match = aiResponse.match(pattern);
    if (match) {
        return {
            n1: parseInt(match[1]),
            d1: parseInt(match[2]),
            n2: parseInt(match[3]),
            d2: parseInt(match[4])
        };
    }

    return null;
}

function extractEquation(studentMsg, aiResponse) {
    // Pattern: Simple linear equations like "2x + 3 = 7", "5x - 2 = 13"
    const pattern = /(-?\d*x?\s*[+\-]\s*\d+\s*=\s*-?\d+)/i;

    let match = studentMsg.match(pattern);
    if (match) {
        return match[1].trim();
    }

    match = aiResponse.match(pattern);
    if (match) {
        return match[1].trim();
    }

    return null;
}

function extractFunction(studentMsg, aiResponse) {
    // Pattern: "y = x^2", "y=2x+1", etc.
    const pattern = /y\s*=\s*([x\d\+\-\*\/\^\s()]+)/i;

    let match = studentMsg.match(pattern);
    if (match) {
        return match[1].trim();
    }

    match = aiResponse.match(pattern);
    if (match) {
        return match[1].trim();
    }

    return null;
}

function extractTriangleAngles(studentMsg, aiResponse) {
    // Pattern: Look for angles like "30°", "70°", or "angle A = 30"
    const anglePattern = /(\d+)\s*°?/g;
    const angles = [];
    let match;

    const text = studentMsg + ' ' + aiResponse;
    while ((match = anglePattern.exec(text)) !== null) {
        const angle = parseInt(match[1]);
        if (angle > 0 && angle < 180) {
            angles.push(angle);
        }
    }

    // If we found 2 angles, calculate the third
    if (angles.length === 2) {
        const third = 180 - angles[0] - angles[1];
        return { A: angles[0], B: angles[1], C: third >= 0 ? third : '?' };
    }

    // If only 1 angle, use it and make others unknowns
    if (angles.length === 1) {
        return { A: angles[0], B: '?', C: '?' };
    }

    return null;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get appropriate teaching prompt based on operation and mode
 * Encourages student participation instead of just watching
 *
 * @param {string} operation - Type of operation
 * @param {string} mode - 'partial', 'example', or 'full'
 * @returns {string} Teaching prompt
 */
function getTeachingPrompt(operation, mode) {
    if (mode === 'partial') {
        const prompts = {
            division: "Watch the first steps. Can you finish it?",
            multiply: "I'll show you how it starts. You do the rest!",
            fraction_add: "Here's the setup. What's the common denominator?",
            fraction_multiply: "Watch the first step. What comes next?",
            equation: "Here's the first move. What should we do next?"
        };
        return prompts[operation] || "Watch the method, then you try!";
    } else if (mode === 'example') {
        return "Here's an example with different numbers. Then YOU try with yours!";
    }
    return "Watch how this works!";
}

/**
 * Shorten AI response to avoid text walls
 * Keep only the first 1-2 sentences
 */
function shortenResponse(response) {
    // Split by sentence
    const sentences = response.match(/[^.!?]+[.!?]+/g) || [response];

    // Take first 1-2 sentences (max 150 chars)
    let shortened = sentences[0];
    if (sentences.length > 1 && shortened.length < 80) {
        shortened += ' ' + sentences[1];
    }

    // Trim to max 150 chars
    if (shortened.length > 150) {
        shortened = shortened.substring(0, 147) + '...';
    }

    return shortened.trim();
}

module.exports = {
    enforceVisualTeaching
};
