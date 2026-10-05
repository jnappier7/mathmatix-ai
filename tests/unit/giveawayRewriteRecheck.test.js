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

// Production 2026-10: a student working an algebraic proof of
// 5(x+2) - 3x = 26 typed each step with its property. On the last one,
// "divide by 2 to get x=8", the tutor's "x = 8" confirmation tripped this guard,
// shipped the canned "first step" fallback, and the tutor restarted the proof
// from distribution — four times. Confirming a value the student produced is
// not giving it away.
describe('verify: confirming the student\'s own answer is not a giveaway', () => {
  beforeEach(() => callLLM.mockReset());
  const proofSteps = [
    '5x+10-3x=26 distributive property',
    '2x+10=26 combine like terms',
    '-10 on both sides to get 2x=16 subtraction property of equality',
  ];
  const finalStep = {
    userId: 'u1',
    messageType: MESSAGE_TYPES.GENERAL_MATH,
    isBareProblemDrop: true, // what observe() says about "divide by 2 to get x=8"
    userMessage: 'divide by 2 to get x=8',
    recentUserMessages: proofSteps,
  };
  const confirmation = 'Exactly! Dividing both sides by 2 gives us:\nx = 8\nThat completes your proof, and every step has its reason.';

  test('the student\'s final step is confirmed, not rewritten', async () => {
    const result = await verify(confirmation, finalStep);
    expect(result.text).toBe(confirmation);
    expect(result.flags).toContain('answer_restates_student_value');
    expect(result.flags).not.toContain('answer_giveaway_redirect_fallback');
    expect(callLLM).not.toHaveBeenCalled();
  });

  test('a recap of the whole derivation ending in their answer ships too', async () => {
    const recap = 'Nice proof! 5(x+2) - 3x = 26 → 5x + 10 - 3x = 26 → 2x + 10 = 26 → 2x = 16 → x = 8';
    const result = await verify(recap, finalStep);
    expect(result.text).toBe(recap);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test('"divide by 2" right after they said x=8 is still theirs to confirm', async () => {
    const result = await verify("That's the move — and it gives you x = 8.", {
      ...finalStep,
      messageType: MESSAGE_TYPES.PROPOSED_STEP,
      isBareProblemDrop: false,
      userMessage: 'divide by 2',
      recentUserMessages: ['2x+10=26', '-10 on both sides to get 2x=16', 'divide by 2 to get x=8'],
    });
    expect(result.flags).not.toContain('answer_value_revealed');
    expect(callLLM).not.toHaveBeenCalled();
  });

  test('"divide by 2" before they have said x=8 is still guarded', async () => {
    callLLM.mockResolvedValueOnce({ choices: [{ message: { content: 'Right operation! What do you get when you divide 16 by 2?' } }] });
    const result = await verify("That's the move — and it gives you x = 8.", {
      ...finalStep,
      messageType: MESSAGE_TYPES.PROPOSED_STEP,
      isBareProblemDrop: false,
      userMessage: 'divide by 2',
      recentUserMessages: ['2x+10=26 combine like terms', '-10 on both sides to get 2x=16'],
    });
    expect(result.flags).toContain('answer_value_revealed');
    expect(result.text).not.toMatch(/x\s*=\s*8/);
  });

  test('a wrong guess still does not get corrected to the answer', async () => {
    callLLM.mockResolvedValueOnce({ choices: [{ message: { content: 'Let\'s check it: what is 3 times 5, minus 7?' } }] });
    const result = await verify('Not quite.\nx = 9', {
      userId: 'u1',
      messageType: MESSAGE_TYPES.QUESTION,
      userMessage: 'is it x=5?',
      recentUserMessages: ['solve 3x - 7 = 20'],
    });
    expect(result.flags).toContain('answer_giveaway_redirected');
    expect(result.text).not.toMatch(/x\s*=\s*9/);
  });

  test('the fallback does not send a student mid-problem back to the first step', async () => {
    callLLM.mockRejectedValueOnce(new Error('LLM unavailable'));
    const result = await verify(solved, ctx);
    expect(result.flags).toContain('answer_giveaway_redirect_fallback');
    expect(result.text).not.toMatch(/first step/i);
  });
});
