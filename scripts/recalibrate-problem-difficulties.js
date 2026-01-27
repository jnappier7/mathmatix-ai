/**
 * PROBLEM DIFFICULTY RECALIBRATION SCRIPT
 *
 * This script analyzes problem content and recalibrates IRT difficulty values
 * based on actual problem characteristics:
 * - Number size (larger numbers = harder)
 * - Operation complexity (more steps = harder)
 * - Fraction denominators (different denominators = harder)
 * - Skill's base difficulty level
 *
 * Run with: node scripts/recalibrate-problem-difficulties.js
 *
 * Options:
 *   --dry-run    Show what would be changed without modifying database
 *   --verbose    Show detailed information for each problem
 *   --skill=X    Only recalibrate problems for a specific skill
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const Skill = require('../models/skill');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const SKILL_FILTER = args.find(a => a.startsWith('--skill='))?.split('=')[1];

// Base difficulty by skill category (IRT scale: -3 to +3)
const CATEGORY_BASE_DIFFICULTY = {
  // Elementary (K-2)
  'counting-cardinality': -2.5,
  'number-recognition': -2.3,
  'addition-subtraction': -2.0,

  // Elementary (3-5)
  'place-value': -1.5,
  'multiplication-division': -1.2,
  'fractions': -0.8,
  'decimals': -0.5,

  // Middle School
  'ratios-proportions': 0.0,
  'percent': 0.2,
  'integers-rationals': 0.3,
  'expressions': 0.5,
  'equations': 0.8,

  // Algebra 1
  'linear-equations': 1.0,
  'inequalities': 1.2,
  'graphing': 1.0,
  'slope': 1.0,
  'systems': 1.5,

  // Algebra 2
  'polynomials': 1.8,
  'quadratics': 1.8,
  'exponentials-logarithms': 2.0,
  'functions': 1.6,

  // Pre-Calculus
  'trigonometry': 2.2,
  'sequences-series': 2.3,

  // Calculus
  'limits': 2.8,
  'derivatives': 3.0,
  'integration': 3.2,
  'integrals': 3.0,

  // Statistics
  'statistics': 1.0,
  'probability': 1.2
};

/**
 * Analyze problem content and calculate complexity modifiers
 */
function analyzeComplexity(content, skillId) {
  let modifier = 0;
  const c = content.toLowerCase();

  // ============ NUMBER SIZE ANALYSIS ============
  // Extract all numbers from the content
  const numbers = content.match(/-?\d+(\.\d+)?/g) || [];
  const absNumbers = numbers.map(n => Math.abs(parseFloat(n)));
  const maxNumber = Math.max(...absNumbers, 0);

  // Larger numbers = harder
  if (maxNumber > 1000) modifier += 0.5;
  else if (maxNumber > 100) modifier += 0.3;
  else if (maxNumber > 20) modifier += 0.1;
  else if (maxNumber <= 10) modifier -= 0.2;

  // Negative numbers add complexity
  if (numbers.some(n => n.startsWith('-'))) {
    modifier += 0.2;
  }

  // ============ FRACTION ANALYSIS ============
  const fractions = content.match(/\d+\/\d+/g) || [];
  if (fractions.length > 0) {
    // Extract denominators
    const denominators = fractions.map(f => parseInt(f.split('/')[1]));
    const uniqueDenoms = [...new Set(denominators)];

    // Different denominators = harder (need to find common denominator)
    if (uniqueDenoms.length > 1) {
      modifier += 0.4;

      // Check if denominators are NOT multiples of each other
      const sorted = [...uniqueDenoms].sort((a, b) => a - b);
      if (sorted.length >= 2 && sorted[1] % sorted[0] !== 0) {
        modifier += 0.3;  // True LCD needed
      }
    }

    // Large denominators
    if (Math.max(...denominators) > 10) modifier += 0.2;
  }

  // ============ OPERATION COMPLEXITY ============
  // Count operators
  const operators = (content.match(/[+\-×÷*/^]/g) || []).length;
  if (operators > 3) modifier += 0.3;
  else if (operators > 1) modifier += 0.1;

  // Multi-step indicators
  if (c.includes('then') || c.includes('first') || c.includes('next')) {
    modifier += 0.2;
  }

  // ============ EQUATION COMPLEXITY ============
  // Variables on both sides
  if (/\dx.*=.*\dx/.test(content) || /x.*[+\-].*=.*[+\-].*x/.test(content)) {
    modifier += 0.3;
  }

  // Quadratic terms
  if (content.includes('x²') || content.includes('x^2') || content.includes('x2')) {
    modifier += 0.4;
  }

  // Multiple variables
  const variables = content.match(/[xyz]/gi) || [];
  const uniqueVars = new Set(variables.map(v => v.toLowerCase()));
  if (uniqueVars.size > 1) modifier += 0.2;

  // ============ SLOPE-SPECIFIC ANALYSIS ============
  if (skillId && skillId.includes('slope')) {
    // Check point coordinates
    const coords = content.match(/\([-\d]+,\s*[-\d]+\)/g) || [];
    if (coords.length >= 2) {
      // Extract all coordinate numbers
      const coordNums = coords.join('').match(/-?\d+/g) || [];
      const maxCoord = Math.max(...coordNums.map(n => Math.abs(parseInt(n))));

      if (maxCoord > 5) modifier += 0.2;
      if (coordNums.some(n => parseInt(n) < 0)) modifier += 0.1;
    }

    // Horizontal/vertical lines are easier
    if (c.includes('horizontal') || c.includes('vertical')) {
      modifier -= 0.3;
    }
  }

  // ============ CALCULUS-SPECIFIC ============
  if (c.includes('derivative') || c.includes('d/dx')) {
    // Higher powers are harder
    const powers = content.match(/\^(\d+)/g) || [];
    const maxPower = Math.max(...powers.map(p => parseInt(p.substring(1))), 1);
    if (maxPower > 3) modifier += 0.3;

    // Chain rule, product rule
    if (c.includes('sin') || c.includes('cos') || c.includes('tan')) modifier += 0.5;
    if (c.includes('ln') || c.includes('log')) modifier += 0.4;
  }

  if (c.includes('integral') || c.includes('∫')) {
    // Definite vs indefinite
    if (content.match(/∫[₀-₉]/)) modifier += 0.2;  // Definite integral
  }

  if (c.includes('limit') || c.includes('lim')) {
    // Limit at infinity is harder
    if (c.includes('∞') || c.includes('infinity')) modifier += 0.5;
    // L'Hopital situations
    if (c.includes('0/0') || c.includes('∞/∞')) modifier += 0.6;
  }

  // ============ WORD PROBLEM COMPLEXITY ============
  const wordCount = content.split(/\s+/).length;
  if (wordCount > 30) modifier += 0.3;
  else if (wordCount > 20) modifier += 0.2;

  // Multiple steps in word problem
  if (c.includes('how many') && c.includes('total')) modifier += 0.2;
  if (c.includes('each') && (c.includes('total') || c.includes('altogether'))) modifier += 0.1;

  return modifier;
}

/**
 * Get base difficulty for a skill
 */
function getSkillBaseDifficulty(skill) {
  // Priority 1: Skill's calibrated irtDifficulty
  if (skill.irtDifficulty && skill.irtDifficulty !== 0) {
    return skill.irtDifficulty;
  }

  // Priority 2: Course-based estimation
  if (skill.course) {
    const courseLower = skill.course.toLowerCase();
    if (courseLower.includes('calculus')) return 3.0;
    if (courseLower.includes('precalc') || courseLower.includes('pre-calc')) return 2.5;
    if (courseLower.includes('algebra 2')) return 1.8;
    if (courseLower.includes('geometry')) return 1.2;
    if (courseLower.includes('algebra 1') || courseLower.includes('algebra')) return 1.0;
    if (courseLower.includes('grade 8')) return 0.5;
    if (courseLower.includes('grade 7')) return 0.3;
    if (courseLower.includes('grade 6')) return 0.0;
    if (courseLower.includes('grade 5')) return -0.5;
    if (courseLower.includes('grade 4')) return -1.0;
    if (courseLower.includes('grade 3')) return -1.5;
    if (courseLower.includes('grade 2')) return -2.0;
    if (courseLower.includes('grade 1')) return -2.3;
    if (courseLower.includes('kinder')) return -2.5;
  }

  // Priority 3: Category-based
  return CATEGORY_BASE_DIFFICULTY[skill.category] || 0;
}

/**
 * Calculate new IRT difficulty for a problem
 */
function calculateNewDifficulty(problem, skill) {
  const baseDifficulty = getSkillBaseDifficulty(skill);
  const modifier = analyzeComplexity(problem.content || '', problem.skillId);

  // Combine base + modifier, clamped to IRT range
  let newDifficulty = baseDifficulty + modifier;
  newDifficulty = Math.max(-3, Math.min(3, newDifficulty));

  // Round to 1 decimal place
  return Math.round(newDifficulty * 10) / 10;
}

async function recalibrateProblems() {
  console.log('='.repeat(70));
  console.log('PROBLEM DIFFICULTY RECALIBRATION');
  console.log('='.repeat(70));

  if (DRY_RUN) {
    console.log('\n*** DRY RUN MODE - No changes will be saved ***\n');
  }

  // Connect to MongoDB
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.\n');

  // Load skills for reference
  const skills = await Skill.find({}).lean();
  const skillMap = new Map(skills.map(s => [s.skillId, s]));
  console.log(`Loaded ${skills.length} skills for reference.\n`);

  // Build query
  const query = { isActive: true };
  if (SKILL_FILTER) {
    query.skillId = SKILL_FILTER;
    console.log(`Filtering to skill: ${SKILL_FILTER}\n`);
  }

  // Load problems
  const problems = await Problem.find(query);
  console.log(`Found ${problems.length} problems to analyze.\n`);

  // Track statistics
  const stats = {
    analyzed: 0,
    changed: 0,
    noChange: 0,
    noSkill: 0,
    bySkill: {}
  };

  // Process each problem
  for (const problem of problems) {
    const skill = skillMap.get(problem.skillId);

    if (!skill) {
      stats.noSkill++;
      continue;
    }

    const oldDifficulty = problem.irtParameters?.difficulty || 0;
    const newDifficulty = calculateNewDifficulty(problem, skill);
    const change = Math.abs(newDifficulty - oldDifficulty);

    stats.analyzed++;

    // Track by skill
    if (!stats.bySkill[problem.skillId]) {
      stats.bySkill[problem.skillId] = { total: 0, changed: 0 };
    }
    stats.bySkill[problem.skillId].total++;

    if (change > 0.05) {  // Only count significant changes
      stats.changed++;
      stats.bySkill[problem.skillId].changed++;

      if (VERBOSE) {
        console.log(`\n[${problem.skillId}] ${problem.problemId}`);
        console.log(`  Content: ${problem.content?.substring(0, 60)}...`);
        console.log(`  Old: ${oldDifficulty.toFixed(1)} → New: ${newDifficulty.toFixed(1)} (Δ${(newDifficulty - oldDifficulty).toFixed(1)})`);
      }

      if (!DRY_RUN) {
        problem.irtParameters.difficulty = newDifficulty;
        problem.irtParameters.calibrationConfidence = 'algorithmic';
        await problem.save();
      }
    } else {
      stats.noChange++;
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('RECALIBRATION SUMMARY');
  console.log('='.repeat(70));

  console.log(`\nProblems analyzed: ${stats.analyzed}`);
  console.log(`Problems recalibrated: ${stats.changed}`);
  console.log(`Problems unchanged: ${stats.noChange}`);
  console.log(`Problems without valid skill: ${stats.noSkill}`);

  // Show skills with most changes
  const sortedSkills = Object.entries(stats.bySkill)
    .sort((a, b) => b[1].changed - a[1].changed)
    .slice(0, 15);

  console.log('\n--- Skills with Most Changes ---');
  for (const [skillId, data] of sortedSkills) {
    if (data.changed > 0) {
      console.log(`  ${skillId}: ${data.changed}/${data.total} problems recalibrated`);
    }
  }

  if (DRY_RUN) {
    console.log('\n*** DRY RUN COMPLETE - Run without --dry-run to apply changes ***');
  }

  await mongoose.disconnect();
  console.log('\nDone!');
}

// Run the script
recalibrateProblems().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
