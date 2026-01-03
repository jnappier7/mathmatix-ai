/**
 * REMAP PROBLEMS TO PATTERN-BASED SKILLS
 *
 * Maps existing problems from legacy skillIds to pattern-based skillIds
 * where there is conceptual overlap. This makes pattern-based skills
 * available to the adaptive screener.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const Skill = require('../models/skill');

// Mapping from legacy skillId to pattern-based skillId
const SKILL_MAPPING = {
  // One-step equations
  'one-step-equations-addition': 'one-step-addition',
  'one-step-equations-multiplication': 'one-step-multiplication',

  // Two-step equations
  'two-step-equations': 'two-step-equations',

  // Multi-step equations
  'multi-step-equations': 'multi-step-equations',

  // Inequalities
  'inequalities': 'one-step-inequalities',

  // Integer operations
  'integer-addition': 'addition',
  'integer-subtraction': 'subtraction',
  'integer-multiplication': 'multiplication-basics',

  // Fractions
  'adding-fractions-different-denominators': 'add-fractions',
  'subtracting-fractions': 'subtract-fractions',
  'multiplying-fractions': 'multiply-fractions',
  'dividing-fractions': 'divide-fractions',

  // Expressions
  'simplifying-expressions': 'simplify-expressions',
  'evaluating-expressions': 'evaluate-expressions',
  'combining-like-terms': 'combining-like-terms',
  'distributive-property': 'distributive-property',

  // Linear equations
  'linear-equations': 'graph-linear-equations',
  'slope': 'slope',
  'graphing-linear-equations': 'graph-linear-equations',

  // Systems
  'systems-equations': 'systems-substitution',
  'systems-by-elimination': 'systems-elimination',
  'systems-by-graphing': 'systems-graphing',

  // Quadratics
  'quadratics': 'quadratic-functions',
  'factoring-quadratics': 'factoring-quadratics',

  // Functions
  'functions': 'parent-functions',

  // Geometry
  'pythagorean-theorem': 'geometric-proofs',
  'area-perimeter': 'area-rectangles',

  // Ratios and proportions
  'ratios': 'ratios',
  'proportions': 'solve-proportions',
  'percent': 'percent-of-a-number',

  // Statistics
  'mean-median-mode': 'mean',
  'probability': 'simple-probability',

  // Place value
  'place-value': 'place-value',
  'rounding': 'rounding',

  // Word problems
  'word-problems': 'addition-subtraction-word-problems'
};

async function remapProblems() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected\n');

    // Get all pattern-based skills to verify mappings
    const patternSkills = await Skill.find({ unit: { $regex: 'Pattern' } }).select('skillId').lean();
    const patternSkillIds = new Set(patternSkills.map(s => s.skillId));

    console.log(`📊 Found ${patternSkillIds.size} pattern-based skills in database\n`);

    // Validate mapping
    const validMappings = {};
    const invalidMappings = [];

    for (const [legacyId, patternId] of Object.entries(SKILL_MAPPING)) {
      if (patternSkillIds.has(patternId)) {
        validMappings[legacyId] = patternId;
      } else {
        invalidMappings.push({ legacy: legacyId, pattern: patternId });
      }
    }

    if (invalidMappings.length > 0) {
      console.log('⚠️  Warning: Some mappings reference non-existent pattern skills:');
      invalidMappings.forEach(m => {
        console.log(`   ${m.legacy} → ${m.pattern} (not found)`);
      });
      console.log('');
    }

    console.log(`✓ ${Object.keys(validMappings).length} valid mappings ready\n`);

    // Count problems for each legacy skill
    const stats = {
      totalRemapped: 0,
      byLegacySkill: {},
      byPatternSkill: {}
    };

    for (const [legacyId, patternId] of Object.entries(validMappings)) {
      const count = await Problem.countDocuments({ skillId: legacyId });

      if (count > 0) {
        console.log(`📝 Remapping ${count} problems: "${legacyId}" → "${patternId}"`);

        // Update problems
        const result = await Problem.updateMany(
          { skillId: legacyId },
          { $set: { skillId: patternId } }
        );

        stats.totalRemapped += result.modifiedCount;
        stats.byLegacySkill[legacyId] = result.modifiedCount;
        stats.byPatternSkill[patternId] = (stats.byPatternSkill[patternId] || 0) + result.modifiedCount;
      }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('                  REMAPPING COMPLETE');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`✅ Total problems remapped: ${stats.totalRemapped}`);
    console.log(`✅ Pattern skills now with problems: ${Object.keys(stats.byPatternSkill).length}`);

    console.log('\n📊 Problems per pattern skill:');
    const sorted = Object.entries(stats.byPatternSkill)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    sorted.forEach(([skillId, count]) => {
      console.log(`   ${skillId}: ${count} problems`);
    });

    if (Object.keys(stats.byPatternSkill).length > 10) {
      console.log(`   ... and ${Object.keys(stats.byPatternSkill).length - 10} more`);
    }

    // Check how many pattern skills now have problems
    const patternSkillsWithProblems = await Problem.distinct('skillId', {
      skillId: { $in: Array.from(patternSkillIds) }
    });

    console.log(`\n✓ ${patternSkillsWithProblems.length}/${patternSkillIds.size} pattern-based skills now have problems`);
    console.log(`✓ ${patternSkillIds.size - patternSkillsWithProblems.length} pattern skills still need problems\n`);

    console.log('═══════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

  } catch (error) {
    console.error('Error during remapping:', error);
    process.exit(1);
  }
}

remapProblems();
