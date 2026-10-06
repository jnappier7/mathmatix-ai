/**
 * One problem, one solve award — and "clean" means first try.
 *
 * Production, 2026-10: a student worked 5(x+2) − 3x = 26 one step per message
 * and was paid "+18 XP — clean solve" on each of three consecutive INTERMEDIATE
 * steps ("5(x)+5(2)-3x=26", "2x+10=26", "-10 on both sides to get 2x=16").
 * The same problem had already been restarted several times by the giveaway-
 * guard false alarm (#1633), so none of it was first-try either.
 *
 * Two seams produced that:
 *   1. observe extracts no answer from a step, so diagnose returns no_answer and
 *      persist fell back to the tutor model's own <PROBLEM_RESULT:correct> tag —
 *      which the prompt asks for "when a student answers a specific math
 *      problem", and a correct step looks like one. Every step became a solve.
 *   2. "clean" was only "no hint words in the last 6 messages". Each false solve
 *      also CLEARED lastProblemState, so no attempt history survived to say the
 *      problem was being re-worked.
 *
 * These tests replay the turns through the real observe → diagnose → tag
 * extraction → persist() chain; only the DB writes are stubbed.
 */

jest.mock('../../models/learningCard', () => ({
  findOneAndUpdate: jest.fn().mockResolvedValue(null),
  findOne: jest.fn().mockReturnValue({ sort: () => ({ lean: () => Promise.resolve(null) }) }),
  create: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../utils/emailService', () => ({ sendSafetyConcernAlert: jest.fn().mockResolvedValue() }));

const { observe } = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');
const { extractSystemTags } = require('../../utils/pipeline/verify');
const { persist } = require('../../utils/pipeline/persist');
const User = require('../../models/user');

const PROBLEM = 'prove 5(x+2)-3x=26 is equal to x=8';

function makeUser() {
  const user = new User({ username: 'henry', email: 'h@example.com', firstName: 'Henry' });
  user.save = jest.fn().mockResolvedValue(user);
  return user;
}

function makeConversation() {
  return {
    messages: [
      { role: 'user', content: PROBLEM },
      { role: 'assistant', content: "Let's prove it. What's your first step on 5(x+2) - 3x = 26?" },
    ],
    lastProblemState: null,
    boardProblem: null,
    markModified() {},
    save: jest.fn().mockResolvedValue(),
  };
}

/** One student turn, end to end. `reply` is the tutor's RAW reply, tags and all. */
async function turn(user, conversation, message, reply) {
  conversation.messages.push({ role: 'user', content: message });
  const recentAssistantMessages = conversation.messages.filter(m => m.role === 'assistant').slice(-3);
  const recentUserMessages = conversation.messages.filter(m => m.role === 'user').slice(-4, -1);
  const observation = observe(message, { recentAssistantMessages, recentUserMessages, recentProblemResults: [] });
  const diagnosis = await diagnose(observation, {
    recentAssistantMessages,
    recentUserMessages,
    lastProblemState: conversation.lastProblemState,
    pinnedProblemTex: conversation.boardProblem?.tex || null,
  });
  const { extracted, text } = extractSystemTags(reply);
  return persist({
    user,
    conversation,
    extracted,
    diagnosis,
    observation,
    decision: {},
    responseText: text,
    originalMessage: message,
    aiProcessingSeconds: 0,
    pinnedProblemTex: conversation.boardProblem?.tex || null,
  });
}

const STEPS = [
  ['5(x)+5(2)-3x=26', 'Yes — you distributed the 5. What next? <PROBLEM_RESULT:correct>'],
  ['2x+10=26', 'Right, combine like terms. Next move? <PROBLEM_RESULT:correct>'],
  ['-10 on both sides to get 2x=16', 'Exactly. One more step. <PROBLEM_RESULT:correct>'],
];
const FINAL = ['divide by 2 to get x=8', 'That proves it — x = 8. <PROBLEM_RESULT:correct>'];

describe('intermediate steps are not solves', () => {
  test('a step-by-step solve pays out once, on the final answer, as clean', async () => {
    const user = makeUser();
    const conversation = makeConversation();

    for (const [msg, reply] of STEPS) {
      const r = await turn(user, conversation, msg, reply);
      expect({ msg, tier2: r.xpBreakdown.tier2, tier2Type: r.xpBreakdown.tier2Type })
        .toEqual({ msg, tier2: 0, tier2Type: null });
      expect(r.problemAnswered).toBe(false);
    }
    // Steps keep the problem open — they must not clear it as "solved".
    expect(conversation.lastProblemState).not.toBeNull();

    const final = await turn(user, conversation, ...FINAL);
    expect(final.problemAnswered).toBe(true);
    expect(final.wasCorrect).toBe(true);
    expect(final.xpBreakdown.tier2Type).toBe('clean');
    expect(conversation.problemsCorrect).toBe(1);
  });

  test('the production replay: a restarted problem earns nothing on the re-run', async () => {
    const user = makeUser();
    const conversation = makeConversation();

    // First pass reaches x = 8. That is the one legitimate solve.
    for (const [msg, reply] of STEPS) await turn(user, conversation, msg, reply);
    const first = await turn(user, conversation, ...FINAL);
    expect(first.xpBreakdown.tier2Type).toBe('clean');

    // The giveaway guard swapped the confirmation for "what step would you take
    // from here?" and the student started the proof again from the top.
    conversation.messages.push({ role: 'assistant', content: 'What step would you take from here?' });
    for (const [msg, reply] of STEPS) {
      const r = await turn(user, conversation, msg, reply);
      expect({ msg, tier2: r.xpBreakdown.tier2 }).toEqual({ msg, tier2: 0 });
    }
    const again = await turn(user, conversation, ...FINAL);
    expect(again.xpBreakdown.tier2).toBe(0);
    expect(again.xpBreakdown.tier2Type).toBeNull();

    expect(conversation.problemsCorrect).toBe(1);
    expect(user.xpLadderStats.lifetimeTier2).toBe(first.xpBreakdown.tier2);
  });

  test('a wrong attempt earlier in the problem makes the solve "correct", not "clean"', async () => {
    const user = makeUser();
    const conversation = makeConversation();

    await turn(user, conversation, '5x+2-3x=26', 'Check the distribution — what is 5 times 2? <PROBLEM_RESULT:incorrect>');
    for (const [msg, reply] of STEPS) await turn(user, conversation, msg, reply);
    const final = await turn(user, conversation, ...FINAL);

    expect(final.wasCorrect).toBe(true);
    expect(final.xpBreakdown.tier2Type).toBe('correct');
  });
});

describe('what still counts', () => {
  test('an equation IS the answer when nothing on the table it could be a step of', async () => {
    // "Write an equation for: five more than three times a number is 20."
    const user = makeUser();
    const conversation = {
      ...makeConversation(),
      messages: [
        { role: 'user', content: 'I need to write an equation for this word problem' },
        { role: 'assistant', content: 'Five more than three times a number is 20. Write it as an equation.' },
      ],
    };
    const r = await turn(user, conversation, '3x+5=20', 'Exactly the equation. <PROBLEM_RESULT:correct>');
    expect(r.problemAnswered).toBe(true);
    expect(r.xpBreakdown.tier2Type).toBe('clean');
  });

  test('a tutor-tagged final answer the regexes cannot read still counts', async () => {
    const user = makeUser();
    const conversation = {
      ...makeConversation(),
      messages: [
        { role: 'user', content: 'lets do factoring' },
        { role: 'assistant', content: 'Factor x^2 - 9.' },
      ],
    };
    const r = await turn(user, conversation, '(x-3)(x+3)', 'Yes! Difference of squares. <PROBLEM_RESULT:correct>');
    expect(r.problemAnswered).toBe(true);
    expect(r.wasCorrect).toBe(true);
  });

  test('a skip is still recorded', async () => {
    const user = makeUser();
    const conversation = makeConversation();
    const r = await turn(user, conversation, 'idk skip it', "No problem, let's move on. <PROBLEM_RESULT:skipped>");
    expect(r.problemAnswered).toBe(true);
    expect(r.wasSkipped).toBe(true);
  });
});

describe('diagnose marks its own step verdicts', () => {
  test('an equivalent rewrite of a posed expression is a correct STEP, not a solve', async () => {
    const user = makeUser();
    const conversation = {
      ...makeConversation(),
      messages: [
        { role: 'user', content: 'order of operations please' },
        { role: 'assistant', content: 'Try this one: 24 - 6 ÷ 2 + 3' },
      ],
    };
    const r = await turn(user, conversation, '24-3+3', 'Good — division first. Keep going.');
    expect(r.problemAnswered).toBe(false);
    expect(r.xpBreakdown.tier2).toBe(0);

    const done = await turn(user, conversation, '24', 'Yes, 24! <PROBLEM_RESULT:correct>');
    expect(done.wasCorrect).toBe(true);
    expect(done.xpBreakdown.tier2Type).toBe('clean');
  });
});

describe('a multi-line chain that stops short is a step', () => {
  test('shown work without the final line does not finish the problem', async () => {
    const user = makeUser();
    const conversation = makeConversation();
    conversation.boardProblem = { tex: '2(x+3)=10' };
    const r = await turn(user, conversation, '2(x+3)=10\n2x+6=10\n2x=4', 'Nice work so far.');
    expect(r.problemAnswered).toBe(false);
    expect(r.xpBreakdown.tier2).toBe(0);

    const done = await turn(user, conversation, '2(x+3)=10\n2x+6=10\n2x=4\nx=2', 'Yes! <PROBLEM_RESULT:correct>');
    expect(done.wasCorrect).toBe(true);
    expect(done.xpBreakdown.tier2Type).toBe('clean');
  });
});

describe('solveCredit helpers', () => {
  const { isFinalForm, isEquationStep, lastMathStatement, isRepeatSolve } = require('../../utils/pipeline/solveCredit');

  test('final form is a value, or one variable set to a value', () => {
    for (const s of ['x=8', 'x = -3/4', '8 = x', '24', '-2.5']) expect({ s, final: isFinalForm(s) }).toEqual({ s, final: true });
    for (const s of ['2x=16', '2x+10=26', '24-3+3', 'y=2x+3', '']) expect({ s, final: isFinalForm(s) }).toEqual({ s, final: false });
  });

  test('the last math statement is read out of prose', () => {
    expect(lastMathStatement('-10 on both sides to get 2x=16')).toBe('2x=16');
    expect(lastMathStatement('divide by 2 to get x=8')).toBe('x=8');
  });

  test('an equation is a step only of an equation already on the table', () => {
    expect(isEquationStep('2x=16', ['Nice! So 2x + 10 = 26. What next?'])).toBe(true);
    expect(isEquationStep('2x=16', ['Solve 3x - 1 = 20'])).toBe(false);        // different solution
    expect(isEquationStep('3x+5=20', ['Write it as an equation.'])).toBe(false);
    expect(isEquationStep('3x+5=20', ['3x+5=20'])).toBe(false);                // restating, not a step
  });

  test('a repeat needs the same answer, and the same problem when both are known', () => {
    const log = [{ key: 'a', answer: '8' }, { key: null, answer: '5' }];
    expect(isRepeatSolve(log, 'a', '8')).toBe(true);
    expect(isRepeatSolve(log, 'b', '8')).toBe(false);
    expect(isRepeatSolve(log, null, '5')).toBe(true);   // keyless: the most recent solve only
    expect(isRepeatSolve(log, null, '9')).toBe(false);
  });
});

describe('xpEngine: clean means first try', () => {
  const { computeXpBreakdown } = require('../../utils/pipeline/xpEngine');
  test('a correct answer after a wrong attempt is "correct", not "clean"', () => {
    expect(computeXpBreakdown({ wasCorrect: true, recentMessages: [], firstTry: false }).tier2Type).toBe('correct');
    expect(computeXpBreakdown({ wasCorrect: true, recentMessages: [] }).tier2Type).toBe('clean');
  });
});
