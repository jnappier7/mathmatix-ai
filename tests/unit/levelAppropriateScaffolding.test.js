/**
 * Level-appropriate scaffolding.
 *
 * "Asking a high school student to use counters to do 6+3 is wildly misinformed."
 * Counters are a concrete manipulative for early integer work; offering them to
 * an advanced student scaffolds BELOW their level. The gate must have an upper
 * bound, and difficulty should be pitched just above demonstrated ability (ZPD).
 */

const { detectManipulativeContext } = require('../../utils/promptCompact');
const { MICRO_ADAPTATION_RULES } = require('../../utils/pipeline/promptSlim');

describe('detectManipulativeContext — counter upper bound', () => {
  test('middle schooler doing integers → counters available (unchanged)', () => {
    const ctx = detectManipulativeContext({ gradeLevel: '6', studentMessage: 'how do I subtract integers' });
    expect(ctx.includeCounters).toBe(true);
  });

  test('high schooler with integer-ish text → counters SUPPRESSED (mis-leveled)', () => {
    const ctx = detectManipulativeContext({ gradeLevel: '11', studentMessage: 'subtract 6 from 24' });
    expect(ctx.includeCounters).toBe(false);
  });

  test('advanced course (Algebra 2) → counters suppressed even if grade unknown', () => {
    const ctx = detectManipulativeContext({ mathCourse: 'Algebra 2', studentMessage: 'adding negative numbers' });
    expect(ctx.includeCounters).toBe(false);
  });

  test('high schooler who EXPLICITLY asks for counters → honored', () => {
    const ctx = detectManipulativeContext({ gradeLevel: '11', studentMessage: 'can you use counters to show me' });
    expect(ctx.includeCounters).toBe(true);
  });

  test('calculus student doing basic arithmetic → no counters', () => {
    const ctx = detectManipulativeContext({ mathCourse: 'Calculus', studentMessage: 'what is 6 + 3' });
    expect(ctx.includeCounters).toBe(false);
  });
});

describe('ZPD difficulty framing is in the live micro-adaptation rules', () => {
  test('rules tell the tutor to set the bar just above and not scaffold below level', () => {
    expect(MICRO_ADAPTATION_RULES).toMatch(/set the bar just above/i);
    expect(MICRO_ADAPTATION_RULES).toMatch(/counters for 6\+3/i);
  });
});
