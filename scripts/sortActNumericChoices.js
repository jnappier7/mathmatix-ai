#!/usr/bin/env node
// scripts/sortActNumericChoices.js — put numeric answer choices in order.
//
// The real ACT lists numeric choices in increasing order. 120 bank items did
// not (e.g. 165, 205, 185, 285), which a full run of the public practice test
// flagged (`npm run act:audit` → unsorted_numeric). This rewrites the SEED
// files, which are the source of truth:
//
//   seeds/fable-act/*.json                      choices[] + answer index
//   seeds/act-fable-items.generated.json        options[] + correctOption
//   seeds/act-ies-expansion/ies-items.generated.json   options[] + correctOption
//
// For every item whose choices are all plain numbers and not already in
// ascending or descending order, choices are sorted ascending (stable, so
// equal values keep their relative order) and the key moves with its text.
// Explanations that name choices by letter ("Choice B (0.38) is…",
// "rules out A and B") are remapped in exactly those sentences — never a bare
// letter elsewhere, which is usually a point or angle name (∠A, sin B).
//
// Idempotent: a second run finds nothing to change. Prints what it changed.
// After it lands, reseed the banks (npm run seed:all) for production to see it.
//
// Usage: node scripts/sortActNumericChoices.js [--dry]

const fs = require('fs');
const path = require('path');
const { numericValue } = require('../utils/distractorQuality');

const ROOT = path.join(__dirname, '..');
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

function isMonotonic(values) {
  let up = true;
  let down = true;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[i - 1]) up = false;
    if (values[i] > values[i - 1]) down = false;
  }
  return up || down;
}

/**
 * The new order for a list of choice texts, or null when nothing should move.
 * Returns `perm` where new position i holds old position perm[i].
 */
function sortPermutation(texts) {
  const values = texts.map(numericValue);
  if (values.length < 3 || values.some((v) => v == null) || isMonotonic(values)) return null;
  return values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => (a.v - b.v) || (a.i - b.i))
    .map((x) => x.i);
}

/**
 * Remap choice letters inside the sentences that talk about choices. A letter
 * is only rewritten when its sentence names a choice ("Choice", "Choices",
 * "answer is", "rules out"), so geometry names elsewhere stay untouched.
 */
function remapExplanation(text, oldToNew) {
  if (!text) return text;
  const sentences = String(text).split(/(?<=[.!?])(\s+)/);
  return sentences.map((s) => {
    if (!/\b(?:[Cc]hoices?|answer is|rules out)\b/.test(s)) return s;
    // Two passes through placeholders so A→B and B→A cannot collide.
    return s
      .replace(/(^|[^∠\w])([A-E])(?=$|[^\w])/g, (m, pre, l) => `${pre}\u0000${l}`)
      .replace(/\u0000([A-E])/g, (m, l) => oldToNew[l] || l);
  }).join('');
}

function permuteItem(item, perm) {
  const oldLabels = item.options.map((o, i) => LETTERS[i]);
  const oldToNew = {};
  perm.forEach((oldIdx, newIdx) => { oldToNew[oldLabels[oldIdx]] = LETTERS[newIdx]; });
  const options = perm.map((oldIdx, newIdx) => ({ ...item.options[oldIdx], label: LETTERS[newIdx] }));
  const keyIdx = LETTERS.indexOf(String(item.correctOption).toUpperCase());
  return {
    ...item,
    options,
    correctOption: keyIdx >= 0 ? oldToNew[LETTERS[keyIdx]] : item.correctOption,
    explanation: remapExplanation(item.explanation, oldToNew),
  };
}

// Each seed file keeps its own formatting (they differ: 1- or 2-space indent,
// with or without a final newline), so the diff shows only the reordering.
const formats = new Map();
function readJson(rel) {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const second = raw.split('\n')[1] || '';
  formats.set(rel, { indent: (second.match(/^ */) || [''])[0].length || 2, newline: raw.endsWith('\n') });
  return JSON.parse(raw);
}
function writeJson(rel, data) {
  const f = formats.get(rel) || { indent: 2, newline: true };
  fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(data, null, f.indent) + (f.newline ? '\n' : ''));
}

function main() {
  const dry = process.argv.includes('--dry');
  const changed = [];

  // ── Generated Fable bank, and its source files in seeds/fable-act ──
  const fableRel = 'seeds/act-fable-items.generated.json';
  const fable = readJson(fableRel);
  const perms = new Map();                       // problemId -> perm
  const fableOut = fable.map((item) => {
    const perm = sortPermutation(item.options.map((o) => o.text));
    if (!perm) return item;
    perms.set(item.problemId, perm);
    changed.push(item.problemId);
    return permuteItem(item, perm);
  });

  // act-fable-<tag>q<n> -> seeds/fable-act/<file>.json question n. Numbered
  // tests are tagged t1..t5 (test1.json…), top-ups by file name (topup1).
  const sourceEdits = {};
  for (const [pid, perm] of perms) {
    const m = /^act-fable-(t(\d+)|topup\d+)q(\d+)$/.exec(pid);
    if (!m) throw new Error(`cannot map ${pid} to a source file`);
    const file = m[2] ? `seeds/fable-act/test${m[2]}.json` : `seeds/fable-act/${m[1]}.json`;
    (sourceEdits[file] = sourceEdits[file] || []).push({ n: Number(m[3]), perm, pid });
  }
  const sourceOut = {};
  for (const [file, edits] of Object.entries(sourceEdits)) {
    const data = readJson(file);
    for (const { n, perm, pid } of edits) {
      const q = data.questions.find((x) => x.n === n);
      if (!q) throw new Error(`${pid}: question ${n} not found in ${file}`);
      const gen = fableOut.find((x) => x.problemId === pid);
      // Rebuild from the source's own text so the two files cannot diverge,
      // then check they agree.
      const oldToNew = {};
      perm.forEach((oldIdx, newIdx) => { oldToNew[LETTERS[oldIdx]] = LETTERS[newIdx]; });
      q.choices = perm.map((i) => q.choices[i]);
      q.answer = perm.indexOf(q.answer);
      q.explanation = remapExplanation(q.explanation, oldToNew);
      if (JSON.stringify(q.choices) !== JSON.stringify(gen.options.map((o) => o.text))
        || LETTERS[q.answer] !== gen.correctOption) {
        throw new Error(`${pid}: source and generated disagree after sorting`);
      }
    }
    sourceOut[file] = data;
  }

  // ── IES expansion bank (its generated file is its source) ──
  const iesRel = 'seeds/act-ies-expansion/ies-items.generated.json';
  const iesRaw = readJson(iesRel);
  const iesItems = Array.isArray(iesRaw) ? iesRaw : iesRaw.items;
  const iesOut = iesItems.map((item) => {
    const perm = sortPermutation(item.options.map((o) => o.text));
    if (!perm) return item;
    changed.push(item.problemId);
    return permuteItem(item, perm);
  });

  console.log(`${changed.length} item(s) reordered${dry ? ' (dry run, nothing written)' : ''}.`);
  changed.forEach((id) => console.log(`  ${id}`));
  if (dry || !changed.length) return;

  writeJson(fableRel, fableOut);
  for (const [file, data] of Object.entries(sourceOut)) writeJson(file, data);
  writeJson(iesRel, Array.isArray(iesRaw) ? iesOut : { ...iesRaw, items: iesOut });
}

if (require.main === module) main();

module.exports = { sortPermutation, remapExplanation, permuteItem };
