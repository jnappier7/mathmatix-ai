// tests/unit/openaiClient.test.js
// Unit tests for utils/openaiClient.js (retry/backoff, callLLM/Stream, embeddings)

// Mock the openai package BEFORE requiring the module under test.
const mockChatCreate = jest.fn();
const mockEmbeddingsCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: (...args) => mockChatCreate(...args) } },
    embeddings: { create: (...args) => mockEmbeddingsCreate(...args) }
  }));
});

const {
  retryWithExponentialBackoff,
  callLLM,
  callLLMStream,
  generateEmbedding
} = require('../../utils/openaiClient');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('retryWithExponentialBackoff', () => {
  test('returns the value on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    expect(await retryWithExponentialBackoff(fn)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on 429 and eventually succeeds', async () => {
    const transient = Object.assign(new Error('rate limit'), { status: 429 });
    const fn = jest.fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce('ok');

    const r = await retryWithExponentialBackoff(fn, 3, 1); // 1ms base delay
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('retries on 5xx errors', async () => {
    const transient = Object.assign(new Error('server'), { status: 503 });
    const fn = jest.fn()
      .mockRejectedValueOnce(transient)
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce('ok');

    expect(await retryWithExponentialBackoff(fn, 5, 1)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('respects Retry-After header when present (number of seconds)', async () => {
    const transient = Object.assign(new Error('rl'), {
      status: 429,
      response: { headers: { 'retry-after': '0' } }
    });
    const fn = jest.fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce('ok');

    expect(await retryWithExponentialBackoff(fn, 3, 50)).toBe('ok');
  });

  test('does not retry on non-transient errors', async () => {
    const fn = jest.fn().mockRejectedValue(Object.assign(new Error('bad'), { status: 400 }));
    await expect(retryWithExponentialBackoff(fn, 3, 1)).rejects.toThrow('bad');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('throws after exhausting retries', async () => {
    const transient = Object.assign(new Error('still down'), { status: 503 });
    const fn = jest.fn().mockRejectedValue(transient);
    await expect(retryWithExponentialBackoff(fn, 2, 1)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('callLLM', () => {
  test('passes max_completion_tokens for gpt-4o models', async () => {
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'hi' } }] });
    await callLLM('gpt-4o', [{ role: 'user', content: 'hello' }], { max_tokens: 200 });
    expect(mockChatCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_completion_tokens: 200 })
    );
    expect(mockChatCreate.mock.calls[0][0].max_tokens).toBeUndefined();
  });

  test('uses legacy max_tokens for older models', async () => {
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'hi' } }] });
    await callLLM('gpt-3.5-turbo', [{ role: 'user', content: 'x' }], { max_tokens: 100 });
    expect(mockChatCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 100 })
    );
    expect(mockChatCreate.mock.calls[0][0].max_completion_tokens).toBeUndefined();
  });

  test('omits temperature for nano models', async () => {
    mockChatCreate.mockResolvedValue({ choices: [] });
    await callLLM('gpt-5-nano', [], { temperature: 0.9 });
    expect(mockChatCreate.mock.calls[0][0].temperature).toBeUndefined();
  });

  test('passes tools and tool_choice through', async () => {
    mockChatCreate.mockResolvedValue({ choices: [] });
    const tools = [{ type: 'function', function: { name: 'f' } }];
    await callLLM('gpt-4o', [], { tools, tool_choice: 'auto', parallel_tool_calls: false });
    expect(mockChatCreate.mock.calls[0][0]).toMatchObject({
      tools, tool_choice: 'auto', parallel_tool_calls: false
    });
  });

  test('passes response_format when provided', async () => {
    mockChatCreate.mockResolvedValue({ choices: [] });
    await callLLM('gpt-4o', [], { response_format: { type: 'json_object' } });
    expect(mockChatCreate.mock.calls[0][0]).toMatchObject({
      response_format: { type: 'json_object' }
    });
  });

  test('does not include tools key when none provided', async () => {
    mockChatCreate.mockResolvedValue({ choices: [] });
    await callLLM('gpt-4o', [], {});
    expect(mockChatCreate.mock.calls[0][0].tools).toBeUndefined();
  });

  test('rethrows OpenAI errors', async () => {
    mockChatCreate.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
    await expect(callLLM('gpt-4o', [], {})).rejects.toThrow('forbidden');
  });
});

describe('callLLMStream', () => {
  test('returns the stream object with stream:true', async () => {
    const fakeStream = { __isStream: true };
    mockChatCreate.mockResolvedValue(fakeStream);
    const r = await callLLMStream('gpt-4o', [{ role: 'user', content: 'x' }], { max_tokens: 10 });
    expect(r).toBe(fakeStream);
    expect(mockChatCreate.mock.calls[0][0]).toMatchObject({ stream: true });
  });

  test('rethrows errors from the stream call', async () => {
    mockChatCreate.mockRejectedValue(new Error('boom'));
    await expect(callLLMStream('gpt-4o', [], {})).rejects.toThrow('boom');
  });
});

describe('generateEmbedding', () => {
  test('returns embedding vector for valid input', async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
    expect(await generateEmbedding('hello')).toEqual([0.1, 0.2, 0.3]);
  });

  test('rejects empty input', async () => {
    await expect(generateEmbedding('')).rejects.toThrow(/non-empty/);
    await expect(generateEmbedding(null)).rejects.toThrow(/non-empty/);
    await expect(generateEmbedding(123)).rejects.toThrow(/non-empty/);
  });

  test('truncates input over 8000 chars', async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0] }] });
    await generateEmbedding('x'.repeat(10000));
    expect(mockEmbeddingsCreate.mock.calls[0][0].input).toHaveLength(8000);
  });
});
