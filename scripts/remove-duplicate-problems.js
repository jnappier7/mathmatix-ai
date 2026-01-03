require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

async function removeDuplicates() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    // Find duplicates (same content + skillId)
    const duplicates = await Problem.aggregate([
      {
        $group: {
          _id: { content: '$content', skillId: '$skillId' },
          problems: { $push: { _id: '$_id', createdAt: '$createdAt', problemId: '$problemId' } },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    console.log(`Found ${duplicates.length} unique problems with duplicates\n`);

    let totalDuplicates = 0;
    let deletedCount = 0;

    for (const dup of duplicates) {
      totalDuplicates += dup.count - 1; // Count duplicates (keep 1, delete rest)

      // Sort by createdAt and keep the NEWEST one
      const sorted = dup.problems.sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
      );

      // Delete all except the newest (first after sort)
      const toDelete = sorted.slice(1);

      if (toDelete.length > 0) {
        const ids = toDelete.map(p => p._id);
        const result = await Problem.deleteMany({ _id: { $in: ids } });
        deletedCount += result.deletedCount;

        if (dup.count > 5) {
          console.log(`Deleted ${toDelete.length} duplicates of: "${dup._id.content.substring(0, 50)}..."`);
        }
      }
    }

    console.log('\n=== SUMMARY ===');
    console.log(`Total duplicate problems found: ${totalDuplicates}`);
    console.log(`Problems deleted: ${deletedCount}`);
    console.log(`Problems remaining: ${await Problem.countDocuments()}`);

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

removeDuplicates();
