// scripts/seed-skills.js
// Seeds the skills collection with Ready for Algebra 1 skills

require('dotenv').config();
const mongoose = require('mongoose');
const Skill = require('../models/skill');
const fs = require('fs');
const path = require('path');

async function seedSkills() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to MongoDB');

    // Read skills JSON
    const skillsPath = path.join(__dirname, '../seeds/skills-ready-for-algebra.json');
    const skillsData = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));

    console.log(`\nLoaded ${skillsData.length} skills from JSON file`);

    // Clear existing skills (optional - comment out if you want to preserve existing)
    const existingCount = await Skill.countDocuments();
    if (existingCount > 0) {
      console.log(`\nFound ${existingCount} existing skills in database`);
      console.log('Clearing existing skills...');
      await Skill.deleteMany({});
      console.log('✓ Cleared existing skills');
    }

    // Insert skills
    console.log('\nInserting skills...');
    const inserted = await Skill.insertMany(skillsData);
    console.log(`✓ Inserted ${inserted.length} skills`);

    // Verify and display summary
    console.log('\n=== SKILLS BY CATEGORY ===');
    const categories = await Skill.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    categories.forEach(cat => {
      console.log(`  ${cat._id}: ${cat.count} skills`);
    });

    console.log('\n=== SAMPLE SKILLS ===');
    const samples = await Skill.find().limit(5);
    samples.forEach(skill => {
      console.log(`  • ${skill.displayName} (${skill.skillId})`);
      console.log(`    Prerequisites: ${skill.prerequisites.length > 0 ? skill.prerequisites.join(', ') : 'none'}`);
      console.log(`    Enables: ${skill.enables.length > 0 ? skill.enables.join(', ') : 'none'}`);
    });

    console.log('\n✓ Skills seeding complete!\n');

  } catch (error) {
    console.error('Error seeding skills:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run if executed directly
if (require.main === module) {
  seedSkills();
}

module.exports = seedSkills;
