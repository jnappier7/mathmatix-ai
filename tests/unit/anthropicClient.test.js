// Unit tests for the Anthropic adapter's pure translation helpers.
// These cover the OpenAI<->Claude shape conversions without any live API.

const a = require('../../utils/anthropicClient');

describe('anthropicClient.isClaudeModel', () => {
  test('matches claude-* ids, not others', () => {
    expect(a.isClaudeModel('claude-sonnet-5')).toBe(true);
    expect(a.isClaudeModel('claude-haiku-4-5')).toBe(true);
    expect(a.isClaudeModel('gpt-4o-mini')).toBe(false);
    expect(a.isClaudeModel('gpt-5.4')).toBe(false);
    expect(a.isClaudeModel(undefined)).toBe(false);
  });
});

describe('anthropicClient.splitSystemAndMessages', () => {
  test('pulls system out and merges consecutive same-role turns', () => {
    const { system, messages } = a.splitSystemAndMessages([
      { role: 'system', content: 'A' },
      { role: 'system', content: 'B' },
      { role: 'user', content: 'hi' },
      { role: 'user', content: 'again' },
      { role: 'assistant', content: 'yo' },
    ]);
    expect(system).toBe('A\n\nB');
    expect(messages).toEqual([
      { role: 'user', content: 'hi\n\nagain' },
      { role: 'assistant', content: 'yo' },
    ]);
  });

  test('forces a leading user turn when history starts with assistant', () => {
    const { messages } = a.splitSystemAndMessages([{ role: 'assistant', content: 'x' }]);
    expect(messages[0].role).toBe('user');
    expect(messages[1]).toEqual({ role: 'assistant', content: 'x' });
  });
});

describe('anthropicClient.sanitizeSchema', () => {
  test('strips unsupported constraint keywords recursively', () => {
    const clean = a.sanitizeSchema({
      type: 'object',
      properties: {
        n: { type: 'string', minLength: 2, maxLength: 9 },
        items: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'number', minimum: 0 } },
      },
      required: ['n'],
      additionalProperties: false,
    });
    expect(clean.properties.n).toEqual({ type: 'string' });
    expect(clean.properties.items).toEqual({ type: 'array', items: { type: 'number' } });
    expect(clean.required).toEqual(['n']);
    expect(clean.additionalProperties).toBe(false);
  });
});

describe('anthropicClient.toClaudeOutputConfig', () => {
  test('translates the OpenAI response_format wrapper to Claude output_config', () => {
    const oc = a.toClaudeOutputConfig({
      type: 'json_schema',
      json_schema: { name: 'T', schema: { type: 'object', properties: {}, additionalProperties: false } },
    });
    expect(oc).toEqual({
      format: { type: 'json_schema', schema: { type: 'object', properties: {}, additionalProperties: false } },
    });
  });

  test('returns null when no schema present', () => {
    expect(a.toClaudeOutputConfig({})).toBeNull();
  });
});

describe('anthropicClient.mapStopReason', () => {
  test('maps Claude stop reasons to OpenAI finish_reason vocabulary', () => {
    expect(a.mapStopReason('end_turn')).toBe('stop');
    expect(a.mapStopReason('max_tokens')).toBe('length');
    expect(a.mapStopReason('tool_use')).toBe('tool_calls');
    expect(a.mapStopReason('refusal')).toBe('content_filter');
  });
});
