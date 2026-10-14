/**
 * learningEngines.{bkt,fsrs,consistency} are Mongoose Maps, which cannot hold a
 * key containing '.'. The pipeline keyed them by canonical skill id — dotted for
 * ~370 of 807 catalog skills ("order-of-operations" → "MS.EQV.10") — which made
 * the whole user document fail validation, so persist's user.save() rejected and
 * every graded turn on those skills lost its XP and mastery credit, silently.
 *
 * These run against the REAL User model: the bug only exists at the Map cast, so
 * a plain-object fake would pass while production fails.
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const User = require('../../models/user');
const { canonicalSkillId } = require('../../utils/skillCanonicalizer');
const {
  engineStorageKey, readEngineEntry, writeEngineEntry, engineEntries, isValidSkillKey,
} = require('../../utils/engineStore');
const { updateLearningEngines } = require('../../utils/pipeline');

const DOTTED_LEGACY = 'order-of-operations';

function newStudent() {
  return new User({ username: 'eng_test', email: 'eng@test.dev', firstName: 'E', lastName: 'T', role: 'student', roles: ['student'] });
}

const engineErrors = (user) => {
  const err = user.validateSync();
  return err ? Object.keys(err.errors).filter(k => k.startsWith('learningEngines')) : [];
};

describe('engine store keys', () => {
  test('precondition: the fixture skill really canonicalizes to a dotted id', () => {
    expect(canonicalSkillId(DOTTED_LEGACY)).toMatch(/\./);
  });

  test('storage key is the canonical id, encoded — never dotted', () => {
    const key = engineStorageKey(DOTTED_LEGACY);
    expect(key).not.toMatch(/\./);
    expect(key).toBe(canonicalSkillId(DOTTED_LEGACY).replace(/\./g, '_'));
    // an already-encoded or already-canonical id lands on the same key
    expect(engineStorageKey(canonicalSkillId(DOTTED_LEGACY))).toBe(key);
    expect(engineStorageKey(key)).toBe(key);
  });

  test.each([undefined, null, '', 'undefined', 'null'])('junk id %p is never a key', (bad) => {
    expect(isValidSkillKey(bad)).toBe(false);
    expect(engineStorageKey(bad)).toBeNull();
    const user = newStudent();
    expect(writeEngineEntry(user, 'bkt', bad, { pLearned: 0.5 })).toBeNull();
    expect(user.learningEngines.bkt.size).toBe(0);
  });
});

describe('updateLearningEngines on the real User model', () => {
  const diagnosis = { isCorrect: true, problemInfo: { difficulty: 2 } };
  const observation = { contextSignals: [] };

  test('a dotted-canonical skill leaves the user document saveable', () => {
    const user = newStudent();
    updateLearningEngines(user, DOTTED_LEGACY, diagnosis, observation);
    expect(engineErrors(user)).toEqual([]);

    const key = engineStorageKey(DOTTED_LEGACY);
    for (const engine of ['bkt', 'fsrs', 'consistency']) {
      expect(user.learningEngines[engine].get(key)).toBeTruthy();
    }
  });

  test('state accumulates across turns on the same key', () => {
    const user = newStudent();
    updateLearningEngines(user, DOTTED_LEGACY, diagnosis, observation);
    const first = readEngineEntry(user.learningEngines.fsrs, DOTTED_LEGACY);
    updateLearningEngines(user, DOTTED_LEGACY, diagnosis, observation);
    const second = readEngineEntry(user.learningEngines.fsrs, DOTTED_LEGACY);
    expect(second.reps).toBe(first.reps + 1);
    expect(user.learningEngines.fsrs.size).toBe(1);
  });

  test('a pre-migration entry under the legacy id is read and folded into the canonical key', () => {
    const user = newStudent();
    user.learningEngines.fsrs.set(DOTTED_LEGACY, { stability: 3, difficulty: 5, reps: 7, lapses: 0, state: 'review', lastReview: new Date(), scheduledDays: 3, elapsedDays: 0 });
    updateLearningEngines(user, DOTTED_LEGACY, diagnosis, observation);

    expect(user.learningEngines.fsrs.has(DOTTED_LEGACY)).toBe(false);
    expect(readEngineEntry(user.learningEngines.fsrs, DOTTED_LEGACY).reps).toBe(8);
    expect(engineErrors(user)).toEqual([]);
  });

  test('no skill in focus writes nothing', () => {
    const user = newStudent();
    updateLearningEngines(user, undefined, diagnosis, observation);
    expect(user.learningEngines.bkt.size).toBe(0);
  });
});

describe('engineEntries', () => {
  test('decodes keys back to logical ids and drops junk keys', () => {
    const store = new Map([
      ['MS_EQV_10', { a: 1 }],
      ['act-sequences', { b: 1 }],
      ['undefined', { c: 1 }],
      ['null', { d: 1 }],
    ]);
    expect(engineEntries(store).map(([id]) => id)).toEqual(['MS.EQV.10', 'act-sequences']);
    expect(engineEntries({ undefined: {}, 'act-sequences': {} }).map(([id]) => id)).toEqual(['act-sequences']);
    expect(engineEntries(null)).toEqual([]);
  });
});

describe('decoding is limited to real unified ids', () => {
  test('an underscore id that is not a unified id round-trips untouched', () => {
    expect(engineStorageKey('REV_WARMUP_B')).toBe('REV_WARMUP_B');
    expect(engineEntries(new Map([['REV_WARMUP_B', {}]])).map(([id]) => id)).toEqual(['REV_WARMUP_B']);
  });
});
