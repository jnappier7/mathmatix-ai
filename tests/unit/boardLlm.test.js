// Mock the LLM boundary so no test hits a real API (same seam the generate
// tests mock). The board LLM stage calls callLLMStructured from llmGateway.
jest.mock('../../utils/llmGateway', () => ({
  callLLMStructured: jest.fn(),
}));

const { callLLMStructured } = require('../../utils/llmGateway');
const {
  getBoardLlmMode,
  allowedBoardActionsFor,
  buildBoardLlmMessages,
  proposeBoardCommands,
} = require('../../utils/pipeline/boardLlm');

beforeEach(() => {
  callLLMStructured.mockReset();
  delete process.env.BOARD_LLM_MODE;
});

describe('getBoardLlmMode', () => {
  it('defaults to off', () => {
    expect(getBoardLlmMode()).toBe('off');
  });
  it('accepts shadow and live', () => {
    process.env.BOARD_LLM_MODE = 'shadow';
    expect(getBoardLlmMode()).toBe('shadow');
    process.env.BOARD_LLM_MODE = 'LIVE';
    expect(getBoardLlmMode()).toBe('live');
  });
  it('treats junk as off', () => {
    process.env.BOARD_LLM_MODE = 'banana';
    expect(getBoardLlmMode()).toBe('off');
  });
});

describe('allowedBoardActionsFor — the alignment lever', () => {
  it('returns [] for moves that never carry a board (skip)', () => {
    for (const m of ['redirect_to_math', 'acknowledge_frustration', 'elicit_first', 'exit_ramp']) {
      expect(allowedBoardActionsFor(m)).toEqual([]);
    }
    expect(allowedBoardActionsFor(null)).toEqual([]);
  });

  it('confirm_correct allows only verify/clear (board confirms, not re-poses)', () => {
    expect(allowedBoardActionsFor('confirm_correct')).toEqual(['verify', 'clear']);
  });

  it('a normal move allows the full solving vocabulary, never diagram/model', () => {
    const allowed = allowedBoardActionsFor('guide_incorrect');
    expect(allowed).toEqual(expect.arrayContaining(['pose', 'apply', 'resolve', 'verify', 'scaffold', 'clear', 'graph', 'image']));
    expect(allowed).not.toContain('diagram');
    expect(allowed).not.toContain('model');
  });
});

describe('buildBoardLlmMessages', () => {
  it('carries every input into the user payload + a single-purpose system prompt', () => {
    const msgs = buildBoardLlmMessages({
      chatText: 'First subtract 4.',
      moveType: 'guided_practice',
      pinnedProblem: '2x + 4 = 20',
      teachingMode: false,
      allowedBoardActions: ['pose', 'resolve'],
      currentSkill: 'two-step equations',
    });
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toMatch(/Board Translator/);
    const payload = JSON.parse(msgs[1].content);
    expect(payload).toMatchObject({
      chatText: 'First subtract 4.',
      moveType: 'guided_practice',
      pinnedProblem: '2x + 4 = 20',
      teachingMode: false,
      allowedBoardActions: ['pose', 'resolve'],
      currentSkill: 'two-step equations',
    });
  });
});

describe('proposeBoardCommands', () => {
  it('SKIPS the call (no latency) on a no-board move', async () => {
    const { commands, record } = await proposeBoardCommands({
      chatText: "let's get back to math",
      moveType: 'redirect_to_math',
    });
    expect(commands).toEqual([]);
    expect(record.status).toBe('skipped');
    expect(callLLMStructured).not.toHaveBeenCalled();
  });

  it('SKIPS the call when there is no chat text to mirror', async () => {
    const { commands, record } = await proposeBoardCommands({ chatText: '   ', moveType: 'guided_practice' });
    expect(commands).toEqual([]);
    expect(record.status).toBe('skipped');
    expect(callLLMStructured).not.toHaveBeenCalled();
  });

  it('normalizes the structured result to the compact guard shape', async () => {
    callLLMStructured.mockResolvedValue({
      board_commands: [
        { action: 'pose', tex: '2x + 4 = 20', op: null, check: null, fn: null, query: null, caption: null },
        { action: 'resolve', tex: '2x = 16', op: null, check: null, fn: null, query: null, caption: null },
      ],
    });
    const { commands, record } = await proposeBoardCommands({
      chatText: 'We start with 2x + 4 = 20, then 2x = 16.',
      moveType: 'guided_practice',
      pinnedProblem: null,
    });
    expect(callLLMStructured).toHaveBeenCalledTimes(1);
    // model + response_format are the board-llm ones
    const [model, , responseFormat, opts] = callLLMStructured.mock.calls[0];
    expect(model).toBe('gpt-4o-mini');
    expect(responseFormat.json_schema.name).toBe('BoardTranslation');
    expect(opts.temperature).toBe(0);
    expect(commands).toEqual([
      { action: 'pose', tex: '2x + 4 = 20' },
      { action: 'resolve', tex: '2x = 16' },
    ]);
    expect(record.status).toBe('ok');
  });

  it('ENFORCES the move whitelist — drops actions not allowed for the move', async () => {
    // confirm_correct allows only verify/clear; a stray pose must be dropped.
    callLLMStructured.mockResolvedValue({
      board_commands: [
        { action: 'pose', tex: '2x + 4 = 20' },
        { action: 'verify', tex: 'x = 8', check: '2(8)+4=20' },
      ],
    });
    const { commands } = await proposeBoardCommands({
      chatText: 'Exactly — x = 8 checks out.',
      moveType: 'confirm_correct',
    });
    expect(commands.map(c => c.action)).toEqual(['verify']);
  });

  it('FAILS TO EMPTY on an LLM error (deterministic fallback takes over)', async () => {
    callLLMStructured.mockRejectedValue(new Error('timeout'));
    const { commands, record } = await proposeBoardCommands({
      chatText: 'Here is the next step.',
      moveType: 'guided_practice',
    });
    expect(commands).toEqual([]);
    expect(record.status).toBe('error');
  });
});
