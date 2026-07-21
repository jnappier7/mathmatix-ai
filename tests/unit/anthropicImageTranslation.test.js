/**
 * OpenAI -> Claude message translation, specifically image content blocks.
 *
 * PRODUCTION BUG THIS PINS: splitSystemAndMessages had
 *     const content = typeof m.content === 'string' ? m.content : m.content;
 * — a no-op ternary, so array content passed through untranslated. OpenAI's
 * { type: 'image_url' } blocks reached Claude verbatim and the API rejected the
 * entire request:
 *     400 messages.66.content.1: Input tag 'image_url' found using 'type' does
 *     not match any of the expected tags: ... 'image' ...
 * Once a photo entered a conversation's history this fired on EVERY subsequent
 * turn — the streaming call 400'd, silently fell back to non-streaming, and the
 * session lost streaming plus paid for a wasted call per message.
 */

const { splitSystemAndMessages } = require('../../utils/anthropicClient');

const dataUrl = 'data:image/jpeg;base64,QUJD';
const userWithImage = (url = dataUrl) => ({
  role: 'user',
  content: [
    { type: 'text', text: 'check my work' },
    { type: 'image_url', image_url: { url } }
  ]
});

describe('image blocks are translated to Claude shape', () => {
  test('a base64 data URL becomes a base64 image source', () => {
    const { messages } = splitSystemAndMessages([userWithImage()]);
    const blocks = messages[0].content;
    expect(blocks[0]).toEqual({ type: 'text', text: 'check my work' });
    expect(blocks[1]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' }
    });
  });

  test('no image_url tag survives translation — the exact 400 trigger', () => {
    const { messages } = splitSystemAndMessages([userWithImage()]);
    expect(JSON.stringify(messages)).not.toContain('image_url');
  });

  test('an http(s) URL becomes a url image source', () => {
    const { messages } = splitSystemAndMessages([userWithImage('https://cdn.example.com/a.png')]);
    expect(messages[0].content[1]).toEqual({
      type: 'image',
      source: { type: 'url', url: 'https://cdn.example.com/a.png' }
    });
  });

  test('media type is carried through, not assumed', () => {
    const { messages } = splitSystemAndMessages([userWithImage('data:image/png;base64,WFla')]);
    expect(messages[0].content[1].source.media_type).toBe('image/png');
  });
});

describe('unusable attachments degrade instead of failing the request', () => {
  test('a blob: url is dropped, the text survives', () => {
    const { messages } = splitSystemAndMessages([userWithImage('blob:http://localhost/abc')]);
    expect(messages[0].content).toEqual([{ type: 'text', text: 'check my work' }]);
  });

  test('a message that was ONLY an unusable image does not become empty', () => {
    // Claude rejects an empty content array, which would trade one broken turn
    // for a different broken turn. The placeholder's exact text is the
    // implementation's choice (currently a single space) — what must hold is
    // that the turn keeps its slot and is not an empty array.
    const { messages } = splitSystemAndMessages([
      { role: 'user', content: [{ type: 'image_url', image_url: { url: 'blob:x' } }] }
    ]);
    const content = messages[0].content;
    expect(Array.isArray(content) && content.length === 0).toBe(false);
    expect(content).toBeTruthy();
  });

  test('a malformed image block is dropped rather than passed through', () => {
    const { messages } = splitSystemAndMessages([
      { role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'image_url' }] }
    ]);
    expect(messages[0].content).toEqual([{ type: 'text', text: 'hi' }]);
  });
});

describe('existing behaviour is preserved', () => {
  test('plain string content is untouched', () => {
    const { messages } = splitSystemAndMessages([{ role: 'user', content: 'hello' }]);
    expect(messages[0].content).toBe('hello');
  });

  test('system messages are still hoisted out', () => {
    const { system, messages } = splitSystemAndMessages([
      { role: 'system', content: 'you are a tutor' },
      { role: 'user', content: 'hi' }
    ]);
    expect(system).toBe('you are a tutor');
    expect(messages).toHaveLength(1);
  });

  test('non-image content blocks pass through unchanged', () => {
    const { messages } = splitSystemAndMessages([
      { role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }
    ]);
    expect(messages[0].content).toEqual([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]);
  });

  test('consecutive string turns still merge, and image turns are not merged into strings', () => {
    const { messages } = splitSystemAndMessages([
      { role: 'user', content: 'one' },
      { role: 'user', content: 'two' },
      userWithImage()
    ]);
    expect(messages[0].content).toBe('one\n\ntwo');
    expect(Array.isArray(messages[1].content)).toBe(true);
  });

  test('the first message is still forced to be a user turn', () => {
    const { messages } = splitSystemAndMessages([{ role: 'assistant', content: 'hi' }]);
    expect(messages[0].role).toBe('user');
  });
});
