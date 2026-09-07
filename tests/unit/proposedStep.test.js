/**
 * Regression tests for the "proposed step" classification.
 *
 * ORIGIN — observed live on the landing page, which is the tutor every visitor
 * now meets before signing up:
 *
 *   Tutor:   "...what would you do next to get x by itself?"
 *   Student: "add 3"
 *   Tutor:   "Exactly! Adding 3 gives you x = 8. Nice work! So, the solution
 *             to 2(x - 3) = 10 is x = 8."
 *
 * The student named the move. The arithmetic — the part that was actually
 * theirs to do — got done for them, and the problem ended. Three inches above
 * that exchange the page claims the tutor "teaches thinking, not answers".
 *
 * WHY IT HAPPENED: "add 3" carries no extractable answer (so it is not an
 * ANSWER_ATTEMPT) and no first-person past tense (so detectProgressReport,
 * which owns "I added 3", declines it). It fell through to GENERAL_MATH — the
 * 0.5-confidence catch-all — whose directives asserted "The student stated a
 * math problem" and ordered the tutor to "break the problem into its first
 * step". Mid-problem, the only way to obey that is to perform the student's
 * step and announce the result.
 *
 * THE FIX, in two layers:
 *   1. observe.detectProposedStep flags a named-but-unexecuted operation, and
 *      observe classifies it MESSAGE_TYPES.PROPOSED_STEP. decide routes it to
 *      ACKNOWLEDGE_PROGRESS with directives that hand the step back.
 *   2. The GENERAL_MATH catch-all no longer asserts what the message was, and
 *      carries the same never-execute-their-step rule — so a proposal the
 *      classifier misses is still not performed for the student.
 *
 * Layer 2 is why this file tests GENERAL_MATH too: the classifier is
 * deliberately narrow, so the catch-all is the actual safety net.
 */

const {
  observe,
  detectProposedStep,
  MESSAGE_TYPES,
} = require('../../utils/pipeline/observe');
const { decide, ACTIONS } = require('../../utils/pipeline/decide');

// The tutor's last turn has to be a request for the next step, or the same
// words mean something else entirely (see "context gating" below).
const ASKED = [{ content: 'Nice — you divided both sides by 2 and got x - 3 = 5. What would you do next to get x by itself?' }];
const DID_NOT_ASK = [{ content: 'Here is one to try: solve 2(x - 3) = 10.' }];

const ctx = (recentAssistantMessages) => ({
  recentUserMessages: [],
  recentAssistantMessages,
  hasRecentUpload: false,
});

// ============================================================================
// detectProposedStep — the structural flag
// ============================================================================

describe('detectProposedStep', () => {
  test.each([
    'add 3',
    'add 3 to both sides',
    'divide by 2',
    'subtract 5 from both sides',
    'multiply by 4',
    'then subtract 5',
    'now divide by 2',
    'distribute the 4',
    'maybe factor it',
    "i'd add 3",
    'I would divide by 2',
    'we should combine like terms',
    "let's simplify",
    'adding 3',
  ])('flags a named-but-unexecuted operation: %j', (msg) => {
    expect(detectProposedStep(msg, ASKED)).toBe(true);
  });

  // ── Context gating ──
  // The same words are a question about METHOD when the tutor did not just ask
  // for a next step. Firing there would hand "divide by 2" back to a student
  // who was asking how to divide.
  test.each([
    'add 3',
    'divide by 2',
    'distribute the 4',
  ])('does not fire when the tutor did not ask for a next step: %j', (msg) => {
    expect(detectProposedStep(msg, DID_NOT_ASK)).toBe(false);
  });

  test('does not fire with no conversation history at all', () => {
    expect(detectProposedStep('add 3', [])).toBe(false);
    expect(detectProposedStep('add 3', undefined)).toBe(false);
  });

  // ── A written result means they EXECUTED it ──
  // That is an attempt to be graded, not a proposal to hand back. Getting this
  // backwards would refuse to grade a correct answer.
  test.each([
    'add 3 so x = 8',
    'divide by 2 and I get x - 3 = 5',
  ])('declines a message that carries a result: %j', (msg) => {
    expect(detectProposedStep(msg, ASKED)).toBe(false);
  });

  test('declines a long explanation', () => {
    const long = 'add 3 to both sides because that undoes the subtraction, and '
      + 'the reason that works is that whatever you do to one side you have to '
      + 'do to the other side to keep the equation balanced';
    expect(detectProposedStep(long, ASKED)).toBe(false);
  });

  test('declines empty and non-string input', () => {
    expect(detectProposedStep('', ASKED)).toBe(false);
    expect(detectProposedStep(null, ASKED)).toBe(false);
    expect(detectProposedStep(undefined, ASKED)).toBe(false);
  });
});

// ============================================================================
// observe — the classify chain, and what must still win ahead of it
// ============================================================================

describe('observe — PROPOSED_STEP classification', () => {
  test('the reported failure classifies as PROPOSED_STEP, not GENERAL_MATH', () => {
    const result = observe('add 3', ctx(ASKED));
    expect(result.messageType).toBe(MESSAGE_TYPES.PROPOSED_STEP);
    expect(result.answer).toBeNull();
  });

  // Ordering in the fallback chain is load-bearing. Each of these would be
  // mishandled if PROPOSED_STEP were checked earlier.
  test('an executed answer still wins — grade it, do not hand it back', () => {
    expect(observe('x = 8', ctx(ASKED)).messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
    expect(observe('8', ctx(ASKED)).messageType).toBe(MESSAGE_TYPES.ANSWER_ATTEMPT);
  });

  test('first-person past tense stays a PROGRESS_REPORT', () => {
    // "I added 3" is a step already DONE and gets a different correct response
    // (confirm as done, ask for the NEXT one) than a step still to be executed.
    expect(observe('I added 3', ctx(ASKED)).messageType).toBe(MESSAGE_TYPES.PROGRESS_REPORT);
  });

  test('intent keywords still win', () => {
    expect(observe("I don't know", ctx(ASKED)).messageType).toBe(MESSAGE_TYPES.IDK);
    expect(observe('how do I add 3?', ctx(ASKED)).messageType).toBe(MESSAGE_TYPES.HELP_REQUEST);
  });

  test('without a next-step ask it stays GENERAL_MATH', () => {
    expect(observe('divide by 2', ctx(DID_NOT_ASK)).messageType).toBe(MESSAGE_TYPES.GENERAL_MATH);
  });
});

// ============================================================================
// decide — routing and the directives that actually steer the model
// ============================================================================

describe('decide — PROPOSED_STEP routing', () => {
  const noAnswerDiagnosis = { type: 'no_answer', isCorrect: null };

  test('routes to ACKNOWLEDGE_PROGRESS and forbids executing the step', () => {
    const observation = observe('add 3', ctx(ASKED));
    const decision = decide(observation, noAnswerDiagnosis, {});

    expect(decision.action).toBe(ACTIONS.ACKNOWLEDGE_PROGRESS);

    const text = decision.directives.join(' ').toLowerCase();
    expect(text).toContain('proposed step');
    expect(text).toMatch(/do not carry out the operation/);
    expect(text).toMatch(/do not state the resulting equation/);
    expect(text).toMatch(/final answer/);
    // The directive names the exact live failure, so a future edit that drops
    // the rule also drops the evidence for why it existed.
    expect(text).toContain('adding 3 gives you x = 8');
  });

  test('stays on the independent side of the assistance ladder', () => {
    // Confirming a choice and handing it back is affirmation, not help. If this
    // ever routed to an action above level 4 it would count against the
    // student's independence pillar for doing the right thing.
    const { assistanceLevelForTurn, isIndependent } = require('../../utils/pipeline/assistanceLadder');
    const observation = observe('add 3', ctx(ASKED));
    const decision = decide(observation, noAnswerDiagnosis, {});
    const level = assistanceLevelForTurn({ decisionAction: decision.action });
    expect(isIndependent(level)).toBe(true);
    // Level 1 is what an UNMAPPED action silently scores, so a bare
    // isIndependent() check would also pass for an action nobody mapped.
    // Affirmation is level 2 — assert the action is actually on the ladder.
    expect(level).toBe(2);
  });
});

// ============================================================================
// decide — the GENERAL_MATH catch-all is the safety net
// ============================================================================

describe('decide — GENERAL_MATH no longer licenses doing the step', () => {
  const noAnswerDiagnosis = { type: 'no_answer', isCorrect: null };

  const generalMathDecision = () => {
    const observation = observe('divide by 2', ctx(DID_NOT_ASK));
    expect(observation.messageType).toBe(MESSAGE_TYPES.GENERAL_MATH);
    return decide(observation, noAnswerDiagnosis, {});
  };

  test('does not assert that the student stated a problem', () => {
    // GENERAL_MATH is the 0.5-confidence catch-all. Asserting the message was a
    // problem statement is what told the tutor to "break the problem into its
    // first step" while it was already mid-problem with the student.
    const text = generalMathDecision().directives.join(' ');
    expect(text).not.toMatch(/^The student stated a math problem\./);
    expect(text).toMatch(/if the student has just stated a math problem/i);
  });

  test('still forbids performing a step the student only named', () => {
    const text = generalMathDecision().directives.join(' ').toLowerCase();
    expect(text).toMatch(/never perform it/);
    expect(text).toMatch(/theirs to execute/);
    expect(text).toContain('never show the full solution or final answer');
  });
});

// ============================================================================
// verify — the last line of defence, and the one this change nearly removed
// ============================================================================

describe('verify — the answer-giveaway guard still covers a proposed step', () => {
  const { verify } = require('../../utils/pipeline/verify');

  // Verbatim from the landing page.
  const LEAK = 'Exactly! Adding 3 gives you x = 8. Nice work! So, the solution to 2(x - 3) = 10 is x = 8.';
  const CLEAN = "Good call — that's the right move. Go ahead and do it, then tell me what you get.";

  const run = (text, messageType, diagnosisType) => verify(text, {
    messageType,
    action: 'acknowledge_progress',
    diagnosisType,
    isBareProblemDrop: false,
    userMessage: 'add 3',
  });

  test('catches the leak — the guard covered this message before it had its own type', async () => {
    // REGRESSION THIS PINS: verify.js gates the answer-giveaway guard on a set
    // of "student posed the problem" types that includes GENERAL_MATH. "add 3"
    // used to land there, so it was covered. Classifying it PROPOSED_STEP
    // without adding it to that gate would have silently narrowed a working
    // guard away from the exact case it was catching.
    const r = await run(LEAK, MESSAGE_TYPES.PROPOSED_STEP, 'no_answer');
    expect(r.flags).toEqual(expect.arrayContaining([expect.stringContaining('answer_giveaway')]));
  });

  test('catches it even when the proposed step is judged correct', async () => {
    // For every other type in that gate, diagnosisType 'student_correct' exempts
    // the reply — the student produced the answer, so restating it is
    // confirmation, not a leak. Here the exemption is inverted: the student
    // produced no answer, and 'student_correct' only means the OPERATION they
    // named was right. "That's right, and it gives you x = 8" is the leak.
    const r = await run(LEAK, MESSAGE_TYPES.PROPOSED_STEP, 'student_correct');
    expect(r.flags).toEqual(expect.arrayContaining([expect.stringContaining('answer_giveaway')]));
  });

  test('leaves a clean hand-back alone', async () => {
    const r = await run(CLEAN, MESSAGE_TYPES.PROPOSED_STEP, 'no_answer');
    expect(r.flags || []).not.toEqual(expect.arrayContaining([expect.stringContaining('answer_giveaway')]));
  });
});
