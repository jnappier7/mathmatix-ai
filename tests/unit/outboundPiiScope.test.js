/**
 * The chokepoint has to be SUFFICIENT on its own.
 *
 * Before this, name stripping at utils/openaiClient.js needed every call
 * site to pass options.anonContext, and an audit of ~60 sites found one that
 * did. So the strip covered emails and phone numbers everywhere and the
 * student's name almost nowhere. Two things fix that and are pinned here:
 *
 *  1. A request-scoped context (AsyncLocalStorage), opened per HTTP request
 *     by middleware/outboundPii.js from req.user, that the chokepoint falls
 *     back on when a call carries no context of its own.
 *  2. Rehydration AT the chokepoint — completions, structured JSON and
 *     streamed chunks all come back with the real name — so a call site
 *     that never heard of [Student] cannot show the placeholder to a child.
 *
 * Plus: embeddings go through the same strip, and no file outside the two
 * provider clients may call a provider SDK directly. Those were the three
 * bypasses the audit found (aiService, gradeWithVision, generateEmbedding).
 */

jest.mock('openai', () => {
  const create = jest.fn();
  const embeddingsCreate = jest.fn();
  function OpenAI() {
    return {
      chat: { completions: { create } },
      embeddings: { create: embeddingsCreate },
      moderations: { create: jest.fn() },
    };
  }
  OpenAI.__create = create;
  OpenAI.__embeddingsCreate = embeddingsCreate;
  return OpenAI;
});

const OpenAI = require('openai');
const { callLLM, callLLMStream, callLLMStructured, generateEmbedding } = require('../../utils/openaiClient');
const {
  createAnonymizationContext,
  createActorAnonymizationContext,
  runWithOutboundPiiContext,
  currentOutboundPiiContext,
  outboundPiiStripEnabled,
} = require('../../utils/piiAnonymizer');
const { outboundPiiScope } = require('../../middleware/outboundPii');

const ORIGINAL_FLAG = process.env.PII_STRIP_OUTBOUND;
beforeEach(() => {
  delete process.env.PII_STRIP_OUTBOUND;
  OpenAI.__create.mockReset();
  OpenAI.__embeddingsCreate.mockReset();
});
afterAll(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.PII_STRIP_OUTBOUND;
  else process.env.PII_STRIP_OUTBOUND = ORIGINAL_FLAG;
});

const zoe = { firstName: 'Zoe', lastName: 'Quill', role: 'student' };
const sentMessages = () => OpenAI.__create.mock.calls[0][0].messages;
const completionOf = (content) => ({ choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] });

function chunkStream(pieces, finish = 'stop') {
  const chunks = pieces.map((c) => (typeof c === 'string'
    ? { choices: [{ index: 0, delta: { content: c }, finish_reason: null }] }
    : c));
  chunks.push({ choices: [{ index: 0, delta: {}, finish_reason: finish }] });
  return { async *[Symbol.asyncIterator]() { for (const c of chunks) yield c; } };
}

async function collect(stream) {
  const out = { text: '', chunks: [] };
  for await (const chunk of stream) {
    out.chunks.push(chunk);
    const c = chunk.choices?.[0]?.delta?.content;
    if (c) out.text += c;
  }
  return out;
}

describe('the switch', () => {
  test('is on unless PII_STRIP_OUTBOUND is exactly "false"', () => {
    expect(outboundPiiStripEnabled()).toBe(true);
    process.env.PII_STRIP_OUTBOUND = 'true';
    expect(outboundPiiStripEnabled()).toBe(true);
    process.env.PII_STRIP_OUTBOUND = 'false';
    expect(outboundPiiStripEnabled()).toBe(false);
  });
});

describe('the actor context', () => {
  test('a student is the profile: both names to [Student], first name restored', () => {
    const ctx = createActorAnonymizationContext(zoe);
    expect(ctx.anonymize('Zoe Quill and Quill and zoe')).toBe('[Student] and [Student] and [Student]');
    expect(ctx.rehydrate('Hi [Student]!')).toBe('Hi Zoe!');
  });

  test('a teacher is not a student: name to [Teacher], restored as [Teacher]', () => {
    const ctx = createActorAnonymizationContext({ firstName: 'Dana', lastName: 'Rivera', role: 'teacher' });
    expect(ctx.anonymize('Ms Dana Rivera asked')).toBe('Ms [Teacher] asked');
    expect(ctx.rehydrate('Thanks, [Teacher].')).toBe('Thanks, Dana.');
  });

  test('a parent maps to [Parent]', () => {
    const ctx = createActorAnonymizationContext({ firstName: 'Priya', lastName: 'Nair', role: 'parent' });
    expect(ctx.anonymize('Priya wrote in')).toBe('[Parent] wrote in');
    expect(ctx.rehydrate('Hello [Parent]')).toBe('Hello Priya');
  });

  test('falls back to roles[] when the active role is unset', () => {
    const ctx = createActorAnonymizationContext({ firstName: 'Dana', lastName: 'Rivera', roles: ['teacher'] });
    expect(ctx.anonymize('Dana')).toBe('[Teacher]');
  });

  test('no user gives a pattern-only context', () => {
    const ctx = createActorAnonymizationContext(null);
    expect(ctx.nameMap.size).toBe(0);
    expect(ctx.anonymize('mail zoe@school.org')).toBe('mail [email]');
  });
});

describe('the request scope', () => {
  test('is visible across awaits inside the scope and absent outside it', async () => {
    const ctx = createAnonymizationContext(zoe);
    expect(currentOutboundPiiContext()).toBeNull();
    await runWithOutboundPiiContext(ctx, async () => {
      await new Promise((r) => setImmediate(r));
      expect(currentOutboundPiiContext()).toBe(ctx);
    });
    expect(currentOutboundPiiContext()).toBeNull();
  });

  test('the middleware opens it from req.user for everything next() runs', async () => {
    let seen;
    await new Promise((resolve) => {
      outboundPiiScope({ user: zoe }, {}, async () => {
        await new Promise((r) => setImmediate(r));
        seen = currentOutboundPiiContext();
        resolve();
      });
    });
    expect(seen.anonymize('Zoe')).toBe('[Student]');
  });

  test('the middleware never takes the request down', () => {
    const next = jest.fn();
    // A profile whose getters throw is the pathological case.
    const user = { get firstName() { throw new Error('boom'); }, role: 'student' };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => outboundPiiScope({ user }, {}, next)).not.toThrow();
    spy.mockRestore();
    expect(next).toHaveBeenCalled();
  });
});

describe('callLLM under the scope', () => {
  const messages = () => [
    { role: 'system', content: 'You are tutoring Zoe Quill.' },
    { role: 'user', content: 'zoe here, is 7 prime?' },
  ];

  test('strips the student\'s name with no options.anonContext and puts it back in the reply', async () => {
    OpenAI.__create.mockResolvedValue(completionOf('Yes, [Student], 7 is prime.'));
    const ctx = createActorAnonymizationContext(zoe);

    const completion = await runWithOutboundPiiContext(ctx, () => callLLM('gpt-4o-mini', messages(), { max_tokens: 50 }));

    const sent = sentMessages();
    expect(sent[0].content).toBe('You are tutoring [Student].');
    expect(sent[1].content).toBe('[Student] here, is 7 prime?');
    expect(JSON.stringify(sent)).not.toMatch(/zoe|quill/i);
    expect(completion.choices[0].message.content).toBe('Yes, Zoe, 7 is prime.');
  });

  test('a caller-supplied context beats the scope, in both directions', async () => {
    OpenAI.__create.mockResolvedValue(completionOf('[Student] is doing well, [Parent].'));
    const parentScope = createActorAnonymizationContext({ firstName: 'Priya', lastName: 'Nair', role: 'parent' });
    const childCtx = createAnonymizationContext({ firstName: 'Maya', lastName: 'Nair' }, {
      additionalNames: { Priya: '[Parent]' },
      names: { parent: 'Priya' },
    });

    const completion = await runWithOutboundPiiContext(parentScope, () =>
      callLLM('gpt-4o-mini', [{ role: 'user', content: 'Priya asks how Maya is doing' }], { anonContext: childCtx }));

    expect(sentMessages()[0].content).toBe('[Parent] asks how [Student] is doing');
    expect(completion.choices[0].message.content).toBe('Maya is doing well, Priya.');
  });

  test('with no scope and no context, the name is left as-is and the reply untouched', async () => {
    OpenAI.__create.mockResolvedValue(completionOf('Yes Zoe.'));
    const completion = await callLLM('gpt-4o-mini', messages());
    expect(sentMessages()[0].content).toBe('You are tutoring Zoe Quill.');
    expect(completion.choices[0].message.content).toBe('Yes Zoe.');
  });

  test('PII_STRIP_OUTBOUND=false is a full bypass even inside a scope', async () => {
    process.env.PII_STRIP_OUTBOUND = 'false';
    OpenAI.__create.mockResolvedValue(completionOf('[Student]'));
    const ctx = createActorAnonymizationContext(zoe);
    const completion = await runWithOutboundPiiContext(ctx, () => callLLM('gpt-4o-mini', messages()));
    expect(sentMessages()[0].content).toBe('You are tutoring Zoe Quill.');
    expect(completion.choices[0].message.content).toBe('[Student]');
  });
});

describe('callLLMStructured under the scope', () => {
  test('parses JSON whose string values have the name restored', async () => {
    OpenAI.__create.mockResolvedValue(completionOf('{"feedback":"Nice, [Student]!","score":3}'));
    const ctx = createActorAnonymizationContext(zoe);
    const format = { type: 'json_schema', json_schema: { name: 'x', schema: { type: 'object' } } };
    const parsed = await runWithOutboundPiiContext(ctx, () =>
      callLLMStructured('gpt-4o-mini', [{ role: 'user', content: 'Grade Zoe' }], format));
    expect(sentMessages()[0].content).toBe('Grade [Student]');
    expect(parsed).toEqual({ feedback: 'Nice, Zoe!', score: 3 });
  });
});

describe('callLLMStream under the scope', () => {
  test('rehydrates streamed text, including a placeholder split across chunks', async () => {
    OpenAI.__create.mockResolvedValue(chunkStream(['Hi [Stu', 'dent], ', 'try again [Student]']));
    const ctx = createActorAnonymizationContext(zoe);

    const stream = await runWithOutboundPiiContext(ctx, () =>
      callLLMStream('gpt-4o-mini', [{ role: 'user', content: 'Zoe: 2+2?' }]));
    const { text, chunks } = await collect(stream);

    expect(sentMessages()[0].content).toBe('[Student]: 2+2?');
    expect(text).toBe('Hi Zoe, try again Zoe');
    expect(chunks[chunks.length - 1].choices[0].finish_reason).toBe('stop');
  });

  test('a placeholder still pending at the end is flushed onto the final chunk', async () => {
    OpenAI.__create.mockResolvedValue(chunkStream(['Bye [Stud', 'ent]']));
    const ctx = createActorAnonymizationContext(zoe);
    const stream = await runWithOutboundPiiContext(ctx, () => callLLMStream('gpt-4o-mini', [{ role: 'user', content: 'x' }]));
    const { text } = await collect(stream);
    expect(text).toBe('Bye Zoe');
  });

  test('tool-call chunks pass through untouched', async () => {
    const toolChunk = { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'update_board', arguments: '{"a":' } }] }, finish_reason: null }] };
    OpenAI.__create.mockResolvedValue(chunkStream(['ok ', toolChunk], 'tool_calls'));
    const ctx = createActorAnonymizationContext(zoe);
    const stream = await runWithOutboundPiiContext(ctx, () => callLLMStream('gpt-4o-mini', [{ role: 'user', content: 'x' }]));
    const { chunks } = await collect(stream);
    expect(chunks.some((c) => c.choices[0].delta.tool_calls?.[0]?.id === 'c1')).toBe(true);
    expect(chunks[chunks.length - 1].choices[0].finish_reason).toBe('tool_calls');
  });
});

describe('generateEmbedding', () => {
  test('strips the same way before the text reaches the embeddings endpoint', async () => {
    OpenAI.__embeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] });
    const ctx = createActorAnonymizationContext(zoe);
    const vector = await runWithOutboundPiiContext(ctx, () =>
      generateEmbedding('Zoe Quill (zoe@school.org) asked about fractions'));
    expect(vector).toEqual([0.1, 0.2]);
    expect(OpenAI.__embeddingsCreate.mock.calls[0][0].input).toBe('[Student] ([email]) asked about fractions');
  });
});

describe('no provider SDK call outside the two clients', () => {
  // The audit found three ways around the chokepoint, all of them a file
  // holding its own SDK handle. This keeps it at zero.
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..', '..');
  const ALLOWED = new Set(['utils/openaiClient.js', 'utils/anthropicClient.js']);
  const FORBIDDEN = [
    /chat\.completions\.create\(/,
    /embeddings\.create\(/,
    /moderations\.create\(/,
    /new\s+OpenAI\s*\(/,
    /new\s+Anthropic\s*\(/,
    /require\(['"]openai['"]\)/,
    /require\(['"]@anthropic-ai\/sdk['"]\)/,
  ];

  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, out);
      else if (e.name.endsWith('.js')) out.push(full);
    }
    return out;
  };

  test.each(['routes', 'services', 'utils', 'middleware', 'config', 'scripts'])('%s/ reaches providers only through openaiClient', (dir) => {
    const offenders = [];
    for (const file of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      if (ALLOWED.has(rel)) continue;
      const src = fs.readFileSync(file, 'utf8');
      for (const re of FORBIDDEN) {
        if (re.test(src)) offenders.push(`${rel}: ${re}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
