const { parseBoardJsonCommands, scanJsonObjects } = require('../../utils/boardJsonParser');

describe('boardJsonParser', () => {
  describe('recovery of well-formed commands', () => {
    it('recovers a verify command and strips it from text', () => {
      const input = 'Great work! {"action":"verify","tex":"h = 3","check":"5 \\times 4 \\times 3 = 60"} Want another?';
      const { cleanedText, boardCommands } = parseBoardJsonCommands(input);
      expect(boardCommands).toEqual([
        { action: 'verify', tex: 'h = 3', check: '5 \\times 4 \\times 3 = 60' },
      ]);
      expect(cleanedText).toBe('Great work! Want another?');
    });

    it('recovers a pose', () => {
      expect(parseBoardJsonCommands('Try {"action":"pose","tex":"2x+4=20"} now').boardCommands)
        .toEqual([{ action: 'pose', tex: '2x+4=20' }]);
    });

    it('recovers an apply with op', () => {
      expect(parseBoardJsonCommands('{"action":"apply","op":"subtract 4 from both sides"}').boardCommands)
        .toEqual([{ action: 'apply', op: 'subtract 4 from both sides' }]);
    });

    it('recovers a clear with no fields', () => {
      expect(parseBoardJsonCommands('Fresh start {"action":"clear"} ok').boardCommands)
        .toEqual([{ action: 'clear' }]);
    });

    it('recovers multiple commands in one message', () => {
      const input = 'a {"action":"pose","tex":"x"} b {"action":"resolve","tex":"x=1"} c';
      const { cleanedText, boardCommands } = parseBoardJsonCommands(input);
      expect(boardCommands).toEqual([
        { action: 'pose', tex: 'x' },
        { action: 'resolve', tex: 'x=1' },
      ]);
      expect(cleanedText).toBe('a b c');
    });
  });

  describe('LaTeX brace + backslash handling (the reason for the scanner)', () => {
    it('handles LaTeX braces inside the tex string', () => {
      const input = 'See {"action":"pose","tex":"\\frac{1}{2} + \\boxed{x}"} here';
      const { cleanedText, boardCommands } = parseBoardJsonCommands(input);
      expect(boardCommands).toEqual([{ action: 'pose', tex: '\\frac{1}{2} + \\boxed{x}' }]);
      expect(cleanedText).toBe('See here');
    });

    it('preserves single-backslash LaTeX commands', () => {
      const { boardCommands } = parseBoardJsonCommands('{"action":"resolve","tex":"x = \\sqrt{2}"}');
      expect(boardCommands[0].tex).toBe('x = \\sqrt{2}');
    });

    it('unescapes \\\\ and \\" but keeps LaTeX intact', () => {
      // JSON-valid double-backslash should collapse to a single backslash.
      const { boardCommands } = parseBoardJsonCommands('{"action":"pose","tex":"\\\\alpha + \\"q\\""}');
      expect(boardCommands[0].tex).toBe('\\alpha + "q"');
    });
  });

  describe('safety — leaves non-board content alone', () => {
    it('ignores JSON without a board action', () => {
      const input = 'Config {"color":"red","size":3} stays.';
      const r = parseBoardJsonCommands(input);
      expect(r.boardCommands).toEqual([]);
      expect(r.cleanedText).toBe(input);
    });

    it('ignores plain prose and math', () => {
      const input = 'The domain is [0, 5] and \\frac{1}{2} is a half.';
      const r = parseBoardJsonCommands(input);
      expect(r.boardCommands).toEqual([]);
      expect(r.cleanedText).toBe(input);
    });

    it('strips a malformed board command (missing required field) without emitting it', () => {
      const input = 'oops {"action":"pose"} here';
      const r = parseBoardJsonCommands(input);
      expect(r.boardCommands).toEqual([]);      // not emitted (no tex)
      expect(r.cleanedText).toBe('oops here');  // but stripped so it can't leak
    });

    it('does not choke on an unbalanced trailing brace', () => {
      const input = 'text {"action":"pose","tex":"x"'; // no closing brace
      const r = parseBoardJsonCommands(input);
      expect(r.boardCommands).toEqual([]);
      expect(r.cleanedText).toBe(input);
    });
  });

  describe('scanJsonObjects', () => {
    it('balances string-nested braces correctly', () => {
      const objs = scanJsonObjects('{"tex":"a{b}c"} tail');
      expect(objs).toHaveLength(1);
      expect(objs[0].raw).toBe('{"tex":"a{b}c"}');
    });
  });
});
