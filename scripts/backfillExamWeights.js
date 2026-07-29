#!/usr/bin/env node
/**
 * BACKFILL: courseSession.modules[].examWeight
 *
 * Test-prep courses measure progress by contribution to the real exam score,
 * not by module count — ACT "Integrating Essential Skills" is 40-43% of the
 * test while "Number & Quantity" is 7-10%. The pathways authored those
 * percentages from the start (`actPercentage`) and nothing read them until
 * 2026-07-29.
 *
 * New enrollments capture examWeight at creation (routes/courseSession.js).
 * This backfills sessions created before that, so existing students get
 * score-weighted progress instead of silently staying on module-count
 * weighting. Sessions in courses with no declared weights are untouched.
 *
 *   node scripts/backfillExamWeights.js --dry-run
 *   node scripts/backfillExamWeights.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const CourseSession = require('../models/courseSession');
const { parseExamWeight } = require('../utils/coursePrompt');

const DRY_RUN = process.argv.includes('--dry-run');

function loadPathwayWeights(courseId) {
  const file = path.join(__dirname, '../public/resources', `${courseId}-pathway.json`);
  if (!fs.existsSync(file)) return null;
  let pathway;
  try {
    pathway = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.warn(`  ! ${courseId}: unreadable pathway (${err.message})`);
    return null;
  }
  const weights = new Map();
  let declared = 0;
  for (const m of pathway.modules || []) {
    const w = parseExamWeight(m.actPercentage ?? m.examWeight);
    if (w != null) declared += 1;
    weights.set(m.moduleId, w);
  }
  return declared > 0 ? weights : null;   // no weights authored → nothing to do
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is required.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected.${DRY_RUN ? ' DRY RUN — no writes.' : ''}\n`);

  const pathwayCache = new Map();
  const sessions = await CourseSession.find({}).select('courseId modules');
  let touched = 0;
  let skipped = 0;

  for (const session of sessions) {
    const { courseId } = session;
    if (!pathwayCache.has(courseId)) pathwayCache.set(courseId, loadPathwayWeights(courseId));
    const weights = pathwayCache.get(courseId);
    if (!weights) { skipped += 1; continue; }

    let changed = 0;
    for (const mod of session.modules || []) {
      const w = weights.get(mod.moduleId);
      if (w == null) continue;                 // undeclared → mean applied at read time
      if (mod.examWeight === w) continue;      // already correct
      mod.examWeight = w;
      changed += 1;
    }

    if (changed > 0) {
      touched += 1;
      console.log(`  ${DRY_RUN ? 'would set' : 'set'} ${String(changed).padStart(2)} weight(s) — ${courseId} / session ${session._id}`);
      if (!DRY_RUN) {
        session.markModified('modules');
        await session.save();
      }
    } else {
      skipped += 1;
    }
  }

  console.log(`\n${DRY_RUN ? 'Would update' : 'Updated'} ${touched} session(s); ${skipped} needed nothing.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Backfill failed:', err);
  try { await mongoose.disconnect(); } catch (_) { /* already closed */ }
  process.exit(1);
});
