// Board LLM translator × BOARD_TOOL_CALLS — when board tool mode is on, the
// Stage 5b.0 translator delivers cards via a forced update_board tool call
// instead of a structured-output JSON body. Flag off → the structured path
// is byte-identical to before.

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStructured: jest.fn(),
}));

const { callLLM, callLLMStructured } = require('../../utils/llmGateway');
const { proposeBoardCommands, buildBoardLlmMessages } = require('../../utils/pipeline/boardLlm');
const { BOARD_TOOL_NAME } = require('../../utils/boardTools');

const ORIGINAL_FLAG = process.env.BOARD_TOOL_CALLS;

function toolCompletion(commands) {
  return {
    choices: [{
      message: {
        content: null,
        tool_calls: [{
          id: 'toolu_1',
          type: 'function',
          function: { name: BOARD_TOOL_NAME, arguments: JSON.stringify({ commands }) },
        }],
      },
      finish_reason: 'tool_calls',
    }],
  };
}

beforeEach(() => {
  callLLM.mockReset();
  callLLMStructured.mockReset();
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.BOARD_TOOL_CALLS;
  else process.env.BOARD_TOOL_CALLS = ORIGINAL_FLAG;
});

describe('proposeBoardCommands — tool mode', () => {
  test('flag on → forced update_board tool call, commands normalized + whitelisted', async () => {
    process.env.BOARD_TOOL_CALLS = 'true';
    callLLM.mockResolvedValue(toolCompletion([
      { action: 'verify', tex: 'x = 8', check: '2(8)+4=20' },
      { action: 'pose', tex: 'should be filtered' }, // not allowed for confirm_correct
    ]));

    const { commands, record } = await proposeBoardCommands({
      chatText: 'x = 8 checks out — 2(8)+4 is 20.',
      moveType: 'confirm_correct', // whitelist: verify/clear only
    });

    expect(callLLMStructured).not.toHaveBeenCalled();
    expect(callLLM).toHaveBeenCalledTimes(1);
    const options = callLLM.mock.calls[0][2];
    expect(options.tool_choice).toEqual({ type: 'function', function: { name: BOARD_TOOL_NAME } });
    expect(options.parallel_tool_calls).toBe(false);
    expect(options.tools.map((t) => t.function.name)).toEqual([BOARD_TOOL_NAME]);

    expect(commands).toEqual([{ action: 'verify', tex: 'x = 8', check: '2(8)+4=20' }]);
    expect(record).toMatchObject({ status: 'ok', proposedRaw: 2, proposedKept: 1 });
  });

  test('flag on → a completion with no tool call proposes nothing', async () => {
    process.env.BOARD_TOOL_CALLS = 'true';
    callLLM.mockResolvedValue({ choices: [{ message: { content: 'no tool' } }] });

    const { commands, record } = await proposeBoardCommands({
      chatText: 'Nice work today!',
      moveType: 'guide_incorrect',
    });
    expect(commands).toEqual([]);
    expect(record.status).toBe('ok');
  });

  test('flag on → call failure fails to EMPTY (deterministic fallback fills the board)', async () => {
    process.env.BOARD_TOOL_CALLS = 'true';
    callLLM.mockRejectedValue(new Error('boom'));

    const { commands, record } = await proposeBoardCommands({
      chatText: 'Try subtracting 4.',
      moveType: 'guide_incorrect',
    });
    expect(commands).toEqual([]);
    expect(record.status).toBe('error');
  });

  test('flag off → structured path unchanged, no tool call', async () => {
    delete process.env.BOARD_TOOL_CALLS;
    callLLMStructured.mockResolvedValue({
      board_commands: [{ action: 'verify', tex: 'x = 8', op: null, check: null, fn: null, query: null, caption: null, model: null, spec: null, prompt: null }],
    });

    const { commands } = await proposeBoardCommands({
      chatText: 'x = 8 checks out.',
      moveType: 'confirm_correct',
    });
    expect(callLLM).not.toHaveBeenCalled();
    expect(callLLMStructured).toHaveBeenCalledTimes(1);
    expect(commands).toEqual([{ action: 'verify', tex: 'x = 8' }]);
  });
});

describe('buildBoardLlmMessages — tool-mode instruction', () => {
  test('tool mode appends the update_board delivery instruction', () => {
    const withTool = buildBoardLlmMessages({ chatText: 'x', allowedBoardActions: ['pose'], toolMode: true });
    const without = buildBoardLlmMessages({ chatText: 'x', allowedBoardActions: ['pose'] });
    expect(withTool[0].content).toContain(BOARD_TOOL_NAME);
    expect(without[0].content).not.toContain(BOARD_TOOL_NAME);
  });
});
