const { symbolicVerify, equivalent, verifyAntiderivative, verifyEquationSolution, extractEquation, latexToExpr, extractIntegral, detectPosedArithmetic, bareNumericAnswer } = require('../../utils/pipeline/symbolicVerifier');

describe('symbolicVerifier — posed-arithmetic detection (the 50x3 fumble)', () => {
  it('extracts the arithmetic the tutor asked to compute', () => {
    expect(detectPosedArithmetic("what's 50 × 3?")).toBe('50*3');
    expect(detectPosedArithmetic('multiply 10 × 5 × 3')).toBe('10*5*3');
    expect(detectPosedArithmetic('what is 50 + 50 + 50?')).toBe('50+50+50');
    expect(detectPosedArithmetic('so what is 4 − 1?')).toBe('4-1');
  });
  it('does NOT fire on algebra, dimensions, or list numbers (no false positives)', () => {
    expect(detectPosedArithmetic('the derivative of x^4 is 4x^3')).toBeNull();      // algebra
    expect(detectPosedArithmetic('a prism has length 7 cm and width 2.6 cm')).toBeNull(); // list, no operator
    expect(detectPosedArithmetic('you got problem 3 right')).toBeNull();           // lone number
    expect(detectPosedArithmetic('')).toBeNull();
  });
  it('bareNumericAnswer accepts a bare answer, rejects expressions/prose', () => {
    expect(bareNumericAnswer('150')).toBe('150');
    expect(bareNumericAnswer('72 cm^3')).toBe('72');
    expect(bareNumericAnswer('-2')).toBe('-2');
    expect(bareNumericAnswer('50*3=150')).toBeNull();   // an expression
    expect(bareNumericAnswer('x^2')).toBeNull();        // no number
    expect(bareNumericAnswer('i think 3 or maybe 4')).toBeNull(); // two numbers
  });
  it('end-to-end: a bare answer to a posed computation verifies correctly', () => {
    // tutor: "what's 50 × 3?"  student: "150"  -> equivalent('50*3','150') = true
    expect(equivalent(detectPosedArithmetic("what's 50 × 3?"), bareNumericAnswer('150'))).toBe(true);
    expect(equivalent(detectPosedArithmetic("what's 50 × 3?"), bareNumericAnswer('140'))).toBe(false);
  });
});

describe('symbolicVerifier — extractIntegral + problemTex path', () => {
  it('pulls the integrand + variable from integral problem tex', () => {
    expect(extractIntegral('\\int (6x^5 - 4x)\\,dx')).toMatchObject({ variable: 'x' });
    expect(extractIntegral('\\int 3x^{2} dx').integrand).toContain('3x^(2)');
    expect(extractIntegral('solve 2x+4=20')).toBeNull();
  });
  it('verifies an integral straight from the problem tex (no stored answer)', () => {
    const v = symbolicVerify({ studentAnswer: 'x^{4} + x^{2} + C', problemTex: '\\int (4x^3 + 2x)\\,dx' });
    expect(v.isCorrect).toBe(true);
    expect(v.method).toBe('antiderivative');
  });
  it('flags a wrong integral answer against the problem tex', () => {
    const v = symbolicVerify({ studentAnswer: 'x^{4} + C', problemTex: '\\int (4x^3 + 2x)\\,dx' });
    expect(v.isCorrect).toBe(false);
  });
});

describe('symbolicVerifier — latexToExpr', () => {
  it('converts the LaTeX student answers actually arrive as', () => {
    expect(latexToExpr('x^{6}')).toBe('x^(6)');
    expect(latexToExpr('\\frac{2}{3}x^{3/2}')).toContain('(2)/(3)');
    expect(latexToExpr('\\sqrt{x}')).toBe('sqrt(x)');
    expect(latexToExpr('2\\cdot x')).toBe('2* x');
    expect(latexToExpr('\\left(x+1\\right)^{2}')).toContain('(x+1)^(2)');
  });
  it('returns null on empty / junk, never throws', () => {
    expect(latexToExpr('')).toBeNull();
    expect(latexToExpr(null)).toBeNull();
  });
});

describe('symbolicVerifier — equivalent (numeric)', () => {
  it('accepts equal-but-different forms', () => {
    expect(equivalent('2*(x+3)', '2x+6')).toBe(true);        // expanded/factored
    expect(equivalent('10/24', '5/12')).toBe(true);          // un-simplified fraction
    expect(equivalent('x^2 - x^2 + 3x', '3x')).toBe(true);   // rearranged/cancelling
    expect(equivalent('0.5', '1/2')).toBe(true);             // decimal vs fraction
    expect(equivalent('(x^2-1)/(x-1)', 'x+1')).toBe(true);   // simplifiable rational
  });
  it('rejects genuinely different expressions', () => {
    expect(equivalent('2x+6', '2x+5')).toBe(false);
    expect(equivalent('x^2', 'x^3')).toBe(false);
  });
  it('returns null (undecidable) on unparseable input', () => {
    expect(equivalent('%%%', 'x')).toBeNull();
  });
});

describe('symbolicVerifier — verifyAntiderivative (the live-failing case)', () => {
  it('verifies a correct multi-term integral by differentiating it back', () => {
    // ∫(6x^5 - 4x + sqrt(x)) dx  =  x^6 - 2x^2 + (2/3)x^(3/2) + C
    expect(verifyAntiderivative('x^6 - 2x^2 + (2/3)x^(3/2) + C', '6x^5 - 4x + sqrt(x)')).toBe(true);
    // and the simplest one from the session: ∫2x dx = x^2 + C
    expect(verifyAntiderivative('x^2 + C', '2x')).toBe(true);
    // ∫(4x^3 + 2x) dx = x^4 + x^2 + C
    expect(verifyAntiderivative('x^4 + x^2 + C', '4x^3 + 2x')).toBe(true);
  });
  it('accepts a correct answer even without the +C written', () => {
    expect(verifyAntiderivative('x^2', '2x')).toBe(true);
  });
  it('rejects wrong integrals (missing term, wrong coefficient)', () => {
    expect(verifyAntiderivative('x^6 - 2x^2 + C', '6x^5 - 4x + sqrt(x)')).toBe(false); // dropped sqrt term
    expect(verifyAntiderivative('2x^2 + C', '4x^3 + 2x')).toBe(false);                 // wrong first term
  });
});

describe('symbolicVerifier — symbolicVerify (top-level)', () => {
  it('resolves the integral via the antiderivative path (no stored answer needed)', () => {
    const v = symbolicVerify({ studentAnswer: 'x^6 - 2x^2 + (2/3)x^(3/2) + C', integrand: '6x^5 - 4x + sqrt(x)' });
    expect(v.isCorrect).toBe(true);
    expect(v.method).toBe('antiderivative');
  });
  it('resolves algebra via equivalence against the correct answer', () => {
    expect(symbolicVerify({ studentAnswer: '\\frac{10}{24}', correctAnswer: '5/12' }).isCorrect).toBe(true);
    expect(symbolicVerify({ studentAnswer: '2x+5', correctAnswer: '2x+6' }).isCorrect).toBe(false);
  });
  it('returns isCorrect:null (never a false verdict) when it cannot decide', () => {
    expect(symbolicVerify({ studentAnswer: 'the answer is blue', correctAnswer: 'x=4' }).isCorrect).toBeNull();
    expect(symbolicVerify({}).isCorrect).toBeNull();
  });
  it('NEVER throws, whatever the input', () => {
    expect(() => symbolicVerify({ studentAnswer: '\\frac{', correctAnswer: '}{}\\' })).not.toThrow();
    expect(() => symbolicVerify(null)).not.toThrow();
  });
});

describe('symbolicVerifier — equation-solution verification (substitute & check)', () => {
  it('splits an equation problem tex into lhs/rhs', () => {
    expect(extractEquation('2x + 4 = 20')).toMatchObject({ lhs: '2x + 4', rhs: '20' });
    expect(extractEquation('x^{2} - 5x + 6 = 0')).toBeTruthy();
    expect(extractEquation('3x^2 + 4x - 7')).toBeNull();     // no '=', not an equation
    expect(extractEquation('a = b = c')).toBeNull();          // ambiguous, not one equation
  });

  it('confirms a correct linear solution and rejects a wrong one', () => {
    expect(verifyEquationSolution('x = 8', '2x + 4 = 20')).toBe(true);   // 2*8+4=20 ✓
    expect(verifyEquationSolution('x = 7', '2x + 4 = 20')).toBe(false);  // 18 ≠ 20
    expect(verifyEquationSolution('x = -7/3', '3x + 7 = 0')).toBe(true); // fractions
  });

  it('confirms BOTH roots of a quadratic the deterministic solver can\'t parse', () => {
    expect(verifyEquationSolution('x = 2 or x = 3', 'x^2 - 5x + 6 = 0')).toBe(true);
    expect(verifyEquationSolution('x = 2 or x = 5', 'x^2 - 5x + 6 = 0')).toBe(false); // 5 isn't a root
  });

  it('REFUSES to grade a bare intermediate number against the equation (no false-flag)', () => {
    // Student is mid-solve on 2x+4=20; tutor asked "what is 2x?"; student says "16".
    // "16" satisfies nothing about the *whole* equation, but it's a correct step —
    // the verifier must decline (null), never return false.
    expect(verifyEquationSolution('16', '2x + 4 = 20')).toBeNull();
    expect(verifyEquationSolution('8', '2x + 4 = 20')).toBeNull();   // even the right value, bare -> decline
  });

  it('wires through symbolicVerify via problemTex (method: equation)', () => {
    const v = symbolicVerify({ studentAnswer: 'x = 8', problemTex: '2x + 4 = 20' });
    expect(v.isCorrect).toBe(true);
    expect(v.method).toBe('equation');
    expect(symbolicVerify({ studentAnswer: 'x = 3', problemTex: 'x^2 - 5x + 6 = 0' }).isCorrect).toBe(true);
    // an integral problemTex must still take the antiderivative path, not equation
    expect(symbolicVerify({ studentAnswer: 'x^6 + C', problemTex: '\\int 6x^5\\,dx' }).method).toBe('antiderivative');
  });

  // Regression: the verifier used to assume the unknown was always 'x', so any
  // problem in m/p/b/t/… returned null and fell through to the LLM. Now it
  // auto-detects the variable from the equation.
  it('auto-detects the unknown for non-x variables (m, p, t, …)', () => {
    expect(verifyEquationSolution('p = 60', 'p/12 + 3 = 8')).toBe(true);       // #6
    expect(verifyEquationSolution('p = 50', 'p/12 + 3 = 8')).toBe(false);
    expect(verifyEquationSolution('m = 25', '(1/5)m + 6 = 11')).toBe(true);    // #2
    expect(verifyEquationSolution('t = 12', '50t = 60(t - 2)')).toBe(true);    // #5 setup
    expect(symbolicVerify({ studentAnswer: 'p = 60', problemTex: 'p/12 + 3 = 8' }).isCorrect).toBe(true);
  });

  it('verifies absolute-value equations (|…| -> abs), including both roots', () => {
    expect(verifyEquationSolution('b = 2 or b = -3', '|2b + 1| = 5')).toBe(true);  // #8
    expect(verifyEquationSolution('b = 4', '|2b + 1| = 5')).toBe(false);
  });

  it('still declines a multi-variable / literal equation (no single value to check)', () => {
    expect(verifyEquationSolution('d = 2', 't = 5d')).toBeNull();
  });
});
