/**
 * Find and optionally remove duplicate problems
 */

const mongoose = require('mongoose');
const Problem = require('../models/problem');
require('dotenv').config();

async function findDuplicates() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mathmatix_dev');
    console.log('Connected to MongoDB\n');

    // Find duplicate problemIds
    const duplicateProblemIds = await Problem.aggregate([
      {
        $group: {
          _id: '$problemId',
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    console.log(`Found ${duplicateProblemIds.length} duplicate problemIds`);
    if (duplicateProblemIds.length > 0) {
      console.log('Top duplicates:');
      duplicateProblemIds.slice(0, 5).forEach(dup => {
        console.log(`  - problemId "${dup._id}": ${dup.count} copies`);
      });
    }

    // Find duplicate content (same skillId + content)
    const duplicateContent = await Problem.aggregate([
      {
        $group: {
          _id: { skillId: '$skillId', content: '$content' },
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    console.log(`\nFound ${duplicateContent.length} duplicate content (same skillId + content)`);
    if (duplicateContent.length > 0) {
      console.log('Top duplicates:');
      duplicateContent.slice(0, 5).forEach(dup => {
        console.log(`  - ${dup._id.skillId}: ${dup.count} copies`);
      });
    }

    // Total problems
    const totalProblems = await Problem.countDocuments({});
    const duplicatesByProblemId = duplicateProblemIds.reduce((sum, dup) => sum + (dup.count - 1), 0);
    const duplicatesByContent = duplicateContent.reduce((sum, dup) => sum + (dup.count - 1), 0);

    console.log('\n============================================================');
    console.log('DUPLICATE SUMMARY');
    console.log('============================================================');
    console.log(`Total problems in database: ${totalProblems}`);
    console.log(`Duplicate problemIds to remove: ${duplicatesByProblemId}`);
    console.log(`Duplicate content to remove: ${duplicatesByContent}`);
    console.log(`Expected after cleanup: ~${totalProblems - Math.max(duplicatesByProblemId, duplicatesByContent)}`);
    console.log('============================================================\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findDuplicates();
