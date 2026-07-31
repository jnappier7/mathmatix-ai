/**
 * The shared streaming tool-call accumulator.
 *
 * Providers ship tool calls as fragments — id on one delta, name on another,
 * `arguments` in JSON slices only valid once concatenated. Every streaming
 * caller needs the same reassembly, and each hand-rolled copy is a chance to
 * drop the `index == null` guard or replace arguments instead of appending.
 * Those failures look identical from outside: the model called a tool and
 * nothing happened.
 *
 * The text path (pipeline/generate.js) and the streaming voice path
 * (voiceSession.js) both run through this, so it is pinned here once.
 */

const { createToolCallAccumulator } = require('../../utils/toolCallStream');

/** Chop a JSON argument string into fragments the way a provider would. */
function fragment(str, size = 5) {
  const out = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out;
}

describe('createToolCallAccumulator', () => {
  test('reassembles one call split across many deltas', () => {
    const args = JSON.stringify({ query: 'dodecahedron', category: 'geometry' });
    const acc = createToolCallAccumulator();

    acc.push({ tool_calls: [{ index: 0, id: 'call_1', function: { name: 'search_educational_image' } }] });
    for (const piece of fragment(args)) {
      acc.push({ tool_calls: [{ index: 0, function: { arguments: piece } }] });
    }

    const calls = acc.toolCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe('call_1');
    expect(calls[0].function.name).toBe('search_educational_image');
    // The whole point: arguments must be APPENDED, so this still parses.
    expect(JSON.parse(calls[0].function.arguments)).toEqual({
      query: 'dodecahedron',
      category: 'geometry',
    });
  });

  test('keeps parallel calls separate and in index order', () => {
    const acc = createToolCallAccumulator();
    // Interleaved, as parallel_tool_calls actually arrives.
    acc.push({ tool_calls: [{ index: 1, id: 'b', function: { name: 'render_function_graph' } }] });
    acc.push({ tool_calls: [{ index: 0, id: 'a', function: { name: 'search_educational_image' } }] });
    acc.push({ tool_calls: [{ index: 1, function: { arguments: '{"function":' } }] });
    acc.push({ tool_calls: [{ index: 0, function: { arguments: '{"query":' } }] });
    acc.push({ tool_calls: [{ index: 1, function: { arguments: '"x^2"}' } }] });
    acc.push({ tool_calls: [{ index: 0, function: { arguments: '"cube"}' } }] });

    const calls = acc.toolCalls();
    expect(calls.map((c) => c.id)).toEqual(['a', 'b']);
    expect(JSON.parse(calls[0].function.arguments)).toEqual({ query: 'cube' });
    expect(JSON.parse(calls[1].function.arguments)).toEqual({ function: 'x^2' });
  });

  test('text-only and empty deltas are ignored', () => {
    const acc = createToolCallAccumulator();
    acc.push({ content: 'A dodecahedron has 12 faces.' });
    acc.push({});
    acc.push(undefined);
    acc.push(null);
    expect(acc.size()).toBe(0);
    expect(acc.toolCalls()).toEqual([]);
  });

  test('a fragment with no index is dropped, not merged into another call', () => {
    // Merging it would splice two calls' arguments into one unparseable blob.
    const acc = createToolCallAccumulator();
    acc.push({ tool_calls: [{ index: 0, id: 'a', function: { name: 'render_fraction', arguments: '{"numerator":1,' } }] });
    acc.push({ tool_calls: [{ function: { arguments: 'GARBAGE' } }] });
    acc.push({ tool_calls: [{ index: 0, function: { arguments: '"denominator":2}' } }] });

    const calls = acc.toolCalls();
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].function.arguments)).toEqual({ numerator: 1, denominator: 2 });
  });

  test('a call that never got a name is dropped', () => {
    // Undispatchable — passing it on only surfaces as "unknown tool" later.
    const acc = createToolCallAccumulator();
    acc.push({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] });
    expect(acc.size()).toBe(1);
    expect(acc.toolCalls()).toEqual([]);
  });

  test('a turn that used no tools yields an empty list', () => {
    const acc = createToolCallAccumulator();
    acc.push({ content: 'hello' });
    expect(acc.toolCalls()).toEqual([]);
  });
});
