// tests/unit/llmGateway.test.js
// Unit tests for utils/llmGateway.js (chat, chatStream, gradeWithVision, reason)

// We mock all the heavy dependencies so the tests focus on what the gateway
// actually does: build the system prompt, anonymize, call the LLM, rehydrate.

const mockChatCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: (...a) => mockChatCreate(...a) } },
    embeddings: { create: jest.fn() }
  }));
});

jest.mock('../../utils/openaiClient', () => ({
  openai: { chat: { completions: { create: (...a) => mockChatCreate(...a) } } },
  retryWithExponentialBackoff: (fn) => fn(),
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
  generateEmbedding: jest.fn()
}));

jest.mock('../../utils/prompt', () => ({
  generateSystemPrompt: jest.fn().mockReturnValue('SYS PROMPT')
}));

jest.mock('../../utils/piiAnonymizer', () => ({
  createAnonymizationContext: jest.fn().mockReturnValue({ ctx: 'anon' }),
  anonymizeMessages: jest.fn().mockImplementation((m) => m),
  anonymizeSystemPrompt: jest.fn().mockImplementation((p) => p),
  rehydrateResponse: jest.fn().mockImplementation((r, name) => `${r}|${name || '_'}`),
  logAnonymizationEvent: jest.fn()
}));

const { callLLM, callLLMStream } = require('../../utils/openaiClient');
const piiAnon = require('../../utils/piiAnonymizer');
const prompt = require('../../utils/prompt');
const gateway = require('../../utils/llmGateway');

beforeEach(() => {
  jest.clearAllMocks();
  callLLM.mockResolvedValue({ choices: [{ message: { content: 'response' } }] });
  callLLMStream.mockResolvedValue({ __stream: true });
});

describe('chat', () => {
  test('builds messages with system prompt and rehydrates the response', async () => {
    const ctx = {
      user: { _id: 'u1', firstName: 'Sam' },
      tutor: { name: 'Alex' },
      messages: [{ role: 'user', content: 'hi' }]
    };
    const r = await gateway.chat(ctx);

    expect(prompt.generateSystemPrompt).toHaveBeenCalled();
    expect(callLLM).toHaveBeenCalled();
    const [model, messages, opts] = callLLM.mock.calls[0];
    expect(model).toBe('gpt-4o-mini');
    expect(messages[0]).toEqual({ role: 'system', content: 'SYS PROMPT' });
    expect(messages[1]).toEqual({ role: 'user', content: 'hi' });
    expect(opts).toMatchObject({ temperature: 0.5, max_tokens: 1500 });
    expect(r).toBe('response|Sam');
  });

  test('honors options.model / temperature / maxTokens', async () => {
    await gateway.chat(
      { user: null, tutor: null, messages: [] },
      { model: 'gpt-4o', temperature: 0.2, maxTokens: 500 }
    );
    const [model, , opts] = callLLM.mock.calls[0];
    expect(model).toBe('gpt-4o');
    expect(opts).toMatchObject({ temperature: 0.2, max_tokens: 500 });
  });

  test('logs anonymization event with messageCount', async () => {
    await gateway.chat({ user: { _id: 'u1' }, tutor: null, messages: [{}, {}, {}] });
    expect(piiAnon.logAnonymizationEvent).toHaveBeenCalledWith(
      'u1', 'anonymize', expect.objectContaining({ messageCount: 4 })
    );
  });

  test('defaults tutor name to "Alex" when missing', async () => {
    await gateway.chat({ user: null, tutor: undefined, messages: [] });
    expect(prompt.generateSystemPrompt).toHaveBeenCalledWith(
      null, 'Alex', null, 'student', null, null, null, [], null
    );
  });
});

describe('chatStream', () => {
  test('returns { stream, anonContext } and uses streaming LLM', async () => {
    const r = await gateway.chatStream({
      user: { _id: 'u1' }, tutor: null, messages: []
    });

    expect(callLLMStream).toHaveBeenCalled();
    expect(r.stream).toEqual({ __stream: true });
    expect(r.anonContext).toEqual({ ctx: 'anon' });
  });

  test('logs anonymization with stream variant', async () => {
    await gateway.chatStream({ user: { _id: 'u1' }, tutor: null, messages: [{}] });
    expect(piiAnon.logAnonymizationEvent).toHaveBeenCalledWith(
      'u1', 'anonymize-stream', expect.any(Object)
    );
  });
});

describe('gradeWithVision', () => {
  test('throws when imageDataUrl or prompt is missing', async () => {
    await expect(gateway.gradeWithVision({ prompt: 'p' })).rejects.toThrow(/required/);
    await expect(gateway.gradeWithVision({ imageDataUrl: 'd' })).rejects.toThrow(/required/);
  });

  test('uses max_completion_tokens for gpt-4o vision model', async () => {
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'graded' } }] });
    const r = await gateway.gradeWithVision({
      imageDataUrl: 'data:image/png;base64,xyz',
      prompt: 'grade this',
      user: { firstName: 'Sam' }
    });

    const args = mockChatCreate.mock.calls[0][0];
    expect(args.model).toBe('gpt-4o');
    expect(args.max_completion_tokens).toBe(1500);
    expect(args.max_tokens).toBeUndefined();
    expect(args.messages[0].content[0]).toMatchObject({ type: 'text' });
    expect(args.messages[0].content[1]).toMatchObject({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,xyz', detail: 'high' }
    });
    expect(r).toBe('graded|Sam');
  });

  test('rethrows OpenAI errors', async () => {
    mockChatCreate.mockRejectedValue(new Error('rate limited'));
    await expect(gateway.gradeWithVision({
      imageDataUrl: 'd', prompt: 'p'
    })).rejects.toThrow('rate limited');
  });
});

describe('reason', () => {
  test('calls callLLM with prompt as user message and rehydrates', async () => {
    const r = await gateway.reason('Why is the sky blue?', { user: { firstName: 'Sam' } });
    expect(callLLM).toHaveBeenCalled();
    const [model, messages, opts] = callLLM.mock.calls[0];
    expect(model).toBe('gpt-4o-mini');
    expect(messages[0]).toMatchObject({ role: 'user' });
    expect(opts).toMatchObject({ temperature: 0.5, max_tokens: 1000 });
    expect(r).toBe('response|Sam');
  });

  test('honors options.model + options.maxTokens', async () => {
    await gateway.reason('x', { model: 'gpt-4o', maxTokens: 250, temperature: 0.1 });
    const [model, , opts] = callLLM.mock.calls[0];
    expect(model).toBe('gpt-4o');
    expect(opts).toMatchObject({ max_tokens: 250, temperature: 0.1 });
  });
});

describe('exports', () => {
  test('exposes high-level + low-level + DEFAULT_MODELS', () => {
    expect(typeof gateway.chat).toBe('function');
    expect(typeof gateway.chatStream).toBe('function');
    expect(typeof gateway.gradeWithVision).toBe('function');
    expect(typeof gateway.reason).toBe('function');
    expect(typeof gateway.callLLM).toBe('function');
    expect(gateway.DEFAULT_MODELS).toMatchObject({
      chat: expect.any(String),
      grading: expect.any(String),
      reasoning: expect.any(String),
      embedding: expect.any(String)
    });
  });
});
