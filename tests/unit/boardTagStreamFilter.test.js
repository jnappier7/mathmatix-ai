const { createBoardTagStreamFilter } = require('../../utils/boardTagStreamFilter');

describe('boardTagStreamFilter', () => {
  describe('plain text', () => {
    it('flushes tag-free text promptly', () => {
      const f = createBoardTagStreamFilter();
      expect(f.push('Hello, world!')).toBe('Hello, world!');
      expect(f.flush()).toBe('');
    });

    it('handles an empty push', () => {
      const f = createBoardTagStreamFilter();
      expect(f.push('')).toBe('');
      expect(f.push(null)).toBe('');
      expect(f.flush()).toBe('');
    });
  });

  describe('partial-opener holdback', () => {
    it('holds back a trailing "<"', () => {
      const f = createBoardTagStreamFilter();
      const out = f.push('Hello <');
      expect(out).toBe('Hello ');
      // Tail is held until we know what comes next.
      expect(f.push('BOARD action="pose" tex="x=1" />')).toBe('');
      expect(f.flush()).toBe('');
    });

    it('holds back a trailing "<BOAR"', () => {
      const f = createBoardTagStreamFilter();
      expect(f.push('foo <BOAR')).toBe('foo ');
      expect(f.push('D action="pose" tex="x=1" />')).toBe('');
      expect(f.flush()).toBe('');
    });

    it('does NOT hold back random text that ends in "B"', () => {
      const f = createBoardTagStreamFilter();
      expect(f.push('Algebra B')).toBe('Algebra B');
    });

    it('does NOT hold back a stray "<" followed by non-BOARD text', () => {
      const f = createBoardTagStreamFilter();
      // First push keeps the trailing "<" as a potential opener.
      expect(f.push('try <')).toBe('try ');
      // Continuation makes clear it wasn't a BOARD tag.
      expect(f.push('div>')).toBe('<div>');
    });
  });

  describe('one-byte-at-a-time drip', () => {
    it('never flushes a partial <BOARD … /> tag', () => {
      const f = createBoardTagStreamFilter();
      const stream = 'Before tag <BOARD action="pose" tex="2x + 4 = 20" /> After tag';
      let out = '';
      for (const ch of stream) {
        out += f.push(ch);
      }
      out += f.flush();
      expect(out).toBe('Before tag  After tag');
      expect(out).not.toMatch(/<BOARD/);
      expect(out).not.toMatch(/\/>/);
    });

    it('drips with the open/close form', () => {
      const f = createBoardTagStreamFilter();
      const stream = 'a <BOARD action="pose">2x = 4</BOARD> b';
      let out = '';
      for (const ch of stream) {
        out += f.push(ch);
      }
      out += f.flush();
      expect(out).toBe('a  b');
      expect(out).not.toMatch(/<BOARD|<\/BOARD/);
    });

    it('handles "<BOARD" intermixed with arbitrary chunk boundaries', () => {
      const f = createBoardTagStreamFilter();
      const chunks = ['Hi ', '<BOA', 'RD ac', 'tion="', 'pose" tex="x=1"', ' />', ' bye'];
      let out = '';
      for (const c of chunks) out += f.push(c);
      out += f.flush();
      expect(out).toBe('Hi  bye');
    });
  });

  describe('flush', () => {
    it('drains remaining safe text', () => {
      const f = createBoardTagStreamFilter();
      f.push('hello <'); // holds back '<' as potential opener
      expect(f.flush()).toBe('<'); // at end of stream, no more chars can extend it
    });

    it('drops in-flight unclosed tag on flush', () => {
      const f = createBoardTagStreamFilter();
      f.push('before <BOARD action="pose" tex="oops');
      // We are inside an open tag with no closer.
      expect(f.flush()).toBe('');
    });
  });

  describe('multiple tags', () => {
    it('strips all tags from a multi-command response', () => {
      const f = createBoardTagStreamFilter();
      const input = 'A <BOARD action="pose" tex="2x+4=20" /> B <BOARD action="apply" op="subtract 4" /> C';
      const out = f.push(input) + f.flush();
      expect(out).toBe('A  B  C');
    });
  });
});
