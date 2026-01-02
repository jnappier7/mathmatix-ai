/**
 * Remove duplicate problems (same skillId + content)
 * Keeps the best copy based on quality indicators
 */

const mongoose = require('mongoose');
const Problem = require('../models/problem');
require('dotenv').config();

async function deduplicateProblems() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mathmatix_dev');
    console.log('Connected to MongoDB\n');

    // Find duplicate content
    const duplicates = await Problem.aggregate([
      {
        $group: {
          _id: { skillId: '$skillId', content: '$content' },
          count: { $sum: 1 },
          problems: { $push: '$$ROOT' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    console.log(`Found ${duplicates.length} sets of duplicate problems`);
    console.log(`Total duplicates to remove: ${duplicates.reduce((sum, dup) => sum + (dup.count - 1), 0)}\n`);

    let totalDeleted = 0;

    for (const duplicateSet of duplicates) {
      const problems = duplicateSet.problems;

      // Sort by quality: prefer newer, reviewed, with more attempts
      problems.sort((a, b) => {
        // Prefer reviewed problems
        if (a.qualityReview?.reviewed !== b.qualityReview?.reviewed) {
          return b.qualityReview?.reviewed ? 1 : -1;
        }

        // Prefer problems with more attempts (better calibrated)
        const aAttempts = a.irtParameters?.attemptsCount || 0;
        const bAttempts = b.irtParameters?.attemptsCount || 0;
        if (aAttempts !== bAttempts) {
          return bAttempts - aAttempts;
        }

        // Prefer newer problems
        const aDate = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const bDate = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return bDate - aDate;
      });

      // Keep the first (best quality), delete the rest
      const keepId = problems[0]._id;
      const deleteIds = problems.slice(1).map(p => p._id);

      if (deleteIds.length > 0) {
        const result = await Problem.deleteMany({ _id: { $in: deleteIds } });
        totalDeleted += result.deletedCount;
      }
    }

    console.log(`✅ Deleted ${totalDeleted} duplicate problems`);

    const remainingCount = await Problem.countDocuments({});
    console.log(`✅ Remaining problems in database: ${remainingCount}`);

    // Verify no duplicates remain
    const remainingDuplicates = await Problem.aggregate([
      {
        $group: {
          _id: { skillId: '$skillId', content: '$content' },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    console.log(`✅ Remaining duplicate content: ${remainingDuplicates.length}\n`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

deduplicateProblems();
