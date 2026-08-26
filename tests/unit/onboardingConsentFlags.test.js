// tests/unit/onboardingConsentFlags.test.js
// The consent-gate split by COPPA semantics: verifiable PARENTAL consent is a
// legal requirement only under 13; 13-17 self-certify. Before this split, one
// age<18 flag routed every teen into the parent-email flow.

const { consentFlagsFor, shouldStillBlockOnProfile } = require('../../routes/onboarding');

const student = (over = {}) => ({ role: 'student', hasParentalConsent: false, ...over });

describe('consentFlagsFor', () => {
    test('under-13 unconsented → parental consent required, not self', () => {
        expect(consentFlagsFor(student(), 9)).toEqual({
            needsParentalConsent: true,
            needsSelfConsent: false,
        });
    });

    test('13-17 unconsented → self-certification, not parental', () => {
        expect(consentFlagsFor(student(), 15)).toEqual({
            needsParentalConsent: false,
            needsSelfConsent: true,
        });
    });

    test('exactly 13 routes to self-certification (boundary)', () => {
        expect(consentFlagsFor(student(), 13).needsSelfConsent).toBe(true);
        expect(consentFlagsFor(student(), 13).needsParentalConsent).toBe(false);
    });

    test('18+ owes nothing', () => {
        expect(consentFlagsFor(student(), 18)).toEqual({
            needsParentalConsent: false,
            needsSelfConsent: false,
        });
    });

    test('consented students owe nothing at any age', () => {
        const consented = student({ hasParentalConsent: true });
        expect(consentFlagsFor(consented, 9)).toEqual({ needsParentalConsent: false, needsSelfConsent: false });
        expect(consentFlagsFor(consented, 15)).toEqual({ needsParentalConsent: false, needsSelfConsent: false });
    });

    test('unknown age owes neither flag (needsDob handles it upstream)', () => {
        expect(consentFlagsFor(student(), null)).toEqual({
            needsParentalConsent: false,
            needsSelfConsent: false,
        });
    });

    test('non-students never owe consent flags', () => {
        expect(consentFlagsFor({ role: 'parent', hasParentalConsent: false }, 15)).toEqual({
            needsParentalConsent: false,
            needsSelfConsent: false,
        });
    });
});

describe('the COPPA gates read roles HELD, and they fail OPEN', () => {
    // Both gates decide "is this account a student, and therefore does it owe
    // consent". They used to answer that from `user.role` — the ACTIVE role,
    // i.e. whichever dashboard the account currently has open (CLAUDE.md §12).
    //
    // The direction matters. An account that stops reading as a student does
    // not get locked out of anything; it produces needsParentalConsent:false,
    // needsSelfConsent:false, needsDob:false, and the onboarding page simply
    // stops asking. A minor who also holds parent walked past the consent step
    // by switching dashboards, and nothing anywhere recorded that it happened.
    //
    // shouldStillBlockOnProfile is the one with lasting effect: returning false
    // there CLEARS user.needsProfileCompletion in POST /api/onboarding/intent,
    // releasing the account past the DOB and parental-consent gate permanently.

    const minorHoldingParent = (over = {}) => ({
        role: 'parent',                  // the dashboard they are looking at
        roles: ['student', 'parent'],    // what they actually are
        hasParentalConsent: false,
        ...over,
    });

    test('a 9-year-old who also holds parent still owes parental consent', () => {
        const u = minorHoldingParent();
        expect(u.role === 'student').toBe(false); // the old comparison, explicit

        expect(consentFlagsFor(u, 9)).toEqual({
            needsParentalConsent: true,
            needsSelfConsent: false,
        });
    });

    test('a 15-year-old who also holds parent still owes self-certification', () => {
        expect(consentFlagsFor(minorHoldingParent(), 15)).toEqual({
            needsParentalConsent: false,
            needsSelfConsent: true,
        });
    });

    test('the profile gate still blocks a minor who switched dashboards', () => {
        const dob = new Date();
        dob.setFullYear(dob.getFullYear() - 10);
        expect(shouldStillBlockOnProfile(minorHoldingParent({ dateOfBirth: dob }))).toBe(true);
    });

    test('the profile gate still demands a DOB it has never been given', () => {
        expect(shouldStillBlockOnProfile(minorHoldingParent({ dateOfBirth: null }))).toBe(true);
    });

    test('a genuine non-student still owes nothing and is not blocked', () => {
        // Reading roles held must not start demanding consent from parents and
        // teachers, who are adults with no COPPA obligation here.
        const parent = { role: 'parent', roles: ['parent'], hasParentalConsent: false };
        expect(consentFlagsFor(parent, 15)).toEqual({
            needsParentalConsent: false,
            needsSelfConsent: false,
        });
        expect(shouldStillBlockOnProfile(parent)).toBe(false);
    });

    test('a consented student is still released, whichever dashboard they are on', () => {
        const dob = new Date();
        dob.setFullYear(dob.getFullYear() - 10);
        const consented = minorHoldingParent({ hasParentalConsent: true, dateOfBirth: dob });
        expect(consentFlagsFor(consented, 10)).toEqual({
            needsParentalConsent: false,
            needsSelfConsent: false,
        });
        expect(shouldStillBlockOnProfile(consented)).toBe(false);
    });

    test('a legacy account with no roles[] still resolves through role', () => {
        expect(consentFlagsFor({ role: 'student', hasParentalConsent: false }, 9).needsParentalConsent).toBe(true);
        expect(shouldStillBlockOnProfile({ role: 'student', dateOfBirth: null })).toBe(true);
    });
});
