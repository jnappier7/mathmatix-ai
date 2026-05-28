/**
 * structuredChatStreamExtractor — incrementally pulls
 * `chat_message` out of an OpenAI structured-output stream.
 *
 * Covers:
 *   - happy path with a single delta
 *   - happy path with fine-grained fragmented deltas
 *   - JSON escape sequences (quote, backslash, newline, tab,
 *     forward slash, unicode \uXXXX)
 *   - escapes that span chunk boundaries
 *   - whitespace tolerance around the colon
 *   - field order: board_commands first, chat_message second
 *   - graceful failure on truncated / malformed JSON
 *   - finalize returns the parsed object for downstream
 *     normalization
 */

const { createStructuredChatStreamExtractor } = require('../../utils/structuredChatStreamExtractor');

function feedAll(extractor, deltas) {
  let out = '';
  for (const d of deltas) out += extractor.push(d);
  return out;
}

describe('structuredChatStreamExtractor — happy path', () => {
  test('extracts chat_message from a single delta', () => {
    const x = createStructuredChatStreamExtractor();
    const out = x.push('{"chat_message":"Let\'s tackle it","board_commands":[]}');
    expect(out).toBe("Let's tackle it");
    expect(x.finalize()).toEqual({
      chat_message: "Let's tackle it",
      board_commands: [],
    });
  });

  test('extracts chat_message from many tiny deltas (token-shaped)', () => {
    const x = createStructuredChatStreamExtractor();
    const deltas = ['{"', 'chat', '_message', '":"', 'Let', "'s ", 'tackle ', 'it', '","board_commands":[]}'];
    const out = feedAll(x, deltas);
    expect(out).toBe("Let's tackle it");
  });

  test('returns chat text incrementally as deltas arrive', () => {
    const x = createStructuredChatStreamExtractor();
    expect(x.push('{"chat_message":"Hello')).toBe('Hello');
    expect(x.push(', ')).toBe(', ');
    expect(x.push('world!')).toBe('world!');
    expect(x.push('","board_commands":[]}')).toBe('');
  });

  test('returns empty string on push before the marker arrives', () => {
    const x = createStructuredChatStreamExtractor();
    expect(x.push('{"some_other_field":null,')).toBe('');
    expect(x.push('"chat_message":"hi","board_commands":[]}')).toBe('hi');
  });
});

describe('structuredChatStreamExtractor — JSON escapes', () => {
  test('decodes \\" (escaped quote)', () => {
    const x = createStructuredChatStreamExtractor();
    const out = x.push('{"chat_message":"She said \\"hi\\"","board_commands":[]}');
    expect(out).toBe('She said "hi"');
  });

  test('decodes \\n (newline)', () => {
    const x = createStructuredChatStreamExtractor();
    const out = x.push('{"chat_message":"line1\\nline2","board_commands":[]}');
    expect(out).toBe('line1\nline2');
  });

  test('decodes \\t and \\r', () => {
    const x = createStructuredChatStreamExtractor();
    expect(x.push('{"chat_message":"a\\tb\\rc","board_commands":[]}')).toBe('a\tb\rc');
  });

  test('decodes \\\\ (escaped backslash)', () => {
    const x = createStructuredChatStreamExtractor();
    expect(x.push('{"chat_message":"path\\\\to\\\\file","board_commands":[]}')).toBe('path\\to\\file');
  });

  test('decodes \\/ (escaped forward slash — legal JSON though uncommon)', () => {
    const x = createStructuredChatStreamExtractor();
    expect(x.push('{"chat_message":"a\\/b","board_commands":[]}')).toBe('a/b');
  });

  test('decodes \\uXXXX (unicode escape)', () => {
    // é is é
    const x = createStructuredChatStreamExtractor();
    expect(x.push('{"chat_message":"caf\\u00e9","board_commands":[]}')).toBe('café');
  });

  test('waits for the full \\uXXXX sequence to arrive', () => {
    const x = createStructuredChatStreamExtractor();
    let out = x.push('{"chat_message":"caf\\u00');
    // The escape is incomplete — the extractor must hold back
    // rather than emit garbage. Output so far is just "caf".
    expect(out).toBe('caf');
    out = x.push('e9","board_commands":[]}');
    expect(out).toBe('é');
  });

  test('handles a lone backslash split across two deltas', () => {
    const x = createStructuredChatStreamExtractor();
    let out = x.push('{"chat_message":"hi\\');
    // Backslash without next char — extractor waits.
    expect(out).toBe('hi');
    out = x.push('n there","board_commands":[]}');
    // \n decodes to newline; the space and "there" are literal.
    expect(out).toBe('\n there');
  });
});

describe('structuredChatStreamExtractor — whitespace and ordering', () => {
  test('tolerates whitespace around the colon', () => {
    const x = createStructuredChatStreamExtractor();
    const out = x.push('{\n  "chat_message" : "hello",\n  "board_commands": []\n}');
    expect(out).toBe('hello');
  });

  test('extracts even when board_commands appears first in the body', () => {
    // OpenAI strict-mode emission usually follows declared schema
    // order, but field order in JSON is not significant — the
    // extractor must find the key by name regardless of position.
    const x = createStructuredChatStreamExtractor();
    const out = x.push('{"board_commands":[],"chat_message":"second!"}');
    expect(out).toBe('second!');
  });
});

describe('structuredChatStreamExtractor — finalize', () => {
  test('returns the parsed JSON object on success', () => {
    const x = createStructuredChatStreamExtractor();
    x.push('{"chat_message":"ok","board_commands":[{"action":"pose","tex":"x=1","op":null,"check":null,"fn":null,"query":null,"caption":null}]}');
    const parsed = x.finalize();
    expect(parsed.chat_message).toBe('ok');
    expect(parsed.board_commands).toHaveLength(1);
    expect(parsed.board_commands[0].action).toBe('pose');
  });

  test('returns null when the JSON is truncated', () => {
    const x = createStructuredChatStreamExtractor();
    x.push('{"chat_message":"this never finishes');
    expect(x.finalize()).toBeNull();
  });

  test('returns null when the JSON is syntactically broken', () => {
    const x = createStructuredChatStreamExtractor();
    x.push('this is not JSON at all');
    expect(x.finalize()).toBeNull();
  });
});

describe('structuredChatStreamExtractor — defensive behavior', () => {
  test('push of empty string returns empty', () => {
    const x = createStructuredChatStreamExtractor();
    expect(x.push('')).toBe('');
  });

  test('push of non-string returns empty', () => {
    const x = createStructuredChatStreamExtractor();
    expect(x.push(null)).toBe('');
    expect(x.push(undefined)).toBe('');
    expect(x.push(42)).toBe('');
  });

  test('malformed unicode escape transitions to POST_CHAT cleanly', () => {
    // \uGGGG is invalid (not hex). Extractor should stop emitting
    // chat content rather than produce garbage; finalize will then
    // return null and the caller can fall back.
    const x = createStructuredChatStreamExtractor();
    const out = x.push('{"chat_message":"hi\\uGGGG","board_commands":[]}');
    expect(out).toBe('hi');
    expect(x.finalize()).toBeNull();
  });

  test('long PRE_CHAT prefix does not balloon scanIdx unboundedly', () => {
    // Defensive: feed a lot of unrelated chars before the marker
    // arrives, then confirm the marker is still found.
    const x = createStructuredChatStreamExtractor();
    const prefix = '{' + '"a":"' + 'x'.repeat(2000) + '",';
    expect(x.push(prefix)).toBe('');
    expect(x.push('"chat_message":"yay","board_commands":[]}')).toBe('yay');
  });
});
