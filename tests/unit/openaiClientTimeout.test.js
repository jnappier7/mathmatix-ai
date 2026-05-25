/**
 * openaiClient — request timeouts on chat completions.
 *
 * Bug this guards: the OpenAI SDK defaulted to a 10-minute timeout on
 * chat.completions.create() with no override in our client. If the
 * upstream API stalled (no first token, mid-stream stall), the SSE
 * response never completed and the student's "thinking…" indicator
 * spun indefinitely. The fix: pass a 90s timeout (overridable via
 * options.timeoutMs) and disable the SDK's built-in retries so a true
 * hang fails fast through to our own fallback path.
 */

// Mock the OpenAI SDK BEFORE requiring the client so the mock is in
// place when the singleton client is constructed.
const mockCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

const { callLLM, callLLMStream, DEFAULT_CHAT_TIMEOUT_MS } = require('../../utils/openaiClient');

describe('openaiClient — DEFAULT_CHAT_TIMEOUT_MS', () => {
  test('is 90 seconds (well below SDK default of 10 minutes)', () => {
    expect(DEFAULT_CHAT_TIMEOUT_MS).toBe(90 * 1000);
  });
});

describe('callLLM — request timeout passed to SDK', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
    });
  });

  test('passes the default timeout to openai.chat.completions.create', async () => {
    await callLLM('gpt-4o-mini', [{ role: 'user', content: 'hi' }]);
    const args = mockCreate.mock.calls[0];
    expect(args[1]).toBeDefined();
    expect(args[1].timeout).toBe(DEFAULT_CHAT_TIMEOUT_MS);
  });

  test('disables SDK-level retries (maxRetries: 0)', async () => {
    await callLLM('gpt-4o-mini', [{ role: 'user', content: 'hi' }]);
    const args = mockCreate.mock.calls[0];
    expect(args[1].maxRetries).toBe(0);
  });

  test('honors a caller-provided timeoutMs override', async () => {
    await callLLM('gpt-4o-mini', [{ role: 'user', content: 'hi' }], { timeoutMs: 5000 });
    const args = mockCreate.mock.calls[0];
    expect(args[1].timeout).toBe(5000);
  });

  test('still passes signal when provided', async () => {
    const controller = new AbortController();
    await callLLM('gpt-4o-mini', [{ role: 'user', content: 'hi' }], { signal: controller.signal });
    const args = mockCreate.mock.calls[0];
    expect(args[1].signal).toBe(controller.signal);
    expect(args[1].timeout).toBe(DEFAULT_CHAT_TIMEOUT_MS);
  });

  test('propagates an APIConnectionTimeoutError instead of retrying it', async () => {
    // Our retryWithExponentialBackoff retries only 429/5xx. Timeouts
    // have undefined status, so they should fail fast.
    const timeoutErr = Object.assign(new Error('Request timed out.'), { status: undefined });
    mockCreate.mockRejectedValue(timeoutErr);

    await expect(
      callLLM('gpt-4o-mini', [{ role: 'user', content: 'hi' }])
    ).rejects.toThrow('Request timed out.');

    // Only one attempt — no transient-error retry on a timeout.
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('callLLMStream — request timeout passed to SDK', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    // Return a no-op async iterable so the call resolves.
    mockCreate.mockResolvedValue((async function* noop() {})());
  });

  test('passes the default timeout to openai.chat.completions.create', async () => {
    await callLLMStream('gpt-4o-mini', [{ role: 'user', content: 'hi' }]);
    const args = mockCreate.mock.calls[0];
    expect(args[1]).toBeDefined();
    expect(args[1].timeout).toBe(DEFAULT_CHAT_TIMEOUT_MS);
  });

  test('disables SDK-level retries (maxRetries: 0)', async () => {
    await callLLMStream('gpt-4o-mini', [{ role: 'user', content: 'hi' }]);
    const args = mockCreate.mock.calls[0];
    expect(args[1].maxRetries).toBe(0);
  });

  test('honors a caller-provided timeoutMs override', async () => {
    await callLLMStream('gpt-4o-mini', [{ role: 'user', content: 'hi' }], { timeoutMs: 10000 });
    const args = mockCreate.mock.calls[0];
    expect(args[1].timeout).toBe(10000);
  });

  test('always sets stream: true on the request body', async () => {
    await callLLMStream('gpt-4o-mini', [{ role: 'user', content: 'hi' }]);
    const args = mockCreate.mock.calls[0];
    expect(args[0].stream).toBe(true);
  });

  test('propagates a timeout error rather than hanging forever', async () => {
    const timeoutErr = Object.assign(new Error('Request timed out.'), { status: undefined });
    mockCreate.mockRejectedValue(timeoutErr);
    await expect(
      callLLMStream('gpt-4o-mini', [{ role: 'user', content: 'hi' }])
    ).rejects.toThrow('Request timed out.');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
