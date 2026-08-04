'use strict';
/**
 * Expand the problem TEMPLATES into a seed file for the skills the coverage
 * audit showed EMPTY.
 *
 * Every answer is computed by the template from the numbers it drew, so a wrong
 * answer here is a code bug, not a typo — that is what makes bulk generation
 * safe. Output is deterministic (seeded PRNG), so re-running reproduces the
 * file byte-for-byte and a diff always means a real content change.
 *
 *   node scripts/buildLowVolumeItems.js            # write the seed file
 *   node scripts/buildLowVolumeItems.js --sample   # print a few items, write nothing
 */

const fs = require('fs');
const path = require('path');
const { rngFrom, buildItem } = require('./lib/templateKit');

const SOURCE = 'low-volume-2026-08';
const PER_TIER = 4;          // variants drawn per difficulty tier
const MAX_ATTEMPTS = 40;     // draws attempted per variant before giving up

const BANKS = [
  require('./lib/templatesAlgebra1'),
  require('./lib/templatesGrade6'),
  require('./lib/templatesGrade8'),
  require('./lib/templatesGrade67'),
  require('./lib/templatesAlgebra2'),
  require('./lib/templatesPrecalc'),
  require('./lib/templatesGeometry'),
  require('./lib/templatesActStrategy'),
  require('./lib/templatesCalcAB'),
  require('./lib/templatesCalcBC'),
];

const OUT = path.join(__dirname, '..', 'seeds', 'low-volume-items.generated.json');

/**
 * Skills whose content ALREADY EXISTS in the bank under another name and is
 * now crosswalked (seeds/unified-taxonomy/pathway-crosswalk.manual.json).
 *
 * Generating for these was a mistake: the coverage audit measures REACHABILITY,
 * not existence, so an unmapped skill reads "empty" whether or not problems
 * exist for it. A full DB export showed g6-one-two-step-equations already had
 * 424 problems under one-step-equations, g6-percent-intro 355 under
 * percent-of-a-number, and four of the generated prompts were exact duplicates
 * of existing rows. Crosswalking is strictly better than duplicating: it serves
 * more problems, of reviewed quality, to practice packs and challenges too.
 *
 * Skills where the bank is genuinely THIN (<30) keep their generated items —
 * there the templates add real depth and a difficulty spread the bank lacks.
 */
/**
 * Skills the BANK already covers — generating for these was a mistake.
 *
 * The coverage audit reports REACHABILITY, not existence: a skill reads
 * "empty" both when no content exists and when it exists under a name the
 * crosswalk doesn't map. Reading empty as "needs content" put generated items
 * on top of 845 existing one-step/two-step equation problems, 383 ordering
 * problems, 355 percent problems, 300+ each of mean/median/mode. The fix is a
 * crosswalk row (seeds/unified-taxonomy/pathway-crosswalk.manual.json), never
 * new items.
 *
 * Threshold for landing here: the bank holds 30+ problems AND covers the skill
 * FULLY. `algebraic-properties` deliberately does NOT qualify — it maps only
 * to distributive-property (60), so the commutative, associative and identity
 * items are the only coverage those cases have.
 */
const CROSSWALKED_SKIP = new Set([
  'g6-one-two-step-equations',    // one-step-equations (424) + two-step (421)
  'g6-compare-order-rationals',   // ordering-numbers (383)
  'g6-percent-intro',             // percent-of-a-number (355)
  'measures-of-central-tendency', // mean (306) / median (307) / mode (292)
  'g6-fraction-multiply-divide',  // multiply-fractions (195) + divide (177)
  'g6-fraction-add-subtract',     // add-fractions (165) + subtract (157)
  'g6-equivalent-ratios',         // ratios (140)
  'g6-ratio-language',            // ratios (140)
  'g6-distance-coordinate-plane', // coordinate-plane (124)
  'variable-expressions',         // evaluate-expressions (123)
  'g6-combine-like-terms',        // combining-like-terms (81)
  'g6-write-expressions',         // writing-algebraic-expressions (30)
]);

function expand(template) {
  const items = [];
  const seenPrompts = new Set();
  let idx = 0;

  for (const tier of template.tiers) {
    const rng = rngFrom(`${template.skillId}|${tier.difficulty}`);
    let made = 0;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && made < PER_TIER; attempt++) {
      let out;
      try {
        out = tier.gen(rng, made);
      } catch (err) {
        throw new Error(`${template.skillId} d${tier.difficulty}: generator threw — ${err.message}`, { cause: err });
      }
      if (!out || !out.prompt || out.value === undefined || out.value === null) {
        throw new Error(`${template.skillId} d${tier.difficulty}: generator returned no prompt/value`);
      }
      // Identical draws are common with small number ranges — skip, don't ship duplicates.
      if (seenPrompts.has(out.prompt)) continue;
      seenPrompts.add(out.prompt);
      idx += 1;
      made += 1;
      items.push(buildItem({
        skillId: template.skillId,
        prompt: out.prompt,
        value: out.value,
        explanation: out.explanation,
        difficulty: tier.difficulty,
        gradeBand: template.gradeBand || ' ',
        options: out.options,
        correctOption: out.correctOption,
        source: SOURCE,
        idx,
      }));
    }
    if (made === 0) {
      throw new Error(`${template.skillId} d${tier.difficulty}: produced no unique items in ${MAX_ATTEMPTS} attempts`);
    }
  }
  return items;
}

/**
 * A difficulty tier whose items ALL share one answer is not practice — the
 * student can pick it without reading the mathematics. This bit us for real:
 * 12 tiers (45 items, 11% of the first build) were answer-identical, because
 * each tier asked about exactly one case. Random draws are not enough either;
 * a seed can legitimately flip the same way four times running. So this is a
 * hard build gate, and categorical templates cycle on the item index.
 */
function checkAnswerVariety(items) {
  const tiers = {};
  for (const it of items) {
    const k = `${it.skillId} d${it.difficulty}`;
    (tiers[k] = tiers[k] || []).push(String(it.answer.value));
  }
  return Object.entries(tiers)
    .filter(([, v]) => v.length >= 3 && new Set(v).size === 1)
    .map(([k, v]) => `${k}: all ${v.length} items answer "${v[0]}" — vary the question, not just the numbers`);
}

function validate(items) {
  const problems = [];
  const ids = new Set();
  for (const it of items) {
    if (ids.has(it.problemId)) problems.push(`duplicate problemId ${it.problemId}`);
    ids.add(it.problemId);
    if (!it.prompt || it.prompt.length < 8) problems.push(`${it.problemId}: prompt too short`);
    if (!it.explanation || it.explanation.length < 25) problems.push(`${it.problemId}: explanation too short`);
    if (String(it.answer.value).trim() === '') problems.push(`${it.problemId}: empty answer`);
    // A rendering hole shows up as a literal "undefined"/"NaN" where a value
    // belongs. Checking the explanation too was a false positive: "the function
    // is undefined at that point" is correct mathematical prose, not a bug. So
    // scan the prompt and the ANSWER (an answer is never legitimately the word
    // "undefined"), and keep the stricter markers everywhere.
    if (/undefined|NaN|\[object/.test(`${it.prompt}${it.answer.value}`)
        || /NaN|\[object/.test(String(it.explanation))) {
      problems.push(`${it.problemId}: rendering hole (undefined/NaN) — ${it.prompt}`);
    }
    // A float with a long tail means the numbers were drawn without checking the
    // division comes out clean — "10.666666666666666 pieces of ribbon" is not an
    // answer a student can type, or should be asked for.
    if (/^-?\d+\.\d{5,}$/.test(String(it.answer.value))) {
      problems.push(`${it.problemId}: non-terminating answer ${it.answer.value} — pick numbers that divide evenly`);
    }
    if (it.answerType === 'multiple-choice') {
      const chosen = (it.options || []).find((o) => o.label === it.correctOption);
      if (!chosen) problems.push(`${it.problemId}: correctOption ${it.correctOption} not present`);
      else if (chosen.text !== String(it.answer.value)) {
        problems.push(`${it.problemId}: option ${it.correctOption} = ${JSON.stringify(chosen.text)} but answer = ${JSON.stringify(it.answer.value)}`);
      }
      if (new Set((it.options || []).map((o) => o.text)).size !== (it.options || []).length) {
        problems.push(`${it.problemId}: duplicate option texts`);
      }
    }
  }
  return problems;
}

const all = [];
const skipped = [];
for (const bank of BANKS) {
  for (const t of bank.TEMPLATES) {
    if (CROSSWALKED_SKIP.has(t.skillId)) { skipped.push(t.skillId); continue; }
    const tpl = { ...t, gradeBand: t.gradeBand || bank.GB };
    all.push(...expand(tpl));
  }
}

const failures = validate(all).concat(checkAnswerVariety(all));
if (failures.length) {
  console.error(`VALIDATION FAILED (${failures.length}):`);
  failures.slice(0, 25).forEach((f) => console.error('  ' + f));
  process.exit(1);
}

if (process.argv.includes('--sample')) {
  const bySkill = {};
  for (const it of all) (bySkill[it.skillId] = bySkill[it.skillId] || []).push(it);
  for (const [skill, list] of Object.entries(bySkill)) {
    const s = list[0];
    console.log(`\n── ${skill} (${list.length} items, difficulties ${[...new Set(list.map((i) => i.difficulty))].join('/')})`);
    console.log(`   Q: ${s.prompt}`);
    console.log(`   A: ${s.answer.value}`);
    console.log(`   E: ${s.explanation.slice(0, 150)}`);
  }
  console.log(`\nTotal: ${all.length} items across ${Object.keys(bySkill).length} skills (nothing written)`);
  process.exit(0);
}

fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
const bySkill = all.reduce((m, i) => ({ ...m, [i.skillId]: (m[i.skillId] || 0) + 1 }), {});
console.log(`Wrote ${all.length} items to ${path.relative(process.cwd(), OUT)}`);
console.log(`${Object.keys(bySkill).length} skills, ${Math.min(...Object.values(bySkill))}-${Math.max(...Object.values(bySkill))} items each`);
