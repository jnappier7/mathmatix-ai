// scripts/retireUngradableMc.js
// Retire multiple-choice items that have no single right option.
//
// The graders work out which option is right from the whole item
// (utils/mcOptions.js resolveKey). A few items give them nothing to work with:
// a bimodal "Find the mode: 12, 12, 13, 5, 13" whose options offer 12 and 13
// separately, keyed "12 and 13". No letter can be right, either pick is graded
// right, and the item teaches that a bimodal set has one mode. Such an item is
// retired (isActive:false, with the reason) — 9 on the 2026-11-22 export, all
// in `mode`, which has ~290 other items.
//
// Two things this deliberately does NOT do:
//
//   - re-key an item whose `correctOption` contradicts its own answer. That is
//     scripts/fixMcKeyDefects.js, which re-solves each key from its prompt
//     before touching it. This script only COUNTS those and says so.
//   - touch an item with two options its author declared equal ("1" beside
//     "2/2"). Either pick is graded right, which is fair.
//
//   node scripts/retireUngradableMc.js            # dry run — prints the plan, writes nothing
//   node scripts/retireUngradableMc.js --apply    # write it
//   node scripts/retireUngradableMc.js --file=export.json   # plan against a JSON export, no database

require('dotenv').config();
const fs = require('fs');
const { normalizeOptions, resolveKey } = require('../utils/mcOptions');
const { gradeOne } = require('../utils/skillChallenge');

const REASON = 'no single correct option (retireUngradableMc)';

/** What one item is: { action: 'deactivate'|'wrongLetter'|'twoRight'|null, ... }. */
function planFor(item) {
  const options = normalizeOptions(item.options);
  if (!options.length || item.isActive === false) return { action: null };
  const answer = item.answer || {};
  const key = resolveKey({
    options: item.options, value: answer.value, equivalents: answer.equivalents, correctOption: item.correctOption,
  });

  if (key && key.conflict) {
    return { action: 'wrongLetter', stored: item.correctOption, answerIs: key.label };
  }

  const right = options.filter((o) => gradeOne(item, o.label).correct);
  if (right.length === 1) return { action: null };
  if (key && key.also.length && right.length === 1 + key.also.length) {
    return { action: 'twoRight', labels: right.map((o) => o.label) };
  }
  return { action: 'deactivate', right: right.map((o) => o.text) };
}

function planAll(items) {
  const plan = { deactivate: [], wrongLetter: [], twoRight: [] };
  for (const item of items) {
    const p = planFor(item);
    if (p.action) plan[p.action].push({ problemId: item.problemId, skillId: item.skillId, source: item.source, prompt: item.prompt, ...p });
  }
  return plan;
}

function printPlan(plan) {
  const line = (r) => `    ${r.problemId}  [${r.skillId}]  ${String(r.prompt).replace(/\s+/g, ' ').slice(0, 70)}`;
  console.log(`\nDeactivate ${plan.deactivate.length} — no single right option:`);
  plan.deactivate.forEach((r) => console.log(`${line(r)}\n        graded right today: ${r.right.join(' | ') || 'none'}`));
  console.log(`\nLeft alone ${plan.twoRight.length} — two options the item declares equal (either is graded right).`);
  if (plan.wrongLetter.length) {
    console.log(`\nNOT handled here: ${plan.wrongLetter.length} items whose correctOption contradicts their own answer.`);
    console.log('  They are graded correctly, but the stored letter is wrong for reports and exports.');
    console.log('  Fix them with: node scripts/fixMcKeyDefects.js        (dry run; --write to apply)');
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const fileArg = process.argv.find((a) => a.startsWith('--file='));

  if (fileArg) {
    const items = JSON.parse(fs.readFileSync(fileArg.slice(7), 'utf8'));
    printPlan(planAll(items));
    console.log('\n(planned against a file — nothing written)');
    return;
  }

  if (!process.env.MONGO_URI) { console.error('MONGO_URI not set.'); process.exit(1); }
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');

  const items = await Problem.find(
    { isActive: { $ne: false }, 'options.0': { $exists: true } },
    { problemId: 1, skillId: 1, source: 1, prompt: 1, answer: 1, options: 1, correctOption: 1, isActive: 1 }
  ).lean();
  const plan = planAll(items);
  printPlan(plan);

  if (!apply) {
    console.log('\nDry run — nothing written. Re-run with --apply to write it.');
  } else {
    const ops = plan.deactivate.map((r) => ({
      updateOne: { filter: { problemId: r.problemId }, update: { $set: { isActive: false, inactiveReason: REASON } } },
    }));
    if (ops.length) await Problem.bulkWrite(ops, { ordered: false });
    console.log(`\nApplied: ${plan.deactivate.length} retired.`);
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => { console.error('retireUngradableMc failed:', err.message); process.exit(1); });
}

module.exports = { planFor, planAll, REASON };
