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

describe('anthropicClient.toAnthropicContent', () => {
  test('passes plain string content through unchanged', () => {
    expect(a.toAnthropicContent('hello')).toBe('hello');
  });

  test('keeps text blocks and converts a base64 image_url to a Claude image', () => {
    const out = a.toAnthropicContent([
      { type: 'text', text: 'look at this' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA', detail: 'high' } },
    ]);
    expect(out).toEqual([
      { type: 'text', text: 'look at this' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
    ]);
  });

  test('normalizes image/jpg to image/jpeg', () => {
    const out = a.toAnthropicContent([
      { type: 'image_url', image_url: { url: 'data:image/jpg;base64,ZZ' } },
    ]);
    expect(out).toEqual([{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'ZZ' } }]);
  });

  test('converts an http(s) image_url to a Claude url source', () => {
    const out = a.toAnthropicContent([
      { type: 'image_url', image_url: { url: 'https://cdn.example.com/w.png' } },
    ]);
    expect(out).toEqual([{ type: 'image', source: { type: 'url', url: 'https://cdn.example.com/w.png' } }]);
  });

  test('drops an unsupported image type but keeps the text', () => {
    const out = a.toAnthropicContent([
      { type: 'text', text: 'my work' },
      { type: 'image_url', image_url: { url: 'data:image/heic;base64,QQ' } },
    ]);
    expect(out).toEqual([{ type: 'text', text: 'my work' }]);
  });

  test('falls back to a space when every block is unconvertible', () => {
    const out = a.toAnthropicContent([
      { type: 'image_url', image_url: { url: 'data:image/svg+xml;base64,QQ' } },
    ]);
    expect(out).toBe(' ');
  });

  test('leaves an already Claude-shaped image block intact', () => {
    const block = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'BB' } };
    expect(a.toAnthropicContent([block])).toEqual([block]);
  });
});

describe('anthropicClient.splitSystemAndMessages (vision)', () => {
  test('converts an image_url block inside a user turn to Claude shape', () => {
    const { messages } = a.splitSystemAndMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'grade this' },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,II', detail: 'high' } },
        ],
      },
    ]);
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'grade this' },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'II' } },
        ],
      },
    ]);
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
