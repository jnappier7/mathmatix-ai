/**
 * REGENERATE STALE MULTIPLE-CHOICE OPTIONS (2026-11-03 key-fix follow-up)
 *
 * The 2026-11-03 run of the August item-bank repair corrected `answer.value`
 * on items that had since gained MC options built from the OLD wrong key, so
 * 435 items ended with no option matching their (now correct) answer. They
 * were deactivated and tagged `needsRegeneration: TAG`. This rebuilds their
 * options from the corrected key and re-activates them.
 *
 * Every item is re-solved from its own prompt first; an item whose stored key
 * disagrees with the re-solve is SKIPPED, never rebuilt — the options would
 * just inherit whichever side is wrong. Each rebuilt item must then pass
 * validateOptions: exactly one option grades correct through compareAnswer
 * (by text AND by letter), and no two options say the same thing.
 *
 * Run:
 *   node scripts/regenerateStaleMcOptions.js            # dry run (read-only)
 *   node scripts/regenerateStaleMcOptions.js --write    # apply
 *   node scripts/regenerateStaleMcOptions.js --check    # bank-wide check only
 *
 * Options:
 *   --samples=N   samples printed per skill in the dry run (default 10)
 */

const { compareAnswer, valuesMatch } = require('../utils/answerComparison');
const { canonicalFraction } = require('./generate-all-pattern-problems');
const { correctLabelOf } = require('../utils/mcOptions');

const TAG = 'mc-options-stale-after-key-fix-2026-11-03';
const LABELS = ['A', 'B', 'C', 'D'];

// ----------------------------------------------------------------------------
// Values: a rational is { n, d } with d > 0; rendered only via canonicalFraction
// ----------------------------------------------------------------------------

const frac = (n, d) => (d === 0 ? null : { n, d });
const fracStr = (r) => (r ? canonicalFraction(r.n, r.d) : null);
const neg = (r) => (r ? frac(-r.n, r.d) : null);
const recip = (r) => (r && r.n !== 0 ? frac(r.d, r.n) : null);

const FLIP = { '<': '>', '>': '<', '≤': '≥', '≥': '≤' };

// "x < 22/3" — the key's own symbol is kept, so the key option is its text
function inequality(op, r) {
  const v = fracStr(r);
  return v === null ? null : `x ${op} ${v}`;
}

// Numeric value of an option for the semantic duplicate check
function parseOption(text) {
  const s = String(text).trim().replace(/<=/g, '≤').replace(/>=/g, '≥');
  const m = s.match(/^x\s*([<>≤≥=])\s*(.+)$/);
  const toNum = (t) => {
    const f = t.match(/^(-?\d+)\s*\/\s*(\d+)$/);
    if (f) return Number(f[1]) / Number(f[2]);
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  if (m) return { op: m[1], value: toNum(m[2].trim()) };
  return { op: null, value: toNum(s) };
}

// ----------------------------------------------------------------------------
// Per-skill solvers: prompt → { key, distractors[] (ordered by preference) }
// Distractors are named misconceptions; extras beyond the first three are
// fallbacks for when an earlier one collides with the key or another option.
// ----------------------------------------------------------------------------

const ints = (s) => (s.match(/-?\d+/g) || []).map(Number);

const SOLVERS = {
  // "Solve for x: x ÷ 9 = 5"
  'one-step-equations'(prompt) {
    const m = prompt.match(/^Solve for x: x ÷ (\d+) = (-?\d+)$/);
    if (!m) return null;
    const a = Number(m[1]); const b = Number(m[2]);
    return {
      key: String(a * b),
      distractors: [
        fracStr(frac(b, a)),        // divided instead of multiplying
        String(b),                  // never undid the division
        String(a + b),              // added the divisor
        String(a * b + a),
        String(a * b - a)
      ]
    };
  },

  // "Solve for x: x ÷ 5 < 6"
  'one-step-inequalities'(prompt) {
    const m = prompt.match(/^Solve for x: x ÷ (\d+) ([<>≤≥]) (-?\d+)$/);
    if (!m) return null;
    const a = Number(m[1]); const op = m[2]; const b = Number(m[3]);
    const k = frac(a * b, 1);
    return {
      key: inequality(op, k),
      distractors: [
        inequality(FLIP[op], k),          // flipped the sign for a positive multiplier
        inequality(op, frac(b, a)),       // divided instead of multiplying
        `x = ${fracStr(k)}`,              // boundary only
        inequality(op, frac(b, 1)),       // never undid the division
        inequality(FLIP[op], frac(b, a))
      ]
    };
  },

  // "Solve: 3x < 22"
  'solving-inequalities'(prompt) {
    const m = prompt.match(/^Solve: (\d+)x ([<>≤≥]) (-?\d+)$/);
    if (!m) return null;
    const a = Number(m[1]); const op = m[2]; const b = Number(m[3]);
    const k = frac(b, a);
    return {
      key: inequality(op, k),
      distractors: [
        inequality(FLIP[op], k),          // flipped the sign for a positive divisor
        inequality(op, frac(a, b)),       // divided the wrong way
        `x = ${fracStr(k)}`,              // boundary only
        inequality(op, frac(b - a, 1)),   // subtracted the coefficient
        inequality(FLIP[op], frac(a, b))
      ]
    };
  },

  // "Solve for x: 5x + 15 = 3x + 2" / "Solve for x: 5x + 18 = x + 17"
  'equations-with-variables-both-sides'(prompt) {
    const m = prompt.match(/^Solve for x: (\d*)x ([+-]) (\d+) = (\d*)x ([+-]) (\d+)$/);
    if (!m) return null;
    const a = m[1] === '' ? 1 : Number(m[1]);
    const b = (m[2] === '-' ? -1 : 1) * Number(m[3]);
    const c = m[4] === '' ? 1 : Number(m[4]);
    const d = (m[5] === '-' ? -1 : 1) * Number(m[6]);
    if (a === c) return null;
    const k = frac(d - b, a - c);
    return {
      key: fracStr(k),
      distractors: [
        fracStr(neg(k)),                   // moved a term without changing its sign
        fracStr(frac(d + b, a - c)),       // added the constants
        fracStr(frac(d - b, a + c)),       // added the x-coefficients
        fracStr(recip(k)),                 // divided the wrong way
        fracStr(frac(b - d, a + c))
      ]
    };
  },

  // "Find the mean: 8, 1, 8"
  mean(prompt) {
    const m = prompt.match(/^Find the mean: (.+)$/);
    if (!m) return null;
    const xs = ints(m[1]);
    if (xs.length < 2) return null;
    const sum = xs.reduce((s, x) => s + x, 0);
    const sorted = [...xs].sort((p, q) => p - q);
    const mid = sorted.length / 2;
    const median = sorted.length % 2
      ? frac(sorted[Math.floor(mid)], 1)
      : frac(sorted[mid - 1] + sorted[mid], 2);
    return {
      key: fracStr(frac(sum, xs.length)),
      distractors: [
        fracStr(median),                          // found the median
        fracStr(frac(sum, xs.length - 1)),        // divided by one too few
        fracStr(frac(sum + 1, xs.length)),        // slipped adding
        String(sum),                              // forgot to divide
        fracStr(frac(sum - 1, xs.length))
      ]
    };
  },

  // "Find the mode: 12, 8, 12, 12, 8"
  mode(prompt) {
    const m = prompt.match(/^Find the mode: (.+)$/);
    if (!m) return null;
    const xs = ints(m[1]);
    const counts = new Map();
    for (const x of xs) counts.set(x, (counts.get(x) || 0) + 1);
    const top = Math.max(...counts.values());
    const modes = [...counts].filter(([, n]) => n === top).map(([x]) => x);
    if (modes.length !== 1) return null;
    const others = [...counts.keys()].filter((x) => x !== modes[0]);
    return {
      key: String(modes[0]),
      distractors: [
        ...others.map(String),                      // picked a value that isn't most frequent
        String(top),                                // reported how often, not which
        String(Math.max(...xs) - Math.min(...xs)),  // found the range
        fracStr(frac(xs.reduce((s, x) => s + x, 0), xs.length))  // found the mean
      ]
    };
  },

  // "Find the slope between (5, 4) and (8, 12)"
  'slope-from-two-points'(prompt) {
    const m = prompt.match(/^Find the slope between \((-?\d+), (-?\d+)\) and \((-?\d+), (-?\d+)\)$/);
    if (!m) return null;
    const [x1, y1, x2, y2] = m.slice(1).map(Number);
    if (x1 === x2) return null;
    const k = frac(y2 - y1, x2 - x1);
    return {
      key: fracStr(k),
      distractors: [
        fracStr(recip(k)),                   // run over rise
        fracStr(neg(k)),                     // subtracted in mixed order
        fracStr(neg(recip(k))),
        fracStr(frac(y2 + y1, x2 + x1)),     // added instead of subtracting
        fracStr(frac(y2, x2)),
        fracStr(frac(y2 - y1 + 1, x2 - x1)), // miscounted the rise
        fracStr(frac(y2 - y1, x2 - x1 + 1))  // miscounted the run
      ]
    };
  },

  // "About how much is 21 + 24? (Round to nearest 10)" — round each addend
  'estimate-sums'(prompt) {
    const m = prompt.match(/^About how much is (\d+) \+ (\d+)\? \(Round to nearest (10|100)\)$/);
    if (!m) return null;
    const p = Number(m[1]); const q = Number(m[2]); const u = Number(m[3]);
    const round = (x) => Math.round(x / u) * u;
    const key = round(p) + round(q);
    const up = (x) => Math.ceil(x / u) * u;
    const down = (x) => Math.floor(x / u) * u;
    return {
      key: String(key),
      distractors: [
        String(up(p) + up(q)),          // always rounded up
        String(round(p)),               // estimated only one addend
        String(key - u),                // off by one place
        String(down(p) + down(q)),      // always rounded down
        String(key + 2 * u)
      ]
    };
  }
};

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

/**
 * Does `text` grade correct against the item's key? Value comparison only —
 * the same path a typed answer takes, and the one an option's text must match
 * for compareAnswer's letter path (Method 2) to accept it.
 */
function gradesCorrect(text, answer) {
  return compareAnswer(text, { value: answer.value, equivalents: answer.equivalents || [] });
}

function sameMeaning(a, b) {
  if (String(a).trim().toLowerCase() === String(b).trim().toLowerCase()) return true;
  if (valuesMatch(a, b)) return true;
  const pa = parseOption(a); const pb = parseOption(b);
  const sameOp = (pa.op || '') === (pb.op || '');
  return sameOp && pa.value !== null && pb.value !== null && Math.abs(pa.value - pb.value) < 1e-9;
}

/**
 * Returns a list of problems with a rebuilt item; empty = valid.
 * @param {{options: Array<{label,text}>, correctOption: string, answer: Object}} item
 */
function validateOptions(item) {
  const errors = [];
  const { options, correctOption, answer } = item;
  if (!Array.isArray(options) || options.length !== 4) errors.push('expected 4 options');
  const texts = (options || []).map((o) => o.text);
  if (texts.some((t) => t === null || t === undefined || String(t).trim() === '')) errors.push('blank option');

  const correct = texts.filter((t) => gradesCorrect(t, answer));
  if (correct.length !== 1) errors.push(`${correct.length} options grade correct`);

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (sameMeaning(texts[i], texts[j])) errors.push(`options ${LABELS[i]} and ${LABELS[j]} are the same`);
    }
  }

  // The full MC path, letter by letter: only the keyed letter may pass.
  const spec = { ...answer, answerType: 'multiple-choice', options, correctOption };
  const passing = LABELS.slice(0, texts.length).filter((L) => compareAnswer(L, spec));
  if (passing.length !== 1 || passing[0] !== correctOption) {
    errors.push(`letters grading correct: [${passing.join(',')}], keyed ${correctOption}`);
  }
  return errors;
}

// ----------------------------------------------------------------------------
// Build
// ----------------------------------------------------------------------------

// Deterministic per item, so the dry run shows exactly what --write writes
function seededRandom(seedStr) {
  let h = 2166136261;
  for (const ch of String(seedStr)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Rebuild one item's options. Returns { options, correctOption } or { error }.
 * The key option's text is the stored `answer.value` itself, so it matches the
 * grader's exact-text path, not just the numeric one.
 */
function buildOptions(problem) {
  const solver = SOLVERS[problem.skillId];
  if (!solver) return { error: `no solver for ${problem.skillId}` };
  const solved = solver(String(problem.prompt || '').trim());
  if (!solved || solved.key === null) return { error: 'prompt not recognised' };

  const answer = problem.answer || {};
  if (!gradesCorrect(solved.key, answer)) {
    return { error: `stored key ${JSON.stringify(answer.value)} != re-solved ${solved.key}` };
  }
  const keyText = String(answer.value).trim();

  const picked = [];
  for (const d of solved.distractors) {
    if (d === null || d === undefined) continue;
    if (gradesCorrect(d, answer) || sameMeaning(d, keyText)) continue;
    if (picked.some((p) => sameMeaning(p, d))) continue;
    picked.push(d);
    if (picked.length === 3) break;
  }
  if (picked.length < 3) return { error: `only ${picked.length} usable distractors` };

  const rand = seededRandom(problem._id);
  const order = shuffle([keyText, ...picked], rand);
  const options = order.map((text, i) => ({ label: LABELS[i], text }));
  const correctOption = LABELS[order.indexOf(keyText)];

  const errors = validateOptions({ options, correctOption, answer });
  if (errors.length) return { error: errors.join('; ') };
  return { options, correctOption };
}

/**
 * Bank-wide: an active item with options whose key matches no option, or
 * whose correctOption names an option that doesn't grade correct.
 */
function bankDefect(problem) {
  const opts = Array.isArray(problem.options) ? problem.options : [];
  if (!opts.length) return null;
  const answer = problem.answer || {};
  if (answer.value === undefined || answer.value === null || String(answer.value).trim() === '') return null;
  const texts = opts.map((o) => (o && typeof o === 'object' ? o.text : o));
  if (!texts.some((t) => t != null && gradesCorrect(String(t), answer))) return 'key matches no option';
  if (problem.correctOption) {
    const label = correctLabelOf(problem);
    const text = label ? texts[LABELS.indexOf(label)] : null;
    if (text == null || !gradesCorrect(String(text), answer)) return 'correctOption does not grade correct';
  }
  return null;
}

// ----------------------------------------------------------------------------
// CLI
// ----------------------------------------------------------------------------

async function bankCheck(coll) {
  const cursor = coll.find(
    { isActive: true, 'options.0': { $exists: true } },
    { projection: { skillId: 1, prompt: 1, answer: 1, options: 1, correctOption: 1 } }
  );
  let scanned = 0;
  const bySkill = {};
  const examples = [];
  for await (const p of cursor) {
    scanned++;
    const defect = bankDefect(p);
    if (!defect) continue;
    const k = `${p.skillId} — ${defect}`;
    bySkill[k] = (bySkill[k] || 0) + 1;
    if (examples.length < 10) examples.push({ _id: String(p._id), skillId: p.skillId, prompt: p.prompt, value: p.answer.value, defect });
  }
  const total = Object.values(bySkill).reduce((s, n) => s + n, 0);
  console.log(`\nBank-wide check: ${scanned} active items with options, ${total} defective`);
  for (const [k, n] of Object.entries(bySkill).sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${k}`);
  if (examples.length) console.log('  e.g.', examples);
  return total;
}

async function main() {
  require('dotenv').config();
  const mongoose = require('mongoose');
  const WRITE = process.argv.includes('--write');
  const CHECK_ONLY = process.argv.includes('--check');
  const samplesArg = process.argv.find((a) => a.startsWith('--samples='));
  const SAMPLES = samplesArg ? Number(samplesArg.split('=')[1]) : 10;

  await mongoose.connect(process.env.MONGO_URI);
  const coll = mongoose.connection.db.collection('problems');
  try {
    if (CHECK_ONLY) { await bankCheck(coll); return; }

    const tagged = await coll.find({ needsRegeneration: TAG }).toArray();
    console.log(`${WRITE ? 'WRITE' : 'DRY RUN'}: ${tagged.length} items tagged ${TAG}\n`);

    const ok = []; const failed = [];
    for (const p of tagged) {
      const r = buildOptions(p);
      if (r.error) failed.push({ p, error: r.error });
      else ok.push({ p, ...r });
    }

    const bySkill = {};
    for (const { p } of ok) (bySkill[p.skillId] = bySkill[p.skillId] || []).push(p);
    console.log('Rebuilt by skill:');
    for (const [s, list] of Object.entries(bySkill).sort()) console.log(`  ${list.length}  ${s}`);
    console.log(`Rebuilt ${ok.length}, failed ${failed.length}`);
    for (const { p, error } of failed) console.log(`  FAIL ${p._id} ${p.skillId} "${p.prompt}": ${error}`);

    if (SAMPLES > 0) {
      for (const s of Object.keys(bySkill).sort()) {
        console.log(`\n=== ${s} ===`);
        for (const r of ok.filter((x) => x.p.skillId === s).slice(0, SAMPLES)) {
          const before = (r.p.options || []).map((o) => o.text).join(' | ');
          const after = r.options.map((o) => `${o.label === r.correctOption ? '*' : ''}${o.label}) ${o.text}`).join('   ');
          console.log(`  ${r.p.prompt}   key ${r.p.answer.value}\n    was: ${before}\n    now: ${after}`);
        }
      }
    }

    if (!WRITE) { console.log('\nDry run — nothing written. Re-run with --write to apply.'); return; }
    if (failed.length) { console.log('\nRefusing to write while any item fails.'); process.exitCode = 1; return; }

    const res = await coll.bulkWrite(ok.map(({ p, options, correctOption }) => ({
      updateOne: {
        filter: { _id: p._id, needsRegeneration: TAG },
        update: {
          $set: { options, correctOption, isActive: true, updatedAt: new Date() },
          $unset: { needsRegeneration: '' }
        }
      }
    })));
    console.log(`\nWrote: matched ${res.matchedCount}, modified ${res.modifiedCount}`);
    console.log(`Still tagged: ${await coll.countDocuments({ needsRegeneration: TAG })}`);
    const defects = await bankCheck(coll);
    if (defects) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { TAG, SOLVERS, buildOptions, validateOptions, bankDefect, gradesCorrect };

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
