/**
 * SKILL DIFFICULTY CALIBRATION SCRIPT
 *
 * This script standardizes irtDifficulty values across all skills in the database.
 * It uses multiple sources to estimate appropriate difficulty:
 * 1. Course-based mapping (Algebra 1 → 1.0, Algebra 2 → 1.8, Calculus → 3.0, etc.)
 * 2. Category-based mapping (equations → 0.8, quadratics → 1.8, etc.)
 * 3. difficultyLevel field (1-10 scale converted to IRT -3 to +3 scale)
 *
 * Run with: node scripts/calibrate-skill-difficulties.js
 *
 * Options:
 *   --dry-run    Show what would be changed without modifying database
 *   --verbose    Show detailed information for each skill
 *   --problems   Also calibrate problem difficulties based on their skills
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Skill = require('../models/skill');
const Problem = require('../models/problem');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const CALIBRATE_PROBLEMS = args.includes('--problems');

// Course-based difficulty mapping (most accurate when available)
const COURSE_DIFFICULTY_MAP = {
  // Elementary
  'kindergarten': -2.5,
  'grade 1': -2.0,
  'grade 2': -1.5,
  'grade 3': -1.0,
  'grade 4': -0.5,
  'grade 5': 0.0,

  // Middle School
  'grade 6': 0.3,
  'grade 7': 0.5,
  'grade 8': 0.8,
  'pre-algebra': 0.5,

  // High School
  'algebra 1': 1.0,
  'geometry': 1.2,
  'algebra 2': 1.8,
  'algebra 2 / statistics': 1.8,
  'precalculus': 2.5,
  'trigonometry': 2.3,

  // College Level
  'calculus 1': 3.0,
  'calculus 2': 3.3,
  'calculus 3': 3.5,
  'calculus': 3.0,
  'statistics': 1.5,
  'linear algebra': 3.0,
  'differential equations': 3.5
};

// Category-based difficulty mapping (fallback when course not available)
const CATEGORY_DIFFICULTY_MAP = {
  // Elementary (K-5)
  'counting-cardinality': -2.5,
  'number-recognition': -2.3,
  'addition-subtraction': -2.0,
  'place-value': -1.8,
  'multiplication-division': -1.5,
  'shapes-geometry': -1.0,
  'measurement': -0.8,
  'time': -1.5,
  'data': -0.5,
  'money': -1.2,
  'arrays': -1.5,

  // Middle School (6-8)
  'integers-rationals': -0.3,
  'scientific-notation': 0.5,
  'area-perimeter': 0.0,
  'volume': 0.3,
  'angles': 0.2,
  'pythagorean-theorem': 0.7,
  'transformations': 0.8,
  'scatter-plots': 0.6,

  // High School Algebra
  'number-system': -0.5,
  'operations': -0.3,
  'decimals': -0.8,
  'fractions': -0.5,
  'ratios-proportions': 0.2,
  'percent': 0.0,
  'expressions': 0.5,
  'equations': 0.8,
  'linear-equations': 1.0,
  'systems': 1.5,
  'inequalities': 1.2,
  'polynomials': 1.6,
  'factoring': 1.4,
  'quadratics': 1.8,
  'radicals': 1.5,
  'rational-expressions': 2.0,
  'complex-numbers': 2.2,
  'exponentials-logarithms': 2.0,
  'sequences-series': 2.3,
  'conics': 2.5,
  'functions': 1.4,
  'graphing': 1.0,
  'coordinate-plane': 0.8,
  'geometry': 1.2,

  // Advanced
  'trigonometry': 2.0,
  'identities': 2.3,
  'polar-coordinates': 2.5,
  'vectors': 2.5,
  'matrices': 2.3,
  'limits': 2.8,
  'derivatives': 3.0,
  'integration': 3.2,
  'series-tests': 3.3,
  'taylor-series': 3.5,
  'parametric-polar': 3.0,
  'differential-equations': 3.5,
  'multivariable': 3.5,
  'vector-calculus': 3.5,
  'statistics': 1.5,
  'probability': 1.3,
  'counting': 1.8,
  'number-theory': 1.5,
  'word-problems': 0.8,
  'rates': 0.5,
  'conversions': 0.3,
  'advanced': 2.5
};

/**
 * Convert difficultyLevel (1-10) to IRT difficulty (-3 to +3)
 */
function difficultyLevelToIRT(level) {
  // Linear mapping: 1 → -2.5, 5 → 0, 10 → 3.0
  return (level - 5) * 0.6;
}

/**
 * Estimate IRT difficulty for a skill using available information
 */
function estimateIRTDifficulty(skill) {
  let difficulty = null;
  let source = 'unknown';

  // Priority 1: Course-based (most accurate)
  if (skill.course) {
    const courseLower = skill.course.toLowerCase();
    for (const [coursePattern, diff] of Object.entries(COURSE_DIFFICULTY_MAP)) {
      if (courseLower.includes(coursePattern)) {
        difficulty = diff;
        source = `course: ${skill.course}`;
        break;
      }
    }
  }

  // Priority 2: Category-based
  if (difficulty === null && skill.category) {
    const categoryDiff = CATEGORY_DIFFICULTY_MAP[skill.category];
    if (categoryDiff !== undefined) {
      difficulty = categoryDiff;
      source = `category: ${skill.category}`;
    }
  }

  // Priority 3: difficultyLevel field (1-10 scale)
  if (difficulty === null && skill.difficultyLevel) {
    difficulty = difficultyLevelToIRT(skill.difficultyLevel);
    source = `difficultyLevel: ${skill.difficultyLevel}`;
  }

  // Fallback: Use 0 (average)
  if (difficulty === null) {
    difficulty = 0;
    source = 'default (no data)';
  }

  return { difficulty, source };
}

/**
 * Main calibration function
 */
async function calibrateSkills() {
  console.log('='.repeat(60));
  console.log('SKILL DIFFICULTY CALIBRATION');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n*** DRY RUN MODE - No changes will be made ***\n');
  }

  // Connect to MongoDB
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.\n');

  // Get all skills
  const skills = await Skill.find({}).lean();
  console.log(`Found ${skills.length} skills in database.\n`);

  // Categorize skills
  const stats = {
    alreadyCalibrated: 0,
    needsCalibration: 0,
    updated: 0,
    byCourse: {},
    byCategory: {},
    bySource: {}
  };

  const updates = [];

  for (const skill of skills) {
    // Track by course
    const course = skill.course || 'No course';
    stats.byCourse[course] = (stats.byCourse[course] || 0) + 1;

    // Track by category
    const category = skill.category || 'No category';
    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

    // Check if already calibrated
    if (skill.irtDifficulty && skill.irtDifficulty !== 0) {
      stats.alreadyCalibrated++;
      if (VERBOSE) {
        console.log(`[SKIP] ${skill.skillId}: already calibrated (${skill.irtDifficulty.toFixed(2)})`);
      }
      continue;
    }

    // Estimate difficulty
    const { difficulty, source } = estimateIRTDifficulty(skill);
    stats.needsCalibration++;
    stats.bySource[source] = (stats.bySource[source] || 0) + 1;

    if (VERBOSE) {
      console.log(`[UPDATE] ${skill.skillId}: 0 → ${difficulty.toFixed(2)} (${source})`);
    }

    updates.push({
      skillId: skill.skillId,
      _id: skill._id,
      oldValue: skill.irtDifficulty || 0,
      newValue: difficulty,
      source
    });
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total skills: ${skills.length}`);
  console.log(`Already calibrated: ${stats.alreadyCalibrated}`);
  console.log(`Needs calibration: ${stats.needsCalibration}`);

  console.log('\n--- Skills by Course ---');
  const sortedCourses = Object.entries(stats.byCourse).sort((a, b) => b[1] - a[1]);
  for (const [course, count] of sortedCourses.slice(0, 15)) {
    console.log(`  ${course}: ${count}`);
  }
  if (sortedCourses.length > 15) {
    console.log(`  ... and ${sortedCourses.length - 15} more courses`);
  }

  console.log('\n--- Skills by Category ---');
  const sortedCategories = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]);
  for (const [category, count] of sortedCategories.slice(0, 15)) {
    console.log(`  ${category}: ${count}`);
  }
  if (sortedCategories.length > 15) {
    console.log(`  ... and ${sortedCategories.length - 15} more categories`);
  }

  console.log('\n--- Calibration Sources ---');
  for (const [source, count] of Object.entries(stats.bySource)) {
    console.log(`  ${source}: ${count}`);
  }

  // Apply updates
  if (!DRY_RUN && updates.length > 0) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`APPLYING ${updates.length} UPDATES...`);
    console.log('='.repeat(60));

    for (const update of updates) {
      await Skill.updateOne(
        { _id: update._id },
        { $set: { irtDifficulty: update.newValue } }
      );
      stats.updated++;
    }

    console.log(`Updated ${stats.updated} skills.`);
  }

  // Calibrate problems if requested
  if (CALIBRATE_PROBLEMS) {
    await calibrateProblems(skills);
  }

  // Disconnect
  await mongoose.disconnect();
  console.log('\nDone!');
}

/**
 * Calibrate problem difficulties based on their associated skills
 */
async function calibrateProblems(skills) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('PROBLEM DIFFICULTY CALIBRATION');
  console.log('='.repeat(60));

  // Build skill difficulty map
  const skillDifficultyMap = {};
  for (const skill of skills) {
    if (skill.irtDifficulty && skill.irtDifficulty !== 0) {
      skillDifficultyMap[skill.skillId] = skill.irtDifficulty;
    } else {
      const { difficulty } = estimateIRTDifficulty(skill);
      skillDifficultyMap[skill.skillId] = difficulty;
    }
  }

  // Get all problems
  const problems = await Problem.find({}).lean();
  console.log(`Found ${problems.length} problems.\n`);

  const problemStats = {
    total: problems.length,
    alreadyCalibrated: 0,
    needsCalibration: 0,
    updated: 0,
    noSkillMatch: 0
  };

  const problemUpdates = [];

  for (const problem of problems) {
    const currentDiff = problem.irtParameters?.difficulty;
    const skillDiff = skillDifficultyMap[problem.skillId];

    // Skip if already has reasonable difficulty
    if (currentDiff !== undefined && currentDiff !== 0 && currentDiff !== -1) {
      problemStats.alreadyCalibrated++;
      continue;
    }

    // Skip if no skill match
    if (skillDiff === undefined) {
      problemStats.noSkillMatch++;
      if (VERBOSE) {
        console.log(`[NO SKILL] ${problem.problemId}: skill ${problem.skillId} not found`);
      }
      continue;
    }

    // Add some variance around the skill difficulty (-0.3 to +0.3)
    const variance = (Math.random() - 0.5) * 0.6;
    const newDiff = Math.max(-3, Math.min(3, skillDiff + variance));

    problemStats.needsCalibration++;

    if (VERBOSE) {
      console.log(`[UPDATE] ${problem.problemId}: ${currentDiff} → ${newDiff.toFixed(2)} (skill: ${problem.skillId})`);
    }

    problemUpdates.push({
      _id: problem._id,
      newDifficulty: newDiff
    });
  }

  console.log(`\nProblem Stats:`);
  console.log(`  Already calibrated: ${problemStats.alreadyCalibrated}`);
  console.log(`  Needs calibration: ${problemStats.needsCalibration}`);
  console.log(`  No skill match: ${problemStats.noSkillMatch}`);

  // Apply problem updates
  if (!DRY_RUN && problemUpdates.length > 0) {
    console.log(`\nApplying ${problemUpdates.length} problem updates...`);

    for (const update of problemUpdates) {
      await Problem.updateOne(
        { _id: update._id },
        { $set: { 'irtParameters.difficulty': update.newDifficulty } }
      );
      problemStats.updated++;
    }

    console.log(`Updated ${problemStats.updated} problems.`);
  }
}

// Run
calibrateSkills().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
