// tests/unit/onboardingConsentFlags.test.js
// The consent-gate split by COPPA semantics: verifiable PARENTAL consent is a
// legal requirement only under 13; 13-17 self-certify. Before this split, one
// age<18 flag routed every teen into the parent-email flow.

const { consentFlagsFor } = require('../../routes/onboarding');

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
