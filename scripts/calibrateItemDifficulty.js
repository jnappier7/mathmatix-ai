// scripts/calibrateItemDifficulty.js
//
// Re-rate item difficulty from what students actually did, not from what the
// author guessed.
//
//   node scripts/calibrateItemDifficulty.js                  # dry run, prints the report
//   node scripts/calibrateItemDifficulty.js --apply          # write the new difficulties
//   node scripts/calibrateItemDifficulty.js --source=all     # include screener responses
//   node scripts/calibrateItemDifficulty.js --min=40         # require 40 responses to write
//   node scripts/calibrateItemDifficulty.js --out=report.json
//
// WHAT IT DOES
// Fits a Rasch model over the whole response matrix (utils/itemCalibration.js),
// so an item's difficulty is measured against the ability of the students who
// actually saw it rather than against raw percent-correct. Writes nothing
// unless --apply, and even then refuses to write an item that is thin on data
// or that looks mis-keyed rather than hard.
//
// WHY IT MATTERS HERE
// utils/actTestAssembler.js fills every slot against a target difficulty from
// the blueprint's ramp. If the difficulties are wrong the ramp is wrong, the
// test does not get harder the way the real one does, and the pacing advice the
// tutor gives on top of it is advice about a test that does not exist.

require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const { calibrateItems, dropNotReached } = require('../utils/itemCalibration');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SOURCE = (args.find((a) => a.startsWith('--source=')) || '--source=act').split('=')[1];
const MIN = Number((args.find((a) => a.startsWith('--min=')) || '--min=25').split('=')[1]) || 25;
const OUT = (args.find((a) => a.startsWith('--out=')) || '').split('=')[1] || null;
const LIMIT = Number((args.find((a) => a.startsWith('--top=')) || '--top=40').split('=')[1]) || 40;

/**
 * Responses from completed fixed-form ACT tests.
 *
 * Only `completed` sessions: an abandoned one was never scored and its blanks
 * mean "walked away", not "got it wrong". Within a session the trailing run of
 * unanswered items is dropped as not-reached — see dropNotReached for why that
 * matters more here than it looks.
 */
async function actRows(ActTestSession) {
  const sessions = await ActTestSession.find({ status: 'completed' })
    .select('userId responses.position responses.problemId responses.correct responses.skipped responses.answer')
    .lean();
  const rows = [];
  let notReached = 0;
  for (const s of sessions) {
    const ordered = (s.responses || [])
      .filter((r) => r && r.problemId)
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map((r) => ({
        position: r.position,
        problemId: r.problemId,
        correct: !!r.correct,
        // "Answered" means they put something down. A skip with no answer is a
        // blank; whether it counts depends on where it falls.
        answered: !r.skipped && r.answer != null && r.answer !== '',
      }));
    const reached = dropNotReached(ordered);
    notReached += ordered.length - reached.length;
    for (const r of reached) {
      rows.push({ userId: String(s.userId), problemId: r.problemId, correct: r.correct });
    }
  }
  return { rows, sessions: sessions.length, notReached };
}

/** Responses from the adaptive screener, when asked for. */
async function screenerRows(ScreenerSession) {
  const sessions = await ScreenerSession.find({})
    .select('userId responses.problemId responses.correct responses.skipped')
    .lean();
  const rows = [];
  for (const s of sessions) {
    for (const r of (s.responses || [])) {
      if (!r || !r.problemId || r.skipped) continue;
      rows.push({ userId: String(s.userId), problemId: r.problemId, correct: !!r.correct });
    }
  }
  return { rows, sessions: sessions.length };
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set — this reads live response data.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');
  const ActTestSession = require('../models/actTestSession');

  let rows = [];
  const provenance = {};
  if (SOURCE === 'act' || SOURCE === 'all') {
    const a = await actRows(ActTestSession);
    rows = rows.concat(a.rows);
    provenance.act = { sessions: a.sessions, responses: a.rows.length, notReachedDropped: a.notReached };
  }
  if (SOURCE === 'screener' || SOURCE === 'all') {
    const ScreenerSession = require('../models/screenerSession');
    const s = await screenerRows(ScreenerSession);
    rows = rows.concat(s.rows);
    provenance.screener = { sessions: s.sessions, responses: s.rows.length };
  }

  if (!rows.length) {
    console.log('No responses found. Nothing to calibrate.');
    console.log('Provenance:', JSON.stringify(provenance, null, 2));
    await mongoose.disconnect();
    return;
  }

  // Authored difficulties are the prior every estimate is shrunk toward.
  const ids = [...new Set(rows.map((r) => r.problemId))];
  const problems = await Problem.find({ problemId: { $in: ids } })
    .select('problemId difficulty skillId isActive').lean();
  const priors = {};
  const meta = {};
  problems.forEach((p) => { priors[p.problemId] = p.difficulty; meta[p.problemId] = p; });

  // A response to an item that is no longer in the bank tells us nothing we can
  // write back, and its presence would still tug on every student's ability.
  const known = new Set(problems.map((p) => p.problemId));
  const orphaned = rows.length;
  rows = rows.filter((r) => known.has(r.problemId));

  const { items, meta: fit } = calibrateItems(rows, priors, { minResponses: MIN });

  const writable = items.filter((i) => i.enoughData && !i.suspectKey && i.delta !== 0);
  const suspect = items.filter((i) => i.suspectKey);
  const thin = items.filter((i) => !i.enoughData);

  console.log('\n=== ITEM DIFFICULTY CALIBRATION ===');
  console.log('Provenance:', JSON.stringify(provenance));
  console.log(`Responses used: ${rows.length} (dropped ${orphaned - rows.length} for items no longer in the bank)`);
  console.log(`Students: ${fit.people} (${fit.usablePeople} usable, ${fit.droppedPeople} all-right or all-wrong)`);
  console.log(`Items with any data: ${fit.items}`);
  console.log(`Converged: ${fit.converged} in ${fit.iterations} iterations`);
  console.log(`Mean items per student: ${fit.meanItemsPerPerson.toFixed(1)} (JMLE bias correction ${fit.biasCorrection.toFixed(4)})`);
  console.log(`\nWould change: ${writable.length}   Too thin to write (<${MIN}): ${thin.length}   Flagged as possibly mis-keyed: ${suspect.length}`);

  if (writable.length) {
    console.log(`\n--- biggest movers (top ${LIMIT}) ---`);
    console.log('problemId'.padEnd(34), 'n'.padStart(5), 'p'.padStart(6), 'was'.padStart(4), 'now'.padStart(4), '  skill');
    writable.slice(0, LIMIT).forEach((i) => {
      console.log(
        String(i.problemId).padEnd(34),
        String(i.usableN).padStart(5),
        i.pValue.toFixed(2).padStart(6),
        String(i.priorDifficulty).padStart(4),
        String(i.difficulty).padStart(4),
        '  ' + ((meta[i.problemId] || {}).skillId || ''),
      );
    });
  }

  if (suspect.length) {
    console.log('\n--- NOT rewritten: authored easy, almost nobody gets them right ---');
    console.log('These look mis-keyed rather than hard. Check the key before trusting any difficulty.');
    suspect.forEach((i) => {
      console.log(`  ${i.problemId}  n=${i.usableN}  p=${i.pValue.toFixed(2)}  authored=${i.priorDifficulty}  skill=${(meta[i.problemId] || {}).skillId || ''}`);
    });
  }

  if (OUT) {
    fs.writeFileSync(OUT, `${JSON.stringify({ provenance, fit, items }, null, 2)}\n`);
    console.log(`\nFull report written to ${OUT}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write these difficulties.');
    await mongoose.disconnect();
    return;
  }

  let written = 0;
  for (const i of writable) {
    await Problem.updateOne({ problemId: i.problemId }, {
      $set: {
        difficulty: i.difficulty,
        // Keep the evidence beside the number, so the next person can see
        // whether it was measured or guessed, and on how much data.
        calibration: {
          method: 'rasch-jmle',
          n: i.usableN,
          pValue: i.pValue,
          theta: Number(i.shrunkTheta.toFixed(3)),
          priorDifficulty: i.priorDifficulty,
          calibratedAt: new Date(),
        },
      },
    });
    written += 1;
  }
  console.log(`\nApplied: ${written} item difficulties updated.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('[calibrateItemDifficulty]', err);
  try { await mongoose.disconnect(); } catch { /* already down */ }
  process.exit(1);
});
