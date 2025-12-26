#!/usr/bin/env node
/**
 * Clear all problems from the database
 *
 * Usage: node scripts/clearProblems.js
 */

// Load environment variables
try {
  require('dotenv').config();
} catch (e) {
  console.log('Running without dotenv (environment should be pre-configured)');
}

const mongoose = require('mongoose');
const Problem = require('../models/problem');

async function clearProblems() {
  try {
    // Connect to database
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Count existing problems
    const count = await Problem.countDocuments();
    console.log(`Found ${count} existing problems`);

    if (count > 0) {
      // Delete all problems
      console.log('Deleting all problems...');
      const result = await Problem.deleteMany({});
      console.log(`✅ Deleted ${result.deletedCount} problems`);
    } else {
      console.log('✅ No problems to delete');
    }

    // Verify deletion
    const remainingCount = await Problem.countDocuments();
    console.log(`\nRemaining problems: ${remainingCount}`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

clearProblems();
