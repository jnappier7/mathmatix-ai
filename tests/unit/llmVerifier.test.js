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

  test('returns isCorrect=true when verdict matches with high confidence', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: '9x^2 - 5', form: 'simplified' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.98, rationale: 'algebraic equivalence' }));

    const result = await llmVerifyAnswer(
      'What is the derivative of 3x^3 - 5x + 2?',
      '9x^2 - 5'
    );

    expect(result.isCorrect).toBe(true);
    expect(result.confidence).toBe(0.98);
    expect(result.modelAnswer).toBe('9x^2 - 5');
    expect(result.error).toBeNull();
    expect(callLLM).toHaveBeenCalledTimes(2);
  });

  test('returns isCorrect=false when verdict says no match with high confidence', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: '9x^2 - 5' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: false, confidence: 0.95, rationale: 'wrong coefficient' }));

    const result = await llmVerifyAnswer(
      'Derivative of 3x^3 - 5x + 2',
      '6x^2 - 5'
    );

    expect(result.isCorrect).toBe(false);
    expect(result.confidence).toBe(0.95);
    expect(result.modelAnswer).toBe('9x^2 - 5');
  });

  test('low confidence returns isCorrect=null (treated as unverifiable)', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: 'x^2 + 2x + 1' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.4, rationale: 'uncertain' }));

    const result = await llmVerifyAnswer('Factor x^2+2x+1', '(x+1)^2');

    expect(result.isCorrect).toBeNull();
    expect(result.confidence).toBe(0.4);
    expect(result.modelAnswer).toBe('x^2 + 2x + 1');
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

    const result = await llmVerifyAnswer('What is 2+2?', '4');

    expect(result.isCorrect).toBeNull();
    expect(result.error).toBe('step1_parse_failed');
    expect(callLLM).toHaveBeenCalledTimes(1); // step 2 skipped
  });

  test('step 1 returns no answer field → unverifiable', async () => {
    callLLM.mockResolvedValueOnce(fakeCompletion({ form: 'simplified' /* no answer */ }));

    const result = await llmVerifyAnswer('What is 2+2?', '4');

    expect(result.isCorrect).toBeNull();
    expect(result.error).toBe('step1_parse_failed');
  });

  test('step 2 parse failure returns unverifiable but preserves modelAnswer', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: '4' }))
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'garbage' } }],
      });

    const result = await llmVerifyAnswer('What is 2+2?', '4');

    expect(result.isCorrect).toBeNull();
    expect(result.error).toBe('step2_parse_failed');
    expect(result.modelAnswer).toBe('4');
  });

  test('thrown error from LLM returns unverifiable with error message', async () => {
    callLLM.mockRejectedValueOnce(new Error('rate limited'));

    const result = await llmVerifyAnswer('What is 2+2?', '4');

    expect(result.isCorrect).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.error).toBe('rate limited');
  });

  test('confidence above 1 clamps to 1', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: '4' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 1.5 }));

    const result = await llmVerifyAnswer('What is 2+2?', '4');

    expect(result.confidence).toBe(1);
    expect(result.isCorrect).toBe(true);
  });

  test('negative confidence clamps to 0 and becomes unverifiable', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: '4' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: -0.3 }));

    const result = await llmVerifyAnswer('What is 2+2?', '4');

    expect(result.confidence).toBe(0);
    expect(result.isCorrect).toBeNull();
  });

  test('respects confidenceThreshold override', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: '4' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.55 }));

    // Default threshold is 0.6, so confidence 0.55 → unverifiable
    const defaultRun = await llmVerifyAnswer('What is 2+2?', '4');
    expect(defaultRun.isCorrect).toBeNull();

    callLLM.mockReset();
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: '4' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.55 }));

    // Lower the threshold → trust the verdict
    const lowThresh = await llmVerifyAnswer('What is 2+2?', '4', { confidenceThreshold: 0.5 });
    expect(lowThresh.isCorrect).toBe(true);
  });

  test('passes the configured model to callLLM', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: '4' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.9 }));

    await llmVerifyAnswer('What is 2+2?', '4', { model: 'custom-model' });

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
      .mockResolvedValueOnce(fakeCompletion({ answer: '4' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.9 }));

    await llmVerifyAnswer('What is 2+2?', '4');

    expect(callLLM).toHaveBeenCalledWith(
      VERIFIER_MODEL,
      expect.any(Array),
      expect.any(Object)
    );
  });

  test('step 2 prompt includes both expected and student answers', async () => {
    callLLM
      .mockResolvedValueOnce(fakeCompletion({ answer: '(x+3)(x-2)' }))
      .mockResolvedValueOnce(fakeCompletion({ matches: true, confidence: 0.9 }));

    await llmVerifyAnswer('Factor x^2+x-6', '(x-2)(x+3)');

    const step2Call = callLLM.mock.calls[1];
    const step2UserMsg = step2Call[1].find(m => m.role === 'user');
    expect(step2UserMsg.content).toContain('(x+3)(x-2)');    // expected
    expect(step2UserMsg.content).toContain('(x-2)(x+3)');    // student
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
