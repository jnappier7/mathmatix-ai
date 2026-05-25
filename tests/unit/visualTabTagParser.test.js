/**
 * visualTabTagParser — extracts <GRAPH fn="..." /> and
 * <TILES expression="..." /> tags from the tutor's reply and strips
 * them from the visible text.
 *
 * Distinct from <BOARD action="graph"/> (which drops a card INSIDE
 * the board timeline) — these tags switch the workspace right slot
 * to a focused tool tab for direct manipulation.
 */

const { parseVisualTabTags, hasVisualTabTags } = require('../../utils/visualTabTagParser');

describe('visualTabTagParser', () => {
  describe('parseVisualTabTags', () => {
    test('null / empty input returns empty commands and original text', () => {
      expect(parseVisualTabTags(null)).toEqual({ cleanedText: '', visualTabCommands: [] });
      expect(parseVisualTabTags('')).toEqual({ cleanedText: '', visualTabCommands: [] });
      expect(parseVisualTabTags(undefined)).toEqual({ cleanedText: '', visualTabCommands: [] });
    });

    test('text with no tags returns unchanged + empty commands', () => {
      const result = parseVisualTabTags('Plot it however you like.');
      expect(result.cleanedText).toBe('Plot it however you like.');
      expect(result.visualTabCommands).toEqual([]);
    });

    test('self-closing GRAPH with fn only', () => {
      const result = parseVisualTabTags('Try this: <GRAPH fn="x^2 - 4" />');
      expect(result.visualTabCommands).toEqual([{ tab: 'graph', fn: 'x^2 - 4' }]);
      expect(result.cleanedText).toBe('Try this:');
    });

    test('GRAPH with fn + caption', () => {
      const result = parseVisualTabTags('<GRAPH fn="sin(x)" caption="One full period" />');
      expect(result.visualTabCommands).toEqual([{ tab: 'graph', fn: 'sin(x)', caption: 'One full period' }]);
    });

    test('GRAPH without fn is dropped (no command, tag stripped)', () => {
      const result = parseVisualTabTags('Before <GRAPH caption="no fn" /> after');
      expect(result.visualTabCommands).toEqual([]);
      expect(result.cleanedText).toBe('Before after');
    });

    test('TILES self-closing with expression', () => {
      const result = parseVisualTabTags('<TILES expression="2x + 3" />');
      expect(result.visualTabCommands).toEqual([{ tab: 'tiles', expression: '2x + 3' }]);
      expect(result.cleanedText).toBe('');
    });

    test('TILES bare-open (no attrs) — just launch the workspace', () => {
      const result = parseVisualTabTags('Let\'s use the tiles. <TILES />');
      expect(result.visualTabCommands).toEqual([{ tab: 'tiles' }]);
      expect(result.cleanedText).toBe("Let's use the tiles.");
    });

    test('TILES with no space before slash also works', () => {
      const result = parseVisualTabTags('open them: <TILES/>');
      expect(result.visualTabCommands).toEqual([{ tab: 'tiles' }]);
    });

    test('open/close form for GRAPH carries fn via inner body', () => {
      const result = parseVisualTabTags('<GRAPH>x^3 - 2x</GRAPH>');
      expect(result.visualTabCommands).toEqual([{ tab: 'graph', fn: 'x^3 - 2x' }]);
    });

    test('attribute fn wins over inner body', () => {
      const result = parseVisualTabTags('<GRAPH fn="attr">inner</GRAPH>');
      expect(result.visualTabCommands).toEqual([{ tab: 'graph', fn: 'attr' }]);
    });

    test('single + double quotes both work', () => {
      const result = parseVisualTabTags("<GRAPH fn='sin(x)' />");
      expect(result.visualTabCommands).toEqual([{ tab: 'graph', fn: 'sin(x)' }]);
    });

    test('multiple tags of different types in one response', () => {
      const text = 'first <GRAPH fn="x^2" /> then <TILES />';
      const result = parseVisualTabTags(text);
      expect(result.visualTabCommands).toEqual([
        { tab: 'graph', fn: 'x^2' },
        { tab: 'tiles' },
      ]);
      expect(result.cleanedText).toBe('first then');
    });

    test('case-insensitive on the tag name', () => {
      const result = parseVisualTabTags('<graph fn="x" /> <tiles />');
      expect(result.visualTabCommands).toEqual([
        { tab: 'graph', fn: 'x' },
        { tab: 'tiles' },
      ]);
    });

    test('whitespace scars from removal collapse cleanly', () => {
      const result = parseVisualTabTags('a   <GRAPH fn="x" />   b');
      expect(result.cleanedText).toBe('a b');
    });

    test('stray "<" in prose is not swallowed', () => {
      const result = parseVisualTabTags('When 3 < 5: <GRAPH fn="x" />');
      expect(result.visualTabCommands).toEqual([{ tab: 'graph', fn: 'x' }]);
      expect(result.cleanedText).toContain('3 < 5');
    });

    test('non-string inputs do not throw', () => {
      expect(() => parseVisualTabTags(42)).not.toThrow();
      expect(() => parseVisualTabTags({})).not.toThrow();
      expect(() => parseVisualTabTags([])).not.toThrow();
    });
  });

  describe('hasVisualTabTags', () => {
    test('detects either tag', () => {
      expect(hasVisualTabTags('a <GRAPH fn="x"/>')).toBe(true);
      expect(hasVisualTabTags('a <TILES/>')).toBe(true);
      expect(hasVisualTabTags('<graph fn="x"/>')).toBe(true);
    });

    test('plain text returns false', () => {
      expect(hasVisualTabTags('no tags here')).toBe(false);
      expect(hasVisualTabTags('')).toBe(false);
      expect(hasVisualTabTags(null)).toBe(false);
    });
  });
});
