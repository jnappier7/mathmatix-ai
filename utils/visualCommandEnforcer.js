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
    // ============================================
    // INLINE CHAT VISUALS - No whiteboard needed!
    // Auto-inject inline visual commands when appropriate
    // ============================================

    const lowerMessage = studentMessage.toLowerCase();

    // Skip if AI already used inline visual commands
    if (hasInlineVisualCommands(aiResponse)) {
        console.log('[VisualEnforcer] AI already used inline visual commands ✓');
        return aiResponse;
    }

    // GRAPHING REQUESTS - inject [FUNCTION_GRAPH]
    if (isGraphingRequest(lowerMessage)) {
        const func = extractFunctionFromMessage(studentMessage, aiResponse);
        if (func) {
            console.log(`[VisualEnforcer] 🎯 Auto-injecting FUNCTION_GRAPH: ${func}`);
            return `Here's the graph!\n\n[FUNCTION_GRAPH:fn=${func},title="Graph of ${func}"]\n\n${shortenResponse(aiResponse)}`;
        }
    }

    // FRACTION VISUALIZATION REQUESTS
    if (isFractionVisualizationRequest(lowerMessage)) {
        const fraction = extractFractionFromMessage(studentMessage);
        if (fraction) {
            console.log(`[VisualEnforcer] 🎯 Auto-injecting FRACTION: ${fraction.num}/${fraction.denom}`);
            return `Here's what ${fraction.num}/${fraction.denom} looks like!\n\n[FRACTION:numerator=${fraction.num},denominator=${fraction.denom},type=circle]\n\n${shortenResponse(aiResponse)}`;
        }
    }

    // NUMBER LINE REQUESTS
    if (isNumberLineRequest(lowerMessage)) {
        const point = extractPointFromMessage(studentMessage);
        console.log(`[VisualEnforcer] 🎯 Auto-injecting NUMBER_LINE`);
        const pointParam = point !== null ? `,points=[${point}],highlight=${point}` : '';
        return `Here's the number line!\n\n[NUMBER_LINE:min=-10,max=10${pointParam}]\n\n${shortenResponse(aiResponse)}`;
    }

    // UNIT CIRCLE / TRIG REQUESTS
    if (isUnitCircleRequest(lowerMessage)) {
        const angle = extractAngleFromMessage(studentMessage);
        console.log(`[VisualEnforcer] 🎯 Auto-injecting UNIT_CIRCLE: ${angle}°`);
        return `Let's see it on the unit circle!\n\n[UNIT_CIRCLE:angle=${angle}]\n\n${shortenResponse(aiResponse)}`;
    }

    // COORDINATE POINT REQUESTS
    if (isPointPlottingRequest(lowerMessage)) {
        const points = extractPointsFromMessage(studentMessage);
        if (points) {
            console.log(`[VisualEnforcer] 🎯 Auto-injecting POINTS: ${points}`);
            return `Here are the points plotted!\n\n[POINTS:points=${points},title="Coordinate Points"]\n\n${shortenResponse(aiResponse)}`;
        }
    }

    return aiResponse;

    // ORIGINAL CODE BELOW - COMMENTED OUT FOR BETA
    /*
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
    *///

    /*
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

    // ===== FACTORING / ALGEBRA TILES =====
    if (isFactoringQuestion(lowerMessage)) {
        const expression = extractAlgebraExpression(studentMessage, aiResponse);
        if (expression) {
            console.log(`[VisualEnforcer] 🎯 Auto-injecting ALGEBRA_TILES: ${expression}`);
            return `[ALGEBRA_TILES:${expression}] Let's visualize this with algebra tiles. See how we can arrange these into a rectangle?`;
        }
    }

    // No pattern matched - return original response
    return aiResponse;
    */
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

function isFactoringQuestion(message) {
    const patterns = [
        /factor/i,
        /factoriz/i, // Spanish
        /expand/i,
        /foil/i,
        /multiply.*binomial/i,
        /\(x[+-]\d+\)\s*\(x[+-]\d+\)/, // Matches patterns like (x+2)(x+3)
        /quadratic.*factor/i,
        /area\s+model/i,
        /algebra\s+tiles/i
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

function extractAlgebraExpression(studentMsg, aiResponse) {
    // Look for algebraic expressions in various formats
    // Examples: x^2-5x+6, x²+5x+6, 2x+3, (x+2)(x+3)

    const patterns = [
        // Quadratic expressions: x^2-5x+6, x²-5x+6
        /([x]\^?²?\s*[+\-]\s*\d+[x]\s*[+\-]\s*\d+)/i,
        // Quadratic with caret: x^2-5x+6
        /([x]\^\d+\s*[+\-]\s*\d+[x]\s*[+\-]\s*\d+)/i,
        // Simple quadratic: x^2+6 or x²+6
        /([x]\^?²?\s*[+\-]\s*\d+)/i,
        // Linear expressions: 2x+3
        /(\d+[x]\s*[+\-]\s*\d+)/i,
        // Just x with coefficient: 2x, 3x
        /(\d*[x])/i
    ];

    const text = studentMsg + ' ' + aiResponse;

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            let expr = match[1].trim();

            // Clean up the expression
            // Replace superscript 2 with ^2
            expr = expr.replace(/²/g, '^2');
            // Remove spaces
            expr = expr.replace(/\s+/g, '');
            // Ensure proper format for algebra tiles

            console.log('[VisualEnforcer] Extracted expression:', expr);
            return expr;
        }
    }

    // Special case: Look for expressions mentioned in quotes
    const quotedPattern = /"([^"]+)"|'([^']+)'/;
    const quotedMatch = text.match(quotedPattern);
    if (quotedMatch) {
        const quoted = quotedMatch[1] || quotedMatch[2];
        if (/[x]/.test(quoted) && /[+\-]/.test(quoted)) {
            const cleaned = quoted.replace(/²/g, '^2').replace(/\s+/g, '');
            console.log('[VisualEnforcer] Extracted quoted expression:', cleaned);
            return cleaned;
        }
    }

    return null;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if response already contains inline visual commands
 */
function hasInlineVisualCommands(response) {
    const inlinePatterns = [
        /\[FUNCTION_GRAPH:/,
        /\[NUMBER_LINE:/,
        /\[FRACTION:/,
        /\[PIE_CHART:/,
        /\[BAR_CHART:/,
        /\[POINTS:/,
        /\[UNIT_CIRCLE/,
        /\[AREA_MODEL:/,
        /\[SLIDER_GRAPH:/,
        /\[COMPARISON:/,
        // New enhanced visuals
        /\[PYTHAGOREAN:/,
        /\[ANGLE:/,
        /\[SLOPE:/,
        /\[PERCENT_BAR:/,
        /\[PLACE_VALUE:/,
        /\[RIGHT_TRIANGLE:/,
        /\[INEQUALITY:/
    ];
    return inlinePatterns.some(p => p.test(response));
}

/**
 * Check if message is a graphing request
 */
function isGraphingRequest(message) {
    const patterns = [
        /graph/i,
        /plot.*function/i,
        /show.*graph/i,
        /draw.*y\s*=/i,
        /what.*look.*like.*function/i,
        /visualize.*equation/i
    ];
    return patterns.some(p => p.test(message));
}

/**
 * Extract function from message for graphing
 */
function extractFunctionFromMessage(studentMsg, aiResponse) {
    // Common function patterns
    const patterns = [
        /(?:graph|plot|show)\s+(?:of\s+)?(?:y\s*=\s*)?([\w\d\(\)\^\*\/\+\-\s]+)/i,
        /y\s*=\s*([\w\d\(\)\^\*\/\+\-\s]+)/i,
        /f\(x\)\s*=\s*([\w\d\(\)\^\*\/\+\-\s]+)/i,
        /(sin\(x\)\/x|sinc)/i,
        /(x\^2|x\^3|sin\(x\)|cos\(x\)|tan\(x\)|sqrt\(x\)|log\(x\)|exp\(x\))/i
    ];

    for (const pattern of patterns) {
        let match = studentMsg.match(pattern);
        if (match) {
            let func = match[1].trim();
            // Clean up the function
            func = func.replace(/\s+/g, '');
            func = func.replace(/sinc/i, 'sin(x)/x');
            return func;
        }
    }

    // Try AI response
    for (const pattern of patterns) {
        let match = aiResponse.match(pattern);
        if (match) {
            let func = match[1].trim();
            func = func.replace(/\s+/g, '');
            return func;
        }
    }

    return null;
}

/**
 * Check if message requests fraction visualization
 */
function isFractionVisualizationRequest(message) {
    const patterns = [
        /what.*(?:does|is).*\/.*look/i,
        /show.*fraction/i,
        /visualize.*fraction/i,
        /picture.*\/\d+/i,
        /draw.*fraction/i
    ];
    return patterns.some(p => p.test(message));
}

/**
 * Extract fraction from message
 */
function extractFractionFromMessage(message) {
    const pattern = /(\d+)\s*\/\s*(\d+)/;
    const match = message.match(pattern);
    if (match) {
        return { num: parseInt(match[1]), denom: parseInt(match[2]) };
    }
    return null;
}

/**
 * Check if message requests number line
 */
function isNumberLineRequest(message) {
    const patterns = [
        /number\s*line/i,
        /show.*on.*line/i,
        /plot.*integer/i,
        /mark.*point/i
    ];
    return patterns.some(p => p.test(message));
}

/**
 * Extract point from message for number line
 */
function extractPointFromMessage(message) {
    const match = message.match(/(?:point|number|mark)\s*(-?\d+)/i);
    return match ? parseInt(match[1]) : null;
}

/**
 * Check if message requests unit circle
 */
function isUnitCircleRequest(message) {
    const patterns = [
        /unit\s*circle/i,
        /sin.*degree/i,
        /cos.*degree/i,
        /trig.*angle/i,
        /show.*sin\s*\(?\s*\d+/i,
        /show.*cos\s*\(?\s*\d+/i
    ];
    return patterns.some(p => p.test(message));
}

/**
 * Extract angle from message
 */
function extractAngleFromMessage(message) {
    const match = message.match(/(\d+)\s*(?:°|degree|deg)/i);
    if (match) return parseInt(match[1]);

    // Try common trig angles
    const angleMatch = message.match(/sin\s*\(?\s*(\d+)|cos\s*\(?\s*(\d+)/i);
    if (angleMatch) return parseInt(angleMatch[1] || angleMatch[2]);

    return 45; // Default
}

/**
 * Check if message requests point plotting
 */
function isPointPlottingRequest(message) {
    const patterns = [
        /plot.*point/i,
        /graph.*\(\s*-?\d+\s*,\s*-?\d+\s*\)/i,
        /coordinate.*point/i,
        /show.*\(\s*-?\d+\s*,\s*-?\d+\s*\)/i
    ];
    return patterns.some(p => p.test(message));
}

/**
 * Extract coordinate points from message
 */
function extractPointsFromMessage(message) {
    const pointPattern = /\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g;
    const points = [];
    let match;

    while ((match = pointPattern.exec(message)) !== null) {
        points.push(`(${match[1]},${match[2]})`);
    }

    return points.length > 0 ? points.join(',') : null;
}

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
