// scripts/estimateActDifficulty.js
//
// Estimate each ACT item's difficulty from its CONTENT, on the Fable bank's
// 1-5 scale, so forms can be ordered sensibly before there is response data.
//
//   node scripts/estimateActDifficulty.js --validate[=N]   rate N held-out Fable items, compare to their authored ratings
//   node scripts/estimateActDifficulty.js --run            rate every unrated item, write seeds/act-difficulty-estimates.json
//   node scripts/estimateActDifficulty.js --fit            map the estimates onto the Fable scale (run after --run)
//   options: --model=gpt-4o  --bank=ies,enhanced  --force (re-rate rated items)
//
// WHY
// Forms are ordered by difficulty, and no item is calibrated yet (calibration
// needs real student responses; prod has ~35 tests, nearly all audit
// simulations). Until then the order rests on AUTHORED ratings, and two banks'
// ratings say little: the IES expansion rated by position within each skill (a
// fixed quota), and the enhanced drop rated per template (1-3). An external
// reviewer read a form and could tell at a glance that an easy recipe ratio
// did not belong at #41 after logarithms — so can a model, given a rubric and
// anchors.
//
// HOW
// - The scale is the Fable bank's: every Fable item was rated individually,
//   and calibration (utils/itemCalibration.js) equates the other banks to it.
// - The prompt carries a rubric plus ANCHORS: two Fable items per level, fixed
//   and reproducible, so "3" means the same thing in every batch.
// - --validate rates Fable items that are NOT anchors and reports agreement
//   with their authored ratings (Spearman ρ, exact and within-one). Run it
//   before --run; it is the evidence the estimates are worth using.
// - Estimates are an ORDERING aid. A calibrated item ignores its estimate
//   (utils/actTestAssembler.js preciseDifficulty), and the estimate becomes
//   the prior calibration shrinks toward.
//
// Items are math questions with no student data, so nothing personal leaves.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { callLLMStructured } = require('../utils/llmGateway');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'seeds', 'act-difficulty-estimates.json');
const RUBRIC_VERSION = 1;
const BANK_FILES = {
  fable: 'seeds/act-fable-items.generated.json',
  ies: 'seeds/act-ies-expansion/ies-items.generated.json',
  enhanced: 'seeds/act-enhanced/act-items.generated.json',
  visual: 'seeds/act-visual/act-visual-items.generated.json',
  reasoning: 'seeds/act-reasoning/act-reasoning-items.generated.json',
};

const args = process.argv.slice(2);
const arg = (k) => { const a = args.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a ? (a.split('=')[1] || true) : null; };
const MODEL = arg('model') || 'gpt-4o';
const BATCH = 15;

const RUBRIC = `You rate ACT Math questions for difficulty on a 1-5 scale, as a typical high-school junior taking the ACT would experience them.

1 = one routine step on a familiar middle-school skill (a percent of a number, a unit conversion, reading a value from a table).
2 = a routine Algebra 1 / basic geometry task in one or two standard steps (solve a linear equation, area of a familiar shape, slope from two points).
3 = several steps or a standard Algebra 2 / geometry / statistics procedure the student must carry out carefully (systems, quadratics, conditional probability from a table, similar triangles).
4 = the student must choose an approach or connect two ideas, or the topic is upper-level (logarithms, trig ratios and graphs, complex numbers, matrices, compositions/inverses, harder probability).
5 = the hardest end of an ACT form: an unfamiliar setup, several concepts combined, or precise reasoning where a plausible shortcut fails.

Rate the MATH the student must do, not the length of the wording. A long story with one division is easy; a short stem about a complex quotient is not. Use one decimal (e.g. 2.5).`;

function itemText(it) {
  const choices = (it.options || []).map((o) => `${o.label}) ${o.text}`).join('   ');
  return `${it.prompt}${it.figureAlt ? `\n[Figure: ${it.figureAlt}]` : ''}\nChoices: ${choices}`;
}

function loadBanks() {
  const out = {};
  for (const [k, f] of Object.entries(BANK_FILES)) out[k] = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  return out;
}

/** Two Fable items per level, chosen deterministically (spread across skills). */
function pickAnchors(fable) {
  const anchors = [];
  for (let lv = 1; lv <= 5; lv++) {
    const pool = fable.filter((i) => i.difficulty === lv && !i.svg).sort((a, b) => (a.problemId < b.problemId ? -1 : 1));
    const seenSkill = new Set();
    for (const it of pool) {
      if (seenSkill.has(it.skillId)) continue;
      seenSkill.add(it.skillId);
      // Every 7th distinct skill, so anchors are not all from one area.
      if (seenSkill.size % 7 === 1) anchors.push(it);
      if (anchors.filter((a) => a.difficulty === lv).length === 2) break;
    }
  }
  return anchors;
}

function anchorBlock(anchors) {
  return anchors.map((a) => `RATED ${a.difficulty}.0:\n${itemText(a)}`).join('\n\n');
}

const SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'difficulty_ratings',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ratings'],
      properties: {
        ratings: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'difficulty'],
            properties: { id: { type: 'string' }, difficulty: { type: 'number' } },
          },
        },
      },
    },
  },
};

async function rateBatch(items, anchors) {
  const user = `Reference questions with their ratings (use these to calibrate the scale):\n\n${anchorBlock(anchors)}\n\n`
    + `Now rate each of these. Return one rating per id.\n\n${items.map((it) => `ID ${it.problemId}:\n${itemText(it)}`).join('\n\n')}`;
  const res = await callLLMStructured(MODEL, [{ role: 'system', content: RUBRIC }, { role: 'user', content: user }], SCHEMA, { temperature: 0, max_tokens: 2000 });
  const parsed = res && res.parsed ? res.parsed : (typeof res === 'object' ? res : JSON.parse(res));
  const map = new Map();
  for (const r of (parsed.ratings || [])) {
    const d = Number(r.difficulty);
    if (Number.isFinite(d) && d >= 1 && d <= 5) map.set(String(r.id), Math.round(d * 10) / 10);
  }
  return map;
}

async function rateAll(items, anchors, onBatch) {
  const out = new Map();
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    let got = new Map();
    for (let attempt = 0; attempt < 3 && got.size < batch.length; attempt++) {
      try { got = await rateBatch(batch, anchors); } catch (e) { console.warn(`  batch ${i / BATCH + 1} attempt ${attempt + 1}: ${e.message}`); }
    }
    for (const [k, v] of got) out.set(k, v);
    if (onBatch) onBatch(out, Math.min(i + BATCH, items.length), items.length);
  }
  return out;
}

function spearman(xs, ys) {
  const rank = (v) => {
    const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(v.length);
    for (let i = 0; i < idx.length;) {
      let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / rx.length, my = ry.reduce((a, b) => a + b, 0) / ry.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return num / Math.sqrt(dx * dy);
}

async function validate(banks, anchors, n) {
  const anchorIds = new Set(anchors.map((a) => a.problemId));
  const pool = banks.fable.filter((i) => !anchorIds.has(i.problemId)).sort((a, b) => (a.problemId < b.problemId ? -1 : 1));
  const step = Math.max(1, Math.floor(pool.length / n));
  const sample = pool.filter((_, i) => i % step === 0).slice(0, n);
  console.log(`validating on ${sample.length} held-out Fable items with ${MODEL} (${anchors.length} anchors)…`);
  const est = await rateAll(sample, anchors);
  const pairs = sample.filter((i) => est.has(i.problemId)).map((i) => [i.difficulty, est.get(i.problemId)]);
  const rho = spearman(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
  const exact = pairs.filter(([a, e]) => Math.round(e) === a).length;
  const within1 = pairs.filter(([a, e]) => Math.abs(e - a) <= 1).length;
  const mae = pairs.reduce((s, [a, e]) => s + Math.abs(e - a), 0) / pairs.length;
  console.log(`rated ${pairs.length}/${sample.length} · Spearman ρ = ${rho.toFixed(2)} · exact ${exact}/${pairs.length} · within 1: ${within1}/${pairs.length} · mean |error| ${mae.toFixed(2)}`);
  const byLevel = {};
  pairs.forEach(([a, e]) => { (byLevel[a] = byLevel[a] || []).push(e); });
  Object.keys(byLevel).sort().forEach((lv) => console.log(`  authored ${lv}: mean estimate ${(byLevel[lv].reduce((s, x) => s + x, 0) / byLevel[lv].length).toFixed(2)} (n=${byLevel[lv].length})`));
  return { rho, exact, within1, n: pairs.length, mae };
}

async function run(banks, anchors) {
  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { _meta: {}, estimates: {} };
  const wanted = (arg('bank') ? String(arg('bank')).split(',') : Object.keys(BANK_FILES));
  const todo = wanted.flatMap((b) => banks[b]).filter((it) => arg('force') || !existing.estimates[it.problemId]);
  console.log(`rating ${todo.length} items from ${wanted.join(', ')} with ${MODEL}…`);
  const save = (est) => {
    for (const [id, d] of est) existing.estimates[id] = d;
    existing._meta = { ...existing._meta, model: MODEL, rubricVersion: RUBRIC_VERSION, anchors: anchors.map((a) => a.problemId), scale: 'act-fable authored 1-5', updatedAt: new Date().toISOString().slice(0, 10) };
    const sorted = Object.fromEntries(Object.entries(existing.estimates).sort(([a], [b]) => (a < b ? -1 : 1)));
    fs.writeFileSync(OUT, JSON.stringify({ _meta: existing._meta, estimates: sorted }, null, 1) + '\n');
  };
  await rateAll(todo, anchors, (est, done, total) => { save(est); process.stdout.write(`\r  ${done}/${total}`); });
  console.log(`\nwrote ${path.relative(ROOT, OUT)} (${Object.keys(existing.estimates).length} estimates)`);
}

/**
 * Put the raw estimates on the Fable scale. The rater compresses the ends (its
 * 5s average ~3.5), so a straight least-squares line from raw estimate to
 * Fable's authored rating, fitted over every rated Fable item that is not an
 * anchor, is stored in _meta.map and applied at read time
 * (utils/actDifficultyEstimates.js). Also records how well the estimates
 * agree with Fable's ratings, which tests pin.
 */
function fit(banks, anchors) {
  const file = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const anchorIds = new Set(anchors.map((a) => a.problemId));
  const pairs = banks.fable
    .filter((i) => !anchorIds.has(i.problemId) && file.estimates[i.problemId] != null)
    .map((i) => [file.estimates[i.problemId], i.difficulty]);
  const n = pairs.length;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n, my = pairs.reduce((s, p) => s + p[1], 0) / n;
  const b = pairs.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / pairs.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  const a = my - b * mx;
  const mapped = pairs.map(([x, y]) => [Math.min(5, Math.max(1, a + b * x)), y]);
  const rho = spearman(pairs.map((p) => p[1]), pairs.map((p) => p[0]));
  const within1 = mapped.filter(([e, y]) => Math.abs(e - y) <= 1).length;
  const mae = mapped.reduce((s, [e, y]) => s + Math.abs(e - y), 0) / n;
  file._meta.map = { a: Math.round(a * 1000) / 1000, b: Math.round(b * 1000) / 1000 };
  file._meta.validation = { against: 'act-fable authored (non-anchor)', n, spearman: Math.round(rho * 100) / 100, within1: Math.round((within1 / n) * 100) / 100, mae: Math.round(mae * 100) / 100 };
  fs.writeFileSync(OUT, JSON.stringify(file, null, 1) + '\n');
  console.log(`fit on ${n} Fable items: authored ≈ ${a.toFixed(2)} + ${b.toFixed(2)} × estimate · ρ ${rho.toFixed(2)} · within 1: ${(within1 / n * 100).toFixed(0)}% · mean |error| ${mae.toFixed(2)}`);
}

async function main() {
  const banks = loadBanks();
  const anchors = pickAnchors(banks.fable);
  if (arg('validate')) return validate(banks, anchors, Number(arg('validate')) || 60);
  if (arg('run')) return run(banks, anchors);
  if (arg('fit')) return fit(banks, anchors);
  console.log('pass --validate[=N], --run, or --fit');
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

module.exports = { pickAnchors, spearman, RUBRIC_VERSION };
