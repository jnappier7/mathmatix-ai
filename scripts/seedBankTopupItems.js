// scripts/seedBankTopupItems.js
// Seeds the low-volume top-up items (seeds/bank-topup-items.generated.json)
// into the Problem collection.
//
// These are hand-authored items for skills that had fewer than 10 items in the
// bank — the calc3 block plus a long tail of K-12 skills. Unlike the ACT/SAT/
// Calc-AB batches there is no upstream authoring format to ingest from: the
// generated JSON *is* the source of truth and is committed as such.
//
// Usage:
//   node scripts/seedBankTopupItems.js            # upsert
//   node scripts/seedBankTopupItems.js --fresh    # clear prior top-up items first
//   node scripts/seedBankTopupItems.js --dry-run  # validate only, no writes

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ITEMS_FILE = path.join(__dirname, '..', 'seeds', 'bank-topup-items.generated.json');
const SOURCE = 'bank-topup-2026-07';

function validate(items) {
  const errors = [];
  const seen = new Set();

  items.forEach((it, i) => {
    const at = `[${i}] ${it.problemId || '<no problemId>'}`;
    if (!it.problemId) errors.push(`${at}: missing problemId`);
    if (seen.has(it.problemId)) errors.push(`${at}: duplicate problemId`);
    seen.add(it.problemId);

    if (!it.skillId) errors.push(`${at}: missing skillId`);
    if (!it.prompt) errors.push(`${at}: missing prompt`);
    if (!it.answer || it.answer.value === undefined || it.answer.value === null) {
      errors.push(`${at}: missing answer.value`);
    }
    if (!(it.difficulty >= 1 && it.difficulty <= 5)) {
      errors.push(`${at}: difficulty ${it.difficulty} outside 1-5`);
    }

    if (it.answerType === 'multiple-choice') {
      if (!Array.isArray(it.options) || it.options.length !== 4) {
        errors.push(`${at}: multiple-choice needs exactly 4 options`);
      }
      const labels = (it.options || []).map(o => o.label);
      if (!labels.includes(it.correctOption)) {
        errors.push(`${at}: correctOption ${it.correctOption} not among options`);
      }
      const correct = (it.options || []).find(o => o.label === it.correctOption);
      if (correct && correct.text !== it.answer.value) {
        errors.push(`${at}: answer.value does not match the correct option text`);
      }
      const texts = new Set((it.options || []).map(o => String(o.text).trim()));
      if (texts.size !== (it.options || []).length) {
        errors.push(`${at}: duplicate option texts`);
      }
    } else if (it.answerType === 'constructed-response') {
      const eq = it.answer.equivalents || [];
      if (!eq.includes(it.answer.value)) {
        errors.push(`${at}: answer.value missing from answer.equivalents`);
      }
    } else {
      errors.push(`${at}: unexpected answerType ${it.answerType}`);
    }
  });

  return errors;
}

async function main() {
  if (!fs.existsSync(ITEMS_FILE)) {
    console.error(`Missing ${path.relative(process.cwd(), ITEMS_FILE)}`);
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
  const fresh = process.argv.includes('--fresh');
  const dryRun = process.argv.includes('--dry-run');

  const errors = validate(items);
  if (errors.length) {
    console.error(`Validation failed (${errors.length} problems):`);
    errors.slice(0, 25).forEach(e => console.error(`  ${e}`));
    if (errors.length > 25) console.error(`  ... and ${errors.length - 25} more.`);
    process.exit(1);
  }

  const bySkill = items.reduce((acc, it) => {
    acc[it.skillId] = (acc[it.skillId] || 0) + 1;
    return acc;
  }, {});
  console.log(`Validated ${items.length} items across ${Object.keys(bySkill).length} skills.`);

  if (dryRun) {
    console.log('--dry-run: no database writes.');
    process.exit(0);
  }

  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');
  const Skill = require('../models/skill');

  // Fail loudly rather than seeding items that point at a skill that is not
  // in the taxonomy — an orphaned skillId is invisible to the adaptive engine.
  const skillIds = [...new Set(items.map(i => i.skillId))];
  const known = new Set((await Skill.find({ skillId: { $in: skillIds } }).select('skillId').lean())
    .map(s => s.skillId));
  const missing = skillIds.filter(s => !known.has(s));
  if (missing.length) {
    console.error(`Aborting: ${missing.length} skillId(s) not found in the Skill collection:`);
    missing.forEach(s => console.error(`  ${s}`));
    await mongoose.disconnect();
    process.exit(1);
  }

  if (fresh) {
    const del = await Problem.deleteMany({ source: SOURCE });
    console.log(`Cleared ${del.deletedCount} prior top-up items (--fresh).`);
  }

  let up = 0;
  for (const it of items) {
    await Problem.updateOne({ problemId: it.problemId }, { $set: it }, { upsert: true });
    up += 1;
  }
  console.log(`Upserted ${up} items into MongoDB (source: ${SOURCE}).`);

  const mc = items.filter(i => i.answerType === 'multiple-choice').length;
  console.log(`  ${mc} multiple-choice; ${items.length - mc} constructed-response.`);
  console.log(`  ${items.filter(i => i.explanation).length} carry an explanation.`);

  // Report resulting per-skill volume so a thin skill is obvious after seeding.
  const counts = await Problem.aggregate([
    { $match: { skillId: { $in: skillIds } } },
    { $group: { _id: '$skillId', count: { $sum: 1 } } },
    { $sort: { count: 1 } }
  ]);
  const thin = counts.filter(c => c.count < 10);
  if (thin.length) {
    console.log(`  Still under 10 items after seeding: ${thin.map(c => `${c._id} (${c.count})`).join(', ')}`);
  } else {
    console.log(`  All ${counts.length} touched skills now have 10+ items.`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('seedBankTopupItems failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
