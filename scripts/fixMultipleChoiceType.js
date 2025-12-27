/**
 * FIX MULTIPLE CHOICE ANSWER TYPE
 *
 * Updates all problems that have options but wrong answerType
 */

// Load environment variables if dotenv is available
try {
  require('dotenv').config();
} catch (e) {
  console.log('Running without dotenv (environment should be pre-configured)');
}

const mongoose = require('mongoose');
const Problem = require('../models/problem');

async function fixMultipleChoiceTypes() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all problems with options but NOT answerType: 'multiple-choice'
    const problemsToFix = await Problem.find({
      options: { $exists: true, $not: { $size: 0 } },
      answerType: { $ne: 'multiple-choice' }
    });

    console.log(`📊 Found ${problemsToFix.length} problems with options but wrong answerType\n`);

    if (problemsToFix.length === 0) {
      console.log('✅ All problems already have correct answerType!');
      process.exit(0);
    }

    // Show first 5 examples
    console.log('🔍 Sample problems to fix:');
    problemsToFix.slice(0, 5).forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.problemId} - "${p.content.substring(0, 60)}..."`);
      console.log(`      Current answerType: "${p.answerType}" (has ${p.options.length} options)`);
    });
    console.log('');

    // Update all problems
    console.log('🔧 Updating answerType to "multiple-choice"...');
    const result = await Problem.updateMany(
      {
        options: { $exists: true, $not: { $size: 0 } },
        answerType: { $ne: 'multiple-choice' }
      },
      {
        $set: { answerType: 'multiple-choice' }
      }
    );

    console.log(`\n✅ Migration Complete!`);
    console.log(`   Updated: ${result.modifiedCount} problems`);
    console.log(`   Matched: ${result.matchedCount} problems`);

    // Verify the fix
    const remaining = await Problem.countDocuments({
      options: { $exists: true, $not: { $size: 0 } },
      answerType: { $ne: 'multiple-choice' }
    });

    if (remaining === 0) {
      console.log('\n✅ Verification: All problems with options now have answerType: "multiple-choice"');
    } else {
      console.log(`\n⚠️  Warning: ${remaining} problems still have incorrect answerType`);
    }

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run migration
fixMultipleChoiceTypes();
