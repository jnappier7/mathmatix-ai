#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

async function checkSkills() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all unique skillIds
    const skills = await Problem.distinct('skillId');
    console.log(`Found ${skills.length} unique skillIds:\n`);

    skills.sort().forEach(skill => {
      console.log(`  - ${skill}`);
    });

    // Count problems per skill
    console.log('\n📊 Problems per skill:');
    for (const skill of skills.slice(0, 10)) {
      const count = await Problem.countDocuments({ skillId: skill });
      console.log(`  ${skill}: ${count} problems`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkSkills();
