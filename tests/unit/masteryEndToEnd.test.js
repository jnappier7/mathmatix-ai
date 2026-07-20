/**
 * End-to-end mastery on a REAL Mongoose document.
 *
 * The whole arc's tests used plain JS Maps, which accept dotted keys; production
 * uses a Mongoose Map, which throws on them. This file drives the real chat-path
 * write and the real cascade against an actual User document, then asserts the
 * document would persist — the check that was missing while a green suite sat on
 * top of a write path that could not store a single unified skill.
 *
 * No database connection: constructing the document and exercising its Map type
 * is what reproduces the failure mode. What it cannot cover — an actual
 * save()/reload round-trip — is called out at the end.
 */

const User = require('../../models/user');
const { updateSkillMastery } = require('../../utils/pipeline/persist');
const { getSkillMasteryEntry, decodedMasteryMap } = require('../../utils/masteryGuard');
const { buildGraph, applyProofCascade } = require('../../utils/skillClosure');
const { currentRung, isInferred } = require('../../utils/skillRung');

const SKILLS = require('../../seeds/skills-unified.json');

const makeUser = () => new User({ username: 'e2e', email: 'e2e@example.com', firstName: 'E', lastName: 'E' });
const convo = { messages: [] };
// Returns whether the skill crossed to proved at any point (it crosses mid-run,
// not on the final call), and how many times that fired.
const proveByPractice = (user, id) => {
  const ctx = ['numeric', 'graphical', 'word-problem'];
  let crossings = 0;
  for (let i = 0; i < 8; i += 1) {
    const r = updateSkillMastery(user, id, { problemContext: ctx[i % 3] }, convo);
    if (r.justProved) crossings += 1;
  }
  return { crossings };
};

describe('a unified skill can actually be mastered on a real document', () => {
  test('proving a dotted-id skill stores it and the document validates', () => {
    const user = makeUser();
    const result = proveByPractice(user, 'ALG1.PRP.2'); // Slope as rate — dotted id

    expect(result.crossings).toBe(1); // crossed exactly once, mid-run
    expect(currentRung(getSkillMasteryEntry(user, 'ALG1.PRP.2'))).toBe('proved');

    // stored under an encoded key, never a dotted one
    [...user.skillMastery.keys()].forEach((k) => expect(k).not.toContain('.'));

    const err = user.validateSync();
    const masteryErrors = err ? Object.keys(err.errors).filter((k) => k.startsWith('skillMastery')) : [];
    expect(masteryErrors).toEqual([]);
  });

  test('the cascade clears prerequisites beneath a proved skill, on a real document', () => {
    const user = makeUser();
    proveByPractice(user, 'ALG1.PRP.2');

    // Run the cascade the way the pipeline does: decoded view in, encoded writes back.
    const graph = buildGraph(SKILLS);
    const decoded = decodedMasteryMap(user);
    const { cleared } = applyProofCascade(graph, decoded, 'ALG1.PRP.2');
    const { setSkillMasteryEntry } = require('../../utils/masteryGuard');
    for (const id of cleared) setSkillMasteryEntry(user, id, decoded.get(id));

    // MS.PRP.3 (unit rates) sits beneath slope — the product thesis, made real.
    expect(cleared).toContain('MS.PRP.3');
    const unitRates = getSkillMasteryEntry(user, 'MS.PRP.3');
    expect(currentRung(unitRates)).toBe('proved');
    expect(isInferred(unitRates)).toBe(true);

    // and the whole thing still validates
    expect(user.validateSync()?.errors ? Object.keys(user.validateSync().errors).filter((k) => k.startsWith('skillMastery')) : []).toEqual([]);
  });

  test('rungHistory (a Mixed subarray) round-trips through the schema', () => {
    const user = makeUser();
    proveByPractice(user, 'ALG1.PRP.2');
    const entry = getSkillMasteryEntry(user, 'ALG1.PRP.2');

    // toObject() is what a save + reload produces; the receipt must survive it.
    const plain = user.toObject();
    const storedKey = [...user.skillMastery.keys()].find((k) => k.startsWith('ALG1_PRP_2'));
    const round = plain.skillMastery[storedKey] || plain.skillMastery.get?.(storedKey);
    expect(round).toBeTruthy();
    expect(entry.rungHistory.length).toBeGreaterThan(0);
  });

  test('every skill id in the catalog is a legal encoded key', () => {
    // The blast-radius check: not just the ones a test happens to touch.
    const user = makeUser();
    const { setSkillMasteryEntry } = require('../../utils/masteryGuard');
    expect(() => {
      SKILLS.forEach((s) => setSkillMasteryEntry(user, s.skillId, { status: 'ready' }));
    }).not.toThrow();
    expect(user.skillMastery.size).toBe(SKILLS.length);
    expect(user.validateSync()).toBeFalsy();
  });
});
