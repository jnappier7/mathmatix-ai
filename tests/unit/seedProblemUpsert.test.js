/**
 * Re-seeding a bank must not undo a measured difficulty.
 *
 * The ACT seeders used to `$set` the whole seed item, so every
 * `npm run seed:all` put the AUTHORED difficulty back over the one
 * scripts/calibrateItemDifficulty.js had measured.
 */
const { seedProblemOps } = require('../../utils/seedProblemUpsert');

describe('seedProblemOps', () => {
  const item = { problemId: 'p1', prompt: 'Q?', difficulty: 2, source: 'act-fable' };
  const ops = seedProblemOps(item);

  test('every other field is upserted, but difficulty only on insert', () => {
    const [up] = ops;
    expect(up.updateOne.upsert).toBe(true);
    expect(up.updateOne.update.$set).toEqual({ problemId: 'p1', prompt: 'Q?', source: 'act-fable' });
    expect(up.updateOne.update.$set.difficulty).toBeUndefined();
    expect(up.updateOne.update.$setOnInsert).toEqual({ difficulty: 2 });
  });

  test('an unmeasured item takes the seed\'s difficulty', () => {
    const f = ops[1].updateOne;
    expect(f.filter['calibration.calibratedAt']).toEqual({ $exists: false });
    expect(f.update).toEqual({ $set: { difficulty: 2 } });
  });

  test('a measured item keeps its difficulty; the seed\'s becomes the authored prior', () => {
    const f = ops[2].updateOne;
    expect(f.filter['calibration.calibratedAt']).toEqual({ $exists: true });
    expect(f.update).toEqual({ $set: { 'calibration.priorDifficulty': 2 } });
    expect(JSON.stringify(f.update)).not.toMatch(/"difficulty"/);
  });

  test('no difficulty in the seed means nothing about difficulty is touched', () => {
    const o = seedProblemOps({ problemId: 'p2', prompt: 'Q?' });
    expect(o).toHaveLength(1);
    expect(o[0].updateOne.update.$setOnInsert).toBeUndefined();
  });

  test('every ACT seeder goes through it', () => {
    const fs = require('fs');
    const path = require('path');
    for (const f of ['seedActItems.js', 'seedActIesItems.js', 'seedActEnhancedItems.js']) {
      const src = fs.readFileSync(path.join(__dirname, '../../scripts', f), 'utf8');
      expect(src).toMatch(/upsertSeedProblems\(Problem, items\)/);
      expect(src).not.toMatch(/\$set: it\b/);
    }
  });
});
