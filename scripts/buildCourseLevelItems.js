'use strict';
/**
 * Build the AT-LEVEL item bank for course skills.
 *
 * WHY THIS EXISTS. A course names its skills ("volume of a cylinder",
 * "compare and order rational numbers"); the problem bank predates the courses
 * and was wired to them by a crosswalk that points each course skill at the
 * nearest LARGE pool. Read against the live bank (2026-11-21, 21,797 items),
 * about seventy of those pools do not test the skill at all:
 *
 *   8th grade  volume of a cylinder / cone / sphere  → prism volume and cube surface area
 *   8th grade  ordering real numbers                 → "Order from least to greatest: 14, 16, 6" (preK)
 *   8th grade  rigid transformations                 → shifting the graph of y = x²
 *   7th grade  unit rates                            → "If you travel 15 apples in 7.5 bags…"
 *   geometry   arc length, sector area, inscribed angles → the equation of a circle
 *
 * A course's quick check closes a module on two such items per skill, and the
 * "I think I already know this!" button proves a skill on five. So each of
 * those skills gets items written FOR it, at the course's level, and the check
 * is pointed at them and nothing else (seeds/course-level-sources.generated.json,
 * read by utils/courseCheckSources.js).
 *
 * Answers are computed from the numbers drawn (scripts/lib/templateKit.js) and
 * the output is deterministic, so a diff is always a real content change.
 *
 *   node scripts/buildCourseLevelItems.js            # write both seed files
 *   node scripts/buildCourseLevelItems.js --sample   # print one item per tier, write nothing
 *   node scripts/buildCourseLevelItems.js --only=Grade8 [--sample]   # one template file
 */

const fs = require('fs');
const path = require('path');
const { rngFrom, buildItem } = require('./lib/templateKit');

const SOURCE = 'course-level-2026-11';
const PER_TIER = 4;
const MAX_ATTEMPTS = 60;

// One file per course: scripts/lib/courseLevel<Name>.js exporting
// { COURSE_ID, GB, TEMPLATES: [{ courseSkill, skillId, tiers: [{ difficulty, gen }] }] }.
const BANK_NAMES = ['Grade6', 'Grade7', 'Grade8', 'GeometryA', 'GeometryB', 'EarlyMath', 'ConsumerMath'];

const SEEDS = path.join(__dirname, '..', 'seeds');
const OUT_ITEMS = path.join(SEEDS, 'course-level-items.generated.json');
const OUT_SOURCES = path.join(SEEDS, 'course-level-sources.generated.json');

function expand(template, gradeBand) {
  const items = [];
  const seen = new Set();
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
      if (seen.has(out.prompt)) continue;
      seen.add(out.prompt);
      idx += 1;
      made += 1;
      items.push(buildItem({
        skillId: template.skillId,
        prompt: out.prompt,
        value: out.value,
        explanation: out.explanation,
        difficulty: tier.difficulty,
        gradeBand: template.gradeBand || gradeBand,
        options: out.options,
        correctOption: out.correctOption,
        source: SOURCE,
        idx,
      }));
    }
    if (made < PER_TIER) {
      throw new Error(`${template.skillId} d${tier.difficulty}: only ${made} unique items in ${MAX_ATTEMPTS} attempts (need ${PER_TIER})`);
    }
  }
  return items;
}

function validate(items) {
  // The check serves an item only when it can be shown as text and graded
  // cleanly — the same test the routes apply. An item that fails it here would
  // be dead weight in the bank.
  const { isCheckable } = require('../utils/coursePlacementService');
  const problems = [];
  const ids = new Set();
  const tiers = {};
  for (const it of items) {
    if (ids.has(it.problemId)) problems.push(`duplicate problemId ${it.problemId}`);
    ids.add(it.problemId);
    if (!it.explanation || it.explanation.length < 25) problems.push(`${it.problemId}: explanation too short`);
    if (/undefined|NaN|\[object/.test(`${it.prompt}${it.answer.value}`) || /NaN|\[object/.test(String(it.explanation))) {
      problems.push(`${it.problemId}: rendering hole — ${it.prompt}`);
    }
    if (/^-?\d+\.\d{5,}$/.test(String(it.answer.value))) {
      problems.push(`${it.problemId}: non-terminating answer ${it.answer.value}`);
    }
    if (it.answerType === 'multiple-choice') {
      const chosen = (it.options || []).find((o) => o.label === it.correctOption);
      if (!chosen) problems.push(`${it.problemId}: correctOption ${it.correctOption} not present`);
      else if (chosen.text !== String(it.answer.value)) {
        problems.push(`${it.problemId}: option ${it.correctOption} = ${JSON.stringify(chosen.text)} but answer = ${JSON.stringify(it.answer.value)}`);
      }
      if ((it.options || []).length !== 4) problems.push(`${it.problemId}: needs exactly 4 options`);
      if (new Set((it.options || []).map((o) => o.text)).size !== (it.options || []).length) {
        problems.push(`${it.problemId}: duplicate option texts`);
      }
    }
    if (!isCheckable(it)) {
      problems.push(`${it.problemId}: not checkable (needs a figure, or does not grade cleanly) — ${it.prompt} → ${it.answer.value}`);
    }
    const k = `${it.skillId} d${it.difficulty}`;
    (tiers[k] = tiers[k] || []).push(String(it.answer.value));
  }
  for (const [k, v] of Object.entries(tiers)) {
    if (new Set(v).size === 1) problems.push(`${k}: all ${v.length} items answer "${v[0]}" — vary the question`);
  }
  return problems;
}

function main() {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice(7).split(',') : null;
  const sample = process.argv.includes('--sample');

  const all = [];
  const sources = {};
  for (const name of BANK_NAMES) {
    if (only && !only.includes(name)) continue;
    const file = path.join(__dirname, 'lib', `courseLevel${name}.js`);
    if (!fs.existsSync(file)) {
      if (only) throw new Error(`missing ${file}`);
      continue;
    }
    const bank = require(file);
    for (const t of bank.TEMPLATES) {
      if (!t.courseSkill || !t.skillId) throw new Error(`${name}: a template needs courseSkill and skillId`);
      all.push(...expand(t, bank.GB));
      const forCourse = (sources[bank.COURSE_ID] = sources[bank.COURSE_ID] || {});
      if (forCourse[t.courseSkill]) throw new Error(`${bank.COURSE_ID}: ${t.courseSkill} has two templates`);
      forCourse[t.courseSkill] = [t.skillId];
    }
  }

  const failures = validate(all);
  if (failures.length) {
    console.error(`VALIDATION FAILED (${failures.length}):`);
    failures.slice(0, 40).forEach((f) => console.error('  ' + f));
    process.exit(1);
  }

  if (sample) {
    const seen = new Set();
    for (const it of all) {
      const k = `${it.skillId}|${it.difficulty}`;
      if (seen.has(k)) continue;
      seen.add(k);
      console.log(`\n── ${it.skillId}  d${it.difficulty}`);
      console.log(`   Q: ${it.prompt}`);
      if (it.options) console.log(`   ${it.options.map((o) => `${o.label}) ${o.text}`).join('   ')}`);
      console.log(`   A: ${it.options ? it.correctOption + ' = ' : ''}${it.answer.value}`);
      console.log(`   E: ${it.explanation.slice(0, 160)}`);
    }
    console.log(`\n${all.length} items (nothing written)`);
    return;
  }
  if (only) {
    console.log(`${all.length} items valid (--only writes nothing)`);
    return;
  }

  fs.writeFileSync(OUT_ITEMS, JSON.stringify(all, null, 1) + '\n');
  fs.writeFileSync(OUT_SOURCES, JSON.stringify(sources, null, 1) + '\n');
  const skills = new Set(all.map((i) => i.skillId)).size;
  console.log(`Wrote ${all.length} items for ${skills} skills to ${path.relative(process.cwd(), OUT_ITEMS)}`);
  console.log(`Wrote the check's sources for ${Object.keys(sources).length} courses to ${path.relative(process.cwd(), OUT_SOURCES)}`);
}

if (require.main === module) main();

module.exports = { expand, validate, SOURCE, PER_TIER, BANK_NAMES };
