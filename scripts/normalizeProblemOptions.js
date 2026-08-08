/**
 * NORMALIZE STORED MC OPTIONS (2026-08-07)
 *
 * The item bank holds multiple-choice options in four shapes, written by
 * different generators over time:
 *
 *   { label, text }                     seeds/*.generated.json
 *   { letter, text, isCorrect }         scripts/generateProblems.js
 *   { id, text, isCorrect }             scripts/convertToMC.js  ← via $set, unstripped
 *   'plain string'                      scripts/lib/templatesGrade67.js
 *
 * `utils/mcOptions.js` reconciles them at read time on every request, which is
 * what stopped students being marked wrong on correct answers. This writes that
 * reconciliation down so the stored docs stop needing it, and so the `isCorrect`
 * flag — an answer key riding on every option — leaves the database entirely.
 *
 * THE INVARIANT: no item may grade differently after this runs. Every rewrite
 * here is one the read path was already performing:
 *
 *   - labels become POSITIONAL, which is what normalizeOptions served
 *   - `correctOption` is rewritten to the positional label, which is what
 *     correctLabelOf resolved it to (they differ on the pattern-problem bank,
 *     which shuffled options with their labels attached)
 *   - `isCorrect` / `id` / `letter` are dropped — never read by the graders
 *
 * The one addition is `correctOption` on items that lack it (the convertToMC
 * population, whose key lives in `answer`). That changes which branch of
 * compareAnswer grades the item, so it is only written when the `isCorrect`
 * option's text is CORROBORATED by `answer.value`/`equivalents` — i.e. when both
 * branches already agree. Uncorroborated items are left alone and reported.
 *
 * Deliberately NOT touched: `answerType`. Flipping an options-carrying item to
 * 'multiple-choice' would switch on MC handling and change grading, which is a
 * content decision, not a shape migration. Those items are counted and reported.
 *
 * Dry run by default:
 *   node scripts/normalizeProblemOptions.js              # report only
 *   node scripts/normalizeProblemOptions.js --write      # apply
 *   node scripts/normalizeProblemOptions.js --limit=100  # sample first
 *
 * Idempotent: a doc already in canonical shape plans no write, so re-running is
 * safe and the second run reports zero changes.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const { normalizeOptions, correctLabelOf, optionText } = require('../utils/mcOptions');
const { compareAnswer } = require('../utils/answerComparison');

const WRITE = process.argv.includes('--write');
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 0;

/** True when the stored array is already exactly [{label,text}] and positional. */
function isCanonical(options) {
  if (!Array.isArray(options)) return false;
  return options.every((opt, i) => {
    if (!opt || typeof opt !== 'object') return false;
    const keys = Object.keys(opt).filter((k) => k !== '_id');
    return keys.length === 2 && keys.includes('label') && keys.includes('text')
      && opt.label === String.fromCharCode(65 + i)
      && typeof opt.text === 'string';
  });
}

/**
 * Decide what (if anything) to write for one problem doc.
 *
 * Pure — doc in, plan out — so the grading invariant can be tested without a DB.
 *
 * @param {Object} doc a lean Problem doc
 * @returns {{changed: boolean, set: Object, notes: string[]}}
 */
function planOptionMigration(doc) {
  const notes = [];
  const stored = Array.isArray(doc.options) ? doc.options : [];
  if (!stored.length) return { changed: false, set: {}, notes };

  const options = normalizeOptions(stored);

  // The positional label the read path already resolved correctOption to.
  let correctOption = correctLabelOf(doc);

  if (!correctOption && doc.correctOption) {
    // A stored letter no option carries. The read path could not place it
    // either, so grading already fell through to `answer` — leave it as is
    // rather than inventing a slot.
    notes.push(`unplaceable correctOption "${doc.correctOption}"`);
    correctOption = doc.correctOption;
  }

  if (!correctOption) {
    // No key on the item. The legacy shapes flag the answer with `isCorrect`;
    // adopt it ONLY when `answer` independently agrees, so the branch of
    // compareAnswer that grades this item cannot change verdicts.
    const flagged = stored.findIndex((o) => o && typeof o === 'object' && o.isCorrect === true);
    if (flagged >= 0 && flagged < options.length) {
      const key = doc.answer || {};
      const candidates = [key.value, ...(key.equivalents || [])]
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
      const text = optionText(stored[flagged]);
      const corroborated = candidates.some((c) => compareAnswer(text, { value: c }));
      if (corroborated) {
        correctOption = options[flagged].label;
        notes.push(`derived correctOption "${correctOption}" from isCorrect (corroborated by answer)`);
      } else {
        notes.push(`isCorrect points at "${text}" but answer says "${candidates[0] ?? '(none)'}" — left unset`);
      }
    }
  }

  const optionsChanged = !isCanonical(stored)
    || stored.length !== options.length;
  const keyChanged = (correctOption || null) !== (doc.correctOption || null);
  if (!optionsChanged && !keyChanged) return { changed: false, set: {}, notes };

  const set = {};
  if (optionsChanged) set.options = options;
  if (keyChanged && correctOption) set.correctOption = correctOption;
  return { changed: true, set, notes };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  // Every doc that carries a NON-EMPTY options ARRAY, whatever its answerType.
  //
  // `{ options: { $exists: true, $ne: [] } }` looks equivalent and is not: it
  // also matches `options: null`, because null exists and null !== []. On the
  // production bank that pulled in 774 free-response items with a stray
  // `options: null` and counted them as options-carrying — which then made the
  // answerType tally below report 774 items that "carry options but are not
  // declared multiple-choice". No such item exists; every doc with real options
  // is already declared MC. That miscount was read as a live grading bug and
  // chased into a PR before the data was checked.
  //
  // `"options.0": { $exists: true }` has no such hole: an array with a 0th
  // element is a non-empty array, and nothing else matches.
  const query = { 'options.0': { $exists: true } };
  const cursor = Problem.find(query).limit(LIMIT || 0).lean().cursor();

  let scanned = 0, changed = 0, derived = 0, unplaceable = 0, mismatched = 0, typeMismatch = 0;
  const samples = [];

  for await (const doc of cursor) {
    scanned++;
    if (doc.answerType !== 'multiple-choice') typeMismatch++;

    const plan = planOptionMigration(doc);
    plan.notes.forEach((n) => {
      if (n.startsWith('derived')) derived++;
      else if (n.startsWith('unplaceable')) unplaceable++;
      else if (n.startsWith('isCorrect points')) mismatched++;
    });

    if (!plan.changed) continue;
    changed++;

    if (samples.length < 8) {
      samples.push(`  ${doc.problemId} [${doc.skillId}]\n`
        + `    before: ${JSON.stringify(doc.options)} correctOption=${doc.correctOption ?? '(none)'}\n`
        + `    after:  ${JSON.stringify(plan.set.options ?? doc.options)} correctOption=${plan.set.correctOption ?? doc.correctOption ?? '(none)'}`
        + (plan.notes.length ? `\n    note: ${plan.notes.join('; ')}` : ''));
    }

    if (WRITE) {
      // Native driver: Mongoose casts a plain-string option array to [] against
      // the { label, text } subdoc schema, which would DELETE the choices on
      // the string-shaped bank instead of migrating them.
      await Problem.collection.updateOne({ _id: doc._id }, { $set: plan.set });
    }
  }

  // Shape census of everything the scan did NOT look at, so an item can never
  // go missing silently — and so "not scanned" is never mistaken for "scanned
  // and fine", which is the error this whole report line caused once already.
  const emptyArray = await Problem.countDocuments({ options: { $size: 0 } });
  const nullOptions = await Problem.countDocuments({ options: null });

  console.log(`problems with a non-empty options array (scanned): ${scanned}`);
  console.log(`${WRITE ? 'updated' : 'would update'}: ${changed}`);
  console.log(`correctOption derived from isCorrect (corroborated): ${derived}`);
  console.log(`left unset — isCorrect disagrees with answer: ${mismatched}`);
  console.log(`correctOption naming an option that does not exist: ${unplaceable}`);
  // Of the SCANNED docs only — i.e. items with real choices that are not
  // declared multiple-choice. Not skipped items, which are counted separately.
  console.log(`scanned, but answerType !== 'multiple-choice' (untouched): ${typeMismatch}`);
  console.log(`not scanned — options: [] (no choices): ${emptyArray}`);
  console.log(`not scanned — options: null (no choices): ${nullOptions}`);
  if (samples.length) console.log(`\nsamples:\n${samples.join('\n')}`);
  if (!WRITE) console.log('\n(dry run — pass --write to apply)');

  await mongoose.disconnect();
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { planOptionMigration, isCanonical };
