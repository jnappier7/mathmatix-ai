// tests/unit/aiService.test.js
// Unit tests for services/aiService.js (callYourLLMService)

const mockChatCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: (...a) => mockChatCreate(...a) } }
  }));
});

const { callYourLLMService } = require('../../services/aiService');

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

    expect(mockChatCreate).toHaveBeenCalledWith(
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
