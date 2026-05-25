/**
 * xpTagStreamFilter — SSE-safe chunk filter for <XP> tags.
 *
 * Same shape as boardTagStreamFilter.test.js. The contract: never let
 * raw <XP> fragments leak as visible text to the client. Hold back any
 * trailing partial-opener; suppress in-flight tags entirely until the
 * closer arrives; drop unclosed tags at flush time.
 */

const { createXpTagStreamFilter } = require('../../utils/xpTagStreamFilter');

describe('xpTagStreamFilter', () => {
  test('plain text with no tags passes straight through', () => {
    const f = createXpTagStreamFilter();
    expect(f.push('Hello, ')).toBe('Hello, ');
    expect(f.push('world!')).toBe('world!');
    expect(f.flush()).toBe('');
  });

  test('one-byte drip of a complete tag never leaks partials', () => {
    const f = createXpTagStreamFilter();
    const src = 'A <XP size="small" /> B';
    let out = '';
    for (const ch of src) {
      out += f.push(ch);
    }
    out += f.flush();
    expect(out).toBe('A  B');
    expect(out).not.toMatch(/<XP/i);
  });

  test('partial opener at end of chunk is held back', () => {
    const f = createXpTagStreamFilter();
    // "<X" could grow into "<XP " — must be withheld.
    expect(f.push('Hello <X')).toBe('Hello ');
    // Next chunk reveals it was actually NOT a tag — flush should
    // emit the held tail.
    expect(f.push('mas')).toBe('<Xmas');
  });

  test('open <XP …> with no closer suppresses everything until closer arrives', () => {
    const f = createXpTagStreamFilter();
    expect(f.push('Before <XP size="med')).toBe('Before ');
    expect(f.push('ium" reason="nice')).toBe('');
    expect(f.push('" />after')).toBe('after');
  });

  test('open/close form also suppresses until </XP>', () => {
    const f = createXpTagStreamFilter();
    expect(f.push('A <XP size="large">caption')).toBe('A ');
    expect(f.push(' continues')).toBe('');
    expect(f.push('</XP> done')).toBe(' done');
  });

  test('flush drops an unclosed in-flight tag', () => {
    const f = createXpTagStreamFilter();
    expect(f.push('hi <XP size="small"')).toBe('hi ');
    // Stream ends mid-tag — better to lose it than leak it.
    expect(f.flush()).toBe('');
  });

  test('flush emits any safe trailing text not part of a tag', () => {
    const f = createXpTagStreamFilter();
    expect(f.push('done<X')).toBe('done');
    // Stream truly ended — the trailing "<X" is just text now.
    expect(f.flush()).toBe('<X');
  });

  test('a stray "<" followed by non-XP text passes through', () => {
    const f = createXpTagStreamFilter();
    expect(f.push('compare 3 < 5')).toBe('compare 3 < 5');
    expect(f.flush()).toBe('');
  });

  test('multiple tags in one chunk are all stripped', () => {
    const f = createXpTagStreamFilter();
    const out = f.push('a <XP size="small"/> b <XP size="medium" reason="x"/> c');
    expect(out).toBe('a  b  c');
    expect(f.flush()).toBe('');
  });

  test('case-insensitive on the opener and closer', () => {
    const f = createXpTagStreamFilter();
    expect(f.push('<xp size="small" />')).toBe('');
    expect(f.flush()).toBe('');
  });
});
