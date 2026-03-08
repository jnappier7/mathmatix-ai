/**
 * Seed Load Test Accounts
 *
 * Creates dedicated accounts for load testing that won't interfere with
 * real user data or other test data.
 *
 * Run with: node scripts/seedLoadTestAccounts.js
 * Clear with: node scripts/seedLoadTestAccounts.js --clear
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');

const LOAD_TEST_PREFIX = 'loadtest-';
const PASSWORD = 'LoadTest123!';

const ACCOUNTS = [
  {
    username: 'loadtest-student',
    email: 'loadtest-student@mathmatix.ai',
    role: 'student',
    firstName: 'Load',
    lastName: 'TestStudent',
    gradeLevel: 7,
  },
  {
    username: 'loadtest-teacher',
    email: 'loadtest-teacher@mathmatix.ai',
    role: 'teacher',
    firstName: 'Load',
    lastName: 'TestTeacher',
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    if (process.argv.includes('--clear')) {
      const result = await User.deleteMany({
        username: { $regex: `^${LOAD_TEST_PREFIX}` },
      });
      console.log(`Cleared ${result.deletedCount} load test account(s)`);
      await mongoose.disconnect();
      return;
    }

    for (const acct of ACCOUNTS) {
      const existing = await User.findOne({ username: acct.username });
      if (existing) {
        console.log(`Account ${acct.username} already exists, skipping`);
        continue;
      }

      const user = new User({
        ...acct,
        password: PASSWORD,
        xp: 0,
        level: 1,
      });
      await user.save();
      console.log(`Created ${acct.role}: ${acct.username} / ${PASSWORD}`);
    }

    // Link student to teacher
    const student = await User.findOne({ username: 'loadtest-student' });
    const teacher = await User.findOne({ username: 'loadtest-teacher' });
    if (student && teacher && !student.teacherId) {
      student.teacherId = teacher._id;
      await student.save();
      console.log('Linked student to teacher');
    }

    console.log('\nLoad test accounts ready.');
    console.log('Run load tests with: k6 run tests/load/chat.test.js');

    await mongoose.disconnect();
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
