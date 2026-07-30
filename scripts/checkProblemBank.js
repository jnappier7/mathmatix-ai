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

    // Check difficulty distribution.
    // NOTE: the bank uses the flat 1-5 `difficulty` field (models/problem.js);
    // the old nested `irtParameters.difficulty` theta scale is gone. Querying
    // the dead field reported 0.0% across every bucket and looked like missing
    // data — it was a missing FIELD. Map theta via Problem.thetaToDifficulty().
    console.log('\n📈 Difficulty Distribution:');
    const difficultyLabels = {
      1: 'Very Easy', 2: 'Easy', 3: 'Average', 4: 'Hard', 5: 'Very Hard'
    };

    for (const level of [1, 2, 3, 4, 5]) {
      const count = await Problem.countDocuments({ difficulty: level });
      const percent = ((count / totalCount) * 100).toFixed(1);
      console.log(`   ${level} — ${difficultyLabels[level]}: ${count} (${percent}%)`);
    }

    const unrated = await Problem.countDocuments({
      difficulty: { $in: [null, undefined] }
    });
    if (unrated > 0) {
      const percent = ((unrated / totalCount) * 100).toFixed(1);
      console.log(`   ⚠️  no difficulty set: ${unrated} (${percent}%)`);
    }

    // Check for one-step-equations-addition skill
    console.log('\n🔍 Checking "one-step-equations-addition" skill:');
    const oneStepProblems = await Problem.find({
      skillId: 'one-step-equations-addition'
    }).select('problemId difficulty').lean();

    if (oneStepProblems.length === 0) {
      console.log('   ⚠️  No problems found for this skill!');
    } else {
      console.log(`   Total: ${oneStepProblems.length} problems`);
      const difficulties = oneStepProblems
        .map(p => p.difficulty)
        .filter(d => typeof d === 'number');
      if (difficulties.length === 0) {
        console.log('   ⚠️  None of them carry a difficulty rating');
      } else {
        console.log(`   Difficulty range: ${Math.min(...difficulties)} to ${Math.max(...difficulties)}`);
        console.log(`   Average: ${(difficulties.reduce((a, b) => a + b, 0) / difficulties.length).toFixed(2)}`);
        if (difficulties.length < oneStepProblems.length) {
          console.log(`   (${oneStepProblems.length - difficulties.length} unrated, excluded)`);
        }
      }
    }

    // Show sample skills
    console.log('\n📋 Available Skills (sample):');
    const skillGroups = await Problem.aggregate([
      { $group: {
          _id: '$skillId',
          count: { $sum: 1 },
          avgDifficulty: { $avg: '$difficulty' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    skillGroups.forEach(skill => {
      const avg = typeof skill.avgDifficulty === 'number'
        ? skill.avgDifficulty.toFixed(2)
        : 'unrated';
      console.log(`   ${skill._id}: ${skill.count} problems (avg difficulty: ${avg})`);
    });

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
