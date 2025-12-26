/**
 * Quick script to check problem bank status
 */

try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available, environment should be pre-configured
}

const mongoose = require('mongoose');
const Problem = require('../models/problem');

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Count total problems
    const totalCount = await Problem.countDocuments({});
    console.log(`📊 Total problems in database: ${totalCount}`);

    if (totalCount === 0) {
      console.log('\n⚠️  No problems found! Item bank needs to be imported.');
      console.log('Run: node scripts/importItemBank.js item-bank.csv');
      process.exit(0);
    }

    // Check difficulty distribution
    console.log('\n📈 Difficulty Distribution:');
    const difficultyRanges = [
      { label: 'Very Easy (-3 to -2)', min: -3, max: -2 },
      { label: 'Easy (-2 to -1)', min: -2, max: -1 },
      { label: 'Below Average (-1 to 0)', min: -1, max: 0 },
      { label: 'Average (0 to 1)', min: 0, max: 1 },
      { label: 'Above Average (1 to 2)', min: 1, max: 2 },
      { label: 'Hard (2 to 3)', min: 2, max: 3 }
    ];

    for (const range of difficultyRanges) {
      const count = await Problem.countDocuments({
        'irtParameters.difficulty': { $gte: range.min, $lt: range.max }
      });
      const percent = ((count / totalCount) * 100).toFixed(1);
      console.log(`   ${range.label}: ${count} (${percent}%)`);
    }

    // Check for one-step-equations-addition skill
    console.log('\n🔍 Checking "one-step-equations-addition" skill:');
    const oneStepProblems = await Problem.find({
      skillId: 'one-step-equations-addition'
    }).select('problemId irtParameters.difficulty').lean();

    if (oneStepProblems.length === 0) {
      console.log('   ⚠️  No problems found for this skill!');
    } else {
      console.log(`   Total: ${oneStepProblems.length} problems`);
      const difficulties = oneStepProblems.map(p => p.irtParameters.difficulty);
      console.log(`   Difficulty range: ${Math.min(...difficulties).toFixed(2)} to ${Math.max(...difficulties).toFixed(2)}`);
      console.log(`   Average: ${(difficulties.reduce((a,b) => a+b, 0) / difficulties.length).toFixed(2)}`);
    }

    // Show sample skills
    console.log('\n📋 Available Skills (sample):');
    const skillGroups = await Problem.aggregate([
      { $group: {
          _id: '$skillId',
          count: { $sum: 1 },
          avgDifficulty: { $avg: '$irtParameters.difficulty' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    skillGroups.forEach(skill => {
      console.log(`   ${skill._id}: ${skill.count} problems (avg difficulty: ${skill.avgDifficulty.toFixed(2)})`);
    });

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
