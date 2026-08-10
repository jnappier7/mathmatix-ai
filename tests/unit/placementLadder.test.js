/**
 * The placement ladder — what the Starting Point results screen tells a student.
 *
 * This replaced a grade level, and the reason it replaced it is that the grade
 * level was a verdict. So the things pinned here are the things that could
 * quietly turn it back into one, or into a lie:
 *
 *   - proved and assumed never merge (a cleared skill was not demonstrated)
 *   - no rung is ever labelled with a grade
 *   - the counts agree with GET /api/mastery/map, which the student sees next
 *   - an unseeded catalog says so rather than rendering an empty ladder, which
 *     reads as "you have done nothing"
 */

const { buildPlacementLadder, LADDER_BANDS } = require('../../utils/placementLadder');
const {
  canRender, fillWidths, showPips, lede, rungSentence
} = require('../../public/js/placementLadder');

// A tiny two-band catalog: MS.PRP.1 -> ALG1.PRP.2 -> ALG1.FNC.1
const CATALOG = [
  { skillId: 'MS.PRP.1', studentLabel: 'Unit rate', strand: 'PRP', courseLevel: 'MS', grade: '6', prerequisites: [] },
  { skillId: 'MS.QNT.1', studentLabel: 'Integer ops', strand: 'QNT', courseLevel: 'MS', grade: '6', prerequisites: [] },
  { skillId: 'ALG1.PRP.2', studentLabel: 'Slope as a rate', strand: 'PRP', courseLevel: 'ALG1', grade: '9', prerequisites: ['MS.PRP.1'] },
  { skillId: 'ALG1.FNC.1', studentLabel: 'Linear functions', strand: 'FNC', courseLevel: 'ALG1', grade: '9', prerequisites: ['ALG1.PRP.2'] }
];

const proved = { rung: 'proved', provenBy: 'placement' };
const cleared = { rung: 'proved', provenBy: 'inference' };

const masteryOf = (pairs) => new Map(Object.entries(pairs));
const rungFor = (ladder, level) => ladder.rungs.find((r) => r.level === level);

describe('buildPlacementLadder', () => {
  test('counts a demonstrated skill and a cleared one apart', () => {
    const ladder = buildPlacementLadder(CATALOG, masteryOf({
      'ALG1.PRP.2': proved,
      'MS.PRP.1': cleared
    }));

    expect(rungFor(ladder, 'ALG1').proved).toBe(1);
    expect(rungFor(ladder, 'ALG1').assumed).toBe(0);
    expect(rungFor(ladder, 'MS').proved).toBe(0);
    // The whole point: the board must never imply evidence that does not exist.
    expect(rungFor(ladder, 'MS').assumed).toBe(1);
    expect(ladder.totals.proved).toBe(1);
    expect(ladder.totals.assumed).toBe(1);
  });

  test('owned rolls up demonstrated AND cleared — both fill the ladder', () => {
    const ladder = buildPlacementLadder(CATALOG, masteryOf({
      'ALG1.PRP.2': proved,
      'MS.PRP.1': cleared
    }));
    expect(ladder.totals.owned).toBe(2);
    expect(ladder.totals.total).toBe(4);
  });

  test('a band with everything owned reads cleared; a partial one does not', () => {
    const ladder = buildPlacementLadder(CATALOG, masteryOf({
      'MS.PRP.1': proved,
      'MS.QNT.1': proved,
      'ALG1.PRP.2': proved
    }));
    expect(rungFor(ladder, 'MS').state).toBe('cleared');
    expect(rungFor(ladder, 'MS').pct).toBe(100);
    expect(rungFor(ladder, 'ALG1').state).toBe('partial');
  });

  test('a band the student has not reached is `ahead`, never hidden', () => {
    const ladder = buildPlacementLadder(CATALOG, masteryOf({ 'MS.PRP.1': proved }));
    expect(rungFor(ladder, 'ALG1').state).toBe('ahead');
    expect(rungFor(ladder, 'ALG1')).toBeDefined();
  });

  test('the edge marker sits on the highest band with anything owned', () => {
    const ladder = buildPlacementLadder(CATALOG, masteryOf({
      'MS.PRP.1': proved,
      'ALG1.PRP.2': proved
    }));
    expect(ladder.rungs[ladder.edgeIndex].level).toBe('ALG1');
    expect(rungFor(ladder, 'ALG1').isEdge).toBe(true);
    expect(rungFor(ladder, 'MS').isEdge).toBe(false);
  });

  test('a student who owns nothing still gets a marker on real, startable work', () => {
    const ladder = buildPlacementLadder(CATALOG, new Map());
    // Not -1, and not a band they cannot begin: MS is what is open at the floor.
    expect(ladder.edgeIndex).toBe(0);
    expect(ladder.rungs[ladder.edgeIndex].level).toBe('MS');
    expect(ladder.rungs[ladder.edgeIndex].open).toBeGreaterThan(0);
  });

  test('taught counts as owned and as demonstrated, not as assumed', () => {
    const ladder = buildPlacementLadder(CATALOG, masteryOf({
      'MS.PRP.1': { rung: 'taught', provenBy: 'challenge' }
    }));
    expect(rungFor(ladder, 'MS').taught).toBe(1);
    expect(rungFor(ladder, 'MS').assumed).toBe(0);
    expect(ladder.totals.owned).toBe(1);
  });

  test('empty bands are never rendered as rungs', () => {
    const ladder = buildPlacementLadder(CATALOG, new Map());
    expect(ladder.rungs.map((r) => r.level)).toEqual(['MS', 'ALG1']);
  });

  test('rungs run bottom-up, in the same order the skill map uses', () => {
    const full = LADDER_BANDS.map((b, i) => ({
      skillId: `${b.level}.QNT.1`, studentLabel: b.label, strand: 'QNT',
      courseLevel: b.level, grade: String(i + 1), prerequisites: []
    }));
    const ladder = buildPlacementLadder(full, new Map());
    expect(ladder.rungs.map((r) => r.level))
      .toEqual(['ELEM', 'MS', 'ALG1', 'GEO', 'ALG2', 'PREC', 'STAT', 'CALC']);
  });

  test('no rung is labelled with a grade — that is the thing this replaced', () => {
    const ladder = buildPlacementLadder(CATALOG, new Map());
    ladder.rungs.forEach((r) => {
      expect(r.label).not.toMatch(/\bgrade\b|\d(?:st|nd|rd|th)\b/i);
    });
  });

  test('provisional skills stay out of the counts, exactly as /api/mastery/map does', () => {
    const withProvisional = CATALOG.concat([{
      skillId: 'ALG1.EQV.9', studentLabel: 'Unverified thing', strand: 'EQV',
      courseLevel: 'ALG1', grade: '9', prerequisites: [], provisional: true
    }]);
    const ladder = buildPlacementLadder(withProvisional, new Map());
    expect(ladder.totals.total).toBe(4);
    expect(rungFor(ladder, 'ALG1').skills.map((s) => s.skillId)).not.toContain('ALG1.EQV.9');
  });

  test('an unseeded catalog says so rather than drawing an empty ladder', () => {
    const ladder = buildPlacementLadder([], new Map());
    expect(ladder.seeded).toBe(false);
    expect(ladder.rungs).toEqual([]);
  });

  test('a catalog with no course levels is unseeded too — no rungs is no ladder', () => {
    const ladder = buildPlacementLadder(
      [{ skillId: 'x', displayName: 'X', prerequisites: [] }],
      new Map()
    );
    expect(ladder.seeded).toBe(false);
  });

  test('every skill in a band gets a pip, strongest first', () => {
    const ladder = buildPlacementLadder(CATALOG, masteryOf({ 'MS.PRP.1': proved }));
    const ms = rungFor(ladder, 'MS');
    expect(ms.skills).toHaveLength(2);
    expect(ms.skills[0].state).toBe('proved');
    expect(ms.skills.map((s) => s.label)).toContain('Integer ops');
  });
});

describe('the sentence the student reads', () => {
  test('names proved and cleared separately, never as one inflated number', () => {
    const text = lede({ owned: 247, proved: 38, taught: 0, assumed: 209 });
    expect(text).toContain('247 skills');
    expect(text).toContain('38 you proved');
    expect(text).toContain('209 that cleared');
  });

  test('a student who owns nothing is not told they own nothing', () => {
    const text = lede({ owned: 0, proved: 0, taught: 0, assumed: 0 });
    expect(text).toMatch(/ground floor/i);
    expect(text).toMatch(/nothing on this ladder is a verdict/i);
  });

  test('no cleared skills means no cleared clause', () => {
    const text = lede({ owned: 5, proved: 5, taught: 0, assumed: 0 });
    expect(text).toContain('5 skills');
    expect(text).not.toMatch(/cleared beneath/);
  });

  test('a taught skill counts as demonstrated, not as cleared', () => {
    const text = lede({ owned: 4, proved: 2, taught: 2, assumed: 0 });
    expect(text).toContain('4 skills');
  });

  test('singulars read as singulars', () => {
    expect(lede({ owned: 1, proved: 1, taught: 0, assumed: 0 })).toContain('1 skill,');
  });

  test('a rung says its counts out loud for screen readers', () => {
    const said = rungSentence({
      label: 'Algebra 1', owned: 12, total: 40, proved: 4, taught: 0, assumed: 8, isEdge: true
    });
    expect(said).toContain('Algebra 1: 12 of 40 skills owned');
    expect(said).toContain('4 proved');
    expect(said).toContain('8 cleared from above');
    expect(said).toContain('you are working here');
  });
});

// The DOM in placementLadder.js is not exercised here — this repo runs jest on
// the node environment with no jsdom, the same reason skillMapModel.test.js
// covers only the view model. What IS pinned is every decision the renderer
// makes before it touches an element, because those are the ones that can put
// a blank hero or a wrong bar in front of a student.
describe('renderer decisions', () => {
  test('refuses an unseeded or empty ladder, so the caller falls back', () => {
    expect(canRender(null)).toBe(false);
    expect(canRender({ seeded: false, rungs: [{}] })).toBe(false);
    expect(canRender({ seeded: true, rungs: [] })).toBe(false);
    expect(canRender(buildPlacementLadder([], new Map()))).toBe(false);
  });

  test('accepts a real ladder', () => {
    expect(canRender(buildPlacementLadder(CATALOG, new Map()))).toBe(true);
  });

  test('the two fills are drawn apart and sum to the fraction owned', () => {
    const ladder = buildPlacementLadder(CATALOG, masteryOf({
      'MS.PRP.1': proved, 'MS.QNT.1': cleared
    }));
    const w = fillWidths(rungFor(ladder, 'MS'));
    expect(w.proved).toBe(50);
    expect(w.assumed).toBe(50);
  });

  test('a taught skill widens the proved bar, never the cleared one', () => {
    const w = fillWidths({ total: 4, proved: 1, taught: 1, assumed: 0 });
    expect(w.proved).toBe(50);
    expect(w.assumed).toBe(0);
  });

  test('an empty band cannot divide by zero', () => {
    expect(fillWidths({ total: 0, proved: 0, taught: 0, assumed: 0 }))
      .toEqual({ proved: 0, assumed: 0 });
    expect(fillWidths(null)).toEqual({ proved: 0, assumed: 0 });
  });

  // Drawn on every band, the untouched climb above the student is five solid
  // blocks of grey at the TOP of the card — the first thing the eye lands on
  // is 250 things not done, which is the grade level's message again in a
  // bigger font. Bands ahead keep their rung and their true size; they just
  // do not get to be the loudest thing on the ladder.
  describe('which bands draw their skills out pip by pip', () => {
    const band = (over) => Object.assign(
      { skills: [{}, {}], owned: 0, learned: 0, isEdge: false }, over
    );

    test('a band with anything owned does', () => {
      expect(showPips(band({ owned: 1 }))).toBe(true);
    });

    test('so does the band the student is working in, owned or not', () => {
      expect(showPips(band({ owned: 0, isEdge: true }))).toBe(true);
    });

    test('and one with work in progress', () => {
      expect(showPips(band({ learned: 2 }))).toBe(true);
    });

    test('an untouched band above the student does not', () => {
      expect(showPips(band({ owned: 0 }))).toBe(false);
    });

    test('nor does a band with no skills at all', () => {
      expect(showPips(band({ owned: 5, skills: [] }))).toBe(false);
      expect(showPips(null)).toBe(false);
    });

    test('on a real ladder, only the reached bands and the edge light up', () => {
      const ladder = buildPlacementLadder(CATALOG, masteryOf({ 'MS.PRP.1': proved }));
      expect(showPips(rungFor(ladder, 'MS'))).toBe(true);
      expect(showPips(rungFor(ladder, 'ALG1'))).toBe(false);
    });

    test('a student who owns nothing still sees the ground floor drawn out', () => {
      const ladder = buildPlacementLadder(CATALOG, new Map());
      expect(showPips(rungFor(ladder, 'MS'))).toBe(true);
      expect(showPips(rungFor(ladder, 'ALG1'))).toBe(false);
    });
  });
});
