#!/usr/bin/env node
/**
 * Populate the skills collection from existing problems
 *
 * Usage: node scripts/seedSkillsFromProblems.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const Skill = require('../models/skill');

async function seedSkills() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all unique skillIds from problems
    const skillIds = await Problem.distinct('skillId');
    console.log(`Found ${skillIds.length} unique skillIds in problems collection\n`);

    // Category mapping based on skillId patterns
    const categorizeSkill = (skillId) => {
      // K-5 categories
      if (skillId.includes('counting') || skillId.includes('number-recog')) return 'counting-cardinality';
      if (skillId.includes('operations') || skillId.includes('addition') || skillId.includes('subtraction')) return 'operations';
      if (skillId.includes('place-value')) return 'base-ten';
      if (skillId.includes('measurement')) return 'measurement';
      if (skillId.includes('geometry') || skillId.includes('shapes')) return 'geometry';

      // 6-8 categories
      if (skillId.includes('fractions') || skillId.includes('fraction')) return 'fractions';
      if (skillId.includes('ratio') || skillId.includes('proportion')) return 'ratios-proportions';
      if (skillId.includes('number-system') || skillId.includes('integers') || skillId.includes('rational')) return 'number-system';
      if (skillId.includes('expressions') || skillId.includes('equations') || skillId.includes('solving')) return 'expressions-equations';
      if (skillId.includes('statistics') || skillId.includes('probability')) return 'statistics-probability';
      if (skillId.includes('functions')) return 'functions';

      // High School categories
      if (skillId.includes('algebra') || skillId.includes('polynomial') || skillId.includes('quadratic')) return 'algebra';
      if (skillId.includes('geometry') || skillId.includes('trigonometry')) return 'geometry';
      if (skillId.includes('calculus') || skillId.includes('derivative') || skillId.includes('integration')) return 'calculus';

      return 'general';
    };

    // Create skills
    let created = 0;
    let skipped = 0;

    for (const skillId of skillIds) {
      // Check if skill already exists
      const existing = await Skill.findOne({ skillId });
      if (existing) {
        skipped++;
        continue;
      }

      // Get sample problem to estimate difficulty
      const sampleProblem = await Problem.findOne({ skillId }).lean();
      const difficulty = sampleProblem?.irtParameters?.difficulty || 0;
      const gradeLevel = sampleProblem?.metadata?.gradeLevel || '';

      // Create skill name from skillId
      const name = skillId
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      // Create skill document
      await Skill.create({
        skillId,
        name,
        category: categorizeSkill(skillId),
        gradeLevel,
        irtDifficulty: difficulty,
        prerequisites: [],
        standards: [sampleProblem?.metadata?.standardCode].filter(Boolean)
      });

      created++;
      if (created % 50 === 0) {
        console.log(`Progress: ${created}/${skillIds.length} skills created`);
      }
    }

    console.log(`\n✅ Seeding complete!`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total skills: ${created + skipped}`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

seedSkills();
