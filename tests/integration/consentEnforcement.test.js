// tests/integration/consentEnforcement.test.js
// Proves the staged rollout contract of requireOwnConsent end-to-end on a
// minimal Express app: log mode (the shipping default) never changes behavior;
// enforce mode 403s an unconsented under-13 with a machine-routable code the
// chat client can send to the consent flow.

const express = require('express');
const request = require('supertest');

const { requireOwnConsent } = require('../../middleware/consentGate');

function appFor(user) {
    const app = express();
    app.use((req, res, next) => { req.user = user; next(); });
    app.post('/api/chat', requireOwnConsent(), (req, res) => res.json({ ok: true }));
    return app;
}

function yearsAgo(n) {
    return new Date(Date.now() - n * 365.25 * 24 * 60 * 60 * 1000);
}

const unconsentedUnder13 = {
    _id: 'kid1',
    role: 'student',
    dateOfBirth: yearsAgo(9),
    privacyConsent: { status: 'pending', history: [{ consentType: 'parent_individual' }] },
};

const consentedStudent = {
    _id: 'kid2',
    role: 'student',
    dateOfBirth: yearsAgo(9),
    privacyConsent: { status: 'active', consentPathway: 'individual_parent', history: [{}] },
};

describe('consent enforcement on /api/chat', () => {
    const ORIGINAL = process.env.CONSENT_ENFORCEMENT;
    afterEach(() => {
        if (ORIGINAL === undefined) delete process.env.CONSENT_ENFORCEMENT;
        else process.env.CONSENT_ENFORCEMENT = ORIGINAL;
    });

    test('default (log) mode: unconsented under-13 still gets through — deploy is inert', async () => {
        delete process.env.CONSENT_ENFORCEMENT;
        const res = await request(appFor(unconsentedUnder13)).post('/api/chat');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
    });

    test('enforce mode: unconsented under-13 is 403d with a routable consentCode', async () => {
        process.env.CONSENT_ENFORCEMENT = 'enforce';
        const res = await request(appFor(unconsentedUnder13)).post('/api/chat');
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({
            consentRequired: true,
            consentCode: 'CONSENT_REQUIRED_PARENT',
        });
        expect(res.body.message).toMatch(/parent or guardian/i);
    });

    test('enforce mode: consented under-13 passes', async () => {
        process.env.CONSENT_ENFORCEMENT = 'enforce';
        const res = await request(appFor(consentedStudent)).post('/api/chat');
        expect(res.status).toBe(200);
    });

    test('enforce mode: legacy hydrated-shape account passes (no lockout on old grants)', async () => {
        process.env.CONSENT_ENFORCEMENT = 'enforce';
        const legacy = {
            _id: 'kid3',
            role: 'student',
            dateOfBirth: yearsAgo(9),
            hasParentalConsent: true,
            privacyConsent: { status: 'pending', history: [] },
        };
        const res = await request(appFor(legacy)).post('/api/chat');
        expect(res.status).toBe(200);
    });
});
