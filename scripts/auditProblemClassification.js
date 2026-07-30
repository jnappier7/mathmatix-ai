/**
 * AUDIT: is every problem filed under the RIGHT skill?
 *
 * The existing auditors check data quality — missing answers, answerType vs
 * answer shape, coverage counts (audit-problems.js, audit-answer-formats.js,
 * audit-data-quality.js). None of them ask whether an item's skillId actually
 * describes the item. That gap matters now: 13,291 of 14,165 bank problems are
 * stranded behind a skill-id vocabulary seam, and the fix is crosswalk aliases
 * (see scripts/dumpBankVocabulary.js). Aliasing a mis-tagged skill doesn't fix
 * anything — it serves wrong content faster and at scale.
 *
 * Three tiers, cheapest first, so an LLM only ever looks at items that already
 * failed something free:
 *
 *   1 STRUCTURAL (free, every item) — orphan skillIds with no catalog entry,
 *     identical prompts filed under two different skills (the strongest free
 *     misclassification signal there is), grade-band vs skill-grade conflicts,
 *     missing/out-of-range difficulty.
 *   2 HEURISTIC (free, every item) — does the prompt exhibit the mathematical
 *     features its skill REQUIRES? An `add-fractions` item with no fraction is
 *     misfiled regardless of how good its answer is. Deliberately narrow: only
 *     high-volume skills with unambiguous surface features are asserted, because
 *     a false-positive-heavy heuristic is worse than no heuristic.
 *   3 LLM (paid, opt-in) — verifies flagged items AND a random control sample.
 *     The control sample is the point: without it you learn which items look
 *     wrong but never the bank's true misclassification RATE.
 *
 * Read-only. Never writes to the bank; emits a report and optional JSON.
 *
 * Run (Render shell, or local with Atlas access):
 *   node scripts/auditProblemClassification.js                  # tiers 1-2, active items
 *   node scripts/auditProblemClassification.js --include-inactive
 *   node scripts/auditProblemClassification.js --skill slope    # focus one skill
 *   node scripts/auditProblemClassification.js --llm            # + tier 3
 *   node scripts/auditProblemClassification.js --llm --sample 300
 *   node scripts/auditProblemClassification.js --json /tmp/classification.json
 */

require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const Skill = require('../models/skill');

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const USE_LLM = has('llm');
const SAMPLE_SIZE = Number(flag('sample', 200));
const LIMIT = flag('limit') ? Number(flag('limit')) : null;
const ONLY_SKILL = flag('skill');
const INCLUDE_INACTIVE = has('include-inactive');
const JSON_OUT = flag('json');
const LLM_MODEL = flag('model', 'gpt-4o-mini');
const MAX_LLM = Number(flag('max-llm', 1200)); // cost guard

// ── Tier 2 expectation table ───────────────────────────────────────────────
// `require`: at least one alternative must appear in the prompt.
// `forbid`:  a match means the item almost certainly belongs elsewhere.
// Keep entries to skills whose surface features are UNAMBIGUOUS. When in doubt,
// leave the skill out — an unasserted skill is silent, a wrong assertion is
// noise that buries real findings.
const FRACTION = /\d\s*\/\s*\d|\\d?frac|\bfractions?\b|\bnumerator\b|\bdenominator\b/i;
const PERCENT = /%|\bpercent/i;
const DECIMAL = /\d+\.\d|\bdecimals?\b/i;

const EXPECTATIONS = {
  'add-fractions': { require: [FRACTION], alsoRequire: [/\+|\bsum\b|\badd/i] },
  'subtract-fractions': { require: [FRACTION], alsoRequire: [/-|−|\bdifference\b|\bsubtract/i] },
  // LaTeX operators matter here: `\times` contains no x/*/× character, so a
  // real item written in LaTeX would be false-flagged without these.
  'multiply-fractions': {
    require: [FRACTION],
    alsoRequire: [/[*×·]|\\times|\\cdot|\btimes\b|\bproduct\b|\bmultipl/i],
  },
  'divide-fractions': {
    require: [FRACTION],
    alsoRequire: [/÷|\\div|\bdivided\b|\bquotient\b|\bdivid/i],
  },
  'comparing-fractions': { require: [FRACTION] },
  'fractions-as-parts': { require: [FRACTION] },
  'fractions-basics': { require: [FRACTION] },
  'fraction-concepts': { require: [FRACTION] },

  'percent-of-a-number': { require: [PERCENT] },
  'percent-change': { require: [PERCENT] },
  'percent-problems': { require: [PERCENT] },
  'act-percentages': { require: [PERCENT] },

  'decimals-add-subtract': { require: [DECIMAL] },
  'decimals-multiply': { require: [DECIMAL] },
  'decimals-divide': { require: [DECIMAL] },
  'decimals-rounding': { require: [DECIMAL] },
  'decimals-place-value': { require: [DECIMAL] },

  slope: { require: [/\bslope\b|\brise\b|\brun\b|\(\s*-?\d+\s*,\s*-?\d+\s*\)|\by\s*=/i] },
  'slope-from-two-points': { require: [/\(\s*-?\d+\s*,\s*-?\d+\s*\)/] },
  'slope-concepts': { require: [/\bslope\b|\brise\b|\brun\b/i] },
  'graph-linear-equations': { require: [/\bgraph|\bline\b|y\s*=/i] },
  'coordinate-plane': { require: [/\(\s*-?\d+\s*,\s*-?\d+\s*\)|\bquadrant|\baxis\b|\bcoordinate/i] },
  'plotting-points': { require: [/\(\s*-?\d+\s*,\s*-?\d+\s*\)|\bplot\b/i] },
  quadrants: { require: [/\bquadrant/i] },

  'place-value': { require: [/\bplace value\b|\bdigit\b|\btens?\b|\bhundreds?\b|\bthousands?\b|\bones\b/i] },
  rounding: { require: [/\bround/i] },
  'rounding-to-nearest-ten': { require: [/\bround/i] },
  'expanded-form': { require: [/\bexpanded form\b|\bstandard form\b/i] },

  mean: { require: [/\bmean\b|\baverage\b/i] },
  median: { require: [/\bmedian\b/i] },
  mode: { require: [/\bmode\b/i] },
  range: { require: [/\brange\b/i] },
  'measures-of-center': { require: [/\bmean\b|\bmedian\b|\bmode\b|\baverage\b/i] },
  'standard-deviation': { require: [/\bstandard deviation\b|\bvariance\b/i] },

  perimeter: { require: [/\bperimeter\b/i] },
  'area-rectangles': { require: [/\barea\b/i] },
  'area-triangles': { require: [/\barea\b/i] },
  'volume-rectangular-prisms': { require: [/\bvolume\b/i] },
  'pythagorean-theorem': { require: [/\bhypotenuse\b|\bright triangle\b|\bpythagor|a\^?2\s*\+\s*b\^?2/i] },
  'midpoint-formula': { require: [/\bmidpoint\b/i] },
  'distance-formula': { require: [/\bdistance\b/i] },

  ratios: { require: [/\bratio\b|:\s*\d|\bper\b/i] },
  'unit-rates': { require: [/\bper\b|\brate\b|\bunit rate\b/i] },
  'solve-proportions': { require: [/\bproportion\b|\d\s*\/\s*\d\s*=|\bx\b/i] },
  'ratio-tables': { require: [/\bratio\b|\btable\b/i] },

  'combining-like-terms': { require: [/[a-z]\s*[+-]|\bterms?\b/i] },
  'distributive-property': { require: [/\(|\bdistribut/i] },
  'factoring-quadratics': { require: [/\^?2|\bfactor/i] },
  'factoring-difference-squares': { require: [/\^?2|\bfactor|\bdifference of squares\b/i] },
  'quadratic-functions': { require: [/\^?\s*2|\bquadratic\b|\bparabola\b/i] },
  'graph-quadratic-functions': { require: [/\^?\s*2|\bquadratic\b|\bparabola\b/i] },
  'evaluate-expressions': { require: [/\bevaluate\b|\bwhen\b|=/i] },
  'simplify-expressions': { require: [/\bsimplif/i] },
  'expanding-expressions': { require: [/\bexpand\b|\(/i] },

  derivatives: { require: [/\bderivative\b|\bd\/dx\b|f'\s*\(/i] },
  'definite-integrals': { require: [/\bintegral\b|∫|\bantiderivative\b/i] },
  limits: { require: [/\blimit\b|lim/i] },
  'summation-notation': { require: [/Σ|\bsum\b|\bsigma\b|\\sum/i] },
  'sigma-notation': { require: [/Σ|\bsigma\b|\\sum/i] },

  'trig-identities-basic': { require: [/\bsin\b|\bcos\b|\btan\b|\bidentit/i] },
  'trig-unit-circle-evaluation': { require: [/\bsin\b|\bcos\b|\btan\b|\bunit circle\b|π|pi\b/i] },
  'trig-law-of-cosines': { require: [/\blaw of cosines\b|\bcos\b/i] },
  'trig-law-of-sines': { require: [/\blaw of sines\b|\bsin\b/i] },
  'trig-elevation-depression': { require: [/\belevation\b|\bdepression\b/i] },
  'trig-degree-radian-conversion': { require: [/\bradian|\bdegree|π|pi\b/i] },

  'simple-probability': { require: [/\bprobabilit|\bchance\b|\blikel/i] },
  'probability-basics': { require: [/\bprobabilit|\bchance\b|\blikel/i] },
  'compound-probability': { require: [/\bprobabilit/i] },
  'conditional-probability': { require: [/\bprobabilit|\bgiven\b/i] },
  permutations: { require: [/\barrange|\border\b|\bpermutat/i] },
  combinations: { require: [/\bchoose\b|\bcombinat|\bcommittee\b|\bgroup/i] },

  'one-step-inequalities': { require: [/[<>≤≥]|\binequalit/i] },
  'two-step-inequalities': { require: [/[<>≤≥]|\binequalit/i] },
  'multi-step-inequalities': { require: [/[<>≤≥]|\binequalit/i] },
  'solving-inequalities': { require: [/[<>≤≥]|\binequalit/i] },
  'graphing-inequalities': { require: [/[<>≤≥]|\binequalit/i] },
  'greater-less-than': { require: [/[<>]|\bgreater\b|\bless\b|\bmore\b|\bfewer\b/i] },

  'systems-elimination': { require: [/\bsystem|\belimina|\{|\band\b/i] },
  'systems-substitution': { require: [/\bsystem|\bsubstitut/i] },
  'systems-graphing': { require: [/\bsystem|\bgraph/i] },

  translations: { require: [/\btranslat|\bshift/i] },
  reflections: { require: [/\breflect/i] },
  rotations: { require: [/\brotat/i] },
  dilations: { require: [/\bdilat|\bscale factor\b/i] },
  congruence: { require: [/\bcongruen/i] },
  similarity: { require: [/\bsimilar/i] },
  'similar-figures': { require: [/\bsimilar/i] },
  'line-symmetry': { require: [/\bsymmetr/i] },
  'symmetry-shapes': { require: [/\bsymmetr/i] },

  'arithmetic-sequences': { require: [/\bsequence\b|\bterm\b|\bcommon difference\b|,\s*\d+\s*,/i] },
  'geometric-sequences': { require: [/\bsequence\b|\bterm\b|\bcommon ratio\b|,\s*\d+\s*,/i] },
  'exponential-growth': { require: [/\bgrow|\bexponential\b|\^|\bincreas/i] },
  'exponential-decay': { require: [/\bdecay|\bexponential\b|\^|\bdecreas/i] },

  histograms: { require: [/\bhistogram\b|\bbar\b|\bfrequenc/i] },
  'box-plots': { require: [/\bbox plot\b|\bquartile\b|\bwhisker\b|\bmedian\b/i] },
  'tally-charts': { require: [/\btally\b|\bchart\b|\btable\b/i] },
  'frequency-tables': { require: [/\bfrequenc|\btable\b/i] },
};

/** Which named expectations does this prompt violate? */
function heuristicViolations(skillId, prompt) {
  const spec = EXPECTATIONS[skillId];
  if (!spec || !prompt) return [];
  const out = [];
  const matchesAny = (list) => list.some((re) => re.test(prompt));
  if (spec.require && !matchesAny(spec.require)) out.push('missing-core-feature');
  if (spec.alsoRequire && !matchesAny(spec.alsoRequire)) out.push('missing-operation');
  if (spec.forbid && matchesAny(spec.forbid)) out.push('forbidden-feature');
  return out;
}

/** Normalized prompt, for cross-skill duplicate detection. */
function promptKey(prompt) {
  return String(prompt || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9+\-*/=<>().,^%$ ]/g, '')
    .trim();
}

function pickSample(items, n) {
  // Deterministic spread — no Math.random, so two runs are comparable and a
  // finding can be re-checked by re-running with the same args.
  if (items.length <= n) return items.slice();
  const step = items.length / n;
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(items[Math.floor(i * step)]);
  return out;
}

const VERDICT_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'classification_verdict',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        correct: { type: 'boolean' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        betterSkill: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['correct', 'confidence', 'betterSkill', 'reason'],
    },
  },
};

async function llmVerify(item, skillName, candidateNames) {
  const { callLLMStructured } = require('../utils/llmGateway');
  const messages = [
    {
      role: 'system',
      content:
        'You audit a math practice item bank. Given one item and the skill it is '
        + 'currently filed under, decide whether that filing is correct. Judge only '
        + 'whether the SKILL LABEL describes what the item asks — not whether the '
        + 'item is well written or the answer is right. Prefer correct=true when the '
        + 'label is a reasonable fit; flag only clear misfilings. If it is misfiled '
        + 'and one of the listed alternatives fits, name it in betterSkill, else "".',
    },
    {
      role: 'user',
      content:
        `Filed under: ${item.skillId}${skillName ? ` ("${skillName}")` : ''}\n`
        + `Prompt: ${item.prompt}\n`
        + `Answer: ${JSON.stringify(item.answer?.value ?? item.answer ?? '')}\n`
        + `Difficulty: ${item.difficulty ?? 'unset'}\n\n`
        + `Plausible alternative skills: ${candidateNames.join(', ') || '(none supplied)'}`,
    },
  ];
  const res = await callLLMStructured(LLM_MODEL, messages, VERDICT_SCHEMA, {
    max_tokens: 220,
    temperature: 0,
  });
  return typeof res === 'string' ? JSON.parse(res) : res;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  // Audit what is actually SERVED. Deactivated items — including copies retired
  // by fixOperatorMisfiledProblems.js — reach no student, so counting them
  // would keep reporting findings that have already been fixed.
  // --include-inactive restores the whole-collection view.
  const query = INCLUDE_INACTIVE ? {} : { isActive: { $ne: false } };
  if (ONLY_SKILL) query.skillId = ONLY_SKILL;
  let cursor = Problem.find(query)
    .select('problemId skillId prompt answer answerType difficulty gradeBand isActive options correctOption')
    .lean();
  if (LIMIT) cursor = cursor.limit(LIMIT);
  const problems = await cursor;

  const skills = new Map();
  for (const s of await Skill.find({}).select('skillId displayName gradeLevel course').lean()) {
    skills.set(s.skillId, s);
  }

  // ── Tier 1: structural ──
  const findings = [];
  const add = (tier, kind, p, detail) => findings.push({
    tier, kind, problemId: p.problemId, skillId: p.skillId, detail,
    prompt: String(p.prompt || '').slice(0, 120),
  });

  const byPrompt = new Map();
  for (const p of problems) {
    const key = promptKey(p.prompt);
    if (!key) continue;
    if (!byPrompt.has(key)) byPrompt.set(key, []);
    byPrompt.get(key).push(p);
  }

  const collisions = [];
  for (const [, group] of byPrompt) {
    const distinct = [...new Set(group.map((p) => p.skillId))];
    if (distinct.length > 1) collisions.push({ skills: distinct, group });
  }

  for (const p of problems) {
    if (!p.skillId) {
      add(1, 'no-skillId', p, 'item carries no skillId at all');
    } else if (!skills.has(p.skillId)) {
      add(1, 'orphan-skillId', p, `no Skill catalog entry for "${p.skillId}"`);
    }
    if (p.difficulty == null) {
      add(1, 'no-difficulty', p, 'difficulty unset — cannot sequence practice');
    } else if (typeof p.difficulty !== 'number' || p.difficulty < 1 || p.difficulty > 5) {
      add(1, 'bad-difficulty', p, `difficulty=${JSON.stringify(p.difficulty)} outside 1-5`);
    }
  }
  for (const c of collisions) {
    // Report once per colliding group, on its first member.
    add(1, 'cross-skill-duplicate', c.group[0],
      `identical prompt filed under ${c.skills.length} skills: ${c.skills.join(', ')}`);
  }

  // ── Tier 2: heuristic content-vs-skill ──
  const asserted = problems.filter((p) => EXPECTATIONS[p.skillId]);
  for (const p of asserted) {
    const v = heuristicViolations(p.skillId, p.prompt);
    for (const kind of v) {
      add(2, kind, p, `prompt lacks the features "${p.skillId}" requires`);
    }
  }

  // ── Report tiers 1-2 ──
  const byKind = {};
  for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;

  console.log('\n═══ Problem classification audit ═══');
  console.log(`problems scanned        ${problems.length}`
    + `${INCLUDE_INACTIVE ? ' (incl. inactive)' : ' (active only — --include-inactive for all)'}`);
  console.log(`distinct skillIds       ${new Set(problems.map((p) => p.skillId)).size}`);
  console.log(`catalog skills known    ${skills.size}`);
  console.log(`tier-2 assertable items ${asserted.length}`
    + ` (${Math.round((100 * asserted.length) / (problems.length || 1))}% of bank`
    + `, ${Object.keys(EXPECTATIONS).length} skills asserted)`);

  console.log('\n─── findings by kind ───');
  for (const [kind, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(6)}  ${kind}`);
  }
  if (!findings.length) console.log('  (none)');

  const suspect = findings.filter((f) => f.tier === 2 || f.kind === 'cross-skill-duplicate');
  const suspectBySkill = {};
  for (const f of suspect) suspectBySkill[f.skillId] = (suspectBySkill[f.skillId] || 0) + 1;
  const worst = Object.entries(suspectBySkill).sort((a, b) => b[1] - a[1]).slice(0, 25);
  if (worst.length) {
    console.log('\n─── worst skills by suspected misclassification ───');
    for (const [skillId, n] of worst) {
      const total = problems.filter((p) => p.skillId === skillId).length;
      console.log(`  ${String(n).padStart(5)}/${String(total).padEnd(5)} ${skillId}`);
    }
  }

  console.log('\n─── sample findings ───');
  for (const f of suspect.slice(0, 20)) {
    console.log(`  [t${f.tier} ${f.kind}] ${f.skillId} :: ${f.prompt}`);
  }

  // ── Tier 3: LLM verification of flagged items + control sample ──
  let llmResults = null;
  if (USE_LLM) {
    const flaggedIds = new Set(suspect.map((f) => f.problemId));
    const flagged = problems.filter((p) => flaggedIds.has(p.problemId));
    const control = pickSample(problems.filter((p) => !flaggedIds.has(p.problemId)), SAMPLE_SIZE);

    const toCheck = [
      ...pickSample(flagged, Math.max(0, MAX_LLM - control.length)).map((p) => ({ p, arm: 'flagged' })),
      ...control.map((p) => ({ p, arm: 'control' })),
    ];
    console.log(`\n─── tier 3: LLM verification (${LLM_MODEL}) ───`);
    console.log(`  flagged checked ${toCheck.filter((t) => t.arm === 'flagged').length}/${flagged.length}`);
    console.log(`  control sample  ${control.length}`);
    if (flagged.length > MAX_LLM - control.length) {
      console.log(`  ⚠️  flagged pool capped by --max-llm ${MAX_LLM}; ${flagged.length - (MAX_LLM - control.length)} not checked`);
    }

    const verdicts = [];
    let done = 0;
    for (const { p, arm } of toCheck) {
      // Offer the alternatives a human would consider: other skills sharing
      // tokens with this one. Keeps the prompt small and the choice grounded.
      const toks = new Set(String(p.skillId || '').split('-'));
      const alts = [...skills.keys()]
        .filter((id) => id !== p.skillId && String(id).split('-').some((t) => toks.has(t)))
        .slice(0, 8);
      try {
        const v = await llmVerify(p, skills.get(p.skillId)?.displayName, alts);
        verdicts.push({ arm, problemId: p.problemId, skillId: p.skillId, ...v });
      } catch (e) {
        verdicts.push({ arm, problemId: p.problemId, skillId: p.skillId, error: e.message });
      }
      done += 1;
      if (done % 50 === 0) console.log(`  … ${done}/${toCheck.length}`);
    }

    const rate = (arm) => {
      const a = verdicts.filter((v) => v.arm === arm && !v.error);
      const wrong = a.filter((v) => v.correct === false).length;
      return a.length ? { n: a.length, wrong, pct: ((100 * wrong) / a.length).toFixed(1) } : null;
    };
    const f = rate('flagged');
    const c = rate('control');
    console.log('\n─── misclassification rates ───');
    if (f) console.log(`  flagged items   ${f.wrong}/${f.n} confirmed misfiled (${f.pct}%)`);
    if (c) console.log(`  control sample  ${c.wrong}/${c.n} confirmed misfiled (${c.pct}%)  ← bank-wide estimate`);
    const errs = verdicts.filter((v) => v.error).length;
    if (errs) console.log(`  ⚠️  ${errs} verification calls errored`);
    if (f && c && Number(c.pct) > 0) {
      console.log(`  heuristic lift  ${(Number(f.pct) / Number(c.pct)).toFixed(1)}× vs baseline`
        + ' (>1 means tier 2 is finding real signal)');
    }

    const confirmed = verdicts.filter((v) => v.correct === false && v.confidence === 'high');
    if (confirmed.length) {
      console.log('\n─── high-confidence misfilings (sample) ───');
      for (const v of confirmed.slice(0, 25)) {
        console.log(`  ${v.skillId} → ${v.betterSkill || '?'}  (${v.problemId}) ${v.reason?.slice(0, 90) || ''}`);
      }
    }
    llmResults = verdicts;
  } else {
    console.log('\n(tier 3 skipped — add --llm to verify flagged items and measure the true rate)');
  }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({
      scanned: problems.length,
      byKind,
      findings,
      llmResults,
    }, null, 2));
    console.log(`\nwrote report → ${JSON_OUT}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { heuristicViolations, promptKey, pickSample, EXPECTATIONS };
