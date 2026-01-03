/**
 * FIND ALL DECIMAL-RELATED PROBLEMS
 *
 * Finds all problems that involve decimals in content, answers, or are
 * explicitly about decimal operations/conversions
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

async function findAllDecimalProblems() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected\n');

    // Find all problems with decimals in content or that mention decimals
    const problems = await Problem.find({
      $or: [
        { content: { $regex: /\d+\.\d+/i } },  // Has decimal number like 3.14
        { content: { $regex: /decimal/i } },    // Mentions "decimal"
        { answer: { $regex: /\d+\.\d+/ } },     // Answer is a decimal
        { answerType: 'decimal' }                // Answer type is decimal
      ]
    }).select('problemId skillId content answer answerType options').lean();

    console.log(`Found ${problems.length} decimal-related problems\n`);

    // Group by skill
    const bySkill = {};
    for (const problem of problems) {
      if (!bySkill[problem.skillId]) {
        bySkill[problem.skillId] = [];
      }
      bySkill[problem.skillId].push(problem);
    }

    // Sort by count
    const sortedSkills = Object.entries(bySkill)
      .sort((a, b) => b[1].length - a[1].length);

    console.log('═══════════════════════════════════════════════════════');
    console.log('DECIMAL PROBLEMS BY SKILL');
    console.log('═══════════════════════════════════════════════════════\n');

    for (const [skillId, problems] of sortedSkills) {
      console.log(`\n📊 ${skillId}: ${problems.length} problems`);

      // Show first 5 examples
      const examples = problems.slice(0, 5);
      for (const p of examples) {
        console.log(`\n   Problem ${p.problemId}:`);
        console.log(`   Content: "${p.content}"`);
        console.log(`   Answer: ${p.answer} (${p.answerType})`);
        if (p.options && p.options.length > 0) {
          console.log(`   Options: ${p.options.map(o => o.text).join(', ')}`);
        }
      }

      if (problems.length > 5) {
        console.log(`\n   ... and ${problems.length - 5} more`);
      }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`Total decimal-related problems: ${problems.length}`);
    console.log(`Skills affected: ${Object.keys(bySkill).length}`);
    console.log(`\nTop 15 skills by problem count:`);

    sortedSkills.slice(0, 15).forEach(([skillId, problems]) => {
      console.log(`   ${skillId}: ${problems.length} problems`);
    });

    console.log('\n═══════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findAllDecimalProblems();
