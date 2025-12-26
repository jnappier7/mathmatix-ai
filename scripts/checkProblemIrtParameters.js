/**
 * Check IRT parameters in problems collection
 * Diagnose NaN theta calculation issue
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

async function checkIrtParameters() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get sample problems for the skills being selected
    const testSkills = [
      'adding-fractions-different-denominators',
      'geometry',
      'one-step-equations-addition',
      'fractions'
    ];

    for (const skillId of testSkills) {
      console.log(`\n📊 Skill: ${skillId}`);
      console.log('─'.repeat(60));

      const problems = await Problem.find({ skillId }).limit(3).lean();

      if (problems.length === 0) {
        console.log('❌ NO PROBLEMS FOUND for this skill!');
        continue;
      }

      console.log(`Found ${problems.length} problems (showing first 3):\n`);

      for (const p of problems) {
        console.log(`Problem ID: ${p.problemId}`);
        console.log(`  Content: ${p.content.substring(0, 50)}...`);
        console.log(`  Has irtParameters: ${!!p.irtParameters}`);

        if (p.irtParameters) {
          console.log(`  Difficulty: ${p.irtParameters.difficulty}`);
          console.log(`  Discrimination: ${p.irtParameters.discrimination}`);
          console.log(`  Difficulty type: ${typeof p.irtParameters.difficulty}`);
          console.log(`  Discrimination type: ${typeof p.irtParameters.discrimination}`);

          // Check if they're valid numbers
          const diffValid = typeof p.irtParameters.difficulty === 'number' && !isNaN(p.irtParameters.difficulty);
          const discValid = typeof p.irtParameters.discrimination === 'number' && !isNaN(p.irtParameters.discrimination);

          if (!diffValid) console.log('  ⚠️  INVALID DIFFICULTY!');
          if (!discValid) console.log('  ⚠️  INVALID DISCRIMINATION!');
        } else {
          console.log('  ❌ irtParameters object is missing!');
        }
        console.log();
      }
    }

    // Count all problems by skillId
    console.log('\n\n📊 All Skills Summary:');
    console.log('─'.repeat(60));

    const allSkills = await Problem.aggregate([
      {
        $group: {
          _id: '$skillId',
          count: { $sum: 1 },
          avgDifficulty: { $avg: '$irtParameters.difficulty' },
          avgDiscrimination: { $avg: '$irtParameters.discrimination' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    console.log(`\nTop 20 skills by problem count:\n`);
    for (const skill of allSkills) {
      const diffStr = skill.avgDifficulty != null ? skill.avgDifficulty.toFixed(2) : 'N/A';
      const discStr = skill.avgDiscrimination != null ? skill.avgDiscrimination.toFixed(2) : 'N/A';
      console.log(`${skill._id.padEnd(40)} ${String(skill.count).padStart(4)} problems | avg diff: ${diffStr}, disc: ${discStr}`);
    }

    // Check for problems with invalid irtParameters
    console.log('\n\n🔍 Checking for problems with invalid IRT parameters...');
    console.log('─'.repeat(60));

    const allProblems = await Problem.find({}).lean();
    let missingIrt = 0;
    let invalidDifficulty = 0;
    let invalidDiscrimination = 0;

    for (const p of allProblems) {
      if (!p.irtParameters) {
        missingIrt++;
      } else {
        if (typeof p.irtParameters.difficulty !== 'number' || isNaN(p.irtParameters.difficulty)) {
          invalidDifficulty++;
        }
        if (typeof p.irtParameters.discrimination !== 'number' || isNaN(p.irtParameters.discrimination)) {
          invalidDiscrimination++;
        }
      }
    }

    console.log(`Total problems: ${allProblems.length}`);
    console.log(`Missing irtParameters: ${missingIrt}`);
    console.log(`Invalid difficulty: ${invalidDifficulty}`);
    console.log(`Invalid discrimination: ${invalidDiscrimination}`);

    if (missingIrt > 0 || invalidDifficulty > 0 || invalidDiscrimination > 0) {
      console.log('\n❌ FOUND PROBLEMS WITH INVALID IRT PARAMETERS!');
      console.log('This is causing NaN in theta calculations.');
    } else {
      console.log('\n✅ All problems have valid IRT parameters.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkIrtParameters();
