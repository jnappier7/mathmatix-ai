/**
 * IMPORT CLEANED SKILLS
 *
 * Imports the cleaned skill set with prerequisite graph data.
 * REPLACES all existing skills (clean swap).
 *
 * Usage: node scripts/import-cleaned-skills.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Skill = require('../models/skill');
const fs = require('fs');
const path = require('path');

async function importCleanedSkills() {
  try {
    console.log('='.repeat(60));
    console.log('IMPORTING CLEANED SKILLS');
    console.log('='.repeat(60));

    // Connect to MongoDB
    console.log('\nConnecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Read the cleaned skills JSON
    const skillsPath = path.join(__dirname, '../skills.with_prereqs.json');

    if (!fs.existsSync(skillsPath)) {
      throw new Error(`Skills file not found: ${skillsPath}`);
    }

    const skillsData = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
    console.log(`\nLoaded ${skillsData.length} skills from skills.with_prereqs.json`);

    // Show what we're about to replace
    const existingCount = await Skill.countDocuments();
    console.log(`\nExisting skills in database: ${existingCount}`);

    // Confirm replacement
    console.log('\n*** This will DELETE all existing skills and replace with new data ***');

    // Delete existing skills
    console.log('\nDeleting existing skills...');
    await Skill.deleteMany({});
    console.log('Deleted all existing skills');

    // Transform and validate skills
    console.log('\nPreparing skills for import...');
    const transformedSkills = skillsData.map(skill => ({
      skillId: skill.skillId,
      displayName: skill.displayName,
      description: skill.description,
      category: skill.category,
      prerequisites: skill.prerequisites || [],
      enables: skill.enables || [],
      gradeBand: skill.gradeBand,
      ohioDomain: skill.ohioDomain,
      isActive: skill.isActive !== false,
      source: skill.source || 'cleaned_from_archive',
      strand: skill.strand,
      depth: skill.depth
    }));

    // Insert new skills
    console.log('\nInserting new skills...');
    const inserted = await Skill.insertMany(transformedSkills, { ordered: false });
    console.log(`Inserted ${inserted.length} skills`);

    // Verification summary
    console.log('\n' + '='.repeat(60));
    console.log('IMPORT SUMMARY');
    console.log('='.repeat(60));

    // Count by strand
    const strandCounts = await Skill.aggregate([
      { $group: { _id: '$strand', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log('\nSkills by strand:');
    strandCounts.forEach(s => console.log(`  ${s._id || 'no strand'}: ${s.count}`));

    // Count by gradeBand
    const gradeCounts = await Skill.aggregate([
      { $group: { _id: '$gradeBand', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    console.log('\nSkills by grade band:');
    gradeCounts.forEach(g => console.log(`  ${g._id}: ${g.count}`));

    // Prerequisite stats
    const withPrereqs = await Skill.countDocuments({ 'prerequisites.0': { $exists: true } });
    console.log(`\nSkills with prerequisites: ${withPrereqs}`);

    // Root skills (depth 0)
    const rootSkills = await Skill.find({ depth: 0 }).select('skillId strand');
    console.log(`\nRoot skills (depth 0): ${rootSkills.length}`);
    rootSkills.forEach(s => console.log(`  ${s.skillId} (${s.strand})`));

    console.log('\n' + '='.repeat(60));
    console.log('SKILLS IMPORT COMPLETE');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\nImport failed:', error.message);
    if (error.writeErrors) {
      console.error('Write errors:', error.writeErrors.length);
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run if executed directly
if (require.main === module) {
  importCleanedSkills();
}

module.exports = importCleanedSkills;
