/**
 * Every ACT form carries 8–12 questions answered from a figure or table.
 *
 * An official form has about ten; ours averaged 1.9 (external audit,
 * 2026-10-05). The visual bank (seeds/act-visual) supplies them and
 * utils/actTestAssembler.js paces them (blueprint.visualTarget). This loads
 * the REAL banks and checks the property where it matters: every form,
 * including a student's fifth retake, when the no-repeat ledger has already
 * spent four forms' worth of visuals; and the category counts the scaled
 * score depends on are untouched.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Problem = require('../../models/problem');
const { assembleForm } = require('../../utils/actTestAssembler');
const blueprint = require('../../seeds/act-math-blueprint.json');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '../../seeds', f), 'utf8'));
let mem;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  for (const f of ['act-fable-items.generated.json', 'act-ies-expansion/ies-items.generated.json', 'act-enhanced/act-items.generated.json', 'act-visual/act-visual-items.generated.json']) {
    await Problem.insertMany(read(f));
  }
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

test('five retakes in a row each hold 8–12 visual items, with exact category counts', async () => {
  const { min, max } = blueprint.visualTarget;
  let seen = [];
  for (let i = 0; i < 5; i++) {
    const form = await assembleForm({ seed: `pace-${i}`, excludeIds: seen });
    seen = seen.concat(form.items.map((x) => x.problemId));
    expect(form.gaps).toEqual([]);
    expect(form.coverage.visuals).toBeGreaterThanOrEqual(min);
    expect(form.coverage.visuals).toBeLessThanOrEqual(max);
    const perCat = {};
    form.items.forEach((it) => { perCat[it.category] = (perCat[it.category] || 0) + 1; });
    expect(perCat).toEqual(blueprint.categoryWeights);
  }
}, 120000);

test('without a visual target the assembler does not pace', async () => {
  const { visualTarget, ...plain } = blueprint;
  expect(visualTarget).toBeDefined();
  const a = await assembleForm({ blueprint: plain, seed: 'plain-1' });
  const b = await assembleForm({ blueprint: plain, seed: 'plain-1' });
  expect(a.items.map((x) => x.problemId)).toEqual(b.items.map((x) => x.problemId));
}, 120000);
