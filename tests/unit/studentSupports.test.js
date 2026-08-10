// tests/unit/studentSupports.test.js
//
// The student is the third and lowest tier of the accommodations stack:
//
//   iepPlan.accommodations          school, legally binding, teacher-written
//   learningProfile.familySupports  parent request
//   learningProfile.studentSupports what the student says they need
//
// Two properties matter and both fail silently if broken:
//
//   1. A student can never grant themselves a RIGOR accommodation. Extra time
//      and read-aloud change how reachable the work is; a calculator changes
//      how hard it is. Only a parent or teacher may grant the latter.
//
//   2. The student block dedupes against BOTH tiers above it, so the tutor is
//      never told the same thing twice under two different authorities, and a
//      student's self-report can never appear to override a school IEP.

const {
  SELF_REPORTABLE_KEYS,
  RIGOR_KEYS,
  ANXIETY_REPORTED,
  ANXIETY_DENIED,
  applyStudentSupportsUpdate,
  anxietyLevelFromReport,
  readStudentSupports,
  grantedAbove,
} = require('../../utils/studentSupports');

const { buildStudentSupportsPrompt, FAMILY_SUPPORT_LINES } = require('../../utils/promptHelpers');

describe('the rigor line', () => {
  test('a student cannot grant themselves a calculator or a times-table chart', () => {
    const target = {};
    applyStudentSupportsUpdate(target, {
      calculatorAllowed: true,
      digitalMultiplicationChart: true,
      extendedTime: true,
    });
    expect(target.calculatorAllowed).toBeUndefined();
    expect(target.digitalMultiplicationChart).toBeUndefined();
    expect(target.extendedTime).toBe(true);   // accessibility still goes through
  });

  test('the rigor keys are absent from the self-reportable list', () => {
    RIGOR_KEYS.forEach(k => expect(SELF_REPORTABLE_KEYS).not.toContain(k));
  });

  test('every self-reportable key is an accessibility switch with a prompt line', () => {
    SELF_REPORTABLE_KEYS.forEach(k => {
      expect(typeof FAMILY_SUPPORT_LINES[k]).toBe('string');
    });
  });
});

describe('the whitelist', () => {
  test('cannot reach iepPlan, the parent tier, or the rest of the user', () => {
    const target = {};
    applyStudentSupportsUpdate(target, {
      iepPlan: { accommodations: { extendedTime: true } },
      familySupports: { extendedTime: true },
      role: 'admin',
      subscriptionTier: 'unlimited',
      mathAnxietyLevel: 10,
      __proto__: { polluted: true },
    });
    expect(target.iepPlan).toBeUndefined();
    expect(target.familySupports).toBeUndefined();
    expect(target.role).toBeUndefined();
    expect(target.subscriptionTier).toBeUndefined();
    expect(target.mathAnxietyLevel).toBeUndefined();  // set on the profile, never here
    expect({}.polluted).toBeUndefined();
  });

  test('only a literal true enables a switch', () => {
    const target = {};
    applyStudentSupportsUpdate(target, { extendedTime: 'yes', breaksAsNeeded: 1, audioReadAloud: true });
    expect(target.extendedTime).toBe(false);
    expect(target.breaksAsNeeded).toBe(false);
    expect(target.audioReadAloud).toBe(true);
  });

  test('survives a hostile or absent body', () => {
    expect(() => applyStudentSupportsUpdate({}, null)).not.toThrow();
    expect(() => applyStudentSupportsUpdate({}, 'nope')).not.toThrow();
    expect(() => applyStudentSupportsUpdate({}, [])).not.toThrow();
  });
});

describe('anxietyLevelFromReport — the writer for a field nothing wrote', () => {
  test('reporting anxiety clears the >6 threshold promptCompact checks', () => {
    expect(anxietyLevelFromReport({ mathAnxietySupport: true })).toBe(ANXIETY_REPORTED);
    expect(ANXIETY_REPORTED).toBeGreaterThan(6);
  });

  test('denying it lands below the threshold and away from the default 5', () => {
    expect(anxietyLevelFromReport({ mathAnxietySupport: false })).toBe(ANXIETY_DENIED);
    expect(ANXIETY_DENIED).toBeLessThan(6);
    expect(ANXIETY_DENIED).not.toBe(5);
  });

  test('not answering leaves an existing level alone', () => {
    expect(anxietyLevelFromReport({ extendedTime: true })).toBeNull();
    expect(anxietyLevelFromReport({})).toBeNull();
    expect(anxietyLevelFromReport(null)).toBeNull();
  });
});

describe('precedence — the student block dedupes against both tiers above', () => {
  test('a switch the school IEP owns is not restated', () => {
    const iep = { accommodations: { extendedTime: true } };
    const out = buildStudentSupportsPrompt({ extendedTime: true }, null, iep, 'Sam');
    expect(out).toBe('');
  });

  test('a switch the parent already asked for is not restated', () => {
    const out = buildStudentSupportsPrompt({ extendedTime: true }, { extendedTime: true }, null, 'Sam');
    expect(out).toBe('');
  });

  test('what only the student asked for still comes through', () => {
    const iep = { accommodations: { extendedTime: true } };
    const family = { chunkedAssignments: true };
    const out = buildStudentSupportsPrompt(
      { extendedTime: true, chunkedAssignments: true, audioReadAloud: true }, family, iep, 'Sam'
    );
    expect(out).toContain('Read problems aloud');
    expect(out).not.toContain('Never rush Sam');          // owned by the IEP
    expect(out).not.toContain('3-5 problems at a time');  // owned by the parent
  });

  test('a student with no IEP and no parent gets everything they asked for', () => {
    const out = buildStudentSupportsPrompt(
      { audioReadAloud: true, mathAnxietySupport: true }, null, null, 'Sam'
    );
    expect(out).toContain('Read problems aloud');
    expect(out).toContain('Normalise mistakes');
  });

  test('is framed as the student speaking, not as a mandate', () => {
    const out = buildStudentSupportsPrompt({ breaksAsNeeded: true }, null, null, 'Sam');
    expect(out).toContain('SAM TOLD US THEY NEED');
    expect(out).toContain('asked for these themselves');
    expect(out).not.toMatch(/LEGALLY REQUIRED|IDEA|mandated/i);
  });

  test('empty when nothing is set', () => {
    expect(buildStudentSupportsPrompt(null, null, null, 'Sam')).toBe('');
    expect(buildStudentSupportsPrompt({}, null, null, 'Sam')).toBe('');
  });
});

describe('readStudentSupports / grantedAbove', () => {
  test('read returns every self-reportable switch as a real boolean', () => {
    const out = readStudentSupports({ extendedTime: true, breaksAsNeeded: 'yes' });
    expect(out.extendedTime).toBe(true);
    expect(out.breaksAsNeeded).toBe(false);
    expect(Object.keys(out).sort()).toEqual([...SELF_REPORTABLE_KEYS].sort());
  });

  test('grantedAbove reflects either tier above', () => {
    const g = grantedAbove(
      { accommodations: { extendedTime: true } },
      { audioReadAloud: true }
    );
    expect(g.extendedTime).toBe(true);
    expect(g.audioReadAloud).toBe(true);
    expect(g.breaksAsNeeded).toBe(false);
  });

  test('both are safe on null', () => {
    expect(Object.values(readStudentSupports(null)).every(v => v === false)).toBe(true);
    expect(Object.values(grantedAbove(null, null)).every(v => v === false)).toBe(true);
  });
});
