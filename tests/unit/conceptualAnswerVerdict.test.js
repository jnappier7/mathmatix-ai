/**
 * REPRODUCTION — correct answers graded wrong in a course lesson.
 *
 * Owner QA, production course chat, 2026-07-28.
 * AP Calculus AB, "Function Behavior & Rational Functions".
 *
 *   Tutor:   "...for f(x) = (x^2-9)/(x-3), what value of x would make x-3 equal zero?"
 *   Student: "3"                                              <- correct
 *   Tutor:   "It looks like you arrived at an answer of '3,' but let's take a
 *             closer look together..."                        <- WRONG verdict
 *
 *   Tutor:   "What distinguishes a vertical asymptote from a hole?"
 *   Student: "if its zero on top too"                         <- correct
 *   Tutor:   dismissed it, then asked "what happens when you plug in x = 4?"
 *
 * Both verdicts also stamped problemResult:'incorrect', which drove the mood
 * engine down and tripped the client's practice-on-paper nudge mid-lesson.
 *
 * Four independent mechanisms produced them, one per describe block below:
 *
 *   1. diagnose's recent-message scan graded the answer against the ORIGINAL
 *      problem ("simplify (x^2-9)/(x-3)", answer x+3) even though the tutor had
 *      since asked a different sub-question. So "3" was checked against "x+3".
 *   2. pickProblemContext handed the LLM verifier that same stale problem,
 *      because it swept the whole window for stored problemInfo before it would
 *      look at anything newer.
 *   3. detectPosedArithmetic read "2 - 9" out of the exponent in "x^2 - 9" and
 *      treated it as a posed computation, so "3" was checked against -7.
 *   4. A conceptual sentence was mined for a numeral ("zero" -> 0) and graded
 *      as a number, and there was no path that could grade the IDEA at all.
 *
 * The invariant these tests protect: a verified-correct answer is affirmed, and
 * an answer we could not verify is never called wrong.
 */

const { diagnose } = require('../../utils/pipeline/diagnose');
const { observe } = require('../../utils/pipeline/observe');
const { decide } = require('../../utils/pipeline/decide');
const { buildSidecar } = require('../../utils/pipeline/sidecar');
const {
  pickProblemContext,
  pickPosedQuestion,
  isConceptualQuestion,
  isProseAnswer,
} = require('../../utils/pipeline/llmVerifier');
const { detectPosedArithmetic } = require('../../utils/pipeline/symbolicVerifier');

// The lesson as it actually ran. The first message is the one that carried
// stored problemInfo; the tutor then narrowed to a sub-question.
const POSED_THE_PROBLEM = {
  role: 'assistant',
  content: "Let's simplify \\(f(x) = \\frac{x^2 - 9}{x - 3}\\).",
  problemInfo: { type: 'simplify', correctAnswer: 'x + 3' },
};
const ASKED_THE_SUB_QUESTION = {
  role: 'assistant',
  content: "Good. Now for \\(f(x) = \\frac{x^2 - 9}{x - 3}\\), what value of x would make \\(x - 3\\) equal zero?",
};
const ASKED_THE_CONCEPT = {
  role: 'assistant',
  content: 'Nice. What distinguishes a vertical asymptote from a hole in the graph?',
};

const seeing = (assistantMessages) => ({
  recentUserMessages: [],
  recentAssistantMessages: assistantMessages,
  recentProblemResults: [],
});

describe('"3" answering the tutor\'s sub-question', () => {
  test('is not graded against the problem the tutor posed earlier', async () => {
    const observation = observe('3', seeing([POSED_THE_PROBLEM, ASKED_THE_SUB_QUESTION]));
    const d = await diagnose(observation, {
      recentAssistantMessages: [POSED_THE_PROBLEM, ASKED_THE_SUB_QUESTION],
      recentUserMessages: [],
      user: {},
    });

    // THE BUG: this used to be incorrect/false, source 'solver', graded against
    // the stale correctAnswer "x + 3".
    expect(d.isCorrect).not.toBe(false);
    expect(d.correctAnswer).not.toBe('x + 3');
  });

  test('the LLM verifier is handed the sub-question, not the stale problem', () => {
    const chosen = pickProblemContext([POSED_THE_PROBLEM, ASKED_THE_SUB_QUESTION]);
    expect(chosen).toBe(ASKED_THE_SUB_QUESTION.content);
  });

  test('an exponent is not read as posed arithmetic', () => {
    // "x^2 - 9" is algebra. Reading "2 - 9" out of it invented an expected
    // answer of -7 and rejected the student's 3.
    expect(detectPosedArithmetic(ASKED_THE_SUB_QUESTION.content)).toBeNull();
    expect(detectPosedArithmetic('Since \\(x^2 - 9\\) factors, what cancels?')).toBeNull();
    // Arithmetic the tutor genuinely poses must still be picked up.
    expect(detectPosedArithmetic('What is 50 × 3?')).toBe('50*3');
    expect(detectPosedArithmetic('So what is 15 \\div 5?')).toBe('15/5');
  });

  test('the verified-correct answer is affirmed, not re-scaffolded', () => {
    const observation = observe('3', seeing([POSED_THE_PROBLEM, ASKED_THE_SUB_QUESTION]));
    const decision = decide(observation, { type: 'correct', isCorrect: true }, {});

    expect(decision.action).toBe('confirm_correct');
    expect(decision.directives.join(' ')).toMatch(/Confirm immediately/i);
  });
});

describe('"if its zero on top too" answering the conceptual question', () => {
  test('is not mined for a numeric answer', () => {
    // normalizeSpokenNumbers turns "zero" into "0" and the answerPhrase cue
    // fires on "its 0" — minting the numeric answer 0, which then got graded
    // against whatever problem was still in scope.
    const observation = observe('if its zero on top too', seeing([POSED_THE_PROBLEM, ASKED_THE_CONCEPT]));
    expect(observation.answer).toBeNull();
    expect(observation.conceptualReply).toBe(true);
  });

  test('a spoken number that IS the whole answer still reads as one', () => {
    // The guard above must not cost the voice surface its answers.
    const spoken = observe('negative six', seeing([ASKED_THE_SUB_QUESTION]));
    expect(spoken.answer && spoken.answer.value).toBe('-6');
  });

  test('routes to conceptual verification rather than the math verifier', () => {
    const question = pickPosedQuestion([POSED_THE_PROBLEM, ASKED_THE_CONCEPT]);
    expect(question).toBe(ASKED_THE_CONCEPT.content);
    expect(isConceptualQuestion(question)).toBe(true);
    expect(isProseAnswer('if its zero on top too')).toBe(true);
    // A value answer is not prose and keeps the math path.
    expect(isProseAnswer('3')).toBe(false);
    expect(isProseAnswer('x = 3')).toBe(false);
  });

  test('a correct idea is graded correct and affirmed', async () => {
    const observation = observe('if its zero on top too', seeing([POSED_THE_PROBLEM, ASKED_THE_CONCEPT]));
    const d = await diagnose(observation, {
      recentAssistantMessages: [POSED_THE_PROBLEM, ASKED_THE_CONCEPT],
      recentUserMessages: [],
      user: {},
      conceptualVerificationPromise: Promise.resolve({
        isCorrect: true,
        partial: false,
        confidence: 0.93,
        verdict: 'correct',
        keyIdea: 'A hole occurs where the factor cancels — the numerator is zero there too.',
        conceptual: true,
      }),
    });

    expect(d.type).toBe('correct');
    expect(d.isCorrect).toBe(true);
    expect(d.verificationSource).toBe('llm:conceptual');

    const decision = decide(observation, d, {});
    expect(decision.action).toBe('confirm_correct');
    const directives = decision.directives.join(' ');
    expect(directives).toMatch(/CONCEPTUALLY CORRECT/);
    expect(directives).toMatch(/closer look/i); // explicitly forbidden phrasing
  });

  test('the correct idea is never handed back to the student as the answer', async () => {
    const observation = observe('if its zero on top too', seeing([ASKED_THE_CONCEPT]));
    const d = await diagnose(observation, {
      recentAssistantMessages: [ASKED_THE_CONCEPT],
      recentUserMessages: [],
      user: {},
      conceptualVerificationPromise: Promise.resolve({
        isCorrect: null, partial: true, confidence: 0.8, verdict: 'partially_correct',
        keyIdea: 'The factor must cancel from both numerator and denominator.',
        conceptual: true,
      }),
    });
    // keyIdea is for the tutor's reasoning, never for correctAnswer — that field
    // is what generate is allowed to state outright.
    expect(d.correctAnswer).toBeNull();
    expect(d.conceptual.keyIdea).toMatch(/cancel/);
  });

  test('a partial idea is affirmed and extended, never run through the wrong-answer ladder', async () => {
    const observation = observe('theres a hole when it cancels', seeing([ASKED_THE_CONCEPT]));
    const d = await diagnose(observation, {
      recentAssistantMessages: [ASKED_THE_CONCEPT],
      recentUserMessages: [],
      user: {},
      conceptualVerificationPromise: Promise.resolve({
        isCorrect: null, partial: true, confidence: 0.85, verdict: 'partially_correct',
        keyIdea: 'A hole needs the factor to cancel; an asymptote is a denominator zero that does not.',
        conceptual: true,
      }),
    });

    expect(d.type).toBe('correct_partial');
    expect(d.isCorrect).toBeNull();

    const decision = decide(observation, d, {});
    expect(decision.action).toBe('acknowledge_progress');
    expect(decision.directives.join(' ')).toMatch(/PARTIALLY CORRECT IDEA/);
  });

  test('an unverifiable idea is never treated as wrong', async () => {
    const observation = observe('its about the bottom part', seeing([ASKED_THE_CONCEPT]));
    const d = await diagnose(observation, {
      recentAssistantMessages: [ASKED_THE_CONCEPT],
      recentUserMessages: [],
      user: {},
      conceptualVerificationPromise: Promise.resolve({
        isCorrect: null, partial: false, confidence: 0.3, verdict: 'unclear',
        keyIdea: null, conceptual: true,
      }),
    });

    expect(d.isCorrect).toBeNull();
    expect(d.type).toBe('unverifiable');

    const decision = decide(observation, d, {});
    expect(decision.directives.join(' ')).toMatch(/Do NOT reject it/);
  });
});

describe('problemResult is only stamped from a real verdict', () => {
  const decision = { directives: [], phaseState: null };

  test('a correct verdict stamps correct', () => {
    const sidecar = buildSidecar({}, { type: 'correct', isCorrect: true }, decision, {});
    expect(sidecar.problemResult).toBe('correct');
  });

  test('an incorrect verdict stamps incorrect', () => {
    const sidecar = buildSidecar({}, { type: 'incorrect', isCorrect: false }, decision, {});
    expect(sidecar.problemResult).toBe('incorrect');
  });

  test('an unverifiable turn stamps nothing', () => {
    const sidecar = buildSidecar({}, { type: 'unverifiable', isCorrect: null }, decision, {});
    expect(sidecar.problemResult).toBeNull();
  });

  test('a correct-but-incomplete answer is NOT stamped incorrect', () => {
    // THE BUG: the old test was on diagnosis.type, so correct_partial (a RIGHT
    // answer, just not the whole set) fell to the ternary and stamped incorrect
    // — feeding the mood engine, badge counters and the practice-on-paper nudge
    // a miss the student never had.
    const sidecar = buildSidecar({}, { type: 'correct_partial', isCorrect: null }, decision, {});
    expect(sidecar.problemResult).toBeNull();
  });
});

describe('"true" answering a true-or-false question (post-#1360 confirmation run, 2026-07-28)', () => {
  // Tutor: "True or false: A function can take two different inputs and give
  //         the same output. What do you think?"
  // Student: "true"        <- correct, one word
  // Reply:  "Careful there—" + a re-ask. One-word polarity answers passed
  // neither conceptual gate (both require 2+ words), so the turn fell to the
  // value-matcher, which cannot parse "true" and can only withhold or reject.
  const { isPolarityQuestion, isPolarityAnswer } = require('../../utils/pipeline/llmVerifier');
  const TF_QUESTION = 'True or false: A function can take two different inputs and give the same output. What do you think?';

  test('the question reads as polarity', () => {
    expect(isPolarityQuestion(TF_QUESTION)).toBe(true);
    expect(isPolarityQuestion('Is 3/0 defined, yes or no?')).toBe(true);
    expect(isPolarityQuestion('What value of x makes x-3 zero?')).toBe(false);
    expect(isPolarityQuestion(null)).toBe(false);
  });

  test('bare and hedged polarity words read as polarity answers', () => {
    for (const a of ['true', 'True.', 'false', 'yes', 'no', 'nope', 'yep!', 'I think false', "it's true", 'probably true']) {
      expect(isPolarityAnswer(a)).toBe(true);
    }
  });

  test('anything beyond a polarity word does NOT route here', () => {
    for (const a of ['true story', 'no idea', 'yes and no', 'the answer is true because inputs differ', '3', 'x = 3', '']) {
      expect(isPolarityAnswer(a)).toBe(false);
    }
  });

  test('the pipeline wires the polarity gate into conceptual routing', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../../utils/pipeline/index.js'), 'utf8');
    expect(src).toContain('isPolarityQuestion(posedQuestion) && isPolarityAnswer(message)');
  });
});
