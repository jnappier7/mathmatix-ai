/**
 * generate() — structured-output branch (Phase 1)
 *
 * Verifies that the generate stage:
 *   1. Calls callLLMStructured and returns structuredBoardCommands
 *      when STRUCTURED_TUTOR_RESPONSE is on AND no tools are wired.
 *   2. Falls back to legacy callLLM when the flag is off.
 *   3. Falls back to legacy callLLM when tools are present (the
 *      OpenAI API doesn't allow response_format + tool_choice
 *      to coexist).
 *   4. Falls back to legacy callLLM when callLLMStructured throws
 *      so a flag-on session is no worse than a flag-off session.
 */

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
  callLLMStructured: jest.fn(),
}));

const { callLLM, callLLMStructured } = require('../../utils/llmGateway');
const { generate } = require('../../utils/pipeline/generate');

function buildAssembled(overrides = {}) {
  // Minimal `assembled` object the generate() function consumes.
  // generate() only touches messages, model, and llmOptions on the
  // non-streaming path — the rest of the assembled fields belong
  // to other stages.
  return {
    messages: [{ role: 'user', content: 'help me with x + 1 = 5' }],
    model: 'gpt-4o-mini',
    options: { temperature: 0.7 },
    deterministicResponse: null,
    ...overrides,
  };
}

describe('generate() — structured-output branch', () => {
  const ORIGINAL_FLAG = process.env.STRUCTURED_TUTOR_RESPONSE;

  beforeEach(() => {
    callLLM.mockReset();
    callLLMStructured.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.STRUCTURED_TUTOR_RESPONSE;
    } else {
      process.env.STRUCTURED_TUTOR_RESPONSE = ORIGINAL_FLAG;
    }
  });

  test('flag off → uses legacy callLLM, no structured commands attached', async () => {
    delete process.env.STRUCTURED_TUTOR_RESPONSE;
    callLLM.mockResolvedValue({
      choices: [{ message: { content: 'Sure, let\'s try x + 1 = 5' } }],
    });

    const result = await generate(buildAssembled());

    expect(callLLMStructured).not.toHaveBeenCalled();
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('Sure, let\'s try x + 1 = 5');
    expect(result.structuredBoardCommands).toBeUndefined();
  });

  test('flag on → uses callLLMStructured and returns structuredBoardCommands + turn_type', async () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    callLLMStructured.mockResolvedValue({
      turn_type: 'problem_introduction',
      chat_message: 'Sure, let\'s try this problem.',
      board_commands: [
        { action: 'pose', tex: 'x + 1 = 5', op: null, check: null, fn: null, query: null, caption: null },
      ],
    });

    const result = await generate(buildAssembled());

    expect(callLLMStructured).toHaveBeenCalledTimes(1);
    expect(callLLM).not.toHaveBeenCalled();
    expect(result.text).toBe('Sure, let\'s try this problem.');
    expect(result.structuredBoardCommands).toEqual([{ action: 'pose', tex: 'x + 1 = 5' }]);
    expect(result.structuredTurnType).toBe('problem_introduction');
    expect(result.toolCalls).toEqual([]);
    expect(result.resolvedTools).toBeNull();
  });

  test('flag on, model omits turn_type → result has null turn_type (no crash)', async () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    callLLMStructured.mockResolvedValue({
      chat_message: 'hi',
      board_commands: [],
    });
    const result = await generate(buildAssembled());
    expect(result.structuredTurnType).toBeNull();
    expect(result.structuredBoardCommands).toEqual([]);
  });

  test('flag on but tools requested → falls back to legacy callLLM', async () => {
    // OpenAI cannot combine response_format with tool calling. When
    // the upstream assembler has wired up tools (e.g., visual tools
    // are enabled), generate must fall through to the legacy path
    // so the tool surface still works.
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    callLLM.mockResolvedValue({
      choices: [{ message: { content: 'fallback text' } }],
    });

    const result = await generate(buildAssembled({
      options: { temperature: 0.7, tools: [{ type: 'function', function: { name: 'noop' } }] },
    }));

    expect(callLLMStructured).not.toHaveBeenCalled();
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('fallback text');
    expect(result.structuredBoardCommands).toBeUndefined();
  });

  test('flag on but callLLMStructured throws → falls back to legacy callLLM', async () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    callLLMStructured.mockRejectedValue(new Error('synthetic network failure'));
    callLLM.mockResolvedValue({
      choices: [{ message: { content: 'fallback' } }],
    });

    const result = await generate(buildAssembled());

    expect(callLLMStructured).toHaveBeenCalledTimes(1);
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('fallback');
    expect(result.structuredBoardCommands).toBeUndefined();
  });

  test('flag on, empty board_commands → returns text with empty array', async () => {
    // Small-talk turns legitimately have no board cards. The pipeline
    // expects the array to exist (even if empty) so Stage 5b knows
    // to skip the legacy regex parser. An empty array still signals
    // "the LLM owned this decision".
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    callLLMStructured.mockResolvedValue({
      chat_message: 'Hey! Ready for some math?',
      board_commands: [],
    });

    const result = await generate(buildAssembled());

    expect(result.text).toBe('Hey! Ready for some math?');
    expect(result.structuredBoardCommands).toEqual([]);
  });
});
