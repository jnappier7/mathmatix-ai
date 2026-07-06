/**
 * Proposed / self-check answer extraction.
 *
 * Origin: a fractions session where the student added 1/4 + 1/6 with the butterfly
 * method and offered the (correct, unsimplified) answer inside a question —
 * "…right? 10/24" and "but isn't that equal to 10/24?". extractAnswer only matched
 * ANCHORED bare answers, so these yielded null → classified GENERAL_MATH → the
 * verification verdict was never injected → the tutor rejected a correct answer
 * ("not quite") and even claimed 5/12 and 10/24 were "not equivalent".
 *
 * The verifier itself already grades 10/24 == 5/12; the gap was that a proposed
 * ("check my answer") value never reached it. These tests lock in that a
 * cue-gated, end-anchored proposed answer is extracted and classified as an
 * ANSWER_ATTEMPT, while genuine questions are left alone.
 */
const { observe, extractAnswer, MESSAGE_TYPES } = require('../../utils/pipeline/observe');

const ctx = { recentUserMessages: [], recentAssistantMessages: [], hasRecentUpload: false };

describe('extractAnswer — proposed / self-check answers', () => {
  const cases = [
    ['oh wait. add the denominators for the numerator and multiply em for the denominator, right? 10/24', '10/24'],
    ["but isn't that equal to 10/24?", '10/24'],
    ['is it 5/12?', '5/12'],
    ['10/24, right?', '10/24'],
    ["so it's 5", '5'],
    ['would it be 3/4?', '3/4'],
    ["isn't it -28?", '-28'],
    ['is that 0.75?', '0.75'],
  ];

  for (const [msg, value] of cases) {
    it(`extracts ${value} from ${JSON.stringify(msg.length > 40 ? '…' + msg.slice(-32) : msg)}`, () => {
      const a = extractAnswer(msg);
      expect(a).not.toBeNull();
      expect(a.value).toBe(value);
    });
  }
});

describe('observe — proposed answers classify as ANSWER_ATTEMPT', () => {
  it('the transcript messages become answer attempts carrying the proposed value', () => {
    const r1 = observe("but isn't that equal to 10/24?", ctx);
    expect(r1.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(r1.answer.value).toBe('10/24');

    const r2 = observe('is it 5/12?', ctx); // question-word start, but a self-check
    expect(r2.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(r2.answer.value).toBe('5/12');
  });
});

describe('observe — genuine questions are NOT treated as answers', () => {
  const questions = [
    'what is 10/24?',
    'can you simplify 3/4?',
    'is it prime?',            // "is it" cue but no numeric value → still a question
    'why do we need a common denominator?',
  ];
  for (const q of questions) {
    it(`keeps ${JSON.stringify(q)} out of ANSWER_ATTEMPT`, () => {
      const r = observe(q, ctx);
      expect(r.messageType).not.toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
      expect(r.answer).toBeNull();
    });
  }
});

describe('the verifier already accepts the butterfly answer (engine side is fine)', () => {
  const { verifyAnswer } = require('../../utils/mathSolver');
  it('grades 10/24 == 5/12 as correct (equivalent, unsimplified)', () => {
    expect(verifyAnswer('10/24', '5/12').isCorrect).toBe(true);
    expect(verifyAnswer('5/12', '10/24').isCorrect).toBe(true);
  });
});
