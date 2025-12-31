require('dotenv').config();
const mongoose = require('mongoose');
const Skill = require('../models/skill');

// Skills that exist but have 0 problems - likely missing "Pattern" in unit field
const skillsToFix = [
  'two-step-equations',
  'percent-of-a-number',
  'area-rectangles',
  'slope',
  'quadratic-functions',
  'exponential-functions',
  'limits',
  'derivatives'
];

async function fixSkills() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    console.log('Checking skills...\n');

    for (const skillId of skillsToFix) {
      const skill = await Skill.findOne({ skillId });

      if (!skill) {
        console.log(`❌ ${skillId}: NOT FOUND`);
        continue;
      }

      console.log(`📝 ${skillId}:`);
      console.log(`   Current unit: ${skill.unit}`);

      if (!skill.unit || !skill.unit.includes('Pattern')) {
        // Update the unit to include "Pattern"
        const tierMap = {
          'two-step-equations': 'Tier 2',
          'percent-of-a-number': 'Tier 2',
          'area-rectangles': 'Tier 2',
          'slope': 'Tier 3',
          'quadratic-functions': 'Tier 3',
          'exponential-functions': 'Tier 3',
          'limits': 'Tier 4',
          'derivatives': 'Tier 4'
        };

        const newUnit = `${skill.unit || 'Equivalence'} Pattern - ${tierMap[skillId]}`;

        await Skill.updateOne(
          { skillId },
          { $set: { unit: newUnit } }
        );

        console.log(`   ✅ Updated to: ${newUnit}`);
      } else {
        console.log(`   ✅ Already has Pattern in unit`);
      }
    }

    console.log('\n✅ Skill units updated! Now re-run: npm run generate:all-pattern-problems\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixSkills();
