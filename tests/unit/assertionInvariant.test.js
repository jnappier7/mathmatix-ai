/**
 * THE ASSERTION INVARIANT, enforced on the way out.
 *
 * The tutor may claim the student's work is right or wrong ONLY when the
 * pipeline holds a matching verdict. verify() is where that becomes binding:
 * whatever the model wrote, a claim it has no grounds for gets rewritten before
 * the student sees it.
 *
 * The case that matters most here is the third describe block. The guard this
 * replaced recognised rejections by matching a list of openers ("hmm", "not
 * quite", "close but"). The reply that caused the incident began "Whoa, hold
 * up —" and matched none of them, so it shipped. These tests pin that such a
 * phrasing is now caught by the LLM tier rather than by having been added to a
 * list — because the next one won't be on the list either.
 */

jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));

const { callLLM } = require('../../utils/llmGateway');
const { verify } = require('../../utils/pipeline/verify');
const { VERIFICATION_STATES } = require('../../utils/pipeline/verificationState');

const REWRITE = 'You are right — nice work on that step. Now what comes next?';

/**
 * Route mocked LLM calls by which prompt they carry, so a test can assert on
 * the classifier's verdict and the rewrite independently.
 */
function mockLLM({ classifierVerdict = null, classifierThrows = false } = {}) {
  callLLM.mockImplementation(async (_model, messages) => {
    const system = messages?.[0]?.content || '';

    if (system.includes('You classify a math tutor')) {
      if (classifierThrows) throw new Error('classifier unavailable');
      return {
        choices: [{
          message: {
            content: JSON.stringify({ verdict: classifierVerdict, confidence: 0.95 }),
          },
        }],
      };
    }

    return { choices: [{ message: { content: REWRITE } }] };
  });
}

function baseContext(overrides = {}) {
  return {
    userId: 'u1',
    userMessage: '24-3+3',
    studentAnswer: '24-3+3',
    firstName: 'Jason',
    iepReadingLevel: null,
    isVisualLearner: false,
    isStreaming: false,
    res: null,
    action: 'continue_conversation',
    messageType: 'general_math',
    correctAnswer: null,
    diagnosisType: 'correct',
    hasRecentUpload: false,
    isWorksheetFollowUp: false,
    isBareProblemDrop: false,
    phaseState: null,
    llmVerdict: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ASSERTION_GUARD;
});

describe('rejecting work the system verified as CORRECT', () => {
  test('a plain rejection is caught by the fast path and rewritten', async () => {
    mockLLM();
    const result = await verify(
      "Not quite — let's look at that again.",
      baseContext({ verificationState: VERIFICATION_STATES.VERIFIED_CORRECT })
    );

    expect(result.flags).toContain('assertion_invariant_violated');
    expect(result.flags).toContain('assertion_invariant_regenerated');
    expect(result.text).toBe(REWRITE);
  });

  test('affirming verified-correct work is left alone', async () => {
    mockLLM();
    const result = await verify(
      "That's right! Nice work — on to the next one.",
      baseContext({ verificationState: VERIFICATION_STATES.VERIFIED_CORRECT })
    );

    expect(result.flags).not.toContain('assertion_invariant_violated');
  });
});

describe('asserting anything with NO verdict', () => {
  test('an unlicensed rejection is rewritten', async () => {
    mockLLM();
    const result = await verify(
      "That's not right, check your arithmetic.",
      baseContext({
        verificationState: VERIFICATION_STATES.UNVERIFIED,
        diagnosisType: 'unverifiable',
      })
    );

    expect(result.flags).toContain('assertion_invariant_violated');
    expect(result.text).toBe(REWRITE);
  });

  test('an unlicensed affirmation is rewritten — the more dangerous direction', async () => {
    mockLLM();
    const result = await verify(
      "Exactly, you nailed it.",
      baseContext({
        verificationState: VERIFICATION_STATES.UNVERIFIED,
        diagnosisType: 'unverifiable',
      })
    );

    expect(result.flags).toContain('assertion_invariant_violated');
  });

  test('teaching without a verdict claim is untouched', async () => {
    mockLLM({ classifierVerdict: 'neither' });
    const original = 'Which operation do we handle first in that expression?';
    const result = await verify(
      original,
      baseContext({
        verificationState: VERIFICATION_STATES.UNVERIFIED,
        diagnosisType: 'unverifiable',
      })
    );

    expect(result.flags).not.toContain('assertion_invariant_violated');
    expect(result.text).toBe(original);
  });
});

describe('phrasings no pattern list would catch', () => {
  test('"Whoa, hold up" is caught via the LLM tier, not a regex', async () => {
    mockLLM({ classifierVerdict: 'incorrect' });

    const result = await verify(
      "Whoa, hold up — walk me through that. You've got 24-6÷2+3, and I want to hear what you did with the 6÷2 part.",
      baseContext({ verificationState: VERIFICATION_STATES.VERIFIED_CORRECT })
    );

    // The classifier must actually have been consulted — that is the whole point.
    const classifierCalls = callLLM.mock.calls.filter(
      ([, messages]) => (messages?.[0]?.content || '').includes('You classify a math tutor')
    );
    expect(classifierCalls.length).toBe(1);

    expect(result.flags).toContain('assertion_invariant_violated');
    expect(result.text).toBe(REWRITE);
  });

  test('the classifier failing degrades to no rewrite, never a spurious one', async () => {
    mockLLM({ classifierThrows: true });
    const original = 'Whoa, hold up — walk me through that one more time.';

    const result = await verify(
      original,
      baseContext({ verificationState: VERIFICATION_STATES.VERIFIED_CORRECT })
    );

    // Fails CLOSED: an outage must not start rewriting every turn.
    expect(result.flags).not.toContain('assertion_invariant_violated');
    expect(result.text).toBe(original);
  });
});

describe('guard scoping', () => {
  test('NOT_APPLICABLE turns skip the guard entirely — no classifier call', async () => {
    mockLLM({ classifierVerdict: 'incorrect' });
    await verify(
      "Not quite — let's look at that again.",
      baseContext({
        verificationState: VERIFICATION_STATES.NOT_APPLICABLE,
        diagnosisType: 'no_answer',
      })
    );

    const classifierCalls = callLLM.mock.calls.filter(
      ([, messages]) => (messages?.[0]?.content || '').includes('You classify a math tutor')
    );
    expect(classifierCalls.length).toBe(0);
  });

  test('ASSERTION_GUARD=off disables enforcement', async () => {
    jest.resetModules();
    process.env.ASSERTION_GUARD = 'off';
    // Re-require so the module-level flag picks up the env change.
    jest.doMock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));
    const { verify: verifyOff } = require('../../utils/pipeline/verify');

    const original = "Not quite — let's look at that again.";
    const result = await verifyOff(
      original,
      baseContext({ verificationState: VERIFICATION_STATES.VERIFIED_CORRECT })
    );

    expect(result.flags).not.toContain('assertion_invariant_violated');
    expect(result.text).toBe(original);
  });
});
