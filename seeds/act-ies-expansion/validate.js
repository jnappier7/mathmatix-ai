#!/usr/bin/env node
// Validator for seeds/act-ies-expansion/ies-items.generated.json
// Run: node seeds/act-ies-expansion/validate.js
// Exits non-zero on any failure.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, 'ies-items.generated.json');
const items = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const SKILLS = {
  'act-multi-step-arithmetic': 'multi-step',
  'act-percentages': 'percentages',
  'act-rates-unit-conversion': 'rates',
  'act-ratios-proportions': 'ratios',
  'act-time-schedule-arithmetic': 'time-schedule',
  'act-basic-geometry-measures': 'geometry-measures',
};
const DIFF_TABLE = { 1: 8, 2: 12, 3: 14, 4: 10, 5: 6 };
const TAGS = ['act', 'act-math', 'fable', 'integrating-essential-skills', 'IES'];

const errors = [];
const fail = (msg) => errors.push(msg);

// --- numeric parsing (money, %, times, durations, ratios, fractions, plain) ---
function parseNumeric(text) {
  const t = String(text).trim();
  let m = t.match(/^(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.)$/i);
  if (m) {
    let h = parseInt(m[1], 10) % 12;
    if (/^p/i.test(m[3])) h += 12;
    return h * 60 + parseInt(m[2], 10);
  }
  m = t.match(/^(\d+)\s*hours?\s*(?:and\s*)?(\d+)\s*minutes?$/i);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = t.match(/^(\d+(?:\.\d+)?)\s*hours?$/i);
  if (m) return parseFloat(m[1]) * 60;
  m = t.match(/^(\d+)\s*minutes?$/i);
  if (m) return parseInt(m[1], 10);
  m = t.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (m) return parseFloat(m[1]) / parseFloat(m[2]);
  m = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return parseInt(m[1], 10) / parseInt(m[2], 10);
  // dates ("March 23", "April 18") and weekday/sentence options are non-numeric
  if (/^[A-Za-z]/.test(t)) return null;
  m = t.replace(/,/g, '').match(/^[$]?(-?\d+(\.\d+)?)[°%]?( .*)?$/);
  if (m) return parseFloat(m[1]);
  return null;
}

// --- prompt signature: digits blanked, whitespace collapsed, first 90 chars ---
function signature(prompt) {
  return prompt.replace(/\d/g, '#').replace(/\s+/g, ' ').trim().slice(0, 90);
}

// 1. total count
if (items.length !== 300) fail(`expected 300 items, found ${items.length}`);

// 2. per-skill counts, 3. unique problemIds, 4. difficulty table
const bySkill = {};
const ids = new Set();
const sigs = new Map();
for (const it of items) {
  if (!SKILLS[it.skillId]) fail(`${it.problemId}: unknown skillId ${it.skillId}`);
  (bySkill[it.skillId] = bySkill[it.skillId] || []).push(it);
  if (ids.has(it.problemId)) fail(`duplicate problemId ${it.problemId}`);
  ids.add(it.problemId);
  const expectPrefix = `act-ies-${SKILLS[it.skillId]}-`;
  if (!new RegExp(`^${expectPrefix}\\d{3}$`).test(it.problemId))
    fail(`${it.problemId}: id does not match ${expectPrefix}NNN`);

  // schema shape
  if (it.svg !== null) fail(`${it.problemId}: svg must be null`);
  if (it.answerType !== 'multiple-choice') fail(`${it.problemId}: bad answerType`);
  if (it.gradeBand !== '8-12') fail(`${it.problemId}: bad gradeBand`);
  if (it.source !== 'act-ies-expansion') fail(`${it.problemId}: bad source`);
  if (it.isActive !== true) fail(`${it.problemId}: isActive must be true`);
  if (JSON.stringify(it.tags) !== JSON.stringify(TAGS)) fail(`${it.problemId}: bad tags`);
  if (!it.answer || it.answer.type !== 'auto' || !Array.isArray(it.answer.equivalents))
    fail(`${it.problemId}: bad answer object`);
  if (typeof it.prompt !== 'string' || it.prompt.length < 40)
    fail(`${it.problemId}: prompt missing or suspiciously short`);
  if (typeof it.explanation !== 'string' || it.explanation.length < 120)
    fail(`${it.problemId}: explanation missing or too short`);
  if (/\\(frac|sqrt|times|cdot|left|right)|\$\$|\\\(/.test(it.prompt + it.explanation))
    fail(`${it.problemId}: LaTeX detected`);

  // 5. options: exactly 4, labels A-D in order
  if (!Array.isArray(it.options) || it.options.length !== 4)
    fail(`${it.problemId}: must have exactly 4 options`);
  else {
    const labels = it.options.map(o => o.label).join('');
    if (labels !== 'ABCD') fail(`${it.problemId}: labels are ${labels}, expected ABCD`);
    const texts = it.options.map(o => o.text);
    if (new Set(texts).size !== 4) fail(`${it.problemId}: duplicate option text`);

    // numeric checks: equality collisions + ascending order (when all parseable)
    const vals = texts.map(parseNumeric);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      if (vals[i] !== null && vals[j] !== null && Math.abs(vals[i] - vals[j]) < 1e-9)
        fail(`${it.problemId}: options "${texts[i]}" and "${texts[j]}" are numerically equal`);
    }
    if (vals.every(v => v !== null)) {
      for (let i = 0; i < 3; i++) {
        if (!(vals[i] < vals[i + 1]))
          fail(`${it.problemId}: options not in ascending numeric order at "${texts[i]}" -> "${texts[i + 1]}"`);
      }
    }

    // 6. answer.value must equal keyed option's text exactly
    const keyed = it.options.find(o => o.label === it.correctOption);
    if (!keyed) fail(`${it.problemId}: correctOption ${it.correctOption} not among options`);
    else if (it.answer.value !== keyed.text)
      fail(`${it.problemId}: answer.value "${it.answer.value}" != option ${it.correctOption} text "${keyed.text}"`);
  }

  // 7. contentHash formula
  const expect = crypto.createHash('sha256')
    .update(`${it.problemId}|${it.prompt}|${it.answer && it.answer.value}`).digest('hex');
  if (it.contentHash !== expect) fail(`${it.problemId}: contentHash mismatch`);

  // 8. prompt signature uniqueness
  const sig = signature(it.prompt);
  if (sigs.has(sig)) fail(`${it.problemId}: prompt signature duplicates ${sigs.get(sig)}`);
  else sigs.set(sig, it.problemId);
}

// per-skill: counts, difficulty mix, key-letter distribution 15-35%
for (const [skillId, list] of Object.entries(bySkill)) {
  if (list.length !== 50) fail(`${skillId}: expected 50 items, found ${list.length}`);
  const diff = {};
  const letters = { A: 0, B: 0, C: 0, D: 0 };
  for (const it of list) {
    diff[it.difficulty] = (diff[it.difficulty] || 0) + 1;
    letters[it.correctOption]++;
  }
  for (const [d, want] of Object.entries(DIFF_TABLE)) {
    if ((diff[d] || 0) !== want)
      fail(`${skillId}: difficulty ${d} has ${diff[d] || 0} items, expected ${want}`);
  }
  for (const [L, n] of Object.entries(letters)) {
    const pct = n / list.length;
    if (pct < 0.15 || pct > 0.35)
      fail(`${skillId}: key letter ${L} is ${(pct * 100).toFixed(0)}% (${n}/50), outside 15-35%`);
  }
}

// report
if (errors.length) {
  console.error(`VALIDATION FAILED: ${errors.length} error(s)`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

// success summary
const matrix = {};
const letterDist = {};
for (const [skillId, list] of Object.entries(bySkill)) {
  matrix[skillId] = {};
  letterDist[skillId] = { A: 0, B: 0, C: 0, D: 0 };
  for (const it of list) {
    matrix[skillId][it.difficulty] = (matrix[skillId][it.difficulty] || 0) + 1;
    letterDist[skillId][it.correctOption]++;
  }
}
console.log('VALIDATION PASSED: 300 items, 50 per skill, all checks green.');
console.log('\nDifficulty × skill matrix:');
console.log('skill'.padEnd(34), '1  2  3  4  5');
for (const [s, m] of Object.entries(matrix))
  console.log(s.padEnd(34), [1,2,3,4,5].map(d => String(m[d]).padStart(2)).join(' '));
console.log('\nKey-letter distribution:');
console.log('skill'.padEnd(34), ' A  B  C  D');
for (const [s, l] of Object.entries(letterDist))
  console.log(s.padEnd(34), ['A','B','C','D'].map(k => String(l[k]).padStart(2)).join(' '));
process.exit(0);
