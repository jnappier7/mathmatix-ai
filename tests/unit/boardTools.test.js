// Unit tests for utils/boardTools.js — the update_board tool definition and
// the tool-call → compact board-command mapping (Stage 5b input).

const {
  BOARD_TOOL,
  BOARD_TOOLS,
  BOARD_TOOL_NAME,
  isBoardToolCall,
  isBoardToolModeEnabled,
  boardCommandsFromToolCalls,
  buildBoardToolInstructions,
} = require('../../utils/boardTools');
const { BOARD_ACTIONS } = require('../../utils/boardResponseSchema');

function call(name, args) {
  return {
    id: 'toolu_1',
    type: 'function',
    function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
  };
}

describe('BOARD_TOOL shape', () => {
  test('is an OpenAI function tool named update_board', () => {
    expect(BOARD_TOOL.type).toBe('function');
    expect(BOARD_TOOL.function.name).toBe(BOARD_TOOL_NAME);
    expect(BOARD_TOOLS).toEqual([BOARD_TOOL]);
  });

  test('action enum is the single-source BOARD_ACTIONS vocabulary', () => {
    const enumActions = BOARD_TOOL.function.parameters.properties.commands.items.properties.action.enum;
    expect(enumActions).toEqual(BOARD_ACTIONS);
  });
});

describe('isBoardToolModeEnabled', () => {
  const ORIGINAL = process.env.BOARD_TOOL_CALLS;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.BOARD_TOOL_CALLS;
    else process.env.BOARD_TOOL_CALLS = ORIGINAL;
  });

  test('defaults off; true/1 turn it on', () => {
    delete process.env.BOARD_TOOL_CALLS;
    expect(isBoardToolModeEnabled()).toBe(false);
    process.env.BOARD_TOOL_CALLS = 'true';
    expect(isBoardToolModeEnabled()).toBe(true);
    process.env.BOARD_TOOL_CALLS = '1';
    expect(isBoardToolModeEnabled()).toBe(true);
    process.env.BOARD_TOOL_CALLS = 'false';
    expect(isBoardToolModeEnabled()).toBe(false);
  });
});

describe('boardCommandsFromToolCalls', () => {
  test('maps a well-formed call to compact commands', () => {
    const cmds = boardCommandsFromToolCalls([
      call(BOARD_TOOL_NAME, {
        commands: [
          { action: 'pose', tex: '2x + 4 = 20' },
          { action: 'apply', op: 'subtract 4 from both sides' },
        ],
      }),
    ]);
    expect(cmds).toEqual([
      { action: 'pose', tex: '2x + 4 = 20' },
      { action: 'apply', op: 'subtract 4 from both sides' },
    ]);
  });

  test('runs commands through normalizeBoardCommand (bad action drops, tex sanitized)', () => {
    const cmds = boardCommandsFromToolCalls([
      call(BOARD_TOOL_NAME, {
        commands: [
          { action: 'explode', tex: 'x' },              // not in enum → dropped
          { action: 'pose', tex: '6 \\times 7 = 42 \\' }, // trailing backslash → sanitized
          { action: 'apply', op: '' },                    // empty string field → stripped
        ],
      }),
    ]);
    expect(cmds).toEqual([
      { action: 'pose', tex: '6 \\times 7 = 42' },
      { action: 'apply' },
    ]);
  });

  test('ignores non-board tool calls and malformed JSON', () => {
    expect(boardCommandsFromToolCalls([
      call('render_function_graph', { function: 'x^2' }),
      call(BOARD_TOOL_NAME, '{"commands": [ {"action": "pose"'), // truncated JSON
    ])).toEqual([]);
    expect(boardCommandsFromToolCalls([])).toEqual([]);
    expect(boardCommandsFromToolCalls(undefined)).toEqual([]);
  });

  test('aggregates across multiple board calls in one turn', () => {
    const cmds = boardCommandsFromToolCalls([
      call(BOARD_TOOL_NAME, { commands: [{ action: 'clear' }] }),
      call(BOARD_TOOL_NAME, { commands: [{ action: 'pose', tex: 'x = 1' }] }),
    ]);
    expect(cmds.map((c) => c.action)).toEqual(['clear', 'pose']);
  });
});

describe('isBoardToolCall / instructions', () => {
  test('recognizes only the board tool name', () => {
    expect(isBoardToolCall(BOARD_TOOL_NAME)).toBe(true);
    expect(isBoardToolCall('render_function_graph')).toBe(false);
    expect(isBoardToolCall(undefined)).toBe(false);
  });

  test('instructions override the tag protocol and keep the pedagogy rules', () => {
    const text = buildBoardToolInstructions();
    expect(text).toContain('OVERRIDES THE WORKBOARD TAG PROTOCOL');
    expect(text).toContain(BOARD_TOOL_NAME);
    expect(text).toContain('\\boxed{}');
    expect(text).toContain('never pose the answer');
  });
});
