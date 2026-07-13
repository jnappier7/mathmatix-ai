const { stripInternalTags, hasInternalTags } = require('../../utils/internalTagSanitizer');

describe('internalTagSanitizer', () => {
  describe('ANSWER_PRE_CHECK leak (the reported bug)', () => {
    it('strips an echoed pre-check tag from the start of a reply', () => {
      const input = '[ANSWER_PRE_CHECK: VERIFIED CORRECT. The student\'s answer "3" matches "3". Confirm immediately.] Yes! 3 cm is exactly right, Jason.';
      expect(stripInternalTags(input)).toBe('Yes! 3 cm is exactly right, Jason.');
    });

    it('strips the VERIFIED INCORRECT variant', () => {
      const input = 'Hmm. [ANSWER_PRE_CHECK: VERIFIED INCORRECT. The student answered "5".] Let\'s look again.';
      expect(stripInternalTags(input)).toBe('Hmm. Let\'s look again.');
    });

    it('strips a check-my-work injected note', () => {
      const input = '[CHECK MY WORK — INDEPENDENTLY VERIFIED CORRECT: A separate check confirms the work.] Nice job!';
      expect(stripInternalTags(input)).toBe('Nice job!');
    });

    it('is case-insensitive on the tag name', () => {
      expect(stripInternalTags('[answer_pre_check: verified correct] ok')).toBe('ok');
    });
  });

  describe('stray board-command JSON leak', () => {
    it('strips a verify command emitted as JSON instead of a <BOARD> tag', () => {
      const input = 'Great work! {"action":"verify","tex":"h = 3 , cm","check":"5 \\\\times 4 \\\\times 3 = 60"} Want another?';
      expect(stripInternalTags(input)).toBe('Great work! Want another?');
    });

    it('strips a pose JSON with single spacing variations', () => {
      expect(stripInternalTags('Try this {"action": "pose", "tex": "2x+4=20"} now')).toBe('Try this now');
    });

    it('strips multiple stray JSON commands in one message', () => {
      const input = 'a {"action":"pose","tex":"x"} b {"action":"resolve","tex":"x=1"} c';
      expect(stripInternalTags(input)).toBe('a b c');
    });
  });

  describe('LaTeX-brace safety (must NOT corrupt math)', () => {
    it('leaves \\frac and \\boxed braces untouched', () => {
      const input = 'We get \\frac{1}{2} and then \\boxed{x = 4}.';
      expect(stripInternalTags(input)).toBe(input);
    });

    it('does not touch a JSON-looking object without a board action', () => {
      const input = 'Config looks like {"color":"red","size":3}.';
      expect(stripInternalTags(input)).toBe(input);
    });

    it('leaves an interval like [0, 5] alone', () => {
      const input = 'The domain is [0, 5] here.';
      expect(stripInternalTags(input)).toBe(input);
    });

    it('leaves a nested-brace object (not a flat board command) alone', () => {
      const input = 'Odd: {"action":"verify","meta":{"x":1}} stays.';
      expect(stripInternalTags(input)).toBe(input);
    });
  });

  describe('combined + edge cases', () => {
    it('strips both a pre-check tag and stray JSON in one reply', () => {
      const input = '[ANSWER_PRE_CHECK: VERIFIED CORRECT] You nailed it. {"action":"verify","tex":"x=8"}';
      expect(stripInternalTags(input)).toBe('You nailed it.');
    });

    it('returns clean text unchanged', () => {
      const input = 'Nice work — combine the x-terms first.';
      expect(stripInternalTags(input)).toBe(input);
    });

    it('handles empty / non-string input', () => {
      expect(stripInternalTags('')).toBe('');
      expect(stripInternalTags(null)).toBe('');
      expect(stripInternalTags(undefined)).toBe('');
    });

    it('hasInternalTags predicate matches stripInternalTags work (and is not stateful)', () => {
      const dirty = 'x {"action":"pose","tex":"y"} z';
      // Call twice to catch any leaked regex lastIndex state.
      expect(hasInternalTags(dirty)).toBe(true);
      expect(hasInternalTags(dirty)).toBe(true);
      expect(hasInternalTags('all clean here')).toBe(false);
    });
  });
});
