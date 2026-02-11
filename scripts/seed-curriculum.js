// scripts/seed-curriculum.js
// Seeds the skills collection with complete K-Calculus 3 curriculum

// Try to load .env if available, but don't fail if dotenv is missing
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available, will use environment variables or fallback
}

const mongoose = require('mongoose');
const Skill = require('../models/skill');
const fs = require('fs');
const path = require('path');

// MongoDB connection with fallback
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mathmatix_dev';

// All curriculum files in order (K → Calculus 3)
const CURRICULUM_FILES = [
  // Elementary (K-5)
  'skills-kindergarten.json',
  'skills-grade-1.json',
  'skills-grade-2.json',
  'skills-grade-3.json',
  'skills-grade-4.json',
  'skills-grade-5.json',

  // Middle School (6-8)
  'skills-grade-6.json',
  'skills-grade-7.json',
  'skills-grade-8.json',

  // High School & College
  'skills-algebra-1.json',
  'skills-geometry.json',
  'skills-algebra-2.json',
  'skills-precalculus.json',
  'skills-ap-calculus-ab.json',
  'skills-calculus-1.json',
  'skills-calculus-2.json',
  'skills-calculus-3.json',

  // Test Prep
  'skills-act-math-prep.json'
];

async function seedCurriculum() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    console.log(`Using: ${MONGO_URI.replace(/:[^:]*@/, ':***@')}`); // Hide password in logs
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected to MongoDB');

    let totalSkills = 0;
    let insertedCount = 0;
    let updatedCount = 0;
    const courseStats = new Map();

    console.log('\n=== LOADING CURRICULUM FILES ===\n');

    // Process each curriculum file
    for (const filename of CURRICULUM_FILES) {
      const filePath = path.join(__dirname, '../seeds', filename);

      if (!fs.existsSync(filePath)) {
        console.log(`⚠ Skipping ${filename} (file not found)`);
        continue;
      }

      const skillsData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const courseName = skillsData[0]?.course || filename.replace('skills-', '').replace('.json', '');

      console.log(`📚 ${courseName}: ${skillsData.length} skills`);

      // Upsert each skill (update if exists, insert if new)
      for (const skillData of skillsData) {
        const result = await Skill.updateOne(
          { skillId: skillData.skillId },
          { $set: skillData },
          { upsert: true }
        );

        if (result.upsertedCount > 0) {
          insertedCount++;
        } else if (result.modifiedCount > 0) {
          updatedCount++;
        }

        totalSkills++;

        // Track course statistics
        if (skillData.course) {
          if (!courseStats.has(skillData.course)) {
            courseStats.set(skillData.course, { total: 0, byQuarter: {} });
          }
          const stats = courseStats.get(skillData.course);
          stats.total++;

          if (skillData.quarter) {
            stats.byQuarter[skillData.quarter] = (stats.byQuarter[skillData.quarter] || 0) + 1;
          }
        }
      }
    }

    console.log('\n=== SEEDING SUMMARY ===');
    console.log(`Total skills processed: ${totalSkills}`);
    console.log(`  • New skills inserted: ${insertedCount}`);
    console.log(`  • Existing skills updated: ${updatedCount}`);
    console.log(`  • Unchanged: ${totalSkills - insertedCount - updatedCount}`);

    // Display course breakdown
    console.log('\n=== SKILLS BY COURSE ===');
    for (const [course, stats] of courseStats) {
      console.log(`\n${course}: ${stats.total} skills`);
      if (Object.keys(stats.byQuarter).length > 0) {
        for (let q = 1; q <= 4; q++) {
          if (stats.byQuarter[q]) {
            console.log(`  Q${q}: ${stats.byQuarter[q]} skills`);
          }
        }
      }
    }

    // Display category breakdown
    console.log('\n=== SKILLS BY CATEGORY ===');
    const categories = await Skill.aggregate([
      { $match: { course: { $exists: true } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    categories.slice(0, 15).forEach(cat => {
      console.log(`  ${cat._id}: ${cat.count} skills`);
    });
    if (categories.length > 15) {
      console.log(`  ... and ${categories.length - 15} more categories`);
    }

    // Verify prerequisite chains
    console.log('\n=== PREREQUISITE VALIDATION ===');
    const allSkills = await Skill.find({ course: { $exists: true } });
    const skillIds = new Set(allSkills.map(s => s.skillId));
    let missingPrereqs = 0;

    for (const skill of allSkills) {
      for (const prereqId of skill.prerequisites) {
        if (!skillIds.has(prereqId)) {
          console.log(`  ⚠ ${skill.skillId} references missing prerequisite: ${prereqId}`);
          missingPrereqs++;
        }
      }
    }

    if (missingPrereqs === 0) {
      console.log('  ✓ All prerequisites valid!');
    } else {
      console.log(`  ⚠ Found ${missingPrereqs} missing prerequisite references`);
    }

    // Display sample skills from different levels
    console.log('\n=== SAMPLE SKILLS ===');

    const sampleCourses = ['Kindergarten', 'Grade 6 Math', 'Algebra 1', 'Calculus 1'];
    for (const course of sampleCourses) {
      const sample = await Skill.findOne({ course });
      if (sample) {
        console.log(`\n${course}: ${sample.displayName}`);
        console.log(`  Quarter: ${sample.quarter || 'N/A'} | Unit: ${sample.unit || 'N/A'}`);
        console.log(`  Prerequisites: ${sample.prerequisites.length > 0 ? sample.prerequisites.slice(0, 2).join(', ') : 'none'}`);
        console.log(`  Difficulty: ${sample.difficultyLevel}/10 | Fluency: ${sample.fluencyMetadata?.baseFluencyTime || 'N/A'}s`);
      }
    }

    console.log('\n✓ Curriculum seeding complete!\n');

  } catch (error) {
    console.error('Error seeding curriculum:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run if executed directly
if (require.main === module) {
  seedCurriculum();
}

module.exports = seedCurriculum;
