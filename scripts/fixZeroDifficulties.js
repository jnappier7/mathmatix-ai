#!/usr/bin/env node
/**
 * Update problems with difficulty=0 to difficulty=0.1
 * This allows them to be used in IRT estimation while maintaining low difficulty
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const Skill = require('../models/skill');

async function fixZeroDifficulties() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all problems with difficulty=0
    const problemsToFix = await Problem.find({ 'irtParameters.difficulty': 0 });
    console.log(`Found ${problemsToFix.length} problems with difficulty=0\n`);

    // Update them to 0.1
    const result = await Problem.updateMany(
      { 'irtParameters.difficulty': 0 },
      { $set: { 'irtParameters.difficulty': 0.1 } }
    );

    console.log(`✅ Updated ${result.modifiedCount} problems to difficulty=0.1\n`);

    // Now recalculate skill irtDifficulty values
    console.log('Recalculating skill difficulties...');
    const skills = await Skill.find({});

    let updatedSkills = 0;
    for (const skill of skills) {
      const skillProblems = await Problem.find({ skillId: skill.skillId }).lean();

      const difficulties = skillProblems
        .map(p => p.irtParameters?.difficulty)
        .filter(d => d !== undefined && d !== null && !isNaN(d));

      const avgDifficulty = difficulties.length > 0
        ? difficulties.reduce((sum, d) => sum + d, 0) / difficulties.length
        : 0.1;

      if (skill.irtDifficulty !== avgDifficulty) {
        await Skill.updateOne(
          { _id: skill._id },
          { $set: { irtDifficulty: avgDifficulty } }
        );
        updatedSkills++;
      }
    }

    console.log(`✅ Updated ${updatedSkills} skill difficulties\n`);

    await mongoose.disconnect();
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixZeroDifficulties();
