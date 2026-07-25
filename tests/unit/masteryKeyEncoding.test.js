/**
 * Dotted skill ids against a REAL Mongoose document.
 *
 * Every other mastery test in this suite uses a plain JS Map, which happily
 * accepts "." in a key. Production uses a Mongoose Map, which THROWS on it — and
 * every unified skill id is dotted. So a full green suite coexisted with a write
 * path that could not store a single unified skill. These tests construct an
 * actual User document (no database connection needed — construction and the Map
 * type are enough) so that gap cannot reopen.
 */

const User = require('../../models/user');
const {
  encodeMasteryKey,
  decodeMasteryKey,
  getSkillMasteryEntry,
  setSkillMasteryEntry,
  hasSkillMasteryEntry,
  decodedMasteryMap,
  resolveMasteryKey
} = require('../../utils/masteryGuard');

const makeUser = () => new User({ username: 'k', email: 'k@example.com', firstName: 'K' });

describe('the raw failure mode', () => {
  test('a Mongoose Map rejects a dotted key directly', () => {
    const u = makeUser();
    expect(() => u.skillMastery.set('ALG1.EQV.1', { status: 'ready' })).toThrow(/do not support keys that contain/);
  });

  test('but accepts the encoded key', () => {
    const u = makeUser();
    expect(() => u.skillMastery.set(encodeMasteryKey('ALG1.EQV.1'), { status: 'ready' })).not.toThrow();
    expect(u.skillMastery.get('ALG1_EQV_1')).toBeTruthy();
  });
});

describe('encode / decode', () => {
  test('round-trips every real skill id', () => {
    const ids = require('../../seeds/skills-unified.json').map((s) => s.skillId);
    ids.forEach((id) => {
      const key = encodeMasteryKey(id);
      expect(key).not.toContain('.');
      expect(decodeMasteryKey(key)).toBe(id);
    });
  });

  test('is idempotent: re-encoding an already-encoded key is a no-op', () => {
    // No canonical id contains "_", so a value that has one is already a storage
    // key. Re-encoding must NOT throw or corrupt it — an encoded key leaking back
    // into logical position (a stale tutorPlan.currentTarget.skillId of "MS_QNT_8")
    // used to throw here and take the whole TutorPlan load down every turn.
    const key = encodeMasteryKey('MS.QNT.8'); // -> "MS_QNT_8"
    expect(key).toBe('MS_QNT_8');
    expect(encodeMasteryKey(key)).toBe('MS_QNT_8'); // idempotent, no throw
    expect(decodeMasteryKey(encodeMasteryKey(key))).toBe('MS.QNT.8');
  });

  test('leaves an already-safe legacy id unchanged', () => {
    expect(encodeMasteryKey('combining-like-terms')).toBe('combining-like-terms');
  });
});

describe('the accessors on a real document', () => {
  test('set then get round-trips a dotted id', () => {
    const u = makeUser();
    setSkillMasteryEntry(u, 'ALG1.EQV.1', { status: 'mastered', rung: 'proved' });
    const entry = getSkillMasteryEntry(u, 'ALG1.EQV.1');
    expect(entry).toBeTruthy();
    expect(entry.rung).toBe('proved');
  });

  test('the stored key is encoded, never dotted', () => {
    const u = makeUser();
    setSkillMasteryEntry(u, 'ALG1.EQV.1', { status: 'ready' });
    const keys = [...u.skillMastery.keys()];
    expect(keys).toContain('ALG1_EQV_1');
    keys.forEach((k) => expect(k).not.toContain('.'));
  });

  test('a legacy id and its unified id resolve to one entry', () => {
    const u = makeUser();
    // 'solving-multi-step-equations' canonicalizes to ALG1.EQV.1
    setSkillMasteryEntry(u, 'solving-multi-step-equations', { status: 'mastered', rung: 'proved' });
    expect(getSkillMasteryEntry(u, 'ALG1.EQV.1')).toBeTruthy();
    expect(getSkillMasteryEntry(u, 'solving-multi-step-equations')).toBeTruthy();
    expect(u.skillMastery.size).toBe(1);
  });

  test('has() reflects presence by either id form', () => {
    const u = makeUser();
    expect(hasSkillMasteryEntry(u, 'ALG1.EQV.1')).toBe(false);
    setSkillMasteryEntry(u, 'ALG1.EQV.1', { status: 'ready' });
    expect(hasSkillMasteryEntry(u, 'ALG1.EQV.1')).toBe(true);
    expect(hasSkillMasteryEntry(u, 'solving-multi-step-equations')).toBe(true);
  });

  test('resolveMasteryKey returns the logical dotted id, not the storage key', () => {
    const u = makeUser();
    setSkillMasteryEntry(u, 'ALG1.EQV.1', { status: 'ready' });
    expect(resolveMasteryKey(u, 'solving-multi-step-equations')).toBe('ALG1.EQV.1');
  });

  test('the document validates and would persist', () => {
    const u = makeUser();
    setSkillMasteryEntry(u, 'ALG1.EQV.1', {
      status: 'mastered',
      rung: 'proved',
      provenBy: 'practice',
      rungHistory: [{ from: 'learned', to: 'proved', via: 'practice', at: new Date(), evidence: { total: 8 } }]
    });
    const err = u.validateSync();
    const masteryErrors = err ? Object.keys(err.errors).filter((k) => k.startsWith('skillMastery')) : [];
    expect(masteryErrors).toEqual([]);
  });
});

describe('decodedMasteryMap', () => {
  test('presents dotted ids to the graph code, from encoded storage', () => {
    const u = makeUser();
    setSkillMasteryEntry(u, 'ALG1.EQV.1', { rung: 'proved' });
    setSkillMasteryEntry(u, 'MS.PRP.3', { rung: 'learned' });
    const decoded = decodedMasteryMap(u);
    expect([...decoded.keys()].sort()).toEqual(['ALG1.EQV.1', 'MS.PRP.3']);
    expect(decoded.get('ALG1.EQV.1').rung).toBe('proved');
  });

  test('an entry object is shared with the stored subdocument', () => {
    // The closure engine mutates entries in place; that must reach the document.
    const u = makeUser();
    setSkillMasteryEntry(u, 'ALG1.EQV.1', { rung: 'learned' });
    const decoded = decodedMasteryMap(u);
    decoded.get('ALG1.EQV.1').rung = 'proved';
    expect(getSkillMasteryEntry(u, 'ALG1.EQV.1').rung).toBe('proved');
  });
});
