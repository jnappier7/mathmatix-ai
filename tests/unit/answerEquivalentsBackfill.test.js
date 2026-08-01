/**
 * Surface forms for exact-match answers (2026-08-01).
 *
 * The Fable item banks store answers with typographic operators and a leading
 * "x = ". Verified against the real solver before this backfill existed:
 *
 *   stored "x = −7"             student "-7"           → WRONG
 *   stored "y − 1 = −2(x − 5)"  student "y-1=-2(x-5)"  → WRONG
 *
 * Neither is a student error, and both shapes are everywhere in the 1,005
 * constructed-response items seeded that day. These pin the rewrite rules —
 * mechanical only, never a re-derivation of the answer.
 */
const { surfaceForms, toAscii } = require('../../scripts/backfillAnswerEquivalents');

describe('toAscii', () => {
  test('typographic operators become ASCII', () => {
    expect(toAscii('−7')).toBe('-7');
    expect(toAscii('3 × 4 ÷ 2')).toBe('3 * 4 / 2');
  });
  test('content characters (superscripts, ∞) are left alone', () => {
    expect(toAscii('6x² + 4/x²')).toBe('6x² + 4/x²');
    expect(toAscii('−∞')).toBe('-∞');
  });
});

describe('surfaceForms', () => {
  test('an assignment answer also accepts the bare value a student types', () => {
    expect(surfaceForms('x = −7')).toEqual(expect.arrayContaining(['x = -7', 'x=-7', '-7']));
  });

  test('an equation with variables on BOTH sides is never reduced to its RHS', () => {
    const f = surfaceForms('y − 1 = −2(x − 5)');
    expect(f).toEqual(expect.arrayContaining(['y - 1 = -2(x - 5)', 'y-1=-2(x-5)']));
    expect(f).not.toContain('-2(x - 5)');
    expect(f).not.toContain('-2(x-5)');
  });

  test('a literal relation keeps its left side (x = 2y + 1 is not "2y + 1")', () => {
    expect(surfaceForms('x = 2y + 1')).not.toContain('2y + 1');
  });

  test('already-ASCII answers need nothing added', () => {
    expect(surfaceForms('6')).toEqual([]);
  });

  test('never proposes the stored value itself as an equivalent', () => {
    for (const v of ['x = −7', '(2, −3)', 'y = −3x + 4']) {
      expect(surfaceForms(v)).not.toContain(v);
    }
  });
});
