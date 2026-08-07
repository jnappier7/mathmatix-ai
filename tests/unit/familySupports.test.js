// tests/unit/familySupports.test.js
//
// Pins the precedence between a school-authored IEP and parent-requested
// supports.
//
// Two sources feed the same nine switches. iepPlan.accommodations is a legal
// record only a teacher can write (routes/iepTemplates.js is isTeacher-gated);
// learningProfile.familySupports is what a parent asked for. The rules:
//
//   1. The IEP always wins. A switch the IEP turns on is never restated by the
//      family block, so the model never gets the same instruction under two
//      different authorities.
//   2. A parent can never soften or override a school accommodation.
//   3. Family supports fill the gaps the IEP leaves — including the common case
//      of a student with no IEP at all.
//   4. Family supports are never framed as legally required, because they are
//      not.
//
// Breaking any of these is silent: the prompt still builds, it just quietly
// misrepresents where an instruction came from.

const {
  buildIepAccommodationsPrompt,
  buildFamilySupportsPrompt,
  FAMILY_SUPPORT_LINES,
} = require('../../utils/promptHelpers');

const ALL_SWITCHES = [
  'extendedTime', 'reducedDistraction', 'calculatorAllowed', 'audioReadAloud',
  'chunkedAssignments', 'breaksAsNeeded', 'digitalMultiplicationChart',
  'largePrintHighContrast', 'mathAnxietySupport',
];

describe('buildFamilySupportsPrompt — nothing to say', () => {
  test('returns empty for null/undefined', () => {
    expect(buildFamilySupportsPrompt(null, null, 'Alex')).toBe('');
    expect(buildFamilySupportsPrompt(undefined, null, 'Alex')).toBe('');
  });

  test('returns empty when every switch is off', () => {
    const supports = {};
    ALL_SWITCHES.forEach(k => { supports[k] = false; });
    expect(buildFamilySupportsPrompt(supports, null, 'Alex')).toBe('');
  });

  test('returns empty when the note is only whitespace', () => {
    expect(buildFamilySupportsPrompt({ note: '   ' }, null, 'Alex')).toBe('');
  });
});

describe('buildFamilySupportsPrompt — a student with no IEP', () => {
  test('emits the supports a parent turned on', () => {
    const out = buildFamilySupportsPrompt(
      { chunkedAssignments: true, breaksAsNeeded: true }, null, 'Maya'
    );
    expect(out).toContain('FAMILY-REQUESTED SUPPORTS');
    expect(out).toContain('3-5 problems at a time');
    expect(out).toContain('Offer breaks proactively');
  });

  test('interpolates the student name', () => {
    const out = buildFamilySupportsPrompt({ extendedTime: true }, null, 'Maya');
    expect(out).toContain('Never rush Maya');
    expect(out).not.toContain('{name}');
  });

  test('carries a free-text note from the family', () => {
    const out = buildFamilySupportsPrompt(
      { note: 'She freezes on timed work.' }, null, 'Maya'
    );
    expect(out).toContain('She freezes on timed work.');
  });

  test('never claims legal force, and says so explicitly', () => {
    const out = buildFamilySupportsPrompt({ extendedTime: true }, null, 'Maya');
    expect(out).not.toMatch(/LEGALLY REQUIRED/i);
    expect(out).not.toMatch(/IDEA/);
    expect(out).not.toMatch(/legally required|must respect|mandated/i);
    // It may name the IEP — but only to disclaim being one.
    expect(out).toContain('not part of a school IEP');
  });
});

describe('precedence — the school IEP wins', () => {
  test('a switch the IEP sets is not restated by the family block', () => {
    const iep = { accommodations: { extendedTime: true } };
    const out = buildFamilySupportsPrompt({ extendedTime: true }, iep, 'Maya');
    // Only overlapping switch, so there is nothing left to say.
    expect(out).toBe('');
  });

  test('non-overlapping family supports still come through', () => {
    const iep = { accommodations: { extendedTime: true } };
    const out = buildFamilySupportsPrompt(
      { extendedTime: true, chunkedAssignments: true }, iep, 'Maya'
    );
    expect(out).toContain('3-5 problems at a time');
    expect(out).not.toContain('Never rush Maya');   // owned by the IEP block
  });

  test('an IEP that leaves a switch off does not block the parent enabling it', () => {
    const iep = { accommodations: { extendedTime: true, calculatorAllowed: false } };
    const out = buildFamilySupportsPrompt({ calculatorAllowed: true }, iep, 'Maya');
    expect(out).toContain('Do not restrict calculator use');
  });

  test('every switch dedupes independently', () => {
    const supports = {};
    ALL_SWITCHES.forEach(k => { supports[k] = true; });
    ALL_SWITCHES.forEach(overlap => {
      const iep = { accommodations: { [overlap]: true } };
      const out = buildFamilySupportsPrompt(supports, iep, 'Maya');
      const ownLine = FAMILY_SUPPORT_LINES[overlap].replace('{name}', 'Maya');
      expect(out).not.toContain(ownLine);
      // ...and the other eight are unaffected.
      ALL_SWITCHES.filter(k => k !== overlap).forEach(other => {
        expect(out).toContain(FAMILY_SUPPORT_LINES[other].replace('{name}', 'Maya'));
      });
    });
  });
});

describe('the two blocks coexist without contradicting each other', () => {
  test('IEP keeps its legal framing while family supports stay advisory', () => {
    const iep = {
      accommodations: { extendedTime: true },
      goals: [],
    };
    const iepBlock = buildIepAccommodationsPrompt(iep, 'Maya');
    const familyBlock = buildFamilySupportsPrompt({ breaksAsNeeded: true }, iep, 'Maya');

    expect(iepBlock).toContain('LEGALLY REQUIRED');
    expect(familyBlock).not.toContain('LEGALLY REQUIRED');
    expect(familyBlock).toContain('not part of a school IEP');

    // Extended time is stated exactly once across both blocks.
    const combined = iepBlock + familyBlock;
    expect(combined.match(/Never rush Maya/g) || []).toHaveLength(1);
  });

  test('the IEP block is untouched by this change when no family supports exist', () => {
    const iep = { accommodations: { chunkedAssignments: true } };
    expect(buildIepAccommodationsPrompt(iep, 'Maya')).toContain('Chunked Assignments');
    expect(buildFamilySupportsPrompt(null, iep, 'Maya')).toBe('');
  });
});

describe('the two schemas stay in step', () => {
  test('every family switch has an instruction line', () => {
    ALL_SWITCHES.forEach(k => {
      expect(typeof FAMILY_SUPPORT_LINES[k]).toBe('string');
      expect(FAMILY_SUPPORT_LINES[k].length).toBeGreaterThan(0);
    });
  });

  test('no instruction line exists for a switch the schema does not have', () => {
    expect(Object.keys(FAMILY_SUPPORT_LINES).sort()).toEqual([...ALL_SWITCHES].sort());
  });
});
