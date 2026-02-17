#!/usr/bin/env node
// scripts/seedPlaygroundAccounts.js
// Seeds the database with playground demo accounts that reset on logout.
//
// Run with: node scripts/seedPlaygroundAccounts.js
// Clear with: node scripts/seedPlaygroundAccounts.js --clear
//
// This creates:
//   - Ms. Rivera (8th grade teacher) with 15 students
//   - Sarah Chen (parent) with 2 children
//   - Maya Chen (5th grade student)
//   - Alex Chen (11th grade student)
//   - Jordan Martinez (8th grader with IEP)
//   - 12 mock students at various ability levels with IEPs
//   - Enrollment code for Ms. Rivera's class
//   - Sample conversations for live activity feed

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const EnrollmentCode = require('../models/enrollmentCode');

const {
  DEMO_IDS,
  ALL_DEMO_USER_IDS,
  teacherRivera,
  parentChen,
  studentMaya,
  studentAlex,
  studentJordan,
  teacherForChenKids,
  mockStudents,
  enrollmentCode: enrollmentCodeData,
  buildConversations,
  DEMO_PROFILES,
} = require('../utils/demoData');

async function seedPlaygroundAccounts() {
  try {
    console.log('='.repeat(60));
    console.log('  MATHMATIX AI — Playground Account Seeder');
    console.log('='.repeat(60));
    console.log();

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[OK] Connected to MongoDB\n');

    // Handle --clear flag
    if (process.argv.includes('--clear')) {
      await clearPlaygroundData();
      console.log('\n[OK] Playground data cleared.');
      process.exit(0);
    }

    // --- Drop stale unique index on badges.key if it exists ---
    try {
      await mongoose.connection.collection('users').dropIndex('badges.key_1');
      console.log('[FIX] Dropped stale unique index badges.key_1');
    } catch (e) {
      // Index doesn't exist — nothing to do
    }

    // --- CLEAN UP existing playground data ---
    console.log('[1/5] Cleaning up existing playground data...');
    await clearPlaygroundData();
    console.log();

    // --- CREATE TEACHER ACCOUNTS ---
    console.log('[2/5] Creating teacher accounts...');

    const teacherRiveraDoc = new User(teacherRivera);
    await teacherRiveraDoc.save();
    console.log('   [Teacher] Ms. Rivera — demo-teacher / demo1234');

    const teacherPatelDoc = new User(teacherForChenKids);
    await teacherPatelDoc.save();
    console.log('   [Teacher] Mr. Patel (hidden, for Chen kids)');
    console.log();

    // --- CREATE PARENT ACCOUNT ---
    console.log('[3/5] Creating parent account...');

    const parentChenDoc = new User(parentChen);
    await parentChenDoc.save();
    console.log('   [Parent] Sarah Chen — demo-parent / demo1234');
    console.log('     Children: Maya Chen (5th), Alex Chen (11th)');
    console.log();

    // --- CREATE STUDENT ACCOUNTS ---
    console.log('[4/5] Creating student accounts...');

    // Loginable demo students
    const mayaDoc = new User(studentMaya);
    await mayaDoc.save();
    console.log('   [Student] Maya Chen (5th) — demo-student-maya / demo1234');

    const alexDoc = new User(studentAlex);
    await alexDoc.save();
    console.log('   [Student] Alex Chen (11th) — demo-student-alex / demo1234');

    const jordanDoc = new User(studentJordan);
    await jordanDoc.save();
    console.log('   [Student] Jordan Martinez (8th, IEP) — demo-student-jordan / demo1234');

    // Mock students for Ms. Rivera's class
    console.log(`\n   Creating ${mockStudents.length} mock students for Ms. Rivera's class...`);
    for (const ms of mockStudents) {
      const msDoc = new User(ms);
      await msDoc.save();
      const iepFlag = ms.iepPlan?.goals?.length > 0 ? ' [IEP]' : '';
      console.log(`   [Mock] ${ms.firstName} ${ms.lastName} — Level ${ms.level}, ${ms.xp} XP${iepFlag}`);
    }
    console.log();

    // --- CREATE ENROLLMENT CODE & CONVERSATIONS ---
    console.log('[5/5] Creating enrollment code and conversations...');

    const ecDoc = new EnrollmentCode(enrollmentCodeData);
    await ecDoc.save();
    console.log(`   [Code] ${enrollmentCodeData.code} — ${enrollmentCodeData.className}`);

    // --- CREATE CONVERSATIONS ---
    const conversations = buildConversations(DEMO_IDS);
    for (const convData of conversations) {
      const conv = new Conversation(convData);
      await conv.save();

      // Link active conversations to users
      if (convData.isActive) {
        await User.findByIdAndUpdate(convData.userId, { activeConversationId: conv._id });
      }
    }
    console.log(`   [Conversations] Created ${conversations.length} sample conversations`);
    console.log();

    // --- SUMMARY ---
    console.log('='.repeat(60));
    console.log('  Playground accounts seeded successfully!');
    console.log('='.repeat(60));
    console.log();
    console.log('  LOGINABLE PLAYGROUND ACCOUNTS:');
    console.log('  -'.repeat(30));
    console.log();

    const profileToTemplate = {
      'teacher-rivera': teacherRivera,
      'parent-chen': parentChen,
      'student-maya': studentMaya,
      'student-alex': studentAlex,
      'student-jordan': studentJordan,
    };

    for (const [profileId, profile] of Object.entries(DEMO_PROFILES)) {
      const template = profileToTemplate[profileId];
      if (template) {
        console.log(`  [${profile.role.toUpperCase()}] ${profile.name} (${profile.label})`);
        console.log(`     Username: ${template.username}`);
        console.log(`     Password: demo1234`);
        console.log(`     ${profile.description}`);
        console.log();
      }
    }

    console.log('  CLASS ROSTER (Ms. Rivera):');
    console.log('  -'.repeat(30));
    console.log(`  Jordan Martinez + ${mockStudents.length} mock students`);
    console.log("  Students with IEPs: Jordan, Jasmine Brown, Tyler O'Brien");
    console.log(`  Enrollment Code: ${enrollmentCodeData.code}`);
    console.log();
    console.log('  All playground accounts reset on logout.');
    console.log('  Start the server and visit /demo.html to try it out!');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('\n[ERROR] Failed to seed playground accounts:', error);
    process.exit(1);
  }
}

async function clearPlaygroundData() {
  // Use the isDemo flag to find playground accounts
  const deletedUsers = await User.deleteMany({ isDemo: true });
  const deletedConversations = await Conversation.deleteMany({
    userId: { $in: ALL_DEMO_USER_IDS }
  });
  const deletedCodes = await EnrollmentCode.deleteMany({
    teacherId: { $in: [DEMO_IDS.teacherRivera, DEMO_IDS.teacherForChenKids] }
  });

  const total = deletedUsers.deletedCount + deletedConversations.deletedCount + deletedCodes.deletedCount;
  if (total > 0) {
    console.log(`   Removed ${deletedUsers.deletedCount} playground users`);
    console.log(`   Removed ${deletedConversations.deletedCount} playground conversations`);
    console.log(`   Removed ${deletedCodes.deletedCount} playground enrollment codes`);
  }
}

// Run if called directly
if (require.main === module) {
  seedPlaygroundAccounts();
}

module.exports = seedPlaygroundAccounts;
