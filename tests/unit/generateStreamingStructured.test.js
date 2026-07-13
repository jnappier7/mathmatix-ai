/**
 * generateStreaming — structured-output streaming branch (Phase 2).
 *
 * Verifies that:
 *   1. When the flag is on AND no tools, streaming calls
 *      callLLMStream with response_format and forwards
 *      chat_message text as 'chunk' SSE events while
 *      board_commands arrive structured at end-of-stream.
 *   2. When the flag is off, the legacy streaming path runs
 *      (no structuredBoardCommands attached, the board tag
 *      filter runs over the response).
 *   3. When tools are present with the flag on, the legacy
 *      path runs because response_format and tools cannot
 *      coexist on the OpenAI API.
 *   4. When the structured stream fails mid-flight, the
 *      fallback path replaces partial content cleanly.
 */

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
  callLLMStructured: jest.fn(),
}));

const { callLLM, callLLMStream } = require('../../utils/llmGateway');
const { generate } = require('../../utils/pipeline/generate');

// Build a fake `chunk` async-iterable that mirrors what
// `openai.chat.completions.create({ stream: true })` returns.
function makeStream(deltas, finishReason = 'stop') {
  const chunks = deltas.map((content) => ({
    choices: [{ delta: { content }, finish_reason: null }],
  }));
  chunks.push({ choices: [{ delta: {}, finish_reason: finishReason }] });
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
}

// Build a minimal Express-like response that records SSE writes
// and exposes the close event hook generate.js relies on.
function makeRes() {
  const events = [];
  const onClose = jest.fn();
  return {
    events,
    write: (s) => { events.push(s); return true; },
    req: { on: (name, cb) => { if (name === 'close') onClose.mockImplementation(cb); } },
    _onClose: onClose,
  };
}

function parseSseChunks(events) {
  // Each SSE line is `data: ${JSON}\n\n`. Pull the JSON out.
  return events.map((ev) => {
    const m = ev.match(/^data: (.+)\n\n$/s);
    return m ? JSON.parse(m[1]) : null;
  }).filter(Boolean);
}

function buildAssembled(overrides = {}) {
  return {
    messages: [{ role: 'user', content: 'help' }],
    model: 'gpt-4o-mini',
    options: { temperature: 0.7 },
    deterministicResponse: null,
    ...overrides,
  };
}

describe('generateStreaming — structured branch', () => {
  const ORIGINAL_FLAG = process.env.STRUCTURED_TUTOR_RESPONSE;

  beforeEach(() => {
    callLLM.mockReset();
    callLLMStream.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.STRUCTURED_TUTOR_RESPONSE;
    } else {
      process.env.STRUCTURED_TUTOR_RESPONSE = ORIGINAL_FLAG;
    }
  });

  test('flag on → calls callLLMStream with response_format, forwards chat chunks, returns structuredBoardCommands', async () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    callLLMStream.mockResolvedValue(makeStream([
      '{"chat_message":"',
      "Let's tackle",
      ' x + 1 = 5",',
      '"board_commands":[{"action":"pose","tex":"x + 1 = 5","op":null,"check":null,"fn":null,"query":null,"caption":null}]}',
    ]));

    const res = makeRes();
    const result = await generate(buildAssembled(), { stream: true, res });

    // Confirm callLLMStream got response_format
    const [, , streamOptions] = callLLMStream.mock.calls[0];
    expect(streamOptions.response_format).toBeDefined();
    expect(streamOptions.response_format.type).toBe('json_schema');

    // Confirm chat text was forwarded as SSE chunks
    const chunks = parseSseChunks(res.events);
    const chatText = chunks
      .filter(c => c.type === 'chunk')
      .map(c => c.content)
      .join('');
    expect(chatText).toBe("Let's tackle x + 1 = 5");

    // Confirm structured board commands flow back
    expect(result.text).toBe("Let's tackle x + 1 = 5");
    expect(result.structuredBoardCommands).toEqual([
      { action: 'pose', tex: 'x + 1 = 5' },
    ]);
    expect(result.toolCalls).toEqual([]);
    expect(result.resolvedTools).toBeNull();
  });

  test('flag off → legacy stream path, no response_format, no structuredBoardCommands', async () => {
    delete process.env.STRUCTURED_TUTOR_RESPONSE;
    callLLMStream.mockResolvedValue(makeStream(["Sure, let's solve it"]));

    const res = makeRes();
    const result = await generate(buildAssembled(), { stream: true, res });

    const [, , streamOptions] = callLLMStream.mock.calls[0];
    expect(streamOptions.response_format).toBeUndefined();

    expect(result.text).toBe("Sure, let's solve it");
    expect(result.structuredBoardCommands).toBeUndefined();
  });

  test('flag on + tools present → falls back to legacy stream', async () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    callLLMStream.mockResolvedValue(makeStream(['legacy response']));

    const res = makeRes();
    await generate(
      buildAssembled({
        options: { temperature: 0.7, tools: [{ type: 'function', function: { name: 'noop' } }] },
      }),
      { stream: true, res },
    );

    const [, , streamOptions] = callLLMStream.mock.calls[0];
    // Legacy stream path doesn't add response_format
    expect(streamOptions.response_format).toBeUndefined();
  });

  test('flag on, single-backslash LaTeX in body → recovers gracefully, no fallback, no raw leak (QA P0-1)', async () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    // The model emits LaTeX with a single backslash (\3x), which makes the
    // body invalid JSON. This is the exact production trigger. finalize()
    // now recovers the chat text instead of stranding into the leaky
    // fallback, so callLLM is never called and no envelope is streamed.
    callLLMStream.mockResolvedValue(makeStream([
      '{"chat_message":"Think of \\3x like 3 boxes","board_commands":[]}',
    ]));

    const res = makeRes();
    const result = await generate(buildAssembled(), { stream: true, res });

    expect(callLLM).not.toHaveBeenCalled();
    expect(result.text).toBe('Think of \\3x like 3 boxes');
    // Recovered structured path → board_commands present (empty here).
    expect(result.structuredBoardCommands).toEqual([]);

    // Nothing raw was ever sent to the client.
    const chunks = parseSseChunks(res.events);
    for (const c of chunks) {
      expect(c.content || '').not.toContain('board_commands');
      expect(c.content || '').not.toContain('"chat_message"');
    }
  });

  test('flag on, unrecoverable stream → fallback de-envelopes the blob (never leaks raw JSON)', async () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    // Stream carries no chat_message at all, so finalize() returns null and
    // the catch block falls back. The fallback re-uses the structured
    // prompt, so callLLM returns a raw envelope — which deEnvelope MUST
    // strip before it reaches the client or history.
    callLLMStream.mockResolvedValue(makeStream(['garbage with no marker at all']));
    callLLM.mockResolvedValue({
      choices: [{ message: { content: '{"chat_message":"clean recovered text","board_commands":[],"turn_type":"feedback"}' } }],
    });

    const res = makeRes();
    const result = await generate(buildAssembled(), { stream: true, res });

    // Persisted text is the chat text, not the raw envelope.
    expect(result.text).toBe('clean recovered text');
    expect(result.text).not.toContain('board_commands');

    // Whatever reached the client is de-enveloped too.
    const chunks = parseSseChunks(res.events);
    const rendered = chunks.map(c => c.content || '').join('');
    expect(rendered).toContain('clean recovered text');
    expect(rendered).not.toContain('"chat_message"');
    expect(rendered).not.toContain('board_commands');
  });

  test('flag on, callLLMStream throws → falls back to non-stream callLLM cleanly', async () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    callLLMStream.mockRejectedValue(new Error('synthetic network err'));
    callLLM.mockResolvedValue({
      choices: [{ message: { content: 'fallback content' } }],
    });

    const res = makeRes();
    const result = await generate(buildAssembled(), { stream: true, res });

    expect(callLLMStream).toHaveBeenCalledTimes(1);
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('fallback content');

    const chunks = parseSseChunks(res.events);
    // Nothing was streamed yet → the fallback sends a normal chunk,
    // not a replacement.
    expect(chunks.some(c => c.type === 'chunk' && c.content === 'fallback content')).toBe(true);
  });

  test('flag on, empty board_commands → returns text with empty array', async () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    callLLMStream.mockResolvedValue(makeStream([
      '{"chat_message":"hey there","board_commands":[]}',
    ]));

    const res = makeRes();
    const result = await generate(buildAssembled(), { stream: true, res });

    expect(result.text).toBe('hey there');
    expect(result.structuredBoardCommands).toEqual([]);
  });
});
