const { parseBoardTags, hasBoardTags } = require('../../utils/boardTagParser');

describe('boardTagParser', () => {
  describe('single-tag self-closing forms', () => {
    it('extracts a pose with double-quoted tex', () => {
      const input = 'Let\'s tackle it. <BOARD action="pose" tex="2x + 4 = 20" /> What\'s a good first move?';
      const { cleanedText, boardCommands } = parseBoardTags(input);
      expect(boardCommands).toEqual([{ action: 'pose', tex: '2x + 4 = 20' }]);
      expect(cleanedText).toBe("Let's tackle it. What's a good first move?");
    });

    it('extracts a pose with single-quoted tex', () => {
      const { boardCommands } = parseBoardTags("<BOARD action='pose' tex='x^2 = 9' />");
      expect(boardCommands).toEqual([{ action: 'pose', tex: 'x^2 = 9' }]);
    });

    it('extracts an apply with op', () => {
      const input = '<BOARD action="apply" op="subtract 4 from both sides" />';
      expect(parseBoardTags(input).boardCommands).toEqual([
        { action: 'apply', op: 'subtract 4 from both sides' },
      ]);
    });

    it('extracts a resolve with tex', () => {
      expect(parseBoardTags('<BOARD action="resolve" tex="2x = 16" />').boardCommands)
        .toEqual([{ action: 'resolve', tex: '2x = 16' }]);
    });

    it('extracts a verify with tex and check', () => {
      const input = '<BOARD action="verify" tex="x = 8" check="2(8) + 4 = 20" />';
      expect(parseBoardTags(input).boardCommands).toEqual([
        { action: 'verify', tex: 'x = 8', check: '2(8) + 4 = 20' },
      ]);
    });

    it('extracts a clear (no attributes)', () => {
      expect(parseBoardTags('Time for a fresh one. <BOARD action="clear" /> What problem?').boardCommands)
        .toEqual([{ action: 'clear' }]);
    });

    it('extracts a scaffold with tex carrying boxed blanks', () => {
      const input = 'Try this. <BOARD action="scaffold" tex="x^2 + 4x + \\boxed{} = 12 + \\boxed{}" /> What goes in the boxes?';
      const { cleanedText, boardCommands } = parseBoardTags(input);
      expect(boardCommands).toEqual([
        { action: 'scaffold', tex: 'x^2 + 4x + \\boxed{} = 12 + \\boxed{}' },
      ]);
      expect(cleanedText).toBe('Try this. What goes in the boxes?');
    });

    it('drops a scaffold tag with no tex', () => {
      expect(parseBoardTags('<BOARD action="scaffold" />').boardCommands).toEqual([]);
    });

    it('extracts a graph with fn only', () => {
      const input = '<BOARD action="graph" fn="x^2 - 4" />';
      expect(parseBoardTags(input).boardCommands).toEqual([
        { action: 'graph', fn: 'x^2 - 4' },
      ]);
    });

    it('extracts a graph with fn and caption', () => {
      const input = '<BOARD action="graph" fn="sin(x)" caption="One full period" />';
      expect(parseBoardTags(input).boardCommands).toEqual([
        { action: 'graph', fn: 'sin(x)', caption: 'One full period' },
      ]);
    });

    it('drops a graph with no fn', () => {
      expect(parseBoardTags('<BOARD action="graph" />').boardCommands).toEqual([]);
    });

    it('extracts an image with query only', () => {
      const input = '<BOARD action="image" query="unit circle labeled" />';
      expect(parseBoardTags(input).boardCommands).toEqual([
        { action: 'image', query: 'unit circle labeled' },
      ]);
    });

    it('extracts an image with query and caption', () => {
      const input = '<BOARD action="image" query="zero product property" caption="Reference" />';
      expect(parseBoardTags(input).boardCommands).toEqual([
        { action: 'image', query: 'zero product property', caption: 'Reference' },
      ]);
    });

    it('drops an image with no query', () => {
      expect(parseBoardTags('<BOARD action="image" />').boardCommands).toEqual([]);
    });
  });

  describe('open/close form', () => {
    it('extracts a multi-line tex via inner body', () => {
      const input = `<BOARD action="pose">
        \\frac{x + 1}{x - 2} = 3
      </BOARD>`;
      const { boardCommands } = parseBoardTags(input);
      expect(boardCommands).toHaveLength(1);
      expect(boardCommands[0].action).toBe('pose');
      expect(boardCommands[0].tex).toContain('\\frac{x + 1}{x - 2} = 3');
    });

    it('attribute tex wins over inner body when both present', () => {
      const input = '<BOARD action="pose" tex="from attr">from body</BOARD>';
      expect(parseBoardTags(input).boardCommands).toEqual([
        { action: 'pose', tex: 'from attr' },
      ]);
    });
  });

  describe('multiple tags in one response', () => {
    it('parses the canonical worked-example dialog in order', () => {
      const input = `
        Let's tackle it.
        <BOARD action="pose" tex="2x + 4 = 20" />
        <BOARD action="apply" op="subtract 4 from both sides" />
        <BOARD action="resolve" tex="2x = 16" />
        <BOARD action="verify" tex="x = 8" check="2(8) + 4 = 20" />
        You proved it.
      `;
      const { cleanedText, boardCommands } = parseBoardTags(input);
      expect(boardCommands).toEqual([
        { action: 'pose', tex: '2x + 4 = 20' },
        { action: 'apply', op: 'subtract 4 from both sides' },
        { action: 'resolve', tex: '2x = 16' },
        { action: 'verify', tex: 'x = 8', check: '2(8) + 4 = 20' },
      ]);
      expect(cleanedText).toContain("Let's tackle it.");
      expect(cleanedText).toContain('You proved it.');
      expect(cleanedText).not.toMatch(/<BOARD/);
    });
  });

  describe('malformed tags', () => {
    it('drops a tag with no closer', () => {
      const input = 'Foo <BOARD action="pose" tex="2x = 4 bar';
      const { boardCommands } = parseBoardTags(input);
      // No `/>` or `</BOARD>` — the regex shouldn't match it.
      expect(boardCommands).toEqual([]);
    });

    it('drops a tag with no equals sign in attributes', () => {
      const { boardCommands } = parseBoardTags('<BOARD action pose />');
      expect(boardCommands).toEqual([]);
    });

    it('drops a tag with an unknown action', () => {
      const { boardCommands } = parseBoardTags('<BOARD action="banana" tex="x=1" />');
      expect(boardCommands).toEqual([]);
    });

    it('drops a pose with no tex', () => {
      expect(parseBoardTags('<BOARD action="pose" />').boardCommands).toEqual([]);
    });

    it('drops an apply with no op', () => {
      expect(parseBoardTags('<BOARD action="apply" />').boardCommands).toEqual([]);
    });

    it('strips a tag with an unknown action from visible text', () => {
      const { cleanedText } = parseBoardTags('Before <BOARD action="banana" /> After');
      expect(cleanedText).not.toMatch(/<BOARD/);
      expect(cleanedText).toContain('Before');
      expect(cleanedText).toContain('After');
    });
  });

  describe('plain text', () => {
    it('returns text unchanged when no tags present', () => {
      const input = 'Just a regular tutor reply. No tags at all.';
      const { cleanedText, boardCommands } = parseBoardTags(input);
      expect(cleanedText).toBe(input);
      expect(boardCommands).toEqual([]);
    });

    it('handles empty input', () => {
      const { cleanedText, boardCommands } = parseBoardTags('');
      expect(cleanedText).toBe('');
      expect(boardCommands).toEqual([]);
    });

    it('handles null input', () => {
      const { cleanedText, boardCommands } = parseBoardTags(null);
      expect(cleanedText).toBe('');
      expect(boardCommands).toEqual([]);
    });
  });

  describe('hasBoardTags', () => {
    it('returns true when a tag is present', () => {
      expect(hasBoardTags('<BOARD action="pose" tex="x=1"/>')).toBe(true);
    });
    it('returns false when only the word BOARD appears', () => {
      expect(hasBoardTags('Welcome to the board')).toBe(false);
    });
    it('returns false on empty input', () => {
      expect(hasBoardTags('')).toBe(false);
      expect(hasBoardTags(null)).toBe(false);
    });
  });
});
