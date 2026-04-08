/**
 * Math Solver - Symbolic math verification for accuracy
 *
 * PROBLEM: LLMs are ~85% accurate on math
 * SOLUTION: Parse → Solve → Verify → Teach pipeline
 *
 * Uses regex-based parsing for common math patterns.
 * Runs in parallel with LLM - zero added latency.
 *
 * @module mathSolver
 */

/**
 * Detect if a message contains a math problem
 * @param {string} message - User message
 * @returns {Object|null} Detected problem info or null
 */
function detectMathProblem(message) {
    if (!message || typeof message !== 'string') {
        return null;
    }

    // Normalize Unicode superscripts/subscripts BEFORE any pattern matching.
    // AI messages and MathLive input often use ² ³ ⁴ etc. instead of ^2 ^3 ^4.
    // Without this, "3²" won't match the exponent pattern expecting "3^2".
    let normalized = message
        .replace(/⁰/g, '^0').replace(/¹/g, '^1').replace(/²/g, '^2')
        .replace(/³/g, '^3').replace(/⁴/g, '^4').replace(/⁵/g, '^5')
        .replace(/⁶/g, '^6').replace(/⁷/g, '^7').replace(/⁸/g, '^8')
        .replace(/⁹/g, '^9').replace(/⁻/g, '^-').replace(/⁺/g, '^+')
        .replace(/ⁿ/g, '^n');

    // Reassign so all downstream code (40+ regex matches and sub-function calls)
    // automatically operates on the normalized string.
    message = normalized;

    const text = normalized.trim().toLowerCase();

    // Pattern: Natural-language multiplication "multiply X by Y" or "X times Y" or "X multiplied by Y"
    const nlMultiplyPattern = /(?:multiply\s+)(\d+\.?\d*)\s+(?:by|and)\s+(\d+\.?\d*)/i;
    const nlMultiplyMatch = message.match(nlMultiplyPattern);
    if (nlMultiplyMatch) {
        return { type: 'arithmetic', left: parseFloat(nlMultiplyMatch[1]), operator: '*', right: parseFloat(nlMultiplyMatch[2]) };
    }

    // Pattern: "X times Y" or "X multiplied by Y" embedded in sentences
    const timesPattern = /(\d+\.?\d*)\s+(?:times|multiplied\s+by)\s+(\d+\.?\d*)/i;
    const timesMatch = message.match(timesPattern);
    if (timesMatch) {
        return { type: 'arithmetic', left: parseFloat(timesMatch[1]), operator: '*', right: parseFloat(timesMatch[2]) };
    }

    // Pattern: "X x Y" — lowercase "x" used as multiplication between two numbers
    // Must have spaces around "x" to distinguish from algebraic variable (e.g. "2x + 3")
    const letterXMultiplyPattern = /(\d+\.?\d*)\s+x\s+(\d+\.?\d*)/i;
    const letterXMatch = message.match(letterXMultiplyPattern);
    if (letterXMatch) {
        return { type: 'arithmetic', left: parseFloat(letterXMatch[1]), operator: '*', right: parseFloat(letterXMatch[2]) };
    }

    // Pattern: Natural-language division "divide X by Y" or "X divided by Y"
    const nlDividePattern = /(?:divide\s+)(\d+\.?\d*)\s+by\s+(\d+\.?\d*)/i;
    const nlDivideMatch = message.match(nlDividePattern);
    if (nlDivideMatch) {
        return { type: 'arithmetic', left: parseFloat(nlDivideMatch[1]), operator: '/', right: parseFloat(nlDivideMatch[2]) };
    }
    const dividedByPattern = /(\d+\.?\d*)\s+divided\s+by\s+(\d+\.?\d*)/i;
    const dividedByMatch = message.match(dividedByPattern);
    if (dividedByMatch) {
        return { type: 'arithmetic', left: parseFloat(dividedByMatch[1]), operator: '/', right: parseFloat(dividedByMatch[2]) };
    }

    // Pattern: Natural-language addition "add X and Y" or "X plus Y" or "sum of X and Y"
    const nlAddPattern = /(?:add\s+)(\d+\.?\d*)\s+(?:and|to|plus)\s+(\d+\.?\d*)/i;
    const nlAddMatch = message.match(nlAddPattern);
    if (nlAddMatch) {
        return { type: 'arithmetic', left: parseFloat(nlAddMatch[1]), operator: '+', right: parseFloat(nlAddMatch[2]) };
    }
    const plusPattern = /(\d+\.?\d*)\s+plus\s+(\d+\.?\d*)/i;
    const plusMatch = message.match(plusPattern);
    if (plusMatch) {
        return { type: 'arithmetic', left: parseFloat(plusMatch[1]), operator: '+', right: parseFloat(plusMatch[2]) };
    }

    // Pattern: Natural-language subtraction "subtract X from Y" or "X minus Y"
    const minusPattern = /(\d+\.?\d*)\s+minus\s+(\d+\.?\d*)/i;
    const minusMatch = message.match(minusPattern);
    if (minusMatch) {
        return { type: 'arithmetic', left: parseFloat(minusMatch[1]), operator: '-', right: parseFloat(minusMatch[2]) };
    }
    const subtractFromPattern = /subtract\s+(\d+\.?\d*)\s+from\s+(\d+\.?\d*)/i;
    const subtractFromMatch = message.match(subtractFromPattern);
    if (subtractFromMatch) {
        // "subtract A from B" = B - A
        return { type: 'arithmetic', left: parseFloat(subtractFromMatch[2]), operator: '-', right: parseFloat(subtractFromMatch[1]) };
    }

    // Pattern: System of two linear equations
    // "2x + y = 5 and x - y = 1", "solve the system: 2x + y = 5, x - y = 1"
    // Must come BEFORE single equation detection
    const systemResult = detectSystem(message);
    if (systemResult) return systemResult;

    // Pattern: General linear equation — handles multi-step, distribution, and variables on both sides
    // Matches anything with "x" and "=" that isn't a quadratic (no x² / x^2)
    // Examples: "2x + 3 = 7", "3(x+2) - 5 = 16", "3x + 5 = x + 13", "-2(x-4) + 3x = 10"
    // Must come BEFORE the "what is / solve" catch-all to handle "solve for x: ..."
    const hasEquals = /=/.test(message);
    const hasX = /\bx\b/i.test(message) || /\dx/i.test(message);
    const hasQuadratic = /x[\^²]2?|x\s*\^?\s*2/i.test(message);
    const hasFactorKeyword = /\bfactor/i.test(message);
    if (hasEquals && hasX && !hasQuadratic && !hasFactorKeyword) {
        // Extract the equation part (strip "solve", "solve for x:", etc.)
        const eqText = message.replace(/^.*?(?:solve(?:\s+for\s+x)?\s*:?\s*|find\s+x\s*:?\s*)/i, '').trim();
        const sides = eqText.split('=');
        if (sides.length === 2) {
            const left = parseLinearExpression(sides[0].trim());
            const right = parseLinearExpression(sides[1].trim());
            if (left !== null && right !== null) {
                return {
                    type: 'general_linear',
                    leftExpr: sides[0].trim(),
                    rightExpr: sides[1].trim(),
                    left,
                    right,
                };
            }
        }
    }

    // Pattern: Slope between two points
    // "slope through (1,2) and (3,6)", "find the slope of the line through (-1,3) and (2,-4)"
    // "what is the slope between (0,0) and (4,8)"
    // Must come BEFORE "what is / find / solve" catch-all
    const slopePattern = /\((-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\)\s*(?:and|,|to)\s*\((-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\)/i;
    const hasSlopeKeyword = /\bslope\b/i.test(message);
    const slopeMatch = message.match(slopePattern);
    if (slopeMatch && hasSlopeKeyword) {
        return {
            type: 'slope',
            x1: parseFloat(slopeMatch[1]),
            y1: parseFloat(slopeMatch[2]),
            x2: parseFloat(slopeMatch[3]),
            y2: parseFloat(slopeMatch[4]),
        };
    }

    // Pattern: Angle conversion — degrees to radians or radians to degrees
    const degToRadPattern = /(?:convert\s+)?(-?\d+\.?\d*)\s*(?:°|degrees?)\s*(?:to|in|into)\s*radians?/i;
    const degToRadMatch = message.match(degToRadPattern);
    if (degToRadMatch) {
        return { type: 'angle_conversion', direction: 'deg_to_rad', value: parseFloat(degToRadMatch[1]) };
    }
    const radToDegPattern = /(?:convert\s+)?(-?\d*\.?\d*)?\s*π\s*(?:\/\s*(\d+))?\s*(?:radians?\s*)?(?:to|in|into)\s*degrees?/i;
    const radToDegMatch = message.match(radToDegPattern);
    if (radToDegMatch) {
        let piCoeff = radToDegMatch[1];
        if (piCoeff === '' || piCoeff === undefined || piCoeff === '+') piCoeff = 1;
        else if (piCoeff === '-') piCoeff = -1;
        else piCoeff = parseFloat(piCoeff);
        const divisor = radToDegMatch[2] ? parseFloat(radToDegMatch[2]) : 1;
        return { type: 'angle_conversion', direction: 'rad_to_deg', piCoeff, divisor };
    }
    const numRadToDegPattern = /(?:convert\s+)?(-?\d+\.?\d*)\s*radians?\s*(?:to|in|into)\s*degrees?/i;
    const numRadToDegMatch = message.match(numRadToDegPattern);
    if (numRadToDegMatch) {
        return { type: 'angle_conversion', direction: 'num_rad_to_deg', value: parseFloat(numRadToDegMatch[1]) };
    }

    // Pattern: Logarithm evaluation
    const logBasePattern = /log\s*(?:_|base\s*)(\d+\.?\d*)\s*(?:\(|of\s*)(\d+\.?\d*)\)?/i;
    const logBaseMatch = message.match(logBasePattern);
    if (logBaseMatch) {
        return { type: 'logarithm', base: parseFloat(logBaseMatch[1]), argument: parseFloat(logBaseMatch[2]) };
    }
    const logSubscriptPattern = /log([₀₁₂₃₄₅₆₇₈₉]+)\s*\(?(\d+\.?\d*)\)?/i;
    const logSubscriptMatch = message.match(logSubscriptPattern);
    if (logSubscriptMatch) {
        const subscriptMap = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
        const base = parseFloat(logSubscriptMatch[1].split('').map(c => subscriptMap[c] || c).join(''));
        return { type: 'logarithm', base, argument: parseFloat(logSubscriptMatch[2]) };
    }
    const log10Pattern = /(?:^|\s)log\s*\(\s*(\d+\.?\d*)\s*\)/i;
    const log10Match = message.match(log10Pattern);
    if (log10Match) {
        return { type: 'logarithm', base: 10, argument: parseFloat(log10Match[1]) };
    }
    const lnPattern = /ln\s*\(\s*(\d+\.?\d*)\s*\)/i;
    const lnMatch = message.match(lnPattern);
    if (lnMatch) {
        return { type: 'logarithm', base: Math.E, argument: parseFloat(lnMatch[1]) };
    }

    // Pattern: Exponential equations — "2^x = 8", "3^x = 81"
    const expEqSimplePattern = /(\d+\.?\d*)\s*\^\s*x\s*=\s*(\d+\.?\d*)/i;
    const expEqSimpleMatch = message.match(expEqSimplePattern);
    if (expEqSimpleMatch) {
        return { type: 'exponential_equation', base: parseFloat(expEqSimpleMatch[1]), result: parseFloat(expEqSimpleMatch[2]) };
    }

    // Pattern: Distance between two points
    const distanceKeyword = /\bdistance\b/i.test(message);
    const pointPairPattern2 = /\((-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\)\s*(?:and|,|to)\s*\((-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\)/i;
    const pointPairMatch2 = message.match(pointPairPattern2);
    if (pointPairMatch2 && distanceKeyword) {
        return {
            type: 'distance',
            x1: parseFloat(pointPairMatch2[1]), y1: parseFloat(pointPairMatch2[2]),
            x2: parseFloat(pointPairMatch2[3]), y2: parseFloat(pointPairMatch2[4]),
        };
    }
    // Pattern: Midpoint between two points
    const midpointKeyword = /\bmidpoint\b/i.test(message);
    if (pointPairMatch2 && midpointKeyword) {
        return {
            type: 'midpoint',
            x1: parseFloat(pointPairMatch2[1]), y1: parseFloat(pointPairMatch2[2]),
            x2: parseFloat(pointPairMatch2[3]), y2: parseFloat(pointPairMatch2[4]),
        };
    }

    // ── Expression substitution (plug-in) ──
    // "evaluate 24t-12 at t=2", "plug x=1 into 3x^2-6x+2", "f(2) where f(x) = 24x-12"
    // "what is 3x^2-6x+2 when x=1", "a(2) = 24(2)-12"
    const substitutionResult = detectSubstitution(message);
    if (substitutionResult) return substitutionResult;

    // ── Calculus: Derivatives ──
    // "derivative of x^3 - 3x + 2", "d/dx(x^2 + 5x)", "differentiate 3x^4 - 2x^2 + x"
    // "what is the derivative of x^3 - 3x + 2", "find d/dx of 5x^2 + 3x - 7"
    const derivativeResult = detectDerivative(message);
    if (derivativeResult) return derivativeResult;

    // ── Calculus: Limits ──
    // "limit of (x^2-4)/(x-2) as x approaches 2", "lim x→2 (x^2-4)/(x-2)"
    // "what is the limit of (x^2-4)/(x-2) as x approaches 2"
    const limitResult = detectLimit(message);
    if (limitResult) return limitResult;

    // Pattern: Absolute value equations — "|2x + 3| = 7", "|x - 5| = 10"
    const absValPattern = /\|\s*(-?\d*\.?\d*)\s*x\s*([+\-])\s*(\d+\.?\d*)\s*\|\s*=\s*(\d+\.?\d*)/i;
    const absValMatch = message.match(absValPattern);
    if (absValMatch) {
        return {
            type: 'absolute_value_equation',
            coefficient: parseFloat(absValMatch[1] || '1'),
            operator: absValMatch[2],
            constant: parseFloat(absValMatch[3]),
            result: parseFloat(absValMatch[4]),
        };
    }

    // Pattern: Mean/Median/Mode/Range of a data set
    // "find the mean of 3, 5, 7, 9", "median of {12, 15, 18}", "what is the mode of 3,8,3,2"
    const statsKeyword = message.match(/\b(mean|average|median|mode|range)\b/i);
    const numberListMatch = message.match(/(?:of\s+)?[{(]?\s*((?:-?\d+\.?\d*(?:\s*,\s*|\s+and\s+))+(?:-?\d+\.?\d*))\s*[})]?/i);
    if (statsKeyword && numberListMatch) {
        const nums = numberListMatch[1].split(/\s*,\s*|\s+and\s+/).map(Number).filter(n => !isNaN(n));
        if (nums.length >= 2) {
            return { type: 'statistics', operation: statsKeyword[1].toLowerCase(), data: nums };
        }
    }

    // Pattern: Probability — "probability of drawing a heart", "P(red)", "chance of rolling a 6"
    // Handles standard deck, dice, coins, and explicit "N out of M" / "N/M" setups.
    const probMatch = detectProbability(message);
    if (probMatch) {
        return probMatch;
    }

    // Pattern: Proportion / cross-multiplication — "solve x/4 = 3/8", "2/5 = x/15"
    // Also: "if 5 items cost $3.50, how much for 8 items" → too NLP-heavy, skip for now
    const proportionPattern1 = /(\d+\.?\d*|x)\s*\/\s*(\d+\.?\d*|x)\s*=\s*(\d+\.?\d*|x)\s*\/\s*(\d+\.?\d*|x)/i;
    const proportionMatch = message.match(proportionPattern1);
    if (proportionMatch) {
        const parts = [proportionMatch[1], proportionMatch[2], proportionMatch[3], proportionMatch[4]];
        const xCount = parts.filter(p => p.toLowerCase() === 'x').length;
        if (xCount === 1) {
            return {
                type: 'proportion',
                a: parts[0], b: parts[1], c: parts[2], d: parts[3],
            };
        }
    }

    // Pattern: Circle area or circumference
    // "area of a circle with radius 5", "circumference of a circle with diameter 10"
    const circleAreaPattern = /area\s+(?:of\s+)?(?:a\s+)?circle\s+(?:with\s+)?(?:radius|r)\s*(?:=|of|is)?\s*(\d+\.?\d*)/i;
    const circleAreaMatch = message.match(circleAreaPattern);
    if (circleAreaMatch) {
        return { type: 'circle', operation: 'area', radius: parseFloat(circleAreaMatch[1]) };
    }
    const circleAreaDiamPattern = /area\s+(?:of\s+)?(?:a\s+)?circle\s+(?:with\s+)?(?:diameter|d)\s*(?:=|of|is)?\s*(\d+\.?\d*)/i;
    const circleAreaDiamMatch = message.match(circleAreaDiamPattern);
    if (circleAreaDiamMatch) {
        return { type: 'circle', operation: 'area', radius: parseFloat(circleAreaDiamMatch[1]) / 2 };
    }
    const circumferencePattern = /circumference\s+(?:of\s+)?(?:a\s+)?circle\s+(?:with\s+)?(?:radius|r)\s*(?:=|of|is)?\s*(\d+\.?\d*)/i;
    const circumferenceMatch = message.match(circumferencePattern);
    if (circumferenceMatch) {
        return { type: 'circle', operation: 'circumference', radius: parseFloat(circumferenceMatch[1]) };
    }
    const circumferenceDiamPattern = /circumference\s+(?:of\s+)?(?:a\s+)?circle\s+(?:with\s+)?(?:diameter|d)\s*(?:=|of|is)?\s*(\d+\.?\d*)/i;
    const circumferenceDiamMatch = message.match(circumferenceDiamPattern);
    if (circumferenceDiamMatch) {
        return { type: 'circle', operation: 'circumference', radius: parseFloat(circumferenceDiamMatch[1]) / 2 };
    }

    // Pattern: Volume of rectangular prism or cylinder
    const rectVolPattern = /volume\s+(?:of\s+)?(?:a\s+)?(?:rectangular\s+)?(?:prism|box)\s*.*?(?:length|l)\s*(?:=|of|is|:)?\s*(\d+\.?\d*).*?(?:width|w)\s*(?:=|of|is|:)?\s*(\d+\.?\d*).*?(?:height|h)\s*(?:=|of|is|:)?\s*(\d+\.?\d*)/i;
    const rectVolMatch = message.match(rectVolPattern);
    if (rectVolMatch) {
        return { type: 'volume', shape: 'rectangular_prism', length: parseFloat(rectVolMatch[1]), width: parseFloat(rectVolMatch[2]), height: parseFloat(rectVolMatch[3]) };
    }
    const cylVolPattern = /volume\s+(?:of\s+)?(?:a\s+)?cylinder\s*.*?(?:radius|r)\s*(?:=|of|is|:)?\s*(\d+\.?\d*).*?(?:height|h)\s*(?:=|of|is|:)?\s*(\d+\.?\d*)/i;
    const cylVolMatch = message.match(cylVolPattern);
    if (cylVolMatch) {
        return { type: 'volume', shape: 'cylinder', radius: parseFloat(cylVolMatch[1]), height: parseFloat(cylVolMatch[2]) };
    }

    // Pattern: "what is X + Y" or "solve X + Y"
    const whatIsPattern = /(?:what\s+is|what\s+do\s+you\s+get\s+(?:if\s+you\s+|when\s+you\s+|for\s+)?|solve|calculate|evaluate|compute|find)\s*(.+)/i;
    const whatIsMatch = message.match(whatIsPattern);
    if (whatIsMatch) {
        // Re-run natural language patterns on the extracted expression
        const expr = whatIsMatch[1].trim();
        const subResult = detectNaturalLanguageArithmetic(expr);
        if (subResult) return subResult;
        return { type: 'evaluation', expression: expr };
    }

    // Pattern: Polynomial expansion — "expand (2x+3)(x-4)", "multiply (x+2)(x+5)"
    // Also: "what is (x+3)(x+4)", "(2x+1)(x-3)"
    const expandKeyword = /\b(?:expand|multiply|simplify|foil)\b/i.test(message);
    const binomialProductPattern = /(\([-+]?\d*x[+-]\d+\)\s*){2,}/i;
    const hasBinomialProduct = binomialProductPattern.test(message.replace(/\s+/g, ''));
    if (hasBinomialProduct) {
        const factored = parseFactoredForm(message);
        if (factored && factored.binomials.length >= 2) {
            return {
                type: 'expand_polynomial',
                expression: message.replace(/^.*?(?:expand|multiply|simplify|foil|what\s+is)\s*/i, '').trim(),
                factored,
            };
        }
    }

    // Pattern: Factor a quadratic "factor x² + 5x + 6" or "factor x^2 - 5x - 14"
    // Also matches "factor the expression x²+5x+6" or "factoring x²+7x+10"
    const factorPattern = /(?:factor(?:ing|ize)?(?:\s+the\s+(?:expression|quadratic|trinomial))?\s+)(-?\d*\.?\d*)\s*x[\^²]2?\s*([+\-])\s*(\d*\.?\d*)\s*x\s*([+\-])\s*(\d+\.?\d*)/i;
    const factorMatch = message.match(factorPattern);
    if (factorMatch) {
        return {
            type: 'factor_quadratic',
            a: parseFloat(factorMatch[1] || '1'),
            bSign: factorMatch[2],
            b: parseFloat(factorMatch[3] || '1'),
            cSign: factorMatch[4],
            c: parseFloat(factorMatch[5])
        };
    }

    // Pattern: Factor difference of squares "factor x² - 9" or "factor x^2 - 25"
    // Also: "factor 4x² - 9", "factor x² - 16"
    const diffOfSquaresPattern = /(?:factor(?:ing|ize)?(?:\s+the\s+(?:expression|quadratic|trinomial|difference\s+of\s+squares))?\s+)(-?\d*\.?\d*)\s*x[\^²]2?\s*-\s*(\d+\.?\d*)/i;
    const diffOfSquaresMatch = message.match(diffOfSquaresPattern);
    if (diffOfSquaresMatch) {
        return {
            type: 'factor_diff_of_squares',
            a: parseFloat(diffOfSquaresMatch[1] || '1'),
            c: parseFloat(diffOfSquaresMatch[2]),
        };
    }

    // Pattern: Quadratic equation "x^2 + 5x + 6 = 0" or "x² + 5x + 6 = 0"
    const quadraticPattern = /(-?\d*\.?\d*)\s*x[\^²]2?\s*([+\-])\s*(\d*\.?\d*)\s*x\s*([+\-])\s*(\d+\.?\d*)\s*=\s*0/i;
    const quadraticMatch = message.match(quadraticPattern);
    if (quadraticMatch) {
        return {
            type: 'quadratic_equation',
            a: parseFloat(quadraticMatch[1] || '1'),
            bSign: quadraticMatch[2],
            b: parseFloat(quadraticMatch[3] || '1'),
            cSign: quadraticMatch[4],
            c: parseFloat(quadraticMatch[5])
        };
    }

    // Pattern: Simple arithmetic "15 + 27" or "15+27"
    const arithmeticPattern = /^(-?\d+\.?\d*)\s*([+\-*/×÷])\s*(-?\d+\.?\d*)$/;
    const arithmeticMatch = message.match(arithmeticPattern);
    if (arithmeticMatch) {
        return {
            type: 'arithmetic',
            left: parseFloat(arithmeticMatch[1]),
            operator: arithmeticMatch[2],
            right: parseFloat(arithmeticMatch[3])
        };
    }

    // Pattern: Fraction problems "1/2 + 1/4"
    const fractionPattern = /(\d+)\s*\/\s*(\d+)\s*([+\-*/])\s*(\d+)\s*\/\s*(\d+)/;
    const fractionMatch = message.match(fractionPattern);
    if (fractionMatch) {
        return {
            type: 'fraction_arithmetic',
            leftNum: parseInt(fractionMatch[1]),
            leftDen: parseInt(fractionMatch[2]),
            operator: fractionMatch[3],
            rightNum: parseInt(fractionMatch[4]),
            rightDen: parseInt(fractionMatch[5])
        };
    }

    // Pattern: Percentage "what is 15% of 200"
    const percentPattern = /(?:what\s+is\s+)?(\d+\.?\d*)\s*%\s*(?:of)\s*(\d+\.?\d*)/i;
    const percentMatch = message.match(percentPattern);
    if (percentMatch) {
        return {
            type: 'percentage',
            percent: parseFloat(percentMatch[1]),
            whole: parseFloat(percentMatch[2])
        };
    }

    // Pattern: Exponent "2^5" or "2 to the power of 5"
    const exponentPattern = /(\d+\.?\d*)\s*(?:\^|to\s+the\s+power\s+of)\s*(\d+\.?\d*)/i;
    const exponentMatch = message.match(exponentPattern);
    if (exponentMatch) {
        return {
            type: 'exponent',
            base: parseFloat(exponentMatch[1]),
            exponent: parseFloat(exponentMatch[2])
        };
    }

    // Pattern: Square root "sqrt(16)" or "square root of 16"
    const sqrtPattern = /(?:sqrt|square\s*root\s*(?:of)?)\s*\(?(\d+\.?\d*)\)?/i;
    const sqrtMatch = message.match(sqrtPattern);
    if (sqrtMatch) {
        return {
            type: 'sqrt',
            value: parseFloat(sqrtMatch[1])
        };
    }

    // Last resort: scan for any embedded arithmetic with symbolic operators (e.g. "So 3 × 12 is what?")
    const embeddedArithmeticPattern = /(\d+\.?\d*)\s*([×÷+\-*/])\s*(\d+\.?\d*)/;
    const embeddedMatch = message.match(embeddedArithmeticPattern);
    if (embeddedMatch) {
        return {
            type: 'arithmetic',
            left: parseFloat(embeddedMatch[1]),
            operator: embeddedMatch[2],
            right: parseFloat(embeddedMatch[3])
        };
    }

    return null;
}

/**
 * Helper: detect natural-language arithmetic in an expression string.
 * Used when a "what is ..." pattern extracts an expression that contains
 * word operators like "times", "plus", "minus", "divided by".
 */
function detectNaturalLanguageArithmetic(expr) {
    const timesMatch = expr.match(/(\d+\.?\d*)\s+(?:times|multiplied\s+by)\s+(\d+\.?\d*)/i);
    if (timesMatch) {
        return { type: 'arithmetic', left: parseFloat(timesMatch[1]), operator: '*', right: parseFloat(timesMatch[2]) };
    }
    const multiplyMatch = expr.match(/multiply\s+(\d+\.?\d*)\s+(?:by|and)\s+(\d+\.?\d*)/i);
    if (multiplyMatch) {
        return { type: 'arithmetic', left: parseFloat(multiplyMatch[1]), operator: '*', right: parseFloat(multiplyMatch[2]) };
    }
    // "X x Y" — lowercase "x" as multiplication (spaces required to avoid algebraic variable)
    const letterXMatch = expr.match(/(\d+\.?\d*)\s+x\s+(\d+\.?\d*)/i);
    if (letterXMatch) {
        return { type: 'arithmetic', left: parseFloat(letterXMatch[1]), operator: '*', right: parseFloat(letterXMatch[2]) };
    }
    const dividedByMatch = expr.match(/(\d+\.?\d*)\s+divided\s+by\s+(\d+\.?\d*)/i);
    if (dividedByMatch) {
        return { type: 'arithmetic', left: parseFloat(dividedByMatch[1]), operator: '/', right: parseFloat(dividedByMatch[2]) };
    }
    const plusMatch = expr.match(/(\d+\.?\d*)\s+plus\s+(\d+\.?\d*)/i);
    if (plusMatch) {
        return { type: 'arithmetic', left: parseFloat(plusMatch[1]), operator: '+', right: parseFloat(plusMatch[2]) };
    }
    const minusMatch = expr.match(/(\d+\.?\d*)\s+minus\s+(\d+\.?\d*)/i);
    if (minusMatch) {
        return { type: 'arithmetic', left: parseFloat(minusMatch[1]), operator: '-', right: parseFloat(minusMatch[2]) };
    }
    return null;
}

/**
 * Solve a detected math problem
 * @param {Object} problem - Problem object from detectMathProblem
 * @returns {Object} Solution with answer and steps
 */
function solveProblem(problem) {
    if (!problem) {
        return { success: false, error: 'No problem detected' };
    }

    try {
        switch (problem.type) {
            case 'arithmetic':
                return solveArithmetic(problem);
            case 'linear_equation':
                return solveLinearEquation(problem);
            case 'general_linear':
                return solveGeneralLinear(problem);
            case 'system_of_equations':
                return solveSystem(problem);
            case 'quadratic_equation':
                return solveQuadratic(problem);
            case 'slope':
                return solveSlope(problem);
            case 'expand_polynomial':
                return solveExpandPolynomial(problem);
            case 'factor_quadratic':
                return solveFactorQuadratic(problem);
            case 'factor_diff_of_squares':
                return solveFactorDiffOfSquares(problem);
            case 'fraction_arithmetic':
                return solveFractionArithmetic(problem);
            case 'percentage':
                return solvePercentage(problem);
            case 'exponent':
                return solveExponent(problem);
            case 'sqrt':
                return solveSqrt(problem);
            case 'angle_conversion':
                return solveAngleConversion(problem);
            case 'logarithm':
                return solveLogarithm(problem);
            case 'exponential_equation':
                return solveExponentialEquation(problem);
            case 'distance':
                return solveDistance(problem);
            case 'midpoint':
                return solveMidpoint(problem);
            case 'absolute_value_equation':
                return solveAbsoluteValue(problem);
            case 'statistics':
                return solveStatistics(problem);
            case 'probability':
                return solveProbability(problem);
            case 'proportion':
                return solveProportion(problem);
            case 'circle':
                return solveCircle(problem);
            case 'volume':
                return solveVolume(problem);
            case 'evaluation':
                return solveEvaluation(problem);
            case 'substitution':
                return solveSubstitution(problem);
            case 'derivative':
                return solveDerivative(problem);
            case 'limit':
                return solveLimit(problem);
            default:
                return { success: false, error: 'Unknown problem type' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Solve basic arithmetic
 */
function solveArithmetic(problem) {
    const { left, operator, right } = problem;
    let answer;

    switch (operator) {
        case '+':
            answer = left + right;
            break;
        case '-':
            answer = left - right;
            break;
        case '*':
        case '×':
            answer = left * right;
            break;
        case '/':
        case '÷':
            if (right === 0) {
                return { success: false, error: 'Division by zero' };
            }
            answer = left / right;
            break;
        default:
            return { success: false, error: 'Unknown operator' };
    }

    return {
        success: true,
        answer: formatNumber(answer),
        steps: [`${left} ${operator} ${right} = ${formatNumber(answer)}`]
    };
}

/**
 * Solve linear equation ax + b = c
 */
function solveLinearEquation(problem) {
    const { coefficient, operator, constant, result } = problem;

    // ax + b = c  =>  x = (c - b) / a
    // ax - b = c  =>  x = (c + b) / a
    const adjustedConstant = operator === '+' ? constant : -constant;
    const x = (result - adjustedConstant) / coefficient;

    return {
        success: true,
        answer: formatNumber(x),
        steps: [
            `${coefficient}x ${operator} ${constant} = ${result}`,
            `${coefficient}x = ${result} ${operator === '+' ? '-' : '+'} ${constant}`,
            `${coefficient}x = ${formatNumber(result - adjustedConstant)}`,
            `x = ${formatNumber(x)}`
        ]
    };
}

/**
 * Parse a linear expression into { xCoeff, constant } after distributing and combining.
 * Handles: "3(x+2) - 5", "2x + 3", "-x + 7", "3x + 5", "10", etc.
 * Returns { xCoeff, constant } or null if unparseable.
 */
function parseLinearExpression(expr) {
    if (!expr) return null;

    let s = expr.replace(/\s+/g, '');
    // Normalize: insert '+' before unary '-' for splitting, but not at start or after '('
    // e.g. "3x-5" → split-friendly

    // Step 1: Expand distribution patterns like "3(x+2)" or "-2(x-4)"
    // Handles nested: a(bx + c) → abx + ac
    let expanded = s;
    const distPattern = /(-?\d*\.?\d*)\(([^)]+)\)/g;
    let safety = 0;
    while (distPattern.test(expanded) && safety < 10) {
        safety++;
        expanded = expanded.replace(/(-?\d*\.?\d*)\(([^)]+)\)/g, (match, coeffStr, inner) => {
            const coeff = coeffStr === '' || coeffStr === '+' ? 1 : coeffStr === '-' ? -1 : parseFloat(coeffStr);
            // Parse inner as terms and multiply each by coeff
            const terms = splitIntoTerms(inner);
            return terms.map(t => {
                const parsed = parseSingleTerm(t);
                if (!parsed) return t;
                if (parsed.hasX) {
                    const newCoeff = parsed.coefficient * coeff;
                    return (newCoeff >= 0 ? '+' : '') + newCoeff + 'x';
                } else {
                    const newConst = parsed.value * coeff;
                    return (newConst >= 0 ? '+' : '') + newConst;
                }
            }).join('');
        });
        distPattern.lastIndex = 0;
    }

    // Step 2: Split into terms and combine
    const terms = splitIntoTerms(expanded);
    let xCoeff = 0;
    let constant = 0;

    for (const term of terms) {
        const parsed = parseSingleTerm(term);
        if (!parsed) return null; // Unparseable term
        if (parsed.hasX) {
            xCoeff += parsed.coefficient;
        } else {
            constant += parsed.value;
        }
    }

    return { xCoeff, constant };
}

/**
 * Split an expression string into signed terms.
 * "3x-5+2x" → ["3x", "-5", "+2x"]
 * "+3x-5" → ["+3x", "-5"]
 */
function splitIntoTerms(expr) {
    const terms = [];
    // Match terms: optional sign, then digits/x/decimal
    const termRegex = /([+-]?)(\d*\.?\d*)(x?)/g;
    let m;
    let pos = 0;

    // Use a simpler approach: split on + and - while preserving the sign
    const normalized = expr.replace(/^\+/, ''); // strip leading +
    const parts = normalized.match(/[+-]?[^+-]+/g);
    return parts || [];
}

/**
 * Parse a single term like "3x", "-5", "x", "-x", "0.5x", "12"
 * Returns { hasX, coefficient, value } or null
 */
function parseSingleTerm(term) {
    const t = term.trim();
    if (!t) return null;

    // Term with x
    const xMatch = t.match(/^([+-]?\d*\.?\d*)x$/);
    if (xMatch) {
        let coeff = xMatch[1];
        if (coeff === '' || coeff === '+') coeff = 1;
        else if (coeff === '-') coeff = -1;
        else coeff = parseFloat(coeff);
        return { hasX: true, coefficient: coeff, value: 0 };
    }

    // Constant term
    const numMatch = t.match(/^([+-]?\d+\.?\d*)$/);
    if (numMatch) {
        return { hasX: false, coefficient: 0, value: parseFloat(numMatch[1]) };
    }

    return null;
}

/**
 * Solve a general linear equation by comparing simplified left and right sides.
 * Handles multi-step equations and variables on both sides.
 */
function solveGeneralLinear(problem) {
    const { left, right, leftExpr, rightExpr } = problem;

    // left.xCoeff * x + left.constant = right.xCoeff * x + right.constant
    // (left.xCoeff - right.xCoeff) * x = right.constant - left.constant
    const xCoeff = left.xCoeff - right.xCoeff;
    const constDiff = right.constant - left.constant;

    if (xCoeff === 0) {
        if (Math.abs(constDiff) < 0.0001) {
            return { success: true, answer: 'All real numbers (identity)', steps: ['Both sides simplify to the same expression'] };
        }
        return { success: true, answer: 'No solution (contradiction)', steps: ['The equation simplifies to a false statement'] };
    }

    const x = constDiff / xCoeff;
    const steps = [`${leftExpr} = ${rightExpr}`];

    // Show simplified form if different from input
    const leftSimp = `${left.xCoeff !== 0 ? left.xCoeff + 'x' : ''}${left.constant !== 0 ? (left.constant > 0 && left.xCoeff !== 0 ? '+' : '') + left.constant : ''}`;
    const rightSimp = `${right.xCoeff !== 0 ? right.xCoeff + 'x' : ''}${right.constant !== 0 ? (right.constant > 0 && right.xCoeff !== 0 ? '+' : '') + right.constant : ''}`;

    if (leftSimp !== leftExpr || rightSimp !== rightExpr) {
        steps.push(`Simplify: ${leftSimp || '0'} = ${rightSimp || '0'}`);
    }

    if (right.xCoeff !== 0 && left.xCoeff !== 0) {
        steps.push(`Move x terms: ${xCoeff}x = ${formatNumber(constDiff)}`);
    }

    steps.push(`x = ${formatNumber(x)}`);

    return {
        success: true,
        answer: formatNumber(x),
        steps,
    };
}

/**
 * Detect a system of two linear equations in a message.
 * Handles: "2x + y = 5 and x - y = 1", "solve the system: 2x + y = 5, x - y = 1"
 * Returns a problem object or null.
 */
function detectSystem(message) {
    // Strip preamble like "solve the system:", "solve:", etc.
    const cleaned = message.replace(/^.*?(?:solve\s+(?:the\s+)?(?:system|equations?)\s*:?\s*|find\s+x\s+and\s+y\s*:?\s*)/i, '').trim();

    // Try splitting on: "and", comma, semicolon, or newline
    const separators = [/\s+and\s+/i, /\s*,\s*/, /\s*;\s*/, /\s*\n\s*/];
    for (const sep of separators) {
        const parts = cleaned.split(sep);
        if (parts.length === 2) {
            const eq1 = parseSystemEquation(parts[0].trim());
            const eq2 = parseSystemEquation(parts[1].trim());
            if (eq1 && eq2) {
                return {
                    type: 'system_of_equations',
                    eq1,
                    eq2,
                    eq1Text: parts[0].trim(),
                    eq2Text: parts[1].trim(),
                };
            }
        }
    }
    return null;
}

/**
 * Parse a single equation in a system into { xCoeff, yCoeff, constant }.
 * Handles: "2x + y = 5", "x - y = 1", "3x + 2y = 12", "-x + 4y = 7", "y = 2x + 3"
 * Returns coefficients such that xCoeff*x + yCoeff*y = constant, or null.
 */
function parseSystemEquation(eq) {
    const sides = eq.split('=');
    if (sides.length !== 2) return null;

    const left = parseLinearExpressionXY(sides[0].trim());
    const right = parseLinearExpressionXY(sides[1].trim());
    if (!left || !right) return null;

    // Move everything to left side: (left - right) = 0
    // So: (left.x - right.x)*x + (left.y - right.y)*y = right.const - left.const
    return {
        xCoeff: left.xCoeff - right.xCoeff,
        yCoeff: left.yCoeff - right.yCoeff,
        constant: right.constant - left.constant,
    };
}

/**
 * Parse a linear expression with both x and y variables.
 * Returns { xCoeff, yCoeff, constant } or null.
 */
function parseLinearExpressionXY(expr) {
    if (!expr) return null;

    const s = expr.replace(/\s+/g, '');
    const parts = s.match(/[+-]?[^+-]+/g);
    if (!parts) return null;

    let xCoeff = 0, yCoeff = 0, constant = 0;

    for (const part of parts) {
        const t = part.trim();
        if (!t) continue;

        // Term with x
        const xMatch = t.match(/^([+-]?\d*\.?\d*)x$/i);
        if (xMatch) {
            let c = xMatch[1];
            if (c === '' || c === '+') c = 1;
            else if (c === '-') c = -1;
            else c = parseFloat(c);
            xCoeff += c;
            continue;
        }

        // Term with y
        const yMatch = t.match(/^([+-]?\d*\.?\d*)y$/i);
        if (yMatch) {
            let c = yMatch[1];
            if (c === '' || c === '+') c = 1;
            else if (c === '-') c = -1;
            else c = parseFloat(c);
            yCoeff += c;
            continue;
        }

        // Constant term
        const numMatch = t.match(/^([+-]?\d+\.?\d*)$/);
        if (numMatch) {
            constant += parseFloat(numMatch[1]);
            continue;
        }

        return null; // Unparseable term
    }

    return { xCoeff, yCoeff, constant };
}

/**
 * Solve a system of two linear equations using elimination.
 * eq1: a1*x + b1*y = c1
 * eq2: a2*x + b2*y = c2
 */
function solveSystem(problem) {
    const { eq1, eq2, eq1Text, eq2Text } = problem;
    const { xCoeff: a1, yCoeff: b1, constant: c1 } = eq1;
    const { xCoeff: a2, yCoeff: b2, constant: c2 } = eq2;

    const det = a1 * b2 - a2 * b1;

    if (det === 0) {
        // Check if consistent (infinite solutions) or inconsistent (no solution)
        if (Math.abs(a1 * c2 - a2 * c1) < 0.0001) {
            return { success: true, answer: 'Infinitely many solutions (dependent system)', steps: ['The equations are multiples of each other'] };
        }
        return { success: true, answer: 'No solution (inconsistent system)', steps: ['The equations are parallel — no intersection'] };
    }

    const x = (c1 * b2 - c2 * b1) / det;
    const y = (a1 * c2 - a2 * c1) / det;

    return {
        success: true,
        answer: `x = ${formatNumber(x)}, y = ${formatNumber(y)}`,
        steps: [
            `${eq1Text}`,
            `${eq2Text}`,
            `Using elimination:`,
            `x = ${formatNumber(x)}`,
            `y = ${formatNumber(y)}`,
        ],
    };
}

/**
 * Solve quadratic equation ax² + bx + c = 0
 */
/**
 * Calculate slope between two points: (y2-y1)/(x2-x1)
 */
function solveSlope(problem) {
    const { x1, y1, x2, y2 } = problem;

    if (x1 === x2) {
        return {
            success: true,
            answer: 'undefined',
            steps: [
                `Points: (${x1}, ${y1}) and (${x2}, ${y2})`,
                `slope = (${y2} - ${y1}) / (${x2} - ${x1}) = ${y2 - y1} / 0`,
                `Vertical line — slope is undefined`,
            ],
        };
    }

    const rise = y2 - y1;
    const run = x2 - x1;
    const gcd = greatestCommonDivisor(Math.abs(rise), Math.abs(run));
    const simplifiedRise = rise / gcd;
    const simplifiedRun = run / gcd;

    // Express as fraction if not a whole number
    const isWhole = simplifiedRun === 1 || simplifiedRun === -1;
    const answer = isWhole
        ? formatNumber(simplifiedRise * (simplifiedRun < 0 ? -1 : 1))
        : `${simplifiedRun < 0 ? -simplifiedRise : simplifiedRise}/${Math.abs(simplifiedRun)}`;

    return {
        success: true,
        answer,
        steps: [
            `Points: (${x1}, ${y1}) and (${x2}, ${y2})`,
            `slope = (${y2} - ${y1}) / (${x2} - ${x1})`,
            `slope = ${rise} / ${run}`,
            `slope = ${answer}`,
        ],
    };
}

function solveQuadratic(problem) {
    let { a, bSign, b, cSign, c } = problem;

    // Apply signs
    b = bSign === '-' ? -b : b;
    c = cSign === '-' ? -c : c;

    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
        return {
            success: true,
            answer: 'No real solutions',
            steps: [
                `Using quadratic formula: x = (-b ± √(b²-4ac)) / 2a`,
                `Discriminant = ${b}² - 4(${a})(${c}) = ${discriminant}`,
                `Since discriminant < 0, no real solutions exist`
            ]
        };
    }

    const sqrtDisc = Math.sqrt(discriminant);
    const x1 = (-b + sqrtDisc) / (2 * a);
    const x2 = (-b - sqrtDisc) / (2 * a);

    if (discriminant === 0) {
        return {
            success: true,
            answer: formatNumber(x1),
            steps: [
                `Using quadratic formula: x = (-b ± √(b²-4ac)) / 2a`,
                `Discriminant = ${discriminant} (perfect square)`,
                `x = ${formatNumber(x1)} (double root)`
            ]
        };
    }

    return {
        success: true,
        answer: `x = ${formatNumber(x1)} or x = ${formatNumber(x2)}`,
        steps: [
            `Using quadratic formula: x = (-b ± √(b²-4ac)) / 2a`,
            `Discriminant = ${formatNumber(discriminant)}`,
            `x₁ = ${formatNumber(x1)}`,
            `x₂ = ${formatNumber(x2)}`
        ]
    };
}

/**
 * Solve factoring of a quadratic trinomial ax² + bx + c
 * For a=1: find two numbers that add to b and multiply to c
 * For a≠1: use the ac-method or trial factors
 */
/**
 * Expand a polynomial product like (2x+3)(x-4) to standard form.
 * Uses the existing expandFactoredForm machinery.
 */
function solveExpandPolynomial(problem) {
    const { factored, expression } = problem;
    const coeffs = expandFactoredForm(factored);

    if (!coeffs) {
        return { success: false, error: 'Could not expand polynomial' };
    }

    // Build standard form string from coefficients [a, b, c, ...]
    // For degree 2: ax² + bx + c
    const terms = [];
    const degree = coeffs.length - 1;
    for (let i = 0; i <= degree; i++) {
        const coeff = coeffs[i];
        if (coeff === 0) continue;

        const power = degree - i;
        let termStr;
        if (power === 0) {
            termStr = `${Math.abs(coeff)}`;
        } else if (power === 1) {
            termStr = Math.abs(coeff) === 1 ? 'x' : `${Math.abs(coeff)}x`;
        } else {
            termStr = Math.abs(coeff) === 1 ? `x^${power}` : `${Math.abs(coeff)}x^${power}`;
        }

        if (terms.length === 0) {
            terms.push(coeff < 0 ? `-${termStr}` : termStr);
        } else {
            terms.push(coeff < 0 ? `- ${termStr}` : `+ ${termStr}`);
        }
    }

    const answer = terms.join(' ') || '0';

    return {
        success: true,
        answer,
        steps: [
            `Expand ${expression}`,
            `= ${answer}`,
        ],
    };
}

/**
 * Factor a difference of squares: ax² - c = (√a·x + √c)(√a·x - √c)
 * Only works when both a and c are perfect squares.
 */
function solveFactorDiffOfSquares(problem) {
    const { a, c } = problem;

    const sqrtA = Math.sqrt(a);
    const sqrtC = Math.sqrt(c);

    if (!Number.isInteger(sqrtA) || !Number.isInteger(sqrtC)) {
        return {
            success: true,
            answer: 'Not factorable as difference of squares (not perfect squares)',
            steps: [`${a}x² - ${c}: ${a} and/or ${c} are not perfect squares`],
        };
    }

    const xCoeffStr = sqrtA === 1 ? 'x' : `${sqrtA}x`;
    const answer = `(${xCoeffStr}+${sqrtC})(${xCoeffStr}-${sqrtC})`;

    return {
        success: true,
        answer,
        steps: [
            `${a === 1 ? '' : a}x² - ${c} is a difference of squares`,
            `√${a === 1 ? '' : a + '·'}x² = ${xCoeffStr}, √${c} = ${sqrtC}`,
            `= ${answer}`,
        ],
    };
}

function solveFactorQuadratic(problem) {
    let { a, bSign, b, cSign, c } = problem;

    // Apply signs
    b = bSign === '-' ? -b : b;
    c = cSign === '-' ? -c : c;

    if (a === 1) {
        // Simple case: find p, q where p + q = b and p * q = c
        const factors = findFactorPair(c, b);
        if (!factors) {
            return {
                success: true,
                answer: 'Not factorable over the integers',
                steps: [`No integer pair adds to ${b} and multiplies to ${c}`]
            };
        }

        const [p, q] = factors;
        const answer = formatBinomialProduct(1, p, 1, q);
        return {
            success: true,
            answer,
            steps: [
                `Find two numbers that add to ${b} and multiply to ${c}`,
                `${p} + ${q} = ${b} ✓`,
                `${p} × ${q} = ${c} ✓`,
                `= ${answer}`
            ]
        };
    }

    // General case a ≠ 1: find factors of a*c that add to b
    const ac = a * c;
    const factors = findFactorPair(ac, b);
    if (!factors) {
        return {
            success: true,
            answer: 'Not factorable over the integers',
            steps: [`No integer pair adds to ${b} and multiplies to ${ac}`]
        };
    }

    const [p, q] = factors;
    // Factor by grouping: ax² + px + qx + c
    // Group: (ax² + px) + (qx + c)
    const g1 = greatestCommonDivisor(Math.abs(a), Math.abs(p));
    const g2 = greatestCommonDivisor(Math.abs(q), Math.abs(c));

    // The common binomial factor and outer factors
    const innerA = a / g1;
    const innerP = p / g1;

    const answer = formatBinomialProduct(g1, q / (innerA || 1), innerA, innerP);

    // For a≠1, use a more robust approach: try all factor pairs of a and c
    const result = factorGeneralTrinomial(a, b, c);
    if (result) {
        return {
            success: true,
            answer: result.answer,
            steps: result.steps
        };
    }

    return {
        success: true,
        answer: 'Not factorable over the integers',
        steps: [`Could not factor ${a}x² + ${b}x + ${c} over the integers`]
    };
}

/**
 * Find two integers that add to targetSum and multiply to targetProduct.
 * Returns [p, q] sorted ascending, or null if no such pair exists.
 */
function findFactorPair(targetProduct, targetSum) {
    const absProduct = Math.abs(targetProduct);
    for (let i = 0; i <= absProduct; i++) {
        if (absProduct === 0 && i > 0) break;
        if (i !== 0 && absProduct % i !== 0) continue;

        const j = absProduct === 0 ? 0 : absProduct / i;

        // Try all sign combinations
        const pairs = [[i, j], [-i, -j], [i, -j], [-i, j]];
        for (const [p, q] of pairs) {
            if (p * q === targetProduct && p + q === targetSum) {
                // Return sorted so smaller absolute value first (canonical order)
                return p <= q ? [p, q] : [q, p];
            }
        }
    }
    return null;
}

/**
 * Factor a general trinomial ax² + bx + c by trying all factor pairs.
 */
function factorGeneralTrinomial(a, b, c) {
    // For a=1, simple case
    if (a === 1) {
        const factors = findFactorPair(c, b);
        if (!factors) return null;

        const [p, q] = factors;
        const answer = formatBinomialProduct(1, p, 1, q);
        return {
            answer,
            steps: [
                `Find two numbers that add to ${b} and multiply to ${c}`,
                `${p} + ${q} = ${b} ✓`,
                `${p} × ${q} = ${c} ✓`,
                `= ${answer}`
            ]
        };
    }

    // Try all factor pairs of a and c
    const aFactors = getFactorPairs(Math.abs(a));
    const cFactors = getFactorPairs(Math.abs(c));

    for (const [a1, a2] of aFactors) {
        for (const [c1, c2] of cFactors) {
            // Try (a1*x + c1)(a2*x + c2) — check if outer+inner = b
            // Also try sign variations
            const signedC = c < 0
                ? [[c1, -c2], [-c1, c2]]
                : (c >= 0 ? [[c1, c2], [-c1, -c2]] : [[c1, c2]]);

            for (const [sc1, sc2] of signedC) {
                if (a1 * sc2 + a2 * sc1 === b) {
                    const sA = a < 0 ? -1 : 1;
                    const answer = formatBinomialProduct(sA * a1, sc1, a2, sc2);
                    return {
                        answer,
                        steps: [
                            `Factor ${a}x² + ${b}x + ${c}`,
                            `= ${answer}`
                        ]
                    };
                }
            }
        }
    }

    return null;
}

/**
 * Get all factor pairs of a positive integer n.
 * Returns pairs [a, b] where a * b = n and a <= b.
 */
function getFactorPairs(n) {
    if (n === 0) return [[0, 0]];
    const pairs = [];
    for (let i = 1; i <= Math.sqrt(n); i++) {
        if (n % i === 0) {
            pairs.push([i, n / i]);
        }
    }
    return pairs;
}

/**
 * Format a binomial product like (ax + p)(bx + q).
 * Handles signs and coefficients of 1 correctly.
 */
function formatBinomialProduct(a, p, b, q) {
    const formatTerm = (coeff, constant) => {
        const xPart = coeff === 1 ? 'x' : coeff === -1 ? '-x' : `${coeff}x`;
        if (constant === 0) return `(${xPart})`;
        const sign = constant > 0 ? '+' : '-';
        return `(${xPart}${sign}${Math.abs(constant)})`;
    };
    return `${formatTerm(a, p)}${formatTerm(b, q)}`;
}

/**
 * Solve fraction arithmetic
 */
function solveFractionArithmetic(problem) {
    const { leftNum, leftDen, operator, rightNum, rightDen } = problem;

    let resultNum, resultDen;

    switch (operator) {
        case '+':
            resultNum = leftNum * rightDen + rightNum * leftDen;
            resultDen = leftDen * rightDen;
            break;
        case '-':
            resultNum = leftNum * rightDen - rightNum * leftDen;
            resultDen = leftDen * rightDen;
            break;
        case '*':
            resultNum = leftNum * rightNum;
            resultDen = leftDen * rightDen;
            break;
        case '/':
            resultNum = leftNum * rightDen;
            resultDen = leftDen * rightNum;
            break;
        default:
            return { success: false, error: 'Unknown operator' };
    }

    // Simplify fraction
    const gcd = greatestCommonDivisor(Math.abs(resultNum), Math.abs(resultDen));
    resultNum = resultNum / gcd;
    resultDen = resultDen / gcd;

    // Handle negative denominator
    if (resultDen < 0) {
        resultNum = -resultNum;
        resultDen = -resultDen;
    }

    const answer = resultDen === 1 ? `${resultNum}` : `${resultNum}/${resultDen}`;

    return {
        success: true,
        answer,
        steps: [
            `${leftNum}/${leftDen} ${operator} ${rightNum}/${rightDen}`,
            `= ${answer}`
        ]
    };
}

/**
 * Solve percentage problem
 */
function solvePercentage(problem) {
    const { percent, whole } = problem;
    const answer = (percent / 100) * whole;

    return {
        success: true,
        answer: formatNumber(answer),
        steps: [
            `${percent}% of ${whole}`,
            `= (${percent}/100) × ${whole}`,
            `= ${formatNumber(answer)}`
        ]
    };
}

/**
 * Solve exponent
 */
function solveExponent(problem) {
    const { base, exponent } = problem;
    const answer = Math.pow(base, exponent);

    return {
        success: true,
        answer: formatNumber(answer),
        steps: [
            `${base}^${exponent} = ${formatNumber(answer)}`
        ]
    };
}

/**
 * Solve square root
 */
function solveSqrt(problem) {
    const { value } = problem;
    const answer = Math.sqrt(value);

    // Check if perfect square
    const isPerfect = Number.isInteger(answer);

    return {
        success: true,
        answer: formatNumber(answer),
        isPerfectSquare: isPerfect,
        steps: isPerfect
            ? [`√${value} = ${answer}`]
            : [`√${value} ≈ ${formatNumber(answer)}`]
    };
}

/**
 * Attempt to evaluate a general expression
 */
/**
 * Convert between degrees and radians.
 */
function solveAngleConversion(problem) {
    const { direction } = problem;

    if (direction === 'deg_to_rad') {
        const deg = problem.value;
        // Simplify as fraction of π: deg/180 * π
        const g = greatestCommonDivisor(Math.abs(deg), 180);
        const num = deg / g;
        const den = 180 / g;
        let answer;
        if (den === 1) {
            answer = num === 1 ? 'π' : num === -1 ? '-π' : `${num}π`;
        } else if (num === 1) {
            answer = `π/${den}`;
        } else if (num === -1) {
            answer = `-π/${den}`;
        } else {
            answer = `${num}π/${den}`;
        }
        return {
            success: true,
            answer,
            steps: [`${deg}° × (π/180)`, `= ${deg}/180 × π`, `= ${answer}`],
        };
    }

    if (direction === 'rad_to_deg') {
        const { piCoeff, divisor } = problem;
        const deg = (piCoeff / divisor) * 180;
        const piStr = piCoeff === 1 ? 'π' : piCoeff === -1 ? '-π' : `${piCoeff}π`;
        const radStr = divisor === 1 ? piStr : `${piStr}/${divisor}`;
        return {
            success: true,
            answer: formatNumber(deg) + '°',
            steps: [`${radStr} × (180/π)`, `= ${formatNumber(piCoeff / divisor)} × 180`, `= ${formatNumber(deg)}°`],
        };
    }

    if (direction === 'num_rad_to_deg') {
        const rad = problem.value;
        const deg = rad * (180 / Math.PI);
        return {
            success: true,
            answer: formatNumber(deg) + '°',
            steps: [`${rad} rad × (180/π)`, `= ${formatNumber(deg)}°`],
        };
    }

    return { success: false, error: 'Unknown angle conversion direction' };
}

/**
 * Evaluate a logarithm: log_b(x) = y where b^y = x
 */
function solveLogarithm(problem) {
    const { base, argument } = problem;

    if (argument <= 0) {
        return { success: true, answer: 'undefined', steps: [`log of a non-positive number is undefined`] };
    }
    if (base <= 0 || base === 1) {
        return { success: true, answer: 'undefined', steps: [`log base must be positive and ≠ 1`] };
    }

    const result = Math.log(argument) / Math.log(base);
    const isNatural = Math.abs(base - Math.E) < 0.0001;
    const baseStr = isNatural ? 'e' : `${base}`;
    const logStr = isNatural ? `ln(${argument})` : base === 10 ? `log(${argument})` : `log_${base}(${argument})`;

    // Check if result is a clean integer
    const rounded = Math.round(result);
    const isInteger = Math.abs(result - rounded) < 0.0001;
    const answer = isInteger ? formatNumber(rounded) : formatNumber(result);

    return {
        success: true,
        answer,
        steps: [
            `${logStr}`,
            `${baseStr}^? = ${argument}`,
            `${baseStr}^${answer} = ${argument}`,
            `${logStr} = ${answer}`,
        ],
    };
}

/**
 * Solve a simple exponential equation: b^x = c
 * Uses logarithms: x = log(c) / log(b)
 */
function solveExponentialEquation(problem) {
    const { base, result } = problem;

    if (base <= 0 || base === 1 || result <= 0) {
        return { success: true, answer: 'No solution', steps: ['Invalid base or result for exponential equation'] };
    }

    const x = Math.log(result) / Math.log(base);
    const rounded = Math.round(x);
    const isInteger = Math.abs(x - rounded) < 0.0001;
    const answer = isInteger ? formatNumber(rounded) : formatNumber(x);

    return {
        success: true,
        answer,
        steps: [
            `${base}^x = ${result}`,
            `x = log(${result}) / log(${base})`,
            `x = ${answer}`,
        ],
    };
}

/**
 * Calculate distance between two points.
 */
function solveDistance(problem) {
    const { x1, y1, x2, y2 } = problem;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distSquared = dx * dx + dy * dy;
    const dist = Math.sqrt(distSquared);

    // Check if it simplifies to a clean number
    const rounded = Math.round(dist * 10000) / 10000;
    const isInteger = Math.abs(dist - Math.round(dist)) < 0.0001;

    // Try to express as simplified radical: √n or a√b
    let answer;
    if (isInteger) {
        answer = formatNumber(Math.round(dist));
    } else {
        // Check if distSquared is an integer for radical form
        if (Number.isInteger(distSquared)) {
            const simplified = simplifyRadical(distSquared);
            answer = simplified;
        } else {
            answer = formatNumber(rounded);
        }
    }

    return {
        success: true,
        answer,
        steps: [
            `Points: (${x1}, ${y1}) and (${x2}, ${y2})`,
            `d = √((${x2}-${x1})² + (${y2}-${y1})²)`,
            `d = √(${dx}² + ${dy}²)`,
            `d = √(${distSquared})`,
            `d = ${answer}`,
        ],
    };
}

/**
 * Simplify √n into a√b form or integer.
 */
function simplifyRadical(n) {
    if (n < 0) return `√(${n})`;
    const sqrt = Math.sqrt(n);
    if (Number.isInteger(sqrt)) return `${sqrt}`;

    // Factor out perfect squares
    let outside = 1;
    let inside = n;
    for (let i = 2; i * i <= inside; i++) {
        while (inside % (i * i) === 0) {
            outside *= i;
            inside /= (i * i);
        }
    }

    if (outside === 1) return `√${n}`;
    if (inside === 1) return `${outside}`;
    return `${outside}√${inside}`;
}

/**
 * Calculate midpoint between two points.
 */
function solveMidpoint(problem) {
    const { x1, y1, x2, y2 } = problem;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;

    return {
        success: true,
        answer: `(${formatNumber(mx)}, ${formatNumber(my)})`,
        steps: [
            `Points: (${x1}, ${y1}) and (${x2}, ${y2})`,
            `midpoint = ((${x1}+${x2})/2, (${y1}+${y2})/2)`,
            `midpoint = (${formatNumber(mx)}, ${formatNumber(my)})`,
        ],
    };
}

/**
 * Solve absolute value equation |ax + b| = c
 * Two cases: ax + b = c and ax + b = -c
 */
function solveAbsoluteValue(problem) {
    const { coefficient, operator, constant, result } = problem;

    if (result < 0) {
        return { success: true, answer: 'No solution', steps: ['Absolute value cannot equal a negative number'] };
    }

    if (result === 0) {
        const adjustedConst = operator === '+' ? constant : -constant;
        const x = -adjustedConst / coefficient;
        return {
            success: true,
            answer: `x = ${formatNumber(x)}`,
            steps: [`|${coefficient}x ${operator} ${constant}| = 0`, `${coefficient}x ${operator} ${constant} = 0`, `x = ${formatNumber(x)}`],
        };
    }

    const adjustedConst = operator === '+' ? constant : -constant;

    // Case 1: ax + b = result
    const x1 = (result - adjustedConst) / coefficient;
    // Case 2: ax + b = -result
    const x2 = (-result - adjustedConst) / coefficient;

    const smaller = Math.min(x1, x2);
    const larger = Math.max(x1, x2);

    return {
        success: true,
        answer: `x = ${formatNumber(smaller)} or x = ${formatNumber(larger)}`,
        steps: [
            `|${coefficient}x ${operator} ${constant}| = ${result}`,
            `Case 1: ${coefficient}x ${operator} ${constant} = ${result} → x = ${formatNumber(x1)}`,
            `Case 2: ${coefficient}x ${operator} ${constant} = -${result} → x = ${formatNumber(x2)}`,
            `x = ${formatNumber(smaller)} or x = ${formatNumber(larger)}`,
        ],
    };
}

/**
 * Solve mean, median, mode, or range of a data set.
 */
function solveStatistics(problem) {
    const { operation, data } = problem;
    const sorted = [...data].sort((a, b) => a - b);
    const n = sorted.length;

    switch (operation) {
        case 'mean':
        case 'average': {
            const sum = data.reduce((a, b) => a + b, 0);
            const mean = sum / n;
            return {
                success: true,
                answer: formatNumber(mean),
                steps: [
                    `Data: ${data.join(', ')}`,
                    `Sum = ${formatNumber(sum)}`,
                    `Mean = ${formatNumber(sum)} / ${n} = ${formatNumber(mean)}`,
                ],
            };
        }
        case 'median': {
            let median;
            if (n % 2 === 1) {
                median = sorted[Math.floor(n / 2)];
            } else {
                median = (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
            }
            return {
                success: true,
                answer: formatNumber(median),
                steps: [
                    `Sorted data: ${sorted.join(', ')}`,
                    n % 2 === 1
                        ? `Middle value (position ${Math.ceil(n / 2)}): ${formatNumber(median)}`
                        : `Average of positions ${n / 2} and ${n / 2 + 1}: (${sorted[n / 2 - 1]} + ${sorted[n / 2]}) / 2 = ${formatNumber(median)}`,
                ],
            };
        }
        case 'mode': {
            const freq = {};
            for (const v of data) freq[v] = (freq[v] || 0) + 1;
            const maxFreq = Math.max(...Object.values(freq));
            if (maxFreq === 1) {
                return { success: true, answer: 'No mode', steps: ['All values appear exactly once'] };
            }
            const modes = Object.entries(freq).filter(([, f]) => f === maxFreq).map(([v]) => Number(v)).sort((a, b) => a - b);
            return {
                success: true,
                answer: modes.join(', '),
                steps: [
                    `Data: ${data.join(', ')}`,
                    `${modes.length === 1 ? 'Mode' : 'Modes'}: ${modes.join(', ')} (appears ${maxFreq} times)`,
                ],
            };
        }
        case 'range': {
            const range = sorted[n - 1] - sorted[0];
            return {
                success: true,
                answer: formatNumber(range),
                steps: [
                    `Sorted data: ${sorted.join(', ')}`,
                    `Range = ${sorted[n - 1]} - ${sorted[0]} = ${formatNumber(range)}`,
                ],
            };
        }
        default:
            return { success: false, error: `Unknown statistics operation: ${operation}` };
    }
}

// ── Probability detection and solving ──

// Standard deck knowledge
const DECK = {
  total: 52,
  suits: { heart: 13, hearts: 13, diamond: 13, diamonds: 13, club: 13, clubs: 13, spade: 13, spades: 13 },
  colors: { red: 26, black: 26 },
  ranks: {
    ace: 4, aces: 4, king: 4, kings: 4, queen: 4, queens: 4, jack: 4, jacks: 4,
    '2': 4, '3': 4, '4': 4, '5': 4, '6': 4, '7': 4, '8': 4, '9': 4, '10': 4,
    two: 4, three: 4, four: 4, five: 4, six: 4, seven: 4, eight: 4, nine: 4, ten: 4,
  },
  categories: {
    'face card': 12, 'face cards': 12,
    'number card': 36, 'number cards': 36, 'numbered card': 36,
    'even': 20, 'odd': 16, // 2,4,6,8,10 × 4 = 20; 3,5,7,9 × 4 = 16 (aces aren't "even" or "odd")
  },
};

// Die knowledge
const DIE = { total: 6 };
const DIE_OUTCOMES = {
  '1': 1, '2': 1, '3': 1, '4': 1, '5': 1, '6': 1,
  one: 1, two: 1, three: 1, four: 1, five: 1, six: 1,
  even: 3, odd: 3, // {2,4,6} and {1,3,5}
  'prime': 3, // {2,3,5}
  'greater than 4': 2, 'less than 3': 2, 'greater than 3': 3, 'less than 4': 3,
  'greater than 2': 4, 'less than 5': 4, 'greater than 1': 5, 'less than 6': 5,
  'at least 3': 4, 'at most 4': 4, 'at least 2': 5, 'at most 5': 5,
};

// Coin knowledge
const COIN_OUTCOMES = { heads: 1, head: 1, tails: 1, tail: 1 };
const COIN_TOTAL = 2;

/**
 * Detect probability problems from AI-posed questions.
 * Handles: cards, dice, coins, marbles/balls with explicit counts,
 * and generic "N out of M" / "N favorable out of M total" patterns.
 */
function detectProbability(message) {
  const text = message.trim();
  const lower = text.toLowerCase();

  // ── P(X) notation: "P(heart)", "P(red)", "P(6)" ──
  const pNotation = lower.match(/p\s*\(\s*([^)]+)\s*\)/i);

  // ── Natural language: "probability of (drawing/getting/picking/rolling) a ___" ──
  const nlProb = lower.match(
    /(?:probability|chance|likelihood|odds)\s+(?:of\s+)?(?:drawing|getting|picking|choosing|selecting|pulling|rolling|flipping|landing\s+on)?\s*(?:a\s+)?(.+?)(?:\s+from\s+|\s+in\s+|\s+on\s+|\s+with\s+|\?|$)/i
  );

  // ── "What is P(X)?" fallback ──
  const whatIsP = lower.match(/what\s+is\s+p\s*\(\s*([^)]+)\s*\)/i);

  const outcome = (pNotation && pNotation[1]) || (whatIsP && whatIsP[1]) || (nlProb && nlProb[1]);
  if (!outcome) return null;

  const outcomeLower = outcome.trim().toLowerCase();

  // ── Standard deck context ──
  if (/\b(deck|card|cards|playing\s*card)\b/.test(lower)) {
    // Try categories first (e.g. "face card" before "card" matches a suit)
    for (const [name, count] of Object.entries(DECK.categories)) {
      if (outcomeLower.includes(name)) {
        return { type: 'probability', favorable: count, total: DECK.total, outcome: name, context: 'deck' };
      }
    }
    // Try suits
    for (const [name, count] of Object.entries(DECK.suits)) {
      if (outcomeLower.includes(name)) {
        return { type: 'probability', favorable: count, total: DECK.total, outcome: name, context: 'deck' };
      }
    }
    // Try colors
    for (const [name, count] of Object.entries(DECK.colors)) {
      if (outcomeLower.includes(name)) {
        return { type: 'probability', favorable: count, total: DECK.total, outcome: name, context: 'deck' };
      }
    }
    // Try ranks
    for (const [name, count] of Object.entries(DECK.ranks)) {
      if (outcomeLower.includes(name)) {
        return { type: 'probability', favorable: count, total: DECK.total, outcome: name, context: 'deck' };
      }
    }
  }

  // ── Die/dice context ──
  if (/\b(die|dice|roll|rolling)\b/.test(lower)) {
    // Normalize: strip articles and trailing "number" for matching
    const dieOutcome = outcomeLower.replace(/^an?\s+/, '').replace(/\s+number$/, '').trim();
    for (const [name, count] of Object.entries(DIE_OUTCOMES)) {
      if (dieOutcome === name) {
        return { type: 'probability', favorable: count, total: DIE.total, outcome: name, context: 'die' };
      }
    }
    // Single digit on a die
    const dieDigit = dieOutcome.match(/^(\d)$/);
    if (dieDigit && parseInt(dieDigit[1]) >= 1 && parseInt(dieDigit[1]) <= 6) {
      return { type: 'probability', favorable: 1, total: 6, outcome: dieDigit[1], context: 'die' };
    }
  }

  // ── Coin context ──
  if (/\b(coin|flip|flipping|toss|tossing)\b/.test(lower)) {
    for (const [name, count] of Object.entries(COIN_OUTCOMES)) {
      if (outcomeLower.includes(name)) {
        return { type: 'probability', favorable: count, total: COIN_TOTAL, outcome: name, context: 'coin' };
      }
    }
  }

  // ── Explicit counts: "3 red marbles out of 10", "bag contains 4 red and 6 blue" ──
  // Pattern: "N <color/type> out of M total"
  const explicitOutOf = lower.match(
    /(\d+)\s+(\w+)\s+(?:marble|ball|bead|candy|chip|token|block|cube|counter|item|card|sock|crayon|pen|pencil|button|coin)s?\s+(?:out\s+of|from|in)\s+(\d+)/i
  );
  if (explicitOutOf) {
    return {
      type: 'probability',
      favorable: parseInt(explicitOutOf[1]),
      total: parseInt(explicitOutOf[3]),
      outcome: explicitOutOf[2],
      context: 'custom',
    };
  }

  // Pattern: "bag/jar/box contains N red and M blue" — total is N+M, favorable is N for first color
  const containerPattern = lower.match(
    /(?:bag|jar|box|basket|bucket|drawer|pile|collection|set)\s+(?:contains?|has|holds|with)\s+([\d\w\s,]+(?:and\s+\d+\s+\w+))/i
  );
  if (containerPattern) {
    const itemPattern = /(\d+)\s+(\w+)/g;
    const items = [];
    let m;
    while ((m = itemPattern.exec(containerPattern[1])) !== null) {
      items.push({ count: parseInt(m[1]), name: m[2].toLowerCase() });
    }
    if (items.length >= 2) {
      const totalItems = items.reduce((sum, item) => sum + item.count, 0);
      // Find which item the question asks about
      for (const item of items) {
        if (outcomeLower.includes(item.name)) {
          return { type: 'probability', favorable: item.count, total: totalItems, outcome: item.name, context: 'container' };
        }
      }
      // Default to first item if outcome doesn't match any name
      return { type: 'probability', favorable: items[0].count, total: totalItems, outcome: items[0].name, context: 'container' };
    }
  }

  // ── Generic "N out of M" in the question itself ──
  const genericOutOf = lower.match(/(\d+)\s+(?:out\s+of|\/)\s+(\d+)/);
  if (genericOutOf) {
    return { type: 'probability', favorable: parseInt(genericOutOf[1]), total: parseInt(genericOutOf[2]), outcome: outcomeLower, context: 'explicit' };
  }

  return null;
}

/**
 * Solve a probability problem. Returns the answer as a simplified fraction.
 */
function solveProbability(problem) {
  const { favorable, total, outcome, context } = problem;

  if (total === 0) {
    return { success: false, error: 'Total outcomes cannot be zero' };
  }

  if (favorable > total) {
    return { success: false, error: `Favorable outcomes (${favorable}) exceed total (${total})` };
  }

  const g = gcd(favorable, total);
  const simplNum = favorable / g;
  const simplDen = total / g;

  const answer = simplDen === 1 ? `${simplNum}` : `${simplNum}/${simplDen}`;

  return {
    success: true,
    answer,
    steps: [
      `Favorable outcomes: ${favorable} (${outcome})`,
      `Total outcomes: ${total}`,
      `P(${outcome}) = ${favorable}/${total}${g > 1 ? ` = ${answer}` : ''}`,
    ],
  };
}

/** Greatest common divisor (Euclidean algorithm) */
function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

/**
 * Solve a proportion a/b = c/d for the unknown x.
 * Cross-multiply: a*d = b*c, solve for x.
 */
function solveProportion(problem) {
    const { a, b, c, d } = problem;

    // Find which is 'x' and solve
    const isX = v => v.toLowerCase() === 'x';
    let answer;
    let steps;

    if (isX(a)) {
        // x/b = c/d → x = b*c/d
        const bN = parseFloat(b), cN = parseFloat(c), dN = parseFloat(d);
        answer = (bN * cN) / dN;
        steps = [`x/${b} = ${c}/${d}`, `x × ${d} = ${b} × ${c}`, `x × ${d} = ${formatNumber(bN * cN)}`, `x = ${formatNumber(answer)}`];
    } else if (isX(b)) {
        // a/x = c/d → x = a*d/c
        const aN = parseFloat(a), cN = parseFloat(c), dN = parseFloat(d);
        answer = (aN * dN) / cN;
        steps = [`${a}/x = ${c}/${d}`, `${a} × ${d} = x × ${c}`, `${formatNumber(aN * dN)} = x × ${c}`, `x = ${formatNumber(answer)}`];
    } else if (isX(c)) {
        // a/b = x/d → x = a*d/b
        const aN = parseFloat(a), bN = parseFloat(b), dN = parseFloat(d);
        answer = (aN * dN) / bN;
        steps = [`${a}/${b} = x/${d}`, `${a} × ${d} = ${b} × x`, `${formatNumber(aN * dN)} = ${b} × x`, `x = ${formatNumber(answer)}`];
    } else if (isX(d)) {
        // a/b = c/x → x = b*c/a
        const aN = parseFloat(a), bN = parseFloat(b), cN = parseFloat(c);
        answer = (bN * cN) / aN;
        steps = [`${a}/${b} = ${c}/x`, `${a} × x = ${b} × ${c}`, `${a} × x = ${formatNumber(bN * cN)}`, `x = ${formatNumber(answer)}`];
    } else {
        return { success: false, error: 'No unknown found in proportion' };
    }

    return { success: true, answer: formatNumber(answer), steps };
}

/**
 * Solve circle area (πr²) or circumference (2πr).
 * Returns answer in terms of π when clean.
 */
function solveCircle(problem) {
    const { operation, radius } = problem;

    if (operation === 'area') {
        const rSquared = radius * radius;
        const numericAnswer = Math.PI * rSquared;
        const piAnswer = Number.isInteger(rSquared) ? `${rSquared}π` : `${formatNumber(rSquared)}π`;
        return {
            success: true,
            answer: piAnswer,
            numericAnswer: formatNumber(numericAnswer),
            steps: [
                `A = πr²`,
                `A = π × ${radius}²`,
                `A = ${piAnswer}`,
                `A ≈ ${formatNumber(numericAnswer)}`,
            ],
        };
    }

    if (operation === 'circumference') {
        const coeff = 2 * radius;
        const numericAnswer = Math.PI * coeff;
        const piAnswer = Number.isInteger(coeff) ? `${coeff}π` : `${formatNumber(coeff)}π`;
        return {
            success: true,
            answer: piAnswer,
            numericAnswer: formatNumber(numericAnswer),
            steps: [
                `C = 2πr`,
                `C = 2π × ${radius}`,
                `C = ${piAnswer}`,
                `C ≈ ${formatNumber(numericAnswer)}`,
            ],
        };
    }

    return { success: false, error: 'Unknown circle operation' };
}

/**
 * Solve volume of rectangular prism (l×w×h) or cylinder (πr²h).
 */
function solveVolume(problem) {
    const { shape } = problem;

    if (shape === 'rectangular_prism') {
        const { length, width, height } = problem;
        const vol = length * width * height;
        return {
            success: true,
            answer: formatNumber(vol),
            steps: [
                `V = length × width × height`,
                `V = ${length} × ${width} × ${height}`,
                `V = ${formatNumber(vol)}`,
            ],
        };
    }

    if (shape === 'cylinder') {
        const { radius, height } = problem;
        const rSquared = radius * radius;
        const numericVol = Math.PI * rSquared * height;
        const coeff = rSquared * height;
        const piAnswer = Number.isInteger(coeff) ? `${coeff}π` : `${formatNumber(coeff)}π`;
        return {
            success: true,
            answer: piAnswer,
            numericAnswer: formatNumber(numericVol),
            steps: [
                `V = πr²h`,
                `V = π × ${radius}² × ${height}`,
                `V = ${piAnswer}`,
                `V ≈ ${formatNumber(numericVol)}`,
            ],
        };
    }

    return { success: false, error: 'Unknown volume shape' };
}

function solveEvaluation(problem) {
    const { expression } = problem;

    // Clean the expression — convert word operators BEFORE stripping non-math chars
    let cleaned = expression
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        // "x" between numbers with spaces = multiplication (e.g., "2.75 x 5")
        .replace(/(\d)\s+x\s+(\d)/gi, '$1*$2')
        .replace(/\btimes\b/gi, '*')
        .replace(/\bmultiplied\s+by\b/gi, '*')
        .replace(/\bdivided\s+by\b/gi, '/')
        .replace(/\bplus\b/gi, '+')
        .replace(/\bminus\b/gi, '-')
        .replace(/\s+/g, '')
        .replace(/[^\d+\-*/().^]/g, '');

    // Handle exponents
    cleaned = cleaned.replace(/(\d+\.?\d*)\^(\d+\.?\d*)/g, 'Math.pow($1,$2)');

    // Safety check - only allow numbers and operators
    if (!/^[\d+\-*/().Math,pow\s]+$/.test(cleaned)) {
        return { success: false, error: 'Expression contains invalid characters' };
    }

    try {
        // Using Function instead of eval for slightly better safety
        const result = Function('"use strict"; return (' + cleaned + ')')();

        if (typeof result !== 'number' || !isFinite(result)) {
            return { success: false, error: 'Invalid result' };
        }

        return {
            success: true,
            answer: formatNumber(result),
            steps: [`${expression} = ${formatNumber(result)}`]
        };
    } catch (error) {
        return { success: false, error: 'Could not evaluate expression' };
    }
}

/**
 * Format number for display (handle decimals nicely)
 */
function formatNumber(num) {
    if (Number.isInteger(num)) {
        return num.toString();
    }
    // Round to 4 decimal places and remove trailing zeros
    return parseFloat(num.toFixed(4)).toString();
}

/**
 * Calculate GCD for fraction simplification
 */
function greatestCommonDivisor(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
        const t = b;
        b = a % b;
        a = t;
    }
    return a;
}

/**
 * Verify if a student's answer matches the correct answer
 * @param {string|number} studentAnswer - Student's provided answer
 * @param {string|number} correctAnswer - Correct answer from solver
 * @param {number} tolerance - Tolerance for floating point comparison (default 0.01)
 * @returns {Object} Verification result
 */
function verifyAnswer(studentAnswer, correctAnswer, tolerance = 0.01) {
    // Normalize answers
    const studentStr = String(studentAnswer).trim().toLowerCase();
    const correctStr = String(correctAnswer).trim().toLowerCase();

    // Exact match
    if (studentStr === correctStr) {
        return { isCorrect: true, exact: true };
    }

    // Numeric comparison with tolerance
    // Only apply when both answers look like pure numbers (no variables).
    // Without this guard, "3x^2-3+2" gets stripped to "32-32" → 32 and
    // falsely matches "3x^2-3" stripped to "32-3" → 32.
    const hasLetters = /[a-zA-Z]/.test(studentStr) || /[a-zA-Z]/.test(correctStr);
    if (!hasLetters) {
        const studentNum = parseFloat(studentStr.replace(/[^\d.\-]/g, ''));
        const correctNum = parseFloat(correctStr.replace(/[^\d.\-]/g, ''));

        if (!isNaN(studentNum) && !isNaN(correctNum)) {
            if (Math.abs(studentNum - correctNum) <= tolerance) {
                return { isCorrect: true, exact: false, difference: Math.abs(studentNum - correctNum) };
            }
        }
    }

    // Fraction comparison
    const studentFrac = parseFraction(studentStr);
    const correctFrac = parseFraction(correctStr);

    if (studentFrac && correctFrac) {
        const studentVal = studentFrac.num / studentFrac.den;
        const correctVal = correctFrac.num / correctFrac.den;
        if (Math.abs(studentVal - correctVal) <= tolerance) {
            return { isCorrect: true, exact: studentFrac.num === correctFrac.num && studentFrac.den === correctFrac.den };
        }
    }

    // Cross-comparison: decimal ↔ fraction (e.g. "0.25" vs "1/4")
    if (!hasLetters) {
        const fracSide = studentFrac || correctFrac;
        const decimalSide = studentFrac ? correctStr : studentStr;
        if (fracSide && !studentFrac !== !correctFrac) {
            const fracVal = fracSide.num / fracSide.den;
            const decVal = parseFloat(decimalSide);
            if (!isNaN(decVal) && Math.abs(fracVal - decVal) <= tolerance) {
                return { isCorrect: true, exact: false, equivalentForm: true };
            }
        }
    }

    // System of equations answer: "x = 3, y = 2" vs "y = 2, x = 3"
    const studentVars = parseVariableAssignments(studentStr);
    const correctVars = parseVariableAssignments(correctStr);
    if (studentVars && correctVars) {
        const allMatch = Object.keys(correctVars).every(v =>
            studentVars[v] !== undefined && Math.abs(studentVars[v] - correctVars[v]) <= tolerance
        );
        if (allMatch && Object.keys(studentVars).length === Object.keys(correctVars).length) {
            return { isCorrect: true, exact: false, equivalentForm: true };
        }
    }

    // Factored form comparison: (x+a)(x+b) vs (x+b)(x+a) — commutative property
    const studentFactors = parseFactoredForm(studentStr);
    const correctFactors = parseFactoredForm(correctStr);

    if (studentFactors && correctFactors) {
        if (areFactoredFormsEquivalent(studentFactors, correctFactors)) {
            return { isCorrect: true, exact: false, equivalentForm: true };
        }
    }

    // Algebraic expression comparison: normalize and compare polynomial forms
    // Handles cases like "3x^2-3" vs "3x^2 - 3", "x+2" vs "2+x", etc.
    const studentPoly = parsePolynomial(studentStr);
    const correctPoly = parsePolynomial(correctStr);

    if (studentPoly && correctPoly) {
        if (arePolynomialsEqual(studentPoly, correctPoly, tolerance)) {
            return { isCorrect: true, exact: false, equivalentForm: true };
        }
    }

    return { isCorrect: false };
}

/**
 * Parse a polynomial expression into a canonical form.
 * "3x^2-3" → { terms: [{coeff: 3, var: 'x', exp: 2}, {coeff: -3, var: null, exp: 0}] }
 * "x+2"    → { terms: [{coeff: 1, var: 'x', exp: 1}, {coeff: 2, var: null, exp: 0}] }
 *
 * Returns null if the string is not a recognizable polynomial.
 */
function parsePolynomial(str) {
    if (!str) return null;

    // Normalize: strip spaces around operators, handle unicode minus, caret braces
    let normalized = str.replace(/\s+/g, '')
        .replace(/−/g, '-')
        .replace(/\*\*/g, '^')
        .replace(/\^{(\d+)}/g, '^$1')  // ^{2} → ^2
        .replace(/\^(\d)/g, '^$1');

    // Must contain at least one letter (variable) to be an algebraic expression
    if (!/[a-z]/i.test(normalized)) return null;

    // Split into signed terms: turn "3x^2-3+x" into ["+3x^2", "-3", "+x"]
    // Insert '+' before leading term if it doesn't start with a sign
    if (normalized[0] !== '-' && normalized[0] !== '+') {
        normalized = '+' + normalized;
    }

    const termRegex = /([+-])(\d*\.?\d*)([a-z]?)(?:\^(\d+))?/gi;
    const terms = [];
    let match;
    let totalMatched = 0;

    while ((match = termRegex.exec(normalized)) !== null) {
        const sign = match[1] === '-' ? -1 : 1;
        const coeffStr = match[2];
        const variable = match[3] || null;
        const exponent = match[4] ? parseInt(match[4], 10) : (variable ? 1 : 0);

        let coeff;
        if (!coeffStr && variable) {
            coeff = sign * 1; // "x" means 1x
        } else if (coeffStr) {
            coeff = sign * parseFloat(coeffStr);
        } else {
            continue; // Empty match
        }

        terms.push({ coeff, variable: variable ? variable.toLowerCase() : null, exp: exponent });
        totalMatched += match[0].length;
    }

    // Verify we consumed most of the string (avoid false positives)
    if (terms.length === 0 || totalMatched < normalized.length * 0.8) return null;

    return { terms };
}

/**
 * Compare two parsed polynomials for mathematical equivalence.
 * Combines like terms and compares sorted canonical forms.
 */
function arePolynomialsEqual(polyA, polyB, tolerance = 0.01) {
    const canonA = canonicalizePolynomial(polyA.terms);
    const canonB = canonicalizePolynomial(polyB.terms);

    if (canonA.length !== canonB.length) return false;

    for (let i = 0; i < canonA.length; i++) {
        if (canonA[i].variable !== canonB[i].variable) return false;
        if (canonA[i].exp !== canonB[i].exp) return false;
        if (Math.abs(canonA[i].coeff - canonB[i].coeff) > tolerance) return false;
    }

    return true;
}

/**
 * Combine like terms and sort by descending exponent, then by variable.
 */
function canonicalizePolynomial(terms) {
    // Combine like terms
    const combined = {};
    for (const term of terms) {
        const key = `${term.variable || '_const'}_${term.exp}`;
        if (!combined[key]) {
            combined[key] = { ...term };
        } else {
            combined[key].coeff += term.coeff;
        }
    }

    // Filter out zero-coefficient terms and sort
    return Object.values(combined)
        .filter(t => Math.abs(t.coeff) > 1e-10)
        .sort((a, b) => {
            if (b.exp !== a.exp) return b.exp - a.exp;
            if (a.variable && !b.variable) return -1;
            if (!a.variable && b.variable) return 1;
            return (a.variable || '').localeCompare(b.variable || '');
        });
}

/**
 * Parse variable assignments like "x = 3, y = 2" or "x=3 and y=2"
 * Returns { x: 3, y: 2 } or null
 */
function parseVariableAssignments(str) {
    const assignments = {};
    // Match patterns like "x = 3" or "y=-2.5"
    const pattern = /([a-z])\s*=\s*(-?\d+\.?\d*)/gi;
    let match;
    while ((match = pattern.exec(str)) !== null) {
        assignments[match[1].toLowerCase()] = parseFloat(match[2]);
    }
    return Object.keys(assignments).length >= 2 ? assignments : null;
}

/**
 * Parse a fraction string like "3/4"
 */
function parseFraction(str) {
    const match = str.match(/^(-?\d+)\s*\/\s*(\d+)$/);
    if (match) {
        return { num: parseInt(match[1]), den: parseInt(match[2]) };
    }
    return null;
}

/**
 * Parse a factored form expression like "(x+2)(x-3)" or "(2x+1)(x-5)".
 * Returns an array of binomial objects [{coeff, constant}, ...] or null.
 */
function parseFactoredForm(str) {
    if (!str) return null;

    // Normalize: strip spaces, handle unicode minus
    const normalized = str.replace(/\s+/g, '').replace(/−/g, '-');

    // Match pattern: one or more (ax+b) or (ax-b) factors
    const binomialPattern = /\((-?\d*)x([+\-]\d+)\)/g;
    const factors = [];
    let match;
    let totalMatched = 0;

    while ((match = binomialPattern.exec(normalized)) !== null) {
        const coeff = match[1] === '' || match[1] === '+' ? 1 : match[1] === '-' ? -1 : parseInt(match[1], 10);
        const constant = parseInt(match[2], 10);
        factors.push({ coeff, constant });
        totalMatched += match[0].length;
    }

    // Must match at least 2 factors and consume most of the string
    if (factors.length < 2) return null;

    // Allow for a leading scalar coefficient like "2(x+1)(x+3)"
    const leadingScalar = normalized.match(/^(-?\d+)\(/);
    if (leadingScalar) {
        totalMatched += leadingScalar[1].length;
    }

    // Verify we consumed the meaningful parts of the string
    if (totalMatched < normalized.replace(/[^(x\d+\-)]/g, '').length * 0.5) return null;

    return {
        scalar: leadingScalar ? parseInt(leadingScalar[1], 10) : 1,
        binomials: factors
    };
}

/**
 * Check if two factored forms are mathematically equivalent.
 * Handles commutative property: (x+2)(x+3) = (x+3)(x+2)
 * Expands both to standard form and compares coefficients.
 */
function areFactoredFormsEquivalent(a, b) {
    if (!a || !b) return false;

    // Expand both to standard form (polynomial coefficients) and compare
    const polyA = expandFactoredForm(a);
    const polyB = expandFactoredForm(b);

    if (!polyA || !polyB) return false;
    if (polyA.length !== polyB.length) return false;

    return polyA.every((coeff, i) => Math.abs(coeff - polyB[i]) < 0.0001);
}

/**
 * Expand a factored form to polynomial coefficients.
 * E.g., {scalar: 1, binomials: [{coeff:1, constant:2}, {coeff:1, constant:3}]}
 *   → [1, 5, 6] representing x² + 5x + 6
 */
function expandFactoredForm(factored) {
    if (!factored || !factored.binomials || factored.binomials.length < 2) return null;

    // Start with first binomial as polynomial [coeff, constant]
    let poly = [factored.binomials[0].coeff, factored.binomials[0].constant];

    // Multiply by each subsequent binomial
    for (let i = 1; i < factored.binomials.length; i++) {
        const bin = factored.binomials[i];
        poly = multiplyPolynomials(poly, [bin.coeff, bin.constant]);
    }

    // Apply scalar
    if (factored.scalar !== 1) {
        poly = poly.map(c => c * factored.scalar);
    }

    return poly;
}

/**
 * Multiply two polynomials represented as coefficient arrays.
 * [a, b] * [c, d] = [a*c, a*d + b*c, b*d]
 */
function multiplyPolynomials(p1, p2) {
    const result = new Array(p1.length + p2.length - 1).fill(0);
    for (let i = 0; i < p1.length; i++) {
        for (let j = 0; j < p2.length; j++) {
            result[i + j] += p1[i] * p2[j];
        }
    }
    return result;
}

/**
 * Main entry point: detect, solve, and return solution
 * @param {string} message - User message
 * @returns {Object} Full solution object
 */
// ═══════════════════════════════════════════════════════════════════
// CALCULUS SOLVERS — Derivatives and Limits
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse a polynomial expression string into an array of terms.
 * Each term is { coeff, exp } where the polynomial is in variable 'x'.
 *
 * "x^3 - 3x + 2"  → [{coeff:1, exp:3}, {coeff:-3, exp:1}, {coeff:2, exp:0}]
 * "3x^4 - 2x^2 + x" → [{coeff:3, exp:4}, {coeff:-2, exp:2}, {coeff:1, exp:1}]
 * "5" → [{coeff:5, exp:0}]
 *
 * Returns null if the string cannot be parsed as a polynomial in x.
 */
function parsePolynomialTerms(str, variable) {
    if (!str || typeof str !== 'string') return null;

    // Default variable is 'x', but callers can pass 't', 'n', etc.
    const v = variable || 'x';
    const vEscaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Normalize
    let s = str.trim()
        .replace(/−/g, '-')            // unicode minus
        .replace(/\*\*/g, '^')         // ** → ^
        .replace(/²/g, '^2')
        .replace(/³/g, '^3')
        .replace(/⁴/g, '^4')
        .replace(/⁵/g, '^5')
        .replace(/⁶/g, '^6')
        .replace(/⁷/g, '^7')
        .replace(/⁸/g, '^8')
        .replace(/⁹/g, '^9')
        .replace(/\^{(\d+)}/g, '^$1') // ^{2} → ^2
        .replace(/\s+/g, '');          // strip all spaces

    // Bail on non-polynomial content (trig, log, etc.)
    if (/(?:sin|cos|tan|log|ln|sqrt|abs)\s*\(/i.test(s)) return null;

    // Ensure leading sign
    if (s[0] !== '-' && s[0] !== '+') s = '+' + s;

    // Match terms: sign, optional coefficient, optional variable with optional ^exp
    const termRegex = new RegExp(`([+-])(\\d*\\.?\\d*)(${vEscaped}?)(?:\\^(\\d+))?`, 'g');
    const terms = [];
    let match;
    let totalLen = 0;

    while ((match = termRegex.exec(s)) !== null) {
        if (match[0].length === 1 && !match[3]) continue; // bare sign, skip

        const sign = match[1] === '-' ? -1 : 1;
        const coeffStr = match[2];
        const hasVar = match[3] === v;
        const expStr = match[4];

        let coeff, exp;

        if (hasVar) {
            coeff = coeffStr === '' ? sign : sign * parseFloat(coeffStr);
            exp = expStr ? parseInt(expStr, 10) : 1;
        } else if (coeffStr !== '') {
            coeff = sign * parseFloat(coeffStr);
            exp = 0;
        } else {
            continue;
        }

        if (isNaN(coeff)) continue;
        terms.push({ coeff, exp });
        totalLen += match[0].length;
    }

    // Must consume most of the string to be a valid polynomial
    if (terms.length === 0 || totalLen < s.length * 0.8) return null;

    return terms;
}

/**
 * Format polynomial terms back into a string.
 * [{coeff:3, exp:2}, {coeff:-3, exp:0}] → "3x^2-3"
 */
function formatPolynomialTerms(terms) {
    // Sort descending by exponent
    const sorted = [...terms].sort((a, b) => b.exp - a.exp);
    // Filter zero coefficients
    const nonZero = sorted.filter(t => Math.abs(t.coeff) > 1e-10);

    if (nonZero.length === 0) return '0';

    let result = '';
    for (let i = 0; i < nonZero.length; i++) {
        const { coeff, exp } = nonZero[i];

        // Sign
        if (i === 0) {
            if (coeff < 0) result += '-';
        } else {
            result += coeff < 0 ? '-' : '+';
        }

        const absCoeff = Math.abs(coeff);

        // Coefficient (omit "1" before x, but not for constants)
        if (exp === 0) {
            result += Number.isInteger(absCoeff) ? String(absCoeff) : absCoeff.toString();
        } else if (absCoeff !== 1) {
            result += Number.isInteger(absCoeff) ? String(absCoeff) : absCoeff.toString();
        }

        // Variable and exponent
        if (exp >= 2) {
            result += `x^${exp}`;
        } else if (exp === 1) {
            result += 'x';
        }
    }

    return result;
}

/**
 * Strip trailing non-math text from a captured expression.
 * Tutor messages often have follow-up questions appended:
 *   "x^3 - 3x + 2? What do you think the first step is?"
 *   "x^2 + 5x. Let's start with the first term."
 *
 * We cut at the first sentence-ending punctuation followed by a space/letter.
 */
function cleanTrailingText(expr) {
    return expr
        .replace(/[?!]\s*\w.*$/, '')   // "expr? What..." → "expr"
        .replace(/\.\s+[A-Z].*$/, '')  // "expr. Let's..." → "expr"
        .replace(/[?!.]+$/, '')         // trailing punctuation
        .trim();
}

/**
 * Detect an expression substitution (plug-in) problem.
 *
 * Supported patterns:
 * - "evaluate 24t-12 at t=2"
 * - "plug x=1 into 3x^2-6x+2"
 * - "what is 3x^2-6x+2 when x=1"
 * - "f(2) where f(x) = 24x-12"
 * - "find a(2) if a(t) = 24t-12"
 * - "24(2)-12" (numeric substitution already shown)
 *
 * Returns a problem object { type: 'substitution', terms, variable, value } or null.
 */
function detectSubstitution(message) {
    if (!message) return null;

    // Strip LaTeX delimiters
    let text = message
        .replace(/\\\(([^)]*?)\\\)/g, '$1')
        .replace(/\\\[([^\]]*?)\\\]/g, '$1')
        .replace(/\$\$([^$]*?)\$\$/g, '$1')
        .replace(/(?<![\\$])\$([^$\n]+?)\$/g, '$1');

    // Pattern 1: "evaluate EXPR at VAR=VALUE" or "evaluate EXPR for VAR=VALUE"
    const evalAtPattern = /(?:evaluate|compute|calculate|find)\s+(.+?)\s+(?:at|for|when|where)\s+([a-zA-Z])\s*=\s*(-?\d+\.?\d*)/i;
    const evalAtMatch = text.match(evalAtPattern);
    if (evalAtMatch) {
        const terms = parsePolynomialTerms(evalAtMatch[1].trim(), evalAtMatch[2]);
        if (terms) {
            return { type: 'substitution', terms, variable: evalAtMatch[2], value: parseFloat(evalAtMatch[3]), raw: evalAtMatch[1].trim() };
        }
    }

    // Pattern 2: "plug VAR=VALUE into EXPR"
    const plugPattern = /plug(?:ging)?\s+([a-zA-Z])\s*=\s*(-?\d+\.?\d*)\s+into\s+(.+)/i;
    const plugMatch = text.match(plugPattern);
    if (plugMatch) {
        const terms = parsePolynomialTerms(plugMatch[3].trim(), plugMatch[1]);
        if (terms) {
            return { type: 'substitution', terms, variable: plugMatch[1], value: parseFloat(plugMatch[2]), raw: plugMatch[3].trim() };
        }
    }

    // Pattern 3: "what is EXPR when VAR=VALUE" or "EXPR when VAR=VALUE"
    const whenPattern = /(?:what\s+(?:is|do\s+you\s+get)\s+)?(.+?)\s+when\s+([a-zA-Z])\s*=\s*(-?\d+\.?\d*)/i;
    const whenMatch = text.match(whenPattern);
    if (whenMatch) {
        const terms = parsePolynomialTerms(whenMatch[1].trim(), whenMatch[2]);
        if (terms) {
            return { type: 'substitution', terms, variable: whenMatch[2], value: parseFloat(whenMatch[3]), raw: whenMatch[1].trim() };
        }
    }

    // Pattern 4: "f(VALUE)" or "a(VALUE)" where f/a is a function name mentioned earlier
    // This pattern is intentionally narrow — it only fires when accompanied by a definition.
    // "f(2) where f(x) = EXPR" or "find f(2) if f(x) = EXPR"
    const funcDefPattern = /(?:find\s+|what\s+is\s+)?([a-zA-Z])\s*\(\s*(-?\d+\.?\d*)\s*\)\s*(?:where|if|given|when)\s+\1\s*\(\s*([a-zA-Z])\s*\)\s*=\s*(.+)/i;
    const funcDefMatch = text.match(funcDefPattern);
    if (funcDefMatch) {
        const terms = parsePolynomialTerms(funcDefMatch[4].trim(), funcDefMatch[3]);
        if (terms) {
            return { type: 'substitution', terms, variable: funcDefMatch[3], value: parseFloat(funcDefMatch[2]), raw: funcDefMatch[4].trim() };
        }
    }

    // Pattern 5: "EXPR at VAR=VALUE" (shorter form, e.g. "24t-12 at t=2")
    const shortAtPattern = /^(.+?)\s+at\s+([a-zA-Z])\s*=\s*(-?\d+\.?\d*)/i;
    const shortAtMatch = text.match(shortAtPattern);
    if (shortAtMatch) {
        const terms = parsePolynomialTerms(shortAtMatch[1].trim(), shortAtMatch[2]);
        if (terms) {
            return { type: 'substitution', terms, variable: shortAtMatch[2], value: parseFloat(shortAtMatch[3]), raw: shortAtMatch[1].trim() };
        }
    }

    return null;
}

/**
 * Solve an expression substitution (plug-in) problem.
 *
 * Evaluates a polynomial at a given value using evaluatePolynomialAt.
 *
 * @param {Object} problem - { type: 'substitution', terms, variable, value, raw }
 * @returns {Object} Solution with answer and steps
 */
function solveSubstitution(problem) {
    const { terms, variable, value, raw } = problem;
    const steps = [];

    steps.push(`Substitute ${variable} = ${value} into ${raw}`);

    // Show each term's computation
    const termResults = [];
    for (const { coeff, exp } of terms) {
        if (exp === 0) {
            termResults.push(coeff);
            steps.push(`Constant term: ${coeff}`);
        } else {
            const termValue = coeff * Math.pow(value, exp);
            if (exp === 1) {
                steps.push(`${coeff === 1 ? '' : coeff === -1 ? '-' : coeff}${variable} → ${coeff}(${value}) = ${termValue}`);
            } else {
                steps.push(`${coeff === 1 ? '' : coeff === -1 ? '-' : coeff}${variable}^${exp} → ${coeff}(${value})^${exp} = ${termValue}`);
            }
            termResults.push(termValue);
        }
    }

    const result = evaluatePolynomialAt(terms, value);
    const answer = formatNumber(result);
    steps.push(`Result: ${answer}`);

    return {
        success: true,
        answer,
        steps,
    };
}

/**
 * Detect a derivative problem in a message.
 *
 * Supported patterns:
 * - "derivative of x^3 - 3x + 2"
 * - "d/dx(x^2 + 5x)"
 * - "d/dx of x^3 - 3x + 2"
 * - "differentiate 3x^4 - 2x^2 + x"
 * - "find the derivative of ..."
 * - "what is the derivative of ..."
 * - "what's d/dx of ..."
 * - "can you tell me the derivative of ..."
 *
 * Returns a problem object or null.
 */
function detectDerivative(message) {
    if (!message) return null;

    // Strip LaTeX delimiters so we can regex plain text
    let text = message
        .replace(/\\\(([^)]*?)\\\)/g, '$1')
        .replace(/\\\[([^\]]*?)\\\]/g, '$1')
        .replace(/\$\$([^$]*?)\$\$/g, '$1')
        .replace(/(?<![\\$])\$([^$\n]+?)\$/g, '$1');

    // Pattern 1: "derivative of EXPR" or "the derivative of EXPR"
    // Also handles "can you tell me the derivative of...", "what is the derivative of..."
    const derivOfPattern = /(?:(?:can\s+you\s+(?:tell\s+me|find|compute)\s+)?(?:find|what(?:'s|\s+is)|compute|calculate|take)\s+)?(?:the\s+)?derivative\s+of\s+(.+)/i;
    const derivOfMatch = text.match(derivOfPattern);
    if (derivOfMatch) {
        const cleaned = cleanTrailingText(derivOfMatch[1]);
        const terms = parsePolynomialTerms(cleaned);
        if (terms) {
            return { type: 'derivative', terms, raw: cleaned };
        }
    }

    // Pattern 2: "d/dx(EXPR)" or "d/dx of EXPR" or "d/dx EXPR"
    const ddxPattern = /d\s*\/\s*dx\s*(?:\(([^)]+)\)|of\s+(.+)|([^,.\s].+))/i;
    const ddxMatch = text.match(ddxPattern);
    if (ddxMatch) {
        const expr = cleanTrailingText((ddxMatch[1] || ddxMatch[2] || ddxMatch[3] || '').trim());
        const terms = parsePolynomialTerms(expr);
        if (terms) {
            return { type: 'derivative', terms, raw: expr };
        }
    }

    // Pattern 3: "differentiate EXPR"
    const diffPattern = /differentiate\s+(.+)/i;
    const diffMatch = text.match(diffPattern);
    if (diffMatch) {
        const cleaned = cleanTrailingText(diffMatch[1]);
        const terms = parsePolynomialTerms(cleaned);
        if (terms) {
            return { type: 'derivative', terms, raw: cleaned };
        }
    }

    return null;
}

/**
 * Compute the derivative of a polynomial using the power rule.
 *
 * d/dx(ax^n) = n*a*x^(n-1)
 * d/dx(c) = 0
 *
 * @param {Object} problem - { type: 'derivative', terms: [{coeff, exp}] }
 * @returns {Object} Solution with answer and steps
 */
function solveDerivative(problem) {
    const { terms } = problem;

    const steps = [];
    const resultTerms = [];

    steps.push(`Apply the power rule to each term: d/dx(ax^n) = n·a·x^(n-1)`);

    for (const term of terms) {
        const { coeff, exp } = term;

        if (exp === 0) {
            // Constant term — derivative is 0
            if (Math.abs(coeff) > 1e-10) {
                steps.push(`d/dx(${coeff}) = 0 (constant)`);
            }
            continue;
        }

        const newCoeff = coeff * exp;
        const newExp = exp - 1;

        if (exp === 1) {
            steps.push(`d/dx(${coeff === 1 ? '' : coeff === -1 ? '-' : coeff}x) = ${newCoeff}`);
        } else {
            steps.push(`d/dx(${coeff === 1 ? '' : coeff === -1 ? '-' : coeff}x^${exp}) = ${exp}·${Math.abs(coeff) === 1 ? '' : coeff}x^${newExp} = ${newCoeff}${newExp > 0 ? 'x' + (newExp > 1 ? '^' + newExp : '') : ''}`);
        }

        resultTerms.push({ coeff: newCoeff, exp: newExp });
    }

    const answer = formatPolynomialTerms(resultTerms);
    steps.push(`Result: ${answer}`);

    return {
        success: true,
        answer,
        steps,
    };
}

/**
 * Detect a limit problem in a message.
 *
 * Supported patterns:
 * - "limit of (x^2-4)/(x-2) as x approaches 2"
 * - "lim x→2 (x^2-4)/(x-2)"
 * - "lim as x->2 of (x^2-4)/(x-2)"
 * - "what is the limit of EXPR as x approaches VALUE"
 * - "find the limit as x approaches VALUE of EXPR"
 * - "limit as x → 2 of (x^2-4)/(x-2)"
 *
 * Returns a problem object or null.
 */
function detectLimit(message) {
    if (!message) return null;

    // Strip LaTeX delimiters
    let text = message
        .replace(/\\\(([^)]*?)\\\)/g, '$1')
        .replace(/\\\[([^\]]*?)\\\]/g, '$1')
        .replace(/\$\$([^$]*?)\$\$/g, '$1')
        .replace(/(?<![\\$])\$([^$\n]+?)\$/g, '$1')
        .replace(/\\to\b/g, '→')
        .replace(/\\rightarrow\b/g, '→')
        .replace(/\\lim\b/g, 'lim');

    // Normalize arrow notations
    text = text.replace(/->/g, '→');

    // Pattern 1: "limit of EXPR as x approaches VALUE"
    // Also: "find/what is/can you tell me the limit of EXPR as x approaches VALUE"
    // Handles optional "is" between expression and "as": "limit of EXPR is as x approaches"
    const limitOfPattern = /(?:(?:can\s+you\s+(?:tell\s+me|find|compute)\s+)?(?:find|what(?:'s|\s+is)|compute|calculate)\s+)?(?:the\s+)?lim(?:it)?\s+(?:of\s+)?(.+?)\s+(?:is\s+)?as\s+x\s*(?:approaches|→|->|goes\s+to|tends\s+to)\s*(-?\d+\.?\d*)/i;
    const limitOfMatch = text.match(limitOfPattern);
    if (limitOfMatch) {
        const exprStr = cleanTrailingText(limitOfMatch[1].trim());
        const approachValue = parseFloat(limitOfMatch[2]);
        const parsed = parseLimitExpression(exprStr);
        if (parsed) {
            return { type: 'limit', ...parsed, approachValue, raw: exprStr };
        }
    }

    // Pattern 2: "limit as x approaches VALUE of EXPR"
    const limitAsPattern = /(?:(?:can\s+you\s+(?:tell\s+me|find|compute)\s+)?(?:find|what(?:'s|\s+is)|compute|calculate)\s+)?(?:the\s+)?lim(?:it)?\s+as\s+x\s*(?:approaches|→|->|goes\s+to|tends\s+to)\s*(-?\d+\.?\d*)\s+(?:of\s+)?(.+)/i;
    const limitAsMatch = text.match(limitAsPattern);
    if (limitAsMatch) {
        const approachValue = parseFloat(limitAsMatch[1]);
        const exprStr = cleanTrailingText(limitAsMatch[2].trim());
        const parsed = parseLimitExpression(exprStr);
        if (parsed) {
            return { type: 'limit', ...parsed, approachValue, raw: exprStr };
        }
    }

    // Pattern 3: "lim x→VALUE EXPR" or "lim_{x→VALUE} EXPR"
    const limArrowPattern = /lim\s*(?:_\s*(?:\{?\s*)?)?x\s*→\s*(-?\d+\.?\d*)(?:\s*\}?\s*)?\s+(.+)/i;
    const limArrowMatch = text.match(limArrowPattern);
    if (limArrowMatch) {
        const approachValue = parseFloat(limArrowMatch[1]);
        const exprStr = cleanTrailingText(limArrowMatch[2].trim());
        const parsed = parseLimitExpression(exprStr);
        if (parsed) {
            return { type: 'limit', ...parsed, approachValue, raw: exprStr };
        }
    }

    return null;
}

/**
 * Parse a limit expression into numerator and denominator polynomial terms.
 * Handles:
 * - Rational expressions: (x^2-4)/(x-2) → { numerator, denominator }
 * - Plain polynomials: x^2+3x+2 → { numerator, denominator: null }
 *
 * Returns { numerator: [{coeff,exp}], denominator: [{coeff,exp}]|null } or null.
 */
function parseLimitExpression(exprStr) {
    if (!exprStr) return null;

    let s = exprStr.trim();

    // Remove outer parentheses if they wrap the entire expression
    if (s.startsWith('(') && s.endsWith(')')) {
        const inner = s.slice(1, -1);
        // Only strip if the parens are balanced (not "(a)/(b)")
        if (!inner.includes('/') || (inner.match(/\(/g) || []).length === (inner.match(/\)/g) || []).length) {
            // Check if stripping parens leaves a valid expression
            const testTerms = parsePolynomialTerms(inner);
            if (testTerms) s = inner;
        }
    }

    // Try to split on "/" for rational expressions
    // Handle (NUMERATOR)/(DENOMINATOR) form
    const rationalMatch = s.match(/^\(?([^/]+?)\)?\s*\/\s*\(?([^/]+?)\)?$/);
    if (rationalMatch) {
        const numTerms = parsePolynomialTerms(rationalMatch[1].trim());
        const denTerms = parsePolynomialTerms(rationalMatch[2].trim());
        if (numTerms && denTerms) {
            return { numerator: numTerms, denominator: denTerms };
        }
    }

    // Try as a plain polynomial
    const terms = parsePolynomialTerms(s);
    if (terms) {
        return { numerator: terms, denominator: null };
    }

    return null;
}

/**
 * Evaluate a polynomial at a given x value.
 * @param {Array} terms - [{coeff, exp}]
 * @param {number} x - Value to substitute
 * @returns {number}
 */
function evaluatePolynomialAt(terms, x) {
    let result = 0;
    for (const { coeff, exp } of terms) {
        result += coeff * Math.pow(x, exp);
    }
    return result;
}

/**
 * Perform synthetic polynomial division: divide numerator by (x - root).
 * Returns the quotient terms or null if not evenly divisible.
 *
 * @param {Array} terms - Numerator polynomial terms [{coeff, exp}]
 * @param {number} root - The root to divide out (dividing by x - root)
 * @returns {Array|null} Quotient polynomial terms
 */
function syntheticDivide(terms, root) {
    // Build coefficient array from highest to lowest degree
    const maxExp = Math.max(...terms.map(t => t.exp));
    const coeffs = new Array(maxExp + 1).fill(0);
    for (const { coeff, exp } of terms) {
        coeffs[maxExp - exp] += coeff;
    }

    // Synthetic division
    const quotientCoeffs = [coeffs[0]];
    for (let i = 1; i < coeffs.length; i++) {
        quotientCoeffs.push(coeffs[i] + quotientCoeffs[i - 1] * root);
    }

    // Last entry is the remainder
    const remainder = quotientCoeffs.pop();
    if (Math.abs(remainder) > 1e-10) return null; // Not evenly divisible

    // Convert back to terms
    const quotientTerms = [];
    const quotientDegree = maxExp - 1;
    for (let i = 0; i < quotientCoeffs.length; i++) {
        if (Math.abs(quotientCoeffs[i]) > 1e-10) {
            quotientTerms.push({ coeff: quotientCoeffs[i], exp: quotientDegree - i });
        }
    }

    return quotientTerms;
}

/**
 * Solve a limit problem.
 *
 * Strategy:
 * 1. Try direct substitution
 * 2. If 0/0 (removable discontinuity), factor and cancel
 * 3. If n/0, the limit does not exist (or is ±∞)
 *
 * @param {Object} problem - { type: 'limit', numerator, denominator, approachValue }
 * @returns {Object} Solution with answer and steps
 */
function solveLimit(problem) {
    const { numerator, denominator, approachValue } = problem;
    const steps = [];
    const a = approachValue;

    // Case 1: Plain polynomial (no denominator)
    if (!denominator) {
        const result = evaluatePolynomialAt(numerator, a);
        steps.push(`Substitute x = ${a} directly into ${formatPolynomialTerms(numerator)}`);
        const answer = Number.isInteger(result) ? String(result) : result.toFixed(6).replace(/\.?0+$/, '');
        steps.push(`Result: ${answer}`);
        return { success: true, answer, steps };
    }

    // Case 2: Rational expression
    const numStr = formatPolynomialTerms(numerator);
    const denStr = formatPolynomialTerms(denominator);
    steps.push(`Evaluate the limit of (${numStr})/(${denStr}) as x → ${a}`);

    // Step 2a: Try direct substitution
    const numVal = evaluatePolynomialAt(numerator, a);
    const denVal = evaluatePolynomialAt(denominator, a);

    steps.push(`Direct substitution: numerator = ${numVal}, denominator = ${denVal}`);

    if (Math.abs(denVal) > 1e-10) {
        // Denominator is non-zero — direct substitution works
        const result = numVal / denVal;
        const answer = Number.isInteger(result) ? String(result) : result.toFixed(6).replace(/\.?0+$/, '');
        steps.push(`The denominator is non-zero, so substitute directly: ${answer}`);
        return { success: true, answer, steps };
    }

    if (Math.abs(numVal) > 1e-10) {
        // Non-zero / zero → limit does not exist (±∞)
        steps.push(`Numerator is ${numVal} but denominator is 0 → limit does not exist`);
        return { success: true, answer: 'DNE', steps };
    }

    // Step 2b: 0/0 — removable discontinuity, try to factor and cancel
    steps.push(`Got 0/0 — indeterminate form. Factor and simplify.`);

    // Factor out (x - a) from numerator
    const quotientNum = syntheticDivide(numerator, a);
    const quotientDen = syntheticDivide(denominator, a);

    if (quotientNum && quotientDen) {
        const qNumStr = formatPolynomialTerms(quotientNum);
        const qDenStr = formatPolynomialTerms(quotientDen);
        steps.push(`Factor (x - ${a}) from both: (${qNumStr})/(${qDenStr})`);

        // Evaluate simplified expression at a
        const simplifiedNum = evaluatePolynomialAt(quotientNum, a);
        const simplifiedDen = evaluatePolynomialAt(quotientDen, a);

        if (Math.abs(simplifiedDen) > 1e-10) {
            const result = simplifiedNum / simplifiedDen;
            const answer = Number.isInteger(result) ? String(result) : result.toFixed(6).replace(/\.?0+$/, '');
            steps.push(`Substitute x = ${a}: (${simplifiedNum})/(${simplifiedDen}) = ${answer}`);
            return { success: true, answer, steps };
        }

        // Still 0/0 — try factoring again (repeated root)
        if (Math.abs(simplifiedNum) < 1e-10 && Math.abs(simplifiedDen) < 1e-10) {
            const q2Num = syntheticDivide(quotientNum, a);
            const q2Den = syntheticDivide(quotientDen, a);
            if (q2Num && q2Den) {
                const s2Num = evaluatePolynomialAt(q2Num, a);
                const s2Den = evaluatePolynomialAt(q2Den, a);
                if (Math.abs(s2Den) > 1e-10) {
                    const result = s2Num / s2Den;
                    const answer = Number.isInteger(result) ? String(result) : result.toFixed(6).replace(/\.?0+$/, '');
                    steps.push(`Factor (x - ${a}) again: (${formatPolynomialTerms(q2Num)})/(${formatPolynomialTerms(q2Den)})`);
                    steps.push(`Substitute x = ${a}: ${answer}`);
                    return { success: true, answer, steps };
                }
            }
        }
    } else if (quotientNum) {
        // Only numerator factors — try evaluating the quotient over original denominator
        // This handles cases where denominator is just (x - a) itself
        const simplifiedNum = evaluatePolynomialAt(quotientNum, a);
        steps.push(`Factor (x - ${a}) from numerator: ${formatPolynomialTerms(quotientNum)}`);

        // Check if denominator IS (x - a) — i.e., single binomial
        if (denominator.length <= 2) {
            const denAsQuotient = syntheticDivide(denominator, a);
            if (denAsQuotient && denAsQuotient.length === 1 && Math.abs(denAsQuotient[0].exp) === 0) {
                const denConst = denAsQuotient[0].coeff;
                const result = simplifiedNum / denConst;
                const answer = Number.isInteger(result) ? String(result) : result.toFixed(6).replace(/\.?0+$/, '');
                steps.push(`Cancel common factor, evaluate: ${answer}`);
                return { success: true, answer, steps };
            }
        }
    }

    // Fallback: numerical approach (evaluate very close to a)
    steps.push(`Algebraic simplification inconclusive — using numerical evaluation`);
    const epsilon = 1e-8;
    const leftVal = evaluatePolynomialAt(numerator, a - epsilon) / evaluatePolynomialAt(denominator, a - epsilon);
    const rightVal = evaluatePolynomialAt(numerator, a + epsilon) / evaluatePolynomialAt(denominator, a + epsilon);

    if (Math.abs(leftVal - rightVal) < 0.001) {
        const result = (leftVal + rightVal) / 2;
        const answer = Math.abs(result - Math.round(result)) < 0.0001
            ? String(Math.round(result))
            : result.toFixed(6).replace(/\.?0+$/, '');
        steps.push(`Left-hand limit ≈ ${leftVal.toFixed(6)}, Right-hand limit ≈ ${rightVal.toFixed(6)}`);
        steps.push(`Limit = ${answer}`);
        return { success: true, answer, steps };
    }

    steps.push(`Left and right limits differ — limit does not exist`);
    return { success: true, answer: 'DNE', steps };
}

function processMathMessage(message) {
    const problem = detectMathProblem(message);

    if (!problem) {
        return { hasMath: false };
    }

    const solution = solveProblem(problem);

    return {
        hasMath: true,
        problem,
        solution
    };
}

module.exports = {
    detectMathProblem,
    solveProblem,
    verifyAnswer,
    processMathMessage,
    // Export individual solvers for testing
    solveArithmetic,
    solveLinearEquation,
    solveQuadratic,
    solveFactorQuadratic,
    solveFractionArithmetic,
    solvePercentage,
    solveExponent,
    solveSqrt,
    // Export factoring helpers for testing
    findFactorPair,
    parseFactoredForm,
    areFactoredFormsEquivalent,
    formatBinomialProduct,
    // Export system/linear helpers for testing
    solveGeneralLinear,
    solveSystem,
    parseLinearExpression,
    parseSystemEquation,
    // Export polynomial helpers for testing
    parsePolynomial,
    arePolynomialsEqual,
    // Export substitution solver for testing
    detectSubstitution,
    solveSubstitution,
    // Export probability for testing
    detectProbability,
    solveProbability,
    // Export calculus solvers for testing
    detectDerivative,
    solveDerivative,
    detectLimit,
    solveLimit,
    parsePolynomialTerms,
    formatPolynomialTerms,
    evaluatePolynomialAt,
    syntheticDivide,
    parseLimitExpression,
};
