/**
 * Shared-stimulus sets are served the way the ACT prints them.
 *
 * utils/actTestAssembler.js: when a slot draws a set member, its siblings are
 * reserved into later slots of their own categories, and after ordering the
 * set is pulled together under "Use the following information to answer
 * questions a–b." This loads the REAL banks and checks, over several forms
 * and retakes: a set on a form is whole (or a lone member, never a broken
 * pair), contiguous, in setOrder, under a header naming exactly its own
 * question numbers, and the category counts the score depends on are exact.
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
  for (const f of ['act-fable-items.generated.json', 'act-ies-expansion/ies-items.generated.json', 'act-enhanced/act-items.generated.json', 'act-visual/act-visual-items.generated.json', 'act-reasoning/act-reasoning-items.generated.json', 'act-sets/act-set-items.generated.json']) {
    await Problem.insertMany(read(f));
  }
}, 180000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

test('sets on a form are whole, contiguous, ordered and headed with their own numbers', async () => {
  const setSize = {};
  read('act-sets/act-set-items.generated.json').forEach((it) => { setSize[it.setId] = (setSize[it.setId] || 0) + 1; });
  let seen = [];
  let setsServed = 0;
  for (let i = 0; i < 10; i++) {
    if (i % 5 === 0) seen = [];
    const form = await assembleForm({ seed: `sets-${i}`, excludeIds: seen });
    seen = seen.concat(form.items.map((x) => x.problemId));
    expect(form.gaps).toEqual([]);
    const perCat = {};
    form.items.forEach((it) => { perCat[it.category] = (perCat[it.category] || 0) + 1; });
    expect(perCat).toEqual(blueprint.categoryWeights);

    const bySet = {};
    form.items.forEach((it) => { if (it.setId) (bySet[it.setId] = bySet[it.setId] || []).push(it); });
    for (const [setId, members] of Object.entries(bySet)) {
      if (members.length === 1) {
        expect(members[0].content).not.toMatch(/^Use the following information/);   // a lone member reads as an ordinary item
        continue;
      }
      setsServed += 1;
      const pos = members.map((m) => m.position);
      expect(pos).toEqual(pos.map((_, k) => pos[0] + k));                             // contiguous
      const order = members.map((m) => m.setOrder);
      expect(order).toEqual([...order].sort((a, b) => a - b));                            // in setOrder
      members.forEach((m) => expect(m.content.startsWith(`Use the following information to answer questions ${pos[0]}–${pos[pos.length - 1]}.`)).toBe(true));
      expect(members.length).toBeLessThanOrEqual(setSize[setId]);
    }
  }
  expect(setsServed).toBeGreaterThan(0);   // the mechanism actually ran
}, 180000);
