// scripts/seed-pattern-skills.js
// Seeds pattern-based skills into the database (additive, doesn't delete existing)

require('dotenv').config();
const mongoose = require('mongoose');
const Skill = require('../models/skill');
const fs = require('fs');
const path = require('path');

async function seedPatternSkills() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to MongoDB');

    // Read pattern skills JSON
    const skillsPath = path.join(__dirname, '../seeds/skills-pattern-based.json');
    const skillsData = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));

    console.log(`\nLoaded ${skillsData.length} pattern-based skills from JSON file`);

    // Check existing skills
    const existingCount = await Skill.countDocuments();
    console.log(`Current database has ${existingCount} skills`);

    // Use bulk operations for efficient upsert
    const bulkOps = skillsData.map(skill => ({
      updateOne: {
        filter: { skillId: skill.skillId },
        update: { $set: skill },
        upsert: true
      }
    }));

    console.log('\nUpserting skills (updating existing, adding new)...');
    const result = await Skill.bulkWrite(bulkOps);

    console.log(`✓ Inserted: ${result.upsertedCount} new skills`);
    console.log(`✓ Updated: ${result.modifiedCount} existing skills`);
    console.log(`✓ Matched: ${result.matchedCount} skills`);

    // Verify final count
    const finalCount = await Skill.countDocuments();
    console.log(`\nTotal skills in database: ${finalCount}`);

    // Display pattern skill summary
    console.log('\n=== PATTERN SKILLS BY UNIT ===');
    const patternSkills = await Skill.aggregate([
      { $match: { unit: { $regex: /Pattern/ } } },
      { $group: { _id: '$unit', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    patternSkills.forEach(cat => {
      console.log(`  ${cat._id}: ${cat.count} skills`);
    });

    // Sample skills from each tier
    console.log('\n=== SAMPLE PATTERN SKILLS ===');
    const tiers = ['Tier 1', 'Tier 2', 'Tier 3'];
    for (const tier of tiers) {
      const sample = await Skill.findOne({ unit: { $regex: tier } });
      if (sample) {
        console.log(`\n  ${tier}: ${sample.displayName} (${sample.skillId})`);
        console.log(`    Course: ${sample.course}`);
        console.log(`    Difficulty: ${sample.difficultyLevel}/10`);
      }
    }

    console.log('\n✓ Pattern skills seeding complete!\n');

  } catch (error) {
    console.error('Error seeding pattern skills:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run if executed directly
if (require.main === module) {
  seedPatternSkills();
}

module.exports = seedPatternSkills;
