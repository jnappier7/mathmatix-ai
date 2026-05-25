/**
 * xpTagParser — extracts <XP size="..." reason="..." /> ceremony tags
 * from the tutor's reply and strips them from the visible text.
 *
 * Mirrors the test shape of boardTagParser.test.js. The parser is
 * intentionally permissive about what it accepts (size validation
 * happens here, not in a separate guard) — anything malformed gets
 * dropped from the visible text but produces no command.
 */

const { parseXpTags, hasXpTags, VALID_SIZES } = require('../../utils/xpTagParser');

describe('xpTagParser', () => {
  describe('parseXpTags', () => {
    test('null / empty input returns empty commands and original text', () => {
      expect(parseXpTags(null)).toEqual({ cleanedText: '', xpCommands: [] });
      expect(parseXpTags('')).toEqual({ cleanedText: '', xpCommands: [] });
      expect(parseXpTags(undefined)).toEqual({ cleanedText: '', xpCommands: [] });
    });

    test('text with no tags returns the text unchanged + empty commands', () => {
      const result = parseXpTags('Nice work — what comes next?');
      expect(result.cleanedText).toBe('Nice work — what comes next?');
      expect(result.xpCommands).toEqual([]);
    });

    test('self-closing tag with size only', () => {
      const result = parseXpTags('You got it. <XP size="small" />');
      expect(result.xpCommands).toEqual([{ size: 'small' }]);
      expect(result.cleanedText).toBe('You got it.');
    });

    test('self-closing tag with size + reason', () => {
      const result = parseXpTags('Caught it yourself. <XP size="medium" reason="caught your own mistake" />');
      expect(result.xpCommands).toEqual([{ size: 'medium', reason: 'caught your own mistake' }]);
      expect(result.cleanedText).toBe('Caught it yourself.');
    });

    test('single quotes work the same as double quotes', () => {
      const result = parseXpTags("Got it. <XP size='large' reason='breakthrough' />");
      expect(result.xpCommands).toEqual([{ size: 'large', reason: 'breakthrough' }]);
    });

    test('open/close form carries reason via inner body', () => {
      const result = parseXpTags('<XP size="large">first time you saw it</XP>');
      expect(result.xpCommands).toEqual([{ size: 'large', reason: 'first time you saw it' }]);
      expect(result.cleanedText).toBe('');
    });

    test('attribute reason wins over inner body', () => {
      const result = parseXpTags('<XP size="medium" reason="attr wins">inner loses</XP>');
      expect(result.xpCommands).toEqual([{ size: 'medium', reason: 'attr wins' }]);
    });

    test('multiple tags in one response', () => {
      const text = '<XP size="small" /> nice. and then <XP size="large" reason="big one" />';
      const result = parseXpTags(text);
      expect(result.xpCommands).toEqual([
        { size: 'small' },
        { size: 'large', reason: 'big one' },
      ]);
      expect(result.cleanedText).toBe('nice. and then');
    });

    test('unknown size is dropped from text and emits no command', () => {
      const result = parseXpTags('<XP size="huge" reason="invalid size" />');
      expect(result.xpCommands).toEqual([]);
      expect(result.cleanedText).toBe('');
    });

    test('missing size is dropped from text and emits no command', () => {
      const result = parseXpTags('Before <XP reason="no size" /> after');
      expect(result.xpCommands).toEqual([]);
      expect(result.cleanedText).toBe('Before after');
    });

    test('case-insensitive on the tag name + size attribute', () => {
      const result = parseXpTags('<xp Size="MEDIUM" />');
      expect(result.xpCommands).toEqual([{ size: 'medium' }]);
    });

    test('whitespace scars from tag removal are collapsed', () => {
      const result = parseXpTags('hey   <XP size="small" />   keep going');
      expect(result.cleanedText).toBe('hey keep going');
    });

    test('tag at end of message leaves no trailing whitespace', () => {
      const result = parseXpTags('You did it.\n\n<XP size="medium" />');
      expect(result.cleanedText).toBe('You did it.');
    });

    test('a stray "<" in prose is not swallowed by the parser', () => {
      const result = parseXpTags('Compare 3 < 5 — true? <XP size="small" />');
      expect(result.xpCommands).toEqual([{ size: 'small' }]);
      // prose preserved exactly (stray "<" remains in cleaned text)
      expect(result.cleanedText).toContain('3 < 5');
    });

    test('non-string inputs do not throw', () => {
      expect(() => parseXpTags(42)).not.toThrow();
      expect(() => parseXpTags({})).not.toThrow();
      expect(() => parseXpTags([])).not.toThrow();
    });
  });

  describe('hasXpTags', () => {
    test('detects presence', () => {
      expect(hasXpTags('hello <XP size="small" /> world')).toBe(true);
      expect(hasXpTags('<xp size="small" />')).toBe(true);
    });

    test('returns false on plain text', () => {
      expect(hasXpTags('no tags here')).toBe(false);
      expect(hasXpTags('')).toBe(false);
      expect(hasXpTags(null)).toBe(false);
    });
  });

  describe('VALID_SIZES', () => {
    test('exposes the three legal sizes', () => {
      expect(VALID_SIZES.has('small')).toBe(true);
      expect(VALID_SIZES.has('medium')).toBe(true);
      expect(VALID_SIZES.has('large')).toBe(true);
      expect(VALID_SIZES.has('xl')).toBe(false);
    });
  });
});
