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

    // Category mapping based on skillId patterns - must match Skill model enum
    const categorizeSkill = (skillId) => {
      // K-5 categories
      if (skillId.includes('counting')) return 'counting-cardinality';
      if (skillId.includes('place-value')) return 'place-value';
      if (skillId.includes('measurement')) return 'measurement';
      if (skillId.includes('shapes')) return 'shapes-geometry';
      if (skillId.includes('time')) return 'time';
      if (skillId.includes('data')) return 'data';
      if (skillId.includes('money')) return 'money';
      if (skillId.includes('arrays')) return 'arrays';

      // 6-8 categories
      if (skillId.includes('integers') || skillId.includes('rational')) return 'integers-rationals';
      if (skillId.includes('area') || skillId.includes('perimeter')) return 'area-perimeter';
      if (skillId.includes('volume')) return 'volume';
      if (skillId.includes('angles')) return 'angles';
      if (skillId.includes('pythagorean')) return 'pythagorean-theorem';
      if (skillId.includes('transformations')) return 'transformations';

      // Middle/High School
      if (skillId.includes('number-system')) return 'number-system';
      if (skillId.includes('operations')) return 'operations';
      if (skillId.includes('decimals')) return 'decimals';
      if (skillId.includes('fractions') || skillId.includes('fraction')) return 'fractions';
      if (skillId.includes('ratio') || skillId.includes('proportion')) return 'ratios-proportions';
      if (skillId.includes('percent')) return 'percent';
      if (skillId.includes('expression') && !skillId.includes('equation')) return 'expressions';
      if (skillId.includes('equation') || skillId.includes('solving')) return 'equations';
      if (skillId.includes('linear')) return 'linear-equations';
      if (skillId.includes('systems')) return 'systems';
      if (skillId.includes('inequalities')) return 'inequalities';
      if (skillId.includes('polynomial')) return 'polynomials';
      if (skillId.includes('factoring')) return 'factoring';
      if (skillId.includes('quadratic')) return 'quadratics';
      if (skillId.includes('radical')) return 'radicals';
      if (skillId.includes('complex')) return 'complex-numbers';
      if (skillId.includes('exponential') || skillId.includes('logarithm')) return 'exponentials-logarithms';
      if (skillId.includes('sequence') || skillId.includes('series')) return 'sequences-series';
      if (skillId.includes('functions')) return 'functions';
      if (skillId.includes('graphing')) return 'graphing';
      if (skillId.includes('coordinate')) return 'coordinate-plane';
      if (skillId.includes('geometry')) return 'geometry';
      if (skillId.includes('trigonometry')) return 'trigonometry';
      if (skillId.includes('vectors')) return 'vectors';
      if (skillId.includes('matrices')) return 'matrices';
      if (skillId.includes('derivative')) return 'derivatives';
      if (skillId.includes('integration')) return 'integration';
      if (skillId.includes('statistics')) return 'statistics';
      if (skillId.includes('probability')) return 'probability';

      // Default fallback
      return 'operations'; // Safe default category
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

      // Get ALL problems for this skill to calculate average difficulty
      const skillProblems = await Problem.find({ skillId }).lean();

      // Calculate average IRT difficulty
      const difficulties = skillProblems
        .map(p => p.irtParameters?.difficulty)
        .filter(d => d !== undefined && d !== null && !isNaN(d));

      const avgDifficulty = difficulties.length > 0
        ? difficulties.reduce((sum, d) => sum + d, 0) / difficulties.length
        : 0;

      const sampleProblem = skillProblems[0];
      const gradeLevel = sampleProblem?.metadata?.gradeLevel || '';

      // Create skill name from skillId
      const displayName = skillId
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      // Create description from skillId
      const description = `Practice problems for ${displayName.toLowerCase()}`;

      // Create skill document
      await Skill.create({
        skillId,
        displayName,
        description,
        category: categorizeSkill(skillId),
        prerequisites: [],
        standardsAlignment: [sampleProblem?.metadata?.standardCode].filter(Boolean),
        difficultyLevel: Math.min(10, Math.max(1, Math.round((avgDifficulty + 3) * 1.67))), // Convert theta (-3 to +3) to 1-10
        irtDifficulty: avgDifficulty // Save average IRT difficulty for screener
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
