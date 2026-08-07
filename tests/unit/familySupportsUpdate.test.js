// tests/unit/familySupportsUpdate.test.js
//
// The whitelist in utils/familySupports.js is the security boundary for
// parent-set accommodations: everything it receives is untrusted request body.
//
// Two things must hold no matter what a parent sends:
//   - only the nine known switches are written, so PUT /child/:id/supports can
//     never be used to reach iepPlan (a teacher-owned legal record) or anything
//     else on the user document
//   - only a literal `true` enables a switch, so nothing is quietly guessed
//
// The route-level integration test (tests/integration/parentSupports.test.js)
// covers the same ground through HTTP, but needs a MongoDB binary; this runs
// anywhere.

const {
  FAMILY_SUPPORT_KEYS,
  NOTE_MAX,
  applyFamilySupportsUpdate,
  readFamilySupports,
  lockedBySchool,
} = require('../../utils/familySupports');

describe('applyFamilySupportsUpdate — the whitelist', () => {
  test('writes the nine known switches', () => {
    const target = {};
    applyFamilySupportsUpdate(target, { chunkedAssignments: true, breaksAsNeeded: true });
    expect(target.chunkedAssignments).toBe(true);
    expect(target.breaksAsNeeded).toBe(true);
  });

  test('cannot reach iepPlan', () => {
    const target = {};
    applyFamilySupportsUpdate(target, {
      iepPlan: { accommodations: { calculatorAllowed: true } },
      'iepPlan.accommodations.extendedTime': false,
    });
    expect(target.iepPlan).toBeUndefined();
    expect(target['iepPlan.accommodations.extendedTime']).toBeUndefined();
  });

  test('cannot reach anything else on the user document', () => {
    const target = {};
    applyFamilySupportsUpdate(target, {
      role: 'admin',
      roles: ['admin'],
      subscriptionTier: 'unlimited',
      schoolLicenseId: 'abc',
      password: 'hunter2',
      __proto__: { polluted: true },
    });
    expect(target.role).toBeUndefined();
    expect(target.roles).toBeUndefined();
    expect(target.subscriptionTier).toBeUndefined();
    expect(target.schoolLicenseId).toBeUndefined();
    expect(target.password).toBeUndefined();
    expect({}.polluted).toBeUndefined();
  });

  test('only a literal true enables a switch', () => {
    const target = {};
    applyFamilySupportsUpdate(target, {
      calculatorAllowed: 'yes',
      audioReadAloud: 1,
      breaksAsNeeded: 'true',
      extendedTime: {},
      chunkedAssignments: true,
    });
    expect(target.calculatorAllowed).toBe(false);
    expect(target.audioReadAloud).toBe(false);
    expect(target.breaksAsNeeded).toBe(false);
    expect(target.extendedTime).toBe(false);
    expect(target.chunkedAssignments).toBe(true);
  });

  test('a switch not mentioned is left alone rather than reset', () => {
    const target = { extendedTime: true, breaksAsNeeded: true };
    applyFamilySupportsUpdate(target, { breaksAsNeeded: false });
    expect(target.extendedTime).toBe(true);   // untouched
    expect(target.breaksAsNeeded).toBe(false); // explicitly turned off
  });

  test('survives a hostile or absent body', () => {
    expect(() => applyFamilySupportsUpdate({}, null)).not.toThrow();
    expect(() => applyFamilySupportsUpdate({}, undefined)).not.toThrow();
    expect(() => applyFamilySupportsUpdate({}, 'nope')).not.toThrow();
    expect(() => applyFamilySupportsUpdate({}, [])).not.toThrow();
  });
});

describe('applyFamilySupportsUpdate — the note', () => {
  test('trims and caps at NOTE_MAX', () => {
    const target = {};
    applyFamilySupportsUpdate(target, { note: '  ' + 'x'.repeat(900) + '  ' });
    expect(target.note).toHaveLength(NOTE_MAX);
  });

  test('ignores a non-string note', () => {
    const target = {};
    applyFamilySupportsUpdate(target, { note: { evil: true } });
    expect(target.note).toBeUndefined();
  });
});

describe('applyFamilySupportsUpdate — provenance', () => {
  test('stamps who changed it and when', () => {
    const target = {};
    const now = new Date('2026-01-01T00:00:00Z');
    applyFamilySupportsUpdate(target, { breaksAsNeeded: true }, { updatedBy: 'parent-1', now });
    expect(target.updatedBy).toBe('parent-1');
    expect(target.updatedAt).toBe(now);
  });
});

describe('readFamilySupports / lockedBySchool', () => {
  test('read returns every switch as a real boolean', () => {
    const out = readFamilySupports({ extendedTime: true, breaksAsNeeded: 'yes' });
    expect(out.extendedTime).toBe(true);
    expect(out.breaksAsNeeded).toBe(false);
    expect(Object.keys(out).sort()).toEqual([...FAMILY_SUPPORT_KEYS].sort());
  });

  test('read is safe on null', () => {
    const out = readFamilySupports(null);
    expect(Object.values(out).every(v => v === false)).toBe(true);
  });

  test('locked reflects what the school IEP already owns', () => {
    const locked = lockedBySchool({ accommodations: { extendedTime: true } });
    expect(locked.extendedTime).toBe(true);
    expect(locked.chunkedAssignments).toBe(false);
  });

  test('locked is safe when there is no IEP at all', () => {
    expect(Object.values(lockedBySchool(null)).every(v => v === false)).toBe(true);
    expect(Object.values(lockedBySchool({})).every(v => v === false)).toBe(true);
  });
});
