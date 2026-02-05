/**
 * MIGRATION SCRIPT: Reset All Assessments
 *
 * This script resets assessment status for all users so they will be
 * prompted to take the new Starting Point assessment.
 *
 * Run with: node scripts/resetAllAssessments.js
 *
 * IMPORTANT: Run this once after deploying the new floating screener.
 * This preserves assessment history but marks all users as needing a new assessment.
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function resetAllAssessments() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const User = require('../models/user');

    // Count users before update
    const totalUsers = await User.countDocuments({ role: 'student' });
    const assessedUsers = await User.countDocuments({ role: 'student', assessmentCompleted: true });

    console.log(`\nFound ${totalUsers} total students`);
    console.log(`Found ${assessedUsers} students with completed assessments`);
    console.log('\nResetting assessment status for all students...');

    // Reset assessment status but preserve history
    const result = await User.updateMany(
      { role: 'student' },
      {
        $set: {
          assessmentCompleted: false,
          assessmentDate: null,
          assessmentExpiresAt: null,
          nextGrowthCheckDue: null,
          startingPointOffered: false,  // Allow AI to offer again
          startingPointOfferedAt: null
        }
        // NOTE: We do NOT clear assessmentHistory - that's preserved for records
      }
    );

    console.log(`\nReset complete!`);
    console.log(`Modified: ${result.modifiedCount} users`);
    console.log(`Matched: ${result.matchedCount} users`);

    // Verify the reset
    const stillAssessed = await User.countDocuments({ role: 'student', assessmentCompleted: true });
    console.log(`\nVerification: ${stillAssessed} students still have assessmentCompleted=true (should be 0)`);

    console.log('\nAll students will now see the glowing Starting Point button');
    console.log('and AI will offer the assessment on their next session.');

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('Error resetting assessments:', error);
    process.exit(1);
  }
}

// Confirm before running
const args = process.argv.slice(2);
if (args.includes('--confirm')) {
  resetAllAssessments();
} else {
  console.log('='.repeat(60));
  console.log('RESET ALL ASSESSMENTS SCRIPT');
  console.log('='.repeat(60));
  console.log('\nThis will reset assessment status for ALL students.');
  console.log('Assessment history will be preserved.');
  console.log('\nTo run this script, add --confirm flag:');
  console.log('  node scripts/resetAllAssessments.js --confirm\n');
}
