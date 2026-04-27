/**
 * Practice Pack — pure helper tests
 *
 * The worksheet generator was producing zero-problem packs because it
 * looked up theta on the wrong schema path. These tests pin the helpers
 * that resolve theta (canonical: user.currentTheta) and map a stated
 * grade level to a Problem.gradeBand enum.
 */

const router = require('../../routes/practicePack');
const { resolveTheta, gradeLevelToBand } = router.__helpers;

describe('resolveTheta', () => {
  test('prefers user.currentTheta when set', () => {
    expect(resolveTheta({ currentTheta: 1.4 })).toBe(1.4);
    expect(resolveTheta({ currentTheta: 0 })).toBe(0); // zero is valid, not falsy
    expect(resolveTheta({ currentTheta: -2.1 })).toBe(-2.1);
  });

  test('falls back to legacy learningProfile.abilityEstimate.theta if currentTheta missing', () => {
    expect(resolveTheta({ learningProfile: { abilityEstimate: { theta: 0.7 } } })).toBe(0.7);
  });

  test('returns 0 when nothing is set', () => {
    expect(resolveTheta({})).toBe(0);
    expect(resolveTheta(null)).toBe(0);
    expect(resolveTheta(undefined)).toBe(0);
  });

  test('ignores non-numeric theta values', () => {
    expect(resolveTheta({ currentTheta: 'high' })).toBe(0);
    expect(resolveTheta({ learningProfile: { abilityEstimate: { theta: '1.0' } } })).toBe(0);
  });
});

describe('gradeLevelToBand', () => {
  test('maps elementary grades to K-5', () => {
    expect(gradeLevelToBand('K')).toBe('K-5');
    expect(gradeLevelToBand('Kindergarten')).toBe('K-5');
    expect(gradeLevelToBand('Pre-K')).toBe('K-5');
    expect(gradeLevelToBand('1st Grade')).toBe('K-5');
    expect(gradeLevelToBand('5th Grade')).toBe('K-5');
  });

  test('maps middle-school grades to 5-8', () => {
    expect(gradeLevelToBand('6th Grade')).toBe('5-8');
    expect(gradeLevelToBand('7th Grade')).toBe('5-8');
    expect(gradeLevelToBand('8th Grade')).toBe('5-8');
  });

  test('maps high-school grades and courses to 8-12', () => {
    expect(gradeLevelToBand('9th Grade')).toBe('8-12');
    expect(gradeLevelToBand('12th Grade')).toBe('8-12');
    expect(gradeLevelToBand('Algebra 1')).toBe('8-12');
    expect(gradeLevelToBand('Geometry')).toBe('8-12');
    expect(gradeLevelToBand('Pre-Calculus')).toBe('8-12');
  });

  test('maps calculus and beyond', () => {
    expect(gradeLevelToBand('Calculus')).toBe('Calculus');
    expect(gradeLevelToBand('AP Calculus')).toBe('Calculus');
    expect(gradeLevelToBand('Calculus 3')).toBe('Calc 3');
    expect(gradeLevelToBand('Multivariable Calculus')).toBe('Calc 3');
  });

  test('returns null for empty/missing input', () => {
    expect(gradeLevelToBand(null)).toBeNull();
    expect(gradeLevelToBand('')).toBeNull();
    expect(gradeLevelToBand(undefined)).toBeNull();
  });
});
