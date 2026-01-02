/**
 * Remove duplicate problems using batched approach
 * Memory-efficient for large datasets
 */

const mongoose = require('mongoose');
const Problem = require('../models/problem');
require('dotenv').config();

async function deduplicateProblems() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mathmatix_dev');
    console.log('Connected to MongoDB\n');

    // First, find duplicate groups (just IDs and counts, not full documents)
    console.log('Finding duplicate groups...');
    const duplicateGroups = await Problem.aggregate([
      {
        $group: {
          _id: { skillId: '$skillId', content: '$content' },
          count: { $sum: 1 },
          ids: { $push: '$_id' }  // Just IDs, not full documents
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]).allowDiskUse(true);

    console.log(`Found ${duplicateGroups.length} sets of duplicate problems`);
    const totalDuplicates = duplicateGroups.reduce((sum, dup) => sum + (dup.count - 1), 0);
    console.log(`Total duplicates to remove: ${totalDuplicates}\n`);

    let totalDeleted = 0;
    let processed = 0;

    // Process each duplicate group
    for (const group of duplicateGroups) {
      const ids = group.ids;

      // Fetch full documents for this group only
      const problems = await Problem.find({ _id: { $in: ids } }).lean();

      // Sort by quality
      problems.sort((a, b) => {
        // Prefer reviewed problems
        if (a.qualityReview?.reviewed !== b.qualityReview?.reviewed) {
          return b.qualityReview?.reviewed ? 1 : -1;
        }

        // Prefer problems with more attempts
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

      // Keep first, delete rest
      const deleteIds = problems.slice(1).map(p => p._id);

      if (deleteIds.length > 0) {
        const result = await Problem.deleteMany({ _id: { $in: deleteIds } });
        totalDeleted += result.deletedCount;
      }

      processed++;
      if (processed % 100 === 0) {
        console.log(`Processed ${processed}/${duplicateGroups.length} groups, deleted ${totalDeleted} so far...`);
      }
    }

    console.log(`\n✅ Deleted ${totalDeleted} duplicate problems`);

    const remainingCount = await Problem.countDocuments({});
    console.log(`✅ Remaining problems in database: ${remainingCount}`);

    // Quick verification
    const stillDuplicated = await Problem.aggregate([
      {
        $group: {
          _id: { skillId: '$skillId', content: '$content' },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      },
      {
        $count: 'total'
      }
    ]).allowDiskUse(true);

    const duplicatesRemaining = stillDuplicated.length > 0 ? stillDuplicated[0].total : 0;
    console.log(`✅ Remaining duplicate groups: ${duplicatesRemaining}\n`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

deduplicateProblems();
