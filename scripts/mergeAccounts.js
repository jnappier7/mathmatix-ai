#!/usr/bin/env node
/**
 * M∆THM∆TIΧ AI - Merge Multiple Accounts Into One
 *
 * This script merges multiple user accounts (identified by email) into a single
 * target account. All roles, XP, relationships, conversations, and data are
 * consolidated into the target, and source accounts are deleted.
 *
 * Usage:
 *   node scripts/mergeAccounts.js --target <email> --sources <email1,email2,...> [--dry-run]
 *
 * Examples:
 *   # Dry run (preview what would happen):
 *   node scripts/mergeAccounts.js --target admin@example.com --sources teacher@example.com,parent@example.com,student@example.com --dry-run
 *
 *   # Actually merge:
 *   node scripts/mergeAccounts.js --target admin@example.com --sources teacher@example.com,parent@example.com,student@example.com
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const EnrollmentCode = require('../models/enrollmentCode');

// Parse CLI arguments
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}
const dryRun = args.includes('--dry-run');
const targetEmail = getArg('target');
const sourcesArg = getArg('sources');

if (!targetEmail || !sourcesArg) {
  console.error('Usage: node scripts/mergeAccounts.js --target <email> --sources <email1,email2,...> [--dry-run]');
  process.exit(1);
}

const sourceEmails = sourcesArg.split(',').map(e => e.trim()).filter(Boolean);

if (sourceEmails.length === 0) {
  console.error('No source emails provided.');
  process.exit(1);
}

if (sourceEmails.includes(targetEmail)) {
  console.error('Target email cannot also be a source email.');
  process.exit(1);
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('No MONGODB_URI or MONGO_URI found in environment.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  try {
    // Find target account
    const target = await User.findOne({ email: targetEmail });
    if (!target) {
      console.error(`Target account not found: ${targetEmail}`);
      process.exit(1);
    }
    console.log(`\nTarget account: ${target.firstName} ${target.lastName} (${target.email})`);
    console.log(`  Current roles: [${(target.roles || [target.role]).join(', ')}]`);
    console.log(`  XP: ${target.xp || 0}, Level: ${target.level || 1}`);

    // Find source accounts
    const sources = await User.find({ email: { $in: sourceEmails } });
    const foundEmails = sources.map(s => s.email);
    const missingEmails = sourceEmails.filter(e => !foundEmails.includes(e));

    if (missingEmails.length > 0) {
      console.warn(`\nWarning: These source emails were not found: ${missingEmails.join(', ')}`);
    }
    if (sources.length === 0) {
      console.error('No source accounts found. Exiting.');
      process.exit(1);
    }

    console.log(`\nSource accounts to merge (${sources.length}):`);
    for (const s of sources) {
      console.log(`  - ${s.firstName} ${s.lastName} (${s.email}) — roles: [${(s.roles || [s.role]).join(', ')}], XP: ${s.xp || 0}`);
    }

    if (dryRun) {
      console.log('\n=== DRY RUN — No changes will be made ===\n');
    }

    const changes = [];

    // 1. Merge roles
    let mergedRoles = [...new Set([...(target.roles || [target.role])])];
    for (const source of sources) {
      const srcRoles = source.roles && source.roles.length > 0 ? source.roles : [source.role];
      const newRoles = srcRoles.filter(r => !mergedRoles.includes(r));
      if (newRoles.length > 0) {
        mergedRoles = [...mergedRoles, ...newRoles];
        changes.push(`Added roles [${newRoles.join(', ')}] from ${source.email}`);
      }
    }
    target.roles = mergedRoles;
    if (!mergedRoles.includes(target.role)) {
      target.role = mergedRoles[0];
    }
    console.log(`\nMerged roles: [${mergedRoles.join(', ')}]`);

    // 2. Sum XP
    let totalAddedXp = 0;
    for (const source of sources) {
      const srcXp = source.xp || 0;
      if (srcXp > 0) {
        totalAddedXp += srcXp;
        changes.push(`Added ${srcXp} XP from ${source.email}`);
      }
      // Merge xpHistory
      if (source.xpHistory && source.xpHistory.length > 0) {
        target.xpHistory = [...(target.xpHistory || []), ...source.xpHistory];
        changes.push(`Merged ${source.xpHistory.length} xpHistory entries from ${source.email}`);
      }
    }
    target.xp = (target.xp || 0) + totalAddedXp;
    console.log(`Total XP after merge: ${target.xp}`);

    // 3. Subscription — keep highest
    const tierRank = { free: 0, pack_60: 1, pack_120: 2, unlimited: 3 };
    for (const source of sources) {
      if ((tierRank[source.subscriptionTier] || 0) > (tierRank[target.subscriptionTier] || 0)) {
        target.subscriptionTier = source.subscriptionTier;
        target.subscriptionStartDate = source.subscriptionStartDate;
        target.subscriptionEndDate = source.subscriptionEndDate;
        target.stripeCustomerId = source.stripeCustomerId || target.stripeCustomerId;
        target.stripeSubscriptionId = source.stripeSubscriptionId || target.stripeSubscriptionId;
        changes.push(`Upgraded subscription to ${source.subscriptionTier} from ${source.email}`);
      }
    }

    // 4. Merge parent/child relationships
    for (const source of sources) {
      if (source.children && source.children.length > 0) {
        const existing = (target.children || []).map(id => id.toString());
        const newChildren = source.children.filter(id => !existing.includes(id.toString()));
        if (newChildren.length > 0) {
          target.children = [...(target.children || []), ...newChildren];
          changes.push(`Added ${newChildren.length} children from ${source.email}`);
        }
      }
      if (source.parentIds && source.parentIds.length > 0) {
        const existing = (target.parentIds || []).map(id => id.toString());
        const newParents = source.parentIds.filter(id => !existing.includes(id.toString()));
        if (newParents.length > 0) {
          target.parentIds = [...(target.parentIds || []), ...newParents];
          changes.push(`Added ${newParents.length} parent links from ${source.email}`);
        }
      }
    }

    // 5. Merge tutoring time
    for (const source of sources) {
      target.totalActiveTutoringMinutes = (target.totalActiveTutoringMinutes || 0) + (source.totalActiveTutoringMinutes || 0);
      target.totalActiveSeconds = (target.totalActiveSeconds || 0) + (source.totalActiveSeconds || 0);
    }

    // 6. Merge skill mastery (keep highest per skill)
    for (const source of sources) {
      if (source.skillMastery) {
        if (!target.skillMastery) target.skillMastery = new Map();
        for (const [skillId, sourceSkill] of source.skillMastery) {
          const targetSkill = target.skillMastery.get(skillId);
          if (!targetSkill || (sourceSkill.masteryScore || 0) > (targetSkill.masteryScore || 0)) {
            target.skillMastery.set(skillId, sourceSkill);
          }
        }
        changes.push(`Merged skill mastery from ${source.email}`);
      }
    }

    // 7. Merge badges
    for (const source of sources) {
      if (source.badges && source.badges.length > 0) {
        const existing = new Set((target.badges || []).map(b => b.badgeId || b.key));
        const newBadges = source.badges.filter(b => !existing.has(b.badgeId || b.key));
        if (newBadges.length > 0) {
          target.badges = [...(target.badges || []), ...newBadges];
          changes.push(`Added ${newBadges.length} badges from ${source.email}`);
        }
      }
    }

    // 8. Copy missing fields
    for (const source of sources) {
      if (!target.selectedTutorId && source.selectedTutorId) {
        target.selectedTutorId = source.selectedTutorId;
        changes.push(`Copied selectedTutorId from ${source.email}`);
      }
      if (!target.selectedAvatarId && source.selectedAvatarId) {
        target.selectedAvatarId = source.selectedAvatarId;
        changes.push(`Copied selectedAvatarId from ${source.email}`);
      }
      if (!target.gradeLevel && source.gradeLevel) target.gradeLevel = source.gradeLevel;
      if (!target.mathCourse && source.mathCourse) target.mathCourse = source.mathCourse;
      if (!target.googleId && source.googleId) {
        target.googleId = source.googleId;
        changes.push(`Linked Google OAuth from ${source.email}`);
      }
      if (!target.microsoftId && source.microsoftId) {
        target.microsoftId = source.microsoftId;
        changes.push(`Linked Microsoft OAuth from ${source.email}`);
      }
      if (!target.cleverId && source.cleverId) {
        target.cleverId = source.cleverId;
        changes.push(`Linked Clever OAuth from ${source.email}`);
      }
    }

    // 9. Merge streaks
    for (const source of sources) {
      if (source.dailyQuests) {
        if (!target.dailyQuests) target.dailyQuests = {};
        if ((source.dailyQuests.longestStreak || 0) > (target.dailyQuests.longestStreak || 0)) {
          target.dailyQuests.longestStreak = source.dailyQuests.longestStreak;
        }
        target.dailyQuests.totalQuestsCompleted = (target.dailyQuests.totalQuestsCompleted || 0) + (source.dailyQuests.totalQuestsCompleted || 0);
      }
    }

    console.log(`\nChanges to apply (${changes.length}):`);
    changes.forEach(c => console.log(`  ✓ ${c}`));

    if (dryRun) {
      // Preview relationship updates
      for (const source of sources) {
        const teacherRefs = await User.countDocuments({ teacherId: source._id });
        const parentRefs = await User.countDocuments({ parentIds: source._id });
        const childRefs = await User.countDocuments({ children: source._id });
        const convCount = await Conversation.countDocuments({ userId: source._id });
        console.log(`\n  ${source.email} references:`);
        console.log(`    Students with this teacher: ${teacherRefs}`);
        console.log(`    Students with this parent: ${parentRefs}`);
        console.log(`    Parents with this child: ${childRefs}`);
        console.log(`    Conversations: ${convCount}`);
      }
      console.log('\n=== DRY RUN COMPLETE — No changes were made ===');
      console.log('Remove --dry-run flag to execute the merge.');
    } else {
      // Execute merge
      await target.save();
      console.log('\nTarget account saved with merged data.');

      // Update references and transfer data for each source
      for (const source of sources) {
        const [teacherUpdates, parentUpdates, childUpdates] = await Promise.all([
          User.updateMany({ teacherId: source._id }, { teacherId: target._id }),
          User.updateMany({ parentIds: source._id }, { $addToSet: { parentIds: target._id }, $pull: { parentIds: source._id } }),
          User.updateMany({ children: source._id }, { $addToSet: { children: target._id }, $pull: { children: source._id } })
        ]);
        const relCount = teacherUpdates.modifiedCount + parentUpdates.modifiedCount + childUpdates.modifiedCount;
        if (relCount > 0) console.log(`  Updated ${relCount} relationship references for ${source.email}`);

        const convResult = await Conversation.updateMany({ userId: source._id }, { userId: target._id });
        if (convResult.modifiedCount > 0) console.log(`  Transferred ${convResult.modifiedCount} conversations from ${source.email}`);

        await EnrollmentCode.updateMany(
          { 'usedBy.userId': source._id },
          { $set: { 'usedBy.$.userId': target._id } }
        );

        await User.findByIdAndDelete(source._id);
        console.log(`  Deleted source account: ${source.email}`);
      }

      console.log(`\n✅ Merge complete! ${sources.length} account(s) merged into ${target.email}`);
      console.log(`   Final roles: [${target.roles.join(', ')}]`);
      console.log(`   Final XP: ${target.xp}`);
    }
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
