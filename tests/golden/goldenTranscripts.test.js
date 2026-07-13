/**
 * GOLDEN TRANSCRIPTS — behavior + safety regression net for the tutoring pipeline.
 *
 * WHY THIS EXISTS
 * The pipeline (utils/pipeline/) IS the product. Prompts and models change often;
 * this suite locks the *deterministic* teaching decisions (observe + decide) and a
 * set of non-negotiable SAFETY invariants so that a prompt tweak, a model swap, or a
 * refactor can't silently change how the tutor classifies a student or — worse —
 * start affirming answers it never verified.
 *
 * WHAT IT DOES NOT DO
 * It does not call the LLM or the DB. The `generate` stage's wording and the live
 * `diagnose` verdict are out of scope here (the diagnosis is injected as a controlled
 * variable). Pair this with tests/unit/pipelineIntegration.test.js for the mocked
 * end-to-end path.
 *
 * ADD A CASE: edit tests/golden/transcripts.json — no code changes needed.
 * See tests/golden/README.md.
 */

// llmVerifier (imported below for pickProblemContext) pulls the LLM gateway in at
// module load. Mock it so this suite stays hermetic and key-free — pickProblemContext
// itself is a pure function and makes no LLM calls.
jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));
jest.mock('../../utils/openaiClient', () => ({ chat: { completions: { create: jest.fn() } } }));

const { observe, MESSAGE_TYPES } = require('../../utils/pipeline/observe');
const { decide, ACTIONS } = require('../../utils/pipeline/decide');
const { pickProblemContext } = require('../../utils/pipeline/llmVerifier');
const fixtures = require('./transcripts.json');

// ── Build a synthesized observation (mirrors the shape observe() emits, the way
//    the existing decide unit tests construct it) ──
function synthObservation(d) {
  return {
    messageType: d.messageType,
    answer: d.answer || null,
    contextSignals: d.contextSignals || [],
    streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0, ...(d.streaks || {}) },
  };
}

function decisionDirectives(decision) {
  return Array.isArray(decision.directives) ? decision.directives : [];
}

// ── Safety invariants. Each returns null when satisfied, or a string describing
//    the violation. `default: true` invariants run on EVERY decide case. ──
const SAFETY_INVARIANTS = {
  // The cardinal rule: only confirm an answer the system actually verified as correct.
  // This is the guard against affirming wrong OR unverified answers.
  confirm_implies_correct: {
    default: true,
    check: (decision, diagnosis) => {
      if (decision.action !== ACTIONS.CONFIRM_CORRECT) return null;
      return diagnosis && diagnosis.type === 'correct'
        ? null
        : `confirm_correct emitted for diagnosis.type="${diagnosis && diagnosis.type}" (only "correct" may be confirmed)`;
    },
  },

  // When the math engine couldn't verify, never auto-confirm, and the tutor must be
  // told to compute/verify before responding.
  no_autoconfirm_unverified: {
    default: true,
    check: (decision, diagnosis) => {
      if (!diagnosis || diagnosis.type !== 'unverifiable') return null;
      if (decision.action === ACTIONS.CONFIRM_CORRECT) {
        return 'unverifiable answer reached confirm_correct';
      }
      const hasVerifyGuard = decisionDirectives(decision).some((d) =>
        /verif|compute the correct answer/i.test(d)
      );
      return hasVerifyGuard
        ? null
        : 'unverifiable answer carried no "verify before responding" directive';
    },
  },

  // A give-up / exit-ramp must never leak the answer.
  giveup_no_reveal: {
    default: false,
    check: (decision) => {
      const hasNoRevealGuard = decisionDirectives(decision).some((d) =>
        /never reveal|don't reveal|do not reveal|without revealing/i.test(d)
      );
      return hasNoRevealGuard ? null : 'exit ramp carried no "never reveal the answer" directive';
    },
  },
};

function runSafety(names, decision, diagnosis) {
  const violations = [];
  for (const [name, inv] of Object.entries(SAFETY_INVARIANTS)) {
    const requested = inv.default || (names && names.includes(name));
    if (!requested) continue;
    const result = inv.check(decision, diagnosis);
    if (result) violations.push(`[${name}] ${result}`);
  }
  return violations;
}

// ── Classification cases ──
describe('Golden transcripts: observe() classification', () => {
  for (const fx of fixtures.classification || []) {
    test(fx.name, () => {
      const obs = observe(fx.message, fx.context || {});
      expect(obs.messageType).toBe(fx.expectMessageType);
      // Every known expected type must be a real member of the enum (guards typos in fixtures).
      expect(Object.values(MESSAGE_TYPES)).toContain(fx.expectMessageType);
    });
  }
});

// ── Decision + safety cases ──
describe('Golden transcripts: decide() actions + safety invariants', () => {
  for (const fx of fixtures.decisions || []) {
    test(fx.name, () => {
      const cfg = fx.decide || {};
      const observation =
        cfg.from === 'observe' ? observe(fx.message, fx.context || {}) : synthObservation(cfg);
      const diagnosis = cfg.diagnosis || { type: 'no_answer' };

      const decision = decide(observation, diagnosis, fx.context || {});

      if (cfg.expectAction) {
        expect(decision.action).toBe(cfg.expectAction);
      }
      if (cfg.expectActionOneOf) {
        expect(cfg.expectActionOneOf).toContain(decision.action);
      }

      const violations = runSafety(fx.safety, decision, diagnosis);
      if (violations.length) {
        throw new Error(
          `Safety invariant(s) violated for "${fx.name}":\n  - ${violations.join('\n  - ')}`
        );
      }
    });
  }
});

// ── Problem-context selection ──
// The LLM verifier must check the student's answer against the message that POSED
// the problem — not the last pleasantry/follow-up. Verifying against the wrong text
// yields spurious verdicts. pickProblemContext is a pure function, so we assert it
// directly (no LLM call).
describe('Golden transcripts: pickProblemContext picks the real problem', () => {
  for (const fx of fixtures.problemContext || []) {
    test(fx.name, () => {
      const picked = pickProblemContext(fx.messages);
      expect(picked).toBe(fx.expectPicked);
    });
  }
});

// ── Meta: the suite must actually be exercising cases (guards an empty/parse-broken fixture file) ──
describe('Golden transcripts: suite integrity', () => {
  test('fixtures loaded and non-trivial', () => {
    expect((fixtures.classification || []).length).toBeGreaterThan(3);
    expect((fixtures.decisions || []).length).toBeGreaterThan(3);
    expect((fixtures.problemContext || []).length).toBeGreaterThan(2);
  });
});
