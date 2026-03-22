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

    const text = message.trim().toLowerCase();

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

    // Pattern: Linear equation "solve for x: 2x + 3 = 7" or "2x + 3 = 7"
    const linearPattern = /(-?\d*\.?\d*)\s*x\s*([+\-])\s*(\d+\.?\d*)\s*=\s*(-?\d+\.?\d*)/i;
    const linearMatch = message.match(linearPattern);
    if (linearMatch) {
        return {
            type: 'linear_equation',
            coefficient: parseFloat(linearMatch[1] || '1'),
            operator: linearMatch[2],
            constant: parseFloat(linearMatch[3]),
            result: parseFloat(linearMatch[4])
        };
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
            case 'quadratic_equation':
                return solveQuadratic(problem);
            case 'factor_quadratic':
                return solveFactorQuadratic(problem);
            case 'fraction_arithmetic':
                return solveFractionArithmetic(problem);
            case 'percentage':
                return solvePercentage(problem);
            case 'exponent':
                return solveExponent(problem);
            case 'sqrt':
                return solveSqrt(problem);
            case 'evaluation':
                return solveEvaluation(problem);
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
 * Solve quadratic equation ax² + bx + c = 0
 */
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
    const studentNum = parseFloat(studentStr.replace(/[^\d.\-]/g, ''));
    const correctNum = parseFloat(correctStr.replace(/[^\d.\-]/g, ''));

    if (!isNaN(studentNum) && !isNaN(correctNum)) {
        if (Math.abs(studentNum - correctNum) <= tolerance) {
            return { isCorrect: true, exact: false, difference: Math.abs(studentNum - correctNum) };
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

    // Factored form comparison: (x+a)(x+b) vs (x+b)(x+a) — commutative property
    const studentFactors = parseFactoredForm(studentStr);
    const correctFactors = parseFactoredForm(correctStr);

    if (studentFactors && correctFactors) {
        if (areFactoredFormsEquivalent(studentFactors, correctFactors)) {
            return { isCorrect: true, exact: false, equivalentForm: true };
        }
    }

    return { isCorrect: false };
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
};
