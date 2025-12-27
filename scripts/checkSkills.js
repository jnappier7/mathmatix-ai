/**
 * Check Skills collection to diagnose "No candidate skills found"
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Skill = require('../models/skill');

async function checkSkills() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Count total skills
    const totalSkills = await Skill.countDocuments({});
    console.log(`📊 Total skills in collection: ${totalSkills}\n`);

    if (totalSkills === 0) {
      console.log('❌ Skills collection is EMPTY!');
      console.log('This is why screener shows "No candidate skills found!"');
      console.log('\nRun: node scripts/seedSkillsFromProblems.js');
      await mongoose.disconnect();
      return;
    }

    // Get all skills with their irtDifficulty
    const skills = await Skill.find({})
      .select('skillId name irtDifficulty category')
      .lean();

    console.log('All skills:\n');
    console.log('SkillId'.padEnd(45) + 'Name'.padEnd(30) + 'IRT Diff'.padEnd(10) + 'Category');
    console.log('─'.repeat(100));

    for (const skill of skills) {
      const skillIdStr = (skill.skillId || 'N/A').padEnd(45);
      const nameStr = (skill.name || 'N/A').padEnd(30);
      const diffStr = (skill.irtDifficulty != null ? skill.irtDifficulty.toFixed(2) : 'N/A').padEnd(10);
      const catStr = skill.category || 'N/A';
      console.log(`${skillIdStr}${nameStr}${diffStr}${catStr}`);
    }

    // Check for skills with missing or invalid irtDifficulty
    const invalidDifficulty = skills.filter(s =>
      s.irtDifficulty == null ||
      isNaN(s.irtDifficulty) ||
      s.irtDifficulty === 0
    );

    if (invalidDifficulty.length > 0) {
      console.log(`\n⚠️  Warning: ${invalidDifficulty.length} skills have invalid irtDifficulty (null, NaN, or 0)`);
      console.log('These skills will be hard to match during adaptive selection.\n');
    }

    // Show difficulty distribution
    const difficulties = skills
      .map(s => s.irtDifficulty)
      .filter(d => d != null && !isNaN(d));

    if (difficulties.length > 0) {
      const min = Math.min(...difficulties);
      const max = Math.max(...difficulties);
      const avg = difficulties.reduce((a, b) => a + b, 0) / difficulties.length;

      console.log(`\n📈 IRT Difficulty Range:`);
      console.log(`   Min: ${min.toFixed(2)}`);
      console.log(`   Max: ${max.toFixed(2)}`);
      console.log(`   Avg: ${avg.toFixed(2)}`);
      console.log(`   (Target theta for screener is typically -3 to +3)`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');

  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
  }
}

checkSkills();
