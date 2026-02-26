#!/usr/bin/env node
/**
 * MIGRATION: Extract iepPlan from User documents into IEPPlan collection
 *
 * This migration:
 * 1. Finds all users with non-empty iepPlan data
 * 2. Creates corresponding IEPPlan documents
 * 3. Preserves all goals, history, accommodations, and preferences
 * 4. Does NOT delete iepPlan from User (backward compatibility)
 *
 * Run: node scripts/migrateIepToCollection.js
 * Idempotent: Safe to run multiple times (uses upsert).
 *
 * @module scripts/migrateIepToCollection
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: No MONGODB_URI or MONGO_URI in environment');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const User = require('../models/user');
  const IEPPlan = require('../models/iepPlan');

  // Find users with IEP data
  const usersWithIep = await User.find({
    $or: [
      { 'iepPlan.goals': { $exists: true, $ne: [] } },
      { 'iepPlan.accommodations': { $exists: true } },
      { 'iepPlan.readingLevel': { $exists: true, $ne: null } },
    ],
  }).select('_id iepPlan').lean();

  console.log(`Found ${usersWithIep.length} users with IEP data`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of usersWithIep) {
    try {
      const iep = user.iepPlan;
      if (!iep) { skipped++; continue; }

      // Check if any meaningful data exists
      const hasAccommodations = iep.accommodations && Object.values(iep.accommodations).some(v => v === true);
      const hasGoals = iep.goals && iep.goals.length > 0;
      const hasReadingLevel = iep.readingLevel != null;
      const hasScaffolds = iep.preferredScaffolds && iep.preferredScaffolds.length > 0;

      if (!hasAccommodations && !hasGoals && !hasReadingLevel && !hasScaffolds) {
        skipped++;
        continue;
      }

      const result = await IEPPlan.updateOne(
        { userId: user._id },
        {
          $set: {
            userId: user._id,
            accommodations: iep.accommodations || {},
            goals: iep.goals || [],
            readingLevel: iep.readingLevel || null,
            preferredScaffolds: iep.preferredScaffolds || [],
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0) {
        created++;
      } else if (result.modifiedCount > 0) {
        updated++;
      } else {
        skipped++; // Already up to date
      }
    } catch (err) {
      errors++;
      console.error(`  Error migrating user ${user._id}:`, err.message);
    }
  }

  console.log('\n--- Migration Complete ---');
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors:  ${errors}`);
  console.log(`  Total:   ${usersWithIep.length}`);

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
