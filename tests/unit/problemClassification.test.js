/**
 * Tier-1/2 logic of scripts/auditProblemClassification.js.
 *
 * The heuristics decide which items an LLM pass spends money on, so a
 * false positive here is noise that buries real findings and a false negative
 * hides a misfiled item. Both directions are asserted.
 */

const {
  heuristicViolations,
  promptKey,
  pickSample,
  EXPECTATIONS,
} = require('../../scripts/auditProblemClassification');

describe('heuristicViolations', () => {
  it('passes an item that shows its skill\'s core feature', () => {
    expect(heuristicViolations('add-fractions', 'What is 1/2 + 1/3?')).toEqual([]);
    expect(heuristicViolations('median', 'Find the median of 3, 7, 9.')).toEqual([]);
    expect(heuristicViolations('perimeter', 'Find the perimeter of a 4 by 6 rectangle.')).toEqual([]);
  });

  it('flags an item missing the core feature of its skill', () => {
    // No fraction anywhere — cannot be an add-fractions item.
    expect(heuristicViolations('add-fractions', 'What is 12 + 30?')).toContain('missing-core-feature');
    expect(heuristicViolations('median', 'What is 8 times 7?')).toContain('missing-core-feature');
    expect(heuristicViolations('derivatives', 'Solve for x: x + 4 = 9')).toContain('missing-core-feature');
  });

  it('flags a fraction item filed under the wrong operation', () => {
    // Has a fraction, but the operation is subtraction, not addition.
    const v = heuristicViolations('add-fractions', 'What is 3/4 - 1/4?');
    expect(v).toContain('missing-operation');
    expect(v).not.toContain('missing-core-feature');
  });

  it('distinguishes percent from decimal skills', () => {
    expect(heuristicViolations('percent-of-a-number', 'What is 20% of 50?')).toEqual([]);
    expect(heuristicViolations('percent-of-a-number', 'What is 0.2 of 50?'))
      .toContain('missing-core-feature');
  });

  it('accepts LaTeX fraction and operator notation, not just ASCII', () => {
    expect(heuristicViolations('multiply-fractions', 'Compute \\frac{2}{3} \\times \\frac{1}{5}'))
      .toEqual([]);
    expect(heuristicViolations('divide-fractions', 'Compute \\frac{2}{3} \\div \\frac{1}{5}'))
      .toEqual([]);
  });

  it('does not treat a fraction bar as the division operator', () => {
    // Every fraction contains "/", so accepting it as the division operator
    // would make divide-fractions' operation check vacuously true.
    expect(heuristicViolations('divide-fractions', 'What is 1/2 + 1/4?'))
      .toContain('missing-operation');
  });

  it('accepts coordinate-pair notation for slope-from-two-points', () => {
    expect(heuristicViolations('slope-from-two-points', 'Find the slope through (1, 2) and (3, 8).'))
      .toEqual([]);
    expect(heuristicViolations('slope-from-two-points', 'What is the slope of a flat line?'))
      .toContain('missing-core-feature');
  });

  it('stays silent on skills it does not assert', () => {
    // Deliberate: an unasserted skill must never produce findings, or the
    // report fills with noise for skills whose surface features are ambiguous.
    expect(EXPECTATIONS['counting-up']).toBeUndefined();
    expect(heuristicViolations('counting-up', 'anything at all')).toEqual([]);
    expect(heuristicViolations('some-skill-that-does-not-exist', 'x')).toEqual([]);
  });

  it('tolerates a missing or empty prompt without throwing', () => {
    expect(heuristicViolations('add-fractions', null)).toEqual([]);
    expect(heuristicViolations('add-fractions', '')).toEqual([]);
  });
});

describe('promptKey', () => {
  it('collapses whitespace and case so duplicates collide', () => {
    expect(promptKey('What  is  2 + 2?')).toBe(promptKey('what is 2 + 2?'));
  });

  it('keeps math operators that distinguish different problems', () => {
    expect(promptKey('2 + 2')).not.toBe(promptKey('2 - 2'));
    expect(promptKey('x < 5')).not.toBe(promptKey('x > 5'));
  });

  it('returns empty for nullish input so it can be skipped', () => {
    expect(promptKey(null)).toBe('');
    expect(promptKey(undefined)).toBe('');
  });
});

describe('pickSample', () => {
  const items = Array.from({ length: 100 }, (_, i) => i);

  it('returns everything when the pool is smaller than the sample', () => {
    expect(pickSample([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  it('returns exactly n for a larger pool', () => {
    expect(pickSample(items, 10)).toHaveLength(10);
  });

  it('is deterministic so a finding can be re-checked by re-running', () => {
    expect(pickSample(items, 7)).toEqual(pickSample(items, 7));
  });

  it('spreads across the pool rather than taking a prefix', () => {
    const s = pickSample(items, 5);
    expect(s[0]).toBe(0);
    expect(s[s.length - 1]).toBeGreaterThan(50);
  });
});
