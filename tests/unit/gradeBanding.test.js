/**
 * Per-skill grade parsing.
 *
 * The taxonomy stores grade as a STRING that is not always one number — "4",
 * "6–7", "3-5", "10-11" — and BOTH an en dash and a hyphen appear in the real
 * data. Every caller writing its own split is how half of them silently work.
 *
 * This exists because courseLevel ("ELEM") and gradeBand ("K-5") each cover
 * grades 3, 4 and 5, so a student finishing an entire grade of work sees no
 * movement at all. Grade is the field that moves.
 */
const { lowGrade, gradeLabel, gradesPresent } = require('../../utils/gradeBanding');

describe('lowGrade', () => {
  test('reads a plain grade', () => {
    expect(lowGrade('4')).toBe(4);
    expect(lowGrade('12')).toBe(12);
  });

  test('handles BOTH dash characters the taxonomy actually uses', () => {
    expect(lowGrade('6–7')).toBe(6);   // en dash — the common one
    expect(lowGrade('10-11')).toBe(10); // hyphen
    expect(lowGrade('3–5')).toBe(3);
  });

  test('takes the LOW end, never the high', () => {
    // Owning a "3–4" skill means grade-3 work for certain, grade-4 maybe.
    // Claiming the higher grade overstates what the student has shown, and
    // this feeds a label a parent reads.
    expect(lowGrade('3–4')).toBe(3);
    expect(lowGrade('9-10')).toBe(9);
  });

  test('returns null rather than NaN on junk', () => {
    expect(lowGrade(null)).toBeNull();
    expect(lowGrade(undefined)).toBeNull();
    expect(lowGrade('')).toBeNull();
    expect(lowGrade('K')).toBeNull();
    expect(lowGrade('Calculus')).toBeNull();
  });
});

describe('gradeLabel', () => {
  test('ordinals read the way a person says them', () => {
    expect(gradeLabel(1)).toBe('1st grade');
    expect(gradeLabel(2)).toBe('2nd grade');
    expect(gradeLabel(3)).toBe('3rd grade');
    expect(gradeLabel(4)).toBe('4th grade');
    expect(gradeLabel(5)).toBe('5th grade');
    expect(gradeLabel(11)).toBe('11th grade');
    expect(gradeLabel(12)).toBe('12th grade');
  });

  test('null in, null out', () => {
    expect(gradeLabel(null)).toBeNull();
  });
});

describe('gradesPresent', () => {
  test('ascending, de-duplicated, junk dropped', () => {
    expect(gradesPresent([
      { grade: '5' }, { grade: '3–4' }, { grade: '5' }, { grade: 'K' }, { grade: '7' }, {},
    ])).toEqual([3, 5, 7]);
  });

  test('every skill in the real taxonomy parses', () => {
    // If a new grade format lands in the data, fail HERE rather than silently
    // dropping those skills out of the columns.
    const tax = require('../../seeds/unified-taxonomy/math_taxonomy.json');
    const unparseable = tax.skills.filter((s) => lowGrade(s.grade) == null);
    expect(unparseable.map((s) => `${s.skill_id}=${s.grade}`)).toEqual([]);
  });
});
