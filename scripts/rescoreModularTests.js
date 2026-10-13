// scripts/rescoreModularTests.js
//
// Re-score completed SAT and PSAT practice tests on the CURRENT scale line.
//
//   node scripts/rescoreModularTests.js           # dry run: prints old -> new per test
//   node scripts/rescoreModularTests.js --apply   # write the new scaledScore
//
// Why: the SAT/PSAT line changed on 2026-10-13 (center 510 / 120 per logit ->
// 500 / 85, set from the form's own extremes; see seeds/sat-math-blueprint.json
// _irtScaleComment). A score is read off the stored response pattern, so it
// can be recomputed exactly. Without this, a student's retest on the new line
// is compared with a baseline on the old one, and the trend line shows a change
// nobody earned. Idempotent: a second --apply changes nothing.
//
// Run from Render's Shell tab (it has MONGO_URI). Only completed sessions of
// the modular tests are touched; the ACT and PreACT score from tables.

require('dotenv').config();
const mongoose = require('mongoose');
const ActTestSession = require('../models/actTestSession');
const { getTestDef } = require('../utils/practiceTests');
const { irtScaled } = require('../utils/testModules');

const MODULAR = ['sat-math', 'psat-math'];

async function main() {
  const apply = process.argv.includes('--apply');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  await mongoose.connect(process.env.MONGO_URI);
  const sessions = await ActTestSession.find({ testId: { $in: MODULAR }, status: 'completed' })
    .select('testId items.position items.difficulty responses.position responses.correct scaledScore completedAt');
  let changed = 0;
  for (const s of sessions) {
    const bp = getTestDef(s.testId).blueprint;
    const next = irtScaled(s.items, s.responses, bp).scaled;
    if (next === s.scaledScore) continue;
    changed += 1;
    console.log(`${s.testId} ${s._id} ${s.completedAt ? s.completedAt.toISOString().slice(0, 10) : '?'}: ${s.scaledScore} -> ${next}`);
    if (apply) {
      await ActTestSession.updateOne({ _id: s._id }, { $set: { scaledScore: next } });
    }
  }
  console.log(`${sessions.length} completed SAT/PSAT tests, ${changed} ${apply ? 'rescored' : 'would change (dry run; pass --apply to write)'}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[rescoreModularTests] failed:', err.message);
  process.exit(1);
});
