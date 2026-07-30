/**
 * Course progress arithmetic — items #4 and #5 from the 2026-07-29 review.
 *
 * calculateOverallProgress had NO real coverage (the one suite touching it
 * mocks it), which is how an inconsistency survived: modules were weighted by
 * max(1, lessons.length), but only 7 of 15 pathways define lessons[] and
 * coverage inside those is partial. The same "43%" therefore meant different
 * things in different courses. Weighting is now uniform per module, with
 * within-module granularity coming from scaffoldProgress.
 */

const { calculateOverallProgress } = require('../../utils/coursePrompt');
const { computeUnitProgress } = require('../../utils/progressState');

const mod = (id, status, scaffoldProgress = 0, extra = {}) => ({
  moduleId: id, status, scaffoldProgress, unit: 1, lessons: [], ...extra,
});

describe('calculateOverallProgress — uniform module weighting', () => {
  test('empty / missing input is 0, never NaN', () => {
    expect(calculateOverallProgress([])).toBe(0);
    expect(calculateOverallProgress(null)).toBe(0);
  });

  test('completed modules count fully', () => {
    expect(calculateOverallProgress([
      mod('a', 'completed'), mod('b', 'completed'), mod('c', 'locked'), mod('d', 'locked'),
    ])).toBe(50);
  });

  test('an in-progress module contributes its scaffoldProgress share', () => {
    // 1 done + 1 half-done out of 4 → (1 + 0.5) / 4 = 37.5% → 38
    expect(calculateOverallProgress([
      mod('a', 'completed'), mod('b', 'in_progress', 50), mod('c', 'locked'), mod('d', 'locked'),
    ])).toBe(38);
  });

  test('available/locked modules contribute nothing even with stale scaffoldProgress', () => {
    expect(calculateOverallProgress([
      mod('a', 'available', 80), mod('b', 'locked', 90),
    ])).toBe(0);
  });

  test('THE FIX: lessons[] no longer changes what a percentage means', () => {
    // Same shape of progress — first of two modules done — in a course that
    // defines lessons and one that does not. Previously the lesson-bearing
    // course weighted its modules 5x and reported a different number.
    const withLessons = [
      mod('a', 'completed', 100, { lessons: [1, 2, 3, 4, 5] }),
      mod('b', 'locked', 0, { lessons: [1, 2, 3, 4, 5] }),
    ];
    const withoutLessons = [mod('a', 'completed'), mod('b', 'locked')];
    expect(calculateOverallProgress(withLessons)).toBe(calculateOverallProgress(withoutLessons));
    expect(calculateOverallProgress(withLessons)).toBe(50);
  });

  test('mixed lesson coverage inside ONE course is now internally consistent', () => {
    // algebra-1 shape: some modules carry lessons, some don't. Completing
    // either kind must move the bar by the same amount.
    const lessonModuleDone = [
      mod('a', 'completed', 100, { lessons: [1, 2, 3] }), mod('b', 'locked'),
    ];
    const plainModuleDone = [
      mod('a', 'locked', 0, { lessons: [1, 2, 3] }), mod('b', 'completed'),
    ];
    expect(calculateOverallProgress(lessonModuleDone)).toBe(calculateOverallProgress(plainModuleDone));
  });

  test('never exceeds 100', () => {
    expect(calculateOverallProgress([mod('a', 'completed'), mod('b', 'completed')])).toBe(100);
  });
});

describe('computeUnitProgress', () => {
  const session = (modules, currentModuleId) => ({ modules, currentModuleId });

  test('aggregates the current module\'s unit with position', () => {
    const up = computeUnitProgress(session([
      mod('a', 'completed', 100, { unit: 1 }),
      mod('b', 'in_progress', 50, { unit: 1 }),
      mod('c', 'locked', 0, { unit: 2 }),
    ], 'b'));

    expect(up).toEqual({
      unit: 1,
      label: 'Unit 1',
      moduleCount: 2,
      modulesCompleted: 1,
      moduleIndex: 2,
      pct: 75,   // (1 + 0.5) / 2
    });
  });

  test('a single-module unit still reports position 1 of 1', () => {
    const up = computeUnitProgress(session([mod('a', 'in_progress', 40, { unit: 3 })], 'a'));
    expect(up).toMatchObject({ unit: 3, moduleCount: 1, moduleIndex: 1, pct: 40 });
  });

  test('only the current unit is counted, not the whole course', () => {
    const up = computeUnitProgress(session([
      mod('a', 'completed', 100, { unit: 1 }),
      mod('b', 'completed', 100, { unit: 1 }),
      mod('c', 'in_progress', 0, { unit: 2 }),
    ], 'c'));
    expect(up.unit).toBe(2);
    expect(up.moduleCount).toBe(1);
    expect(up.pct).toBe(0);
  });

  test('returns null when there is nothing honest to report', () => {
    expect(computeUnitProgress(session([], 'a'))).toBeNull();
    expect(computeUnitProgress(session([mod('a', 'available')], 'missing'))).toBeNull();
    // A module with no unit number — do not invent one.
    expect(computeUnitProgress(session([{ moduleId: 'a', status: 'available' }], 'a'))).toBeNull();
    expect(computeUnitProgress(null)).toBeNull();
  });
});
