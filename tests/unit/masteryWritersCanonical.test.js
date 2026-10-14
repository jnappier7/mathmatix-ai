/**
 * masteryScore's canonical scale is 0-100 (utils/masteryScore.js, models/user.js
 * schema `max: 100`). Writers that seeded 0-1 values (1.0 / 0.5 / 0.3 / 0.1)
 * left prod with 451 rows on one scale and 12 on the other; a teacher tile
 * multiplied them by 100 and showed 287%. Readers normalize, but new writes
 * must not add to the legacy pile.
 */
const fs = require('fs');
const path = require('path');

const WRITERS = ['routes/assessment.js', 'routes/screener.js', 'utils/pipeline/persist.js', 'routes/student.js'];

describe.each(WRITERS)('%s writes masteryScore on the 0-100 scale', file => {
  const src = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
  test('no fractional literal masteryScore writes', () => {
    const bad = [...src.matchAll(/masteryScore\s*(?::|=)\s*(?:[^,;\n]*\|\|\s*)?(0?\.\d+|1\.0)\b/g)].map(m => m[0]);
    expect(bad).toEqual([]);
  });
});

describe('scripts/normalizeMasteryScoreScale planUser', () => {
  const { planUser } = require('../../scripts/normalizeMasteryScoreScale');
  test('rescales only legacy (0,1] values; leaves 0 and canonical values alone', () => {
    expect(planUser({
      a: { masteryScore: 1 }, b: { masteryScore: 0.5 }, c: { masteryScore: 0.3 },
      d: { masteryScore: 0 }, e: { masteryScore: 67 }, f: { status: 'ready' },
    })).toEqual({
      'skillMastery.a.masteryScore': 100,
      'skillMastery.b.masteryScore': 50,
      'skillMastery.c.masteryScore': 30,
    });
  });
  test('nothing to do → null', () => {
    expect(planUser({ a: { masteryScore: 100 } })).toBeNull();
    expect(planUser(undefined)).toBeNull();
  });
  test('refuses keys that would become operator/path injection', () => {
    expect(planUser({ 'a.b': { masteryScore: 1 }, $x: { masteryScore: 1 } })).toBeNull();
  });
});
