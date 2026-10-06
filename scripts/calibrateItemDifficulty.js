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
//   node scripts/calibrateItemDifficulty.js --apply --force   # write despite a shaky fit
//   node scripts/calibrateItemDifficulty.js --reference=act-fable  # the bank others are equated to
//
// THREE TIERS (utils/itemCalibration.js calibratePooled)
// The ACT banks were authored on different scales: on the same skills the
// enhanced drop (rated 1-3, per template) sits almost a level below the Fable
// bank (rated 1-5, per item), and the form builder orders every test by
// difficulty, so the two interleave wrong. Waiting for every item to reach
// --min responses on its own would take thousands of tests. So difficulty is
// measured at the finest level that has the data:
//   item      the item's own responses (n >= --min)
//   template  items that differ only in their numbers, pooled
//   band      one bank's authored level ("enhanced, authored 2"), pooled —
//             matures within tens of tests and equates each bank to the
//             reference bank's authored scale (default act-fable)
// An item nobody has answered yet takes its template's or band's value. The
// dry run prints the band table: what each bank's "2" actually means.
//
// AS A CRON (monthly)
//   npm run cron:calibrate-items
// Items cross the --min threshold at wildly different times, so this is not a
// one-off you run when "there is enough data" — there is never a moment when
// the whole bank is ready. Each run writes only the items that have matured
// since the last one and leaves every other difficulty on its authored value.
// Render schedule and command are in render.yaml (reference only — the live
// cron is created by hand in the dashboard, per CLAUDE.md).
//
// WHAT AN UNATTENDED RUN WILL NOT DO
//   - write an item flagged as possibly mis-keyed (those need a human)
//   - write anything at all if the fit did not settle (--force overrides)
//   - shrink toward anything but the AUTHORED difficulty, so running it twelve
//     times a year lands in the same place as running it once with the same
//     data (see authoredPrior in utils/itemCalibration.js)
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
const { calibratePooled, dropNotReached } = require('../utils/itemCalibration');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const SOURCE = (args.find((a) => a.startsWith('--source=')) || '--source=act').split('=')[1];
const MIN = Number((args.find((a) => a.startsWith('--min=')) || '--min=25').split('=')[1]) || 25;
const OUT = (args.find((a) => a.startsWith('--out=')) || '').split('=')[1] || null;
const LIMIT = Number((args.find((a) => a.startsWith('--top=')) || '--top=40').split('=')[1]) || 40;
// The bank the others are equated to. Its authored levels define the scale.
const REFERENCE = (args.find((a) => a.startsWith('--reference=')) || '--reference=act-fable').split('=')[1];

/**
 * Send one line somewhere a human will actually see it.
 *
 * A cron's stdout is read by nobody. The two things this job produces that a
 * person MUST see — a mis-key review queue, and a run that declined to write —
 * would otherwise scroll past in a Render log once a month. Sentry is already
 * how this codebase surfaces background failures, and `node --require
 * ./instrument.js` (how the cron runs) is what makes it available; without it
 * this is a silent no-op and the console line below is the only output.
 *
 * Counts and problemIds only. No student data goes into this.
 */
function notify(level, message, extra) {
  try {
    const Sentry = require('@sentry/node');
    if (typeof Sentry.getClient !== 'function' || !Sentry.getClient()) return false;
    Sentry.captureMessage(message, { level, extra });
    return true;
  } catch {
    return false;                             // Sentry not loaded; the log line stands alone
  }
}

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
    // An unclaimed test from the public no-account practice page has no
    // userId. Each one is its own anonymous test-taker; String(undefined)
    // would have pooled every guest into one fictional student.
    const personId = s.userId ? String(s.userId) : `guest:${s._id}`;
    for (const r of reached) {
      rows.push({ userId: personId, problemId: r.problemId, correct: r.correct });
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

  // The pools (utils/itemCalibration.js calibratePooled) need the WHOLE bank,
  // not just the items somebody answered: an unseen item in a measured band
  // takes that band's value. So: every problem from any source that has data.
  const answeredIds = [...new Set(rows.map((r) => r.problemId))];
  const sources = await Problem.distinct('source', { problemId: { $in: answeredIds } });
  const problems = await Problem.find({ source: { $in: sources } })
    .select('problemId difficulty skillId source prompt isActive calibration').lean();
  const live = new Map(problems.map((p) => [p.problemId, p]));
  const recalibrated = problems.filter((p) => p.calibration && p.calibration.calibratedAt).length;

  // A response to an item that is no longer in the bank tells us nothing we can
  // write back, and its presence would still tug on every student's ability.
  const orphaned = rows.length;
  rows = rows.filter((r) => live.has(r.problemId));

  const { resolved, bands, levels } = calibratePooled(rows, problems, { minResponses: MIN, referenceSource: REFERENCE });

  const methodFor = (level) => (level === 'item' ? 'rasch-jmle' : `rasch-jmle-${level}`);
  const round2 = (x) => Math.round(Number(x) * 100) / 100;
  // A level writes only if its own fit settled (or --force). The fit behind a
  // band is not the fit behind an item; one wobbling must not hold up the other.
  const levelOk = (level) => FORCE || levels[level].converged;
  const changed = (r) => {
    const p = live.get(r.problemId);
    const c = (p && p.calibration) || {};
    return p.difficulty !== r.difficulty || round2(c.theta) !== round2(r.theta) || c.method !== methodFor(r.level);
  };
  const measured = resolved.filter((r) => r.level);
  const writable = measured.filter((r) => levelOk(r.level) && changed(r));
  const heldBack = measured.filter((r) => !levelOk(r.level) && changed(r));
  const suspect = resolved.filter((r) => r.suspectKey);
  const byLevel = {};
  measured.forEach((r) => { byLevel[r.level] = (byLevel[r.level] || 0) + 1; });

  console.log('\n=== ITEM DIFFICULTY CALIBRATION ===');
  console.log('Provenance:', JSON.stringify(provenance));
  console.log(`Responses used: ${rows.length} (dropped ${orphaned - rows.length} for items no longer in the bank)`);
  const im = levels.item;
  console.log(`Students: ${im.people} (${im.usablePeople} usable, ${im.droppedPeople} all-right or all-wrong)`);
  console.log(`Bank: ${problems.length} items across ${sources.length} source(s); ${recalibrated} carry a previous calibration`);
  console.log(`Reference scale: ${REFERENCE} (the other banks are equated to its authored levels)`);
  for (const level of ['band', 'template', 'item']) {
    const m = levels[level];
    console.log(`  ${level.padEnd(8)} pools with n>=${MIN}: ${String(m.writableItems).padStart(4)}   converged: ${m.converged} in ${m.iterations} [basis: ${m.convergenceBasis}]`);
  }
  console.log(`\nMeasured: ${measured.length} of ${problems.length} items  ${JSON.stringify(byLevel)}`);
  console.log(`Would change: ${writable.length}   Held back (fit not settled): ${heldBack.length}   Flagged as possibly mis-keyed: ${suspect.length}`);

  // The equating table: what each bank's authored levels turn out to mean.
  console.log('\n--- each bank\'s authored levels, on the common scale ---');
  console.log('source | authored'.padEnd(34), 'items'.padStart(6), 'n'.padStart(6), 'p'.padStart(6), 'measured'.padStart(9));
  bands.forEach((b) => {
    console.log(
      b.key.padEnd(34),
      String(b.members).padStart(6),
      String(b.n).padStart(6),
      (b.pValue == null ? '-' : b.pValue.toFixed(2)).padStart(6),
      (b.enoughData ? b.exact.toFixed(2) : `(${b.exact.toFixed(2)})`).padStart(9),
    );
  });
  console.log(`(a measured value in parentheses is below n=${MIN} and is not written)`);

  if (writable.length) {
    const movers = writable.slice().sort((a, b) => Math.abs(b.exact - b.priorDifficulty) - Math.abs(a.exact - a.priorDifficulty));
    console.log(`\n--- biggest movers (top ${LIMIT}) ---`);
    // auth = what the author said (the shrinkage prior, fixed forever),
    // live = what the assembler is reading right now, new = what we would set.
    console.log('problemId'.padEnd(38), 'level'.padEnd(9), 'n'.padStart(5), 'auth'.padStart(5), 'live'.padStart(5), 'new'.padStart(6), '  skill');
    movers.slice(0, LIMIT).forEach((r) => {
      const p = live.get(r.problemId);
      console.log(
        String(r.problemId).padEnd(38),
        r.level.padEnd(9),
        String(r.n).padStart(5),
        String(r.priorDifficulty).padStart(5),
        String(p.difficulty).padStart(5),
        r.exact.toFixed(2).padStart(6),
        '  ' + (p.skillId || ''),
      );
    });
  }

  if (suspect.length) {
    console.log('\n--- NOT rewritten: authored easy, almost nobody gets them right ---');
    console.log('These look mis-keyed rather than hard. Check the key before trusting any difficulty.');
    suspect.forEach((r) => {
      console.log(`  ${r.problemId}  n=${r.n}  p=${r.pValue == null ? '-' : r.pValue.toFixed(2)}  authored=${r.priorDifficulty}  skill=${(live.get(r.problemId) || {}).skillId || ''}`);
    });
    // These never get written, so they stay flagged run after run until someone
    // fixes or retires the item. Unattended, that means silence forever unless
    // it leaves the log.
    notify('warning', `[calibrateItemDifficulty] ${suspect.length} item(s) flagged as possibly mis-keyed`, {
      problemIds: suspect.map((r) => r.problemId),
      detail: suspect.map((r) => ({ problemId: r.problemId, n: r.n, p: r.pValue == null ? null : Number(r.pValue.toFixed(2)), authored: r.priorDifficulty })),
    });
  }

  if (OUT) {
    fs.writeFileSync(OUT, `${JSON.stringify({ provenance, reference: REFERENCE, levels, bands, resolved }, null, 2)}\n`);
    console.log(`\nFull report written to ${OUT}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write these difficulties.');
    await mongoose.disconnect();
    return;
  }

  // An unattended run has nobody to eyeball the numbers, so each fit has to
  // vouch for itself. A fit that has not settled over the pools it would write
  // means the person abilities are still moving, and every estimate is
  // downstream of those — n>=MIN on a wobbling scale is a confident number
  // built on an unstable one. A human reading a dry run can weigh that; a cron
  // cannot, so it declines that level and says why.
  if (heldBack.length) {
    const levelsHeld = [...new Set(heldBack.map((r) => r.level))];
    console.log(`\nNOT WRITTEN for ${levelsHeld.join(', ')} — the fit did not settle. ${heldBack.length} item(s) held back. Re-run with --force to write anyway.`);
    notify('warning', '[calibrateItemDifficulty] declined to write: fit did not converge', {
      levels: Object.fromEntries(levelsHeld.map((l) => [l, { iterations: levels[l].iterations, basis: levels[l].convergenceBasis }])),
      wouldHaveWritten: heldBack.length,
      minResponses: MIN,
    });
  }

  let written = 0;
  for (const r of writable) {
    await Problem.updateOne({ problemId: r.problemId }, {
      $set: {
        difficulty: r.difficulty,
        // Keep the evidence beside the number, so the next person can see
        // whether it was measured or guessed, how, and on how much data.
        calibration: {
          method: methodFor(r.level),
          n: r.n,
          pValue: r.pValue,
          theta: Number(r.theta.toFixed(3)),
          priorDifficulty: r.priorDifficulty,
          calibratedAt: new Date(),
        },
      },
    });
    written += 1;
  }
  console.log(`\nApplied: ${written} item difficulties updated${FORCE ? ' (--force)' : ''}.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('[calibrateItemDifficulty]', err);
  try { await mongoose.disconnect(); } catch { /* already down */ }
  process.exit(1);
});
