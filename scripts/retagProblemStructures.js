/**
 * RETAG: move CGI problem-structure items onto the operation they actually use.
 *
 * `result-unknown`, `change-unknown`, `part-part-whole`, `missing-addend` and
 * friends (~450 problems) are Cognitively Guided Instruction problem
 * STRUCTURES — which quantity is unknown — not skills. They are an orthogonal
 * dimension encoded as sibling skills, which is why they collide with
 * `addition` in the duplicate audit rather than nesting under it, and why no
 * course pathway can reach them.
 *
 * Owner's decision (2026-07-30): fold them into their operation, so practice
 * for `addition` automatically draws varied problem structures. That is
 * pedagogically right — a student who only ever sees `5 + 3 = __` and never
 * `5 + __ = 8` has a thinner grasp of addition.
 *
 * WHY PER-ITEM RATHER THAN A CROSSWALK ALIAS.
 * A crosswalk maps a whole skill to one target. That is safe for
 * `missing-addend` (always addition) but wrong for `result-unknown`, which
 * spans both operations — `5 - 2 = __` is result-unknown too. Only 23 of 55
 * `result-unknown` items collided with `addition`; a blanket alias would file
 * the rest as addition and serve subtraction items in addition practice. So the
 * operation is read from each prompt, exactly as
 * fixOperatorMisfiledProblems.js does for multiply/divide.
 *
 * The structure is preserved as a `structure:<original>` tag, so the CGI
 * dimension is not lost — it moves from the wrong field to a right one, and
 * --undo can restore the original skillId from it.
 *
 * SAFETY
 * - Dry-run by default; nothing written without --apply.
 * - Skips any item whose operation is ambiguous or absent. Skips are reported.
 * - Fully reversible: --undo restores skillId from the preserved tag.
 *
 * Run:
 *   node scripts/retagProblemStructures.js            # dry-run
 *   node scripts/retagProblemStructures.js --apply
 *   node scripts/retagProblemStructures.js --undo
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

const APPLY = process.argv.includes('--apply');
const UNDO = process.argv.includes('--undo');
const TAG_PREFIX = 'structure:';

/**
 * CGI structure skills and the operation they imply, if any.
 * `null` means the structure spans operations and must be read per prompt —
 * the whole reason this runs per-item.
 */
const STRUCTURE_SKILLS = {
  'missing-addend': 'addition',
  'unknown-addend': 'addition',
  'addition-as-joining': 'addition',
  'result-unknown': null,
  'change-unknown': null,
  'part-part-whole': null,
  'missing-number-problems': null,
  'number-bonds': null,
  'compose-numbers': null,
  'decompose-numbers': null,
};

const TARGETS = { addition: 'addition', subtraction: 'subtraction' };

/**
 * Which operation does this prompt use? Symbols first (unambiguous), then
 * word cues for the word problems that carry no symbol at all.
 *
 * A missing-addend item like `5 + __ = 8` is ADDITION even though solving it
 * requires subtracting: the structure sits in the addition family. Read the
 * expression as written, never the solution method.
 */
function promptOperation(prompt) {
  const s = String(prompt || '');
  if (!s.trim()) return null;

  // Hyphens inside words are not minus signs. Without this, "Sam had
  // twenty-one apples" reads as subtraction and a correct addition item gets
  // filed under the wrong operation.
  const arith = s.replace(/(?<=[a-z])[-−](?=[a-z])/gi, ' ');

  const plus = /\+/.test(arith);
  const minus = /[-−]/.test(arith);
  if (plus && !minus) return 'addition';
  if (minus && !plus) return 'subtraction';
  if (plus && minus) return null; // mixed expression — not ours to judge

  // Note what is absent: a bare "more". "How many more does Sam have than
  // Amy?" is a difference problem, so "more" alone cannot mean addition.
  // Anything genuinely ambiguous is left to skip rather than guessed.
  const addWords = /\b(sum|add(ed|ing)?|altogether|in all|total|combined|join(s|ed|ing)?|more than)\b/i.test(s);
  const subWords = /\b(difference|subtract(ed|ing)?|fewer|less than|left|remain|take away|gave away)\b/i.test(s);
  if (addWords && !subWords) return 'addition';
  if (subWords && !addWords) return 'subtraction';

  // CGI change-unknown word problems carry no operator and no cue word:
  // "Tim had 8 toys. Now he has 10 toys. How many did he get?" is 8 + __ = 10.
  // The direction of the change decides the operation, so compare the two
  // quantities rather than skipping 198 perfectly determinable items.
  const change = /\bhad\s+(\d+)\b[\s\S]*?\bnow\b[\s\S]*?\bhas\s+(\d+)\b/i.exec(s);
  if (change) {
    const before = Number(change[1]);
    const after = Number(change[2]);
    if (after > before) return 'addition';
    if (after < before) return 'subtraction';
    return null; // no change at all — nothing to infer
  }

  return null;
}

/**
 * Decide one item's fate. Returns { action, target, reason }.
 */
function planForProblem(problem) {
  const declared = STRUCTURE_SKILLS[problem.skillId];
  if (declared === undefined) {
    return { action: 'skip', reason: 'not a structure skill' };
  }

  // A structure that implies its operation still gets checked against the
  // prompt: a `missing-addend` item that plainly subtracts is a tagging bug,
  // and quietly filing it as addition would bake that bug in.
  const observed = promptOperation(problem.prompt);
  if (declared && observed && observed !== declared) {
    return {
      action: 'skip',
      reason: `"${problem.skillId}" implies ${declared} but the prompt ${observed}s — needs review`,
    };
  }

  const operation = declared || observed;
  if (!operation) {
    return { action: 'skip', reason: 'operation not determinable from the prompt' };
  }
  return { action: 'retag', target: TARGETS[operation], operation };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  if (UNDO) {
    const tagged = await Problem.find({ tags: { $regex: `^${TAG_PREFIX}` } })
      .select('problemId skillId tags').lean();
    let restored = 0;
    for (const p of tagged) {
      const tag = (p.tags || []).find((t) => t.startsWith(TAG_PREFIX));
      if (!tag) continue;
      await Problem.updateOne(
        { _id: p._id },
        { $set: { skillId: tag.slice(TAG_PREFIX.length) }, $pull: { tags: tag } }
      );
      restored += 1;
    }
    console.log(`restored ${restored} problem(s) to their original structure skillId`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const problems = await Problem.find({ skillId: { $in: Object.keys(STRUCTURE_SKILLS) } })
    .select('problemId skillId prompt tags').lean();

  const plans = [];
  const skips = [];
  for (const p of problems) {
    const plan = planForProblem(p);
    if (plan.action === 'retag') plans.push({ p, ...plan });
    else skips.push({ p, ...plan });
  }

  const moved = {};
  for (const { p, target } of plans) {
    const k = `${p.skillId} → ${target}`;
    moved[k] = (moved[k] || 0) + 1;
  }

  console.log('\n═══ CGI structure retag ═══');
  console.log(`structure-skill problems  ${problems.length}`);
  console.log(`  retag                   ${plans.length}`);
  console.log(`  skip                    ${skips.length}`);

  console.log('\n─── moves ───');
  for (const [k, n] of Object.entries(moved).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${k}`);
  }

  const bySkipReason = {};
  for (const s of skips) bySkipReason[s.reason] = (bySkipReason[s.reason] || 0) + 1;
  if (skips.length) {
    console.log('\n─── skipped ───');
    for (const [r, n] of Object.entries(bySkipReason).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(5)}  ${r}`);
    }
    console.log('\n  sample:');
    for (const s of skips.slice(0, 12)) {
      console.log(`    ${s.p.skillId.padEnd(24)} "${String(s.p.prompt).slice(0, 50)}"`);
    }
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. ${plans.length} problem(s) would move.`);
    console.log('Re-run with --apply (reversible with --undo).');
    await mongoose.disconnect();
    process.exit(0);
  }

  let done = 0;
  for (const { p, target } of plans) {
    await Problem.updateOne(
      { _id: p._id },
      { $set: { skillId: target }, $addToSet: { tags: `${TAG_PREFIX}${p.skillId}` } }
    );
    done += 1;
  }
  console.log(`\nAPPLIED — retagged ${done} problem(s). Structure preserved as a tag; reverse with --undo.`);

  await mongoose.disconnect();
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { promptOperation, planForProblem, STRUCTURE_SKILLS, TAG_PREFIX };
