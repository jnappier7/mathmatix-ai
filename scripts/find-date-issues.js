/**
 * FIND PROBLEMS WITH POTENTIAL DATE/FRACTION ISSUES
 *
 * Identifies problems whose content contains "/" which might be interpreted as dates
 * in multiple choice options.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

async function findDateIssues() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected\n');

    // Find all problems with "/" in content (potential fractions)
    const problemsWithSlash = await Problem.find({
      content: { $regex: /\//, $options: 'i' }
    }).select('problemId skillId content answerType options').lean();

    console.log(`Found ${problemsWithSlash.length} problems with "/" in content\n`);

    // Group by skillId
    const bySkill = {};
    for (const problem of problemsWithSlash) {
      if (!bySkill[problem.skillId]) {
        bySkill[problem.skillId] = [];
      }
      bySkill[problem.skillId].push(problem);
    }

    // Sort by count
    const sortedSkills = Object.entries(bySkill)
      .sort((a, b) => b[1].length - a[1].length);

    console.log('═══════════════════════════════════════════════════════');
    console.log('SKILLS WITH FRACTION/DATE ISSUES');
    console.log('═══════════════════════════════════════════════════════\n');

    for (const [skillId, problems] of sortedSkills) {
      console.log(`\n📊 ${skillId}: ${problems.length} problems`);

      // Show first 3 examples
      const examples = problems.slice(0, 3);
      for (const p of examples) {
        console.log(`   - ${p.problemId}: "${p.content}"`);
        if (p.answerType === 'multiple-choice' && p.options && p.options.length > 0) {
          console.log(`     Options: ${p.options.map(o => o.text).join(', ')}`);
        }
      }

      if (problems.length > 3) {
        console.log(`   ... and ${problems.length - 3} more`);
      }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`Total problems with "/" : ${problemsWithSlash.length}`);
    console.log(`Skills affected: ${Object.keys(bySkill).length}`);
    console.log(`\nTop 10 skills by problem count:`);

    sortedSkills.slice(0, 10).forEach(([skillId, problems]) => {
      console.log(`   ${skillId}: ${problems.length} problems`);
    });

    console.log('\n═══════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

  } catch (error) {
    console.error('Error finding date issues:', error);
    process.exit(1);
  }
}

findDateIssues();
