#!/usr/bin/env node
// Remove junk skill keys ("undefined", "null", "") from learningEngines.{bkt,fsrs,consistency}.
//
// Before ad442ada (2026-07-22) the pipeline called updateLearningEngines with no
// skill in focus and stored a whole session's BKT/FSRS/consistency evidence under
// the literal key "undefined". The writer is closed, but 24 accounts still carry
// the key, and it surfaced to parents as "undefined, Sequences are starting to
// fade from memory". Reads now skip junk keys (utils/engineStore.engineEntries);
// this removes the data. The bucket pooled many skills, so it can't be
// re-attributed — it is dropped, not migrated.
//
// Dry run by default. Prints what it would remove; writes nothing.
//   node scripts/cleanupJunkEngineKeys.js
//   node scripts/cleanupJunkEngineKeys.js --apply
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const ENGINES = ['bkt', 'fsrs', 'consistency'];
const JUNK_KEYS = ['undefined', 'null', ''];

function junkFilter() {
  const or = [];
  for (const e of ENGINES) for (const k of JUNK_KEYS) or.push({ [`learningEngines.${e}.${k}`]: { $exists: true } });
  return { $or: or };
}

function unsetFor(doc) {
  const unset = {};
  for (const e of ENGINES) {
    const store = (doc.learningEngines || {})[e] || {};
    for (const k of JUNK_KEYS) if (Object.prototype.hasOwnProperty.call(store, k)) unset[`learningEngines.${e}.${k}`] = '';
  }
  return unset;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection('users');
  const docs = await users.find(junkFilter(), { projection: { learningEngines: 1 } }).toArray();

  let fields = 0;
  for (const doc of docs) {
    const unset = unsetFor(doc);
    const paths = Object.keys(unset);
    fields += paths.length;
    console.log(`${APPLY ? 'unset' : 'would unset'} ${doc._id}: ${paths.join(', ')}`);
    if (APPLY && paths.length) await users.updateOne({ _id: doc._id }, { $unset: unset });
  }
  console.log(`\n${APPLY ? 'Removed' : 'Would remove'} ${fields} junk engine key(s) across ${docs.length} user(s).${APPLY ? '' : ' Dry run — re-run with --apply to write.'}`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { junkFilter, unsetFor, ENGINES, JUNK_KEYS };
