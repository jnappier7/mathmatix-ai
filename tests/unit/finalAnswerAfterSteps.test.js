jest.mock('../../utils/logger', () => ({
  child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { observe, extractAnswer, MESSAGE_TYPES } = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');
const { decide, ACTIONS } = require('../../utils/pipeline/decide');

// Owner session, 2026-11-03, signed-in student on chat.html. "can you help me
// with 3(x - 4) = 2x + 5" pinned. The student distributed (graded), then wrote
// "subtract 2x so x - 12 = 5, so x = 7" — a right step and a wrong final value
// — and got no verdict. Then "oh wait, x = 17", correct, also no verdict: the
// tutor re-scaffolded "add 12 to both sides" on a solved problem. Neither
// message matched an answer shape (the lead-in and the comma conclusion hid
// "x = …"), so observe said general_math and the answer path — which owns
// final values — never ran; gradeEquationStep skips final forms by design.
// problemResult stayed null and problemsAttempted 0 all session.

const PIN = '3(x - 4) = 2x + 5';
const OPENER = 'can you help me with 3(x - 4) = 2x + 5';

// Shaped like utils/pipeline/index.js builds it: user messages as {content},
// assistant messages carrying their (absent) problemInfo stamp.
async function turn(message, priorTutor) {
  const recentAssistantMessages = [{ content: priorTutor, problemResult: null, problemInfo: null }];
  const recentUserMessages = [{ content: OPENER }];
  const observation = observe(message, {
    recentUserMessages,
    recentAssistantMessages,
    recentProblemResults: [],
  });
  const diagnosis = await diagnose(observation, {
    recentAssistantMessages,
    recentUserMessages,
    pinnedProblemTex: PIN,
    lastProblemState: null,
  });
  const decision = decide(observation, diagnosis, {});
  return { observation, diagnosis, decision };
}

describe('final value after shown steps on a pinned linear problem', () => {
  it('still grades the distribution as a correct step', async () => {
    const { diagnosis } = await turn('3x - 12 = 2x + 5',
      "Let's start solving \\( 3(x - 4) = 2x + 5 \\). First, distribute the \\( 3 \\). What do you get?");
    expect(diagnosis.isCorrect).toBe(true);
    expect(diagnosis.isStep).toBe(true);
  });

  it.each([
    ['the tutor quoted the last equation', "You nailed it! Now we have \\( 3x - 12 = 2x + 5 \\). What do you think is the next step?"],
    ['the tutor quoted nothing', 'Nice. What do you think is the next step?'],
  ])('"…x - 12 = 5, so x = 7" is a WRONG final value, broken at x = 7 (%s)', async (_label, prior) => {
    const { observation, diagnosis, decision } = await turn('subtract 2x so x - 12 = 5, so x = 7', prior);
    expect(observation.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(observation.answer.value).toBe('7');
    expect(diagnosis.isCorrect).toBe(false);
    expect(diagnosis.type).toBe('incorrect');
    // The right step is credited by the chain; the bad one is named, not fixed.
    expect(diagnosis.derivation).toMatchObject({ valid: false, firstBadStep: 'x = 7', lastGoodStep: 'x - 12 = 5', finalAnswer: '7' });
    expect(decision.action).toBe(ACTIONS.GUIDE_INCORRECT);
    expect(JSON.stringify(decision.directives || [])).not.toMatch(/\b17\b/);
  });

  it.each([
    ['If we add \\( 12 \\) to both sides, what do you get?'],
    ['What do you think is the next step?'],
  ])('"oh wait, x = 17" is a correct, finished solve after: %s', async (prior) => {
    const { observation, diagnosis, decision } = await turn('oh wait, x = 17', prior);
    expect(observation.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(diagnosis.isCorrect).toBe(true);
    expect(diagnosis.type).toBe('correct');
    expect(diagnosis.isStep).toBeFalsy();
    expect(diagnosis.isTransformation).toBeFalsy();
    expect(decision.action).toBe(ACTIONS.CONFIRM_CORRECT);
  });

  it('does not take a final value for a different variable as a solve of the pin', async () => {
    const { diagnosis } = await turn('so y = 7', 'What do you think is the next step?');
    expect(diagnosis.isCorrect).toBeNull();
  });
});

describe('extractAnswer — "x = <value>" behind a lead-in or a conclusion comma', () => {
  it.each([
    ['oh wait, x = 17', '17'],
    ['oh wait x = 17', '17'],
    ['so x = 7', '7'],
    ['subtract 2x so x - 12 = 5, so x = 7', '7'],
    ['x - 12 = 5, so x = 17', '17'],
    ['actually x = -3/4', '-3/4'],
  ])('%s → %s', (text, value) => {
    expect(extractAnswer(text).value).toBe(value);
  });

  it.each([
    ['3x = 17', '17'],
    ['plug in x = 7', '7'],
    ['what if x = 7', '7'],
    ['if x = 3, y = 7', '7'],
  ])('%s is not the claim %s', (text, value) => {
    const a = extractAnswer(text);
    expect(a ? a.value : null).not.toBe(value);
  });
});
