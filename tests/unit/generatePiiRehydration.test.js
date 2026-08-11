/**
 * generate — placeholder rehydration under PII_STRIP_OUTBOUND.
 *
 * When the outbound choke point swaps the student's name for [Student],
 * the model's reply can echo the placeholder. These tests pin that the
 * generate stage puts the real name back in BOTH places a student can
 * see text: the streamed SSE chunks (including a placeholder split
 * across chunk boundaries) and the returned `text` that gets persisted.
 * And that with the flag off, nothing changes at all.
 */

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
  callLLMStructured: jest.fn(),
}));

const { callLLM, callLLMStream } = require('../../utils/llmGateway');
const { generate } = require('../../utils/pipeline/generate');
const { createAnonymizationContext } = require('../../utils/piiAnonymizer');

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

function makeRes() {
  const events = [];
  return {
    events,
    write: (s) => { events.push(s); return true; },
    req: { on: () => {} },
  };
}

function streamedText(events) {
  return events
    .map((ev) => {
      const m = ev.match(/^data: (.+)\n\n$/s);
      return m ? JSON.parse(m[1]) : null;
    })
    .filter((p) => p && p.type === 'chunk')
    .map((p) => p.content)
    .join('');
}

const anonContext = createAnonymizationContext({ firstName: 'Maya', lastName: 'Lopez' });

function assembledWith(options = {}) {
  return {
    messages: [
      { role: 'system', content: 'You tutor [Student].' },
      { role: 'user', content: 'help me factor this' },
    ],
    model: 'gpt-4o-mini',
    options,
  };
}

describe('generate placeholder rehydration (PII_STRIP_OUTBOUND=true)', () => {
  const ORIGINAL = process.env.PII_STRIP_OUTBOUND;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PII_STRIP_OUTBOUND = 'true';
  });
  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.PII_STRIP_OUTBOUND;
    else process.env.PII_STRIP_OUTBOUND = ORIGINAL;
  });

  test('non-streaming: returned text has the real name restored', async () => {
    callLLM.mockResolvedValue({
      choices: [{ message: { content: 'Great start, [Student]! What is the GCF?' } }],
    });

    const result = await generate(assembledWith({ anonContext }));
    expect(result.text).toBe('Great start, Maya! What is the GCF?');
  });

  test('streaming: a placeholder split across chunks is reassembled and rehydrated', async () => {
    callLLMStream.mockResolvedValue(
      makeStream(['Nice one, [Stu', 'dent]! Try the ', 'next step.'])
    );

    const res = makeRes();
    const result = await generate(assembledWith({ anonContext }), { stream: true, res });

    expect(streamedText(res.events)).toBe('Nice one, Maya! Try the next step.');
    expect(result.text).toBe('Nice one, Maya! Try the next step.');
  });

  test('no anonContext attached: text passes through untouched', async () => {
    callLLM.mockResolvedValue({
      choices: [{ message: { content: 'Hello [Student]' } }],
    });
    const result = await generate(assembledWith({}));
    expect(result.text).toBe('Hello [Student]');
  });
});

describe('generate with the flag off (production default)', () => {
  const ORIGINAL = process.env.PII_STRIP_OUTBOUND;
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PII_STRIP_OUTBOUND;
  });
  afterAll(() => {
    if (ORIGINAL !== undefined) process.env.PII_STRIP_OUTBOUND = ORIGINAL;
  });

  test('streaming output is byte-identical to the model output', async () => {
    callLLMStream.mockResolvedValue(makeStream(['Hey Maya, ', 'ready to factor?']));

    const res = makeRes();
    const result = await generate(assembledWith({ anonContext }), { stream: true, res });

    expect(streamedText(res.events)).toBe('Hey Maya, ready to factor?');
    expect(result.text).toBe('Hey Maya, ready to factor?');
  });
});
