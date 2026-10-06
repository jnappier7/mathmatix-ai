// utils/seedProblemUpsert.js — re-seed a bank without undoing what was measured.
//
// A seed file's `difficulty` is the AUTHORED one. Once
// scripts/calibrateItemDifficulty.js has measured an item, the live
// `difficulty` holds the measurement and the authored value lives on in
// calibration.priorDifficulty. A plain `$set` of the seed item put the
// authored number straight back on every reseed (npm run seed:all), silently
// undoing the calibration until the next monthly run re-measured it.
//
// So, per item:
//   - every other field is set from the seed, as before;
//   - not yet measured  -> the seed's difficulty is live;
//   - measured          -> the measurement stays live, and the seed's
//                          difficulty becomes the new authored prior (an
//                          author re-rating an item is still news to the
//                          calibrator, which shrinks toward it).

/** The bulkWrite operations for one seed item, in the order they must run. */
function seedProblemOps(item) {
  const { difficulty, ...rest } = item;
  const id = item.problemId;
  const ops = [{
    updateOne: {
      filter: { problemId: id },
      update: difficulty == null ? { $set: rest } : { $set: rest, $setOnInsert: { difficulty } },
      upsert: true,
    },
  }];
  if (difficulty == null) return ops;
  ops.push({
    updateOne: {
      filter: { problemId: id, 'calibration.calibratedAt': { $exists: false }, difficulty: { $ne: difficulty } },
      update: { $set: { difficulty } },
    },
  });
  ops.push({
    updateOne: {
      filter: { problemId: id, 'calibration.calibratedAt': { $exists: true }, 'calibration.priorDifficulty': { $ne: difficulty } },
      update: { $set: { 'calibration.priorDifficulty': difficulty } },
    },
  });
  return ops;
}

/** Upsert every item, in ordered batches. Returns how many items were sent. */
async function upsertSeedProblems(Problem, items, { batchSize = 300 } = {}) {
  let n = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Problem.bulkWrite(batch.flatMap(seedProblemOps), { ordered: true });
    n += batch.length;
  }
  return n;
}

module.exports = { seedProblemOps, upsertSeedProblems };
