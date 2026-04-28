// tests/unit/teachingStrategies.test.js
// Unit tests for utils/teachingStrategies.js — quick coverage of the
// prompt-builder so it doesn't silently regress to an empty string.

const { generateTeachingStrategiesPrompt } = require('../../utils/teachingStrategies');

describe('generateTeachingStrategiesPrompt', () => {
  test('returns a long instructional string by default', () => {
    const p = generateTeachingStrategiesPrompt();
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(500);
    expect(p).toMatch(/ADVANCED TEACHING STRATEGIES/);
    expect(p).toMatch(/SCAFFOLDING/);
  });

  test('embeds the current phase in uppercase when provided', () => {
    const p = generateTeachingStrategiesPrompt('warmup');
    expect(p).toMatch(/CURRENT PHASE: WARMUP/);
  });

  test('omits phase header when no phase provided', () => {
    const p = generateTeachingStrategiesPrompt(null);
    expect(p).not.toMatch(/CURRENT PHASE:/);
  });

  test('runs without throwing on assessmentData arg (currently unused)', () => {
    expect(() => generateTeachingStrategiesPrompt('we-do', { foo: 'bar' })).not.toThrow();
  });

  test('always includes the closing reminder', () => {
    const p = generateTeachingStrategiesPrompt();
    expect(p).toMatch(/INVISIBLE TO STUDENTS/);
  });
});
