/**
 * ANALYZE SKILL COVERAGE
 *
 * Shows which legacy skills have problems and how they could map to pattern skills
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const Skill = require('../models/skill');

async function analyzeSkillCoverage() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected\n');

    // Get all pattern-based skills
    const patternSkills = await Skill.find({ unit: { $regex: 'Pattern' } })
      .select('skillId displayName unit')
      .lean();

    const patternSkillIds = new Set(patternSkills.map(s => s.skillId));
    console.log(`📊 Found ${patternSkillIds.size} pattern-based skills\n`);

    // Get all skills that currently have problems
    const skillsWithProblems = await Problem.aggregate([
      { $group: { _id: '$skillId', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log(`📊 Found ${skillsWithProblems.length} skills with problems in database\n`);

    // Categorize skills
    const legacyWithProblems = [];
    const patternWithProblems = [];

    for (const item of skillsWithProblems) {
      if (patternSkillIds.has(item._id)) {
        patternWithProblems.push(item);
      } else {
        legacyWithProblems.push(item);
      }
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('PATTERN-BASED SKILLS WITH PROBLEMS');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`✅ ${patternWithProblems.length} pattern skills have problems:\n`);

    patternWithProblems.forEach(item => {
      console.log(`   ${item._id}: ${item.count} problems`);
    });

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('LEGACY SKILLS WITH PROBLEMS (Need mapping)');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`⚠️  ${legacyWithProblems.length} legacy skills have problems:\n`);

    // Show top 50 legacy skills
    legacyWithProblems.slice(0, 50).forEach(item => {
      console.log(`   ${item._id}: ${item.count} problems`);
    });

    if (legacyWithProblems.length > 50) {
      console.log(`   ... and ${legacyWithProblems.length - 50} more\n`);
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`Total pattern skills: ${patternSkillIds.size}`);
    console.log(`Pattern skills WITH problems: ${patternWithProblems.length} (${((patternWithProblems.length / patternSkillIds.size) * 100).toFixed(1)}%)`);
    console.log(`Pattern skills WITHOUT problems: ${patternSkillIds.size - patternWithProblems.length} (${(((patternSkillIds.size - patternWithProblems.length) / patternSkillIds.size) * 100).toFixed(1)}%)`);
    console.log(`\nLegacy skills that could be mapped: ${legacyWithProblems.length}`);

    const totalProblems = skillsWithProblems.reduce((sum, item) => sum + item.count, 0);
    const legacyProblems = legacyWithProblems.reduce((sum, item) => sum + item.count, 0);
    const patternProblems = patternWithProblems.reduce((sum, item) => sum + item.count, 0);

    console.log(`\nTotal problems: ${totalProblems}`);
    console.log(`Problems on legacy skills: ${legacyProblems} (${((legacyProblems / totalProblems) * 100).toFixed(1)}%)`);
    console.log(`Problems on pattern skills: ${patternProblems} (${((patternProblems / totalProblems) * 100).toFixed(1)}%)`);

    console.log('\n═══════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

  } catch (error) {
    console.error('Error during analysis:', error);
    process.exit(1);
  }
}

analyzeSkillCoverage();
