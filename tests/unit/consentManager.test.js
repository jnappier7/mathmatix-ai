/**
 * Tests for Consent Manager
 * Verifies COPPA/FERPA consent lifecycle: grant, revoke, check
 */

const {
    checkConsent,
    hasConsentScope,
    FULL_CONSENT_SCOPE
} = require('../../utils/consentManager');

describe('Consent Manager', () => {

    // ========================================================================
    // checkConsent
    // ========================================================================
    describe('checkConsent', () => {
        test('returns pending for null user', () => {
            const result = checkConsent(null);
            expect(result.hasConsent).toBe(false);
            expect(result.status).toBe('pending');
        });

        test('falls back to legacy hasParentalConsent field', () => {
            const user = { hasParentalConsent: true };
            const result = checkConsent(user);

            expect(result.hasConsent).toBe(true);
            expect(result.pathway).toBe('legacy');
            expect(result.status).toBe('active');
        });

        test('returns pending for legacy false', () => {
            const user = { hasParentalConsent: false };
            const result = checkConsent(user);

            expect(result.hasConsent).toBe(false);
            expect(result.pathway).toBe('none');
        });

        test('recognizes active parent consent', () => {
            const user = {
                privacyConsent: {
                    status: 'active',
                    consentPathway: 'individual_parent',
                    history: [{
                        consentType: 'parent_individual',
                        grantedAt: new Date(),
                        scope: FULL_CONSENT_SCOPE
                    }]
                }
            };

            const result = checkConsent(user);
            expect(result.hasConsent).toBe(true);
            expect(result.pathway).toBe('individual_parent');
            expect(result.status).toBe('active');
        });

        test('recognizes active school DPA consent', () => {
            const user = {
                privacyConsent: {
                    status: 'active',
                    consentPathway: 'school_dpa',
                    history: [{
                        consentType: 'school_official',
                        grantedAt: new Date(),
                        scope: FULL_CONSENT_SCOPE,
                        schoolName: 'Lincoln Elementary',
                        dpaReferenceId: 'DPA-2026-001'
                    }]
                }
            };

            const result = checkConsent(user);
            expect(result.hasConsent).toBe(true);
            expect(result.pathway).toBe('school_dpa');
        });

        test('recognizes revoked consent', () => {
            const user = {
                privacyConsent: {
                    status: 'revoked',
                    consentPathway: 'individual_parent',
                    history: [
                        { consentType: 'parent_individual', grantedAt: new Date('2025-01-01'), scope: FULL_CONSENT_SCOPE },
                        { consentType: 'parent_revoked', grantedAt: new Date('2025-06-01'), revokedAt: new Date('2025-06-01') }
                    ]
                }
            };

            const result = checkConsent(user);
            expect(result.hasConsent).toBe(false);
            expect(result.status).toBe('revoked');
        });

        test('detects expired DPA consent', () => {
            const user = {
                privacyConsent: {
                    status: 'active',
                    consentPathway: 'school_dpa',
                    history: [{
                        consentType: 'school_official',
                        grantedAt: new Date('2024-01-01'),
                        expiresAt: new Date('2025-01-01'), // In the past
                        scope: FULL_CONSENT_SCOPE
                    }]
                }
            };

            const result = checkConsent(user);
            expect(result.hasConsent).toBe(false);
            expect(result.status).toBe('expired');
        });

        test('does not expire consent without expiresAt', () => {
            const user = {
                privacyConsent: {
                    status: 'active',
                    consentPathway: 'individual_parent',
                    history: [{
                        consentType: 'parent_individual',
                        grantedAt: new Date('2024-01-01'),
                        // No expiresAt - should stay active
                        scope: FULL_CONSENT_SCOPE
                    }]
                }
            };

            const result = checkConsent(user);
            expect(result.hasConsent).toBe(true);
        });

        test('recognizes self-consent for 13+', () => {
            const user = {
                privacyConsent: {
                    status: 'active',
                    consentPathway: 'self_13_plus',
                    history: [{
                        consentType: 'student_self',
                        grantedAt: new Date(),
                        scope: FULL_CONSENT_SCOPE
                    }]
                }
            };

            const result = checkConsent(user);
            expect(result.hasConsent).toBe(true);
            expect(result.pathway).toBe('self_13_plus');
        });
    });

    // ========================================================================
    // hasConsentScope
    // ========================================================================
    describe('hasConsentScope', () => {
        test('returns false for no consent', () => {
            const user = { hasParentalConsent: false };
            expect(hasConsentScope(user, 'ai_processing')).toBe(false);
        });

        test('returns true for legacy consent (assumes full scope)', () => {
            const user = { hasParentalConsent: true };
            expect(hasConsentScope(user, 'ai_processing')).toBe(true);
            expect(hasConsentScope(user, 'iep_data_processing')).toBe(true);
        });

        test('checks specific scope in consent record', () => {
            const user = {
                privacyConsent: {
                    status: 'active',
                    consentPathway: 'individual_parent',
                    history: [{
                        consentType: 'parent_individual',
                        grantedAt: new Date(),
                        scope: ['data_collection', 'ai_processing'] // Limited scope
                    }]
                }
            };

            expect(hasConsentScope(user, 'ai_processing')).toBe(true);
            expect(hasConsentScope(user, 'iep_data_processing')).toBe(false);
        });

        test('returns false for revoked consent even if scope existed', () => {
            const user = {
                privacyConsent: {
                    status: 'revoked',
                    consentPathway: 'individual_parent',
                    history: [
                        { consentType: 'parent_individual', grantedAt: new Date('2025-01-01'), scope: FULL_CONSENT_SCOPE },
                        { consentType: 'parent_revoked', grantedAt: new Date('2025-06-01'), revokedAt: new Date('2025-06-01') }
                    ]
                }
            };

            expect(hasConsentScope(user, 'ai_processing')).toBe(false);
        });
    });

    // ========================================================================
    // FULL_CONSENT_SCOPE
    // ========================================================================
    describe('FULL_CONSENT_SCOPE', () => {
        test('includes all required scopes', () => {
            expect(FULL_CONSENT_SCOPE).toContain('data_collection');
            expect(FULL_CONSENT_SCOPE).toContain('ai_processing');
            expect(FULL_CONSENT_SCOPE).toContain('progress_tracking');
            expect(FULL_CONSENT_SCOPE).toContain('teacher_visibility');
            expect(FULL_CONSENT_SCOPE).toContain('parent_visibility');
            expect(FULL_CONSENT_SCOPE).toContain('iep_data_processing');
        });

        test('has 6 scopes total', () => {
            expect(FULL_CONSENT_SCOPE).toHaveLength(6);
        });
    });
});
