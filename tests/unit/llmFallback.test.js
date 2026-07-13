// Tests for the transient-error classifier that gates Claude→OpenAI failover.
// The safety-critical property: a refusal-shaped failure must be classified
// NON-transient, so a content refusal is never quietly routed to the other
// provider. (Refusals are actually HTTP 200 and don't throw; this guards the
// structured path, where an empty-content refusal surfaces as a thrown error.)

const { isTransientError } = require('../../utils/openaiClient');

describe('isTransientError — fail over on infra hiccups only', () => {
  test('rate limit and 5xx are transient', () => {
    expect(isTransientError({ status: 429 })).toBe(true);
    expect(isTransientError({ status: 500 })).toBe(true);
    expect(isTransientError({ status: 503 })).toBe(true);
    expect(isTransientError({ response: { status: 502 } })).toBe(true);
  });

  test('network/timeout errors are transient', () => {
    expect(isTransientError({ message: 'socket hang up' })).toBe(true);
    expect(isTransientError({ code: 'ECONNRESET' })).toBe(true);
    expect(isTransientError({ name: 'APIConnectionTimeoutError', message: 'Request timed out' })).toBe(true);
    expect(isTransientError({ message: 'network error' })).toBe(true);
  });

  test('4xx other than 429 are terminal (surface bugs/misconfig, do not mask)', () => {
    expect(isTransientError({ status: 400 })).toBe(false);
    expect(isTransientError({ status: 401 })).toBe(false);
    expect(isTransientError({ status: 403 })).toBe(false);
    expect(isTransientError({ status: 404 })).toBe(false);
  });

  test('refusal-shaped error is NON-transient → never falls back to the other provider', () => {
    // What anthropicClient.callLLMStructured throws on an empty-content refusal.
    const refusal = new Error('callLLMStructured(anthropic): empty content (finish_reason=content_filter)');
    expect(isTransientError(refusal)).toBe(false);
  });

  test('unknown errors default to terminal', () => {
    expect(isTransientError(new Error('something weird'))).toBe(false);
    expect(isTransientError({})).toBe(false);
  });
});
