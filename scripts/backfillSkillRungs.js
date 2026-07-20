// scripts/backfillSkillRungs.js
//
// One-time migration: give every existing skillMastery entry a rung.
//
// The ladder (utils/skillRung.js) reads legacy entries conservatively at runtime
// — status 'mastered' reads as 'proved', anything in progress as 'learned', and
// never as 'taught' — so nothing is broken without this script. What the backfill
// buys is a STORED rung and a receipt, so the board renders from recorded state
// rather than re-deriving it on every read, and so a student's history is a real
// record instead of an inference.
//
// HONESTY POLICY. Reconstructed rungs are written with provenBy 'legacy', never
// as a demonstrated proof. We know the student reached the old 'mastered' state;
// we do not know on what evidence, because the old write path recorded none. The
// receipt says exactly that, and carries a snapshot of whatever pillar data
// existed so the claim can be audited later.
//
// UNSUPPORTED CLAIMS. Some legacy 'mastered' entries would not pass today's bar
// (>=90% accuracy, <=3 hints, 3 contexts) — that population is the footprint of
// the bug this arc fixed. By default they are migrated as-is and COUNTED, not
// demoted: silently deleting progress a student believes they have is worse than
// an over-generous claim we can see and re-verify. Use --demote-unsupported to
// knock them to 'learned' instead.
//
// Usage:
//   node scripts/backfillSkillRungs.js                        # DRY RUN — reports, writes nothing
//   node scripts/backfillSkillRungs.js --apply
//   node scripts/backfillSkillRungs.js --apply --demote-unsupported
//   node scripts/backfillSkillRungs.js --limit 100            # sample a subset

const { GATES } = require('../utils/skillRung');

const APPLY = process.argv.includes('--apply');
const DEMOTE = process.argv.includes('--demote-unsupported');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 0;

const IN_PROGRESS = ['learning', 'practicing', 'needs-review', 're-fragile'];

/** Would this entry's own pillar record satisfy today's practice bar? */
function evidenceSupportsMastery(entry) {
  const p = entry.pillars || {};
  const total = p.accuracy?.total || 0;
  const correct = p.accuracy?.correct || 0;
  const hints = p.independence?.hintsUsed || 0;
  const contexts = p.transfer?.contextsAttempted?.length || 0;
  if (total < GATES.PRACTICE_MIN_ATTEMPTS) return false;
  if (correct / total < GATES.PROVE_MIN_ACCURACY) return false;
  if (hints > GATES.PROVE_MAX_HINTS) return false;
  return contexts >= GATES.PRACTICE_MIN_CONTEXTS;
}

/**
 * Decide the rung for one legacy entry. Returns null when nothing should change.
 * Exported so the tests exercise THIS function rather than a copy of it.
 */
function plan(entry, { demote = DEMOTE } = {}) {
  if (entry.rung) return null;                       // already migrated

  const status = entry.status;
  const wasInferred = entry.masteryType === 'inferred' || entry.masteryType === 'fragile-inferred';

  if (status === 'mastered') {
    const supported = evidenceSupportsMastery(entry);
    if (!supported && demote) {
      return { rung: 'learned', provenBy: 'legacy', supported: false, demoted: true };
    }
    return {
      // Preserve a genuine inference record rather than relabelling it: the
      // system granted it, and that remains the honest provenance.
      rung: 'proved',
      provenBy: wasInferred ? 'inference' : 'legacy',
      supported,
      demoted: false
    };
  }

  if (IN_PROGRESS.includes(status)) {
    return { rung: 'learned', provenBy: 'legacy', supported: null, demoted: false };
  }

  // 'locked' / 'ready' / missing — never started, nothing to reconstruct.
  return { rung: 'none', provenBy: null, supported: null, demoted: false };
}

function receipt(entry, decision) {
  const p = entry.pillars || {};
  return {
    from: 'none',
    to: decision.rung,
    via: decision.provenBy || 'legacy',
    at: entry.masteredDate || entry.lastPracticed || new Date(),
    reason: 'backfilled from pre-ladder data',
    evidence: {
      migrated: true,
      fromStatus: entry.status || null,
      masteryScore: entry.masteryScore ?? null,
      // Snapshot so an over-generous legacy claim stays auditable.
      accuracy: p.accuracy ? { correct: p.accuracy.correct || 0, total: p.accuracy.total || 0 } : null,
      hintsUsed: p.independence?.hintsUsed ?? null,
      contexts: p.transfer?.contextsAttempted?.length ?? null,
      meetsCurrentBar: decision.supported
    }
  };
}

async function main() {
  require('dotenv').config();
  const mongoose = require('mongoose');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  await mongoose.connect(process.env.MONGO_URI);
  const User = require('../models/user');

  const query = User.find({ skillMastery: { $exists: true, $ne: {} } }).select('_id skillMastery');
  if (LIMIT) query.limit(LIMIT);
  const users = await query;

  const tally = {
    users: 0, usersChanged: 0, entries: 0, alreadyMigrated: 0,
    proved: 0, learned: 0, none: 0, inferencePreserved: 0,
    unsupportedMastery: 0, demoted: 0
  };

  for (const user of users) {
    tally.users += 1;
    let changed = false;

    for (const [skillId, entry] of user.skillMastery) {
      tally.entries += 1;
      if (entry.rung) { tally.alreadyMigrated += 1; continue; }

      const decision = plan(entry);
      if (!decision) continue;

      if (decision.rung === 'proved' && !decision.supported) tally.unsupportedMastery += 1;
      if (decision.demoted) tally.demoted += 1;
      if (decision.provenBy === 'inference') tally.inferencePreserved += 1;
      tally[decision.rung] += 1;

      if (APPLY) {
        entry.rung = decision.rung;
        if (decision.provenBy) entry.provenBy = decision.provenBy;
        if (decision.rung !== 'none') {
          entry.rungHistory = [...(entry.rungHistory || []), receipt(entry, decision)];
        }
        user.skillMastery.set(skillId, entry);
      }
      changed = true;
    }

    if (changed) {
      tally.usersChanged += 1;
      if (APPLY) await user.save();
    }
  }

  console.log('\n%s', APPLY ? 'APPLIED' : 'DRY RUN — nothing written');
  console.log('  users scanned            %d', tally.users);
  console.log('  users with changes       %d', tally.usersChanged);
  console.log('  skillMastery entries     %d', tally.entries);
  console.log('  already migrated         %d', tally.alreadyMigrated);
  console.log('  -> proved                %d', tally.proved);
  console.log('  -> learned               %d', tally.learned);
  console.log('  -> none                  %d', tally.none);
  console.log('  inference preserved      %d', tally.inferencePreserved);
  console.log('  legacy mastery that would NOT pass today\'s bar: %d%s',
    tally.unsupportedMastery, DEMOTE ? ' (demoted to learned)' : ' (kept, flagged in the receipt)');
  if (!DEMOTE && tally.unsupportedMastery) {
    console.log('     re-run with --demote-unsupported to knock these down instead.');
    console.log('     each carries evidence.meetsCurrentBar=false in its rungHistory either way.');
  }
  if (!APPLY) console.log('\n  re-run with --apply to write.');

  await mongoose.disconnect();
}

module.exports = { plan, evidenceSupportsMastery, receipt, IN_PROGRESS };

// Only connect to a database when run directly, so the decision logic above can
// be imported and tested without Mongo.
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
