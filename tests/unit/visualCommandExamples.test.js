// tests/unit/visualCommandExamples.test.js
const {
  getVisualCommandInstruction,
  injectFewShotExamples,
  shouldInjectExamples,
} = require('../../utils/visualCommandExamples');

describe('visualCommandExamples', () => {
  describe('getVisualCommandInstruction', () => {
    test('returns a non-empty instruction string', () => {
      const out = getVisualCommandInstruction();
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });

    test('documents the available visual command tags', () => {
      const out = getVisualCommandInstruction();
      expect(out).toContain('VISUAL COMMAND USAGE');
      expect(out).toContain('[LONG_DIVISION:');
      expect(out).toContain('[FRACTION_ADD:');
      expect(out).toContain('[TRIANGLE_PROBLEM:');
    });
  });

  describe('shouldInjectExamples', () => {
    test('true for short conversations (< 6 messages)', () => {
      expect(shouldInjectExamples([])).toBe(true);
      expect(shouldInjectExamples([{}, {}, {}, {}, {}])).toBe(true);
    });

    test('false once the conversation reaches 6+ messages', () => {
      expect(shouldInjectExamples(new Array(6).fill({}))).toBe(false);
      expect(shouldInjectExamples(new Array(12).fill({}))).toBe(false);
    });
  });

  describe('injectFewShotExamples', () => {
    test('prepends a system instruction for short conversations', () => {
      const convo = [{ role: 'user', content: 'hi' }];
      const result = injectFewShotExamples(convo);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toContain('VISUAL COMMAND USAGE');
      expect(result[1]).toBe(convo[0]);
    });

    test('leaves long conversations (6+ messages) untouched', () => {
      const convo = new Array(6).fill({ role: 'user', content: 'x' });
      const result = injectFewShotExamples(convo);

      expect(result).toBe(convo);
      expect(result).toHaveLength(6);
    });
  });
});
