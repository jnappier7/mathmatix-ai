/**
 * callLLMStructured — thin wrapper around callLLM that pairs an
 * OpenAI response_format spec with content parsing.
 *
 * These tests mock the OpenAI SDK directly so we exercise the
 * wrapper's contract (response_format gets through, JSON gets
 * parsed, errors surface cleanly) without touching the network.
 */

const mockChatCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: (...args) => mockChatCreate(...args),
      },
    },
  }));
});

const { callLLMStructured } = require('../../utils/openaiClient');

const SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'TestResponse',
    schema: {
      type: 'object',
      properties: { greeting: { type: 'string' } },
      required: ['greeting'],
      additionalProperties: false,
    },
    strict: true,
  },
};

describe('callLLMStructured', () => {
  beforeEach(() => {
    mockChatCreate.mockReset();
  });

  test('parses JSON content and returns it', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '{"greeting":"hi"}' }, finish_reason: 'stop' }],
    });
    const out = await callLLMStructured('gpt-4o-mini', [{ role: 'user', content: 'hi' }], SCHEMA);
    expect(out).toEqual({ greeting: 'hi' });
  });

  test('forwards response_format on the SDK call', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '{"greeting":"hello"}' }, finish_reason: 'stop' }],
    });
    await callLLMStructured('gpt-4o-mini', [{ role: 'user', content: 'hi' }], SCHEMA);
    const [requestBody] = mockChatCreate.mock.calls[0];
    expect(requestBody.response_format).toBe(SCHEMA);
    expect(requestBody.stream).toBe(false);
  });

  test('forces stream:false even when caller passed stream:true', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '{"greeting":"hi"}' }, finish_reason: 'stop' }],
    });
    await callLLMStructured(
      'gpt-4o-mini',
      [{ role: 'user', content: 'hi' }],
      SCHEMA,
      { stream: true },
    );
    const [requestBody] = mockChatCreate.mock.calls[0];
    expect(requestBody.stream).toBe(false);
  });

  test('throws when responseFormat is missing', async () => {
    await expect(
      callLLMStructured('gpt-4o-mini', [{ role: 'user', content: 'hi' }], null)
    ).rejects.toThrow(/responseFormat is required/);
  });

  test('throws when content is empty', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '' }, finish_reason: 'length' }],
    });
    await expect(
      callLLMStructured('gpt-4o-mini', [{ role: 'user', content: 'hi' }], SCHEMA)
    ).rejects.toThrow(/empty content.*finish_reason=length/);
  });

  test('throws when JSON.parse fails (defensive — strict:true should prevent this)', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: 'not valid json' }, finish_reason: 'stop' }],
    });
    await expect(
      callLLMStructured('gpt-4o-mini', [{ role: 'user', content: 'hi' }], SCHEMA)
    ).rejects.toThrow(/JSON.parse failed/);
  });

  test('passes through caller-supplied temperature and max_tokens', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '{"greeting":"hi"}' }, finish_reason: 'stop' }],
    });
    await callLLMStructured(
      'gpt-4o-mini',
      [{ role: 'user', content: 'hi' }],
      SCHEMA,
      { temperature: 0.3, max_tokens: 500 },
    );
    const [requestBody] = mockChatCreate.mock.calls[0];
    expect(requestBody.temperature).toBe(0.3);
    // gpt-4o family uses max_completion_tokens
    expect(requestBody.max_completion_tokens).toBe(500);
  });
});
