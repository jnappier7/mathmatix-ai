/**
 * FIX: retire problem copies whose skill contradicts the operator in the prompt.
 *
 * scripts/auditProblemClassification.js found 248 groups where one prompt is
 * filed under two or more skills. Most are hierarchy overlap and NOT errors —
 * `12 x 6 = ?` under both `multiplication-basics` and `one-step-multiplication`
 * is two true statements about one item, and belongs to the separate
 * canonical-owner pass.
 *
 * A small subset is different in kind: the skills contradict each other, and
 * the prompt itself says which one is right.
 *
 *   multiplication-basics + one-step-division :: 12 x 6 = ?   -> x, so the division tag is wrong
 *   divide-fractions + multiply-fractions     :: 4/5 / 4/5 = ? -> div, so the multiply tag is wrong
 *
 * No model and no judgment required: an item containing a division operator is
 * not a multiplication item. This script resolves exactly that contradiction and
 * nothing else, so its rule stays small enough to defend.
 *
 * SAFETY
 * - Dry-run by default. Nothing is written without --apply.
 * - Never deletes. The contradicted copy is deactivated (isActive: false), so a
 *   bad call is reversible with a one-line update instead of a restore.
 * - Skips any group where the operator is ambiguous or absent, rather than
 *   guessing. Skipped groups are reported, never silently dropped.
 *
 * Run:
 *   node scripts/fixOperatorMisfiledProblems.js            # dry-run, prints the plan
 *   node scripts/fixOperatorMisfiledProblems.js --apply    # deactivate contradicted copies
 *   node scripts/fixOperatorMisfiledProblems.js --undo     # reactivate what this script retired
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

const APPLY = process.argv.includes('--apply');
const UNDO = process.argv.includes('--undo');
const RETIRE_TAG = 'retired-by:fixOperatorMisfiledProblems';

// Skills that assert an operation. Only skills observed in real contradictions
// are listed — an unlisted skill makes its group "mixed", which is skipped.
const MULTIPLY_SKILLS = new Set([
  'multiplication-basics',
  'one-step-multiplication',
  'multiply-fractions',
]);
const DIVIDE_SKILLS = new Set([
  'one-step-division',
  'divide-fractions',
]);

/**
 * Which operation does the prompt actually perform?
 *
 * NOTE: "/" is deliberately NOT a division signal. Every fraction contains one,
 * so treating it as division would classify `2/5 x 3/4` as division and retire
 * the correct copy. Division must be explicit: the division sign, LaTeX \div,
 * or the words.
 */
function promptOperation(prompt) {
  const s = String(prompt || '');
  const divides = /÷|\\div\b|\bdivided by\b/i.test(s);
  const multiplies = /×|·|\*|\\times\b|\\cdot\b|\btimes\b|\bmultiplied by\b/i.test(s);
  if (divides && multiplies) return null; // mixed expression — not ours to judge
  if (divides) return 'divide';
  if (multiplies) return 'multiply';
  return null;
}

/** Does this skill assert an operation, and which? */
function skillOperation(skillId) {
  if (MULTIPLY_SKILLS.has(skillId)) return 'multiply';
  if (DIVIDE_SKILLS.has(skillId)) return 'divide';
  return null;
}

/**
 * Given the documents sharing one prompt, decide what to retire.
 * Returns { action, operation, retire[], keep[], reason }.
 */
function planForGroup(docs) {
  const ops = new Set(docs.map((d) => skillOperation(d.skillId)).filter(Boolean));
  if (ops.size < 2) {
    return { action: 'skip', reason: 'no operator contradiction between these skills' };
  }

  const operation = promptOperation(docs[0].prompt);
  if (!operation) {
    return { action: 'skip', reason: 'prompt has no unambiguous operator' };
  }

  const retire = docs.filter((d) => {
    const op = skillOperation(d.skillId);
    return op && op !== operation;
  });
  const keep = docs.filter((d) => !retire.includes(d));

  if (!retire.length) return { action: 'skip', reason: 'nothing contradicts the prompt' };

  // `keep` cannot be empty here: reaching this point means the group holds both
  // a multiply-asserting and a divide-asserting skill, and `operation` is one of
  // those two, so at least one doc always survives. Asserted rather than
  // branched on, so the invariant fails loudly if the skill sets ever grow a
  // third operation.
  if (!keep.length) throw new Error(`invariant: every copy retired for "${docs[0].prompt}"`);

  return { action: 'retire', operation, retire, keep };
}

/** Normalized prompt — must match auditProblemClassification.js's promptKey. */
function promptKey(prompt) {
  return String(prompt || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9+\-*/=<>().,^%$ ]/g, '')
    .trim();
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  if (UNDO) {
    const res = await Problem.updateMany(
      { tags: RETIRE_TAG },
      { $set: { isActive: true }, $pull: { tags: RETIRE_TAG } }
    );
    console.log(`reactivated ${res.modifiedCount} problem(s) previously retired by this script`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const all = await Problem.find({})
    .select('problemId skillId prompt isActive tags')
    .lean();

  const groups = new Map();
  for (const d of all) {
    const k = promptKey(d.prompt);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }

  const plans = [];
  const skipped = [];
  for (const [, docs] of groups) {
    if (docs.length < 2) continue;
    if (new Set(docs.map((d) => d.skillId)).size < 2) continue; // same-skill dupes: not this script
    const plan = planForGroup(docs);
    if (plan.action === 'retire') plans.push({ docs, ...plan });
    else skipped.push({ docs, ...plan });
  }

  console.log('\n═══ Operator-contradiction fix ═══');
  console.log(`cross-skill duplicate groups   ${plans.length + skipped.length}`);
  console.log(`  operator contradiction        ${plans.length}  ← this script`);
  console.log(`  skipped (other/ambiguous)     ${skipped.length}  ← canonical-owner pass`);

  const bySkill = {};
  for (const p of plans) {
    for (const d of p.retire) bySkill[d.skillId] = (bySkill[d.skillId] || 0) + 1;
  }
  if (Object.keys(bySkill).length) {
    console.log('\n─── copies to retire, by skill ───');
    for (const [s, n] of Object.entries(bySkill).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${s}`);
    }
  }

  console.log('\n─── plan ───');
  for (const p of plans) {
    console.log(`  "${String(p.docs[0].prompt).slice(0, 46)}"  [${p.operation}]`);
    for (const d of p.retire) console.log(`      retire  ${d.skillId}  (${d.problemId})`);
    for (const d of p.keep) console.log(`      keep    ${d.skillId}  (${d.problemId})`);
  }

  const manual = skipped.filter((s) => s.reason.includes('manual review'));
  if (manual.length) {
    console.log('\n─── needs manual review (every copy contradicts its prompt) ───');
    for (const m of manual) {
      console.log(`  "${String(m.docs[0].prompt).slice(0, 60)}" — ${m.docs.map((d) => d.skillId).join(', ')}`);
    }
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. ${plans.length} group(s) would change.`);
    console.log('Re-run with --apply to deactivate the contradicted copies (reversible with --undo).');
    await mongoose.disconnect();
    process.exit(0);
  }

  let retired = 0;
  for (const p of plans) {
    for (const d of p.retire) {
      await Problem.updateOne(
        { _id: d._id },
        { $set: { isActive: false }, $addToSet: { tags: RETIRE_TAG } }
      );
      retired += 1;
    }
  }
  console.log(`\nAPPLIED — deactivated ${retired} contradicted copies. Reverse with --undo.`);

  await mongoose.disconnect();
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { promptOperation, skillOperation, planForGroup, promptKey };
