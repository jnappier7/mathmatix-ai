/**
 * A short form must not cap the student's score.
 *
 * assembleForm fills what the bank can fill and reports the rest as `gaps`, so
 * a thin bank — or a student deep enough into the seen-ledger that fresh items
 * have run low — sits a form shorter than the blueprint's 45 items. gradeSession
 * then indexed the 45-row scaled table with that form's RAW COUNT.
 *
 * A perfect 28-item form scored table[28] = 24. Not "a 24-level performance":
 * 24 was the highest number that form could physically return, and no amount of
 * correct work could beat it.
 *
 * The direction is what makes it serious. Every re-test excludes everything
 * already served (routes/actTest.js seenProblemIdsForUser), so forms get SHORTER
 * as a student works through the bank — the re-test is capped harder than the
 * baseline it is compared against. The bootcamp loop exists to produce that
 * comparison ("test again, different each time"), so a student who genuinely
 * improved could be shown a drop and told it was their score.
 */

const { rawToScaled, getBlueprint } = require('../../utils/actTestAssembler');

const BP = getBlueprint();
const FULL = BP.scaledScore.scaledByRaw.length - 1;   // 45

describe('a full-length form is unchanged', () => {
  test('the blueprint length still scores by raw count, exactly as before', () => {
    for (let raw = 0; raw <= FULL; raw++) {
      expect(rawToScaled(raw, BP, FULL).scaled).toBe(BP.scaledScore.scaledByRaw[raw]);
    }
  });

  test('no form length given falls back to the full scale', () => {
    expect(rawToScaled(45).scaled).toBe(36);
    expect(rawToScaled(0).scaled).toBe(1);
    expect(rawToScaled(45).shortForm).toBe(false);
  });
});

describe('a short form scores on merit, not on length', () => {
  test('acing a short form is a 36, not whatever the table caps it at', () => {
    // Read the cap off the live table rather than hardcoding it — the curve
    // itself was later corrected to ACT's published one, and the bug under
    // test is the INDEXING, not any particular scale value.
    const capAt28 = BP.scaledScore.scaledByRaw[28];
    expect(capAt28).toBeLessThan(36);                     // the cap that used to apply
    expect(rawToScaled(28, BP, 28).scaled).toBe(36);      // what it scores now
  });

  test('every short length can still reach the top of the scale', () => {
    [20, 28, 35, 40, 44].forEach((len) => {
      expect(rawToScaled(len, BP, len).scaled).toBe(36);
    });
  });

  test('half right on a short form ≈ half right on a full one', () => {
    const half = rawToScaled(14, BP, 28).scaled;
    const fullHalf = BP.scaledScore.scaledByRaw[Math.round(FULL / 2)];
    expect(Math.abs(half - fullHalf)).toBeLessThanOrEqual(1);
  });

  test('zero is still the floor', () => {
    expect(rawToScaled(0, BP, 28).scaled).toBe(1);
  });

  test('it reports that it was short, so the UI need not present it as equal', () => {
    const s = rawToScaled(20, BP, 28);
    expect(s.shortForm).toBe(true);
    expect(s.formLength).toBe(28);
    expect(s.blueprintLength).toBe(FULL);
    expect(s.approximate).toBe(true);
  });
});

describe('the regression that motivated this', () => {
  test('an improving student on a shrinking bank no longer trends down', () => {
    // Baseline: 30 of 45 right on a full form.
    const baseline = rawToScaled(30, BP, 45).scaled;
    // Re-test: the bank could only field 32 fresh items, and they got 24 of
    // them — a BETTER rate (75% vs 67%).
    const retest = rawToScaled(24, BP, 32).scaled;
    expect(24 / 32).toBeGreaterThan(30 / 45);
    expect(retest).toBeGreaterThanOrEqual(baseline);
    // The old arithmetic: table[24] against table[30].
    expect(BP.scaledScore.scaledByRaw[24]).toBeLessThan(BP.scaledScore.scaledByRaw[30]);
  });
});

describe('guards', () => {
  test('clamps out-of-range raws instead of returning undefined', () => {
    expect(rawToScaled(999, BP, 45).scaled).toBe(36);
    expect(rawToScaled(-5, BP, 45).scaled).toBe(1);
    expect(rawToScaled(99, BP, 28).scaled).toBe(36);
  });

  test('a nonsense form length falls back to the full scale rather than dividing by zero', () => {
    [0, -3, null, undefined, NaN, 'x'].forEach((len) => {
      const s = rawToScaled(30, BP, len);
      expect(s.scaled).toBe(BP.scaledScore.scaledByRaw[30]);
      expect(Number.isFinite(s.scaled)).toBe(true);
    });
  });

  test('a form longer than the blueprint cannot index past the table', () => {
    const s = rawToScaled(60, BP, 60);
    expect(Number.isFinite(s.scaled)).toBe(true);
    expect(s.scaled).toBe(36);
  });
});
