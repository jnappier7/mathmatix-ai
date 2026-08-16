/**
 * LINKING A PARENT IS NOT CONSENT.
 *
 * POST /api/student/link-to-parent used to set `hasParentalConsent = true`
 * inline, which meant the CHILD granted their own parental consent by typing an
 * invite code. No parent ever acted, nothing recorded what was disclosed, and
 * because no privacyConsent.history entry was written, checkConsent() fell
 * through to its legacy branch and reported full scope for every scope check.
 *
 * The route now links the accounts and ASKS the parent by email, leaving
 * consent pending until they respond. These tests pin that: the flag must never
 * come back, and the ask must actually be issued.
 */

const { issueParentConsentRequest } = require('../../utils/consentManager');
const { checkConsent, hasConsentScope } = require('../../utils/consentManager');

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

function fakeStudent() {
    return {
        _id: 'student-1',
        firstName: 'Sam',
        hasParentalConsent: false,
        privacyConsent: { status: 'pending', history: [] },
        save: jest.fn().mockResolvedValue(true),
    };
}

describe('issueParentConsentRequest', () => {
    test('stores a hash, returns the raw token, and leaves consent pending', async () => {
        const student = fakeStudent();

        const rawToken = await issueParentConsentRequest(student, 'parent@example.com');

        expect(typeof rawToken).toBe('string');
        expect(rawToken.length).toBeGreaterThan(32);

        // The raw token must never be what we persist.
        expect(student.privacyConsent.consentToken).not.toBe(rawToken);
        expect(student.privacyConsent.consentToken).toMatch(/^[a-f0-9]{64}$/);

        expect(student.privacyConsent.status).toBe('pending');
        expect(student.privacyConsent.pendingParentEmail).toBe('parent@example.com');
        expect(student.save).toHaveBeenCalled();
    });

    test('asking is not consenting — no grant flag, no history record', async () => {
        const student = fakeStudent();

        await issueParentConsentRequest(student, 'parent@example.com');

        // The exact regression: requesting must not confer consent.
        expect(student.hasParentalConsent).toBe(false);
        expect(student.privacyConsent.history).toHaveLength(0);
    });

    test('a pending request does not read as consent anywhere downstream', async () => {
        const student = fakeStudent();
        await issueParentConsentRequest(student, 'parent@example.com');

        expect(checkConsent(student).hasConsent).toBe(false);
        expect(hasConsentScope(student, 'ai_processing')).toBe(false);
    });

    test('each request issues a distinct token', async () => {
        const a = await issueParentConsentRequest(fakeStudent(), 'p@example.com');
        const b = await issueParentConsentRequest(fakeStudent(), 'p@example.com');
        expect(a).not.toBe(b);
    });

    test('the link expires — default 7 days, and the window is in the future', async () => {
        const student = fakeStudent();
        await issueParentConsentRequest(student, 'parent@example.com');

        const ms = student.privacyConsent.consentTokenExpires.getTime() - Date.now();
        expect(ms).toBeGreaterThan(6.5 * 24 * 60 * 60 * 1000);
        expect(ms).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
    });
});

describe('the legacy-flag escape hatch stays closed', () => {
    test('hasParentalConsent=true with no history still reads as legacy full scope — which is why we must not set it', () => {
        // This documents the blast radius of the old behavior rather than
        // endorsing it: a bare flag with no record grants everything.
        const legacyStudent = { hasParentalConsent: true, privacyConsent: undefined };

        expect(checkConsent(legacyStudent).pathway).toBe('legacy');
        expect(hasConsentScope(legacyStudent, 'ai_processing')).toBe(true);
    });
});
