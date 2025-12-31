require('dotenv').config();
const mongoose = require('mongoose');
const Skill = require('../models/skill');

const skillsToCheck = [
  'two-step-equations',
  'percent-of-a-number',
  'area-rectangles',
  'slope',
  'quadratic-functions',
  'exponential-functions',
  'limits',
  'derivatives'
];

async function checkSkills() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    console.log('Checking skill units:\n');

    for (const skillId of skillsToCheck) {
      const skill = await Skill.findOne({ skillId }).select('skillId unit').lean();

      if (!skill) {
        console.log(`❌ ${skillId}: NOT FOUND`);
      } else {
        const hasPattern = skill.unit && skill.unit.includes('Pattern');
        const status = hasPattern ? '✅' : '⚠️ ';
        console.log(`${status} ${skillId}: "${skill.unit || 'NO UNIT'}"`);
      }
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSkills();
