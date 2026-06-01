/**
 * Regression tests for the "progress report" classification.
 *
 * Origin: documented Maya bug — when a student volunteers a step they already
 * completed ("I completed the square by adding 16 to both sides"), the tutor
 * re-teaches that step instead of confirming it and moving on. The message had
 * no extractable answer and no intent keyword, so it fell through to
 * GENERAL_MATH, whose decide branch tells the LLM to "break the problem into
 * its first step and ask the student to attempt THAT step" — i.e. start over.
 *
 * The fix:
 *   1. observe.detectProgressReport flags first-person completed-step reports.
 *      observe classifies them as MESSAGE_TYPES.PROGRESS_REPORT (only in the
 *      fallback, so intent keywords and answer extraction still win first).
 *   2. decide routes PROGRESS_REPORT to ACTIONS.ACKNOWLEDGE_PROGRESS with
 *      directives to confirm the step and advance — never re-teach, never
 *      reveal the answer or do the next step.
 */

const {
  observe,
  detectProgressReport,
  MESSAGE_TYPES,
} = require('../../utils/pipeline/observe');
const { decide, ACTIONS } = require('../../utils/pipeline/decide');

// ============================================================================
// detectProgressReport — the structural flag
// ============================================================================

describe('detectProgressReport', () => {
  // ── Positive cases: student reports a completed step ──

  test.each([
    'I completed the square by adding 16 to both sides',
    'I factored it into (x+2)(x-3)',
    'I already distributed and combined like terms',
    'I subtracted 5 from both sides',
    'We multiplied both sides by 3',
    'I have already factored the numerator',
    'I then moved the 3 over to the other side',
    'I plugged in x = 2',
    'I simplified the left side',
  ])('flags %j as a completed-step report', (text) => {
    expect(detectProgressReport(text)).toBe(true);
  });

  // ── Negative cases: not completed-step reports ──

  test.each([
    '4x - 5 = 22',                       // bare problem drop, no completed action
    'cool, that makes sense',            // engagement, no action verb
    'the weather is nice today',         // off-topic, no action verb
    'x',                                 // too short / no verb
    'I want to learn how to factor',     // intent, not a completed step
  ])('does not flag %j', (text) => {
    expect(detectProgressReport(text)).toBe(false);
  });

  test('rejects empty / non-string input', () => {
    expect(detectProgressReport('')).toBe(false);
    expect(detectProgressReport(null)).toBe(false);
    expect(detectProgressReport(undefined)).toBe(false);
  });
});

// ============================================================================
// observe — full classification ordering
// ============================================================================

describe('observe — PROGRESS_REPORT classification', () => {
  const ctx = { recentUserMessages: [], recentAssistantMessages: [] };

  test('classifies "I completed the square by adding 16 to both sides" as PROGRESS_REPORT', () => {
    const result = observe('I completed the square by adding 16 to both sides', ctx);
    expect(result.messageType).toBe(MESSAGE_TYPES.PROGRESS_REPORT);
    expect(result.isBareProblemDrop).toBe(false);
  });

  test('classifies "I factored it into (x+2)(x-3)" as PROGRESS_REPORT', () => {
    const result = observe('I factored it into (x+2)(x-3)', ctx);
    expect(result.messageType).toBe(MESSAGE_TYPES.PROGRESS_REPORT);
  });

  // ── Ordering guards: earlier intent classifiers must still win ──

  test('"how do I factor this?" stays HELP_REQUEST, not PROGRESS_REPORT', () => {
    const result = observe('how do I factor this?', ctx);
    expect(result.messageType).toBe(MESSAGE_TYPES.HELP_REQUEST);
  });

  test('"I don\'t know how to factor" stays IDK, not PROGRESS_REPORT', () => {
    const result = observe("I don't know how to factor", ctx);
    expect(result.messageType).toBe(MESSAGE_TYPES.IDK);
  });

  test('"I stuck after I factored" stays HELP_REQUEST (stuck wins)', () => {
    const result = observe('I am stuck after I factored', ctx);
    expect(result.messageType).toBe(MESSAGE_TYPES.HELP_REQUEST);
  });

  test('an extractable answer wins over progress-report ("I got 7")', () => {
    const result = observe('I got 7', ctx);
    expect(result.messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
  });

  test('a bare problem drop is NOT a progress report', () => {
    const result = observe('4x - 5 = 22', ctx);
    expect(result.messageType).toBe(MESSAGE_TYPES.GENERAL_MATH);
    expect(result.isBareProblemDrop).toBe(true);
  });
});

// ============================================================================
// decide — routing
// ============================================================================

describe('decide — PROGRESS_REPORT routing', () => {
  const noAnswerDiagnosis = { type: 'no_answer', isCorrect: null };

  test('PROGRESS_REPORT routes to ACKNOWLEDGE_PROGRESS with no-re-teach directives', () => {
    const observation = observe('I completed the square by adding 16 to both sides', {
      recentUserMessages: [],
      recentAssistantMessages: [],
    });
    const decision = decide(observation, noAnswerDiagnosis, {});

    expect(decision.action).toBe(ACTIONS.ACKNOWLEDGE_PROGRESS);
    const directiveText = decision.directives.join(' ').toLowerCase();
    expect(directiveText).toContain('already completed');
    expect(directiveText).toMatch(/do not re-?teach/);
    expect(directiveText).toContain('never reveal the final answer');
  });

  test('PROGRESS_REPORT is not treated as a bare problem drop', () => {
    const observation = observe('I subtracted 5 from both sides', {
      recentUserMessages: [],
      recentAssistantMessages: [],
    });
    const decision = decide(observation, noAnswerDiagnosis, {});
    expect(decision.action).toBe(ACTIONS.ACKNOWLEDGE_PROGRESS);
    expect(decision.action).not.toBe(ACTIONS.ELICIT_FIRST);
  });
});
