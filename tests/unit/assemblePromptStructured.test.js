/**
 * assemblePrompt() — structured-mode prompt injection (Phase 4)
 *
 * Phase 4 owns the prompt rewrite: when STRUCTURED_TUTOR_RESPONSE is
 * on, assemblePrompt appends buildStructuredResponseInstructions() to
 * the system prompt so the model drives the WorkBoard through the
 * board_commands JSON array (and classifies turn_type) instead of the
 * legacy <BOARD/> tag protocol. Flag off → the prompt is unchanged.
 *
 * assemblePrompt is pure (no LLM calls), so these tests need no
 * gateway mock — but generate.js requires llmGateway at module load,
 * so we stub it to keep the import side-effect-free.
 */

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
  callLLMStructured: jest.fn(),
}));

const { assemblePrompt } = require('../../utils/pipeline/generate');
const { ACTIONS } = require('../../utils/pipeline/decide');

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
    // useSlimRules defaults to on; give a base prompt with no SECURITY
    // marker so the slim-rules surgery is skipped and we test the raw
    // append behavior deterministically.
    systemPrompt: '--- IDENTITY ---\nYou are Maya.',
    messages: [{ role: 'user', content: 'help with 2x + 4 = 20' }],
    useSlimRules: false,
    ...overrides,
  };
}

function systemContentOf(assembled) {
  const sys = assembled.messages.find((m) => m.role === 'system');
  return sys ? sys.content : '';
}

describe('assemblePrompt() — structured-mode injection', () => {
  const ORIGINAL_FLAG = process.env.STRUCTURED_TUTOR_RESPONSE;

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.STRUCTURED_TUTOR_RESPONSE;
    } else {
      process.env.STRUCTURED_TUTOR_RESPONSE = ORIGINAL_FLAG;
    }
  });

  test('flag off → no structured instructions appended', () => {
    delete process.env.STRUCTURED_TUTOR_RESPONSE;
    const assembled = assemblePrompt(buildDecision(), buildPromptContext());
    expect(systemContentOf(assembled)).not.toMatch(/STRUCTURED RESPONSE MODE/);
  });

  test('flag on → structured instructions appended to the system prompt', () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    const assembled = assemblePrompt(buildDecision(), buildPromptContext());
    const sys = systemContentOf(assembled);
    expect(sys).toMatch(/STRUCTURED RESPONSE MODE/);
    expect(sys).toMatch(/OVERRIDES THE WORKBOARD TAG PROTOCOL/);
    // The base prompt is preserved, override is appended after it.
    expect(sys.indexOf('You are Maya.'))
      .toBeLessThan(sys.indexOf('STRUCTURED RESPONSE MODE'));
  });

  test("env='1' also enables injection", () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = '1';
    const assembled = assemblePrompt(buildDecision(), buildPromptContext());
    expect(systemContentOf(assembled)).toMatch(/STRUCTURED RESPONSE MODE/);
  });

  test('deterministic-response short-circuit is unaffected by the flag', () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    const assembled = assemblePrompt(
      buildDecision({ deterministicResponse: 'canned reply' }),
      buildPromptContext(),
    );
    // No system message is built on the deterministic path.
    expect(assembled.deterministicResponse).toBe('canned reply');
    expect(assembled.messages).toEqual([]);
  });
});
