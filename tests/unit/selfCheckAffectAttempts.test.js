/**
 * The three eval-harness calibration findings (2026-07-29), pinned at unit
 * level. The persona suite pins the same behavior as trajectories; these
 * are the minimal single-call reproductions.
 *
 *  1. observe: the x= form in a self-check ("is it x = 8?") is an
 *     answer attempt with the numeric value extracted.
 *  2. observe: an affect/hedge prefix ("ugh fine.", "idk,") must not
 *     swallow an embedded self-check attempt — and the affect survives
 *     as a context signal.
 *  3. decide: a VERIFIED attempt outranks a lingering give-up streak;
 *     an unverifiable attempt keeps the exit-ramp support.
 */

const { observe, MESSAGE_TYPES } = require('../../utils/pipeline/observe');
const { decide, ACTIONS } = require('../../utils/pipeline/decide');

describe('observe: self-check answer attempts with x= form', () => {
  test('"is it x = 8?" is an answer attempt with value 8', () => {
    const obs = observe('is it x = 8?');
    expect(obs.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(obs.answer.value).toBe('8');
  });

  test('"x = 8, right?" is an answer attempt with value 8', () => {
    const obs = observe('x = 8, right?');
    expect(obs.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(obs.answer.value).toBe('8');
  });

  test('a genuine question is still a question', () => {
    expect(observe('what is 10/24?').messageType).toBe(MESSAGE_TYPES.QUESTION);
  });
});

describe('observe: affect prefix does not swallow an embedded attempt', () => {
  test('"ugh fine. is it x = 8?" grades as an attempt, frustration kept as signal', () => {
    const obs = observe('ugh fine. is it x = 8?');
    expect(obs.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(obs.answer.value).toBe('8');
    expect(obs.contextSignals.some((s) => s.type === 'frustration')).toBe(true);
  });

  test('"idk, is it 7/8?" grades as an attempt', () => {
    const obs = observe('idk, is it 7/8?');
    expect(obs.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(obs.answer.value).toBe('7/8');
  });

  test('pure affect still classifies as affect', () => {
    expect(observe('ugh i hate this').messageType).toBe(MESSAGE_TYPES.FRUSTRATION);
    expect(observe('idk').messageType).toBe(MESSAGE_TYPES.IDK);
    expect(observe('just tell me the answer').messageType).toBe(MESSAGE_TYPES.GIVE_UP);
  });
});

describe('decide: verified attempt outranks the give-up streak', () => {
  const streakObservation = (overrides = {}) => ({
    messageType: MESSAGE_TYPES.ANSWER_ATTEMPT,
    answer: { value: '8', raw: 'is it 8?' },
    streaks: { idkCount: 0, giveUpCount: 1, recentWrongCount: 0, recentCorrectCount: 0 },
    contextSignals: [],
    problemContext: 'numeric',
    raw: 'is it 8?',
    ...overrides,
  });

  test('verified CORRECT after a give-up turn confirms, never exit-ramps', () => {
    const decision = decide(
      streakObservation(),
      { type: 'correct', isCorrect: true, correctAnswer: '8', verificationState: 'verified_correct' },
      {}
    );
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  test('verified INCORRECT after a give-up turn guides, never exit-ramps', () => {
    const decision = decide(
      streakObservation({ answer: { value: '7', raw: 'is it 7?' } }),
      { type: 'incorrect', isCorrect: false, correctAnswer: '8', verificationState: 'verified_incorrect' },
      {}
    );
    expect(decision.action).not.toBe(ACTIONS.EXIT_RAMP);
    expect([ACTIONS.GUIDE_INCORRECT, ACTIONS.RETEACH_MISCONCEPTION, ACTIONS.HINT, ACTIONS.SCAFFOLD_DOWN])
      .toContain(decision.action);
  });

  test('UNVERIFIABLE attempt under the streak keeps the exit ramp', () => {
    const decision = decide(
      streakObservation({ answer: { value: 'q', raw: 'the answer is definitely q' } }),
      { type: 'unverifiable', isCorrect: null, correctAnswer: null, verificationState: 'unverified' },
      {}
    );
    expect(decision.action).toBe(ACTIONS.EXIT_RAMP);
  });

  test('a plain give-up message still exit-ramps regardless of diagnosis', () => {
    const decision = decide(
      streakObservation({ messageType: MESSAGE_TYPES.GIVE_UP, answer: null }),
      { type: 'no_answer', isCorrect: null, correctAnswer: null, verificationState: 'not_applicable' },
      {}
    );
    expect(decision.action).toBe(ACTIONS.EXIT_RAMP);
  });
});
