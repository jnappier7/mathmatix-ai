/**
 * FIX THE 93 ACTIVE MC ITEMS WHOSE KEY AND OPTIONS DISAGREE (2026-11-03)
 *
 * `node scripts/regenerateStaleMcOptions.js --check` found them. Every key was
 * re-solved from its prompt (see the PR); in all 93 the KEY is right and the
 * item's other half is wrong. Two families:
 *
 *  1. correctOption names the wrong option (69 items — the generated-2026-02
 *     concept bank and the cleaned+generated fraction/ratio items). The
 *     grader's letter path (Method 1) accepts correctOption outright and its
 *     text path (Method 2) accepts the option whose text matches the key, so
 *     BOTH the right pick and the wrongly keyed one graded correct, and any
 *     surface that shows "the answer was X" showed the wrong one.
 *     Fix: point correctOption at the one option that grades correct. Never
 *     taken on the stored data's word alone — the key must be re-solved
 *     (RESOLVERS), or two independent fields must agree on it: a letter key
 *     whose own option's text is also among its equivalents.
 *
 *  2. The 24 Algebra 1 (alg1-fable) MC items: letter-only keys ("A",
 *     "B — (2, 6)", "Graph B (closed circle…)"), choices that printed their own
 *     letter ("A) A) 4 units right…"), and six "Which graph…" items that shipped
 *     with no graphs at all. Fixed at the source in scripts/ingestAlg1Items.py;
 *     this copies the regenerated seed docs' answer/options/correctOption/svg/
 *     figure onto prod — exactly what `seed:all` would write.
 *
 * Every item is validated after the change (validateOptions: exactly one
 * option grades correct, by text and by letter, and it is the keyed one).
 * Any failure blocks --write.
 *
 * Run:
 *   node scripts/fixMcKeyDefects.js            # dry run (read-only)
 *   node scripts/fixMcKeyDefects.js --write    # apply
 */

const fs = require('fs');
const path = require('path');
const { bankDefect, gradesCorrect, validateOptions } = require('./regenerateStaleMcOptions');

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
const ALG1_SEED = path.join(__dirname, '..', 'seeds', 'alg1-items.generated.json');

const optText = (o) => (o && typeof o === 'object' ? o.text : o);
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const fracStr = (n, d) => {
  const g = gcd(n, d) || 1;
  const [p, q] = [n / g, d / g];
  return q === 1 ? String(p) : `${p}/${q}`;
};

/**
 * Re-solve an item from its prompt alone. Returns the answer TEXT a student
 * should pick, or null when the prompt isn't one this knows.
 */
const RESOLVERS = {
  'volume-rectangular-prisms'(q) {
    const m = q.match(/length=(\d+), width=(\d+), height=(\d+)/);
    return m ? `${m[1] * m[2] * m[3]} cubic units` : null;
  },
  'comparing-fractions'(q) {
    const m = q.match(/^Compare: (\d+)\/(\d+) ___ (\d+)\/(\d+)$/);
    if (!m) return null;
    const [a, b, c, d] = m.slice(1).map(Number);
    const s = a * d === b * c ? '=' : a * d > b * c ? '>' : '<';
    return `${a}/${b} ${s} ${c}/${d}`;
  },
  'pythagorean-theorem'(q) {
    const m = q.match(/sides (\d+), (\d+), (\d+) a right triangle/);
    if (!m) return null;
    const [a, b, c] = m.slice(1).map(Number).sort((x, y) => x - y);
    return a * a + b * b === c * c ? 'Yes' : 'No';
  },
  'subtract-fractions'(q) {
    const m = q.match(/^Subtract: (\d+)\/(\d+) - (\d+)\/(\d+)$/);
    if (!m) return null;
    const [a, b, c, d] = m.slice(1).map(Number);
    return fracStr(a * d - c * b, b * d);
  },
  'multiply-fractions'(q) {
    const m = q.match(/^Multiply: (\d+)\/(\d+) × (\d+)\/(\d+)$/);
    if (!m) return null;
    const [a, b, c, d] = m.slice(1).map(Number);
    return fracStr(a * c, b * d);
  },
  ratios(q) {
    const m = q.match(/^Simplify the ratio: (\d+):(\d+)$/);
    if (!m) return null;
    const [a, b] = m.slice(1).map(Number);
    const g = gcd(a, b);
    return `${a / g}:${b / g}`;
  },
  'proportional-relationships'(q) {
    const m = q.match(/uses (\d+) cups flour for (\d+) cookies\. How much for (\d+) cookies/);
    if (!m) return null;
    const [f, n, t] = m.slice(1).map(Number);
    return `${fracStr(f * t, n)} cups`;
  },
  'simplify-rational-expressions'(q) {
    // (ax + b)/a with a | b
    const m = q.match(/^Simplify: \((\d+)x \+ (\d+)\)\/(\d+)$/);
    if (!m) return null;
    const [a, b, c] = m.slice(1).map(Number);
    if (a !== c || b % c) return null;
    return `x + ${b / c}`;
  },
  'ratio-concepts'(q) {
    const m = q.match(/^The ratio (\d+):(\d+) means:$/);
    return m ? `${m[1]} parts to ${m[2]} parts` : null;
  }
};

/**
 * Why we trust this item's key, or null. Re-solved beats everything; failing
 * that, a letter key whose own option's text is also an equivalent — two
 * fields, written together, against correctOption alone.
 */
function keyWitness(p) {
  const answer = p.answer || {};
  const texts = (p.options || []).map(optText);
  const solver = RESOLVERS[p.skillId];
  if (solver) {
    const solved = solver(String(p.prompt || '').trim());
    if (solved === null) return null;
    return gradesCorrect(solved, answer) ? `re-solved: ${solved}` : null;
  }
  const v = String(answer.value || '').trim().toUpperCase();
  const i = LABELS.indexOf(v);
  if (/^[A-F]$/.test(v) && i < texts.length) {
    const own = String(texts[i] || '').trim().toLowerCase();
    if ((answer.equivalents || []).some((e) => String(e).trim().toLowerCase() === own)) {
      return `letter ${v} and its text agree`;
    }
  }
  return null;
}

/**
 * Plan the change for one defective item.
 * Returns { set, note } or { error }.
 */
function planFix(p, seedById) {
  if (p.source === 'alg1-fable') {
    const s = seedById.get(p.problemId);
    if (!s) return { error: `no seed doc for ${p.problemId}` };
    const set = {
      answer: s.answer,
      options: s.options,
      correctOption: s.correctOption,
      svg: s.svg,
      figure: s.figure
    };
    return { set, note: 'alg1 seed' };
  }

  const texts = (p.options || []).map(optText);
  const correct = texts
    .map((t, i) => (t != null && gradesCorrect(String(t), p.answer || {}) ? i : -1))
    .filter((i) => i >= 0);
  if (correct.length !== 1) return { error: `${correct.length} options grade correct against the key` };
  const witness = keyWitness(p);
  if (!witness) return { error: 'key not independently confirmed' };
  const label = (p.options[correct[0]] && p.options[correct[0]].label) || LABELS[correct[0]];
  return { set: { correctOption: label }, note: witness };
}

/** The item as it would be after `set`, checked the same way the bank is. */
function checkAfter(p, set) {
  const after = { ...p, ...set };
  const errors = validateOptions({
    options: (after.options || []).map((o, i) => ({ label: o.label || LABELS[i], text: optText(o) })),
    correctOption: after.correctOption,
    answer: after.answer
  });
  const defect = bankDefect(after);
  if (defect) errors.push(defect);
  return errors;
}

async function main() {
  require('dotenv').config();
  const mongoose = require('mongoose');
  const WRITE = process.argv.includes('--write');

  const seed = JSON.parse(fs.readFileSync(ALG1_SEED, 'utf8'));
  const seedById = new Map(seed.map((s) => [s.problemId, s]));

  await mongoose.connect(process.env.MONGO_URI);
  const coll = mongoose.connection.db.collection('problems');
  try {
    const defective = [];
    for await (const p of coll.find({ isActive: true, 'options.0': { $exists: true } })) {
      if (bankDefect(p)) defective.push(p);
    }
    console.log(`${WRITE ? 'WRITE' : 'DRY RUN'}: ${defective.length} active MC items with a key/option defect\n`);

    const ok = []; const failed = [];
    for (const p of defective) {
      const plan = planFix(p, seedById);
      if (plan.error) { failed.push({ p, error: plan.error }); continue; }
      const errors = checkAfter(p, plan.set);
      if (errors.length) failed.push({ p, error: `after fix: ${errors.join('; ')}` });
      else ok.push({ p, ...plan });
    }

    const bySkill = {};
    for (const r of ok) (bySkill[r.p.skillId] = bySkill[r.p.skillId] || []).push(r);
    for (const [skill, list] of Object.entries(bySkill).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`=== ${list.length}  ${skill}`);
      for (const { p, set, note } of list) {
        const was = (p.options || []).map((o) => `${o.label === p.correctOption ? '*' : ''}${o.label}) ${optText(o)}`).join('  ');
        console.log(`  ${p.prompt}\n    key ${JSON.stringify(p.answer.value)}  [${note}]\n    was: ${was}`);
        if (set.options) {
          const now = set.options.map((o) => `${o.label === set.correctOption ? '*' : ''}${o.label}) ${o.text}`).join('  ');
          console.log(`    now: ${now}   key ${JSON.stringify(set.answer.value)}${set.svg && !p.svg ? '  (+choice figure)' : ''}`);
        } else {
          console.log(`    now: correctOption ${p.correctOption} → ${set.correctOption}`);
        }
      }
    }
    console.log(`\nFixable ${ok.length}, refused ${failed.length}`);
    for (const { p, error } of failed) console.log(`  REFUSED ${p._id} ${p.skillId} "${p.prompt}": ${error}`);

    if (!WRITE) { console.log('\nDry run — nothing written. Re-run with --write to apply.'); return; }
    if (failed.length) { console.log('\nRefusing to write while any item is refused.'); process.exitCode = 1; return; }

    const now = new Date();
    const res = await coll.bulkWrite(ok.map(({ p, set }) => ({
      updateOne: {
        // only if the item is still exactly what was planned against
        filter: { _id: p._id, correctOption: p.correctOption, 'answer.value': p.answer.value },
        update: { $set: { ...set, updatedAt: now } }
      }
    })));
    console.log(`\nWrote: matched ${res.matchedCount}, modified ${res.modifiedCount}`);
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { RESOLVERS, keyWitness, planFix, checkAfter };

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
