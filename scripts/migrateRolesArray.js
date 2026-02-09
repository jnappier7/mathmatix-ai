/**
 * Migration Script: Backfill `roles` array from `role` field
 *
 * For every user that has a `role` but no `roles` array (or an empty one),
 * sets `roles` to `[role]`.
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   node scripts/migrateRolesArray.js
 *
 * Or with a custom MONGODB_URI:
 *   MONGODB_URI=mongodb://localhost:27017/mathmatix node scripts/migrateRolesArray.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mathmatix';

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  const User = require('../models/user');

  // Find all users with an empty or missing roles array
  const users = await User.find({
    $or: [
      { roles: { $exists: false } },
      { roles: { $size: 0 } },
      { roles: null }
    ]
  }).select('_id role roles firstName lastName email');

  console.log(`Found ${users.length} user(s) needing roles backfill.`);

  let updated = 0;
  for (const user of users) {
    if (!user.role) {
      console.log(`  SKIP: ${user.email} - no role field set`);
      continue;
    }
    await User.updateOne(
      { _id: user._id },
      { $set: { roles: [user.role] } }
    );
    updated++;
    if (updated % 100 === 0) {
      console.log(`  ...updated ${updated} users`);
    }
  }

  console.log(`Done. Updated ${updated} user(s).`);
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
