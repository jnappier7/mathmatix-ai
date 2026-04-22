/**
 * Regression tests for the bare-problem-drop gate and tutor-plan alignment gate.
 *
 * Origin: production transcripts where the pipeline commanded the LLM to dump
 * a full solution:
 *   - Student drops "4x-5=22" with no attempt → tutor solves end-to-end.
 *   - Pipeline's `applyInstructionalMode` runs with tutorPlan target
 *     "simple-probability" mode=INSTRUCT while student asks about linear
 *     equations — routes to DIRECT_INSTRUCTION ("teach, don't ask") and the
 *     LLM obediently dumps the solution.
 *
 * The two fixes tested here:
 *   1. observe.detectBareProblemDrop flags bare equation drops.
 *      decide routes them to ACTIONS.ELICIT_FIRST with a deterministic
 *      response (no LLM). The response cannot leak an answer because no
 *      LLM is involved in producing it.
 *   2. decide checks modeTransition before applying plan-based mode. When
 *      the transition detector reports exploratory_tangent / homework /
 *      prerequisite_surface / course_topic_overlap at ≥0.6 confidence, the
 *      plan mode is skipped and the Socratic default handles the question.
 */

const {
  observe,
  detectBareProblemDrop,
  MESSAGE_TYPES,
} = require('../../utils/pipeline/observe');
const { decide, ACTIONS, INSTRUCTIONAL_MODES } = require('../../utils/pipeline/decide');

// ============================================================================
// detectBareProblemDrop — the structural flag
// ============================================================================

describe('detectBareProblemDrop', () => {
  const noAnswer = false;
  const typeGeneralMath = MESSAGE_TYPES.GENERAL_MATH;

  // ── Positive cases: the transcript's leak vectors ──

  test('flags "4x-5=22" — bare linear equation with no attempt', () => {
    expect(detectBareProblemDrop('4x-5=22', typeGeneralMath, noAnswer)).toBe(true);
  });

  test('flags "x^2=49" — bare quadratic', () => {
    expect(detectBareProblemDrop('x^2=49', typeGeneralMath, noAnswer)).toBe(true);
  });

  test('flags "x^2-3x=5" — bare quadratic with variable term', () => {
    expect(detectBareProblemDrop('x^2-3x=5', typeGeneralMath, noAnswer)).toBe(true);
  });

  test('flags "-2/3x+4=15" — bare linear with fractional coefficient', () => {
    expect(detectBareProblemDrop('-2/3x+4=15', typeGeneralMath, noAnswer)).toBe(true);
  });

  test('flags "what about 4x-5=22" — topic-shift preamble + bare problem', () => {
    // This classifies as QUESTION (starts with "what"), not GENERAL_MATH.
    expect(detectBareProblemDrop('what about 4x-5=22', MESSAGE_TYPES.QUESTION, noAnswer)).toBe(true);
  });

  test('flags "solve 3x+5=14" — imperative with bare problem', () => {
    expect(detectBareProblemDrop('solve 3x+5=14', typeGeneralMath, noAnswer)).toBe(true);
  });

  // ── Negative cases: real student work must NOT be flagged ──

  test('does not flag "I got x=7 but the show-my-work said wrong" (attempt present)', () => {
    const text = 'I got x=7 but the show-my-work said wrong';
    expect(detectBareProblemDrop(text, typeGeneralMath, noAnswer)).toBe(false);
  });

  test('does not flag "I\'m stuck on step 2 of 4x-5=22" (stuck indicator)', () => {
    expect(detectBareProblemDrop("I'm stuck on step 2 of 4x-5=22", typeGeneralMath, noAnswer)).toBe(false);
  });

  test('does not flag "after I factor, what do I do next?" (reasoning)', () => {
    expect(detectBareProblemDrop('after I factor, what do I do next?', MESSAGE_TYPES.QUESTION, noAnswer)).toBe(false);
  });

  test('does not flag "the square root of 49 is 7" (student statement, no problem)', () => {
    expect(detectBareProblemDrop('the square root of 49 is 7', typeGeneralMath, noAnswer)).toBe(false);
  });

  test('does not flag when classified as ANSWER_ATTEMPT', () => {
    expect(detectBareProblemDrop('x=7', MESSAGE_TYPES.ANSWER_ATTEMPT, true)).toBe(false);
  });

  test('does not flag when classified as IDK', () => {
    expect(detectBareProblemDrop('idk', MESSAGE_TYPES.IDK, noAnswer)).toBe(false);
  });

  test('does not flag when classified as HELP_REQUEST', () => {
    expect(detectBareProblemDrop("I'm stuck, help", MESSAGE_TYPES.HELP_REQUEST, noAnswer)).toBe(false);
  });

  test('does not flag an empty or whitespace message', () => {
    expect(detectBareProblemDrop('', typeGeneralMath, noAnswer)).toBe(false);
    expect(detectBareProblemDrop('   ', typeGeneralMath, noAnswer)).toBe(false);
  });

  test('does not flag plain-English messages without math symbols', () => {
    expect(detectBareProblemDrop('hello', MESSAGE_TYPES.GREETING, noAnswer)).toBe(false);
    expect(detectBareProblemDrop('tell me about derivatives', MESSAGE_TYPES.QUESTION, noAnswer)).toBe(false);
  });
});

// ============================================================================
// observe() surface — isBareProblemDrop propagates through the main fn
// ============================================================================

describe('observe() — isBareProblemDrop flag', () => {
  const emptyCtx = {
    recentUserMessages: [],
    recentAssistantMessages: [],
    hasRecentUpload: false,
  };

  test('exposes isBareProblemDrop=true for "4x-5=22"', () => {
    const result = observe('4x-5=22', emptyCtx);
    expect(result.isBareProblemDrop).toBe(true);
  });

  test('exposes isBareProblemDrop=false for "I got 4x=27, so x = 6.75"', () => {
    const result = observe('I got 4x=27, so x = 6.75', emptyCtx);
    expect(result.isBareProblemDrop).toBe(false);
  });
});

// ============================================================================
// decide() — bare-drop routes to ELICIT_FIRST with a deterministic response
// ============================================================================

describe('decide() — ELICIT_FIRST for bare problem drops', () => {
  const baseObservation = {
    messageType: MESSAGE_TYPES.GENERAL_MATH,
    confidence: 0.5,
    answer: null,
    demonstratedReasoning: false,
    contextSignals: [],
    streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
    problemContext: 'numeric',
    isWorksheetFollowUp: false,
    isBareProblemDrop: true,
    hasRecentUpload: false,
    raw: '4x-5=22',
  };

  const noAnswerDiagnosis = { type: 'no_answer', isCorrect: null, answer: null, correctAnswer: null };

  test('routes to ELICIT_FIRST and attaches a deterministic response', () => {
    const decision = decide(baseObservation, noAnswerDiagnosis, {
      phaseState: null,
      hasRecentUpload: false,
    });

    expect(decision.action).toBe(ACTIONS.ELICIT_FIRST);
    expect(typeof decision.deterministicResponse).toBe('string');
    expect(decision.deterministicResponse.length).toBeGreaterThan(20);
    // Response must not contain a solved answer
    expect(decision.deterministicResponse).not.toMatch(/x\s*=\s*-?\d/);
    // Response must invite the student to show work or request an example
    expect(decision.deterministicResponse).toMatch(/tried|tripping|stuck|example/i);
  });

  test('uses student first name when available', () => {
    const decision = decide(baseObservation, noAnswerDiagnosis, {
      phaseState: null,
      hasRecentUpload: false,
      user: { firstName: 'Jason' },
    });
    expect(decision.deterministicResponse).toContain('Jason');
  });

  test('does NOT route to ELICIT_FIRST when hasRecentUpload (worksheet guards own this flow)', () => {
    const decision = decide(baseObservation, noAnswerDiagnosis, {
      phaseState: null,
      hasRecentUpload: true,
    });
    expect(decision.action).not.toBe(ACTIONS.ELICIT_FIRST);
    expect(decision.deterministicResponse).toBeUndefined();
  });

  test('does NOT route to ELICIT_FIRST inside a structured lesson phase', () => {
    const decision = decide(baseObservation, noAnswerDiagnosis, {
      phaseState: { currentPhase: 'we-do', turnsInPhase: 1, evidenceLog: [] },
      hasRecentUpload: false,
    });
    expect(decision.action).not.toBe(ACTIONS.ELICIT_FIRST);
  });

  test('does NOT route to ELICIT_FIRST when isBareProblemDrop is false', () => {
    const obs = { ...baseObservation, isBareProblemDrop: false };
    const decision = decide(obs, noAnswerDiagnosis, {
      phaseState: null,
      hasRecentUpload: false,
    });
    expect(decision.action).not.toBe(ACTIONS.ELICIT_FIRST);
  });
});

// ============================================================================
// decide() — tutor-plan alignment gate skips plan mode on off-plan tangents
// ============================================================================

describe('decide() — alignment gate blocks plan mode on off-plan messages', () => {
  const questionObs = {
    messageType: MESSAGE_TYPES.QUESTION,
    confidence: 1,
    answer: null,
    demonstratedReasoning: false,
    contextSignals: [],
    streaks: { idkCount: 0, giveUpCount: 0, recentWrongCount: 0 },
    problemContext: 'conceptual',
    isWorksheetFollowUp: false,
    isBareProblemDrop: false, // explicitly not a bare drop — testing the plan gate
    hasRecentUpload: false,
    raw: 'why does integration by parts work?',
  };

  const noAnswerDiagnosis = { type: 'no_answer', isCorrect: null, answer: null, correctAnswer: null };

  // Tutor plan target: completely unrelated skill in INSTRUCT mode.
  // This is the production bug: plan says probability, student asks calculus.
  const offPlanTutorPlan = {
    currentTarget: {
      skillId: 'simple-probability',
      displayName: 'Simple Probability',
      instructionalMode: INSTRUCTIONAL_MODES.INSTRUCT,
      instructionPhase: 'vocabulary',
    },
    skillFocus: [{ skillId: 'simple-probability', prerequisiteGaps: [] }],
  };

  test('blocks DIRECT_INSTRUCTION when mode transition flags exploratory_tangent >=0.6', () => {
    const decision = decide(questionObs, noAnswerDiagnosis, {
      phaseState: null,
      tutorPlan: offPlanTutorPlan,
      activeSkill: { skillId: 'simple-probability', displayName: 'Simple Probability' },
      hasRecentUpload: false,
      modeTransition: {
        shouldTransition: true,
        transitionType: 'exploratory_tangent',
        confidence: 0.72,
        reason: 'Student exploring a tangent',
        suggestedDirectives: [],
      },
    });

    // Must NOT be direct_instruction (which would dump a solution).
    expect(decision.action).not.toBe(ACTIONS.DIRECT_INSTRUCTION);
    // Should fall through to continue_conversation (Socratic default).
    expect(decision.action).toBe(ACTIONS.CONTINUE_CONVERSATION);
    // And Socratic directives must be present.
    expect(decision.directives.some(d => /NEVER show the full solution/i.test(d))).toBe(true);
  });

  test('blocks plan mode on homework_detected transition', () => {
    const decision = decide(questionObs, noAnswerDiagnosis, {
      phaseState: null,
      tutorPlan: offPlanTutorPlan,
      activeSkill: { skillId: 'simple-probability', displayName: 'Simple Probability' },
      hasRecentUpload: false,
      modeTransition: {
        shouldTransition: true,
        transitionType: 'homework_detected',
        confidence: 0.8,
        reason: 'Homework context',
        suggestedDirectives: [],
      },
    });
    expect(decision.action).not.toBe(ACTIONS.DIRECT_INSTRUCTION);
  });

  test('blocks plan mode on prerequisite_surface transition', () => {
    const decision = decide(questionObs, noAnswerDiagnosis, {
      phaseState: null,
      tutorPlan: offPlanTutorPlan,
      activeSkill: { skillId: 'simple-probability', displayName: 'Simple Probability' },
      hasRecentUpload: false,
      modeTransition: {
        shouldTransition: true,
        transitionType: 'prerequisite_surface',
        confidence: 0.82,
        reason: 'Prereq gap surfaced',
        suggestedDirectives: [],
      },
    });
    expect(decision.action).not.toBe(ACTIONS.DIRECT_INSTRUCTION);
  });

  test('allows plan mode when transition is low confidence (<0.6)', () => {
    const decision = decide(questionObs, noAnswerDiagnosis, {
      phaseState: null,
      tutorPlan: offPlanTutorPlan,
      activeSkill: { skillId: 'simple-probability', displayName: 'Simple Probability' },
      hasRecentUpload: false,
      modeTransition: {
        shouldTransition: true,
        transitionType: 'exploratory_tangent',
        confidence: 0.55,
        reason: 'Weak tangent signal',
        suggestedDirectives: [],
      },
    });
    // Low-confidence transition → plan mode still applies (DIRECT_INSTRUCTION).
    expect(decision.action).toBe(ACTIONS.DIRECT_INSTRUCTION);
  });

  test('allows plan mode when no transition is flagged (on-plan)', () => {
    const decision = decide(questionObs, noAnswerDiagnosis, {
      phaseState: null,
      tutorPlan: offPlanTutorPlan,
      activeSkill: { skillId: 'simple-probability', displayName: 'Simple Probability' },
      hasRecentUpload: false,
      modeTransition: null,
    });
    expect(decision.action).toBe(ACTIONS.DIRECT_INSTRUCTION);
  });
});
