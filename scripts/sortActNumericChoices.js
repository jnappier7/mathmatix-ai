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
//   seeds/act-enhanced/act-items.generated.json        options[] + correctOption
//
// A number with a unit sorts too ("540°", "12 cm") when every choice carries
// the same unit (utils/actChoiceOrder.js — the form builder uses the same
// rule, so production items from any source are served sorted regardless).
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
const { sortPermutation, remapChoiceLetters } = require('../utils/actChoiceOrder');
const { explainItem } = require('../utils/actItemExplainers');

const ROOT = path.join(__dirname, '..');
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

function permuteItem(item, perm) {
  const oldLabels = item.options.map((o, i) => LETTERS[i]);
  const oldToNew = {};
  perm.forEach((oldIdx, newIdx) => { oldToNew[oldLabels[oldIdx]] = LETTERS[newIdx]; });
  const options = perm.map((oldIdx, newIdx) => ({ ...item.options[oldIdx], label: LETTERS[newIdx] }));
  const keyIdx = LETTERS.indexOf(String(item.correctOption).toUpperCase());
  const out = {
    ...item,
    options,
    correctOption: keyIdx >= 0 ? oldToNew[LETTERS[keyIdx]] : item.correctOption,
    explanation: remapChoiceLetters(item.explanation, oldToNew),
  };
  // An explanation the solver wrote (utils/actItemExplainers) walks the wrong
  // choices in option order; regenerate it rather than remap it, so it stays
  // exactly what the solver produces (tests/unit/actItemExplainers.test.js).
  const regenerated = explainItem(out);
  if (regenerated.status === 'ok' && isSolverWritten(item)) out.explanation = regenerated.explanation;
  return out;
}

function isSolverWritten(item) {
  if (!item.explanation) return false;
  const r = explainItem(item);
  if (r.status === 'ok' && r.explanation === item.explanation) return true;
  // Already reordered by an earlier run that only remapped letters: same
  // opening (the worked solution), differing only in the wrong-choice walk.
  return r.status === 'ok' && /Wrong choices:/.test(item.explanation)
    && item.explanation.split('Wrong choices:')[0] === r.explanation.split('Wrong choices:')[0];
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
      q.explanation = remapChoiceLetters(q.explanation, oldToNew);
      if (JSON.stringify(q.choices) !== JSON.stringify(gen.options.map((o) => o.text))
        || LETTERS[q.answer] !== gen.correctOption) {
        throw new Error(`${pid}: source and generated disagree after sorting`);
      }
    }
    sourceOut[file] = data;
  }

  // ── Banks whose generated file is their source in this repo: the IES
  //    expansion, and the enhanced drop (ingested from a file outside it) ──
  const flatBanks = [
    'seeds/act-ies-expansion/ies-items.generated.json',
    'seeds/act-enhanced/act-items.generated.json',
  ];
  const flatOut = {};
  for (const rel of flatBanks) {
    const raw = readJson(rel);
    const items = Array.isArray(raw) ? raw : raw.items;
    let touched = false;
    const out = items.map((item) => {
      const perm = sortPermutation(item.options.map((o) => o.text));
      if (!perm) return item;
      touched = true;
      changed.push(item.problemId);
      return permuteItem(item, perm);
    });
    if (touched) flatOut[rel] = Array.isArray(raw) ? out : { ...raw, items: out };
  }

  console.log(`${changed.length} item(s) reordered${dry ? ' (dry run, nothing written)' : ''}.`);
  changed.forEach((id) => console.log(`  ${id}`));
  if (dry || !changed.length) return;

  if (perms.size) writeJson(fableRel, fableOut);
  for (const [file, data] of Object.entries(sourceOut)) writeJson(file, data);
  for (const [rel, data] of Object.entries(flatOut)) writeJson(rel, data);
}

if (require.main === module) main();

module.exports = { sortPermutation, remapExplanation: remapChoiceLetters, permuteItem, isSolverWritten };
