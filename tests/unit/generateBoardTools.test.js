/**
 * generate() + assemblePrompt() — board tool mode (BOARD_TOOL_CALLS)
 *
 * Verifies that with the flag on:
 *   1. assemblePrompt wires the update_board tool and the tool-mode
 *      prompt block.
 *   2. A board tool call comes back from generate() as
 *      structuredBoardCommands (Stage 5b's input), with the board call
 *      excluded from toolCalls/resolvedTools.
 *   3. The narration re-prompt is skipped when the model already
 *      produced chat text alongside a board-only tool call, and still
 *      runs when there is no text.
 * And with the flag off: no board tool, prompt unchanged.
 */

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
  callLLMStructured: jest.fn(),
}));

const { callLLM } = require('../../utils/llmGateway');
const { generate, assemblePrompt } = require('../../utils/pipeline/generate');
const { ACTIONS } = require('../../utils/pipeline/decide');
const { BOARD_TOOL_NAME } = require('../../utils/boardTools');

function boardCall(commands) {
  return {
    id: 'toolu_board',
    type: 'function',
    function: { name: BOARD_TOOL_NAME, arguments: JSON.stringify({ commands }) },
  };
}

function buildAssembled(overrides = {}) {
  return {
    messages: [{ role: 'user', content: 'give me a problem' }],
    model: 'claude-sonnet-5',
    options: { temperature: 0.55, max_tokens: 1200, tools: undefined },
    deterministicResponse: null,
    ...overrides,
  };
}

// assemblePrompt(decision, promptContext) — same fixtures as
// assemblePromptStructured.test.js.
function buildDecision(overrides = {}) {
  return {
    action: ACTIONS.CONTINUE_CONVERSATION,
    diagnosis: { type: 'no_answer' },
    observation: { streaks: null },
    directives: [],
    ...overrides,
  };
}

function buildPromptContext(overrides = {}) {
  return {
    systemPrompt: '--- IDENTITY ---\nYou are Maya.',
    messages: [{ role: 'user', content: 'give me a problem' }],
    useSlimRules: false,
    ...overrides,
  };
}

const ORIGINAL_FLAG = process.env.BOARD_TOOL_CALLS;

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.BOARD_TOOL_CALLS;
  else process.env.BOARD_TOOL_CALLS = ORIGINAL_FLAG;
});

beforeEach(() => {
  callLLM.mockReset();
});

describe('assemblePrompt — board tool wiring', () => {
  test('flag on → update_board tool + tool-mode prompt block', () => {
    process.env.BOARD_TOOL_CALLS = 'true';
    const assembled = assemblePrompt(buildDecision(), buildPromptContext());
    const toolNames = (assembled.options.tools || []).map((t) => t.function.name);
    expect(toolNames).toContain(BOARD_TOOL_NAME);
    expect(assembled.options.tool_choice).toBe('auto');
    expect(assembled.messages[0].content).toContain('BOARD TOOL MODE');
  });

  test('flag off → no tools wired, prompt untouched', () => {
    delete process.env.BOARD_TOOL_CALLS;
    const assembled = assemblePrompt(buildDecision(), buildPromptContext());
    const toolNames = (assembled.options.tools || []).map((t) => t.function.name);
    expect(toolNames).not.toContain(BOARD_TOOL_NAME);
    expect(assembled.messages[0].content).not.toContain('BOARD TOOL MODE');
  });
});

describe('generate() — board tool calls (non-streaming)', () => {
  test('board call + chat text → structuredBoardCommands, no narration re-prompt', async () => {
    process.env.BOARD_TOOL_CALLS = 'true';
    callLLM.mockResolvedValue({
      choices: [{
        message: {
          content: "Here's one: solve 2x + 4 = 20.",
          tool_calls: [boardCall([{ action: 'pose', tex: '2x + 4 = 20' }])],
        },
        finish_reason: 'tool_calls',
      }],
    });

    const result = await generate(buildAssembled());

    expect(callLLM).toHaveBeenCalledTimes(1); // narration skipped
    expect(result.text).toBe("Here's one: solve 2x + 4 = 20.");
    expect(result.structuredBoardCommands).toEqual([{ action: 'pose', tex: '2x + 4 = 20' }]);
    expect(result.toolCalls).toEqual([]);       // board call is not a visual tool call
    expect(result.resolvedTools).toBeNull();
  });

  test('board call with NO chat text → narration re-prompt supplies the text', async () => {
    process.env.BOARD_TOOL_CALLS = 'true';
    callLLM
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: null,
            tool_calls: [boardCall([{ action: 'pose', tex: 'x - 3 = 7' }])],
          },
          finish_reason: 'tool_calls',
        }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Try this one on the board.' } }],
      });

    const result = await generate(buildAssembled());

    expect(callLLM).toHaveBeenCalledTimes(2);
    // Narration re-prompt must go out WITHOUT tools (no recursion).
    const narrationOptions = callLLM.mock.calls[1][2];
    expect(narrationOptions.tools).toBeUndefined();
    expect(result.text).toBe('Try this one on the board.');
    expect(result.structuredBoardCommands).toEqual([{ action: 'pose', tex: 'x - 3 = 7' }]);
  });

  test('no tool calls → plain text path, nothing attached', async () => {
    process.env.BOARD_TOOL_CALLS = 'true';
    callLLM.mockResolvedValue({
      choices: [{ message: { content: 'Nice work!' } }],
    });

    const result = await generate(buildAssembled());
    expect(result.text).toBe('Nice work!');
    expect(result.structuredBoardCommands).toBeUndefined();
  });
});
