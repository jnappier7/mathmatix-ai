// tests/unit/llmQuotaFailFast.test.js
//
// 2026-10-13: the OpenAI balance ran out. Every tutor turn sat through the
// full 429 retry ladder twice (~64s of "thinking…") before the apology, and
// /api/health said `openai: ok`. An empty balance is a 429 that waiting never
// fixes — it must fail at once, and the health check must say so.

const mockChatCreate = jest.fn();
jest.mock('openai', () => jest.fn().mockImplementation(() => ({
  chat: { completions: { create: (...args) => mockChatCreate(...args) } },
  embeddings: { create: jest.fn() },
})));

const llmQuota = require('../../utils/llmQuota');
const { retryWithExponentialBackoff, callLLM } = require('../../utils/openaiClient');
const healthReport = require('../../utils/healthReport');

const noCredits = () => Object.assign(
  new Error('429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.'),
  { status: 429 }
);
const classicQuota = () => Object.assign(new Error('429 You exceeded your current quota'), { status: 429, code: 'insufficient_quota' });
const rateLimit = () => Object.assign(new Error('Rate limit reached for gpt-4o-mini'), { status: 429, code: 'rate_limit_exceeded' });

beforeEach(() => {
  jest.clearAllMocks();
  llmQuota._resetForTests();
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';
});

describe('isQuotaExhausted', () => {
  test('recognises both production shapes of an empty balance', () => {
    expect(llmQuota.isQuotaExhausted(noCredits())).toBe(true);
    expect(llmQuota.isQuotaExhausted(classicQuota())).toBe(true);
  });

  test('a real rate limit is NOT an empty balance — it must still retry', () => {
    expect(llmQuota.isQuotaExhausted(rateLimit())).toBe(false);
  });

  test('quota wording on a non-429 is not this condition', () => {
    expect(llmQuota.isQuotaExhausted(Object.assign(new Error('insufficient_quota'), { status: 500 }))).toBe(false);
    expect(llmQuota.isQuotaExhausted(null)).toBe(false);
  });
});

describe('retryWithExponentialBackoff', () => {
  test('an empty balance fails on the first attempt, tagged, without waiting', async () => {
    const fn = jest.fn().mockRejectedValue(noCredits());
    const started = Date.now();
    await expect(retryWithExponentialBackoff(fn, 5, 1000)).rejects.toMatchObject({ quotaExhausted: true });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(500);
  });

  test('a rate limit still retries', async () => {
    const fn = jest.fn().mockRejectedValueOnce(rateLimit()).mockResolvedValueOnce('ok');
    expect(await retryWithExponentialBackoff(fn, 3, 1)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('health reporting', () => {
  test('openai reads no_credits after an exhausted call, and the instance is degraded', async () => {
    mockChatCreate.mockRejectedValueOnce(noCredits());
    await expect(callLLM('gpt-4o-mini', [{ role: 'user', content: 'hi' }])).rejects.toThrow(/no credits/);
    expect(healthReport.openaiReport('ok').status).toBe('no_credits');
    expect(healthReport.isDegraded()).toBe(true);
  });

  test('recovers on the next successful call — no restart needed', async () => {
    llmQuota.recordQuotaExhausted('openai');
    mockChatCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'hello' } }] });
    await callLLM('gpt-4o-mini', [{ role: 'user', content: 'hi' }]);
    expect(healthReport.openaiReport('ok')).toEqual({ status: 'ok' });
  });

  test('a missing key still reports missing, not ok', () => {
    expect(healthReport.openaiReport('missing')).toEqual({ status: 'missing' });
  });
});
