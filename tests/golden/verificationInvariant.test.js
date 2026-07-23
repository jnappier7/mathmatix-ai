/**
 * VERIFICATION INVARIANT — replay real transcripts through the LIVE verification path.
 *
 * HOW THIS DIFFERS FROM goldenTranscripts.test.js
 *   That suite injects `diagnosis` as a controlled variable to test how decide()
 *   reacts to a verdict. Necessary, but structurally blind to the failure that
 *   motivated this suite: verification NEVER RUNNING. An injected diagnosis is a
 *   verdict by construction, so no fixture there can express "the pipeline
 *   produced no verdict and the tutor asserted anyway".
 *
 *   Here, nothing is injected. Student turns are replayed through the real
 *   observe → diagnose path and we assert the verification state the pipeline
 *   actually reaches.
 *
 * HERMETIC BY DESIGN
 *   The LLM verifier is NOT supplied (no llmVerificationPromise). Only the
 *   deterministic solver and the symbolic CAS run. That is deliberately the
 *   harder bar: it proves these cases resolve without spending a network call,
 *   and it keeps the suite fast and key-free in CI. Cases that genuinely need
 *   the LLM tier belong in tests/eval/.
 *
 * ADD A CASE: edit verificationTranscripts.json — no code changes needed.
 */

// Keep the suite key-free: diagnose pulls the misconception detector, which
// reaches for the LLM gateway at module load.
jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));
jest.mock('../../utils/openaiClient', () => ({
  callLLM: jest.fn(),
  chat: { completions: { create: jest.fn() } },
}));

const { observe } = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');
const {
  VERIFICATION_STATES,
  ASSERTIONS,
  hasMathematicalContent,
  deriveVerificationState,
  classifyAssertionFast,
  checkInvariant,
} = require('../../utils/pipeline/verificationState');
const fixtures = require('./verificationTranscripts.json');

/**
 * Replay one student turn exactly as the pipeline would, and report the
 * verification state reached.
 */
async function replayTurn(turn, transcript, priorTutorTurns) {
  const recentAssistantMessages = priorTutorTurns.map((content) => ({
    content,
    problemResult: null,
    problemInfo: null,
  }));

  const observation = observe(turn.student, {
    recentAssistantMessages,
    recentUserMessages: [],
  });

  const diagnosis = await diagnose(observation, {
    recentAssistantMessages,
    recentUserMessages: [],
    activeSkill: null, // no skill → no misconception LLM call → hermetic
    user: {},
    lastProblemState: null,
    pinnedProblemTex: transcript.pinnedProblem || null,
    llmVerificationPromise: null, // deterministic + symbolic tiers only
  });

  const mathPresent = hasMathematicalContent(turn.student);
  const state = deriveVerificationState(diagnosis, mathPresent);

  return { observation, diagnosis, state };
}

describe('Verification invariant: transcript replay through the live path', () => {
  for (const transcript of fixtures.transcripts || []) {
    describe(transcript.name, () => {
      for (let i = 0; i < transcript.turns.length; i++) {
        const turn = transcript.turns[i];
        const priorTutorTurns = transcript.turns.slice(0, i + 1).map((t) => t.tutor);

        test(`turn ${i + 1}: student says ${JSON.stringify(turn.student)}`, async () => {
          const { state, diagnosis } = await replayTurn(turn, transcript, priorTutorTurns);

          const detail =
            `\n  state=${state}` +
            `\n  diagnosis.type=${diagnosis.type}` +
            `\n  diagnosis.isCorrect=${diagnosis.isCorrect}` +
            `\n  verificationSource=${diagnosis.verificationSource}`;

          if (turn.expectState && state !== turn.expectState) {
            throw new Error(`expected state "${turn.expectState}" but got "${state}"${detail}`);
          }
          if (turn.expectStateOneOf && !turn.expectStateOneOf.includes(state)) {
            throw new Error(
              `expected one of [${turn.expectStateOneOf.join(', ')}] but got "${state}"${detail}`
            );
          }

          // The shipped reply that caused the incident, re-checked against the
          // state the pipeline now reaches. Turns a fixed bug into a permanent
          // regression test.
          if (turn.regressionReply) {
            // Pin which tier is required to catch this phrasing. `escalate`
            // means the fast path cannot judge it and the LLM classifier must —
            // an honest record of a real gap, not one to paper over with more
            // patterns.
            const fast = classifyAssertionFast(turn.regressionReply);
            if (turn.regressionReplyFastPath === 'escalate') {
              expect(fast).toBeNull();
            } else if (turn.regressionReplyFastPath) {
              expect(fast).toBe(turn.regressionReplyFastPath);
            }

            // Whichever tier produces it, the assertion the reply actually makes
            // must violate the invariant against the state now reached.
            const assertion = fast || turn.regressionReplyAssertion || ASSERTIONS.INCORRECT;
            const result = checkInvariant(assertion, state);
            if (result.ok) {
              throw new Error(
                `The regression reply should have violated the invariant but passed.${detail}` +
                `\n  assertion=${assertion}` +
                `\n  reply=${JSON.stringify(turn.regressionReply.slice(0, 120))}`
              );
            }
          }
        });
      }
    });
  }
});

// The fast path is an optimisation, not the guarantee. It is allowed to say
// "escalate" (null) for anything it cannot judge; the LLM classifier decides
// those. The only unacceptable outcome is a CONFIDENT WRONG label, because that
// would let a real violation through while looking decided.
describe('Verification invariant: assertion detection (fast path)', () => {
  const toLabel = (v) => (v === null ? 'escalate' : v);

  for (const fx of fixtures.assertionDetection || []) {
    test(fx.name, () => {
      const got = toLabel(classifyAssertionFast(fx.reply));
      if (fx.expectFastPathOneOf) {
        expect(fx.expectFastPathOneOf).toContain(got);
      } else {
        expect(got).toBe(fx.expectFastPath);
      }
    });
  }

  test('the fast path never labels a plain question as an assertion', () => {
    const questions = [
      'What do you get when you divide 6 by 2?',
      'Which operation comes first here?',
      'Can you show me your next step?',
      'What made you pick that one to do first?',
    ];
    for (const q of questions) {
      const got = classifyAssertionFast(q);
      expect([null, ASSERTIONS.NONE]).toContain(got);
    }
  });
});

// Pushback must be visible to the pipeline. It is deliberately a SIGNAL rather
// than only a message type: a student can dispute while frustrated, or while
// restating their answer, and the correctness consequence has to apply in all
// of those — not just when "you're wrong" is the entire message.
describe('Verification invariant: dispute detection', () => {
  for (const fx of fixtures.disputes || []) {
    test(fx.name, () => {
      const obs = observe(fx.message, { recentAssistantMessages: [], recentUserMessages: [] });
      expect(obs.isDispute).toBe(fx.expectDispute);
    });
  }

  test('a dispute inside a frustrated message is still seen as a dispute', () => {
    const obs = observe('ugh you are wrong', {
      recentAssistantMessages: [],
      recentUserMessages: [],
    });
    // Frustration wins the message TYPE — acknowledging the feeling is good
    // tutoring — but the dispute signal must survive so the verdict is reopened.
    expect(obs.messageType).toBe('frustration');
    expect(obs.isDispute).toBe(true);
  });
});

describe('Verification invariant: the rule itself', () => {
  for (const fx of fixtures.invariant || []) {
    test(fx.name, () => {
      const result = checkInvariant(fx.assertion, fx.state);
      expect(result.ok).toBe(fx.expectOk);
      if (!fx.expectOk) expect(typeof result.reason).toBe('string');
    });
  }
});

describe('Verification invariant: suite integrity', () => {
  test('fixtures loaded and non-trivial', () => {
    expect((fixtures.transcripts || []).length).toBeGreaterThan(2);
    expect((fixtures.invariant || []).length).toBeGreaterThan(4);
  });

  test('every VERIFICATION_STATES value is a plain lowercase slug', () => {
    for (const v of Object.values(VERIFICATION_STATES)) {
      expect(v).toMatch(/^[a-z_]+$/);
    }
  });
});
