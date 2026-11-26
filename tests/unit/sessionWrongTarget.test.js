/**
 * Owner session, 2026-11-25 (board on, four problems): four correct answers
 * were stamped incorrect and two were never graded. Each grader was exact about
 * the problem it held and aimed at something other than what the student was
 * answering. One test block per seam; the whole exchange is replayed in
 * tests/eval/verdict (SESSIONS).
 */

jest.mock('../../utils/logger', () => ({
  child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { observe, extractAnswer, detectParroting } = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');
const { decide } = require('../../utils/pipeline/decide');
const { solverStampFor, stampIsMention, solvesLikePin } = require('../../utils/pipeline/poseStamp');
const { verifyDerivation } = require('../../utils/derivationVerifier');
const { isRecheckRequest, findRecheckTarget } = require('../../utils/pipeline/recheck');
const { boardProblemStatement, statesPinnedMath } = require('../../utils/pipeline/llmVerifier');

const STICKERS = 'First find how many stickers Sara gives away: what is \\(\\frac{1}{3}\\) of \\(24\\)? Then we’ll subtract that from \\(24\\).';
const MULTIPLIER = 'The common denominator \\(12\\) is right. The first rewrite is where it slips: to change \\(\\frac{3}{4}\\) into an equivalent fraction, what do you multiply the numerator \\(3\\) by when you multiply the denominator \\(4\\) by \\(3\\)?';
const PARALLEL = 'I won’t give away the homework answer, but we can make the first move easier. For a parallel example, \\(x^2-5x-6=0\\): what two numbers multiply to \\(-6\\) and add to \\(-5\\)?';
const EXPAND_CHECK = 'I see the factorization you proposed. Before deciding on the roots, expand \\((x-7)(x+2)\\): what middle term do you get, and does it match \\(-5x\\)?';
const CONFIRMED = 'Yes, \\(x=17\\) is correct. You handled the distribution carefully, including the negative term. Can you tell me the move that gets the \\(x\\)-terms together?';

const obs = (text, tutor = []) => observe(text, { recentUserMessages: [], recentAssistantMessages: tutor });

describe('a pose-time key is only stamped for math the tutor asks for', () => {
  test.each([
    ['a fraction inside a longer ask', STICKERS],
    ['a fraction named on the way to a different question', MULTIPLIER],
    ["a parallel example's equation ahead of its own question", PARALLEL],
    ['a factorization the student is asked to check', EXPAND_CHECK],
    ['a solution being confirmed', CONFIRMED],
    ['roots restated in a confirmation', 'Yes, that’s correct. Setting each factor to zero gives \\(x=7\\) or \\(x=-2\\).'],
  ])('%s gets no stamp', (_label, text) => {
    expect(solverStampFor(text)).toBeNull();
  });

  test.each([
    ['Try this one: Solve \\(3x - 7 = 11\\).', '6'],
    ["Try this one: What's \\(\\frac{2}{3} + \\frac{1}{4}\\)?", '11/12'],
    ["Try this one: What's \\(-8 + 13\\)?", '5'],
    ['Solve \\(2x + 6 = 18\\). What is \\(x\\)?', '6'],
    ['Solve \\(2x + 6 = 18\\). What do you get?', '6'],
  ])('%s is still keyed', (text, key) => {
    expect(solverStampFor(text).info.correctAnswer).toBe(key);
  });

  test('a stamp written before the rule is disowned when read', () => {
    expect(stampIsMention(STICKERS, '0.3333')).toBe(true);
    expect(stampIsMention(MULTIPLIER, '0.75')).toBe(true);
    expect(stampIsMention('Try this one: Solve \\(3x - 7 = 11\\).', '6')).toBe(false);
    // A stamp this cannot reproduce is left alone.
    expect(stampIsMention(STICKERS, '8')).toBe(false);
  });
});

describe('diagnose never rejects against math the turn only mentions', () => {
  test('"16" is not graded against 1/3 (legacy stamp on the turn)', async () => {
    const tutor = [{ content: STICKERS, problemInfo: { type: 'evaluation', correctAnswer: '0.3333' } }];
    const d = await diagnose(obs('16', tutor), { recentAssistantMessages: tutor, recentUserMessages: [] });
    expect(d.isCorrect).not.toBe(false);
  });

  test('"3" is not graded against 3/4', async () => {
    const tutor = [{ content: MULTIPLIER, problemInfo: { type: 'evaluation', correctAnswer: '0.75' } }];
    const d = await diagnose(obs('3', tutor), { recentAssistantMessages: tutor, recentUserMessages: [] });
    expect(d.isCorrect).not.toBe(false);
  });

  test("a factor pair is not graded against the parallel equation's roots", async () => {
    const tutor = [{ content: PARALLEL, problemInfo: { type: 'quadratic_equation', correctAnswer: 'x = 6 or x = -1' } }];
    const d = await diagnose(obs('-6 and 1', tutor), { recentAssistantMessages: tutor, recentUserMessages: [] });
    expect(d.isCorrect).not.toBe(false);
  });
});

describe("the pinned problem's roots cannot reject a pair given under a tutor question", () => {
  const PIN = 'x^2-5x-14=0';

  test('the pair for a parallel example', async () => {
    const tutor = [{ content: PARALLEL }];
    const d = await diagnose(obs('-6 and 1', tutor), { recentAssistantMessages: tutor, recentUserMessages: [], pinnedProblemTex: PIN });
    expect(d.isCorrect).not.toBe(false);
  });

  test('the factor pair of the pinned quadratic itself (the negated roots)', async () => {
    const tutor = [{ content: 'What two numbers multiply to \\(-14\\) and add to \\(-5\\)? Try a pair, and we can work through it together.' }];
    const d = await diagnose(obs('-7 and 2', tutor), { recentAssistantMessages: tutor, recentUserMessages: [], pinnedProblemTex: PIN });
    expect(d.isCorrect).not.toBe(false);
  });

  test('roots claimed by name are still graded, right and wrong', async () => {
    const tutor = [{ content: 'What do you get for the roots?' }];
    const ctx = { recentAssistantMessages: tutor, recentUserMessages: [], pinnedProblemTex: PIN };
    expect((await diagnose(obs('x = 7 or x = -2', tutor), ctx)).isCorrect).toBe(true);
    expect((await diagnose(obs('x = -7 or x = 2', tutor), ctx)).isCorrect).toBe(false);
  });
});

describe('a derivation line is read as the student wrote it', () => {
  const PIN = 'x^2-5x-14=0';

  test('prose ahead of the equation, and both roots on the last line', () => {
    const chain = verifyDerivation('mine is (x-7)(x+2)=0, x = 7 or x = -2', PIN);
    expect(chain.verifiable).toBe(true);
    expect(chain.valid).toBe(true);
    expect(chain.answerCorrect).toBe(true);
  });

  test('a wrong factoring is still caught', () => {
    const chain = verifyDerivation('mine is (x+7)(x-2)=0, x = -7 or x = 2', PIN);
    expect(chain.answerCorrect).toBe(false);
  });

  test('"x = 7, x = -2" is one answer, not two steps', () => {
    const chain = verifyDerivation('(x-7)(x+2)=0\nx = 7, x = -2', PIN);
    expect(chain.answerCorrect).toBe(true);
  });

  test('the whole turn comes out correct, and decide confirms it despite an earlier give-up', async () => {
    const tutor = [{ content: 'Let’s check your pair against the clues: what do \\(-6\\) and \\(1\\) add up to, and what do they multiply to?' }];
    const o = obs('oh so mine is (x-7)(x+2)=0, x = 7 or x = -2', tutor);
    const d = await diagnose(o, { recentAssistantMessages: tutor, recentUserMessages: [], pinnedProblemTex: PIN });
    expect(d.isCorrect).toBe(true);
    const decision = decide({ ...o, streaks: { ...(o.streaks || {}), giveUpCount: 1 } }, d, {});
    expect(decision.action).not.toBe('exit_ramp');
  });
});

describe('a rejection against a reached-for target yields to the verifier', () => {
  const affirm = Promise.resolve({ isCorrect: true, confidence: 0.97, modelAnswer: '4' });
  const silent = Promise.resolve({ isCorrect: null, confidence: 0, modelAnswer: null });
  // The key sits on an OLDER turn; the newest turn asks nothing of its own.
  const older = [
    { content: 'Try this one: Solve \\(3x - 7 = 11\\).', problemInfo: { type: 'general_linear', correctAnswer: '6' } },
    { content: 'Take your time with it.' },
  ];

  test('the verifier affirms: the rejection is withdrawn', async () => {
    const d = await diagnose(obs('4', older), { recentAssistantMessages: older, recentUserMessages: [], llmVerificationPromise: affirm });
    expect(d.isCorrect).toBe(true);
    expect(d.verificationSource).toBe('llm');
  });

  test('the verifier has no verdict: the rejection stands', async () => {
    const d = await diagnose(obs('4', older), { recentAssistantMessages: older, recentUserMessages: [], llmVerificationPromise: silent });
    expect(d.isCorrect).toBe(false);
  });

  test('the problem as posed needs no second opinion, and gets none', async () => {
    const posed = [older[0]];
    const d = await diagnose(obs('4', posed), { recentAssistantMessages: posed, recentUserMessages: [], llmVerificationPromise: affirm });
    expect(d.isCorrect).toBe(false);
    expect(d.verificationSource).toBe('solver');
  });

  test('a pose pinned in a different spelling is still the problem as posed', async () => {
    const pose = "Try this one: What's \\(2\\frac{1}{3} + 1\\frac{1}{2}\\)?";
    const pin = '2 1/3 + 1 1/2';
    expect(solvesLikePin(pose, pin)).toBe(true);
    const posed = [{ content: pose, problemInfo: { type: 'fraction_arithmetic', correctAnswer: '3 5/6' } }];
    const d = await diagnose(obs('3 2/6', posed), {
      recentAssistantMessages: posed, recentUserMessages: [], pinnedProblemTex: pin,
      llmVerificationPromise: Promise.resolve({ isCorrect: true, confidence: 1, modelAnswer: '3 5/6' }),
    });
    expect(d.isCorrect).toBe(false);
  });

  test('a sub-question key under a different board problem does', async () => {
    const sub = [{ content: 'Good. Now, what is \\(8 + 4\\)?', problemInfo: { type: 'evaluation', correctAnswer: '12' } }];
    const ctx = { recentAssistantMessages: sub, recentUserMessages: [], pinnedProblemTex: '3x - 7 = 11' };
    const lifted = await diagnose(obs('6', sub), { ...ctx, llmVerificationPromise: Promise.resolve({ isCorrect: true, confidence: 0.98, modelAnswer: '6' }) });
    expect(lifted.isCorrect).toBe(true);
    const stands = await diagnose(obs('7', sub), { ...ctx, llmVerificationPromise: silent });
    expect(stands.isCorrect).toBe(false);
  });
});

describe('work of the student\'s own is not an echo of the tutor', () => {
  const tutor = [
    { content: 'A product rule is the fast route here. What do you get when you differentiate each factor separately, \\(x^2\\) and \\(\\sin(x)\\)?' },
    { content: 'On a parallel example, \\(g(x)=x^2\\cos(x)\\), what are the two factors, and what is the derivative of each factor?' },
  ];
  const derivative = 'product rule: 2x sin(x) + \\(x^{2}\\) cos(x)';

  test('an expression the tutor never wrote is not parroting', () => {
    expect(detectParroting(derivative, tutor)).toBe(false);
    expect(observe(derivative, { recentUserMessages: [], recentAssistantMessages: tutor }).messageType).toBe('answer_attempt');
  });

  test('repeating the tutor\'s sentence still is', () => {
    expect(detectParroting('a product rule is the fast route here', tutor)).toBe(true);
  });

  test('a method label in front of the answer does not hide it', () => {
    expect(extractAnswer(derivative).value).toBe('2x sin(x) + x^{2} cos(x)');
    expect(extractAnswer('my question: what is 5?')).toBeNull();
  });
});

describe('"is my answer right or not?" re-grades the answer it is about', () => {
  const asks = 'first term i differentiated x^2, second term i differentiated sin. is my answer right or not?';

  test('a description that closes on the question is a re-check', () => {
    expect(isRecheckRequest(asks)).toBe(true);
    expect(isRecheckRequest('ok but was my answer correct?')).toBe(true);
  });

  test('a message carrying its own answer is graded as itself', () => {
    expect(isRecheckRequest('x = 5. is my answer right?')).toBe(false);
    expect(isRecheckRequest('16. is my answer right?')).toBe(false);
    expect(isRecheckRequest('2x sin(x) + x^2 cos(x). is my answer right?')).toBe(false);
  });

  test('the target is the newest submission, LaTeX and all', () => {
    const messages = [
      { role: 'user', content: '2x cos(x)' },
      { role: 'assistant', content: 'Name the two factors first.' },
      { role: 'user', content: 'product rule: 2x sin(x) + \\(x^{2}\\) cos(x)' },
      { role: 'assistant', content: 'Which factor did you differentiate in each term?' },
    ];
    expect(findRecheckTarget(messages)).toBe(2);
  });
});

describe('the board problem as it was posed', () => {
  const pin = 'f(x)=x^2\\sin(x)';
  const messages = [
    { role: 'user', content: 'now calc. find the derivative of f(x) = \\(x^{2}\\) sin(x)' },
    { role: 'assistant', content: 'A product rule is the fast route here.' },
  ];

  test('comes with its task, from the message that stated it', () => {
    expect(boardProblemStatement(pin, messages)).toBe(messages[0].content);
  });

  test('falls back to the pin when nothing states it', () => {
    const wordPin = '24 stickers; gives away \\frac{1}{3}; how many remain?';
    expect(boardProblemStatement(wordPin, messages)).toBe(wordPin);
    expect(boardProblemStatement(null, messages)).toBeNull();
  });

  test('a turn that states the pin needs no cross-check', () => {
    expect(statesPinnedMath('Try this one: Solve \\(3x - 7 = 11\\).', '3x - 7 = 11')).toBe(true);
    expect(statesPinnedMath('what two numbers multiply to \\(-6\\)?', 'x^2-5x-14=0')).toBe(false);
  });
});
