/**
 * A reversed verdict repairs the original attempt (course audit C04).
 *
 * External course audit, 2026-10-18..23: "3,004 − 1,567 = 1,437 with regrouping
 * and addition check" was recorded as a miss (accuracy 30/31 → 30/32); the
 * student repeated 1,437, it was accepted, and the record became 31/33 — the
 * false miss kept, a second "comeback" attempt beside it, and the solve paid
 * the +11 retry XP instead of the +18 clean solve. Twelve such cases in §4.
 *
 * The false miss is reproduced here the way it actually happened in stored
 * conversations: the tutor message carries the bad key the pre-fix solver
 * stored for "3,004 − 1,567" (it read "3,004" as 3). Every turn then runs the
 * real observe → diagnose → persist chain; only DB writes are stubbed.
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
const { planVerdictRepair, repairSkillAccuracy } = require('../../utils/pipeline/verdictRepair');
const User = require('../../models/user');

const POSED = 'Now try this one: 3,004 − 1,567. Show me how you regroup.';
const FULL_WORK = 'I regroup across the zeros.\nOnes: 14 − 7 = 7\nTens: 9 − 6 = 3\nHundreds: 9 − 5 = 4\nThousands: 2 − 1 = 1\nSo 3,004 − 1,567 = 1,437\nCheck: 1,437 + 1,567 = 3,004';
const BAD_KEY = { type: 'evaluation', correctAnswer: '3' };     // what the pre-fix solver stored
const GOOD_KEY = { type: 'evaluation', correctAnswer: '1437' };

function makeUser() {
  const user = new User({ username: 'auditor', email: 'a@example.com', firstName: 'Ana' });
  user.save = jest.fn().mockResolvedValue(user);
  return user;
}

// The audit's session counter stood at 30/31 before this problem.
function makeConversation() {
  return {
    messages: [{ role: 'assistant', content: POSED, problemInfo: BAD_KEY }],
    lastProblemState: null,
    problemsAttempted: 31,
    problemsCorrect: 30,
    firstTryAttempted: 31,
    firstTryCorrect: 30,
    markModified() {},
    save: jest.fn().mockResolvedValue(),
  };
}

/** One student turn, end to end; `nextKey` is what the tutor reply ends up keyed to. */
async function turn(user, conversation, message, reply, nextKey) {
  conversation.messages.push({ role: 'user', content: message });
  const recentAssistantMessages = conversation.messages.filter(m => m.role === 'assistant').slice(-3);
  const recentUserMessages = conversation.messages.filter(m => m.role === 'user').slice(-4, -1);
  const observation = observe(message, { recentAssistantMessages, recentUserMessages, recentProblemResults: [] });
  const diagnosis = await diagnose(observation, {
    recentAssistantMessages,
    recentUserMessages,
    lastProblemState: conversation.lastProblemState,
  });
  const { extracted, text } = extractSystemTags(reply);
  const result = await persist({
    user, conversation, extracted, diagnosis, observation,
    decision: {}, responseText: text, originalMessage: message, aiProcessingSeconds: 0,
    masteryAttempt: { skillId: 'multi_digit_subtraction', correct: diagnosis.isCorrect === true },
  });
  const reply_ = conversation.messages[conversation.messages.length - 1];
  reply_.problemInfo = nextKey;
  return { result, diagnosis, reply: reply_ };
}

const accuracyPillar = (user) => {
  const map = user.skillMastery instanceof Map ? user.skillMastery : new Map(Object.entries(user.skillMastery || {}));
  for (const [, v] of map) if (v?.pillars?.accuracy) return v.pillars.accuracy;
  return null;
};

describe('a false miss repaired by the same answer', () => {
  test('production replay: 30/31 → false miss → repeat accepted ends at 31/32, not 31/33', async () => {
    const user = makeUser();
    const conversation = makeConversation();

    // Turn 1: the full, correct work, graded against the stored bad key.
    const miss = await turn(user, conversation, FULL_WORK,
      'Every column is right! What is your final answer?', GOOD_KEY);
    expect(miss.diagnosis.isCorrect).toBe(false);
    expect(conversation.problemsAttempted).toBe(32);
    expect(conversation.problemsCorrect).toBe(30);
    const original = conversation.messages[conversation.messages.length - 1];
    expect(original.problemResult).toBe('incorrect');

    // Turn 2: the student repeats the answer they already gave.
    const fix = await turn(user, conversation, '1,437', 'Yes — 1,437 is right. Nice regrouping!', null);
    expect(fix.diagnosis.isCorrect).toBe(true);

    // The original attempt is the solve; this turn is not a second attempt.
    expect(original.problemResult).toBe('correct');
    expect(original.verdictRepair).toMatchObject({ from: 'incorrect', to: 'correct' });
    expect(fix.reply.problemResult ?? null).toBeNull();
    expect(conversation.problemsAttempted).toBe(32);
    expect(conversation.problemsCorrect).toBe(31);
    expect(conversation.firstTryAttempted).toBe(32);
    expect(conversation.firstTryCorrect).toBe(31);

    // Rewards: the clean first-try solve, not the retry payout.
    expect(fix.result.xpBreakdown.tier2Type).toBe('clean');
    expect(fix.result.firstTry).toBe(true);
    expect(fix.result.comeback).toBe(false);
    expect(fix.result.verdictRepair).toEqual({ missesRemoved: 1, restoredFirstTry: true });

    // The skill's accuracy pillar holds one correct attempt, not a miss + a hit.
    expect(accuracyPillar(user)).toMatchObject({ correct: 1, total: 1 });
  });

  test('two false misses on the same answer (audit 23×15: 4/4 → 4/5 → 4/6 → 5/7) end at 5/5', async () => {
    const user = makeUser();
    const conversation = makeConversation();
    conversation.problemsAttempted = 4; conversation.problemsCorrect = 4;
    conversation.firstTryAttempted = 4; conversation.firstTryCorrect = 4;

    const first = await turn(user, conversation, FULL_WORK, 'Let\'s check that final answer again?', BAD_KEY);
    const firstReply = first.reply;
    const second = await turn(user, conversation, 'So 3,004 − 1,567 = 1,437', 'Hmm, can you recheck?', GOOD_KEY);
    expect(second.diagnosis.isCorrect).toBe(false);
    expect([conversation.problemsCorrect, conversation.problemsAttempted]).toEqual([4, 6]);

    const fix = await turn(user, conversation, '1,437', 'You\'re right, 1,437!', null);
    expect(fix.diagnosis.isCorrect).toBe(true);
    expect([conversation.problemsCorrect, conversation.problemsAttempted]).toEqual([5, 5]);
    expect(firstReply.problemResult).toBe('correct');
    expect(second.reply.problemResult).toBeNull();
    expect(second.reply.verdictRepair).toMatchObject({ to: 'withdrawn' });
    expect(conversation.firstTryCorrect).toBe(5);
    expect(fix.result.xpBreakdown.tier2Type).toBe('clean');
    expect(accuracyPillar(user)).toMatchObject({ correct: 1, total: 1 });
  });

  test('a genuinely wrong answer then the right one is a real comeback — nothing is rewritten', async () => {
    const user = makeUser();
    const conversation = makeConversation();
    conversation.messages[0].problemInfo = GOOD_KEY;

    const wrong = await turn(user, conversation, 'So 3,004 − 1,567 = 1,537', 'Check the hundreds column?', GOOD_KEY);
    expect(wrong.diagnosis.isCorrect).toBe(false);
    const fix = await turn(user, conversation, '1,437', 'Yes, now it\'s right.', null);
    expect(fix.diagnosis.isCorrect).toBe(true);

    expect(wrong.reply.problemResult).toBe('incorrect');
    expect(wrong.reply.verdictRepair).toBeUndefined();
    expect(fix.reply.problemResult).toBe('correct');
    expect([conversation.problemsCorrect, conversation.problemsAttempted]).toEqual([31, 33]);
    expect(conversation.firstTryCorrect).toBe(30);
    expect(fix.result.xpBreakdown.tier2Type).toBe('correct');
    expect(fix.result.comeback).toBe(true);
    expect(fix.result.verdictRepair).toBeUndefined();
  });

  test('a real first-try miss, then a false miss, then the fix: the false miss is repaired, the first try is not', async () => {
    const user = makeUser();
    const conversation = makeConversation();

    const wrong = await turn(user, conversation, 'So 3,004 − 1,567 = 1,537', 'Check the hundreds?', BAD_KEY);
    const falseMiss = await turn(user, conversation, FULL_WORK, 'What is your final answer?', GOOD_KEY);
    expect(falseMiss.diagnosis.isCorrect).toBe(false);
    const fix = await turn(user, conversation, '1,437', 'Right!', null);

    expect(wrong.reply.problemResult).toBe('incorrect');
    expect(falseMiss.reply.problemResult).toBe('correct');
    // 31 → 33 attempts (the real miss and the solve), 30 → 31 correct.
    expect([conversation.problemsCorrect, conversation.problemsAttempted]).toEqual([31, 33]);
    expect(conversation.firstTryCorrect).toBe(30);
    expect(fix.result.xpBreakdown.tier2Type).toBe('correct');
    expect(fix.result.verdictRepair).toEqual({ missesRemoved: 1, restoredFirstTry: false });
  });
});

describe('planVerdictRepair', () => {
  const msgs = (...pairs) => pairs.flatMap(([u, r]) => [{ role: 'user', content: u }, { role: 'assistant', content: 'x', problemResult: r }]);

  test('equivalent forms count as the same answer (0.5 vs 5/10)', () => {
    const m = [...msgs(['five tenths, 0.5, 5/10', 'incorrect']), { role: 'user', content: '0.5' }];
    expect(planVerdictRepair(m, { attemptCount: 1 }, '0.5')).toMatchObject({ original: 1, missesRemoved: 1, restoresFirstTry: true });
  });

  test('stops at the previous problem\'s correct stamp', () => {
    const m = [...msgs(['1/8', 'correct'], ['1/8', 'incorrect']), { role: 'user', content: '1/8' }];
    expect(planVerdictRepair(m, { attemptCount: 1 }, '1/8')).toMatchObject({ original: 3, missesRemoved: 1 });
  });

  test('no open problem, nothing to repair', () => {
    const m = [...msgs(['1/8', 'incorrect']), { role: 'user', content: '1/8' }];
    expect(planVerdictRepair(m, null, '1/8')).toBeNull();
    expect(planVerdictRepair(m, { attemptCount: 0 }, '1/8')).toBeNull();
  });

  test('a different earlier answer is never repaired', () => {
    const m = [...msgs(['2/8', 'incorrect']), { role: 'user', content: '1/8' }];
    expect(planVerdictRepair(m, { attemptCount: 1 }, '1/8')).toBeNull();
  });
});

describe('repairSkillAccuracy', () => {
  test('takes the false misses back out of the total, never below correct', () => {
    const e = { pillars: { accuracy: { correct: 3, total: 5, percentage: 0.6 } } };
    expect(repairSkillAccuracy(e, 2)).toBe(true);
    expect(e.pillars.accuracy).toMatchObject({ correct: 3, total: 3, percentage: 1 });
    expect(repairSkillAccuracy(e, 2)).toBe(false);
  });
});
