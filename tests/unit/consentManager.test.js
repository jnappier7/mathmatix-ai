/**
 * Tests for Consent Manager
 * Verifies COPPA/FERPA consent lifecycle: grant, revoke, check
 */

jest.mock('../../utils/logger', () => ({
    warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

jest.mock('../../models/user', () => ({
    findById: jest.fn()
}));

const User = require('../../models/user');
const cm = require('../../utils/consentManager');
const {
    checkConsent,
    hasConsentScope,
    FULL_CONSENT_SCOPE
} = cm;

function fakeStudent(initial = {}) {
    return {
        _id: 's1',
        privacyConsent: undefined,
        hasParentalConsent: false,
        dateOfBirth: null,
        save: jest.fn().mockResolvedValue(),
        ...initial
    };
}

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

    // ========================================================================
    // grantParentConsent
    // ========================================================================
    describe('grantParentConsent', () => {
        beforeEach(() => { jest.clearAllMocks(); });

        test('throws when student is missing', async () => {
            User.findById.mockResolvedValue(null);
            await expect(cm.grantParentConsent('s1', { parentId: 'p1' })).rejects.toThrow(/not found/);
        });

        test('records consent and flips hasParentalConsent', async () => {
            const student = fakeStudent();
            User.findById.mockResolvedValue(student);

            const r = await cm.grantParentConsent('s1', { parentId: 'p1', parentName: 'Anna' });

            expect(r.status).toBe('active');
            expect(r.pathway).toBe('individual_parent');
            expect(student.privacyConsent.status).toBe('active');
            expect(student.privacyConsent.history[0].consentType).toBe('parent_individual');
            expect(student.privacyConsent.history[0].grantedByName).toBe('Anna');
            expect(student.hasParentalConsent).toBe(true);
            expect(student.save).toHaveBeenCalled();
        });
    });

    // ========================================================================
    // grantSchoolConsent
    // ========================================================================
    describe('grantSchoolConsent', () => {
        beforeEach(() => { jest.clearAllMocks(); });

        test('records school official consent with DPA reference', async () => {
            const student = fakeStudent();
            User.findById.mockResolvedValue(student);

            await cm.grantSchoolConsent('s1', {
                schoolName: 'Lincoln',
                districtName: 'District 12',
                dpaReferenceId: 'DPA-2024-A',
                grantedBy: 'admin-1',
                grantedByRole: 'admin'
            });

            expect(student.privacyConsent.history[0]).toMatchObject({
                consentType: 'school_official',
                schoolName: 'Lincoln',
                dpaReferenceId: 'DPA-2024-A'
            });
        });

        test('default role for grantedByRole is admin', async () => {
            const student = fakeStudent();
            User.findById.mockResolvedValue(student);

            await cm.grantSchoolConsent('s1', { schoolName: 'L', grantedBy: 'a1' });

            expect(student.privacyConsent.history[0].grantedByRole).toBe('admin');
        });
    });

    // ========================================================================
    // grantSelfConsent
    // ========================================================================
    describe('grantSelfConsent', () => {
        beforeEach(() => { jest.clearAllMocks(); });

        test('rejects students under 13', async () => {
            const tooYoung = fakeStudent({
                dateOfBirth: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000)
            });
            User.findById.mockResolvedValue(tooYoung);
            await expect(cm.grantSelfConsent('s1')).rejects.toThrow(/13/);
        });

        test('allows ≥13 students to self-consent', async () => {
            const old = fakeStudent({
                dateOfBirth: new Date(Date.now() - 14 * 365 * 24 * 60 * 60 * 1000)
            });
            User.findById.mockResolvedValue(old);

            const r = await cm.grantSelfConsent('s1');
            expect(r.pathway).toBe('self_13_plus');
            expect(old.privacyConsent.history[0].consentType).toBe('student_self');
        });

        test('allows when no DOB present (skip age check)', async () => {
            const student = fakeStudent();
            User.findById.mockResolvedValue(student);
            const r = await cm.grantSelfConsent('s1');
            expect(r.status).toBe('active');
        });
    });

    // ========================================================================
    // revokeConsent
    // ========================================================================
    describe('revokeConsent', () => {
        beforeEach(() => { jest.clearAllMocks(); });

        test('marks status revoked and pushes parent_revoked record', async () => {
            const student = fakeStudent({
                privacyConsent: { status: 'active', history: [] },
                hasParentalConsent: true
            });
            User.findById.mockResolvedValue(student);

            const r = await cm.revokeConsent('s1', {
                revokerId: 'p1', revokerRole: 'parent', reason: 'changed mind'
            });

            expect(r.status).toBe('revoked');
            expect(student.privacyConsent.status).toBe('revoked');
            expect(student.privacyConsent.history[0].consentType).toBe('parent_revoked');
            expect(student.hasParentalConsent).toBe(false);
        });

        test('uses school_revoked label when revoker is not a parent', async () => {
            const student = fakeStudent({ privacyConsent: { history: [] } });
            User.findById.mockResolvedValue(student);
            await cm.revokeConsent('s1', { revokerId: 'admin-1', revokerRole: 'admin' });
            expect(student.privacyConsent.history[0].consentType).toBe('school_revoked');
        });
    });

    // ========================================================================
    // grantBatchSchoolConsent
    // ========================================================================
    describe('grantBatchSchoolConsent', () => {
        beforeEach(() => { jest.clearAllMocks(); });

        test('grants consent across many students and aggregates results', async () => {
            User.findById.mockImplementation((id) => {
                if (id === 'fail-id') return Promise.resolve(null); // throws
                return Promise.resolve(fakeStudent({ _id: id }));
            });

            const r = await cm.grantBatchSchoolConsent(
                ['s1', 's2', 'fail-id'],
                { schoolName: 'Lincoln', grantedBy: 'admin-1' }
            );

            expect(r.success).toBe(2);
            expect(r.failed).toBe(1);
            expect(r.errors[0].studentId).toBe('fail-id');
        });
    });
});
