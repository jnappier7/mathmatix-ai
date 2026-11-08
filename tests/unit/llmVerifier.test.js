/**
 * LLM VERIFIER TESTS — Unit tests for the parallel LLM answer verifier
 *
 * Mocks the LLM gateway to avoid real API calls. Covers the two-step
 * verification flow, confidence thresholding, malformed responses,
 * and error paths.
 */

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
}));

jest.mock('../../utils/openaiClient', () => ({
  chat: { completions: { create: jest.fn() } },
}));

const { callLLM } = require('../../utils/llmGateway');
const {
  llmVerifyAnswer,
  pickProblemContext,
  VERIFIER_MODEL,
  CONFIDENCE_THRESHOLD,
} = require('../../utils/pipeline/llmVerifier');

/**
 * Helper to craft a fake OpenAI chat completion with the given JSON payload
 * as the assistant message.content.
 */
function fakeCompletion(payload) {
  return {
    choices: [
      { message: { content: JSON.stringify(payload) } },
    ],
  };
}

describe('LLMVerifier: llmVerifyAnswer', () => {
  beforeEach(() => {
    callLLM.mockReset();
  });

  // The CAS resolves any symbolically-checkable answer deterministically, right
  // after step 1 computes the expected answer — so the flaky LLM equivalence
  // judge (step 2) is bypassed for symbolic math.
  test('CAS confirms a symbolically-equivalent answer without the LLM judge', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ answer: '9x^2 - 5', form: 'simplified' })); // step 1 only

    const result = await llmVerifyAnswer('What is the derivative of 3x^3 - 5x + 2?', '9x^2 - 5');

    expect(result.isCorrect).toBe(true);
    expect(result.modelAnswer).toBe('9x^2 - 5');
    expect(result.rationale).toMatch(/symbolic/);
    expect(callLLM).toHaveBeenCalledTimes(1); // no equivalence judge needed
  });

  test('CAS rejects a wrong symbolic answer (no false verdict from a flaky judge)', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ answer: '9x^2 - 5' }));

    const result = await llmVerifyAnswer('Derivative of 3x^3 - 5x + 2', '6x^2 - 5');

    expect(result.isCorrect).toBe(false);
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  // The exact case the old flow gave up on: the LLM judge was unsure, but the
  // answer is genuinely correct — the CAS now confirms it.
  test('CAS confirms a correct answer the LLM judge would have marked unverifiable', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ answer: 'x^2 + 2x + 1' }));

    const result = await llmVerifyAnswer('Factor x^2+2x+1', '(x+1)^2');

    expect(result.isCorrect).toBe(true); // (x+1)^2 ≡ x^2+2x+1
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  // Non-symbolic answers (prose / conceptual) still use the two-step LLM judge.
  test('LLM judge handles a non-symbolic answer (match, high confidence)', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'continuous' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.98, rationale: 'same idea' }));

    const result = await llmVerifyAnswer('Describe the graph near x = 0', 'it is continuous there');

    expect(result.isCorrect).toBe(true);
    expect(result.confidence).toBe(0.98);
    expect(callLLM).toHaveBeenCalledTimes(2); // CAS declines prose -> judge runs
  });

  test('non-symbolic low confidence returns isCorrect=null (unverifiable)', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'converges' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.4, rationale: 'uncertain' }));

    const result = await llmVerifyAnswer('How does the series behave?', 'it converges');

    expect(result.isCorrect).toBeNull();
    expect(result.confidence).toBe(0.4);
  });

  test('missing inputs return unverifiable with error', async () => {
    const noProblem = await llmVerifyAnswer(null, '7');
    expect(noProblem.isCorrect).toBeNull();
    expect(noProblem.error).toBe('missing_input');

    const noAnswer = await llmVerifyAnswer('What is 5+5?', '');
    expect(noAnswer.isCorrect).toBeNull();
    expect(noAnswer.error).toBe('missing_input');

    expect(callLLM).not.toHaveBeenCalled();
  });

  test('step 1 parse failure returns unverifiable', async () => {
    callLLM.mockResolvedValueOnce({
      choices: [{ message: { content: 'not valid json at all' } }],
    });

    const result = await llmVerifyAnswer('Describe the behavior', 'it is continuous');

    expect(result.isCorrect).toBeNull();
    expect(result.error).toBe('step1_parse_failed');
    expect(callLLM).toHaveBeenCalledTimes(1); // step 2 skipped
  });

  test('step 1 returns no answer field → unverifiable', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ form: 'simplified' /* no answer */ }));

    const result = await llmVerifyAnswer('Describe the behavior', 'it is continuous');

    expect(result.isCorrect).toBeNull();
    expect(result.error).toBe('step1_parse_failed');
  });

  test('step 2 parse failure returns unverifiable but preserves modelAnswer', async () => {
    // prose answer -> CAS declines -> the LLM judge (step 2) runs and parse-fails
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'continuous' }))
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'garbage' } }],
      });

    const result = await llmVerifyAnswer('Describe the behavior', 'it is continuous');

    expect(result.isCorrect).toBeNull();
    expect(result.error).toBe('step2_parse_failed');
    expect(result.modelAnswer).toBe('continuous');
  });

  test('thrown error from LLM returns unverifiable with error message', async () => {
    callLLM.mockRejectedValueOnce(new Error('rate limited'));

    const result = await llmVerifyAnswer('Describe the behavior', 'it is continuous');

    expect(result.isCorrect).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.error).toBe('rate limited');
  });

  test('confidence above 1 clamps to 1', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'continuous' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 1.5 }));

    const result = await llmVerifyAnswer('Describe the behavior', 'it is continuous');

    expect(result.confidence).toBe(1);
    expect(result.isCorrect).toBe(true);
  });

  test('negative confidence clamps to 0 and becomes unverifiable', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'continuous' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: -0.3 }));

    const result = await llmVerifyAnswer('Describe the behavior', 'it is continuous');

    expect(result.confidence).toBe(0);
    expect(result.isCorrect).toBeNull();
  });

  test('respects confidenceThreshold override', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'continuous' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.55 }));

    // Default threshold is 0.6, so confidence 0.55 → unverifiable
    const defaultRun = await llmVerifyAnswer('Describe the behavior', 'it is continuous');
    expect(defaultRun.isCorrect).toBeNull();

    callLLM.mockReset();
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'continuous' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.55 }));

    // Lower the threshold → trust the verdict
    const lowThresh = await llmVerifyAnswer('Describe the behavior', 'it is continuous', { confidenceThreshold: 0.5 });
    expect(lowThresh.isCorrect).toBe(true);
  });

  test('passes the configured model to callLLM', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'continuous' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.9 }));

    await llmVerifyAnswer('Describe the behavior', 'it is continuous', { model: 'custom-model' });

    expect(callLLM).toHaveBeenNthCalledWith(
      1,
      'custom-model',
      expect.any(Array),
      expect.objectContaining({
        temperature: 0,
        response_format: { type: 'json_object' },
      })
    );
    expect(callLLM).toHaveBeenNthCalledWith(
      2,
      'custom-model',
      expect.any(Array),
      expect.objectContaining({
        temperature: 0,
        response_format: { type: 'json_object' },
      })
    );
  });

  test('defaults to VERIFIER_MODEL when no model is supplied', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'continuous' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.9 }));

    await llmVerifyAnswer('Describe the behavior', 'it is continuous');

    expect(callLLM).toHaveBeenCalledWith(
      VERIFIER_MODEL,
      expect.any(Array),
      expect.any(Object)
    );
  });

  test('step 2 prompt includes both expected and student answers', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'increasing' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.9 }));

    await llmVerifyAnswer('Describe the trend', 'it is increasing');

    const step2Call = callLLM.mock.calls[1];
    const step2UserMsg = step2Call[1].find(m => m.role === 'user');
    expect(step2UserMsg.content).toContain('increasing');        // expected
    expect(step2UserMsg.content).toContain('it is increasing');  // student
  });

  test('truncates very long problem text and answer', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'x' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.9 }));

    const longProblem = 'x'.repeat(10000);
    const longAnswer = 'y'.repeat(10000);

    await llmVerifyAnswer(longProblem, longAnswer);

    const step1Call = callLLM.mock.calls[0];
    const step1UserMsg = step1Call[1].find(m => m.role === 'user');
    // Sent text should be shorter than the original 10000 chars
    expect(step1UserMsg.content.length).toBeLessThan(longProblem.length);
  });

  test('CONFIDENCE_THRESHOLD constant is exported', () => {
    expect(typeof CONFIDENCE_THRESHOLD).toBe('number');
    expect(CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
    expect(CONFIDENCE_THRESHOLD).toBeLessThanOrEqual(1);
  });
});

describe('LLMVerifier: pickProblemContext', () => {
  test('returns null for empty or missing input', () => {
    expect(pickProblemContext(null)).toBeNull();
    expect(pickProblemContext(undefined)).toBeNull();
    expect(pickProblemContext([])).toBeNull();
  });

  test('returns the content of the most recent non-empty message', () => {
    const messages = [
      { content: 'earlier message' },
      { content: 'What is the derivative of 3x^3?' },
    ];
    expect(pickProblemContext(messages)).toBe('What is the derivative of 3x^3?');
  });

  test('skips empty messages and returns the next non-empty one', () => {
    const messages = [
      { content: 'real question here' },
      { content: '' },
      { content: '   ' },
    ];
    expect(pickProblemContext(messages)).toBe('real question here');
  });

  test('handles missing content field gracefully', () => {
    const messages = [
      { content: 'fallback question' },
      {},
      { content: null },
    ];
    expect(pickProblemContext(messages)).toBe('fallback question');
  });
});

// ── The AP Calculus AB verdict failures (owner QA, 2026-07-28) ──
// A conceptual question has no computable answer, so the two-step math verifier
// compares the student's words against whatever step 1 improvised and reports
// NO MATCH. "if its zero on top too" — a correct description of when a rational
// function has a hole — came back rejected. These cover the conceptual judge
// that grades the idea instead, and the higher bar a rejection now has to clear.
describe('LLMVerifier: llmVerifyConceptual', () => {
  const { llmVerifyConceptual, isConceptualQuestion, isProseAnswer } =
    require('../../utils/pipeline/llmVerifier');

  const QUESTION = 'What distinguishes a vertical asymptote from a hole in the graph?';

  beforeEach(() => {
    callLLM.mockReset();
  });

  test('grades a correct idea stated informally as CORRECT', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({
      verdict: 'correct',
      confidence: 0.93,
      keyIdea: 'A hole occurs when the factor cancels — the numerator is zero there too.',
      rationale: 'names the cancelling-factor condition',
    }));

    const result = await llmVerifyConceptual(QUESTION, 'if its zero on top too');

    expect(result.isCorrect).toBe(true);
    expect(result.conceptual).toBe(true);
    expect(result.keyIdea).toMatch(/hole/i);
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  test('partially correct carries no boolean — it is not a wrong answer', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({
      verdict: 'partially_correct', confidence: 0.9, keyIdea: 'the factor must cancel',
    }));

    const result = await llmVerifyConceptual(QUESTION, 'it cancels');

    expect(result.isCorrect).toBeNull();
    expect(result.partial).toBe(true);
  });

  test('rejects only at the higher negative bar', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ verdict: 'incorrect', confidence: 0.95 }));
    const confident = await llmVerifyConceptual(QUESTION, 'they are the same thing');
    expect(confident.isCorrect).toBe(false);

    callLLM.mockReset();
    callLLM.mockResolvedValueOnce(fakeCompletion({ verdict: 'incorrect', confidence: 0.7 }));
    const unsure = await llmVerifyConceptual(QUESTION, 'they are the same thing');
    expect(unsure.isCorrect).toBeNull();  // unsure is not wrong
  });

  test('an unclear verdict, a parse failure, or a thrown error all stay unverifiable', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ verdict: 'unclear', confidence: 0.9 }));
    expect((await llmVerifyConceptual(QUESTION, 'the bottom part')).isCorrect).toBeNull();

    callLLM.mockReset();
    callLLM.mockResolvedValueOnce({ choices: [{ message: { content: 'not json' } }] });
    const parseFail = await llmVerifyConceptual(QUESTION, 'the bottom part');
    expect(parseFail.isCorrect).toBeNull();
    expect(parseFail.error).toBe('conceptual_parse_failed');

    callLLM.mockReset();
    callLLM.mockRejectedValueOnce(new Error('rate limited'));
    const thrown = await llmVerifyConceptual(QUESTION, 'the bottom part');
    expect(thrown.isCorrect).toBeNull();
    expect(thrown.error).toBe('rate limited');
  });

  test('missing input never burns a call', async () => {
    expect((await llmVerifyConceptual(null, 'answer')).error).toBe('missing_input');
    expect((await llmVerifyConceptual(QUESTION, '')).error).toBe('missing_input');
    expect(callLLM).not.toHaveBeenCalled();
  });

  test('routing helpers separate ideas from values', () => {
    expect(isConceptualQuestion(QUESTION)).toBe(true);
    // Thick with LaTeX and still not computable.
    expect(isConceptualQuestion('Why does \\(\\frac{x^2-9}{x-3}\\) have a hole at \\(x = 3\\)?')).toBe(true);
    expect(isConceptualQuestion('What is \\(50 \\times 3\\)?')).toBe(false);
    expect(isConceptualQuestion('Solve for x.')).toBe(false);  // not a question

    expect(isProseAnswer('if its zero on top too')).toBe(true);
    expect(isProseAnswer('3')).toBe(false);
    expect(isProseAnswer('x = 3')).toBe(false);
    expect(isProseAnswer('9x^2 - 5')).toBe(false);
  });
});

describe('LLMVerifier: a rejection must clear a higher bar than an affirmation', () => {
  beforeEach(() => {
    callLLM.mockReset();
  });

  test('a mid-confidence NO MATCH is discarded, a mid-confidence match is kept', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'continuous' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: false, confidence: 0.7 }));
    const rejected = await llmVerifyAnswer('Describe the behavior', 'it is smooth there');
    expect(rejected.isCorrect).toBeNull();   // was false — a rejection on a coin-flip

    callLLM.mockReset();
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'continuous' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.7 }));
    const affirmed = await llmVerifyAnswer('Describe the behavior', 'it is continuous');
    expect(affirmed.isCorrect).toBe(true);
  });

  test('a confident NO MATCH still rejects', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'continuous' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: false, confidence: 0.95 }));
    const result = await llmVerifyAnswer('Describe the behavior', 'it jumps');
    expect(result.isCorrect).toBe(false);
  });
});

// pickProblemContext must follow the tutor into a sub-question. Sweeping the
// window for stored problemInfo first is what kept the verifier grading against
// "simplify (x^2-9)/(x-3)" after the tutor had moved on to "what makes x-3 zero?".
describe('LLMVerifier: pickProblemContext recency', () => {
  const { pickPosedQuestion } = require('../../utils/pipeline/llmVerifier');

  const OLD_PROBLEM = {
    content: 'Simplify \\(\\frac{x^2-9}{x-3}\\).',
    problemInfo: { correctAnswer: 'x + 3' },
  };
  const SUB_QUESTION = { content: 'What value of x would make \\(x - 3\\) equal zero?' };
  const PLEASANTRY = { content: 'Nice work — take your time.' };

  test('a newer sub-question outranks older stored problemInfo', () => {
    expect(pickProblemContext([OLD_PROBLEM, SUB_QUESTION])).toBe(SUB_QUESTION.content);
  });

  test('a pleasantry does not displace the problem behind it', () => {
    expect(pickProblemContext([OLD_PROBLEM, PLEASANTRY])).toBe(OLD_PROBLEM.content);
  });

  test('pickPosedQuestion takes the newest question, never an older problem', () => {
    const CONCEPT = { content: 'What distinguishes an asymptote from a hole?' };
    expect(pickPosedQuestion([OLD_PROBLEM, CONCEPT])).toBe(CONCEPT.content);
    expect(pickPosedQuestion([])).toBeNull();
  });
});

// ── Method audit: right answer, suspect rule ─────────────────────────────────
// The answer is a settled CORRECT input; the audit judges only the articulated
// rule. Asymmetric like every verdict here: "invalid" needs high confidence,
// everything else returns suspect=false and the pipeline confirms as usual.
describe('LLMVerifier: llmVerifyMethod', () => {
  const { llmVerifyMethod } = require('../../utils/pipeline/llmVerifier');

  beforeEach(() => {
    callLLM.mockReset();
  });

  test('missing input never calls the LLM', async () => {
    expect((await llmVerifyMethod('', 'i added the tops')).error).toBe('missing_input');
    expect((await llmVerifyMethod('1/4 + 1/6', '')).error).toBe('missing_input');
    expect(callLLM).not.toHaveBeenCalled();
  });

  test('a high-confidence invalid rule is suspect, with flaw and counterexample', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({
      verdict: 'invalid',
      confidence: 0.95,
      flaw: 'adding denominators for the numerator is not fraction addition',
      counterexample: '1/2 + 1/2',
    }));
    const audit = await llmVerifyMethod('1/4 + 1/6', 'I got 10/24. You add the denominators for the numerator and multiply them for the denominator.');
    expect(audit.suspect).toBe(true);
    expect(audit.flaw).toMatch(/denominators/);
    expect(audit.counterexample).toBe('1/2 + 1/2');
    expect(audit.error).toBeNull();
    // The audit runs on the STRONGER judge by default — gpt-4o-mini's
    // counterexamples satisfied the bad rule they were meant to break.
    expect(callLLM.mock.calls[0][0]).toBe('gpt-4o');
  });

  test('an invalid verdict below the negative bar is NOT suspect', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ verdict: 'invalid', confidence: 0.6, flaw: 'maybe', counterexample: '' }));
    const audit = await llmVerifyMethod('1/4 + 1/6', 'I crossed things and got 10/24');
    expect(audit.suspect).toBe(false);
    expect(audit.confidence).toBe(0.6);
  });

  test('valid and unclear verdicts are never suspect', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ verdict: 'valid', confidence: 0.99 }));
    expect((await llmVerifyMethod('1/4 + 1/6', 'i found a common denominator of 12')).suspect).toBe(false);
    callLLM.mockResolvedValueOnce(fakeCompletion({ verdict: 'unclear', confidence: 0.9 }));
    expect((await llmVerifyMethod('1/4 + 1/6', 'i just did it in my head')).suspect).toBe(false);
  });

  test('malformed JSON and thrown errors fail closed (not suspect)', async () => {
    callLLM.mockResolvedValueOnce({ choices: [{ message: { content: 'not json' } }] });
    const parseFail = await llmVerifyMethod('1/4 + 1/6', 'i added the bottoms');
    expect(parseFail.suspect).toBe(false);
    expect(parseFail.error).toBe('method_parse_failed');

    callLLM.mockRejectedValueOnce(new Error('boom'));
    const errFail = await llmVerifyMethod('1/4 + 1/6', 'i added the bottoms');
    expect(errFail.suspect).toBe(false);
    expect(errFail.error).toBe('boom');
  });

  test('empty flaw/counterexample strings and a non-string verdict normalize to null/false', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ verdict: 'invalid', confidence: 0.9, flaw: '  ', counterexample: '' }));
    const audit = await llmVerifyMethod('1/4 + 1/6', 'i added the bottoms and tops');
    expect(audit.suspect).toBe(true);
    expect(audit.flaw).toBeNull();
    expect(audit.counterexample).toBeNull();

    callLLM.mockResolvedValueOnce(fakeCompletion({ verdict: 42, confidence: 'high' }));
    expect((await llmVerifyMethod('1/4 + 1/6', 'i multiplied across')).suspect).toBe(false);
  });
});

describe('LLMVerifier: articulatesMethod gate', () => {
  const { articulatesMethod } = require('../../utils/pipeline/llmVerifier');

  test('fires on articulated procedures', () => {
    expect(articulatesMethod('I added the denominators for the numerator and multiplied them for the denominator')).toBe(true);
    expect(articulatesMethod('my trick is you flip the second one and multiply')).toBe(true);
    expect(articulatesMethod('all you have to do is cross out the sevens')).toBe(true);
  });

  test('stays quiet on bare answers, short prose, and non-method chatter', () => {
    expect(articulatesMethod('10/24')).toBe(false);
    expect(articulatesMethod('i added them')).toBe(false); // < 4 prose words
    expect(articulatesMethod('this one was pretty easy for me honestly')).toBe(false); // prose, no method
    expect(articulatesMethod('')).toBe(false);
    expect(articulatesMethod(null)).toBe(false);
    expect(articulatesMethod('x'.repeat(1600))).toBe(false); // over length cap
  });
});

// ── The rate/ratio transcript (owner session, 2026-11-08) ──
// A word problem states its givens as plain numbers with no operator between
// them, so the problem-like tier never saw it and the verifier graded "300 miles"
// (right) against the greeting's warm-up three turns back — a confident wrong
// verdict, stamped problemResult:incorrect in prod, then "60 mph" the same way.
describe('LLMVerifier: pickProblemContext — a word problem is the problem', () => {
  const GREETING = { content: "Hey! Quick warm-up to get going: What's \\( \\frac{-6}{2} + 3 \\)?" };
  const PRAISE = { content: "That's right, you nailed it! The answer is indeed \\( 0 \\). Want a harder one?" };
  const WORD_PROBLEM = { content: "Problem: A car travels 120 miles in 2 hours. At this rate, how far will it travel in 5 hours?\n\n1. First, what's the rate of the car in miles per hour?\n2. Then, use that rate to find how far it goes in 5 hours." };
  const SUB_QUESTION = { content: 'You got the distance of 120 miles in 2 hours. What do you think the first step is to find the rate in miles per hour? How would you calculate that?' };

  test('"300 miles" is graded against the word problem, not the warm-up before it', () => {
    expect(pickProblemContext([GREETING, PRAISE, WORD_PROBLEM])).toBe(WORD_PROBLEM.content);
  });

  test('a sub-question that restates its givens is the question being answered', () => {
    expect(pickProblemContext([GREETING, PRAISE, WORD_PROBLEM, SUB_QUESTION])).toBe(SUB_QUESTION.content);
  });

  test('a pleasantry after the problem is skipped, and so is a hint that quotes one number', () => {
    const READY = { content: 'Nice work so far! Ready for the next one?' };
    expect(pickProblemContext([WORD_PROBLEM, READY])).toBe(WORD_PROBLEM.content);
    const LINEAR = { content: 'Try this one: Solve \\(3x - 7 = 11\\).' };
    const HINT = { content: 'Remember the 7 on the left. What could you do first?' };
    expect(pickProblemContext([LINEAR, HINT])).toBe(LINEAR.content);
  });

  test('two numbers without a question mark are not a posed problem', () => {
    const LINEAR = { content: 'Try this one: Solve \\(3x - 7 = 11\\).' };
    const RECAP = { content: 'So far you have 120 miles and 2 hours written down. Keep going.' };
    expect(pickProblemContext([LINEAR, RECAP])).toBe(LINEAR.content);
  });
});

describe('LLMVerifier: a unit the problem never mentions cannot ground a rejection', () => {
  const { unitAbsentFromProblem, verifyWithEscalation } = require('../../utils/pipeline/llmVerifier');
  const WARM_UP = "Quick warm-up: What's \\( \\frac{-6}{2} + 3 \\)?";
  const RATE = 'A car travels 120 miles in 2 hours. At this rate, how far will it travel in 5 hours?';

  beforeEach(() => {
    callLLM.mockReset();
  });

  test.each([
    ['300 miles', WARM_UP, true],
    ['60 mph', WARM_UP, true],
    ['60 mph', 'You got 120 miles in 2 hours. How would you find the rate in miles per hour?', false],
    ['300 miles', RATE, false],
    ['240 miles', RATE, false],              // wrong, but the unit fits — a rejection may stand
    ['x = 6', 'Solve 3x - 7 = 11', false],   // no unit at all
    ['3x', 'Simplify 2x + x', false],        // a variable is not a unit
    ['2pi', 'circumference of a circle with radius 1', false],
    ['28 units squared', 'area of a 7 by 4 rectangle', false], // generic label
    ['52 degrees', 'The angle measures 52°. What is its supplement?', false],
    ['30 dollars', 'A shirt costs $40 and is 25% off', false],
    ['15 days', 'How many days to read a 180-page book at 12 pages a day?', false],
    ['1200 cm2', 'a 30 cm by 40 cm rectangle', false],
    ['9 inches', 'a 3 cm by 3 cm square', true],
  ])('%s vs "%s" → absent: %s', (answer, problem, absent) => {
    expect(unitAbsentFromProblem(answer, problem)).toBe(absent);
  });

  test('a symbolic mismatch on an answer with a foreign unit is unverifiable, not incorrect', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ answer: '0' })); // step 1: the warm-up's answer
    const r = await llmVerifyAnswer(WARM_UP, '300', { fullStudentMessage: '300 miles' });
    expect(r.isCorrect).toBeNull();
    expect(r.error).toBe('unit_not_in_problem');
    expect(callLLM).toHaveBeenCalledTimes(1); // no equivalence judge spent on it
  });

  test('a judge NO MATCH on an answer with a foreign unit is unverifiable too', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'x + 3' }))                       // step 1
      .mockResolvedValueOnce(fakeCompletion({ matches: false, confidence: 0.95 }));     // step 2
    const r = await llmVerifyAnswer('Simplify (x^2 - 9)/(x - 3)', '60', { fullStudentMessage: '60 mph' });
    expect(r.isCorrect).toBeNull();
    expect(r.error).toBe('unit_not_in_problem');
  });

  test('the right value with its unit is still CORRECT (the guard only blocks rejections)', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ answer: '300 miles' }));
    const r = await llmVerifyAnswer(RATE, '300', { fullStudentMessage: '300 miles' });
    expect(r.isCorrect).toBe(true);
  });

  test('a wrong value whose unit the problem does mention is still INCORRECT', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: '300 miles' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: false, confidence: 0.95 }));
    const r = await llmVerifyAnswer(RATE, '240', { fullStudentMessage: '240 miles' });
    expect(r.isCorrect).toBe(false);
  });

  test('the escalation tier is not spent on a unit the problem never mentions', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ answer: '0' }));
    const r = await verifyWithEscalation(WARM_UP, '300', { fullStudentMessage: '300 miles' });
    expect(r.isCorrect).toBeNull();
    expect(r.escalated).toBe(false);
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  test('the newest tutor question rides along for the answer engine when it is not the chosen problem', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ answer: '60' }));
    await llmVerifyAnswer(RATE, '60', { latestQuestion: "So what's the rate, in miles per hour?" });
    const step1User = callLLM.mock.calls[0][1].find(m => m.role === 'user').content;
    expect(step1User).toContain('Problem:\n' + RATE);
    expect(step1User).toContain("The tutor's latest question to the student:\nSo what's the rate, in miles per hour?");
  });

  test('…and is omitted when it IS the chosen problem', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ answer: '300' }));
    await llmVerifyAnswer(RATE, '300', { latestQuestion: RATE });
    const step1User = callLLM.mock.calls[0][1].find(m => m.role === 'user').content;
    expect(step1User).not.toContain("latest question");
  });
});
