/**
 * DATABASE CLEANUP SCRIPT
 *
 * This script identifies and fixes common database inconsistencies:
 * 1. Duplicate skills (same skillId)
 * 2. Skills without required fields
 * 3. Orphaned problems (referencing non-existent skills)
 * 4. Problems with missing IRT parameters
 * 5. Invalid category values
 *
 * Run with: node scripts/cleanup-database.js
 *
 * Options:
 *   --dry-run    Show what would be changed without modifying database
 *   --fix        Actually apply the fixes (default is report-only)
 *   --verbose    Show detailed information
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Skill = require('../models/skill');
const Problem = require('../models/problem');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FIX = args.includes('--fix');
const VERBOSE = args.includes('--verbose');

// Valid categories from the Skill model enum
const VALID_CATEGORIES = [
  'counting-cardinality', 'number-recognition', 'addition-subtraction',
  'multiplication-division', 'place-value', 'shapes-geometry', 'measurement',
  'time', 'data', 'money', 'arrays', 'integers-rationals', 'scientific-notation',
  'area-perimeter', 'volume', 'angles', 'pythagorean-theorem', 'transformations',
  'scatter-plots', 'number-system', 'operations', 'decimals', 'fractions',
  'ratios-proportions', 'percent', 'expressions', 'equations', 'linear-equations',
  'systems', 'inequalities', 'polynomials', 'factoring', 'quadratics', 'radicals',
  'rational-expressions', 'complex-numbers', 'exponentials-logarithms',
  'sequences-series', 'conics', 'functions', 'graphing', 'coordinate-plane',
  'geometry', 'trigonometry', 'identities', 'polar-coordinates', 'vectors',
  'matrices', 'limits', 'derivatives', 'integration', 'series-tests',
  'taylor-series', 'parametric-polar', 'differential-equations', 'multivariable',
  'vector-calculus', 'statistics', 'probability', 'advanced'
];

// Category mapping for invalid categories
const CATEGORY_FIXES = {
  'counting': 'probability',  // Permutations/combinations
  'number-theory': 'number-system',
  'word-problems': 'expressions',
  'rates': 'ratios-proportions',
  'conversions': 'measurement'
};

async function cleanupDatabase() {
  console.log('='.repeat(70));
  console.log('DATABASE CLEANUP REPORT');
  console.log('='.repeat(70));

  if (!FIX) {
    console.log('\n*** REPORT MODE - Use --fix to apply changes ***\n');
  }

  // Connect to MongoDB
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.\n');

  const report = {
    skills: {
      total: 0,
      duplicates: [],
      missingFields: [],
      invalidCategories: [],
      fixed: 0
    },
    problems: {
      total: 0,
      orphaned: [],
      missingIRT: [],
      invalidAnswerType: [],
      fixed: 0
    }
  };

  // ========================================
  // SKILL ANALYSIS
  // ========================================
  console.log('--- ANALYZING SKILLS ---\n');

  const skills = await Skill.find({}).lean();
  report.skills.total = skills.length;

  // Check for duplicates
  const skillIdCounts = {};
  for (const skill of skills) {
    skillIdCounts[skill.skillId] = (skillIdCounts[skill.skillId] || 0) + 1;
  }

  for (const [skillId, count] of Object.entries(skillIdCounts)) {
    if (count > 1) {
      report.skills.duplicates.push({ skillId, count });
    }
  }

  // Check for missing required fields and invalid categories
  for (const skill of skills) {
    const issues = [];

    if (!skill.skillId) issues.push('missing skillId');
    if (!skill.displayName) issues.push('missing displayName');
    if (!skill.description) issues.push('missing description');
    if (!skill.category) issues.push('missing category');

    if (issues.length > 0) {
      report.skills.missingFields.push({
        _id: skill._id,
        skillId: skill.skillId || 'N/A',
        issues
      });
    }

    // Check for invalid category
    if (skill.category && !VALID_CATEGORIES.includes(skill.category)) {
      report.skills.invalidCategories.push({
        _id: skill._id,
        skillId: skill.skillId,
        category: skill.category,
        suggestedFix: CATEGORY_FIXES[skill.category] || 'advanced'
      });
    }
  }

  // ========================================
  // PROBLEM ANALYSIS
  // ========================================
  console.log('--- ANALYZING PROBLEMS ---\n');

  const problems = await Problem.find({}).lean();
  report.problems.total = problems.length;

  // Get all valid skill IDs
  const validSkillIds = new Set(skills.map(s => s.skillId));

  for (const problem of problems) {
    // Check for orphaned problems
    if (!validSkillIds.has(problem.skillId)) {
      report.problems.orphaned.push({
        _id: problem._id,
        problemId: problem.problemId,
        skillId: problem.skillId
      });
    }

    // Check for missing IRT parameters
    if (!problem.irtParameters ||
        problem.irtParameters.difficulty === undefined ||
        problem.irtParameters.discrimination === undefined) {
      report.problems.missingIRT.push({
        _id: problem._id,
        problemId: problem.problemId,
        skillId: problem.skillId,
        hasParams: !!problem.irtParameters
      });
    }

    // Check for invalid answer type
    const validTypes = ['integer', 'decimal', 'fraction', 'expression', 'multiple-choice'];
    if (problem.answerType && !validTypes.includes(problem.answerType)) {
      report.problems.invalidAnswerType.push({
        _id: problem._id,
        problemId: problem.problemId,
        answerType: problem.answerType
      });
    }
  }

  // ========================================
  // PRINT REPORT
  // ========================================
  console.log('='.repeat(70));
  console.log('REPORT SUMMARY');
  console.log('='.repeat(70));

  console.log(`\nSKILLS: ${report.skills.total} total`);
  console.log(`  Duplicates: ${report.skills.duplicates.length}`);
  if (report.skills.duplicates.length > 0 && VERBOSE) {
    for (const dup of report.skills.duplicates) {
      console.log(`    - ${dup.skillId}: ${dup.count} copies`);
    }
  }

  console.log(`  Missing required fields: ${report.skills.missingFields.length}`);
  if (report.skills.missingFields.length > 0 && VERBOSE) {
    for (const item of report.skills.missingFields.slice(0, 10)) {
      console.log(`    - ${item.skillId}: ${item.issues.join(', ')}`);
    }
    if (report.skills.missingFields.length > 10) {
      console.log(`    ... and ${report.skills.missingFields.length - 10} more`);
    }
  }

  console.log(`  Invalid categories: ${report.skills.invalidCategories.length}`);
  if (report.skills.invalidCategories.length > 0) {
    for (const item of report.skills.invalidCategories.slice(0, 10)) {
      console.log(`    - ${item.skillId}: "${item.category}" → "${item.suggestedFix}"`);
    }
    if (report.skills.invalidCategories.length > 10) {
      console.log(`    ... and ${report.skills.invalidCategories.length - 10} more`);
    }
  }

  console.log(`\nPROBLEMS: ${report.problems.total} total`);
  console.log(`  Orphaned (no matching skill): ${report.problems.orphaned.length}`);
  if (report.problems.orphaned.length > 0 && VERBOSE) {
    const uniqueOrphanedSkills = [...new Set(report.problems.orphaned.map(p => p.skillId))];
    console.log(`    Referencing ${uniqueOrphanedSkills.length} non-existent skills:`);
    for (const skillId of uniqueOrphanedSkills.slice(0, 10)) {
      const count = report.problems.orphaned.filter(p => p.skillId === skillId).length;
      console.log(`      - ${skillId}: ${count} problems`);
    }
  }

  console.log(`  Missing IRT parameters: ${report.problems.missingIRT.length}`);
  console.log(`  Invalid answer type: ${report.problems.invalidAnswerType.length}`);

  // ========================================
  // APPLY FIXES
  // ========================================
  if (FIX) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('APPLYING FIXES');
    console.log('='.repeat(70));

    // Fix duplicate skills (keep first, remove others)
    if (report.skills.duplicates.length > 0) {
      console.log('\nRemoving duplicate skills...');
      for (const dup of report.skills.duplicates) {
        const dupes = await Skill.find({ skillId: dup.skillId }).sort({ createdAt: 1 });
        // Keep the first one, delete the rest
        for (let i = 1; i < dupes.length; i++) {
          await Skill.deleteOne({ _id: dupes[i]._id });
          report.skills.fixed++;
          console.log(`  Deleted duplicate: ${dup.skillId} (${dupes[i]._id})`);
        }
      }
    }

    // Fix invalid categories
    if (report.skills.invalidCategories.length > 0) {
      console.log('\nFixing invalid categories...');
      for (const item of report.skills.invalidCategories) {
        await Skill.updateOne(
          { _id: item._id },
          { $set: { category: item.suggestedFix } }
        );
        report.skills.fixed++;
        console.log(`  Fixed: ${item.skillId} "${item.category}" → "${item.suggestedFix}"`);
      }
    }

    // Fix problems with missing IRT parameters
    if (report.problems.missingIRT.length > 0) {
      console.log('\nFixing problems with missing IRT parameters...');
      for (const item of report.problems.missingIRT) {
        // Set default IRT parameters
        const defaultParams = {
          difficulty: 0,
          discrimination: 1.0,
          calibrationConfidence: 'expert',
          attemptsCount: 0
        };

        await Problem.updateOne(
          { _id: item._id },
          { $set: { irtParameters: defaultParams } }
        );
        report.problems.fixed++;
      }
      console.log(`  Fixed ${report.problems.missingIRT.length} problems`);
    }

    console.log(`\nTotal fixes applied:`);
    console.log(`  Skills: ${report.skills.fixed}`);
    console.log(`  Problems: ${report.problems.fixed}`);
  }

  // ========================================
  // RECOMMENDATIONS
  // ========================================
  console.log(`\n${'='.repeat(70)}`);
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(70));

  if (report.skills.duplicates.length > 0) {
    console.log('\n[!] Run with --fix to remove duplicate skills');
  }

  if (report.skills.invalidCategories.length > 0) {
    console.log('\n[!] Run with --fix to correct invalid categories');
    console.log('    Note: You may need to add categories to the Skill model enum first');
  }

  if (report.problems.orphaned.length > 0) {
    console.log('\n[!] Orphaned problems reference non-existent skills');
    console.log('    Options:');
    console.log('    - Create the missing skills');
    console.log('    - Delete the orphaned problems');
    console.log('    - Re-assign problems to existing skills');
  }

  console.log('\n[i] After cleanup, run the calibration script:');
  console.log('    node scripts/calibrate-skill-difficulties.js --dry-run');
  console.log('    node scripts/calibrate-skill-difficulties.js');

  // Disconnect
  await mongoose.disconnect();
  console.log('\nDone!');
}

// Run
cleanupDatabase().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
