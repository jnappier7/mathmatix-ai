require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const Skill = require('../models/skill');

async function analyze() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    // Count total problems
    const totalProblems = await Problem.countDocuments();
    console.log(`📊 Total problems in database: ${totalProblems}\n`);

    // Find pattern-based skills
    const patternSkills = await Skill.find({ unit: { $regex: 'Pattern' } })
      .select('skillId displayName unit')
      .lean();

    console.log(`📚 Pattern-based skills in database: ${patternSkills.length}\n`);

    // The 27 generators we created
    const generatorSkillIds = [
      'addition', 'subtraction', 'multiplication-basics', 'division-basics',
      'place-value', 'decimals', 'order-of-operations',
      'one-step-equations', 'two-step-equations', 'combining-like-terms',
      'ratios', 'percent-of-a-number', 'area-rectangles', 'exponents',
      'integers', 'proportions', 'pythagorean-theorem',
      'slope', 'quadratic-functions', 'systems-of-equations', 'polynomials',
      'exponential-functions', 'logarithms', 'trigonometry',
      'limits', 'derivatives', 'integrals'
    ];

    console.log('🔍 Checking which generator skills got problems:\n');

    for (const skillId of generatorSkillIds) {
      const count = await Problem.countDocuments({ skillId });
      const skillExists = patternSkills.find(s => s.skillId === skillId);

      if (count > 0) {
        console.log(`✅ ${skillId}: ${count} problems`);
      } else if (skillExists) {
        console.log(`⚠️  ${skillId}: 0 problems (skill exists but no problems generated)`);
      } else {
        console.log(`❌ ${skillId}: 0 problems (skill doesn't exist in database)`);
      }
    }

    // Count problems by all skillIds
    console.log('\n📈 All skills with problems:');
    const problemCounts = await Problem.aggregate([
      { $group: { _id: '$skillId', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    problemCounts.forEach(({ _id, count }) => {
      console.log(`  ${_id}: ${count}`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

analyze();
