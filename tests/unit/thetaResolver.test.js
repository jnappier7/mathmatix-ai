/**
 * The theta split-brain (owner-hit, 2026-07-28: a math teacher's growth
 * check reported "5th grade level").
 *
 * Three writers, three readers, zero agreement:
 *   screener wrote learningProfile.abilityEstimate.theta;
 *   growth check read learningProfile.currentTheta || 0 (never written by
 *   the screener) → every check anchored at θ=0;
 *   user.currentTheta (the schema's canonical field, default 0) was written
 *   by NOBODY — and practicePack read it FIRST, so packs were θ=0 too.
 */
const { resolveTheta, resolveStandardError, thetaWritePatch } = require('../../utils/theta');

describe('resolveTheta', () => {
  test('THE production shape: screener-placed user with default-0 canonical → screener theta, not 0', () => {
    const user = {
      currentTheta: 0,                                  // schema default, never written
      learningProfile: { abilityEstimate: { theta: 2.4, standardError: 0.31 } },
    };
    expect(resolveTheta(user)).toBe(2.4);
    expect(resolveStandardError(user)).toBe(0.31);
  });

  test('a growth-check-updated user prefers the newer growth field', () => {
    const user = {
      currentTheta: 0,
      learningProfile: { currentTheta: 1.1, standardError: 0.5, abilityEstimate: { theta: 2.4 } },
    };
    expect(resolveTheta(user)).toBe(1.1);
  });

  test('an explicitly nonzero canonical field is trusted when nothing newer exists', () => {
    expect(resolveTheta({ currentTheta: -1.5 })).toBe(-1.5);
  });

  test('nothing anywhere → 0, junk-safe', () => {
    expect(resolveTheta({})).toBe(0);
    expect(resolveTheta(null)).toBe(0);
    expect(resolveTheta({ currentTheta: NaN, learningProfile: { currentTheta: 'x' } })).toBe(0);
    expect(resolveStandardError(null)).toBe(1.0);
  });

  test('a genuine θ=0 from the screener resolves as 0 (zero is a real ability estimate)', () => {
    expect(resolveTheta({ currentTheta: 0, learningProfile: { abilityEstimate: { theta: 0 } } })).toBe(0);
  });
});

describe('thetaWritePatch — every writer syncs every read path', () => {
  test('sets canonical + growth + screener fields in one $set fragment', () => {
    const patch = thetaWritePatch(1.8, 0.4);
    expect(patch).toEqual({
      currentTheta: 1.8,
      'learningProfile.currentTheta': 1.8,
      'learningProfile.abilityEstimate.theta': 1.8,
      'learningProfile.standardError': 0.4,
      'learningProfile.abilityEstimate.standardError': 0.4,
    });
  });

  test('omits SE fields when SE is unknown', () => {
    const patch = thetaWritePatch(1.8);
    expect(Object.keys(patch)).toHaveLength(3);
  });
});

describe('the seam stays closed at its call sites', () => {
  const fs = require('fs');
  test('growthCheck anchors on the resolver, never a raw field || 0', () => {
    const src = fs.readFileSync(require.resolve('../../routes/growthCheck.js'), 'utf8');
    expect(src).not.toContain("learningProfile?.currentTheta || 0");
    expect(src).toContain('previousTheta: resolveTheta(student)');
    expect(src).toContain('thetaWritePatch(results.theta');
    // Pin the IMPORT, not just the call — the original theta PR shipped these
    // calls with no require, so every growth-check route 500'd at request time.
    expect(src).toContain("require('../utils/theta')");
  });
  test('screener completion syncs all paths; practicePack uses the shared resolver', () => {
    const screener = fs.readFileSync(require.resolve('../../routes/screener.js'), 'utf8');
    expect(screener).toContain('user.currentTheta = report.theta;');
    const pack = fs.readFileSync(require.resolve('../../routes/practicePack.js'), 'utf8');
    expect(pack).toContain("require('../utils/theta')");
  });
});
