// scripts/auditLowVolumeExpansion.js
// Fast, database-free structural audit for the July 2026 bank expansion.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = path.join(__dirname, '..', 'seeds', 'low-volume-expansion');
const FILES = [
  'act-items.generated.json.gz',
  'calc3-items.generated.json.gz',
  'general-items.generated.json.gz',
];
const EXPECTED_SKILLS = 82;
const EXPECTED_PER_SKILL = 10;
const EXPECTED_ITEMS = EXPECTED_SKILLS * EXPECTED_PER_SKILL;
const SOURCE = 'low-volume-expansion-2026-07';

const readItems = (name) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, name))).toString('utf8'));
const items = FILES.flatMap(readItems);
const errors = [];
const ids = new Set();
const prompts = new Set();
const counts = new Map();

for (const item of items) {
  const where = item.problemId || '<missing-id>';
  if (!item.problemId || ids.has(item.problemId)) errors.push(`${where}: missing or duplicate problemId`);
  ids.add(item.problemId);

  const promptKey = String(item.prompt || '').trim().toLowerCase();
  if (!promptKey || prompts.has(promptKey)) errors.push(`${where}: missing or duplicate prompt`);
  prompts.add(promptKey);

  if (!item.skillId) errors.push(`${where}: missing skillId`);
  counts.set(item.skillId, (counts.get(item.skillId) || 0) + 1);
  if (item.source !== SOURCE) errors.push(`${where}: unexpected source ${item.source}`);
  if (item.answerType !== 'multiple-choice') errors.push(`${where}: answerType must be multiple-choice`);
  if (!Array.isArray(item.options) || item.options.length !== 4) errors.push(`${where}: must have four options`);

  const labels = (item.options || []).map((option) => option.label);
  if (labels.join('') !== 'ABCD') errors.push(`${where}: option labels must be A-D`);
  if (!labels.includes(item.correctOption)) errors.push(`${where}: invalid correctOption`);
  const keyed = (item.options || []).find((option) => option.label === item.correctOption);
  if (!keyed || String(keyed.text) !== String(item.answer?.value)) {
    errors.push(`${where}: answer.value does not match keyed option`);
  }
  if (!Number.isInteger(item.difficulty) || item.difficulty < 1 || item.difficulty > 5) {
    errors.push(`${where}: difficulty must be integer 1-5`);
  }
  if (!item.explanation || item.explanation.length < 12) errors.push(`${where}: explanation missing/too short`);
  if (!item.contentHash || item.contentHash.length !== 64) errors.push(`${where}: invalid contentHash`);
}

if (items.length !== EXPECTED_ITEMS) errors.push(`expected ${EXPECTED_ITEMS} items, found ${items.length}`);
if (counts.size !== EXPECTED_SKILLS) errors.push(`expected ${EXPECTED_SKILLS} skills, found ${counts.size}`);
for (const [skill, count] of counts) {
  if (count !== EXPECTED_PER_SKILL) errors.push(`${skill}: expected ${EXPECTED_PER_SKILL}, found ${count}`);
}

if (errors.length) {
  console.error(`Low-volume expansion audit FAILED (${errors.length} errors):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Low-volume expansion audit passed: ${items.length} items across ${counts.size} skills.`);
console.log(`Every skill has exactly ${EXPECTED_PER_SKILL} items; IDs, prompts, keys, hashes, and explanations are valid.`);
