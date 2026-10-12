/**
 * One SAT form never asks the same task twice.
 *
 * A real 44-item form carried "If √(x + 7) = 5, what is the value of x?" AND
 * "If √(x − 4) + 3 = 8, what is the value of x?", plus two "after how many
 * hours/months will the model reach N" exponential items (owner report,
 * 2026-10-12). The ACT-tuned template check compares content words, and these
 * SAT stems have almost none, so it never fired. The SAT blueprint now sets
 * `structuralLookAlikes`, and utils/actTestAssembler.js keeps a form to one
 * item per structuralSignature (a named task, or skill + masked equation
 * shape) while the category has anything else.
 *
 * Drives the REAL bank through the REAL blueprint, many seeds, fresh and on a
 * retake.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Problem = require('../../models/problem');
const { assembleForm, structuralSignature } = require('../../utils/actTestAssembler');
const { getTestDef: getTest } = require('../../utils/practiceTests');
const SAT_ITEMS = require('../../seeds/sat-items.generated.json');

const BLUEPRINT = getTest('sat-math').blueprint;
const byId = new Map(SAT_ITEMS.map((p) => [p.problemId, p]));
const find = (needle) => SAT_ITEMS.find((p) => p.prompt.includes(needle));

let mem;
beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  await Problem.insertMany(SAT_ITEMS);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

const duplicateShapes = (items) => {
  const seen = new Map();
  const dups = [];
  for (const it of items) {
    const sig = structuralSignature(byId.get(it.problemId));
    if (seen.has(sig)) dups.push([sig, seen.get(sig), it.problemId]);
    else seen.set(sig, it.problemId);
  }
  return dups;
};

test('the reported pairs share a signature; unrelated items do not', () => {
  const sig = (needle) => structuralSignature(find(needle));
  expect(sig('√(x + 7) = 5')).toBe(sig('√(x − 4) + 3 = 8'));
  expect(sig('200·2^(t/3)')).toBe(sig('512(1/2)^(t/3)'));
  expect(sig('If 4x − 9 = 19')).toBe(sig('If 3x + 7 = 25'));
  expect(sig('√(x + 7) = 5')).not.toBe(sig('200·2^(t/3)'));
  expect(sig('If 4x − 9 = 19')).not.toBe(sig('If 4x − 9 = 2x + 5'));
  expect(sig('If 4x − 9 = 19')).not.toBe(sig('√(x + 7) = 5'));
});

test('the SAT blueprint opts in; the ACT blueprint does not', () => {
  expect(BLUEPRINT.structuralLookAlikes).toBe(true);
  expect(getTest('act-math').blueprint.structuralLookAlikes).toBeUndefined();
});

test('no form holds two items of one structural signature', async () => {
  for (let i = 0; i < 40; i++) {
    const form = await assembleForm({ blueprint: BLUEPRINT, seed: `sat-shape-${i}` });
    expect(form.items).toHaveLength(44);
    expect(duplicateShapes(form.items)).toEqual([]);
  }
}, 120000);

test('a retake, drawn from what is left, still holds no look-alike pair', async () => {
  for (let i = 0; i < 10; i++) {
    const first = await assembleForm({ blueprint: BLUEPRINT, seed: `sat-first-${i}` });
    const retake = await assembleForm({ blueprint: BLUEPRINT, seed: `sat-retake-${i}`, excludeIds: first.items.map((x) => x.problemId) });
    expect(retake.items).toHaveLength(44);
    expect(duplicateShapes(retake.items)).toEqual([]);
  }
}, 120000);
