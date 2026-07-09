/**
 * arithmeticMatchesAnswer UNIT TESTS
 *
 * The self-contained arithmetic check may override a solver "wrong" verdict, but
 * ONLY when the stated arithmetic result is actually the student's answer. These
 * lock that gate so an incidental true calculation in a longer explanation can't
 * flip a genuinely wrong answer to "correct" (a false-correct source).
 */

const { arithmeticMatchesAnswer } = require('../../utils/pipeline/diagnose');

describe('arithmeticMatchesAnswer', () => {
  test('trusts the override when the arithmetic result IS the answer', () => {
    // "13 - 8 is 5" → result 5, answer "5"
    expect(arithmeticMatchesAnswer(5, '5')).toBe(true);
    expect(arithmeticMatchesAnswer(5, 5)).toBe(true);
    expect(arithmeticMatchesAnswer(2.75, '2.75')).toBe(true);
  });

  test('does NOT trust an incidental calculation that is not the answer', () => {
    // Student's real answer is 3, but they mentioned "4 x 2 is 8" in passing.
    expect(arithmeticMatchesAnswer(8, '3')).toBe(false);
  });

  test('does not fire when there was no matched arithmetic', () => {
    expect(arithmeticMatchesAnswer(null, '5')).toBe(false);
    expect(arithmeticMatchesAnswer(undefined, '5')).toBe(false);
  });

  test('does not fire for non-numeric answers', () => {
    expect(arithmeticMatchesAnswer(5, 'x = 5')).toBe(false); // answer not a bare number
    expect(arithmeticMatchesAnswer(3, '2 3/4')).toBe(false);
    expect(arithmeticMatchesAnswer(5, '')).toBe(false);
  });

  test('tolerates tiny floating-point drift', () => {
    expect(arithmeticMatchesAnswer(0.1 + 0.2, '0.3')).toBe(true);
  });
});
