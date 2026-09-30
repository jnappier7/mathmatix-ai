/**
 * The answer-giveaway guard (verify.js 2a-bis) redirects a reply that solved
 * the student's own problem through an LLM rewrite. The rewrite is an LLM too,
 * so it is held to the same test: a rewrite that solves the problem again, or
 * a rewrite that fails outright, must not ship the solution.
 *
 * Found by driving the chat UI with a model that complied with "just give me
 * x": the guard fired, the rewriter echoed the solution back, and the student
 * got "Answer key: 6x - 4 = 32, x = 6." On a rewrite error the old fallback
 * appended "What do you think the first step should be?" to the solution.
 */

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
}));
jest.mock('../../utils/openaiClient', () => ({
  chat: { completions: { create: jest.fn() } },
}));

const { verify } = require('../../utils/pipeline/verify');
const { MESSAGE_TYPES } = require('../../utils/pipeline/observe');
const { callLLM } = require('../../utils/llmGateway');

const solved = 'Sure! 3x - 7 = 20, so 3x = 27.\nx = 9';
const ctx = {
  userId: 'u1',
  messageType: MESSAGE_TYPES.QUESTION,
  userMessage: 'solve 3x - 7 = 20 and just give me x',
};

describe('verify: answer-giveaway rewrite is re-checked', () => {
  beforeEach(() => callLLM.mockReset());

  test('clean rewrite ships', async () => {
    callLLM.mockResolvedValueOnce({
      choices: [{ message: { content: 'Good one to practice. What could you do to both sides to get 3x by itself?' } }],
    });
    const result = await verify(solved, ctx);
    expect(result.flags).toContain('answer_giveaway_redirected');
    expect(result.text).toMatch(/both sides/);
  });

  test('rewrite that solves it again is replaced', async () => {
    callLLM.mockResolvedValueOnce({ choices: [{ message: { content: solved } }] });
    const result = await verify(solved, ctx);
    expect(result.flags).toContain('answer_giveaway_redirect_still_leaked');
    expect(result.flags).not.toContain('answer_giveaway_redirected');
    expect(result.text).not.toMatch(/x\s*=\s*9/);
  });

  test('rewrite failure replaces the solution instead of appending to it', async () => {
    callLLM.mockRejectedValueOnce(new Error('LLM unavailable'));
    const result = await verify(solved, ctx);
    expect(result.flags).toContain('answer_giveaway_redirect_fallback');
    expect(result.text).not.toMatch(/x\s*=\s*9/);
    expect(result.text).not.toMatch(/3x = 27/);
  });

  test('empty rewrite does not fall back to the original', async () => {
    callLLM.mockResolvedValueOnce({ choices: [{ message: { content: '' } }] });
    const result = await verify(solved, ctx);
    expect(result.flags).toContain('answer_giveaway_redirect_fallback');
    expect(result.text).not.toMatch(/x\s*=\s*9/);
  });

  test('streaming: the fallback is pushed to the client as a replacement', async () => {
    callLLM.mockResolvedValueOnce({ choices: [{ message: { content: solved } }] });
    const writes = [];
    const result = await verify(solved, { ...ctx, isStreaming: true, res: { write: (s) => writes.push(s) } });
    const replacement = writes.map((w) => JSON.parse(w.replace(/^data: /, ''))).find((e) => e.type === 'replacement');
    expect(replacement).toBeDefined();
    expect(replacement.content).toBe(result.text);
    expect(replacement.content).not.toMatch(/x\s*=\s*9/);
  });
});
