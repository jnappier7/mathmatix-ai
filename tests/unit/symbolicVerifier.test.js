const { symbolicVerify, equivalent, verifyAntiderivative, latexToExpr, extractIntegral, detectPosedArithmetic, bareNumericAnswer } = require('../../utils/pipeline/symbolicVerifier');

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
