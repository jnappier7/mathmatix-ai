// scripts/ingestActEnhancedItems.js
//
// Normalize the `act-enhanced-2026-09` item drop into this bank's shape and
// this blueprint's taxonomy.
//
//   node scripts/ingestActEnhancedItems.js --in=<file.json>
//   node scripts/ingestActEnhancedItems.js --in=<file.json> --report
//
// Writes seeds/act-enhanced/act-items.generated.json. Pure transform — no DB.
//
// WHY A MAPPING STEP EXISTS AT ALL
// The drop carries its own 84-skill taxonomy (`percent-change`,
// `factoring-quadratics`, `mean-missing-value`). NONE of those ids appear in
// seeds/act-math-blueprint.json, and assembleForm builds every slot from the
// blueprint's skillsByCategory — so ingested as-is, all 1,200 items would sit
// in the bank permanently undrawable, with nothing failing to say so.
//
// The incoming taxonomy is about twice as fine as ours. Owner's call
// (2026-09-21) is to map it down rather than adopt it, because the review flow
// is built on naming a PATTERN: "you missed three ratio questions" is the most
// useful thing a result contains. Split across `percent-change`,
// `percent-applications` and `reverse-percent`, those three misses read as
// three unrelated accidents again — the exact failure the skill-clustered
// review was built to end. Concentrating evidence also matters for
// skillMastery, which needs repeated observations per skill to move.
//
// Nothing is lost: the incoming id is kept as a `fine:<id>` tag, so a future
// decision to split a skill can be made from the data rather than re-derived.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const IN = (args.find((a) => a.startsWith('--in=')) || '').split('=')[1];
const REPORT = args.includes('--report');
const OUT = path.join(__dirname, '..', 'seeds', 'act-enhanced', 'act-items.generated.json');
const SOURCE = 'act-enhanced-2026-09';

// ── The 84 -> 46 map ────────────────────────────────────────────────────────
// Every incoming skill has a home. Where the natural home sits in a different
// ACT category than the drop assigned (mean/median arrives tagged Statistics &
// Probability and lands on act-average-median, which this blueprint files under
// Integrating Essential Skills) OUR blueprint wins: that is where ACT itself
// scores those items, and it is the blueprint that builds the form.
const SKILL_MAP = {
  // Algebra
  'arithmetic-series': 'act-sequences',
  'compound-inequalities': 'act-linear-inequalities',
  'equations-with-distribution': 'act-linear-equations',
  'expanding-expressions': 'act-polynomial-expressions',
  'exponential-functions': 'act-exponential-models',
  'factoring-difference-squares': 'act-polynomial-expressions',
  'factoring-quadratics': 'act-quadratic-equations',
  'geometric-sequences': 'act-sequences',
  'literal-equations': 'act-linear-equations',
  'logarithm-properties': 'act-logarithms',
  'logarithmic-equations': 'act-logarithms',
  logarithms: 'act-logarithms',
  'quadratic-discriminant': 'act-quadratic-equations',
  'quadratic-vertex': 'act-quadratic-functions-parabolas',
  'simplify-rational-expressions': 'act-radical-rational-equations',

  // Functions
  'average-rate-of-change': 'act-linear-functions-models',
  'domain-range': 'act-function-evaluation-notation',
  'evaluate-functions': 'act-function-evaluation-notation',
  'function-composition': 'act-function-composition',
  'function-transformations': 'act-graph-transformations',
  // Inverses are taught and tested through composition — f(g(x)) = x.
  'inverse-functions': 'act-function-composition',
  'linear-functions': 'act-linear-functions-models',
  'parallel-perpendicular-slope': 'act-coordinate-geometry',
  'rational-functions': 'act-radical-rational-equations',
  'trig-functions': 'act-trigonometric-functions',

  // Geometry
  'arc-length-sector': 'act-circles',
  'area-parallelograms': 'act-area-perimeter',
  'area-trapezoids': 'act-area-perimeter',
  'area-triangles': 'act-area-perimeter',
  'circle-area-circumference': 'act-circles',
  'circle-equations': 'act-circles',
  'distance-formula': 'act-coordinate-geometry',
  'midpoint-formula': 'act-coordinate-geometry',
  'parallel-lines-angles': 'act-angles-parallel-lines',
  'polygon-angles': 'act-angles-parallel-lines',
  'pythagorean-theorem': 'act-triangles-pythagorean-theorem',
  'radians-degrees': 'act-trigonometric-functions',
  'scale-factor': 'act-similar-congruent-figures',
  'similar-triangles': 'act-similar-congruent-figures',
  'special-right-triangles': 'act-triangles-pythagorean-theorem',
  'surface-area': 'act-volume-surface-area',
  // GEOMETRIC transformations (translate/reflect a figure on the plane), not
  // graph transformations of a function — so coordinate geometry, which is
  // where the real forms put them.
  transformations: 'act-coordinate-geometry',
  'triangle-angles': 'act-triangles-angle-relationships',
  'trig-applications': 'act-right-triangle-trigonometry',
  'trig-identities': 'act-trigonometric-functions',
  'trig-ratios': 'act-right-triangle-trigonometry',
  'unit-circle': 'act-trigonometric-functions',
  'volume-solids': 'act-volume-surface-area',

  // Integrating Essential Skills
  'average-speed': 'act-rates-unit-conversion',
  'fractions-of-a-quantity': 'act-percentages',
  interest: 'act-percentages',
  'linear-word-problems': 'act-word-problems-modeling',
  'mixture-problems': 'act-word-problems-modeling',
  'percent-applications': 'act-percentages',
  'percent-change': 'act-percentages',
  'rate-time-distance': 'act-rates-unit-conversion',
  'ratio-word-problems': 'act-ratios-proportions',
  'reverse-percent': 'act-percentages',
  'systems-word-problems': 'act-systems-of-equations',
  'unit-conversion': 'act-rates-unit-conversion',
  'unit-rate': 'act-rates-unit-conversion',
  'work-rate': 'act-rates-unit-conversion',

  // Statistics & Probability
  'compound-probability': 'act-probability',
  'conditional-probability': 'act-conditional-probability',
  'counting-principle': 'act-counting-arrangements',
  'expected-value': 'act-expected-value',
  // ACT scores mean/median items as Integrating Essential Skills, which is
  // where act-average-median sits in this blueprint. The drop files them under
  // Statistics & Probability; the blueprint wins.
  'mean-missing-value': 'act-average-median',
  median: 'act-average-median',
  'weighted-average': 'act-average-median',
  'permutations-combinations': 'act-counting-arrangements',
  'range-iqr': 'act-center-spread',
  // Bivariate data has no home of its own in this taxonomy; center-spread is
  // the nearest "describing a data set" skill. Flagged in the report as the
  // one genuinely lossy mapping.
  'scatterplots-correlation': 'act-center-spread',
  'simple-probability': 'act-probability',
  'standard-deviation': 'act-center-spread',

  // Number & Quantity
  'absolute-value-equations': 'act-absolute-value-equations-inequalities',
  'complex-numbers': 'act-complex-numbers',
  'exponent-rules': 'act-exponent-rules',
  // LCM/GCF arrives tagged Number & Quantity. On the real forms it is an IES
  // item (every 24th and every 60th customer of 500), which is what
  // act-multi-step-arithmetic is.
  'gcf-lcm': 'act-multi-step-arithmetic',
  matrices: 'act-matrices-vectors',
  'negative-exponents': 'act-exponent-rules',
  'radical-operations': 'act-radicals-roots',
  'scientific-notation': 'act-scientific-notation',
  'simplify-radicals': 'act-radicals-roots',
  vectors: 'act-matrices-vectors',
};

const LOSSY = new Set(['scatterplots-correlation']);
const LABELS = ['A', 'B', 'C', 'D'];

/** Same signature assembleForm's pickDiverse dedups a form by. */
function promptSignature(s) {
  return String(s || '').replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim().slice(0, 90);
}

function normalize(raw, blueprintSkills) {
  const problems = [];
  const rejected = [];
  for (const p of raw) {
    const fine = p.skillId;
    const skillId = SKILL_MAP[fine];
    if (!skillId) { rejected.push({ problemId: p.problemId, reason: `unmapped skill "${fine}"` }); continue; }
    if (!blueprintSkills.has(skillId)) {
      rejected.push({ problemId: p.problemId, reason: `maps to "${skillId}", which the blueprint cannot draw` });
      continue;
    }
    const opts = Array.isArray(p.options) ? p.options.map((x) => String(x)) : [];
    if (opts.length !== 4) { rejected.push({ problemId: p.problemId, reason: `${opts.length} options, expected 4` }); continue; }
    if (new Set(opts).size !== 4) { rejected.push({ problemId: p.problemId, reason: 'duplicate option text' }); continue; }
    const idx = p.correctOption;
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) {
      rejected.push({ problemId: p.problemId, reason: `correctOption ${idx} out of range` });
      continue;
    }
    const answerValue = String((p.answer && p.answer.value) != null ? p.answer.value : opts[idx]);
    if (opts[idx].trim() !== answerValue.trim()) {
      // The key and the answer disagree. Never guess which is right — a wrong
      // key marks a correct student wrong, which is the most expensive bug
      // this bank can carry.
      rejected.push({ problemId: p.problemId, reason: `key/answer mismatch: option[${idx}]="${opts[idx]}" vs answer="${answerValue}"` });
      continue;
    }
    const difficulty = Math.max(1, Math.min(5, Number(p.difficulty) || 3));
    const prompt = String(p.prompt || '').trim();
    if (!prompt) { rejected.push({ problemId: p.problemId, reason: 'empty prompt' }); continue; }

    problems.push({
      problemId: p.problemId,
      skillId,
      prompt,
      svg: null,
      answer: {
        type: 'auto',
        value: answerValue,
        equivalents: Array.isArray(p.answer && p.answer.equivalents)
          ? [...new Set(p.answer.equivalents.map(String).filter((e) => e && e !== answerValue))]
          : [],
      },
      answerType: 'multiple-choice',
      // Our runner and grader speak in LETTER labels, never option indexes
      // (CLAUDE.md: "MC answers travel as the letter label ('C'), not the
      // option index"). The drop uses a 0-based index, so convert once here
      // rather than leaving every consumer to guess.
      options: opts.map((text, i) => ({ label: LABELS[i], text })),
      correctOption: LABELS[idx],
      difficulty,
      gradeBand: p.gradeBand || '8-12',
      ohioDomain: p.ohioDomain || undefined,
      // No explanation ships with this drop. Left empty rather than faked: the
      // ACT review prompt reads it as "WORKED SOLUTION (for YOUR reference)"
      // and already prints "(none stored)" when it is missing, and the tutor is
      // told to derive the answer itself before saying anything either way.
      explanation: '',
      tags: [...new Set([...(p.tags || []).map(String), 'act', 'act-math', `fine:${fine}`])],
      source: SOURCE,
      contentHash: crypto.createHash('sha256').update(`${p.problemId}|${prompt}|${answerValue}`).digest('hex'),
      isActive: p.isActive !== false,
    });
  }
  return { problems, rejected };
}

function main() {
  if (!IN || !fs.existsSync(IN)) {
    console.error('Pass --in=<path to the drop>.');
    process.exit(1);
  }
  const blueprint = require('../seeds/act-math-blueprint.json');
  const blueprintSkills = new Set(Object.values(blueprint.skillsByCategory).flat());
  const raw = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const { problems, rejected } = normalize(raw, blueprintSkills);

  // Never re-serve something the bank already has.
  const zlib = require('zlib');
  const existing = [
    ...require('../seeds/act-fable-items.generated.json'),
    ...JSON.parse(zlib.gunzipSync(fs.readFileSync(
      path.join(__dirname, '..', 'seeds/low-volume-expansion/act-items.generated.json.gz'))).toString('utf8')),
    ...require('../seeds/act-ies-expansion/ies-items.generated.json'),
  ];
  const existingIds = new Set(existing.map((p) => p.problemId));
  const existingShapes = new Set(existing.map((p) => promptSignature(p.prompt)));
  const kept = [];
  const seenIds = new Set();
  let dupId = 0;
  let dupShape = 0;
  for (const p of problems) {
    if (existingIds.has(p.problemId) || seenIds.has(p.problemId)) { dupId += 1; continue; }
    if (existingShapes.has(promptSignature(p.prompt))) { dupShape += 1; continue; }
    seenIds.add(p.problemId);
    kept.push(p);
  }

  fs.writeFileSync(OUT, `${JSON.stringify(kept, null, 1)}\n`);

  const bySkill = {};
  const byDiff = {};
  kept.forEach((p) => {
    bySkill[p.skillId] = (bySkill[p.skillId] || 0) + 1;
    byDiff[p.difficulty] = (byDiff[p.difficulty] || 0) + 1;
  });
  const shapes = new Set(kept.map((p) => promptSignature(p.prompt))).size;

  console.log(`in: ${raw.length}  ->  kept: ${kept.length}`);
  console.log(`  rejected: ${rejected.length}   dropped as already-present id: ${dupId}   as existing prompt shape: ${dupShape}`);
  console.log(`  distinct prompt shapes: ${shapes} (the rest are numeric variants — real for re-test freshness, not extra coverage)`);
  console.log(`  difficulty: ${JSON.stringify(byDiff)}`);
  console.log(`  skills touched: ${Object.keys(bySkill).length} of ${blueprintSkills.size}`);
  console.log(`  written: ${path.relative(process.cwd(), OUT)}`);
  if (rejected.length) {
    console.log('\n  rejections:');
    rejected.slice(0, 20).forEach((r) => console.log(`    ${r.problemId}: ${r.reason}`));
    if (rejected.length > 20) console.log(`    ... and ${rejected.length - 20} more`);
  }
  if (REPORT) {
    console.log('\n  per-skill:');
    Object.entries(bySkill).sort((a, b) => b[1] - a[1])
      .forEach(([s, n]) => console.log(`    ${String(n).padStart(4)}  ${s}`));
    console.log('\n  lossy mappings (kept, but the fine distinction is not recoverable from skillId alone):');
    [...LOSSY].forEach((f) => console.log(`    ${f} -> ${SKILL_MAP[f]}`));
  }
}

if (require.main === module) main();
module.exports = { SKILL_MAP, normalize, promptSignature, LOSSY };
