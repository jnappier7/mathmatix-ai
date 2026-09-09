/**
 * Production regression (the 3x - 7 = 11 conversation replayed in
 * tests/unit/boardScratchPromotion.test.js, student turns S2 and S3): two
 * common shapes of a student's FINAL answer were invisible to
 * observe.extractAnswer, so the turn classified general_math with no answer
 * and diagnose returned no_answer — the claim was never graded.
 *
 *   1. LaTeX-wrapped values. The chat composer and MathLive emit fractions as
 *      \(\frac{4}{3}\), so "x = \(\frac{4}{3}\)" is what a real student sends.
 *      varAssignment only understands ASCII, so `x = \(` matched nothing.
 *   2. A claim stated after a named operation in the same line:
 *      "divide by 3. x = 4/3. final answer". varAssignment is start-anchored.
 *
 * And a third, quieter one: "11 - 7 = 4. so x = 4/3 right?" WAS extracted —
 * as "4.", from its first clause (arithmeticStatement fired before the
 * self-check pattern ever ran). The last stated claim is the answer; the
 * clauses before it are work.
 */

jest.mock('../../utils/logger', () => ({
  child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const {
  observe, extractAnswer, normalizeLatexAnswerText, MESSAGE_TYPES,
} = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');

const ctx = { recentUserMessages: [], recentAssistantMessages: [] };
const obs = (m) => observe(m, ctx);

// The exact production turns.
const S2 = '11 - 7 = 4. thats what i said. so x = \\(\\frac{4}{3}\\) right?';
const S3 = 'divide by 3. x = 4/3. final answer';

describe('normalizeLatexAnswerText', () => {
  it('unwraps \\(…\\) and collapses a numeric \\frac to a/b', () => {
    expect(normalizeLatexAnswerText('x = \\(\\frac{4}{3}\\)')).toBe('x = 4/3');
    expect(normalizeLatexAnswerText('\\(x = \\dfrac{4}{3}\\)')).toBe('x = 4/3');
    expect(normalizeLatexAnswerText('x = -\\(\\frac{4}{3}\\)')).toBe('x = -4/3');
    expect(normalizeLatexAnswerText('\\[\\frac{1.5}{2}\\]')).toBe('1.5/2');
  });

  it('keeps a symbolic \\frac grouped', () => {
    expect(normalizeLatexAnswerText('\\(\\frac{x+1}{2}\\)')).toBe('(x+1)/(2)');
  });

  it('is the identity on plain text', () => {
    expect(normalizeLatexAnswerText('x = 4/3')).toBe('x = 4/3');
    expect(normalizeLatexAnswerText('so x = 4/3 right?')).toBe('so x = 4/3 right?');
  });
});

describe('LaTeX-wrapped final answers (extractAnswer)', () => {
  it.each([
    ['x = \\(\\frac{4}{3}\\)', '4/3'],
    ['\\(x = \\frac{4}{3}\\)', '4/3'],
    ['x = -\\(\\frac{4}{3}\\)', '-4/3'],
    ['\\(\\frac{4}{3}\\)', '4/3'],
    ['x = \\(7\\)', '7'],
    ['the answer is \\(\\frac{5}{12}\\)', '5/12'],
  ])('%s → %s', (msg, value) => {
    const a = extractAnswer(msg);
    expect(a).not.toBeNull();
    expect(a.value).toBe(value);
    expect(a.raw).toBe(msg);            // raw stays the original text
  });

  it('reads the self-check form as a proposed answer', () => {
    const a = extractAnswer('so x = \\(\\frac{4}{3}\\) right?');
    expect(a.value).toBe('4/3');
    expect(a.proposed).toBe(true);
  });

  it('matches the plain-ASCII result exactly', () => {
    expect(extractAnswer('x = \\(\\frac{4}{3}\\)').value).toBe(extractAnswer('x = 4/3').value);
    expect(extractAnswer('so x = \\(\\frac{4}{3}\\) right?').value)
      .toBe(extractAnswer('so x = 4/3 right?').value);
  });
});

describe('last stated claim in a multi-clause line (extractAnswer)', () => {
  it('reads a variable assignment stated after a named operation', () => {
    const a = extractAnswer(S3);
    expect(a.value).toBe('4/3');
    expect(a.hasExplanation).toBe(true);   // "divide by 3" is the work
  });

  it('prefers the last claim over an earlier arithmetic line', () => {
    // Was "4." — arithmeticStatement read the first clause.
    const a = extractAnswer('11 - 7 = 4. so x = 4/3 right?');
    expect(a.value).toBe('4/3');
    expect(a.hasExplanation).toBe(true);
  });

  it('handles the production turn S2 (LaTeX + prose between the clauses)', () => {
    expect(extractAnswer(S2).value).toBe('4/3');
  });

  it('reads "3x = 12. x = 4" like the newline form', () => {
    expect(extractAnswer('3x = 12. x = 4').value).toBe('4');
    expect(extractAnswer('3x = 12\nx = 4').value).toBe('4');
  });

  it('never splits a decimal', () => {
    expect(extractAnswer('x = 4.5').value).toBe('4.5');
    expect(extractAnswer('so x = 4.5 right?').value).toBe('4.5');
  });

  it('falls through unchanged when the last clause is not an answer shape', () => {
    // Whole-text patterns still win: varAssignment is at the start.
    expect(extractAnswer('x = 4/3. i divided both sides by 3').value).toBe('4/3');
    // An equation line is still work, not an answer.
    expect(extractAnswer('x + 2 = 5. 3x = 9')).toBeNull();
  });
});

describe('observe classifies the claim as an answer attempt', () => {
  it.each([
    ['x = \\(\\frac{4}{3}\\)', '4/3'],
    ['so x = \\(\\frac{4}{3}\\) right?', '4/3'],
    [S2, '4/3'],
    [S3, '4/3'],
    ['11 - 7 = 4. so x = 4/3 right?', '4/3'],
  ])('%s', (msg, value) => {
    const o = obs(msg);
    expect(o.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(o.answer.value).toBe(value);
  });

  it('a MathLive self-check with a question mark is an attempt, not a question', () => {
    const o = obs('is it \\(\\frac{5}{12}\\)?');
    expect(o.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(o.answer.value).toBe('5/12');
    expect(o.answer.proposed).toBe(true);
  });

  it('leaves the ASCII forms exactly as they were', () => {
    expect(obs('x = 4/3').answer.value).toBe('4/3');
    expect(obs('so x = 4/3 right?').answer).toMatchObject({ value: '4/3', proposed: true });
  });
});

describe('end-to-end diagnose — the claim is graded, not no_answer', () => {
  it.each([
    ['LaTeX self-check', 'so x = \\(\\frac{4}{3}\\) right?'],
    ['production S2', S2],
  ])('a WRONG claim reaches the verifier with the value read (%s)', async (_label, msg) => {
    // Against 3x = 12 the solver disagrees with 4/3; with no LLM in the test
    // run a rejection cannot be corroborated, so the documented verdict is
    // `unverifiable` ("they DID submit work and verification could not
    // decide") — never `no_answer`, which is what these turns produced before.
    const d = await diagnose(obs(msg), { ...ctx, pinnedProblemTex: '3x = 12' });
    expect(d.type).toBe('unverifiable');
    expect(d.answer).toBe('4/3');
  });

  it('grades the LaTeX fraction CORRECT against 3x = 4', async () => {
    const d = await diagnose(obs('x = \\(\\frac{4}{3}\\)'), {
      ...ctx, pinnedProblemTex: '3x = 4',
    });
    expect(d.type).toBe('correct');
    expect(d.isCorrect).toBe(true);
  });

  it('grades S3 ("divide by 3. x = 4/3. final answer") against 3x = 4', async () => {
    const d = await diagnose(obs(S3), { ...ctx, pinnedProblemTex: '3x = 4' });
    expect(d.type).toBe('correct');
    expect(d.isCorrect).toBe(true);
  });
});
