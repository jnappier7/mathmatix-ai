// utils/toolCallStream.js
//
// One place to reassemble tool calls from a streamed completion.
//
// Providers ship tool calls as fragments: the id arrives on one delta, the
// function name on another, and `arguments` in JSON slices that are only valid
// once concatenated. Every streaming caller therefore needs the same
// index-keyed accumulator, and each hand-rolled copy is a chance to drop the
// `index == null` guard or to overwrite a name instead of appending arguments —
// failures that surface as "the model called a tool and nothing happened".
//
// The Claude adapter (utils/anthropicClient.js) already normalises its
// `input_json_delta` events into this OpenAI `delta.tool_calls` shape, so this
// works unchanged on both providers.

/**
 * Create an accumulator for one streamed completion.
 *
 * Usage:
 *   const acc = createToolCallAccumulator();
 *   for await (const chunk of stream) acc.push(chunk.choices[0]?.delta);
 *   const calls = acc.toolCalls();          // [] when the turn used no tools
 *
 * @returns {{ push(delta): void, toolCalls(): Array, size(): number }}
 */
function createToolCallAccumulator() {
  // index → { id, type, function: { name, arguments } }
  const byIndex = new Map();

  return {
    /**
     * Feed one delta. Safe to call with undefined/null or a text-only delta.
     */
    push(delta) {
      const calls = delta && delta.tool_calls;
      if (!Array.isArray(calls)) return;
      for (const tc of calls) {
        const idx = tc?.index;
        // Without an index there is no way to know which call a fragment
        // belongs to; guessing would splice two calls' arguments together.
        if (idx == null) continue;
        const existing = byIndex.get(idx) || {
          id: null,
          type: 'function',
          function: { name: '', arguments: '' },
        };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.function.name = tc.function.name;
        // Arguments are JSON split across deltas — append, never replace.
        if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
        byIndex.set(idx, existing);
      }
    },

    /**
     * The assembled calls, in provider index order.
     * Calls that never received a name are dropped: they cannot be dispatched,
     * and passing them on would only surface as a downstream "unknown tool".
     */
    toolCalls() {
      return [...byIndex.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, call]) => call)
        .filter((call) => call.function.name);
    },

    size() {
      return byIndex.size;
    },
  };
}

module.exports = { createToolCallAccumulator };
