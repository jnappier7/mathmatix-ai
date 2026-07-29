// Unit tests for the Anthropic adapter's tool-calling translation.
// Pure helpers only — no live API. Before this translation existed,
// options.tools was silently dropped on the Claude path, making tool
// calling a no-op whenever TUTOR_MODEL pointed at Claude.

const a = require('../../utils/anthropicClient');

const OPENAI_TOOL = {
  type: 'function',
  function: {
    name: 'update_board',
    description: 'Render cards on the WorkBoard.',
    parameters: {
      type: 'object',
      properties: {
        commands: { type: 'array', items: { type: 'object' }, minItems: 1 },
      },
      required: ['commands'],
    },
  },
};

describe('toClaudeTools', () => {
  test('maps OpenAI function tools to Claude tool shape', () => {
    const out = a.toClaudeTools([OPENAI_TOOL]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('update_board');
    expect(out[0].description).toBe('Render cards on the WorkBoard.');
    expect(out[0].input_schema.type).toBe('object');
    expect(out[0].input_schema.required).toEqual(['commands']);
  });

  test('sanitizes unsupported schema keywords (minItems etc.)', () => {
    const out = a.toClaudeTools([OPENAI_TOOL]);
    expect(out[0].input_schema.properties.commands.minItems).toBeUndefined();
  });

  test('returns null for empty/invalid input', () => {
    expect(a.toClaudeTools(undefined)).toBeNull();
    expect(a.toClaudeTools([])).toBeNull();
    expect(a.toClaudeTools([{ type: 'other' }])).toBeNull();
  });
});

describe('toClaudeToolChoice', () => {
  test('maps the OpenAI vocabulary', () => {
    expect(a.toClaudeToolChoice('auto')).toEqual({ type: 'auto' });
    expect(a.toClaudeToolChoice(undefined)).toEqual({ type: 'auto' });
    expect(a.toClaudeToolChoice('required')).toEqual({ type: 'any' });
    expect(a.toClaudeToolChoice('none')).toEqual({ type: 'none' });
    expect(a.toClaudeToolChoice({ type: 'function', function: { name: 'update_board' } }))
      .toEqual({ type: 'tool', name: 'update_board' });
  });

  test('parallel_tool_calls:false becomes disable_parallel_tool_use', () => {
    expect(a.toClaudeToolChoice('auto', false)).toEqual({ type: 'auto', disable_parallel_tool_use: true });
    expect(a.toClaudeToolChoice('auto', true)).toEqual({ type: 'auto' });
  });
});

describe('extractToolCalls', () => {
  test('maps tool_use blocks to OpenAI tool_calls with JSON-string arguments', () => {
    const calls = a.extractToolCalls([
      { type: 'text', text: 'Let me put that on the board.' },
      { type: 'tool_use', id: 'toolu_1', name: 'update_board', input: { commands: [{ action: 'pose', tex: 'x=1' }] } },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      id: 'toolu_1',
      type: 'function',
      function: { name: 'update_board', arguments: JSON.stringify({ commands: [{ action: 'pose', tex: 'x=1' }] }) },
    });
  });

  test('returns null when there are no tool_use blocks', () => {
    expect(a.extractToolCalls([{ type: 'text', text: 'hi' }])).toBeNull();
    expect(a.extractToolCalls([])).toBeNull();
  });
});

describe('splitSystemAndMessages — tool round-trip turns', () => {
  test('assistant tool_calls + tool results translate to tool_use / tool_result blocks', () => {
    const { messages } = a.splitSystemAndMessages([
      { role: 'user', content: 'show me' },
      {
        role: 'assistant',
        content: 'On the board:',
        tool_calls: [
          { id: 'toolu_1', type: 'function', function: { name: 'update_board', arguments: '{"commands":[]}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'toolu_1', content: '{"status":"rendered"}' },
    ]);

    expect(messages).toHaveLength(3);
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toEqual([
      { type: 'text', text: 'On the board:' },
      { type: 'tool_use', id: 'toolu_1', name: 'update_board', input: { commands: [] } },
    ]);
    expect(messages[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"status":"rendered"}' }],
    });
  });

  test('assistant turn with tool_calls and empty content gets no empty text block', () => {
    const { messages } = a.splitSystemAndMessages([
      { role: 'user', content: 'go' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 't1', type: 'function', function: { name: 'update_board', arguments: '{}' } }],
      },
    ]);
    expect(messages[1].content).toEqual([
      { type: 'tool_use', id: 't1', name: 'update_board', input: {} },
    ]);
  });

  test('consecutive tool-result turns merge into one user turn', () => {
    const { messages } = a.splitSystemAndMessages([
      { role: 'user', content: 'go' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 't1', type: 'function', function: { name: 'a', arguments: '{}' } },
          { id: 't2', type: 'function', function: { name: 'b', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 't1', content: 'ok' },
      { role: 'tool', tool_call_id: 't2', content: 'ok' },
    ]);
    expect(messages).toHaveLength(3);
    expect(messages[2].role).toBe('user');
    expect(messages[2].content.map((b) => b.type)).toEqual(['tool_result', 'tool_result']);
  });
});

describe('openAiChunksFromClaudeEvents', () => {
  async function* events(list) {
    for (const e of list) yield e;
  }
  async function collect(iter) {
    const out = [];
    for await (const c of iter) out.push(c);
    return out;
  }

  test('maps text deltas and terminal stop reason', async () => {
    const chunks = await collect(a.openAiChunksFromClaudeEvents(events([
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    ])));
    expect(chunks.map((c) => c.choices[0].delta.content)).toEqual(['Hel', 'lo', undefined]);
    expect(chunks[2].choices[0].finish_reason).toBe('stop');
  });

  test('maps tool_use start + input_json_delta into accumulatable delta.tool_calls', async () => {
    const chunks = await collect(a.openAiChunksFromClaudeEvents(events([
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Board time. ' } },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_9', name: 'update_board' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"comm' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'ands":[]}' } },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    ])));

    // Reassemble exactly the way generate.js's accumulator does.
    const acc = new Map();
    let finish = null;
    for (const chunk of chunks) {
      const delta = chunk.choices[0].delta || {};
      if (chunk.choices[0].finish_reason) finish = chunk.choices[0].finish_reason;
      for (const tc of delta.tool_calls || []) {
        const existing = acc.get(tc.index) || { id: null, type: 'function', function: { name: '', arguments: '' } };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.function.name = tc.function.name;
        if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
        acc.set(tc.index, existing);
      }
    }

    expect(finish).toBe('tool_calls');
    expect(acc.size).toBe(1);
    const call = acc.get(0);
    expect(call.id).toBe('toolu_9');
    expect(call.function.name).toBe('update_board');
    expect(JSON.parse(call.function.arguments)).toEqual({ commands: [] });
  });

  test('two parallel tool_use blocks get distinct ordinal indexes', async () => {
    const chunks = await collect(a.openAiChunksFromClaudeEvents(events([
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tA', name: 'update_board' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tB', name: 'render_function_graph' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"function":"x^2"}' } },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    ])));
    const toolChunks = chunks.filter((c) => c.choices[0].delta.tool_calls);
    const indexes = new Set(toolChunks.map((c) => c.choices[0].delta.tool_calls[0].index));
    expect(indexes).toEqual(new Set([0, 1]));
  });
});
