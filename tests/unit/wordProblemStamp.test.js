/**
 * A word problem is solved ONCE, when the tutor poses it, and the answer is
 * stamped on the tutor message. Later student turns grade against the stamp.
 *
 * Owner session, 2026-11-08. The tutor posed "A car travels 120 miles in 2
 * hours. At this rate, how far will it travel in 5 hours?" The student said
 * "300 miles" (right). Nothing had stamped the word problem — the deterministic
 * solver cannot parse prose — so the verifier re-picked a problem from the
 * recent tutor turns, landed on the greeting's warm-up, and rejected the
 * answer at 0.98 confidence. #1886 fixed the pick; this makes the pick
 * unnecessary for the common case: the stamp sits on the message that posed
 * the problem, so it cannot be mis-picked.
 *
 * The stamp is affirm-only. It came from a model, not a solver, so a match is
 * confirmed instantly and a mismatch is left to the live verifier. A wrong
 * stamp can therefore never be the reason a right answer is called wrong.
 */

jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));
jest.mock('../../utils/openaiClient', () => ({ chat: { completions: { create: jest.fn() } } }));
jest.mock('../../models/learningCard', () => ({
  findOneAndUpdate: jest.fn().mockResolvedValue(null),
  findOne: jest.fn().mockReturnValue({ sort: () => ({ lean: () => Promise.resolve(null) }) }),
  create: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../utils/emailService', () => ({ sendSafetyConcernAlert: jest.fn().mockResolvedValue() }));

const { callLLM } = require('../../utils/llmGateway');
const {
  solvePosedProblem, isWordProblemPose, numericAnswerValue, buildStep1Messages,
} = require('../../utils/pipeline/llmVerifier');
const { observe } = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');
const { persist } = require('../../utils/pipeline/persist');
const { extractSystemTags } = require('../../utils/pipeline/verify');
const User = require('../../models/user');

const fakeCompletion = (payload) => ({ choices: [{ message: { content: JSON.stringify(payload) } }] });

const WARM_UP = "Hey! Quick warm-up to get going: What's \\( \\frac{-6}{2} + 3 \\)?";
const RATE = "Rate and ratio problems are super fun! Here's a problem for you:\n\nProblem: A car travels 120 miles in 2 hours. At this rate, how far will it travel in 5 hours?\n\n1. First, what's the rate of the car in miles per hour?\n2. Then, use that rate to find out how far it will go in 5 hours.\n\nTake it step by step!";

function makeUser() {
  const user = new User({ username: 'jason', email: 'j@example.com', firstName: 'Jason' });
  user.save = jest.fn().mockResolvedValue(user);
  return user;
}

function makeConversation(messages) {
  return {
    messages: messages.map(m => ({ ...m })),
    lastProblemState: null,
    boardProblem: null,
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(),
  };
}

/** The tutor's reply to `message` is persisted, exactly as the pipeline does it. */
async function persistReply(user, conversation, message, reply) {
  conversation.messages.push({ role: 'user', content: message });
  const recentAssistantMessages = conversation.messages.filter(m => m.role === 'assistant').slice(-6);
  const observation = observe(message, { recentAssistantMessages, recentUserMessages: [], recentProblemResults: [] });
  const diagnosis = await diagnose(observation, { recentAssistantMessages, recentUserMessages: [] });
  const { extracted, text } = extractSystemTags(reply);
  return persist({
    user, conversation, extracted, diagnosis, observation, decision: {},
    responseText: text, originalMessage: message, aiProcessingSeconds: 0,
  });
}

/** One student turn graded the way index.js grades it (no live verifier unless given). */
async function grade(conversation, message, llmVerificationPromise = null) {
  const recentAssistantMessages = conversation.messages
    .filter(m => m.role === 'assistant').slice(-6)
    .map(m => ({ content: m.content, problemInfo: m.problemInfo || null }));
  const observation = observe(message, { recentAssistantMessages, recentUserMessages: [], recentProblemResults: [] });
  return diagnose(observation, { recentAssistantMessages, recentUserMessages: [], llmVerificationPromise });
}

beforeEach(() => {
  callLLM.mockReset();
});

describe('isWordProblemPose — what gets stamped', () => {
  test.each([
    [RATE, true],
    ['Try this one: A shirt costs $40 and is 25% off. What is the sale price?', true],
    ['Sam reads 12 pages a day. How many days will it take to read a 180-page book?', true],
    ['Nice work so far! Ready for the next one?', false],                   // no numbers, no quantity
    ['Nice, 60 is right! Ready for the next one?', false],                  // one number, no quantity
    ['You have 120 miles and 2 hours. What could you do first?', false],   // a method question
    ['Try this one: Solve \\(3x - 7 = 11\\).', false],                      // no question mark (and the solver has it)
    ['Does 2 + 2 = 4 make sense to you?', false],                           // not a quantity ask
    ['', false],
    [null, false],
  ])('%j → %s', (text, posed) => {
    expect(isWordProblemPose(text)).toBe(posed);
  });
});

describe('numericAnswerValue — what counts as a single-quantity key', () => {
  test.each([
    ['300 miles', '300'], ['300', '300'], ['$30', '30'], ['30 dollars', '30'], ['60 mph', '60'],
    ['15 days', '15'], ['1,200 km', '1200'], ['12.5%', '12.5'], ['-4', '-4'], ['about 300 miles', '300'],
    ['divide 120 by 2', null], ['x = 5', null], ['9π', null], ['3/4', null], ['2x + 3', null],
    ['', null], [null, null],
  ])('%j → %j', (answer, numeric) => {
    expect(numericAnswerValue(answer)).toBe(numeric);
  });
});

describe('solvePosedProblem — the verifier\'s own step 1, once', () => {
  test('returns the answer and its bare number', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ answer: '300 miles', form: 'decimal' }));
    const r = await solvePosedProblem(RATE, { earlierContext: WARM_UP });
    expect(r).toEqual({ answer: '300 miles', numeric: '300', error: null });
    // One prompt for both callers: the same system message llmVerifyAnswer uses.
    const [model, messages] = callLLM.mock.calls[0];
    expect(model).toBe(require('../../utils/pipeline/llmVerifier').VERIFIER_MODEL);
    expect(messages[0]).toEqual(buildStep1Messages({ problem: RATE })[0]);
    expect(messages[1].content).toContain('Earlier in the lesson (context only');
    expect(messages[1].content).toContain('Problem:\n' + RATE);
  });

  test('a description is not a key', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ answer: 'divide the distance by the time, then multiply by 5' }));
    const r = await solvePosedProblem(RATE);
    expect(r.answer).toMatch(/divide/);
    expect(r.numeric).toBeNull();
  });

  test('a parse failure, a model error and missing input all decline quietly', async () => {
    callLLM.mockResolvedValueOnce({ choices: [{ message: { content: 'not json' } }] });
    expect(await solvePosedProblem(RATE)).toEqual({ answer: null, numeric: null, error: 'step1_parse_failed' });
    callLLM.mockRejectedValueOnce(new Error('boom'));
    expect((await solvePosedProblem(RATE)).error).toBe('boom');
    expect((await solvePosedProblem('')).error).toBe('missing_input');
    expect((await solvePosedProblem(null)).error).toBe('missing_input');
  });
});

describe('persist stamps a posed word problem', () => {
  test('the rate problem is stamped with its numeric key and source llm', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ answer: '300 miles' }));
    const conversation = makeConversation([{ role: 'assistant', content: WARM_UP }]);
    await persistReply(makeUser(), conversation, 'Can we do a quick round of rate and ratio problems?', RATE);

    const posed = conversation.messages[conversation.messages.length - 1];
    expect(posed.role).toBe('assistant');
    expect(posed.problemInfo).toEqual({ type: 'word-problem', correctAnswer: '300', source: 'llm' });
    expect(conversation.save).toHaveBeenCalled();
    // The prior tutor turn rode along as context for the answer engine.
    expect(callLLM.mock.calls[0][1][1].content).toContain(WARM_UP);
  });

  test('a solver-parseable pose keeps the deterministic stamp; the model is not called', async () => {
    const conversation = makeConversation([]);
    await persistReply(makeUser(), conversation, 'give me one', "Try this one: What's 15% of 80?");
    const posed = conversation.messages[conversation.messages.length - 1];
    expect(posed.problemInfo.correctAnswer).toBe('12');
    expect(posed.problemInfo.source).toBeUndefined();
    expect(callLLM).not.toHaveBeenCalled();
  });

  test('a pleasantry and a method question are not stamped', async () => {
    const conversation = makeConversation([{ role: 'assistant', content: RATE }]);
    await persistReply(makeUser(), conversation, 'ok', 'Nice work so far! Ready for the next one?');
    await persistReply(makeUser(), conversation, '300 miles', 'You have 120 miles and 2 hours. What could you do first?');
    expect(callLLM).not.toHaveBeenCalled();
    for (const m of conversation.messages.slice(-3)) expect(m.problemInfo).toBeUndefined();
  });

  test('a description from the engine leaves the message unstamped', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ answer: 'divide the distance by the time' }));
    const conversation = makeConversation([]);
    await persistReply(makeUser(), conversation, 'a word problem please', RATE);
    expect(conversation.messages[conversation.messages.length - 1].problemInfo).toBeUndefined();
  });

  test('a slow solve times out and the turn saves unstamped (the stamp never holds the save hostage)', async () => {
    jest.useFakeTimers();
    try {
      callLLM.mockReturnValueOnce(new Promise(() => {})); // never resolves
      const conversation = makeConversation([]);
      const pending = persistReply(makeUser(), conversation, 'a word problem please', RATE);
      await jest.advanceTimersByTimeAsync(3500);
      await pending;
      expect(conversation.save).toHaveBeenCalled();
      expect(conversation.messages[conversation.messages.length - 1].problemInfo).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('diagnose reads the stamp as affirm-only', () => {
  const stamped = () => makeConversation([
    { role: 'assistant', content: WARM_UP },
    { role: 'assistant', content: RATE, problemInfo: { type: 'word-problem', correctAnswer: '300', source: 'llm' } },
  ]);

  test('"300 miles" is CORRECT from the stamp — no model call this turn', async () => {
    const d = await grade(stamped(), '300 miles');
    expect(d.isCorrect).toBe(true);
    expect(d.verificationSource).toBe('stamp');
    expect(d.correctAnswer).toBe('300');
    expect(callLLM).not.toHaveBeenCalled();
  });

  test('a mismatch alone is NOT a rejection — with no verifier the turn stays undecided', async () => {
    const d = await grade(stamped(), '240');
    expect(d.isCorrect).toBeNull();
    expect(d.type).toBe('unverifiable');
  });

  test('a mismatch the live verifier also rejects is incorrect', async () => {
    const verdict = Promise.resolve({ isCorrect: false, confidence: 0.95, modelAnswer: '300' });
    const d = await grade(stamped(), '240', verdict);
    expect(d.isCorrect).toBe(false);
    expect(d.verificationSource).toBe('llm');
  });

  test('when the stamp and the live verifier disagree, the student is affirmed', async () => {
    const wrongStamp = makeConversation([
      { role: 'assistant', content: RATE, problemInfo: { type: 'word-problem', correctAnswer: '250', source: 'llm' } },
    ]);
    const verdict = Promise.resolve({ isCorrect: true, confidence: 0.98, modelAnswer: '300' });
    const d = await grade(wrongStamp, '300 miles', verdict);
    expect(d.isCorrect).toBe(true);
    expect(d.verificationSource).toBe('llm');
  });

  test('a newer tutor question still supersedes an older stamped problem', async () => {
    const conversation = stamped();
    conversation.messages.push({ role: 'assistant', content: 'Good. So what is the rate, in miles per hour?' });
    const d = await grade(conversation, '60');
    // Not graded against the stamped 300 — undecided without a verifier.
    expect(d.isCorrect).not.toBe(false);
    expect(d.verificationSource).not.toBe('stamp');
  });
});

describe('the 2026-11-08 transcript, end to end', () => {
  test('pose → stamp → "300 miles" confirmed deterministically on the next turn', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ answer: '300 miles' }));
    const user = makeUser();
    const conversation = makeConversation([
      { role: 'assistant', content: WARM_UP },
      { role: 'user', content: '0' },
      { role: 'assistant', content: "That's right, you nailed it! The answer is indeed \\( 0 \\). Want a harder one?" },
    ]);
    await persistReply(user, conversation, 'Can we do a quick round of Rate and ratio problems with many steps?', RATE);
    expect(callLLM).toHaveBeenCalledTimes(1); // the one pose-time solve

    const d = await grade(conversation, '300 miles');
    expect(d.isCorrect).toBe(true);
    expect(d.verificationSource).toBe('stamp');
    expect(callLLM).toHaveBeenCalledTimes(1); // and nothing more on the student's turn
  });
});
