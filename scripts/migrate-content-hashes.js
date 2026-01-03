/**
 * Migration: Add contentHash to existing problems
 * This enables duplicate detection for future inserts
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const Problem = require('../models/problem');
require('dotenv').config();

function generateContentHash(skillId, content) {
  const hashInput = `${skillId}:${String(content).trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

async function migrateContentHashes() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mathmatix_dev');
    console.log('Connected to MongoDB\n');

    // Find problems without contentHash
    const problems = await Problem.find({ contentHash: { $exists: false } }).lean();
    console.log(`Found ${problems.length} problems without contentHash\n`);

    if (problems.length === 0) {
      console.log('✓ All problems already have contentHash!');
      await mongoose.disconnect();
      return;
    }

    console.log('Generating content hashes...\n');

    let updated = 0;
    let duplicatesFound = 0;
    const seenHashes = new Set();

    for (const problem of problems) {
      const hash = generateContentHash(problem.skillId, problem.content);

      if (seenHashes.has(hash)) {
        duplicatesFound++;
        console.log(`⚠️  Duplicate detected: ${problem.problemId} (${problem.skillId})`);
      } else {
        seenHashes.add(hash);
      }

      try {
        await Problem.updateOne(
          { _id: problem._id },
          { $set: { contentHash: hash } }
        );
        updated++;

        if (updated % 1000 === 0) {
          console.log(`  Processed ${updated}/${problems.length}...`);
        }
      } catch (error) {
        if (error.code === 11000) {
          // Duplicate key error - this problem is a duplicate
          console.log(`❌ Duplicate content found for ${problem.problemId}, skipping`);
        } else {
          console.error(`Error updating ${problem.problemId}:`, error.message);
        }
      }
    }

    console.log(`\n✅ Updated ${updated} problems with contentHash`);
    console.log(`⚠️  Found ${duplicatesFound} duplicates (flagged but not deleted)`);
    console.log('\nNote: Run deduplicate-problems-batched.js to remove duplicates\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

migrateContentHashes();
