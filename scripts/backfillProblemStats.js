/**
 * backfillProblemStats.js
 *
 * Reconciles each conversation's stored problemsAttempted/problemsCorrect
 * counters with the ground truth: the per-message `problemResult` tags.
 *
 * WHY: a removed keyword-detection fallback used to fabricate "attempts" from
 * the tutor's coaching language, inflating the stored counters well above the
 * actual graded turns (phantom attempts). The live code no longer does this,
 * but conversations written before the fix still carry inflated counters, so
 * the student-facing accuracy stat stays wrong until they age out of the 7-day
 * window. This one-time pass recomputes the counters from the message tags.
 *
 * It does NOT touch firstTryAttempted/firstTryCorrect — those only apply to data
 * written after the first-try change; legacy conversations fall back to these
 * (now-corrected) per-attempt counters in the progress aggregation.
 *
 * Dry-run by default. Nothing is written without --confirm.
 *
 * Usage:
 *   node scripts/backfillProblemStats.js                         # dry-run, all users
 *   node scripts/backfillProblemStats.js --user a@b.com          # dry-run, one user
 *   node scripts/backfillProblemStats.js --since 30              # only convos active in last 30 days
 *   node scripts/backfillProblemStats.js --confirm               # APPLY to all
 *   node scripts/backfillProblemStats.js --user a@b.com --confirm
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Conversation = require('../models/conversation');
const User = require('../models/user');
const { calculateProblemStats } = require('../utils/activitySummarizer');

/**
 * Compute the correction for a single conversation from its message tags.
 * Pure — no DB. Exported for tests.
 *
 * @param {{problemsAttempted?:number, problemsCorrect?:number, messages?:Array}} conv
 * @returns {{stored:{attempted:number,correct:number}, tagged:{attempted:number,correct:number}, changed:boolean}}
 */
function planConversationUpdate(conv) {
  const stored = {
    attempted: conv.problemsAttempted || 0,
    correct: conv.problemsCorrect || 0,
  };
  const tagged = calculateProblemStats(conv.messages || []);
  const changed = tagged.attempted !== stored.attempted || tagged.correct !== stored.correct;
  return { stored, tagged, changed };
}

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

function pct(correct, attempted) {
  return attempted > 0 ? Math.round((correct / attempted) * 100) + '%' : 'n/a';
}

async function main() {
  const APPLY = process.argv.includes('--confirm');
  const userEmail = getArg('--user');
  const sinceDays = Number(getArg('--since') || 0);
  const limit = Number(getArg('--limit') || 0);

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGO_URI not set.');
    process.exit(1);
  }
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (--confirm)' : 'DRY-RUN'}`);

  const query = {};
  if (userEmail) {
    const user = await User.findOne({ email: userEmail }, { _id: 1 }).lean();
    if (!user) {
      console.error(`ERROR: no user for ${userEmail}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    query.userId = user._id;
    console.log(`Scoped to user ${userEmail} (${user._id})`);
  }
  if (sinceDays > 0) {
    query.lastActivity = { $gte: new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000) };
    console.log(`Scoped to conversations active in the last ${sinceDays} days`);
  }

  let scanned = 0;
  let changedCount = 0;
  const totals = { beforeA: 0, beforeC: 0, afterA: 0, afterC: 0 };

  let cursor = Conversation.find(query, {
    problemsAttempted: 1, problemsCorrect: 1, 'messages.role': 1, 'messages.problemResult': 1,
  }).lean().cursor();
  if (limit > 0) cursor = cursor.limit(limit);

  for (let conv = await cursor.next(); conv != null; conv = await cursor.next()) {
    scanned++;
    const { stored, tagged, changed } = planConversationUpdate(conv);
    totals.beforeA += stored.attempted;
    totals.beforeC += stored.correct;
    totals.afterA += tagged.attempted;
    totals.afterC += tagged.correct;

    if (changed) {
      changedCount++;
      console.log(
        `  ${conv._id}  ${stored.correct}/${stored.attempted} -> ${tagged.correct}/${tagged.attempted}`
      );
      if (APPLY) {
        await Conversation.updateOne(
          { _id: conv._id },
          { $set: { problemsAttempted: tagged.attempted, problemsCorrect: tagged.correct } }
        );
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Scanned:              ${scanned} conversations`);
  console.log(`Would change:         ${changedCount}`);
  console.log(`Attempts  ${totals.beforeA} -> ${totals.afterA}   (removed ${totals.beforeA - totals.afterA} phantom attempts)`);
  console.log(`Correct   ${totals.beforeC} -> ${totals.afterC}`);
  console.log(`Accuracy  ${pct(totals.beforeC, totals.beforeA)} -> ${pct(totals.afterC, totals.afterA)}`);
  console.log(APPLY ? '\nApplied.' : '\nDry-run only. Re-run with --confirm to apply.');

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('Backfill failed:', err);
    try { await mongoose.disconnect(); } catch (_) { /* noop */ }
    process.exit(1);
  });
}

module.exports = { planConversationUpdate };
