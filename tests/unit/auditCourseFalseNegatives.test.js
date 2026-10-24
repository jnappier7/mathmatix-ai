/**
 * Correct, fully-worked course answers grade as correct (course audit C03).
 *
 * External course audit, 2026-10-18..23, §4: twelve correct submissions with
 * shown work were recorded as misses and accepted only when repeated. Replayed
 * through observe → diagnose (tests/fixtures/auditCourseFalseNegatives.json),
 * 9 of the 13 answers graded INCORRECT, one found no answer and one stayed
 * undecided; the other two were "correct" only by luck, off the wrong token.
 * Every one traced to the same few seams:
 *
 *   - extraction took the FIRST "= n" or the first number after a cue, not the
 *     claim the work ends on: "4 × 8 + 3 = 35, so 4 3/8 = 35/8" → 35,
 *     "five tenths, 0.5, 5/10" → 5, "6 × 4 = 24 cm². That's 4 rows of 6" → 4;
 *   - a thousands comma cut the posed problem short: "3,004 − 1,567" stored
 *     the key 3, and "add 448 and 1,920" the key 449;
 *   - the derivation chain ended on the CHECK line ("1,437 + 1,567 = 3,004")
 *     and judged true partial products against the final answer;
 *   - "Compare 3/7 and 2/5" stored 3/7's value as the key of a comparison;
 *   - and the LLM verifier's deterministic step rejected the mis-extracted
 *     token at 0.98 confidence ("5" vs "0.5") without reading the reply.
 *
 * The LLM verifier runs for real here; only its network call is stubbed, with
 * step 1 returning what a model computes for the problem. When a case would
 * need the step-2 LLM judge the stub throws, so a pass means the verdict was
 * reached deterministically.
 */

jest.mock('../../utils/logger', () => ({
  child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));

const { callLLM } = require('../../utils/llmGateway');
const { observe, extractAnswer } = require('../../utils/pipeline/observe');
const { diagnose, gradeComparison } = require('../../utils/pipeline/diagnose');
const { parseCleanProblem } = require('../../utils/mathSolver');
const { llmVerifyAnswer } = require('../../utils/pipeline/llmVerifier');
const { verifyDerivation, isTrueArithmeticFact } = require('../../utils/derivationVerifier');
const { stripThousandsSeparators } = require('../../utils/mathUnicodeNormalizer');
const fixture = require('../fixtures/auditCourseFalseNegatives.json');

// What a model's step 1 returns for each posed problem (the expected value,
// unless the natural phrasing carries a unit or a form).
const MODEL_ANSWER = {
  rectangle_area_6x4: '24 cm²',
  compare_3_7_vs_2_5: '3/7',
  mixed_to_improper_4_3_8: '35/8',
  improper_to_mixed_19_5: '3 4/5',
};

let current;
beforeEach(() => {
  callLLM.mockImplementation(async (_model, messages) => {
    if (/answer engine/.test(messages[0].content)) {
      return { choices: [{ message: { content: JSON.stringify({ answer: MODEL_ANSWER[current.id] || current.expected }) } }] };
    }
    throw new Error('step-2 judge needed');
  });
});

/** The tutor turn as persist stores it, then the student turn graded against it. */
async function replay(c) {
  current = c;
  const parsed = parseCleanProblem(c.tutor);
  const problemInfo = parsed.hasMath && parsed.solution?.success
    ? { type: parsed.problem.type, correctAnswer: String(parsed.solution.answer) }
    : null;
  const recentAssistantMessages = [{ content: c.tutor, problemInfo }];
  const observation = observe(c.student, { recentUserMessages: [], recentAssistantMessages });
  const candidate = observation.answer?.value || null;
  const llmVerificationPromise = candidate
    ? llmVerifyAnswer(c.tutor, candidate, { fullStudentMessage: c.student })
    : null;
  const diagnosis = await diagnose(observation, { recentAssistantMessages, llmVerificationPromise });
  return { observation, diagnosis, problemInfo };
}

describe('every audited false negative grades correct', () => {
  test.each(fixture.cases.map(c => [c.id, c]))('%s', async (_id, c) => {
    const { observation, diagnosis } = await replay(c);
    expect(observation.messageType).toBe('answer_attempt');
    expect(diagnosis.type).toBe('correct');
    expect(diagnosis.isCorrect).toBe(true);
    // The work was on screen: decide must affirm it, not ask for it again
    // ("can you walk me through your steps?") or probe the method.
    expect(diagnosis.demonstratedReasoning).toBe(true);
    expect(diagnosis.methodAudit).toBeNull();
    // A correct verdict never carries a misconception — the false
    // "Watch for This: Incorrect addition of fractions" card came from one.
    expect(diagnosis.misconception).toBeNull();
  });
});

describe('the answer is the claim the work ends on', () => {
  test.each([
    ['4 × 8 + 3 = 35, so 4 3/8 = 35/8', '35/8'],
    ['The denominators are the same, so subtract the numerators: 3 − 2 = 1. 3/8 − 2/8 = 1/8', '1/8'],
    ['First make the denominators match: 3/5 = 9/15. Then 9/15 + 2/15 = 11/15. So 3/5 + 2/15 = 11/15', '11/15'],
    ['19 ÷ 5 = 3 remainder 4, so 19/5 = 3 4/5. Check: 3 × 5 + 4 = 19', '3 4/5'],
    ['Area = length × width = 6 × 4 = 24 cm². That\'s 4 rows of 6 unit squares, 24 squares in all.', '24'],
    ['2(3)+4=6+4=10', '10'],
  ])('%s → %s', (msg, value) => {
    expect(extractAnswer(msg).value).toBe(value);
  });

  test('one value in several equivalent forms is that value, and counts as explained', () => {
    const a = extractAnswer('The 5 is in the tenths place, so its value is five tenths, 0.5, 5/10');
    expect(['0.5', '5/10']).toContain(a.value);
    expect(a.multipleForms).toBe(true);
    expect(extractAnswer('five tenths: 0.5 = 5/10').multipleForms).toBe(true);
  });

  test('forms that disagree are not one answer', () => {
    expect(extractAnswer('0.5, 5/100')?.multipleForms).toBeFalsy();
  });

  test('a check line is never the answer', () => {
    expect(extractAnswer('So 3,004 − 1,567 = 1,437\nCheck: 1,437 + 1,567 = 3,004').value).toBe('1437');
  });

  test('a comparison closing the work is the answer', () => {
    expect(extractAnswer('3/7 = 15/35 and 2/5 = 14/35. Since 15 > 14, 3/7 > 2/5').value).toBe('3/7 > 2/5');
  });

  test('unchanged: an equation is not a claim, and the last stated claim still wins', () => {
    expect(extractAnswer('x + 3 = 5')).toBeNull();
    expect(extractAnswer('11 - 7 = 4. so x = 4/3 right?').value).toBe('4/3');
  });
});

describe('thousands separators', () => {
  test('are dropped in numbers, kept in lists and pairs', () => {
    expect(stripThousandsSeparators('3,004 − 1,567')).toBe('3004 − 1567');
    expect(stripThousandsSeparators('1,234,567')).toBe('1234567');
    expect(stripThousandsSeparators('6,8,10')).toBe('6,8,10');
    expect(stripThousandsSeparators('(1,234)')).toBe('(1,234)');
    expect(stripThousandsSeparators('0.507')).toBe('0.507');
  });

  test('no longer truncate the posed problem', () => {
    expect(Number(parseCleanProblem('Now try this one: 3,004 − 1,567.').solution.answer)).toBe(1437);
    expect(Number(parseCleanProblem('What do you get when you add 448 and 1,920?').solution.answer)).toBe(2368);
  });
});

describe('comparisons', () => {
  test('a comparison question stores no single-value key', () => {
    expect(parseCleanProblem('Compare 3/7 and 2/5. Which fraction is greater?').hasMath).toBe(false);
    expect(parseCleanProblem('What is 3/8 − 2/8?').hasMath).toBe(true);
  });

  test('graded against the pair the tutor posed, in either direction', () => {
    const q = 'Compare 3/7 and 2/5. Which fraction is greater?';
    expect(gradeComparison('3/7 > 2/5', q)).toBe(true);
    expect(gradeComparison('2/5 < 3/7', q)).toBe(true);
    expect(gradeComparison('15/35 > 14/35', q)).toBe(true);
    expect(gradeComparison('2/5 > 3/7', q)).toBe(false);
    expect(gradeComparison('1/2 > 1/3', q)).toBeNull();   // not the posed pair
  });
});

describe('shown arithmetic work', () => {
  test('true sub-computations are sound steps, not a broken chain', () => {
    const r = verifyDerivation('7 × 64 = 448\n30 × 64 = 1,920\n448 + 1,920 = 2,368\n64 × 37 = 2,368', null, '2368');
    expect(r).toMatchObject({ valid: true, answerCorrect: true });
  });

  test('a FALSE sub-computation still breaks the chain without failing a right answer', () => {
    const r = verifyDerivation('7 × 64 = 448\n30 × 64 = 1,902\n64 × 37 = 2,368', null, '2368');
    expect(r).toMatchObject({ valid: false, answerCorrect: true, firstBadStep: '30 × 64 = 1902' });
  });

  test('a decimal is not a list number, and a minus is not a bullet', () => {
    expect(verifyDerivation('2.75 + 1.68 = 4.43\nCheck: 4.43 - 1.68 = 2.75', null, '4.43'))
      .toMatchObject({ valid: true, answerCorrect: true });
  });

  test('facts: mixed numbers, remainders, false claims', () => {
    expect(isTrueArithmeticFact('4 × 8 + 3 = 35, so 4 3/8 = 35/8')).toBe(true);
    expect(isTrueArithmeticFact('19 ÷ 5 = 3 remainder 4')).toBe(true);
    expect(isTrueArithmeticFact('19 ÷ 5 = 3 remainder 5')).toBe(false);
    expect(isTrueArithmeticFact('4 3/8 = 32/8')).toBe(false);
    expect(isTrueArithmeticFact('I think it is 5')).toBe(false);
  });
});

describe('the LLM verifier reads the value the student claimed', () => {
  test('the same number with a unit affirms deterministically', async () => {
    current = { id: 'rectangle_area_6x4', expected: '24' };
    const v = await llmVerifyAnswer('A rectangle is 6 cm long and 4 cm wide. What is its area?', '24');
    expect(v).toMatchObject({ isCorrect: true, rationale: 'symbolic:unit_value' });
  });

  test('a different number with a unit decides nothing (2400 mm² can be 24 cm²)', async () => {
    current = { id: 'rectangle_area_6x4', expected: '24' };
    const v = await llmVerifyAnswer('A rectangle is 6 cm long and 4 cm wide. What is its area?', '2400');
    expect(v.isCorrect).toBeNull();
  });
});
