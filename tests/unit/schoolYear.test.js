/**
 * utils/schoolYear.js — the July 1 rollover every roster view hangs on.
 */
const sy = require('../../utils/schoolYear');

describe('school year labels', () => {
  test.each([
    ['2026-07-01T12:00:00', '2026-27'],
    ['2026-06-30T12:00:00', '2025-26'],
    ['2026-10-14T12:00:00', '2026-27'],
    ['2027-01-05T12:00:00', '2026-27'],
    ['2099-08-01T12:00:00', '2099-00'],
  ])('%s → %s', (iso, label) => {
    expect(sy.schoolYearOf(new Date(iso))).toBe(label);
  });
  test('previous year', () => expect(sy.previousSchoolYear(new Date('2026-10-14T12:00:00'))).toBe('2025-26'));
  test('labels sort chronologically as strings', () => {
    expect(['2026-27', '2024-25', '2025-26'].sort()).toEqual(['2024-25', '2025-26', '2026-27']);
  });
});

describe('validation and ranges', () => {
  test('rejects malformed and non-consecutive labels', () => {
    expect(sy.isValidSchoolYear('2026-27')).toBe(true);
    ['2026-28', '2026', '26-27', '', null, '2026-2027'].forEach(v => expect(sy.isValidSchoolYear(v)).toBe(false));
  });
  test('range is Jul 1 → Jul 1', () => {
    const r = sy.rangeOf('2026-27');
    expect(r.start).toEqual(new Date(2026, 6, 1));
    expect(r.end).toEqual(new Date(2027, 6, 1));
  });
});

describe('prompt season and class years', () => {
  test('no nudge in July (summer planning), nudge from August', () => {
    expect(sy.isNewYearPromptSeason(new Date('2026-07-15T12:00:00'))).toBe(false);
    expect(sy.isNewYearPromptSeason(new Date('2026-08-03T12:00:00'))).toBe(true);
    expect(sy.isNewYearPromptSeason(new Date('2027-03-03T12:00:00'))).toBe(true);
  });
  test('a class without a stored year is dated by when it was created', () => {
    expect(sy.classSchoolYear({ createdAt: new Date('2025-09-02T12:00:00') })).toBe('2025-26');
    expect(sy.classSchoolYear({ schoolYear: '2026-27', createdAt: new Date('2025-09-02') })).toBe('2026-27');
  });
});

describe('archive candidate selection', () => {
  const { selectArchiveCandidates } = require('../../routes/teacherRoster');
  const cutoff = new Date('2026-07-01T00:00:00');
  test('inactive since the cutoff and older than it → candidate', () => {
    const roster = [
      { _id: 'old', createdAt: new Date('2025-09-01'), lastActiveAt: new Date('2026-03-01') },
      { _id: 'never-old', createdAt: new Date('2025-09-01'), lastActiveAt: null },
      { _id: 'returning', createdAt: new Date('2025-09-01'), lastActiveAt: new Date('2026-09-01') },
      { _id: 'brand-new', createdAt: new Date('2026-09-20'), lastActiveAt: null },
    ];
    expect(selectArchiveCandidates(roster, cutoff).map(s => s._id)).toEqual(['old', 'never-old']);
  });
});

describe('nextGradeLevel — moving a student up keeps their own format', () => {
  test.each([
    ['8', '9'], ['8th Grade', '9th Grade'], ['1st Grade', '2nd Grade'], ['2nd Grade', '3rd Grade'],
    ['11th Grade', '12th Grade'], ['Grade 9', 'Grade 10'], ['K', '1'], ['Kindergarten', '1st Grade'],
  ])('%s → %s', (from, to) => expect(sy.nextGradeLevel(from)).toEqual({ next: to, reason: null }));
  test.each([
    ['12', 'graduating'], ['12th Grade', 'graduating'], ['Grade 12', 'graduating'],
    ['College', 'unrecognized'], ['Algebra 1', 'unrecognized'], ['', 'no-grade'], [null, 'no-grade'],
  ])('%s is left alone (%s)', (from, reason) => expect(sy.nextGradeLevel(from)).toEqual({ next: null, reason }));
});
