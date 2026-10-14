/**
 * The active problem: the answer boundary's memory across turns.
 *
 * verify §3a could only protect an answer the pipeline held THIS turn — a
 * graded-wrong attempt's correctAnswer, or an equation in the student's last
 * three messages. A question, "I don't know", a proposed step, frustration,
 * or an attempt the solver couldn't grade had no answer to protect. This pins
 * the record that fixes that: adopted conservatively, credited per part only
 * when the student states the answer, and guarded on every turn.
 */

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
}));
jest.mock('../../utils/openaiClient', () => ({
  chat: { completions: { create: jest.fn() } },
}));

const ap = require('../../utils/pipeline/activeProblem');
const { MESSAGE_TYPES } = require('../../utils/pipeline/observe');
const { verify } = require('../../utils/pipeline/verify');
const { findKnownValueReveal } = require('../../utils/pipeline/valueLeak');
const { callLLM } = require('../../utils/llmGateway');

const reply = (content) => ({ choices: [{ message: { content } }] });
const tutorPoses = (text, n = 4) => ap.adoptFromTutor(null, { reply: text, recentUserMessages: [], messageCount: n });
const turn = (problem, message, messageType, studentAnswer = null, n = 5) =>
  ap.beforeReply(problem, { message, messageType, studentAnswer, messageCount: n });

describe('adopting a problem', () => {
  test('tutor-posed equation is adopted with its variable', () => {
    const p = tutorPoses('Your turn: solve x - 4 = 6. What do you get?');
    expect(p.posedBy).toBe('tutor');
    expect(ap.guardedAnswers(p, 5)).toEqual(['x = 10']);
  });

  test('a worked example is NOT adopted — it reveals its own answer', () => {
    expect(tutorPoses('Watch: y - 3 = 8, so add 3 and y = 11. Now try yours!')).toBeNull();
  });

  test('a reply that poses nothing is not adopted', () => {
    expect(tutorPoses('Nice work on that one.')).toBeNull();
  });

  test('multipart: each requested answer is its own part', () => {
    const p = tutorPoses('Solve these:\n(a) x + 2 = 5\n(b) 3x = 12\nWhat do you get for each?');
    expect(p.parts.map((x) => x.label)).toEqual(['a', 'b']);
    expect(ap.guardedAnswers(p, 4)).toEqual(['x = 3', 'x = 4']);
  });

  test('non-numeric answers are kept as expressions', () => {
    const p = tutorPoses('Factor x^2 - 3x - 10. What two numbers work?');
    expect(ap.guardedAnswers(p, 4)).toEqual(['(x-5)(x+2)']);
  });

  test('student-posed equation is adopted on a question', () => {
    const p = turn(null, 'how do I solve 4x+3=31', MESSAGE_TYPES.QUESTION, null, 1);
    expect(p.posedBy).toBe('student');
    expect(ap.guardedAnswers(p, 1)).toEqual(['x = 7']);
  });

  test("a step of the open problem doesn't replace it", () => {
    const p = turn(null, 'how do I solve 4x+3=31', MESSAGE_TYPES.QUESTION, null, 1);
    const q = turn(p, 'so 4x = 28?', MESSAGE_TYPES.QUESTION, null, 3);
    expect(q.text).toBe(p.text);
  });

  test('an answer attempt never adopts a problem', () => {
    expect(turn(null, '2x + 3 = 11 so x = 4', MESSAGE_TYPES.ANSWER_ATTEMPT, '4', 1)).toBeNull();
  });

  test('re-posing the open problem keeps its credits', () => {
    let p = tutorPoses('Solve:\n(a) x + 2 = 5\n(b) 3x = 12\nWhat do you get?');
    p = turn(p, 'x = 3', MESSAGE_TYPES.ANSWER_ATTEMPT, '3');
    const again = ap.adoptFromTutor(p, { reply: 'Now (a) x + 2 = 5 is done. (b) 3x = 12 — what do you get?', recentUserMessages: [], messageCount: 6 });
    expect(again).toBe(p);
  });
});

describe('crediting: only the student supplying the answer unlocks it', () => {
  const posed = () => tutorPoses('Your turn: solve x - 4 = 6. What do you get?');

  test('a wrong answer credits nothing', () => {
    const p = turn(posed(), 'I got x=2', MESSAGE_TYPES.ANSWER_ATTEMPT, '2');
    expect(ap.guardedAnswers(p, 5)).toEqual(['x = 10']);
  });

  test('fishing ("1 or 10 or 20") credits nothing', () => {
    const p = turn(posed(), 'x = 1 or x = 10 or x = 20', MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(ap.guardedAnswers(p, 5)).toEqual(['x = 10']);
  });

  test('the right answer, bound or bare, unlocks it', () => {
    expect(ap.guardedAnswers(turn(posed(), 'x = 10', MESSAGE_TYPES.ANSWER_ATTEMPT), 5)).toEqual([]);
    expect(ap.guardedAnswers(turn(posed(), 'x is ten', MESSAGE_TYPES.ANSWER_ATTEMPT), 5)).toEqual([]);
    expect(ap.guardedAnswers(turn(posed(), '10', MESSAGE_TYPES.ANSWER_ATTEMPT, '10'), 5)).toEqual([]);
  });

  test('multipart: answering (a) leaves (b) guarded', () => {
    let p = tutorPoses('Solve:\n(a) x + 2 = 5\n(b) 3x = 12\nWhat do you get?');
    p = turn(p, 'a is x = 3', MESSAGE_TYPES.ANSWER_ATTEMPT, '3');
    expect(ap.guardedAnswers(p, 5)).toEqual(['x = 4']);
  });

  test('multi-root: each root is credited on its own', () => {
    const p0 = turn(null, 'help me solve x^2 - 5x + 6 = 0', MESSAGE_TYPES.HELP_REQUEST, null, 1);
    expect(ap.guardedAnswers(p0, 1)).toEqual(['x = 3, x = 2']);
    const p1 = turn(p0, 'x = 3', MESSAGE_TYPES.ANSWER_ATTEMPT, '3', 3);
    expect(ap.guardedAnswers(p1, 3)).toEqual(['x = 2']);
    const p2 = turn(p1, 'and x = 2', MESSAGE_TYPES.ANSWER_ATTEMPT, '2', 5);
    expect(ap.guardedAnswers(p2, 5)).toEqual([]);
  });

  test('expression answers unlock on an equal form', () => {
    const p = tutorPoses('Factor x^2 - 3x - 10. What two numbers work?');
    expect(ap.guardedAnswers(turn(p, '(x+2)(x-5)', MESSAGE_TYPES.ANSWER_ATTEMPT, '(x-5)(x+2)'), 5)).toEqual([]);
  });
});

describe('liveness', () => {
  test('goes quiet once the student stops engaging', () => {
    const p = tutorPoses('Your turn: solve x - 4 = 6. What do you get?', 4);
    expect(ap.guardedAnswers(p, 4 + ap.LIVE_WINDOW_MESSAGES)).toEqual(['x = 10']);
    expect(ap.guardedAnswers(p, 5 + ap.LIVE_WINDOW_MESSAGES)).toEqual([]);
  });

  test('engaging keeps it live', () => {
    let p = tutorPoses('Your turn: solve x - 4 = 6. What do you get?', 4);
    p = turn(p, "I don't know", MESSAGE_TYPES.IDK, null, 14);
    expect(ap.guardedAnswers(p, 20)).toEqual(['x = 10']);
  });

  test('goes quiet after hours away', () => {
    const p = { ...tutorPoses('Your turn: solve x - 4 = 6. What do you get?'), updatedAt: new Date(Date.now() - 4 * 3600e3) };
    expect(ap.guardedAnswers(p, 5)).toEqual([]);
  });
});

describe('verify §3a guards the active problem on every turn', () => {
  beforeEach(() => callLLM.mockReset());
  const base = { userId: 'u1', guardedProblemAnswers: ['x = 10'] };

  test.each([
    ['I don’t know', MESSAGE_TYPES.IDK],
    ['just tell me the answer', MESSAGE_TYPES.GIVE_UP],
    ['add 4 to both sides?', MESSAGE_TYPES.PROPOSED_STEP],
    ['this is so dumb', MESSAGE_TYPES.FRUSTRATION],
  ])('%s → a reply that gives x = 10 is rewritten', async (userMessage, messageType) => {
    callLLM.mockResolvedValue(reply('We want x by itself. Adding 4 makes the −4 disappear because opposites make zero. What do you get on the right?'));
    const result = await verify('Add 4 to both sides, so x is ten.', { ...base, userMessage, messageType });
    expect(result.flags).toContain('final_disclosure_detected');
    expect(findKnownValueReveal(result.text, 'x = 10')).toBeNull();
  });

  test('a parallel example with different numbers passes', async () => {
    const text = 'Let me show that move on a different equation: y − 3 = 8. Adding 3 to both sides gives y = 11. Now try that same move on yours.';
    const result = await verify(text, { ...base, userMessage: 'still stuck', messageType: MESSAGE_TYPES.IDK });
    expect(result.flags).not.toContain('final_disclosure_detected');
    expect(result.text).toBe(text);
  });

  test('a still-leaking rewrite ships the fallback', async () => {
    callLLM.mockResolvedValue(reply('Sure — x = 10.'));
    // FRUSTRATION: outside §2a-bis, so only the active-problem guard sees it.
    const result = await verify('Fine — x is 10.', { ...base, userMessage: 'ugh whatever', messageType: MESSAGE_TYPES.FRUSTRATION });
    expect(result.flags).toContain('final_disclosure_still_leaked');
    expect(result.text).not.toMatch(/10/);
  });
});
