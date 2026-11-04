/**
 * Right answers called wrong — the classes the verdict-accuracy eval found on
 * 2026-11-03 (tests/eval/verdict). One block per mechanism; the live eval is
 * the end-to-end check, these pin each seam.
 */

const { parseCleanProblem, verifyAnswer } = require('../../utils/mathSolver');
const { evalExpression } = require('../../utils/rationalEvaluator');
const { normalizeMathUnicode } = require('../../utils/mathUnicodeNormalizer');
const { verifyDerivation } = require('../../utils/derivationVerifier');
const { hasIdeaWords } = require('../../utils/pipeline/ideaWords');
const { extractAnswer } = require('../../utils/pipeline/observe');
const { symbolicVerify } = require('../../utils/pipeline/symbolicVerifier');

const keyOf = (text) => parseCleanProblem(text).solution?.answer;

describe('mixed numbers key correctly', () => {
  test.each([
    ["What's \\(1\\frac{1}{2} \\div \\frac{3}{4}\\)?", '2'],      // was 2/3 (whole part dropped)
    ['1\\frac{1}{2} \\div \\frac{3}{4}', '2'],                      // was 22/3 (read as 11/2)
    ['1 1/2 ÷ 3/4', '2'],                                           // was 1/8 (left-to-right division)
    ['What is 1 1/2 divided by 3/4?', '2'],                         // was 0.6667 ("2 divided by 3")
    ['What is 2 1/3 divided by 1/2?', '4 2/3'],
    ["What's \\(2\\frac{1}{3} + 1\\frac{1}{2}\\)?", '3 5/6'],
    ['2 1/3 + 1 1/2', '3 5/6'],
    ['What is 3/4 divided by 1/2?', '3/2'],
  ])('%s → %s', (text, key) => {
    expect(keyOf(text)).toBe(key);
  });

  test('a tight fraction is one number; spaced slashes stay operators', () => {
    expect(evalExpression('6 / 3/4').answer).toBe('8');
    expect(evalExpression('16/4*2').answer).toBe('8');
    expect(evalExpression('12 / 6 / 2').answer).toBe('1');
    expect(evalExpression('1.5/3').answer).toBe('0.5');
  });

  test('LaTeX mixed number only for a whole number against a proper fraction', () => {
    expect(normalizeMathUnicode('1\\frac{1}{2}')).toBe('1 1/2');
    expect(normalizeMathUnicode('2\\frac{5}{3}')).toBe('2(5)/(3)');     // improper: not mixed
    expect(normalizeMathUnicode('x^2\\frac{1}{2}')).toBe('x^2(1)/(2)'); // exponent, not a whole part
  });
});

describe('a systems answer is not a one-variable chain', () => {
  test('"2x = 14 so x = 7, then y = 3" is left to the whole-answer graders', () => {
    const r = verifyDerivation('2x = 14 so x = 7, then y = 3', 'x + y = 10 and x - y = 4');
    expect(r.verifiable).toBe(false);
    expect(r.reason).toBe('more than one unknown');
  });

  test('…and its answer is read as the pair, not the last number', () => {
    expect(extractAnswer('2x = 14 so x = 7, then y = 3')?.value).toBe('x=7, y=3');
    expect(extractAnswer('if x = 3, y = 7')?.value).not.toBe('x=3, y=7');
    expect(extractAnswer('3x = 9 so x = 3')?.value).toBe('3');
  });

  test('a single-unknown chain still grades', () => {
    const r = verifyDerivation('3x - 7 = 11\n3x = 18\nx = 6', '3x - 7 = 11');
    expect(r.verifiable).toBe(true);
    expect(r.valid).toBe(true);
  });
});

describe('numbers with units and primes are math, not ideas', () => {
  test.each(['52 degrees', '15 days', '28 units squared', 'there are 15 days', "f'(x) = 3x^2 - 5 so f'(1) = -2"])(
    '%s → no idea words', (t) => expect(hasIdeaWords(t)).toBe(false));
  test.each(["it's a hole", 'it has a hole at 2', 'the slope is 4 because rise over run'])(
    '%s → idea words', (t) => expect(hasIdeaWords(t)).toBe(true));
});

describe('a lead-in before an expression keeps the whole expression', () => {
  test.each([
    ['i got 2e^(2x)', '2e^(2x)'],          // was "2"
    ['its 2e^(2x)', '2e^(2x)'],
    ['its 12(3x + 1)^3', '12(3x+1)^3'],   // was "12"
    ['i got 2x/(x^2 + 1)', '2x/(x^2+1)'],
    ['i got 4 2/3', '4 2/3'],             // was "4" — a mixed number cut to its whole part
    ['its 3 5/6', '3 5/6'],
    ['i got 5√2', '5sqrt2'],              // was "5" — the coefficient alone
    ['its 6π', '6pi'],
    ['i got 2x sin x + x^2 cos x', '2x sin x + x^2 cos x'],
  ])('%s → %s', (text, value) => expect(extractAnswer(text)?.value).toBe(value));

  test('shown work is not read as "3 * 3 = 12"', () => {
    expect(extractAnswer('4(3x+1)^3 * 3 = 12(3x+1)^3')?.value).not.toBe('12');
    expect(extractAnswer('3 times 12 is 36')?.value).toBe('36');
  });

  test('words that are math are not units', () => {
    expect(extractAnswer('5 times 3')?.value).not.toBe('5');
    expect(extractAnswer('4 pi')?.value).not.toBe('4');
  });

  test.each([
    ['i got 6', '6'],
    ['i got 6 because 2 times 3', '6'],
    ['its 3/8', '3/8'],
    ['its 5 cm', '5'],
    ['the answer is 42.', '42.'],
    ['52 degrees', '52'],                 // a number and its unit is a number
    ['30 square units', '30'],
    ['15 days', '15'],
  ])('plain numbers unchanged: %s → %s', (text, value) => expect(extractAnswer(text)?.value).toBe(value));
});

describe('+ c is + C', () => {
  test('lowercase constant of integration matches', () => {
    expect(symbolicVerify({ studentAnswer: 'x^3 + c', correctAnswer: 'x^3 + C' }).isCorrect).toBe(true);
  });
  test('a wrong antiderivative is still wrong', () => {
    expect(symbolicVerify({ studentAnswer: '6x + c', correctAnswer: 'x^3 + C' }).isCorrect).toBe(false);
  });
});

describe('π answers', () => {
  test.each([['6pi', true], ['6 pi', true], ['6π', true], ['18.85', true], ['6', false], ['9π', false]])(
    '%s against 6π → %s', (a, ok) => expect(verifyAnswer(a, '6π').isCorrect).toBe(ok));
});
