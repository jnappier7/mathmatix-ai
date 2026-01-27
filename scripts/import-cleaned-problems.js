/**
 * IMPORT CLEANED PROBLEMS
 *
 * Imports the cleaned problem set directly (schema matches JSON format).
 * REPLACES all existing problems (clean swap).
 *
 * Usage: node scripts/import-cleaned-problems.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const fs = require('fs');
const path = require('path');

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

    // Insert in batches to avoid memory issues
    const BATCH_SIZE = 1000;
    let inserted = 0;
    let errors = 0;

    console.log(`\nInserting ${problemsData.length} problems in batches of ${BATCH_SIZE}...`);

    for (let i = 0; i < problemsData.length; i += BATCH_SIZE) {
      const batch = problemsData.slice(i, i + BATCH_SIZE);

      try {
        await Problem.insertMany(batch, { ordered: false });
        inserted += batch.length;
      } catch (err) {
        // Some may have failed due to duplicates or validation, count successful ones
        if (err.insertedDocs) {
          inserted += err.insertedDocs.length;
          errors += batch.length - err.insertedDocs.length;
        } else if (err.result && err.result.nInserted) {
          inserted += err.result.nInserted;
          errors += batch.length - err.result.nInserted;
        } else {
          // Log first error for debugging
          if (errors === 0) {
            console.error('\nFirst batch error:', err.message);
            if (err.writeErrors && err.writeErrors[0]) {
              console.error('First write error:', err.writeErrors[0].errmsg);
            }
          }
          errors += batch.length;
        }
      }

      // Progress indicator
      const progress = Math.round(((i + batch.length) / problemsData.length) * 100);
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
      { $group: { _id: '$difficulty', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    console.log('\nProblems by difficulty (1-5):');
    difficultyCounts.forEach(d => console.log(`  Level ${d._id}: ${d.count}`));

    // Count by gradeBand
    const gradeCounts = await Problem.aggregate([
      { $group: { _id: '$gradeBand', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log('\nProblems by gradeBand:');
    gradeCounts.forEach(g => console.log(`  ${g._id || 'unknown'}: ${g.count}`));

    // Skills with problems
    const uniqueSkills = await Problem.distinct('skillId');
    console.log(`\nUnique skills covered: ${uniqueSkills.length}`);

    // Sample problem to verify structure
    const sample = await Problem.findOne();
    if (sample) {
      console.log('\nSample problem structure:');
      console.log(`  problemId: ${sample.problemId}`);
      console.log(`  skillId: ${sample.skillId}`);
      console.log(`  prompt: ${sample.prompt?.substring(0, 50)}...`);
      console.log(`  answer: ${JSON.stringify(sample.answer)}`);
      console.log(`  difficulty: ${sample.difficulty}`);
      console.log(`  gradeBand: ${sample.gradeBand}`);
    }

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
