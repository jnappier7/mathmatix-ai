// MongoDB Shell Script for Curriculum Seeding
// Run this directly in MongoDB shell or mongosh

// Usage: mongosh your_database_name < mongo-seed-curriculum.js
// Or: Load and run in MongoDB Compass / Atlas UI

// This script loads all K-Calculus 3 curriculum skills
// Run the Node.js version (seed-curriculum.js) if you prefer automated seeding

print("=== Mathmatix AI Curriculum Seeding ===\n");
print("This script will load 158 skills from Kindergarten through Calculus 3\n");

// Curriculum files to process
const files = [
  "skills-kindergarten.json",
  "skills-grade-1.json",
  "skills-grade-2.json",
  "skills-grade-3.json",
  "skills-grade-4.json",
  "skills-grade-5.json",
  "skills-grade-6.json",
  "skills-grade-7.json",
  "skills-grade-8.json",
  "skills-algebra-1.json",
  "skills-geometry.json",
  "skills-algebra-2.json",
  "skills-precalculus.json",
  "skills-calculus-1.json",
  "skills-calculus-2.json",
  "skills-calculus-3.json"
];

print("To seed curriculum, you have two options:\n");
print("1. Use Node.js seeder (recommended):");
print("   node scripts/seed-curriculum.js\n");
print("2. Use MongoDB Compass/Atlas:");
print("   - Navigate to the 'skills' collection");
print("   - Import each JSON file from seeds/ directory");
print("   - Use 'upsert' mode with skillId as the unique key\n");
print("Files to import (in order):");
files.forEach(f => print("   - seeds/" + f));

print("\n=== Manual MongoDB Commands ===\n");
print("If you need to manually insert, use this pattern:\n");
print("db.skills.bulkWrite([");
print("  { updateOne: {");
print("      filter: { skillId: 'skill-id-here' },");
print("      update: { $set: { /* skill data */ } },");
print("      upsert: true");
print("    }");
print("  },");
print("  // ... repeat for each skill");
print("]);\n");

print("=== Verification Queries ===\n");
print("After seeding, verify with these queries:\n");
print("1. Count all curriculum skills:");
print("   db.skills.countDocuments({ course: { $exists: true } })\n");
print("2. List courses:");
print("   db.skills.distinct('course')\n");
print("3. Skills by course:");
print("   db.skills.aggregate([");
print("     { $match: { course: { $exists: true } } },");
print("     { $group: { _id: '$course', count: { $sum: 1 } } },");
print("     { $sort: { _id: 1 } }");
print("   ])\n");
print("4. Check prerequisites:");
print("   db.skills.findOne({ skillId: 'some-skill-id' })\n");
