/**
 * The one test that hits a REAL database.
 *
 * Every other mastery test uses a plain JS Map or an unsaved Mongoose document.
 * Neither performs a save()/reload, so neither can prove that what we write
 * actually survives BSON serialization and comes back intact. That blind spot is
 * how a dotted-key bug that silently dropped every unified-skill write coexisted
 * with a fully green suite for weeks.
 *
 * This boots an in-process MongoDB (mongodb-memory-server), drives the real
 * chat-path write and the real cascade, saves, reloads, and asserts the stored
 * shape. If the ephemeral mongod cannot start (e.g. a sandbox with no binary and
 * no network), the suite fails loudly rather than skipping — a silent skip here
 * would recreate exactly the false confidence this file exists to prevent.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const { updateSkillMastery } = require('../../utils/pipeline/persist');
const {
  getSkillMasteryEntry,
  setSkillMasteryEntry,
  decodedMasteryMap
} = require('../../utils/masteryGuard');
const { buildGraph, applyProofCascade } = require('../../utils/skillClosure');

const SKILLS = require('../../seeds/skills-unified.json');

let mem;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
}, 60000); // first run may download the mongod binary

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

afterEach(async () => {
  await User.deleteMany({});
});

const newUser = (over = {}) =>
  new User({ username: `u${Math.round(performance.now() * 1000)}`, email: `${Math.round(performance.now() * 1000)}@e.com`, firstName: 'T', lastName: 'T', ...over });

const proveByPractice = async (user, id) => {
  const ctx = ['numeric', 'graphical', 'word-problem'];
  for (let i = 0; i < 8; i += 1) {
    updateSkillMastery(user, id, { problemContext: ctx[i % 3] }, { messages: [] });
  }
  await user.save();
};

describe('a dotted-id skill survives save and reload', () => {
  test('the write does not throw and the row comes back proved', async () => {
    const user = newUser();
    await proveByPractice(user, 'ALG1.PRP.2'); // "Slope as rate" — a dotted id

    const reloaded = await User.findById(user._id);
    const entry = getSkillMasteryEntry(reloaded, 'ALG1.PRP.2');
    expect(entry).toBeTruthy();
    expect(entry.rung).toBe('proved');
    expect(entry.provenBy).toBe('practice');
  });

  test('the stored key is encoded on disk, never dotted', async () => {
    const user = newUser();
    await proveByPractice(user, 'ALG1.PRP.2');

    const reloaded = await User.findById(user._id);
    const keys = [...reloaded.skillMastery.keys()];
    expect(keys).toContain('ALG1_PRP_2');
    keys.forEach((k) => expect(k).not.toContain('.'));
  });

  test('rungHistory (a Mixed subarray) survives BSON serialization', async () => {
    const user = newUser();
    await proveByPractice(user, 'ALG1.PRP.2');

    const reloaded = await User.findById(user._id);
    const entry = getSkillMasteryEntry(reloaded, 'ALG1.PRP.2');
    const proof = (entry.rungHistory || []).find((h) => h.to === 'proved');
    expect(proof).toBeTruthy();
    expect(proof.via).toBe('practice');
    expect(proof.evidence).toBeTruthy();
  });
});

describe('the cascade persists', () => {
  test('a prerequisite cleared from above is still cleared after reload', async () => {
    const user = newUser();
    await proveByPractice(user, 'ALG1.PRP.2');

    // Run the cascade exactly as the pipeline does, then save.
    const graph = buildGraph(SKILLS);
    const decoded = decodedMasteryMap(user);
    const { cleared } = applyProofCascade(graph, decoded, 'ALG1.PRP.2');
    for (const id of cleared) setSkillMasteryEntry(user, id, decoded.get(id));
    await user.save();

    expect(cleared).toContain('MS.PRP.3'); // unit rates, beneath slope

    const reloaded = await User.findById(user._id);
    const unitRates = getSkillMasteryEntry(reloaded, 'MS.PRP.3');
    expect(unitRates.rung).toBe('proved');
    expect(unitRates.provenBy).toBe('inference');
    expect(unitRates.inferredFrom).toBe('ALG1.PRP.2');
  });
});

describe('a legacy id and its unified id stay one row across a round-trip', () => {
  test('writing by a legacy id reads back by the unified id', async () => {
    const user = newUser();
    // 'solving-multi-step-equations' canonicalizes to ALG1.EQV.1
    setSkillMasteryEntry(user, 'solving-multi-step-equations', {
      status: 'mastered',
      rung: 'proved',
      provenBy: 'placement'
    });
    await user.save();

    const reloaded = await User.findById(user._id);
    expect(reloaded.skillMastery.size).toBe(1);
    expect(getSkillMasteryEntry(reloaded, 'ALG1.EQV.1')).toBeTruthy();
    expect(getSkillMasteryEntry(reloaded, 'solving-multi-step-equations')).toBeTruthy();
  });
});

describe('the whole catalog is persistable', () => {
  test('every one of the 348 skill ids saves and reloads without loss', async () => {
    const user = newUser();
    SKILLS.forEach((s) => setSkillMasteryEntry(user, s.skillId, { status: 'ready' }));
    await user.save();

    const reloaded = await User.findById(user._id);
    expect(reloaded.skillMastery.size).toBe(SKILLS.length);
  });
});
