/**
 * The board must see mastery stored under a LEGACY key.
 *
 * The live bug: "Your climb" reported 0 proved / 0 taught, every strand empty,
 * and offered only prereq-free ELEM roots — for an account with a 28-day streak
 * and real history. That is exactly the board you get from an EMPTY mastery map.
 *
 * Cause: decodedMasteryMap decoded "_" -> "." and stopped. Every consumer builds
 * its graph from `source: 'unified-taxonomy'` skills, so graph nodes are unified
 * ids ("MS.QNT.8"), while skillClosure.readEntry is a plain `.get(id)`. A legacy
 * entry ("order-of-operations") therefore sat under a key no node could equal —
 * present in the document, invisible to the board. getSkillMasteryEntry has
 * always canonicalized on read; the decoded view was the reader that skipped it.
 */

const { decodedMasteryMap } = require('../../utils/masteryGuard');
const { canonicalSkillId } = require('../../utils/skillCanonicalizer');

// A legacy id that the reviewed crosswalks actually map to a unified id. Skips
// itself rather than silently asserting nothing if the crosswalk ever drops it.
const LEGACY = 'integer-operations';
const UNIFIED = canonicalSkillId(LEGACY);

describe('decodedMasteryMap canonicalization', () => {
  const userWith = (entries) => ({ skillMastery: new Map(entries) });

  test('the fixture legacy id really does crosswalk (guards the test itself)', () => {
    expect(UNIFIED).not.toBe(LEGACY);
    expect(UNIFIED).toMatch(/^[A-Z]/);
  });

  test('a legacy-keyed entry surfaces under its unified id', () => {
    const map = decodedMasteryMap(userWith([[LEGACY, { rung: 'proved' }]]));
    expect(map.get(UNIFIED)).toEqual({ rung: 'proved' });
  });

  test('an encoded unified key still decodes as before', () => {
    const map = decodedMasteryMap(userWith([['MS_QNT_8', { rung: 'learned' }]]));
    expect(map.get('MS.QNT.8')).toEqual({ rung: 'learned' });
  });

  test('entry objects are shared by reference, not copied', () => {
    // The cascade mutates entries in place and writes them back; a copy here
    // would silently discard those mutations.
    const entry = { rung: 'learned' };
    const map = decodedMasteryMap(userWith([[LEGACY, entry]]));
    expect(map.get(UNIFIED)).toBe(entry);
  });

  test('a plain object store (lean docs) works the same', () => {
    const map = decodedMasteryMap({ skillMastery: { MS_QNT_8: { rung: 'proved' } } });
    expect(map.get('MS.QNT.8')).toEqual({ rung: 'proved' });
  });

  test('an id with no crosswalk passes through unchanged', () => {
    const map = decodedMasteryMap(userWith([['totally-made-up-skill', { rung: 'learned' }]]));
    expect(map.get('totally-made-up-skill')).toEqual({ rung: 'learned' });
  });

  test('no user / no skillMastery yields an empty map', () => {
    expect(decodedMasteryMap(null).size).toBe(0);
    expect(decodedMasteryMap({}).size).toBe(0);
  });
});

describe('collision merge — a collapse must never lose progress', () => {
  const collide = (legacyEntry, unifiedEntry) =>
    decodedMasteryMap({
      skillMastery: new Map([
        [LEGACY, legacyEntry],
        [UNIFIED.replace(/\./g, '_'), unifiedEntry],
      ]),
    }).get(UNIFIED);

  test('the higher rung wins when the legacy entry is ahead', () => {
    expect(collide({ rung: 'proved' }, { rung: 'learned' })).toEqual({ rung: 'proved' });
  });

  test('the higher rung wins when the unified entry is ahead', () => {
    expect(collide({ rung: 'none' }, { rung: 'taught' })).toEqual({ rung: 'taught' });
  });

  test('a legacy status-only entry is ranked, not ignored', () => {
    // currentRung reads 'mastered' as 'proved' for entries predating the ladder.
    expect(collide({ status: 'mastered' }, { rung: 'learned' })).toEqual({ status: 'mastered' });
  });

  test('on a tie, a demonstrated rung beats one granted by inference', () => {
    const demonstrated = { rung: 'proved', provenBy: 'challenge' };
    expect(collide({ rung: 'proved', provenBy: 'inference' }, demonstrated)).toBe(demonstrated);
    expect(collide(demonstrated, { rung: 'proved', provenBy: 'inference' })).toBe(demonstrated);
  });

  test('the map collapses to a single entry', () => {
    const map = decodedMasteryMap({
      skillMastery: new Map([
        [LEGACY, { rung: 'proved' }],
        [UNIFIED.replace(/\./g, '_'), { rung: 'learned' }],
      ]),
    });
    expect(map.size).toBe(1);
  });
});
