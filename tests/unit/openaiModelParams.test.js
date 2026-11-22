/**
 * utils/openaiClient — per-model request parameters.
 *
 * Every rule here was a terminal 400 against the live API (2026-11-22), and a
 * terminal 4xx has no fallback in openaiClient, so a wrong parameter is "every
 * tutor turn fails", not a degraded reply:
 *   - gpt-4o+/gpt-5/gpt-6/o-series reject `max_tokens` (want max_completion_tokens)
 *   - gpt-5/gpt-6/o-series/*nano reject any temperature but the default
 *   - gpt-6-luna reasons by default (slower, billed) unless reasoning_effort is
 *     'none', and refuses function tools on Chat Completions at any other effort
 * Pins the rules that let TUTOR_MODEL move off gpt-4o-mini before its
 * 2027-01-14 shutdown.
 */
jest.mock('openai', () => jest.fn().mockImplementation(() => ({
  chat: { completions: { create: jest.fn() } },
  embeddings: { create: jest.fn() },
})));

const { openaiRequestParams, reasoningEffortFor } = require('../../utils/openaiClient');

const saved = process.env.TUTOR_REASONING_EFFORT;
beforeEach(() => { delete process.env.TUTOR_REASONING_EFFORT; });
afterAll(() => { if (saved !== undefined) process.env.TUTOR_REASONING_EFFORT = saved; });

describe('token limit parameter', () => {
  it('gpt-4o-mini / gpt-4o take max_completion_tokens (unchanged behaviour)', () => {
    expect(openaiRequestParams('gpt-4o-mini', { max_tokens: 100 })).toMatchObject({ max_completion_tokens: 100 });
    expect(openaiRequestParams('gpt-4o', { max_tokens: 100 })).not.toHaveProperty('max_tokens');
  });
  it('gpt-6-luna and the rest of gpt-5/gpt-6 take max_completion_tokens', () => {
    for (const m of ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-6.1-terra', 'gpt-5-mini', 'o4-mini']) {
      const p = openaiRequestParams(m, { max_tokens: 100 });
      expect(p).toMatchObject({ max_completion_tokens: 100 });
      expect(p).not.toHaveProperty('max_tokens');
    }
  });
  it('only the pre-4o legacy models still get max_tokens', () => {
    expect(openaiRequestParams('gpt-3.5-turbo', { max_tokens: 50 })).toMatchObject({ max_tokens: 50 });
    expect(openaiRequestParams('gpt-4-turbo', { max_tokens: 50 })).toMatchObject({ max_tokens: 50 });
    expect(openaiRequestParams('gpt-4.1-mini', { max_tokens: 50 })).toMatchObject({ max_completion_tokens: 50 });
  });
  it('no limit requested → no limit sent', () => {
    expect(openaiRequestParams('gpt-6-luna', {})).not.toHaveProperty('max_completion_tokens');
  });
});

describe('temperature', () => {
  it('gpt-4o-mini still gets the caller temperature (default 0.7)', () => {
    expect(openaiRequestParams('gpt-4o-mini', { temperature: 0.55 })).toMatchObject({ temperature: 0.55 });
    expect(openaiRequestParams('gpt-4o-mini', {})).toMatchObject({ temperature: 0.7 });
  });
  it('is omitted for gpt-5/gpt-6/o-series/nano, which only accept the default', () => {
    for (const m of ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-5-nano', 'gpt-5-mini', 'o3', 'gpt-4.1-nano']) {
      expect(openaiRequestParams(m, { temperature: 0.55 })).not.toHaveProperty('temperature');
    }
  });
});

describe('reasoning_effort', () => {
  it('is never sent to gpt-4o-family models', () => {
    expect(openaiRequestParams('gpt-4o-mini', {})).not.toHaveProperty('reasoning_effort');
    expect(openaiRequestParams('gpt-4o', {})).not.toHaveProperty('reasoning_effort');
  });
  it('defaults to none on gpt-6: the tutor streams short replies, not a chain of thought', () => {
    expect(openaiRequestParams('gpt-6-luna', {})).toMatchObject({ reasoning_effort: 'none' });
  });
  it('TUTOR_REASONING_EFFORT and a per-call option override the default', () => {
    process.env.TUTOR_REASONING_EFFORT = 'low';
    expect(openaiRequestParams('gpt-6-luna', {})).toMatchObject({ reasoning_effort: 'low' });
    expect(openaiRequestParams('gpt-6-luna', { reasoning_effort: 'medium' })).toMatchObject({ reasoning_effort: 'medium' });
  });
  it('function tools force none — Chat Completions refuses tools at any other effort', () => {
    process.env.TUTOR_REASONING_EFFORT = 'low';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const tools = [{ type: 'function', function: { name: 'update_board', parameters: {} } }];
    expect(openaiRequestParams('gpt-6-luna', { tools })).toMatchObject({ reasoning_effort: 'none' });
    warn.mockRestore();
  });
  it('spells the floor the way each family accepts it', () => {
    expect(reasoningEffortFor('gpt-5-nano', {})).toBe('minimal');   // gpt-5 (no dot) has no "none"
    expect(reasoningEffortFor('gpt-5.6-luna', {})).toBe('none');
    expect(reasoningEffortFor('o4-mini', {})).toBe('low');           // o-series: low/medium/high only
  });
});
