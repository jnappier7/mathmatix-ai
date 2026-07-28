/**
 * The grade-level split-brain — fourth data seam, same disease as skill ids
 * (skillCanonicalizer), theta (utils/theta), and masteryScore.
 *
 * "What grade level is this student?" had FIVE answer fields — user.gradeLevel
 * (signup), user.mathCourse (screener-overwritten), user.initialPlacement,
 * learningProfile.initialPlacement, learningProfile.abilityEstimate.gradeLevel
 * — and readers picked one at random. Production shape: practicePack banded
 * worksheets on the SIGNUP grade after the screener assessed a different level.
 *
 * initialPlacement additionally carries three historic formats: "5th Grade"
 * (current), "Theta: -0.3 (35th percentile)" (legacy), and raw skill names
 * (legacy assessment route) — the resolver must reject the junk.
 */
const {
  levelToGradeNumber,
  isLevelString,
  assessedLevel,
  resolveGradeLevel,
  resolveGradeNumber,
  assessedLevelWritePatch,
  assessmentCompletedPatch,
} = require('../../utils/gradeLevel');

describe('resolveGradeLevel — assessed beats stated', () => {
  test('THE production shape: signed up 9th grade, assessed at 5th → 5th Grade, not 9th', () => {
    const user = {
      gradeLevel: '9th Grade',
      learningProfile: { abilityEstimate: { gradeLevel: '5th Grade' } },
    };
    expect(resolveGradeLevel(user)).toBe('5th Grade');
    expect(resolveGradeNumber(user)).toBe(5);
  });

  test('falls through the placement mirrors in order', () => {
    expect(resolveGradeLevel({ gradeLevel: '9th Grade', learningProfile: { initialPlacement: '6th Grade' } }))
      .toBe('6th Grade');
    expect(resolveGradeLevel({ gradeLevel: '9th Grade', initialPlacement: '7th Grade' }))
      .toBe('7th Grade');
  });

  test('never assessed → stated grade', () => {
    expect(resolveGradeLevel({ gradeLevel: '3rd Grade' })).toBe('3rd Grade');
  });

  test('legacy junk placements are rejected, not resolved', () => {
    // Old screener wrote theta strings; old assessment route wrote skill names.
    expect(resolveGradeLevel({ gradeLevel: '9th Grade', initialPlacement: 'Theta: -0.3 (35th percentile)' }))
      .toBe('9th Grade');
    expect(resolveGradeLevel({ gradeLevel: '9th Grade', initialPlacement: 'adding fractions with unlike denominators' }))
      .toBe('9th Grade');
    expect(isLevelString('Theta: 1.2 (84th percentile)')).toBe(false);
  });

  test('junk-safe: nothing anywhere → null', () => {
    expect(resolveGradeLevel({})).toBeNull();
    expect(resolveGradeLevel(null)).toBeNull();
    expect(assessedLevel(null)).toBeNull();
    expect(resolveGradeNumber({ gradeLevel: 'High School' })).toBeNull();
  });
});

describe('levelToGradeNumber — every string the writers actually produce', () => {
  test('grades, K, and course names', () => {
    expect(levelToGradeNumber('Kindergarten')).toBe(0);
    expect(levelToGradeNumber('5th Grade')).toBe(5);
    expect(levelToGradeNumber('8th Grade Math')).toBe(8);   // demo mathCourse shape
    expect(levelToGradeNumber('Grade 7')).toBe(7);
    expect(levelToGradeNumber('Algebra 1')).toBe(9);
    expect(levelToGradeNumber('Geometry')).toBe(10);
    expect(levelToGradeNumber('Algebra 2')).toBe(11);
    expect(levelToGradeNumber('Pre-Calculus')).toBe(12);
    expect(levelToGradeNumber('Calculus')).toBe(12);
    expect(levelToGradeNumber('Advanced Math')).toBe(13);
    expect(levelToGradeNumber('College')).toBe(13);
    expect(levelToGradeNumber(7)).toBe(7);
  });

  test('a K student resolves to 0, not a falsy-swallowed default', () => {
    expect(resolveGradeNumber({ gradeLevel: 'Kindergarten' })).toBe(0);
  });
});

describe('write patches — every writer syncs every read path', () => {
  test('assessedLevelWritePatch keeps the level string and tutor pathway together', () => {
    expect(assessedLevelWritePatch('6th Grade')).toEqual({
      'learningProfile.abilityEstimate.gradeLevel': '6th Grade',
      mathCourse: '6th Grade',
    });
  });

  test('assessmentCompletedPatch flips BOTH homes of the flag', () => {
    expect(assessmentCompletedPatch(true)).toEqual({
      assessmentCompleted: true,
      'learningProfile.assessmentCompleted': true,
    });
    expect(assessmentCompletedPatch(false)).toEqual({
      assessmentCompleted: false,
      'learningProfile.assessmentCompleted': false,
    });
  });
});

describe('the seam stays closed at its call sites', () => {
  const fs = require('fs');
  const read = (p) => fs.readFileSync(require.resolve(p), 'utf8');

  test('practicePack bands on the resolved level, never the raw signup grade', () => {
    const src = read('../../routes/practicePack.js');
    expect(src).toContain("require('../utils/gradeLevel')");
    expect(src).not.toContain('gradeLevelToBand(user.gradeLevel)');
    expect(src).toContain('gradeLevelToBand(resolveGradeLevel(user))');
  });

  // routes/growthCheck.js used to own this and was pinned here. It is retired:
  // growth checks are the screener with sessionType 'growth-check', so the
  // level-sync guarantee now has to hold on the screener's completion path —
  // which reaches the same two homes by direct assignment.
  test('a growth check re-syncs the assessed level without rewriting the placement', () => {
    const src = read('../../routes/screener.js');
    expect(src).toContain("require('../utils/theta')");
    expect(src).toContain("session.sessionType === 'growth-check'");
    // mathCourse + abilityEstimate.gradeLevel (what assessedLevelWritePatch
    // wrote) are set unconditionally, so a growth check still moves them...
    expect(src).toContain('user.mathCourse = gradeLevelResult.gradeLevel;');
    expect(src).toContain('gradeLevel: gradeLevelResult.gradeLevel');
    // ...while initialPlacement stays behind the !isGrowthCheck guard.
    expect(src).toMatch(/if \(!isGrowthCheck\) \{[\s\S]*?user\.initialPlacement = gradeLevelResult\.gradeLevel;/);
  });

  test('screener completion still writes every home of every dual field', () => {
    const src = read('../../routes/screener.js');
    expect(src).toContain('user.initialPlacement = gradeLevelResult.gradeLevel;');
    expect(src).toContain('user.learningProfile.initialPlacement = gradeLevelResult.gradeLevel;');
    expect(src).toContain('user.mathCourse = gradeLevelResult.gradeLevel;');
    expect(src).toContain('gradeLevel: gradeLevelResult.gradeLevel');
  });

  test('teacher and admin assessment resets clear BOTH homes of the flag', () => {
    for (const route of ['../../routes/teacher.js', '../../routes/admin.js']) {
      const src = read(route);
      expect(src).toContain('student.learningProfile.assessmentCompleted = false;');
      expect(src).toContain('student.learningProfile.initialPlacement = null;');
    }
    expect(read('../../scripts/resetAllAssessments.js'))
      .toContain("'learningProfile.assessmentCompleted': false");
  });

  test('legacy assessment route completion sets BOTH homes of the flag', () => {
    const src = read('../../routes/assessment.js');
    expect(src).toContain('user.learningProfile.assessmentCompleted = true;');
  });

  test('demo students are assessed in BOTH homes (top-level readers saw "never assessed")', () => {
    const { studentMaya, studentAlex, studentJordan, mockStudents } = require('../../utils/demoData');
    for (const s of [studentMaya, studentAlex, studentJordan, ...mockStudents]) {
      expect(s.assessmentCompleted).toBe(true);
      expect(s.learningProfile.assessmentCompleted).toBe(true);
      expect(isLevelString(s.initialPlacement)).toBe(true);
    }
  });
});
