/**
 * CHECK DISTRACTOR QUALITY (read-only audit) — QA P0-3
 *
 * Scans the active problem bank with the shared detector
 * (utils/distractorQuality.js) and reports every multiple-choice
 * problem whose options are broken: un-authored placeholders
 * ("Wrong 1/2/3"), blanks/duplicates, too few options, or wrong-
 * type distractors that give the answer away.
 *
 * Read-only — it never writes. Use it to size the cleanup and to
 * gate CI. Exits non-zero when defects are found so it can fail a
 * pipeline.
 *
 * Run: node scripts/checkDistractorQuality.js
 *      node scripts/checkDistractorQuality.js --all   (include inactive)
 *      node scripts/checkDistractorQuality.js --json   (machine output)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const { assessOptions } = require('../utils/distractorQuality');

const INCLUDE_INACTIVE = process.argv.includes('--all');
const AS_JSON = process.argv.includes('--json');

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGO_URI not set.');
    process.exit(2);
  }
  await mongoose.connect(mongoUri);

  const query = INCLUDE_INACTIVE ? {} : { isActive: true };
  // Only MC problems can have distractor defects.
  query.$or = [{ answerType: 'multiple-choice' }, { 'options.0': { $exists: true } }];

  const problems = await Problem.find(query).lean();
  const bad = [];
  const byCode = {};

  for (const p of problems) {
    const { ok, issues } = assessOptions(p);
    if (ok) continue;
    bad.push({
      problemId: p.problemId,
      skillId: p.skillId,
      difficulty: p.difficulty,
      isActive: p.isActive,
      prompt: (p.prompt || '').slice(0, 80),
      issues,
    });
    for (const i of issues) byCode[i.code] = (byCode[i.code] || 0) + 1;
  }

  if (AS_JSON) {
    console.log(JSON.stringify({ scanned: problems.length, bad: bad.length, byCode, problems: bad }, null, 2));
  } else {
    console.log('=== DISTRACTOR QUALITY AUDIT ===');
    console.log(`Scope: ${INCLUDE_INACTIVE ? 'ALL problems' : 'ACTIVE problems'}`);
    console.log(`Scanned (MC): ${problems.length}`);
    console.log(`Broken:       ${bad.length}\n`);
    if (bad.length) {
      console.log('By issue:');
      for (const [code, n] of Object.entries(byCode).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${code.padEnd(24)} ${n}`);
      }
      console.log('\nExamples (first 25):');
      for (const b of bad.slice(0, 25)) {
        console.log(`  [${b.problemId}] ${b.skillId} d${b.difficulty}${b.isActive ? '' : ' (inactive)'}`);
        console.log(`     "${b.prompt}"`);
        console.log(`     ${b.issues.map((i) => i.code + (i.detail ? `: ${i.detail}` : '')).join(' | ')}`);
      }
      if (bad.length > 25) console.log(`  … and ${bad.length - 25} more.`);
      console.log('\nTo remediate: node scripts/fixPlaceholderDistractors.js --dry-run');
    } else {
      console.log('No broken distractors found. ✅');
    }
  }

  await mongoose.disconnect();
  process.exit(bad.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(2);
});
