/**
 * Remove legacy problems with numeric problemIds
 * These are old imported problems with quality issues
 */

const mongoose = require('mongoose');
const Problem = require('../models/problem');
require('dotenv').config();

async function removeLegacyProblems() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mathmatix_dev');
    console.log('Connected to MongoDB\n');

    // Find all problems with numeric problemIds (legacy format)
    const legacyProblems = await Problem.find({
      problemId: { $regex: /^\d+$/ }
    }).lean();

    console.log(`Found ${legacyProblems.length} legacy problems with numeric IDs`);

    if (legacyProblems.length > 0) {
      console.log('\nFirst 10 legacy problemIds:');
      legacyProblems.slice(0, 10).forEach(p => {
        console.log(`  - ID ${p.problemId}: ${p.skillId} (${p.metadata?.source || 'unknown source'})`);
      });

      console.log('\n⚠️  These problems will be DELETED:');
      console.log(`   - Total: ${legacyProblems.length} problems`);
      console.log(`   - They have numeric IDs (6, 7, 16, 26, 41, etc.)`);
      console.log(`   - Most are from old imports with quality issues`);
      console.log(`   - Your generated problems use format: prob_round_TIMESTAMP_ID\n`);

      // Delete them
      const result = await Problem.deleteMany({
        problemId: { $regex: /^\d+$/ }
      });

      console.log(`✅ Deleted ${result.deletedCount} legacy problems`);

      const remainingCount = await Problem.countDocuments({});
      console.log(`✅ Remaining problems in database: ${remainingCount}\n`);
    } else {
      console.log('No legacy problems found.');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

removeLegacyProblems();
