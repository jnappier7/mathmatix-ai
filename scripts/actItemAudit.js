#!/usr/bin/env node
// scripts/actItemAudit.js — content checks on the ACT item banks, offline.
//
// Reads the seed files (no database) and reports the defects a full run of the
// public practice test surfaced, so they can be fixed in the bank rather than
// discovered by a student:
//
//   blocking   (the form builder already skips these — utils/distractorQuality)
//     equivalent_options   two different-looking choices with the same value
//     duplicate_option / blank_option / placeholder_option / too_few_options
//     wrong_type_distractors
//   warnings   (served today; fix in the bank)
//     unsorted_numeric     all-numeric choices not in ascending or descending
//                          order — the real ACT lists numeric choices in order
//     figure_position      a "figure below/above" stem; the runner draws the
//                          figure below the stem, so "above" is now wrong
//     figure_missing_alt   a figure with no written description (figureAlt)
//   info
//     raw_notation         typed ^ or _; the runner shows them as super- and
//                          subscripts, but the bank should say what it means
//
// Also prints each bank's difficulty distribution, the lever behind "the test
// plays easier than the ACT".
//
// Usage: node scripts/actItemAudit.js [--json] [--examples=N]

const fs = require('fs');
const path = require('path');
const { assessOptions } = require('../utils/distractorQuality');
const { sortPermutation } = require('../utils/actChoiceOrder');

const BANKS = [
  ['act-fable', 'seeds/act-fable-items.generated.json'],
  ['act-ies-expansion', 'seeds/act-ies-expansion/ies-items.generated.json'],
  ['act-enhanced', 'seeds/act-enhanced/act-items.generated.json'],
  ['act-visual', 'seeds/act-visual/act-visual-items.generated.json'],
  ['act-reasoning', 'seeds/act-reasoning/act-reasoning-items.generated.json'],
];

function loadItems(rel) {
  const file = path.join(__dirname, '..', rel);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(data) ? data : (data.items || []);
}

function isMonotonic(values) {
  let up = true;
  let down = true;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[i - 1]) up = false;
    if (values[i] > values[i - 1]) down = false;
  }
  return up || down;
}

/** Every finding for one item: [{ code, severity, detail }]. */
function auditItem(item) {
  const findings = [];
  const options = Array.isArray(item.options) ? item.options : [];
  const mc = { answerType: item.answerType || 'multiple-choice', options, answer: item.answer, correctOption: item.correctOption, prompt: item.prompt };
  for (const issue of assessOptions(mc).issues) {
    findings.push({ code: issue.code, severity: 'blocking', detail: issue.detail || '' });
  }
  // Same rule the form builder applies (utils/actChoiceOrder), units included.
  if (sortPermutation(options.map((o) => o && o.text))) {
    findings.push({ code: 'unsorted_numeric', severity: 'warning', detail: options.map((o) => o.text).join(', ') });
  }
  if (item.svg && !item.figureAlt) {
    findings.push({ code: 'figure_missing_alt', severity: 'warning', detail: 'no written description for screen readers' });
  }
  const typed = [item.prompt || ''].concat(options.map((o) => (o && o.text) || '')).join(' ');
  if (/\^|\b\w_\w/.test(typed)) {
    findings.push({ code: 'raw_notation', severity: 'info', detail: 'typed ^ or _ (the runner displays it as super/subscript)' });
  }
  if (item.svg && /\bfigure\s+above\b/i.test(item.prompt || '')) {
    findings.push({ code: 'figure_position', severity: 'warning', detail: 'stem says "figure above"' });
  }
  return findings;
}

function auditBank(items) {
  const byCode = {};
  const difficulty = {};
  for (const item of items) {
    const d = item.difficulty == null ? '?' : String(item.difficulty);
    difficulty[d] = (difficulty[d] || 0) + 1;
    for (const f of auditItem(item)) {
      (byCode[f.code] = byCode[f.code] || { severity: f.severity, items: [] }).items.push({
        problemId: item.problemId, detail: f.detail,
      });
    }
  }
  return { total: items.length, difficulty, byCode };
}

function main() {
  const asJson = process.argv.includes('--json');
  const exArg = process.argv.find((a) => a.startsWith('--examples='));
  const examples = exArg ? Number(exArg.split('=')[1]) : 3;
  const report = {};
  for (const [name, rel] of BANKS) {
    const items = loadItems(rel);
    if (items) report[name] = auditBank(items);
  }
  if (asJson) { console.log(JSON.stringify(report, null, 2)); return; }
  for (const [name, r] of Object.entries(report)) {
    console.log(`\n${name}: ${r.total} items`);
    console.log(`  difficulty: ${Object.keys(r.difficulty).sort().map((d) => `${d}=${r.difficulty[d]}`).join('  ')}`);
    for (const [code, v] of Object.entries(r.byCode)) {
      console.log(`  ${v.severity.padEnd(8)} ${code}: ${v.items.length}`);
      v.items.slice(0, examples).forEach((x) => console.log(`             ${x.problemId}  ${x.detail}`));
    }
  }
}

if (require.main === module) main();

module.exports = { auditItem, auditBank, isMonotonic };
