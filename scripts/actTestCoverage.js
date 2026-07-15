// scripts/actTestCoverage.js
// Reports how much of an ACT Math practice form the current item bank can fill,
// and prints the generation worklist (skill + difficulty) for any gaps.
//
// Usage: node scripts/actTestCoverage.js
//
// This is the operational readiness check for the ACT boot-camp practice test:
// if coverage is low, the printed gaps are exactly what scripts/generate*.js
// need to produce (our own items) before the test is worth shipping.

require('dotenv').config();
const mongoose = require('mongoose');
const { assembleForm } = require('../utils/actTestAssembler');

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);

  // Fixed seed for a repeatable snapshot.
  const form = await assembleForm({ seed: 'coverage-check' });

  console.log('\n=== ACT Math practice test — bank coverage ===');
  console.log(`Filled ${form.coverage.filled}/${form.coverage.total} slots (${form.coverage.pct}%), ${form.coverage.missing} gaps.\n`);

  if (form.gaps.length) {
    const bySkill = {};
    for (const g of form.gaps) {
      const key = `${g.skillId} (d≈${g.targetDifficulty})`;
      bySkill[key] = (bySkill[key] || 0) + 1;
    }
    console.log('Generation worklist (skill → items needed):');
    Object.entries(bySkill)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`  ${n}×  ${k}`));
  } else {
    console.log('Bank fully covers a form. Ready to ship.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('actTestCoverage failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
