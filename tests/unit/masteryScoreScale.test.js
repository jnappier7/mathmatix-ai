/**
 * The masteryScore dual-scale seam (third confirmed data seam, after skill
 * ids and theta). Placement seeded 0-1; the pillar engine writes 0-100;
 * readers guessed. Canon is 0-100, converted on read so legacy data heals.
 */
const { normalizedMasteryScore } = require('../../utils/masteryScore');

describe('normalizedMasteryScore', () => {
  test('placement-scale values (≤1) convert to percent', () => {
    expect(normalizedMasteryScore(1.0)).toBe(100);   // placement-mastered
    expect(normalizedMasteryScore(0.5)).toBe(50);    // placement-learning
    expect(normalizedMasteryScore(0)).toBe(0);
  });

  test('engine-scale values pass through, clamped and rounded', () => {
    expect(normalizedMasteryScore(78)).toBe(78);
    expect(normalizedMasteryScore(78.6)).toBe(79);
    expect(normalizedMasteryScore(140)).toBe(100);
  });

  test('junk never leaks', () => {
    expect(normalizedMasteryScore(undefined)).toBe(0);
    expect(normalizedMasteryScore('x')).toBe(0);
    expect(normalizedMasteryScore(-3)).toBe(0);
  });

  test('the teacher "struggling" flag no longer fires on placement seeds', () => {
    // teacher.js: struggling = learning && normalized < 40.
    expect(normalizedMasteryScore(0.5) < 40).toBe(false);   // placement 0.5 → 50, not struggling
    expect(normalizedMasteryScore(25) < 40).toBe(true);     // genuinely struggling stays flagged
  });

  test('seeds and readers agree at the call sites (source pins)', () => {
    const fs = require('fs');
    const screener = fs.readFileSync(require.resolve('../../routes/screener.js'), 'utf8');
    expect(screener).toContain('masteryScore: 100,');
    expect(screener).toContain('masteryScore: 50,');
    expect(screener).not.toContain('masteryScore: 1.0,');
    for (const f of ['../../routes/teacher.js', '../../routes/practicePack.js', '../../routes/student.js', '../../routes/learningCurve.js']) {
      expect(fs.readFileSync(require.resolve(f), 'utf8')).toContain('normalizedMasteryScore');
    }
  });
});
