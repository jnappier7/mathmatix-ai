const { buildChildProfile, readStreak, schoolGradeLabel } = require('../../utils/parentChildProfile');

describe('buildChildProfile', () => {
  test('school grade and assessed placement are separate, labeled facts', () => {
    const child = {
      gradeLevel: '9',
      mathCourse: '5th Grade', // the screener overwrote this with the assessed level
      learningProfile: { abilityEstimate: { gradeLevel: '5th Grade' } },
      assessmentDate: new Date('2026-07-20T00:00:00Z'),
    };
    expect(buildChildProfile(child, ['SAT Math Prep'])).toEqual({
      schoolGrade: 'Grade 9',
      courses: ['SAT Math Prep'],
      placement: { level: '5th Grade', date: '2026-07-20T00:00:00.000Z' },
    });
  });

  test('no placement → no placement line', () => {
    expect(buildChildProfile({ gradeLevel: '10' }).placement).toBeNull();
  });

  test('school grade labels', () => {
    expect(schoolGradeLabel('K')).toBe('Kindergarten');
    expect(schoolGradeLabel('12')).toBe('Grade 12');
    expect(schoolGradeLabel(null)).toBeNull();
  });
});

describe('readStreak', () => {
  const now = new Date('2026-10-14T15:00:00Z');
  const child = (lastPracticeDate, extra = {}) => ({ dailyQuests: { currentStreak: 4, longestStreak: 6, lastPracticeDate, ...extra } });

  test('practice today counts', () => {
    expect(readStreak(child('2026-10-14T13:00:00Z'), now)).toEqual({ current: 4, longest: 6 });
  });
  test('practice yesterday keeps it alive', () => {
    expect(readStreak(child('2026-10-13T20:00:00Z'), now).current).toBe(4);
  });
  test('a lapsed streak reads 0 even though the stored value is stale', () => {
    expect(readStreak(child('2026-10-09T13:00:00Z'), now).current).toBe(0);
  });
  test('no data → 0', () => {
    expect(readStreak({}, now)).toEqual({ current: 0, longest: 0 });
  });
});
