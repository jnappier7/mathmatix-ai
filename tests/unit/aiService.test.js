// tests/unit/aiService.test.js
// Unit tests for services/aiService.js (callYourLLMService)

const mockChatCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: (...a) => mockChatCreate(...a) } }
  }));
});

const { callYourLLMService, chat } = require('../../services/aiService');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('callYourLLMService', () => {
  test('returns trimmed AI response on success', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '  hello world  ' } }]
    });

    const r = await callYourLLMService('You are a tutor', 'user-1');
    expect(r).toBe('hello world');
  });

  test('passes the prompt as a system message and uses gpt-4o', async () => {
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });
    await callYourLLMService('Generate an opener', 'user-2');

    // Routed through callLLM now, which also passes request options as a
    // second argument — assert on the request body alone.
    expect(mockChatCreate.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: 'Generate an opener' }],
        temperature: expect.any(Number)
      })
    );
  });

  test('wraps errors with a friendly message', async () => {
    mockChatCreate.mockRejectedValue(new Error('rate limit'));
    await expect(callYourLLMService('p', 'u'))
      .rejects.toThrow(/Failed to get a valid response/);
  });
});

describe('chat (what routes/assessment.js actually calls)', () => {
  // The route called aiService.chat() while the module exported only
  // callYourLLMService, so every assessment message threw a TypeError. It
  // also held its own OpenAI handle, bypassing the outbound-PII chokepoint.
  test('prepends the system prompt, drops stored system turns, returns the reply text', async () => {
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: ' Next question: ' } }] });
    const reply = await chat([
      { role: 'system', content: 'stale' },
      { role: 'assistant', content: 'Welcome' },
      { role: 'user', content: '3/4' }
    ], 'ASSESSMENT PROMPT');

    expect(reply).toBe('Next question:');
    const body = mockChatCreate.mock.calls[0][0];
    expect(body.messages).toEqual([
      { role: 'system', content: 'ASSESSMENT PROMPT' },
      { role: 'assistant', content: 'Welcome' },
      { role: 'user', content: '3/4' }
    ]);
    expect(body.model).toBe('gpt-4o');
  });

  test('returns an empty string rather than throwing on an empty completion', async () => {
    mockChatCreate.mockResolvedValue({ choices: [] });
    await expect(chat([{ role: 'user', content: 'hi' }])).resolves.toBe('');
  });
});
