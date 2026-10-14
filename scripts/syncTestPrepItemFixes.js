#!/usr/bin/env node
// scripts/syncTestPrepItemFixes.js — bring production in line with the
// practice-test item fixes from the 2026-10-13 QA pass. DRY RUN BY DEFAULT.
//
// What it syncs from the seed files, field by field, ONLY where the database
// differs (so it is idempotent: a second --apply finds nothing to do):
//   options, correctOption, answer.value, explanation, svg, figureAlt
// for the three banks the fixes touched:
//   sat-fable              148 figures redrawn/described; 4 distractor fixes
//   act-enhanced-2026-09   4 double-keyed radical items (√20 next to 2√5)
//   act-reasoning-2026-10  "4 − 1π" written "4 − π"
//
// answer.value is set on its own path, so answer.equivalents (the typography
// backfill) is never overwritten. Nothing is inserted or deleted, and no other
// field is touched; an item missing from the database is reported, not added
// (seed it with npm run seed:all).
//
// Usage:
//   node scripts/syncTestPrepItemFixes.js            # report what would change
//   node scripts/syncTestPrepItemFixes.js --apply    # write it
//
// Needs MONGO_URI (run from the Render Shell, which has it).

try { require('dotenv').config(); } catch { /* env from the shell */ }
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ROOT = path.join(__dirname, '..');
const BANKS = [
  'seeds/sat-items.generated.json',
  'seeds/act-enhanced/act-items.generated.json',
  'seeds/act-reasoning/act-reasoning-items.generated.json',
];
const FIELDS = ['options', 'correctOption', 'explanation', 'svg', 'figureAlt'];

const norm = (v) => JSON.stringify(v == null ? null : v);
const optionsOf = (opts) => (opts || []).map((o) => ({ label: o.label, text: o.text }));

/** The $set for one item, or null when the database already matches the seed. */
function diffItem(seed, doc) {
  const set = {};
  for (const f of FIELDS) {
    if (seed[f] === undefined) continue;
    const want = f === 'options' ? optionsOf(seed[f]) : seed[f];
    const have = f === 'options' ? optionsOf(doc[f]) : doc[f];
    if (norm(want) !== norm(have)) set[f] = want;
  }
  const wantAnswer = seed.answer && seed.answer.value;
  if (wantAnswer != null && norm(wantAnswer) !== norm(doc.answer && doc.answer.value)) set['answer.value'] = wantAnswer;
  return Object.keys(set).length ? set : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');
  let changed = 0, missing = 0;
  const byField = {};
  for (const rel of BANKS) {
    const seeds = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    const docs = await Problem.find({ problemId: { $in: seeds.map((s) => s.problemId) } })
      .select(`problemId answer ${FIELDS.join(' ')}`).lean();
    const byId = new Map(docs.map((d) => [d.problemId, d]));
    const ops = [];
    for (const seed of seeds) {
      const doc = byId.get(seed.problemId);
      if (!doc) { missing += 1; continue; }
      const set = diffItem(seed, doc);
      if (!set) continue;
      Object.keys(set).forEach((k) => { byField[k] = (byField[k] || 0) + 1; });
      // Content changes are listed one by one; figure-only refreshes are counted.
      if (Object.keys(set).some((k) => !['svg', 'figureAlt'].includes(k))) {
        console.log(`  ${seed.problemId}: ${Object.keys(set).join(', ')}`);
      }
      ops.push({ updateOne: { filter: { problemId: seed.problemId }, update: { $set: set } } });
    }
    console.log(`${rel}: ${ops.length} item(s) to update`);
    changed += ops.length;
    if (apply && ops.length) {
      const res = await Problem.bulkWrite(ops, { ordered: false });
      console.log(`  wrote ${res.modifiedCount}`);
    }
  }
  console.log(`\n${apply ? 'Updated' : 'Would update'} ${changed} item(s); fields: ${JSON.stringify(byField)}; not in DB (seed them): ${missing}`);
  if (!apply && changed) console.log('Dry run — re-run with --apply to write.');
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { diffItem };
