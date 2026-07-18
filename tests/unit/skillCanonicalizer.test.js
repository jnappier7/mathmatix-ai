// tests/unit/skillCanonicalizer.test.js
// Guards the skillId canonicalization layer that lets the content banks migrate
// onto unified "Map of Mathmatix" ids without splitting per-skill mastery: a
// legacy id and its unified id must collapse to ONE node at every mastery
// read/write boundary. Covers the resolver plus the masteryGuard accessors that
// route reads/writes through it. Pure — no DB, no env.

const { canonicalSkillId, isUnifiedSkillId } = require('../../utils/skillCanonicalizer');
const { getSkillMasteryEntry, resolveMasteryKey } = require('../../utils/masteryGuard');

// Stable, high-confidence crosswalk pairs (see seeds/unified-taxonomy/alg1-crosswalk.json).
const LEGACY = 'solving-multi-step-equations';
const UNIFIED = 'ALG1.EQV.1';
const LEGACY2 = 'slope-from-two-points';
const UNIFIED2 = 'ALG1.PRP.2';

describe('skillCanonicalizer', () => {
  test('maps a legacy kebab id to its unified id', () => {
    expect(canonicalSkillId(LEGACY)).toBe(UNIFIED);
    expect(canonicalSkillId(LEGACY2)).toBe(UNIFIED2);
  });

  test('passes an already-unified id through unchanged', () => {
    expect(canonicalSkillId(UNIFIED)).toBe(UNIFIED);
  });

  test('passes an unknown id and falsy values through unchanged', () => {
    expect(canonicalSkillId('totally-unknown-skill')).toBe('totally-unknown-skill');
    expect(canonicalSkillId('')).toBe('');
    expect(canonicalSkillId(null)).toBe(null);
    expect(canonicalSkillId(undefined)).toBe(undefined);
  });

  test('isUnifiedSkillId recognizes real taxonomy ids only', () => {
    expect(isUnifiedSkillId(UNIFIED)).toBe(true);
    expect(isUnifiedSkillId(LEGACY)).toBe(false);
  });
});

// Helper: build a minimal user with a skillMastery store (Map or plain object).
const userWith = (store) => ({ skillMastery: store });

describe('getSkillMasteryEntry — canonical read with legacy fallback', () => {
  for (const kind of ['Map', 'object']) {
    const make = (entries) => (kind === 'Map' ? new Map(entries) : Object.fromEntries(entries));

    test(`(${kind}) a legacy-id lookup finds a unified-keyed entry`, () => {
      const user = userWith(make([[UNIFIED, { status: 'mastered' }]]));
      expect(getSkillMasteryEntry(user, LEGACY)).toEqual({ status: 'mastered' });
      expect(getSkillMasteryEntry(user, UNIFIED)).toEqual({ status: 'mastered' });
    });

    test(`(${kind}) a legacy-id lookup still finds a legacy-keyed (historical) entry`, () => {
      const user = userWith(make([[LEGACY, { status: 'learning' }]]));
      expect(getSkillMasteryEntry(user, LEGACY)).toEqual({ status: 'learning' });
    });

    test(`(${kind}) returns null when neither key is present`, () => {
      const user = userWith(make([]));
      expect(getSkillMasteryEntry(user, LEGACY)).toBeNull();
    });
  }

  test('null-safe on missing user / skillMastery / skillId', () => {
    expect(getSkillMasteryEntry(null, LEGACY)).toBeNull();
    expect(getSkillMasteryEntry({}, LEGACY)).toBeNull();
    expect(getSkillMasteryEntry(userWith(new Map()), null)).toBeNull();
  });
});

describe('resolveMasteryKey — duplicate-free read/modify/write key', () => {
  test('prefers the canonical unified key when an entry lives there', () => {
    const user = userWith(new Map([[UNIFIED, { status: 'mastered' }]]));
    expect(resolveMasteryKey(user, LEGACY)).toBe(UNIFIED);
  });

  test('uses the legacy key when only a historical entry exists there', () => {
    const user = userWith(new Map([[LEGACY, { status: 'mastered' }]]));
    expect(resolveMasteryKey(user, LEGACY)).toBe(LEGACY);
  });

  test('defaults to the canonical key for a brand-new entry', () => {
    const user = userWith(new Map());
    expect(resolveMasteryKey(user, LEGACY)).toBe(UNIFIED);
  });

  test('a canonical entry wins even if a stale legacy entry also exists', () => {
    const user = userWith(new Map([[LEGACY, { status: 'learning' }], [UNIFIED, { status: 'mastered' }]]));
    expect(resolveMasteryKey(user, LEGACY)).toBe(UNIFIED);
  });
});
