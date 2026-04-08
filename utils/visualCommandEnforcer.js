// ============================================
// VISUAL COMMAND ENFORCER
// Automatically inject visual commands when AI gives text explanations
// for procedural questions that REQUIRE visual demonstrations
// INCLUDES ANTI-CHEAT SAFEGUARDS
// ============================================

const { hasVisualCommands } = require('./visualTeachingParser');
const { normalizeMathUnicode } = require('./mathUnicodeNormalizer');
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
function enforceVisualTeaching(studentMessage, aiResponse, conversationHistory = '', isVisualLearner = false) {
    // ============================================
    // INLINE CHAT VISUALS - No whiteboard needed!
    // Auto-inject inline visual commands when appropriate
    // ============================================

    const lowerMessage = studentMessage.toLowerCase();

    // Normalize any malformed FUNCTION_GRAPH commands from the AI
    // Fix spacing issues: [FUNCTION_GRAPH : fn = x^2, ...] → [FUNCTION_GRAPH:fn=x^2,...]
    let normalizedResponse = aiResponse.replace(
        /\[\s*FUNCTION_GRAPH\s*:\s*([^\]]+)\]/g,
        (match, inner) => {
            // Normalize key=value pairs: remove spaces around =
            const cleaned = inner.replace(/\s*=\s*/g, '=').replace(/\s*,\s*/g, ',');
            return `[FUNCTION_GRAPH:${cleaned}]`;
        }
    );

    // If AI included a FUNCTION_GRAPH but with a default/wrong function,
    // try to correct it using the student's actual question
    if (isGraphingRequest(lowerMessage) && /\[FUNCTION_GRAPH:/.test(normalizedResponse)) {
        const correctFunc = extractFunctionFromMessage(studentMessage, aiResponse);
        if (correctFunc) {
            // Extract the function the AI chose
            const aiCmdMatch = normalizedResponse.match(/\[FUNCTION_GRAPH:[^\]]*fn=([^,\]]+)/);
            const aiFunc = aiCmdMatch ? aiCmdMatch[1].trim() : null;
            // Default/generic functions the AI might fall back to
            const isDefault = !aiFunc || /^x\^?2$/.test(aiFunc) || /^x$/.test(aiFunc);
            // If AI used a default but the student asked about a specific function, fix it
            if (isDefault && correctFunc !== aiFunc) {
                console.log(`[VisualEnforcer] 🔧 Correcting FUNCTION_GRAPH: ${aiFunc} → ${correctFunc}`);
                normalizedResponse = normalizedResponse.replace(
                    /\[FUNCTION_GRAPH:[^\]]+\]/g,
                    `[FUNCTION_GRAPH:fn=${correctFunc},title="Graph of ${correctFunc}"]`
                );
            }
        }
    }

    if (normalizedResponse !== aiResponse) {
        aiResponse = normalizedResponse;
    }

    // Skip if AI already used inline visual commands
    if (hasInlineVisualCommands(aiResponse)) {
        console.log('[VisualEnforcer] AI already used inline visual commands ✓');
        return aiResponse;
    }

    // Only auto-inject visuals when the student EXPLICITLY asks for one
    // or the question is inherently visual (graphing, "show me", "draw", "plot")
    // Do NOT force visuals on every math question — text teaching is often better
    const explicitlyVisual = /\b(show\s*me|draw|graph|plot|visuali[sz]e|picture|diagram|see\s*it|number\s*line|tiles?|counter)\b/i.test(lowerMessage);

    // For visual learners, also trigger on math content keywords (broader gate)
    // NOTE: Intentionally excludes broad words like "function", "line", "circle"
    // that would false-positive on "piecewise function", "number line" discussions, etc.
    // The auto-inject handlers below will decide which SPECIFIC visual to use.
    const implicitlyVisual = isVisualLearner && /\b(fraction|equation|solve|factor|slope|intercept|parabola|triangle|angle|inequalit|polynomial|exponent|integer|negative|percent|ratio|proportion|area|volume|perimeter)\b/i.test(lowerMessage);

    if (!explicitlyVisual && !implicitlyVisual) {
        // AI chose not to use a visual — respect that choice
        return aiResponse;
    }

    if (implicitlyVisual && !explicitlyVisual) {
        console.log('[VisualEnforcer] 👁️ Visual learner — checking if a visual would help');
    }

    // GRAPHING REQUESTS - inject [FUNCTION_GRAPH]
    if (isGraphingRequest(lowerMessage)) {
        const func = extractFunctionFromMessage(studentMessage, aiResponse);
        if (func) {
            console.log(`[VisualEnforcer] 🎯 Auto-injecting FUNCTION_GRAPH: ${func}`);
            return `Seeing the graph makes this way easier to understand — look at the shape and where it crosses the axes.\n\n[FUNCTION_GRAPH:fn=${func},title="Graph of ${func}"]\n\n${shortenResponse(aiResponse)}`;
        }
    }

    // FRACTION VISUALIZATION REQUESTS
    if (isFractionVisualizationRequest(lowerMessage)) {
        const fraction = extractFractionFromMessage(studentMessage);
        if (fraction) {
            console.log(`[VisualEnforcer] 🎯 Auto-injecting FRACTION: ${fraction.num}/${fraction.denom}`);
            return `Fractions make more sense when you can see the pieces. Here's what \\( \\frac{${fraction.num}}{${fraction.denom}} \\) looks like:\n\n[FRACTION:numerator=${fraction.num},denominator=${fraction.denom},type=circle]\n\n${shortenResponse(aiResponse)}`;
        }
    }

    // NUMBER LINE REQUESTS
    if (isNumberLineRequest(lowerMessage)) {
        const point = extractPointFromMessage(studentMessage);
        console.log(`[VisualEnforcer] 🎯 Auto-injecting NUMBER_LINE`);
        const pointParam = point !== null ? `,points=[${point}],highlight=${point}` : '';
        return `A number line helps you see where numbers live and how they relate to each other.\n\n[NUMBER_LINE:min=-10,max=10${pointParam}]\n\n${shortenResponse(aiResponse)}`;
    }

    // UNIT CIRCLE / TRIG REQUESTS
    if (isUnitCircleRequest(lowerMessage)) {
        const angle = extractAngleFromMessage(studentMessage);
        console.log(`[VisualEnforcer] 🎯 Auto-injecting UNIT_CIRCLE: ${angle}°`);
        return `The unit circle connects angles to their sine and cosine values — the x-coordinate is cosine, the y-coordinate is sine.\n\n[UNIT_CIRCLE:angle=${angle}]\n\n${shortenResponse(aiResponse)}`;
    }

    // COORDINATE POINT REQUESTS
    if (isPointPlottingRequest(lowerMessage)) {
        const points = extractPointsFromMessage(studentMessage);
        if (points) {
            console.log(`[VisualEnforcer] 🎯 Auto-injecting POINTS: ${points}`);
            return `Plotting points helps you see the pattern — look at where each point lands on the grid.\n\n[POINTS:points=${points},title="Coordinate Points"]\n\n${shortenResponse(aiResponse)}`;
        }
    }

    // INTEGER COUNTER REQUESTS (adding/subtracting with negatives, zero pairs)
    if (isIntegerCounterRequest(lowerMessage)) {
        const counters = extractCountersFromMessage(studentMessage);
        if (counters) {
            console.log(`[VisualEnforcer] 🎯 Auto-injecting COUNTERS: +${counters.positive}, -${counters.negative}`);
            return `Counters make integer operations visual — positive and negative pair up to make zero. Watch what's left over!\n\n[COUNTERS:positive=${counters.positive},negative=${counters.negative},animate=true,label="${counters.label}"]\n\n${shortenResponse(aiResponse)}`;
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
    // Normalize Unicode minus signs and superscripts first
    const normStudent = normalizeMathChars(studentMsg);
    const normAI = normalizeMathChars(aiResponse);
    const pattern = /(-?\d*x?\s*[+\-]\s*\d+\s*=\s*-?\d+)/i;

    let match = normStudent.match(pattern);
    if (match) {
        return match[1].trim();
    }

    match = normAI.match(pattern);
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
    // Normalize Unicode first so all patterns can use ASCII caret/minus
    const text = normalizeMathChars(studentMsg + ' ' + aiResponse);

    const patterns = [
        // Quadratic expressions: x^2-5x+6
        /([x]\^?\d*\s*[+\-]\s*\d+[x]\s*[+\-]\s*\d+)/i,
        // Quadratic with caret: x^2-5x+6
        /([x]\^\d+\s*[+\-]\s*\d+[x]\s*[+\-]\s*\d+)/i,
        // Simple quadratic: x^2+6
        /([x]\^\d+\s*[+\-]\s*\d+)/i,
        // Linear expressions: 2x+3
        /(\d+[x]\s*[+\-]\s*\d+)/i,
        // Just x with coefficient: 2x, 3x
        /(\d*[x])/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            let expr = match[1].trim().replace(/\s+/g, '');
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
            const cleaned = quoted.replace(/\s+/g, '');
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
        /\[INEQUALITY:/,
        /\[ALGEBRA_TILES:/,
        /\[TILES_SOLVE:/,
        /\[TILES_FACTOR:/,
        /\[COUNTERS:/,
        /\[MULTI_REP:/
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
 * Normalize Unicode math characters to ASCII equivalents.
 * Delegates to shared utility — kept as a local alias for backward compat.
 */
function normalizeMathChars(str) {
    return normalizeMathUnicode(str);
}

/**
 * Math expression character class: x, digits, operators, parens, dots, spaces.
 * Unicode superscripts no longer needed here since we normalize first.
 */
const MATH_CHARS = '[x\\d\\(\\)\\^\\*\\/\\+\\-\\.\\s]';

/**
 * Extract function from message for graphing
 */
function extractFunctionFromMessage(studentMsg, aiResponse) {
    // Normalize Unicode math in inputs
    const normStudent = normalizeMathChars(studentMsg);
    const normAI = normalizeMathChars(aiResponse);

    // Common function patterns - ordered from most specific to least
    // Use a broad math-character class that captures full expressions including rational functions
    const patterns = [
        // Explicit y= or f(x)= assignment - greedy capture of full expression (most reliable)
        /y\s*=\s*((?:[x\d\(\)\^\*\/\+\-\.\s]|(?:sin|cos|tan|log|ln|sqrt|abs|exp)\s*\([^)]*\))+)/i,
        /f\(x\)\s*=\s*((?:[x\d\(\)\^\*\/\+\-\.\s]|(?:sin|cos|tan|log|ln|sqrt|abs|exp)\s*\([^)]*\))+)/i,
        // "graph of <function>" where function must start with a math-like token
        /(?:graph|plot)\s+(?:of\s+)?(?:y\s*=\s*)?((?:[x\d\(][x\d\(\)\^\*\/\+\-\.\s]*(?:\/\s*\([x\d\(\)\^\*\/\+\-\.\s]+\))?)+)/i,
        // Named functions: sin(x)/x, sinc, etc.
        /(sin\(x\)\/x|sinc)/i,
        // Common named functions with possible division
        /(?:graph|plot|show)\s+(?:of\s+)?(?:the\s+)?(?:a\s+)?((?:sin|cos|tan|sqrt|log|ln|exp|abs)\([^)]*\)(?:\s*\/\s*[x\d\(\)\^\+\-\.\s]+)?)/i,
        // Standalone well-known expressions (last resort - only if nothing else matched)
        /(x\^2|x\^3|sin\(x\)|cos\(x\)|tan\(x\)|sqrt\(x\)|log\(x\)|exp\(x\))/i
    ];

    // Try student message first (normalized)
    for (const pattern of patterns) {
        let match = normStudent.match(pattern);
        if (match) {
            let func = match[1].trim();
            func = func.replace(/\s+/g, '');
            func = func.replace(/sinc/i, 'sin(x)/x');
            // Remove trailing operators/punctuation caught by greedy match
            func = func.replace(/[\+\-\*\/\^\.]+$/, '');
            if (looksLikeMathExpression(func) && func.length > 1) return func;
        }
    }

    // Try AI response (normalized)
    for (const pattern of patterns) {
        let match = normAI.match(pattern);
        if (match) {
            let func = match[1].trim();
            func = func.replace(/\s+/g, '');
            func = func.replace(/sinc/i, 'sin(x)/x');
            func = func.replace(/[\+\-\*\/\^\.]+$/, '');
            if (looksLikeMathExpression(func) && func.length > 1) return func;
        }
    }

    return null;
}

/**
 * Validate that a string looks like a math expression, not natural language
 */
function looksLikeMathExpression(str) {
    if (!str || str.length === 0) return false;
    // Must contain x or be a known function
    if (!/x/i.test(str) && !/^[\d\+\-\*\/\^\(\)\.]+$/.test(str)) return false;
    // Reject if it contains sequences of 3+ consecutive letters that aren't known math functions
    const knownFunctions = /^(sin|cos|tan|log|ln|exp|sqrt|abs|pow|asin|acos|atan|sinh|cosh|tanh|pi|x)+$/i;
    const letterSequences = str.match(/[a-zA-Z]{2,}/g) || [];
    for (const seq of letterSequences) {
        if (!knownFunctions.test(seq)) return false;
    }
    return true;
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
    // Normalize Unicode fractions (½→(1/2), etc.) and operators first
    const msg = normalizeMathChars(message);
    const pattern = /(\d+)\s*\/\s*(\d+)/;
    const match = msg.match(pattern);
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
    const msg = normalizeMathChars(message);
    const match = msg.match(/(?:point|number|mark)\s*(-?\d+)/i);
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
 * Detect if message is about integer operations with negatives / zero pairs
 */
function isIntegerCounterRequest(message) {
    const patterns = [
        /(?:what|how).+(?:zero pair|zero-pair)/i,
        /(?:add|subtract|plus|minus).+(?:negative|positive)/i,
        /(?:negative|positive).+(?:add|subtract|plus|minus)/i,
        /\d+\s*\+\s*\(?-\d+\)?/,       // 5 + (-3)
        /\(?-\d+\)?\s*\+\s*\d+/,        // (-3) + 5
        /\d+\s*-\s*\d+/,                 // 5 - 3 (basic, only if context suggests counters)
        /(?:show|use|try).+counter/i,
        /(?:integer|integers).+(?:add|subtract|operation)/i,
        /(?:add|subtract).+(?:integer|integers)/i,
    ];
    return patterns.some(p => p.test(message));
}

/**
 * Extract positive and negative counts from an integer expression
 * e.g., "5 + (-3)" → { positive: 5, negative: 3, label: "5 + (−3)" }
 * e.g., "-2 + 7" → { positive: 7, negative: 2, label: "−2 + 7" }
 */
function extractCountersFromMessage(message) {
    // Normalize Unicode minus signs so patterns can use ASCII -
    const msg = normalizeMathChars(message);
    // Pattern: N + (-M) or N + -M
    let match = msg.match(/(\d+)\s*\+\s*\(?-(\d+)\)?/);
    if (match) {
        return { positive: parseInt(match[1]), negative: parseInt(match[2]), label: `${match[1]} + (−${match[2]})` };
    }

    // Pattern: (-M) + N or -M + N
    match = msg.match(/\(?-(\d+)\)?\s*\+\s*(\d+)/);
    if (match) {
        return { positive: parseInt(match[2]), negative: parseInt(match[1]), label: `−${match[1]} + ${match[2]}` };
    }

    // Pattern: N - M (interpret as N + (-M) for counters)
    match = msg.match(/(\d+)\s*-\s*(\d+)/);
    if (match) {
        return { positive: parseInt(match[1]), negative: parseInt(match[2]), label: `${match[1]} − ${match[2]}` };
    }

    // Zero pairs question - show equal amounts
    if (/zero.?pair/i.test(msg)) {
        return { positive: 4, negative: 4, label: 'Zero pairs: +4 and −4 cancel out!' };
    }

    return null;
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

// ============================================
// AUTO-VISUALIZE BY TOPIC
// ChatGPT-style: automatically inject interactive
// visualizations when the student asks about certain
// math concepts — no explicit "show me" needed.
// ============================================

/**
 * Topic definitions: order matters (most specific first).
 * Each entry has:
 *   name    – for logging
 *   detect  – regex tested against combined student + AI text
 *   build   – returns the visual command string to append
 */
const TOPIC_VISUALS = [
    {
        name: 'Pythagorean theorem',
        detect: /\b(pythag\w*|a\s*²\s*\+\s*b\s*²|a\s*\^\s*2\s*\+\s*b\s*\^\s*2)/i,
        build(studentMsg, aiResponse) {
            const combined = studentMsg + ' ' + aiResponse;
            // Try to extract side lengths from context
            const sideMatch = combined.match(/(?:sides?|legs?)\s+(\d+)\s+(?:and\s+)?(\d+)/i)
                || combined.match(/a\s*=\s*(\d+)[\s,]+b\s*=\s*(\d+)/i);
            const a = sideMatch ? parseInt(sideMatch[1]) : 3;
            const b = sideMatch ? parseInt(sideMatch[2]) : 4;
            return `\n\nSee how the squares on each side relate? The two smaller squares add up to the big one — that's the Pythagorean theorem in action.\n\n[PYTHAGOREAN:a=${a},b=${b},proof=true]`;
        }
    },
    {
        name: 'Unit circle',
        // Only match when the STUDENT asks about unit circle (not just AI mentioning it)
        detect: null,
        detectFn(studentMsg) {
            return /\bunit\s*circle\b/i.test(studentMsg);
        },
        build(studentMsg) {
            const angle = extractAngleFromMessage(studentMsg);
            return `\n\nThe unit circle connects angles to coordinates — each point on the circle gives you the cosine (x) and sine (y) of that angle.\n\n[UNIT_CIRCLE:angle=${angle}]`;
        }
    },
    {
        name: 'Trig functions',
        detect: /\b(trig(onometr\w*)?|sine\s+function|cosine\s+function|tangent\s+function|sin\s*\(x\)|cos\s*\(x\)|tan\s*\(x\)|sinusoidal|trig\s+function)/i,
        build(studentMsg) {
            const lower = studentMsg.toLowerCase();
            let fn = 'sin(x)';
            let title = 'Sine Function';
            if (/\bcos(ine)?\b/i.test(lower)) { fn = 'cos(x)'; title = 'Cosine Function'; }
            if (/\btan(gent)?\b/i.test(lower)) { fn = 'tan(x)'; title = 'Tangent Function'; }
            return `\n\nHere's what the function looks like — notice how it repeats in a wave pattern. The unit circle on the right shows where those values come from.\n\n[FUNCTION_GRAPH:fn=${fn},xMin=-6.28,xMax=6.28,yMin=-3,yMax=3,title="${title}"]\n\n[UNIT_CIRCLE:angle=45]`;
        }
    },
    {
        name: 'Quadratic / Parabola',
        detect: /\b(quadratic|parabola|vertex\s*form|standard\s*form.*ax|completing\s*the\s*square|a\s*x\s*²|ax\^2)\b/i,
        build() {
            return `\n\nTry dragging the sliders to see how each coefficient changes the parabola. What happens when you make \\( a \\) negative?\n\n[SLIDER_GRAPH:fn=a*x^2+b*x+c,params="a:1:-3:3,b:0:-5:5,c:0:-5:5",title="Explore: y = ax² + bx + c"]`;
        }
    },
    {
        name: 'Slope / Linear equations',
        detect: /\b(slope|rise\s*(over|and)\s*run|y\s*=\s*m\s*x\s*\+\s*b|slope.?intercept|linear\s+(equation|function))\b/i,
        build() {
            return `\n\nDrag the sliders to explore — \\( m \\) controls the steepness (slope) and \\( b \\) shifts the line up or down (y-intercept). What happens when \\( m \\) is negative?\n\n[SLIDER_GRAPH:fn=m*x+b,params="m:1:-5:5,b:0:-5:5",title="Explore: y = mx + b (slope-intercept form)"]`;
        }
    },
    {
        name: 'Angle types',
        detect: /\b(acute\s+angle|obtuse\s+angle|right\s+angle|complementary\s+angle|supplementary\s+angle|angle\s+measure|types?\s+of\s+angle)/i,
        build(studentMsg) {
            const lower = studentMsg.toLowerCase();
            let degrees = 45;
            let description = 'an acute angle (less than 90°)';
            if (/obtuse/i.test(lower)) { degrees = 120; description = 'an obtuse angle (between 90° and 180°)'; }
            else if (/right/i.test(lower)) { degrees = 90; description = 'a right angle (exactly 90°)'; }
            else if (/supplementary/i.test(lower)) { degrees = 135; description = 'a supplementary angle pair'; }
            else if (/complementary/i.test(lower)) { degrees = 60; description = 'a complementary angle pair'; }
            // Try to pull a specific degree from the message
            const degMatch = lower.match(/(\d+)\s*(?:°|degree|deg)/i);
            if (degMatch) { degrees = parseInt(degMatch[1]); description = `a ${degrees}° angle`; }
            return `\n\nHere's ${description} — see how the opening between the two rays creates the measurement.\n\n[ANGLE:degrees=${degrees}]`;
        }
    },
    {
        name: 'Fractions',
        detect: null,
        // Skip if the context is about rational expressions/functions (not simple fractions)
        detectFn(studentMsg, aiResponse) {
            const combined = (studentMsg + ' ' + aiResponse).toLowerCase();
            // Don't inject simple fraction visual for rational functions/expressions
            if (/\b(rational\s+(function|expression)|asymptote|piecewise|continuous|limit|hole\b|vertical\b|horizontal\b)/i.test(combined)) {
                return false;
            }
            return /\b(what\s+(is|are)\s+(a\s+)?fraction|explain\s+fraction|understand\s+fraction|numerator\s+and\s+denominator|improper\s+fraction|mixed\s+number|equivalent\s+fraction)/i.test(combined);
        },
        build(studentMsg) {
            const frac = extractFractionFromMessage(studentMsg);
            const num = frac ? frac.num : 3;
            const denom = frac ? frac.denom : 4;
            return `\n\nA fraction shows parts of a whole — the bottom number (denominator) tells you how many equal pieces, and the top (numerator) tells you how many you have.\n\n[FRACTION:numerator=${num},denominator=${denom},type=circle]`;
        }
    },
    {
        name: 'Inequality',
        detect: /\b(inequalit\w*|solve.*[<>]|graph.*(greater|less\s+than|[<>]))/i,
        build(studentMsg) {
            // Normalize Unicode ≤/≥ and minus before extraction
            const msg = normalizeMathChars(studentMsg);
            // Try to extract inequality expression
            const ineqMatch = msg.match(/([x])\s*([<>]=?)\s*(-?\d+)/);
            if (ineqMatch) {
                return `\n\nThe shaded region shows all the values that make the inequality true. Notice whether the circle is open (not included) or filled (included).\n\n[INEQUALITY:expression=${ineqMatch[1]}${ineqMatch[2]}${ineqMatch[3]},variable=x]`;
            }
            return `\n\nThe shaded region shows all the values that make the inequality true.\n\n[INEQUALITY:expression=x>3,variable=x]`;
        }
    },
    {
        name: 'Derivative / Rate of change',
        detect: null,
        // Only inject a graph when the conversation is actually WORKING ON a derivative,
        // not just mentioning the word "derivative" in a topic list or transition message.
        detectFn(studentMsg, aiResponse) {
            const combined = (studentMsg + ' ' + aiResponse).toLowerCase();
            // Must have a derivative keyword
            if (!/\b(derivative|differentiat\w*|power\s+rule|tangent\s+line|instantaneous\s+rate|d\s*\/\s*dx|f\s*'\s*\()/i.test(combined)) {
                return false;
            }
            // Require evidence we're computing/teaching a specific derivative:
            // - a function definition like f(x) = ... or y = x^2 ...
            // - "derivative of <expr>" or "differentiate <expr>"
            // - actual derivative notation d/dx or f'(x) = ...
            // - power rule being applied (shows working, not just named)
            const hasFunction = /(?:f\s*\(\s*x\s*\)\s*=|y\s*=\s*\w*x)\s*[\w\^*+\-/().]/i.test(combined);
            const hasDerivativeOf = /\b(?:derivative\s+of|differentiat\w+)\s+\S/i.test(combined);
            const hasNotation = /(?:d\s*\/\s*dx\s*[\[(]|f\s*'\s*\(\s*x\s*\)\s*=)/i.test(combined);
            const hasPowerRuleWork = /\b\d+\s*x\s*\^?\s*\d*/i.test(aiResponse) && /power\s+rule/i.test(combined);
            return hasFunction || hasDerivativeOf || hasNotation || hasPowerRuleWork;
        },
        build(studentMsg, aiResponse) {
            const combined = studentMsg + ' ' + aiResponse;
            const normalized = normalizeMathChars(combined);
            // Try to extract the function from context
            // After "derivative of" or "differentiate", optionally skip "f(x) =" prefix
            const fnMatch = normalized.match(/(?:f\s*\(\s*x\s*\)\s*=\s*|(?:derivative\s+of|differentiat\w+)\s+(?:f\s*\(\s*x\s*\)\s*=\s*)?)([\w\^*+\-/().]+(?:\s*[\w\^*+\-/().]+)*)/i);
            let fn = fnMatch ? fnMatch[1].trim().replace(/\s+/g, '') : 'x^3-3*x^2+2*x';
            // Clean up common artifacts
            fn = fn.replace(/[,.:;!?]+$/, '').replace(/\bthe\b/g, '');
            if (fn.length < 2 || !/x/.test(fn)) fn = 'x^3-3*x^2+2*x';
            return `\n\nThe blue curve is f(x) and the pink curve is its derivative f′(x). Hover over the graph to see the tangent line and slope at any point — notice how the slope of f matches the value of f′.\n\n[DERIVATIVE_GRAPH:fn=${fn},xMin=-3,xMax=5,title="f(x) and f′(x)"]`;
        }
    },
    {
        name: 'Velocity / Acceleration / Position',
        detect: /\b(velocity\s+and\s+acceleration|position\s+function|s\s*\(\s*t\s*\)\s*=|v\s*\(\s*t\s*\)|acceleration\s+function|kinematics|motion\s+along)/i,
        build(studentMsg, aiResponse) {
            const combined = studentMsg + ' ' + aiResponse;
            const normalized = normalizeMathChars(combined);
            // Try to extract position function
            const fnMatch = normalized.match(/s\s*\(\s*t\s*\)\s*=\s*([\w\^*+\-/().]+(?:\s*[\w\^*+\-/().]+)*)/i);
            let fn = fnMatch ? fnMatch[1].trim().replace(/\s+/g, '').replace(/t/g, 'x') : '4*x^3-6*x^2+2*x';
            fn = fn.replace(/[,.:;!?]+$/, '');
            if (fn.length < 2) fn = '4*x^3-6*x^2+2*x';
            return `\n\nBlue is position s(t), pink is velocity v(t) = s′(t), and green is acceleration a(t) = s″(t). Notice: when velocity is zero, position has a maximum or minimum. When acceleration is zero, velocity has an extremum.\n\n[VELOCITY_GRAPH:fn=${fn},xMin=0,xMax=3,title="Position, Velocity & Acceleration"]`;
        }
    },
    {
        name: 'Rational function / Asymptotes',
        detect: /\b(rational\s+function|vertical\s+asymptote|horizontal\s+asymptote|asymptote|removable\s+discontinuit|hole\s+in.*graph|end\s+behavior.*rational)/i,
        build(studentMsg, aiResponse) {
            const combined = studentMsg + ' ' + aiResponse;
            const normalized = normalizeMathChars(combined);
            // Try to extract the rational function
            const fnMatch = normalized.match(/(?:(?:graph|function|equation)\s+(?:is|of)\s+|y\s*=\s*|f\s*\(\s*x\s*\)\s*=\s*)(\([^)]+\)\s*\/\s*\([^)]+\))/i);
            let fn = fnMatch ? fnMatch[1].trim().replace(/\s+/g, '') : '(x^2-4)/(x-2)';
            if (fn.length < 3 || !/\//.test(fn)) fn = '(x^2-4)/(x-2)';
            return `\n\nExplore the rational function below. Dashed vertical lines are vertical asymptotes (where the function is undefined), dashed horizontal lines are horizontal asymptotes (end behavior), and open circles mark holes (removable discontinuities). Hover to trace values.\n\n[RATIONAL_GRAPH:fn=${fn},xMin=-8,xMax=8,title="Rational Function Analysis"]`;
        }
    },
    {
        name: 'Area model / Box method',
        detect: /\b(area\s+model|box\s+method|partial\s+product|lattice\s+multipli)/i,
        build(studentMsg) {
            const numMatch = studentMsg.match(/(\d{2,})\s*[×x*]\s*(\d{2,})/);
            const a = numMatch ? parseInt(numMatch[1]) : 23;
            const b = numMatch ? parseInt(numMatch[2]) : 15;
            return `\n\nThe area model breaks the multiplication into smaller, easier pieces — each box is one partial product, and adding them all gives you the total.\n\n[AREA_MODEL:a=${a},b=${b}]`;
        }
    }
];

/**
 * Auto-inject interactive visualizations based on detected math topics.
 * Runs AFTER enforceVisualTeaching — only adds visuals if none are present.
 *
 * @param {string} studentMessage - The student's question
 * @param {string} aiResponse - The AI's (possibly already enhanced) response
 * @returns {string} Response with visual command appended (or unchanged)
 */
function autoVisualizeByTopic(studentMessage, aiResponse, isVisualLearner = false) {
    // Skip if the response already has rich visual commands (diagrams, graphs, etc.)
    // For visual learners, only skip if there are RICH visuals (not just [STEPS] or [OLD]/[NEW])
    if (hasInlineVisualCommands(aiResponse)) {
        if (!isVisualLearner) return aiResponse;
        // Visual learner: still skip if there's a RICH visual (graph, diagram, etc.)
        const richVisuals = /\[(FUNCTION_GRAPH|SLIDER_GRAPH|DIAGRAM|NUMBER_LINE|FRACTION|PIE_CHART|BAR_CHART|POINTS|UNIT_CIRCLE|AREA_MODEL|PYTHAGOREAN|ANGLE|INEQUALITY|COUNTERS|ALGEBRA_TILES|SEARCH_IMAGE|DERIVATIVE_GRAPH|RATIONAL_GRAPH|VELOCITY_GRAPH):/i;
        if (richVisuals.test(aiResponse)) return aiResponse;
        console.log('[AutoVisualize] 👁️ Visual learner — response has basic visuals only, checking for topic augmentation');
    }

    const combined = (studentMessage + ' ' + aiResponse).toLowerCase();

    for (const topic of TOPIC_VISUALS) {
        const matches = topic.detectFn
            ? topic.detectFn(studentMessage, aiResponse)
            : topic.detect.test(combined);
        if (matches) {
            const visual = topic.build(studentMessage, aiResponse);
            console.log(`[AutoVisualize] 🎨 Topic detected: "${topic.name}" — injecting visualization${isVisualLearner ? ' (visual learner)' : ''}`);
            return aiResponse + visual;
        }
    }

    return aiResponse;
}

module.exports = {
    enforceVisualTeaching,
    autoVisualizeByTopic
};
