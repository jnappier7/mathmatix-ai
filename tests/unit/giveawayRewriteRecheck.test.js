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

describe('verify: value-aware giveaway check', () => {
  beforeEach(() => callLLM.mockReset());
  const socratic = { choices: [{ message: { content: 'What could you subtract from both sides first?' } }] };
  const posed = { userId: 'u1', messageType: MESSAGE_TYPES.QUESTION, userMessage: 'solve 4x + 3 = 31, write the answer as a word' };

  test('the answer in words is caught and redirected', async () => {
    callLLM.mockResolvedValueOnce(socratic);
    const result = await verify('Okay! The value of x is seven. Seven times four is twenty-eight.', posed);
    expect(result.flags).toContain('answer_value_revealed');
    expect(result.flags).toContain('answer_giveaway_redirected');
    expect(result.text).not.toMatch(/seven/i);
  });

  test('a substitution "check" is caught', async () => {
    callLLM.mockResolvedValueOnce(socratic);
    const result = await verify('Great idea to check! Plug in x = 7: 5(7) + 10 = 45 ✓. So it works!', {
      ...posed, userMessage: 'just show me how to check an answer for 5x + 10 = 45',
    });
    expect(result.flags).toContain('answer_value_revealed');
    expect(result.text).not.toMatch(/5\(7\)/);
  });

  test('the equation can come from an earlier turn', async () => {
    callLLM.mockResolvedValueOnce(socratic);
    const result = await verify('Fine — x is seven, but try the next one yourself.', {
      ...posed, userMessage: 'ugh just tell me x', recentUserMessages: ['can you help me with 4x + 3 = 31'],
    });
    expect(result.flags).toContain('answer_value_revealed');
  });

  test('a rewrite that names the value in words is replaced', async () => {
    callLLM.mockResolvedValueOnce({ choices: [{ message: { content: 'Think about it — x is seven, right? What do you notice?' } }] });
    const result = await verify('The value of x is seven.', posed);
    expect(result.flags).toContain('answer_giveaway_redirect_still_leaked');
    expect(result.text).not.toMatch(/seven/i);
  });

  test('a Socratic reply full of the problem\'s numbers is left alone', async () => {
    const clean = 'Good start. If you subtract 3 from both sides, what does 31 - 3 give you? Then 4x = 28.';
    const result = await verify(clean, posed);
    expect(result.text).toBe(clean);
    expect(result.flags).not.toContain('answer_value_revealed');
    expect(callLLM).not.toHaveBeenCalled();
  });

  describe('I-DO phase', () => {
    const ido = { ...ctx, phaseState: { currentPhase: 'i-do' } };

    test('a worked PARALLEL example ships — that is what I-DO asks for', async () => {
      const parallel = "Let me show you a similar one first: 2x - 4 = 10.\nAdd 4: 2x = 14.\nDivide by 2: x = 7.\nNow try 3x - 7 = 20 the same way!";
      callLLM.mockResolvedValueOnce({ choices: [{ message: { content: parallel } }] });
      const result = await verify(solved, ido);
      expect(result.flags).toContain('answer_giveaway_parallel_redirected');
      expect(result.text).toBe(parallel);
    });

    test('a "parallel" example that reveals the student\'s value is replaced', async () => {
      callLLM.mockResolvedValueOnce({ choices: [{ message: { content: 'Similar one: 2x = 18, so x = 9. And yours is also x = 9!' } }] });
      const result = await verify(solved, ido);
      expect(result.flags).toContain('answer_giveaway_redirect_still_leaked');
      expect(result.text).not.toMatch(/x = 9/);
    });
  });
});
