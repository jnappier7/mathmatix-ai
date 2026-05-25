/**
 * visualTabTagStreamFilter — SSE-safe chunk filter for the
 * <GRAPH> and <TILES> tag pair.
 *
 * Contract: never leak raw tag fragments to visible text. Hold back
 * trailing partial openers (max length of "<GRAPH " or "<TILES "),
 * suppress in-flight tags until their closer, drop unclosed tags
 * at flush.
 */

const { createVisualTabTagStreamFilter } = require('../../utils/visualTabTagStreamFilter');

describe('visualTabTagStreamFilter', () => {
  test('plain text passes through unchanged', () => {
    const f = createVisualTabTagStreamFilter();
    expect(f.push('Hello, ')).toBe('Hello, ');
    expect(f.push('world!')).toBe('world!');
    expect(f.flush()).toBe('');
  });

  test('one-byte drip of a complete GRAPH tag never leaks partials', () => {
    const f = createVisualTabTagStreamFilter();
    const src = 'A <GRAPH fn="x^2" /> B';
    let out = '';
    for (const ch of src) out += f.push(ch);
    out += f.flush();
    expect(out).toBe('A  B');
    expect(out).not.toMatch(/<GRAPH/i);
  });

  test('one-byte drip of a TILES bare-open never leaks', () => {
    const f = createVisualTabTagStreamFilter();
    let out = '';
    for (const ch of 'X <TILES /> Y') out += f.push(ch);
    out += f.flush();
    expect(out).toBe('X  Y');
    expect(out).not.toMatch(/<TILES/i);
  });

  test('partial opener at chunk end is held back', () => {
    const f = createVisualTabTagStreamFilter();
    expect(f.push('see <GR')).toBe('see ');
    // Reveal it was not actually a tag — held tail flushes.
    expect(f.push('eat')).toBe('<GReat');
  });

  test('open <GRAPH ...> with no closer suppresses until closer arrives', () => {
    const f = createVisualTabTagStreamFilter();
    expect(f.push('A <GRAPH fn="x^')).toBe('A ');
    expect(f.push('2 - 4')).toBe('');
    expect(f.push('" />B')).toBe('B');
  });

  test('open/close form for GRAPH also suppresses until </GRAPH>', () => {
    const f = createVisualTabTagStreamFilter();
    expect(f.push('A <GRAPH>sin(x)')).toBe('A ');
    expect(f.push('</GRAPH> B')).toBe(' B');
  });

  test('flush drops an unclosed in-flight tag', () => {
    const f = createVisualTabTagStreamFilter();
    expect(f.push('hi <TILES expression="2x"')).toBe('hi ');
    expect(f.flush()).toBe('');
  });

  test('multiple mixed tags in one chunk are all stripped', () => {
    const f = createVisualTabTagStreamFilter();
    const out = f.push('a <GRAPH fn="x"/> b <TILES /> c');
    expect(out).toBe('a  b  c');
    expect(f.flush()).toBe('');
  });

  test('case-insensitive on the opener and closer', () => {
    const f = createVisualTabTagStreamFilter();
    expect(f.push('<graph fn="x" />')).toBe('');
    expect(f.flush()).toBe('');
    const f2 = createVisualTabTagStreamFilter();
    expect(f2.push('<tiles />')).toBe('');
  });

  test('stray "<" followed by non-tag text passes', () => {
    const f = createVisualTabTagStreamFilter();
    expect(f.push('3 < 5')).toBe('3 < 5');
    expect(f.flush()).toBe('');
  });
});
