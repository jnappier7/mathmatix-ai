// scripts/verifyItemKey.js
//
// Record that a person checked an item's answer key and it is right.
//
//   npm run items:verify-key -- <problemId> --key=<letter or typed answer> [--note="..."]
//   npm run items:verify-key -- <problemId> --undo
//
// WHY
// calibrate:items flags an item authored easy (1-2) that under a quarter of
// students get right as POSSIBLY MIS-KEYED and never measures it, because a
// wrong key and a hard item look identical in the numbers. Once a person has
// looked, that flag is noise: it holds back a real measurement and repeats the
// same Sentry warning every month. The first one, act-fable-topup1q241 (vertex
// of y = (x − 4)² + 7), had a correct key; 16 of 31 students answered (−4, 7).
//
// SAFETY
// --key must name the key that is in the database right now. Verifying without
// having looked at the item is the mistake this guards against: a mismatch is
// refused, and the item, its choices and its key are printed either way. The
// verification records that key, so a later re-seed that changes it voids the
// verification (utils/itemCalibration.js isKeyVerified).

require('dotenv').config();
const mongoose = require('mongoose');

const args = process.argv.slice(2);
const problemId = args.find((a) => !a.startsWith('--'));
const flag = (name) => {
  const a = args.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  return a ? (a.includes('=') ? a.slice(a.indexOf('=') + 1) : true) : null;
};
const KEY = flag('key');
const NOTE = flag('note');
const UNDO = !!flag('undo');

/** The key as a person would state it: the letter for multiple choice, else the typed answer. */
function currentKey(p) {
  return p.answerType === 'multiple-choice' ? String(p.correctOption || '') : String((p.answer && p.answer.value) ?? '');
}

/** Does what the person typed name the current key? Letters ignore case; typed answers ignore spacing. */
function keyMatches(p, typed) {
  if (typed == null || typed === true) return false;
  const norm = (s) => String(s).replace(/\s+/g, '').toLowerCase();
  return norm(typed) === norm(currentKey(p));
}

async function main() {
  if (!problemId || (!UNDO && (KEY == null || KEY === true))) {
    console.error('Usage: npm run items:verify-key -- <problemId> --key=<letter or typed answer> [--note="..."]');
    console.error('       npm run items:verify-key -- <problemId> --undo');
    process.exit(1);
  }
  if (!process.env.MONGO_URI) { console.error('MONGO_URI not set.'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');
  const p = await Problem.findOne({ problemId }).lean();
  if (!p) { console.error(`No item ${problemId}.`); await mongoose.disconnect(); process.exit(1); }

  console.log(`\n${p.problemId}  (${p.source}, ${p.skillId}, authored ${p.difficulty})`);
  console.log(p.prompt);
  (p.options || []).forEach((o) => console.log(`  ${o.label === p.correctOption ? '*' : ' '} ${o.label}) ${o.text}`));
  console.log(`Key in the database: ${currentKey(p)}`);

  if (UNDO) {
    await Problem.updateOne({ problemId }, { $unset: { keyVerification: '' } });
    console.log('\nVerification removed. calibrate:items will flag this item again if it meets the mis-key test.');
  } else if (!keyMatches(p, KEY)) {
    console.error(`\nREFUSED: you said the key is "${KEY}", but the database has "${currentKey(p)}".`);
    console.error('If the database key is wrong, fix the item (seed file, then re-seed) instead of verifying it.');
    await mongoose.disconnect();
    process.exit(2);
  } else {
    await Problem.updateOne({ problemId }, {
      $set: {
        keyVerification: {
          correctOption: p.correctOption == null ? undefined : String(p.correctOption),
          answerValue: p.answer && p.answer.value != null ? String(p.answer.value) : undefined,
          verifiedAt: new Date(),
          ...(typeof NOTE === 'string' && NOTE ? { note: NOTE } : {}),
        },
      },
    });
    console.log('\nKey verified. calibrate:items will now measure this item instead of flagging it.');
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(err);
    try { await mongoose.disconnect(); } catch { /* already down */ }
    process.exit(1);
  });
}

module.exports = { currentKey, keyMatches };
