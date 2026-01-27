/**
 * IMPORT CLEANED PROBLEMS
 *
 * Imports the cleaned problem set with field transformations.
 * REPLACES all existing problems (clean swap).
 *
 * Transformations:
 * - prompt → content
 * - difficulty (1-5) → irtParameters.difficulty (-3 to +3)
 * - answerType: "constructed-response" → inferred type
 * - answer.value → answer (preserves equivalents in metadata)
 *
 * Usage: node scripts/import-cleaned-problems.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const fs = require('fs');
const path = require('path');

// Map 1-5 difficulty to IRT scale (-3 to +3)
function mapDifficultyToIRT(diff) {
  // 1 → -1.5 (easy)
  // 2 → -0.5 (below average)
  // 3 → 0.5 (above average)
  // 4 → 1.5 (hard)
  // 5 → 2.5 (very hard)
  const mapping = {
    1: -1.5,
    2: -0.5,
    3: 0.5,
    4: 1.5,
    5: 2.5
  };
  return mapping[diff] || 0;
}

// Infer answer type from the answer value
function inferAnswerType(answer) {
  if (!answer || !answer.value) return 'integer';

  const val = String(answer.value).trim();

  // Check for fraction (contains /)
  if (val.includes('/')) return 'fraction';

  // Check for decimal (contains . and is a number)
  if (val.includes('.') && !isNaN(parseFloat(val))) return 'decimal';

  // Check for expression (contains variables or operators)
  if (/[a-zA-Z]/.test(val) || /[\+\-\*\/\^]/.test(val.replace(/^-?\d/, ''))) {
    return 'expression';
  }

  // Default to integer
  if (!isNaN(parseInt(val))) return 'integer';

  return 'expression';
}

// Transform a problem from the JSON format to our schema
function transformProblem(problem) {
  const answerType = inferAnswerType(problem.answer);

  // Extract the primary answer value
  let answerValue = problem.answer?.value;
  if (answerValue === undefined) {
    answerValue = problem.answer;
  }

  return {
    problemId: problem.problemId,
    skillId: problem.skillId,
    content: problem.prompt, // prompt → content
    answer: answerValue,
    answerType: answerType,

    irtParameters: {
      difficulty: mapDifficultyToIRT(problem.difficulty),
      discrimination: 1.0, // Default, will be calibrated over time
      calibrationConfidence: 'expert',
      attemptsCount: 0
    },

    metadata: {
      tags: problem.tags || [],
      source: 'imported',
      gradeLevel: problem.gradeBand,
      // Store equivalents for answer checking
      equivalentAnswers: problem.answer?.equivalents || [],
      importDate: new Date()
    },

    isActive: problem.isActive !== false
  };
}

async function importCleanedProblems() {
  try {
    console.log('='.repeat(60));
    console.log('IMPORTING CLEANED PROBLEMS');
    console.log('='.repeat(60));

    // Connect to MongoDB
    console.log('\nConnecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Read the cleaned problems JSON
    const problemsPath = path.join(__dirname, '../mathmatixdb.problems.json');

    if (!fs.existsSync(problemsPath)) {
      throw new Error(`Problems file not found: ${problemsPath}`);
    }

    console.log('\nReading problems file (this may take a moment)...');
    const problemsData = JSON.parse(fs.readFileSync(problemsPath, 'utf8'));
    console.log(`Loaded ${problemsData.length} problems from mathmatixdb.problems.json`);

    // Show what we're about to replace
    const existingCount = await Problem.countDocuments();
    console.log(`\nExisting problems in database: ${existingCount}`);

    console.log('\n*** This will DELETE all existing problems and replace with new data ***');

    // Delete existing problems
    console.log('\nDeleting existing problems...');
    await Problem.deleteMany({});
    console.log('Deleted all existing problems');

    // Transform problems
    console.log('\nTransforming problems...');
    const transformedProblems = problemsData.map(transformProblem);

    // Insert in batches to avoid memory issues
    const BATCH_SIZE = 1000;
    let inserted = 0;
    let errors = 0;

    console.log(`\nInserting ${transformedProblems.length} problems in batches of ${BATCH_SIZE}...`);

    for (let i = 0; i < transformedProblems.length; i += BATCH_SIZE) {
      const batch = transformedProblems.slice(i, i + BATCH_SIZE);

      try {
        await Problem.insertMany(batch, { ordered: false });
        inserted += batch.length;
      } catch (err) {
        // Some may have failed due to duplicates, count successful ones
        if (err.insertedDocs) {
          inserted += err.insertedDocs.length;
          errors += batch.length - err.insertedDocs.length;
        } else {
          errors += batch.length;
        }
      }

      // Progress indicator
      const progress = Math.round(((i + batch.length) / transformedProblems.length) * 100);
      process.stdout.write(`\rProgress: ${progress}% (${inserted} inserted, ${errors} errors)`);
    }

    console.log('\n');

    // Verification summary
    console.log('='.repeat(60));
    console.log('IMPORT SUMMARY');
    console.log('='.repeat(60));

    const finalCount = await Problem.countDocuments();
    console.log(`\nTotal problems in database: ${finalCount}`);

    // Count by skill
    const skillCounts = await Problem.aggregate([
      { $group: { _id: '$skillId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    console.log('\nTop 10 skills by problem count:');
    skillCounts.forEach(s => console.log(`  ${s._id}: ${s.count}`));

    // Count by difficulty
    const difficultyCounts = await Problem.aggregate([
      {
        $bucket: {
          groupBy: '$irtParameters.difficulty',
          boundaries: [-3, -1, 0, 1, 2, 3],
          default: 'other',
          output: { count: { $sum: 1 } }
        }
      }
    ]);
    console.log('\nProblems by IRT difficulty:');
    difficultyCounts.forEach(d => console.log(`  ${d._id}: ${d.count}`));

    // Count by answer type
    const typeCounts = await Problem.aggregate([
      { $group: { _id: '$answerType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log('\nProblems by answer type:');
    typeCounts.forEach(t => console.log(`  ${t._id}: ${t.count}`));

    // Skills with problems
    const uniqueSkills = await Problem.distinct('skillId');
    console.log(`\nUnique skills covered: ${uniqueSkills.length}`);

    console.log('\n' + '='.repeat(60));
    console.log('PROBLEMS IMPORT COMPLETE');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\nImport failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run if executed directly
if (require.main === module) {
  importCleanedProblems();
}

module.exports = importCleanedProblems;
