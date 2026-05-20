// scripts/unstickMasteredFocus.js
//
// One-off (and idempotent) repair: for each user, resolve focus-queue
// entries whose underlying skill is already mastered, and clear an
// activeBadge that points to an already-mastered skill OR has gone past
// the staleness threshold without earning.
//
// Usage:
//   node scripts/unstickMasteredFocus.js                  # all users, dry run
//   node scripts/unstickMasteredFocus.js --apply          # write changes
//   node scripts/unstickMasteredFocus.js --user <email>   # single user
//
// Safe to re-run: it only ever transitions entries from active/in-progress
// → resolved, and only ever nulls an activeBadge. It never re-opens a
// resolved focus entry.

const mongoose = require('mongoose');
const User = require('../models/user');
const TutorPlan = require('../models/tutorPlan');
const { isSkillMastered, isBadgeStuck, clearActiveBadge } = require('../utils/masteryGuard');

const APPLY = process.argv.includes('--apply');
const userArgIdx = process.argv.indexOf('--user');
const USER_EMAIL = userArgIdx >= 0 ? process.argv[userArgIdx + 1] : null;

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mathmatix';
  await mongoose.connect(uri);
  console.log(`Connected to MongoDB. mode=${APPLY ? 'APPLY' : 'DRY-RUN'}${USER_EMAIL ? ` user=${USER_EMAIL}` : ''}`);

  const userQuery = USER_EMAIL ? { email: USER_EMAIL } : {};
  const users = await User.find(userQuery).select('_id email skillMastery masteryProgress').lean(false);
  console.log(`Scanning ${users.length} user(s)...`);

  let usersTouched = 0;
  let focusEntriesResolved = 0;
  let badgesCleared = 0;

  for (const user of users) {
    const changes = [];

    // 1. Clear an activeBadge whose skill is already mastered, or one that
    //    has burned past the staleness threshold without earning.
    const badge = user.masteryProgress?.activeBadge;
    if (badge) {
      const skillAlreadyDone = badge.skillId && isSkillMastered(user, badge.skillId);
      const stuck = isBadgeStuck(badge);
      if (skillAlreadyDone || stuck) {
        const reason = skillAlreadyDone ? 'skill already mastered' : 'staleness valve';
        changes.push(`clear activeBadge "${badge.badgeId}" (skill=${badge.skillId}, ${badge.problemsCorrect}/${badge.problemsCompleted}): ${reason}`);
        if (APPLY) {
          clearActiveBadge(user, `repair script: ${reason}`);
          badgesCleared++;
        }
      }
    }

    // 2. Resolve mastered skills in the user's TutorPlan focus queue.
    const plan = await TutorPlan.findOne({ userId: user._id });
    if (plan) {
      let planChanged = false;
      for (const entry of plan.skillFocus) {
        if (entry.status === 'resolved' || entry.status === 'deferred') continue;
        if (isSkillMastered(user, entry.skillId)) {
          changes.push(`focus: ${entry.skillId} → resolved (mastered)`);
          if (APPLY) {
            entry.status = 'resolved';
            entry.resolvedAt = new Date();
            planChanged = true;
            focusEntriesResolved++;
          }
        }
      }
      // 3. Clear a currentTarget that points to a mastered skill so the
      //    next session re-resolves from the queue.
      if (plan.currentTarget?.skillId && isSkillMastered(user, plan.currentTarget.skillId)) {
        changes.push(`currentTarget "${plan.currentTarget.skillId}" → cleared (mastered)`);
        if (APPLY) {
          plan.currentTarget = { skillId: null, displayName: null, instructionalMode: null };
          planChanged = true;
        }
      }
      if (APPLY && planChanged) {
        plan.lastUpdated = new Date();
        await plan.save();
      }
    }

    if (changes.length === 0) continue;
    usersTouched++;
    console.log(`\n${user.email} (${user._id}):`);
    for (const c of changes) console.log(`  - ${c}`);

    if (APPLY) {
      await user.save();
    }
  }

  console.log(`\n--- Summary (${APPLY ? 'APPLIED' : 'dry run'}) ---`);
  console.log(`Users with changes:    ${usersTouched}`);
  console.log(`Focus entries resolved: ${focusEntriesResolved}`);
  console.log(`Active badges cleared:  ${badgesCleared}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
